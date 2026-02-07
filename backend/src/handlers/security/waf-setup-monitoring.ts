/**
 * WAF Setup Monitoring Lambda Handler
 * 
 * Configures WAF log monitoring in customer's AWS account using their existing IAM Role.
 * Creates CloudWatch Logs subscription filter to send WAF logs cross-account to EVO.
 * 
 * Supports three filter modes:
 * - block_only: Only BLOCK/COUNT events (recommended for MVP)
 * - all_requests: All events including ALLOW (higher volume/cost)
 * - hybrid: BLOCK/COUNT detailed + ALLOW metrics via CloudWatch Metrics
 */

import { getHttpMethod } from '../../lib/middleware.js';
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { 
  WAFV2Client, 
  GetLoggingConfigurationCommand,
  PutLoggingConfigurationCommand,
  DeleteLoggingConfigurationCommand,
  ListWebACLsCommand,
} from '@aws-sdk/client-wafv2';
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  PutSubscriptionFilterCommand,
  DeleteSubscriptionFilterCommand,
  DescribeSubscriptionFiltersCommand,
} from '@aws-sdk/client-cloudwatch-logs';

// Filter modes for WAF log collection
type LogFilterMode = 'block_only' | 'all_requests' | 'hybrid';

interface SetupWafMonitoringRequest {
  accountId: string;      // ID da credencial AWS no banco
  webAclArn: string;      // ARN do WAF Web ACL a monitorar
  enabled: boolean;       // Habilitar ou desabilitar
  filterMode?: LogFilterMode; // Modo de filtragem de logs (default: block_only)
}

interface SetupResult {
  success: boolean;
  logGroupName: string;
  subscriptionFilterName: string;
  filterMode: LogFilterMode;
  message: string;
}

// EVO CloudWatch Logs Destination base name for cross-account subscription filters
// Using Destination instead of direct Lambda ARN is required for cross-account
// MUST match CloudFormation stack: ${ProjectName}-${Environment}-waf-logs-destination
const EVO_WAF_DESTINATION_NAME = 'evo-uds-v3-sandbox-waf-logs-destination';
const EVO_ACCOUNT_ID = '971354623291';

// Supported regions for WAF monitoring
// Must include ALL regions where customers may have WAF resources
const SUPPORTED_REGIONS = [
  'us-east-1',      // N. Virginia
  'us-east-2',      // Ohio
  'us-west-1',      // N. California
  'us-west-2',      // Oregon
  'ca-central-1',   // Canada
  'eu-west-1',      // Ireland
  'eu-west-2',      // London
  'eu-west-3',      // Paris
  'eu-central-1',   // Frankfurt
  'eu-north-1',     // Stockholm
  'eu-south-1',     // Milan
  'ap-southeast-1', // Singapore
  'ap-southeast-2', // Sydney
  'ap-northeast-1', // Tokyo
  'ap-northeast-2', // Seoul
  'ap-northeast-3', // Osaka
  'ap-south-1',     // Mumbai
  'sa-east-1',      // São Paulo
  'me-south-1',     // Bahrain
  'af-south-1',     // Cape Town
];

/**
 * Get the destination ARN for a specific region
 * The destination must be in the same region as the log group
 * For unsupported regions, falls back to us-east-1 destination
 */
function getDestinationArn(region: string): string {
  const effectiveRegion = SUPPORTED_REGIONS.includes(region) ? region : 'us-east-1';
  if (effectiveRegion !== region) {
    logger.warn(`Region ${region} not in pre-configured list, using us-east-1 destination as fallback`);
  }
  return `arn:aws:logs:${effectiveRegion}:${EVO_ACCOUNT_ID}:destination:${EVO_WAF_DESTINATION_NAME}`;
}

// Subscription filter name
const SUBSCRIPTION_FILTER_NAME = 'evo-waf-monitoring';

/**
 * Update the CloudWatch Logs Destination policy in EVO account to allow the customer account
 * This is required for cross-account subscription filters to work
 * 
 * @param customerAwsAccountId - Customer's AWS account ID to add to the policy
 * @param region - AWS region where the destination exists
 */
