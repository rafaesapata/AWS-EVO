/**
 * Security Engine V2 - Organizations Scanner
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  OrganizationsClient,
  DescribeOrganizationCommand,
  ListPoliciesCommand,
  ListRootsCommand,
  ListAccountsCommand,
} from '@aws-sdk/client-organizations';

export class OrganizationsScanner extends BaseScanner {
  get serviceName(): string { return 'Organizations'; }
  get category(): string { return 'Governance'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting Organizations security scan');
    const findings: Finding[] = [];
    const client = await this.clientFactory.getOrganizationsClient();

    try {
      // Check 1: Organization exists
      const org = await client.send(new DescribeOrganizationCommand({}));
      
      if (!org.Organization) {
        findings.push(this.createFinding({
          severity: 'info',
          title: 'No AWS Organization',
          description: 'This account is not part of an AWS Organization',
          analysis: 'AWS Organizations provides centralized governance and billing.',
          resource_id: `org-${this.accountId}`,
          resource_arn: `arn:aws:organizations::${this.accountId}:account`,
          scan_type: 'organizations_none',
          compliance: [this.wellArchitectedCompliance('SEC', 'Organize Workloads')],
          evidence: { accountId: this.accountId, hasOrganization: false },
          risk_vector: 'governance',
        }));
        return findings;
      }

      const orgId = org.Organization.Id;
      const orgArn = org.Organization.Arn;

      // Check 2: All features not enabled
      if (org.Organization.FeatureSet !== 'ALL') {
        findings.push(this.createFinding({
          severity: 'medium',
          title: 'Organizations All Features Not Enabled',
          description: 'AWS Organizations is not using all features',
          analysis: 'All features mode enables SCPs and other governance controls.',
          resource_id: orgId!,
          resource_arn: orgArn!,
          scan_type: 'organizations_limited_features',
          compliance: [this.cisCompliance('1.1', 'Enable Organizations All Features')],
          remediation: {
            description: 'Enable all features in AWS Organizations',
            steps: ['Go to Organizations console', 'Enable all features'],
            estimated_effort: 'medium',
            automation_available: false,
          },
          evidence: { organizationId: orgId, featureSet: org.Organization.FeatureSet },
          risk_vector: 'governance',
        }));
      }

      // Check 3: Service Control Policies
      await this.safeExecute('scps', async () => {
        const scps = await client.send(new ListPoliciesCommand({
          Filter: 'SERVICE_CONTROL_POLICY'
        }));

        // Only default FullAWSAccess policy
        if (!scps.Policies || scps.Policies.length <= 1) {
          findings.push(this.createFinding({
            severity: 'high',
            title: 'No Custom Service Control Policies',
            description: 'No custom SCPs configured beyond the default',
            analysis: 'HIGH RISK: No guardrails to prevent dangerous actions.',
            resource_id: orgId!,
            resource_arn: orgArn!,
            scan_type: 'organizations_no_scps',
            compliance: [
              this.cisCompliance('1.2', 'Implement Service Control Policies'),
              this.nistCompliance('AC-3', 'Access Enforcement'),
            ],
            remediation: {
              description: 'Create SCPs to restrict dangerous actions',
              steps: ['Go to Organizations console', 'Create SCPs', 'Attach to OUs'],
              estimated_effort: 'medium',
              automation_available: true,
            },
            evidence: { organizationId: orgId, scpCount: scps.Policies?.length || 0 },
            risk_vector: 'access_control',
          }));
        }
      }, null);

      // Check 4: Tag policies
      await this.safeExecute('tag-policies', async () => {
        const tagPolicies = await client.send(new ListPoliciesCommand({
          Filter: 'TAG_POLICY'
        }));

        if (!tagPolicies.Policies?.length) {
          findings.push(this.createFinding({
            severity: 'low',
            title: 'No Tag Policies',
            description: 'No tag policies configured in the organization',
            analysis: 'Tag policies help enforce consistent tagging.',
            resource_id: orgId!,
            resource_arn: orgArn!,
            scan_type: 'organizations_no_tag_policies',
            compliance: [this.wellArchitectedCompliance('COST', 'Implement Cost Allocation')],
            evidence: { organizationId: orgId, tagPolicyCount: 0 },
            risk_vector: 'governance',
          }));
        }
      }, null);

      // Check 5: Backup policies
      await this.safeExecute('backup-policies', async () => {
        const backupPolicies = await client.send(new ListPoliciesCommand({
          Filter: 'BACKUP_POLICY'
        }));

        if (!backupPolicies.Policies?.length) {
          findings.push(this.createFinding({
            severity: 'medium',
            title: 'No Backup Policies',
            description: 'No backup policies configured in the organization',
            analysis: 'Backup policies ensure consistent data protection.',
            resource_id: orgId!,
            resource_arn: orgArn!,
            scan_type: 'organizations_no_backup_policies',
            compliance: [this.wellArchitectedCompliance('REL', 'Back Up Data')],
            evidence: { organizationId: orgId, backupPolicyCount: 0 },
            risk_vector: 'data_loss',
          }));
        }
      }, null);

      // Check 6: AI services opt-out policies
      await this.safeExecute('ai-optout-policies', async () => {
        const aiPolicies = await client.send(new ListPoliciesCommand({
          Filter: 'AISERVICES_OPT_OUT_POLICY'
        }));

        if (!aiPolicies.Policies?.length) {
          findings.push(this.createFinding({
            severity: 'low',
            title: 'No AI Services Opt-Out Policies',
            description: 'No AI services opt-out policies configured',
            analysis: 'Consider opt-out policies for data privacy compliance.',
            resource_id: orgId!,
            resource_arn: orgArn!,
            scan_type: 'organizations_no_ai_optout',
            compliance: [this.lgpdCompliance('Art.7', 'Consent')],
            evidence: { organizationId: orgId, aiOptOutPolicyCount: 0 },
            risk_vector: 'privacy',
          }));
        }
      }, null);

    } catch (error: any) {
      if (error.name === 'AWSOrganizationsNotInUseException') {
        findings.push(this.createFinding({
          severity: 'info',
          title: 'No AWS Organization',
          description: 'This account is not part of an AWS Organization',
          analysis: 'AWS Organizations provides centralized governance.',
          resource_id: `org-${this.accountId}`,
          resource_arn: `arn:aws:organizations::${this.accountId}:account`,
          scan_type: 'organizations_none',
          evidence: { accountId: this.accountId, hasOrganization: false },
          risk_vector: 'governance',
        }));
      } else {
        this.warn('Organizations scan failed', { error: error.message });
      }
    }

    this.log('Organizations scan completed', { findingsCount: findings.length });
    return findings;
  }
}

export async function scanOrganizations(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new OrganizationsScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
