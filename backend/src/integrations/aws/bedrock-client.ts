// Backend-only Bedrock client
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

let bedrockClient: BedrockRuntimeClient | null = null;
let clientInitialized = false;

// Initialize Bedrock Runtime Client
const initializeBedrockClient = async (): Promise<BedrockRuntimeClient> => {
  if (bedrockClient && clientInitialized) {
    return bedrockClient;
  }

  const region = process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-1';
  
  // Configure client with credentials from environment variables
  const clientConfig: any = { region };
  
  // Check if explicit credentials are provided
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    clientConfig.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      ...(process.env.AWS_SESSION_TOKEN && { sessionToken: process.env.AWS_SESSION_TOKEN })
    };
    console.log('✅ Bedrock client initialized with explicit credentials');
  } else {
    // Use default credential chain (AWS CLI credentials, IAM roles, etc.)
    console.log('✅ Bedrock client initialized with default credential chain');
  }
  
  bedrockClient = new BedrockRuntimeClient(clientConfig);
  clientInitialized = true;
  
  return bedrockClient;
};

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
  private async invokeModel(
    modelId: string,
    messages: BedrockMessage[],
    maxTokens: number = 4000,
    temperature: number = 0.7
  ): Promise<BedrockResponse> {
    try {
      const client = await initializeBedrockClient();
      
      // Use the new Converse API for Claude 3 models
      const systemMessage = messages.find(m => m.role === 'system')?.content;
      const conversationMessages = messages.filter(m => m.role !== 'system');
      
      const converseParams: any = {
        modelId,
        messages: conversationMessages.map(msg => ({
          role: msg.role,
          content: [{ text: msg.content }]
        })),
        inferenceConfig: {
          maxTokens,
          temperature,
          topP: 0.9
        }
      };

      if (systemMessage) {
        converseParams.system = [{ text: systemMessage }];
      }

      const command = new ConverseCommand(converseParams);
      const response = await client.send(command);

      const content = response.output?.message?.content?.[0]?.text || '';
      
      return {
        content,
        usage: {
          input_tokens: response.usage?.inputTokens || 0,
          output_tokens: response.usage?.outputTokens || 0
        }
      };
    } catch (error) {
      console.error('Bedrock AI Error:', error);
      throw new Error(`Bedrock AI Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Use Claude 3.5 Sonnet for complex analysis
  async generateAnalysis(prompt: string, context?: string): Promise<string> {
    const messages: BedrockMessage[] = [
      {
        role: 'system',
        content: 'You are an expert AWS cloud architect and FinOps specialist. Provide detailed, actionable analysis and recommendations.'
      },
      {
        role: 'user',
        content: context ? `Context: ${context}\n\nAnalysis Request: ${prompt}` : prompt
      }
    ];

    const response = await this.invokeModel(
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
      messages,
      4000,
      0.3
    );

    return response.content;
  }

  // Use Claude 3 Haiku for faster, simpler tasks
  async generateQuickResponse(prompt: string): Promise<string> {
    const messages: BedrockMessage[] = [
      {
        role: 'user',
        content: prompt
      }
    ];

    const response = await this.invokeModel(
      'anthropic.claude-3-haiku-20240307-v1:0',
      messages,
      2000,
      0.5
    );

    return response.content;
  }

  // Generate cost optimization recommendations
  async generateCostOptimization(costData: any): Promise<string> {
    const prompt = `Analyze the following AWS cost data and provide specific optimization recommendations:

${JSON.stringify(costData, null, 2)}

Please provide:
1. Top 3 cost optimization opportunities
2. Estimated monthly savings for each
3. Implementation difficulty (Easy/Medium/Hard)
4. Step-by-step implementation guide
5. Potential risks and mitigation strategies

Format the response in clear, actionable sections.`;

    return this.generateAnalysis(prompt);
  }

  // Generate security analysis
  async generateSecurityAnalysis(securityFindings: any): Promise<string> {
    const prompt = `Analyze the following AWS security findings and provide prioritized recommendations:

${JSON.stringify(securityFindings, null, 2)}

Please provide:
1. Risk assessment (Critical/High/Medium/Low)
2. Business impact analysis
3. Prioritized remediation steps
4. Compliance implications
5. Preventive measures

Focus on actionable insights and business impact.`;

    return this.generateAnalysis(prompt);
  }

  // Generate Well-Architected Framework analysis
  async generateWellArchitectedAnalysis(architectureData: any): Promise<string> {
    const prompt = `Perform a Well-Architected Framework analysis on the following AWS architecture:

${JSON.stringify(architectureData, null, 2)}

Analyze against all 6 pillars:
1. Operational Excellence
2. Security
3. Reliability
4. Performance Efficiency
5. Cost Optimization
6. Sustainability

For each pillar, provide:
- Current state assessment
- Identified gaps
- Specific recommendations
- Implementation priority
- Expected benefits

Format as a comprehensive report with executive summary.`;

    return this.generateAnalysis(prompt);
  }

  // Generate remediation scripts
  async generateRemediationScript(
    findings: any, 
    scriptType: 'terraform' | 'cloudformation' | 'cli' = 'terraform'
  ): Promise<string> {
    const prompt = `Generate a ${scriptType} script to remediate the following AWS security/compliance findings:

${JSON.stringify(findings, null, 2)}

Requirements:
- Use AWS best practices
- Include proper error handling
- Add comments explaining each step
- Ensure idempotent operations
- Include rollback procedures where applicable

${scriptType === 'terraform' ? 'Use Terraform HCL with latest AWS provider.' : 
  scriptType === 'cloudformation' ? 'Use CloudFormation YAML with latest resource types.' :
  'Use AWS CLI v2 with bash scripting.'}`;

    return this.generateAnalysis(prompt);
  }

  // Generate FinOps insights
  async generateFinOpsInsights(financialData: any): Promise<string> {
    const prompt = `Analyze the following AWS financial data and provide FinOps insights:

${JSON.stringify(financialData, null, 2)}

Provide insights on:
1. Cost trends and anomalies
2. Resource utilization efficiency
3. Budget optimization opportunities
4. Chargeback/showback recommendations
5. Governance improvements
6. Forecasting and planning

Include specific metrics and KPIs where possible.`;

    return this.generateAnalysis(prompt);
  }

  // Generate incident predictions
  async generateIncidentPredictions(metricsData: any): Promise<string> {
    const prompt = `Analyze the following AWS metrics and predict potential incidents:

${JSON.stringify(metricsData, null, 2)}

Provide:
1. Incident probability assessment
2. Potential impact analysis
3. Early warning indicators
4. Preventive actions
5. Monitoring recommendations
6. Response procedures

Focus on proactive measures and business continuity.`;

    return this.generateAnalysis(prompt);
  }

  // Generate knowledge base content
  async generateKnowledgeBaseContent(topic: string, context?: string): Promise<{
    title: string;
    content: string;
    tags: string[];
    summary: string;
  }> {
    const prompt = `Create comprehensive knowledge base content about: ${topic}

${context ? `Context: ${context}` : ''}

Generate:
1. A clear, descriptive title
2. Detailed content with sections and subsections
3. Relevant tags for categorization
4. A concise summary

Format the content in markdown with proper headings, code examples where applicable, and actionable information.`;

    const response = await this.generateAnalysis(prompt);
    
    // Parse the response to extract structured data
    const lines = response.split('\n');
    const title = lines.find(line => line.startsWith('# '))?.replace('# ', '') || topic;
    const tags = this.extractTags(response);
    const summary = this.extractSummary(response);

    return {
      title,
      content: response,
      tags,
      summary
    };
  }

  private extractTags(content: string): string[] {
    // Extract tags from content based on common patterns
    const tagPatterns = [
      /tags?:\s*([^\n]+)/i,
      /categories?:\s*([^\n]+)/i,
      /keywords?:\s*([^\n]+)/i
    ];

    for (const pattern of tagPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].split(',').map(tag => tag.trim()).filter(Boolean);
      }
    }

    // Fallback: extract key terms from content
    const words = content.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const commonWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use']);
    
    const uniqueWords = [...new Set(words)]
      .filter(word => !commonWords.has(word))
      .slice(0, 5);

    return uniqueWords;
  }

  private extractSummary(content: string): string {
    // Look for summary section
    const summaryMatch = content.match(/summary:?\s*([^\n]+(?:\n[^\n#]+)*)/i);
    if (summaryMatch) {
      return summaryMatch[1].trim();
    }

    // Fallback: use first paragraph
    const firstParagraph = content.split('\n\n')[0];
    return firstParagraph.replace(/^#+\s*/, '').trim().substring(0, 200) + '...';
  }

  // Test method for debugging
  async testConnection(): Promise<{ success: boolean; message: string; error?: any }> {
    try {
      const testResponse = await this.generateQuickResponse('Test connection - respond with "Connection successful"');
      
      return {
        success: true,
        message: `Bedrock connection test successful. Response: ${testResponse}`
      };
    } catch (error) {
      return {
        success: false,
        message: 'Bedrock connection test failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

export const bedrockAI = new BedrockAI();
export { BedrockAI };