async function updateDestinationPolicyForCustomer(
  customerAwsAccountId: string,
  region: string
): Promise<void> {
  const { 
    CloudWatchLogsClient: EvoLogsClient, 
    DescribeDestinationsCommand,
    PutDestinationPolicyCommand 
  } = await import('@aws-sdk/client-cloudwatch-logs');
  
  // Use default credentials (EVO account) - this Lambda runs in EVO account
  const evoLogsClient = new EvoLogsClient({ region });
  
  try {
    // Get current destination and its policy
    const destResponse = await evoLogsClient.send(new DescribeDestinationsCommand({
      DestinationNamePrefix: EVO_WAF_DESTINATION_NAME
    }));
    
    const destination = destResponse.destinations?.find(d => d.destinationName === EVO_WAF_DESTINATION_NAME);
    if (!destination) {
      logger.warn('Destination not found, skipping policy update', { 
        destinationName: EVO_WAF_DESTINATION_NAME, 
        region 
      });
      return;
    }
    
    // Parse current policy
    let currentAccounts: string[] = [EVO_ACCOUNT_ID];
    if (destination.accessPolicy) {
      try {
        const policy = JSON.parse(destination.accessPolicy);
        const principal = policy.Statement?.[0]?.Principal?.AWS;
        if (Array.isArray(principal)) {
          currentAccounts = principal;
        } else if (typeof principal === 'string') {
          currentAccounts = [principal];
        }
      } catch (e) {
        logger.warn('Failed to parse destination policy', { error: e });
      }
    }
    
    // Add customer account if not already present
    if (!currentAccounts.includes(customerAwsAccountId)) {
      currentAccounts.push(customerAwsAccountId);
      
      const newPolicy = {
        Version: '2012-10-17',
        Statement: [{
          Sid: 'AllowCrossAccountSubscription',
          Effect: 'Allow',
          Principal: {
            AWS: currentAccounts
          },
          Action: 'logs:PutSubscriptionFilter',
          Resource: `arn:aws:logs:${region}:${EVO_ACCOUNT_ID}:destination:${EVO_WAF_DESTINATION_NAME}`
        }]
      };
      
      await evoLogsClient.send(new PutDestinationPolicyCommand({
        destinationName: EVO_WAF_DESTINATION_NAME,
        accessPolicy: JSON.stringify(newPolicy)
      }));
      
      logger.info('Updated destination policy to include customer account', { 
        customerAwsAccountId, 
        region,
        totalAccounts: currentAccounts.length 
      });
    } else {
      logger.info('Customer account already in destination policy', { customerAwsAccountId, region });
    }
  } catch (err: any) {
    // Log but don't fail - the subscription filter might still work if policy was set manually
    logger.warn('Failed to update destination policy', { 
      error: err.message, 
      customerAwsAccountId, 
      region 
    });
  }
}

/**
 * Get the CloudWatch Logs filter pattern based on filter mode
 */
function getFilterPattern(filterMode: LogFilterMode): string {
  switch (filterMode) {
    case 'block_only':
      // Only BLOCK and COUNT actions
      return '{ $.action = "BLOCK" || $.action = "COUNT" }';
    case 'all_requests':
      // All requests (empty pattern = everything)
      return '';
    case 'hybrid':
      // Same as block_only for subscription filter
      // ALLOW metrics will be collected via CloudWatch Metrics separately
      return '{ $.action = "BLOCK" || $.action = "COUNT" }';
    default:
      return '{ $.action = "BLOCK" || $.action = "COUNT" }';
  }
}

/**
 * Extract Web ACL name from ARN
 */
function extractWebAclName(webAclArn: string): string {
  // ARN format: arn:aws:wafv2:region:account:regional/webacl/name/id
  const parts = webAclArn.split('/');
  return parts[2] || 'unknown';
}

/**
 * Get the log group name for WAF logs
 */
function getLogGroupName(webAclName: string): string {
  // AWS WAF requires log group name to start with aws-waf-logs-
  return `aws-waf-logs-${webAclName}`;
}

/**
 * Get or create CloudWatch Logs role in customer account for cross-account subscription
 * This role allows CloudWatch Logs to send logs to EVO's destination
 * 
 * @param customerAwsAccountId - Customer's AWS account ID
 * @param region - AWS region
 * @param credentials - AWS credentials for customer account
 * @param account - AWS credential record with role_arn
 * @returns ARN of the CloudWatch Logs role
 */
