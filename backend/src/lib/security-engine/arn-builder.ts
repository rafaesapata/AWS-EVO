/**
 * Security Engine V3 - ARN Builder
 * Centralized utility for building AWS ARNs - ensures 100% ARN coverage
 */

export class ArnBuilder {
  private accountId: string;
  private partition: string;

  constructor(accountId: string, partition: string = 'aws') {
    this.accountId = accountId || '000000000000';
    this.partition = partition;
  }

  // ==================== IAM ARNs (Global) ====================
  
  iamUser(userName: string): string {
    return `arn:${this.partition}:iam::${this.accountId}:user/${userName}`;
  }

  iamRole(roleName: string): string {
    return `arn:${this.partition}:iam::${this.accountId}:role/${roleName}`;
  }

  iamPolicy(policyName: string): string {
    return `arn:${this.partition}:iam::${this.accountId}:policy/${policyName}`;
  }

  iamGroup(groupName: string): string {
    return `arn:${this.partition}:iam::${this.accountId}:group/${groupName}`;
  }

  iamAccessKey(userName: string, accessKeyId: string): string {
    return `arn:${this.partition}:iam::${this.accountId}:user/${userName}/accesskey/${accessKeyId}`;
  }

  iamAccountPasswordPolicy(): string {
    return `arn:${this.partition}:iam::${this.accountId}:account-password-policy`;
  }

  iamRootAccount(): string {
    return `arn:${this.partition}:iam::${this.accountId}:root`;
  }

  iamMfaDevice(userName: string, mfaDeviceName: string): string {
    return `arn:${this.partition}:iam::${this.accountId}:mfa/${mfaDeviceName}`;
  }

  iamSamlProvider(providerName: string): string {
    return `arn:${this.partition}:iam::${this.accountId}:saml-provider/${providerName}`;
  }

  iamOidcProvider(providerUrl: string): string {
    return `arn:${this.partition}:iam::${this.accountId}:oidc-provider/${providerUrl}`;
  }

  iamInstanceProfile(profileName: string): string {
    return `arn:${this.partition}:iam::${this.accountId}:instance-profile/${profileName}`;
  }

  // ==================== EC2 ARNs (Regional) ====================

  ec2Instance(region: string, instanceId: string): string {
    return `arn:${this.partition}:ec2:${region}:${this.accountId}:instance/${instanceId}`;
  }

  ec2SecurityGroup(region: string, sgId: string): string {
    return `arn:${this.partition}:ec2:${region}:${this.accountId}:security-group/${sgId}`;
  }

  ec2Volume(region: string, volumeId: string): string {
    return `arn:${this.partition}:ec2:${region}:${this.accountId}:volume/${volumeId}`;
  }

  ec2Snapshot(region: string, snapshotId: string): string {
    return `arn:${this.partition}:ec2:${region}:${this.accountId}:snapshot/${snapshotId}`;
  }

  ec2Vpc(region: string, vpcId: string): string {
    return `arn:${this.partition}:ec2:${region}:${this.accountId}:vpc/${vpcId}`;
  }

  ec2Subnet(region: string, subnetId: string): string {
    return `arn:${this.partition}:ec2:${region}:${this.accountId}:subnet/${subnetId}`;
  }

  ec2NetworkAcl(region: string, naclId: string): string {
    return `arn:${this.partition}:ec2:${region}:${this.accountId}:network-acl/${naclId}`;
  }

  ec2NatGateway(region: string, natId: string): string {
    return `arn:${this.partition}:ec2:${region}:${this.accountId}:natgateway/${natId}`;
  }

  ec2InternetGateway(region: string, igwId: string): string {
    return `arn:${this.partition}:ec2:${region}:${this.accountId}:internet-gateway/${igwId}`;
  }

  ec2RouteTable(region: string, rtbId: string): string {
    return `arn:${this.partition}:ec2:${region}:${this.accountId}:route-table/${rtbId}`;
  }

  ec2Ami(region: string, amiId: string): string {
    return `arn:${this.partition}:ec2:${region}::image/${amiId}`;
  }

  ec2KeyPair(region: string, keyName: string): string {
    return `arn:${this.partition}:ec2:${region}:${this.accountId}:key-pair/${keyName}`;
  }

