"use strict";
/**
 * Security Engine V3 - ACM Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACMScanner = void 0;
exports.scanACM = scanACM;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_acm_1 = require("@aws-sdk/client-acm");
class ACMScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'ACM'; }
    get category() { return 'Encryption'; }
    async scan() {
        this.log('Starting ACM security scan');
        const findings = [];
        const client = await this.clientFactory.getACMClient(this.region);
        try {
            const response = await client.send(new client_acm_1.ListCertificatesCommand({}));
            for (const cert of response.CertificateSummaryList || []) {
                if (!cert.CertificateArn)
                    continue;
                const certFindings = await this.checkCertificate(client, cert);
                findings.push(...certFindings);
            }
        }
        catch (error) {
            this.warn('Failed to list certificates', { error: error.message });
        }
        this.log('ACM scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkCertificate(client, cert) {
        const findings = [];
        const certArn = cert.CertificateArn;
        const domainName = cert.DomainName || 'unknown';
        try {
            const details = await client.send(new client_acm_1.DescribeCertificateCommand({ CertificateArn: certArn }));
            const certificate = details.Certificate;
            if (!certificate)
                return findings;
            if (certificate.NotAfter) {
                const daysUntilExpiry = Math.floor((new Date(certificate.NotAfter).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                if (daysUntilExpiry < 0) {
                    findings.push(this.createFinding({
                        severity: 'critical',
                        title: `ACM Certificate Expired: ${domainName}`,
                        description: `Certificate expired ${Math.abs(daysUntilExpiry)} days ago`,
                        analysis: 'CRITICAL: Expired certificate will cause service disruption.',
                        resource_id: domainName,
                        resource_arn: certArn,
                        scan_type: 'acm_cert_expired',
                        compliance: [this.pciCompliance('4.1', 'Use strong cryptography')],
                        evidence: { domainName, expiryDate: certificate.NotAfter, daysUntilExpiry },
                        risk_vector: 'availability',
                    }));
                }
                else if (daysUntilExpiry <= 30) {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `ACM Certificate Expiring Soon: ${domainName}`,
                        description: `Certificate expires in ${daysUntilExpiry} days`,
                        analysis: 'HIGH RISK: Certificate will expire soon.',
                        resource_id: domainName,
                        resource_arn: certArn,
                        scan_type: 'acm_cert_expiring_soon',
                        compliance: [this.pciCompliance('4.1', 'Use strong cryptography')],
                        remediation: {
                            description: 'Renew or replace the certificate',
                            steps: ['Request new certificate or enable auto-renewal', 'Update resources using the certificate'],
                            estimated_effort: 'medium',
                            automation_available: true,
                        },
                        evidence: { domainName, expiryDate: certificate.NotAfter, daysUntilExpiry },
                        risk_vector: 'availability',
                    }));
                }
                else if (daysUntilExpiry <= 90) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `ACM Certificate Expiring: ${domainName}`,
                        description: `Certificate expires in ${daysUntilExpiry} days`,
                        analysis: 'Plan certificate renewal.',
                        resource_id: domainName,
                        resource_arn: certArn,
                        scan_type: 'acm_cert_expiring',
                        compliance: [this.wellArchitectedCompliance('SEC', 'Protect data in transit')],
                        evidence: { domainName, expiryDate: certificate.NotAfter, daysUntilExpiry },
                        risk_vector: 'availability',
                    }));
                }
            }
            if (certificate.RenewalEligibility === 'INELIGIBLE' && certificate.Type === 'AMAZON_ISSUED') {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `ACM Certificate Not Eligible for Renewal: ${domainName}`,
                    description: 'Certificate cannot be automatically renewed',
                    analysis: 'Manual intervention required for renewal.',
                    resource_id: domainName,
                    resource_arn: certArn,
                    scan_type: 'acm_cert_not_renewable',
                    compliance: [this.wellArchitectedCompliance('OPS', 'Prepare for operations')],
                    evidence: { domainName, renewalEligibility: certificate.RenewalEligibility },
                    risk_vector: 'availability',
                }));
            }
            if (certificate.KeyAlgorithm === 'RSA_1024') {
                findings.push(this.createFinding({
                    severity: 'high',
                    title: `ACM Certificate Using Weak Key: ${domainName}`,
                    description: 'Certificate uses RSA 1024-bit key which is considered weak',
                    analysis: 'HIGH RISK: Weak cryptographic key.',
                    resource_id: domainName,
                    resource_arn: certArn,
                    scan_type: 'acm_weak_key',
                    compliance: [this.pciCompliance('4.1', 'Use strong cryptography')],
                    evidence: { domainName, keyAlgorithm: certificate.KeyAlgorithm },
                    risk_vector: 'weak_authentication',
                }));
            }
        }
        catch (error) {
            this.warn(`Failed to describe certificate ${domainName}`, { error: error.message });
        }
        return findings;
    }
}
exports.ACMScanner = ACMScanner;
async function scanACM(region, accountId, credentials, cache) {
    const scanner = new ACMScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map