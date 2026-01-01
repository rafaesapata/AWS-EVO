"use strict";
/**
 * Handler genérico para chamadas de IA do frontend
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const response_js_1 = require("../../lib/response.js");
const middleware_js_1 = require("../../lib/middleware.js");
const bedrock_client_js_1 = require("../../lib/bedrock-client.js");
const logging_js_1 = require("../../lib/logging.js");
const zod_1 = require("zod");
const requestSchema = zod_1.z.object({
    type: zod_1.z.enum(['analysis', 'quick', 'cost', 'security']),
    prompt: zod_1.z.string().min(1).max(10000),
    context: zod_1.z.record(zod_1.z.any()).optional(),
});
async function generateResponseHandler(event, context, { user, organizationId, prisma }) {
    try {
        const body = JSON.parse(event.body || '{}');
        const validation = requestSchema.safeParse(body);
        if (!validation.success) {
            return (0, response_js_1.badRequest)('Invalid request', { errors: validation.error.errors });
        }
        const { type, prompt, context: additionalContext } = validation.data;
        const bedrock = (0, bedrock_client_js_1.getBedrockClient)();
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
        return (0, response_js_1.success)({
            content: response,
            type,
            timestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        logging_js_1.logger.error('AI generation error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'AI service unavailable');
    }
}
exports.handler = (0, middleware_js_1.withSecurityMiddleware)(generateResponseHandler);
//# sourceMappingURL=generate-response.js.map