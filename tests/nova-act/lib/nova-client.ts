/**
 * Nova Act Client - Cliente TypeScript para Amazon Nova Act
 * 
 * Integração via AWS SDK (Bedrock AgentCore) - 100% TypeScript
 * Usa a API do Nova Act Service diretamente sem dependência de Python
 */

import { z } from 'zod';
import { config } from '../config/nova-act.config';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

// Tipos para resultados do Nova Act
export interface ActResult {
  success: boolean;
  response?: string;
  parsedResponse?: unknown;
  metadata: {
    sessionId?: string;
    actId?: string;
    numSteps: number;
    startTime: number;
    endTime: number;
    duration: number;
    prompt: string;
  };
  screenshot?: string;
  error?: string;
}

export interface NovaActSession {
  id: string;
  startTime: Date;
  currentUrl: string;
  isActive: boolean;
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  modelId: string;
}

// Schema para validação de resposta da API
const ApiResponseSchema = z.object({
  sessionId: z.string(),
  actId: z.string(),
  status: z.enum(['completed', 'failed', 'running']),
  response: z.string().optional(),
  parsedResponse: z.unknown().optional(),
  numSteps: z.number(),
  error: z.string().optional(),
});

/**
 * Cliente Nova Act para TypeScript usando AWS SDK
 * Integra com Amazon Bedrock AgentCore Browser
 */
export class NovaActClient extends EventEmitter {
  private session: NovaActSession | null = null;
  private logsDir: string;
  private isInitialized = false;
  private apiEndpoint: string;

  constructor(
    private startingPage: string,
    private options: {
      headless?: boolean;
      timeout?: number;
      recordVideo?: boolean;
      logsDirectory?: string;
      workflowName?: string;
    } = {}
  ) {
    super();
    this.logsDir = options.logsDirectory || config.novaAct.logsDirectory;
    this.apiEndpoint = `https://nova-act.${config.novaAct.region}.amazonaws.com`;
  }

  /**
   * Iniciar sessão Nova Act
   */
  async start(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Nova Act session already started');
    }

    // Criar diretório de logs
    await fs.mkdir(this.logsDir, { recursive: true });

    // Criar sessão via API
    const sessionId = await this.createSession();

    this.session = {
      id: sessionId,
      startTime: new Date(),
      currentUrl: this.startingPage,
      isActive: true,
    };

    this.isInitialized = true;
    this.emit('started', this.session);
    
