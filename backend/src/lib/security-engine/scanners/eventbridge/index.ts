/**
 * Security Engine V2 - EventBridge Scanner
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  EventBridgeClient,
  ListEventBusesCommand,
  ListRulesCommand,
  DescribeRuleCommand,
  ListTargetsByRuleCommand,
} from '@aws-sdk/client-eventbridge';

export class EventBridgeScanner extends BaseScanner {
  get serviceName(): string { return 'EventBridge'; }
  get category(): string { return 'Integration'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting EventBridge security scan');
    const findings: Finding[] = [];
    const client = await this.clientFactory.getEventBridgeClient(this.region);

    try {
      // Check event buses
      const buses = await client.send(new ListEventBusesCommand({}));
      
      for (const bus of buses.EventBuses || []) {
        if (!bus.Name || !bus.Arn) continue;

        // Check 1: Event bus with open policy
        if (bus.Policy) {
          try {
            const policy = JSON.parse(bus.Policy);
            const hasPublicAccess = policy.Statement?.some((stmt: any) =>
              stmt.Principal === '*' && !stmt.Condition
            );
            
            if (hasPublicAccess) {
              findings.push(this.createFinding({
                severity: 'high',
                title: `EventBridge Bus Public Access: ${bus.Name}`,
                description: `Event bus ${bus.Name} allows public access`,
                analysis: 'HIGH RISK: Anyone can send events to this bus.',
                resource_id: bus.Name,
                resource_arn: bus.Arn,
                scan_type: 'eventbridge_public_bus',
                compliance: [this.nistCompliance('AC-3', 'Access Enforcement')],
                evidence: { busName: bus.Name },
                risk_vector: 'public_exposure',
              }));
            }
          } catch (e) {
            // Policy parse error
          }
        }
      }

      // Check rules on default bus
      const rules = await client.send(new ListRulesCommand({}));
      
      for (const rule of rules.Rules || []) {
        if (!rule.Name || !rule.Arn) continue;

        // Check 2: Disabled rules
        if (rule.State === 'DISABLED') {
          findings.push(this.createFinding({
            severity: 'info',
            title: `EventBridge Rule Disabled: ${rule.Name}`,
            description: `Rule ${rule.Name} is disabled`,
            analysis: 'Disabled rules may indicate incomplete configuration.',
            resource_id: rule.Name,
            resource_arn: rule.Arn,
            scan_type: 'eventbridge_rule_disabled',
            evidence: { ruleName: rule.Name, state: rule.State },
            risk_vector: 'configuration',
          }));
        }

        // Check 3: Rules without targets
        await this.safeExecute(`targets-${rule.Name}`, async () => {
          const targets = await client.send(new ListTargetsByRuleCommand({ Rule: rule.Name }));
          
          if (!targets.Targets?.length) {
            findings.push(this.createFinding({
              severity: 'low',
              title: `EventBridge Rule No Targets: ${rule.Name}`,
              description: `Rule ${rule.Name} has no targets configured`,
              analysis: 'Rules without targets do not perform any actions.',
              resource_id: rule.Name!,
              resource_arn: rule.Arn!,
              scan_type: 'eventbridge_rule_no_targets',
              evidence: { ruleName: rule.Name, targetCount: 0 },
              risk_vector: 'configuration',
            }));
          }
        }, null);
      }

    } catch (error) {
      this.warn('EventBridge scan failed', { error: (error as Error).message });
    }

    this.log('EventBridge scan completed', { findingsCount: findings.length });
    return findings;
  }
}

export async function scanEventBridge(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new EventBridgeScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
