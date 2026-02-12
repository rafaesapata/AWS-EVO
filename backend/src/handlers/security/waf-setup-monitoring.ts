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
import { success, error, corsOptions, safeHandler } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logger.js';
import { ensureNotDemoMode } from '../../lib/demo-data-service.js';
import { 
  WAFV2Client, 
  GetLoggingConfigurationCommand,
  PutLoggingConfigurationCommand,
  ListWebACLsCommand,
  GetWebACLCommand,
} from '@aws-sdk/client-wafv2';
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  PutResourcePolicyCommand,
  PutSubscriptionFilterCommand,
  DeleteSubscriptionFilterCommand,
  DescribeSubscriptionFiltersCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { IAMClient, SimulatePrincipalPolicyCommand, GetRoleCommand, CreateRoleCommand, PutRolePolicyCommand, UpdateAssumeRolePolicyCommand } from '@aws-sdk/client-iam';

// Filter modes for WAF log collection
type LogFilterMode = 'block_only' | 'all_requests' | 'hybrid';
const VALID_FILTER_MODES: readonly LogFilterMode[] = ['block_only', 'all_requests', 'hybrid'] as const;

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
const EVO_WAF_DESTINATION_NAME = 'evo-uds-v3-production-waf-logs-destination';
const EVO_ACCOUNT_ID = '523115032346';

// CloudWatch Logs role name — must match CloudFormation template exactly
const CLOUDWATCH_LOGS_ROLE_NAME = 'EVO-CloudWatch-Logs-Role';

// Retry configuration for PutSubscriptionFilter (destination policy propagation)
const SUBSCRIPTION_FILTER_MAX_RETRIES = 3;
const SUBSCRIPTION_FILTER_RETRY_DELAY_MS = 5000;
const POLICY_PROPAGATION_DELAY_MS = 3000;
const IAM_PROPAGATION_DELAY_MS = 10000;
const TRUST_POLICY_PROPAGATION_DELAY_MS = 5000;
const AUTO_REMEDIATION_DELAY_MS = 5000;

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
 * Get the destination ARN for a specific region.
 * 
 * IMPORTANT: The destination must exist in the same region as the log group.
 * Currently the destination stack is only deployed in us-east-1.
 * For WAFs in other regions, the destination must be deployed there first.
 * Use cloudformation/waf-logs-destination-stack.yaml to deploy to additional regions.
 */
function getDestinationArn(region: string): string {
  return `arn:aws:logs:${region}:${EVO_ACCOUNT_ID}:destination:${EVO_WAF_DESTINATION_NAME}`;
}

// Subscription filter name
const SUBSCRIPTION_FILTER_NAME = 'evo-waf-monitoring';

// CloudFormation update instruction (single source of truth for all error messages)
const CF_TEMPLATE_URL = 'https://evo.nuevacore.com/cloudformation/evo-platform-role.yaml';
const CF_UPDATE_INSTRUCTION = 
  `AWS Console → CloudFormation → Select the EVO Platform stack → Update → ` +
  `Replace current template → Use URL: ${CF_TEMPLATE_URL} → Next → Submit.`;

/** Create a named Error for consistent error handling in the outer catch block */
function createPermissionError(message: string, name: 'AccessDeniedException' | 'WAFPermissionPreFlightError' = 'AccessDeniedException'): Error {
  const err = new Error(message);
  (err as any).name = name;
  return err;
}

/** Check if an error is an AWS access denied error */
function isAccessDenied(err: { name?: string; message?: string }): boolean {
  return err.name === 'AccessDeniedException' || !!err.message?.includes('is not authorized');
}

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
): Promise<boolean> {
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
      logger.warn('Destination not found in region', { 
        destinationName: EVO_WAF_DESTINATION_NAME, 
        region 
      });
      return false;
    }
    
    // Parse current policy
    let currentAccounts: string[] = [EVO_ACCOUNT_ID];
    if (destination.accessPolicy) {
      try {
        const policy = JSON.parse(destination.accessPolicy);
        const stmt = policy.Statement?.[0];
        const principal = stmt?.Principal;
        
        // Handle different Principal formats:
        // 1. { AWS: ["account1", "account2"] } — our format
        // 2. { AWS: "account1" } — single account
        // 3. "*" — wildcard (original CloudFormation stack uses this with Condition)
        if (principal?.AWS) {
          if (Array.isArray(principal.AWS)) {
            currentAccounts = principal.AWS;
          } else if (typeof principal.AWS === 'string') {
            currentAccounts = [principal.AWS];
          }
        }
        // If Principal is "*" (wildcard), we keep our default [EVO_ACCOUNT_ID]
        // and will replace the policy with explicit account list
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
      
      // Wait for policy propagation before PutSubscriptionFilter
      await new Promise(resolve => setTimeout(resolve, POLICY_PROPAGATION_DELAY_MS));
    } else {
      logger.info('Customer account already in destination policy', { customerAwsAccountId, region });
    }
    return true;
  } catch (err: any) {
    // Log but don't fail - the subscription filter might still work if policy was set manually
    logger.warn('Failed to update destination policy', { 
      error: err.message, 
      customerAwsAccountId, 
      region 
    });
    return false;
  }
}

