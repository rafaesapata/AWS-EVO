/**
 * Azure Network Security Scanner
 * 
 * Scans Azure Network Security Groups and network configurations including:
 * - NSG rules with 0.0.0.0/0 inbound
 * - Dangerous ports exposed (RDP, SSH, SQL, etc.)
 * - NSG Flow Logs enabled
 * - Azure Firewall configuration
 * - DDoS Protection
 * - Private Endpoints for PaaS
 * - Service Endpoints
 * - VNet peering analysis
 * 
 * Features:
 * - Resource caching to avoid duplicate API calls
 * - Rate limiting to prevent Azure API throttling
 */

import type { AzureScanner, AzureScanContext, AzureScanResult, AzureSecurityFinding, AzureScanError } from '../types.js';
import { logger } from '../../../../logging.js';
import { getGlobalCache, CacheKeys } from '../utils/cache.js';
import { rateLimitedFetch } from '../utils/rate-limiter.js';

// Constants
const AZURE_NETWORK_API_VERSION = '2023-09-01';
const AZURE_MANAGEMENT_BASE_URL = 'https://management.azure.com';

interface NetworkSecurityGroup {
  id: string;
  name: string;
  location: string;
  properties: {
    securityRules?: SecurityRule[];
    defaultSecurityRules?: SecurityRule[];
    networkInterfaces?: { id: string }[];
    subnets?: { id: string }[];
    flowLogs?: { id: string }[];
  };
  tags?: Record<string, string>;
}

interface SecurityRule {
  id?: string;
  name: string;
  properties: {
    protocol: string;
    sourcePortRange?: string;
    destinationPortRange?: string;
    sourcePortRanges?: string[];
    destinationPortRanges?: string[];
    sourceAddressPrefix?: string;
    destinationAddressPrefix?: string;
    sourceAddressPrefixes?: string[];
    destinationAddressPrefixes?: string[];
    access: 'Allow' | 'Deny';
    priority: number;
    direction: 'Inbound' | 'Outbound';
  };
}

interface VirtualNetwork {
  id: string;
  name: string;
  location: string;
  properties: {
    addressSpace?: { addressPrefixes?: string[] };
    subnets?: Subnet[];
    virtualNetworkPeerings?: VNetPeering[];
    enableDdosProtection?: boolean;
    ddosProtectionPlan?: { id: string };
  };
}

interface Subnet {
  id: string;
  name: string;
  properties: {
    addressPrefix?: string;
    networkSecurityGroup?: { id: string };
    serviceEndpoints?: { service: string; locations: string[] }[];
    privateEndpoints?: { id: string }[];
    delegations?: { name: string; properties: { serviceName: string } }[];
  };
}

interface VNetPeering {
  id: string;
  name: string;
  properties: {
    allowVirtualNetworkAccess?: boolean;
    allowForwardedTraffic?: boolean;
    allowGatewayTransit?: boolean;
    useRemoteGateways?: boolean;
    remoteVirtualNetwork?: { id: string };
    peeringState?: string;
  };
}

interface FlowLog {
  id: string;
  name: string;
  location: string;
  properties: {
    targetResourceId: string;
    storageId: string;
    enabled: boolean;
    retentionPolicy?: {
      days: number;
      enabled: boolean;
    };
    flowAnalyticsConfiguration?: {
      networkWatcherFlowAnalyticsConfiguration?: {
        enabled: boolean;
        workspaceId?: string;
        trafficAnalyticsInterval?: number;
      };
    };
  };
}

interface PublicIPAddress {
  id: string;
  name: string;
  location: string;
  properties: {
    ipAddress?: string;
    publicIPAllocationMethod?: string;
    ipConfiguration?: { id: string };
    ddosSettings?: {
      protectionMode?: string;
    };
  };
}

interface AzureFirewall {
  id: string;
  name: string;
  location: string;
  properties: {
    provisioningState?: string;
    threatIntelMode?: string;
    firewallPolicy?: { id: string };
  };
}

