/**
 * Security Engine V3 - Types and Interfaces
 * Military-grade security scanning types
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ComplianceMapping {
  framework: string;
  version: string;
  control_id: string;
  control_title: string;
  description?: string;
}

export interface Remediation {
  description: string;
  steps: string[];
  cli_command?: string;
  terraform_example?: string;
  cloudformation_example?: string;
  estimated_effort: 'trivial' | 'low' | 'medium' | 'high';
  automation_available: boolean;
}

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  analysis: string;
  resource_id: string;
  resource_arn: string;
  region: string;
  service: string;
  category: string;
  scan_type: string;
  compliance: ComplianceMapping[];
  remediation: Remediation;
  evidence: Record<string, any>;
  risk_vector: string;
  risk_score: number;
  attack_vectors: string[];
  business_impact: string;
  cve?: string[];
  first_seen?: Date;
  last_seen?: Date;
}

export interface ScanResult {
  success: boolean;
  scanId: string;
  totalFindings: number;
  duration: number;
  findings: Finding[];
  summary: ScanSummary;
  metrics: ScanMetricsReport;
}

export interface ScanSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
  byService: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface ScanMetricsReport {
  totalDuration: number;
  totalFindings: number;
  totalErrors: number;
  servicesScanned: number;
  regionsScanned: number;
  serviceDetails: Record<string, ServiceMetric>;
}

export interface ServiceMetric {
  duration: number;
  findings: number;
  errors: number;
  checksRun: number;
}

export interface ParallelizationConfig {
  maxRegionConcurrency: number;
  maxServiceConcurrency: number;
  maxCheckConcurrency: number;
  batchSize: number;
  timeout: number;
  retryCount: number;
  retryDelay: number;
}

export interface AWSCredentials {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  roleArn?: string;
  externalId?: string;
}

// Scan level types - backend uses quick/standard/deep, frontend uses basic/advanced/military
export type ScanLevel = 'quick' | 'standard' | 'deep' | 'basic' | 'advanced' | 'military';

export interface ScanContext {
  organizationId: string;
  awsAccountId: string;
  regions: string[];
  credentials: AWSCredentials;
  scanLevel: ScanLevel;
  enabledServices?: string[];
  excludedServices?: string[];
}

export interface CheckResult {
  passed: boolean;
  finding?: Partial<Finding>;
}

export type ServiceScanner = (
  region: string,
  credentials: AWSCredentials,
  arnBuilder: any,
  cache: any
) => Promise<Finding[]>;

// Compliance framework types
export type ComplianceFramework = 
  | 'CIS_AWS'
  | 'PCI_DSS'
  | 'HIPAA'
  | 'SOC2'
  | 'ISO27001'
  | 'NIST_800_53'
  | 'NIST_CSF'
  | 'GDPR'
  | 'LGPD'
  | 'FEDRAMP'
  | 'AWS_WELL_ARCHITECTED';

// Service categories
export type ServiceCategory =
  | 'Identity Security'
  | 'Network Security'
  | 'Data Protection'
  | 'Logging & Monitoring'
  | 'Encryption'
  | 'Access Control'
  | 'Vulnerability Management'
  | 'Secrets Management'
  | 'Container Security'
  | 'Serverless Security'
  | 'API Security'
  | 'Compliance'
  | 'Reliability'
  | 'Cost Optimization';

// Risk vectors
export type RiskVector =
  | 'public_exposure'
  | 'credential_exposure'
  | 'data_exposure'
  | 'network_exposure'
  | 'weak_authentication'
  | 'excessive_permissions'
  | 'no_audit_trail'
  | 'outdated_software'
  | 'supply_chain'
  | 'data_loss'
  | 'key_management'
  | 'stale_credentials'
  | 'log_tampering'
  | 'incomplete_audit'
  | 'availability';