/**
 * Get the CloudWatch Logs filter pattern based on filter mode
 */
function getFilterPattern(filterMode: LogFilterMode): string {
  if (filterMode === 'all_requests') return '';
  // block_only, hybrid, and default all use the same BLOCK/COUNT filter
  return '{ $.action = "BLOCK" || $.action = "COUNT" }';
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
  const iamClient = new IAMClient({ region: 'us-east-1', credentials }); // IAM is global
  
  // FIXED role name - must match CloudFormation template exactly
  const roleName = CLOUDWATCH_LOGS_ROLE_NAME;
  
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
        Principal: { Service: `logs.${region}.amazonaws.com` },
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
    
    // CRITICAL: Wait for IAM propagation
    logger.info('Waiting for IAM role propagation...', { roleName });
    await new Promise(resolve => setTimeout(resolve, IAM_PROPAGATION_DELAY_MS));
    
    logger.info('CloudWatch Logs role created successfully', { roleName, customerAwsAccountId });
    return `arn:aws:iam::${customerAwsAccountId}:role/${roleName}`;
    
  } catch (createErr: any) {
    // If we can't create the role, provide helpful error message
    logger.error('Failed to create CloudWatch Logs role', { 
      error: createErr.message,
      errorName: createErr.name,
      roleName,
      customerAwsAccountId 
    });
    
    if (isAccessDenied(createErr)) {
      throw createPermissionError(
        `Cannot create CloudWatch Logs role "${roleName}" — the IAM role does not have iam:CreateRole permission. ` +
        `This role is normally created by the CloudFormation stack. ` +
        `Please update your CloudFormation stack using "Replace current template" (not "Use current template"): ${CF_UPDATE_INSTRUCTION} ` +
        `This will create the required "${roleName}" automatically.`,
        'WAFPermissionPreFlightError'
      );
    }
    
    throw new Error(
      `CloudWatch Logs role "${roleName}" not found and could not be created automatically. ` +
      `Please update your CloudFormation stack: ${CF_UPDATE_INSTRUCTION} ` +
      `The updated template will create this role automatically. ` +
      `Error: ${createErr.message}`
    );
  }
}

