/**
 * Azure Provider Implementation
 * 
 * Implements ICloudProvider interface for Microsoft Azure.
 * Uses Azure SDK for JavaScript to interact with Azure services.
 * Supports both Service Principal and OAuth authentication.
 */

import type {
  ICloudProvider,
  CloudProviderType,
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
  AzureServicePrincipalCredentials,
  AzureCertificateCredentials,
} from '../../types/cloud.js';
import { CloudProviderError } from '../../types/cloud.js';
import { logger } from '../logging.js';

/**
 * OAuth credentials for Azure
 */
export interface AzureOAuthCredentials {
  subscriptionId: string;
  subscriptionName?: string;
  tenantId: string;
  accessToken: string;
  expiresAt?: Date;
}

/**
 * Combined credentials type
 */
export type AzureCredentials = AzureServicePrincipalCredentials | AzureOAuthCredentials | AzureCertificateCredentials;

/**
 * Type guard for OAuth credentials
 */
function isOAuthCredentials(creds: AzureCredentials): creds is AzureOAuthCredentials {
  return 'accessToken' in creds;
}

/**
 * Type guard for Service Principal credentials
 */
function isServicePrincipalCredentials(creds: AzureCredentials): creds is AzureServicePrincipalCredentials {
  return 'clientId' in creds && 'clientSecret' in creds;
}

/**
 * Type guard for Certificate credentials
 */
function isCertificateCredentials(creds: AzureCredentials): creds is AzureCertificateCredentials {
  return 'clientId' in creds && 'certificatePem' in creds;
}

/**
 * Custom TokenCredential implementation for OAuth access tokens
 * This allows using pre-obtained OAuth tokens with Azure SDK clients
 */
class OAuthTokenCredential {
  private accessToken: string;
  private expiresAt: Date;

  constructor(accessToken: string, expiresAt?: Date) {
    this.accessToken = accessToken;
    // Default to 1 hour if not specified
    this.expiresAt = expiresAt || new Date(Date.now() + 60 * 60 * 1000);
  }

  async getToken(_scopes: string | string[]): Promise<{ token: string; expiresOnTimestamp: number }> {
    // Check if token is expired
    if (this.expiresAt.getTime() < Date.now()) {
      throw new CloudProviderError(
        'OAuth access token has expired. Please refresh the token.',
        'AZURE',
        'TOKEN_EXPIRED',
        401
      );
    }

    return {
      token: this.accessToken,
      expiresOnTimestamp: this.expiresAt.getTime(),
    };
  }
}

/**
 * Azure Provider
 * 
 * Implements the ICloudProvider interface for Azure.
 * Supports both Service Principal and OAuth authentication.
 */
export class AzureProvider implements ICloudProvider {
  readonly providerType: CloudProviderType = 'AZURE';
  
  private readonly organizationId: string;
  private readonly credentials: AzureCredentials;
  private readonly authType: 'service_principal' | 'oauth' | 'certificate';
  private tokenCredential: any = null;

  constructor(organizationId: string, credentials: AzureCredentials) {
    this.organizationId = organizationId;
    this.credentials = credentials;
    this.authType = isOAuthCredentials(credentials) 
      ? 'oauth' 
      : isCertificateCredentials(credentials) 
        ? 'certificate' 
        : 'service_principal';
  }

  /**
   * Get the organization ID
   */
  get organization(): string {
    return this.organizationId;
  }

  /**
   * Get the subscription ID from credentials
   */
  get subscriptionId(): string {
    return this.credentials.subscriptionId;
  }

  /**
   * Get the authentication type
   */
  get authenticationType(): 'service_principal' | 'oauth' | 'certificate' {
    return this.authType;
  }

  /**
   * Get access token for Azure Management API
   * Used by modular scanners that make direct REST API calls
   */
  async getAccessToken(): Promise<string | null> {
    try {
      logger.debug('Getting Azure access token', {
        authType: this.authType,
        subscriptionId: this.credentials.subscriptionId,
        isOAuth: isOAuthCredentials(this.credentials),
      });

      const credential = await this.getTokenCredential();
      
      // For OAuth credentials, we already have the token
      if (isOAuthCredentials(this.credentials)) {
        logger.debug('Using OAuth access token');
        return this.credentials.accessToken;
      }
      
      // For Service Principal, get a token from the credential
      logger.debug('Getting token from Service Principal credential');
      const tokenResponse = await credential.getToken('https://management.azure.com/.default');
      
      if (!tokenResponse?.token) {
        logger.error('No token returned from Service Principal credential');
        return null;
      }
      
      logger.debug('Token obtained successfully', { tokenLength: tokenResponse.token.length });
      return tokenResponse.token;
    } catch (error: any) {
      logger.error('Failed to get Azure access token', { 
        error: {
          message: error?.message || 'Unknown error',
          code: error?.code,
          name: error?.name,
          stack: error?.stack?.split('\n').slice(0, 3).join('\n'),
        }
      });
      return null;
    }
  }

