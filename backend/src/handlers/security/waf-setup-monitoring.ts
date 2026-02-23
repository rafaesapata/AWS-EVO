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
import { resolveAwsCredentials, toAwsCredentials, invalidateAssumeRoleCache } from '../../lib/aws-helpers.js';
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
import { IAMClient, GetRoleCommand, CreateRoleCommand, PutRolePolicyCommand, UpdateAssumeRolePolicyCommand } from '@aws-sdk/client-iam';
import { LambdaClient as SelfLambdaClient, InvokeCommand as SelfInvokeCommand } from '@aws-sdk/client-lambda';

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
const SUBSCRIPTION_FILTER_RETRY_DELAY_MS = 3000;
const POLICY_PROPAGATION_DELAY_MS = 2000;
const IAM_PROPAGATION_DELAY_MS = 8000;
const TRUST_POLICY_PROPAGATION_DELAY_MS = 3000;

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
function createPermissionError(message: string, name: 'AccessDeniedException' | 'WAFPermissionPreFlightError' | 'EVOInfraProvisionError' = 'AccessDeniedException'): Error {
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


// ─── Auto-provisioning: WAF Logs Destination ────────────────────────────────
// Replicates cloudformation/waf-logs-destination-stack.yaml via SDK.
// Only creates resources that are MISSING — never deletes or recreates existing ones.

const WAF_FWD_FUNCTION_PREFIX = 'evo-uds-v3-production-waf-fwd';
const WAF_DEST_ROLE_PREFIX = 'evo-uds-v3-production-waf-dest';
const WAF_FWD_ROLE_PREFIX = 'evo-uds-v3-production-waf-fwd';
const CENTRAL_PROCESSOR_ARN = 'arn:aws:lambda:us-east-1:523115032346:function:evo-uds-v3-production-waf-log-processor';

/**
 * Auto-provision the WAF logs destination infrastructure in a region if it doesn't exist.
 * Creates only what is missing: IAM roles, Lambda forwarder, Lambda permission, 
 * CW Logs Destination. Never deletes or modifies existing resources.
 * 
 * This runs with EVO account default credentials (the Lambda execution role).
 */
async function ensureDestinationExists(region: string): Promise<boolean> {
  // Quick check — if destination already exists, nothing to do
  const alreadyExists = await checkDestinationExists(region);
  if (alreadyExists) {
    logger.info('WAF destination already exists in region', { region });
    return true;
  }

  logger.info('WAF destination not found in region, auto-provisioning', { region });

  const { IAMClient: EvoIAMClient, GetRoleCommand: EvoGetRole, CreateRoleCommand: EvoCreateRole, PutRolePolicyCommand: EvoPutRolePolicy, AttachRolePolicyCommand } = await import('@aws-sdk/client-iam');
  const { LambdaClient: EvoLambdaClient, GetFunctionCommand, CreateFunctionCommand, AddPermissionCommand, GetPolicyCommand } = await import('@aws-sdk/client-lambda');
  const { CloudWatchLogsClient: EvoLogsClient, PutDestinationCommand, PutDestinationPolicyCommand, DescribeDestinationsCommand } = await import('@aws-sdk/client-cloudwatch-logs');

  // All resources use EVO default credentials (Lambda execution role)
  // IAM is global — always us-east-1
  const iamClient = new EvoIAMClient({ region: 'us-east-1' });
  const lambdaClient = new EvoLambdaClient({ region });
  const logsClient = new EvoLogsClient({ region });

  const fwdFunctionName = `${WAF_FWD_FUNCTION_PREFIX}-${region}`;
  const fwdRoleName = `${WAF_FWD_ROLE_PREFIX}-${region}`;
  const destRoleName = `${WAF_DEST_ROLE_PREFIX}-${region}`;

  try {
    // ── 1. Forwarder Lambda execution role ──────────────────────────────
    let fwdRoleArn = '';
    try {
      const existing = await iamClient.send(new EvoGetRole({ RoleName: fwdRoleName }));
      fwdRoleArn = existing.Role!.Arn!;
      logger.info('Forwarder role already exists', { fwdRoleName, fwdRoleArn });
    } catch (err: any) {
      if (err.name !== 'NoSuchEntityException' && err.name !== 'NoSuchEntity') throw err;
      logger.info('Creating forwarder role', { fwdRoleName });
      const created = await iamClient.send(new EvoCreateRole({
        RoleName: fwdRoleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }],
        }),
      }));
      fwdRoleArn = created.Role!.Arn!;

      // Attach basic execution policy
      await iamClient.send(new AttachRolePolicyCommand({
        RoleName: fwdRoleName,
        PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      }));

      // Inline policy: invoke central processor
      await iamClient.send(new EvoPutRolePolicy({
        RoleName: fwdRoleName,
        PolicyName: 'InvokeCentralProcessor',
        PolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{ Effect: 'Allow', Action: 'lambda:InvokeFunction', Resource: CENTRAL_PROCESSOR_ARN }],
        }),
      }));

      // Wait for IAM propagation
      logger.info('Waiting for IAM role propagation', { fwdRoleName });
      await new Promise(resolve => setTimeout(resolve, IAM_PROPAGATION_DELAY_MS));
    }

    // ── 2. Forwarder Lambda function ────────────────────────────────────
    let fwdFunctionArn = '';
    try {
      const existing = await lambdaClient.send(new GetFunctionCommand({ FunctionName: fwdFunctionName }));
      fwdFunctionArn = existing.Configuration!.FunctionArn!;
      logger.info('Forwarder function already exists', { fwdFunctionName, fwdFunctionArn });
    } catch (err: any) {
      if (err.name !== 'ResourceNotFoundException') throw err;
      logger.info('Creating forwarder function', { fwdFunctionName });

      const lambdaCode = `const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const client = new LambdaClient({ region: 'us-east-1' });
exports.handler = async (event) => {
  await client.send(new InvokeCommand({
    FunctionName: process.env.CENTRAL_PROCESSOR_ARN,
    InvocationType: 'Event',
    Payload: JSON.stringify(event),
  }));
};`;

      const { ZipFile } = await createInlineZip(lambdaCode);

      const created = await lambdaClient.send(new CreateFunctionCommand({
        FunctionName: fwdFunctionName,
        Runtime: 'nodejs18.x',
        Handler: 'index.handler',
        Role: fwdRoleArn,
        Timeout: 60,
        MemorySize: 128,
        Architectures: ['arm64'],
        Environment: { Variables: { CENTRAL_PROCESSOR_ARN } },
        Code: { ZipFile },
      }));
      fwdFunctionArn = created.FunctionArn!;
      logger.info('Created forwarder function', { fwdFunctionName, fwdFunctionArn });
    }

    // ── 3. Lambda resource-based permission (logs → invoke) ─────────────
    const permissionSid = `AllowCWLogs-${region}`;
    try {
      const policyResp = await lambdaClient.send(new GetPolicyCommand({ FunctionName: fwdFunctionName }));
      const policy = JSON.parse(policyResp.Policy || '{}');
      const hasPermission = policy.Statement?.some((s: any) => s.Sid === permissionSid);
      if (hasPermission) {
        logger.info('Lambda permission already exists', { fwdFunctionName, permissionSid });
      } else {
        throw { name: 'ResourceNotFoundException' }; // fall through to create
      }
    } catch (err: any) {
      if (err.name !== 'ResourceNotFoundException') throw err;
      logger.info('Adding Lambda permission for CW Logs', { fwdFunctionName });
      try {
        await lambdaClient.send(new AddPermissionCommand({
          FunctionName: fwdFunctionName,
          StatementId: permissionSid,
          Action: 'lambda:InvokeFunction',
          Principal: `logs.${region}.amazonaws.com`,
          SourceAccount: EVO_ACCOUNT_ID,
        }));
      } catch (permErr: any) {
        // ResourceConflictException means it already exists (race condition)
        if (permErr.name !== 'ResourceConflictException') throw permErr;
        logger.info('Lambda permission already exists (race)', { fwdFunctionName });
      }
    }

    // ── 4. Destination IAM role (logs → invoke forwarder) ───────────────
    let destRoleArn = '';
    try {
      const existing = await iamClient.send(new EvoGetRole({ RoleName: destRoleName }));
      destRoleArn = existing.Role!.Arn!;
      logger.info('Destination role already exists', { destRoleName, destRoleArn });
    } catch (err: any) {
      if (err.name !== 'NoSuchEntityException' && err.name !== 'NoSuchEntity') throw err;
      logger.info('Creating destination role', { destRoleName });
      const created = await iamClient.send(new EvoCreateRole({
        RoleName: destRoleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{ Effect: 'Allow', Principal: { Service: 'logs.amazonaws.com' }, Action: 'sts:AssumeRole' }],
        }),
      }));
      destRoleArn = created.Role!.Arn!;

      await iamClient.send(new EvoPutRolePolicy({
        RoleName: destRoleName,
        PolicyName: 'InvokeLambda',
        PolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{ Effect: 'Allow', Action: 'lambda:InvokeFunction', Resource: fwdFunctionArn }],
        }),
      }));

      logger.info('Waiting for IAM role propagation', { destRoleName });
      await new Promise(resolve => setTimeout(resolve, IAM_PROPAGATION_DELAY_MS));
    }

    // ── 5. CloudWatch Logs Destination ──────────────────────────────────
    // PutDestination is idempotent — safe to call even if it exists
    logger.info('Creating/updating CW Logs destination', { region, destinationName: EVO_WAF_DESTINATION_NAME });
    await logsClient.send(new PutDestinationCommand({
      destinationName: EVO_WAF_DESTINATION_NAME,
      targetArn: fwdFunctionArn,
      roleArn: destRoleArn,
    }));

    // Set open access policy so any account can subscribe (we control via destination policy updates later)
    await logsClient.send(new PutDestinationPolicyCommand({
      destinationName: EVO_WAF_DESTINATION_NAME,
      accessPolicy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Sid: 'AllowCrossAccountSubscription',
          Effect: 'Allow',
          Principal: { AWS: EVO_ACCOUNT_ID },
          Action: 'logs:PutSubscriptionFilter',
          Resource: `arn:aws:logs:${region}:${EVO_ACCOUNT_ID}:destination:${EVO_WAF_DESTINATION_NAME}`,
        }],
      }),
    }));

    logger.info('WAF destination auto-provisioned successfully', { region });
    return true;

  } catch (err: any) {
    logger.error('Failed to auto-provision WAF destination', err, { region, errorName: err.name, errorMessage: err.message });
    // Re-throw with context so callers can show meaningful error details
    const wrappedErr = new Error(`Auto-provision failed in ${region}: ${err.name || 'Unknown'} - ${err.message || 'No details'}`);
    (wrappedErr as any).name = err.name || 'AutoProvisionError';
    (wrappedErr as any).originalError = err;
    throw wrappedErr;
  }
}

