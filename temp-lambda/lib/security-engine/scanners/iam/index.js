"use strict";
/**
 * Security Engine V3 - IAM Scanner
 * Comprehensive IAM security checks (25+ checks)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IAMScanner = void 0;
exports.scanIAM = scanIAM;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_iam_1 = require("@aws-sdk/client-iam");
const client_accessanalyzer_1 = require("@aws-sdk/client-accessanalyzer");
class IAMScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() {
        return 'IAM';
    }
    get category() {
        return 'Identity Security';
    }
    async scan() {
        this.log('Starting IAM security scan');
        const findings = [];
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
            }
            else {
                this.warn('Check failed', { error: result.reason?.message });
            }
        }
        this.log('IAM scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkPasswordPolicy(client) {
        const findings = [];
        try {
            const response = await client.send(new client_iam_1.GetAccountPasswordPolicyCommand({}));
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
        }
        catch (error) {
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
            }
            else {
                throw error;
            }
        }
        return findings;
    }
    async checkRootAccountMFA(client) {
        const findings = [];
        try {
            const summary = await client.send(new client_iam_1.GetAccountSummaryCommand({}));
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
        }
        catch (error) {
            this.warn('Failed to check root account', { error: error.message });
        }
        return findings;
    }
    async checkUsersMFA(client) {
        const findings = [];
        try {
            const usersResponse = await client.send(new client_iam_1.ListUsersCommand({}));
            const users = usersResponse.Users || [];
            for (const user of users) {
                if (!user.UserName)
                    continue;
                // Check MFA devices
                const mfaResponse = await client.send(new client_iam_1.ListMFADevicesCommand({ UserName: user.UserName }));
                const hasMFA = (mfaResponse.MFADevices?.length || 0) > 0;
                if (!hasMFA) {
                    // Check if user has console access
                    let hasConsoleAccess = false;
                    try {
                        await client.send(new client_iam_1.GetLoginProfileCommand({ UserName: user.UserName }));
                        hasConsoleAccess = true;
                    }
                    catch (e) {
                        if (e.name !== 'NoSuchEntityException')
                            throw e;
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
                    }
                    else {
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
        }
        catch (error) {
            this.warn('Failed to check users MFA', { error: error.message });
        }
        return findings;
    }
    async checkAccessKeys(client) {
        const findings = [];
        try {
            const usersResponse = await client.send(new client_iam_1.ListUsersCommand({}));
            const users = usersResponse.Users || [];
            for (const user of users) {
                if (!user.UserName)
                    continue;
                const keysResponse = await client.send(new client_iam_1.ListAccessKeysCommand({ UserName: user.UserName }));
                for (const key of keysResponse.AccessKeyMetadata || []) {
                    if (!key.CreateDate || !key.AccessKeyId)
                        continue;
                    const ageInDays = Math.floor((Date.now() - key.CreateDate.getTime()) / (1000 * 60 * 60 * 24));
                    // Check for old access keys (90+ days)
                    if (ageInDays > 90) {
                        const severity = ageInDays > 180 ? 'high' : 'medium';
                        findings.push(this.createFinding({
                            severity,
                            title: `Old Access Key: ${user.UserName} (${ageInDays} days)`,
                            description: `Access key ${key.AccessKeyId} for user ${user.UserName} is ${ageInDays} days old`,
                            analysis: ageInDays > 180
                                ? 'HIGH RISK: Very old access key may be compromised. Rotate immediately.'
                                : 'Access keys should be rotated every 90 days.',
                            resource_id: key.AccessKeyId,
                            resource_arn: this.arnBuilder.iamAccessKey(user.UserName, key.AccessKeyId),
                            scan_type: 'iam_old_access_key',
                            compliance: [
                                this.cisCompliance('1.14', 'Ensure access keys are rotated every 90 days or less'),
                                this.pciCompliance('8.2.4', 'Change user passwords at least once every 90 days'),
                            ],
                            remediation: {
                                description: 'Rotate the access key',
                                steps: [
                                    'Create a new access key for the user',
                                    'Update applications to use the new key',
                                    'Disable the old access key',
                                    'After confirming new key works, delete the old key',
                                ],
                                cli_command: `aws iam create-access-key --user-name ${user.UserName} && aws iam delete-access-key --user-name ${user.UserName} --access-key-id ${key.AccessKeyId}`,
                                estimated_effort: 'medium',
                                automation_available: true,
                            },
                            evidence: { userName: user.UserName, accessKeyId: key.AccessKeyId, ageInDays, status: key.Status },
                            risk_vector: 'stale_credentials',
                        }));
                    }
                    // Check for inactive access keys
                    if (key.Status === 'Inactive' && ageInDays > 30) {
                        findings.push(this.createFinding({
                            severity: 'low',
                            title: `Inactive Access Key Should Be Deleted: ${user.UserName}`,
                            description: `Inactive access key ${key.AccessKeyId} has been inactive for ${ageInDays} days`,
                            analysis: 'Inactive keys should be deleted to reduce attack surface.',
                            resource_id: key.AccessKeyId,
                            resource_arn: this.arnBuilder.iamAccessKey(user.UserName, key.AccessKeyId),
                            scan_type: 'iam_inactive_access_key',
                            compliance: [this.cisCompliance('1.12', 'Ensure credentials unused for 90 days or greater are disabled')],
                            evidence: { userName: user.UserName, accessKeyId: key.AccessKeyId, status: 'Inactive', ageInDays },
                            risk_vector: 'stale_credentials',
                        }));
                    }
                }
                // Check for multiple active access keys
                const activeKeys = (keysResponse.AccessKeyMetadata || []).filter(k => k.Status === 'Active');
                if (activeKeys.length > 1) {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `Multiple Active Access Keys: ${user.UserName}`,
                        description: `User ${user.UserName} has ${activeKeys.length} active access keys`,
                        analysis: 'Multiple active keys increase the attack surface. Consider consolidating.',
                        resource_id: user.UserName,
                        resource_arn: user.Arn || this.arnBuilder.iamUser(user.UserName),
                        scan_type: 'iam_multiple_access_keys',
                        compliance: [this.wellArchitectedCompliance('SEC', 'Implement least privilege')],
                        evidence: { userName: user.UserName, activeKeyCount: activeKeys.length },
                        risk_vector: 'credential_exposure',
                    }));
                }
            }
        }
        catch (error) {
            this.warn('Failed to check access keys', { error: error.message });
        }
        return findings;
    }
    async checkAdminPolicies(client) {
        const findings = [];
        try {
            const usersResponse = await client.send(new client_iam_1.ListUsersCommand({}));
            const users = usersResponse.Users || [];
            for (const user of users) {
                if (!user.UserName)
                    continue;
                // Check attached policies
                const attachedPolicies = await client.send(new client_iam_1.ListAttachedUserPoliciesCommand({ UserName: user.UserName }));
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
                const inlinePolicies = await client.send(new client_iam_1.ListUserPoliciesCommand({ UserName: user.UserName }));
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
        }
        catch (error) {
            this.warn('Failed to check admin policies', { error: error.message });
        }
        return findings;
    }
    async checkRoleTrustPolicies(client) {
        const findings = [];
        try {
            const rolesResponse = await client.send(new client_iam_1.ListRolesCommand({}));
            const roles = rolesResponse.Roles || [];
            for (const role of roles) {
                if (!role.RoleName || !role.AssumeRolePolicyDocument)
                    continue;
                // Skip AWS service-linked roles
                if (role.Path?.startsWith('/aws-service-role/'))
                    continue;
                try {
                    const trustPolicy = JSON.parse(decodeURIComponent(role.AssumeRolePolicyDocument));
                    for (const statement of trustPolicy.Statement || []) {
                        if (statement.Effect !== 'Allow')
                            continue;
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
                }
                catch (parseError) {
                    this.warn(`Failed to parse trust policy for role ${role.RoleName}`);
                }
            }
        }
        catch (error) {
            this.warn('Failed to check role trust policies', { error: error.message });
        }
        return findings;
    }
    async checkAccountSummary(client) {
        const findings = [];
        try {
            const summary = await client.send(new client_iam_1.GetAccountSummaryCommand({}));
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
        }
        catch (error) {
            this.warn('Failed to get account summary', { error: error.message });
        }
        return findings;
    }
    /**
     * Check IAM Access Analyzer configuration and findings
     * CRITICAL: Access Analyzer helps identify resources shared with external entities
     */
    async checkAccessAnalyzer() {
        const findings = [];
        try {
            const accessAnalyzerClient = await this.clientFactory.getAccessAnalyzerClient(this.region);
            // Check if Access Analyzer is enabled
            const analyzersResponse = await accessAnalyzerClient.send(new client_accessanalyzer_1.ListAnalyzersCommand({}));
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
                if (!analyzer.arn || !analyzer.name)
                    continue;
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
                    const findingsResponse = await accessAnalyzerClient.send(new client_accessanalyzer_1.ListFindingsCommand({
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
                        const criticalFindings = activeFindings.filter((f) => f.condition?.includes('*') || f.principal?.includes('*'));
                        const publicFindings = activeFindings.filter((f) => f.isPublic);
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
                                    sampleFindings: criticalFindings.slice(0, 3).map((f) => ({
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
                                    sampleResources: publicFindings.slice(0, 3).map((f) => ({
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
                }
                catch (findingsError) {
                    this.warn(`Failed to get Access Analyzer findings for ${analyzer.name}`, { error: findingsError.message });
                }
            }
        }
        catch (error) {
            this.warn('Failed to check Access Analyzer', { error: error.message });
        }
        return findings;
    }
}
exports.IAMScanner = IAMScanner;
async function scanIAM(region, accountId, credentials, cache) {
    const scanner = new IAMScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map