// Dangerous ports that should not be exposed to the internet
const DANGEROUS_PORTS: Record<string, { port: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM'; service: string }> = {
  '22': { port: '22', severity: 'HIGH', service: 'SSH' },
  '23': { port: '23', severity: 'CRITICAL', service: 'Telnet' },
  '3389': { port: '3389', severity: 'CRITICAL', service: 'RDP' },
  '1433': { port: '1433', severity: 'CRITICAL', service: 'SQL Server' },
  '1434': { port: '1434', severity: 'CRITICAL', service: 'SQL Server Browser' },
  '3306': { port: '3306', severity: 'CRITICAL', service: 'MySQL' },
  '5432': { port: '5432', severity: 'CRITICAL', service: 'PostgreSQL' },
  '27017': { port: '27017', severity: 'CRITICAL', service: 'MongoDB' },
  '27018': { port: '27018', severity: 'CRITICAL', service: 'MongoDB' },
  '6379': { port: '6379', severity: 'CRITICAL', service: 'Redis' },
  '9200': { port: '9200', severity: 'HIGH', service: 'Elasticsearch' },
  '9300': { port: '9300', severity: 'HIGH', service: 'Elasticsearch' },
  '5601': { port: '5601', severity: 'HIGH', service: 'Kibana' },
  '445': { port: '445', severity: 'CRITICAL', service: 'SMB' },
  '135': { port: '135', severity: 'HIGH', service: 'RPC' },
  '139': { port: '139', severity: 'HIGH', service: 'NetBIOS' },
  '21': { port: '21', severity: 'HIGH', service: 'FTP' },
  '20': { port: '20', severity: 'HIGH', service: 'FTP Data' },
  '25': { port: '25', severity: 'MEDIUM', service: 'SMTP' },
  '110': { port: '110', severity: 'MEDIUM', service: 'POP3' },
  '143': { port: '143', severity: 'MEDIUM', service: 'IMAP' },
  '161': { port: '161', severity: 'HIGH', service: 'SNMP' },
  '162': { port: '162', severity: 'HIGH', service: 'SNMP Trap' },
  '389': { port: '389', severity: 'HIGH', service: 'LDAP' },
  '636': { port: '636', severity: 'MEDIUM', service: 'LDAPS' },
  '1521': { port: '1521', severity: 'CRITICAL', service: 'Oracle DB' },
  '5900': { port: '5900', severity: 'HIGH', service: 'VNC' },
  '11211': { port: '11211', severity: 'HIGH', service: 'Memcached' },
  '2049': { port: '2049', severity: 'HIGH', service: 'NFS' },
};

// Generic Azure API fetch helper with caching and rate limiting
async function fetchAzureResource<T>(
  context: AzureScanContext,
  resourcePath: string,
  cacheKey: string,
  throwOnError = false
): Promise<T[]> {
  const cache = getGlobalCache();
  
  return cache.getOrFetch(cacheKey, async () => {
    const url = `${AZURE_MANAGEMENT_BASE_URL}/subscriptions/${context.subscriptionId}/providers/${resourcePath}?api-version=${AZURE_NETWORK_API_VERSION}`;
    
    try {
      const response = await rateLimitedFetch(url, {
        headers: {
          'Authorization': `Bearer ${context.accessToken}`,
          'Content-Type': 'application/json',
        },
      }, `fetch-${resourcePath}`);

      if (!response.ok) {
        if (throwOnError) {
          throw new Error(`Failed to fetch ${resourcePath}: ${response.status} ${response.statusText}`);
        }
        logger.warn(`Failed to fetch ${resourcePath}`, { status: response.status });
        return [];
      }

      const data = await response.json() as { value?: T[] };
      return data.value || [];
    } catch (err) {
      if (throwOnError) throw err;
      logger.warn(`Error fetching ${resourcePath}`, { error: (err as Error).message });
      return [];
    }
  });
}

async function fetchNSGs(context: AzureScanContext): Promise<NetworkSecurityGroup[]> {
  return fetchAzureResource<NetworkSecurityGroup>(
    context, 
    'Microsoft.Network/networkSecurityGroups', 
    CacheKeys.nsgs(context.subscriptionId),
    true
  );
}

async function fetchVNets(context: AzureScanContext): Promise<VirtualNetwork[]> {
  return fetchAzureResource<VirtualNetwork>(
    context, 
    'Microsoft.Network/virtualNetworks',
    CacheKeys.vnets(context.subscriptionId)
  );
}