async function getOrCreateCloudWatchLogsRole(
  customerAwsAccountId: string,
  region: string,
  credentials: any,
  account: { role_arn?: string | null }
): Promise<string> {
  const { IAMClient, GetRoleCommand, CreateRoleCommand, PutRolePolicyCommand } = await import('@aws-sdk/client-iam');
  
  const iamClient = new IAMClient({ region: 'us-east-1', credentials }); // IAM is global
  
  // FIXED role name - must match CloudFormation template exactly
  // CloudFormation creates: 'EVO-CloudWatch-Logs-Role' (fixed name, no suffix)
  const roleName = 'EVO-CloudWatch-Logs-Role';
  
  try {
    // Check if role exists
    await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
    logger.info('CloudWatch Logs role found', { roleName, customerAwsAccountId });
    return `arn:aws:iam::${customerAwsAccountId}:role/${roleName}`;
  } catch (err: any) {
    if (err.name !== 'NoSuchEntity') {
      throw err;
    }
  }
  
  // Role doesn't exist - try to create it automatically
  logger.info('CloudWatch Logs role not found, attempting to create', { 
    roleName, 
    customerAwsAccountId,
    destinationArn: getDestinationArn(region)
  });
  
  try {
    const assumeRolePolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { Service: 'logs.amazonaws.com' },
        Action: 'sts:AssumeRole'
      }]
    });
    
    await iamClient.send(new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: assumeRolePolicy,
      Description: 'Role for EVO WAF Monitoring cross-account log subscription',
      Tags: [
        { Key: 'ManagedBy', Value: 'EVO-Platform' },
        { Key: 'Purpose', Value: 'WAF-Monitoring' }
      ]
    }));
    
    // Add policy to send logs to EVO destination
    const policyDocument = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Action: ['logs:PutLogEvents'],
        Resource: `arn:aws:logs:*:${EVO_ACCOUNT_ID}:destination:${EVO_WAF_DESTINATION_NAME}`
      }]
    });
    
    await iamClient.send(new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: 'EVOWafLogDestinationAccess',
      PolicyDocument: policyDocument
    }));
    
    // CRITICAL: Wait for IAM propagation (10 seconds minimum)
    logger.info('Waiting for IAM role propagation...', { roleName });
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    logger.info('CloudWatch Logs role created successfully', { roleName, customerAwsAccountId });
    return `arn:aws:iam::${customerAwsAccountId}:role/${roleName}`;
    
  } catch (createErr: any) {
    // If we can't create the role, provide helpful error message
    logger.error('Failed to create CloudWatch Logs role', { 
      error: createErr.message,
      roleName,
      customerAwsAccountId 
    });
    
    throw new Error(
      `CloudWatch Logs role "${roleName}" not found and could not be created automatically. ` +
      `Please update your CloudFormation stack to the latest version. ` +
      `Go to AWS Console → CloudFormation → Select your EVO stack → Update → Use current template → Submit. ` +
      `The updated template will create this role automatically. ` +
      `Error: ${createErr.message}`
    );
  }
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationIdWithImpersonation(event, user);
  
  logger.info('WAF Setup Monitoring started', { 
    organizationId,
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { action, accountId, webAclArn, enabled, filterMode = 'block_only' } = body;
    
    const prisma = getPrismaClient();
    
    // Handle different actions
    if (action === 'list-wafs') {
      return await handleListWafs(prisma, organizationId, accountId);
    }
    
    if (action === 'get-configs') {
      return await handleGetConfigs(prisma, organizationId, accountId);
    }
    
    if (action === 'disable') {
      return await handleDisableConfig(prisma, organizationId, body.configId);
    }
    
    // Default: setup action
    // Validate required parameters
    if (!accountId) {
      return error('Missing required parameter: accountId');
    }
    if (!webAclArn) {
      return error('Missing required parameter: webAclArn');
    }
    
    // For setup action, enabled defaults to true if not specified
    const isEnabled = typeof enabled === 'boolean' ? enabled : true;
    
    // Validate filter mode
    if (!['block_only', 'all_requests', 'hybrid'].includes(filterMode)) {
      return error('Invalid filterMode. Must be: block_only, all_requests, or hybrid');
    }
    
    // Get AWS credentials for the customer account
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return error('AWS account not found');
    }
    
    // Determine region from Web ACL ARN
    const arnParts = webAclArn.split(':');
    const region = arnParts[3] || 'us-east-1';
    const scope = webAclArn.includes('/global/') ? 'CLOUDFRONT' : 'REGIONAL';
    const wafRegion = scope === 'CLOUDFRONT' ? 'us-east-1' : region;
    
    // Resolve credentials (assume role in customer account)
    const resolvedCreds = await resolveAwsCredentials(account, wafRegion);
    const credentials = toAwsCredentials(resolvedCreds);
    
    // Extract customer AWS account ID from role ARN or Web ACL ARN
    // Format: arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME
    // Or from Web ACL ARN: arn:aws:wafv2:region:ACCOUNT_ID:...
    let customerAwsAccountId = account.role_arn?.split(':')[4];
    if (!customerAwsAccountId) {
      // Try to get from Web ACL ARN
      customerAwsAccountId = webAclArn.split(':')[4];
    }
    if (!customerAwsAccountId) {
      return error('Could not determine AWS account ID');
    }
    
    // Create AWS clients for customer account
    const wafClient = new WAFV2Client({ region: wafRegion, credentials });
    const logsClient = new CloudWatchLogsClient({ region: wafRegion, credentials });
    
    const webAclName = extractWebAclName(webAclArn);
    const logGroupName = getLogGroupName(webAclName);
    
    if (isEnabled) {
      // ENABLE MONITORING
      const result = await enableWafMonitoring(
        wafClient,
        logsClient,
        webAclArn,
        webAclName,
        logGroupName,
        filterMode,
        wafRegion,
        customerAwsAccountId,
        account,
        organizationId,
        accountId,
        prisma,
        credentials
      );
      
      logger.info('WAF monitoring enabled', { 
        organizationId, 
        accountId, 
        webAclArn,
        filterMode,
        logGroupName 
      });
      
      return success(result);
    } else {
      // DISABLE MONITORING
      const result = await disableWafMonitoring(
        wafClient,
        logsClient,
        webAclArn,
        logGroupName,
        organizationId,
        prisma
      );
      
      logger.info('WAF monitoring disabled', { 
        organizationId, 
        accountId, 
        webAclArn 
      });
      
      return success(result);
    }
    
  } catch (err: any) {
    logger.error('WAF Setup Monitoring error', err as Error, { 
      organizationId,
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    
    const errName = err?.name || '';
    const errMsg = err?.message || '';
    
    // Handle specific AWS errors with meaningful responses
    if (errName === 'ResourceNotFoundException') {
      return error(
        `Resource not found in customer AWS account. The specified log group or WAF resource does not exist. Details: ${errMsg}`,
        404
      );
    }
    
    if (errName === 'AccessDeniedException' || errMsg.includes('Access denied')) {
      return error(
        `Access denied. The IAM role does not have sufficient permissions to configure WAF logging. ` +
        `Required permissions: wafv2:PutLoggingConfiguration, logs:CreateLogGroup, logs:PutResourcePolicy, logs:PutSubscriptionFilter. ` +
        `Details: ${errMsg}`,
        403
      );
    }
    
    if (errName === 'WAFNonexistentItemException') {
      return error(
        `The specified WAF Web ACL was not found. Please verify the Web ACL ARN is correct. Details: ${errMsg}`,
        404
      );
    }
    
    if (errName === 'WAFInvalidParameterException') {
      return error(
        `Invalid WAF parameter. Details: ${errMsg}`,
        400
      );
    }
    
    if (errName === 'InvalidParameterException' || errName === 'InvalidParameterValueException') {
      return error(
        `Invalid parameter in request. Details: ${errMsg}`,
        400
      );
    }
    
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

/**
 * Enable WAF monitoring for a Web ACL
 */
async function enableWafMonitoring(
  wafClient: WAFV2Client,
  logsClient: CloudWatchLogsClient,
  webAclArn: string,
  webAclName: string,
  logGroupName: string,
  filterMode: LogFilterMode,
  region: string,
  customerAwsAccountId: string,
  account: { role_arn?: string | null },
  organizationId: string,
  accountId: string,
  prisma: ReturnType<typeof getPrismaClient>,
  credentials: any
): Promise<SetupResult> {
  
  // Step 1: Check if WAF logging is already configured
  let loggingConfigured = false;
  try {
    const loggingConfig = await wafClient.send(new GetLoggingConfigurationCommand({
      ResourceArn: webAclArn,
    }));
    loggingConfigured = !!loggingConfig.LoggingConfiguration;
    logger.info('Existing WAF logging configuration found', { webAclArn, loggingConfigured });
  } catch (err: unknown) {
    const error = err as { name?: string };
    if (error.name !== 'WAFNonexistentItemException') {
      throw err;
    }
    // No logging configured yet - that's fine
  }
  
  // Step 2: Create CloudWatch Log Group if needed
  try {
    await logsClient.send(new CreateLogGroupCommand({
      logGroupName,
    }));
    logger.info('Created CloudWatch Log Group', { logGroupName });
  } catch (err: unknown) {
    const error = err as { name?: string };
    if (error.name !== 'ResourceAlreadyExistsException') {
      throw err;
    }
    // Log group already exists - that's fine
  }
  
  // Step 2.5: Add resource policy to allow WAF to write to the log group
  // This is REQUIRED for WAF logging to work
  try {
    const { PutResourcePolicyCommand } = await import('@aws-sdk/client-cloudwatch-logs');
    
    const policyName = `AWSWAFLogsPolicy-${logGroupName}`;
    const policyDocument = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: {
          Service: 'wafv2.amazonaws.com'
        },
        Action: [
          'logs:CreateLogStream',
          'logs:PutLogEvents'
        ],
        Resource: `arn:aws:logs:${region}:${customerAwsAccountId}:log-group:${logGroupName}:*`,
        Condition: {
          StringEquals: {
            'aws:SourceAccount': customerAwsAccountId
          },
          ArnLike: {
            'aws:SourceArn': `arn:aws:wafv2:${region}:${customerAwsAccountId}:*`
          }
        }
      }]
    });
    
    await logsClient.send(new PutResourcePolicyCommand({
      policyName,
      policyDocument
    }));
    
    logger.info('Added CloudWatch Logs resource policy for WAF', { 
      logGroupName, 
      policyName 
    });
  } catch (err: any) {
    logger.warn('Failed to add CloudWatch Logs resource policy', { 
      error: err.message,
      logGroupName 
    });
    // Continue anyway - the policy might already exist
  }
  
  // Step 3: Enable WAF logging to CloudWatch Logs
  if (!loggingConfigured) {
    const logDestination = `arn:aws:logs:${webAclArn.split(':')[3]}:${webAclArn.split(':')[4]}:log-group:${logGroupName}`;
    
    try {
      await wafClient.send(new PutLoggingConfigurationCommand({
        LoggingConfiguration: {
          ResourceArn: webAclArn,
          LogDestinationConfigs: [logDestination],
          // Optional: Add log filter for specific fields
          LoggingFilter: filterMode === 'block_only' ? {
            DefaultBehavior: 'DROP',
            Filters: [
              {
                Behavior: 'KEEP',
                Requirement: 'MEETS_ANY',
                Conditions: [
                  { ActionCondition: { Action: 'BLOCK' } },
                  { ActionCondition: { Action: 'COUNT' } },
                ],
              },
            ],
          } : undefined,
        },
      }));
      logger.info('Enabled WAF logging', { webAclArn, logDestination });
    } catch (err: any) {
      logger.error('Failed to enable WAF logging', err, { 
        webAclArn, 
        logDestination,
        errorName: err.name,
        errorMessage: err.message 
      });
      // Re-throw with original error name preserved for handler-level error mapping
      throw err;
    }
  }
  
  // Step 4: Create or update subscription filter to send logs to EVO Lambda
  const filterPattern = getFilterPattern(filterMode);
  
  // First, check if subscription filter already exists
  try {
    const existingFilters = await logsClient.send(new DescribeSubscriptionFiltersCommand({
      logGroupName,
      filterNamePrefix: SUBSCRIPTION_FILTER_NAME,
    }));
    
    if (existingFilters.subscriptionFilters && existingFilters.subscriptionFilters.length > 0) {
      // Delete existing filter to update it
      await logsClient.send(new DeleteSubscriptionFilterCommand({
        logGroupName,
        filterName: SUBSCRIPTION_FILTER_NAME,
      }));
      logger.info('Deleted existing subscription filter', { logGroupName });
    }
  } catch (err: unknown) {
    const error = err as { name?: string };
    if (error.name !== 'ResourceNotFoundException') {
      throw err;
    }
  }
  
  // Create new subscription filter using CloudWatch Logs Destination (required for cross-account)
  const destinationArn = getDestinationArn(region);
  
  // IMPORTANT: Update destination policy in EVO account to allow this customer account
  // This must be done BEFORE creating the subscription filter
  await updateDestinationPolicyForCustomer(customerAwsAccountId, region);
  
  // Get or create the CloudWatch Logs role in customer account
  const cloudWatchLogsRoleArn = await getOrCreateCloudWatchLogsRole(
    customerAwsAccountId,
    region,
    credentials,
    account
  );
  
  await logsClient.send(new PutSubscriptionFilterCommand({
    logGroupName,
    filterName: SUBSCRIPTION_FILTER_NAME,
    filterPattern,
    destinationArn,
    roleArn: cloudWatchLogsRoleArn,
  }));
  logger.info('Created subscription filter', { logGroupName, filterPattern, destinationArn, region, roleArn: cloudWatchLogsRoleArn });
  
  // Step 5: Save configuration to database
  await prisma.wafMonitoringConfig.upsert({
    where: {
      organization_id_web_acl_arn: {
        organization_id: organizationId,
        web_acl_arn: webAclArn,
      },
    },
    create: {
      organization_id: organizationId,
      aws_account_id: accountId,
      web_acl_arn: webAclArn,
      web_acl_name: webAclName,
      log_group_name: logGroupName,
      subscription_filter: SUBSCRIPTION_FILTER_NAME,
      filter_mode: filterMode,
      is_active: true,
    },
    update: {
      aws_account_id: accountId,
      web_acl_name: webAclName,
      log_group_name: logGroupName,
      subscription_filter: SUBSCRIPTION_FILTER_NAME,
      filter_mode: filterMode,
      is_active: true,
      updated_at: new Date(),
    },
  });
  
  return {
    success: true,
    logGroupName,
    subscriptionFilterName: SUBSCRIPTION_FILTER_NAME,
    filterMode,
    message: `WAF monitoring enabled for ${webAclName} with filter mode: ${filterMode}`,
  };
}

