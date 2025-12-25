/**
 * Security Engine V2 - Systems Manager (SSM) Scanner
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  SSMClient,
  DescribeInstanceInformationCommand,
  ListComplianceItemsCommand,
  GetInventoryCommand,
  DescribePatchBaselinesCommand,
  DescribeMaintenanceWindowsCommand,
} from '@aws-sdk/client-ssm';

export class SSMScanner extends BaseScanner {
  get serviceName(): string { return 'SSM'; }
  get category(): string { return 'Operations'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting SSM security scan');
    const findings: Finding[] = [];
    const client = await this.clientFactory.getSSMClient(this.region);

    try {
      // Check managed instances
      const instances = await client.send(new DescribeInstanceInformationCommand({}));
      
      for (const instance of instances.InstanceInformationList || []) {
        if (!instance.InstanceId) continue;

        // Check 1: Instance not managed by SSM
        if (instance.PingStatus !== 'Online') {
          findings.push(this.createFinding({
            severity: 'medium',
            title: `SSM Agent Offline: ${instance.InstanceId}`,
            description: `Instance ${instance.InstanceId} SSM agent is not online`,
            analysis: 'Instance cannot be managed or patched via SSM.',
            resource_id: instance.InstanceId,
            resource_arn: `arn:aws:ec2:${this.region}:${this.accountId}:instance/${instance.InstanceId}`,
            scan_type: 'ssm_agent_offline',
            compliance: [this.nistCompliance('SI-2', 'Flaw Remediation')],
            evidence: { instanceId: instance.InstanceId, pingStatus: instance.PingStatus },
            risk_vector: 'patch_management',
          }));
        }

        // Check 2: Outdated SSM agent
        if (instance.IsLatestVersion === false) {
          findings.push(this.createFinding({
            severity: 'low',
            title: `SSM Agent Outdated: ${instance.InstanceId}`,
            description: `Instance ${instance.InstanceId} has an outdated SSM agent`,
            analysis: 'Outdated agents may have security vulnerabilities.',
            resource_id: instance.InstanceId,
            resource_arn: `arn:aws:ec2:${this.region}:${this.accountId}:instance/${instance.InstanceId}`,
            scan_type: 'ssm_agent_outdated',
            compliance: [this.nistCompliance('SI-2', 'Flaw Remediation')],
            evidence: { instanceId: instance.InstanceId, agentVersion: instance.AgentVersion },
            risk_vector: 'patch_management',
          }));
        }
      }

      // Check 3: No patch baselines
      await this.safeExecute('patch-baselines', async () => {
        const baselines = await client.send(new DescribePatchBaselinesCommand({}));
        const customBaselines = baselines.BaselineIdentities?.filter((b: any) => b.DefaultBaseline === false);
        
        if (!customBaselines?.length) {
          findings.push(this.createFinding({
            severity: 'medium',
            title: `No Custom Patch Baselines: ${this.region}`,
            description: `No custom patch baselines configured in ${this.region}`,
            analysis: 'Custom patch baselines allow fine-grained control over patching.',
            resource_id: `ssm-patch-${this.region}`,
            resource_arn: `arn:aws:ssm:${this.region}:${this.accountId}:patchbaseline`,
            scan_type: 'ssm_no_custom_baselines',
            compliance: [this.cisCompliance('5.3', 'Patch Management')],
            evidence: { region: this.region, customBaselineCount: 0 },
            risk_vector: 'patch_management',
          }));
        }
      }, null);

      // Check 4: No maintenance windows
      await this.safeExecute('maintenance-windows', async () => {
        const windows = await client.send(new DescribeMaintenanceWindowsCommand({}));
        
        if (!windows.WindowIdentities?.length) {
          findings.push(this.createFinding({
            severity: 'low',
            title: `No Maintenance Windows: ${this.region}`,
            description: `No maintenance windows configured in ${this.region}`,
            analysis: 'Maintenance windows help schedule patching during low-impact periods.',
            resource_id: `ssm-maintenance-${this.region}`,
            resource_arn: `arn:aws:ssm:${this.region}:${this.accountId}:maintenancewindow`,
            scan_type: 'ssm_no_maintenance_windows',
            compliance: [this.wellArchitectedCompliance('OPS', 'Prepare for Operations')],
            evidence: { region: this.region, windowCount: 0 },
            risk_vector: 'operations',
          }));
        }
      }, null);

    } catch (error) {
      this.warn('SSM scan failed', { error: (error as Error).message });
    }

    this.log('SSM scan completed', { findingsCount: findings.length });
    return findings;
  }
}

export async function scanSSM(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new SSMScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
