/**
 * Cloud Provider Module
 * 
 * Exports all cloud provider related functionality.
 */

export { CloudProviderFactory, getCloudProvider, detectProvider } from './factory';
export { AWSProvider } from './aws-provider';
export { AzureProvider } from './azure-provider';

// Re-export types for convenience
export type {
  CloudProviderType,
  ICloudProvider,
  AWSCredentialFields,
  AzureCredentialFields,
  GCPCredentialFields,
  ValidationResult,
  Resource,
  CostData,
  CostQueryParams,
  ScanConfig,
  ScanResult,
  SecurityFinding,
  ScanSummary,
  ActivityEvent,
  ActivityQueryParams,
  ProviderFactoryConfig,
} from '../../types/cloud';

export {
  CloudProviderError,
  CredentialValidationError,
  PermissionDeniedError,
  ResourceNotFoundError,
  isAWSCredentials,
  isAzureCredentials,
  isGCPCredentials,
} from '../../types/cloud';
