/**
 * Security Engine V3 - Network Firewall Scanner
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  ListFirewallsCommand,
  DescribeFirewallCommand,
  DescribeLoggingConfigurationCommand,
  DescribeFirewallPolicyCommand,
} from '@aws-sdk/client-network-firewall';

export class NetworkFirewallScanner extends BaseScanner {
  get serviceName(): string { return 'NetworkFirewall'; }
  get category(): string { return 'Network Security'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting Network Firewall security scan');
    const findings: Finding[] = [];
    const client = await this.clientFactory.getNetworkFirewallClient(this.region);

    try {
      const firewalls = await client.send(new ListFirewallsCommand({}));
      
      if (!firewalls.Firewalls?.length) {
        findings.push(this.createFinding({
          severity: 'info',
          title: `No Network Firewalls: ${this.region}`,
          description: `No AWS Network Firewalls deployed in ${this.region}`,
          analysis: 'Consider deploying Network Firewall for advanced network protection.',
          resource_id: `networkfirewall-${this.region}`,
          resource_arn: `arn:aws:network-firewall:${this.region}:${this.accountId}:firewall`,
          scan_type: 'networkfirewall_none',
          compliance: [this.wellArchitectedCompliance('SEC', 'Protect Networks')],
          evidence: { region: this.region, firewallCount: 0 },
          risk_vector: 'network_security',
        }));
        return findings;
      }

      for (const fw of firewalls.Firewalls || []) {
        if (!fw.FirewallArn || !fw.FirewallName) continue;
        const fwName = fw.FirewallName;
        const fwArn = fw.FirewallArn;

        await this.safeExecute(`firewall-${fwName}`, async () => {
          const details = await client.send(new DescribeFirewallCommand({
            FirewallArn: fwArn
          }));
          const firewall = details.Firewall;
          if (!firewall) return;

          // Check 1: Delete protection not enabled
          if (!firewall.DeleteProtection) {
            findings.push(this.createFinding({
              severity: 'medium',
              title: `Network Firewall No Delete Protection: ${fwName}`,
              description: `Firewall ${fwName} does not have delete protection enabled`,
              analysis: 'Firewall can be accidentally deleted.',
              resource_id: fwName,
              resource_arn: fwArn,
              scan_type: 'networkfirewall_no_delete_protection',
              compliance: [this.wellArchitectedCompliance('REL', 'Prevent Accidental Deletion')],
              remediation: {
                description: 'Enable delete protection',
                steps: ['Go to Network Firewall console', 'Select firewall', 'Enable delete protection'],
                estimated_effort: 'trivial',
                automation_available: true,
              },
              evidence: { firewallName: fwName, deleteProtection: false },
              risk_vector: 'availability',
            }));
          }

          // Check 2: Subnet change protection not enabled
          if (!firewall.SubnetChangeProtection) {
            findings.push(this.createFinding({
              severity: 'low',
              title: `Network Firewall No Subnet Change Protection: ${fwName}`,
              description: `Firewall ${fwName} does not have subnet change protection`,
              analysis: 'Firewall subnet configuration can be accidentally modified.',
              resource_id: fwName,
              resource_arn: fwArn,
              scan_type: 'networkfirewall_no_subnet_protection',
              evidence: { firewallName: fwName, subnetChangeProtection: false },
              risk_vector: 'configuration',
            }));
          }

          // Check 3: Logging not configured
          const logging = await client.send(new DescribeLoggingConfigurationCommand({
            FirewallArn: fwArn
          }));

          if (!logging.LoggingConfiguration?.LogDestinationConfigs?.length) {
            findings.push(this.createFinding({
              severity: 'high',
              title: `Network Firewall No Logging: ${fwName}`,
              description: `Firewall ${fwName} does not have logging configured`,
              analysis: 'HIGH RISK: Cannot audit network traffic or detect threats.',
              resource_id: fwName,
              resource_arn: fwArn,
              scan_type: 'networkfirewall_no_logging',
              compliance: [
                this.cisCompliance('3.1', 'Enable Logging'),
                this.pciCompliance('10.1', 'Implement audit trails'),
              ],
              remediation: {
                description: 'Configure logging for the firewall',
                steps: ['Go to Network Firewall console', 'Select firewall', 'Configure logging'],
                estimated_effort: 'low',
                automation_available: true,
              },
              evidence: { firewallName: fwName, loggingConfigured: false },
              risk_vector: 'audit_gap',
            }));
          } else {
            // Check if ALERT logs are enabled
            const logTypes = logging.LoggingConfiguration.LogDestinationConfigs.map((c: any) => c.LogType);
            if (!logTypes.includes('ALERT')) {
              findings.push(this.createFinding({
                severity: 'medium',
                title: `Network Firewall No Alert Logging: ${fwName}`,
                description: `Firewall ${fwName} does not have ALERT logging enabled`,
                analysis: 'Alert logs are essential for threat detection.',
                resource_id: fwName,
                resource_arn: fwArn,
                scan_type: 'networkfirewall_no_alert_logging',
                evidence: { firewallName: fwName, logTypes },
                risk_vector: 'audit_gap',
              }));
            }
          }

          // Check 4: Firewall policy
          if (firewall.FirewallPolicyArn) {
            const policy = await client.send(new DescribeFirewallPolicyCommand({
              FirewallPolicyArn: firewall.FirewallPolicyArn
            }));

            if (!policy.FirewallPolicy?.StatefulRuleGroupReferences?.length) {
              findings.push(this.createFinding({
                severity: 'medium',
                title: `Network Firewall No Stateful Rules: ${fwName}`,
                description: `Firewall ${fwName} has no stateful rule groups`,
                analysis: 'Stateful rules provide deep packet inspection.',
                resource_id: fwName,
                resource_arn: fwArn,
                scan_type: 'networkfirewall_no_stateful_rules',
                evidence: { firewallName: fwName, statefulRuleCount: 0 },
                risk_vector: 'network_security',
              }));
            }
          }
        }, null);
      }

    } catch (error) {
      this.warn('Network Firewall scan failed', { error: (error as Error).message });
    }

    this.log('Network Firewall scan completed', { findingsCount: findings.length });
    return findings;
  }
}

export async function scanNetworkFirewall(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new NetworkFirewallScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
