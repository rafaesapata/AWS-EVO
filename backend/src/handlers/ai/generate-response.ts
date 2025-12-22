/**
 * Handler genérico para chamadas de IA do frontend
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest } from '../../lib/response.js';
import { withSecurityMiddleware, type MiddlewareContext } from '../../lib/middleware.js';
import { getBedrockClient } from '../../lib/bedrock-client.js';
import { logger } from '../../lib/logging.js';
import { z } from 'zod';

const requestSchema = z.object({
  type: z.enum(['analysis', 'quick', 'cost', 'security']),
  prompt: z.string().min(1).max(10000),
  context: z.record(z.any()).optional(),
});

async function generateResponseHandler(
  event: AuthorizedEvent,
  context: LambdaContext,
  { user, organizationId, prisma }: MiddlewareContext
): Promise<APIGatewayProxyResultV2> {
  
  try {
    const body = JSON.parse(event.body || '{}');
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return badRequest('Invalid request', { errors: validation.error.errors });
    }
    
    const { type, prompt, context: additionalContext } = validation.data;
    const bedrock = getBedrockClient();
    
    // Construir prompt baseado no tipo
    let systemPrompt = '';
    switch (type) {
      case 'analysis':
        systemPrompt = 'You are a cloud infrastructure analyst. Provide detailed, actionable analysis.';
        break;
      case 'cost':
        systemPrompt = 'You are a FinOps expert. Focus on cost optimization and savings opportunities.';
        break;
      case 'security':
        systemPrompt = 'You are a security analyst. Identify risks and provide remediation steps.';
        break;
      default:
        systemPrompt = 'You are a helpful cloud infrastructure assistant.';
    }
    
    const response = await bedrock.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt,
      maxTokens: 2048,
      temperature: 0.7,
    });
    
    // Log para auditoria
    await prisma.systemEvent.create({
      data: {
        event_type: 'ai_request',
        payload: {
          type,
          userId: user.sub,
          organizationId,
          promptLength: prompt.length,
          responseLength: response.length,
        },
      },
    });
    
    return success({
      content: response,
      type,
      timestamp: new Date().toISOString(),
    });
    
  } catch (err) {
    logger.error('AI generation error:', err as Error);
    return error(err instanceof Error ? err.message : 'AI service unavailable');
  }
}

export const handler = withSecurityMiddleware(generateResponseHandler);