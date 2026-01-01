"use strict";
/**
 * Security Engine V3 - OpenSearch Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenSearchScanner = void 0;
exports.scanOpenSearch = scanOpenSearch;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_opensearch_1 = require("@aws-sdk/client-opensearch");
class OpenSearchScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'OpenSearch'; }
    get category() { return 'Data Protection'; }
    async scan() {
        this.log('Starting OpenSearch security scan');
        const findings = [];
        const client = await this.clientFactory.getOpenSearchClient(this.region);
        try {
            const response = await client.send(new client_opensearch_1.ListDomainNamesCommand({}));
            for (const domain of response.DomainNames || []) {
                if (!domain.DomainName)
                    continue;
                const domainFindings = await this.checkDomain(client, domain.DomainName);
                findings.push(...domainFindings);
            }
        }
        catch (error) {
            this.warn('Failed to list domains', { error: error.message });
        }
        this.log('OpenSearch scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkDomain(client, domainName) {
        const findings = [];
        const domainArn = this.arnBuilder.openSearchDomain(this.region, domainName);
        try {
            const details = await client.send(new client_opensearch_1.DescribeDomainCommand({ DomainName: domainName }));
            const domain = details.DomainStatus;
            if (!domain)
                return findings;
            if (!domain.EncryptionAtRestOptions?.Enabled) {
                findings.push(this.createFinding({
                    severity: 'high',
                    title: `OpenSearch No Encryption at Rest: ${domainName}`,
                    description: 'Domain does not have encryption at rest enabled',
                    analysis: 'HIGH RISK: Data is not protected at rest.',
                    resource_id: domainName,
                    resource_arn: domainArn,
                    scan_type: 'opensearch_no_rest_encryption',
                    compliance: [
                        this.pciCompliance('3.4', 'Render PAN unreadable'),
                        this.lgpdCompliance('Art.46', 'Medidas de segurança'),
                    ],
                    evidence: { domainName, encryptionAtRest: false },
                    risk_vector: 'data_exposure',
                }));
            }
            if (!domain.NodeToNodeEncryptionOptions?.Enabled) {
                findings.push(this.createFinding({
                    severity: 'high',
                    title: `OpenSearch No Node-to-Node Encryption: ${domainName}`,
                    description: 'Node-to-node encryption is not enabled',
                    analysis: 'HIGH RISK: Inter-node traffic is not encrypted.',
                    resource_id: domainName,
                    resource_arn: domainArn,
                    scan_type: 'opensearch_no_node_encryption',
                    compliance: [this.pciCompliance('4.1', 'Use strong cryptography for transmission')],
                    evidence: { domainName, nodeToNodeEncryption: false },
                    risk_vector: 'data_exposure',
                }));
            }
            if (!domain.DomainEndpointOptions?.EnforceHTTPS) {
                findings.push(this.createFinding({
                    severity: 'high',
                    title: `OpenSearch HTTPS Not Enforced: ${domainName}`,
                    description: 'HTTPS is not enforced for domain endpoint',
                    analysis: 'HIGH RISK: Traffic may not be encrypted.',
                    resource_id: domainName,
                    resource_arn: domainArn,
                    scan_type: 'opensearch_no_https',
                    compliance: [this.pciCompliance('4.1', 'Use strong cryptography for transmission')],
                    evidence: { domainName, enforceHTTPS: false },
                    risk_vector: 'data_exposure',
                }));
            }
            if (!domain.VPCOptions?.VPCId) {
                findings.push(this.createFinding({
                    severity: 'high',
                    title: `OpenSearch Not in VPC: ${domainName}`,
                    description: 'Domain is not deployed in a VPC',
                    analysis: 'HIGH RISK: Domain may be publicly accessible.',
                    resource_id: domainName,
                    resource_arn: domainArn,
                    scan_type: 'opensearch_not_in_vpc',
                    compliance: [this.cisCompliance('2.1', 'Ensure resources are in VPC')],
                    evidence: { domainName, inVPC: false },
                    risk_vector: 'public_exposure',
                }));
            }
            if (!domain.AdvancedSecurityOptions?.Enabled) {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `OpenSearch Fine-Grained Access Disabled: ${domainName}`,
                    description: 'Fine-grained access control is not enabled',
                    analysis: 'Fine-grained access provides better security controls.',
                    resource_id: domainName,
                    resource_arn: domainArn,
                    scan_type: 'opensearch_no_fine_grained_access',
                    compliance: [this.nistCompliance('AC-3', 'Access Enforcement')],
                    evidence: { domainName },
                    risk_vector: 'excessive_permissions',
                }));
            }
            if (!domain.LogPublishingOptions || Object.keys(domain.LogPublishingOptions).length === 0) {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `OpenSearch No Logging: ${domainName}`,
                    description: 'Log publishing is not configured',
                    analysis: 'Logs are essential for security monitoring.',
                    resource_id: domainName,
                    resource_arn: domainArn,
                    scan_type: 'opensearch_no_logging',
                    compliance: [this.pciCompliance('10.1', 'Implement audit trails')],
                    evidence: { domainName },
                    risk_vector: 'no_audit_trail',
                }));
            }
            const version = domain.EngineVersion;
            if (version && version.includes('Elasticsearch')) {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `OpenSearch Using Elasticsearch Engine: ${domainName}`,
                    description: `Domain uses ${version}`,
                    analysis: 'Consider upgrading to OpenSearch for latest features.',
                    resource_id: domainName,
                    resource_arn: domainArn,
                    scan_type: 'opensearch_elasticsearch_engine',
                    compliance: [this.nistCompliance('SI-2', 'Flaw Remediation')],
                    evidence: { domainName, version },
                    risk_vector: 'outdated_software',
                }));
            }
        }
        catch (error) {
            this.warn(`Failed to describe domain ${domainName}`, { error: error.message });
        }
        return findings;
    }
}
exports.OpenSearchScanner = OpenSearchScanner;
async function scanOpenSearch(region, accountId, credentials, cache) {
    const scanner = new OpenSearchScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map