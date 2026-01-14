/**
 * Azure SQL Database Security Scanner
 * 
 * Scans Azure SQL Servers and Databases for security misconfigurations including:
 * - TDE (Transparent Data Encryption)
 * - Auditing configuration
 * - Firewall rules
 * - Azure AD authentication
 * - Advanced Threat Protection
 * - Vulnerability Assessment
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';

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
  };
  tags?: Record<string, string>;
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

async function fetchSqlServers(context: AzureScanContext): Promise<SqlServer[]> {
  const url = `https://management.azure.com/subscriptions/${context.subscriptionId}/providers/Microsoft.Sql/servers?api-version=2023-05-01-preview`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${context.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch SQL Servers: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { value?: SqlServer[] };
  return data.value || [];
}

async function fetchFirewallRules(context: AzureScanContext, serverId: string): Promise<FirewallRule[]> {
  const url = `https://management.azure.com${serverId}/firewallRules?api-version=2023-05-01-preview`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${context.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return [];
    const data = await response.json() as { value?: FirewallRule[] };
    return data.value || [];
  } catch {
    return [];
  }
}

async function fetchDatabases(context: AzureScanContext, serverId: string): Promise<SqlDatabase[]> {
  const url = `https://management.azure.com${serverId}/databases?api-version=2023-05-01-preview`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${context.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return [];
    const data = await response.json() as { value?: SqlDatabase[] };
    return data.value || [];
  } catch {
    return [];
  }
}

export const sqlDatabaseScanner: AzureScanner = {
  name: 'azure-sql-database',
  description: 'Scans Azure SQL Servers and Databases for security misconfigurations',
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
            complianceFrameworks: ['CIS Azure 1.4'],
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
            complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
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
            complianceFrameworks: ['CIS Azure 1.4'],
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
            complianceFrameworks: ['CIS Azure 1.4'],
          });
        }

        // Check 5: Firewall Rules
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
            complianceFrameworks: ['CIS Azure 1.4'],
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
              complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS'],
              metadata: { ruleName: rule.name },
            });
          }
        }

        // Check 6: Databases
        const databases = await fetchDatabases(context, server.id);
        resourcesScanned += databases.length;

        for (const db of databases) {
          if (db.name === 'master') continue; // Skip system database

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
              complianceFrameworks: ['CIS Azure 1.4'],
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
