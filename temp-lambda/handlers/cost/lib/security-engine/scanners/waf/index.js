"use strict";
/**
 * Security Engine V2 - WAF Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WAFScanner = void 0;
exports.scanWAF = scanWAF;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_wafv2_1 = require("@aws-sdk/client-wafv2");
class WAFScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'WAF'; }
    get category() { return 'Network Security'; }
    async scan() {
        this.log('Starting WAF security scan');
        const findings = [];
        const client = await this.clientFactory.getWAFV2Client(this.region);
        try {
            const response = await client.send(new client_wafv2_1.ListWebACLsCommand({ Scope: 'REGIONAL' }));
            const webAcls = response.WebACLs || [];
            if (webAcls.length === 0) {
                findings.push(this.createFinding({
                    severity: 'info',
                    title: 'No WAF Web ACLs Configured',
                    description: 'No WAF Web ACLs found in this region',
                    analysis: 'Consider using WAF to protect web applications.',
                    resource_id: 'waf',
                    resource_arn: `arn:aws:wafv2:${this.region}:${this.accountId}:regional/webacl/*`,
                    scan_type: 'waf_no_webacls',
                    compliance: [this.wellArchitectedCompliance('SEC', 'Protect networks')],
                    evidence: { webAclCount: 0 },
                    risk_vector: 'network_exposure',
                }));
            }
            for (const webAcl of webAcls) {
                if (!webAcl.Name || !webAcl.Id || !webAcl.ARN)
                    continue;
                const aclFindings = await this.checkWebACL(client, webAcl);
                findings.push(...aclFindings);
            }
        }
        catch (error) {
            this.warn('Failed to list Web ACLs', { error: error.message });
        }
        this.log('WAF scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkWebACL(client, webAcl) {
        const findings = [];
        const aclArn = webAcl.ARN;
        const aclName = webAcl.Name;
        try {
            const aclDetails = await client.send(new client_wafv2_1.GetWebACLCommand({
                Name: aclName,
                Id: webAcl.Id,
                Scope: 'REGIONAL',
            }));
            const rules = aclDetails.WebACL?.Rules || [];
            if (rules.length === 0) {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `WAF Web ACL Has No Rules: ${aclName}`,
                    description: 'Web ACL has no rules configured',
                    analysis: 'WAF without rules provides no protection.',
                    resource_id: aclName,
                    resource_arn: aclArn,
                    scan_type: 'waf_no_rules',
                    compliance: [this.wellArchitectedCompliance('SEC', 'Protect networks')],
                    evidence: { aclName, ruleCount: 0 },
                    risk_vector: 'network_exposure',
                }));
            }
            const defaultAction = aclDetails.WebACL?.DefaultAction;
            if (defaultAction?.Allow) {
                findings.push(this.createFinding({
                    severity: 'low',
                    title: `WAF Default Action is Allow: ${aclName}`,
                    description: 'Web ACL default action allows traffic',
                    analysis: 'Consider using Block as default action for better security.',
                    resource_id: aclName,
                    resource_arn: aclArn,
                    scan_type: 'waf_default_allow',
                    compliance: [this.wellArchitectedCompliance('SEC', 'Control traffic at all layers')],
                    evidence: { aclName, defaultAction: 'ALLOW' },
                    risk_vector: 'network_exposure',
                }));
            }
            try {
                const resources = await client.send(new client_wafv2_1.ListResourcesForWebACLCommand({ WebACLArn: aclArn }));
                if (!resources.ResourceArns || resources.ResourceArns.length === 0) {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `WAF Web ACL Not Associated: ${aclName}`,
                        description: 'Web ACL is not associated with any resources',
                        analysis: 'Unused WAF rules provide no protection.',
                        resource_id: aclName,
                        resource_arn: aclArn,
                        scan_type: 'waf_not_associated',
                        compliance: [this.wellArchitectedCompliance('SEC', 'Protect networks')],
                        evidence: { aclName, associatedResources: 0 },
                        risk_vector: 'network_exposure',
                    }));
                }
            }
            catch (e) {
                this.warn(`Failed to list resources for ${aclName}`);
            }
        }
        catch (error) {
            this.warn(`Failed to get Web ACL ${aclName}`, { error: error.message });
        }
        return findings;
    }
}
exports.WAFScanner = WAFScanner;
async function scanWAF(region, accountId, credentials, cache) {
    const scanner = new WAFScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map