"use strict";
/**
 * Security Engine V3 - KMS Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KMSScanner = void 0;
exports.scanKMS = scanKMS;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_kms_1 = require("@aws-sdk/client-kms");
class KMSScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'KMS'; }
    get category() { return 'Encryption'; }
    async scan() {
        this.log('Starting KMS security scan');
        const findings = [];
        const client = await this.clientFactory.getKMSClient(this.region);
        try {
            const response = await client.send(new client_kms_1.ListKeysCommand({}));
            for (const key of response.Keys || []) {
                if (!key.KeyId)
                    continue;
                const keyFindings = await this.checkKey(client, key.KeyId);
                findings.push(...keyFindings);
            }
        }
        catch (error) {
            this.warn('Failed to list KMS keys', { error: error.message });
        }
        this.log('KMS scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkKey(client, keyId) {
        const findings = [];
        try {
            const keyInfo = await client.send(new client_kms_1.DescribeKeyCommand({ KeyId: keyId }));
            const metadata = keyInfo.KeyMetadata;
            if (!metadata || metadata.KeyManager === 'AWS')
                return findings;
            if (metadata.KeyState !== 'Enabled')
                return findings;
            const keyArn = metadata.Arn || this.arnBuilder.kmsKey(this.region, keyId);
            try {
                const rotation = await client.send(new client_kms_1.GetKeyRotationStatusCommand({ KeyId: keyId }));
                if (!rotation.KeyRotationEnabled) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `KMS Key Rotation Not Enabled: ${keyId.slice(0, 8)}...`,
                        description: 'Automatic key rotation is not enabled',
                        analysis: 'Keys should be rotated annually for security.',
                        resource_id: keyId,
                        resource_arn: keyArn,
                        scan_type: 'kms_no_rotation',
                        compliance: [
                            this.cisCompliance('3.8', 'Ensure rotation for customer created CMKs is enabled'),
                            this.pciCompliance('3.6.4', 'Cryptographic key changes'),
                        ],
                        remediation: {
                            description: 'Enable automatic key rotation',
                            steps: ['Go to KMS Console', `Select key ${keyId}`, 'Key rotation tab', 'Enable automatic rotation'],
                            cli_command: `aws kms enable-key-rotation --key-id ${keyId}`,
                            estimated_effort: 'trivial',
                            automation_available: true,
                        },
                        evidence: { keyId, rotationEnabled: false },
                        risk_vector: 'key_management',
                    }));
                }
            }
            catch (e) {
                if (e.name !== 'UnsupportedOperationException') {
                    this.warn(`Failed to check rotation for key ${keyId}`);
                }
            }
            if (metadata.Origin === 'EXTERNAL') {
                findings.push(this.createFinding({
                    severity: 'info',
                    title: `KMS Key With External Material: ${keyId.slice(0, 8)}...`,
                    description: 'Key uses externally imported key material',
                    analysis: 'External key material requires manual rotation and backup.',
                    resource_id: keyId,
                    resource_arn: keyArn,
                    scan_type: 'kms_external_material',
                    compliance: [this.wellArchitectedCompliance('SEC', 'Protect data at rest')],
                    evidence: { keyId, origin: 'EXTERNAL' },
                    risk_vector: 'key_management',
                }));
            }
        }
        catch (error) {
            this.warn(`Failed to describe key ${keyId}`, { error: error.message });
        }
        return findings;
    }
}
exports.KMSScanner = KMSScanner;
async function scanKMS(region, accountId, credentials, cache) {
    const scanner = new KMSScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map