/**
 * Azure Provider Implementation
 * 
 * Implements ICloudProvider interface for Microsoft Azure.
 * Uses Azure SDK for JavaScript to interact with Azure services.
 */

import type {
  ICloudProvider,
  CloudProviderType,
  AzureCredentialFields,
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
} from '../../types/cloud.js';
import { CloudProviderError } from '../../types/cloud.js';
import { logger } from '../logging.js';

// Azure SDK imports - these will be installed in the next step
// For now, we'll use dynamic imports to handle missing packages gracefully

/**
 * Azure Provider
 * 
 * Implements the ICloudProvider interface for Azure.
 * Uses Service Principal authentication with client credentials.
 */
export class AzureProvider implements ICloudProvider {
  readonly providerType: CloudProviderType = 'AZURE';
  
  private _organizationId: string;
  private credentials: AzureCredentialFields;
  private tokenCredential: any = null;

  constructor(organizationId: string, credentials: AzureCredentialFields) {
    this._organizationId = organizationId;
    this.credentials = credentials;
  }

  /**
   * Get Azure token credential for SDK clients
   */
  private async getTokenCredential(): Promise<any> {
    if (this.tokenCredential) {
      return this.tokenCredential;
    }

    try {
      // Dynamic import to handle missing package gracefully
      const { ClientSecretCredential } = await import('@azure/identity');
      
      this.tokenCredential = new ClientSecretCredential(
        this.credentials.tenantId,
        this.credentials.clientId,
        this.credentials.clientSecret
      );

      return this.tokenCredential;
    } catch (error: any) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND') {
        throw new CloudProviderError(
          'Azure SDK not installed. Run: npm install @azure/identity @azure/arm-resources @azure/arm-compute @azure/arm-storage @azure/arm-costmanagement',
          'AZURE',
          'SDK_NOT_INSTALLED',
          500
        );
      }
      throw error;
    }
  }

  /**
   * Validate Azure credentials by attempting to list resource groups
   */
  async validateCredentials(): Promise<ValidationResult> {
    try {
      const credential = await this.getTokenCredential();
      
      // Dynamic import
      const { ResourceManagementClient } = await import('@azure/arm-resources');
      
      const resourceClient = new ResourceManagementClient(
        credential,
        this.credentials.subscriptionId
      );

      // Try to list resource groups to validate credentials
      const resourceGroups: string[] = [];
      for await (const rg of resourceClient.resourceGroups.list()) {
        resourceGroups.push(rg.name || '');
        if (resourceGroups.length >= 5) break; // Just need to verify access
      }

      logger.info('Azure credentials validated', {
        subscriptionId: this.credentials.subscriptionId,
        resourceGroupsFound: resourceGroups.length,
      });

      return {
        valid: true,
        accountId: this.credentials.subscriptionId,
        accountName: this.credentials.subscriptionName || this.credentials.subscriptionId,
        details: {
          tenantId: this.credentials.tenantId,
          resourceGroups: resourceGroups.slice(0, 5),
        },
      };
    } catch (error: any) {
      logger.error('Azure credential validation failed', { error: error.message });
      
      // Parse Azure-specific errors
      let errorMessage = error.message || 'Failed to validate Azure credentials';
      
      if (error.statusCode === 401 || error.code === 'AuthenticationError') {
        errorMessage = 'Invalid Azure credentials. Please check tenant ID, client ID, and client secret.';
      } else if (error.statusCode === 403) {
        errorMessage = 'Access denied. The Service Principal may not have sufficient permissions.';
      } else if (error.code === 'SubscriptionNotFound') {
        errorMessage = 'Subscription not found. Please verify the subscription ID.';
      }

      return {
        valid: false,
        error: errorMessage,
        details: {
          code: error.code || error.statusCode,
          statusCode: error.statusCode,
        },
      };
    }
  }

  /**
   * List Azure resources across services
   */
  async listResources(resourceTypes?: string[]): Promise<Resource[]> {
    const resources: Resource[] = [];
    
    try {
      const credential = await this.getTokenCredential();
      
      const typesToFetch = resourceTypes || ['VirtualMachine', 'StorageAccount', 'VirtualNetwork', 'NetworkSecurityGroup', 'SqlServer'];

      // Virtual Machines
      if (typesToFetch.includes('VirtualMachine') || typesToFetch.includes('VM')) {
        try {
          const { ComputeManagementClient } = await import('@azure/arm-compute');
          const computeClient = new ComputeManagementClient(
            credential,
            this.credentials.subscriptionId
          );

          for await (const vm of computeClient.virtualMachines.listAll()) {
            resources.push({
              id: vm.id || '',
              provider: 'AZURE',
              type: 'VirtualMachine',
              name: vm.name || '',
              region: vm.location || '',
              tags: vm.tags,
              metadata: {
                vmSize: vm.hardwareProfile?.vmSize,
                osType: vm.storageProfile?.osDisk?.osType,
                provisioningState: vm.provisioningState,
              },
            });
          }
        } catch (error: any) {
          logger.warn('Failed to list Azure VMs', { error: error.message });
        }
      }

      // Storage Accounts
      if (typesToFetch.includes('StorageAccount') || typesToFetch.includes('Storage')) {
        try {
          const { StorageManagementClient } = await import('@azure/arm-storage');
          const storageClient = new StorageManagementClient(
            credential,
            this.credentials.subscriptionId
          );

          for await (const account of storageClient.storageAccounts.list()) {
            resources.push({
              id: account.id || '',
              provider: 'AZURE',
              type: 'StorageAccount',
              name: account.name || '',
              region: account.location || '',
              tags: account.tags,
              metadata: {
                kind: account.kind,
                sku: account.sku?.name,
                accessTier: account.accessTier,
                httpsOnly: account.enableHttpsTrafficOnly,
                minimumTlsVersion: account.minimumTlsVersion,
              },
            });
          }
        } catch (error: any) {
          logger.warn('Failed to list Azure Storage Accounts', { error: error.message });
        }
      }

      // Virtual Networks
      if (typesToFetch.includes('VirtualNetwork') || typesToFetch.includes('VNet')) {
        try {
          const { NetworkManagementClient } = await import('@azure/arm-network');
          const networkClient = new NetworkManagementClient(
            credential,
            this.credentials.subscriptionId
          );

          for await (const vnet of networkClient.virtualNetworks.listAll()) {
            resources.push({
              id: vnet.id || '',
              provider: 'AZURE',
              type: 'VirtualNetwork',
              name: vnet.name || '',
              region: vnet.location || '',
              tags: vnet.tags,
              metadata: {
                addressSpace: vnet.addressSpace?.addressPrefixes,
                subnetsCount: vnet.subnets?.length || 0,
                provisioningState: vnet.provisioningState,
              },
            });
          }
        } catch (error: any) {
          logger.warn('Failed to list Azure VNets', { error: error.message });
        }
      }

      // Network Security Groups
      if (typesToFetch.includes('NetworkSecurityGroup') || typesToFetch.includes('NSG')) {
        try {
          const { NetworkManagementClient } = await import('@azure/arm-network');
          const networkClient = new NetworkManagementClient(
            credential,
            this.credentials.subscriptionId
          );

          for await (const nsg of networkClient.networkSecurityGroups.listAll()) {
            resources.push({
              id: nsg.id || '',
              provider: 'AZURE',
              type: 'NetworkSecurityGroup',
              name: nsg.name || '',
              region: nsg.location || '',
              tags: nsg.tags,
              metadata: {
                securityRulesCount: nsg.securityRules?.length || 0,
                defaultSecurityRulesCount: nsg.defaultSecurityRules?.length || 0,
                provisioningState: nsg.provisioningState,
              },
            });
          }
        } catch (error: any) {
          logger.warn('Failed to list Azure NSGs', { error: error.message });
        }
      }

      // SQL Servers
      if (typesToFetch.includes('SqlServer') || typesToFetch.includes('SQL')) {
        try {
          const { SqlManagementClient } = await import('@azure/arm-sql');
          const sqlClient = new SqlManagementClient(
            credential,
            this.credentials.subscriptionId
          );

          for await (const server of sqlClient.servers.list()) {
            resources.push({
              id: server.id || '',
              provider: 'AZURE',
              type: 'SqlServer',
              name: server.name || '',
              region: server.location || '',
              tags: server.tags,
              metadata: {
                fullyQualifiedDomainName: server.fullyQualifiedDomainName,
                version: server.version,
                state: server.state,
                publicNetworkAccess: server.publicNetworkAccess,
              },
            });
          }
        } catch (error: any) {
          logger.warn('Failed to list Azure SQL Servers', { error: error.message });
        }
      }

      logger.info('Azure resources listed', { count: resources.length });
    } catch (error: any) {
      logger.error('Failed to list Azure resources', { error: error.message });
      throw new CloudProviderError(
        `Failed to list Azure resources: ${error.message}`,
        'AZURE',
        'RESOURCE_LIST_ERROR',
        500
      );
    }

    return resources;
  }

  /**
   * Get Azure cost data using Cost Management API
   */
  async getCosts(params: CostQueryParams): Promise<CostData[]> {
    const costs: CostData[] = [];

    try {
      const credential = await this.getTokenCredential();
      const { CostManagementClient } = await import('@azure/arm-costmanagement');
      
      const costClient = new CostManagementClient(credential);
      const scope = `/subscriptions/${this.credentials.subscriptionId}`;

      // Query cost data
      const query = await costClient.query.usage(scope, {
        type: 'ActualCost',
        timeframe: 'Custom',
        timePeriod: {
          from: new Date(params.startDate),
          to: new Date(params.endDate),
        },
        dataset: {
          granularity: params.granularity === 'MONTHLY' ? 'Monthly' : 'Daily',
          aggregation: {
            totalCost: {
              name: 'Cost',
              function: 'Sum',
            },
          },
          grouping: [
            {
              type: 'Dimension',
              name: 'ServiceName',
            },
          ],
        },
      });

      // Parse results
      if (query.rows) {
        for (const row of query.rows) {
          // Row format: [cost, serviceName, date, currency]
          const cost = parseFloat(row[0] as string) || 0;
          const service = row[1] as string || 'Unknown';
          const date = row[2] as string || params.startDate;
          const currency = row[3] as string || 'USD';

          costs.push({
            date,
            service,
            cost,
            currency,
            provider: 'AZURE',
            accountId: this.credentials.subscriptionId,
          });
        }
      }

      logger.info('Azure costs retrieved', {
        count: costs.length,
        startDate: params.startDate,
        endDate: params.endDate,
      });
    } catch (error: any) {
      logger.error('Failed to get Azure costs', { error: error.message });
      
      // Return empty array instead of throwing for cost retrieval failures
      // This allows the system to continue working even if cost data is unavailable
      if (error.statusCode === 403) {
        logger.warn('Cost Management API access denied - Service Principal may need Cost Management Reader role');
      }
    }

    return costs;
  }

  /**
   * Run security scan on Azure subscription
   */
  async runSecurityScan(_config: ScanConfig): Promise<ScanResult> {
    const startTime = Date.now();
    const findings: SecurityFinding[] = [];

    try {
      const credential = await this.getTokenCredential();

      // Scan Storage Accounts for security issues
      try {
        const { StorageManagementClient } = await import('@azure/arm-storage');
        const storageClient = new StorageManagementClient(
          credential,
          this.credentials.subscriptionId
        );

        for await (const account of storageClient.storageAccounts.list()) {
          // Check for HTTPS-only disabled
          if (!account.enableHttpsTrafficOnly) {
            findings.push({
              id: `${account.id}-https`,
              provider: 'AZURE',
              severity: 'high',
              title: 'Storage Account allows HTTP traffic',
              description: `Storage account ${account.name} does not enforce HTTPS-only traffic`,
              resourceId: account.id || '',
              resourceUri: account.id,
              service: 'Storage',
              category: 'Data Protection',
              compliance: [
                {
                  framework: 'CIS Azure',
                  controlId: '3.1',
                  controlTitle: 'Ensure that Secure transfer required is set to Enabled',
                  status: 'failed',
                },
              ],
              remediation: {
                description: 'Enable HTTPS-only traffic for the storage account',
                steps: [
                  'Go to Azure Portal',
                  `Navigate to Storage Account: ${account.name}`,
                  'Go to Configuration',
                  'Set "Secure transfer required" to Enabled',
                ],
                automatable: true,
              },
              detectedAt: new Date(),
            });
          }

          // Check for minimum TLS version
          if (account.minimumTlsVersion !== 'TLS1_2') {
            findings.push({
              id: `${account.id}-tls`,
              provider: 'AZURE',
              severity: 'medium',
              title: 'Storage Account uses outdated TLS version',
              description: `Storage account ${account.name} allows TLS versions older than 1.2`,
              resourceId: account.id || '',
              resourceUri: account.id,
              service: 'Storage',
              category: 'Data Protection',
              compliance: [
                {
                  framework: 'CIS Azure',
                  controlId: '3.12',
                  controlTitle: 'Ensure the Minimum TLS version is set to Version 1.2',
                  status: 'failed',
                },
              ],
              remediation: {
                description: 'Set minimum TLS version to 1.2',
                steps: [
                  'Go to Azure Portal',
                  `Navigate to Storage Account: ${account.name}`,
                  'Go to Configuration',
                  'Set "Minimum TLS version" to Version 1.2',
                ],
                automatable: true,
              },
              detectedAt: new Date(),
            });
          }

          // Check for public blob access
          if (account.allowBlobPublicAccess) {
            findings.push({
              id: `${account.id}-public-blob`,
              provider: 'AZURE',
              severity: 'high',
              title: 'Storage Account allows public blob access',
              description: `Storage account ${account.name} allows public access to blobs`,
              resourceId: account.id || '',
              resourceUri: account.id,
              service: 'Storage',
              category: 'Access Control',
              compliance: [
                {
                  framework: 'CIS Azure',
                  controlId: '3.5',
                  controlTitle: 'Ensure that Public access level is set to Private for blob containers',
                  status: 'failed',
                },
              ],
              remediation: {
                description: 'Disable public blob access',
                steps: [
                  'Go to Azure Portal',
                  `Navigate to Storage Account: ${account.name}`,
                  'Go to Configuration',
                  'Set "Allow Blob public access" to Disabled',
                ],
                automatable: true,
              },
              detectedAt: new Date(),
            });
          }
        }
      } catch (error: any) {
        logger.warn('Failed to scan Azure Storage Accounts', { error: error.message });
      }

      // Scan Network Security Groups
      try {
        const { NetworkManagementClient } = await import('@azure/arm-network');
        const networkClient = new NetworkManagementClient(
          credential,
          this.credentials.subscriptionId
        );

        for await (const nsg of networkClient.networkSecurityGroups.listAll()) {
          for (const rule of nsg.securityRules || []) {
            // Check for overly permissive inbound rules
            if (
              rule.direction === 'Inbound' &&
              rule.access === 'Allow' &&
              (rule.sourceAddressPrefix === '*' || rule.sourceAddressPrefix === '0.0.0.0/0' || rule.sourceAddressPrefix === 'Internet')
            ) {
              const isSSH = rule.destinationPortRange === '22';
              const isRDP = rule.destinationPortRange === '3389';
              const isAllPorts = rule.destinationPortRange === '*';

              if (isSSH || isRDP || isAllPorts) {
                findings.push({
                  id: `${nsg.id}-${rule.name}`,
                  provider: 'AZURE',
                  severity: isAllPorts ? 'critical' : 'high',
                  title: isSSH ? 'SSH Open to Internet' :
                         isRDP ? 'RDP Open to Internet' :
                         'All Ports Open to Internet',
                  description: `NSG ${nsg.name} rule ${rule.name} allows inbound traffic from Internet on port ${rule.destinationPortRange}`,
                  resourceId: nsg.id || '',
                  resourceUri: nsg.id,
                  service: 'Network',
                  category: 'Network Security',
                  compliance: [
                    {
                      framework: 'CIS Azure',
                      controlId: isSSH ? '6.1' : isRDP ? '6.2' : '6.3',
                      controlTitle: `Ensure that ${isSSH ? 'SSH' : isRDP ? 'RDP' : 'network'} access is restricted from the internet`,
                      status: 'failed',
                    },
                  ],
                  remediation: {
                    description: 'Restrict inbound access to specific IP ranges',
                    steps: [
                      'Go to Azure Portal',
                      `Navigate to NSG: ${nsg.name}`,
                      `Edit rule: ${rule.name}`,
                      'Change Source to specific IP addresses or ranges',
                    ],
                    automatable: true,
                  },
                  detectedAt: new Date(),
                });
              }
            }
          }
        }
      } catch (error: any) {
        logger.warn('Failed to scan Azure NSGs', { error: error.message });
      }

      // Scan SQL Servers
      try {
        const { SqlManagementClient } = await import('@azure/arm-sql');
        const sqlClient = new SqlManagementClient(
          credential,
          this.credentials.subscriptionId
        );

        for await (const server of sqlClient.servers.list()) {
          // Check for public network access
          if (server.publicNetworkAccess === 'Enabled') {
            findings.push({
              id: `${server.id}-public-access`,
              provider: 'AZURE',
              severity: 'high',
              title: 'SQL Server allows public network access',
              description: `SQL Server ${server.name} has public network access enabled`,
              resourceId: server.id || '',
              resourceUri: server.id,
              service: 'SQL',
              category: 'Network Security',
              compliance: [
                {
                  framework: 'CIS Azure',
                  controlId: '4.1.2',
                  controlTitle: 'Ensure no SQL Databases allow ingress from 0.0.0.0/0',
                  status: 'failed',
                },
              ],
              remediation: {
                description: 'Disable public network access and use Private Endpoints',
                steps: [
                  'Go to Azure Portal',
                  `Navigate to SQL Server: ${server.name}`,
                  'Go to Networking',
                  'Set "Public network access" to Disabled',
                  'Configure Private Endpoint for secure access',
                ],
                automatable: false,
                estimatedTime: '30 minutes',
              },
              detectedAt: new Date(),
            });
          }
        }
      } catch (error: any) {
        logger.warn('Failed to scan Azure SQL Servers', { error: error.message });
      }

      const summary: ScanSummary = {
        total: findings.length,
        critical: findings.filter(f => f.severity === 'critical').length,
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        low: findings.filter(f => f.severity === 'low').length,
        info: findings.filter(f => f.severity === 'info').length,
        byService: findings.reduce((acc, f) => {
          acc[f.service] = (acc[f.service] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };

      logger.info('Azure security scan completed', {
        findingsCount: findings.length,
        duration: Date.now() - startTime,
      });

      return {
        scanId: `azure-scan-${Date.now()}`,
        provider: 'AZURE',
        status: 'completed',
        findings,
        summary,
        duration: Date.now() - startTime,
        startedAt: new Date(startTime),
        completedAt: new Date(),
      };
    } catch (error: any) {
      logger.error('Azure security scan failed', { error: error.message });

      return {
        scanId: `azure-scan-${Date.now()}`,
        provider: 'AZURE',
        status: 'failed',
        findings: [],
        summary: {
          total: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
        },
        duration: Date.now() - startTime,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        error: error.message,
      };
    }
  }

  /**
   * Get Azure activity logs
   */
  async getActivityLogs(params: ActivityQueryParams): Promise<ActivityEvent[]> {
    const events: ActivityEvent[] = [];

    try {
      const credential = await this.getTokenCredential();
      const { MonitorClient } = await import('@azure/arm-monitor');
      
      const monitorClient = new MonitorClient(credential, this.credentials.subscriptionId);

      // Build filter for activity logs
      const startTime = new Date(params.startDate).toISOString();
      const endTime = new Date(params.endDate).toISOString();
      const filter = `eventTimestamp ge '${startTime}' and eventTimestamp le '${endTime}'`;

      for await (const event of monitorClient.activityLogs.list(filter)) {
        // Determine risk level based on operation
        let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
        const riskReasons: string[] = [];

        const operationName = event.operationName?.localizedValue || event.operationName?.value || '';
        
        // High-risk operations
        if (operationName.includes('delete') || operationName.includes('Delete')) {
          riskLevel = 'high';
          riskReasons.push('Resource deletion operation');
        }
        if (operationName.includes('roleAssignment') || operationName.includes('RoleAssignment')) {
          riskLevel = 'high';
          riskReasons.push('Role assignment change');
        }
        if (operationName.includes('networkSecurityGroup') || operationName.includes('NetworkSecurityGroup')) {
          riskLevel = 'medium';
          riskReasons.push('Network security configuration change');
        }

        // Check for failed operations
        if (event.status?.localizedValue === 'Failed' || event.status?.value === 'Failed') {
          if (riskLevel === 'low') riskLevel = 'medium';
          riskReasons.push('Operation failed');
        }

        events.push({
          id: event.eventDataId || `${event.correlationId}-${Date.now()}`,
          provider: 'AZURE',
          eventName: operationName,
          eventTime: event.eventTimestamp || new Date(),
          userName: event.caller || 'Unknown',
          userType: event.claims?.['http://schemas.microsoft.com/identity/claims/objectidentifier'] ? 'ServicePrincipal' : 'User',
          userPrincipalId: event.claims?.['http://schemas.microsoft.com/identity/claims/objectidentifier'],
          sourceIp: event.httpRequest?.clientIpAddress,
          region: event.resourceGroupName || 'global',
          service: event.resourceProviderName?.localizedValue || event.resourceProviderName?.value || 'Unknown',
          action: operationName,
          resourceId: event.resourceId,
          resourceType: event.resourceType?.localizedValue || event.resourceType?.value,
          riskLevel,
          riskReasons,
          details: {
            correlationId: event.correlationId,
            level: event.level,
            status: event.status?.localizedValue || event.status?.value,
            subStatus: event.subStatus?.localizedValue || event.subStatus?.value,
            description: event.description,
          },
        });

        // Limit results
        if (params.limit && events.length >= params.limit) {
          break;
        }
      }

      logger.info('Azure activity logs retrieved', { count: events.length });
    } catch (error: any) {
      logger.error('Failed to get Azure activity logs', { error: error.message });
    }

    return events;
  }
}