export const handler = safeHandler(async (
  event: AuthorizedEvent,
  context: LambdaContext
) => {
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
    
    // SECURITY: Block write operations in demo mode (disable, setup, test-setup)
    const demoCheck = await ensureNotDemoMode(prisma, organizationId);
    if (demoCheck.blocked) return demoCheck.response;
    
    if (action === 'disable') {
      return await handleDisableConfig(prisma, organizationId, body.configId);
    }
    
    if (action === 'test-setup') {
      return await handleTestSetup(prisma, organizationId, body);
    }
    
    // Default: setup action
    // Validate required parameters
    if (!accountId) {
      return error('Missing required parameter: accountId', 400);
    }
    if (!webAclArn) {
      return error('Missing required parameter: webAclArn', 400);
    }
    
    // For setup action, enabled defaults to true if not specified
    const isEnabled = typeof enabled === 'boolean' ? enabled : true;
    
    // Validate filter mode
    if (!VALID_FILTER_MODES.includes(filterMode)) {
      return error(`Invalid filterMode. Must be: ${VALID_FILTER_MODES.join(', ')}`);
    }
    
    // Get AWS credentials for the customer account
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return error('AWS account not found', 404);
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
      return error('Could not determine AWS account ID', 400);
    }
    
    // Create AWS clients for customer account
    const wafClient = new WAFV2Client({ region: wafRegion, credentials });
    const logsClient = new CloudWatchLogsClient({ region: wafRegion, credentials });
    
    const webAclName = extractWebAclName(webAclArn);
    const logGroupName = getLogGroupName(webAclName);
    
    if (isEnabled) {
      // ENABLE MONITORING
      const result = await enableWafMonitoring({
        wafClient,
        logsClient,
        webAclArn,
        webAclName,
        logGroupName,
        filterMode,
        region: wafRegion,
        customerAwsAccountId,
        account,
        organizationId,
        accountId,
        prisma,
        credentials,
      });
      
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
    
    // Handle pre-flight permission check failure — provides actionable CloudFormation update instructions
    // Use 422 instead of 403 to avoid frontend interpreting as auth error and triggering token refresh
    if (errName === 'WAFPermissionPreFlightError') {
      return error(errMsg, 422);
    }
    
    // Handle specific AWS errors with meaningful responses
    if (errName === 'ResourceNotFoundException') {
      return error(
        `Resource not found in customer AWS account. The specified log group or WAF resource does not exist. Details: ${errMsg}`,
        404
      );
    }
    
    if (isAccessDenied({ name: errName, message: errMsg })) {
      // Use 422 instead of 403 to avoid frontend interpreting as auth error and triggering token refresh
      logger.error('WAF setup AccessDenied (pre-flight may have been skipped)', {
        organizationId,
        userId: user.sub,
        errName,
        errMsg,
      });
      
      return error(
        `Access denied. The IAM role does not have sufficient permissions to configure WAF logging. ` +
        `This usually means the CloudFormation stack needs to be updated. ${CF_UPDATE_INSTRUCTION} ` +
        `Missing permissions: wafv2:PutLoggingConfiguration, logs:CreateLogGroup, logs:PutResourcePolicy, logs:PutSubscriptionFilter. ` +
        `Details: ${errMsg}`,
        422
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
});

// Required IAM permissions for WAF monitoring setup
const WAF_MONITORING_REQUIRED_PERMISSIONS = [
  'wafv2:GetWebACL',
  'wafv2:GetLoggingConfiguration',
  'wafv2:PutLoggingConfiguration',
  'logs:CreateLogGroup',
  'logs:PutResourcePolicy',
  'logs:DescribeResourcePolicies',
  'logs:PutSubscriptionFilter',
  'logs:DescribeSubscriptionFilters',
  'logs:DeleteSubscriptionFilter',
  'logs:PutRetentionPolicy',
];

// Permissions scoped to aws-waf-logs-* log groups in the CloudFormation template.
// SimulatePrincipalPolicy returns implicitDeny for these when tested with Resource: *,
// so they must be simulated with matching resource ARNs.
const LOGS_SCOPED_PERMISSIONS = [
  'logs:CreateLogGroup',
  'logs:PutSubscriptionFilter',
  'logs:DeleteSubscriptionFilter',
  'logs:DescribeSubscriptionFilters',
  'logs:PutRetentionPolicy',
];

// Permissions that use Resource: * in the CloudFormation template
const GLOBAL_PERMISSIONS = WAF_MONITORING_REQUIRED_PERMISSIONS.filter(
  p => !LOGS_SCOPED_PERMISSIONS.includes(p)
);

/**
 * Pre-flight validation of IAM permissions for WAF monitoring.
 * Uses IAM SimulatePrincipalPolicy to check if the customer's IAM role
 * has all required permissions BEFORE attempting any operations.
 * 
 * If permissions are missing, attempts auto-remediation by adding an inline policy
 * to the customer's role (requires SelfUpdate policy from template v2.5.0+).
 * If auto-remediation succeeds, re-validates and continues.
 * If auto-remediation fails, throws an actionable error with CloudFormation update instructions.
 */
async function validateWafPermissions(
  credentials: any,
  region: string,
  customerAwsAccountId: string,
  account: { role_arn?: string | null }
): Promise<void> {
  const roleArn = account.role_arn;
  if (!roleArn) {
    logger.warn('No role_arn available for permission pre-flight check, skipping validation');
    return;
  }
  
  const iamClient = new IAMClient({ region: 'us-east-1', credentials });
  
  const checkPermissions = async (): Promise<string[]> => {
    const logGroupArn = `arn:aws:logs:${region}:${customerAwsAccountId}:log-group:aws-waf-logs-*`;
    
    const [globalResult, scopedResult] = await Promise.all([
      iamClient.send(new SimulatePrincipalPolicyCommand({
        PolicySourceArn: roleArn,
        ActionNames: GLOBAL_PERMISSIONS,
        ResourceArns: ['*'],
      })),
      iamClient.send(new SimulatePrincipalPolicyCommand({
        PolicySourceArn: roleArn,
        ActionNames: LOGS_SCOPED_PERMISSIONS,
        ResourceArns: [logGroupArn],
      })),
    ]);
    
    const denied = [
      ...(globalResult.EvaluationResults || []),
      ...(scopedResult.EvaluationResults || []),
    ]
      .filter(r => r.EvalDecision !== 'allowed')
      .map(r => r.EvalActionName!);
    
    return denied;
  };
  
  try {
    let denied = await checkPermissions();
    
    if (denied.length > 0) {
      logger.warn('WAF monitoring permission pre-flight check failed, attempting auto-remediation', { 
        roleArn, 
        deniedPermissions: denied,
        customerAwsAccountId 
      });
      
      // Attempt auto-remediation: add missing permissions as inline policy
      const remediated = await tryAutoRemediateWafPermissions(
        credentials, customerAwsAccountId, roleArn, region
      );
      
      if (remediated) {
        // Re-validate after auto-remediation
        logger.info('Auto-remediation succeeded, re-validating permissions');
        denied = await checkPermissions();
        
        if (denied.length === 0) {
          logger.info('WAF monitoring permission pre-flight check passed after auto-remediation', { 
            roleArn, customerAwsAccountId 
          });
          return; // All good now
        }
        
        logger.warn('Some permissions still denied after auto-remediation', { 
          roleArn, stillDenied: denied 
        });
      }
      
      // Auto-remediation failed or insufficient — throw actionable error
      logger.error('WAF monitoring permission pre-flight check failed (auto-remediation did not resolve)', { 
        roleArn, deniedPermissions: denied, customerAwsAccountId 
      });
      
      const err = createPermissionError(
        `The IAM role is missing permissions required for WAF monitoring: ${denied.join(', ')}. ` +
        `Automatic permission fix was attempted but could not resolve all issues. ` +
        `Please update the CloudFormation stack: ${CF_UPDATE_INSTRUCTION} ` +
        `The updated template (v2.5.0+) includes all required WAF monitoring permissions and enables automatic fixes.`,
        'WAFPermissionPreFlightError'
      );
      throw err;
    }
    
    logger.info('WAF monitoring permission pre-flight check passed', { 
      roleArn, 
      checkedPermissions: WAF_MONITORING_REQUIRED_PERMISSIONS.length 
    });
  } catch (err: any) {
    // If it's our own pre-flight error, re-throw it
    if (err.name === 'WAFPermissionPreFlightError') {
      throw err;
    }
    
    // If SimulatePrincipalPolicy itself fails (e.g., no iam:SimulateCustomPolicy permission),
    // log a warning but continue — the actual operations will fail with specific errors
    logger.warn('WAF permission pre-flight check could not be performed (non-blocking)', { 
      error: err.message,
      errorName: err.name,
      roleArn 
    });
  }
}

/**
 * Auto-remediate missing WAF permissions on the customer's IAM role.
 * Adds an inline policy with wafv2:PutLoggingConfiguration and wafv2:DeleteLoggingConfiguration.
 * 
 * This works for customers whose CloudFormation stack includes the SelfUpdate policy (v2.5.0+),
 * which grants iam:PutRolePolicy on the role itself.
 * For older stacks, this will fail gracefully and the user will see the CloudFormation update message.
 * 
 * @returns true if remediation succeeded, false if it failed
 */
async function tryAutoRemediateWafPermissions(
  credentials: any,
  customerAwsAccountId: string,
  roleArn: string,
  region: string
): Promise<boolean> {
  try {
    const iamClient = new IAMClient({ region: 'us-east-1', credentials });
    
    // Extract role name from ARN: arn:aws:iam::ACCOUNT:role/ROLE_NAME
    const roleName = roleArn.split('/').pop();
    if (!roleName) {
      logger.warn('Could not extract role name from ARN', { roleArn });
      return false;
    }
    
    const policyDocument = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'WAFLoggingConfiguration',
          Effect: 'Allow',
          Action: [
            'wafv2:PutLoggingConfiguration',
            'wafv2:DeleteLoggingConfiguration',
            'wafv2:GetLoggingConfiguration',
            'wafv2:ListLoggingConfigurations',
          ],
          Resource: '*',
        },
        {
          Sid: 'CloudWatchLogsWAF',
          Effect: 'Allow',
          Action: [
            'logs:CreateLogGroup',
            'logs:PutSubscriptionFilter',
            'logs:DeleteSubscriptionFilter',
            'logs:DescribeSubscriptionFilters',
            'logs:PutRetentionPolicy',
            'logs:PutResourcePolicy',
            'logs:DescribeResourcePolicies',
            'logs:DeleteResourcePolicy',
          ],
          Resource: '*',
        },
      ],
    });
    
    await iamClient.send(new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: 'EVO-WAF-Monitoring-AutoFix',
      PolicyDocument: policyDocument,
    }));
    
    logger.info('Auto-remediation: added WAF monitoring permissions to customer role', {
      roleName, customerAwsAccountId,
    });
    
    // Wait for IAM propagation
    await new Promise(resolve => setTimeout(resolve, AUTO_REMEDIATION_DELAY_MS));
    
    return true;
  } catch (err: any) {
    logger.warn('Auto-remediation failed (customer stack may be older than v2.5.0)', {
      error: err.message,
      errorName: err.name,
      roleArn,
    });
    return false;
  }
}

