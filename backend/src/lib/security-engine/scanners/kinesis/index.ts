/**
 * Security Engine V2 - Kinesis Scanner
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  KinesisClient,
  ListStreamsCommand,
  DescribeStreamSummaryCommand,
} from '@aws-sdk/client-kinesis';
import {
  FirehoseClient,
  ListDeliveryStreamsCommand,
  DescribeDeliveryStreamCommand,
} from '@aws-sdk/client-firehose';

export class KinesisScanner extends BaseScanner {
  get serviceName(): string { return 'Kinesis'; }
  get category(): string { return 'Analytics'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting Kinesis security scan');
    const findings: Finding[] = [];
    const kinesisClient = await this.clientFactory.getKinesisClient(this.region);
    const firehoseClient = await this.clientFactory.getFirehoseClient(this.region);

    try {
      // Check Kinesis Data Streams
      const streams = await kinesisClient.send(new ListStreamsCommand({}));
      
      for (const streamName of streams.StreamNames || []) {
        await this.safeExecute(`stream-${streamName}`, async () => {
          const details = await kinesisClient.send(new DescribeStreamSummaryCommand({
            StreamName: streamName
          }));
          const summary = details.StreamDescriptionSummary;
          if (!summary) return;

          const streamArn = summary.StreamARN || this.arnBuilder.kinesisStream(this.region, streamName);

          // Check 1: Not encrypted
          if (summary.EncryptionType !== 'KMS') {
            findings.push(this.createFinding({
              severity: 'high',
              title: `Kinesis Stream Not Encrypted: ${streamName}`,
              description: `Stream ${streamName} is not encrypted with KMS`,
              analysis: 'HIGH RISK: Data in transit and at rest is not encrypted.',
              resource_id: streamName,
              resource_arn: streamArn,
              scan_type: 'kinesis_not_encrypted',
              compliance: [
                this.cisCompliance('2.6', 'Ensure Kinesis streams are encrypted'),
                this.pciCompliance('3.4', 'Render PAN unreadable'),
              ],
              remediation: {
                description: 'Enable server-side encryption for the stream',
                steps: ['Go to Kinesis console', 'Select stream', 'Enable encryption'],
                cli_command: `aws kinesis start-stream-encryption --stream-name ${streamName} --encryption-type KMS --key-id alias/aws/kinesis`,
                estimated_effort: 'low',
                automation_available: true,
              },
              evidence: { streamName, encryptionType: summary.EncryptionType },
              risk_vector: 'data_exposure',
            }));
          }

          // Check 2: Single shard (no redundancy)
          if (summary.OpenShardCount === 1) {
            findings.push(this.createFinding({
              severity: 'low',
              title: `Kinesis Stream Single Shard: ${streamName}`,
              description: `Stream ${streamName} has only one shard`,
              analysis: 'Single shard limits throughput and provides no redundancy.',
              resource_id: streamName,
              resource_arn: streamArn,
              scan_type: 'kinesis_single_shard',
              compliance: [this.wellArchitectedCompliance('REL', 'Design for Reliability')],
              evidence: { streamName, shardCount: summary.OpenShardCount },
              risk_vector: 'availability',
            }));
          }

          // Check 3: Short retention period
          if (summary.RetentionPeriodHours && summary.RetentionPeriodHours < 48) {
            findings.push(this.createFinding({
              severity: 'low',
              title: `Kinesis Stream Short Retention: ${streamName}`,
              description: `Stream ${streamName} has retention of only ${summary.RetentionPeriodHours} hours`,
              analysis: 'Short retention may not allow for replay in case of issues.',
              resource_id: streamName,
              resource_arn: streamArn,
              scan_type: 'kinesis_short_retention',
              evidence: { streamName, retentionHours: summary.RetentionPeriodHours },
              risk_vector: 'data_loss',
            }));
          }
        }, null);
      }

      // Check Kinesis Firehose
      const firehoseStreams = await firehoseClient.send(new ListDeliveryStreamsCommand({}));
      
      for (const deliveryStreamName of firehoseStreams.DeliveryStreamNames || []) {
        await this.safeExecute(`firehose-${deliveryStreamName}`, async () => {
          const details = await firehoseClient.send(new DescribeDeliveryStreamCommand({
            DeliveryStreamName: deliveryStreamName
          }));
          const stream = details.DeliveryStreamDescription;
          if (!stream) return;

          const streamArn = stream.DeliveryStreamARN || this.arnBuilder.kinesisFirehose(this.region, deliveryStreamName);

          // Check 4: Firehose not encrypted
          if (!stream.DeliveryStreamEncryptionConfiguration?.Status || 
              stream.DeliveryStreamEncryptionConfiguration.Status !== 'ENABLED') {
            findings.push(this.createFinding({
              severity: 'high',
              title: `Firehose Not Encrypted: ${deliveryStreamName}`,
              description: `Delivery stream ${deliveryStreamName} is not encrypted`,
              analysis: 'HIGH RISK: Data is not encrypted at rest.',
              resource_id: deliveryStreamName,
              resource_arn: streamArn,
              scan_type: 'firehose_not_encrypted',
              compliance: [this.pciCompliance('3.4', 'Render PAN unreadable')],
              evidence: { deliveryStreamName, encryptionStatus: stream.DeliveryStreamEncryptionConfiguration?.Status },
              risk_vector: 'data_exposure',
            }));
          }
        }, null);
      }

    } catch (error) {
      this.warn('Kinesis scan failed', { error: (error as Error).message });
    }

    this.log('Kinesis scan completed', { findingsCount: findings.length });
    return findings;
  }
}

export async function scanKinesis(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new KinesisScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
