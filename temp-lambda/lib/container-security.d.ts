/**
 * Comprehensive Container Security System
 * Provides security scanning, runtime protection, and compliance monitoring for containers
 */
export interface ContainerSecurityConfig {
    scanning: {
        enabled: boolean;
        scanOnBuild: boolean;
        scanOnDeploy: boolean;
        scanSchedule: string;
        failOnCritical: boolean;
        failOnHigh: boolean;
    };
    runtime: {
        enabled: boolean;
        readOnlyRootFilesystem: boolean;
        nonRootUser: boolean;
        dropCapabilities: string[];
        seccompProfile: string;
        apparmorProfile: string;
    };
    network: {
        restrictedPorts: number[];
        allowedOutboundHosts: string[];
        networkPolicies: boolean;
    };
    compliance: {
        cis: boolean;
        nist: boolean;
        pci: boolean;
        sox: boolean;
    };
}
export interface VulnerabilityReport {
    id: string;
    timestamp: Date;
    imageId: string;
    imageName: string;
    imageTag: string;
    scanner: string;
    vulnerabilities: Vulnerability[];
    summary: VulnerabilitySummary;
    compliance: ComplianceResult[];
}
export interface Vulnerability {
    id: string;
    cve?: string;
    severity: VulnerabilitySeverity;
    title: string;
    description: string;
    package: string;
    version: string;
    fixedVersion?: string;
    publishedDate: Date;
    modifiedDate: Date;
    score: number;
    vector?: string;
    references: string[];
}
export type VulnerabilitySeverity = 'critical' | 'high' | 'medium' | 'low' | 'negligible';
export interface VulnerabilitySummary {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    negligible: number;
}
export interface ComplianceResult {
    standard: string;
    passed: boolean;
    score: number;
    checks: ComplianceCheck[];
}
export interface ComplianceCheck {
    id: string;
    title: string;
    description: string;
    passed: boolean;
    severity: 'critical' | 'high' | 'medium' | 'low';
    remediation: string;
}
export interface RuntimeSecurityEvent {
    id: string;
    timestamp: Date;
    containerId: string;
    containerName: string;
    eventType: SecurityEventType;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    details: Record<string, any>;
    blocked: boolean;
    remediation?: string;
}
export type SecurityEventType = 'privilege_escalation' | 'suspicious_process' | 'network_anomaly' | 'file_system_violation' | 'capability_violation' | 'malware_detected' | 'policy_violation';
export interface DockerfileSecurityAnalysis {
    file: string;
    issues: DockerfileIssue[];
    score: number;
    recommendations: string[];
}
export interface DockerfileIssue {
    line: number;
    rule: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
    remediation: string;
}
/**
 * Container Security Scanner
 */
export declare class ContainerSecurityScanner {
    private config;
    constructor(config: ContainerSecurityConfig);
    /**
     * Scan container image for vulnerabilities
     */
    scanImage(imageId: string, imageName: string, imageTag: string): Promise<VulnerabilityReport>;
    /**
     * Perform vulnerability scanning
     */
    private performVulnerabilityScan;
    private scanWithTrivy;
    private scanWithECR;
    private parseTrivyResults;
    private parseECRFindings;
    private extractRepoName;
    private extractTag;
    /**
     * Perform compliance scanning
     */
    private performComplianceScan;
    /**
     * Scan CIS compliance
     */
    private checkContainerUser;
    private scanCISCompliance;
    /**
     * Scan NIST compliance
     */
    private scanNISTCompliance;
    /**
     * Calculate vulnerability summary
     */
    private calculateSummary;
    /**
     * Check if build should fail based on vulnerabilities
     */
    private shouldFailBuild;
}
/**
 * Dockerfile Security Analyzer
 */
export declare class DockerfileSecurityAnalyzer {
    private securityRules;
    constructor();
    /**
     * Initialize security rules for Dockerfile analysis
     */
    private initializeSecurityRules;
    /**
     * Analyze Dockerfile for security issues
     */
    analyzeDockerfile(dockerfilePath: string): Promise<DockerfileSecurityAnalysis>;
    /**
     * Generate security recommendations
     */
    private generateRecommendations;
}
/**
 * Runtime Security Monitor
 */
export declare class RuntimeSecurityMonitor {
    private events;
    private config;
    constructor(config: ContainerSecurityConfig);
    /**
     * Monitor container runtime security
     */
    startMonitoring(): Promise<void>;
    /**
     * Check runtime security
     */
    private setupRealTimeMonitoring;
    private monitorDockerEvents;
    private simulateRealTimeEvents;
    private performSecurityChecks;
    private getRunningContainers;
    private checkContainerSecurity;
    private handleDetectedSecurityEvent;
    /**
     * Handle security event
     */
    private handleSecurityEvent;
    /**
     * Get security events
     */
    getSecurityEvents(containerId?: string): RuntimeSecurityEvent[];
    /**
     * Get security summary
     */
    getSecuritySummary(): {
        totalEvents: number;
        eventsBySeverity: Record<string, number>;
        eventsByType: Record<string, number>;
        blockedEvents: number;
    };
}
/**
 * Container Security Manager - Main orchestrator
 */
export declare class ContainerSecurityManager {
    private scanner;
    private dockerfileAnalyzer;
    private runtimeMonitor;
    private config;
    constructor(config: ContainerSecurityConfig);
    /**
     * Initialize container security
     */
    initialize(): Promise<void>;
    /**
     * Perform comprehensive security scan
     */
    performSecurityScan(options: {
        imageId: string;
        imageName: string;
        imageTag: string;
        dockerfilePath?: string;
    }): Promise<{
        vulnerabilityReport: VulnerabilityReport;
        dockerfileAnalysis?: DockerfileSecurityAnalysis;
    }>;
    /**
     * Generate security report
     */
    generateSecurityReport(): {
        summary: {
            totalScans: number;
            totalVulnerabilities: number;
            criticalVulnerabilities: number;
            complianceScore: number;
        };
        recentScans: VulnerabilityReport[];
        runtimeEvents: RuntimeSecurityEvent[];
        recommendations: string[];
    };
}
export declare const DEFAULT_CONTAINER_SECURITY_CONFIG: ContainerSecurityConfig;
export declare const containerSecurityManager: ContainerSecurityManager;
export declare function scanContainerImage(imageId: string, imageName: string, imageTag: string): Promise<VulnerabilityReport>;
export declare function analyzeDockerfile(dockerfilePath: string): Promise<DockerfileSecurityAnalysis>;
export declare const SECURE_DOCKERFILE_TEMPLATE: string;
//# sourceMappingURL=container-security.d.ts.map