/** Context object for enableWafMonitoring to avoid long parameter lists */
interface WafMonitoringContext {
  wafClient: WAFV2Client;
  logsClient: CloudWatchLogsClient;
  webAclArn: string;
  webAclName: string;
  logGroupName: string;
  filterMode: LogFilterMode;
  region: string;
  customerAwsAccountId: string;
  account: { role_arn?: string | null };
  organizationId: string;
  accountId: string;
  prisma: ReturnType<typeof getPrismaClient>;
  credentials: any;
}

/**
 * Verify and auto-fix the EVO-CloudWatch-Logs-Role trust policy to include the regional logs service.
 * Non-blocking — logs warnings but does not throw on failure.
 */
async function ensureRegionalTrustPolicy(
  credentials: any,
  region: string,
  roleArn: string
): Promise<void> {
  try {
    const iamClient = new IAMClient({ region: 'us-east-1', credentials });
    const roleInfo = await iamClient.send(new GetRoleCommand({ 
      RoleName: CLOUDWATCH_LOGS_ROLE_NAME 
    }));
    const trustPolicy = roleInfo.Role?.AssumeRolePolicyDocument 
      ? decodeURIComponent(roleInfo.Role.AssumeRolePolicyDocument) 
      : '';
    const regionalService = `logs.${region}.amazonaws.com`;
    const hasRegionalTrust = trustPolicy.includes(regionalService) || trustPolicy.includes('logs.amazonaws.com');
    
    logger.info('CloudWatch Logs role trust policy check', { 
      region, regionalService, hasRegionalTrust, roleArn,
    });
    
    if (hasRegionalTrust) return;
    
    logger.warn('CloudWatch Logs role missing regional trust, attempting auto-fix', { 
      region, regionalService,
    });
    
    try {
      const currentPolicy = JSON.parse(trustPolicy);
      const stmt = currentPolicy.Statement?.[0];
      if (stmt?.Principal?.Service) {
        const services = Array.isArray(stmt.Principal.Service) 
          ? stmt.Principal.Service 
          : [stmt.Principal.Service];
        if (!services.includes(regionalService)) {
          services.push(regionalService);
          stmt.Principal.Service = services;
          await iamClient.send(new UpdateAssumeRolePolicyCommand({
            RoleName: CLOUDWATCH_LOGS_ROLE_NAME,
            PolicyDocument: JSON.stringify(currentPolicy),
          }));
          logger.info('Updated trust policy to include regional service', { region, regionalService });
          await new Promise(resolve => setTimeout(resolve, TRUST_POLICY_PROPAGATION_DELAY_MS));
        }
      }
    } catch (updateErr: any) {
      logger.warn('Could not update trust policy (non-blocking)', { 
        error: updateErr.message, region,
      });
    }
  } catch (verifyErr: any) {
    logger.warn('Could not verify CloudWatch Logs role trust policy (non-blocking)', { 
      error: verifyErr.message,
    });
  }
}

