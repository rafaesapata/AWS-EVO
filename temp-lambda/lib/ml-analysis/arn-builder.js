"use strict";
/**
 * ARN Builder Module for ML Waste Detection
 *
 * Builds Amazon Resource Names (ARNs) for all supported AWS services.
 * ARN format: arn:partition:service:region:account-id:resource-type/resource-id
 *
 * @module ml-analysis/arn-builder
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildResourceArn = buildResourceArn;
exports.parseArn = parseArn;
exports.getConsoleUrlFromArn = getConsoleUrlFromArn;
exports.getServiceFromResourceType = getServiceFromResourceType;
/**
 * ARN format templates for each service type
 */
const ARN_FORMATS = {
    // Compute
    'ec2:instance': (region, accountId, resourceId) => `arn:aws:ec2:${region}:${accountId}:instance/${resourceId}`,
    'ec2:volume': (region, accountId, resourceId) => `arn:aws:ec2:${region}:${accountId}:volume/${resourceId}`,
    'ec2:snapshot': (region, accountId, resourceId) => `arn:aws:ec2:${region}:${accountId}:snapshot/${resourceId}`,
    'ec2:elastic-ip': (region, accountId, resourceId) => `arn:aws:ec2:${region}:${accountId}:elastic-ip/${resourceId}`,
    'ec2:nat-gateway': (region, accountId, resourceId) => `arn:aws:ec2:${region}:${accountId}:natgateway/${resourceId}`,
    'ec2:network-interface': (region, accountId, resourceId) => `arn:aws:ec2:${region}:${accountId}:network-interface/${resourceId}`,
    'ec2:security-group': (region, accountId, resourceId) => `arn:aws:ec2:${region}:${accountId}:security-group/${resourceId}`,
    'ec2:vpc': (region, accountId, resourceId) => `arn:aws:ec2:${region}:${accountId}:vpc/${resourceId}`,
    'ec2:subnet': (region, accountId, resourceId) => `arn:aws:ec2:${region}:${accountId}:subnet/${resourceId}`,
    'ec2:route-table': (region, accountId, resourceId) => `arn:aws:ec2:${region}:${accountId}:route-table/${resourceId}`,
    // Lambda
    'lambda:function': (region, accountId, resourceId) => `arn:aws:lambda:${region}:${accountId}:function:${resourceId}`,
    // ECS
    'ecs:cluster': (region, accountId, resourceId) => `arn:aws:ecs:${region}:${accountId}:cluster/${resourceId}`,
    'ecs:service': (region, accountId, resourceId) => `arn:aws:ecs:${region}:${accountId}:service/${resourceId}`,
    'ecs:task': (region, accountId, resourceId) => `arn:aws:ecs:${region}:${accountId}:task/${resourceId}`,
    // EKS
    'eks:cluster': (region, accountId, resourceId) => `arn:aws:eks:${region}:${accountId}:cluster/${resourceId}`,
    // Storage - S3 (global, no region in ARN)
    's3:bucket': (_region, _accountId, resourceId) => `arn:aws:s3:::${resourceId}`,
    's3:object': (_region, _accountId, resourceId) => `arn:aws:s3:::${resourceId}`,
    // Storage - EFS
    'efs:file-system': (region, accountId, resourceId) => `arn:aws:elasticfilesystem:${region}:${accountId}:file-system/${resourceId}`,
    // Storage - FSx
    'fsx:file-system': (region, accountId, resourceId) => `arn:aws:fsx:${region}:${accountId}:file-system/${resourceId}`,
    // Database - RDS
    'rds:db': (region, accountId, resourceId) => `arn:aws:rds:${region}:${accountId}:db:${resourceId}`,
    'rds:cluster': (region, accountId, resourceId) => `arn:aws:rds:${region}:${accountId}:cluster:${resourceId}`,
    'rds:snapshot': (region, accountId, resourceId) => `arn:aws:rds:${region}:${accountId}:snapshot:${resourceId}`,
    // Database - DynamoDB
    'dynamodb:table': (region, accountId, resourceId) => `arn:aws:dynamodb:${region}:${accountId}:table/${resourceId}`,
    // Database - ElastiCache
    'elasticache:cluster': (region, accountId, resourceId) => `arn:aws:elasticache:${region}:${accountId}:cluster:${resourceId}`,
    'elasticache:replication-group': (region, accountId, resourceId) => `arn:aws:elasticache:${region}:${accountId}:replicationgroup:${resourceId}`,
    // Database - Redshift
    'redshift:cluster': (region, accountId, resourceId) => `arn:aws:redshift:${region}:${accountId}:cluster:${resourceId}`,
    // Database - Neptune
    'neptune:cluster': (region, accountId, resourceId) => `arn:aws:neptune:${region}:${accountId}:cluster:${resourceId}`,
    // Database - OpenSearch
    'opensearch:domain': (region, accountId, resourceId) => `arn:aws:es:${region}:${accountId}:domain/${resourceId}`,
    // Network - ELB
    'elb:loadbalancer': (region, accountId, resourceId) => `arn:aws:elasticloadbalancing:${region}:${accountId}:loadbalancer/${resourceId}`,
    'elbv2:loadbalancer': (region, accountId, resourceId) => `arn:aws:elasticloadbalancing:${region}:${accountId}:loadbalancer/${resourceId}`,
    // Network - CloudFront (global)
    'cloudfront:distribution': (_region, accountId, resourceId) => `arn:aws:cloudfront::${accountId}:distribution/${resourceId}`,
    // Network - API Gateway
    'apigateway:restapi': (region, _accountId, resourceId) => `arn:aws:apigateway:${region}::/restapis/${resourceId}`,
    // Network - Transit Gateway
    'ec2:transit-gateway': (region, accountId, resourceId) => `arn:aws:ec2:${region}:${accountId}:transit-gateway/${resourceId}`,
    // Analytics - Kinesis
    'kinesis:stream': (region, accountId, resourceId) => `arn:aws:kinesis:${region}:${accountId}:stream/${resourceId}`,
    'firehose:deliverystream': (region, accountId, resourceId) => `arn:aws:firehose:${region}:${accountId}:deliverystream/${resourceId}`,
    // Analytics - EMR
    'emr:cluster': (region, accountId, resourceId) => `arn:aws:elasticmapreduce:${region}:${accountId}:cluster/${resourceId}`,
    // Analytics - Glue
    'glue:database': (region, accountId, resourceId) => `arn:aws:glue:${region}:${accountId}:database/${resourceId}`,
    'glue:crawler': (region, accountId, resourceId) => `arn:aws:glue:${region}:${accountId}:crawler/${resourceId}`,
    // Analytics - Athena
    'athena:workgroup': (region, accountId, resourceId) => `arn:aws:athena:${region}:${accountId}:workgroup/${resourceId}`,
    // ML/AI - SageMaker
    'sagemaker:endpoint': (region, accountId, resourceId) => `arn:aws:sagemaker:${region}:${accountId}:endpoint/${resourceId}`,
    'sagemaker:notebook': (region, accountId, resourceId) => `arn:aws:sagemaker:${region}:${accountId}:notebook-instance/${resourceId}`,
    'sagemaker:training-job': (region, accountId, resourceId) => `arn:aws:sagemaker:${region}:${accountId}:training-job/${resourceId}`,
    // ML/AI - Bedrock
    'bedrock:model': (region, accountId, resourceId) => `arn:aws:bedrock:${region}:${accountId}:custom-model/${resourceId}`,
    // Integration - SQS
    'sqs:queue': (region, accountId, resourceId) => `arn:aws:sqs:${region}:${accountId}:${resourceId}`,
    // Integration - SNS
    'sns:topic': (region, accountId, resourceId) => `arn:aws:sns:${region}:${accountId}:${resourceId}`,
    // Integration - EventBridge
    'events:rule': (region, accountId, resourceId) => `arn:aws:events:${region}:${accountId}:rule/${resourceId}`,
    // Integration - Step Functions
    'states:statemachine': (region, accountId, resourceId) => `arn:aws:states:${region}:${accountId}:stateMachine:${resourceId}`,
    // Security - KMS
    'kms:key': (region, accountId, resourceId) => `arn:aws:kms:${region}:${accountId}:key/${resourceId}`,
    // Security - Secrets Manager
    'secretsmanager:secret': (region, accountId, resourceId) => `arn:aws:secretsmanager:${region}:${accountId}:secret:${resourceId}`,
    // Security - WAF
    'wafv2:webacl': (region, accountId, resourceId) => `arn:aws:wafv2:${region}:${accountId}:regional/webacl/${resourceId}`,
};
/**
 * Build ARN for a resource
 *
 * @param service - AWS service name (e.g., 'ec2', 'rds', 'lambda')
 * @param region - AWS region (e.g., 'us-east-1')
 * @param accountId - 12-digit AWS account ID
 * @param resourceType - Resource type (e.g., 'instance', 'db', 'function')
 * @param resourceId - Resource identifier
 * @returns Full ARN string
 */
