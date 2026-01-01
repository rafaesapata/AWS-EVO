"use strict";
/**
 * Security Engine V3 - DynamoDB Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamoDBScanner = void 0;
exports.scanDynamoDB = scanDynamoDB;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
class DynamoDBScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'DynamoDB'; }
    get category() { return 'Data Protection'; }
    async scan() {
        this.log('Starting DynamoDB security scan');
        const findings = [];
        const client = await this.clientFactory.getDynamoDBClient(this.region);
        try {
            const response = await client.send(new client_dynamodb_1.ListTablesCommand({}));
            for (const tableName of response.TableNames || []) {
                const tableFindings = await this.checkTable(client, tableName);
                findings.push(...tableFindings);
            }
        }
        catch (error) {
            this.warn('Failed to list tables', { error: error.message });
        }
        this.log('DynamoDB scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkTable(client, tableName) {
        const findings = [];
        const tableArn = this.arnBuilder.dynamoDBTable(this.region, tableName);
        try {
            const tableInfo = await client.send(new client_dynamodb_1.DescribeTableCommand({ TableName: tableName }));
            const table = tableInfo.Table;
            if (!table)
                return findings;
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
                const backups = await client.send(new client_dynamodb_1.DescribeContinuousBackupsCommand({ TableName: tableName }));
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
            }
            catch (e) {
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
        }
        catch (error) {
            this.warn(`Failed to describe table ${tableName}`, { error: error.message });
        }
        return findings;
    }
}
exports.DynamoDBScanner = DynamoDBScanner;
async function scanDynamoDB(region, accountId, credentials, cache) {
    const scanner = new DynamoDBScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map