  ec2LaunchTemplate(region: string, templateId: string): string {
    return `arn:${this.partition}:ec2:${region}:${this.accountId}:launch-template/${templateId}`;
  }

  ec2ElasticIp(region: string, allocationId: string): string {
    return `arn:${this.partition}:ec2:${region}:${this.accountId}:elastic-ip/${allocationId}`;
  }

  // ==================== S3 ARNs (Global) ====================

  s3Bucket(bucketName: string): string {
    return `arn:${this.partition}:s3:::${bucketName}`;
  }

  s3Object(bucketName: string, objectKey: string): string {
    return `arn:${this.partition}:s3:::${bucketName}/${objectKey}`;
  }

  s3AccessPoint(region: string, accessPointName: string): string {
    return `arn:${this.partition}:s3:${region}:${this.accountId}:accesspoint/${accessPointName}`;
  }

  // ==================== RDS ARNs (Regional) ====================

  rdsInstance(region: string, dbIdentifier: string): string {
    return `arn:${this.partition}:rds:${region}:${this.accountId}:db:${dbIdentifier}`;
  }

  rdsCluster(region: string, clusterIdentifier: string): string {
    return `arn:${this.partition}:rds:${region}:${this.accountId}:cluster:${clusterIdentifier}`;
  }

  rdsSnapshot(region: string, snapshotIdentifier: string): string {
    return `arn:${this.partition}:rds:${region}:${this.accountId}:snapshot:${snapshotIdentifier}`;
  }

  rdsClusterSnapshot(region: string, snapshotIdentifier: string): string {
    return `arn:${this.partition}:rds:${region}:${this.accountId}:cluster-snapshot:${snapshotIdentifier}`;
  }

  rdsParameterGroup(region: string, groupName: string): string {
    return `arn:${this.partition}:rds:${region}:${this.accountId}:pg:${groupName}`;
  }

  rdsSubnetGroup(region: string, groupName: string): string {
    return `arn:${this.partition}:rds:${region}:${this.accountId}:subgrp:${groupName}`;
  }

  rdsProxy(region: string, proxyName: string): string {
    return `arn:${this.partition}:rds:${region}:${this.accountId}:db-proxy:${proxyName}`;
  }

  // ==================== CloudTrail ARNs (Regional) ====================

  cloudTrail(region: string, trailName: string): string {
    return `arn:${this.partition}:cloudtrail:${region}:${this.accountId}:trail/${trailName}`;
  }

  // ==================== KMS ARNs (Regional) ====================

  kmsKey(region: string, keyId: string): string {
    return `arn:${this.partition}:kms:${region}:${this.accountId}:key/${keyId}`;
  }

  kmsAlias(region: string, aliasName: string): string {
    return `arn:${this.partition}:kms:${region}:${this.accountId}:alias/${aliasName}`;
  }

  // ==================== Lambda ARNs (Regional) ====================

  lambdaFunction(region: string, functionName: string): string {
    return `arn:${this.partition}:lambda:${region}:${this.accountId}:function:${functionName}`;
  }

  lambdaLayer(region: string, layerName: string, version: number): string {
    return `arn:${this.partition}:lambda:${region}:${this.accountId}:layer:${layerName}:${version}`;
  }

  lambdaEventSourceMapping(region: string, uuid: string): string {
    return `arn:${this.partition}:lambda:${region}:${this.accountId}:event-source-mapping:${uuid}`;
  }

  // ==================== EKS ARNs (Regional) ====================

  eksCluster(region: string, clusterName: string): string {
    return `arn:${this.partition}:eks:${region}:${this.accountId}:cluster/${clusterName}`;
  }

  eksNodegroup(region: string, clusterName: string, nodegroupName: string): string {
    return `arn:${this.partition}:eks:${region}:${this.accountId}:nodegroup/${clusterName}/${nodegroupName}`;
  }

  eksFargateProfile(region: string, clusterName: string, profileName: string): string {
    return `arn:${this.partition}:eks:${region}:${this.accountId}:fargateprofile/${clusterName}/${profileName}`;
  }

  eksAddon(region: string, clusterName: string, addonName: string): string {
    return `arn:${this.partition}:eks:${region}:${this.accountId}:addon/${clusterName}/${addonName}`;
  }