async function fetchPublicIPs(context: AzureScanContext): Promise<PublicIPAddress[]> {
  return fetchAzureResource<PublicIPAddress>(
    context, 
    'Microsoft.Network/publicIPAddresses',
    CacheKeys.publicIps(context.subscriptionId)
  );
}

async function fetchAzureFirewalls(context: AzureScanContext): Promise<AzureFirewall[]> {
  return fetchAzureResource<AzureFirewall>(
    context, 
    'Microsoft.Network/azureFirewalls',
    CacheKeys.firewalls(context.subscriptionId)
  );
}

async function fetchFlowLogs(context: AzureScanContext): Promise<FlowLog[]> {
  const cache = getGlobalCache();
  const cacheKey = CacheKeys.flowLogs(context.subscriptionId);
  
  return cache.getOrFetch(cacheKey, async () => {
    const watchers = await fetchAzureResource<{ id: string }>(
      context, 
      'Microsoft.Network/networkWatchers',
      CacheKeys.networkWatchers(context.subscriptionId)
    );
    if (watchers.length === 0) return [];

    const allFlowLogs: FlowLog[] = [];
    
    for (const watcher of watchers) {
      try {
        const flowLogsUrl = `${AZURE_MANAGEMENT_BASE_URL}${watcher.id}/flowLogs?api-version=${AZURE_NETWORK_API_VERSION}`;
        const response = await rateLimitedFetch(flowLogsUrl, {
          headers: {
            'Authorization': `Bearer ${context.accessToken}`,
            'Content-Type': 'application/json',
          },
        }, 'fetchFlowLogs');

        if (response.ok) {
          const data = await response.json() as { value?: FlowLog[] };
          allFlowLogs.push(...(data.value || []));
        }
      } catch (err) {
        logger.warn('Error fetching flow logs for watcher', { watcherId: watcher.id, error: (err as Error).message });
      }
    }

    return allFlowLogs;
  });
}

// Check if a source address is "any" (0.0.0.0/0 or *)
function isAnySource(rule: SecurityRule): boolean {
  const prefix = rule.properties.sourceAddressPrefix;
  const prefixes = rule.properties.sourceAddressPrefixes || [];
  
  return prefix === '*' || 
         prefix === '0.0.0.0/0' || 
         prefix === '::/0' ||
         prefix === 'Internet' ||
         prefixes.includes('*') ||
         prefixes.includes('0.0.0.0/0') ||
         prefixes.includes('::/0') ||
         prefixes.includes('Internet');
}

// Get all destination ports from a rule
function getDestinationPorts(rule: SecurityRule): string[] {
  const ports: string[] = [];
  
  if (rule.properties.destinationPortRange) {
    if (rule.properties.destinationPortRange === '*') {
      ports.push('*');
    } else if (rule.properties.destinationPortRange.includes('-')) {
      // Port range like "1-65535"
      ports.push(rule.properties.destinationPortRange);
    } else {
      ports.push(rule.properties.destinationPortRange);
    }
  }
  
  if (rule.properties.destinationPortRanges) {
    ports.push(...rule.properties.destinationPortRanges);
  }
  
  return ports;
}

// Check if a port is in a range
function isPortInRange(port: string, range: string): boolean {
  if (range === '*') return true;
  if (range === port) return true;
  
  if (range.includes('-')) {
    const [start, end] = range.split('-').map(Number);
    const portNum = Number(port);
    return portNum >= start && portNum <= end;
  }
  
  return false;
}

// Extract resource group from Azure resource ID
function extractResourceGroup(resourceId: string): string {
  return resourceId?.split('/resourceGroups/')[1]?.split('/')[0] || 'unknown';
}

// Special subnets that don't require NSG
const SPECIAL_SUBNETS = ['GatewaySubnet', 'AzureFirewallSubnet', 'AzureBastionSubnet'];

