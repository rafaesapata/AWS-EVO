/**
 * Security Engine V3 - EKS Scanner
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  EKSClient,
  ListClustersCommand,
  DescribeClusterCommand,
} from '@aws-sdk/client-eks';

export class EKSScanner extends BaseScanner {
  get serviceName(): string { return 'EKS'; }
  get category(): string { return 'Container Security'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting EKS security scan');
    const findings: Finding[] = [];
    const client = await this.clientFactory.getEKSClient(this.region);

    try {
      const response = await client.send(new ListClustersCommand({}));
      for (const clusterName of response.clusters || []) {
        const clusterFindings = await this.checkCluster(client, clusterName);
        findings.push(...clusterFindings);
      }
    } catch (error) {
      this.warn('Failed to list clusters', { error: (error as Error).message });
    }

    this.log('EKS scan completed', { findingsCount: findings.length });
    return findings;
  }

  private async checkCluster(client: EKSClient, clusterName: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    const clusterArn = this.arnBuilder.eksCluster(this.region, clusterName);

    try {
      const details = await client.send(new DescribeClusterCommand({ name: clusterName }));
      const cluster = details.cluster;
      if (!cluster) return findings;

      if (cluster.resourcesVpcConfig?.endpointPublicAccess) {
        findings.push(this.createFinding({
          severity: 'high',
          title: `EKS Public Endpoint Enabled: ${clusterName}`,
          description: 'Cluster API endpoint is publicly accessible',
          analysis: 'HIGH RISK: Kubernetes API can be accessed from internet.',
          resource_id: clusterName,
          resource_arn: clusterArn,
          scan_type: 'eks_public_endpoint',
          compliance: [
            this.cisCompliance('5.4.1', 'Restrict cluster access'),
            this.nistCompliance('SC-7', 'Boundary Protection'),
          ],
          remediation: {
            description: 'Disable public endpoint access',
            steps: ['Go to EKS Console', `Select ${clusterName}`, 'Networking', 'Disable public access'],
            estimated_effort: 'medium',
            automation_available: true,
          },
          evidence: { clusterName, publicAccess: true },
          risk_vector: 'public_exposure',
        }));
      }

      if (!cluster.encryptionConfig || cluster.encryptionConfig.length === 0) {
        findings.push(this.createFinding({
          severity: 'high',
          title: `EKS Secrets Not Encrypted: ${clusterName}`,
          description: 'Kubernetes secrets are not encrypted with KMS',
          analysis: 'HIGH RISK: Secrets stored in etcd are not encrypted.',
          resource_id: clusterName,
          resource_arn: clusterArn,
          scan_type: 'eks_no_secrets_encryption',
          compliance: [
            this.cisCompliance('5.3.1', 'Encrypt secrets at rest'),
            this.pciCompliance('3.4', 'Render PAN unreadable'),
          ],
          evidence: { clusterName, encryptionEnabled: false },
          risk_vector: 'data_exposure',
        }));
      }

      const logging = cluster.logging?.clusterLogging || [];
      const enabledLogs = logging.filter((l: any) => l.enabled).flatMap((l: any) => l.types || []);
      const requiredLogs = ['api', 'audit', 'authenticator'];
      const missingLogs = requiredLogs.filter(l => !enabledLogs.includes(l));

      if (missingLogs.length > 0) {
        findings.push(this.createFinding({
          severity: 'medium',
          title: `EKS Missing Logging: ${clusterName}`,
          description: `Missing log types: ${missingLogs.join(', ')}`,
          analysis: 'Essential logs for security monitoring are not enabled.',
          resource_id: clusterName,
          resource_arn: clusterArn,
          scan_type: 'eks_missing_logging',
          compliance: [
            this.cisCompliance('5.1.1', 'Enable audit logging'),
            this.pciCompliance('10.1', 'Implement audit trails'),
          ],
          evidence: { clusterName, enabledLogs, missingLogs },
          risk_vector: 'no_audit_trail',
        }));
      }

      if (!cluster.identity?.oidc?.issuer) {
        findings.push(this.createFinding({
          severity: 'medium',
          title: `EKS OIDC Not Configured: ${clusterName}`,
          description: 'OIDC provider is not configured for IAM roles for service accounts',
          analysis: 'IRSA provides fine-grained IAM permissions for pods.',
          resource_id: clusterName,
          resource_arn: clusterArn,
          scan_type: 'eks_no_oidc',
          compliance: [this.wellArchitectedCompliance('SEC', 'Use temporary credentials')],
          evidence: { clusterName },
          risk_vector: 'excessive_permissions',
        }));
      }

      const version = cluster.version;
      if (version) {
        const versionNum = parseFloat(version);
        if (versionNum < 1.27) {
          findings.push(this.createFinding({
            severity: 'medium',
            title: `EKS Outdated Version: ${clusterName}`,
            description: `Cluster version ${version} may be approaching end of support`,
            analysis: 'Keep clusters updated for security patches.',
            resource_id: clusterName,
            resource_arn: clusterArn,
            scan_type: 'eks_outdated_version',
            compliance: [this.nistCompliance('SI-2', 'Flaw Remediation')],
            evidence: { clusterName, version },
            risk_vector: 'outdated_software',
          }));
        }
      }
    } catch (error) {
      this.warn(`Failed to describe cluster ${clusterName}`, { error: (error as Error).message });
    }

    return findings;
  }
}

export async function scanEKS(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new EKSScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
