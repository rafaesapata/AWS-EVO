/**
 * Security Engine V3 - DynamoDB Scanner
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  DescribeContinuousBackupsCommand,
} from '@aws-sdk/client-dynamodb';

export class DynamoDBScanner extends BaseScanner {
  get serviceName(): string { return 'DynamoDB'; }
  get category(): string { return 'Data Protection'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting DynamoDB security scan');
    const findings: Finding[] = [];
    const client = await this.clientFactory.getDynamoDBClient(this.region);

    try {
      const response = await client.send(new ListTablesCommand({}));
      for (const tableName of response.TableNames || []) {
        const tableFindings = await this.checkTable(client, tableName);
        findings.push(...tableFindings);
      }
    } catch (error) {
      this.warn('Failed to list tables', { error: (error as Error).message });
    }

    this.log('DynamoDB scan completed', { findingsCount: findings.length });
    return findings;
  }

  private async checkTable(client: DynamoDBClient, tableName: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    const tableArn = this.arnBuilder.dynamoDBTable(this.region, tableName);

    try {
      const tableInfo = await client.send(new DescribeTableCommand({ TableName: tableName }));
      const table = tableInfo.Table;
      if (!table) return findings;

      const sseDescription = table.SSEDescription;
      if (!sseDescription || sseDescription.Status !== 'ENABLED') {
        findings.push(this.createFinding({
          severity: 'high',
          title: `DynamoDB Table Not Encrypted: ${tableName}`,
          description: 'Table does not have encryption at rest enabled',
          analysis: 'HIGH RISK: Data is not protected at rest.',
          resource_id: tableName,
          resource_arn: tableArn,
          scan_type: 'dynamodb_not_encrypted',
          compliance: [
            this.cisCompliance('2.4', 'Ensure DynamoDB encryption is enabled'),
            this.pciCompliance('3.4', 'Render PAN unreadable'),
          ],
          evidence: { tableName, encrypted: false },
          risk_vector: 'data_exposure',
        }));
      }

      if (sseDescription?.SSEType === 'AES256') {
        findings.push(this.createFinding({
          severity: 'low',
          title: `DynamoDB Using AWS Managed Key: ${tableName}`,
          description: 'Table uses AWS managed encryption instead of CMK',
          analysis: 'Customer-managed keys provide better control.',
          resource_id: tableName,
          resource_arn: tableArn,
          scan_type: 'dynamodb_aws_managed_key',
          compliance: [this.wellArchitectedCompliance('SEC', 'Protect data at rest')],
          evidence: { tableName, sseType: 'AES256' },
          risk_vector: 'key_management',
        }));
      }

      try {
        const backups = await client.send(new DescribeContinuousBackupsCommand({ TableName: tableName }));
        const pitr = backups.ContinuousBackupsDescription?.PointInTimeRecoveryDescription;
        
        if (pitr?.PointInTimeRecoveryStatus !== 'ENABLED') {
          findings.push(this.createFinding({
            severity: 'medium',
            title: `DynamoDB PITR Not Enabled: ${tableName}`,
            description: 'Point-in-time recovery is not enabled',
            analysis: 'PITR allows recovery from accidental data loss.',
            resource_id: tableName,
            resource_arn: tableArn,
            scan_type: 'dynamodb_no_pitr',
            compliance: [this.wellArchitectedCompliance('REL', 'Protect data')],
            remediation: {
              description: 'Enable point-in-time recovery',
              steps: ['Go to DynamoDB Console', `Select ${tableName}`, 'Backups tab', 'Enable PITR'],
              cli_command: `aws dynamodb update-continuous-backups --table-name ${tableName} --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true`,
              estimated_effort: 'trivial',
              automation_available: true,
            },
            evidence: { tableName, pitrEnabled: false },
            risk_vector: 'data_loss',
          }));
        }
      } catch (e) {
        this.warn(`Failed to check backups for ${tableName}`);
      }

      if (!table.DeletionProtectionEnabled) {
        findings.push(this.createFinding({
          severity: 'low',
          title: `DynamoDB Deletion Protection Disabled: ${tableName}`,
          description: 'Table can be deleted without protection',
          analysis: 'Accidental deletion could cause data loss.',
          resource_id: tableName,
          resource_arn: tableArn,
          scan_type: 'dynamodb_no_deletion_protection',
          compliance: [this.wellArchitectedCompliance('REL', 'Protect data')],
          evidence: { tableName },
          risk_vector: 'data_loss',
        }));
      }
    } catch (error) {
      this.warn(`Failed to describe table ${tableName}`, { error: (error as Error).message });
    }

    return findings;
  }
}

export async function scanDynamoDB(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new DynamoDBScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
