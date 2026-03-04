/**
 * Security Engine V3 - IAM Scanner
 * Comprehensive IAM security checks (25+ checks)
 * 
 * Features:
 * - Retry strategy with exponential backoff for AWS API calls
 * - Graceful error handling for throttling
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import { withRetry } from '../../core/aws-retry.js';
import {
  IAMClient,
  GetAccountPasswordPolicyCommand,
  ListUsersCommand,
  ListAccessKeysCommand,
  GetAccessKeyLastUsedCommand,
  GetLoginProfileCommand,
  ListMFADevicesCommand,
  ListAttachedUserPoliciesCommand,
  ListUserPoliciesCommand,
  ListRolesCommand,
  GetAccountSummaryCommand,
} from '@aws-sdk/client-iam';
import {
  AccessAnalyzerClient,
  ListAnalyzersCommand,
  ListFindingsCommand,
  GetAnalyzerCommand,
} from '@aws-sdk/client-accessanalyzer';

/**
 * Helper to send IAM commands with retry
 */
async function sendWithRetry(client: IAMClient, command: any, operationName: string): Promise<any> {
  return withRetry(
    () => client.send(command),
    operationName,
    { maxRetries: 3, baseDelayMs: 200 }
  );
}

export class IAMScanner extends BaseScanner {
  get serviceName(): string {
    return 'IAM';
  }

  get category(): string {
    return 'Identity Security';
  }

  async scan(): Promise<Finding[]> {
    this.log('Starting IAM security scan');
    const findings: Finding[] = [];

    const iamClient = await this.clientFactory.getIAMClient();

    // Run all checks in parallel where possible
    const checkResults = await Promise.allSettled([
      this.checkPasswordPolicy(iamClient),
      this.checkRootAccountMFA(iamClient),
      this.checkUsersMFA(iamClient),
      this.checkAccessKeys(iamClient),
      this.checkAdminPolicies(iamClient),
      this.checkRoleTrustPolicies(iamClient),
      this.checkAccountSummary(iamClient),
      this.checkAccessAnalyzer(), // New critical check
    ]);

    for (const result of checkResults) {
      if (result.status === 'fulfilled') {
        findings.push(...result.value);
      } else {
        this.warn('Check failed', { error: result.reason?.message });
      }
    }

    this.log('IAM scan completed', { findingsCount: findings.length });
    return findings;
  }


  private async checkPasswordPolicy(client: IAMClient): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const response = await sendWithRetry(
        client, 
        new GetAccountPasswordPolicyCommand({}),
        'GetAccountPasswordPolicy'
      );
      const policy = response.PasswordPolicy;

      if (!policy) {
        findings.push(this.createFinding({
          severity: 'high',
          title: 'No IAM Password Policy Configured',
          description: 'AWS account does not have a password policy configured',
          analysis: 'HIGH RISK: Users can create weak passwords without any restrictions.',
          resource_id: 'account-password-policy',
          resource_arn: this.arnBuilder.iamAccountPasswordPolicy(),
          scan_type: 'iam_no_password_policy',
          compliance: [
            this.cisCompliance('1.5', 'Ensure IAM password policy requires at least one uppercase letter'),
            this.pciCompliance('8.2.3', 'Password complexity requirements'),
          ],
          remediation: {
            description: 'Configure a strong password policy for the AWS account',
            steps: [
              'Go to IAM Console > Account settings',
              'Click "Change password policy"',
              'Enable all complexity requirements',
              'Set minimum length to 14 characters',
            ],
            cli_command: 'aws iam update-account-password-policy --minimum-password-length 14 --require-symbols --require-numbers --require-uppercase-characters --require-lowercase-characters --max-password-age 90 --password-reuse-prevention 24',
            estimated_effort: 'trivial',
            automation_available: true,
          },
          evidence: { hasPolicy: false },
          risk_vector: 'weak_authentication',
        }));
        return findings;
      }

      // Check uppercase requirement
      if (!policy.RequireUppercaseCharacters) {
        findings.push(this.createFinding({
          severity: 'medium',
          title: 'Password Policy Missing Uppercase Requirement',
          description: 'Password policy does not require uppercase characters',
          analysis: 'Passwords without uppercase characters are easier to crack.',
          resource_id: 'account-password-policy',
          resource_arn: this.arnBuilder.iamAccountPasswordPolicy(),
          scan_type: 'iam_password_no_uppercase',
          compliance: [this.cisCompliance('1.5', 'Ensure IAM password policy requires at least one uppercase letter')],
          evidence: { requireUppercase: false },
          risk_vector: 'weak_authentication',
        }));
      }

      // Check lowercase requirement
      if (!policy.RequireLowercaseCharacters) {
        findings.push(this.createFinding({
          severity: 'medium',
          title: 'Password Policy Missing Lowercase Requirement',
          description: 'Password policy does not require lowercase characters',
          analysis: 'Passwords without lowercase characters are easier to crack.',
          resource_id: 'account-password-policy',
          resource_arn: this.arnBuilder.iamAccountPasswordPolicy(),
          scan_type: 'iam_password_no_lowercase',
          compliance: [this.cisCompliance('1.6', 'Ensure IAM password policy requires at least one lowercase letter')],
          evidence: { requireLowercase: false },
          risk_vector: 'weak_authentication',
        }));
      }

      // Check numbers requirement
      if (!policy.RequireNumbers) {
        findings.push(this.createFinding({
          severity: 'medium',
          title: 'Password Policy Missing Numbers Requirement',
          description: 'Password policy does not require numbers',
          analysis: 'Passwords without numbers are easier to crack.',
          resource_id: 'account-password-policy',
          resource_arn: this.arnBuilder.iamAccountPasswordPolicy(),
          scan_type: 'iam_password_no_numbers',
          compliance: [this.cisCompliance('1.7', 'Ensure IAM password policy requires at least one number')],
          evidence: { requireNumbers: false },
          risk_vector: 'weak_authentication',
        }));
      }