  /**
   * Get Azure token credential for SDK clients
   * Supports both Service Principal and OAuth authentication
   */
  private async getTokenCredential(): Promise<any> {
    if (this.tokenCredential) {
      return this.tokenCredential;
    }

    const credentialInfo = {
      isOAuth: isOAuthCredentials(this.credentials),
      isServicePrincipal: isServicePrincipalCredentials(this.credentials),
      subscriptionId: this.credentials.subscriptionId,
    };

    logger.debug('Creating token credential', credentialInfo);

    try {
      this.tokenCredential = await this.createTokenCredential();
      return this.tokenCredential;
    } catch (error: any) {
      this.handleCredentialError(error);
      throw error; // Re-throw if not handled
    }
  }

  /**
   * Create the appropriate token credential based on credential type
   */
  private async createTokenCredential(): Promise<any> {
    if (isOAuthCredentials(this.credentials)) {
      return this.createOAuthCredential();
    }
    
    if (isCertificateCredentials(this.credentials)) {
      return this.createCertificateCredential();
    }
    
    if (isServicePrincipalCredentials(this.credentials)) {
      return this.createServicePrincipalCredential();
    }
    
    logger.error('Invalid Azure credentials format', {
      credentialKeys: Object.keys(this.credentials),
    });
    throw new CloudProviderError(
      'Invalid Azure credentials format',
      'AZURE',
      'INVALID_CREDENTIALS',
      400
    );
  }

  /**
   * Create OAuth token credential
   */
  private createOAuthCredential(): OAuthTokenCredential {
    const creds = this.credentials as AzureOAuthCredentials;
    
    logger.debug('Using OAuth token credential', {
      subscriptionId: creds.subscriptionId,
      tenantId: creds.tenantId,
    });
    
    return new OAuthTokenCredential(creds.accessToken, creds.expiresAt);
  }

  /**
   * Create Service Principal credential
   */
  private async createServicePrincipalCredential(): Promise<any> {
    const creds = this.credentials as AzureServicePrincipalCredentials;
    
    logger.debug('Creating Service Principal credential', {
      tenantId: creds.tenantId,
      clientId: creds.clientId,
    });
    
    const { ClientSecretCredential } = await import('@azure/identity');
    
    const credential = new ClientSecretCredential(
      creds.tenantId,
      creds.clientId,
      creds.clientSecret
    );
    
    logger.debug('Service Principal credential created successfully');
    return credential;
  }

  /**
   * Create a certificate-based credential using @azure/identity ClientCertificateCredential.
   * The PEM must contain both the certificate and private key.
   */
  private async createCertificateCredential(): Promise<any> {
    const creds = this.credentials as AzureCertificateCredentials;
    
    logger.debug('Creating Certificate credential', {
      tenantId: creds.tenantId,
      clientId: creds.clientId,
    });
    
    const { ClientCertificateCredential } = await import('@azure/identity');
    
    // ClientCertificateCredential accepts PEM string via sendCertificateChain option
    const credential = new ClientCertificateCredential(
      creds.tenantId,
      creds.clientId,
      {
        certificate: creds.certificatePem,
      }
    );
    
    logger.debug('Certificate credential created successfully');
    return credential;
  }

  /**
   * Handle credential creation errors
   */
  private handleCredentialError(error: any): never {
    const isModuleNotFound = error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND';
    
    if (isModuleNotFound) {
      throw new CloudProviderError(
        'Azure SDK not installed. Run: npm install @azure/identity @azure/arm-resources @azure/arm-compute @azure/arm-storage @azure/arm-costmanagement',
        'AZURE',
        'SDK_NOT_INSTALLED',
        500
      );
    }
    
    throw error;
  }