function buildResourceArn(service, region, accountId, resourceType, resourceId) {
    const key = `${service.toLowerCase()}:${resourceType.toLowerCase()}`;
    const formatter = ARN_FORMATS[key];
    if (formatter) {
        return formatter(region, accountId, resourceId);
    }
    // Fallback to generic format
    return `arn:aws:${service}:${region}:${accountId}:${resourceType}/${resourceId}`;
}
/**
 * Parse ARN into components
 *
 * @param arn - Full ARN string
 * @returns Parsed ARN components or null if invalid
 */
function parseArn(arn) {
    const arnRegex = /^arn:([^:]+):([^:]+):([^:]*):([^:]*):(.+)$/;
    const match = arn.match(arnRegex);
    if (!match)
        return null;
    const [, partition, service, region, accountId, resource] = match;
    const resourceParts = resource.split(/[:/]/);
    return {
        partition,
        service,
        region: region || 'global',
        accountId,
        resourceType: resourceParts.length > 1 ? resourceParts[0] : undefined,
        resourceId: resourceParts[resourceParts.length - 1],
    };
}
/**
 * Generate AWS Console URL from ARN
 *
 * @param arn - Full ARN string
 * @returns AWS Console URL or null if not supported
 */
function getConsoleUrlFromArn(arn) {
    const components = parseArn(arn);
    if (!components)
        return null;
    const { service, region, resourceId } = components;
    const baseUrl = region && region !== 'global'
        ? `https://${region}.console.aws.amazon.com`
        : 'https://console.aws.amazon.com';
    const consoleUrls = {
        'ec2': `${baseUrl}/ec2/v2/home?region=${region}#InstanceDetails:instanceId=${resourceId}`,
        'rds': `${baseUrl}/rds/home?region=${region}#database:id=${resourceId}`,
        'lambda': `${baseUrl}/lambda/home?region=${region}#/functions/${resourceId}`,
        's3': `https://s3.console.aws.amazon.com/s3/buckets/${resourceId}`,
        'dynamodb': `${baseUrl}/dynamodbv2/home?region=${region}#table?name=${resourceId}`,
        'elasticache': `${baseUrl}/elasticache/home?region=${region}#/redis/${resourceId}`,
        'sagemaker': `${baseUrl}/sagemaker/home?region=${region}#/endpoints/${resourceId}`,
        'elasticfilesystem': `${baseUrl}/efs/home?region=${region}#/file-systems/${resourceId}`,
        'elasticloadbalancing': `${baseUrl}/ec2/v2/home?region=${region}#LoadBalancers:`,
        'kinesis': `${baseUrl}/kinesis/home?region=${region}#/streams/details/${resourceId}`,
        'sqs': `${baseUrl}/sqs/v2/home?region=${region}#/queues/${encodeURIComponent(`https://sqs.${region}.amazonaws.com/${components.accountId}/${resourceId}`)}`,
        'sns': `${baseUrl}/sns/v3/home?region=${region}#/topic/${arn}`,
        'es': `${baseUrl}/aos/home?region=${region}#/opensearch/domains/${resourceId}`,
        'redshift': `${baseUrl}/redshiftv2/home?region=${region}#cluster-details?cluster=${resourceId}`,
        'states': `${baseUrl}/states/home?region=${region}#/statemachines/view/${arn}`,
        'events': `${baseUrl}/events/home?region=${region}#/rules/${resourceId}`,
    };
    return consoleUrls[service] || null;
}
/**
 * Get service name from resource type
 *
 * @param resourceType - Full resource type (e.g., 'EC2::Instance', 'RDS::DBInstance')
 * @returns Service code for ARN building
 */