/**
 * Create a minimal zip buffer containing index.js with the given code.
 * Uses Node.js built-in zlib (no external dependencies).
 */
async function createInlineZip(code: string): Promise<{ ZipFile: Buffer }> {
  // Minimal ZIP file creation using raw buffers
  // ZIP format: local file header + file data + central directory + end of central directory
  const fileName = 'index.js';
  const fileData = Buffer.from(code, 'utf-8');
  const fileNameBuf = Buffer.from(fileName, 'utf-8');

  // We need to compress the data with deflate (method 8)
  const zlib = await import('zlib');
  const deflated = zlib.deflateRawSync(fileData);

  // CRC32 calculation
  const crc32 = crc32Buf(fileData);

  // Local file header
  const localHeader = Buffer.alloc(30 + fileNameBuf.length);
  localHeader.writeUInt32LE(0x04034b50, 0);  // signature
  localHeader.writeUInt16LE(20, 4);           // version needed
  localHeader.writeUInt16LE(0, 6);            // flags
  localHeader.writeUInt16LE(8, 8);            // compression method (deflate)
  localHeader.writeUInt16LE(0, 10);           // mod time
  localHeader.writeUInt16LE(0, 12);           // mod date
  localHeader.writeUInt32LE(crc32, 14);       // crc32
  localHeader.writeUInt32LE(deflated.length, 18);   // compressed size
  localHeader.writeUInt32LE(fileData.length, 22);    // uncompressed size
  localHeader.writeUInt16LE(fileNameBuf.length, 26); // file name length
  localHeader.writeUInt16LE(0, 28);           // extra field length
  fileNameBuf.copy(localHeader, 30);

  // Central directory header
  const centralDir = Buffer.alloc(46 + fileNameBuf.length);
  centralDir.writeUInt32LE(0x02014b50, 0);   // signature
  centralDir.writeUInt16LE(20, 4);            // version made by
  centralDir.writeUInt16LE(20, 6);            // version needed
  centralDir.writeUInt16LE(0, 8);             // flags
  centralDir.writeUInt16LE(8, 10);            // compression method
  centralDir.writeUInt16LE(0, 12);            // mod time
  centralDir.writeUInt16LE(0, 14);            // mod date
  centralDir.writeUInt32LE(crc32, 16);        // crc32
  centralDir.writeUInt32LE(deflated.length, 20);    // compressed size
  centralDir.writeUInt32LE(fileData.length, 24);     // uncompressed size
  centralDir.writeUInt16LE(fileNameBuf.length, 28);  // file name length
  centralDir.writeUInt16LE(0, 30);            // extra field length
  centralDir.writeUInt16LE(0, 32);            // comment length
  centralDir.writeUInt16LE(0, 34);            // disk number start
  centralDir.writeUInt16LE(0, 36);            // internal attrs
  centralDir.writeUInt32LE(0, 38);            // external attrs
  centralDir.writeUInt32LE(0, 42);            // local header offset
  fileNameBuf.copy(centralDir, 46);

  const centralDirOffset = localHeader.length + deflated.length;

  // End of central directory
  const endOfDir = Buffer.alloc(22);
  endOfDir.writeUInt32LE(0x06054b50, 0);     // signature
  endOfDir.writeUInt16LE(0, 4);               // disk number
  endOfDir.writeUInt16LE(0, 6);               // disk with central dir
  endOfDir.writeUInt16LE(1, 8);               // entries on this disk
  endOfDir.writeUInt16LE(1, 10);              // total entries
  endOfDir.writeUInt32LE(centralDir.length, 12);     // central dir size
  endOfDir.writeUInt32LE(centralDirOffset, 16);      // central dir offset
  endOfDir.writeUInt16LE(0, 20);              // comment length

  return { ZipFile: Buffer.concat([localHeader, deflated, centralDir, endOfDir]) };
}

