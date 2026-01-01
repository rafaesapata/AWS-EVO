/**
 * Security Engine V3 - Step Functions Scanner
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  ListStateMachinesCommand,
  DescribeStateMachineCommand,
} from '@aws-sdk/client-sfn';

export class StepFunctionsScanner extends BaseScanner {
  get serviceName(): string { return 'StepFunctions'; }
  get category(): string { return 'Compute'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting Step Functions security scan');
    const findings: Finding[] = [];
    const client = await this.clientFactory.getStepFunctionsClient(this.region);

    try {
      const stateMachines = await client.send(new ListStateMachinesCommand({}));
      
      for (const sm of stateMachines.stateMachines || []) {
        if (!sm.stateMachineArn || !sm.name) continue;
        const smName = sm.name;
        const smArn = sm.stateMachineArn;

        await this.safeExecute(`sm-${smName}`, async () => {
          const details = await client.send(new DescribeStateMachineCommand({
            stateMachineArn: smArn
          }));

          // Check 1: No logging configured
          if (!details.loggingConfiguration?.level || details.loggingConfiguration.level === 'OFF') {
            findings.push(this.createFinding({
              severity: 'medium',
              title: `Step Functions No Logging: ${smName}`,
              description: `State machine ${smName} does not have logging enabled`,
              analysis: 'Without logging, you cannot audit workflow executions.',
              resource_id: smName,
              resource_arn: smArn,
              scan_type: 'stepfunctions_no_logging',
              compliance: [
                this.cisCompliance('3.1', 'Enable Logging'),
                this.pciCompliance('10.1', 'Implement audit trails'),
              ],
              remediation: {
                description: 'Enable logging for the state machine',
                steps: ['Go to Step Functions console', 'Edit state machine', 'Enable logging'],
                estimated_effort: 'low',
                automation_available: true,
              },
              evidence: { stateMachineName: smName, loggingLevel: details.loggingConfiguration?.level },
              risk_vector: 'audit_gap',
            }));
          }

          // Check 2: No X-Ray tracing
          if (!details.tracingConfiguration?.enabled) {
            findings.push(this.createFinding({
              severity: 'low',
              title: `Step Functions No Tracing: ${smName}`,
              description: `State machine ${smName} does not have X-Ray tracing enabled`,
              analysis: 'X-Ray tracing helps debug and analyze workflow performance.',
              resource_id: smName,
              resource_arn: smArn,
              scan_type: 'stepfunctions_no_tracing',
              compliance: [this.wellArchitectedCompliance('OPS', 'Understand Workload Health')],
              evidence: { stateMachineName: smName, tracingEnabled: false },
              risk_vector: 'observability',
            }));
          }

          // Check 3: Using EXPRESS type
          if (sm.type === 'EXPRESS') {
            findings.push(this.createFinding({
              severity: 'info',
              title: `Step Functions Express Workflow: ${smName}`,
              description: `State machine ${smName} is an Express workflow`,
              analysis: 'Express workflows have different durability guarantees than Standard.',
              resource_id: smName,
              resource_arn: smArn,
              scan_type: 'stepfunctions_express_type',
              evidence: { stateMachineName: smName, type: sm.type },
              risk_vector: 'configuration',
            }));
          }
        }, null);
      }

    } catch (error) {
      this.warn('Step Functions scan failed', { error: (error as Error).message });
    }

    this.log('Step Functions scan completed', { findingsCount: findings.length });
    return findings;
  }
}

export async function scanStepFunctions(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new StepFunctionsScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
