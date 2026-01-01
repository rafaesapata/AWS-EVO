"use strict";
/**
 * Security Engine V2 - Security Hub Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityHubScanner = void 0;
exports.scanSecurityHub = scanSecurityHub;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_securityhub_1 = require("@aws-sdk/client-securityhub");
class SecurityHubScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'SecurityHub'; }
    get category() { return 'Compliance'; }
    async scan() {
        this.log('Starting Security Hub security scan');
        const findings = [];
        const client = await this.clientFactory.getSecurityHubClient(this.region);
        try {
            await client.send(new client_securityhub_1.DescribeHubCommand({}));
            const hubFindings = await this.checkHub(client);
            findings.push(...hubFindings);
        }
        catch (error) {
            if (error.name === 'InvalidAccessException' || error.message?.includes('not subscribed')) {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: 'Security Hub Not Enabled',
                    description: 'Security Hub is not enabled in this region',
                    analysis: 'Security Hub provides centralized security findings view.',
                    resource_id: 'securityhub',
                    resource_arn: this.arnBuilder.securityHubHub(this.region),
                    scan_type: 'securityhub_not_enabled',
                    compliance: [this.wellArchitectedCompliance('SEC', 'Implement security monitoring')],
                    remediation: {
                        description: 'Enable Security Hub',
                        steps: ['Go to Security Hub Console', 'Click Enable Security Hub'],
                        estimated_effort: 'trivial',
                        automation_available: true,
                    },
                    evidence: { enabled: false },
                    risk_vector: 'no_audit_trail',
                }));
            }
            else {
                this.warn('Failed to describe hub', { error: error.message });
            }
        }
        this.log('Security Hub scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkHub(client) {
        const findings = [];
        const hubArn = this.arnBuilder.securityHubHub(this.region);
        try {
            const standards = await client.send(new client_securityhub_1.GetEnabledStandardsCommand({}));
            const enabledStandards = standards.StandardsSubscriptions || [];
            if (enabledStandards.length === 0) {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: 'No Security Standards Enabled',
                    description: 'Security Hub has no compliance standards enabled',
                    analysis: 'Enable standards like CIS AWS Foundations for compliance checks.',
                    resource_id: 'securityhub',
                    resource_arn: hubArn,
                    scan_type: 'securityhub_no_standards',
                    compliance: [this.wellArchitectedCompliance('SEC', 'Implement security monitoring')],
                    remediation: {
                        description: 'Enable security standards',
                        steps: ['Go to Security Hub Console', 'Security standards', 'Enable CIS AWS Foundations'],
                        estimated_effort: 'trivial',
                        automation_available: true,
                    },
                    evidence: { enabledStandardsCount: 0 },
                    risk_vector: 'no_audit_trail',
                }));
            }
            const hasCIS = enabledStandards.some((s) => s.StandardsArn?.includes('cis-aws-foundations'));
            if (!hasCIS) {
                findings.push(this.createFinding({
                    severity: 'low',
                    title: 'CIS AWS Foundations Not Enabled',
                    description: 'CIS AWS Foundations Benchmark is not enabled',
                    analysis: 'CIS provides comprehensive security best practices.',
                    resource_id: 'securityhub',
                    resource_arn: hubArn,
                    scan_type: 'securityhub_no_cis',
                    compliance: [this.cisCompliance('1.1', 'Enable CIS AWS Foundations')],
                    evidence: { hasCIS: false },
                    risk_vector: 'no_audit_trail',
                }));
            }
        }
        catch (error) {
            this.warn('Failed to get enabled standards', { error: error.message });
        }
        return findings;
    }
}
exports.SecurityHubScanner = SecurityHubScanner;
async function scanSecurityHub(region, accountId, credentials, cache) {
    const scanner = new SecurityHubScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map