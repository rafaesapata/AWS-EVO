/**
 * AWS Bedrock AI Client
 * Replaces Lovable AI Gateway for all AI/ML operations
 */
export interface BedrockConfig {
    region?: string;
    modelId?: string;
}
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}
export interface ChatCompletionOptions {
    messages: ChatMessage[];
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
}
export declare class BedrockAIClient {
    private client;
    private modelId;
    constructor(config?: BedrockConfig);
    /**
     * Generate a chat completion using AWS Bedrock
     * Direct replacement for Lovable AI Gateway calls
     */
    chatCompletion(options: ChatCompletionOptions): Promise<string>;
    /**
     * Generate a streaming chat completion
     */
    chatCompletionStream(options: ChatCompletionOptions): AsyncGenerator<string>;
    /**
     * Simple text completion (for backwards compatibility)
     */
    complete(prompt: string, options?: Partial<ChatCompletionOptions>): Promise<string>;
    /**
     * Analyze data and return structured JSON
     */
    analyzeJSON<T>(prompt: string, schema?: string): Promise<T>;
}
export declare function getBedrockClient(config?: BedrockConfig): BedrockAIClient;
export default BedrockAIClient;
//# sourceMappingURL=bedrock-client.d.ts.map