// Analyze NSG rules and return findings
function analyzeNsgRules(
  nsg: NetworkSecurityGroup,
  resourceGroup: string
): AzureSecurityFinding[] {
  const findings: AzureSecurityFinding[] = [];
  const rules = nsg.properties.securityRules || [];

  for (const rule of rules) {
    // Only check inbound Allow rules
    if (rule.properties.direction !== 'Inbound' || rule.properties.access !== 'Allow') {
      continue;
    }

    const isAny = isAnySource(rule);
    const destPorts = getDestinationPorts(rule);

    // Check for any-to-any rule
    if (isAny && destPorts.includes('*')) {
      findings.push({
        severity: 'CRITICAL',
        title: 'NSG Allows All Inbound Traffic',
        description: `NSG ${nsg.name} has rule "${rule.name}" allowing all inbound traffic from any source to any port.`,
        resourceType: 'Microsoft.Network/networkSecurityGroups',
        resourceId: nsg.id,
        resourceName: nsg.name,
        resourceGroup,
        region: nsg.location,
        remediation: 'Remove or restrict this rule to specific source IPs and ports.',
        complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'NIST 800-53'],
        metadata: { ruleName: rule.name, priority: rule.properties.priority },
      });
      continue;
    }

    // Check for 0.0.0.0/0 source with dangerous ports
    if (isAny) {
      findings.push(...analyzeDangerousPorts(nsg, rule, destPorts, resourceGroup));
    }
  }

  return findings;
}

// Analyze dangerous ports exposed to internet
function analyzeDangerousPorts(
  nsg: NetworkSecurityGroup,
  rule: SecurityRule,
  destPorts: string[],
  resourceGroup: string
): AzureSecurityFinding[] {
  const findings: AzureSecurityFinding[] = [];
  const reportedPorts = new Set<string>();

  for (const [portNum, portInfo] of Object.entries(DANGEROUS_PORTS)) {
    for (const destPort of destPorts) {
      if (isPortInRange(portNum, destPort) && !reportedPorts.has(portNum)) {
        reportedPorts.add(portNum);
        findings.push({
          severity: portInfo.severity,
          title: `${portInfo.service} Port Exposed to Internet`,
          description: `NSG ${nsg.name} allows inbound ${portInfo.service} (port ${portNum}) from any source (0.0.0.0/0).`,
          resourceType: 'Microsoft.Network/networkSecurityGroups',
          resourceId: nsg.id,
          resourceName: nsg.name,
          resourceGroup,
          region: nsg.location,
          remediation: `Restrict ${portInfo.service} access to specific IP addresses or use Azure Bastion/VPN.`,
          complianceFrameworks: ['CIS Azure 1.4', 'PCI-DSS', 'NIST 800-53'],
          metadata: { 
            ruleName: rule.name, 
            port: portNum, 
            service: portInfo.service,
            priority: rule.properties.priority,
          },
        });
      }
    }
  }

  // General warning for non-dangerous ports exposed to internet
  if (!destPorts.includes('*')) {
    const nonDangerousPorts = destPorts.filter(p => 
      !Object.keys(DANGEROUS_PORTS).some(dp => isPortInRange(dp, p))
    );
    if (nonDangerousPorts.length > 0) {
      findings.push({
        severity: 'MEDIUM',
        title: 'NSG Rule Allows Internet Access',
        description: `NSG ${nsg.name} rule "${rule.name}" allows inbound traffic from any source (0.0.0.0/0) to ports: ${nonDangerousPorts.join(', ')}.`,
        resourceType: 'Microsoft.Network/networkSecurityGroups',
        resourceId: nsg.id,
        resourceName: nsg.name,
        resourceGroup,
        region: nsg.location,
        remediation: 'Review if internet access is required. Restrict to specific IPs if possible.',
        complianceFrameworks: ['CIS Azure 1.4'],
        metadata: { ruleName: rule.name, ports: nonDangerousPorts },
      });
    }
  }

  return findings;
}

