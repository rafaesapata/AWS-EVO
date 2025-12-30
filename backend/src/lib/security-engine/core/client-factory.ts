/**
 * Security Engine V2 - AWS Client Factory
 * Lazy loading and connection pooling for AWS SDK clients
 */

import { 
  EC2Client,
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand,
  DescribeVolumesCommand,
  DescribeSnapshotsCommand,
  DescribeVpcsCommand,
  DescribeFlowLogsCommand,
  DescribeImagesCommand,
  DescribeKeyPairsCommand,
  DescribeNetworkAclsCommand,
  DescribeSubnetsCommand,
} from '@aws-sdk/client-ec2';
import { RDSClient } from '@aws-sdk/client-rds';
import { S3Client } from '@aws-sdk/client-s3';
import { IAMClient } from '@aws-sdk/client-iam';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { EKSClient } from '@aws-sdk/client-eks';
import { ECSClient } from '@aws-sdk/client-ecs';
import { ECRClient } from '@aws-sdk/client-ecr';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { KMSClient } from '@aws-sdk/client-kms';
import { CloudTrailClient } from '@aws-sdk/client-cloudtrail';
import { GuardDutyClient } from '@aws-sdk/client-guardduty';
import { SecurityHubClient } from '@aws-sdk/client-securityhub';
import { WAFV2Client } from '@aws-sdk/client-wafv2';
import { APIGatewayClient } from '@aws-sdk/client-api-gateway';
import { ApiGatewayV2Client } from '@aws-sdk/client-apigatewayv2';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ElastiCacheClient } from '@aws-sdk/client-elasticache';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { SNSClient } from '@aws-sdk/client-sns';
import { SQSClient } from '@aws-sdk/client-sqs';
import { ACMClient } from '@aws-sdk/client-acm';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { OpenSearchClient } from '@aws-sdk/client-opensearch';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { ConfigServiceClient } from '@aws-sdk/client-config-service';
import { BackupClient } from '@aws-sdk/client-backup';
import { RedshiftClient } from '@aws-sdk/client-redshift';
import { Route53Client } from '@aws-sdk/client-route-53';
import { EFSClient } from '@aws-sdk/client-efs';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { SFNClient } from '@aws-sdk/client-sfn';
import { SSMClient } from '@aws-sdk/client-ssm';
import { KinesisClient } from '@aws-sdk/client-kinesis';
import { FirehoseClient } from '@aws-sdk/client-firehose';
import { Inspector2Client } from '@aws-sdk/client-inspector2';
import { Macie2Client } from '@aws-sdk/client-macie2';
import { NetworkFirewallClient } from '@aws-sdk/client-network-firewall';
import { OrganizationsClient } from '@aws-sdk/client-organizations';
import { AccessAnalyzerClient } from '@aws-sdk/client-accessanalyzer';
import { GlueClient } from '@aws-sdk/client-glue';
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import type { AWSCredentials } from '../types.js';

type AWSClientType = 
  | EC2Client
  | RDSClient
  | S3Client
  | IAMClient
  | LambdaClient
  | EKSClient
  | ECSClient
  | ECRClient
  | SecretsManagerClient
  | KMSClient
  | CloudTrailClient
  | GuardDutyClient
  | SecurityHubClient
  | WAFV2Client
  | APIGatewayClient
  | ApiGatewayV2Client
  | DynamoDBClient
  | ElastiCacheClient
  | CloudFrontClient
  | ElasticLoadBalancingV2Client
  | SNSClient
  | SQSClient
  | ACMClient
  | CognitoIdentityProviderClient
  | OpenSearchClient
  | CloudWatchLogsClient
  | CloudWatchClient
  | ConfigServiceClient
  | BackupClient
  | RedshiftClient
  | Route53Client
  | EFSClient
  | EventBridgeClient
  | SFNClient
  | SSMClient
  | KinesisClient
  | FirehoseClient
  | Inspector2Client
  | Macie2Client
  | NetworkFirewallClient
  | OrganizationsClient
  | AccessAnalyzerClient
  | GlueClient
  | STSClient;