  // ==================== ECS ARNs (Regional) ====================

  ecsCluster(region: string, clusterName: string): string {
    return `arn:${this.partition}:ecs:${region}:${this.accountId}:cluster/${clusterName}`;
  }

  ecsService(region: string, clusterName: string, serviceName: string): string {
    return `arn:${this.partition}:ecs:${region}:${this.accountId}:service/${clusterName}/${serviceName}`;
  }

  ecsTaskDefinition(region: string, family: string, revision: number): string {
    return `arn:${this.partition}:ecs:${region}:${this.accountId}:task-definition/${family}:${revision}`;
  }

  ecsTask(region: string, clusterName: string, taskId: string): string {
    return `arn:${this.partition}:ecs:${region}:${this.accountId}:task/${clusterName}/${taskId}`;
  }

  ecsContainerInstance(region: string, clusterName: string, instanceId: string): string {
    return `arn:${this.partition}:ecs:${region}:${this.accountId}:container-instance/${clusterName}/${instanceId}`;
  }

  // ==================== ECR ARNs (Regional) ====================

  ecrRepository(region: string, repositoryName: string): string {
    return `arn:${this.partition}:ecr:${region}:${this.accountId}:repository/${repositoryName}`;
  }

  // ==================== API Gateway ARNs (Regional) ====================

  apiGatewayRestApi(region: string, apiId: string): string {
    return `arn:${this.partition}:apigateway:${region}::/restapis/${apiId}`;
  }

  apiGatewayHttpApi(region: string, apiId: string): string {
    return `arn:${this.partition}:apigateway:${region}::/apis/${apiId}`;
  }

  apiGatewayStage(region: string, apiId: string, stageName: string): string {
    return `arn:${this.partition}:apigateway:${region}::/restapis/${apiId}/stages/${stageName}`;
  }

  // ==================== Secrets Manager ARNs (Regional) ====================

  secretsManagerSecret(region: string, secretId: string): string {
    return `arn:${this.partition}:secretsmanager:${region}:${this.accountId}:secret:${secretId}`;
  }

  // ==================== SNS ARNs (Regional) ====================

  snsTopic(region: string, topicName: string): string {
    return `arn:${this.partition}:sns:${region}:${this.accountId}:${topicName}`;
  }

  snsSubscription(region: string, topicName: string, subscriptionId: string): string {
    return `arn:${this.partition}:sns:${region}:${this.accountId}:${topicName}:${subscriptionId}`;
  }

  // ==================== SQS ARNs (Regional) ====================

  sqsQueue(region: string, queueName: string): string {
    return `arn:${this.partition}:sqs:${region}:${this.accountId}:${queueName}`;
  }

  // ==================== DynamoDB ARNs (Regional) ====================

  dynamoDBTable(region: string, tableName: string): string {
    return `arn:${this.partition}:dynamodb:${region}:${this.accountId}:table/${tableName}`;
  }

  dynamoDBStream(region: string, tableName: string, streamLabel: string): string {
    return `arn:${this.partition}:dynamodb:${region}:${this.accountId}:table/${tableName}/stream/${streamLabel}`;
  }

  dynamoDBBackup(region: string, tableName: string, backupId: string): string {
    return `arn:${this.partition}:dynamodb:${region}:${this.accountId}:table/${tableName}/backup/${backupId}`;
  }

  // ==================== ElastiCache ARNs (Regional) ====================

  elastiCacheCluster(region: string, clusterId: string): string {
    return `arn:${this.partition}:elasticache:${region}:${this.accountId}:cluster:${clusterId}`;
  }

  elastiCacheReplicationGroup(region: string, groupId: string): string {
    return `arn:${this.partition}:elasticache:${region}:${this.accountId}:replicationgroup:${groupId}`;
  }

  elastiCacheSnapshot(region: string, snapshotName: string): string {
    return `arn:${this.partition}:elasticache:${region}:${this.accountId}:snapshot:${snapshotName}`;
  }

  // ==================== ELB ARNs (Regional) ====================

  elbv2LoadBalancer(region: string, type: string, name: string, id: string): string {
    return `arn:${this.partition}:elasticloadbalancing:${region}:${this.accountId}:loadbalancer/${type}/${name}/${id}`;
  }

