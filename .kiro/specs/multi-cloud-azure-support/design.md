# Design Document: Multi-Cloud Azure Support

## Overview

Este documento descreve a arquitetura e design técnico para adicionar suporte ao Microsoft Azure na plataforma EVO. A implementação segue o princípio de "abstração por camadas", onde uma interface comum (`ICloudProvider`) permite que diferentes provedores cloud sejam tratados de forma uniforme, enquanto mantém implementações específicas isoladas.

A estratégia principal é **não modificar código AWS existente**, mas sim criar uma camada de abstração que encapsula o código atual e permite adicionar novos provedores de forma incremental.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              CloudAccountContext (React Context)                 │   │
│  │  - accounts: CloudAccount[]                                      │   │
│  │  - selectedAccount: CloudAccount | null                          │   │
│  │  - selectedProvider: 'aws' | 'azure'                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                  │                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              Provider-Aware Components                           │   │
│  │  - CloudCredentialsManager                                       │   │
│  │  - SecurityDashboard                                             │   │
│  │  - CostAnalysisDashboard                                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Unified Endpoints (provider-agnostic)                          │   │
│  │  POST /api/functions/list-cloud-credentials                     │   │
│  │  POST /api/functions/security-scan                              │   │
│  │  POST /api/functions/fetch-costs                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         LAMBDA HANDLERS                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              Provider Router Layer                               │   │
│  │  - Detects provider from credential/request                      │   │
│  │  - Routes to appropriate provider implementation                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                    │                           │                         │
│         ┌─────────┴─────────┐       ┌─────────┴─────────┐              │
│         ▼                   ▼       ▼                   ▼              │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐          │
│  │  AWS Handlers   │ │ Azure Handlers  │ │  GCP Handlers   │          │
│  │  (existing)     │ │ (new)           │ │  (future)       │          │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      PROVIDER ABSTRACTION LAYER                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              ICloudProvider Interface                            │   │
│  │  + validateCredentials(): Promise<ValidationResult>              │   │
│  │  + listResources(): Promise<Resource[]>                          │   │
│  │  + getCosts(period): Promise<CostData[]>                         │   │
│  │  + runSecurityScan(config): Promise<ScanResult>                  │   │
│  │  + getActivityLogs(period): Promise<ActivityEvent[]>             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                    │                           │                         │
│         ┌─────────┴─────────┐       ┌─────────┴─────────┐              │
│         ▼                   ▼       ▼                   ▼              │
│  ┌─────────────────┐ ┌─────────────────┐                               │
│  │  AWSProvider    │ │  AzureProvider  │                               │
│  │  (wraps exist.) │ │  (new impl.)    │                               │
│  └─────────────────┘ └─────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          DATABASE (PostgreSQL)                           │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐        │
│  │ aws_credentials  │ │ azure_credentials│ │ cloud_credentials│        │
│  │ (existing)       │ │ (new)            │ │ (view/union)     │        │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘        │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐        │
│  │ findings         │ │ daily_costs      │ │ security_scans   │        │
│  │ +cloud_provider  │ │ +cloud_provider  │ │ +cloud_provider  │        │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
backend/
├── src/
│   ├── handlers/
│   │   ├── aws/                    # Existing AWS handlers (unchanged)
│   │   │   ├── list-aws-credentials.ts
│   │   │   ├── save-aws-credentials.ts
│   │   │   └── ...
│   │   ├── azure/                  # New Azure handlers
│   │   │   ├── list-azure-credentials.ts
│   │   │   ├── save-azure-credentials.ts
│   │   │   ├── validate-azure-credentials.ts
│   │   │   └── ...
│   │   ├── cloud/                  # Unified cloud handlers
│   │   │   ├── list-cloud-credentials.ts
│   │   │   └── ...
│   │   ├── security/
│   │   │   ├── security-scan.ts    # Existing (unchanged)
│   │   │   └── azure-security-scan.ts  # New
│   │   └── cost/
│   │       ├── fetch-daily-costs.ts    # Existing (unchanged)
│   │       └── azure-fetch-costs.ts    # New
│   ├── lib/
│   │   ├── aws-helpers.ts          # Existing (unchanged)
│   │   ├── azure-helpers.ts        # New Azure SDK helpers
│   │   ├── cloud-provider/         # New abstraction layer
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── factory.ts
│   │   │   ├── aws-provider.ts
│   │   │   └── azure-provider.ts
│   │   └── azure-security-engine/  # New Azure security scanners
│   │       ├── index.ts
│   │       ├── scanners/
│   │       │   ├── vm-scanner.ts
│   │       │   ├── storage-scanner.ts
│   │       │   ├── sql-scanner.ts
│   │       │   ├── keyvault-scanner.ts
│   │       │   └── nsg-scanner.ts
│   │       └── compliance/
│   │           ├── cis-azure.ts
│   │           └── azure-security-benchmark.ts
│   └── types/
│       └── cloud.ts                # New cloud-agnostic types
├── prisma/
│   └── schema.prisma               # Updated with Azure models
```

## Components and Interfaces

### ICloudProvider Interface

```typescript
// backend/src/lib/cloud-provider/types.ts

