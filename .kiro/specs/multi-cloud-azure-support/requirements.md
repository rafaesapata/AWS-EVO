# Requirements Document

## Introduction

Este documento define os requisitos para adicionar suporte ao Microsoft Azure na plataforma EVO, permitindo que usuários conectem e gerenciem contas Azure com as mesmas funcionalidades disponíveis para AWS. A implementação deve ser feita de forma incremental, sem risco de quebrar as funcionalidades AWS existentes, usando uma arquitetura de abstração por camadas que permita futura expansão para outros provedores cloud (GCP).

## Glossary

- **Cloud_Provider**: Enum que identifica o provedor de nuvem (AWS, AZURE, GCP)
- **Cloud_Credential**: Credencial genérica que pode ser AWS ou Azure
- **Azure_Credential**: Credencial específica do Azure contendo tenant_id, client_id, client_secret e subscription_id
- **Service_Principal**: Identidade de aplicação no Azure AD usada para autenticação programática
- **Subscription**: Unidade de faturamento e gerenciamento de recursos no Azure (equivalente a AWS Account)
- **Tenant**: Instância do Azure Active Directory que representa uma organização
- **ARM_Template**: Azure Resource Manager Template (equivalente ao CloudFormation)
- **Provider_Abstraction_Layer**: Camada de abstração que unifica operações entre diferentes provedores cloud
- **Cloud_Account_Context**: Contexto React que gerencia seleção de contas cloud (substitui AwsAccountContext)

## Requirements

### Requirement 1: Modelo de Dados Multi-Cloud

**User Story:** As a platform developer, I want a unified data model for cloud credentials, so that I can support multiple cloud providers without duplicating code.

#### Acceptance Criteria

1. THE Database_Schema SHALL include a `cloud_provider` enum with values AWS, AZURE, and GCP
2. THE Database_Schema SHALL include an `azure_credentials` table with fields for tenant_id, client_id, client_secret, subscription_id, and subscription_name
3. WHEN a new Azure credential is created, THE System SHALL validate that all required Azure fields are present (tenant_id, client_id, client_secret, subscription_id)
4. THE System SHALL maintain backward compatibility with existing `aws_credentials` table
5. THE Database_Schema SHALL include a `cloud_provider` field in tables that reference credentials (findings, daily_costs, security_scans)
6. WHEN querying credentials, THE System SHALL filter by organization_id to maintain multi-tenancy isolation

### Requirement 2: Azure Credential Management

**User Story:** As a user, I want to connect my Azure subscription to the platform, so that I can monitor and analyze my Azure resources.

#### Acceptance Criteria

1. WHEN a user accesses the credentials page, THE System SHALL display options to add AWS or Azure credentials
2. THE System SHALL provide a form to input Azure Service Principal credentials (tenant_id, client_id, client_secret, subscription_id)
3. WHEN Azure credentials are submitted, THE System SHALL validate them by calling Azure Management API
4. IF Azure credential validation fails, THEN THE System SHALL display a descriptive error message
5. THE System SHALL provide an ARM Template for Quick Connect (equivalent to AWS CloudFormation)
6. WHEN credentials are validated successfully, THE System SHALL store them encrypted in the database
7. THE System SHALL support multiple Azure subscriptions per organization

### Requirement 3: Cloud Account Selection

**User Story:** As a user, I want to switch between my AWS and Azure accounts, so that I can view data from different cloud providers.

#### Acceptance Criteria

1. THE Frontend SHALL display a unified account selector showing both AWS and Azure accounts
2. WHEN a user selects an account, THE System SHALL identify the cloud provider and route requests accordingly
3. THE System SHALL persist the selected account in localStorage for session continuity
4. WHEN switching between providers, THE System SHALL update all dashboard components to show provider-specific data
5. THE System SHALL display a visual indicator (icon/badge) showing the current provider type
6. WHEN no accounts are configured, THE System SHALL prompt the user to add credentials

### Requirement 4: Azure Security Scanning

**User Story:** As a security analyst, I want to scan my Azure resources for security issues, so that I can identify and remediate vulnerabilities.

#### Acceptance Criteria

1. THE System SHALL implement security scanners for Azure services: VMs, Storage Accounts, SQL Databases, Key Vaults, Network Security Groups, Azure AD
2. WHEN a security scan is initiated for Azure, THE System SHALL use Azure Resource Graph and Azure Security Center APIs
3. THE System SHALL map Azure security findings to the same severity levels used for AWS (critical, high, medium, low)
4. THE System SHALL support compliance frameworks for Azure: CIS Azure Benchmark, Azure Security Benchmark, PCI-DSS, SOC2
5. WHEN findings are detected, THE System SHALL store them in the unified findings table with cloud_provider = AZURE
6. THE System SHALL provide Azure-specific remediation recommendations

