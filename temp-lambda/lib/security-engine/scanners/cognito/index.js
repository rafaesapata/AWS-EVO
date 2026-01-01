"use strict";
/**
 * Security Engine V3 - Cognito Scanner
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CognitoScanner = void 0;
exports.scanCognito = scanCognito;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
class CognitoScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() { return 'Cognito'; }
    get category() { return 'Identity Security'; }
    async scan() {
        this.log('Starting Cognito security scan');
        const findings = [];
        const client = await this.clientFactory.getCognitoClient(this.region);
        try {
            const response = await client.send(new client_cognito_identity_provider_1.ListUserPoolsCommand({ MaxResults: 60 }));
            for (const pool of response.UserPools || []) {
                if (!pool.Id)
                    continue;
                const poolFindings = await this.checkUserPool(client, pool.Id, pool.Name || pool.Id);
                findings.push(...poolFindings);
            }
        }
        catch (error) {
            this.warn('Failed to list user pools', { error: error.message });
        }
        this.log('Cognito scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkUserPool(client, poolId, poolName) {
        const findings = [];
        const poolArn = this.arnBuilder.cognitoUserPool(this.region, poolId);
        try {
            const details = await client.send(new client_cognito_identity_provider_1.DescribeUserPoolCommand({ UserPoolId: poolId }));
            const pool = details.UserPool;
            if (!pool)
                return findings;
            const mfaConfig = pool.MfaConfiguration;
            if (mfaConfig === 'OFF') {
                findings.push(this.createFinding({
                    severity: 'high',
                    title: `Cognito MFA Disabled: ${poolName}`,
                    description: 'Multi-factor authentication is disabled for this user pool',
                    analysis: 'HIGH RISK: Users can authenticate with password only.',
                    resource_id: poolId,
                    resource_arn: poolArn,
                    scan_type: 'cognito_mfa_disabled',
                    compliance: [
                        this.cisCompliance('1.2', 'Ensure MFA is enabled'),
                        this.pciCompliance('8.3', 'Secure all individual non-console administrative access'),
                    ],
                    remediation: {
                        description: 'Enable MFA for the user pool',
                        steps: ['Go to Cognito Console', `Select ${poolName}`, 'Sign-in experience', 'Enable MFA'],
                        estimated_effort: 'medium',
                        automation_available: true,
                    },
                    evidence: { poolId, poolName, mfaConfiguration: mfaConfig },
                    risk_vector: 'weak_authentication',
                }));
            }
            else if (mfaConfig === 'OPTIONAL') {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: `Cognito MFA Optional: ${poolName}`,
                    description: 'MFA is optional, not required for all users',
                    analysis: 'Users may choose not to enable MFA.',
                    resource_id: poolId,
                    resource_arn: poolArn,
                    scan_type: 'cognito_mfa_optional',
                    compliance: [this.cisCompliance('1.2', 'Ensure MFA is enabled')],
                    evidence: { poolId, poolName, mfaConfiguration: mfaConfig },
                    risk_vector: 'weak_authentication',
                }));
            }
            const passwordPolicy = pool.Policies?.PasswordPolicy;
            if (passwordPolicy) {
                if ((passwordPolicy.MinimumLength || 0) < 12) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `Cognito Weak Password Policy: ${poolName}`,
                        description: `Minimum password length is ${passwordPolicy.MinimumLength} (recommended: 12+)`,
                        analysis: 'Short passwords are easier to crack.',
                        resource_id: poolId,
                        resource_arn: poolArn,
                        scan_type: 'cognito_weak_password_length',
                        compliance: [this.cisCompliance('1.9', 'Ensure IAM password policy requires minimum length of 14')],
                        evidence: { poolId, poolName, minLength: passwordPolicy.MinimumLength },
                        risk_vector: 'weak_authentication',
                    }));
                }
                if (!passwordPolicy.RequireUppercase || !passwordPolicy.RequireLowercase ||
                    !passwordPolicy.RequireNumbers || !passwordPolicy.RequireSymbols) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `Cognito Missing Password Complexity: ${poolName}`,
                        description: 'Password policy does not require all character types',
                        analysis: 'Passwords should require uppercase, lowercase, numbers, and symbols.',
                        resource_id: poolId,
                        resource_arn: poolArn,
                        scan_type: 'cognito_weak_password_complexity',
                        compliance: [this.cisCompliance('1.5', 'Ensure IAM password policy requires complexity')],
                        evidence: { poolId, poolName, passwordPolicy },
                        risk_vector: 'weak_authentication',
                    }));
                }
            }
            if (!pool.DeletionProtection || pool.DeletionProtection === 'INACTIVE') {
                findings.push(this.createFinding({
                    severity: 'low',
                    title: `Cognito Deletion Protection Disabled: ${poolName}`,
                    description: 'User pool can be deleted without protection',
                    analysis: 'Accidental deletion could cause authentication outage.',
                    resource_id: poolId,
                    resource_arn: poolArn,
                    scan_type: 'cognito_no_deletion_protection',
                    compliance: [this.wellArchitectedCompliance('REL', 'Protect data')],
                    evidence: { poolId, poolName },
                    risk_vector: 'availability',
                }));
            }
        }
        catch (error) {
            this.warn(`Failed to describe user pool ${poolId}`, { error: error.message });
        }
        return findings;
    }
}
exports.CognitoScanner = CognitoScanner;
async function scanCognito(region, accountId, credentials, cache) {
    const scanner = new CognitoScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map