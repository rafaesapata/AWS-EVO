/**
 * Advanced Security Scanner
 * Military-grade security analysis with AI-powered threat detection
 */
export interface SecurityScanConfig {
    organizationId: string;
    accountId: string;
    regions: string[];
    scanTypes: SecurityScanType[];
    depth: 'basic' | 'comprehensive' | 'deep';
    aiAnalysis: boolean;
}
export type SecurityScanType = 'network_security' | 'iam_analysis' | 'data_protection' | 'logging_monitoring' | 'compliance_check' | 'threat_detection' | 'vulnerability_assessment' | 'configuration_drift';
export interface SecurityFinding {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    category: string;
    title: string;
    description: string;
    aiAnalysis?: string;
    resourceId: string;
    resourceArn?: string;
    region: string;
    service: string;
    compliance: string[];
    remediation: string;
    riskScore: number;
    evidence: Record<string, any>;
    cve?: string[];
    attackVectors: string[];
    businessImpact: string;
}
export interface SecurityPosture {
    organizationId: string;
    overallScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    findingsSummary: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        info: number;
    };
    complianceScores: Record<string, number>;
    trendAnalysis: {
        scoreChange: number;
        findingsChange: number;
        period: string;
    };
    recommendations: string[];
}
export declare class AdvancedSecurityScanner {
    private prisma;
    /**
     * Perform comprehensive security scan
     */
    performSecurityScan(config: SecurityScanConfig): Promise<{
        scanId: string;
        findings: SecurityFinding[];
        posture: SecurityPosture;
    }>;
    /**
     * Perform specific scan type
     */
    private performScanType;
    /**
     * Scan network security
     */
    private scanNetworkSecurity;
    /**
     * Scan IAM security
     */
    private scanIAMSecurity;
    /**
     * Scan data protection
     */
    private scanDataProtection;
    /**
     * Scan logging and monitoring
     */
    private scanLoggingMonitoring;
    /**
     * Scan compliance
     */
    private scanCompliance;
    /**
     * Scan threat detection
     */
    private scanThreatDetection;
    /**
     * Scan vulnerabilities
     */
    private scanVulnerabilities;
    /**
     * Scan configuration drift
     */
    private scanConfigurationDrift;
    /**
     * Enhance findings with AI analysis
     */
    private enhanceWithAIAnalysis;
    /**
     * Generate AI analysis for a finding
     */
    private generateAIAnalysis;
    /**
     * Calculate security posture
     */
    private calculateSecurityPosture;
    /**
     * Generate security recommendations
     */
    private generateRecommendations;
}
export declare const advancedSecurityScanner: AdvancedSecurityScanner;
//# sourceMappingURL=advanced-security-scanner.d.ts.map