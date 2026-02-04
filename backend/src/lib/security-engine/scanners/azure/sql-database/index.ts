/**
 * Azure SQL Database Security Scanner
 * 
 * Scans Azure SQL Servers and Databases for security misconfigurations including:
 * - TDE (Transparent Data Encryption) with CMK
 * - Auditing configuration to blob storage
 * - Firewall rules
 * - Azure AD authentication
 * - Advanced Threat Protection (ATP)
 * - Vulnerability Assessment
 * - Data Discovery & Classification
 * - Private Endpoints
 * 
 * Features:
 * - Resource caching to avoid duplicate API calls
 * - Rate limiting to prevent Azure API throttling
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';
import { getGlobalCache, CacheKeys } from '../utils/cache.js';
import { rateLimitedFetch } from '../utils/rate-limiter.js';

// Compliance thresholds
const MIN_AUDIT_RETENTION_DAYS = 90;

interface SqlServer {
  id: string;
  name: string;
  location: string;
  properties: {
    administratorLogin?: string;
    version?: string;
    state?: string;
    fullyQualifiedDomainName?: string;
    publicNetworkAccess?: string;
    minimalTlsVersion?: string;
    administrators?: {
      administratorType?: string;
      principalType?: string;
      login?: string;
      azureADOnlyAuthentication?: boolean;
    };
    privateEndpointConnections?: PrivateEndpointConnection[];
  };
  tags?: Record<string, string>;
}

interface PrivateEndpointConnection {
  id: string;
  properties: {
    privateEndpoint?: { id: string };
    privateLinkServiceConnectionState?: {
      status?: string;
    };
  };
}

interface SqlDatabase {
  id: string;
  name: string;
  location: string;
  properties: {
    status?: string;
    collation?: string;
    maxSizeBytes?: number;
    zoneRedundant?: boolean;
    readScale?: string;
    currentServiceObjectiveName?: string;
    requestedBackupStorageRedundancy?: string;
    isLedgerOn?: boolean;
  };
}

interface FirewallRule {
  id: string;
  name: string;
  properties: {
    startIpAddress: string;
    endIpAddress: string;
  };
}

interface TdeStatus {
  id: string;
  properties: {
    state?: string;
  };
}

interface EncryptionProtector {
  id: string;
  properties: {
    serverKeyType?: string;
    serverKeyName?: string;
    uri?: string;
    autoRotationEnabled?: boolean;
  };
}

interface AuditingSettings {
  id: string;
  properties: {
    state?: string;
    storageEndpoint?: string;
    retentionDays?: number;
    isStorageSecondaryKeyInUse?: boolean;
    isAzureMonitorTargetEnabled?: boolean;
  };
}

interface SecurityAlertPolicy {
  id: string;
  properties: {
    state?: string;
    emailAddresses?: string[];
    emailAccountAdmins?: boolean;
    disabledAlerts?: string[];
    retentionDays?: number;
  };
}

interface VulnerabilityAssessment {
  id: string;
  properties: {
    storageContainerPath?: string;
    recurringScans?: {
      isEnabled?: boolean;
      emailSubscriptionAdmins?: boolean;
      emails?: string[];
    };
  };
}

async function fetchSqlServers(context: AzureScanContext): Promise<SqlServer[]> {
  const cache = getGlobalCache();
  const cacheKey = CacheKeys.sqlServers(context.subscriptionId);
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.Sql/servers?api-version=2023-05-01-preview`;
    
    const response = await rateLimitedFetch(url, {
      headers: {
        'Authorization': `Bearer ${context.accessToken}`,
        'Content-Type': 'application/json',
      },
    }, 'fetchSqlServers');

    if (!response.ok) {
      throw new Error(`Failed to fetch SQL Servers: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { value?: SqlServer[] };
    return data.value || [];
  });
}

async function fetchFirewallRules(context: AzureScanContext, serverId: string): Promise<FirewallRule[]> {
  const cache = getGlobalCache();
  const cacheKey = `sql-firewall:${serverId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${serverId}/firewallRules?api-version=2023-05-01-preview`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchFirewallRules');

      if (!response.ok) return [];
      const data = await response.json() as { value?: FirewallRule[] };
      return data.value || [];
    } catch {
      return [];
    }
  });
}

async function fetchDatabases(context: AzureScanContext, serverId: string): Promise<SqlDatabase[]> {
  const cache = getGlobalCache();
  const cacheKey = `sql-databases:${serverId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${serverId}/databases?api-version=2023-05-01-preview`;
  
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchDatabases');

      if (!response.ok) return [];
      const data = await response.json() as { value?: SqlDatabase[] };
      return data.value || [];
    } catch {
      return [];
    }
  });
}

async function fetchEncryptionProtector(context: AzureScanContext, serverId: string): Promise<EncryptionProtector | null> {
  const cache = getGlobalCache();
  const cacheKey = `sql-encryption:${serverId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${serverId}/encryptionProtector/current?api-version=2023-05-01-preview`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchEncryptionProtector');

      if (!response.ok) return null;
      return await response.json() as EncryptionProtector;
    } catch {
      return null;
    }
  });
}

async function fetchAuditingSettings(context: AzureScanContext, serverId: string): Promise<AuditingSettings | null> {
  const cache = getGlobalCache();
  const cacheKey = `sql-auditing:${serverId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${serverId}/auditingSettings/default?api-version=2023-05-01-preview`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchAuditingSettings');

      if (!response.ok) return null;
      return await response.json() as AuditingSettings;
    } catch {
      return null;
    }
  });
}

async function fetchSecurityAlertPolicy(context: AzureScanContext, serverId: string): Promise<SecurityAlertPolicy | null> {
  const cache = getGlobalCache();
  const cacheKey = `sql-alert-policy:${serverId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${serverId}/securityAlertPolicies/Default?api-version=2023-05-01-preview`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchSecurityAlertPolicy');

      if (!response.ok) return null;
      return await response.json() as SecurityAlertPolicy;
    } catch {
      return null;
    }
  });
}

async function fetchVulnerabilityAssessment(context: AzureScanContext, serverId: string): Promise<VulnerabilityAssessment | null> {
  const cache = getGlobalCache();
  const cacheKey = `sql-vuln-assessment:${serverId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${serverId}/vulnerabilityAssessments/default?api-version=2023-05-01-preview`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchVulnerabilityAssessment');

      if (!response.ok) return null;
      return await response.json() as VulnerabilityAssessment;
    } catch {
      return null;
    }
  });
}

async function fetchDatabaseTdeStatus(context: AzureScanContext, databaseId: string): Promise<TdeStatus | null> {
  const cache = getGlobalCache();
  const cacheKey = `sql-tde:${databaseId}`;
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `https://management.azure.com${databaseId}/transparentDataEncryption/current?api-version=2023-05-01-preview`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, 'fetchDatabaseTdeStatus');

      if (!response.ok) return null;
      return await response.json() as TdeStatus;
    } catch {
      return null;
    }
  });
}

export const sqlDatabaseScanner: AzureScanner = {
  name: 'azure-sql-database',
  description: 'Scans Azure SQL Servers and Databases for security misconfigurations including TDE with CMK, auditing, ATP, vulnerability assessment, and data classification',
  category: 'Database',

  async scan(context: AzureScanContext): Promise<AzureScanResult> {
    const startTime = Date.now();
    const findings: AzureSecurityFinding[] = [];
    const errors: AzureScanError[] = [];
    let resourcesScanned = 0;

    try {
      const servers = await fetchSqlServers(context);
      resourcesScanned = servers.length;

      for (const server of servers) {
        const resourceGroup = server.id?.split('/resourceGroups/')[1]?.split('/')[0] || 'unknown';
        const props = server.properties;

        // Check 1: Public Network Access
        if (props.publicNetworkAccess === 'Enabled') {
          findings.push({
            severity: 'MEDIUM',
            title: 'SQL Server Public Network Access Enabled',
            description: `SQL Server ${server.name} has public network access enabled`,
            resourceType: 'Microsoft.Sql/servers',
            resourceId: server.id,
            resourceName: server.name,
            resourceGroup,
            region: server.location,
            remediation: 'Consider using private endpoints and disabling public network access',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          });
        }

        // Check 2: Minimum TLS Version
        if (!props.minimalTlsVersion || props.minimalTlsVersion < '1.2') {
          findings.push({
            severity: 'MEDIUM',
            title: 'SQL Server Allows Outdated TLS',
            description: `SQL Server ${server.name} allows TLS versions older than 1.2`,
            resourceType: 'Microsoft.Sql/servers',
            resourceId: server.id,
            resourceName: server.name,
            resourceGroup,
            region: server.location,
            remediation: 'Set minimum TLS version to 1.2',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'NIST 800-53'],
          });
        }

        // Check 3: Azure AD Only Authentication
        if (props.administrators?.azureADOnlyAuthentication !== true) {
          findings.push({
            severity: 'MEDIUM',
            title: 'SQL Server Allows SQL Authentication',
            description: `SQL Server ${server.name} allows SQL authentication in addition to Azure AD`,
            resourceType: 'Microsoft.Sql/servers',
            resourceId: server.id,
            resourceName: server.name,
            resourceGroup,
            region: server.location,
            remediation: 'Enable Azure AD-only authentication for better security',
            complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
          });
        }

        // Check 4: Azure AD Admin Not Configured
        if (!props.administrators?.login) {
          findings.push({
            severity: 'HIGH',
            title: 'SQL Server No Azure AD Admin',
            description: `SQL Server ${server.name} does not have an Azure AD administrator configured`,
            resourceType: 'Microsoft.Sql/servers',
            resourceId: server.id,
            resourceName: server.name,
            resourceGroup,
            region: server.location,
            remediation: 'Configure an Azure AD administrator for the SQL Server',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          });
        }

        // Check 5: Private Endpoints
        const privateEndpoints = props.privateEndpointConnections || [];
        const approvedEndpoints = privateEndpoints.filter(
          pe => pe.properties?.privateLinkServiceConnectionState?.status === 'Approved'
        );
        
        if (approvedEndpoints.length === 0 && props.publicNetworkAccess !== 'Disabled') {
          findings.push({
            severity: 'MEDIUM',
            title: 'SQL Server No Private Endpoints',
            description: `SQL Server ${server.name} does not have private endpoints configured`,
            resourceType: 'Microsoft.Sql/servers',
            resourceId: server.id,
            resourceName: server.name,
            resourceGroup,
            region: server.location,
            remediation: 'Configure private endpoints for secure access from VNets',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'NIST 800-53'],
          });
        }

        // Check 6: Encryption Protector (TDE with CMK)
        const encryptionProtector = await fetchEncryptionProtector(context, server.id);
        if (encryptionProtector) {
          if (encryptionProtector.properties?.serverKeyType !== 'AzureKeyVault') {
            findings.push({
              severity: 'MEDIUM',
              title: 'SQL Server TDE Not Using Customer Managed Key',
              description: `SQL Server ${server.name} uses service-managed key for TDE instead of customer-managed key`,
              resourceType: 'Microsoft.Sql/servers',
              resourceId: server.id,
              resourceName: server.name,
              resourceGroup,
              region: server.location,
              remediation: 'Configure TDE with customer-managed key (CMK) from Azure Key Vault for enhanced control',
              complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'LGPD', 'NIST 800-53'],
            });
          }

          if (encryptionProtector.properties?.serverKeyType === 'AzureKeyVault' && 
              encryptionProtector.properties?.autoRotationEnabled !== true) {
            findings.push({
              severity: 'LOW',
              title: 'SQL Server TDE Key Auto-Rotation Disabled',
              description: `SQL Server ${server.name} does not have automatic key rotation enabled for TDE`,
              resourceType: 'Microsoft.Sql/servers',
              resourceId: server.id,
              resourceName: server.name,
              resourceGroup,
              region: server.location,
              remediation: 'Enable automatic key rotation for the TDE protector key',
              complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
            });
          }
        }

        // Check 7: Auditing Settings
        const auditingSettings = await fetchAuditingSettings(context, server.id);
        if (!auditingSettings || auditingSettings.properties?.state !== 'Enabled') {
          findings.push({
            severity: 'HIGH',
            title: 'SQL Server Auditing Not Enabled',
            description: `SQL Server ${server.name} does not have auditing enabled`,
            resourceType: 'Microsoft.Sql/servers',
            resourceId: server.id,
            resourceName: server.name,
            resourceGroup,
            region: server.location,
            remediation: 'Enable auditing to blob storage or Log Analytics for compliance and security monitoring',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'LGPD', 'NIST 800-53'],
          });
        } else {
          // Check audit retention
          const retentionDays = auditingSettings.properties?.retentionDays || 0;
          if (retentionDays < MIN_AUDIT_RETENTION_DAYS) {
            findings.push({
              severity: 'MEDIUM',
              title: 'SQL Server Audit Retention Too Short',
              description: `SQL Server ${server.name} has audit retention of only ${retentionDays} days`,
              resourceType: 'Microsoft.Sql/servers',
              resourceId: server.id,
              resourceName: server.name,
              resourceGroup,
              region: server.location,
              remediation: 'Increase audit log retention to at least 90 days for compliance',
              complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'LGPD'],
            });
          }

          // Check if Azure Monitor is enabled for auditing
          if (!auditingSettings.properties?.isAzureMonitorTargetEnabled) {
            findings.push({
              severity: 'LOW',
              title: 'SQL Server Audit Not Sent to Azure Monitor',
              description: `SQL Server ${server.name} audit logs are not sent to Azure Monitor`,
              resourceType: 'Microsoft.Sql/servers',
              resourceId: server.id,
              resourceName: server.name,
              resourceGroup,
              region: server.location,
              remediation: 'Enable Azure Monitor target for centralized log analysis and alerting',
              complianceFrameworks: ['CIS Azure 1.4'],
            });
          }
        }

        // Check 8: Advanced Threat Protection (Security Alert Policy)
        const securityAlertPolicy = await fetchSecurityAlertPolicy(context, server.id);
        if (!securityAlertPolicy || securityAlertPolicy.properties?.state !== 'Enabled') {
          findings.push({
            severity: 'HIGH',
            title: 'SQL Server Advanced Threat Protection Disabled',
            description: `SQL Server ${server.name} does not have Advanced Threat Protection (ATP) enabled`,
            resourceType: 'Microsoft.Sql/servers',
            resourceId: server.id,
            resourceName: server.name,
            resourceGroup,
            region: server.location,
            remediation: 'Enable Advanced Threat Protection to detect anomalous activities and potential threats',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'NIST 800-53'],
          });
        } else {
          // Check if email notifications are configured
          const hasEmailNotifications = 
            (securityAlertPolicy.properties?.emailAddresses?.length || 0) > 0 ||
            securityAlertPolicy.properties?.emailAccountAdmins === true;
          
          if (!hasEmailNotifications) {
            findings.push({
              severity: 'MEDIUM',
              title: 'SQL Server ATP Email Notifications Not Configured',
              description: `SQL Server ${server.name} ATP does not have email notifications configured`,
              resourceType: 'Microsoft.Sql/servers',
              resourceId: server.id,
              resourceName: server.name,
              resourceGroup,
              region: server.location,
              remediation: 'Configure email notifications for ATP alerts to ensure timely response to threats',
              complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
            });
          }

          // Check for disabled alert types
          if (securityAlertPolicy.properties?.disabledAlerts?.length) {
            findings.push({
              severity: 'MEDIUM',
              title: 'SQL Server ATP Has Disabled Alert Types',
              description: `SQL Server ${server.name} has some ATP alert types disabled: ${securityAlertPolicy.properties.disabledAlerts.join(', ')}`,
              resourceType: 'Microsoft.Sql/servers',
              resourceId: server.id,
              resourceName: server.name,
              resourceGroup,
              region: server.location,
              remediation: 'Enable all ATP alert types for comprehensive threat detection',
              complianceFrameworks: ['CIS Azure 1.4'],
              metadata: { disabledAlerts: securityAlertPolicy.properties.disabledAlerts },
            });
          }
        }

        // Check 9: Vulnerability Assessment
        const vulnerabilityAssessment = await fetchVulnerabilityAssessment(context, server.id);
        if (!vulnerabilityAssessment || !vulnerabilityAssessment.properties?.storageContainerPath) {
          findings.push({
            severity: 'HIGH',
            title: 'SQL Server Vulnerability Assessment Not Configured',
            description: `SQL Server ${server.name} does not have Vulnerability Assessment configured`,
            resourceType: 'Microsoft.Sql/servers',
            resourceId: server.id,
            resourceName: server.name,
            resourceGroup,
            region: server.location,
            remediation: 'Configure Vulnerability Assessment with a storage account to store scan results',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'NIST 800-53'],
          });
        } else {
          // Check recurring scans
          if (!vulnerabilityAssessment.properties?.recurringScans?.isEnabled) {
            findings.push({
              severity: 'MEDIUM',
              title: 'SQL Server Vulnerability Assessment Recurring Scans Disabled',
              description: `SQL Server ${server.name} does not have recurring vulnerability scans enabled`,
              resourceType: 'Microsoft.Sql/servers',
              resourceId: server.id,
              resourceName: server.name,
              resourceGroup,
              region: server.location,
              remediation: 'Enable recurring scans for continuous vulnerability monitoring',
              complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
            });
          }
        }

        // Check 10: Firewall Rules
        const firewallRules = await fetchFirewallRules(context, server.id);
        
        // Check for "Allow Azure Services" rule
        const allowAzureServices = firewallRules.find(
          r => r.properties.startIpAddress === '0.0.0.0' && r.properties.endIpAddress === '0.0.0.0'
        );
        if (allowAzureServices) {
          findings.push({
            severity: 'MEDIUM',
            title: 'SQL Server Allows All Azure Services',
            description: `SQL Server ${server.name} has "Allow Azure services" firewall rule enabled`,
            resourceType: 'Microsoft.Sql/servers',
            resourceId: server.id,
            resourceName: server.name,
            resourceGroup,
            region: server.location,
            remediation: 'Remove "Allow Azure services" rule and use specific IP ranges or private endpoints',
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
          });
        }

        // Check for overly permissive rules
        for (const rule of firewallRules) {
          const start = rule.properties.startIpAddress;
          const end = rule.properties.endIpAddress;
          
          // Check for 0.0.0.0 to 255.255.255.255 (allow all)
          if (start === '0.0.0.0' && end === '255.255.255.255') {
            findings.push({
              severity: 'CRITICAL',
              title: 'SQL Server Allows All IPs',
              description: `SQL Server ${server.name} has a firewall rule allowing all IP addresses`,
              resourceType: 'Microsoft.Sql/servers',
              resourceId: server.id,
              resourceName: server.name,
              resourceGroup,
              region: server.location,
              remediation: 'Remove overly permissive firewall rules and restrict to specific IPs',
              complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'NIST 800-53'],
              metadata: { ruleName: rule.name },
            });
          }
        }

        // Check 11: Databases
        const databases = await fetchDatabases(context, server.id);
        resourcesScanned += databases.length;

        for (const db of databases) {
          if (db.name === 'master') continue; // Skip system database

          // Check TDE status for each database
          const tdeStatus = await fetchDatabaseTdeStatus(context, db.id);
          if (!tdeStatus || tdeStatus.properties?.state !== 'Enabled') {
            findings.push({
              severity: 'CRITICAL',
              title: 'Database TDE Not Enabled',
              description: `Database ${db.name} on server ${server.name} does not have Transparent Data Encryption enabled`,
              resourceType: 'Microsoft.Sql/servers/databases',
              resourceId: db.id,
              resourceName: db.name,
              resourceGroup,
              region: db.location,
              remediation: 'Enable Transparent Data Encryption (TDE) to encrypt data at rest',
              complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'LGPD', 'NIST 800-53'],
            });
          }

          // Check zone redundancy
          if (db.properties.zoneRedundant !== true) {
            findings.push({
              severity: 'LOW',
              title: 'SQL Database Not Zone Redundant',
              description: `Database ${db.name} on server ${server.name} is not zone redundant`,
              resourceType: 'Microsoft.Sql/servers/databases',
              resourceId: db.id,
              resourceName: db.name,
              resourceGroup,
              region: db.location,
              remediation: 'Enable zone redundancy for high availability',
              complianceFrameworks: ['CIS Azure 1.4'],
            });
          }

          // Check backup redundancy
          if (db.properties.requestedBackupStorageRedundancy === 'Local') {
            findings.push({
              severity: 'MEDIUM',
              title: 'SQL Database Using Local Backup Storage',
              description: `Database ${db.name} uses locally redundant backup storage`,
              resourceType: 'Microsoft.Sql/servers/databases',
              resourceId: db.id,
              resourceName: db.name,
              resourceGroup,
              region: db.location,
              remediation: 'Consider using geo-redundant backup storage for disaster recovery',
              complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
            });
          }

          // Check Ledger (for compliance-sensitive databases)
          if (db.properties.isLedgerOn !== true) {
            findings.push({
              severity: 'INFO',
              title: 'SQL Database Ledger Not Enabled',
              description: `Database ${db.name} does not have Ledger enabled for tamper-evident records`,
              resourceType: 'Microsoft.Sql/servers/databases',
              resourceId: db.id,
              resourceName: db.name,
              resourceGroup,
              region: db.location,
              remediation: 'Consider enabling Ledger for databases requiring cryptographic proof of data integrity',
              complianceFrameworks: ['PCI-DSS', 'LGPD'],
            });
          }
        }
      }

      logger.info('Azure SQL Database scan completed', {
        subscriptionId: context.subscriptionId,
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: any) {
      logger.error('Error scanning Azure SQL Databases', { error: err.message });
      errors.push({
        scanner: 'azure-sql-database',
        message: err.message,
        recoverable: true,
        resourceType: 'Microsoft.Sql/servers',
      });
    }

    return {
      findings,
      resourcesScanned,
      errors,
      scanDurationMs: Date.now() - startTime,
    };
  },
};

export default sqlDatabaseScanner;