function getServiceFromResourceType(resourceType) {
    const mapping = {
        'EC2::Instance': { service: 'ec2', type: 'instance' },
        'EC2::Volume': { service: 'ec2', type: 'volume' },
        'EC2::Snapshot': { service: 'ec2', type: 'snapshot' },
        'EC2::ElasticIp': { service: 'ec2', type: 'elastic-ip' },
        'EC2::NatGateway': { service: 'ec2', type: 'nat-gateway' },
        'EC2::SecurityGroup': { service: 'ec2', type: 'security-group' },
        'EC2::VPC': { service: 'ec2', type: 'vpc' },
        'EC2::Subnet': { service: 'ec2', type: 'subnet' },
        'EC2::RouteTable': { service: 'ec2', type: 'route-table' },
        'RDS::DBInstance': { service: 'rds', type: 'db' },
        'RDS::DBCluster': { service: 'rds', type: 'cluster' },
        'Lambda::Function': { service: 'lambda', type: 'function' },
        'S3::Bucket': { service: 's3', type: 'bucket' },
        'DynamoDB::Table': { service: 'dynamodb', type: 'table' },
        'ElastiCache::CacheCluster': { service: 'elasticache', type: 'cluster' },
        'ElastiCache::ReplicationGroup': { service: 'elasticache', type: 'replication-group' },
        'ECS::Cluster': { service: 'ecs', type: 'cluster' },
        'ECS::Service': { service: 'ecs', type: 'service' },
        'EKS::Cluster': { service: 'eks', type: 'cluster' },
        'Redshift::Cluster': { service: 'redshift', type: 'cluster' },
        'OpenSearch::Domain': { service: 'opensearch', type: 'domain' },
        'SageMaker::Endpoint': { service: 'sagemaker', type: 'endpoint' },
        'Kinesis::Stream': { service: 'kinesis', type: 'stream' },
        'SQS::Queue': { service: 'sqs', type: 'queue' },
        'SNS::Topic': { service: 'sns', type: 'topic' },
    };
    return mapping[resourceType] || { service: resourceType.split('::')[0].toLowerCase(), type: resourceType.split('::')[1]?.toLowerCase() || 'resource' };
}
//# sourceMappingURL=arn-builder.js.map