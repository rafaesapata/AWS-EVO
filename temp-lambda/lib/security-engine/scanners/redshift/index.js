"use strict";
/**
 * Security Engine V3 - Redshift Scanner
 * Checks: encryption, VPC, enhanced VPC routing, audit logging, snapshot permissions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedshiftScanner = void 0;
exports.scanRedshift = scanRedshift;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_redshift_1 = require("@aws-sdk/client-redshift");
class RedshiftScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'Redshift'; }
    get category() { return 'Data Security'; }
    async scan() {
        this.log('Starting Redshift security scan');
        const findings = [];
        const client = await this.clientFactory.getRedshiftClient(this.region);
        try {
            const clusters = await client.send(new client_redshift_1.DescribeClustersCommand({}));
            for (const cluster of clusters.Clusters || []) {
                if (!cluster.ClusterIdentifier)
                    continue;
                const clusterArn = this.arnBuilder.redshiftCluster(this.region, cluster.ClusterIdentifier);
                // Check 1: Not encrypted
                if (!cluster.Encrypted) {
                    findings.push(this.createFinding({
                        severity: 'critical',
                        title: `Redshift Cluster Not Encrypted: ${cluster.ClusterIdentifier}`,
                        description: `Cluster ${cluster.ClusterIdentifier} does not have encryption at rest enabled`,
                        analysis: 'CRITICAL: Data warehouse contains sensitive data that must be encrypted.',
                        resource_id: cluster.ClusterIdentifier,
                        resource_arn: clusterArn,
                        scan_type: 'redshift_not_encrypted',
                        compliance: [
                            this.cisCompliance('2.5.1', 'Ensure Redshift clusters are encrypted'),
                            this.pciCompliance('3.4', 'Render PAN unreadable'),
                            this.lgpdCompliance('Art.46', 'Security Measures'),
                        ],
                        remediation: {
                            description: 'Enable encryption by creating a new encrypted cluster and migrating data',
                            steps: ['Create snapshot of current cluster', 'Create new encrypted cluster from snapshot', 'Update applications to use new cluster', 'Delete old cluster'],
                            estimated_effort: 'high',
                            automation_available: false,
                        },
                        evidence: { clusterIdentifier: cluster.ClusterIdentifier, encrypted: false },
                        risk_vector: 'data_exposure',
                    }));
                }
                // Check 2: Publicly accessible
                if (cluster.PubliclyAccessible) {
                    findings.push(this.createFinding({
                        severity: 'critical',
                        title: `Redshift Cluster Publicly Accessible: ${cluster.ClusterIdentifier}`,
                        description: `Cluster ${cluster.ClusterIdentifier} is publicly accessible`,
                        analysis: 'CRITICAL: Data warehouse should not be accessible from the internet.',
                        resource_id: cluster.ClusterIdentifier,
                        resource_arn: clusterArn,
                        scan_type: 'redshift_public',
                        compliance: [
                            this.cisCompliance('2.5.2', 'Ensure Redshift clusters are not publicly accessible'),
                            this.pciCompliance('1.3', 'Prohibit direct public access'),
                        ],
                        remediation: {
                            description: 'Disable public accessibility for the cluster',
                            steps: ['Go to Redshift console', 'Modify cluster', 'Disable publicly accessible'],
                            cli_command: `aws redshift modify-cluster --cluster-identifier ${cluster.ClusterIdentifier} --no-publicly-accessible`,
                            estimated_effort: 'low',
                            automation_available: true,
                        },
                        evidence: { clusterIdentifier: cluster.ClusterIdentifier, publiclyAccessible: true },
                        risk_vector: 'public_exposure',
                    }));
                }
                // Check 3: Enhanced VPC routing not enabled
                if (!cluster.EnhancedVpcRouting) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `Redshift Enhanced VPC Routing Disabled: ${cluster.ClusterIdentifier}`,
                        description: `Cluster ${cluster.ClusterIdentifier} does not have enhanced VPC routing enabled`,
                        analysis: 'Enhanced VPC routing forces all COPY and UNLOAD traffic through VPC.',
                        resource_id: cluster.ClusterIdentifier,
                        resource_arn: clusterArn,
                        scan_type: 'redshift_no_enhanced_vpc',
                        compliance: [
                            this.wellArchitectedCompliance('SEC', 'Protect Networks'),
                        ],
                        remediation: {
                            description: 'Enable enhanced VPC routing',
                            steps: ['Go to Redshift console', 'Modify cluster', 'Enable enhanced VPC routing'],
                            cli_command: `aws redshift modify-cluster --cluster-identifier ${cluster.ClusterIdentifier} --enhanced-vpc-routing`,
                            estimated_effort: 'low',
                            automation_available: true,
                        },
                        evidence: { clusterIdentifier: cluster.ClusterIdentifier, enhancedVpcRouting: false },
                        risk_vector: 'network_security',
                    }));
                }
                // Check 4: Audit logging not enabled
                await this.safeExecute(`logging-${cluster.ClusterIdentifier}`, async () => {
                    const logging = await client.send(new client_redshift_1.DescribeLoggingStatusCommand({
                        ClusterIdentifier: cluster.ClusterIdentifier
                    }));
                    if (!logging.LoggingEnabled) {
                        findings.push(this.createFinding({
                            severity: 'high',
                            title: `Redshift Audit Logging Disabled: ${cluster.ClusterIdentifier}`,
                            description: `Cluster ${cluster.ClusterIdentifier} does not have audit logging enabled`,
                            analysis: 'HIGH RISK: Without audit logging, you cannot track database activity.',
                            resource_id: cluster.ClusterIdentifier,
                            resource_arn: clusterArn,
                            scan_type: 'redshift_no_audit_logging',
                            compliance: [
                                this.cisCompliance('2.5.3', 'Ensure Redshift audit logging is enabled'),
                                this.pciCompliance('10.1', 'Implement audit trails'),
                            ],
                            remediation: {
                                description: 'Enable audit logging for the cluster',
                                steps: ['Go to Redshift console', 'Modify cluster', 'Enable audit logging', 'Specify S3 bucket'],
                                estimated_effort: 'low',
                                automation_available: true,
                            },
                            evidence: { clusterIdentifier: cluster.ClusterIdentifier, loggingEnabled: false },
                            risk_vector: 'audit_gap',
                        }));
                    }
                }, null);
                // Check 5: Automated snapshots disabled
                if (cluster.AutomatedSnapshotRetentionPeriod === 0) {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `Redshift Automated Snapshots Disabled: ${cluster.ClusterIdentifier}`,
                        description: `Cluster ${cluster.ClusterIdentifier} has automated snapshots disabled`,
                        analysis: 'HIGH RISK: Without automated snapshots, data recovery is not possible.',
                        resource_id: cluster.ClusterIdentifier,
                        resource_arn: clusterArn,
                        scan_type: 'redshift_no_snapshots',
                        compliance: [
                            this.wellArchitectedCompliance('REL', 'Back Up Data'),
                        ],
                        remediation: {
                            description: 'Enable automated snapshots',
                            steps: ['Go to Redshift console', 'Modify cluster', 'Set snapshot retention period'],
                            cli_command: `aws redshift modify-cluster --cluster-identifier ${cluster.ClusterIdentifier} --automated-snapshot-retention-period 7`,
                            estimated_effort: 'trivial',
                            automation_available: true,
                        },
                        evidence: { clusterIdentifier: cluster.ClusterIdentifier, snapshotRetention: 0 },
                        risk_vector: 'data_loss',
                    }));
                }
                else if (cluster.AutomatedSnapshotRetentionPeriod && cluster.AutomatedSnapshotRetentionPeriod < 7) {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `Redshift Short Snapshot Retention: ${cluster.ClusterIdentifier}`,
                        description: `Cluster ${cluster.ClusterIdentifier} has snapshot retention of only ${cluster.AutomatedSnapshotRetentionPeriod} days`,
                        analysis: 'Short retention period may not meet compliance requirements.',
                        resource_id: cluster.ClusterIdentifier,
                        resource_arn: clusterArn,
                        scan_type: 'redshift_short_retention',
                        evidence: { clusterIdentifier: cluster.ClusterIdentifier, snapshotRetention: cluster.AutomatedSnapshotRetentionPeriod },
                        risk_vector: 'compliance_gap',
                    }));
                }
                // Check 6: Not in VPC
                if (!cluster.VpcId) {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `Redshift Cluster Not in VPC: ${cluster.ClusterIdentifier}`,
                        description: `Cluster ${cluster.ClusterIdentifier} is not deployed in a VPC`,
                        analysis: 'HIGH RISK: EC2-Classic clusters have limited network security controls.',
                        resource_id: cluster.ClusterIdentifier,
                        resource_arn: clusterArn,
                        scan_type: 'redshift_not_in_vpc',
                        compliance: [
                            this.cisCompliance('2.5.4', 'Ensure Redshift clusters are in VPC'),
                        ],
                        evidence: { clusterIdentifier: cluster.ClusterIdentifier, vpcId: null },
                        risk_vector: 'network_security',
                    }));
                }
                // Check 7: Using default parameter group
                if (cluster.ClusterParameterGroups) {
                    for (const pg of cluster.ClusterParameterGroups) {
                        if (pg.ParameterGroupName === 'default.redshift-1.0') {
                            findings.push(this.createFinding({
                                severity: 'medium',
                                title: `Redshift Using Default Parameter Group: ${cluster.ClusterIdentifier}`,
                                description: `Cluster ${cluster.ClusterIdentifier} is using the default parameter group`,
                                analysis: 'Default parameter groups may not have optimal security settings.',
                                resource_id: cluster.ClusterIdentifier,
                                resource_arn: clusterArn,
                                scan_type: 'redshift_default_parameter_group',
                                evidence: { clusterIdentifier: cluster.ClusterIdentifier, parameterGroup: pg.ParameterGroupName },
                                risk_vector: 'configuration_weakness',
                            }));
                        }
                    }
                }
            }
            // Check snapshots for public access
            await this.safeExecute('snapshots', async () => {
                const snapshots = await client.send(new client_redshift_1.DescribeClusterSnapshotsCommand({ SnapshotType: 'manual' }));
                for (const snapshot of snapshots.Snapshots || []) {
                    if (snapshot.AccountsWithRestoreAccess?.some(a => a.AccountId === 'all')) {
                        findings.push(this.createFinding({
                            severity: 'critical',
                            title: `Redshift Snapshot Public: ${snapshot.SnapshotIdentifier}`,
                            description: `Snapshot ${snapshot.SnapshotIdentifier} is publicly accessible`,
                            analysis: 'CRITICAL: Anyone can restore this snapshot and access the data.',
                            resource_id: snapshot.SnapshotIdentifier,
                            resource_arn: `arn:aws:redshift:${this.region}:${this.accountId}:snapshot:${snapshot.ClusterIdentifier}/${snapshot.SnapshotIdentifier}`,
                            scan_type: 'redshift_snapshot_public',
                            compliance: [
                                this.cisCompliance('2.5.5', 'Ensure Redshift snapshots are not public'),
                            ],
                            evidence: { snapshotIdentifier: snapshot.SnapshotIdentifier, isPublic: true },
                            risk_vector: 'public_exposure',
                        }));
                    }
                }
            }, null);
        }
        catch (error) {
            this.warn('Redshift scan failed', { error: error.message });
        }
        this.log('Redshift scan completed', { findingsCount: findings.length });
        return findings;
    }
}
exports.RedshiftScanner = RedshiftScanner;
async function scanRedshift(region, accountId, credentials, cache) {
    const scanner = new RedshiftScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map