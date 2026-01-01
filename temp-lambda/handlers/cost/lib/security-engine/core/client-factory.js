"use strict";
/**
 * Security Engine V2 - AWS Client Factory
 * Lazy loading and connection pooling for AWS SDK clients
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AWSClientFactory = void 0;
const client_ec2_1 = require("@aws-sdk/client-ec2");
const client_rds_1 = require("@aws-sdk/client-rds");
const client_s3_1 = require("@aws-sdk/client-s3");
const client_iam_1 = require("@aws-sdk/client-iam");
const client_lambda_1 = require("@aws-sdk/client-lambda");
const client_eks_1 = require("@aws-sdk/client-eks");
const client_ecs_1 = require("@aws-sdk/client-ecs");
const client_ecr_1 = require("@aws-sdk/client-ecr");
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const client_kms_1 = require("@aws-sdk/client-kms");
const client_cloudtrail_1 = require("@aws-sdk/client-cloudtrail");
const client_guardduty_1 = require("@aws-sdk/client-guardduty");
const client_securityhub_1 = require("@aws-sdk/client-securityhub");
const client_wafv2_1 = require("@aws-sdk/client-wafv2");
const client_api_gateway_1 = require("@aws-sdk/client-api-gateway");
const client_apigatewayv2_1 = require("@aws-sdk/client-apigatewayv2");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_elasticache_1 = require("@aws-sdk/client-elasticache");
const client_cloudfront_1 = require("@aws-sdk/client-cloudfront");
const client_elastic_load_balancing_v2_1 = require("@aws-sdk/client-elastic-load-balancing-v2");
const client_sns_1 = require("@aws-sdk/client-sns");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_acm_1 = require("@aws-sdk/client-acm");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const client_opensearch_1 = require("@aws-sdk/client-opensearch");
const client_cloudwatch_logs_1 = require("@aws-sdk/client-cloudwatch-logs");
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const client_config_service_1 = require("@aws-sdk/client-config-service");
const client_backup_1 = require("@aws-sdk/client-backup");
const client_redshift_1 = require("@aws-sdk/client-redshift");
const client_route_53_1 = require("@aws-sdk/client-route-53");
const client_efs_1 = require("@aws-sdk/client-efs");
const client_eventbridge_1 = require("@aws-sdk/client-eventbridge");
const client_sfn_1 = require("@aws-sdk/client-sfn");
const client_ssm_1 = require("@aws-sdk/client-ssm");
const client_kinesis_1 = require("@aws-sdk/client-kinesis");
const client_firehose_1 = require("@aws-sdk/client-firehose");
const client_inspector2_1 = require("@aws-sdk/client-inspector2");
const client_macie2_1 = require("@aws-sdk/client-macie2");
const client_network_firewall_1 = require("@aws-sdk/client-network-firewall");
const client_organizations_1 = require("@aws-sdk/client-organizations");
const client_accessanalyzer_1 = require("@aws-sdk/client-accessanalyzer");
const client_glue_1 = require("@aws-sdk/client-glue");
const client_sts_1 = require("@aws-sdk/client-sts");
class AWSClientFactory {
    constructor(credentials) {
        this.clients = new Map();
        this.resolvedCredentials = null;
        this.credentials = credentials;
    }
    async resolveCredentials(region) {
        if (this.resolvedCredentials) {
            return this.resolvedCredentials;
        }
        // If using role assumption
        if (this.credentials.roleArn) {
            const stsClient = new client_sts_1.STSClient({ region });
            const assumeRoleParams = {
                RoleArn: this.credentials.roleArn,
                RoleSessionName: `security-scan-${Date.now()}`,
                DurationSeconds: 3600,
            };
            if (this.credentials.externalId) {
                assumeRoleParams.ExternalId = this.credentials.externalId;
            }
            const response = await stsClient.send(new client_sts_1.AssumeRoleCommand(assumeRoleParams));
            if (!response.Credentials) {
                throw new Error('Failed to assume role');
            }
            this.resolvedCredentials = {
                accessKeyId: response.Credentials.AccessKeyId,
                secretAccessKey: response.Credentials.SecretAccessKey,
                sessionToken: response.Credentials.SessionToken,
            };
        }
        else if (this.credentials.accessKeyId && this.credentials.secretAccessKey) {
            this.resolvedCredentials = {
                accessKeyId: this.credentials.accessKeyId,
                secretAccessKey: this.credentials.secretAccessKey,
                sessionToken: this.credentials.sessionToken,
            };
        }
        return this.resolvedCredentials;
    }
    async getClientConfig(region) {
        const credentials = await this.resolveCredentials(region);
        return {
            region,
            credentials,
        };
    }
    getClientKey(service, region) {
        return `${service}:${region}`;
    }
    async getEC2Client(region) {
        const key = this.getClientKey('ec2', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_ec2_1.EC2Client(config));
        }
        return this.clients.get(key);
    }
    async getRDSClient(region) {
        const key = this.getClientKey('rds', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_rds_1.RDSClient(config));
        }
        return this.clients.get(key);
    }
    async getS3Client(region = 'us-east-1') {
        const key = this.getClientKey('s3', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_s3_1.S3Client(config));
        }
        return this.clients.get(key);
    }
    async getIAMClient() {
        const key = this.getClientKey('iam', 'global');
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig('us-east-1');
            this.clients.set(key, new client_iam_1.IAMClient(config));
        }
        return this.clients.get(key);
    }
    async getLambdaClient(region) {
        const key = this.getClientKey('lambda', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_lambda_1.LambdaClient(config));
        }
        return this.clients.get(key);
    }
    async getEKSClient(region) {
        const key = this.getClientKey('eks', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_eks_1.EKSClient(config));
        }
        return this.clients.get(key);
    }
    async getECSClient(region) {
        const key = this.getClientKey('ecs', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_ecs_1.ECSClient(config));
        }
        return this.clients.get(key);
    }
    async getECRClient(region) {
        const key = this.getClientKey('ecr', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_ecr_1.ECRClient(config));
        }
        return this.clients.get(key);
    }
    async getSecretsManagerClient(region) {
        const key = this.getClientKey('secretsmanager', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_secrets_manager_1.SecretsManagerClient(config));
        }
        return this.clients.get(key);
    }
    async getKMSClient(region) {
        const key = this.getClientKey('kms', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_kms_1.KMSClient(config));
        }
        return this.clients.get(key);
    }
    async getCloudTrailClient(region) {
        const key = this.getClientKey('cloudtrail', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_cloudtrail_1.CloudTrailClient(config));
        }
        return this.clients.get(key);
    }
    async getGuardDutyClient(region) {
        const key = this.getClientKey('guardduty', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_guardduty_1.GuardDutyClient(config));
        }
        return this.clients.get(key);
    }
    async getSecurityHubClient(region) {
        const key = this.getClientKey('securityhub', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_securityhub_1.SecurityHubClient(config));
        }
        return this.clients.get(key);
    }
    async getWAFV2Client(region) {
        const key = this.getClientKey('wafv2', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_wafv2_1.WAFV2Client(config));
        }
        return this.clients.get(key);
    }
    async getAPIGatewayClient(region) {
        const key = this.getClientKey('apigateway', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_api_gateway_1.APIGatewayClient(config));
        }
        return this.clients.get(key);
    }
    async getApiGatewayV2Client(region) {
        const key = this.getClientKey('apigatewayv2', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_apigatewayv2_1.ApiGatewayV2Client(config));
        }
        return this.clients.get(key);
    }
    async getDynamoDBClient(region) {
        const key = this.getClientKey('dynamodb', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_dynamodb_1.DynamoDBClient(config));
        }
        return this.clients.get(key);
    }
    async getElastiCacheClient(region) {
        const key = this.getClientKey('elasticache', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_elasticache_1.ElastiCacheClient(config));
        }
        return this.clients.get(key);
    }
    async getCloudFrontClient() {
        const key = this.getClientKey('cloudfront', 'global');
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig('us-east-1');
            this.clients.set(key, new client_cloudfront_1.CloudFrontClient(config));
        }
        return this.clients.get(key);
    }
    async getELBV2Client(region) {
        const key = this.getClientKey('elbv2', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_elastic_load_balancing_v2_1.ElasticLoadBalancingV2Client(config));
        }
        return this.clients.get(key);
    }
    async getSNSClient(region) {
        const key = this.getClientKey('sns', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_sns_1.SNSClient(config));
        }
        return this.clients.get(key);
    }
    async getSQSClient(region) {
        const key = this.getClientKey('sqs', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_sqs_1.SQSClient(config));
        }
        return this.clients.get(key);
    }
    async getACMClient(region) {
        const key = this.getClientKey('acm', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_acm_1.ACMClient(config));
        }
        return this.clients.get(key);
    }
    async getCognitoClient(region) {
        const key = this.getClientKey('cognito', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_cognito_identity_provider_1.CognitoIdentityProviderClient(config));
        }
        return this.clients.get(key);
    }
    async getOpenSearchClient(region) {
        const key = this.getClientKey('opensearch', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_opensearch_1.OpenSearchClient(config));
        }
        return this.clients.get(key);
    }
    async getCloudWatchLogsClient(region) {
        const key = this.getClientKey('logs', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_cloudwatch_logs_1.CloudWatchLogsClient(config));
        }
        return this.clients.get(key);
    }
    async getConfigClient(region) {
        const key = this.getClientKey('config', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_config_service_1.ConfigServiceClient(config));
        }
        return this.clients.get(key);
    }
    async getCloudWatchClient(region) {
        const key = this.getClientKey('cloudwatch', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_cloudwatch_1.CloudWatchClient(config));
        }
        return this.clients.get(key);
    }
    async getBackupClient(region) {
        const key = this.getClientKey('backup', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_backup_1.BackupClient(config));
        }
        return this.clients.get(key);
    }
    async getRedshiftClient(region) {
        const key = this.getClientKey('redshift', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_redshift_1.RedshiftClient(config));
        }
        return this.clients.get(key);
    }
    async getRoute53Client() {
        const key = this.getClientKey('route53', 'global');
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig('us-east-1');
            this.clients.set(key, new client_route_53_1.Route53Client(config));
        }
        return this.clients.get(key);
    }
    async getEFSClient(region) {
        const key = this.getClientKey('efs', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_efs_1.EFSClient(config));
        }
        return this.clients.get(key);
    }
    async getEventBridgeClient(region) {
        const key = this.getClientKey('eventbridge', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_eventbridge_1.EventBridgeClient(config));
        }
        return this.clients.get(key);
    }
    async getStepFunctionsClient(region) {
        const key = this.getClientKey('sfn', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_sfn_1.SFNClient(config));
        }
        return this.clients.get(key);
    }
    async getSSMClient(region) {
        const key = this.getClientKey('ssm', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_ssm_1.SSMClient(config));
        }
        return this.clients.get(key);
    }
    async getKinesisClient(region) {
        const key = this.getClientKey('kinesis', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_kinesis_1.KinesisClient(config));
        }
        return this.clients.get(key);
    }
    async getFirehoseClient(region) {
        const key = this.getClientKey('firehose', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_firehose_1.FirehoseClient(config));
        }
        return this.clients.get(key);
    }
    async getInspectorClient(region) {
        const key = this.getClientKey('inspector', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_inspector2_1.Inspector2Client(config));
        }
        return this.clients.get(key);
    }
    async getMacieClient(region) {
        const key = this.getClientKey('macie', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_macie2_1.Macie2Client(config));
        }
        return this.clients.get(key);
    }
    async getNetworkFirewallClient(region) {
        const key = this.getClientKey('networkfirewall', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_network_firewall_1.NetworkFirewallClient(config));
        }
        return this.clients.get(key);
    }
    async getOrganizationsClient() {
        const key = this.getClientKey('organizations', 'global');
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig('us-east-1');
            this.clients.set(key, new client_organizations_1.OrganizationsClient(config));
        }
        return this.clients.get(key);
    }
    async getAccessAnalyzerClient(region) {
        const key = this.getClientKey('accessanalyzer', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_accessanalyzer_1.AccessAnalyzerClient(config));
        }
        return this.clients.get(key);
    }
    async getGlueClient(region) {
        const key = this.getClientKey('glue', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_glue_1.GlueClient(config));
        }
        return this.clients.get(key);
    }
    async getSTSClient(region = 'us-east-1') {
        const key = this.getClientKey('sts', region);
        if (!this.clients.has(key)) {
            const config = await this.getClientConfig(region);
            this.clients.set(key, new client_sts_1.STSClient(config));
        }
        return this.clients.get(key);
    }
    async getAccountId() {
        const stsClient = await this.getSTSClient();
        const response = await stsClient.send(new client_sts_1.GetCallerIdentityCommand({}));
        return response.Account || '';
    }
    clearClients() {
        this.clients.clear();
        this.resolvedCredentials = null;
    }
    getClientCount() {
        return this.clients.size;
    }
}
exports.AWSClientFactory = AWSClientFactory;
//# sourceMappingURL=client-factory.js.map