### Requirement 5: Azure Cost Analysis

**User Story:** As a finance manager, I want to analyze my Azure spending, so that I can optimize costs and budget effectively.

#### Acceptance Criteria

1. THE System SHALL fetch cost data from Azure Cost Management API
2. WHEN fetching costs, THE System SHALL support daily, weekly, and monthly granularity
3. THE System SHALL store Azure costs in the daily_costs table with cloud_provider = AZURE
4. THE System SHALL display Azure costs in the same dashboard format as AWS costs
5. THE System SHALL support cost breakdown by Azure service, resource group, and subscription
6. WHEN displaying cost trends, THE System SHALL allow filtering by provider or showing combined view

### Requirement 6: Azure Resource Inventory

**User Story:** As an operations engineer, I want to see all my Azure resources, so that I can manage and track my infrastructure.

#### Acceptance Criteria

1. THE System SHALL discover and inventory Azure resources: VMs, Storage Accounts, SQL Databases, App Services, Functions, Virtual Networks
2. WHEN resources are discovered, THE System SHALL store them in the resource_inventory table with cloud_provider = AZURE
3. THE System SHALL display Azure resources in the same inventory view as AWS resources
4. THE System SHALL support filtering resources by provider, region, and resource type
5. WHEN a resource is selected, THE System SHALL display provider-specific details and metadata

### Requirement 7: Azure Activity Monitoring

**User Story:** As a security analyst, I want to monitor Azure activity logs, so that I can detect suspicious behavior and audit changes.

#### Acceptance Criteria

1. THE System SHALL fetch activity logs from Azure Activity Log API
2. WHEN activity events are fetched, THE System SHALL analyze them for security relevance
3. THE System SHALL map Azure activity events to the same risk levels used for CloudTrail (critical, high, medium, low)
4. THE System SHALL store Azure activity events in a unified audit table
5. WHEN suspicious activity is detected, THE System SHALL generate alerts following the same pattern as AWS

### Requirement 8: Provider Abstraction Layer

**User Story:** As a platform developer, I want a unified interface for cloud operations, so that I can add new features without duplicating code for each provider.

#### Acceptance Criteria

1. THE System SHALL implement an ICloudProvider interface with methods: validateCredentials, listResources, getCosts, runSecurityScan
2. THE System SHALL implement AWSProvider class that wraps existing AWS functionality
3. THE System SHALL implement AzureProvider class with equivalent Azure functionality
4. WHEN a cloud operation is requested, THE System SHALL use CloudProviderFactory to instantiate the correct provider
5. THE System SHALL route requests based on the cloud_provider field of the selected credential
6. THE System SHALL maintain separate handler files for AWS and Azure to avoid code coupling

### Requirement 9: Azure Quick Connect

**User Story:** As a user, I want a simple way to connect my Azure subscription, so that I can get started quickly without manual configuration.

#### Acceptance Criteria

1. THE System SHALL provide an ARM Template that creates a Service Principal with required permissions
2. THE ARM_Template SHALL request only minimum necessary permissions for security scanning, cost analysis, and resource inventory
3. WHEN the ARM Template is deployed, THE System SHALL receive the Service Principal credentials via callback
4. THE System SHALL provide step-by-step instructions for Azure Quick Connect
5. THE System SHALL validate the connection immediately after Quick Connect completion

### Requirement 10: Dashboard Integration

**User Story:** As a user, I want to see a unified dashboard with data from all my cloud accounts, so that I can get a holistic view of my infrastructure.

#### Acceptance Criteria

1. THE Executive_Dashboard SHALL display aggregated metrics from both AWS and Azure accounts
2. WHEN displaying security posture, THE System SHALL combine findings from all providers
3. WHEN displaying costs, THE System SHALL show combined spending with provider breakdown
4. THE System SHALL allow filtering dashboard by specific provider or account
5. THE System SHALL display provider-specific widgets when a single account is selected
6. WHEN generating reports, THE System SHALL include data from all connected cloud accounts

### Requirement 11: Backward Compatibility

**User Story:** As an existing user, I want my AWS integrations to continue working unchanged, so that I don't experience any disruption.

#### Acceptance Criteria

1. THE System SHALL NOT modify existing aws_credentials table structure
2. THE System SHALL NOT change existing AWS handler behavior
3. WHEN no Azure credentials exist, THE System SHALL behave exactly as before
4. THE System SHALL maintain all existing API endpoints for AWS operations
5. THE System SHALL NOT require migration of existing AWS credentials
6. IF an error occurs in Azure code, THEN THE System SHALL NOT affect AWS functionality