interface ClientConfig {
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

export class AWSClientFactory {
  private clients: Map<string, AWSClientType> = new Map();
  private credentials: AWSCredentials;
  private resolvedCredentials: ClientConfig['credentials'] | null = null;

  constructor(credentials: AWSCredentials) {
    this.credentials = credentials;
  }

  private async resolveCredentials(region: string): Promise<ClientConfig['credentials']> {
    if (this.resolvedCredentials) {
      return this.resolvedCredentials;
    }

    // If using role assumption
    if (this.credentials.roleArn) {
      const stsClient = new STSClient({ region });
      
      const assumeRoleParams: any = {
        RoleArn: this.credentials.roleArn,
        RoleSessionName: `security-scan-${Date.now()}`,
        DurationSeconds: 3600,
      };

      if (this.credentials.externalId) {
        assumeRoleParams.ExternalId = this.credentials.externalId;
      }

      const response = await stsClient.send(new AssumeRoleCommand(assumeRoleParams));
      
      if (!response.Credentials) {
        throw new Error('Failed to assume role');
      }

      this.resolvedCredentials = {
        accessKeyId: response.Credentials.AccessKeyId!,
        secretAccessKey: response.Credentials.SecretAccessKey!,
        sessionToken: response.Credentials.SessionToken,
      };
    } else if (this.credentials.accessKeyId && this.credentials.secretAccessKey) {
      this.resolvedCredentials = {
        accessKeyId: this.credentials.accessKeyId,
        secretAccessKey: this.credentials.secretAccessKey,
        sessionToken: this.credentials.sessionToken,
      };
    }

    return this.resolvedCredentials!;
  }

  private async getClientConfig(region: string): Promise<ClientConfig> {
    const credentials = await this.resolveCredentials(region);
    return {
      region,
      credentials,
    };
  }

  private getClientKey(service: string, region: string): string {
    return `${service}:${region}`;
  }

  async getEC2Client(region: string): Promise<EC2Client> {
    const key = this.getClientKey('ec2', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new EC2Client(config));
    }
    return this.clients.get(key) as EC2Client;
  }

