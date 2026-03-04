/**
 * Azure Security Scanner Types
 */

export interface AzureScanContext {
  subscriptionId: string;
  tenantId: string;
  accessToken: string;
  organizationId: string;
  credentialId: string;
  /** Optional Microsoft Graph API token (scope: https://graph.microsoft.com/.default). Used by Entra ID scanner. */
  graphAccessToken?: string;
}

export interface AzureScanResult {
  findings: AzureSecurityFinding[];
  resourcesScanned: number;
  errors: AzureScanError[];
  scanDurationMs: number;
}

export interface ComplianceMapping {
  framework: string;
  version?: string;
  controlId?: string;
}

export interface RemediationDetail {
  description: string;
  steps?: string[];
  cliCommand?: string;
  automationAvailable?: boolean;
}

export interface AzureSecurityFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  resourceGroup?: string;
  region?: string;
  /** Simple remediation text (backward compatible) */
  remediation?: string;
  /** Structured remediation with CLI commands and steps */
  remediationDetail?: RemediationDetail;
  /** Simple compliance framework names (backward compatible) */
  complianceFrameworks?: string[];
  /** Structured compliance mappings with control IDs */
  complianceMappings?: ComplianceMapping[];
  metadata?: Record<string, any>;
  /** Risk score 0-100 */
  riskScore?: number;
  /** MITRE ATT&CK or similar attack vectors */
  attackVectors?: string[];
  /** Business impact description */
  businessImpact?: string;
  /** First time this finding was seen */
  firstSeen?: string;
  /** Last time this finding was seen */
  lastSeen?: string;
}

export interface AzureScanError {
  scanner: string;
  message: string;
  recoverable: boolean;
  resourceType?: string;
}

export interface AzureScanner {
  name: string;
  description: string;
  category: string;
  scan(context: AzureScanContext): Promise<AzureScanResult>;
}