/**
 * Enable WAF monitoring for a Web ACL
 */
async function enableWafMonitoring(ctx: WafMonitoringContext): Promise<SetupResult> {
  const {
    wafClient, logsClient, webAclArn, webAclName, logGroupName,
    filterMode, region, customerAwsAccountId, account,
    organizationId, accountId, prisma, credentials,
  } = ctx;
  
  // PRE-FLIGHT: Validate IAM permissions before attempting any operations
  // This catches outdated CloudFormation stacks that lack WAF monitoring permissions
  logger.info('WAF setup step: PRE-FLIGHT starting', { 
    organizationId, webAclArn, region, customerAwsAccountId, 
    hasRoleArn: !!account.role_arn, roleArn: account.role_arn 
  });
  await validateWafPermissions(credentials, region, customerAwsAccountId, account);
  logger.info('WAF setup step: PRE-FLIGHT passed', { organizationId, webAclArn });
  
  // Step 0: VALIDATE that the WAF Web ACL exists BEFORE doing anything
  // This prevents creating resources for non-existent WAFs
  try {
    // Extract Web ACL ID and scope from ARN
    // ARN format: arn:aws:wafv2:region:account:regional/webacl/name/id
    // or: arn:aws:wafv2:region:account:global/webacl/name/id
    const arnParts = webAclArn.split(':');
    if (arnParts.length < 6) {
      throw new Error(`Invalid WAF Web ACL ARN format: ${webAclArn}`);
    }
    
    // The last part contains: scope/webacl/name/id
    const resourcePart = arnParts[5]; // e.g., "regional/webacl/my-waf/abc123"
    const resourceParts = resourcePart.split('/');
    
    if (resourceParts.length < 4) {
      throw new Error(`Invalid WAF Web ACL ARN resource format: ${webAclArn}`);
    }
    
    const scope = resourceParts[0] === 'global' ? 'CLOUDFRONT' : 'REGIONAL';
    const webAclNameFromArn = resourceParts[2]; // Name
    const webAclId = resourceParts[3]; // ID
    
    logger.info('Validating WAF Web ACL exists', { 
      webAclArn, 
      webAclId, 
      webAclName: webAclNameFromArn,
      scope 
    });
    
    await wafClient.send(new GetWebACLCommand({
      Name: webAclNameFromArn,
      Scope: scope,
      Id: webAclId,
    }));
    
    logger.info('WAF Web ACL validated successfully', { webAclArn });
    
  } catch (err: any) {
    logger.error('WAF Web ACL validation failed', { 
      webAclArn,
      errorName: err.name,
      errorMessage: err.message 
    });
    
    if (err.name === 'WAFNonexistentItemException') {
      throw new Error(
        `The specified WAF Web ACL does not exist in the customer's AWS account. ` +
        `Please verify the Web ACL ARN is correct and the Web ACL exists in the account. ` +
        `ARN provided: ${webAclArn}`
      );
    }
    
    // Re-throw other errors
    throw err;
  }
  
  // Step 1: Check if WAF logging is already configured
  logger.info('WAF setup step 1: checking existing logging config', { organizationId, webAclArn });
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
  logger.info('WAF setup step 2: creating log group', { organizationId, logGroupName });
  try {
    await logsClient.send(new CreateLogGroupCommand({
      logGroupName,
    }));
    logger.info('Created CloudWatch Log Group', { logGroupName });
  } catch (err: unknown) {
    const error = err as { name?: string; message?: string };
    if (error.name === 'ResourceAlreadyExistsException') {
      // Log group already exists - that's fine
    } else if (isAccessDenied(error)) {
      logger.error('AccessDenied on CreateLogGroup', { error: error.message, logGroupName });
      throw createPermissionError(
        `The IAM role is missing the logs:CreateLogGroup permission required for WAF monitoring. ` +
        `Please update your CloudFormation stack: ${CF_UPDATE_INSTRUCTION}`
      );
    } else {
      throw err;
    }
  }
  
  // Step 2.5: Add resource policy to allow WAF to write to the log group
  logger.info('WAF setup step 2.5: adding resource policy', { organizationId, logGroupName });
  // This is REQUIRED for WAF logging to work
  try {
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
    // If AccessDeniedException, this is a real permission issue — propagate it
    if (isAccessDenied(err)) {
      logger.error('AccessDenied on PutResourcePolicy — IAM role missing logs:PutResourcePolicy permission', { 
        error: err.message,
        logGroupName 
      });
      throw createPermissionError(
        `The IAM role is missing the logs:PutResourcePolicy permission required for WAF monitoring. ` +
        `Please update your CloudFormation stack: ${CF_UPDATE_INSTRUCTION}`
      );
    }
    logger.warn('Failed to add CloudWatch Logs resource policy (non-critical)', { 
      error: err.message,
      logGroupName 
    });
    // Continue for non-permission errors - the policy might already exist
  }
  
  // Step 3: Enable WAF logging to CloudWatch Logs
  logger.info('WAF setup step 3: enabling WAF logging', { organizationId, webAclArn, loggingConfigured });
  if (!loggingConfigured) {
    const logDestination = `arn:aws:logs:${webAclArn.split(':')[3]}:${webAclArn.split(':')[4]}:log-group:${logGroupName}`;
    
    try {
      await wafClient.send(new PutLoggingConfigurationCommand({
        LoggingConfiguration: {
          ResourceArn: webAclArn,
          LogDestinationConfigs: [logDestination],
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
        webAclArn, logDestination, errorName: err.name, errorMessage: err.message 
      });
      
      if (err.name === 'WAFInvalidOperationException' || isAccessDenied(err)) {
        throw createPermissionError(
          `The IAM role is missing the wafv2:PutLoggingConfiguration permission required to enable WAF logging. ` +
          `Please update your CloudFormation stack: ${CF_UPDATE_INSTRUCTION}`
        );
      }
      
      throw err;
    }
  }
  
  // Step 4: Create or update subscription filter to send logs to EVO Lambda
  logger.info('WAF setup step 4: creating subscription filter', { organizationId, logGroupName, filterMode });
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
  // Also validates that the destination exists in this region
  const destinationExists = await updateDestinationPolicyForCustomer(customerAwsAccountId, region);
  
  if (!destinationExists) {
    logger.error('WAF logs destination does not exist in region', { 
      region, destinationArn, organizationId 
    });
    throw createPermissionError(
      `WAF monitoring is not yet available in region ${region}. ` +
      `The EVO WAF logs destination has not been deployed to this region. ` +
      `Please contact EVO support to enable WAF monitoring for region ${region}. ` +
      `Destination: ${destinationArn}`,
      'WAFPermissionPreFlightError'
    );
  }
  
  // Get or create the CloudWatch Logs role in customer account
  const cloudWatchLogsRoleArn = await getOrCreateCloudWatchLogsRole(
    customerAwsAccountId,
    region,
    credentials,
    account
  );
  
  // Verify the role's trust policy includes the regional logs service
  await ensureRegionalTrustPolicy(credentials, region, cloudWatchLogsRoleArn);
  
  // PutSubscriptionFilter with retry — destination policy propagation can take a few seconds
  let lastErr: any = null;
  
  for (let attempt = 1; attempt <= SUBSCRIPTION_FILTER_MAX_RETRIES; attempt++) {
    try {
      logger.info('PutSubscriptionFilter attempt', { 
        attempt, maxRetries: SUBSCRIPTION_FILTER_MAX_RETRIES, logGroupName, destinationArn, 
        roleArn: cloudWatchLogsRoleArn, region, customerAwsAccountId 
      });
      
      await logsClient.send(new PutSubscriptionFilterCommand({
        logGroupName,
        filterName: SUBSCRIPTION_FILTER_NAME,
        filterPattern,
        destinationArn,
        roleArn: cloudWatchLogsRoleArn,
      }));
      logger.info('Created subscription filter', { logGroupName, filterPattern, destinationArn, region, roleArn: cloudWatchLogsRoleArn, attempt });
      lastErr = null;
      break;
    } catch (err: any) {
      lastErr = err;
      logger.warn('PutSubscriptionFilter failed', {
        attempt, maxRetries: SUBSCRIPTION_FILTER_MAX_RETRIES,
        logGroupName, destinationArn, roleArn: cloudWatchLogsRoleArn,
        errorName: err.name, errorMessage: err.message,
      });
      
      // Only retry on "Could not deliver test message" — this is typically a propagation delay
      const isDeliveryError = err.name === 'InvalidParameterException' && 
        err.message?.includes('Could not deliver test message');
      
      if (!isDeliveryError || attempt === SUBSCRIPTION_FILTER_MAX_RETRIES) {
        break;
      }
      
      logger.info(`Waiting ${SUBSCRIPTION_FILTER_RETRY_DELAY_MS}ms before retry (policy propagation)`, { attempt });
      await new Promise(resolve => setTimeout(resolve, SUBSCRIPTION_FILTER_RETRY_DELAY_MS));
    }
  }
  
  if (lastErr) {
    logger.error('Failed to create subscription filter after all retries', lastErr, {
      logGroupName, filterPattern, destinationArn, roleArn: cloudWatchLogsRoleArn,
      errorName: lastErr.name, errorMessage: lastErr.message,
    });
    
    if (isAccessDenied(lastErr)) {
      throw createPermissionError(
        `The IAM role is missing the logs:PutSubscriptionFilter permission required for WAF monitoring. ` +
        `Please update your CloudFormation stack: ${CF_UPDATE_INSTRUCTION}`
      );
    }
    
    if (lastErr.name === 'InvalidParameterException' && lastErr.message?.includes('Could not deliver test message')) {
      throw createPermissionError(
        `Cross-account log delivery failed after ${SUBSCRIPTION_FILTER_MAX_RETRIES} attempts (region: ${region}). ` +
        `The subscription filter could not deliver a test message to the EVO destination. ` +
        `Destination ARN: ${destinationArn}. Role ARN: ${cloudWatchLogsRoleArn}. ` +
        `Customer Account: ${customerAwsAccountId}. ` +
        `Possible causes: (1) Destination policy not yet propagated, (2) CloudWatch Logs role trust policy incorrect, ` +
        `(3) Destination does not exist in region ${region}. ` +
        `Please try again in 30 seconds. If the issue persists, contact EVO support.`,
        'WAFPermissionPreFlightError'
      );
    }
    
    throw lastErr;
  }
  
  // Step 5: Save configuration to database
  logger.info('WAF setup step 5: saving config to database', { organizationId, webAclArn, filterMode });
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
 * Dry-run diagnostic: tests each step of WAF setup without making changes.
 * Returns step-by-step results so we can identify exactly where setup fails.
 */
async function handleTestSetup(
  prisma: ReturnType<typeof getPrismaClient>,
  organizationId: string,
  body: { accountId?: string; webAclArn?: string }
): Promise<APIGatewayProxyResultV2> {
  const { accountId, webAclArn } = body;
  if (!accountId || !webAclArn) {
    return error('Missing accountId or webAclArn', 400);
  }

  const steps: Array<{ step: string; status: 'ok' | 'fail' | 'skip'; detail?: string }> = [];

  const account = await prisma.awsCredential.findFirst({
    where: { id: accountId, organization_id: organizationId, is_active: true },
  });
  if (!account) {
    return success({ steps: [{ step: 'find-account', status: 'fail', detail: 'AWS account not found' }] });
  }
  steps.push({ step: 'find-account', status: 'ok' });

  const arnParts = webAclArn.split(':');
  const region = arnParts[3] || 'us-east-1';
  const scope = webAclArn.includes('/global/') ? 'CLOUDFRONT' : 'REGIONAL';
  const wafRegion = scope === 'CLOUDFRONT' ? 'us-east-1' : region;

  let credentials: any;
  try {
    const resolvedCreds = await resolveAwsCredentials(account, wafRegion);
    credentials = toAwsCredentials(resolvedCreds);
    steps.push({ step: 'assume-role', status: 'ok', detail: `region=${wafRegion}` });
  } catch (err: any) {
    steps.push({ step: 'assume-role', status: 'fail', detail: err.message });
    return success({ steps });
  }

  let customerAwsAccountId = account.role_arn?.split(':')[4] || webAclArn.split(':')[4];
  steps.push({ step: 'resolve-account-id', status: customerAwsAccountId ? 'ok' : 'fail', detail: customerAwsAccountId || 'Could not determine' });
  if (!customerAwsAccountId) return success({ steps });

  // Test PRE-FLIGHT permissions
  const roleArn = account.role_arn;
  if (roleArn) {
    try {
      const iamClient = new IAMClient({ region: 'us-east-1', credentials });
      const logGroupArn = `arn:aws:logs:${wafRegion}:${customerAwsAccountId}:log-group:aws-waf-logs-*`;
      const [globalResult, scopedResult] = await Promise.all([
        iamClient.send(new SimulatePrincipalPolicyCommand({
          PolicySourceArn: roleArn, ActionNames: GLOBAL_PERMISSIONS, ResourceArns: ['*'],
        })),
        iamClient.send(new SimulatePrincipalPolicyCommand({
          PolicySourceArn: roleArn, ActionNames: LOGS_SCOPED_PERMISSIONS, ResourceArns: [logGroupArn],
        })),
      ]);
      const denied = [
        ...(globalResult.EvaluationResults || []),
        ...(scopedResult.EvaluationResults || []),
      ].filter(r => r.EvalDecision !== 'allowed').map(r => `${r.EvalActionName}=${r.EvalDecision}`);
      steps.push({ step: 'pre-flight-permissions', status: denied.length === 0 ? 'ok' : 'fail', detail: denied.length > 0 ? denied.join(', ') : 'All permissions OK' });
    } catch (err: any) {
      steps.push({ step: 'pre-flight-permissions', status: 'skip', detail: `SimulatePrincipalPolicy failed: ${err.message}` });
    }
  } else {
    steps.push({ step: 'pre-flight-permissions', status: 'skip', detail: 'No role_arn' });
  }

  // Test WAF exists
  const wafClient = new WAFV2Client({ region: wafRegion, credentials });
  try {
    const resourceParts = arnParts[5]?.split('/') || [];
    await wafClient.send(new GetWebACLCommand({
      Name: resourceParts[2], Scope: resourceParts[0] === 'global' ? 'CLOUDFRONT' : 'REGIONAL', Id: resourceParts[3],
    }));
    steps.push({ step: 'waf-exists', status: 'ok' });
  } catch (err: any) {
    steps.push({ step: 'waf-exists', status: 'fail', detail: `${err.name}: ${err.message}` });
    return success({ steps });
  }

  // Test CreateLogGroup
  const webAclName = extractWebAclName(webAclArn);
  const logGroupName = getLogGroupName(webAclName);
  const logsClient = new CloudWatchLogsClient({ region: wafRegion, credentials });
  try {
    await logsClient.send(new CreateLogGroupCommand({ logGroupName }));
    steps.push({ step: 'create-log-group', status: 'ok', detail: logGroupName });
  } catch (err: any) {
    if (err.name === 'ResourceAlreadyExistsException') {
      steps.push({ step: 'create-log-group', status: 'ok', detail: `${logGroupName} (already exists)` });
    } else {
      steps.push({ step: 'create-log-group', status: 'fail', detail: `${err.name}: ${err.message}` });
    }
  }

  // Test PutResourcePolicy
  try {
    const policyName = `AWSWAFLogsPolicy-${logGroupName}-test`;
    await logsClient.send(new PutResourcePolicyCommand({
      policyName,
      policyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: { Service: 'wafv2.amazonaws.com' },
          Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: `arn:aws:logs:${wafRegion}:${customerAwsAccountId}:log-group:${logGroupName}:*`,
        }],
      }),
    }));
    steps.push({ step: 'put-resource-policy', status: 'ok' });
  } catch (err: any) {
    steps.push({ step: 'put-resource-policy', status: 'fail', detail: `${err.name}: ${err.message}` });
  }

  // Test WAF logging config
  try {
    const loggingConfig = await wafClient.send(new GetLoggingConfigurationCommand({ ResourceArn: webAclArn }));
    steps.push({ step: 'waf-logging', status: 'ok', detail: loggingConfig.LoggingConfiguration ? 'Already configured' : 'Not configured (will be created)' });
  } catch (err: any) {
    if (err.name === 'WAFNonexistentItemException') {
      steps.push({ step: 'waf-logging', status: 'ok', detail: 'Not configured (will be created)' });
    } else {
      steps.push({ step: 'waf-logging', status: 'fail', detail: `${err.name}: ${err.message}` });
    }
  }

  // Test destination exists
  const destinationArn = getDestinationArn(wafRegion);
  const destinationExists = await updateDestinationPolicyForCustomer(customerAwsAccountId, wafRegion);
  steps.push({ step: 'destination-exists', status: destinationExists ? 'ok' : 'fail', detail: `${destinationArn} (region=${wafRegion})` });

  // Test CloudWatch Logs role
  let cloudWatchLogsRoleArn = '';
  try {
    const iamClient = new IAMClient({ region: 'us-east-1', credentials });
    await iamClient.send(new GetRoleCommand({ RoleName: CLOUDWATCH_LOGS_ROLE_NAME }));
    cloudWatchLogsRoleArn = `arn:aws:iam::${customerAwsAccountId}:role/${CLOUDWATCH_LOGS_ROLE_NAME}`;
    
    // Check trust policy
    const roleInfo = await iamClient.send(new GetRoleCommand({ RoleName: CLOUDWATCH_LOGS_ROLE_NAME }));
    const trustDoc = roleInfo.Role?.AssumeRolePolicyDocument ? decodeURIComponent(roleInfo.Role.AssumeRolePolicyDocument) : '';
    const regionalSvc = `logs.${wafRegion}.amazonaws.com`;
    const hasTrust = trustDoc.includes(regionalSvc) || trustDoc.includes('logs.amazonaws.com');
    steps.push({ step: 'cw-logs-role', status: 'ok', detail: `${CLOUDWATCH_LOGS_ROLE_NAME} exists, trust=${hasTrust ? 'OK' : 'MISSING ' + regionalSvc}` });
  } catch (err: any) {
    steps.push({ step: 'cw-logs-role', status: 'fail', detail: `${err.name}: ${err.message}` });
  }

  // Test PutSubscriptionFilter (dry — we don't actually create it, just report readiness)
  if (destinationExists && cloudWatchLogsRoleArn) {
    steps.push({ step: 'subscription-filter-ready', status: 'ok', detail: `dest=${destinationArn}, role=${cloudWatchLogsRoleArn}` });
  } else {
    steps.push({ step: 'subscription-filter-ready', status: 'fail', detail: `destinationExists=${destinationExists}, roleArn=${cloudWatchLogsRoleArn || 'none'}` });
  }

  return success({ steps, region: wafRegion, customerAwsAccountId, logGroupName, destinationArn });
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
    return error('Missing required parameter: accountId', 400);
  }
  
  // Get AWS credentials for the customer account
  const account = await prisma.awsCredential.findFirst({
    where: { id: accountId, organization_id: organizationId, is_active: true },
  });
  
  if (!account) {
    return error('AWS account not found', 404);
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
    return error('Missing required parameter: configId', 400);
  }
  
  const config = await prisma.wafMonitoringConfig.findFirst({
    where: { id: configId, organization_id: organizationId },
  });
  
  if (!config) {
    return error('Configuration not found', 404);
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
