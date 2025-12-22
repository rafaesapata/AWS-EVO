import { cognitoAuth } from './cognito-client-simple';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface BedrockMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface BedrockResponse {
  content: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

class BedrockAI {
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const session = await cognitoAuth.getCurrentSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session) {
      headers['Authorization'] = `Bearer ${session.accessToken}`;
    }
    return headers;
  }

  private async callBackendAI(endpoint: string, data: Record<string, any>): Promise<BedrockResponse> {
    const headers = await this.getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}/functions/${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `AI service error: ${response.status}`);
    }
    
    const result = await response.json();
    return {
      content: result.content || result.answer || result.analysis || '',
      usage: result.usage,
    };
  }

  async generateAnalysis(prompt: string, context?: string): Promise<string> {
    const response = await this.callBackendAI('generate-ai-insights', {
      prompt,
      context,
      insightType: 'all',
    });
    return response.content;
  }

  async generateQuickResponse(prompt: string): Promise<string> {
    const response = await this.callBackendAI('finops-copilot-v2', {
      question: prompt,
      context: 'general',
    });
    return response.content;
  }

  async generateCostOptimization(costData: any): Promise<string> {
    const response = await this.callBackendAI('cost-optimization', {
      costData,
      analysisType: 'comprehensive',
    });
    return response.content;
  }

  async generateSecurityAnalysis(securityFindings: any): Promise<string> {
    const response = await this.callBackendAI('security-scan', {
      findings: securityFindings,
      scanLevel: 'military',
    });
    return response.content;
  }

  async testConnection(): Promise<{ success: boolean; message: string; error?: any }> {
    try {
      const response = await this.callBackendAI('health-check', {});
      return {
        success: true,
        message: 'Bedrock connection successful via backend',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Bedrock connection failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const bedrockAI = new BedrockAI();
export { BedrockAI };