  /**
   * Create a new AzureProvider instance with a fresh OAuth access token
   * Used when the token needs to be refreshed
   */
  static withOAuthToken(
    organizationId: string,
    subscriptionId: string,
    subscriptionName: string | undefined,
    tenantId: string,
    accessToken: string,
    expiresAt?: Date
  ): AzureProvider {
    return new AzureProvider(organizationId, {
      subscriptionId,
      subscriptionName,
      tenantId,
      accessToken,
      expiresAt,
    });
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

      const tenantId = isOAuthCredentials(this.credentials) 
        ? this.credentials.tenantId 
        : (this.credentials as AzureServicePrincipalCredentials).tenantId;

      logger.info('Azure credentials validated', {
        subscriptionId: this.credentials.subscriptionId,
        resourceGroupsFound: resourceGroups.length,
        authType: this.authType,
      });

      return {
        valid: true,
        accountId: this.credentials.subscriptionId,
        accountName: this.credentials.subscriptionName || this.credentials.subscriptionId,
        details: {
          tenantId,
          resourceGroups: resourceGroups.slice(0, 5),
          authType: this.authType,
        },
      };
    } catch (error: any) {
      logger.error('Azure credential validation failed', { 
        error: error,
        authType: this.authType,
      });
      
      // Parse Azure-specific errors
      let errorMessage = error.message || 'Failed to validate Azure credentials';
      let helpUrl: string | undefined;
      let steps: string[] | undefined;
      
      if (error.statusCode === 401 || error.code === 'AuthenticationError' || error.code === 'TOKEN_EXPIRED') {
        errorMessage = this.authType === 'oauth'
          ? 'OAuth token has expired or been revoked. Please reconnect your Azure account.'
          : 'Invalid Azure credentials. Please check tenant ID, client ID, and client secret.';
      } else if (error.statusCode === 403 || error.code === 'AuthorizationFailed') {
        errorMessage = this.authType === 'oauth'
          ? 'Access denied. Your Azure account may not have sufficient permissions for this subscription.'
          : 'Access denied. The Service Principal does not have sufficient permissions on this subscription.';
        
        helpUrl = 'https://learn.microsoft.com/en-us/azure/role-based-access-control/role-assignments-portal';
        steps = [
          '1. Go to Azure Portal → Subscriptions → Select your subscription',
          '2. Click on "Access control (IAM)" in the left menu',
          '3. Click "+ Add" → "Add role assignment"',
          '4. Select the "Reader" role (or "Contributor" for full access)',
          '5. Click "Next" and select "User, group, or service principal"',
          '6. Search for your App Registration name and select it',
          '7. Click "Review + assign" to save',
          '8. Wait 1-2 minutes for permissions to propagate, then try again'
        ];
      } else if (error.code === 'SubscriptionNotFound') {
        errorMessage = 'Subscription not found. Please verify the subscription ID.';
      }

      return {
        valid: false,
        error: errorMessage,
        details: {
          code: error.code || error.statusCode,
          statusCode: error.statusCode,
          authType: this.authType,
          helpUrl,
          steps,
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
   * Uses direct REST API call instead of SDK for better reliability
   */
  async getCosts(params: CostQueryParams): Promise<CostData[]> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      logger.error('Failed to get Azure access token for cost query');
      return [];
    }

    const apiUrl = this.buildCostManagementUrl();
    const requestBody = this.buildCostQueryRequest(params);

    logger.debug('Calling Azure Cost Management API', {
      subscriptionId: this.credentials.subscriptionId,
      startDate: params.startDate,
      endDate: params.endDate,
      granularity: params.granularity,
    });

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        await this.handleCostApiError(response);
        return [];
      }

      const responseData = await this.parseCostApiResponse(response);
      if (!responseData) {
        return [];
      }

      const costs = this.transformCostData(responseData, params.startDate);

      logger.info('Azure costs retrieved successfully', {
        count: costs.length,
        startDate: params.startDate,
        endDate: params.endDate,
        totalCost: costs.reduce((sum, c) => sum + c.cost, 0),
      });

      return costs;
    } catch (error: unknown) {
      this.logCostApiError(error);
      return [];
    }
  }

  /**
   * Build the Cost Management API URL
   */
  private buildCostManagementUrl(): string {
    const API_VERSION = '2023-11-01';
    const scope = `/subscriptions/${this.credentials.subscriptionId}`;
    return `https://management.azure.com${scope}/providers/Microsoft.CostManagement/query?api-version=${API_VERSION}`;
  }

  /**
   * Build the cost query request body
   */
  private buildCostQueryRequest(params: CostQueryParams): object {
    return {
      type: 'ActualCost',
      timeframe: 'Custom',
      timePeriod: {
        from: params.startDate,
        to: params.endDate,
      },
      dataset: {
        granularity: params.granularity === 'MONTHLY' ? 'Monthly' : 'Daily',
        aggregation: {
          totalCost: { name: 'Cost', function: 'Sum' },
        },
        grouping: [{ type: 'Dimension', name: 'ServiceName' }],
      },
    };
  }

  /**
   * Handle Cost Management API error responses
   */
  private async handleCostApiError(response: Response): Promise<void> {
    const responseText = await response.text();
    let errorDetails: unknown;
    
    try {
      errorDetails = JSON.parse(responseText);
    } catch {
      errorDetails = { rawText: responseText.substring(0, 500) };
    }
    
    logger.error('Azure Cost Management API error', {
      status: response.status,
      statusText: response.statusText,
      error: errorDetails,
    });
    
    if (response.status === 403) {
      logger.warn('Cost Management API access denied - ensure Cost Management Reader role is assigned');
    }
  }

  /**
   * Parse and validate Cost API response
   */
  private async parseCostApiResponse(response: Response): Promise<{ rows: unknown[]; columns: Array<{ name: string }> } | null> {
    const responseText = await response.text();
    
    try {
      const data = JSON.parse(responseText);
      const rows = data.properties?.rows || [];
      const columns = data.properties?.columns || [];

      logger.debug('Azure Cost API response parsed', {
        rowCount: rows.length,
        columns: columns.map((c: { name: string }) => c.name),
      });

      if (rows.length === 0) {
        logger.info('No cost data returned from Azure for the specified period');
        return null;
      }

      return { rows, columns };
    } catch (parseError) {
      logger.error('Failed to parse Azure Cost API response', { 
        error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
        responseText: responseText.substring(0, 500),
      });
      return null;
    }
  }

  /**
   * Transform raw API response into CostData array
   */
  private transformCostData(
    responseData: { rows: unknown[]; columns: Array<{ name: string }> },
    defaultDate: string
  ): CostData[] {
    const columnIndices = this.mapColumnIndices(responseData.columns);
    
    return responseData.rows.map((row: unknown) => {
      const rowArray = row as unknown[];
      return {
        date: this.parseAzureDate(rowArray[columnIndices.date], defaultDate),
        service: String(rowArray[columnIndices.service] || 'Unknown'),
        cost: parseFloat(String(rowArray[columnIndices.cost])) || 0,
        currency: String(rowArray[columnIndices.currency] || 'USD'),
        provider: 'AZURE' as const,
        accountId: this.credentials.subscriptionId,
      };
    });
  }

  /**
   * Map column names to their indices in the response
   */
  private mapColumnIndices(columns: Array<{ name: string }>): { cost: number; date: number; service: number; currency: number } {
    const indices = { cost: 0, date: 1, service: 2, currency: 3 };
    
    columns.forEach((col, idx) => {
      const name = (col.name || '').toLowerCase();
      if (name === 'cost' || name === 'totalcost' || name === 'precost') {
        indices.cost = idx;
      } else if (name === 'usagedate' || name === 'billingperiod' || name.includes('date')) {
        indices.date = idx;
      } else if (name === 'servicename' || name === 'service') {
        indices.service = idx;
      } else if (name === 'currency') {
        indices.currency = idx;
      }
    });
    
    return indices;
  }

  /**
   * Parse Azure date format (YYYYMMDD number or string) to ISO date string
   */
  private parseAzureDate(rawDate: unknown, defaultDate: string): string {
    if (!rawDate) {
      return defaultDate;
    }
    
    const dateStr = String(rawDate);
    
    // YYYYMMDD format
    if (/^\d{8}$/.test(dateStr)) {
      return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    }
    
    // Already ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      return dateStr.slice(0, 10);
    }
    
    // Try parsing as Date
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    
    return defaultDate;
  }

  /**
   * Log cost API errors with proper serialization
   */
  private logCostApiError(error: unknown): void {
    const err = error as { message?: string; code?: string; statusCode?: number; name?: string; stack?: string };
    const errorDetails = {
      message: err?.message || 'Unknown error',
      code: err?.code,
      statusCode: err?.statusCode,
      name: err?.name,
      stack: err?.stack?.split('\n').slice(0, 3).join('\n'),
    };
    
    logger.error('Failed to get Azure costs', { error: errorDetails });
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