/**
 * Disable WAF monitoring for a Web ACL
 */
async function disableWafMonitoring(
  wafClient: WAFV2Client,
  logsClient: CloudWatchLogsClient,
  webAclArn: string,
  logGroupName: string,
  organizationId: string,
  prisma: ReturnType<typeof getPrismaClient>
): Promise<SetupResult> {
  
  // Step 1: Delete subscription filter
  try {
    await logsClient.send(new DeleteSubscriptionFilterCommand({
      logGroupName,
      filterName: SUBSCRIPTION_FILTER_NAME,
    }));
    logger.info('Deleted subscription filter', { logGroupName });
  } catch (err: unknown) {
    const error = err as { name?: string };
    if (error.name !== 'ResourceNotFoundException') {
      throw err;
    }
    // Filter doesn't exist - that's fine
  }
  
  // Step 2: Optionally disable WAF logging (keep it for customer's own use)
  // We don't delete the WAF logging configuration as the customer might want to keep it
  
  // Step 3: Update database
  await prisma.wafMonitoringConfig.updateMany({
    where: {
      organization_id: organizationId,
      web_acl_arn: webAclArn,
    },
    data: {
      is_active: false,
      subscription_filter: null,
      updated_at: new Date(),
    },
  });
  
  return {
    success: true,
    logGroupName,
    subscriptionFilterName: SUBSCRIPTION_FILTER_NAME,
    filterMode: 'block_only',
    message: `WAF monitoring disabled for ${extractWebAclName(webAclArn)}`,
  };
}


