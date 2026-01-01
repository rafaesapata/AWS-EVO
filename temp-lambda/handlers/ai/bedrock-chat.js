"use strict";
/**
 * Bedrock Chat Handler - AI Copilot usando AWS Bedrock
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const bedrockClient = new client_bedrock_runtime_1.BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
async function handler(event, context) {
    console.log('🤖 Bedrock Chat started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { message, context: userContext } = body;
        if (!message) {
            return (0, response_js_1.badRequest)('Message is required');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // Build context from user data
        let systemContext = `Você é o EVO Copilot AI, um assistente especializado em AWS e FinOps.
Você ajuda usuários a:
- Analisar custos AWS e identificar oportunidades de economia
- Avaliar riscos de segurança e vulnerabilidades
- Sugerir otimizações de performance e custo
- Verificar conformidade com best practices AWS

Responda sempre em português brasileiro de forma clara e objetiva.`;
        if (userContext) {
            if (userContext.costs?.length > 0) {
                const totalCost = userContext.costs.reduce((sum, c) => sum + Number(c.total_cost || 0), 0);
                systemContext += `\n\nContexto de custos: Total dos últimos 7 dias: $${totalCost.toFixed(2)}`;
            }
            if (userContext.alerts?.length > 0) {
                systemContext += `\n\nAlertas ativos: ${userContext.alerts.length} alertas de segurança não resolvidos`;
            }
            if (userContext.resources?.length > 0) {
                systemContext += `\n\nRecursos monitorados: ${userContext.resources.length} recursos AWS`;
            }
        }
        // Call Bedrock with Claude model
        const prompt = `${systemContext}\n\nHuman: ${message}\n\nAssistant:`;
        const bedrockResponse = await bedrockClient.send(new client_bedrock_runtime_1.InvokeModelCommand({
            modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 2048,
                messages: [
                    {
                        role: 'user',
                        content: message
                    }
                ],
                system: systemContext
            })
        }));
        const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
        const aiResponse = responseBody.content?.[0]?.text || 'Desculpe, não consegui processar sua solicitação.';
        // Generate suggestions based on message content
        const suggestions = generateSuggestions(message);
        // Log conversation for audit
        await prisma.auditLog.create({
            data: {
                organization_id: organizationId,
                user_id: user.sub,
                action: 'AI_CHAT',
                resource_type: 'copilot',
                details: { message: message.substring(0, 100) }
            }
        });
        console.log('✅ Bedrock Chat completed');
        return (0, response_js_1.success)({
            response: aiResponse,
            suggestions,
            analysis: null
        });
    }
    catch (err) {
        console.error('❌ Bedrock Chat error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
function generateSuggestions(message) {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('custo') || lowerMessage.includes('gasto')) {
        return [
            'Quais serviços estão gerando mais custos?',
            'Como posso reduzir custos com EC2?',
            'Analise oportunidades de Reserved Instances'
        ];
    }
    if (lowerMessage.includes('segurança') || lowerMessage.includes('security')) {
        return [
            'Quais são as vulnerabilidades críticas?',
            'Analise as permissões IAM',
            'Verifique compliance com CIS Benchmarks'
        ];
    }
    if (lowerMessage.includes('otimiz') || lowerMessage.includes('performance')) {
        return [
            'Quais recursos estão subutilizados?',
            'Analise o dimensionamento das instâncias',
            'Verifique configurações de auto-scaling'
        ];
    }
    return [
        'Analise meus custos da última semana',
        'Quais são os principais riscos de segurança?',
        'Como posso otimizar minha infraestrutura?'
    ];
}
//# sourceMappingURL=bedrock-chat.js.map