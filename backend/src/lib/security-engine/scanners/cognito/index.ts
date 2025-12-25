/**
 * Security Engine V2 - Cognito Scanner
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
  DescribeUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider';

export class CognitoScanner extends BaseScanner {
  get serviceName(): string { return 'Cognito'; }
  get category(): string { return 'Identity Security'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting Cognito security scan');
    const findings: Finding[] = [];
    const client = await this.clientFactory.getCognitoClient(this.region);

    try {
      const response = await client.send(new ListUserPoolsCommand({ MaxResults: 60 }));
      for (const pool of response.UserPools || []) {
        if (!pool.Id) continue;
        const poolFindings = await this.checkUserPool(client, pool.Id, pool.Name || pool.Id);
        findings.push(...poolFindings);
      }
    } catch (error) {
      this.warn('Failed to list user pools', { error: (error as Error).message });
    }

    this.log('Cognito scan completed', { findingsCount: findings.length });
    return findings;
  }

  private async checkUserPool(client: CognitoIdentityProviderClient, poolId: string, poolName: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    const poolArn = this.arnBuilder.cognitoUserPool(this.region, poolId);

    try {
      const details = await client.send(new DescribeUserPoolCommand({ UserPoolId: poolId }));
      const pool = details.UserPool;
      if (!pool) return findings;

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
      } else if (mfaConfig === 'OPTIONAL') {
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
    } catch (error) {
      this.warn(`Failed to describe user pool ${poolId}`, { error: (error as Error).message });
    }

    return findings;
  }
}

export async function scanCognito(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new CognitoScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
