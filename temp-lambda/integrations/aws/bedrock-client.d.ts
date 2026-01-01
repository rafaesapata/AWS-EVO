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
declare class BedrockAI {
    private invokeModel;
    generateAnalysis(prompt: string, context?: string): Promise<string>;
    generateQuickResponse(prompt: string): Promise<string>;
    generateCostOptimization(costData: any): Promise<string>;
    generateSecurityAnalysis(securityFindings: any): Promise<string>;
    generateWellArchitectedAnalysis(architectureData: any): Promise<string>;
    generateRemediationScript(findings: any, scriptType?: 'terraform' | 'cloudformation' | 'cli'): Promise<string>;
    generateFinOpsInsights(financialData: any): Promise<string>;
    generateIncidentPredictions(metricsData: any): Promise<string>;
    generateKnowledgeBaseContent(topic: string, context?: string): Promise<{
        title: string;
        content: string;
        tags: string[];
        summary: string;
    }>;
    private extractTags;
    private extractSummary;
    testConnection(): Promise<{
        success: boolean;
        message: string;
        error?: any;
    }>;
}
export declare const bedrockAI: BedrockAI;
export { BedrockAI };
//# sourceMappingURL=bedrock-client.d.ts.map