/**
 * List available WAFs in customer account
 */
async function handleListWafs(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string,
  accountId: string
): Promise<APIGatewayProxyResultV2> {
  if (!accountId) {
    return error('Missing required parameter: accountId');
  }
  
  // Get AWS credentials for the customer account
  const account = await prisma.awsCredential.findFirst({
    where: { id: accountId, organization_id: organizationId, is_active: true },
  });
  
  if (!account) {
    return error('AWS account not found');
  }
  
  // Scan ALL supported regions to find WAFs
  // account.regions may be empty, incomplete, or not include WAF regions
  // Use parallel scanning for performance (20 regions in ~2-3s instead of ~20s sequential)
  const regions = [...SUPPORTED_REGIONS];
  
  const allWebAcls: any[] = [];
  
  // First: Always scan CLOUDFRONT WAFs from us-east-1 (they are global)
  try {
    const globalCreds = await resolveAwsCredentials(account, 'us-east-1');
    const globalCredentials = toAwsCredentials(globalCreds);
    const globalWafClient = new WAFV2Client({ region: 'us-east-1', credentials: globalCredentials });
    
    try {
      const cloudfrontWafs = await globalWafClient.send(new ListWebACLsCommand({
        Scope: 'CLOUDFRONT',
      }));
      
      if (cloudfrontWafs.WebACLs) {
        allWebAcls.push(...cloudfrontWafs.WebACLs.map(waf => ({
          ...waf,
          Scope: 'CLOUDFRONT',
          Region: 'global',
        })));
      }
    } catch (err) {
      logger.warn('Failed to list CLOUDFRONT WAFs', { error: err });
    }
  } catch (err) {
    logger.warn('Failed to get credentials for us-east-1 (CLOUDFRONT WAFs)', { error: err });
  }
  
  // Second: Scan REGIONAL WAFs in ALL regions in parallel
  const regionalResults = await Promise.allSettled(
    regions.map(async (region) => {
      const resolvedCreds = await resolveAwsCredentials(account, region);
      const credentials = toAwsCredentials(resolvedCreds);
      const wafClient = new WAFV2Client({ region, credentials });
      
      const regionalWafs = await wafClient.send(new ListWebACLsCommand({
        Scope: 'REGIONAL',
      }));
      
      return (regionalWafs.WebACLs || []).map(waf => ({
        ...waf,
        Scope: 'REGIONAL',
        Region: region,
      }));
    })
  );
  
  for (const result of regionalResults) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      allWebAcls.push(...result.value);
    } else if (result.status === 'rejected') {
      logger.warn('Failed to scan region for WAFs', { error: result.reason });
    }
  }
  
  // Get existing configs to mark which WAFs are already monitored
  const existingConfigs = await prisma.wafMonitoringConfig.findMany({
    where: { organization_id: organizationId, is_active: true },
    select: { web_acl_arn: true },
  });
  
  const monitoredArns = new Set(existingConfigs.map(c => c.web_acl_arn));
  
  const wafsWithStatus = allWebAcls.map(waf => ({
    ...waf,
    isMonitored: monitoredArns.has(waf.ARN),
  }));
  
  logger.info('Listed WAFs', { organizationId, count: wafsWithStatus.length, regionsScanned: regions });
  
  return success({ webAcls: wafsWithStatus, regionsScanned: regions });
}

