# Multi-Cloud Architecture

## Overview

The EVO platform supports multiple cloud providers (AWS and Azure) through a unified architecture that abstracts provider-specific implementations while maintaining full access to each provider's capabilities.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
├─────────────────────────────────────────────────────────────────┤
│  CloudAccountContext                                             │
│  ├── accounts: CloudAccount[]                                    │
│  ├── awsAccounts: CloudAccount[]                                 │
│  ├── azureAccounts: CloudAccount[]                               │
│  ├── selectedAccount: CloudAccount                               │
│  └── selectedProvider: 'AWS' | 'AZURE'                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Gateway (REST)                            │
├─────────────────────────────────────────────────────────────────┤
│  Unified Endpoints:                                              │
│  ├── /api/functions/list-cloud-credentials                       │
│  ├── /api/functions/security-scan (provider-aware)               │
│  └── /api/functions/fetch-daily-costs (provider-aware)           │
│                                                                  │
│  Provider-Specific Endpoints:                                    │
│  ├── AWS: /api/functions/list-aws-credentials                    │
│  ├── AWS: /api/functions/validate-aws-credentials                │
│  ├── Azure: /api/functions/list-azure-credentials                │
│  ├── Azure: /api/functions/azure-oauth-initiate                  │
│  └── Azure: /api/functions/azure-security-scan                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Lambda Functions                              │
├─────────────────────────────────────────────────────────────────┤
│  Cloud Provider Abstraction Layer:                               │
│  ├── lib/cloud-provider/aws-provider.ts                          │
│  ├── lib/cloud-provider/azure-provider.ts                        │
│  └── lib/cloud-provider/index.ts (factory)                       │
│                                                                  │
│  Security Engine:                                                │
│  ├── lib/security-engine/scanners/aws/                           │
│  └── lib/security-engine/scanners/azure/                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Data Layer (PostgreSQL)                       │
├─────────────────────────────────────────────────────────────────┤
│  Credentials:                                                    │
│  ├── aws_credentials (IAM Role-based)                            │
│  └── azure_credentials (OAuth or Service Principal)              │
│                                                                  │
│  Scan Results:                                                   │
│  ├── security_findings (provider-agnostic)                       │
│  └── compliance_results (provider-agnostic)                      │
│                                                                  │
│  Cost Data:                                                      │
│  ├── daily_costs (aws_account_id OR azure_credential_id)         │
│  └── cost_forecasts (provider-aware)                             │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. CloudAccountContext (Frontend)

Unified context for managing cloud accounts across providers.

```typescript
interface CloudAccount {
  id: string;
  provider: 'AWS' | 'AZURE';
  accountName: string;
  accountId: string | null;
  regions: string[];
  isActive: boolean;
  // Provider-specific
  tenantId?: string;         // Azure
  subscriptionName?: string; // Azure
  roleArn?: string;          // AWS
}
```

**Usage**:
```typescript
const { 
  accounts,           // All accounts
  awsAccounts,        // AWS only
  azureAccounts,      // Azure only
  selectedAccount,    // Currently selected
  selectedProvider,   // 'AWS' | 'AZURE'
  setSelectedAccountId,
} = useCloudAccount();
```

### 2. Cloud Provider Abstraction

Backend abstraction layer for provider-specific operations.

```typescript
// Factory function
function getCloudProvider(provider: 'AWS' | 'AZURE', credentials: any) {
  switch (provider) {
    case 'AWS':
      return new AwsProvider(credentials);
    case 'AZURE':
      return new AzureProvider(credentials);
  }
}

// Common interface
interface CloudProvider {
  validateCredentials(): Promise<ValidationResult>;
  listResources(resourceType: string): Promise<Resource[]>;
  getSecurityFindings(): Promise<Finding[]>;
  getCosts(startDate: Date, endDate: Date): Promise<CostData>;
}
```

### 3. Database Schema

Provider-agnostic schema with provider-specific foreign keys.