  async getRDSClient(region: string): Promise<RDSClient> {
    const key = this.getClientKey('rds', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new RDSClient(config));
    }
    return this.clients.get(key) as RDSClient;
  }

  async getS3Client(region: string = 'us-east-1'): Promise<S3Client> {
    const key = this.getClientKey('s3', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new S3Client(config));
    }
    return this.clients.get(key) as S3Client;
  }

  async getIAMClient(): Promise<IAMClient> {
    const key = this.getClientKey('iam', 'global');
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig('us-east-1');
      this.clients.set(key, new IAMClient(config));
    }
    return this.clients.get(key) as IAMClient;
  }

  async getLambdaClient(region: string): Promise<LambdaClient> {
    const key = this.getClientKey('lambda', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new LambdaClient(config));
    }
    return this.clients.get(key) as LambdaClient;
  }

  async getEKSClient(region: string): Promise<EKSClient> {
    const key = this.getClientKey('eks', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new EKSClient(config));
    }
    return this.clients.get(key) as EKSClient;
  }

  async getECSClient(region: string): Promise<ECSClient> {
    const key = this.getClientKey('ecs', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new ECSClient(config));
    }
    return this.clients.get(key) as ECSClient;
  }

  async getECRClient(region: string): Promise<ECRClient> {
    const key = this.getClientKey('ecr', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new ECRClient(config));
    }
    return this.clients.get(key) as ECRClient;
  }

  async getSecretsManagerClient(region: string): Promise<SecretsManagerClient> {
    const key = this.getClientKey('secretsmanager', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new SecretsManagerClient(config));
    }
    return this.clients.get(key) as SecretsManagerClient;
  }

  async getKMSClient(region: string): Promise<KMSClient> {
    const key = this.getClientKey('kms', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new KMSClient(config));
    }
    return this.clients.get(key) as KMSClient;
  }

  async getCloudTrailClient(region: string): Promise<CloudTrailClient> {
    const key = this.getClientKey('cloudtrail', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new CloudTrailClient(config));
    }
    return this.clients.get(key) as CloudTrailClient;
  }

  async getGuardDutyClient(region: string): Promise<GuardDutyClient> {
    const key = this.getClientKey('guardduty', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new GuardDutyClient(config));
    }
    return this.clients.get(key) as GuardDutyClient;
  }

  async getSecurityHubClient(region: string): Promise<SecurityHubClient> {
    const key = this.getClientKey('securityhub', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new SecurityHubClient(config));
    }
    return this.clients.get(key) as SecurityHubClient;
  }

  async getWAFV2Client(region: string): Promise<WAFV2Client> {
    const key = this.getClientKey('wafv2', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new WAFV2Client(config));
    }
    return this.clients.get(key) as WAFV2Client;
  }

  async getAPIGatewayClient(region: string): Promise<APIGatewayClient> {
    const key = this.getClientKey('apigateway', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new APIGatewayClient(config));
    }
    return this.clients.get(key) as APIGatewayClient;
  }

  async getApiGatewayV2Client(region: string): Promise<ApiGatewayV2Client> {
    const key = this.getClientKey('apigatewayv2', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new ApiGatewayV2Client(config));
    }
    return this.clients.get(key) as ApiGatewayV2Client;
  }

  async getDynamoDBClient(region: string): Promise<DynamoDBClient> {
    const key = this.getClientKey('dynamodb', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new DynamoDBClient(config));
    }
    return this.clients.get(key) as DynamoDBClient;
  }

  async getElastiCacheClient(region: string): Promise<ElastiCacheClient> {
    const key = this.getClientKey('elasticache', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new ElastiCacheClient(config));
    }
    return this.clients.get(key) as ElastiCacheClient;
  }

  async getCloudFrontClient(): Promise<CloudFrontClient> {
    const key = this.getClientKey('cloudfront', 'global');
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig('us-east-1');
      this.clients.set(key, new CloudFrontClient(config));
    }
    return this.clients.get(key) as CloudFrontClient;
  }

  async getELBV2Client(region: string): Promise<ElasticLoadBalancingV2Client> {
    const key = this.getClientKey('elbv2', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new ElasticLoadBalancingV2Client(config));
    }
    return this.clients.get(key) as ElasticLoadBalancingV2Client;
  }

  async getSNSClient(region: string): Promise<SNSClient> {
    const key = this.getClientKey('sns', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new SNSClient(config));
    }
    return this.clients.get(key) as SNSClient;
  }

  async getSQSClient(region: string): Promise<SQSClient> {
    const key = this.getClientKey('sqs', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new SQSClient(config));
    }
    return this.clients.get(key) as SQSClient;
  }

  async getACMClient(region: string): Promise<ACMClient> {
    const key = this.getClientKey('acm', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new ACMClient(config));
    }
    return this.clients.get(key) as ACMClient;
  }

  async getCognitoClient(region: string): Promise<CognitoIdentityProviderClient> {
    const key = this.getClientKey('cognito', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new CognitoIdentityProviderClient(config));
    }
    return this.clients.get(key) as CognitoIdentityProviderClient;
  }

  async getOpenSearchClient(region: string): Promise<OpenSearchClient> {
    const key = this.getClientKey('opensearch', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new OpenSearchClient(config));
    }
    return this.clients.get(key) as OpenSearchClient;
  }

  async getCloudWatchLogsClient(region: string): Promise<CloudWatchLogsClient> {
    const key = this.getClientKey('logs', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new CloudWatchLogsClient(config));
    }
    return this.clients.get(key) as CloudWatchLogsClient;
  }

  async getConfigClient(region: string): Promise<ConfigServiceClient> {
    const key = this.getClientKey('config', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new ConfigServiceClient(config));
    }
    return this.clients.get(key) as ConfigServiceClient;
  }

  async getCloudWatchClient(region: string): Promise<CloudWatchClient> {
    const key = this.getClientKey('cloudwatch', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new CloudWatchClient(config));
    }
    return this.clients.get(key) as CloudWatchClient;
  }

  async getBackupClient(region: string): Promise<BackupClient> {
    const key = this.getClientKey('backup', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new BackupClient(config));
    }
    return this.clients.get(key) as BackupClient;
  }

  async getRedshiftClient(region: string): Promise<RedshiftClient> {
    const key = this.getClientKey('redshift', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new RedshiftClient(config));
    }
    return this.clients.get(key) as RedshiftClient;
  }

  async getRoute53Client(): Promise<Route53Client> {
    const key = this.getClientKey('route53', 'global');
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig('us-east-1');
      this.clients.set(key, new Route53Client(config));
    }
    return this.clients.get(key) as Route53Client;
  }

  async getEFSClient(region: string): Promise<EFSClient> {
    const key = this.getClientKey('efs', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new EFSClient(config));
    }
    return this.clients.get(key) as EFSClient;
  }

  async getEventBridgeClient(region: string): Promise<EventBridgeClient> {
    const key = this.getClientKey('eventbridge', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new EventBridgeClient(config));
    }
    return this.clients.get(key) as EventBridgeClient;
  }

  async getStepFunctionsClient(region: string): Promise<SFNClient> {
    const key = this.getClientKey('sfn', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new SFNClient(config));
    }
    return this.clients.get(key) as SFNClient;
  }

  async getSSMClient(region: string): Promise<SSMClient> {
    const key = this.getClientKey('ssm', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new SSMClient(config));
    }
    return this.clients.get(key) as SSMClient;
  }

  async getKinesisClient(region: string): Promise<KinesisClient> {
    const key = this.getClientKey('kinesis', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new KinesisClient(config));
    }
    return this.clients.get(key) as KinesisClient;
  }

  async getFirehoseClient(region: string): Promise<FirehoseClient> {
    const key = this.getClientKey('firehose', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new FirehoseClient(config));
    }
    return this.clients.get(key) as FirehoseClient;
  }

  async getInspectorClient(region: string): Promise<Inspector2Client> {
    const key = this.getClientKey('inspector', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new Inspector2Client(config));
    }
    return this.clients.get(key) as Inspector2Client;
  }

  async getMacieClient(region: string): Promise<Macie2Client> {
    const key = this.getClientKey('macie', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new Macie2Client(config));
    }
    return this.clients.get(key) as Macie2Client;
  }

  async getNetworkFirewallClient(region: string): Promise<NetworkFirewallClient> {
    const key = this.getClientKey('networkfirewall', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new NetworkFirewallClient(config));
    }
    return this.clients.get(key) as NetworkFirewallClient;
  }

  async getOrganizationsClient(): Promise<OrganizationsClient> {
    const key = this.getClientKey('organizations', 'global');
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig('us-east-1');
      this.clients.set(key, new OrganizationsClient(config));
    }
    return this.clients.get(key) as OrganizationsClient;
  }

  async getAccessAnalyzerClient(region: string): Promise<AccessAnalyzerClient> {
    const key = this.getClientKey('accessanalyzer', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new AccessAnalyzerClient(config));
    }
    return this.clients.get(key) as AccessAnalyzerClient;
  }

  async getGlueClient(region: string): Promise<GlueClient> {
    const key = this.getClientKey('glue', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new GlueClient(config));
    }
    return this.clients.get(key) as GlueClient;
  }

  async getSTSClient(region: string = 'us-east-1'): Promise<STSClient> {
    const key = this.getClientKey('sts', region);
    if (!this.clients.has(key)) {
      const config = await this.getClientConfig(region);
      this.clients.set(key, new STSClient(config));
    }
    return this.clients.get(key) as STSClient;
  }

  async getAccountId(): Promise<string> {
    const stsClient = await this.getSTSClient();
    const response = await stsClient.send(new GetCallerIdentityCommand({}));
    return response.Account || '';
  }

  clearClients(): void {
    this.clients.clear();
    this.resolvedCredentials = null;
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
