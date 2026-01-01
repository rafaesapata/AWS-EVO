"use strict";
/**
 * Security Engine V3 - ARN Builder
 * Centralized utility for building AWS ARNs - ensures 100% ARN coverage
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArnBuilder = void 0;
class ArnBuilder {
    constructor(accountId, partition = 'aws') {
        this.accountId = accountId || '000000000000';
        this.partition = partition;
    }
    // ==================== IAM ARNs (Global) ====================
    iamUser(userName) {
        return `arn:${this.partition}:iam::${this.accountId}:user/${userName}`;
    }
    iamRole(roleName) {
        return `arn:${this.partition}:iam::${this.accountId}:role/${roleName}`;
    }
    iamPolicy(policyName) {
        return `arn:${this.partition}:iam::${this.accountId}:policy/${policyName}`;
    }
    iamGroup(groupName) {
        return `arn:${this.partition}:iam::${this.accountId}:group/${groupName}`;
    }
    iamAccessKey(userName, accessKeyId) {
        return `arn:${this.partition}:iam::${this.accountId}:user/${userName}/accesskey/${accessKeyId}`;
    }
    iamAccountPasswordPolicy() {
        return `arn:${this.partition}:iam::${this.accountId}:account-password-policy`;
    }
    iamRootAccount() {
        return `arn:${this.partition}:iam::${this.accountId}:root`;
    }
    iamMfaDevice(userName, mfaDeviceName) {
        return `arn:${this.partition}:iam::${this.accountId}:mfa/${mfaDeviceName}`;
    }
    iamSamlProvider(providerName) {
        return `arn:${this.partition}:iam::${this.accountId}:saml-provider/${providerName}`;
    }
    iamOidcProvider(providerUrl) {
        return `arn:${this.partition}:iam::${this.accountId}:oidc-provider/${providerUrl}`;
    }
    iamInstanceProfile(profileName) {
        return `arn:${this.partition}:iam::${this.accountId}:instance-profile/${profileName}`;
    }
    // ==================== EC2 ARNs (Regional) ====================
    ec2Instance(region, instanceId) {
        return `arn:${this.partition}:ec2:${region}:${this.accountId}:instance/${instanceId}`;
    }
    ec2SecurityGroup(region, sgId) {
        return `arn:${this.partition}:ec2:${region}:${this.accountId}:security-group/${sgId}`;
    }
    ec2Volume(region, volumeId) {
        return `arn:${this.partition}:ec2:${region}:${this.accountId}:volume/${volumeId}`;
    }
    ec2Snapshot(region, snapshotId) {
        return `arn:${this.partition}:ec2:${region}:${this.accountId}:snapshot/${snapshotId}`;
    }
    ec2Vpc(region, vpcId) {
        return `arn:${this.partition}:ec2:${region}:${this.accountId}:vpc/${vpcId}`;
    }
    ec2Subnet(region, subnetId) {
        return `arn:${this.partition}:ec2:${region}:${this.accountId}:subnet/${subnetId}`;
    }
    ec2NetworkAcl(region, naclId) {
        return `arn:${this.partition}:ec2:${region}:${this.accountId}:network-acl/${naclId}`;
    }
    ec2NatGateway(region, natId) {
        return `arn:${this.partition}:ec2:${region}:${this.accountId}:natgateway/${natId}`;
    }
    ec2InternetGateway(region, igwId) {
        return `arn:${this.partition}:ec2:${region}:${this.accountId}:internet-gateway/${igwId}`;
    }
    ec2RouteTable(region, rtbId) {
        return `arn:${this.partition}:ec2:${region}:${this.accountId}:route-table/${rtbId}`;
    }
    ec2Ami(region, amiId) {
        return `arn:${this.partition}:ec2:${region}::image/${amiId}`;
    }
    ec2KeyPair(region, keyName) {
        return `arn:${this.partition}:ec2:${region}:${this.accountId}:key-pair/${keyName}`;
    }
    ec2LaunchTemplate(region, templateId) {
        return `arn:${this.partition}:ec2:${region}:${this.accountId}:launch-template/${templateId}`;
    }
    ec2ElasticIp(region, allocationId) {
        return `arn:${this.partition}:ec2:${region}:${this.accountId}:elastic-ip/${allocationId}`;
    }
    // ==================== S3 ARNs (Global) ====================
    s3Bucket(bucketName) {
        return `arn:${this.partition}:s3:::${bucketName}`;
    }
    s3Object(bucketName, objectKey) {
        return `arn:${this.partition}:s3:::${bucketName}/${objectKey}`;
    }
    s3AccessPoint(region, accessPointName) {
        return `arn:${this.partition}:s3:${region}:${this.accountId}:accesspoint/${accessPointName}`;
    }
    // ==================== RDS ARNs (Regional) ====================
    rdsInstance(region, dbIdentifier) {
        return `arn:${this.partition}:rds:${region}:${this.accountId}:db:${dbIdentifier}`;
    }
    rdsCluster(region, clusterIdentifier) {
        return `arn:${this.partition}:rds:${region}:${this.accountId}:cluster:${clusterIdentifier}`;
    }
    rdsSnapshot(region, snapshotIdentifier) {
        return `arn:${this.partition}:rds:${region}:${this.accountId}:snapshot:${snapshotIdentifier}`;
    }
    rdsClusterSnapshot(region, snapshotIdentifier) {
        return `arn:${this.partition}:rds:${region}:${this.accountId}:cluster-snapshot:${snapshotIdentifier}`;
    }
    rdsParameterGroup(region, groupName) {
        return `arn:${this.partition}:rds:${region}:${this.accountId}:pg:${groupName}`;
    }
    rdsSubnetGroup(region, groupName) {
        return `arn:${this.partition}:rds:${region}:${this.accountId}:subgrp:${groupName}`;
    }
    rdsProxy(region, proxyName) {
        return `arn:${this.partition}:rds:${region}:${this.accountId}:db-proxy:${proxyName}`;
    }
    // ==================== CloudTrail ARNs (Regional) ====================
    cloudTrail(region, trailName) {
        return `arn:${this.partition}:cloudtrail:${region}:${this.accountId}:trail/${trailName}`;
    }
    // ==================== KMS ARNs (Regional) ====================
    kmsKey(region, keyId) {
        return `arn:${this.partition}:kms:${region}:${this.accountId}:key/${keyId}`;
    }
    kmsAlias(region, aliasName) {
        return `arn:${this.partition}:kms:${region}:${this.accountId}:alias/${aliasName}`;
    }
    // ==================== Lambda ARNs (Regional) ====================
    lambdaFunction(region, functionName) {
        return `arn:${this.partition}:lambda:${region}:${this.accountId}:function:${functionName}`;
    }
    lambdaLayer(region, layerName, version) {
        return `arn:${this.partition}:lambda:${region}:${this.accountId}:layer:${layerName}:${version}`;
    }
    lambdaEventSourceMapping(region, uuid) {
        return `arn:${this.partition}:lambda:${region}:${this.accountId}:event-source-mapping:${uuid}`;
    }
    // ==================== EKS ARNs (Regional) ====================
    eksCluster(region, clusterName) {
        return `arn:${this.partition}:eks:${region}:${this.accountId}:cluster/${clusterName}`;
    }
    eksNodegroup(region, clusterName, nodegroupName) {
        return `arn:${this.partition}:eks:${region}:${this.accountId}:nodegroup/${clusterName}/${nodegroupName}`;
    }
    eksFargateProfile(region, clusterName, profileName) {
        return `arn:${this.partition}:eks:${region}:${this.accountId}:fargateprofile/${clusterName}/${profileName}`;
    }
    eksAddon(region, clusterName, addonName) {
        return `arn:${this.partition}:eks:${region}:${this.accountId}:addon/${clusterName}/${addonName}`;
    }
    // ==================== ECS ARNs (Regional) ====================
    ecsCluster(region, clusterName) {
        return `arn:${this.partition}:ecs:${region}:${this.accountId}:cluster/${clusterName}`;
    }
    ecsService(region, clusterName, serviceName) {
        return `arn:${this.partition}:ecs:${region}:${this.accountId}:service/${clusterName}/${serviceName}`;
    }
    ecsTaskDefinition(region, family, revision) {
        return `arn:${this.partition}:ecs:${region}:${this.accountId}:task-definition/${family}:${revision}`;
    }
    ecsTask(region, clusterName, taskId) {
        return `arn:${this.partition}:ecs:${region}:${this.accountId}:task/${clusterName}/${taskId}`;
    }
    ecsContainerInstance(region, clusterName, instanceId) {
        return `arn:${this.partition}:ecs:${region}:${this.accountId}:container-instance/${clusterName}/${instanceId}`;
    }
    // ==================== ECR ARNs (Regional) ====================
    ecrRepository(region, repositoryName) {
        return `arn:${this.partition}:ecr:${region}:${this.accountId}:repository/${repositoryName}`;
    }
    // ==================== API Gateway ARNs (Regional) ====================
    apiGatewayRestApi(region, apiId) {
        return `arn:${this.partition}:apigateway:${region}::/restapis/${apiId}`;
    }
    apiGatewayHttpApi(region, apiId) {
        return `arn:${this.partition}:apigateway:${region}::/apis/${apiId}`;
    }
    apiGatewayStage(region, apiId, stageName) {
        return `arn:${this.partition}:apigateway:${region}::/restapis/${apiId}/stages/${stageName}`;
    }
    // ==================== Secrets Manager ARNs (Regional) ====================
    secretsManagerSecret(region, secretId) {
        return `arn:${this.partition}:secretsmanager:${region}:${this.accountId}:secret:${secretId}`;
    }
    // ==================== SNS ARNs (Regional) ====================
    snsTopic(region, topicName) {
        return `arn:${this.partition}:sns:${region}:${this.accountId}:${topicName}`;
    }
    snsSubscription(region, topicName, subscriptionId) {
        return `arn:${this.partition}:sns:${region}:${this.accountId}:${topicName}:${subscriptionId}`;
    }
    // ==================== SQS ARNs (Regional) ====================
    sqsQueue(region, queueName) {
        return `arn:${this.partition}:sqs:${region}:${this.accountId}:${queueName}`;
    }
    // ==================== DynamoDB ARNs (Regional) ====================
    dynamoDBTable(region, tableName) {
        return `arn:${this.partition}:dynamodb:${region}:${this.accountId}:table/${tableName}`;
    }
    dynamoDBStream(region, tableName, streamLabel) {
        return `arn:${this.partition}:dynamodb:${region}:${this.accountId}:table/${tableName}/stream/${streamLabel}`;
    }
    dynamoDBBackup(region, tableName, backupId) {
        return `arn:${this.partition}:dynamodb:${region}:${this.accountId}:table/${tableName}/backup/${backupId}`;
    }
    // ==================== ElastiCache ARNs (Regional) ====================
    elastiCacheCluster(region, clusterId) {
        return `arn:${this.partition}:elasticache:${region}:${this.accountId}:cluster:${clusterId}`;
    }
    elastiCacheReplicationGroup(region, groupId) {
        return `arn:${this.partition}:elasticache:${region}:${this.accountId}:replicationgroup:${groupId}`;
    }
    elastiCacheSnapshot(region, snapshotName) {
        return `arn:${this.partition}:elasticache:${region}:${this.accountId}:snapshot:${snapshotName}`;
    }
    // ==================== ELB ARNs (Regional) ====================
    elbv2LoadBalancer(region, type, name, id) {
        return `arn:${this.partition}:elasticloadbalancing:${region}:${this.accountId}:loadbalancer/${type}/${name}/${id}`;
    }
    elbv2TargetGroup(region, targetGroupName, id) {
        return `arn:${this.partition}:elasticloadbalancing:${region}:${this.accountId}:targetgroup/${targetGroupName}/${id}`;
    }
    elbv2Listener(region, loadBalancerArn, listenerId) {
        return `${loadBalancerArn}/listener/${listenerId}`;
    }
    // ==================== CloudFront ARNs (Global) ====================
    cloudFrontDistribution(distributionId) {
        return `arn:${this.partition}:cloudfront::${this.accountId}:distribution/${distributionId}`;
    }
    cloudFrontOriginAccessIdentity(oaiId) {
        return `arn:${this.partition}:cloudfront::${this.accountId}:origin-access-identity/${oaiId}`;
    }
    // ==================== WAF ARNs (Regional/Global) ====================
    wafWebAcl(scope, region, name, id) {
        const scopePath = scope === 'global' ? 'global' : 'regional';
        return `arn:${this.partition}:wafv2:${region}:${this.accountId}:${scopePath}/webacl/${name}/${id}`;
    }
    wafRuleGroup(scope, region, name, id) {
        const scopePath = scope === 'global' ? 'global' : 'regional';
        return `arn:${this.partition}:wafv2:${region}:${this.accountId}:${scopePath}/rulegroup/${name}/${id}`;
    }
    wafIpSet(scope, region, name, id) {
        const scopePath = scope === 'global' ? 'global' : 'regional';
        return `arn:${this.partition}:wafv2:${region}:${this.accountId}:${scopePath}/ipset/${name}/${id}`;
    }
    // ==================== GuardDuty ARNs (Regional) ====================
    guardDutyDetector(region, detectorId) {
        return `arn:${this.partition}:guardduty:${region}:${this.accountId}:detector/${detectorId}`;
    }
    guardDutyFinding(region, detectorId, findingId) {
        return `arn:${this.partition}:guardduty:${region}:${this.accountId}:detector/${detectorId}/finding/${findingId}`;
    }
    // ==================== Security Hub ARNs (Regional) ====================
    securityHubHub(region) {
        return `arn:${this.partition}:securityhub:${region}:${this.accountId}:hub/default`;
    }
    securityHubFinding(region, findingId) {
        return `arn:${this.partition}:securityhub:${region}:${this.accountId}:finding/${findingId}`;
    }
    // ==================== Config ARNs (Regional) ====================
    configRule(region, ruleName) {
        return `arn:${this.partition}:config:${region}:${this.accountId}:config-rule/${ruleName}`;
    }
    configConformancePack(region, packName) {
        return `arn:${this.partition}:config:${region}:${this.accountId}:conformance-pack/${packName}`;
    }
    // ==================== ACM ARNs (Regional) ====================
    acmCertificate(region, certificateId) {
        return `arn:${this.partition}:acm:${region}:${this.accountId}:certificate/${certificateId}`;
    }
    // ==================== Route 53 ARNs (Global) ====================
    route53HostedZone(hostedZoneId) {
        return `arn:${this.partition}:route53:::hostedzone/${hostedZoneId}`;
    }
    route53HealthCheck(healthCheckId) {
        return `arn:${this.partition}:route53:::healthcheck/${healthCheckId}`;
    }
    // ==================== EFS ARNs (Regional) ====================
    efsFileSystem(region, fileSystemId) {
        return `arn:${this.partition}:elasticfilesystem:${region}:${this.accountId}:file-system/${fileSystemId}`;
    }
    efsAccessPoint(region, accessPointId) {
        return `arn:${this.partition}:elasticfilesystem:${region}:${this.accountId}:access-point/${accessPointId}`;
    }
    // ==================== Cognito ARNs (Regional) ====================
    cognitoUserPool(region, userPoolId) {
        return `arn:${this.partition}:cognito-idp:${region}:${this.accountId}:userpool/${userPoolId}`;
    }
    cognitoIdentityPool(region, identityPoolId) {
        return `arn:${this.partition}:cognito-identity:${region}:${this.accountId}:identitypool/${identityPoolId}`;
    }
    // ==================== OpenSearch ARNs (Regional) ====================
    openSearchDomain(region, domainName) {
        return `arn:${this.partition}:es:${region}:${this.accountId}:domain/${domainName}`;
    }
    // ==================== Redshift ARNs (Regional) ====================
    redshiftCluster(region, clusterIdentifier) {
        return `arn:${this.partition}:redshift:${region}:${this.accountId}:cluster:${clusterIdentifier}`;
    }
    redshiftSnapshot(region, snapshotIdentifier) {
        return `arn:${this.partition}:redshift:${region}:${this.accountId}:snapshot:${snapshotIdentifier}`;
    }
    // ==================== Kinesis ARNs (Regional) ====================
    kinesisStream(region, streamName) {
        return `arn:${this.partition}:kinesis:${region}:${this.accountId}:stream/${streamName}`;
    }
    kinesisFirehose(region, deliveryStreamName) {
        return `arn:${this.partition}:firehose:${region}:${this.accountId}:deliverystream/${deliveryStreamName}`;
    }
    // ==================== CloudWatch ARNs (Regional) ====================
    cloudWatchLogGroup(region, logGroupName) {
        return `arn:${this.partition}:logs:${region}:${this.accountId}:log-group:${logGroupName}`;
    }
    cloudWatchAlarm(region, alarmName) {
        return `arn:${this.partition}:cloudwatch:${region}:${this.accountId}:alarm:${alarmName}`;
    }
    // ==================== EventBridge ARNs (Regional) ====================
    eventBridgeEventBus(region, eventBusName) {
        return `arn:${this.partition}:events:${region}:${this.accountId}:event-bus/${eventBusName}`;
    }
    eventBridgeRule(region, ruleName) {
        return `arn:${this.partition}:events:${region}:${this.accountId}:rule/${ruleName}`;
    }
    // ==================== Step Functions ARNs (Regional) ====================
    stepFunctionsStateMachine(region, stateMachineName) {
        return `arn:${this.partition}:states:${region}:${this.accountId}:stateMachine:${stateMachineName}`;
    }
    stepFunctionsExecution(region, stateMachineName, executionName) {
        return `arn:${this.partition}:states:${region}:${this.accountId}:execution:${stateMachineName}:${executionName}`;
    }
    // ==================== Organizations ARNs (Global) ====================
    organizationsOrganization(organizationId) {
        return `arn:${this.partition}:organizations::${this.accountId}:organization/${organizationId}`;
    }
    organizationsAccount(accountId) {
        return `arn:${this.partition}:organizations::${this.accountId}:account/o-*/${accountId}`;
    }
    organizationsPolicy(policyId) {
        return `arn:${this.partition}:organizations::${this.accountId}:policy/o-*/${policyId}`;
    }
    // ==================== Access Analyzer ARNs (Regional) ====================
    accessAnalyzer(region, analyzerName) {
        if (analyzerName) {
            return `arn:${this.partition}:access-analyzer:${region}:${this.accountId}:analyzer/${analyzerName}`;
        }
        return `arn:${this.partition}:access-analyzer:${region}:${this.accountId}:analyzer`;
    }
    // ==================== Generic ARN Builder ====================
    generic(service, region, resourceType, resourceId) {
        const regionPart = region || '';
        return `arn:${this.partition}:${service}:${regionPart}:${this.accountId}:${resourceType}/${resourceId}`;
    }
    // ==================== Utility Methods ====================
    getAccountId() {
        return this.accountId;
    }
    getPartition() {
        return this.partition;
    }
    parseArn(arn) {
        const arnRegex = /^arn:([^:]+):([^:]+):([^:]*):([^:]*):(.+)$/;
        const match = arn.match(arnRegex);
        if (!match)
            return null;
        const [, partition, service, region, accountId, resource] = match;
        const resourceParts = resource.split(/[:/]/);
        return {
            partition,
            service,
            region,
            accountId,
            resourceType: resourceParts[0] || '',
            resourceId: resourceParts.slice(1).join('/') || resourceParts[0],
        };
    }
}
exports.ArnBuilder = ArnBuilder;
//# sourceMappingURL=arn-builder.js.map