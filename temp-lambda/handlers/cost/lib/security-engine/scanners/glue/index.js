"use strict";
/**
 * Security Engine V2 - AWS Glue Scanner
 * Comprehensive Glue security checks for data processing workloads
 * NEW SCANNER - Sprint 1 Priority Implementation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlueScanner = void 0;
exports.scanGlue = scanGlue;
const base_scanner_js_1 = require("../../core/base-scanner.js");
const client_glue_1 = require("@aws-sdk/client-glue");
class GlueScanner extends base_scanner_js_1.BaseScanner {
    get serviceName() {
        return 'Glue';
    }
    get category() {
        return 'Data Processing';
    }
    async scan() {
        this.log('Starting Glue security scan');
        const findings = [];
        const glueClient = await this.clientFactory.getGlueClient(this.region);
        const checkResults = await Promise.allSettled([
            this.checkJobEncryption(glueClient),
            this.checkDataCatalogEncryption(glueClient),
            this.checkConnectionSSL(glueClient),
            this.checkCrawlerPermissions(glueClient),
            this.checkSecurityConfigurations(glueClient),
            this.checkDatabaseSecurity(glueClient),
        ]);
        for (const result of checkResults) {
            if (result.status === 'fulfilled') {
                findings.push(...result.value);
            }
            else {
                this.warn('Glue check failed', { error: result.reason?.message });
            }
        }
        this.log('Glue scan completed', { findingsCount: findings.length });
        return findings;
    }
    async checkJobEncryption(client) {
        const findings = [];
        try {
            const response = await client.send(new client_glue_1.GetJobsCommand({}));
            for (const job of response.Jobs || []) {
                if (!job.Name)
                    continue;
                const encryptionConfig = job.SecurityConfiguration;
                if (!encryptionConfig) {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `Glue Job Without Security Configuration: ${job.Name}`,
                        description: `Job does not have a security configuration for encryption`,
                        analysis: 'HIGH RISK: Job data may not be encrypted at rest or in transit.',
                        resource_id: job.Name,
                        resource_arn: this.arnBuilder.generic('glue', this.region, 'job', job.Name),
                        scan_type: 'glue_job_no_encryption',
                        compliance: [
                            this.cisCompliance('2.2.1', 'Ensure Glue jobs use security configurations'),
                            this.pciCompliance('3.4', 'Render PAN unreadable'),
                            this.nistCompliance('SC-28', 'Protection of Information at Rest'),
                        ],
                        remediation: {
                            description: 'Configure a security configuration for the Glue job',
                            steps: [
                                'Create a security configuration with encryption enabled',
                                'Update the job to use the security configuration',
                                'Enable S3 encryption and CloudWatch logs encryption',
                            ],
                            cli_command: `aws glue create-security-configuration --name ${job.Name}-security-config --encryption-configuration '{"S3Encryption":[{"S3EncryptionMode":"SSE-S3"}],"CloudWatchEncryption":{"CloudWatchEncryptionMode":"SSE-KMS"}}'`,
                            estimated_effort: 'medium',
                            automation_available: true,
                        },
                        evidence: { jobName: job.Name, hasSecurityConfig: false },
                        risk_vector: 'data_exposure',
                        attack_vectors: ['Data interception', 'Unauthorized access to job data'],
                        business_impact: 'Sensitive data processed by Glue jobs could be exposed without encryption.',
                    }));
                }
                // Check for overly permissive IAM role
                if (job.Role?.includes('Admin') || job.Role?.includes('PowerUser')) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `Glue Job With Overly Permissive Role: ${job.Name}`,
                        description: `Job uses a role that appears to have excessive permissions`,
                        analysis: 'Jobs should use least-privilege IAM roles.',
                        resource_id: job.Name,
                        resource_arn: this.arnBuilder.generic('glue', this.region, 'job', job.Name),
                        scan_type: 'glue_job_excessive_permissions',
                        compliance: [
                            this.cisCompliance('1.16', 'Ensure IAM policies follow least privilege'),
                            this.wellArchitectedCompliance('SEC', 'Implement least privilege'),
                        ],
                        evidence: { jobName: job.Name, role: job.Role },
                        risk_vector: 'excessive_permissions',
                    }));
                }
            }
        }
        catch (error) {
            this.warn('Failed to check Glue jobs', { error: error.message });
        }
        return findings;
    }
    async checkDataCatalogEncryption(client) {
        const findings = [];
        try {
            const response = await client.send(new client_glue_1.GetDataCatalogEncryptionSettingsCommand({}));
            const settings = response.DataCatalogEncryptionSettings;
            if (!settings?.EncryptionAtRest?.CatalogEncryptionMode ||
                settings.EncryptionAtRest.CatalogEncryptionMode === 'DISABLED') {
                findings.push(this.createFinding({
                    severity: 'high',
                    title: 'Glue Data Catalog Encryption Disabled',
                    description: 'Data Catalog does not have encryption at rest enabled',
                    analysis: 'HIGH RISK: Metadata in the Data Catalog is not encrypted.',
                    resource_id: 'data-catalog',
                    resource_arn: this.arnBuilder.generic('glue', this.region, 'catalog', 'default'),
                    scan_type: 'glue_catalog_no_encryption',
                    compliance: [
                        this.nistCompliance('SC-28', 'Protection of Information at Rest'),
                        this.pciCompliance('3.4', 'Render PAN unreadable'),
                    ],
                    remediation: {
                        description: 'Enable encryption for the Glue Data Catalog',
                        steps: [
                            'Go to Glue Console > Settings',
                            'Enable encryption for metadata',
                            'Choose SSE-KMS for stronger encryption',
                            'Select appropriate KMS key',
                        ],
                        cli_command: 'aws glue put-data-catalog-encryption-settings --data-catalog-encryption-settings \'{"EncryptionAtRest":{"CatalogEncryptionMode":"SSE-KMS"}}\'',
                        estimated_effort: 'low',
                        automation_available: true,
                    },
                    evidence: { encryptionMode: settings?.EncryptionAtRest?.CatalogEncryptionMode || 'DISABLED' },
                    risk_vector: 'data_exposure',
                }));
            }
            // Check connection password encryption
            if (!settings?.ConnectionPasswordEncryption?.ReturnConnectionPasswordEncrypted) {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: 'Glue Connection Password Encryption Disabled',
                    description: 'Connection passwords are not encrypted in the Data Catalog',
                    analysis: 'Connection passwords should be encrypted for security.',
                    resource_id: 'data-catalog',
                    resource_arn: this.arnBuilder.generic('glue', this.region, 'catalog', 'default'),
                    scan_type: 'glue_connection_password_no_encryption',
                    compliance: [
                        this.nistCompliance('SC-28', 'Protection of Information at Rest'),
                    ],
                    evidence: { passwordEncryption: false },
                    risk_vector: 'credential_exposure',
                }));
            }
        }
        catch (error) {
            this.warn('Failed to check Data Catalog encryption', { error: error.message });
        }
        return findings;
    }
    async checkConnectionSSL(client) {
        const findings = [];
        try {
            const response = await client.send(new client_glue_1.GetConnectionsCommand({}));
            for (const conn of response.ConnectionList || []) {
                if (!conn.Name)
                    continue;
                const props = conn.ConnectionProperties || {};
                const jdbcUrl = props['JDBC_CONNECTION_URL'] || '';
                // Check if SSL is enforced
                if (jdbcUrl && !jdbcUrl.includes('ssl=true') && !jdbcUrl.includes('useSSL=true') && !jdbcUrl.includes('sslmode=require')) {
                    findings.push(this.createFinding({
                        severity: 'medium',
                        title: `Glue Connection Without SSL: ${conn.Name}`,
                        description: `Connection does not enforce SSL for database connections`,
                        analysis: 'Data in transit may not be encrypted.',
                        resource_id: conn.Name,
                        resource_arn: this.arnBuilder.generic('glue', this.region, 'connection', conn.Name),
                        scan_type: 'glue_connection_no_ssl',
                        compliance: [
                            this.pciCompliance('4.1', 'Use strong cryptography'),
                            this.nistCompliance('SC-8', 'Transmission Confidentiality'),
                        ],
                        remediation: {
                            description: 'Enable SSL for database connections',
                            steps: [
                                'Go to Glue Console > Connections',
                                `Edit connection ${conn.Name}`,
                                'Add SSL parameters to JDBC URL',
                                'Test the connection',
                            ],
                            estimated_effort: 'low',
                            automation_available: true,
                        },
                        evidence: { connectionName: conn.Name, jdbcUrl: jdbcUrl.replace(/password=[^&;]*/gi, 'password=***') },
                        risk_vector: 'data_exposure',
                    }));
                }
                // Check for hardcoded credentials
                if (props['PASSWORD']) {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `Glue Connection With Hardcoded Password: ${conn.Name}`,
                        description: `Connection has password stored directly in connection properties`,
                        analysis: 'HIGH RISK: Passwords should be stored in AWS Secrets Manager.',
                        resource_id: conn.Name,
                        resource_arn: this.arnBuilder.generic('glue', this.region, 'connection', conn.Name),
                        scan_type: 'glue_connection_hardcoded_password',
                        compliance: [
                            this.cisCompliance('2.3.1', 'Ensure secrets are stored securely'),
                            this.nistCompliance('IA-5', 'Authenticator Management'),
                        ],
                        remediation: {
                            description: 'Move password to AWS Secrets Manager',
                            steps: [
                                'Create a secret in AWS Secrets Manager',
                                'Update connection to reference the secret',
                                'Remove password from connection properties',
                            ],
                            estimated_effort: 'medium',
                            automation_available: true,
                        },
                        evidence: { connectionName: conn.Name, hasHardcodedPassword: true },
                        risk_vector: 'credential_exposure',
                    }));
                }
            }
        }
        catch (error) {
            this.warn('Failed to check Glue connections', { error: error.message });
        }
        return findings;
    }
    async checkCrawlerPermissions(client) {
        const findings = [];
        try {
            const response = await client.send(new client_glue_1.GetCrawlersCommand({}));
            for (const crawler of response.Crawlers || []) {
                if (!crawler.Name)
                    continue;
                // Check if crawler role has overly permissive policies
                const role = crawler.Role;
                if (role?.includes('Admin') || role?.includes('PowerUser')) {
                    findings.push(this.createFinding({
                        severity: 'high',
                        title: `Glue Crawler With Overly Permissive Role: ${crawler.Name}`,
                        description: `Crawler uses a role that appears to have excessive permissions`,
                        analysis: 'Crawlers should use least-privilege IAM roles.',
                        resource_id: crawler.Name,
                        resource_arn: this.arnBuilder.generic('glue', this.region, 'crawler', crawler.Name),
                        scan_type: 'glue_crawler_excessive_permissions',
                        compliance: [
                            this.cisCompliance('1.16', 'Ensure IAM policies follow least privilege'),
                            this.wellArchitectedCompliance('SEC', 'Implement least privilege'),
                        ],
                        evidence: { crawlerName: crawler.Name, role },
                        risk_vector: 'excessive_permissions',
                    }));
                }
                // Check if crawler has schedule but no monitoring
                if (crawler.Schedule && !crawler.Configuration?.includes('cloudwatch')) {
                    findings.push(this.createFinding({
                        severity: 'low',
                        title: `Glue Crawler Without CloudWatch Monitoring: ${crawler.Name}`,
                        description: `Scheduled crawler does not have CloudWatch monitoring enabled`,
                        analysis: 'Monitoring helps detect crawler failures and performance issues.',
                        resource_id: crawler.Name,
                        resource_arn: this.arnBuilder.generic('glue', this.region, 'crawler', crawler.Name),
                        scan_type: 'glue_crawler_no_monitoring',
                        compliance: [
                            this.wellArchitectedCompliance('OPS', 'Monitor workloads'),
                        ],
                        evidence: { crawlerName: crawler.Name, hasSchedule: true, hasMonitoring: false },
                        risk_vector: 'insufficient_monitoring',
                    }));
                }
            }
        }
        catch (error) {
            this.warn('Failed to check Glue crawlers', { error: error.message });
        }
        return findings;
    }
    async checkSecurityConfigurations(client) {
        const findings = [];
        try {
            const response = await client.send(new client_glue_1.GetSecurityConfigurationsCommand({}));
            if (!response.SecurityConfigurations || response.SecurityConfigurations.length === 0) {
                findings.push(this.createFinding({
                    severity: 'medium',
                    title: 'No Glue Security Configurations Defined',
                    description: 'No security configurations exist for Glue jobs',
                    analysis: 'Security configurations enable encryption for Glue jobs.',
                    resource_id: 'security-configurations',
                    resource_arn: this.arnBuilder.generic('glue', this.region, 'security-configuration', 'none'),
                    scan_type: 'glue_no_security_configs',
                    compliance: [
                        this.wellArchitectedCompliance('SEC', 'Protect data at rest'),
                    ],
                    remediation: {
                        description: 'Create security configurations for Glue jobs',
                        steps: [
                            'Go to Glue Console > Security configurations',
                            'Create a new security configuration',
                            'Enable S3 encryption and CloudWatch logs encryption',
                            'Apply to existing jobs',
                        ],
                        estimated_effort: 'medium',
                        automation_available: true,
                    },
                    evidence: { securityConfigCount: 0 },
                    risk_vector: 'data_exposure',
                }));
            }
            else {
                // Check each security configuration
                for (const config of response.SecurityConfigurations) {
                    if (!config.Name || !config.EncryptionConfiguration)
                        continue;
                    const encConfig = config.EncryptionConfiguration;
                    // Check S3 encryption
                    if (!encConfig.S3Encryption || encConfig.S3Encryption.length === 0) {
                        findings.push(this.createFinding({
                            severity: 'medium',
                            title: `Glue Security Configuration Without S3 Encryption: ${config.Name}`,
                            description: `Security configuration does not include S3 encryption`,
                            analysis: 'S3 encryption should be enabled for data at rest protection.',
                            resource_id: config.Name,
                            resource_arn: this.arnBuilder.generic('glue', this.region, 'security-configuration', config.Name),
                            scan_type: 'glue_security_config_no_s3_encryption',
                            compliance: [
                                this.nistCompliance('SC-28', 'Protection of Information at Rest'),
                            ],
                            evidence: { configName: config.Name, hasS3Encryption: false },
                            risk_vector: 'data_exposure',
                        }));
                    }
                    // Check CloudWatch encryption
                    if (!encConfig.CloudWatchEncryption) {
                        findings.push(this.createFinding({
                            severity: 'low',
                            title: `Glue Security Configuration Without CloudWatch Encryption: ${config.Name}`,
                            description: `Security configuration does not include CloudWatch logs encryption`,
                            analysis: 'CloudWatch logs may contain sensitive information.',
                            resource_id: config.Name,
                            resource_arn: this.arnBuilder.generic('glue', this.region, 'security-configuration', config.Name),
                            scan_type: 'glue_security_config_no_cloudwatch_encryption',
                            compliance: [
                                this.nistCompliance('SC-28', 'Protection of Information at Rest'),
                            ],
                            evidence: { configName: config.Name, hasCloudWatchEncryption: false },
                            risk_vector: 'data_exposure',
                        }));
                    }
                }
            }
        }
        catch (error) {
            this.warn('Failed to check Glue security configurations', { error: error.message });
        }
        return findings;
    }
    async checkDatabaseSecurity(client) {
        const findings = [];
        try {
            const response = await client.send(new client_glue_1.GetDatabasesCommand({}));
            for (const database of response.DatabaseList || []) {
                if (!database.Name)
                    continue;
                // Check for databases without description (may indicate lack of governance)
                if (!database.Description) {
                    findings.push(this.createFinding({
                        severity: 'info',
                        title: `Glue Database Without Description: ${database.Name}`,
                        description: `Database does not have a description for documentation`,
                        analysis: 'Database descriptions help with data governance and understanding.',
                        resource_id: database.Name,
                        resource_arn: this.arnBuilder.generic('glue', this.region, 'database', database.Name),
                        scan_type: 'glue_database_no_description',
                        compliance: [
                            this.wellArchitectedCompliance('OPS', 'Document workloads'),
                        ],
                        evidence: { databaseName: database.Name, hasDescription: false },
                        risk_vector: 'insufficient_monitoring',
                    }));
                }
                // Check tables in database for sensitive data patterns
                try {
                    const tablesResponse = await client.send(new client_glue_1.GetTablesCommand({ DatabaseName: database.Name }));
                    for (const table of tablesResponse.TableList || []) {
                        if (!table.Name)
                            continue;
                        // Check for potentially sensitive column names
                        const sensitivePatterns = ['ssn', 'social', 'credit', 'card', 'password', 'secret', 'key', 'token', 'email', 'phone'];
                        const columns = table.StorageDescriptor?.Columns || [];
                        for (const column of columns) {
                            if (!column.Name)
                                continue;
                            const columnName = column.Name.toLowerCase();
                            if (sensitivePatterns.some(pattern => columnName.includes(pattern))) {
                                findings.push(this.createFinding({
                                    severity: 'medium',
                                    title: `Potentially Sensitive Data Column: ${database.Name}.${table.Name}.${column.Name}`,
                                    description: `Column name suggests it may contain sensitive data`,
                                    analysis: 'Sensitive data should be properly classified and protected.',
                                    resource_id: `${database.Name}.${table.Name}`,
                                    resource_arn: this.arnBuilder.generic('glue', this.region, 'table', `${database.Name}/${table.Name}`),
                                    scan_type: 'glue_table_sensitive_data',
                                    compliance: [
                                        this.pciCompliance('3.4', 'Render PAN unreadable'),
                                        this.lgpdCompliance('Art. 46', 'Data classification'),
                                    ],
                                    evidence: {
                                        databaseName: database.Name,
                                        tableName: table.Name,
                                        columnName: column.Name,
                                        columnType: column.Type
                                    },
                                    risk_vector: 'data_exposure',
                                }));
                                break; // Only report once per table
                            }
                        }
                    }
                }
                catch (tablesError) {
                    // Ignore table access errors
                }
            }
        }
        catch (error) {
            this.warn('Failed to check Glue databases', { error: error.message });
        }
        return findings;
    }
}
exports.GlueScanner = GlueScanner;
async function scanGlue(region, accountId, credentials, cache) {
    const scanner = new GlueScanner(region, accountId, credentials, cache);
    return scanner.scan();
}
//# sourceMappingURL=index.js.map