"use strict";
/**
 * Security Engine V3 - EFS Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EFSScanner = void 0;
exports.scanEFS = scanEFS;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_efs_1 = require("@aws-sdk/client-efs");
class EFSScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'EFS'; }
    get category() { return 'Storage Security'; }
    async scan() {
        this.log('Starting EFS security scan');
        const findings = [];
        const client = await this.clientFactory.getEFSClient(this.region);
        try {
            const fileSystems = await client.send(new client_efs_1.DescribeFileSystemsCommand({}));
            for (const fs of fileSystems.FileSystems || []) {
                if (!fs.FileSystemId)
                    continue;
                const fsFindings = await this.checkFileSystem(client, fs);
                findings.push(...fsFindings);
            }
        }
        catch (error) {
            this.warn('EFS scan failed', { error: error.message });
        }
        this.log('EFS scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkFileSystem(client, fs) {
        const findings = [];
        const fsId = fs.FileSystemId;
        const fsName = fs.Name || fsId;
        const fsArn = this.arnBuilder.efsFileSystem(this.region, fsId);
        // Check 1: Encryption at rest not enabled
        if (!fs.Encrypted) {
            findings.push(this.createFinding({
                severity: 'high',
                title: `EFS Not Encrypted: ${fsName}`,
                description: `File system ${fsName} does not have encryption at rest enabled`,
                analysis: 'HIGH RISK: Data stored in EFS is not encrypted.',
                resource_id: fsId,
                resource_arn: fsArn,
                scan_type: 'efs_not_encrypted',
                compliance: [
                    this.cisCompliance('2.4.1', 'Ensure EFS is encrypted'),
                    this.pciCompliance('3.4', 'Render PAN unreadable'),
                    this.lgpdCompliance('Art.46', 'Security Measures'),
                ],
                remediation: {
                    description: 'EFS encryption must be enabled at creation. Create new encrypted EFS and migrate.',
                    steps: ['Create new EFS with encryption', 'Migrate data using DataSync', 'Update applications', 'Delete old EFS'],
                    estimated_effort: 'high',
                    automation_available: false,
                },
                evidence: { fileSystemId: fsId, name: fsName, encrypted: false },
                risk_vector: 'data_exposure',
            }));
        }
        // Check 2: No file system policy
        try {
            await client.send(new client_efs_1.DescribeFileSystemPolicyCommand({ FileSystemId: fsId }));
        }
        catch (e) {
            if (e.name === 'PolicyNotFound') {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `EFS No File System Policy: ${fsName}`,
                    description: `File system ${fsName} has no resource-based policy`,
                    analysis: 'Access control relies solely on IAM and security groups.',
                    resource_id: fsId,
                    resource_arn: fsArn,
                    scan_type: 'efs_no_policy',
                    compliance: [this.wellArchitectedCompliance('SEC-3', 'Manage Permissions')],
                    remediation: {
                        description: 'Create a file system policy to restrict access',
                        steps: ['Go to EFS console', 'Select file system', 'Create file system policy'],
                        estimated_effort: 'low',
                        automation_available: true,
                    },
                    evidence: { fileSystemId: fsId, name: fsName, hasPolicy: false },
                    risk_vector: 'access_control',
                }));
            }
        }
        // Check 3: Automatic backups not enabled
        try {
            const backup = await client.send(new client_efs_1.DescribeBackupPolicyCommand({ FileSystemId: fsId }));
            if (backup.BackupPolicy?.Status !== 'ENABLED') {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `EFS Automatic Backup Disabled: ${fsName}`,
                    description: `File system ${fsName} does not have automatic backups enabled`,
                    analysis: 'Data loss could occur without automatic backups.',
                    resource_id: fsId,
                    resource_arn: fsArn,
                    scan_type: 'efs_no_backup',
                    compliance: [this.wellArchitectedCompliance('REL-9', 'Back Up Data')],
                    remediation: {
                        description: 'Enable automatic backups',
                        steps: ['Go to EFS console', 'Select file system', 'Enable automatic backups'],
                        cli_command: `aws efs put-backup-policy --file-system-id ${fsId} --backup-policy Status=ENABLED`,
                        estimated_effort: 'trivial',
                        automation_available: true,
                    },
                    evidence: { fileSystemId: fsId, name: fsName, backupStatus: backup.BackupPolicy?.Status },
                    risk_vector: 'data_loss',
                }));
            }
        }
        catch (e) {
            // Backup policy not configured
        }
        // Check 4: No access points
        try {
            const accessPoints = await client.send(new client_efs_1.DescribeAccessPointsCommand({ FileSystemId: fsId }));
            if (!accessPoints.AccessPoints?.length) {
                findings.push(this.createFinding({
                    severity: 'low',
                    title: `EFS No Access Points: ${fsName}`,
                    description: `File system ${fsName} has no access points configured`,
                    analysis: 'Access points provide application-specific entry points with enforced identity.',
                    resource_id: fsId,
                    resource_arn: fsArn,
                    scan_type: 'efs_no_access_points',
                    compliance: [this.wellArchitectedCompliance('SEC-3', 'Manage Permissions')],
                    evidence: { fileSystemId: fsId, name: fsName, accessPointCount: 0 },
                    risk_vector: 'access_control',
                }));
            }
        }
        catch (e) {
            // Access points check failed
        }
        return findings;
    }
}
exports.EFSScanner = EFSScanner;
async function scanEFS(region, accountId, credentials, cache) {
    const scanner = new EFSScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map