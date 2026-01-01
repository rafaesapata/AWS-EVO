/**
 * Security Engine V3 - Base Scanner
 * Abstract base class for all service scanners
 */
import type { Finding, ComplianceMapping, Remediation, Severity, AWSCredentials } from '../types.js';
import { ArnBuilder } from '../arn-builder.js';
import { ResourceCache } from './resource-cache.js';
import { AWSClientFactory } from './client-factory.js';
export declare abstract class BaseScanner {
    protected region: string;
    protected arnBuilder: ArnBuilder;
    protected cache: ResourceCache;
    protected clientFactory: AWSClientFactory;
    protected accountId: string;
    constructor(region: string, accountId: string, credentials: AWSCredentials, cache: ResourceCache);
    /**
     * Service name for this scanner
     */
    abstract get serviceName(): string;
    /**
     * Default category for findings from this scanner
     */
    abstract get category(): string;
    /**
     * Execute all security checks for this service
     */
    abstract scan(): Promise<Finding[]>;
    /**
     * Create a standardized finding
     */
    protected createFinding(params: {
        severity: Severity;
        title: string;
        description: string;
        analysis: string;
        resource_id: string;
        resource_arn: string;
        scan_type: string;
        category?: string;
        compliance?: ComplianceMapping[];
        remediation?: Partial<Remediation>;
        evidence?: Record<string, any>;
        risk_vector?: string;
        risk_score?: number;
        attack_vectors?: string[];
        business_impact?: string;
        cve?: string[];
    }): Finding;
    /**
     * Calculate risk score based on severity
     */
    protected calculateRiskScore(severity: Severity): number;
    /**
     * Get default business impact based on severity
     */
    protected getDefaultBusinessImpact(severity: Severity): string;
    /**
     * Create CIS AWS compliance mapping
     */
    protected cisCompliance(controlId: string, controlTitle: string): ComplianceMapping;
    /**
     * Create PCI-DSS compliance mapping
     */
    protected pciCompliance(controlId: string, controlTitle: string): ComplianceMapping;
    /**
     * Create NIST 800-53 compliance mapping
     */
    protected nistCompliance(controlId: string, controlTitle: string): ComplianceMapping;
    /**
     * Create AWS Well-Architected compliance mapping
     */
    protected wellArchitectedCompliance(pillar: string, bestPractice: string): ComplianceMapping;
    /**
     * Create LGPD compliance mapping
     */
    protected lgpdCompliance(article: string, description: string): ComplianceMapping;
    /**
     * Create SOC 2 compliance mapping
     */
    protected soc2Compliance(criteria: string, description: string): ComplianceMapping;
    /**
     * Create ISO 27001 compliance mapping
     */
    protected iso27001Compliance(control: string, description: string): ComplianceMapping;
    /**
     * Create HIPAA compliance mapping
     */
    protected hipaaCompliance(section: string, description: string): ComplianceMapping;
    /**
     * Log scanner activity
     */
    protected log(message: string, data?: Record<string, any>): void;
    /**
     * Log scanner warning
     */
    protected warn(message: string, data?: Record<string, any>): void;
    /**
     * Log scanner error
     */
    protected error(message: string, error?: Error, data?: Record<string, any>): void;
    /**
     * Safe execution wrapper for individual checks
     */
    protected safeExecute<T>(checkName: string, operation: () => Promise<T>, defaultValue: T): Promise<T>;
    /**
     * Get cache key for this scanner
     */
    protected getCacheKey(resource: string, ...args: string[]): string;
}
//# sourceMappingURL=base-scanner.d.ts.map