/** CRC32 for ZIP files */
function crc32Buf(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
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
  
  // Parse body early to detect async background invocation
  const body = event.body ? JSON.parse(event.body) : {};
  
  // For async background invocations, skip Cognito auth extraction
  // The self-invoke passes organizationId directly in the body
  let user: any;
  let organizationId: string;
  
  if (body.__asyncSetup && body.__organizationId) {
    // Background async invocation — no Cognito authorizer available
    organizationId = body.__organizationId;
    user = { sub: body.__userId || 'async-worker' };
    logger.info('WAF Setup Monitoring: async background invocation', { organizationId });
  } else {
    user = getUserFromEvent(event);
    organizationId = getOrganizationIdWithImpersonation(event, user);
  }
  
  logger.info('WAF Setup Monitoring started', { 
    organizationId,
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  try {
    const { action, accountId, webAclArn, enabled, filterMode = 'block_only' } = body;
    
    const prisma = getPrismaClient();
    
    // Handle different actions
    if (action === 'list-wafs') {
      return await handleListWafs(prisma, organizationId, accountId);
    }
    
    if (action === 'get-configs') {
      return await handleGetConfigs(prisma, organizationId, accountId);
    }
    
    // Poll provisioning status for a specific WAF config
    if (action === 'get-status') {
      const config = await prisma.wafMonitoringConfig.findFirst({
        where: { 
          organization_id: organizationId, 
          web_acl_arn: body.webAclArn,
        },
        select: { status: true, status_message: true, is_active: true, web_acl_name: true, filter_mode: true },
      });
      if (!config) return error('WAF config not found', 404);
      return success(config);
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
      // ── ASYNC SETUP: Check if this is an internal async invocation ──
      if (body.__asyncSetup) {
        // This is the background invocation — do the actual heavy work
        logger.info('Async WAF setup: executing background provisioning', { organizationId, webAclArn });
        try {
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
          
          // Update status to active on success
          await prisma.wafMonitoringConfig.updateMany({
            where: { organization_id: organizationId, web_acl_arn: webAclArn },
            data: { status: 'active', status_message: null, updated_at: new Date() },
          });
          
          logger.info('Async WAF setup completed successfully', { organizationId, webAclArn, filterMode });
          return success(result);
        } catch (asyncErr: any) {
          // Update status to error so frontend can show the failure
          logger.error('Async WAF setup failed', asyncErr as Error, { organizationId, webAclArn });
          await prisma.wafMonitoringConfig.updateMany({
            where: { organization_id: organizationId, web_acl_arn: webAclArn },
            data: { 
              status: 'error', 
              status_message: asyncErr?.message || 'Unknown error during WAF setup',
              is_active: false,
              updated_at: new Date(),
            },
          });
          return error(asyncErr?.message || 'Async WAF setup failed', 500);
        }
      }
      
      // ── SYNC PATH: Validate, save as provisioning, fire-and-forget ──
      // Step 0: Quick validation that the WAF exists before committing
      try {
        const arnParts2 = webAclArn.split(':');
        const resourcePart = arnParts2[5];
        const resourceParts = resourcePart.split('/');
        const scope = resourceParts[0] === 'global' ? 'CLOUDFRONT' : 'REGIONAL';
        await wafClient.send(new GetWebACLCommand({
          Name: resourceParts[2],
          Scope: scope,
          Id: resourceParts[3],
        }));
      } catch (valErr: any) {
        if (valErr.name === 'WAFNonexistentItemException') {
          return error('The specified WAF Web ACL does not exist. Please verify the ARN.', 404);
        }
        throw valErr;
      }
      
      // Save config with status=provisioning
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
          filter_mode: filterMode,
          status: 'provisioning',
          is_active: false,
        },
        update: {
          aws_account_id: accountId,
          web_acl_name: webAclName,
          log_group_name: logGroupName,
          filter_mode: filterMode,
          status: 'provisioning',
          status_message: null,
          is_active: false,
          updated_at: new Date(),
        },
      });
      
      // Fire-and-forget: invoke self asynchronously
      const selfFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'evo-uds-v3-production-waf-setup-monitoring';
      const selfClient = new SelfLambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
      
      await selfClient.send(new SelfInvokeCommand({
        FunctionName: selfFunctionName,
        InvocationType: 'Event', // Async — returns immediately
        Payload: JSON.stringify({
          body: JSON.stringify({
            ...body,
            __asyncSetup: true,
            __organizationId: organizationId,
            __userId: user.sub,
          }),
          requestContext: event.requestContext,
          headers: event.headers,
        }),
      }));
      
      logger.info('WAF setup: async invocation dispatched', { organizationId, webAclArn, selfFunctionName });
      
      return success({
        status: 'provisioning',
        message: `WAF monitoring setup initiated for ${webAclName}. This may take up to 2 minutes.`,
        webAclArn,
        webAclName,
        filterMode,
      }, 202);
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

    // Handle EVO infrastructure provisioning errors (not customer's fault)
    if (errName === 'EVOInfraProvisionError') {
      return error(
        `[EVO_INFRA_ERROR] WAF monitoring infrastructure provisioning failed. ` +
        `This is a temporary issue on the EVO platform side, not related to your AWS account permissions. ` +
        `Please try again in a few minutes. If the issue persists, contact EVO support. ` +
        `Details: ${errMsg}`,
        503
      );
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
    
    if (errName === 'WAFInvalidOperationException') {
      // This is NOT a permission error — it's a configuration/propagation issue
      return error(
        `WAF logging configuration failed. This is usually caused by resource policy propagation delay. ` +
        `Please try again in 10-15 seconds. If the issue persists, verify the log group has the correct resource policy. ` +
        `Details: ${errMsg}`,
        409
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
  
  // Step 2.7: Ensure WAF Service-Linked Role exists
  // PutLoggingConfiguration requires AWSServiceRoleForWAFV2Logging to exist.
  // Without it, WAF returns AccessDeniedException (misleading error).
  logger.info('WAF setup step 2.7: ensuring WAF SLR exists', { organizationId });
  let slrMissing = false; // Track if SLR is confirmed missing and could not be created
  try {
    const iamClient = new IAMClient({ region: 'us-east-1', credentials });
    await iamClient.send(new GetRoleCommand({ RoleName: 'AWSServiceRoleForWAFV2Logging' }));
    logger.info('WAF SLR already exists');
  } catch (slrErr: any) {
    if (slrErr.name === 'NoSuchEntityException') {
      logger.info('WAF SLR does not exist, creating it...');
      try {
        const { CreateServiceLinkedRoleCommand } = await import('@aws-sdk/client-iam');
        const iamClient = new IAMClient({ region: 'us-east-1', credentials });
        await iamClient.send(new CreateServiceLinkedRoleCommand({
          AWSServiceName: 'wafv2.amazonaws.com',
          Description: 'Service-linked role for WAF logging (created by EVO Platform)',
        }));
        logger.info('Created WAF SLR, waiting for propagation...');
        await new Promise(resolve => setTimeout(resolve, IAM_PROPAGATION_DELAY_MS));
      } catch (createErr: any) {
        if (createErr.name === 'InvalidInputException' && createErr.message?.includes('already exists')) {
          logger.info('WAF SLR already exists (race condition)');
        } else if (isAccessDenied(createErr)) {
          slrMissing = true;
          logger.warn('Cannot create WAF SLR (missing iam:CreateServiceLinkedRole permission)', {
            error: createErr.message,
          });
        } else {
          slrMissing = true;
          logger.warn('Failed to create WAF SLR', { error: createErr.message });
        }
      }
    } else if (isAccessDenied(slrErr)) {
      logger.warn('Cannot check WAF SLR (missing iam:GetRole permission), continuing anyway...');
    } else {
      logger.warn('Failed to check WAF SLR (non-critical)', { error: slrErr.message });
    }
  }

  // If SLR is confirmed missing and could not be created, fail fast instead of
  // wasting ~25s on 5 retries that will all fail with AccessDeniedException.
  if (slrMissing) {
    throw createPermissionError(
      `The WAF Service-Linked Role (AWSServiceRoleForWAFV2Logging) does not exist in the customer account ` +
      `and the IAM role is missing the iam:CreateServiceLinkedRole permission to create it. ` +
      `Without this role, WAF logging cannot be enabled. ` +
      `Please update your CloudFormation stack: ${CF_UPDATE_INSTRUCTION}`
    );
  }

  // Wait for resource policy propagation before attempting PutLoggingConfiguration
  // AWS WAF requires the resource policy to be fully propagated before it can write to the log group
  logger.info('Waiting for resource policy propagation before enabling WAF logging', { logGroupName });
  await new Promise(resolve => setTimeout(resolve, POLICY_PROPAGATION_DELAY_MS));
  
  // Step 3: Enable WAF logging to CloudWatch Logs
  logger.info('WAF setup step 3: enabling WAF logging', { organizationId, webAclArn, loggingConfigured });
  if (!loggingConfigured) {
    const logDestination = `arn:aws:logs:${webAclArn.split(':')[3]}:${webAclArn.split(':')[4]}:log-group:${logGroupName}`;
    
    // Retry PutLoggingConfiguration — resource policy propagation can take a few seconds
    const PUT_LOGGING_MAX_RETRIES = 4;
    const PUT_LOGGING_RETRY_DELAY_MS = 3000;
    let putLoggingLastErr: any = null;
    
    for (let attempt = 1; attempt <= PUT_LOGGING_MAX_RETRIES; attempt++) {
      try {
        logger.info('PutLoggingConfiguration attempt', { attempt, maxRetries: PUT_LOGGING_MAX_RETRIES, webAclArn, logDestination });
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
        logger.info('Enabled WAF logging', { webAclArn, logDestination, attempt });
        putLoggingLastErr = null;
        break;
      } catch (err: any) {
        putLoggingLastErr = err;
        logger.warn('PutLoggingConfiguration failed', {
          attempt, maxRetries: PUT_LOGGING_MAX_RETRIES,
          webAclArn, logDestination, errorName: err.name, errorMessage: err.message,
        });
        
        // WAFInvalidOperationException or AccessDeniedException often means resource policy or SLR hasn't propagated yet — retry
        if ((err.name === 'WAFInvalidOperationException' || err.name === 'AccessDeniedException') && attempt < PUT_LOGGING_MAX_RETRIES) {
          logger.info(`Waiting ${PUT_LOGGING_RETRY_DELAY_MS}ms before retry (resource policy/SLR propagation)`, { attempt });
          await new Promise(resolve => setTimeout(resolve, PUT_LOGGING_RETRY_DELAY_MS));
          continue;
        }
        
        // Other errors — don't retry
        break;
      }
    }
    
    if (putLoggingLastErr) {
      logger.error('Failed to enable WAF logging after all retries', putLoggingLastErr, { 
        webAclArn, logDestination, errorName: putLoggingLastErr.name, errorMessage: putLoggingLastErr.message 
      });
      
      if (isAccessDenied(putLoggingLastErr)) {
        throw createPermissionError(
          `The IAM role is missing the wafv2:PutLoggingConfiguration permission required to enable WAF logging, ` +
          `or the WAF Service-Linked Role (AWSServiceRoleForWAFV2Logging) does not exist. ` +
          `Please update your CloudFormation stack: ${CF_UPDATE_INSTRUCTION}`
        );
      }
      
      if (putLoggingLastErr.name === 'WAFInvalidOperationException') {
        // After retries, this is likely a real configuration issue, not permissions
        throw new Error(
          `WAF logging configuration failed after ${PUT_LOGGING_MAX_RETRIES} attempts. ` +
          `This is usually caused by resource policy propagation delay or a log group configuration issue. ` +
          `Log destination: ${logDestination}. ` +
          `Please try again in a few seconds. If the issue persists, verify the log group "${logGroupName}" exists and has the correct resource policy. ` +
          `Details: ${putLoggingLastErr.message}`
        );
      }
      
      throw putLoggingLastErr;
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
  
  // IMPORTANT: Ensure the destination infrastructure exists in this region
  // Auto-provisions Lambda forwarder + IAM roles + CW Logs Destination if missing
  let destinationReady = false;
  try {
    destinationReady = await ensureDestinationExists(region);
  } catch (provisionErr: any) {
    logger.error('Failed to ensure WAF logs destination in region', { region, destinationArn, organizationId, error: provisionErr.message });
    throw createPermissionError(
      `Failed to auto-provision WAF monitoring infrastructure in region ${region}. ` +
      `Error: ${provisionErr.message}. ` +
      `The EVO Lambda execution role may lack permissions to create IAM roles, Lambda functions, or CW Logs destinations. ` +
      `Destination: ${destinationArn}`,
      'EVOInfraProvisionError'
    );
  }
  if (!destinationReady) {
    logger.error('Failed to ensure WAF logs destination in region', { region, destinationArn, organizationId });
    throw createPermissionError(
      `Failed to auto-provision WAF monitoring infrastructure in region ${region}. ` +
      `The EVO Lambda execution role may lack permissions to create IAM roles, Lambda functions, or CW Logs destinations. ` +
      `Destination: ${destinationArn}`,
      'EVOInfraProvisionError'
    );
  }
  
  // Update destination policy in EVO account to allow this customer account
  // This must be done BEFORE creating the subscription filter
  const destinationExists = await updateDestinationPolicyForCustomer(customerAwsAccountId, region);
  
  if (!destinationExists) {
    logger.error('WAF logs destination policy update failed', { 
      region, destinationArn, organizationId 
    });
    throw createPermissionError(
      `WAF monitoring destination exists but policy update failed in region ${region}. ` +
      `Destination: ${destinationArn}`,
      'EVOInfraProvisionError'
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
        'EVOInfraProvisionError'
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
      status: 'active',
      is_active: true,
    },
    update: {
      aws_account_id: accountId,
      web_acl_name: webAclName,
      log_group_name: logGroupName,
      subscription_filter: SUBSCRIPTION_FILTER_NAME,
      filter_mode: filterMode,
      status: 'active',
      status_message: null,
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
 * Read-only check: does the EVO WAF logs destination exist in the given region?
 * Unlike updateDestinationPolicyForCustomer, this does NOT modify the destination policy.
 */
async function checkDestinationExists(region: string): Promise<boolean> {
  const { CloudWatchLogsClient: EvoLogsClient, DescribeDestinationsCommand } = await import('@aws-sdk/client-cloudwatch-logs');
  const evoLogsClient = new EvoLogsClient({ region });
  try {
    const resp = await evoLogsClient.send(new DescribeDestinationsCommand({
      DestinationNamePrefix: EVO_WAF_DESTINATION_NAME,
    }));
    return !!resp.destinations?.some(d => d.destinationName === EVO_WAF_DESTINATION_NAME);
  } catch {
    return false;
  }
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

  // Test WAF Service-Linked Role (SLR) — required for PutLoggingConfiguration
  try {
    const iamClient = new IAMClient({ region: 'us-east-1', credentials });
    await iamClient.send(new GetRoleCommand({ RoleName: 'AWSServiceRoleForWAFV2Logging' }));
    steps.push({ step: 'waf-slr', status: 'ok', detail: 'AWSServiceRoleForWAFV2Logging exists' });
  } catch (slrErr: any) {
    if (slrErr.name === 'NoSuchEntityException') {
      steps.push({ step: 'waf-slr', status: 'fail', detail: 'AWSServiceRoleForWAFV2Logging does not exist. The IAM role needs iam:CreateServiceLinkedRole permission to create it.' });
    } else if (isAccessDenied(slrErr)) {
      steps.push({ step: 'waf-slr', status: 'fail', detail: 'Cannot check SLR: missing iam:GetRole permission' });
    } else {
      steps.push({ step: 'waf-slr', status: 'fail', detail: `${slrErr.name}: ${slrErr.message}` });
    }
  }

  // Test WAF logging config — actually test PutLoggingConfiguration permission
  const logDestination = `arn:aws:logs:${wafRegion}:${customerAwsAccountId}:log-group:${logGroupName}`;
  try {
    const loggingConfig = await wafClient.send(new GetLoggingConfigurationCommand({ ResourceArn: webAclArn }));
    if (loggingConfig.LoggingConfiguration) {
      steps.push({ step: 'waf-logging', status: 'ok', detail: 'Already configured' });
    } else {
      // Not configured — test PutLoggingConfiguration to verify permission
      try {
        await wafClient.send(new PutLoggingConfigurationCommand({
          LoggingConfiguration: {
            ResourceArn: webAclArn,
            LogDestinationConfigs: [logDestination],
          },
        }));
        steps.push({ step: 'waf-logging', status: 'ok', detail: 'PutLoggingConfiguration succeeded (test)' });
        // Note: we leave it configured since setup will reconfigure with filters anyway
      } catch (putErr: any) {
        steps.push({ step: 'waf-logging', status: 'fail', detail: `PutLoggingConfiguration failed: ${putErr.name}: ${putErr.message}` });
      }
    }
  } catch (err: any) {
    if (err.name === 'WAFNonexistentItemException') {
      // Not configured — test PutLoggingConfiguration to verify permission
      try {
        await wafClient.send(new PutLoggingConfigurationCommand({
          LoggingConfiguration: {
            ResourceArn: webAclArn,
            LogDestinationConfigs: [logDestination],
          },
        }));
        steps.push({ step: 'waf-logging', status: 'ok', detail: 'PutLoggingConfiguration succeeded (test)' });
      } catch (putErr: any) {
        steps.push({ step: 'waf-logging', status: 'fail', detail: `PutLoggingConfiguration failed: ${putErr.name}: ${putErr.message}` });
      }
    } else {
      steps.push({ step: 'waf-logging', status: 'fail', detail: `${err.name}: ${err.message}` });
    }
  }

  // Test destination exists — auto-provision if missing
  const destinationArn = getDestinationArn(wafRegion);
  let destinationExists = await checkDestinationExists(wafRegion);
  
  if (!destinationExists) {
    // Try to auto-provision the destination infrastructure
    try {
      destinationExists = await ensureDestinationExists(wafRegion);
      steps.push({ 
        step: 'destination-auto-provision', 
        status: destinationExists ? 'ok' : 'fail', 
        detail: destinationExists 
          ? `Auto-provisioned in ${wafRegion}` 
          : `Failed to auto-provision in ${wafRegion}. Check Lambda execution role permissions (iam:CreateRole, iam:PutRolePolicy, iam:AttachRolePolicy, lambda:CreateFunction, lambda:AddPermission, logs:PutDestination, logs:PutDestinationPolicy).`
      });
    } catch (provisionErr: any) {
      destinationExists = false;
      steps.push({ 
        step: 'destination-auto-provision', 
        status: 'fail', 
        detail: `Error: ${provisionErr.name || 'Unknown'}: ${provisionErr.message || 'Auto-provision failed'}. Region: ${wafRegion}`
      });
    }
  } else {
    steps.push({ step: 'destination-auto-provision', status: 'skip', detail: 'Destination already exists' });
  }
  
  steps.push({ step: 'destination-exists', status: destinationExists ? 'ok' : 'fail', detail: destinationExists ? `${destinationArn} (region=${wafRegion})` : `NOT FOUND: ${destinationArn} (region=${wafRegion})` });

  // Test CloudWatch Logs role
  let cloudWatchLogsRoleArn = '';
  try {
    const iamClient = new IAMClient({ region: 'us-east-1', credentials });
    const roleInfo = await iamClient.send(new GetRoleCommand({ RoleName: CLOUDWATCH_LOGS_ROLE_NAME }));
    cloudWatchLogsRoleArn = `arn:aws:iam::${customerAwsAccountId}:role/${CLOUDWATCH_LOGS_ROLE_NAME}`;
    
    // Check trust policy
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
  
  // Support "all" to scan WAFs across all accounts
  let accounts: any[];
  if (accountId === 'all') {
    accounts = await prisma.awsCredential.findMany({
      where: { organization_id: organizationId, is_active: true },
    });
    if (accounts.length === 0) {
      return error('No active AWS accounts found', 404);
    }
  } else {
    // Get AWS credentials for the specific customer account
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    if (!account) {
      return error('AWS account not found', 404);
    }
    accounts = [account];
  }
  
  // Scan ALL supported regions to find WAFs
  // Use concurrency-limited parallel scanning to avoid OOM (max 5 concurrent region scans)
  const regions = [...SUPPORTED_REGIONS];
  const SCAN_CONCURRENCY = 5;
  
  const allWebAcls: any[] = [];
  
  for (const account of accounts) {
    const acctLabel = account.account_name || account.account_id || account.id;
    
    // Pre-warm credential cache with a single AssumeRole call
    // All regions share the same credentials (roleArn:externalId), so one call suffices
    try {
      await resolveAwsCredentials(account, 'us-east-1');
    } catch (err) {
      logger.warn('Failed to pre-warm credentials', { error: err, account: acctLabel });
      continue; // Skip this account entirely if we can't assume role
    }
    
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
            AccountId: account.account_id || account.id,
            AccountName: account.account_name,
          })));
        }
      } catch (err: any) {
        // If token is invalid, invalidate cache and retry once
        if (err.name === 'UnrecognizedClientException' || err.__type === 'UnrecognizedClientException') {
          logger.warn('Invalid STS token for CLOUDFRONT WAFs, invalidating cache and retrying', { account: acctLabel });
          invalidateAssumeRoleCache(account.role_arn || undefined);
          try {
            const retryCreds = await resolveAwsCredentials(account, 'us-east-1');
            const retryCredentials = toAwsCredentials(retryCreds);
            const retryWafClient = new WAFV2Client({ region: 'us-east-1', credentials: retryCredentials });
            const cloudfrontWafs = await retryWafClient.send(new ListWebACLsCommand({ Scope: 'CLOUDFRONT' }));
            if (cloudfrontWafs.WebACLs) {
              allWebAcls.push(...cloudfrontWafs.WebACLs.map(waf => ({
                ...waf, Scope: 'CLOUDFRONT', Region: 'global',
                AccountId: account.account_id || account.id, AccountName: account.account_name,
              })));
            }
          } catch (retryErr) {
            logger.warn('Retry also failed for CLOUDFRONT WAFs', { error: retryErr, account: acctLabel });
          }
        } else {
          logger.warn('Failed to list CLOUDFRONT WAFs', { error: err, account: acctLabel });
        }
      }
    } catch (err) {
      logger.warn('Failed to get credentials for us-east-1 (CLOUDFRONT WAFs)', { error: err, account: acctLabel });
    }
    
    // Second: Scan REGIONAL WAFs with concurrency limit to avoid OOM
    for (let i = 0; i < regions.length; i += SCAN_CONCURRENCY) {
      const batch = regions.slice(i, i + SCAN_CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (region) => {
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
            AccountId: account.account_id || account.id,
            AccountName: account.account_name,
          }));
        })
      );
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          allWebAcls.push(...result.value);
        } else if (result.status === 'rejected') {
          const err = result.reason;
          // If token is invalid on first region batch, invalidate cache (will get fresh creds on next batch)
          if (err?.name === 'UnrecognizedClientException' || err?.__type === 'UnrecognizedClientException') {
            logger.warn('Invalid STS token scanning region, invalidating cache', { error: err?.message, account: acctLabel });
            invalidateAssumeRoleCache(account.role_arn || undefined);
          } else {
            logger.warn('Failed to scan region for WAFs', { error: result.reason, account: acctLabel });
          }
        }
      }
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
      status: 'disabled',
      subscription_filter: null,
      updated_at: new Date(),
    },
  });
  
  return success({ message: 'WAF monitoring disabled' });
}
