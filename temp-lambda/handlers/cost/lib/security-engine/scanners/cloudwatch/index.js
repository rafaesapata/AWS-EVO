"use strict";
/**
 * Security Engine V2 - CloudWatch Scanner
 * Checks: log group encryption, retention policies, cross-account access, metric filters
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudWatchScanner = void 0;
exports.scanCloudWatch = scanCloudWatch;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_cloudwatch_logs_1 = require("@aws-sdk/client-cloudwatch-logs");
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
class CloudWatchScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'CloudWatch'; }
    get category() { return 'Monitoring'; }
    async scan() {
        this.log('Starting CloudWatch security scan');
        const findings = [];
        const logsClient = await this.clientFactory.getCloudWatchLogsClient(this.region);
        const cwClient = await this.clientFactory.getCloudWatchClient(this.region);
        try {
            // Check log groups
            let nextToken;
            const logGroups = [];
            do {
                const response = await logsClient.send(new client_cloudwatch_logs_1.DescribeLogGroupsCommand({ nextToken }));
                logGroups.push(...(response.logGroups || []));
                nextToken = response.nextToken;
            } while (nextToken);
            for (const logGroup of logGroups) {
                if (!logGroup.logGroupName || !logGroup.arn)
                    continue;
                // Check 1: Log group not encrypted
                if (!logGroup.kmsKeyId) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `CloudWatch Log Group Not Encrypted: ${logGroup.logGroupName}`,
                        description: `Log group ${logGroup.logGroupName} is not encrypted with KMS`,
                        analysis: 'Logs may contain sensitive information and should be encrypted.',
                        resource_id: logGroup.logGroupName,
                        resource_arn: logGroup.arn,
                        scan_type: 'cloudwatch_log_not_encrypted',
                        compliance: [
                            this.cisCompliance('3.1', 'Ensure CloudWatch log groups are encrypted'),
                            this.pciCompliance('3.4', 'Render PAN unreadable'),
                        ],
                        remediation: {
                            description: 'Associate a KMS key with the log group',
                            steps: ['Create or select a KMS key', 'Associate key with log group'],
                            cli_command: `aws logs associate-kms-key --log-group-name ${logGroup.logGroupName} --kms-key-id YOUR_KMS_KEY_ARN`,
                            estimated_effort: 'low',
                            automation_available: true,
                        },
                        evidence: { logGroupName: logGroup.logGroupName, kmsKeyId: null },
                        risk_vector: 'data_exposure',
                    }));
                }
                // Check 2: No retention policy (logs kept forever)
                if (!logGroup.retentionInDays) {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `CloudWatch Log Group No Retention: ${logGroup.logGroupName}`,
                        description: `Log group ${logGroup.logGroupName} has no retention policy (logs kept forever)`,
                        analysis: 'Logs without retention policies can accumulate and increase costs.',
                        resource_id: logGroup.logGroupName,
                        resource_arn: logGroup.arn,
                        scan_type: 'cloudwatch_log_no_retention',
                        compliance: [
                            this.wellArchitectedCompliance('COST', 'Manage Demand and Supply'),
                        ],
                        remediation: {
                            description: 'Set a retention policy for the log group',
                            steps: ['Go to CloudWatch console', 'Select log group', 'Set retention period'],
                            cli_command: `aws logs put-retention-policy --log-group-name ${logGroup.logGroupName} --retention-in-days 90`,
                            estimated_effort: 'trivial',
                            automation_available: true,
                        },
                        evidence: { logGroupName: logGroup.logGroupName, retentionInDays: null },
                        risk_vector: 'cost_optimization',
                    }));
                }
                // Check 3: Very short retention (less than 30 days)
                if (logGroup.retentionInDays && logGroup.retentionInDays < 30) {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `CloudWatch Log Group Short Retention: ${logGroup.logGroupName}`,
                        description: `Log group ${logGroup.logGroupName} has retention of only ${logGroup.retentionInDays} days`,
                        analysis: 'Short retention may not meet compliance requirements for audit logs.',
                        resource_id: logGroup.logGroupName,
                        resource_arn: logGroup.arn,
                        scan_type: 'cloudwatch_log_short_retention',
                        evidence: { logGroupName: logGroup.logGroupName, retentionInDays: logGroup.retentionInDays },
                        risk_vector: 'compliance_gap',
                    }));
                }
            }
            // Check 4: CIS required metric filters
            const requiredFilters = [
                { name: 'UnauthorizedAPICalls', pattern: '{ ($.errorCode = "*UnauthorizedAccess*") || ($.errorCode = "AccessDenied*") }' },
                { name: 'ConsoleSignInWithoutMFA', pattern: '{ ($.eventName = "ConsoleLogin") && ($.additionalEventData.MFAUsed != "Yes") }' },
                { name: 'RootAccountUsage', pattern: '{ $.userIdentity.type = "Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != "AwsServiceEvent" }' },
                { name: 'IAMPolicyChanges', pattern: '{ ($.eventName=DeleteGroupPolicy) || ($.eventName=DeleteRolePolicy) || ($.eventName=DeleteUserPolicy) || ($.eventName=PutGroupPolicy) || ($.eventName=PutRolePolicy) || ($.eventName=PutUserPolicy) }' },
                { name: 'CloudTrailConfigChanges', pattern: '{ ($.eventName = CreateTrail) || ($.eventName = UpdateTrail) || ($.eventName = DeleteTrail) || ($.eventName = StartLogging) || ($.eventName = StopLogging) }' },
                { name: 'SecurityGroupChanges', pattern: '{ ($.eventName = AuthorizeSecurityGroupIngress) || ($.eventName = AuthorizeSecurityGroupEgress) || ($.eventName = RevokeSecurityGroupIngress) || ($.eventName = RevokeSecurityGroupEgress) }' },
                { name: 'NACLChanges', pattern: '{ ($.eventName = CreateNetworkAcl) || ($.eventName = CreateNetworkAclEntry) || ($.eventName = DeleteNetworkAcl) || ($.eventName = DeleteNetworkAclEntry) }' },
                { name: 'VPCChanges', pattern: '{ ($.eventName = CreateVpc) || ($.eventName = DeleteVpc) || ($.eventName = ModifyVpcAttribute) }' },
            ];
            // Get all metric filters
            const existingFilters = [];
            for (const logGroup of logGroups) {
                await this.safeExecute(`metric-filters-${logGroup.logGroupName}`, async () => {
                    const filters = await logsClient.send(new client_cloudwatch_logs_1.DescribeMetricFiltersCommand({
                        logGroupName: logGroup.logGroupName
                    }));
                    for (const filter of filters.metricFilters || []) {
                        if (filter.filterName)
                            existingFilters.push(filter.filterName);
                    }
                }, null);
            }
            // Check for missing CIS filters
            for (const required of requiredFilters) {
                const hasFilter = existingFilters.some(f => f.toLowerCase().includes(required.name.toLowerCase()));
                if (!hasFilter) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `Missing CIS Metric Filter: ${required.name}`,
                        description: `No metric filter found for ${required.name}`,
                        analysis: 'CIS benchmark requires specific metric filters for security monitoring.',
                        resource_id: `metric-filter-${required.name}`,
                        resource_arn: `arn:aws:logs:${this.region}:${this.accountId}:metric-filter/${required.name}`,
                        scan_type: 'cloudwatch_missing_cis_filter',
                        compliance: [
                            this.cisCompliance('4.x', `Ensure ${required.name} metric filter exists`),
                        ],
                        evidence: { filterName: required.name, pattern: required.pattern },
                        risk_vector: 'monitoring_gap',
                    }));
                }
            }
            // Check 5: No alarms configured
            await this.safeExecute('alarms', async () => {
                const alarms = await cwClient.send(new client_cloudwatch_1.DescribeAlarmsCommand({}));
                if (!alarms.MetricAlarms?.length && !alarms.CompositeAlarms?.length) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `No CloudWatch Alarms: ${this.region}`,
                        description: `No CloudWatch alarms configured in ${this.region}`,
                        analysis: 'Without alarms, you will not be notified of security or operational issues.',
                        resource_id: `cloudwatch-alarms-${this.region}`,
                        resource_arn: `arn:aws:cloudwatch:${this.region}:${this.accountId}:alarm`,
                        scan_type: 'cloudwatch_no_alarms',
                        compliance: [
                            this.wellArchitectedCompliance('SEC', 'Detect and Investigate Security Events'),
                        ],
                        evidence: { region: this.region, alarmCount: 0 },
                        risk_vector: 'monitoring_gap',
                    }));
                }
            }, null);
        }
        catch (error) {
            this.warn('CloudWatch scan failed', { error: error.message });
        }
        this.log('CloudWatch scan completed', { findingsCount: findings.length });
        return findings;
    }
}
exports.CloudWatchScanner = CloudWatchScanner;
async function scanCloudWatch(region, accountId, credentials, cache) {
    const scanner = new CloudWatchScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map