```prisma
model SecurityFinding {
  id                   String   @id @default(uuid())
  organization_id      String
  // Provider-specific (one will be set)
  aws_account_id       String?
  azure_credential_id  String?
  // Common fields
  severity             String
  title                String
  description          String
  resource_type        String
  resource_id          String
  remediation          String?
  created_at           DateTime @default(now())
}
```

### 4. API Parameter Handling

Handlers accept both AWS and Azure account identifiers.

```typescript
// Query with provider-aware filter
const findings = await prisma.securityFinding.findMany({
  where: {
    organization_id: organizationId,
    OR: [
      { aws_account_id: accountId },
      { azure_credential_id: accountId },
    ],
  },
});
```

## Authentication Methods

### AWS

1. **IAM Role (Recommended)**
   - CloudFormation deploys cross-account role
   - EVO assumes role using STS
   - No credentials stored

2. **Access Keys (Legacy)**
   - Encrypted at rest
   - Being phased out

### Azure

1. **OAuth 2.0 + PKCE (Recommended)**
   - 1-click connection
   - User authorizes via Azure AD
   - Refresh tokens encrypted at rest

2. **Service Principal (Alternative)**
   - Manual setup required
   - Client ID + Secret stored encrypted

## Security Scanners

### AWS Scanners (39 total)

| Category | Scanners |
|----------|----------|
| IAM | Users, Roles, Policies, MFA, Access Keys |
| Compute | EC2, Lambda, ECS, EKS |
| Storage | S3, EBS, EFS |
| Database | RDS, DynamoDB, ElastiCache |
| Network | VPC, Security Groups, NACLs |
| Security | GuardDuty, SecurityHub, KMS |

### Azure Scanners (5 implemented, more planned)

| Category | Scanners |
|----------|----------|
| Identity | Azure AD, RBAC |
| Compute | Virtual Machines (planned) |
| Storage | Storage Accounts (planned) |
| Security | Defender for Cloud |
| Network | NSGs, VNets (planned) |

## Adding New Provider Support

### 1. Create Provider Class

```typescript
// lib/cloud-provider/gcp-provider.ts
export class GcpProvider implements CloudProvider {
  constructor(private credentials: GcpCredentials) {}
  
  async validateCredentials(): Promise<ValidationResult> {
    // Implementation
  }
  
  async listResources(type: string): Promise<Resource[]> {
    // Implementation
  }
}
```

### 2. Update Database Schema

```prisma
model GcpCredential {
  id              String   @id @default(uuid())
  organization_id String
  project_id      String
  // ... other fields
}
```

### 3. Create API Handlers

```typescript
// handlers/gcp/list-gcp-credentials.ts
// handlers/gcp/validate-gcp-credentials.ts
// handlers/gcp/gcp-security-scan.ts
```

### 4. Update Frontend Context

```typescript
// Add to CloudAccountContext
export type CloudProvider = 'AWS' | 'AZURE' | 'GCP';

// Add gcpAccounts to context
const gcpAccounts = accounts.filter(a => a.provider === 'GCP');
```

## Best Practices

### 1. Use Unified Context

```typescript
// ✅ Good - uses unified context
const { selectedAccount, selectedProvider } = useCloudAccount();

// ❌ Avoid - provider-specific context
const { selectedAccount } = useAwsAccount();
```

### 2. Provider-Aware Queries

```typescript
// ✅ Good - handles both providers
const filter = selectedProvider === 'AZURE' 
  ? { azure_credential_id: accountId }
  : { aws_account_id: accountId };

// ❌ Avoid - AWS-only
const filter = { aws_account_id: accountId };
```

### 3. Graceful Degradation

```typescript
// ✅ Good - handles missing features
if (selectedProvider === 'AZURE' && !isFeatureSupported('costForecast')) {
  return <ComingSoonBanner feature="Cost Forecast" />;
}
```

## Related Documentation