  elbv2TargetGroup(region: string, targetGroupName: string, id: string): string {
    return `arn:${this.partition}:elasticloadbalancing:${region}:${this.accountId}:targetgroup/${targetGroupName}/${id}`;
  }

  elbv2Listener(region: string, loadBalancerArn: string, listenerId: string): string {
    return `${loadBalancerArn}/listener/${listenerId}`;
  }

  // ==================== CloudFront ARNs (Global) ====================

  cloudFrontDistribution(distributionId: string): string {
    return `arn:${this.partition}:cloudfront::${this.accountId}:distribution/${distributionId}`;
  }

  cloudFrontOriginAccessIdentity(oaiId: string): string {
    return `arn:${this.partition}:cloudfront::${this.accountId}:origin-access-identity/${oaiId}`;
  }

  // ==================== WAF ARNs (Regional/Global) ====================

  wafWebAcl(scope: 'regional' | 'global', region: string, name: string, id: string): string {
    const scopePath = scope === 'global' ? 'global' : 'regional';
    return `arn:${this.partition}:wafv2:${region}:${this.accountId}:${scopePath}/webacl/${name}/${id}`;
  }

  wafRuleGroup(scope: 'regional' | 'global', region: string, name: string, id: string): string {
    const scopePath = scope === 'global' ? 'global' : 'regional';
    return `arn:${this.partition}:wafv2:${region}:${this.accountId}:${scopePath}/rulegroup/${name}/${id}`;
  }

  wafIpSet(scope: 'regional' | 'global', region: string, name: string, id: string): string {
    const scopePath = scope === 'global' ? 'global' : 'regional';
    return `arn:${this.partition}:wafv2:${region}:${this.accountId}:${scopePath}/ipset/${name}/${id}`;
  }

  // ==================== GuardDuty ARNs (Regional) ====================

  guardDutyDetector(region: string, detectorId: string): string {
    return `arn:${this.partition}:guardduty:${region}:${this.accountId}:detector/${detectorId}`;
  }

  guardDutyFinding(region: string, detectorId: string, findingId: string): string {
    return `arn:${this.partition}:guardduty:${region}:${this.accountId}:detector/${detectorId}/finding/${findingId}`;
  }

  // ==================== Security Hub ARNs (Regional) ====================

  securityHubHub(region: string): string {
    return `arn:${this.partition}:securityhub:${region}:${this.accountId}:hub/default`;
  }

  securityHubFinding(region: string, findingId: string): string {
    return `arn:${this.partition}:securityhub:${region}:${this.accountId}:finding/${findingId}`;
  }

  // ==================== Config ARNs (Regional) ====================

  configRule(region: string, ruleName: string): string {
    return `arn:${this.partition}:config:${region}:${this.accountId}:config-rule/${ruleName}`;
  }

  configConformancePack(region: string, packName: string): string {
    return `arn:${this.partition}:config:${region}:${this.accountId}:conformance-pack/${packName}`;
  }

  // ==================== ACM ARNs (Regional) ====================

  acmCertificate(region: string, certificateId: string): string {
    return `arn:${this.partition}:acm:${region}:${this.accountId}:certificate/${certificateId}`;
  }

  // ==================== Route 53 ARNs (Global) ====================

  route53HostedZone(hostedZoneId: string): string {
    return `arn:${this.partition}:route53:::hostedzone/${hostedZoneId}`;
  }

  route53HealthCheck(healthCheckId: string): string {
    return `arn:${this.partition}:route53:::healthcheck/${healthCheckId}`;
  }

  // ==================== EFS ARNs (Regional) ====================

  efsFileSystem(region: string, fileSystemId: string): string {
    return `arn:${this.partition}:elasticfilesystem:${region}:${this.accountId}:file-system/${fileSystemId}`;
  }

  efsAccessPoint(region: string, accessPointId: string): string {
    return `arn:${this.partition}:elasticfilesystem:${region}:${this.accountId}:access-point/${accessPointId}`;
  }

  // ==================== Cognito ARNs (Regional) ====================

  cognitoUserPool(region: string, userPoolId: string): string {
    return `arn:${this.partition}:cognito-idp:${region}:${this.accountId}:userpool/${userPoolId}`;
  }

