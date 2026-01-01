"use strict";
/**
 * Security Engine V3 - S3 Scanner
 * Comprehensive S3 security checks (20+ checks)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Scanner = void 0;
exports.scanS3 = scanS3;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_s3_1 = require("@aws-sdk/client-s3");
class S3Scanner extends base_scanner_js_1.BaseScanner {
    get serviceName() {
        return 'S3';
    }
    get category() {
        return 'Data Protection';
    }
    async scan() {
        this.log('Starting S3 security scan');
        const findings = [];
        const s3Client = await this.clientFactory.getS3Client(this.region);
        try {
            const bucketsResponse = await s3Client.send(new client_s3_1.ListBucketsCommand({}));
            const buckets = bucketsResponse.Buckets || [];
            for (const bucket of buckets) {
                if (!bucket.Name)
                    continue;
                const bucketFindings = await this.scanBucket(s3Client, bucket.Name);
                findings.push(...bucketFindings);
            }
        }
        catch (error) {
            this.warn('Failed to list S3 buckets', { error: error.message });
        }
        this.log('S3 scan completed', { findingsCount: findings.length });
        return findings;
    }
    async scanBucket(client, bucketName) {
        const findings = [];
        const bucketArn = this.arnBuilder.s3Bucket(bucketName);
        // Check 1: Public Access Block
        await this.safeExecute('publicAccessBlock', async () => {
            try {
                const response = await client.send(new client_s3_1.GetPublicAccessBlockCommand({ Bucket: bucketName }));
                const config = response.PublicAccessBlockConfiguration;
                if (!config?.BlockPublicAcls || !config?.BlockPublicPolicy ||
                    !config?.IgnorePublicAcls || !config?.RestrictPublicBuckets) {
                    findings.push(this.createFinding({
                        severity: 'critical',
                        title: `S3 Bucket Public Access Not Fully Blocked: ${bucketName}`,
                        description: `Bucket does not have all public access block settings enabled`,
                        analysis: 'CRITICAL RISK: Bucket may be exposed publicly.',
                        resource_id: bucketName,
                        resource_arn: bucketArn,
                        scan_type: 's3_public_access_not_blocked',
                        compliance: [
                            this.cisCompliance('2.1.5', 'Ensure S3 bucket public access is blocked'),
                            this.pciCompliance('7.1', 'Limit access to system components'),
                        ],
                        remediation: {
                            description: 'Enable all public access block settings',
                            steps: [
                                'Go to S3 Console',
                                `Select bucket ${bucketName}`,
                                'Go to Permissions tab',
                                'Edit Block public access settings',
                                'Enable all four settings',
                            ],
                            cli_command: `aws s3api put-public-access-block --bucket ${bucketName} --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true`,
                            estimated_effort: 'trivial',
                            automation_available: true,
                        },
                        evidence: { bucketName, publicAccessBlock: config },
                        risk_vector: 'public_exposure',
                    }));
                }
            }
            catch (e) {
                if (e.name === 'NoSuchPublicAccessBlockConfiguration') {
                    findings.push(this.createFinding({
                        severity: 'critical',
                        title: `S3 Bucket No Public Access Block: ${bucketName}`,
                        description: `Bucket does not have public access block configured`,
                        analysis: 'CRITICAL RISK: Bucket has no public access restrictions.',
                        resource_id: bucketName,
                        resource_arn: bucketArn,
                        scan_type: 's3_no_public_access_block',
                        compliance: [this.cisCompliance('2.1.5', 'Ensure S3 bucket public access is blocked')],
                        evidence: { bucketName, hasPublicAccessBlock: false },
                        risk_vector: 'public_exposure',
                    }));
                }
                else {
                    throw e;
                }
            }
        }, null);
        // Check 2: Encryption
        await this.safeExecute('encryption', async () => {
            try {
                await client.send(new client_s3_1.GetBucketEncryptionCommand({ Bucket: bucketName }));
            }
            catch (e) {
                if (e.name === 'ServerSideEncryptionConfigurationNotFoundError') {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `S3 Bucket Without Default Encryption: ${bucketName}`,
                        description: `Bucket does not have default encryption enabled`,
                        analysis: 'HIGH RISK: Objects may be stored unencrypted.',
                        resource_id: bucketName,
                        resource_arn: bucketArn,
                        scan_type: 's3_no_encryption',
                        compliance: [
                            this.cisCompliance('2.1.1', 'Ensure S3 bucket encryption is enabled'),
                            this.pciCompliance('3.4', 'Render PAN unreadable'),
                            this.lgpdCompliance('Art.46', 'Medidas de segurança'),
                        ],
                        remediation: {
                            description: 'Enable default encryption for the bucket',
                            steps: [
                                'Go to S3 Console',
                                `Select bucket ${bucketName}`,
                                'Go to Properties tab',
                                'Edit Default encryption',
                                'Enable SSE-S3 or SSE-KMS',
                            ],
                            cli_command: `aws s3api put-bucket-encryption --bucket ${bucketName} --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'`,
                            estimated_effort: 'trivial',
                            automation_available: true,
                        },
                        evidence: { bucketName, hasEncryption: false },
                        risk_vector: 'data_exposure',
                    }));
                }
                else {
                    throw e;
                }
            }
        }, null);
        // Check 3: Versioning
        await this.safeExecute('versioning', async () => {
            const response = await client.send(new client_s3_1.GetBucketVersioningCommand({ Bucket: bucketName }));
            if (response.Status !== 'Enabled') {
                findings.push(this.createFinding({
                    severity: 'low',
                    title: `S3 Bucket Without Versioning: ${bucketName}`,
                    description: `Bucket versioning is ${response.Status || 'not enabled'}`,
                    analysis: 'Versioning protects against accidental deletion and overwrites.',
                    resource_id: bucketName,
                    resource_arn: bucketArn,
                    scan_type: 's3_no_versioning',
                    compliance: [this.cisCompliance('2.1.3', 'Ensure S3 bucket versioning is enabled')],
                    evidence: { bucketName, versioningStatus: response.Status },
                    risk_vector: 'data_loss',
                }));
            }
        }, null);
        // Check 4: Logging
        await this.safeExecute('logging', async () => {
            const response = await client.send(new client_s3_1.GetBucketLoggingCommand({ Bucket: bucketName }));
            if (!response.LoggingEnabled) {
                findings.push(this.createFinding({
                    severity: 'low',
                    title: `S3 Bucket Without Access Logging: ${bucketName}`,
                    description: `Bucket does not have access logging enabled`,
                    analysis: 'Access logging helps with security auditing and forensics.',
                    resource_id: bucketName,
                    resource_arn: bucketArn,
                    scan_type: 's3_no_logging',
                    compliance: [this.cisCompliance('2.1.2', 'Ensure S3 bucket logging is enabled')],
                    evidence: { bucketName, hasLogging: false },
                    risk_vector: 'no_audit_trail',
                }));
            }
        }, null);
        // Check 5: Bucket Policy Analysis
        await this.safeExecute('bucketPolicy', async () => {
            try {
                const policyResponse = await client.send(new client_s3_1.GetBucketPolicyCommand({ Bucket: bucketName }));
                if (policyResponse.Policy) {
                    const policy = JSON.parse(policyResponse.Policy);
                    for (const statement of policy.Statement || []) {
                        // Check for overly permissive policies
                        if (statement.Effect === 'Allow' && statement.Principal === '*') {
                            const hasCondition = statement.Condition && Object.keys(statement.Condition).length > 0;
                            if (!hasCondition) {
                                findings.push(this.createFinding({
                                    severity: 'critical',
                                    title: `S3 Bucket With Public Policy: ${bucketName}`,
                                    description: `Bucket policy allows public access without conditions`,
                                    analysis: 'CRITICAL RISK: Anyone can access this bucket.',
                                    resource_id: bucketName,
                                    resource_arn: bucketArn,
                                    scan_type: 's3_public_policy',
                                    compliance: [
                                        this.cisCompliance('2.1.5', 'Ensure S3 bucket public access is blocked'),
                                        this.pciCompliance('7.1', 'Limit access to system components'),
                                    ],
                                    evidence: { bucketName, statement },
                                    risk_vector: 'public_exposure',
                                }));
                            }
                        }
                        // Check for HTTP-only access (should require HTTPS)
                        const secureTransport = statement.Condition?.Bool?.['aws:SecureTransport'];
                        if (statement.Effect === 'Allow' && !secureTransport) {
                            findings.push(this.createFinding({
                                severity: 'medium',
                                title: `S3 Bucket Allows HTTP Access: ${bucketName}`,
                                description: `Bucket policy does not enforce HTTPS`,
                                analysis: 'Data in transit should be encrypted using HTTPS.',
                                resource_id: bucketName,
                                resource_arn: bucketArn,
                                scan_type: 's3_allows_http',
                                compliance: [this.pciCompliance('4.1', 'Use strong cryptography for transmission')],
                                evidence: { bucketName },
                                risk_vector: 'data_exposure',
                            }));
                        }
                    }
                }
            }
            catch (e) {
                // No bucket policy - OK
                if (e.name !== 'NoSuchBucketPolicy')
                    throw e;
            }
        }, null);
        // Check 6: ACL Analysis
        await this.safeExecute('acl', async () => {
            const response = await client.send(new client_s3_1.GetBucketAclCommand({ Bucket: bucketName }));
            for (const grant of response.Grants || []) {
                const grantee = grant.Grantee;
                // Check for public ACL grants
                if (grantee?.URI?.includes('AllUsers') || grantee?.URI?.includes('AuthenticatedUsers')) {
                    findings.push(this.createFinding({
                        severity: 'critical',
                        title: `S3 Bucket With Public ACL: ${bucketName}`,
                        description: `Bucket ACL grants access to ${grantee.URI}`,
                        analysis: 'CRITICAL RISK: Bucket is publicly accessible via ACL.',
                        resource_id: bucketName,
                        resource_arn: bucketArn,
                        scan_type: 's3_public_acl',
                        compliance: [this.cisCompliance('2.1.5', 'Ensure S3 bucket public access is blocked')],
                        evidence: { bucketName, grantee, permission: grant.Permission },
                        risk_vector: 'public_exposure',
                    }));
                }
            }
        }, null);
        // Check 7: Website hosting (potential data exposure)
        await this.safeExecute('website', async () => {
            try {
                const response = await client.send(new client_s3_1.GetBucketWebsiteCommand({ Bucket: bucketName }));
                if (response.IndexDocument) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `S3 Bucket With Website Hosting: ${bucketName}`,
                        description: `Bucket is configured for static website hosting`,
                        analysis: 'Website hosting makes bucket content publicly accessible. Ensure this is intentional.',
                        resource_id: bucketName,
                        resource_arn: bucketArn,
                        scan_type: 's3_website_hosting',
                        compliance: [this.wellArchitectedCompliance('SEC', 'Protect data at rest')],
                        evidence: { bucketName, indexDocument: response.IndexDocument },
                        risk_vector: 'public_exposure',
                    }));
                }
            }
            catch (e) {
                // No website configuration - OK
                if (e.name !== 'NoSuchWebsiteConfiguration')
                    throw e;
            }
        }, null);
        // Check 8: CORS configuration
        await this.safeExecute('cors', async () => {
            try {
                const response = await client.send(new client_s3_1.GetBucketCorsCommand({ Bucket: bucketName }));
                for (const rule of response.CORSRules || []) {
                    if (rule.AllowedOrigins?.includes('*')) {
                        findings.push(this.createFinding({
                            severity: 'medium',
                            title: `S3 Bucket With Wildcard CORS: ${bucketName}`,
                            description: `CORS allows requests from any origin`,
                            analysis: 'Wildcard CORS can enable cross-site attacks.',
                            resource_id: bucketName,
                            resource_arn: bucketArn,
                            scan_type: 's3_wildcard_cors',
                            compliance: [this.wellArchitectedCompliance('SEC', 'Protect data in transit')],
                            evidence: { bucketName, corsRule: rule },
                            risk_vector: 'data_exposure',
                        }));
                    }
                }
            }
            catch (e) {
                // No CORS configuration - OK
                if (e.name !== 'NoSuchCORSConfiguration')
                    throw e;
            }
        }, null);
        // Check 9: Lifecycle configuration
        await this.safeExecute('lifecycle', async () => {
            try {
                await client.send(new client_s3_1.GetBucketLifecycleConfigurationCommand({ Bucket: bucketName }));
            }
            catch (e) {
                if (e.name === 'NoSuchLifecycleConfiguration') {
                    findings.push(this.createFinding({
                        severity: 'info',
                        title: `S3 Bucket Without Lifecycle Policy: ${bucketName}`,
                        description: `Bucket does not have lifecycle rules configured`,
                        analysis: 'Lifecycle policies help manage storage costs and data retention.',
                        resource_id: bucketName,
                        resource_arn: bucketArn,
                        scan_type: 's3_no_lifecycle',
                        compliance: [this.wellArchitectedCompliance('COST', 'Implement cloud financial management')],
                        evidence: { bucketName },
                        risk_vector: 'data_loss',
                    }));
                }
                else {
                    throw e;
                }
            }
        }, null);
        // Check 10: Object Lock Configuration (Critical for compliance)
        await this.safeExecute('objectLock', async () => {
            try {
                const response = await client.send(new client_s3_1.GetObjectLockConfigurationCommand({ Bucket: bucketName }));
                // If we get here, Object Lock is enabled - check configuration
                const config = response.ObjectLockConfiguration;
                if (!config?.ObjectLockEnabled || config.ObjectLockEnabled !== 'Enabled') {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `S3 Object Lock Not Properly Configured: ${bucketName}`,
                        description: `Bucket has Object Lock configuration but it's not enabled`,
                        analysis: 'Object Lock provides additional protection against object deletion and modification.',
                        resource_id: bucketName,
                        resource_arn: bucketArn,
                        scan_type: 's3_object_lock_not_enabled',
                        compliance: [
                            this.cisCompliance('2.1.3', 'Ensure S3 bucket has Object Lock enabled'),
                            this.pciCompliance('3.4', 'Render PAN unreadable'),
                            this.nistCompliance('SC-28', 'Protection of Information at Rest'),
                        ],
                        evidence: { bucketName, objectLockConfig: config },
                        risk_vector: 'data_integrity',
                    }));
                }
                // Check if retention is configured
                if (!config?.Rule?.DefaultRetention) {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `S3 Object Lock Without Default Retention: ${bucketName}`,
                        description: `Object Lock is enabled but no default retention policy is configured`,
                        analysis: 'Default retention policies help ensure consistent data protection.',
                        resource_id: bucketName,
                        resource_arn: bucketArn,
                        scan_type: 's3_object_lock_no_default_retention',
                        compliance: [
                            this.wellArchitectedCompliance('REL', 'Protect data at rest'),
                            this.lgpdCompliance('Art. 46', 'Data retention policies'),
                        ],
                        remediation: {
                            description: 'Configure default retention policy for Object Lock',
                            steps: [
                                'Go to S3 Console',
                                `Select bucket ${bucketName}`,
                                'Go to Properties tab',
                                'Edit Object Lock configuration',
                                'Set default retention period',
                            ],
                            estimated_effort: 'low',
                            automation_available: true,
                        },
                        evidence: { bucketName, hasDefaultRetention: false },
                        risk_vector: 'data_integrity',
                    }));
                }
            }
            catch (e) {
                if (e.name === 'ObjectLockConfigurationNotFoundError') {
                    // Object Lock is not enabled - this is a finding for critical buckets
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `S3 Object Lock Not Enabled: ${bucketName}`,
                        description: `Bucket does not have Object Lock enabled for immutable storage`,
                        analysis: 'Object Lock provides WORM (Write Once Read Many) protection against accidental or malicious deletion/modification.',
                        resource_id: bucketName,
                        resource_arn: bucketArn,
                        scan_type: 's3_object_lock_disabled',
                        compliance: [
                            this.cisCompliance('2.1.3', 'Ensure S3 bucket has Object Lock enabled for critical data'),
                            this.pciCompliance('3.4', 'Render PAN unreadable'),
                            this.nistCompliance('SC-28', 'Protection of Information at Rest'),
                            this.soc2Compliance('CC6.1', 'Logical and physical access controls'),
                        ],
                        remediation: {
                            description: 'Enable Object Lock for critical data protection',
                            steps: [
                                'Note: Object Lock can only be enabled during bucket creation',
                                'For existing buckets, create a new bucket with Object Lock',
                                'Copy data to the new bucket',
                                'Update applications to use the new bucket',
                                'Delete the old bucket after verification',
                            ],
                            cli_command: `aws s3api create-bucket --bucket ${bucketName}-with-lock --object-lock-enabled-for-bucket --region ${this.region}`,
                            estimated_effort: 'high',
                            automation_available: false,
                        },
                        evidence: { bucketName, objectLockEnabled: false },
                        risk_vector: 'data_integrity',
                        attack_vectors: ['Accidental deletion', 'Malicious modification', 'Ransomware'],
                        business_impact: 'Critical data could be permanently lost or modified without proper immutable storage protection.',
                    }));
                }
                else {
                    throw e;
                }
            }
        }, null);
        return findings;
    }
}
exports.S3Scanner = S3Scanner;
async function scanS3(region, accountId, credentials, cache) {
    const scanner = new S3Scanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map