    console.log(`🌐 Nova Act session started: ${this.session.id}`);
  }

  /**
   * Executar uma ação no browser via API
   */
  async act(prompt: string): Promise<ActResult> {
    if (!this.isInitialized || !this.session) {
      throw new Error('Nova Act session not started. Call start() first.');
    }

    const startTime = Date.now();
    
    try {
      this.emit('actStart', { prompt });
      
      const result = await this.invokeAct(prompt);
      
      const actResult: ActResult = {
        success: result.status === 'completed',
        response: result.response,
        parsedResponse: result.parsedResponse,
        metadata: {
          sessionId: result.sessionId,
          actId: result.actId,
          numSteps: result.numSteps,
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime,
          prompt,
        },
        error: result.error,
      };

      this.emit('actComplete', actResult);
      return actResult;
      
    } catch (error) {
      const actResult: ActResult = {
        success: false,
        metadata: {
          numSteps: 0,
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime,
          prompt,
        },
        error: error instanceof Error ? error.message : String(error),
      };
      
      this.emit('actError', actResult);
      return actResult;
    }
  }

  /**
   * Executar ação e extrair dados estruturados
   */
  async actGet<T>(
    prompt: string,
    schema: z.ZodSchema<T>
  ): Promise<ActResult & { data?: T }> {
    // Adicionar instrução para retornar JSON
    const enhancedPrompt = `${prompt}. Return the result as a JSON object.`;
    const result = await this.act(enhancedPrompt);
    
    if (result.success && result.response) {
      try {
        // Tentar extrair JSON da resposta
        const jsonMatch = result.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const data = schema.parse(parsed);
          return { ...result, data, parsedResponse: parsed };
        }
      } catch (parseError) {
        return {
          ...result,
          error: `Schema validation failed: ${parseError}`,
        };
      }
    }
    
    return result;
  }

  /**
   * Navegar para uma URL
   */
  async goToUrl(url: string): Promise<ActResult> {
    if (this.session) {
      this.session.currentUrl = url;
    }
    return this.act(`Navigate to ${url}`);
  }

  /**
   * Tirar screenshot
   */
  async screenshot(filename?: string): Promise<string> {
    const name = filename || `screenshot-${Date.now()}.png`;
    const filepath = path.join(this.logsDir, name);
    
    // Nova Act captura screenshots automaticamente
    // Aqui salvamos referência ao arquivo
    await this.act('Capture the current screen state');
    
    return filepath;
  }

  /**
   * Verificar se um elemento está visível
   */
  async isVisible(description: string): Promise<boolean> {
    const result = await this.actGet(
      `Check if "${description}" is visible on the page`,
      z.object({ visible: z.boolean() })
    );
    
    return result.data?.visible || false;
  }

  /**
   * Aguardar elemento aparecer
   */
  async waitFor(description: string, timeoutMs = 30000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const visible = await this.isVisible(description);
      if (visible) return true;
      await this.wait(1000);
    }
    
    return false;
  }

  /**
   * Extrair texto de um elemento
   */
  async getText(description: string): Promise<string | null> {
    const result = await this.actGet(
      `Extract and return the text content of "${description}"`,
      z.object({ text: z.string() })
    );
    
    return result.data?.text || result.response || null;
  }

  /**
   * Preencher um campo de formulário
   */
  async fill(fieldDescription: string, value: string): Promise<ActResult> {
    return this.act(`Find the "${fieldDescription}" input field and type "${value}" into it`);
  }

  /**
   * Clicar em um elemento
   */
  async click(elementDescription: string): Promise<ActResult> {
    return this.act(`Click on the "${elementDescription}" element`);
  }

  /**
   * Selecionar opção em dropdown
   */
  async select(dropdownDescription: string, optionValue: string): Promise<ActResult> {
    return this.act(`Select "${optionValue}" from the "${dropdownDescription}" dropdown`);
  }

  /**
   * Verificar texto na página
   */
  async hasText(text: string): Promise<boolean> {
    const result = await this.actGet(
      `Check if the text "${text}" appears anywhere on the page`,
      z.object({ found: z.boolean() })
    );
    
    return result.data?.found || false;
  }

  /**
   * Obter URL atual
   */
  async getCurrentUrl(): Promise<string> {
    const result = await this.actGet(
      'Return the current page URL',
      z.object({ url: z.string() })
    );
    
    return result.data?.url || this.session?.currentUrl || '';
  }

  /**
   * Encerrar sessão
   */
  async stop(): Promise<void> {
    if (this.session) {
      await this.closeSession();
      this.session.isActive = false;
      this.emit('stopped', this.session);
      console.log(`🛑 Nova Act session stopped: ${this.session.id}`);
    }
    
    this.isInitialized = false;
  }

  /**
   * Obter informações da sessão atual
   */
  getSession(): NovaActSession | null {
    return this.session;
  }

  // Métodos privados - Integração com AWS API

  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    // Se usando API Key
    if (config.novaAct.apiKey) {
      return {
        'x-api-key': config.novaAct.apiKey,
        'Content-Type': 'application/json',
      };
    }

    // Se usando IAM, usar AWS Signature V4
    // Aqui usaríamos @aws-sdk/signature-v4 para assinar requests
    return {
      'Content-Type': 'application/json',
    };
  }

  private async createSession(): Promise<string> {
    const headers = await this.getAuthHeaders();
    
    const response = await fetch(`${this.apiEndpoint}/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        startingPage: this.startingPage,
        headless: this.options.headless ?? config.novaAct.headless,
        recordVideo: this.options.recordVideo ?? config.novaAct.recordVideo,
        modelId: config.novaAct.modelId,
        workflowName: this.options.workflowName,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create session: ${error}`);
    }

    const data = await response.json() as { sessionId: string };
    return data.sessionId;
  }

  private async invokeAct(prompt: string): Promise<z.infer<typeof ApiResponseSchema>> {
    if (!this.session) {
      throw new Error('No active session');
    }

    const headers = await this.getAuthHeaders();
    
    const response = await fetch(`${this.apiEndpoint}/sessions/${this.session.id}/act`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt,
        timeout: this.options.timeout || config.novaAct.timeout,
        maxSteps: config.novaAct.maxSteps,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Act failed: ${error}`);
    }

    const data = await response.json();
    return ApiResponseSchema.parse(data);
  }

  private async closeSession(): Promise<void> {
    if (!this.session) return;

    const headers = await this.getAuthHeaders();
    
    await fetch(`${this.apiEndpoint}/sessions/${this.session.id}`, {
      method: 'DELETE',
      headers,
    });
  }
}

/**
 * Factory function para criar cliente Nova Act
 */
export function createNovaActClient(
  startingPage: string,
  options?: {
    headless?: boolean;
    timeout?: number;
    recordVideo?: boolean;
    logsDirectory?: string;
    workflowName?: string;
  }
): NovaActClient {
  return new NovaActClient(startingPage, options);
}

/**
 * Helper para executar ação única (sem manter sessão)
 */
export async function quickAct(
  url: string,
  prompt: string
): Promise<ActResult> {
  const client = createNovaActClient(url);
  await client.start();
  
  try {
    return await client.act(prompt);
  } finally {
    await client.stop();
  }
}

/**
 * Executar múltiplas ações em sequência
 */
export async function runWorkflow(
  startingPage: string,
  steps: string[]
): Promise<ActResult[]> {
  const client = createNovaActClient(startingPage);
  await client.start();
  
  const results: ActResult[] = [];
  
  try {
    for (const step of steps) {
      const result = await client.act(step);
      results.push(result);
      
      if (!result.success) {
        console.error(`Step failed: ${step}`);
        break;
      }
    }
  } finally {
    await client.stop();
  }
  
  return results;
}

export default NovaActClient;