      // Check symbols requirement
      if (!policy.RequireSymbols) {
        findings.push(this.createFinding({
          severity: 'medium',
          title: 'Password Policy Missing Symbols Requirement',
          description: 'Password policy does not require symbols',
          analysis: 'Passwords without symbols are easier to crack.',
          resource_id: 'account-password-policy',
          resource_arn: this.arnBuilder.iamAccountPasswordPolicy(),
          scan_type: 'iam_password_no_symbols',
          compliance: [this.cisCompliance('1.8', 'Ensure IAM password policy requires at least one symbol')],
          evidence: { requireSymbols: false },
          risk_vector: 'weak_authentication',
        }));
      }

      // Check minimum length
      if ((policy.MinimumPasswordLength || 0) < 14) {
        findings.push(this.createFinding({
          severity: 'medium',
          title: 'Password Policy Minimum Length Too Short',
          description: `Password minimum length is ${policy.MinimumPasswordLength || 'not set'} (recommended: 14+)`,
          analysis: 'Short passwords are more vulnerable to brute force attacks.',
          resource_id: 'account-password-policy',
          resource_arn: this.arnBuilder.iamAccountPasswordPolicy(),
          scan_type: 'iam_password_short_length',
          compliance: [this.cisCompliance('1.9', 'Ensure IAM password policy requires minimum length of 14 or greater')],
          evidence: { minLength: policy.MinimumPasswordLength },
          risk_vector: 'weak_authentication',
        }));
      }

      // Check password reuse prevention
      if ((policy.PasswordReusePrevention || 0) < 24) {
        findings.push(this.createFinding({
          severity: 'low',
          title: 'Password Reuse Prevention Too Low',
          description: `Password reuse prevention is ${policy.PasswordReusePrevention || 'not set'} (recommended: 24)`,
          analysis: 'Users may reuse old passwords, reducing security.',
          resource_id: 'account-password-policy',
          resource_arn: this.arnBuilder.iamAccountPasswordPolicy(),
          scan_type: 'iam_password_reuse_low',
          compliance: [this.cisCompliance('1.10', 'Ensure IAM password policy prevents password reuse')],
          evidence: { reusePrevention: policy.PasswordReusePrevention },
          risk_vector: 'weak_authentication',
        }));
      }

