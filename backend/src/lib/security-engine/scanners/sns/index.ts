/**
 * Security Engine V2 - SNS Scanner
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  SNSClient,
  ListTopicsCommand,
  GetTopicAttributesCommand,
} from '@aws-sdk/client-sns';

export class SNSScanner extends BaseScanner {
  get serviceName(): string { return 'SNS'; }
  get category(): string { return 'Data Protection'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting SNS security scan');
    const findings: Finding[] = [];
    const client = await this.clientFactory.getSNSClient(this.region);

    try {
      const response = await client.send(new ListTopicsCommand({}));
      for (const topic of response.Topics || []) {
        if (!topic.TopicArn) continue;
        const topicFindings = await this.checkTopic(client, topic.TopicArn);
        findings.push(...topicFindings);
      }
    } catch (error) {
      this.warn('Failed to list topics', { error: (error as Error).message });
    }

    this.log('SNS scan completed', { findingsCount: findings.length });
    return findings;
  }

  private async checkTopic(client: SNSClient, topicArn: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    const topicName = topicArn.split(':').pop() || topicArn;

    try {
      const attrs = await client.send(new GetTopicAttributesCommand({ TopicArn: topicArn }));
      const attributes = attrs.Attributes || {};

      if (!attributes.KmsMasterKeyId) {
        findings.push(this.createFinding({
          severity: 'medium',
          title: `SNS Topic Not Encrypted: ${topicName}`,
          description: 'Topic does not have server-side encryption enabled',
          analysis: 'Messages in transit and at rest should be encrypted.',
          resource_id: topicName,
          resource_arn: topicArn,
          scan_type: 'sns_not_encrypted',
          compliance: [
            this.pciCompliance('3.4', 'Render PAN unreadable'),
            this.lgpdCompliance('Art.46', 'Medidas de segurança'),
          ],
          remediation: {
            description: 'Enable encryption for the topic',
            steps: ['Go to SNS Console', `Select ${topicName}`, 'Edit', 'Enable encryption'],
            estimated_effort: 'trivial',
            automation_available: true,
          },
          evidence: { topicName, encrypted: false },
          risk_vector: 'data_exposure',
        }));
      }

      if (attributes.Policy) {
        try {
          const policy = JSON.parse(attributes.Policy);
          for (const statement of policy.Statement || []) {
            if (statement.Effect === 'Allow' && statement.Principal === '*' && !statement.Condition) {
              findings.push(this.createFinding({
                severity: 'high',
                title: `SNS Topic Has Public Policy: ${topicName}`,
                description: 'Topic policy allows public access',
                analysis: 'HIGH RISK: Anyone can publish or subscribe to this topic.',
                resource_id: topicName,
                resource_arn: topicArn,
                scan_type: 'sns_public_policy',
                compliance: [this.nistCompliance('AC-3', 'Access Enforcement')],
                evidence: { topicName, statement },
                risk_vector: 'public_exposure',
              }));
            }
          }
        } catch (e) {
          this.warn(`Failed to parse policy for ${topicName}`);
        }
      }
    } catch (error) {
      this.warn(`Failed to get topic attributes ${topicName}`, { error: (error as Error).message });
    }

    return findings;
  }
}

export async function scanSNS(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new SNSScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
