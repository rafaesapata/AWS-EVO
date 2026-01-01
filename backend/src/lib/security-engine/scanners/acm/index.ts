/**
 * Security Engine V3 - ACM Scanner
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  ACMClient,
  ListCertificatesCommand,
  DescribeCertificateCommand,
} from '@aws-sdk/client-acm';

export class ACMScanner extends BaseScanner {
  get serviceName(): string { return 'ACM'; }
  get category(): string { return 'Encryption'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting ACM security scan');
    const findings: Finding[] = [];
    const client = await this.clientFactory.getACMClient(this.region);

    try {
      const response = await client.send(new ListCertificatesCommand({}));
      for (const cert of response.CertificateSummaryList || []) {
        if (!cert.CertificateArn) continue;
        const certFindings = await this.checkCertificate(client, cert);
        findings.push(...certFindings);
      }
    } catch (error) {
      this.warn('Failed to list certificates', { error: (error as Error).message });
    }

    this.log('ACM scan completed', { findingsCount: findings.length });
    return findings;
  }

  private async checkCertificate(client: ACMClient, cert: any): Promise<Finding[]> {
    const findings: Finding[] = [];
    const certArn = cert.CertificateArn;
    const domainName = cert.DomainName || 'unknown';

    try {
      const details = await client.send(new DescribeCertificateCommand({ CertificateArn: certArn }));
      const certificate = details.Certificate;
      if (!certificate) return findings;

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
        } else if (daysUntilExpiry <= 30) {
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
        } else if (daysUntilExpiry <= 90) {
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
    } catch (error) {
      this.warn(`Failed to describe certificate ${domainName}`, { error: (error as Error).message });
    }

    return findings;
  }
}

export async function scanACM(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new ACMScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