      // Check max password age
      if ((policy.MaxPasswordAge || 0) > 90 || !policy.MaxPasswordAge) {
        findings.push(this.createFinding({
          severity: 'low',
          title: 'Password Expiration Period Too Long',
          description: `Password expiration is ${policy.MaxPasswordAge || 'never'} days (recommended: 90 or less)`,
          analysis: 'Long-lived passwords increase the risk of compromise.',
          resource_id: 'account-password-policy',
          resource_arn: this.arnBuilder.iamAccountPasswordPolicy(),
          scan_type: 'iam_password_max_age_high',
          compliance: [this.cisCompliance('1.11', 'Ensure IAM password policy expires passwords within 90 days or less')],
          evidence: { maxAge: policy.MaxPasswordAge },
          risk_vector: 'stale_credentials',
        }));
      }
    } catch (error: any) {
      if (error.name === 'NoSuchEntityException') {
        findings.push(this.createFinding({
          severity: 'high',
          title: 'No IAM Password Policy Configured',
          description: 'AWS account does not have a password policy configured',
          analysis: 'HIGH RISK: Users can create weak passwords without any restrictions.',
          resource_id: 'account-password-policy',
          resource_arn: this.arnBuilder.iamAccountPasswordPolicy(),
          scan_type: 'iam_no_password_policy',
          compliance: [this.cisCompliance('1.5', 'Ensure IAM password policy requires at least one uppercase letter')],
          evidence: { error: 'NoSuchEntity' },
          risk_vector: 'weak_authentication',
        }));
      } else {
        throw error;
      }
    }

    return findings;
  }


  private async checkRootAccountMFA(client: IAMClient): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const summary = await client.send(new GetAccountSummaryCommand({}));
      const summaryMap = summary.SummaryMap || {};

      // Check if root account has MFA
      if (summaryMap.AccountMFAEnabled !== 1) {
        findings.push(this.createFinding({
          severity: 'critical',
          title: 'Root Account MFA Not Enabled',
          description: 'The AWS root account does not have MFA enabled',
          analysis: 'CRITICAL RISK: Root account has unrestricted access. Without MFA, a compromised password gives full account access.',
          resource_id: 'root-account',
          resource_arn: this.arnBuilder.iamRootAccount(),
          scan_type: 'iam_root_no_mfa',
          compliance: [
            this.cisCompliance('1.1', 'Ensure MFA is enabled for the root account'),
            this.pciCompliance('8.3.1', 'MFA for all access to cardholder data'),
            this.nistCompliance('IA-2(1)', 'Multi-factor Authentication'),
          ],
          remediation: {
            description: 'Enable MFA for the root account immediately',
            steps: [
              'Sign in to AWS Console as root user',
              'Go to Security Credentials',
              'Click "Activate MFA"',
              'Choose Virtual MFA device or Hardware MFA',
              'Complete the MFA setup',
            ],
            estimated_effort: 'trivial',
            automation_available: false,
          },
          evidence: { accountMFAEnabled: summaryMap.AccountMFAEnabled },
          risk_vector: 'weak_authentication',
          attack_vectors: ['Credential theft', 'Phishing', 'Password spray'],
          business_impact: 'Complete account takeover possible. Attacker could delete all resources, exfiltrate data, or incur massive costs.',
        }));
      }

      // Check for root access keys
      if ((summaryMap.AccountAccessKeysPresent || 0) > 0) {
        findings.push(this.createFinding({
          severity: 'critical',
          title: 'Root Account Has Access Keys',
          description: 'The AWS root account has active access keys',
          analysis: 'CRITICAL RISK: Root access keys should never exist. They provide programmatic full account access.',
          resource_id: 'root-account',
          resource_arn: this.arnBuilder.iamRootAccount(),
          scan_type: 'iam_root_access_keys',
          compliance: [
            this.cisCompliance('1.4', 'Ensure no root account access key exists'),
            this.pciCompliance('2.1', 'Do not use vendor-supplied defaults'),
          ],
          remediation: {
            description: 'Delete root account access keys immediately',
            steps: [
              'Sign in to AWS Console as root user',
              'Go to Security Credentials',
              'Find Access Keys section',
              'Delete all access keys',
              'Create IAM users for programmatic access instead',
            ],
            estimated_effort: 'low',
            automation_available: false,
          },
          evidence: { accessKeysPresent: summaryMap.AccountAccessKeysPresent },
          risk_vector: 'credential_exposure',
          attack_vectors: ['Key theft', 'Code repository scanning', 'Log analysis'],
        }));
      }
    } catch (error) {
      this.warn('Failed to check root account', { error: (error as Error).message });
    }

    return findings;
  }

  private async checkUsersMFA(client: IAMClient): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const usersResponse = await client.send(new ListUsersCommand({}));
      const users = usersResponse.Users || [];

      for (const user of users) {
        if (!user.UserName) continue;

        // Check MFA devices
        const mfaResponse = await client.send(new ListMFADevicesCommand({ UserName: user.UserName }));
        const hasMFA = (mfaResponse.MFADevices?.length || 0) > 0;

        if (!hasMFA) {
          // Check if user has console access
          let hasConsoleAccess = false;
          try {
            await client.send(new GetLoginProfileCommand({ UserName: user.UserName }));
            hasConsoleAccess = true;
          } catch (e: any) {
            if (e.name !== 'NoSuchEntityException') throw e;
          }

          if (hasConsoleAccess) {
            findings.push(this.createFinding({
              severity: 'high',
              title: `IAM User Without MFA: ${user.UserName}`,
              description: `User ${user.UserName} has console access but no MFA configured`,
              analysis: 'HIGH RISK: Console users without MFA are vulnerable to credential theft and phishing.',
              resource_id: user.UserName,
              resource_arn: user.Arn || this.arnBuilder.iamUser(user.UserName),
              scan_type: 'iam_user_no_mfa_console',
              compliance: [
                this.cisCompliance('1.2', 'Ensure MFA is enabled for all IAM users with console password'),
                this.pciCompliance('8.3', 'Secure all individual non-console administrative access'),
              ],
              remediation: {
                description: 'Enable MFA for this user',
                steps: [
                  'Go to IAM Console > Users',
                  `Select user ${user.UserName}`,
                  'Go to Security credentials tab',
                  'Click "Manage" next to MFA device',
                  'Set up virtual or hardware MFA',
                ],
                cli_command: `aws iam create-virtual-mfa-device --virtual-mfa-device-name ${user.UserName}-mfa --outfile /tmp/qr.png --bootstrap-method QRCodePNG`,
                estimated_effort: 'low',
                automation_available: true,
              },
              evidence: { userName: user.UserName, hasConsoleAccess: true, hasMFA: false },
              risk_vector: 'weak_authentication',
            }));
          } else {
            // API-only user without MFA (lower severity)
            findings.push(this.createFinding({
              severity: 'medium',
              title: `IAM User Without MFA (API Only): ${user.UserName}`,
              description: `User ${user.UserName} does not have MFA configured`,
              analysis: 'MFA is recommended even for API-only users for additional security.',
              resource_id: user.UserName,
              resource_arn: user.Arn || this.arnBuilder.iamUser(user.UserName),
              scan_type: 'iam_user_no_mfa_api',
              compliance: [this.cisCompliance('1.2', 'Ensure MFA is enabled for all IAM users')],
              evidence: { userName: user.UserName, hasConsoleAccess: false, hasMFA: false },
              risk_vector: 'weak_authentication',
            }));
          }
        }
      }
    } catch (error) {
      this.warn('Failed to check users MFA', { error: (error as Error).message });
    }

    return findings;
  }


  private async checkAccessKeys(client: IAMClient): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const usersResponse = await client.send(new ListUsersCommand({}));
      const users = usersResponse.Users || [];

      for (const user of users) {
        if (!user.UserName) continue;

        const keysResponse = await client.send(new ListAccessKeysCommand({ UserName: user.UserName }));
        const activeKeys = (keysResponse.AccessKeyMetadata || []).filter(k => k.Status === 'Active');
        
        for (const key of keysResponse.AccessKeyMetadata || []) {
          if (!key.CreateDate || !key.AccessKeyId) continue;

          const ageInDays = Math.floor((Date.now() - key.CreateDate.getTime()) / (1000 * 60 * 60 * 24));

          // ============================================================
          // CHECK 1: Long-lived programmatic access keys (ANY active key)
          // This is the PRIMARY finding — static credentials are inherently risky
          // ============================================================
          if (key.Status === 'Active') {
            // Determine severity based on age thresholds
            let severity: 'critical' | 'high' | 'medium';
            let analysis: string;

            if (ageInDays > 365) {
              severity = 'critical';
              analysis = 'CRITICAL RISK: This access key has been active for over a year. Long-lived static credentials are the #1 cause of AWS account compromises. They can be leaked in code repositories, logs, CI/CD configs, or stolen from developer machines. Unlike temporary credentials from SSO/IAM Identity Center, static keys never expire and provide persistent access without MFA. This key must be eliminated immediately.';
            } else if (ageInDays > 180) {
              severity = 'high';
              analysis = 'HIGH RISK: This access key has been active for over 6 months. Static access keys (aws_access_key_id / aws_secret_access_key) are a severe security risk because they never expire, cannot enforce MFA per-request, and are frequently leaked in source code, environment variables, or CI/CD pipelines. Migrate to IAM Identity Center (SSO) for human users or IAM Roles for services.';
            } else if (ageInDays > 90) {
              severity = 'high';
              analysis = 'HIGH RISK: This access key exceeds the 90-day rotation policy. Even with rotation, static credentials remain fundamentally insecure. AWS strongly recommends eliminating long-lived access keys entirely in favor of temporary credential mechanisms.';
            } else {
              severity = 'medium';
              analysis = 'SECURITY WARNING: Active static access key detected. Even new access keys represent a security risk. Static credentials (aws_access_key_id / aws_secret_access_key) are the most common vector for AWS account compromise. They can be accidentally committed to Git, leaked in logs, or stolen from workstations. Plan migration to temporary credentials via IAM Identity Center (SSO) or IAM Roles.';
            }

            // Get last used info for richer evidence
            let lastUsedInfo: { lastUsedDate?: string; lastUsedService?: string; lastUsedRegion?: string; neverUsed?: boolean } = {};
            try {
              const lastUsedResponse = await sendWithRetry(client, new GetAccessKeyLastUsedCommand({ AccessKeyId: key.AccessKeyId }), 'GetAccessKeyLastUsed');
              const lastUsed = lastUsedResponse.AccessKeyLastUsed;
              if (lastUsed?.LastUsedDate) {
                lastUsedInfo = {
                  lastUsedDate: lastUsed.LastUsedDate.toISOString(),
                  lastUsedService: lastUsed.ServiceName || 'unknown',
                  lastUsedRegion: lastUsed.Region || 'unknown',
                };
              } else {
                lastUsedInfo = { neverUsed: true };
              }
            } catch {
              // Non-critical, continue without last used info
            }

            const recommendedAlternative = this.getRecommendedAlternative(user.UserName, lastUsedInfo.lastUsedService);

            findings.push(this.createFinding({
              severity,
              title: `Static Access Key Detected: ${user.UserName} (${ageInDays} days)`,
              description: `IAM user ${user.UserName} has active static access key ${key.AccessKeyId} (aws_access_key_id/aws_secret_access_key). Age: ${ageInDays} days. ${lastUsedInfo.neverUsed ? 'Key has NEVER been used.' : `Last used: ${lastUsedInfo.lastUsedDate || 'unknown'} on ${lastUsedInfo.lastUsedService || 'unknown'}.`}`,
              analysis,
              resource_id: key.AccessKeyId,
              resource_arn: this.arnBuilder.iamAccessKey(user.UserName, key.AccessKeyId),
              scan_type: 'iam_static_access_key',
              compliance: [
                this.cisCompliance('1.14', 'Ensure access keys are rotated every 90 days or less'),
                this.cisCompliance('1.4', 'Ensure no root user account access key exists'),
                this.pciCompliance('8.2.4', 'Change user passwords at least once every 90 days'),
                this.nistCompliance('IA-5(1)', 'Password-Based Authentication - use temporary credentials'),
                this.wellArchitectedCompliance('SEC02-BP02', 'Use temporary credentials instead of long-lived access keys'),
              ],
              remediation: {
                description: recommendedAlternative.description,
                steps: recommendedAlternative.steps,
                cli_command: recommendedAlternative.cli_command,
                estimated_effort: ageInDays > 180 ? 'high' : 'medium',
                automation_available: true,
              },
              evidence: {
                userName: user.UserName,
                accessKeyId: key.AccessKeyId,
                ageInDays,
                status: key.Status,
                ...lastUsedInfo,
                recommendedAlternative: recommendedAlternative.type,
              },
              risk_vector: 'static_credentials',
              attack_vectors: [
                'Source code repository scanning (GitHub, GitLab leaks)',
                'Environment variable exposure in CI/CD logs',
                'Credential theft from developer workstations',
                'Phishing attacks targeting developers',
                'Insider threat with persistent access',
                'Shared credentials across team members',
              ],
              business_impact: severity === 'critical'
                ? 'Extremely old static key provides persistent unauthorized access. If compromised, attacker has indefinite access without MFA until key is manually revoked.'
                : 'Static credentials provide persistent access without MFA enforcement. If leaked, attacker retains access until key is manually discovered and revoked.',
            }));
          }

          // ============================================================
          // CHECK 2: Never-used access keys (created but abandoned)
          // ============================================================
          if (key.Status === 'Active' && ageInDays > 7) {
            try {
              const lastUsedResponse = await sendWithRetry(client, new GetAccessKeyLastUsedCommand({ AccessKeyId: key.AccessKeyId }), 'GetAccessKeyLastUsed');
              const lastUsed = lastUsedResponse.AccessKeyLastUsed;
              
              if (!lastUsed?.LastUsedDate) {
                findings.push(this.createFinding({
                  severity: 'high',
                  title: `Never-Used Access Key: ${user.UserName} (${ageInDays} days old)`,
                  description: `Access key ${key.AccessKeyId} for user ${user.UserName} was created ${ageInDays} days ago but has NEVER been used`,
                  analysis: 'HIGH RISK: This access key was created but never used. It likely represents forgotten credentials that expand the attack surface unnecessarily. An attacker who discovers this key would have access that the legitimate owner may not even be monitoring. Delete immediately.',
                  resource_id: key.AccessKeyId,
                  resource_arn: this.arnBuilder.iamAccessKey(user.UserName, key.AccessKeyId),
                  scan_type: 'iam_never_used_access_key',
                  compliance: [
                    this.cisCompliance('1.12', 'Ensure credentials unused for 90 days or greater are disabled'),
                    this.wellArchitectedCompliance('SEC02-BP02', 'Use temporary credentials'),
                  ],
                  remediation: {
                    description: 'Delete this unused access key immediately',
                    steps: [
                      `Confirm with user ${user.UserName} that the key is not needed`,
                      'Delete the access key since it was never used',
                      'If programmatic access is needed, use IAM Identity Center or IAM Roles instead',
                    ],
                    cli_command: `aws iam delete-access-key --user-name ${user.UserName} --access-key-id ${key.AccessKeyId}`,
                    estimated_effort: 'trivial',
                    automation_available: true,
                  },
                  evidence: { userName: user.UserName, accessKeyId: key.AccessKeyId, ageInDays, neverUsed: true },
                  risk_vector: 'abandoned_credentials',
                }));
              }

              // CHECK 3: Access key not used in 90+ days (dormant)
              if (lastUsed?.LastUsedDate) {
                const daysSinceLastUse = Math.floor((Date.now() - lastUsed.LastUsedDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysSinceLastUse > 90) {
                  findings.push(this.createFinding({
                    severity: 'high',
                    title: `Dormant Access Key: ${user.UserName} (unused ${daysSinceLastUse} days)`,
                    description: `Access key ${key.AccessKeyId} for user ${user.UserName} has not been used in ${daysSinceLastUse} days. Last used on ${lastUsed.LastUsedDate.toISOString().split('T')[0]} with ${lastUsed.ServiceName || 'unknown service'}`,
                    analysis: `HIGH RISK: This access key has been dormant for ${daysSinceLastUse} days. Dormant credentials are prime targets for attackers because their misuse is less likely to be noticed. If the key is no longer needed, delete it. If still needed, migrate to temporary credentials.`,
                    resource_id: key.AccessKeyId,
                    resource_arn: this.arnBuilder.iamAccessKey(user.UserName, key.AccessKeyId),
                    scan_type: 'iam_dormant_access_key',
                    compliance: [
                      this.cisCompliance('1.12', 'Ensure credentials unused for 90 days or greater are disabled'),
                      this.nistCompliance('AC-2(3)', 'Disable inactive accounts'),
                    ],
                    remediation: {
                      description: 'Disable or delete this dormant access key',
                      steps: [
                        `Verify with user ${user.UserName} if this key is still needed`,
                        'If not needed: delete the key immediately',
                        'If still needed: migrate to IAM Identity Center (SSO) or IAM Roles',
                        'As interim measure: disable the key and monitor for complaints',
                      ],
                      cli_command: `aws iam update-access-key --user-name ${user.UserName} --access-key-id ${key.AccessKeyId} --status Inactive`,
                      estimated_effort: 'low',
                      automation_available: true,
                    },
                    evidence: {
                      userName: user.UserName,
                      accessKeyId: key.AccessKeyId,
                      daysSinceLastUse,
                      lastUsedDate: lastUsed.LastUsedDate.toISOString(),
                      lastUsedService: lastUsed.ServiceName,
                      lastUsedRegion: lastUsed.Region,
                    },
                    risk_vector: 'stale_credentials',
                  }));
                }
              }
            } catch {
              // Non-critical, continue
            }
          }

          // ============================================================
          // CHECK 4: Inactive access keys that should be deleted
          // ============================================================
          if (key.Status === 'Inactive' && ageInDays > 30) {
            findings.push(this.createFinding({
              severity: 'low',
              title: `Inactive Access Key Should Be Deleted: ${user.UserName}`,
              description: `Inactive access key ${key.AccessKeyId} has been inactive for ${ageInDays} days`,
              analysis: 'Inactive keys should be deleted to reduce attack surface. An inactive key can be re-activated by anyone with IAM permissions.',
              resource_id: key.AccessKeyId,
              resource_arn: this.arnBuilder.iamAccessKey(user.UserName, key.AccessKeyId),
              scan_type: 'iam_inactive_access_key',
              compliance: [this.cisCompliance('1.12', 'Ensure credentials unused for 90 days or greater are disabled')],
              remediation: {
                description: 'Delete this inactive access key',
                steps: [
                  'Confirm the key is no longer needed',
                  'Delete the access key permanently',
                ],
                cli_command: `aws iam delete-access-key --user-name ${user.UserName} --access-key-id ${key.AccessKeyId}`,
                estimated_effort: 'trivial',
                automation_available: true,
              },
              evidence: { userName: user.UserName, accessKeyId: key.AccessKeyId, status: 'Inactive', ageInDays },
              risk_vector: 'stale_credentials',
            }));
          }
        }

        // ============================================================
        // CHECK 5: Multiple active access keys per user
        // ============================================================
        if (activeKeys.length > 1) {
          findings.push(this.createFinding({
            severity: 'medium',
            title: `Multiple Active Access Keys: ${user.UserName}`,
            description: `User ${user.UserName} has ${activeKeys.length} active access keys. This doubles the attack surface and suggests poor credential hygiene.`,
            analysis: 'Multiple active keys indicate either a failed rotation (old key not deleted) or shared credentials across systems. Each additional key is another secret that can be leaked. Consolidate to zero keys using IAM Roles/SSO, or at most one key during migration.',
            resource_id: user.UserName,
            resource_arn: user.Arn || this.arnBuilder.iamUser(user.UserName),
            scan_type: 'iam_multiple_access_keys',
            compliance: [
              this.wellArchitectedCompliance('SEC02-BP02', 'Use temporary credentials'),
              this.cisCompliance('1.14', 'Ensure access keys are rotated every 90 days or less'),
            ],
            remediation: {
              description: 'Consolidate to a single key, then migrate to temporary credentials',
              steps: [
                'Identify which key is actively used (check GetAccessKeyLastUsed)',
                'Delete the unused/older key',
                'Plan migration from remaining key to IAM Identity Center or IAM Roles',
              ],
              estimated_effort: 'medium',
              automation_available: true,
            },
            evidence: { userName: user.UserName, activeKeyCount: activeKeys.length, keyIds: activeKeys.map(k => k.AccessKeyId) },
            risk_vector: 'credential_exposure',
          }));
        }
      }
    } catch (error) {
      this.warn('Failed to check access keys', { error: (error as Error).message });
    }

    return findings;
  }

  /**
   * Determine the best alternative to static access keys based on usage context
   */
  private getRecommendedAlternative(userName: string, lastUsedService?: string): {
    type: string;
    description: string;
    steps: string[];
    cli_command?: string;
  } {
    // Service accounts / CI/CD patterns
    const cicdPatterns = ['codebuild', 'codepipeline', 'deploy', 'ci-', 'cd-', 'jenkins', 'github', 'gitlab', 'bitbucket', 'terraform', 'ansible'];
    const isCICD = cicdPatterns.some(p => userName.toLowerCase().includes(p));
    
    // Application/service patterns
    const servicePatterns = ['svc-', 'service-', 'app-', 'api-', 'lambda', 'ecs', 'ec2'];
    const isServiceAccount = servicePatterns.some(p => userName.toLowerCase().includes(p));

    // S3/data pipeline patterns
    const dataPatterns = ['s3', 'data', 'etl', 'backup', 'sync'];
    const isDataPipeline = dataPatterns.some(p => userName.toLowerCase().includes(p)) || lastUsedService === 's3';

    if (isCICD) {
      return {
        type: 'iam_role_cicd',
        description: 'Replace static keys with IAM Roles for CI/CD. Use OIDC federation for GitHub Actions, or IAM Roles for CodeBuild/CodePipeline.',
        steps: [
          'For GitHub Actions: Configure OIDC identity provider in IAM and create a role with trust policy for your repo',
          'For CodeBuild/CodePipeline: Assign an IAM Role directly to the service (no keys needed)',
          'For Jenkins on EC2: Use EC2 Instance Profile with IAM Role',
          'For external CI/CD: Use IAM Roles Anywhere with X.509 certificates',
          `After migration, delete the access key: aws iam delete-access-key --user-name ${userName} --access-key-id <KEY_ID>`,
          `Then delete the IAM user if no longer needed: aws iam delete-user --user-name ${userName}`,
        ],
        cli_command: `# GitHub Actions OIDC example:\naws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com --thumbprint-list <THUMBPRINT>`,
      };
    }

    if (isServiceAccount || isDataPipeline) {
      return {
        type: 'iam_role_service',
        description: 'Replace static keys with IAM Roles. Services running on AWS (Lambda, ECS, EC2, etc.) should use execution roles. External services should use IAM Roles Anywhere.',
        steps: [
          'For AWS services (Lambda/ECS/EC2): Assign an IAM execution role directly — no access keys needed',
          'For external applications: Use AWS IAM Roles Anywhere with X.509 certificates for temporary credentials',
          'For cross-account access: Use IAM Role with sts:AssumeRole trust policy',
          'For S3 integrations: Use S3 Access Points with IAM Roles or pre-signed URLs',
          `After migration, delete the access key and IAM user`,
        ],
        cli_command: `# Create IAM Role for the service:\naws iam create-role --role-name ${userName}-role --assume-role-policy-document file://trust-policy.json`,
      };
    }

    // Default: Human user — recommend SSO/Identity Center
    return {
      type: 'iam_identity_center_sso',
      description: 'Migrate to AWS IAM Identity Center (SSO). Human users should NEVER use static access keys. SSO authenticates via browser, creates temporary session credentials, and enforces MFA automatically.',
      steps: [
        'Enable AWS IAM Identity Center (SSO) in your management account if not already enabled',
        'Create or connect an identity source (Built-in, Active Directory, or external IdP like Okta/Azure AD)',
        `Create a user account for ${userName} in Identity Center`,
        'Assign appropriate Permission Sets (replaces IAM policies)',
        `User authenticates via: aws sso login --profile <PROFILE_NAME>`,
        'CLI automatically gets temporary credentials (valid 1-12 hours, configurable)',
        'No aws_access_key_id or aws_secret_access_key stored anywhere',
        `After SSO is working, delete the static access key: aws iam delete-access-key --user-name ${userName} --access-key-id <KEY_ID>`,
        `Delete the IAM user: aws iam delete-user --user-name ${userName}`,
      ],
      cli_command: `# Configure SSO profile in ~/.aws/config:\n# [profile my-sso-profile]\n# sso_start_url = https://your-org.awsapps.com/start\n# sso_region = us-east-1\n# sso_account_id = 123456789012\n# sso_role_name = AdministratorAccess\n# region = us-east-1\n#\n# Then login: aws sso login --profile my-sso-profile`,
    };
  }

  private async checkAdminPolicies(client: IAMClient): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const usersResponse = await client.send(new ListUsersCommand({}));
      const users = usersResponse.Users || [];

      for (const user of users) {
        if (!user.UserName) continue;

        // Check attached policies
        const attachedPolicies = await client.send(new ListAttachedUserPoliciesCommand({ UserName: user.UserName }));
        
        for (const policy of attachedPolicies.AttachedPolicies || []) {
          if (policy.PolicyArn?.includes('AdministratorAccess') || 
              policy.PolicyName?.toLowerCase().includes('admin')) {
            findings.push(this.createFinding({
              severity: 'medium',
              title: `User With Direct Admin Policy: ${user.UserName}`,
              description: `User ${user.UserName} has admin policy ${policy.PolicyName} attached directly`,
              analysis: 'Direct admin policies on users bypass group-based access control. Use groups instead.',
              resource_id: user.UserName,
              resource_arn: user.Arn || this.arnBuilder.iamUser(user.UserName),
              scan_type: 'iam_direct_admin_policy',
              compliance: [
                this.cisCompliance('1.16', 'Ensure IAM policies are attached only to groups or roles'),
                this.nistCompliance('AC-6', 'Least Privilege'),
              ],
              remediation: {
                description: 'Move admin access to a group',
                steps: [
                  'Create an Administrators group if not exists',
                  'Attach the admin policy to the group',
                  'Add the user to the group',
                  'Remove the direct policy attachment from the user',
                ],
                estimated_effort: 'low',
                automation_available: true,
              },
              evidence: { userName: user.UserName, policyName: policy.PolicyName, policyArn: policy.PolicyArn },
              risk_vector: 'excessive_permissions',
            }));
          }
        }

        // Check inline policies
        const inlinePolicies = await client.send(new ListUserPoliciesCommand({ UserName: user.UserName }));
        
        if ((inlinePolicies.PolicyNames?.length || 0) > 0) {
          findings.push(this.createFinding({
            severity: 'low',
            title: `User With Inline Policies: ${user.UserName}`,
            description: `User ${user.UserName} has ${inlinePolicies.PolicyNames?.length} inline policies`,
            analysis: 'Inline policies are harder to manage and audit. Use managed policies instead.',
            resource_id: user.UserName,
            resource_arn: user.Arn || this.arnBuilder.iamUser(user.UserName),
            scan_type: 'iam_inline_policies',
            compliance: [this.cisCompliance('1.16', 'Ensure IAM policies are attached only to groups or roles')],
            evidence: { userName: user.UserName, inlinePolicyCount: inlinePolicies.PolicyNames?.length },
            risk_vector: 'excessive_permissions',
          }));
        }
      }
    } catch (error) {
      this.warn('Failed to check admin policies', { error: (error as Error).message });
    }

    return findings;
  }

  private async checkRoleTrustPolicies(client: IAMClient): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const rolesResponse = await client.send(new ListRolesCommand({}));
      const roles = rolesResponse.Roles || [];

      for (const role of roles) {
        if (!role.RoleName || !role.AssumeRolePolicyDocument) continue;

        // Skip AWS service-linked roles
        if (role.Path?.startsWith('/aws-service-role/')) continue;

        try {
          const trustPolicy = JSON.parse(decodeURIComponent(role.AssumeRolePolicyDocument));
          
          for (const statement of trustPolicy.Statement || []) {
            if (statement.Effect !== 'Allow') continue;

            const principal = statement.Principal;
            
            // Check for wildcard principal
            if (principal === '*' || principal?.AWS === '*') {
              findings.push(this.createFinding({
                severity: 'critical',
                title: `Role With Wildcard Trust: ${role.RoleName}`,
                description: `Role ${role.RoleName} trusts all AWS accounts (Principal: *)`,
                analysis: 'CRITICAL RISK: Any AWS account can assume this role. This is almost never intended.',
                resource_id: role.RoleName,
                resource_arn: role.Arn || this.arnBuilder.iamRole(role.RoleName),
                scan_type: 'iam_role_wildcard_trust',
                compliance: [
                  this.cisCompliance('1.20', 'Ensure IAM role trust policies do not allow all principals'),
                  this.nistCompliance('AC-3', 'Access Enforcement'),
                ],
                remediation: {
                  description: 'Restrict the trust policy to specific accounts or principals',
                  steps: [
                    'Identify which accounts/principals should be able to assume this role',
                    'Update the trust policy with specific ARNs',
                    'Add conditions like ExternalId for cross-account access',
                  ],
                  estimated_effort: 'medium',
                  automation_available: false,
                },
                evidence: { roleName: role.RoleName, trustPolicy },
                risk_vector: 'excessive_permissions',
                attack_vectors: ['Cross-account privilege escalation', 'Unauthorized access'],
              }));
            }

            // Check for cross-account access without external ID
            if (typeof principal?.AWS === 'string' && !principal.AWS.includes(this.accountId)) {
              const hasExternalId = statement.Condition?.StringEquals?.['sts:ExternalId'];
              
              if (!hasExternalId) {
                findings.push(this.createFinding({
                  severity: 'medium',
                  title: `Cross-Account Role Without External ID: ${role.RoleName}`,
                  description: `Role ${role.RoleName} allows cross-account access without ExternalId condition`,
                  analysis: 'Cross-account roles should use ExternalId to prevent confused deputy attacks.',
                  resource_id: role.RoleName,
                  resource_arn: role.Arn || this.arnBuilder.iamRole(role.RoleName),
                  scan_type: 'iam_role_no_external_id',
                  compliance: [this.wellArchitectedCompliance('SEC', 'Use external ID for cross-account access')],
                  evidence: { roleName: role.RoleName, crossAccountPrincipal: principal.AWS },
                  risk_vector: 'excessive_permissions',
                }));
              }
            }
          }
        } catch (parseError) {
          this.warn(`Failed to parse trust policy for role ${role.RoleName}`);
        }
      }
    } catch (error) {
      this.warn('Failed to check role trust policies', { error: (error as Error).message });
    }

    return findings;
  }

  private async checkAccountSummary(client: IAMClient): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const summary = await client.send(new GetAccountSummaryCommand({}));
      const summaryMap = summary.SummaryMap || {};

      // Check for users without groups
      if (summaryMap.Users && summaryMap.Users > 0 && summaryMap.Groups === 0) {
        findings.push(this.createFinding({
          severity: 'medium',
          title: 'No IAM Groups Configured',
          description: `Account has ${summaryMap.Users} users but no groups for access management`,
          analysis: 'Groups simplify permission management and auditing.',
          resource_id: 'account-summary',
          resource_arn: this.arnBuilder.iamRootAccount(),
          scan_type: 'iam_no_groups',
          compliance: [this.cisCompliance('1.16', 'Ensure IAM policies are attached only to groups or roles')],
          evidence: { users: summaryMap.Users, groups: summaryMap.Groups },
          risk_vector: 'excessive_permissions',
        }));
      }

      // Check for excessive policies
      if ((summaryMap.Policies || 0) > 100) {
        findings.push(this.createFinding({
          severity: 'low',
          title: 'High Number of IAM Policies',
          description: `Account has ${summaryMap.Policies} policies which may indicate policy sprawl`,
          analysis: 'Consider consolidating policies for easier management.',
          resource_id: 'account-summary',
          resource_arn: this.arnBuilder.iamRootAccount(),
          scan_type: 'iam_policy_sprawl',
          compliance: [this.wellArchitectedCompliance('SEC', 'Implement least privilege')],
          evidence: { policyCount: summaryMap.Policies },
          risk_vector: 'excessive_permissions',
        }));
      }

      // Check for server certificates (should use ACM instead)
      if ((summaryMap.ServerCertificates || 0) > 0) {
        findings.push(this.createFinding({
          severity: 'low',
          title: 'IAM Server Certificates in Use',
          description: `Account has ${summaryMap.ServerCertificates} server certificates stored in IAM`,
          analysis: 'Consider using AWS Certificate Manager (ACM) for certificate management.',
          resource_id: 'account-summary',
          resource_arn: this.arnBuilder.iamRootAccount(),
          scan_type: 'iam_server_certificates',
          compliance: [this.wellArchitectedCompliance('SEC', 'Protect data in transit')],
          evidence: { serverCertificates: summaryMap.ServerCertificates },
          risk_vector: 'key_management',
        }));
      }
    } catch (error) {
      this.warn('Failed to get account summary', { error: (error as Error).message });
    }

    return findings;
  }

  /**
   * Check IAM Access Analyzer configuration and findings
   * CRITICAL: Access Analyzer helps identify resources shared with external entities
   */
  private async checkAccessAnalyzer(): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const accessAnalyzerClient = await this.clientFactory.getAccessAnalyzerClient(this.region);

      // Check if Access Analyzer is enabled
      const analyzersResponse = await accessAnalyzerClient.send(new ListAnalyzersCommand({}));
      const analyzers = analyzersResponse.analyzers || [];

      if (analyzers.length === 0) {
        findings.push(this.createFinding({
          severity: 'high',
          title: 'IAM Access Analyzer Not Enabled',
          description: 'IAM Access Analyzer is not enabled in this region',
          analysis: 'HIGH RISK: Access Analyzer helps identify resources shared with external entities and potential security risks.',
          resource_id: 'access-analyzer',
          resource_arn: this.arnBuilder.accessAnalyzer(this.region),
          scan_type: 'iam_access_analyzer_disabled',
          compliance: [
            this.cisCompliance('1.20', 'Ensure IAM Access Analyzer is enabled'),
            this.wellArchitectedCompliance('SEC', 'Implement access management'),
            this.nistCompliance('AC-3', 'Access Enforcement'),
          ],
          remediation: {
            description: 'Enable IAM Access Analyzer to monitor resource sharing',
            steps: [
              'Go to IAM Console > Access Analyzer',
              'Click "Create analyzer"',
              'Choose "Account" as the zone of trust',
              'Name the analyzer and create it',
              'Review findings regularly',
            ],
            cli_command: `aws accessanalyzer create-analyzer --analyzer-name account-analyzer --type ACCOUNT --region ${this.region}`,
            estimated_effort: 'trivial',
            automation_available: true,
          },
          evidence: { analyzersCount: 0, region: this.region },
          risk_vector: 'insufficient_monitoring',
          attack_vectors: ['Undetected resource sharing', 'External access'],
          business_impact: 'Potential data exposure through unmonitored external access to resources.',
        }));
        return findings;
      }

      // Check each analyzer
      for (const analyzer of analyzers) {
        if (!analyzer.arn || !analyzer.name) continue;

        // Check analyzer status
        if (analyzer.status !== 'ACTIVE') {
          findings.push(this.createFinding({
            severity: 'medium',
            title: `Access Analyzer Not Active: ${analyzer.name}`,
            description: `Access Analyzer ${analyzer.name} is in ${analyzer.status} status`,
            analysis: 'Inactive analyzers cannot detect external resource sharing.',
            resource_id: analyzer.name,
            resource_arn: analyzer.arn,
            scan_type: 'iam_access_analyzer_inactive',
            compliance: [this.wellArchitectedCompliance('SEC', 'Implement access management')],
            evidence: { analyzerName: analyzer.name, status: analyzer.status },
            risk_vector: 'insufficient_monitoring',
          }));
          continue;
        }

        // Check for active findings
        try {
          const findingsResponse = await accessAnalyzerClient.send(new ListFindingsCommand({
            analyzerArn: analyzer.arn,
            filter: {
              status: {
                eq: ['ACTIVE']
              }
            }
          }));

          const activeFindings = findingsResponse.findings || [];
          
          if (activeFindings.length > 0) {
            // Group findings by severity
            const criticalFindings = activeFindings.filter((f: any) => f.condition?.includes('*') || f.principal?.includes('*'));
            const publicFindings = activeFindings.filter((f: any) => f.isPublic);
            
            if (criticalFindings.length > 0) {
              findings.push(this.createFinding({
                severity: 'critical',
                title: `Critical Access Analyzer Findings: ${criticalFindings.length}`,
                description: `Access Analyzer found ${criticalFindings.length} critical findings with wildcard or public access`,
                analysis: 'CRITICAL RISK: Resources are accessible by anyone or have overly broad permissions.',
                resource_id: analyzer.name,
                resource_arn: analyzer.arn,
                scan_type: 'iam_access_analyzer_critical_findings',
                compliance: [
                  this.cisCompliance('1.20', 'Review Access Analyzer findings'),
                  this.nistCompliance('AC-3', 'Access Enforcement'),
                ],
                remediation: {
                  description: 'Review and remediate critical Access Analyzer findings immediately',
                  steps: [
                    'Go to IAM Console > Access Analyzer',
                    'Review each critical finding',
                    'Determine if external access is intended',
                    'Modify resource policies to restrict access',
                    'Archive findings after remediation',
                  ],
                  estimated_effort: 'high',
                  automation_available: false,
                },
                evidence: { 
                  analyzerName: analyzer.name, 
                  criticalFindings: criticalFindings.length,
                  totalFindings: activeFindings.length,
                  sampleFindings: criticalFindings.slice(0, 3).map((f: any) => ({
                    resourceType: f.resourceType,
                    resourceArn: f.resource,
                    principal: f.principal,
                    condition: f.condition
                  }))
                },
                risk_vector: 'excessive_permissions',
                attack_vectors: ['External access', 'Data exfiltration', 'Privilege escalation'],
                business_impact: 'Potential unauthorized access to sensitive resources and data.',
              }));
            }

            if (publicFindings.length > 0) {
              findings.push(this.createFinding({
                severity: 'high',
                title: `Public Resources Detected: ${publicFindings.length}`,
                description: `Access Analyzer found ${publicFindings.length} resources accessible from the internet`,
                analysis: 'HIGH RISK: Resources are publicly accessible from the internet.',
                resource_id: analyzer.name,
                resource_arn: analyzer.arn,
                scan_type: 'iam_access_analyzer_public_findings',
                compliance: [
                  this.cisCompliance('1.20', 'Review Access Analyzer findings'),
                  this.pciCompliance('1.3.1', 'Implement a DMZ'),
                ],
                evidence: { 
                  analyzerName: analyzer.name, 
                  publicFindings: publicFindings.length,
                  sampleResources: publicFindings.slice(0, 3).map((f: any) => ({
                    resourceType: f.resourceType,
                    resourceArn: f.resource
                  }))
                },
                risk_vector: 'public_exposure',
              }));
            }

            // General findings summary
            if (activeFindings.length > 10) {
              findings.push(this.createFinding({
                severity: 'medium',
                title: `High Number of Access Analyzer Findings: ${activeFindings.length}`,
                description: `Access Analyzer has ${activeFindings.length} active findings requiring review`,
                analysis: 'Large number of findings may indicate systematic access control issues.',
                resource_id: analyzer.name,
                resource_arn: analyzer.arn,
                scan_type: 'iam_access_analyzer_many_findings',
                compliance: [this.wellArchitectedCompliance('SEC', 'Implement access management')],
                evidence: { analyzerName: analyzer.name, findingsCount: activeFindings.length },
                risk_vector: 'excessive_permissions',
              }));
            }
          }
        } catch (findingsError) {
          this.warn(`Failed to get Access Analyzer findings for ${analyzer.name}`, { error: (findingsError as Error).message });
        }
      }
    } catch (error) {
      this.warn('Failed to check Access Analyzer', { error: (error as Error).message });
    }

    return findings;
  }
}

export async function scanIAM(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new IAMScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