  cognitoIdentityPool(region: string, identityPoolId: string): string {
    return `arn:${this.partition}:cognito-identity:${region}:${this.accountId}:identitypool/${identityPoolId}`;
  }

  // ==================== OpenSearch ARNs (Regional) ====================

  openSearchDomain(region: string, domainName: string): string {
    return `arn:${this.partition}:es:${region}:${this.accountId}:domain/${domainName}`;
  }

  // ==================== Redshift ARNs (Regional) ====================

  redshiftCluster(region: string, clusterIdentifier: string): string {
    return `arn:${this.partition}:redshift:${region}:${this.accountId}:cluster:${clusterIdentifier}`;
  }

  redshiftSnapshot(region: string, snapshotIdentifier: string): string {
    return `arn:${this.partition}:redshift:${region}:${this.accountId}:snapshot:${snapshotIdentifier}`;
  }

  // ==================== Kinesis ARNs (Regional) ====================

  kinesisStream(region: string, streamName: string): string {
    return `arn:${this.partition}:kinesis:${region}:${this.accountId}:stream/${streamName}`;
  }

  kinesisFirehose(region: string, deliveryStreamName: string): string {
    return `arn:${this.partition}:firehose:${region}:${this.accountId}:deliverystream/${deliveryStreamName}`;
  }

  // ==================== CloudWatch ARNs (Regional) ====================

  cloudWatchLogGroup(region: string, logGroupName: string): string {
    return `arn:${this.partition}:logs:${region}:${this.accountId}:log-group:${logGroupName}`;
  }

  cloudWatchAlarm(region: string, alarmName: string): string {
    return `arn:${this.partition}:cloudwatch:${region}:${this.accountId}:alarm:${alarmName}`;
  }

  // ==================== EventBridge ARNs (Regional) ====================

  eventBridgeEventBus(region: string, eventBusName: string): string {
    return `arn:${this.partition}:events:${region}:${this.accountId}:event-bus/${eventBusName}`;
  }

  eventBridgeRule(region: string, ruleName: string): string {
    return `arn:${this.partition}:events:${region}:${this.accountId}:rule/${ruleName}`;
  }

  // ==================== Step Functions ARNs (Regional) ====================

  stepFunctionsStateMachine(region: string, stateMachineName: string): string {
    return `arn:${this.partition}:states:${region}:${this.accountId}:stateMachine:${stateMachineName}`;
  }

  stepFunctionsExecution(region: string, stateMachineName: string, executionName: string): string {
    return `arn:${this.partition}:states:${region}:${this.accountId}:execution:${stateMachineName}:${executionName}`;
  }

  // ==================== Organizations ARNs (Global) ====================

  organizationsOrganization(organizationId: string): string {
    return `arn:${this.partition}:organizations::${this.accountId}:organization/${organizationId}`;
  }

  organizationsAccount(accountId: string): string {
    return `arn:${this.partition}:organizations::${this.accountId}:account/o-*/${accountId}`;
  }

  organizationsPolicy(policyId: string): string {
    return `arn:${this.partition}:organizations::${this.accountId}:policy/o-*/${policyId}`;
  }

  // ==================== Access Analyzer ARNs (Regional) ====================

  accessAnalyzer(region: string, analyzerName?: string): string {
    if (analyzerName) {
      return `arn:${this.partition}:access-analyzer:${region}:${this.accountId}:analyzer/${analyzerName}`;
    }
    return `arn:${this.partition}:access-analyzer:${region}:${this.accountId}:analyzer`;
  }

  // ==================== Generic ARN Builder ====================

  generic(service: string, region: string, resourceType: string, resourceId: string): string {
    const regionPart = region || '';
    return `arn:${this.partition}:${service}:${regionPart}:${this.accountId}:${resourceType}/${resourceId}`;
  }

  // ==================== Utility Methods ====================

  getAccountId(): string {
    return this.accountId;
  }

  getPartition(): string {
    return this.partition;
  }

  parseArn(arn: string): {
    partition: string;
    service: string;
    region: string;
    accountId: string;
    resourceType: string;
    resourceId: string;
  } | null {
    const arnRegex = /^arn:([^:]+):([^:]+):([^:]*):([^:]*):(.+)$/;
    const match = arn.match(arnRegex);
    
    if (!match) return null;

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
