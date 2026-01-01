/**
 * Security Engine V3 - Base Scanner
 * Abstract base class for all service scanners
 */

import type { Finding, ComplianceMapping, Remediation, Severity, AWSCredentials } from '../types.js';
import { ArnBuilder } from '../arn-builder.js';
import { ResourceCache } from './resource-cache.js';
import { AWSClientFactory } from './client-factory.js';
import { logger } from '../../logging.js';
import { randomUUID } from 'crypto';

export abstract class BaseScanner {
  protected region: string;
  protected arnBuilder: ArnBuilder;
  protected cache: ResourceCache;
  protected clientFactory: AWSClientFactory;
  protected accountId: string;

  constructor(
    region: string,
    accountId: string,
    credentials: AWSCredentials,
    cache: ResourceCache
  ) {
    this.region = region;
    this.accountId = accountId;
    this.arnBuilder = new ArnBuilder(accountId);
    this.cache = cache;
    this.clientFactory = new AWSClientFactory(credentials);
  }

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
  }): Finding {
    const defaultRemediation: Remediation = {
      description: 'Review and remediate this finding.',
      steps: ['Review the finding details', 'Apply recommended changes', 'Verify the fix'],
      estimated_effort: 'medium',
      automation_available: false,
      ...params.remediation,
    };

    return {
      id: `${this.serviceName.toLowerCase()}_${params.scan_type}_${params.resource_id}_${randomUUID().slice(0, 8)}`,
      severity: params.severity,
      title: params.title,
      description: params.description,
      analysis: params.analysis,
      resource_id: params.resource_id,
      resource_arn: params.resource_arn,
      region: this.region,
      service: this.serviceName,
      category: params.category || this.category,
      scan_type: params.scan_type,
      compliance: params.compliance || [],
      remediation: defaultRemediation,
      evidence: params.evidence || {},
      risk_vector: params.risk_vector || 'unknown',
      risk_score: params.risk_score || this.calculateRiskScore(params.severity),
      attack_vectors: params.attack_vectors || [],
      business_impact: params.business_impact || this.getDefaultBusinessImpact(params.severity),
      cve: params.cve,
      first_seen: new Date(),
      last_seen: new Date(),
    };
  }

  /**
   * Calculate risk score based on severity
   */
  protected calculateRiskScore(severity: Severity): number {
    const scores: Record<Severity, number> = {
      critical: 10,
      high: 7,
      medium: 4,
      low: 2,
      info: 1,
    };
    return scores[severity];
  }

  /**
   * Get default business impact based on severity
   */
  protected getDefaultBusinessImpact(severity: Severity): string {
    const impacts: Record<Severity, string> = {
      critical: 'Immediate risk of data breach or system compromise. Requires urgent attention.',
      high: 'Significant security risk that could lead to unauthorized access or data exposure.',
      medium: 'Moderate security concern that should be addressed in the near term.',
      low: 'Minor security improvement opportunity with limited immediate risk.',
      info: 'Informational finding for awareness and best practice alignment.',
    };
    return impacts[severity];
  }

  /**
   * Create CIS AWS compliance mapping
   */
  protected cisCompliance(controlId: string, controlTitle: string): ComplianceMapping {
    return {
      framework: 'CIS AWS Foundations Benchmark',
      version: '1.5.0',
      control_id: controlId,
      control_title: controlTitle,
    };
  }

  /**
   * Create PCI-DSS compliance mapping
   */
  protected pciCompliance(controlId: string, controlTitle: string): ComplianceMapping {
    return {
      framework: 'PCI-DSS',
      version: '4.0',
      control_id: controlId,
      control_title: controlTitle,
    };
  }

  /**
   * Create NIST 800-53 compliance mapping
   */
  protected nistCompliance(controlId: string, controlTitle: string): ComplianceMapping {
    return {
      framework: 'NIST 800-53',
      version: 'Rev5',
      control_id: controlId,
      control_title: controlTitle,
    };
  }

  /**
   * Create AWS Well-Architected compliance mapping
   */
  protected wellArchitectedCompliance(pillar: string, bestPractice: string): ComplianceMapping {
    return {
      framework: 'AWS Well-Architected',
      version: '2023',
      control_id: pillar,
      control_title: bestPractice,
    };
  }

  /**
   * Create LGPD compliance mapping
   */
  protected lgpdCompliance(article: string, description: string): ComplianceMapping {
    return {
      framework: 'LGPD',
      version: '2020',
      control_id: article,
      control_title: description,
    };
  }

  /**
   * Create SOC 2 compliance mapping
   */
  protected soc2Compliance(criteria: string, description: string): ComplianceMapping {
    return {
      framework: 'SOC 2',
      version: '2017',
      control_id: criteria,
      control_title: description,
    };
  }

  /**
   * Create ISO 27001 compliance mapping
   */
  protected iso27001Compliance(control: string, description: string): ComplianceMapping {
    return {
      framework: 'ISO 27001',
      version: '2022',
      control_id: control,
      control_title: description,
    };
  }

  /**
   * Create HIPAA compliance mapping
   */
  protected hipaaCompliance(section: string, description: string): ComplianceMapping {
    return {
      framework: 'HIPAA',
      version: '2023',
      control_id: section,
      control_title: description,
    };
  }

  /**
   * Log scanner activity
   */
  protected log(message: string, data?: Record<string, any>): void {
    logger.info(`[${this.serviceName}:${this.region}] ${message}`, data);
  }

  /**
   * Log scanner warning
   */
  protected warn(message: string, data?: Record<string, any>): void {
    logger.warn(`[${this.serviceName}:${this.region}] ${message}`, data);
  }

  /**
   * Log scanner error
   */
  protected error(message: string, error?: Error, data?: Record<string, any>): void {
    logger.error(`[${this.serviceName}:${this.region}] ${message}`, error, data);
  }

  /**
   * Safe execution wrapper for individual checks
   */
  protected async safeExecute<T>(
    checkName: string,
    operation: () => Promise<T>,
    defaultValue: T
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.warn(`Check failed: ${checkName}`, { error: (error as Error).message });
      return defaultValue;
    }
  }

  /**
   * Get cache key for this scanner
   */
  protected getCacheKey(resource: string, ...args: string[]): string {
    return ResourceCache.key(this.serviceName, this.region, resource, ...args);
  }
}
