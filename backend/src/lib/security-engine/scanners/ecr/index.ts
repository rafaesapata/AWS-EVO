/**
 * Security Engine V3 - ECR Scanner
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  ECRClient,
  DescribeRepositoriesCommand,
  GetRepositoryPolicyCommand,
  GetLifecyclePolicyCommand,
} from '@aws-sdk/client-ecr';

export class ECRScanner extends BaseScanner {
  get serviceName(): string { return 'ECR'; }
  get category(): string { return 'Container Security'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting ECR security scan');
    const findings: Finding[] = [];
    const client = await this.clientFactory.getECRClient(this.region);

    try {
      const repos = await client.send(new DescribeRepositoriesCommand({}));
      
      for (const repo of repos.repositories || []) {
        if (!repo.repositoryName || !repo.repositoryArn) continue;
        const repoFindings = await this.checkRepository(client, repo);
        findings.push(...repoFindings);
      }
    } catch (error) {
      this.warn('ECR scan failed', { error: (error as Error).message });
    }

    this.log('ECR scan completed', { findingsCount: findings.length });
    return findings;
  }

  private async checkRepository(client: ECRClient, repo: any): Promise<Finding[]> {
    const findings: Finding[] = [];
    const repoName = repo.repositoryName;
    const repoArn = repo.repositoryArn;

    // Check 1: Image scanning not enabled
    if (!repo.imageScanningConfiguration?.scanOnPush) {
      findings.push(this.createFinding({
        severity: 'high',
        title: `ECR Image Scanning Disabled: ${repoName}`,
        description: `Repository ${repoName} does not have automatic image scanning enabled`,
        analysis: 'HIGH RISK: Container images may contain known vulnerabilities.',
        resource_id: repoName,
        resource_arn: repoArn,
        scan_type: 'ecr_no_image_scanning',
        compliance: [
          this.cisCompliance('5.1', 'Enable ECR Image Scanning'),
          this.nistCompliance('SI-2', 'Flaw Remediation'),
        ],
        remediation: {
          description: 'Enable image scanning on push',
          steps: ['Go to ECR console', 'Select repository', 'Edit settings', 'Enable scan on push'],
          cli_command: `aws ecr put-image-scanning-configuration --repository-name ${repoName} --image-scanning-configuration scanOnPush=true`,
          estimated_effort: 'trivial',
          automation_available: true,
        },
        evidence: { repositoryName: repoName, scanOnPush: false },
        risk_vector: 'vulnerability_management',
      }));
    }

    // Check 2: Immutable tags not enabled
    if (repo.imageTagMutability !== 'IMMUTABLE') {
      findings.push(this.createFinding({
        severity: 'medium',
        title: `ECR Mutable Tags: ${repoName}`,
        description: `Repository ${repoName} allows mutable image tags`,
        analysis: 'Image tags can be overwritten, potentially replacing secure images.',
        resource_id: repoName,
        resource_arn: repoArn,
        scan_type: 'ecr_mutable_tags',
        compliance: [this.wellArchitectedCompliance('SEC-6', 'Protect Compute')],
        remediation: {
          description: 'Enable immutable tags',
          steps: ['Go to ECR console', 'Select repository', 'Edit settings', 'Set tag immutability'],
          cli_command: `aws ecr put-image-tag-mutability --repository-name ${repoName} --image-tag-mutability IMMUTABLE`,
          estimated_effort: 'trivial',
          automation_available: true,
        },
        evidence: { repositoryName: repoName, imageTagMutability: repo.imageTagMutability },
        risk_vector: 'supply_chain',
      }));
    }

    // Check 3: No KMS encryption
    if (repo.encryptionConfiguration?.encryptionType !== 'KMS') {
      findings.push(this.createFinding({
        severity: 'medium',
        title: `ECR Not Using KMS Encryption: ${repoName}`,
        description: `Repository ${repoName} is not using KMS encryption`,
        analysis: 'KMS provides better control over encryption keys.',
        resource_id: repoName,
        resource_arn: repoArn,
        scan_type: 'ecr_no_kms_encryption',
        compliance: [this.pciCompliance('3.4', 'Render PAN unreadable')],
        evidence: { repositoryName: repoName, encryptionType: repo.encryptionConfiguration?.encryptionType },
        risk_vector: 'data_exposure',
      }));
    }

    // Check 4: No lifecycle policy
    try {
      await client.send(new GetLifecyclePolicyCommand({ repositoryName: repoName }));
    } catch (e: any) {
      if (e.name === 'LifecyclePolicyNotFoundException') {
        findings.push(this.createFinding({
          severity: 'low',
          title: `ECR No Lifecycle Policy: ${repoName}`,
          description: `Repository ${repoName} has no lifecycle policy`,
          analysis: 'Old images accumulate without lifecycle policies.',
          resource_id: repoName,
          resource_arn: repoArn,
          scan_type: 'ecr_no_lifecycle_policy',
          compliance: [this.wellArchitectedCompliance('COST-5', 'Manage Demand')],
          evidence: { repositoryName: repoName, hasLifecyclePolicy: false },
          risk_vector: 'cost_optimization',
        }));
      }
    }

    // Check 5: Public repository policy
    try {
      const policy = await client.send(new GetRepositoryPolicyCommand({ repositoryName: repoName }));
      if (policy.policyText) {
        const policyDoc = JSON.parse(policy.policyText);
        const hasPublicAccess = policyDoc.Statement?.some((stmt: any) => 
          stmt.Principal === '*' || stmt.Principal?.AWS === '*'
        );
        if (hasPublicAccess) {
          findings.push(this.createFinding({
            severity: 'critical',
            title: `ECR Public Repository Policy: ${repoName}`,
            description: `Repository ${repoName} has a policy allowing public access`,
            analysis: 'CRITICAL: Anyone can pull images from this repository.',
            resource_id: repoName,
            resource_arn: repoArn,
            scan_type: 'ecr_public_policy',
            compliance: [this.cisCompliance('5.2', 'Restrict ECR Access')],
            evidence: { repositoryName: repoName },
            risk_vector: 'public_exposure',
          }));
        }
      }
    } catch (e) {
      // No policy - OK
    }

    return findings;
  }
}

export async function scanECR(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new ECRScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
