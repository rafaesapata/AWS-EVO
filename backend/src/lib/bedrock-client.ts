/**
 * AWS Bedrock AI Client
 * Replaces Lovable AI Gateway for all AI/ML operations
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand
} from '@aws-sdk/client-bedrock-runtime';

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

export class BedrockAIClient {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor(config: BedrockConfig = {}) {
    const region = config.region || process.env.AWS_BEDROCK_REGION || 'us-east-1';
    this.modelId = config.modelId || process.env.AWS_BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    this.client = new BedrockRuntimeClient({ region });
  }

  /**
   * Generate a chat completion using AWS Bedrock
   * Direct replacement for Lovable AI Gateway calls
   */
  async chatCompletion(options: ChatCompletionOptions): Promise<string> {
    const {
      messages,
      maxTokens = 4096,
      temperature = 0.7,
      systemPrompt
    } = options;

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

    const command = new InvokeModelCommand({
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
    } catch (error: any) {
      console.error('Bedrock AI Error:', error);
      throw new Error(`AI completion failed: ${error.message}`);
    }
  }

  /**
   * Generate a streaming chat completion
   */
  async *chatCompletionStream(options: ChatCompletionOptions): AsyncGenerator<string> {
    const {
      messages,
      maxTokens = 4096,
      temperature = 0.7,
      systemPrompt
    } = options;

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

    const command = new InvokeModelWithResponseStreamCommand({
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
    } catch (error: any) {
      console.error('Bedrock Streaming Error:', error);
      throw new Error(`AI streaming failed: ${error.message}`);
    }
  }

  /**
   * Simple text completion (for backwards compatibility)
   */
  async complete(prompt: string, options: Partial<ChatCompletionOptions> = {}): Promise<string> {
    return this.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      ...options
    });
  }

  /**
   * Analyze data and return structured JSON
   */
  async analyzeJSON<T>(prompt: string, schema?: string): Promise<T> {
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

    return JSON.parse(jsonMatch[0]) as T;
  }
}

// Singleton instance
let bedrockClient: BedrockAIClient | null = null;

export function getBedrockClient(config?: BedrockConfig): BedrockAIClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockAIClient(config);
  }
  return bedrockClient;
}

export default BedrockAIClient;