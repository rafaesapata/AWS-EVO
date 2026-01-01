/**
 * Security Engine V3 - CloudTrail Scanner
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  CloudTrailClient,
  DescribeTrailsCommand,
  GetTrailStatusCommand,
  GetEventSelectorsCommand,
} from '@aws-sdk/client-cloudtrail';

export class CloudTrailScanner extends BaseScanner {
  get serviceName(): string { return 'CloudTrail'; }
  get category(): string { return 'Logging & Monitoring'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting CloudTrail security scan');
    const findings: Finding[] = [];
    const client = await this.clientFactory.getCloudTrailClient(this.region);

    try {
      const response = await client.send(new DescribeTrailsCommand({}));
      const trails = response.trailList || [];

      if (trails.length === 0) {
        findings.push(this.createFinding({
          severity: 'critical',
          title: 'No CloudTrail Trails Configured',
          description: 'No CloudTrail trails found in this region',
          analysis: 'CRITICAL: No audit logging. All API activity is untracked.',
          resource_id: 'cloudtrail',
          resource_arn: `arn:aws:cloudtrail:${this.region}:${this.accountId}:trail/*`,
          scan_type: 'cloudtrail_no_trails',
          compliance: [
            this.cisCompliance('3.1', 'Ensure CloudTrail is enabled'),
            this.pciCompliance('10.1', 'Implement audit trails'),
          ],
          evidence: { trailCount: 0 },
          risk_vector: 'no_audit_trail',
        }));
      }

      for (const trail of trails) {
        if (!trail.Name || !trail.TrailARN) continue;
        const trailFindings = await this.checkTrail(client, trail);
        findings.push(...trailFindings);
      }
    } catch (error) {
      this.warn('Failed to describe trails', { error: (error as Error).message });
    }

    this.log('CloudTrail scan completed', { findingsCount: findings.length });
    return findings;
  }

  private async checkTrail(client: CloudTrailClient, trail: any): Promise<Finding[]> {
    const findings: Finding[] = [];
    const trailArn = trail.TrailARN;
    const trailName = trail.Name;

    try {
      const status = await client.send(new GetTrailStatusCommand({ Name: trailName }));
      
      if (!status.IsLogging) {
        findings.push(this.createFinding({
          severity: 'critical',
          title: `CloudTrail Not Logging: ${trailName}`,
          description: 'Trail is not actively logging events',
          analysis: 'CRITICAL: API activity is not being recorded.',
          resource_id: trailName,
          resource_arn: trailArn,
          scan_type: 'cloudtrail_not_logging',
          compliance: [this.cisCompliance('3.1', 'Ensure CloudTrail is enabled')],
          evidence: { trailName, isLogging: false },
          risk_vector: 'no_audit_trail',
        }));
      }
    } catch (e) {
      this.warn(`Failed to get trail status: ${trailName}`);
    }

    if (!trail.IsMultiRegionTrail) {
      findings.push(this.createFinding({
        severity: 'medium',
        title: `CloudTrail Not Multi-Region: ${trailName}`,
        description: 'Trail only logs events in one region',
        analysis: 'Activity in other regions will not be logged.',
        resource_id: trailName,
        resource_arn: trailArn,
        scan_type: 'cloudtrail_not_multi_region',
        compliance: [this.cisCompliance('3.1', 'Ensure CloudTrail is enabled in all regions')],
        evidence: { trailName, isMultiRegion: false },
        risk_vector: 'incomplete_audit',
      }));
    }

    if (!trail.LogFileValidationEnabled) {
      findings.push(this.createFinding({
        severity: 'medium',
        title: `CloudTrail Log Validation Disabled: ${trailName}`,
        description: 'Log file integrity validation is not enabled',
        analysis: 'Logs could be tampered with without detection.',
        resource_id: trailName,
        resource_arn: trailArn,
        scan_type: 'cloudtrail_no_validation',
        compliance: [this.cisCompliance('3.2', 'Ensure CloudTrail log file validation is enabled')],
        evidence: { trailName },
        risk_vector: 'log_tampering',
      }));
    }

    if (!trail.KMSKeyId) {
      findings.push(this.createFinding({
        severity: 'medium',
        title: `CloudTrail Not Encrypted with KMS: ${trailName}`,
        description: 'Trail logs are not encrypted with KMS',
        analysis: 'Logs should be encrypted with customer-managed KMS key.',
        resource_id: trailName,
        resource_arn: trailArn,
        scan_type: 'cloudtrail_no_kms',
        compliance: [this.cisCompliance('3.7', 'Ensure CloudTrail logs are encrypted at rest using KMS CMKs')],
        evidence: { trailName },
        risk_vector: 'data_exposure',
      }));
    }

    try {
      const selectors = await client.send(new GetEventSelectorsCommand({ TrailName: trailName }));
      const hasManagementEvents = selectors.EventSelectors?.some(s => s.IncludeManagementEvents);
      
      if (!hasManagementEvents) {
        findings.push(this.createFinding({
          severity: 'high',
          title: `CloudTrail Missing Management Events: ${trailName}`,
          description: 'Trail is not logging management events',
          analysis: 'HIGH RISK: Administrative actions are not being logged.',
          resource_id: trailName,
          resource_arn: trailArn,
          scan_type: 'cloudtrail_no_management_events',
          compliance: [this.cisCompliance('3.1', 'Ensure CloudTrail is enabled')],
          evidence: { trailName },
          risk_vector: 'no_audit_trail',
        }));
      }
    } catch (e) {
      this.warn(`Failed to get event selectors: ${trailName}`);
    }

    return findings;
  }
}

export async function scanCloudTrail(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new CloudTrailScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