export type CloudProviderType = 'AWS' | 'AZURE' | 'GCP';

export interface CloudCredential {
  id: string;
  organizationId: string;
  provider: CloudProviderType;
  accountId: string;        // AWS Account ID or Azure Subscription ID
  accountName: string;
  regions: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ValidationResult {
  valid: boolean;
  accountId?: string;
  accountName?: string;
  error?: string;
}

export interface Resource {
  id: string;
  provider: CloudProviderType;
  type: string;             // e.g., 'EC2', 'VM', 'S3', 'StorageAccount'
  name: string;
  region: string;
  metadata: Record<string, any>;
}

export interface CostData {
  date: string;
  service: string;
  cost: number;
  currency: string;
  provider: CloudProviderType;
}

export interface SecurityFinding {
  id: string;
  provider: CloudProviderType;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  resourceId: string;
  resourceArn?: string;
  service: string;
  category: string;
  compliance: string[];
  remediation: string;
}

export interface ScanResult {
  scanId: string;
  provider: CloudProviderType;
  status: 'completed' | 'failed';
  findings: SecurityFinding[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  duration: number;
}

export interface ActivityEvent {
  id: string;
  provider: CloudProviderType;
  eventName: string;
  eventTime: Date;
  userName: string;
  userType: string;
  sourceIp?: string;
  region: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  details: Record<string, any>;
}

export interface ICloudProvider {
  readonly providerType: CloudProviderType;
  
  validateCredentials(): Promise<ValidationResult>;
  listResources(resourceTypes?: string[]): Promise<Resource[]>;
  getCosts(startDate: string, endDate: string, granularity?: string): Promise<CostData[]>;
  runSecurityScan(scanLevel: string): Promise<ScanResult>;
  getActivityLogs(startDate: string, endDate: string): Promise<ActivityEvent[]>;
}
```

### CloudProviderFactory

```typescript
// backend/src/lib/cloud-provider/factory.ts

import { ICloudProvider, CloudProviderType } from './types';
import { AWSProvider } from './aws-provider';
import { AzureProvider } from './azure-provider';

export class CloudProviderFactory {
  static getProvider(
    providerType: CloudProviderType,
    credentials: any,
    organizationId: string
  ): ICloudProvider {
    switch (providerType) {
      case 'AWS':
        return new AWSProvider(credentials, organizationId);
      case 'AZURE':
        return new AzureProvider(credentials, organizationId);
      case 'GCP':
        throw new Error('GCP provider not yet implemented');
      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  }
  
  static detectProviderFromCredential(credential: any): CloudProviderType {
    if (credential.tenant_id && credential.client_id) {
      return 'AZURE';
    }
    if (credential.access_key_id || credential.role_arn) {
      return 'AWS';
    }
    throw new Error('Unable to detect cloud provider from credential');
  }
}
```

### AzureProvider Implementation

```typescript
// backend/src/lib/cloud-provider/azure-provider.ts

import { ClientSecretCredential } from '@azure/identity';
import { ResourceManagementClient } from '@azure/arm-resources';
import { CostManagementClient } from '@azure/arm-costmanagement';
import { SecurityCenter } from '@azure/arm-security';
import { ICloudProvider, CloudProviderType, ValidationResult, Resource, CostData, ScanResult, ActivityEvent } from './types';

export interface AzureCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
}

export class AzureProvider implements ICloudProvider {
  readonly providerType: CloudProviderType = 'AZURE';
  private credential: ClientSecretCredential;
  private subscriptionId: string;
  private organizationId: string;
  
  constructor(credentials: AzureCredentials, organizationId: string) {
    this.credential = new ClientSecretCredential(
      credentials.tenantId,
      credentials.clientId,
      credentials.clientSecret
    );
    this.subscriptionId = credentials.subscriptionId;
    this.organizationId = organizationId;
  }
  