/**
 * Get existing WAF monitoring configurations
 */
async function handleGetConfigs(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string,
  accountId?: string
): Promise<APIGatewayProxyResultV2> {
  const where: any = { organization_id: organizationId };
  
  if (accountId) {
    where.aws_account_id = accountId;
  }
  
  const configs = await prisma.wafMonitoringConfig.findMany({
    where,
    orderBy: { created_at: 'desc' },
  });
  
  return success({ configs });
}

/**
 * Disable a specific WAF monitoring configuration
 */
async function handleDisableConfig(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string,
  configId: string
): Promise<APIGatewayProxyResultV2> {
  if (!configId) {
    return error('Missing required parameter: configId');
  }
  
  const config = await prisma.wafMonitoringConfig.findFirst({
    where: { id: configId, organization_id: organizationId },
  });
  
  if (!config) {
    return error('Configuration not found');
  }
  
  // Get AWS credentials
  const account = await prisma.awsCredential.findFirst({
    where: { id: config.aws_account_id, organization_id: organizationId, is_active: true },
  });
  
  if (account) {
    try {
      // Determine region from Web ACL ARN
      const arnParts = config.web_acl_arn.split(':');
      const region = arnParts[3] || 'us-east-1';
      
      const resolvedCreds = await resolveAwsCredentials(account, region);
      const credentials = toAwsCredentials(resolvedCreds);
      const logsClient = new CloudWatchLogsClient({ region, credentials });
      
      // Delete subscription filter
      try {
        await logsClient.send(new DeleteSubscriptionFilterCommand({
          logGroupName: config.log_group_name,
          filterName: SUBSCRIPTION_FILTER_NAME,
        }));
        logger.info('Deleted subscription filter', { logGroupName: config.log_group_name });
      } catch (err: unknown) {
        const e = err as { name?: string };
        if (e.name !== 'ResourceNotFoundException') {
          logger.warn('Failed to delete subscription filter', { error: err });
        }
      }
    } catch (err) {
      logger.warn('Failed to cleanup AWS resources', { error: err });
    }
  }
  
  // Update database
  await prisma.wafMonitoringConfig.update({
    where: { id: configId },
    data: {
      is_active: false,
      subscription_filter: null,
      updated_at: new Date(),
    },
  });
  
  return success({ message: 'WAF monitoring disabled' });
}