export const networkSecurityScanner: AzureScanner = {
  name: 'azure-network-security',
  description: 'Scans Azure Network Security Groups and network configurations for security issues',
  category: 'Network',

  async scan(context: AzureScanContext): Promise<AzureScanResult> {
    const startTime = Date.now();
    const findings: AzureSecurityFinding[] = [];
    const errors: AzureScanError[] = [];
    let resourcesScanned = 0;

    try {
      logger.info('Starting Network Security scan', { subscriptionId: context.subscriptionId });

      // Fetch all resources in parallel
      const [nsgs, vnets, flowLogs, publicIPs, firewalls] = await Promise.all([
        fetchNSGs(context),
        fetchVNets(context),
        fetchFlowLogs(context),
        fetchPublicIPs(context),
        fetchAzureFirewalls(context),
      ]);

      resourcesScanned = nsgs.length + vnets.length + publicIPs.length;

      // Create a map of NSG IDs to flow logs for quick lookup
      const nsgFlowLogMap = new Map<string, FlowLog>();
      for (const flowLog of flowLogs) {
        nsgFlowLogMap.set(flowLog.properties.targetResourceId, flowLog);
      }

      // Analyze all resource types
      findings.push(...analyzeNSGs(nsgs, nsgFlowLogMap));
      findings.push(...analyzeVNets(vnets));
      findings.push(...analyzeFirewalls(firewalls, vnets.length, context.subscriptionId));
      findings.push(...analyzePublicIPs(publicIPs));

      logger.info('Network Security scan completed', {
        subscriptionId: context.subscriptionId,
        resourcesScanned,
        findingsCount: findings.length,
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error scanning Network Security', { error: errorMessage });
      errors.push({
        scanner: 'azure-network-security',
        message: errorMessage,
        recoverable: true,
        resourceType: 'Microsoft.Network',
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

// Analyze all NSGs
function analyzeNSGs(
  nsgs: NetworkSecurityGroup[],
  nsgFlowLogMap: Map<string, FlowLog>
): AzureSecurityFinding[] {
  const findings: AzureSecurityFinding[] = [];

  for (const nsg of nsgs) {
    const resourceGroup = extractResourceGroup(nsg.id);

    // Check if NSG is associated with anything
    const hasAssociations = (nsg.properties.networkInterfaces?.length || 0) > 0 || 
                           (nsg.properties.subnets?.length || 0) > 0;

    if (!hasAssociations) {
      findings.push({
        severity: 'LOW',
        title: 'Orphaned Network Security Group',
        description: `NSG ${nsg.name} is not associated with any subnet or network interface.`,
        resourceType: 'Microsoft.Network/networkSecurityGroups',
        resourceId: nsg.id,
        resourceName: nsg.name,
        resourceGroup,
        region: nsg.location,
        remediation: 'Associate the NSG with a subnet or NIC, or delete if unused.',
        complianceFrameworks: ['CIS Azure 1.4'],
      });
    }

    // Check Flow Logs
    findings.push(...analyzeFlowLogs(nsg, nsgFlowLogMap.get(nsg.id), resourceGroup));

    // Analyze security rules
    findings.push(...analyzeNsgRules(nsg, resourceGroup));
  }

  return findings;
}

// Analyze Flow Logs configuration
function analyzeFlowLogs(
  nsg: NetworkSecurityGroup,
  flowLog: FlowLog | undefined,
  resourceGroup: string
): AzureSecurityFinding[] {
  const findings: AzureSecurityFinding[] = [];
  const MIN_RETENTION_DAYS = 90;

  if (!flowLog || !flowLog.properties.enabled) {
    findings.push({
      severity: 'MEDIUM',
      title: 'NSG Flow Logs Not Enabled',
      description: `NSG ${nsg.name} does not have Flow Logs enabled for traffic analysis.`,
      resourceType: 'Microsoft.Network/networkSecurityGroups',
      resourceId: nsg.id,
      resourceName: nsg.name,
      resourceGroup,
      region: nsg.location,
      remediation: 'Enable NSG Flow Logs for network traffic monitoring and analysis.',
      complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
    });
    return findings;
  }

  // Check Flow Log retention
  const retention = flowLog.properties.retentionPolicy;
  if (!retention?.enabled || (retention.days && retention.days < MIN_RETENTION_DAYS)) {
    findings.push({
      severity: 'LOW',
      title: 'NSG Flow Logs Short Retention',
      description: `NSG ${nsg.name} Flow Logs retention is less than ${MIN_RETENTION_DAYS} days.`,
      resourceType: 'Microsoft.Network/networkSecurityGroups',
      resourceId: nsg.id,
      resourceName: nsg.name,
      resourceGroup,
      region: nsg.location,
      remediation: `Increase Flow Logs retention to at least ${MIN_RETENTION_DAYS} days.`,
      complianceFrameworks: ['CIS Azure 1.4'],
      metadata: { currentRetention: retention?.days },
    });
  }

  // Check Traffic Analytics
  const trafficAnalytics = flowLog.properties.flowAnalyticsConfiguration?.networkWatcherFlowAnalyticsConfiguration;
  if (!trafficAnalytics?.enabled) {
    findings.push({
      severity: 'LOW',
      title: 'Traffic Analytics Not Enabled',
      description: `NSG ${nsg.name} does not have Traffic Analytics enabled.`,
      resourceType: 'Microsoft.Network/networkSecurityGroups',
      resourceId: nsg.id,
      resourceName: nsg.name,
      resourceGroup,
      region: nsg.location,
      remediation: 'Enable Traffic Analytics for advanced network insights.',
      complianceFrameworks: ['CIS Azure 1.4'],
    });
  }

  return findings;
}

// Analyze VNets
function analyzeVNets(vnets: VirtualNetwork[]): AzureSecurityFinding[] {
  const findings: AzureSecurityFinding[] = [];

  for (const vnet of vnets) {
    const resourceGroup = extractResourceGroup(vnet.id);

    // Check DDoS Protection
    if (!vnet.properties.enableDdosProtection && !vnet.properties.ddosProtectionPlan) {
      findings.push({
        severity: 'MEDIUM',
        title: 'DDoS Protection Not Enabled',
        description: `Virtual Network ${vnet.name} does not have DDoS Protection Standard enabled.`,
        resourceType: 'Microsoft.Network/virtualNetworks',
        resourceId: vnet.id,
        resourceName: vnet.name,
        resourceGroup,
        region: vnet.location,
        remediation: 'Enable DDoS Protection Standard for production workloads.',
        complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
      });
    }

    // Check subnets
    findings.push(...analyzeSubnets(vnet, resourceGroup));

    // Check VNet Peerings
    findings.push(...analyzeVNetPeerings(vnet, resourceGroup));
  }

  return findings;
}

// Analyze subnets
function analyzeSubnets(vnet: VirtualNetwork, resourceGroup: string): AzureSecurityFinding[] {
  const findings: AzureSecurityFinding[] = [];
  const subnets = vnet.properties.subnets || [];

  for (const subnet of subnets) {
    // Skip special subnets
    if (SPECIAL_SUBNETS.includes(subnet.name)) {
      continue;
    }

    // Check if subnet has NSG
    if (!subnet.properties.networkSecurityGroup) {
      findings.push({
        severity: 'HIGH',
        title: 'Subnet Without NSG',
        description: `Subnet ${subnet.name} in VNet ${vnet.name} does not have a Network Security Group attached.`,
        resourceType: 'Microsoft.Network/virtualNetworks/subnets',
        resourceId: subnet.id,
        resourceName: subnet.name,
        resourceGroup,
        region: vnet.location,
        remediation: 'Attach a Network Security Group to control traffic to/from this subnet.',
        complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
      });
    }

    // Check for Service Endpoints (only warn if subnet has delegations)
    const hasDelegations = subnet.properties.delegations && subnet.properties.delegations.length > 0;
    const hasServiceEndpoints = subnet.properties.serviceEndpoints && subnet.properties.serviceEndpoints.length > 0;
    
    if (hasDelegations && !hasServiceEndpoints) {
      findings.push({
        severity: 'LOW',
        title: 'Subnet Without Service Endpoints',
        description: `Subnet ${subnet.name} has delegations but no Service Endpoints configured.`,
        resourceType: 'Microsoft.Network/virtualNetworks/subnets',
        resourceId: subnet.id,
        resourceName: subnet.name,
        resourceGroup,
        region: vnet.location,
        remediation: 'Consider adding Service Endpoints for Azure services used by this subnet.',
        complianceFrameworks: ['CIS Azure 1.4'],
      });
    }
  }

  return findings;
}

// Analyze VNet Peerings
function analyzeVNetPeerings(vnet: VirtualNetwork, resourceGroup: string): AzureSecurityFinding[] {
  const findings: AzureSecurityFinding[] = [];
  const peerings = vnet.properties.virtualNetworkPeerings || [];

  for (const peering of peerings) {
    // Check for overly permissive peering
    if (peering.properties.allowForwardedTraffic && peering.properties.allowGatewayTransit) {
      findings.push({
        severity: 'LOW',
        title: 'VNet Peering with Transit',
        description: `VNet ${vnet.name} peering "${peering.name}" allows both forwarded traffic and gateway transit.`,
        resourceType: 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings',
        resourceId: peering.id,
        resourceName: peering.name,
        resourceGroup,
        region: vnet.location,
        remediation: 'Review if both forwarded traffic and gateway transit are required.',
        complianceFrameworks: ['CIS Azure 1.4'],
      });
    }
  }

  return findings;
}

// Analyze Azure Firewalls
function analyzeFirewalls(
  firewalls: AzureFirewall[],
  vnetCount: number,
  subscriptionId: string
): AzureSecurityFinding[] {
  const findings: AzureSecurityFinding[] = [];

  // Check if any firewall exists
  if (firewalls.length === 0 && vnetCount > 0) {
    findings.push({
      severity: 'MEDIUM',
      title: 'No Azure Firewall Deployed',
      description: 'No Azure Firewall is deployed in this subscription. Consider using Azure Firewall for centralized network security.',
      resourceType: 'Microsoft.Network/azureFirewalls',
      resourceId: `/subscriptions/${subscriptionId}/azureFirewalls`,
      resourceName: 'Azure Firewall',
      remediation: 'Deploy Azure Firewall or a Network Virtual Appliance (NVA) for centralized traffic inspection.',
      complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
    });
  }

  // Check firewall configurations
  for (const firewall of firewalls) {
    const resourceGroup = extractResourceGroup(firewall.id);
    
    if (firewall.properties.threatIntelMode !== 'Deny') {
      findings.push({
        severity: 'MEDIUM',
        title: 'Azure Firewall Threat Intel Not in Deny Mode',
        description: `Azure Firewall ${firewall.name} threat intelligence is not set to Deny mode.`,
        resourceType: 'Microsoft.Network/azureFirewalls',
        resourceId: firewall.id,
        resourceName: firewall.name,
        resourceGroup,
        region: firewall.location,
        remediation: 'Set threat intelligence mode to "Deny" to block known malicious IPs.',
        complianceFrameworks: ['CIS Azure 1.4', 'NIST 800-53'],
        metadata: { currentMode: firewall.properties.threatIntelMode },
      });
    }
  }

  return findings;
}

// Analyze Public IPs
function analyzePublicIPs(publicIPs: PublicIPAddress[]): AzureSecurityFinding[] {
  const findings: AzureSecurityFinding[] = [];

  for (const pip of publicIPs) {
    const resourceGroup = extractResourceGroup(pip.id);

    // Check if public IP is associated
    if (!pip.properties.ipConfiguration) {
      findings.push({
        severity: 'LOW',
        title: 'Unassociated Public IP',
        description: `Public IP ${pip.name} is not associated with any resource.`,
        resourceType: 'Microsoft.Network/publicIPAddresses',
        resourceId: pip.id,
        resourceName: pip.name,
        resourceGroup,
        region: pip.location,
        remediation: 'Delete unused public IPs to reduce attack surface and costs.',
        complianceFrameworks: ['CIS Azure 1.4'],
      });
    }

    // Check DDoS protection on public IP
    if (pip.properties.ddosSettings?.protectionMode !== 'Enabled') {
      findings.push({
        severity: 'LOW',
        title: 'Public IP Without DDoS Protection',
        description: `Public IP ${pip.name} does not have DDoS protection enabled.`,
        resourceType: 'Microsoft.Network/publicIPAddresses',
        resourceId: pip.id,
        resourceName: pip.name,
        resourceGroup,
        region: pip.location,
        remediation: 'Enable DDoS protection for public-facing resources.',
        complianceFrameworks: ['CIS Azure 1.4'],
      });
    }
  }

  return findings;
}

export default networkSecurityScanner;