  async validateCredentials(): Promise<ValidationResult> {
    try {
      const client = new ResourceManagementClient(this.credential, this.subscriptionId);
      // Try to list resource groups to validate credentials
      const iterator = client.resourceGroups.list();
      await iterator.next();
      
      return {
        valid: true,
        accountId: this.subscriptionId,
        accountName: `Azure Subscription ${this.subscriptionId}`,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }
  
  async listResources(resourceTypes?: string[]): Promise<Resource[]> {
    const client = new ResourceManagementClient(this.credential, this.subscriptionId);
    const resources: Resource[] = [];
    
    for await (const resource of client.resources.list()) {
      if (!resourceTypes || resourceTypes.includes(resource.type || '')) {
        resources.push({
          id: resource.id || '',
          provider: 'AZURE',
          type: resource.type || 'Unknown',
          name: resource.name || 'Unknown',
          region: resource.location || 'Unknown',
          metadata: {
            resourceGroup: resource.id?.split('/')[4],
            tags: resource.tags,
            kind: resource.kind,
          },
        });
      }
    }
    
    return resources;
  }
  
  async getCosts(startDate: string, endDate: string, granularity = 'Daily'): Promise<CostData[]> {
    const client = new CostManagementClient(this.credential);
    const scope = `/subscriptions/${this.subscriptionId}`;
    
    const result = await client.query.usage(scope, {
      type: 'ActualCost',
      timeframe: 'Custom',
      timePeriod: { from: new Date(startDate), to: new Date(endDate) },
      dataset: {
        granularity: granularity as any,
        aggregation: {
          totalCost: { name: 'Cost', function: 'Sum' },
        },
        grouping: [{ type: 'Dimension', name: 'ServiceName' }],
      },
    });
    
    const costs: CostData[] = [];
    if (result.rows) {
      for (const row of result.rows) {
        costs.push({
          date: String(row[2]),
          service: String(row[1]),
          cost: Number(row[0]),
          currency: 'USD',
          provider: 'AZURE',
        });
      }
    }
    
    return costs;
  }
  
  async runSecurityScan(scanLevel: string): Promise<ScanResult> {
    // Implementation will use Azure Security Center / Defender for Cloud
    // This is a placeholder for the full implementation
    const securityClient = new SecurityCenter(this.credential, this.subscriptionId);
    
    // Fetch security assessments
    const findings: SecurityFinding[] = [];
    
    for await (const assessment of securityClient.assessments.list(`/subscriptions/${this.subscriptionId}`)) {
      if (assessment.status?.code === 'Unhealthy') {
        findings.push({
          id: assessment.name || '',
          provider: 'AZURE',
          severity: this.mapAzureSeverity(assessment.metadata?.severity),
          title: assessment.displayName || 'Unknown',
          description: assessment.metadata?.description || '',
          resourceId: assessment.resourceDetails?.source || '',
          service: assessment.metadata?.categories?.[0] || 'Unknown',
          category: assessment.metadata?.categories?.[0] || 'Unknown',
          compliance: [],
          remediation: assessment.metadata?.remediationDescription || '',
        });
      }
    }
    
    return {
      scanId: `azure-scan-${Date.now()}`,
      provider: 'AZURE',
      status: 'completed',
      findings,
      summary: this.calculateSummary(findings),
      duration: 0,
    };
  }
  
  async getActivityLogs(startDate: string, endDate: string): Promise<ActivityEvent[]> {
    // Implementation will use Azure Monitor Activity Logs
    // Placeholder for full implementation
    return [];
  }
  
  private mapAzureSeverity(severity?: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    switch (severity?.toLowerCase()) {
      case 'high': return 'critical';
      case 'medium': return 'high';
      case 'low': return 'medium';
      default: return 'low';
    }
  }
  
  private calculateSummary(findings: SecurityFinding[]) {
    return {
      total: findings.length,
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
    };
  }
}
```

## Data Models

### Prisma Schema Updates

```prisma
// backend/prisma/schema.prisma

// New enum for cloud providers
enum CloudProvider {
  AWS
  AZURE
  GCP
}

// New Azure credentials table (parallel to aws_credentials)
model AzureCredential {
  id                String   @id @default(uuid()) @db.Uuid
  organization_id   String   @db.Uuid
  subscription_id   String   // Azure Subscription ID
  subscription_name String?
  tenant_id         String   // Azure AD Tenant ID
  client_id         String   // Service Principal App ID
  client_secret     String   // Service Principal Secret (encrypted)
  regions           String[] // Azure regions (e.g., eastus, westeurope)
  is_active         Boolean  @default(true)
  created_at        DateTime @default(now()) @db.Timestamptz(6)
  updated_at        DateTime @updatedAt @db.Timestamptz(6)
  
  organization      Organization @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  security_scans    SecurityScan[] @relation("AzureSecurityScans")
  
  @@unique([organization_id, subscription_id])
  @@map("azure_credentials")
}

// Update Organization to include Azure credentials
model Organization {
  // ... existing fields ...
  azure_credentials AzureCredential[]
}

// Update Finding to support multi-cloud
model Finding {
  // ... existing fields ...
  cloud_provider    CloudProvider @default(AWS)
  azure_credential_id String?     @db.Uuid
}

// Update DailyCost to support multi-cloud
model DailyCost {
  // ... existing fields ...
  cloud_provider    CloudProvider @default(AWS)
  azure_credential_id String?     @db.Uuid
}

// Update SecurityScan to support multi-cloud
model SecurityScan {
  // ... existing fields ...
  cloud_provider    CloudProvider @default(AWS)
  azure_credential  AzureCredential? @relation("AzureSecurityScans", fields: [azure_credential_id], references: [id])
  azure_credential_id String?     @db.Uuid
}

// Update ResourceInventory to support multi-cloud
model ResourceInventory {
  // ... existing fields ...
  cloud_provider    CloudProvider @default(AWS)
  azure_credential_id String?     @db.Uuid
}
```

### Azure Service Mapping

| AWS Service | Azure Equivalent | API/SDK |
|-------------|------------------|---------|
| IAM | Azure AD / RBAC | @azure/arm-authorization |
| EC2 | Virtual Machines | @azure/arm-compute |
| S3 | Blob Storage | @azure/storage-blob |
| RDS | Azure SQL / CosmosDB | @azure/arm-sql |
| Lambda | Azure Functions | @azure/arm-appservice |
| CloudWatch | Azure Monitor | @azure/arm-monitor |
| CloudTrail | Activity Log | @azure/arm-monitor |
| Security Hub | Defender for Cloud | @azure/arm-security |
| Cost Explorer | Cost Management | @azure/arm-costmanagement |
| WAF | Azure WAF / Front Door | @azure/arm-frontdoor |
| KMS | Key Vault | @azure/keyvault-keys |
| VPC | Virtual Network | @azure/arm-network |
| Config | Azure Policy | @azure/arm-policy |



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Azure Credential Validation

*For any* Azure credential object submitted for creation, if any of the required fields (tenant_id, client_id, client_secret, subscription_id) is missing or empty, the system SHALL reject the credential and return a validation error. Conversely, if all required fields are present and the Azure Management API confirms validity, the credential SHALL be stored with the secret encrypted.

**Validates: Requirements 1.3, 2.3, 2.4, 2.6**

### Property 2: Multi-Tenancy Isolation

*For any* credential query operation and any organization_id, the results SHALL contain only credentials where credential.organization_id equals the requesting organization_id. No credential from a different organization SHALL ever be returned.

**Validates: Requirements 1.6**

### Property 3: Multiple Subscriptions Support

*For any* organization, the system SHALL allow storing multiple Azure credentials with different subscription_ids. When listing credentials, all active subscriptions for that organization SHALL be returned.

**Validates: Requirements 2.7**

### Property 4: Provider Routing Correctness

*For any* cloud operation request with a credential, the system SHALL correctly identify the provider type (AWS or AZURE) and route the request to the corresponding provider implementation. If credential has tenant_id and client_id, it SHALL route to AzureProvider. If credential has access_key_id or role_arn, it SHALL route to AWSProvider.

**Validates: Requirements 3.2, 8.4, 8.5**

### Property 5: Account Selection Persistence

*For any* account selection action, the selected account ID and provider type SHALL be persisted to localStorage. When the application reloads, the previously selected account SHALL be restored. When switching providers, all dashboard components SHALL update to show data from the new provider.

**Validates: Requirements 3.3, 3.4**

### Property 6: Azure Findings Consistency

*For any* Azure security finding stored in the database, the cloud_provider field SHALL be 'AZURE', the severity SHALL be one of (critical, high, medium, low, info), and the remediation field SHALL contain Azure-specific guidance (not AWS-specific).

**Validates: Requirements 4.3, 4.5, 4.6**

### Property 7: Azure Cost Data Consistency

*For any* Azure cost record stored in the database, the cloud_provider field SHALL be 'AZURE'. The system SHALL support fetching costs with daily, weekly, or monthly granularity. Cost breakdown SHALL be available by service, resource_group, and subscription.

**Validates: Requirements 5.2, 5.3, 5.5, 5.6**

### Property 8: Azure Resource Inventory Consistency

*For any* Azure resource stored in the resource_inventory table, the cloud_provider field SHALL be 'AZURE'. The system SHALL support filtering by provider, region, and resource_type, and each filter SHALL correctly reduce the result set.

**Validates: Requirements 6.2, 6.4**

### Property 9: Azure Activity Analysis

*For any* Azure activity event fetched and stored, the system SHALL analyze it for security relevance and assign a risk_level from (critical, high, medium, low). If the event is classified as suspicious, an alert SHALL be generated following the same pattern as AWS alerts.

**Validates: Requirements 7.2, 7.3, 7.4, 7.5**

### Property 10: Multi-Cloud Aggregation

*For any* dashboard aggregation query, the results SHALL include data from all connected cloud accounts (both AWS and Azure). When filtering by provider, only data from that provider SHALL be included. When generating reports, data from all providers SHALL be included unless explicitly filtered.

**Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.6**

### Property 11: AWS Backward Compatibility

*For any* existing AWS operation (credential listing, security scan, cost fetch, etc.), the behavior SHALL remain unchanged after Azure support is added. If no Azure credentials exist, the system SHALL behave exactly as before. If an error occurs in Azure-specific code, it SHALL NOT affect AWS functionality. All existing AWS API endpoints SHALL continue to work without modification.

**Validates: Requirements 11.2, 11.3, 11.4, 11.5, 11.6**

## Error Handling

### Credential Validation Errors

| Error Scenario | Error Code | User Message |
|---------------|------------|--------------|
| Missing tenant_id | AZURE_MISSING_TENANT | "Azure Tenant ID is required" |
| Missing client_id | AZURE_MISSING_CLIENT | "Azure Client ID (App ID) is required" |
| Missing client_secret | AZURE_MISSING_SECRET | "Azure Client Secret is required" |
| Missing subscription_id | AZURE_MISSING_SUBSCRIPTION | "Azure Subscription ID is required" |
| Invalid credentials | AZURE_AUTH_FAILED | "Failed to authenticate with Azure. Please verify your credentials." |
| Insufficient permissions | AZURE_PERMISSION_DENIED | "The Service Principal lacks required permissions. Please check the role assignments." |
| Subscription not found | AZURE_SUBSCRIPTION_NOT_FOUND | "The specified subscription was not found or is not accessible." |

### API Error Handling

```typescript
// backend/src/lib/azure-helpers.ts

export class AzureError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AzureError';
  }
}

export function handleAzureError(error: any): AzureError {
  // Azure SDK errors have specific structure
  if (error.code === 'AuthenticationError') {
    return new AzureError(
      'Failed to authenticate with Azure',
      'AZURE_AUTH_FAILED',
      401,
      { originalError: error.message }
    );
  }
  
  if (error.statusCode === 403) {
    return new AzureError(
      'Insufficient permissions to perform this operation',
      'AZURE_PERMISSION_DENIED',
      403,
      { originalError: error.message }
    );
  }
  
  if (error.code === 'SubscriptionNotFound') {
    return new AzureError(
      'Subscription not found or not accessible',
      'AZURE_SUBSCRIPTION_NOT_FOUND',
      404,
      { originalError: error.message }
    );
  }
  
  // Generic Azure error
  return new AzureError(
    error.message || 'An Azure API error occurred',
    'AZURE_API_ERROR',
    error.statusCode || 500,
    { originalError: error }
  );
}
```

### Isolation of Azure Errors

To ensure Azure errors don't affect AWS functionality:

```typescript
// backend/src/lib/cloud-provider/factory.ts

export async function executeWithProviderIsolation<T>(
  provider: ICloudProvider,
  operation: () => Promise<T>,
  fallbackValue?: T
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.error(`Error in ${provider.providerType} operation`, {
      provider: provider.providerType,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    // If this is an Azure error, don't let it propagate to AWS code
    if (provider.providerType === 'AZURE' && fallbackValue !== undefined) {
      return fallbackValue;
    }
    
    throw error;
  }
}
```

## Testing Strategy

### Unit Tests

Unit tests will verify specific examples and edge cases:

1. **Credential Validation Tests**
   - Test validation with all fields present
   - Test validation with each required field missing
   - Test validation with invalid format values

2. **Provider Factory Tests**
   - Test factory returns AWSProvider for AWS credentials
   - Test factory returns AzureProvider for Azure credentials
   - Test factory throws for unknown provider type

3. **Data Model Tests**
   - Test CloudProvider enum values
   - Test AzureCredential model creation
   - Test Finding with cloud_provider field

### Property-Based Tests

Property-based tests will verify universal properties across all inputs using a PBT library (fast-check for TypeScript):

1. **Property 1 Test**: Generate random Azure credential objects with various combinations of missing fields. Verify validation correctly accepts/rejects.

2. **Property 2 Test**: Generate random organization IDs and credentials. Verify queries never return credentials from other organizations.

3. **Property 4 Test**: Generate random credentials with AWS or Azure fields. Verify factory always returns correct provider type.

4. **Property 6 Test**: Generate random Azure findings. Verify all have cloud_provider='AZURE' and valid severity.

5. **Property 11 Test**: Execute AWS operations before and after Azure code is added. Verify behavior is identical.

### Integration Tests

1. **Azure API Integration**
   - Test credential validation against Azure sandbox
   - Test resource listing with real Azure subscription
   - Test cost fetching with Azure Cost Management API

2. **Multi-Cloud Dashboard**
   - Test dashboard with only AWS accounts
   - Test dashboard with only Azure accounts
   - Test dashboard with both AWS and Azure accounts

### Test Configuration

```typescript
// vitest.config.ts additions

export default defineConfig({
  test: {
    // ... existing config
    testTimeout: 30000, // Azure API calls may be slower
    hookTimeout: 30000,
  },
});
```

### Property Test Example

```typescript
// backend/src/lib/cloud-provider/__tests__/factory.property.test.ts

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { CloudProviderFactory } from '../factory';

describe('CloudProviderFactory - Property Tests', () => {
  /**
   * Feature: multi-cloud-azure-support
   * Property 4: Provider Routing Correctness
   * Validates: Requirements 3.2, 8.4, 8.5
   */
  it('should always route to correct provider based on credential type', () => {
    // Arbitrary for AWS credentials
    const awsCredentialArb = fc.record({
      access_key_id: fc.string({ minLength: 16, maxLength: 20 }),
      secret_access_key: fc.string({ minLength: 32, maxLength: 40 }),
      role_arn: fc.option(fc.string()),
    });
    
    // Arbitrary for Azure credentials
    const azureCredentialArb = fc.record({
      tenant_id: fc.uuid(),
      client_id: fc.uuid(),
      client_secret: fc.string({ minLength: 32 }),
      subscription_id: fc.uuid(),
    });
    
    fc.assert(
      fc.property(awsCredentialArb, (cred) => {
        const provider = CloudProviderFactory.detectProviderFromCredential(cred);
        expect(provider).toBe('AWS');
      }),
      { numRuns: 100 }
    );
    
    fc.assert(
      fc.property(azureCredentialArb, (cred) => {
        const provider = CloudProviderFactory.detectProviderFromCredential(cred);
        expect(provider).toBe('AZURE');
      }),
      { numRuns: 100 }
    );
  });
});
```

## Security Considerations

### Credential Storage

1. **Encryption at Rest**: Azure client_secret MUST be encrypted using AWS KMS before storage
2. **No Logging of Secrets**: Never log tenant_id, client_id, or client_secret values
3. **Secure Transmission**: All API calls to Azure MUST use HTTPS

### Permission Model

The ARM Template for Quick Connect SHALL request only these permissions:

```json
{
  "permissions": [
    {
      "actions": [
        "Microsoft.Resources/subscriptions/read",
        "Microsoft.Resources/subscriptions/resourceGroups/read",
        "Microsoft.Compute/virtualMachines/read",
        "Microsoft.Storage/storageAccounts/read",
        "Microsoft.Sql/servers/read",
        "Microsoft.KeyVault/vaults/read",
        "Microsoft.Network/networkSecurityGroups/read",
        "Microsoft.CostManagement/query/action",
        "Microsoft.Security/assessments/read",
        "Microsoft.Insights/eventtypes/values/read"
      ],
      "notActions": [],
      "dataActions": [],
      "notDataActions": []
    }
  ]
}
```

### Multi-Tenancy Isolation

- All database queries MUST include organization_id filter
- Azure credentials MUST be scoped to organization
- Cross-organization access MUST be prevented at API level

