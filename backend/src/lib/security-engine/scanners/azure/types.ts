/**
 * Azure Security Scanner Types
 */

export interface AzureScanContext {
  subscriptionId: string;
  tenantId: string;
  accessToken: string;
  organizationId: string;
  credentialId: string;
}

export interface AzureScanResult {
  findings: AzureSecurityFinding[];
  resourcesScanned: number;
  errors: AzureScanError[];
  scanDurationMs: number;
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
  remediation?: string;
  complianceFrameworks?: string[];
  metadata?: Record<string, any>;
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
