"use strict";
/**
 * Security Engine V3 - Inspector Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InspectorScanner = void 0;
exports.scanInspector = scanInspector;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_inspector2_1 = require("@aws-sdk/client-inspector2");
class InspectorScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'Inspector'; }
    get category() { return 'Security'; }
    async scan() {
        this.log('Starting Inspector security scan');
        const findings = [];
        const client = await this.clientFactory.getInspectorClient(this.region);
        try {
            // Check 1: Inspector enabled status
            const accountStatus = await client.send(new client_inspector2_1.BatchGetAccountStatusCommand({
                accountIds: [this.accountId]
            }));
            const status = accountStatus.accounts?.[0];
            if (!status) {
                findings.push(this.createFinding({
                    severity: 'high',
                    title: `Inspector Not Enabled: ${this.region}`,
                    description: `Amazon Inspector is not enabled in ${this.region}`,
                    analysis: 'HIGH RISK: Vulnerability scanning is not active.',
                    resource_id: `inspector-${this.region}`,
                    resource_arn: `arn:aws:inspector2:${this.region}:${this.accountId}:`,
                    scan_type: 'inspector_not_enabled',
                    compliance: [
                        this.cisCompliance('5.1', 'Enable vulnerability scanning'),
                        this.nistCompliance('RA-5', 'Vulnerability Scanning'),
                    ],
                    remediation: {
                        description: 'Enable Amazon Inspector for vulnerability scanning',
                        steps: ['Go to Inspector console', 'Enable Inspector', 'Configure scan targets'],
                        estimated_effort: 'low',
                        automation_available: true,
                    },
                    evidence: { region: this.region, enabled: false },
                    risk_vector: 'vulnerability_management',
                }));
            }
            else {
                // Check EC2 scanning
                if (status.resourceState?.ec2?.status !== 'ENABLED') {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `Inspector EC2 Scanning Disabled: ${this.region}`,
                        description: `EC2 vulnerability scanning is not enabled in ${this.region}`,
                        analysis: 'EC2 instances are not being scanned for vulnerabilities.',
                        resource_id: `inspector-ec2-${this.region}`,
                        resource_arn: `arn:aws:inspector2:${this.region}:${this.accountId}:`,
                        scan_type: 'inspector_ec2_disabled',
                        compliance: [this.nistCompliance('RA-5', 'Vulnerability Scanning')],
                        evidence: { region: this.region, ec2Status: status.resourceState?.ec2?.status },
                        risk_vector: 'vulnerability_management',
                    }));
                }
                // Check ECR scanning
                if (status.resourceState?.ecr?.status !== 'ENABLED') {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `Inspector ECR Scanning Disabled: ${this.region}`,
                        description: `ECR container scanning is not enabled in ${this.region}`,
                        analysis: 'Container images are not being scanned for vulnerabilities.',
                        resource_id: `inspector-ecr-${this.region}`,
                        resource_arn: `arn:aws:inspector2:${this.region}:${this.accountId}:`,
                        scan_type: 'inspector_ecr_disabled',
                        compliance: [this.nistCompliance('RA-5', 'Vulnerability Scanning')],
                        evidence: { region: this.region, ecrStatus: status.resourceState?.ecr?.status },
                        risk_vector: 'vulnerability_management',
                    }));
                }
                // Check Lambda scanning
                if (status.resourceState?.lambda?.status !== 'ENABLED') {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `Inspector Lambda Scanning Disabled: ${this.region}`,
                        description: `Lambda function scanning is not enabled in ${this.region}`,
                        analysis: 'Lambda functions are not being scanned for vulnerabilities.',
                        resource_id: `inspector-lambda-${this.region}`,
                        resource_arn: `arn:aws:inspector2:${this.region}:${this.accountId}:`,
                        scan_type: 'inspector_lambda_disabled',
                        compliance: [this.nistCompliance('RA-5', 'Vulnerability Scanning')],
                        evidence: { region: this.region, lambdaStatus: status.resourceState?.lambda?.status },
                        risk_vector: 'vulnerability_management',
                    }));
                }
            }
            // Check 2: Critical findings
            await this.safeExecute('critical-findings', async () => {
                const criticalFindings = await client.send(new client_inspector2_1.ListFindingsCommand({
                    filterCriteria: {
                        severity: [{ comparison: 'EQUALS', value: 'CRITICAL' }]
                    },
                    maxResults: 10
                }));
                if (criticalFindings.findings?.length) {
                    findings.push(this.createFinding({
                        severity: 'critical',
                        title: `Inspector Critical Vulnerabilities: ${this.region}`,
                        description: `${criticalFindings.findings.length}+ critical vulnerabilities found`,
                        analysis: 'CRITICAL: Immediate remediation required for critical vulnerabilities.',
                        resource_id: `inspector-findings-${this.region}`,
                        resource_arn: `arn:aws:inspector2:${this.region}:${this.accountId}:finding`,
                        scan_type: 'inspector_critical_findings',
                        compliance: [
                            this.pciCompliance('6.2', 'Protect systems from known vulnerabilities'),
                            this.nistCompliance('SI-2', 'Flaw Remediation'),
                        ],
                        evidence: { region: this.region, criticalCount: criticalFindings.findings.length },
                        risk_vector: 'vulnerability_management',
                    }));
                }
            }, null);
        }
        catch (error) {
            this.warn('Inspector scan failed', { error: error.message });
        }
        this.log('Inspector scan completed', { findingsCount: findings.length });
        return findings;
    }
}
exports.InspectorScanner = InspectorScanner;
async function scanInspector(region, accountId, credentials, cache) {
    const scanner = new InspectorScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map