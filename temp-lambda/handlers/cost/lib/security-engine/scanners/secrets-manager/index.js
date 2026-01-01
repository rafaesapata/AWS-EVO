"use strict";
/**
 * Security Engine V2 - Secrets Manager Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretsManagerScanner = void 0;
exports.scanSecretsManager = scanSecretsManager;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
class SecretsManagerScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'SecretsManager'; }
    get category() { return 'Secrets Management'; }
    async scan() {
        this.log('Starting Secrets Manager security scan');
        const findings = [];
        const client = await this.clientFactory.getSecretsManagerClient(this.region);
        try {
            const response = await client.send(new client_secrets_manager_1.ListSecretsCommand({}));
            for (const secret of response.SecretList || []) {
                if (!secret.Name || !secret.ARN)
                    continue;
                const secretFindings = await this.checkSecret(client, secret);
                findings.push(...secretFindings);
            }
        }
        catch (error) {
            this.warn('Failed to list secrets', { error: error.message });
        }
        this.log('Secrets Manager scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkSecret(client, secret) {
        const findings = [];
        const secretArn = secret.ARN;
        const secretName = secret.Name;
        if (!secret.RotationEnabled) {
            findings.push(this.createFinding({
                severity: 'medium',
                title: `Secret Rotation Not Enabled: ${secretName}`,
                description: 'Automatic rotation is not configured for this secret',
                analysis: 'Secrets should be rotated regularly to limit exposure.',
                resource_id: secretName,
                resource_arn: secretArn,
                scan_type: 'secrets_no_rotation',
                compliance: [
                    this.cisCompliance('2.4', 'Ensure secrets are rotated'),
                    this.pciCompliance('8.2.4', 'Change user passwords at least once every 90 days'),
                ],
                remediation: {
                    description: 'Enable automatic rotation',
                    steps: ['Go to Secrets Manager Console', `Select ${secretName}`, 'Edit rotation', 'Enable automatic rotation'],
                    estimated_effort: 'medium',
                    automation_available: true,
                },
                evidence: { secretName, rotationEnabled: false },
                risk_vector: 'stale_credentials',
            }));
        }
        if (secret.RotationEnabled && secret.LastRotatedDate) {
            const daysSinceRotation = Math.floor((Date.now() - new Date(secret.LastRotatedDate).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceRotation > 90) {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `Secret Not Rotated Recently: ${secretName}`,
                    description: `Secret was last rotated ${daysSinceRotation} days ago`,
                    analysis: 'Secret has not been rotated in over 90 days.',
                    resource_id: secretName,
                    resource_arn: secretArn,
                    scan_type: 'secrets_stale_rotation',
                    compliance: [this.pciCompliance('8.2.4', 'Change user passwords at least once every 90 days')],
                    evidence: { secretName, daysSinceRotation },
                    risk_vector: 'stale_credentials',
                }));
            }
        }
        if (!secret.KmsKeyId || secret.KmsKeyId.includes('alias/aws/secretsmanager')) {
            findings.push(this.createFinding({
                severity: 'low',
                title: `Secret Using Default KMS Key: ${secretName}`,
                description: 'Secret is encrypted with AWS managed key instead of CMK',
                analysis: 'Customer-managed keys provide better control over encryption.',
                resource_id: secretName,
                resource_arn: secretArn,
                scan_type: 'secrets_default_kms',
                compliance: [this.wellArchitectedCompliance('SEC', 'Protect data at rest')],
                evidence: { secretName, kmsKeyId: secret.KmsKeyId },
                risk_vector: 'key_management',
            }));
        }
        return findings;
    }
}
exports.SecretsManagerScanner = SecretsManagerScanner;
async function scanSecretsManager(region, accountId, credentials, cache) {
    const scanner = new SecretsManagerScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map