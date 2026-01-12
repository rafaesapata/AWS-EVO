/**
 * Cloud Provider Types and Interfaces
 * 
 * This module defines the core types and interfaces for multi-cloud support.
 * It provides a unified abstraction layer that allows the platform to work
 * with multiple cloud providers (AWS, Azure, GCP) through a common interface.
 */

// ==================== ENUMS ====================

/**
 * Supported cloud providers
 */
export type CloudProviderType = 'AWS' | 'AZURE' | 'GCP';

/**
 * Severity levels for security findings (standardized across all providers)
 */
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Risk levels for activity events (standardized across all providers)
 */
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

/**
 * Scan status
 */
export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed';

// ==================== CREDENTIAL TYPES ====================

/**
 * Generic cloud credential interface
 * This represents a credential that can be from any cloud provider
 */
export interface CloudCredential {
  id: string;
  organizationId: string;
  provider: CloudProviderType;
  accountId: string;        // AWS Account ID or Azure Subscription ID or GCP Project ID
  accountName: string;
  regions: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AWS-specific credential fields
 */
export interface AWSCredentialFields {
  accessKeyId?: string;
  secretAccessKey?: string;
  roleArn?: string;
  externalId?: string;
  sessionToken?: string;
}

/**
 * Azure-specific credential fields
 */
export interface AzureCredentialFields {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
  subscriptionName?: string;
}

/**
 * GCP-specific credential fields (future)
 */
export interface GCPCredentialFields {
  projectId: string;
  serviceAccountKey: string;
}

// ==================== VALIDATION ====================

/**
 * Result of credential validation
 */
export interface ValidationResult {
  valid: boolean;
  accountId?: string;
  accountName?: string;
  error?: string;
  details?: Record<string, any>;
}

// ==================== RESOURCES ====================

/**
 * Generic cloud resource
 */
export interface Resource {
  id: string;
  provider: CloudProviderType;
  type: string;             // e.g., 'EC2', 'VM', 'S3', 'StorageAccount'
  name: string;
  region: string;
  tags?: Record<string, string>;
  metadata: Record<string, any>;
  createdAt?: Date;
}

/**
 * Resource type mapping between providers
 */
export interface ResourceTypeMapping {
  aws?: string;
  azure?: string;
  gcp?: string;
  displayName: string;
  category: string;
}

// ==================== COST DATA ====================

/**
 * Cost data from any cloud provider
 */
export interface CostData {
  date: string;             // ISO date string (YYYY-MM-DD)
  service: string;
  cost: number;
  currency: string;
  provider: CloudProviderType;
  accountId: string;
  region?: string;
  resourceGroup?: string;   // Azure-specific
  tags?: Record<string, string>;
}

/**
 * Cost granularity options
 */
export type CostGranularity = 'DAILY' | 'WEEKLY' | 'MONTHLY';

/**
 * Cost query parameters
 */
export interface CostQueryParams {
  startDate: string;
  endDate: string;
  granularity?: CostGranularity;
  groupBy?: string[];       // e.g., ['service', 'region']
  filters?: Record<string, string>;
}

// ==================== SECURITY FINDINGS ====================

/**
 * Security finding from any cloud provider
 */
export interface SecurityFinding {
  id: string;
  provider: CloudProviderType;
  severity: SeverityLevel;
  title: string;
  description: string;
  resourceId: string;
  resourceArn?: string;     // AWS-specific
  resourceUri?: string;     // Azure-specific
  service: string;
  category: string;
  compliance: ComplianceMapping[];
  remediation: RemediationSteps;
  evidence?: Record<string, any>;
  riskScore?: number;
  detectedAt: Date;
}

/**
 * Compliance framework mapping
 */
export interface ComplianceMapping {
  framework: string;        // e.g., 'CIS', 'PCI-DSS', 'NIST'
  controlId: string;
  controlTitle: string;
  status: 'passed' | 'failed' | 'not_applicable';
}

/**
 * Remediation steps
 */
export interface RemediationSteps {
  description: string;
  steps: string[];
  automatable: boolean;
  estimatedTime?: string;
  references?: string[];
}

// ==================== SECURITY SCAN ====================

/**
 * Security scan configuration
 */
export interface ScanConfig {
  scanLevel: 'quick' | 'standard' | 'deep';
  regions?: string[];
  services?: string[];
  complianceFrameworks?: string[];
}

/**
 * Security scan result
 */
export interface ScanResult {
  scanId: string;
  provider: CloudProviderType;
  status: ScanStatus;
  findings: SecurityFinding[];
  summary: ScanSummary;
  duration: number;         // milliseconds
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * Scan summary statistics
 */
export interface ScanSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  byService?: Record<string, number>;
  byCategory?: Record<string, number>;
  byCompliance?: Record<string, number>;
}

// ==================== ACTIVITY MONITORING ====================

/**
 * Activity event from any cloud provider
 */
export interface ActivityEvent {
  id: string;
  provider: CloudProviderType;
  eventName: string;
  eventTime: Date;
  userName: string;
  userType: string;         // e.g., 'IAMUser', 'ServicePrincipal', 'Root'
  userArn?: string;         // AWS-specific
  userPrincipalId?: string; // Azure-specific
  sourceIp?: string;
  userAgent?: string;
  region: string;
  service: string;
  action: string;
  resourceId?: string;
  resourceType?: string;
  riskLevel: RiskLevel;
  riskReasons?: string[];
  securityExplanation?: string;
  details: Record<string, any>;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Activity query parameters
 */
export interface ActivityQueryParams {
  startDate: string;
  endDate: string;
  eventNames?: string[];
  userNames?: string[];
  riskLevels?: RiskLevel[];
  limit?: number;
}

// ==================== PROVIDER INTERFACE ====================

/**
 * Cloud Provider Interface
 * 
 * This interface defines the contract that all cloud provider implementations
 * must follow. It provides a unified API for interacting with different cloud
 * providers (AWS, Azure, GCP).
 */
export interface ICloudProvider {
  /**
   * The type of cloud provider (AWS, AZURE, GCP)
   */
  readonly providerType: CloudProviderType;
  