- [Azure OAuth Setup](./AZURE_OAUTH_SETUP.md)
- [Adding Azure Scanners](./ADDING_AZURE_SCANNER.md)
- [Lambda Functions Reference](../.kiro/steering/lambda-functions-reference.md)

---

## Pending Tasks

### High Priority

- [x] **Azure Monitor Integration** - Create `azure-fetch-monitor-metrics` Lambda to fetch metrics from Azure Monitor API.
  - ✅ Created handler: `backend/src/handlers/azure/azure-fetch-monitor-metrics.ts`
  - ✅ Uses Azure Monitor REST API
  - ✅ Metrics fetched: CPU, Memory, Disk, Network for VMs, App Services, SQL DBs, Storage Accounts
  - ✅ Frontend updated: `src/components/dashboard/ResourceMonitoringDashboard.tsx` now detects provider and calls appropriate Lambda
  - ✅ API Gateway endpoint created: `/api/functions/azure-fetch-monitor-metrics`

### Medium Priority

- [x] **Azure Activity Logs Dashboard** - Create frontend component to display Azure Activity Logs (Lambda already exists: `azure-activity-logs`)
  - ✅ Created component: `src/components/dashboard/AzureActivityLogs.tsx`
  - ✅ Integrated into CloudTrailAudit page when Azure provider is selected
- [x] **Azure Compliance Scan UI** - Add Azure compliance frameworks (CIS Azure Benchmark, Azure Security Benchmark)
  - ✅ Already implemented in ComplianceFrameworks.tsx
- [x] **Unified Cost Dashboard** - Merge AWS and Azure cost data in a single view
  - ✅ Created component: `src/components/dashboard/UnifiedCostDashboard.tsx`
- [x] **Azure Anomaly Detection** - Create `azure-detect-anomalies` Lambda for Azure cost/usage anomaly detection
  - ✅ Created handler: `backend/src/handlers/azure/azure-detect-anomalies.ts`
  - ✅ API Gateway endpoint: `/api/functions/azure-detect-anomalies` (Resource ID: `cd7gtb`)
  - ✅ Frontend updated: `src/components/dashboard/AnomalyDashboard.tsx` now supports multi-cloud

### Low Priority

- [ ] **GCP Support** - Add Google Cloud Platform as third provider
- [x] **Multi-Cloud Cost Comparison** - Compare costs across providers for similar workloads
  - ✅ Implemented in `src/components/dashboard/UnifiedCostDashboard.tsx`
  - ✅ Shows daily costs comparison chart (AWS vs Azure stacked bar)
  - ✅ Shows distribution pie chart by provider
  - ✅ Shows top 5 services per provider
  - ✅ Calculates trends and averages per provider

---

## Multi-Cloud Frontend Status

### Pages with Full Multi-Cloud Support ✅

| Page/Component | AWS Lambda | Azure Lambda | Status |
|----------------|------------|--------------|--------|
| CostAnalysisPage | `fetch-daily-costs` | `azure-fetch-costs` | ✅ Complete |
| MonthlyInvoicesPage | `fetch-daily-costs` | `azure-fetch-costs` | ✅ Complete |
| SecurityScans | `start-security-scan` | `start-azure-security-scan` | ✅ Complete |
| CostOptimization | `cost-optimization` | `azure-cost-optimization` | ✅ Complete |
| WellArchitected | `well-architected-scan` | `azure-well-architected-scan` | ✅ Complete |
| RiSpAnalysis | `ri-sp-analyzer` | `azure-reservations-analyzer` | ✅ Complete |
| RISPOptimizer | `ri-sp-analyzer` | `azure-reservations-analyzer` | ✅ Complete |
| CostOverview | `fetch-daily-costs` | `azure-fetch-costs` | ✅ Complete |
| SecurityScan | `security-scan` | `azure-security-scan` | ✅ Complete |
| SecurityAnalysisContent | `security-scan` | `azure-security-scan` | ✅ Complete |
| ResourceMonitoringDashboard | `fetch-cloudwatch-metrics` | `azure-fetch-monitor-metrics` | ✅ Complete |
| ComplianceFrameworks | `compliance-scan` | `azure-compliance-scan` | ✅ Complete |
| ThreatDetection | `guardduty-scan` | N/A (shows Azure notice) | ✅ Complete |
| CloudTrailAudit | `start-cloudtrail-analysis` | `azure-activity-logs` | ✅ Complete |
| AnomalyDetection | `detect-anomalies` | `azure-detect-anomalies` | ✅ Complete |

