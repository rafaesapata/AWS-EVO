"use strict";
/**
 * Security Engine V2 - CloudFront Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudFrontScanner = void 0;
exports.scanCloudFront = scanCloudFront;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_cloudfront_1 = require("@aws-sdk/client-cloudfront");
class CloudFrontScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'CloudFront'; }
    get category() { return 'Network Security'; }
    async scan() {
        this.log('Starting CloudFront security scan');
        const findings = [];
        const client = await this.clientFactory.getCloudFrontClient();
        try {
            const response = await client.send(new client_cloudfront_1.ListDistributionsCommand({}));
            for (const dist of response.DistributionList?.Items || []) {
                if (!dist.Id || !dist.ARN)
                    continue;
                const distFindings = await this.checkDistribution(client, dist);
                findings.push(...distFindings);
            }
        }
        catch (error) {
            this.warn('Failed to list distributions', { error: error.message });
        }
        this.log('CloudFront scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkDistribution(client, dist) {
        const findings = [];
        const distId = dist.Id;
        const distArn = dist.ARN;
        const domainName = dist.DomainName || distId;
        if (dist.ViewerCertificate?.CloudFrontDefaultCertificate) {
            findings.push(this.createFinding({
                severity: 'medium',
                title: `CloudFront Using Default Certificate: ${domainName}`,
                description: 'Distribution uses CloudFront default SSL certificate',
                analysis: 'Custom SSL certificate provides better security and branding.',
                resource_id: distId,
                resource_arn: distArn,
                scan_type: 'cloudfront_default_cert',
                compliance: [this.wellArchitectedCompliance('SEC', 'Protect data in transit')],
                evidence: { distId, domainName },
                risk_vector: 'weak_authentication',
            }));
        }
        if (dist.ViewerCertificate?.MinimumProtocolVersion) {
            const weakProtocols = ['SSLv3', 'TLSv1', 'TLSv1_2016'];
            if (weakProtocols.includes(dist.ViewerCertificate.MinimumProtocolVersion)) {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `CloudFront Using Weak TLS: ${domainName}`,
                    description: `Minimum protocol version is ${dist.ViewerCertificate.MinimumProtocolVersion}`,
                    analysis: 'Use TLS 1.2 or higher for better security.',
                    resource_id: distId,
                    resource_arn: distArn,
                    scan_type: 'cloudfront_weak_tls',
                    compliance: [this.pciCompliance('4.1', 'Use strong cryptography')],
                    evidence: { distId, minProtocol: dist.ViewerCertificate.MinimumProtocolVersion },
                    risk_vector: 'weak_authentication',
                }));
            }
        }
        const defaultBehavior = dist.DefaultCacheBehavior;
        if (defaultBehavior) {
            if (defaultBehavior.ViewerProtocolPolicy === 'allow-all') {
                findings.push(this.createFinding({
                    severity: 'high',
                    title: `CloudFront Allows HTTP: ${domainName}`,
                    description: 'Distribution allows HTTP connections',
                    analysis: 'HIGH RISK: Traffic may not be encrypted.',
                    resource_id: distId,
                    resource_arn: distArn,
                    scan_type: 'cloudfront_allows_http',
                    compliance: [
                        this.pciCompliance('4.1', 'Use strong cryptography for transmission'),
                        this.lgpdCompliance('Art.46', 'Medidas de segurança'),
                    ],
                    remediation: {
                        description: 'Redirect HTTP to HTTPS',
                        steps: ['Go to CloudFront Console', `Select ${distId}`, 'Edit behavior', 'Set Viewer Protocol Policy to redirect-to-https'],
                        estimated_effort: 'trivial',
                        automation_available: true,
                    },
                    evidence: { distId, viewerProtocolPolicy: 'allow-all' },
                    risk_vector: 'data_exposure',
                }));
            }
        }
        if (!dist.WebACLId) {
            findings.push(this.createFinding({
                severity: 'medium',
                title: `CloudFront No WAF: ${domainName}`,
                description: 'Distribution is not protected by WAF',
                analysis: 'WAF provides protection against common web attacks.',
                resource_id: distId,
                resource_arn: distArn,
                scan_type: 'cloudfront_no_waf',
                compliance: [this.wellArchitectedCompliance('SEC', 'Protect networks')],
                evidence: { distId },
                risk_vector: 'network_exposure',
            }));
        }
        if (!dist.Logging?.Enabled) {
            findings.push(this.createFinding({
                severity: 'medium',
                title: `CloudFront Logging Disabled: ${domainName}`,
                description: 'Access logging is not enabled',
                analysis: 'Access logs are essential for security monitoring.',
                resource_id: distId,
                resource_arn: distArn,
                scan_type: 'cloudfront_no_logging',
                compliance: [
                    this.cisCompliance('3.1', 'Ensure logging is enabled'),
                    this.pciCompliance('10.1', 'Implement audit trails'),
                ],
                evidence: { distId },
                risk_vector: 'no_audit_trail',
            }));
        }
        for (const origin of dist.Origins?.Items || []) {
            if (origin.S3OriginConfig && !origin.S3OriginConfig.OriginAccessIdentity) {
                if (!origin.OriginAccessControlId) {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `CloudFront S3 Origin Without OAC: ${domainName}`,
                        description: `S3 origin ${origin.DomainName} has no Origin Access Control`,
                        analysis: 'HIGH RISK: S3 bucket may need to be public.',
                        resource_id: distId,
                        resource_arn: distArn,
                        scan_type: 'cloudfront_no_oac',
                        compliance: [this.cisCompliance('2.1.5', 'Ensure S3 bucket public access is blocked')],
                        evidence: { distId, originDomain: origin.DomainName },
                        risk_vector: 'public_exposure',
                    }));
                }
            }
        }
        return findings;
    }
}
exports.CloudFrontScanner = CloudFrontScanner;
async function scanCloudFront(region, accountId, credentials, cache) {
    const scanner = new CloudFrontScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map