  /**
   * Validate credentials by attempting to authenticate with the cloud provider
   * @returns ValidationResult indicating if credentials are valid
   */
  validateCredentials(): Promise<ValidationResult>;
  
  /**
   * List resources in the cloud account
   * @param resourceTypes Optional filter for specific resource types
   * @returns Array of resources
   */
  listResources(resourceTypes?: string[]): Promise<Resource[]>;
  
  /**
   * Get cost data for a specific time period
   * @param params Cost query parameters
   * @returns Array of cost data points
   */
  getCosts(params: CostQueryParams): Promise<CostData[]>;
  
  /**
   * Run a security scan on the cloud account
   * @param config Scan configuration
   * @returns Scan result with findings
   */
  runSecurityScan(config: ScanConfig): Promise<ScanResult>;
  
  /**
   * Get activity logs for a specific time period
   * @param params Activity query parameters
   * @returns Array of activity events
   */
  getActivityLogs(params: ActivityQueryParams): Promise<ActivityEvent[]>;
}

// ==================== PROVIDER FACTORY ====================

/**
 * Provider factory configuration
 */
export interface ProviderFactoryConfig {
  organizationId: string;
  credentials: AWSCredentialFields | AzureCredentialFields | GCPCredentialFields;
  provider: CloudProviderType;
}

// ==================== ERROR TYPES ====================

/**
 * Cloud provider error
 */
export class CloudProviderError extends Error {
  constructor(
    message: string,
    public provider: CloudProviderType,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'CloudProviderError';
  }
}

/**
 * Credential validation error
 */
export class CredentialValidationError extends CloudProviderError {
  constructor(
    provider: CloudProviderType,
    message: string,
    details?: any
  ) {
    super(message, provider, 'CREDENTIAL_VALIDATION_ERROR', 401, details);
    this.name = 'CredentialValidationError';
  }
}

/**
 * Permission denied error
 */
export class PermissionDeniedError extends CloudProviderError {
  constructor(
    provider: CloudProviderType,
    message: string,
    details?: any
  ) {
    super(message, provider, 'PERMISSION_DENIED', 403, details);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Resource not found error
 */
export class ResourceNotFoundError extends CloudProviderError {
  constructor(
    provider: CloudProviderType,
    resourceType: string,
    resourceId: string
  ) {
    super(
      `${resourceType} with ID ${resourceId} not found`,
      provider,
      'RESOURCE_NOT_FOUND',
      404,
      { resourceType, resourceId }
    );
    this.name = 'ResourceNotFoundError';
  }
}

// ==================== UTILITY TYPES ====================

/**
 * Provider-specific configuration
 */
export type ProviderConfig<T extends CloudProviderType> = 
  T extends 'AWS' ? AWSCredentialFields :
  T extends 'AZURE' ? AzureCredentialFields :
  T extends 'GCP' ? GCPCredentialFields :
  never;

/**
 * Type guard to check if credentials are AWS credentials
 */
export function isAWSCredentials(creds: any): creds is AWSCredentialFields {
  return 'accessKeyId' in creds || 'roleArn' in creds;
}

/**
 * Type guard to check if credentials are Azure credentials
 */
export function isAzureCredentials(creds: any): creds is AzureCredentialFields {
  return 'tenantId' in creds && 'clientId' in creds && 'subscriptionId' in creds;
}

/**
 * Type guard to check if credentials are GCP credentials
 */
export function isGCPCredentials(creds: any): creds is GCPCredentialFields {
  return 'projectId' in creds && 'serviceAccountKey' in creds;
}