### AWS-Only Features (No Azure Equivalent)

| Feature | Page/Component | Reason |
|---------|----------------|--------|
| WAF Monitoring | WafMonitoring.tsx | AWS WAF specific |
| GuardDuty | ThreatDetection.tsx | AWS GuardDuty specific (shows Azure notice) |
| ML Waste Detection | MLWasteDetection.tsx | AWS-specific ML analysis |
| Edge Monitoring | EdgeMonitoring.tsx | CloudFront specific |


---

## Changelog

### 2026-01-13 - Multi-Cloud Pending Tasks Complete

#### New Lambda Created
- **`azure-detect-anomalies`** - Detects anomalies in Azure cost, performance, and security metrics
  - Handler: `backend/src/handlers/azure/azure-detect-anomalies.ts`
  - API Gateway endpoint: `/api/functions/azure-detect-anomalies`
  - Resource ID: `cd7gtb`

#### Frontend Updates
- **AnomalyDashboard.tsx** - Added multi-cloud support, now calls `azure-detect-anomalies` when Azure provider is selected
- **AnomalyDetection.tsx** - Updated to show provider-specific description
- **CloudTrailAudit.tsx** - Already updated to show Azure Activity Logs when Azure provider is selected
- **AzureActivityLogs.tsx** - New component for displaying Azure Activity Logs
- **UnifiedCostDashboard.tsx** - New component for unified AWS + Azure cost view

#### Documentation Updates
- Updated `lambda-functions-reference.md` with new `azure-detect-anomalies` Lambda
- Updated `api-gateway-endpoints.md` with new endpoint
- Updated `MULTI_CLOUD_ARCHITECTURE.md` - marked all medium priority tasks as complete

#### Deployment
- Frontend built and deployed to S3
- CloudFront invalidation: `IDAUEHA2HVVD6SY0UP762SG3Q`
- API Gateway deployed to `prod` stage

### 2026-01-13 - Multi-Cloud Implementation Complete

#### New Lambda Created
- **`azure-fetch-monitor-metrics`** - Fetches metrics from Azure Monitor API for VMs, App Services, SQL DBs, and Storage Accounts
  - Handler: `backend/src/handlers/azure/azure-fetch-monitor-metrics.ts`
  - API Gateway endpoint: `/api/functions/azure-fetch-monitor-metrics`
  - Resource ID: `wn1yqu`

#### Frontend Updates
- **ComplianceFrameworks.tsx** - Added multi-cloud support with provider-specific frameworks (AWS: CIS AWS, LGPD, GDPR, HIPAA, PCI-DSS; Azure: CIS Azure, Azure Security Benchmark, LGPD, GDPR, PCI-DSS)
- **ThreatDetection.tsx** - Added Azure notice since GuardDuty is AWS-specific, recommends Microsoft Defender for Cloud for Azure

#### Documentation Updates
- Updated `lambda-functions-reference.md` with new `azure-fetch-monitor-metrics` Lambda
- Updated `api-gateway-endpoints.md` with new endpoint
- Updated `MULTI_CLOUD_ARCHITECTURE.md` with complete status table

#### Deployment
- Frontend built and deployed to S3
- CloudFront invalidation: `IYB9NCV6UP01NTQ9PPTIS24P0`
- API Gateway deployed to `prod` stage

---

**Last Updated:** 2026-01-13
**Version:** 2.1
