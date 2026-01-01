"use strict";
/**
 * AWS Bedrock AI Client
 * Replaces Lovable AI Gateway for all AI/ML operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BedrockAIClient = void 0;
exports.getBedrockClient = getBedrockClient;
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
class BedrockAIClient {
    constructor(config = {}) {
        const region = config.region || process.env.AWS_BEDROCK_REGION || 'us-east-1';
        this.modelId = config.modelId || process.env.AWS_BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
        this.client = new client_bedrock_runtime_1.BedrockRuntimeClient({ region });
    }
    /**
     * Generate a chat completion using AWS Bedrock
     * Direct replacement for Lovable AI Gateway calls
     */
    async chatCompletion(options) {
        const { messages, maxTokens = 4096, temperature = 0.7, systemPrompt } = options;
        const body = {
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: maxTokens,
            temperature,
            messages: messages.map(m => ({
                role: m.role,
                content: m.content
            })),
            ...(systemPrompt && { system: systemPrompt })
        };
        const command = new client_bedrock_runtime_1.InvokeModelCommand({
            modelId: this.modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify(body)
        });
        try {
            const response = await this.client.send(command);
            const result = JSON.parse(new TextDecoder().decode(response.body));
            if (result.content && result.content[0]?.text) {
                return result.content[0].text;
            }
            throw new Error('Unexpected response format from Bedrock');
        }
        catch (error) {
            console.error('Bedrock AI Error:', error);
            throw new Error(`AI completion failed: ${error.message}`);
        }
    }
    /**
     * Generate a streaming chat completion
     */
    async *chatCompletionStream(options) {
        const { messages, maxTokens = 4096, temperature = 0.7, systemPrompt } = options;
        const body = {
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: maxTokens,
            temperature,
            messages: messages.map(m => ({
                role: m.role,
                content: m.content
            })),
            ...(systemPrompt && { system: systemPrompt })
        };
        const command = new client_bedrock_runtime_1.InvokeModelWithResponseStreamCommand({
            modelId: this.modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify(body)
        });
        try {
            const response = await this.client.send(command);
            if (response.body) {
                for await (const event of response.body) {
                    if (event.chunk?.bytes) {
                        const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
                        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
                            yield chunk.delta.text;
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error('Bedrock Streaming Error:', error);
            throw new Error(`AI streaming failed: ${error.message}`);
        }
    }
    /**
     * Simple text completion (for backwards compatibility)
     */
    async complete(prompt, options = {}) {
        return this.chatCompletion({
            messages: [{ role: 'user', content: prompt }],
            ...options
        });
    }
    /**
     * Analyze data and return structured JSON
     */
    async analyzeJSON(prompt, schema) {
        const systemPrompt = schema
            ? `You are a data analyst. Always respond with valid JSON matching this schema: ${schema}`
            : 'You are a data analyst. Always respond with valid JSON only, no explanations.';
        const result = await this.chatCompletion({
            messages: [{ role: 'user', content: prompt }],
            systemPrompt,
            temperature: 0.3
        });
        // Extract JSON from response
        const jsonMatch = result.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error('Failed to extract JSON from AI response');
        }
        return JSON.parse(jsonMatch[0]);
    }
}
exports.BedrockAIClient = BedrockAIClient;
// Singleton instance
let bedrockClient = null;
function getBedrockClient(config) {
    if (!bedrockClient) {
        bedrockClient = new BedrockAIClient(config);
    }
    return bedrockClient;
}
exports.default = BedrockAIClient;
//# sourceMappingURL=bedrock-client.js.map