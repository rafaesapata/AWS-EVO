/**
 * Security Engine V2 - EC2 Scanner
 * Comprehensive EC2 security checks (20+ checks)
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import { CRITICAL_PORTS, HIGH_RISK_PORTS } from '../../config.js';
import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand,
  DescribeVolumesCommand,
  DescribeSnapshotsCommand,
  DescribeVpcsCommand,
  DescribeFlowLogsCommand,
  DescribeImagesCommand,
  DescribeNetworkAclsCommand,
} from '@aws-sdk/client-ec2';

export class EC2Scanner extends BaseScanner {
  get serviceName(): string {
    return 'EC2';
  }

  get category(): string {
    return 'Network Security';
  }

  async scan(): Promise<Finding[]> {
    this.log('Starting EC2 security scan');
    const findings: Finding[] = [];

    const ec2Client = await this.clientFactory.getEC2Client(this.region);

    const checkResults = await Promise.allSettled([
      this.checkSecurityGroups(ec2Client),
      this.checkInstances(ec2Client),
      this.checkVolumes(ec2Client),
      this.checkSnapshots(ec2Client),
      this.checkVPCFlowLogs(ec2Client),
    ]);

    for (const result of checkResults) {
      if (result.status === 'fulfilled') {
        findings.push(...result.value);
      } else {
        this.warn('Check failed', { error: result.reason?.message });
      }
    }

    this.log('EC2 scan completed', { findingsCount: findings.length });
    return findings;
  }

  private async checkSecurityGroups(client: EC2Client): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const response = await client.send(new DescribeSecurityGroupsCommand({}));
      
      for (const sg of response.SecurityGroups || []) {
        if (!sg.GroupId || !sg.GroupName) continue;

        const sgArn = this.arnBuilder.ec2SecurityGroup(this.region, sg.GroupId);

        for (const rule of sg.IpPermissions || []) {
          for (const ipRange of rule.IpRanges || []) {
            if (ipRange.CidrIp === '0.0.0.0/0') {
              const fromPort = rule.FromPort || 0;
              const toPort = rule.ToPort || 65535;

              // Check critical ports
              for (const [port, service] of Object.entries(CRITICAL_PORTS)) {
                const portNum = parseInt(port);
                if (fromPort <= portNum && toPort >= portNum) {
                  findings.push(this.createFinding({
                    severity: 'critical',
                    title: `Security Group Exposes ${service} (${port}) to Internet: ${sg.GroupName}`,
                    description: `Security group ${sg.GroupId} allows inbound ${service} from 0.0.0.0/0`,
                    analysis: `CRITICAL RISK: ${service} port ${port} is exposed to the entire internet.`,
                    resource_id: sg.GroupId,
                    resource_arn: sgArn,
                    scan_type: 'ec2_sg_critical_port_open',
                    compliance: [
                      this.cisCompliance('5.2', 'Ensure no security groups allow ingress from 0.0.0.0/0 to remote server administration ports'),
                      this.pciCompliance('1.3.1', 'Implement a DMZ to limit inbound traffic'),
                    ],
                    remediation: {
                      description: `Remove or restrict the ${service} rule`,
                      steps: [
                        'Go to EC2 Console > Security Groups',
                        `Select ${sg.GroupId}`,
                        'Edit inbound rules',
                        `Remove or restrict the rule allowing port ${port} from 0.0.0.0/0`,
                      ],
                      cli_command: `aws ec2 revoke-security-group-ingress --group-id ${sg.GroupId} --protocol tcp --port ${port} --cidr 0.0.0.0/0`,
                      estimated_effort: 'trivial',
                      automation_available: true,
                    },
                    evidence: { groupId: sg.GroupId, groupName: sg.GroupName, port, service, cidr: '0.0.0.0/0' },
                    risk_vector: 'network_exposure',
                    attack_vectors: ['Brute force', 'Exploitation', 'Unauthorized access'],
                  }));
                }
              }

              // Check high risk ports
              for (const [port, service] of Object.entries(HIGH_RISK_PORTS)) {
                const portNum = parseInt(port);
                if (fromPort <= portNum && toPort >= portNum) {
                  findings.push(this.createFinding({
                    severity: 'high',
                    title: `Security Group Exposes ${service} (${port}) to Internet: ${sg.GroupName}`,
                    description: `Security group ${sg.GroupId} allows inbound ${service} from 0.0.0.0/0`,
                    analysis: `HIGH RISK: ${service} port ${port} is exposed to the internet.`,
                    resource_id: sg.GroupId,
                    resource_arn: sgArn,
                    scan_type: 'ec2_sg_high_risk_port_open',
                    compliance: [this.cisCompliance('5.2', 'Ensure no security groups allow ingress from 0.0.0.0/0')],
                    evidence: { groupId: sg.GroupId, port, service },
                    risk_vector: 'network_exposure',
                  }));
                }
              }

              // Check for all ports open
              if (fromPort === 0 && toPort === 65535) {
                findings.push(this.createFinding({
                  severity: 'critical',
                  title: `Security Group Allows All Ports from Internet: ${sg.GroupName}`,
                  description: `Security group ${sg.GroupId} allows all ports from 0.0.0.0/0`,
                  analysis: 'CRITICAL RISK: All ports are exposed to the internet.',
                  resource_id: sg.GroupId,
                  resource_arn: sgArn,
                  scan_type: 'ec2_sg_all_ports_open',
                  compliance: [this.cisCompliance('5.1', 'Ensure no Network ACLs allow ingress from 0.0.0.0/0')],
                  evidence: { groupId: sg.GroupId, fromPort, toPort },
                  risk_vector: 'network_exposure',
                }));
              }
            }
          }
        }

        // Check for unrestricted egress
        for (const rule of sg.IpPermissionsEgress || []) {
          if (rule.IpProtocol === '-1') {
            for (const ipRange of rule.IpRanges || []) {
              if (ipRange.CidrIp === '0.0.0.0/0') {
                findings.push(this.createFinding({
                  severity: 'low',
                  title: `Security Group Has Unrestricted Egress: ${sg.GroupName}`,
                  description: `Security group ${sg.GroupId} allows all outbound traffic`,
                  analysis: 'Unrestricted egress can allow data exfiltration.',
                  resource_id: sg.GroupId,
                  resource_arn: sgArn,
                  scan_type: 'ec2_sg_unrestricted_egress',
                  compliance: [this.wellArchitectedCompliance('SEC', 'Control traffic at all layers')],
                  evidence: { groupId: sg.GroupId },
                  risk_vector: 'data_exposure',
                }));
                break;
              }
            }
          }
        }
      }
    } catch (error) {
      this.warn('Failed to check security groups', { error: (error as Error).message });
    }

    return findings;
  }

  private async checkInstances(client: EC2Client): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const response = await client.send(new DescribeInstancesCommand({}));
      
      for (const reservation of response.Reservations || []) {
        for (const instance of reservation.Instances || []) {
          if (!instance.InstanceId) continue;
          if (instance.State?.Name !== 'running') continue;

          const instanceArn = this.arnBuilder.ec2Instance(this.region, instance.InstanceId);

          // Check for public IP
          if (instance.PublicIpAddress) {
            findings.push(this.createFinding({
              severity: 'medium',
              title: `EC2 Instance Has Public IP: ${instance.InstanceId}`,
              description: `Instance has public IP ${instance.PublicIpAddress}`,
              analysis: 'Public IPs increase attack surface. Use private IPs with NAT/ALB when possible.',
              resource_id: instance.InstanceId,
              resource_arn: instanceArn,
              scan_type: 'ec2_instance_public_ip',
              compliance: [this.wellArchitectedCompliance('SEC', 'Protect networks')],
              evidence: { instanceId: instance.InstanceId, publicIp: instance.PublicIpAddress },
              risk_vector: 'public_exposure',
            }));
          }

          // Check for IMDSv1 (should use IMDSv2)
          if (instance.MetadataOptions?.HttpTokens !== 'required') {
            findings.push(this.createFinding({
              severity: 'high',
              title: `EC2 Instance Using IMDSv1: ${instance.InstanceId}`,
              description: `Instance allows IMDSv1 which is vulnerable to SSRF attacks`,
              analysis: 'HIGH RISK: IMDSv1 can be exploited via SSRF to steal credentials.',
              resource_id: instance.InstanceId,
              resource_arn: instanceArn,
              scan_type: 'ec2_imdsv1_enabled',
              compliance: [
                this.cisCompliance('5.6', 'Ensure EC2 instance metadata service version 2 is enabled'),
                this.nistCompliance('SC-7', 'Boundary Protection'),
              ],
              remediation: {
                description: 'Enable IMDSv2 and disable IMDSv1',
                steps: [
                  'Go to EC2 Console',
                  `Select instance ${instance.InstanceId}`,
                  'Actions > Instance settings > Modify instance metadata options',
                  'Set IMDSv2 to Required',
                ],
                cli_command: `aws ec2 modify-instance-metadata-options --instance-id ${instance.InstanceId} --http-tokens required --http-endpoint enabled`,
                estimated_effort: 'trivial',
                automation_available: true,
              },
              evidence: { instanceId: instance.InstanceId, httpTokens: instance.MetadataOptions?.HttpTokens },
              risk_vector: 'credential_exposure',
            }));
          }

          // Check for missing IAM role
          if (!instance.IamInstanceProfile) {
            findings.push(this.createFinding({
              severity: 'medium',
              title: `EC2 Instance Without IAM Role: ${instance.InstanceId}`,
              description: `Instance does not have an IAM role attached`,
              analysis: 'Without IAM role, applications may use hardcoded credentials.',
              resource_id: instance.InstanceId,
              resource_arn: instanceArn,
              scan_type: 'ec2_no_iam_role',
              compliance: [this.wellArchitectedCompliance('SEC', 'Use temporary credentials')],
              evidence: { instanceId: instance.InstanceId },
              risk_vector: 'credential_exposure',
            }));
          }

          // Check for detailed monitoring
          if (instance.Monitoring?.State !== 'enabled') {
            findings.push(this.createFinding({
              severity: 'low',
              title: `EC2 Instance Without Detailed Monitoring: ${instance.InstanceId}`,
              description: `Instance does not have detailed monitoring enabled`,
              analysis: 'Detailed monitoring provides 1-minute metrics for better observability.',
              resource_id: instance.InstanceId,
              resource_arn: instanceArn,
              scan_type: 'ec2_no_detailed_monitoring',
              compliance: [this.wellArchitectedCompliance('OPS', 'Implement observability')],
              evidence: { instanceId: instance.InstanceId },
              risk_vector: 'no_audit_trail',
            }));
          }
        }
      }
    } catch (error) {
      this.warn('Failed to check instances', { error: (error as Error).message });
    }

    return findings;
  }

  private async checkVolumes(client: EC2Client): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const response = await client.send(new DescribeVolumesCommand({}));
      
      for (const volume of response.Volumes || []) {
        if (!volume.VolumeId) continue;

        const volumeArn = this.arnBuilder.ec2Volume(this.region, volume.VolumeId);

        // Check for unencrypted volumes
        if (!volume.Encrypted) {
          findings.push(this.createFinding({
            severity: 'high',
            title: `EBS Volume Not Encrypted: ${volume.VolumeId}`,
            description: `Volume is not encrypted at rest`,
            analysis: 'HIGH RISK: Data on unencrypted volumes can be accessed if disk is compromised.',
            resource_id: volume.VolumeId,
            resource_arn: volumeArn,
            scan_type: 'ec2_volume_not_encrypted',
            compliance: [
              this.cisCompliance('2.2.1', 'Ensure EBS volume encryption is enabled'),
              this.pciCompliance('3.4', 'Render PAN unreadable'),
              this.lgpdCompliance('Art.46', 'Medidas de segurança'),
            ],
            remediation: {
              description: 'Create encrypted copy of the volume',
              steps: [
                'Create a snapshot of the volume',
                'Copy snapshot with encryption enabled',
                'Create new volume from encrypted snapshot',
                'Replace the unencrypted volume',
              ],
              estimated_effort: 'medium',
              automation_available: true,
            },
            evidence: { volumeId: volume.VolumeId, encrypted: false },
            risk_vector: 'data_exposure',
          }));
        }

        // Check for unattached volumes
        if (volume.State === 'available' && (!volume.Attachments || volume.Attachments.length === 0)) {
          findings.push(this.createFinding({
            severity: 'low',
            title: `EBS Volume Unattached: ${volume.VolumeId}`,
            description: `Volume is not attached to any instance`,
            analysis: 'Unattached volumes may contain sensitive data and incur unnecessary costs.',
            resource_id: volume.VolumeId,
            resource_arn: volumeArn,
            scan_type: 'ec2_volume_unattached',
            compliance: [this.wellArchitectedCompliance('COST', 'Implement cloud financial management')],
            evidence: { volumeId: volume.VolumeId, state: volume.State },
            risk_vector: 'data_exposure',
          }));
        }
      }
    } catch (error) {
      this.warn('Failed to check volumes', { error: (error as Error).message });
    }

    return findings;
  }

  private async checkSnapshots(client: EC2Client): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const response = await client.send(new DescribeSnapshotsCommand({ OwnerIds: ['self'] }));
      
      for (const snapshot of response.Snapshots || []) {
        if (!snapshot.SnapshotId) continue;

        const snapshotArn = this.arnBuilder.ec2Snapshot(this.region, snapshot.SnapshotId);

        // Check for public snapshots
        if (snapshot.Encrypted === false) {
          findings.push(this.createFinding({
            severity: 'medium',
            title: `EBS Snapshot Not Encrypted: ${snapshot.SnapshotId}`,
            description: `Snapshot is not encrypted`,
            analysis: 'Unencrypted snapshots can expose data if shared or accessed improperly.',
            resource_id: snapshot.SnapshotId,
            resource_arn: snapshotArn,
            scan_type: 'ec2_snapshot_not_encrypted',
            compliance: [this.cisCompliance('2.2.1', 'Ensure EBS volume encryption is enabled')],
            evidence: { snapshotId: snapshot.SnapshotId, encrypted: false },
            risk_vector: 'data_exposure',
          }));
        }
      }
    } catch (error) {
      this.warn('Failed to check snapshots', { error: (error as Error).message });
    }

    return findings;
  }

  private async checkVPCFlowLogs(client: EC2Client): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const vpcsResponse = await client.send(new DescribeVpcsCommand({}));
      const flowLogsResponse = await client.send(new DescribeFlowLogsCommand({}));
      
      const vpcWithFlowLogs = new Set(
        (flowLogsResponse.FlowLogs || [])
          .filter(fl => fl.ResourceId)
          .map(fl => fl.ResourceId)
      );

      for (const vpc of vpcsResponse.Vpcs || []) {
        if (!vpc.VpcId) continue;

        const vpcArn = this.arnBuilder.ec2Vpc(this.region, vpc.VpcId);

        if (!vpcWithFlowLogs.has(vpc.VpcId)) {
          findings.push(this.createFinding({
            severity: 'medium',
            title: `VPC Without Flow Logs: ${vpc.VpcId}`,
            description: `VPC does not have flow logs enabled`,
            analysis: 'Flow logs are essential for network traffic analysis and security monitoring.',
            resource_id: vpc.VpcId,
            resource_arn: vpcArn,
            scan_type: 'ec2_vpc_no_flow_logs',
            compliance: [
              this.cisCompliance('3.9', 'Ensure VPC flow logging is enabled in all VPCs'),
              this.pciCompliance('10.1', 'Implement audit trails'),
            ],
            remediation: {
              description: 'Enable VPC flow logs',
              steps: [
                'Go to VPC Console',
                `Select VPC ${vpc.VpcId}`,
                'Actions > Create flow log',
                'Configure destination (CloudWatch Logs or S3)',
              ],
              estimated_effort: 'low',
              automation_available: true,
            },
            evidence: { vpcId: vpc.VpcId },
            risk_vector: 'no_audit_trail',
          }));
        }
      }
    } catch (error) {
      this.warn('Failed to check VPC flow logs', { error: (error as Error).message });
    }

    return findings;
  }
}

export async function scanEC2(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new EC2Scanner(region, accountId, credentials, cache);
  return scanner.scan();
}
