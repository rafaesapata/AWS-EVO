"use strict";
/**
 * Security Engine V2 - RDS Scanner
 * Comprehensive RDS security checks (15+ checks)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RDSScanner = void 0;
exports.scanRDS = scanRDS;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_rds_1 = require("@aws-sdk/client-rds");
class RDSScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'RDS'; }
    get category() { return 'Data Protection'; }
    async scan() {
        this.log('Starting RDS security scan');
        const findings = [];
        const rdsClient = await this.clientFactory.getRDSClient(this.region);
        const checkResults = await Promise.allSettled([
            this.checkDBInstances(rdsClient),
            this.checkDBClusters(rdsClient),
            this.checkSnapshots(rdsClient),
        ]);
        for (const result of checkResults) {
            if (result.status === 'fulfilled')
                findings.push(...result.value);
            else
                this.warn('Check failed', { error: result.reason?.message });
        }
        this.log('RDS scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkDBInstances(client) {
        const findings = [];
        try {
            const response = await client.send(new client_rds_1.DescribeDBInstancesCommand({}));
            for (const db of response.DBInstances || []) {
                if (!db.DBInstanceIdentifier)
                    continue;
                const dbArn = db.DBInstanceArn || this.arnBuilder.rdsInstance(this.region, db.DBInstanceIdentifier);
                if (db.PubliclyAccessible) {
                    findings.push(this.createFinding({
                        severity: 'critical',
                        title: `RDS Instance Publicly Accessible: ${db.DBInstanceIdentifier}`,
                        description: `Database instance is publicly accessible from the internet`,
                        analysis: 'CRITICAL RISK: Database can be accessed from any IP address.',
                        resource_id: db.DBInstanceIdentifier,
                        resource_arn: dbArn,
                        scan_type: 'rds_publicly_accessible',
                        compliance: [
                            this.cisCompliance('2.3.1', 'Ensure RDS instances are not publicly accessible'),
                            this.pciCompliance('1.3', 'Prohibit direct public access'),
                        ],
                        remediation: {
                            description: 'Disable public accessibility',
                            steps: ['Go to RDS Console', `Select ${db.DBInstanceIdentifier}`, 'Modify', 'Disable Public accessibility'],
                            cli_command: `aws rds modify-db-instance --db-instance-identifier ${db.DBInstanceIdentifier} --no-publicly-accessible`,
                            estimated_effort: 'low',
                            automation_available: true,
                        },
                        evidence: { dbIdentifier: db.DBInstanceIdentifier, publiclyAccessible: true },
                        risk_vector: 'public_exposure',
                    }));
                }
                if (!db.StorageEncrypted) {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `RDS Instance Not Encrypted: ${db.DBInstanceIdentifier}`,
                        description: `Database storage is not encrypted at rest`,
                        analysis: 'HIGH RISK: Data can be accessed if storage is compromised.',
                        resource_id: db.DBInstanceIdentifier,
                        resource_arn: dbArn,
                        scan_type: 'rds_not_encrypted',
                        compliance: [
                            this.cisCompliance('2.3.1', 'Ensure RDS encryption is enabled'),
                            this.pciCompliance('3.4', 'Render PAN unreadable'),
                            this.lgpdCompliance('Art.46', 'Medidas de segurança'),
                        ],
                        evidence: { dbIdentifier: db.DBInstanceIdentifier, encrypted: false },
                        risk_vector: 'data_exposure',
                    }));
                }
                if (!db.MultiAZ) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `RDS Instance Not Multi-AZ: ${db.DBInstanceIdentifier}`,
                        description: `Database is not configured for Multi-AZ deployment`,
                        analysis: 'Single-AZ deployment has no automatic failover capability.',
                        resource_id: db.DBInstanceIdentifier,
                        resource_arn: dbArn,
                        scan_type: 'rds_no_multi_az',
                        compliance: [this.wellArchitectedCompliance('REL', 'Design for failure')],
                        evidence: { dbIdentifier: db.DBInstanceIdentifier, multiAZ: false },
                        risk_vector: 'availability',
                    }));
                }
                if (!db.AutoMinorVersionUpgrade) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `RDS Auto Minor Version Upgrade Disabled: ${db.DBInstanceIdentifier}`,
                        description: `Automatic minor version upgrades are disabled`,
                        analysis: 'Security patches may not be applied automatically.',
                        resource_id: db.DBInstanceIdentifier,
                        resource_arn: dbArn,
                        scan_type: 'rds_no_auto_upgrade',
                        compliance: [this.nistCompliance('SI-2', 'Flaw Remediation')],
                        evidence: { dbIdentifier: db.DBInstanceIdentifier },
                        risk_vector: 'outdated_software',
                    }));
                }
                if (!db.DeletionProtection) {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `RDS Deletion Protection Disabled: ${db.DBInstanceIdentifier}`,
                        description: `Database can be deleted without protection`,
                        analysis: 'Accidental deletion could cause data loss.',
                        resource_id: db.DBInstanceIdentifier,
                        resource_arn: dbArn,
                        scan_type: 'rds_no_deletion_protection',
                        compliance: [this.wellArchitectedCompliance('REL', 'Protect data')],
                        evidence: { dbIdentifier: db.DBInstanceIdentifier },
                        risk_vector: 'data_loss',
                    }));
                }
                if ((db.BackupRetentionPeriod || 0) < 7) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `RDS Backup Retention Too Short: ${db.DBInstanceIdentifier}`,
                        description: `Backup retention is ${db.BackupRetentionPeriod || 0} days (recommended: 7+)`,
                        analysis: 'Short backup retention limits recovery options.',
                        resource_id: db.DBInstanceIdentifier,
                        resource_arn: dbArn,
                        scan_type: 'rds_short_backup_retention',
                        compliance: [this.pciCompliance('9.5', 'Protect backup media')],
                        evidence: { dbIdentifier: db.DBInstanceIdentifier, backupRetention: db.BackupRetentionPeriod },
                        risk_vector: 'data_loss',
                    }));
                }
                if (!db.IAMDatabaseAuthenticationEnabled) {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `RDS IAM Auth Not Enabled: ${db.DBInstanceIdentifier}`,
                        description: `IAM database authentication is not enabled`,
                        analysis: 'IAM auth provides better credential management.',
                        resource_id: db.DBInstanceIdentifier,
                        resource_arn: dbArn,
                        scan_type: 'rds_no_iam_auth',
                        compliance: [this.wellArchitectedCompliance('SEC', 'Use temporary credentials')],
                        evidence: { dbIdentifier: db.DBInstanceIdentifier },
                        risk_vector: 'weak_authentication',
                    }));
                }
            }
        }
        catch (error) {
            this.warn('Failed to check DB instances', { error: error.message });
        }
        return findings;
    }
    async checkDBClusters(client) {
        const findings = [];
        try {
            const response = await client.send(new client_rds_1.DescribeDBClustersCommand({}));
            for (const cluster of response.DBClusters || []) {
                if (!cluster.DBClusterIdentifier)
                    continue;
                const clusterArn = cluster.DBClusterArn || this.arnBuilder.rdsCluster(this.region, cluster.DBClusterIdentifier);
                if (!cluster.StorageEncrypted) {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `RDS Cluster Not Encrypted: ${cluster.DBClusterIdentifier}`,
                        description: `Aurora cluster storage is not encrypted`,
                        analysis: 'HIGH RISK: Cluster data is not protected at rest.',
                        resource_id: cluster.DBClusterIdentifier,
                        resource_arn: clusterArn,
                        scan_type: 'rds_cluster_not_encrypted',
                        compliance: [this.cisCompliance('2.3.1', 'Ensure RDS encryption is enabled')],
                        evidence: { clusterIdentifier: cluster.DBClusterIdentifier },
                        risk_vector: 'data_exposure',
                    }));
                }
                if (!cluster.DeletionProtection) {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `RDS Cluster Deletion Protection Disabled: ${cluster.DBClusterIdentifier}`,
                        description: `Cluster can be deleted without protection`,
                        analysis: 'Accidental deletion could cause data loss.',
                        resource_id: cluster.DBClusterIdentifier,
                        resource_arn: clusterArn,
                        scan_type: 'rds_cluster_no_deletion_protection',
                        compliance: [this.wellArchitectedCompliance('REL', 'Protect data')],
                        evidence: { clusterIdentifier: cluster.DBClusterIdentifier },
                        risk_vector: 'data_loss',
                    }));
                }
            }
        }
        catch (error) {
            this.warn('Failed to check DB clusters', { error: error.message });
        }
        return findings;
    }
    async checkSnapshots(client) {
        const findings = [];
        try {
            const response = await client.send(new client_rds_1.DescribeDBSnapshotsCommand({ SnapshotType: 'manual' }));
            for (const snapshot of response.DBSnapshots || []) {
                if (!snapshot.DBSnapshotIdentifier)
                    continue;
                const snapshotArn = snapshot.DBSnapshotArn || this.arnBuilder.rdsSnapshot(this.region, snapshot.DBSnapshotIdentifier);
                if (!snapshot.Encrypted) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `RDS Snapshot Not Encrypted: ${snapshot.DBSnapshotIdentifier}`,
                        description: `Database snapshot is not encrypted`,
                        analysis: 'Unencrypted snapshots can expose data if shared.',
                        resource_id: snapshot.DBSnapshotIdentifier,
                        resource_arn: snapshotArn,
                        scan_type: 'rds_snapshot_not_encrypted',
                        compliance: [this.cisCompliance('2.3.1', 'Ensure RDS encryption is enabled')],
                        evidence: { snapshotIdentifier: snapshot.DBSnapshotIdentifier },
                        risk_vector: 'data_exposure',
                    }));
                }
            }
        }
        catch (error) {
            this.warn('Failed to check snapshots', { error: error.message });
        }
        return findings;
    }
}
exports.RDSScanner = RDSScanner;
async function scanRDS(region, accountId, credentials, cache) {
    const scanner = new RDSScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map