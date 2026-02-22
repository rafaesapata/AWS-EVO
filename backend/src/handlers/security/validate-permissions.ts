/**
 * AWS Lambda Handler for validate-permissions
 * 
 * Valida permissões IAM necessárias para operações do sistema
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, safeHandler } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { logger } from '../../lib/logger.js';
import { IAMClient, SimulatePrincipalPolicyCommand, type SimulatePolicyResponse } from '@aws-sdk/client-iam';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

const AWS_REGION = 'us-east-1';

interface ValidatePermissionsRequest {
  accountId: string;
  actions?: string[];
}

// Core platform permissions (Resource: *)
const CORE_PERMISSIONS = [
  'ec2:DescribeInstances',
  'ec2:DescribeSecurityGroups',
  'rds:DescribeDBInstances',
  's3:ListAllMyBuckets',
  's3:GetBucketLocation',
  'guardduty:ListDetectors',
  'guardduty:GetFindings',
  'cloudtrail:LookupEvents',
  'cloudwatch:GetMetricStatistics',
  'cloudwatch:ListMetrics',
  'iam:ListUsers',
  'iam:ListRoles',
  'organizations:DescribeOrganization',
  'organizations:ListAccounts',
  'ce:GetCostAndUsage',
  'wellarchitected:ListWorkloads',
] as const;

// WAF Monitoring permissions (Resource: *)
const WAF_GLOBAL_PERMISSIONS = [
  'wafv2:GetWebACL',
  'wafv2:GetLoggingConfiguration',
  'wafv2:PutLoggingConfiguration',
  'wafv2:ListWebACLs',
  'logs:PutResourcePolicy',
  'logs:DescribeResourcePolicies',
  // IAM permissions needed for WAF Service-Linked Role (SLR) management.
  // Without the SLR, PutLoggingConfiguration fails with a misleading AccessDeniedException.
  'iam:GetRole',
  'iam:CreateServiceLinkedRole',
] as const;

// WAF log permissions scoped to aws-waf-logs-* log groups in the CloudFormation template.
// SimulatePrincipalPolicy returns implicitDeny for these when tested with Resource: *,
// so they must be simulated separately with matching resource ARNs.
const WAF_LOGS_SCOPED_PERMISSIONS = [
  'logs:CreateLogGroup',
  'logs:PutSubscriptionFilter',
  'logs:DeleteSubscriptionFilter',
  'logs:DescribeSubscriptionFilters',
  'logs:PutRetentionPolicy',
] as const;

const REQUIRED_PERMISSIONS: string[] = [
  ...CORE_PERMISSIONS,
  ...WAF_GLOBAL_PERMISSIONS,
  ...WAF_LOGS_SCOPED_PERMISSIONS,
];

/** Convert STS assumed-role session ARN to IAM role ARN for SimulatePrincipalPolicy */
function toIamRoleArn(arn: string): string {
  const match = arn.match(/^arn:aws:sts::(\d+):assumed-role\/([^/]+)\/.+$/);
  return match ? `arn:aws:iam::${match[1]}:role/${match[2]}` : arn;
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
  
  logger.info('Validate Permissions started', { 
    organizationId,
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  try {
    const body: ValidatePermissionsRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, actions = REQUIRED_PERMISSIONS } = body;
    
    if (!accountId) {
      return error('Missing required parameter: accountId', 400);
    }
    
    const prisma = getPrismaClient();
    
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return error('AWS account not found', 404);
    }
    
    const resolvedCreds = await resolveAwsCredentials(account, AWS_REGION);
    const credentials = toAwsCredentials(resolvedCreds);
    
    // Obter identidade atual
    const stsClient = new STSClient({ region: AWS_REGION, credentials });
    
    const identityResponse = await stsClient.send(new GetCallerIdentityCommand({}));
    const rawArn = identityResponse.Arn!;
    const principalArn = toIamRoleArn(rawArn);
    
    logger.info('Validating permissions for principal', { 
      organizationId, 
      accountId, 
      rawArn,
      principalArn,
      actionsCount: actions.length 
    });
    
    const iamClient = new IAMClient({ region: AWS_REGION, credentials });
    
    // Separate WAF scoped permissions from global ones for accurate simulation.
    // CloudFormation template scopes logs:* actions to aws-waf-logs-* log groups,
    // so SimulatePrincipalPolicy with Resource: * returns implicitDeny for those.
    const scopedPermSet = new Set<string>(WAF_LOGS_SCOPED_PERMISSIONS as unknown as string[]);
    const globalActions = actions.filter(a => !scopedPermSet.has(a));
    const scopedActions = actions.filter(a => scopedPermSet.has(a));
    
    const simulationPromises: Promise<SimulatePolicyResponse>[] = [
      iamClient.send(new SimulatePrincipalPolicyCommand({
        PolicySourceArn: principalArn,
        ActionNames: globalActions,
        ResourceArns: ['*'],
      })),
    ];
    
    if (scopedActions.length > 0) {
      const awsAccountId = identityResponse.Account!;
      const logGroupArn = `arn:aws:logs:${AWS_REGION}:${awsAccountId}:log-group:aws-waf-logs-*`;
      simulationPromises.push(
        iamClient.send(new SimulatePrincipalPolicyCommand({
          PolicySourceArn: principalArn,
          ActionNames: scopedActions,
          ResourceArns: [logGroupArn],
        }))
      );
    }
    
    const simulateResponses = await Promise.all(simulationPromises);
    
    // Merge all evaluation results
    const allEvaluationResults = simulateResponses.flatMap(r => r.EvaluationResults || []);
    
    // Processar resultados
    const results = allEvaluationResults.map(result => ({
      action: result.EvalActionName,
      decision: result.EvalDecision,
      allowed: result.EvalDecision === 'allowed',
      matchedStatements: result.MatchedStatements?.length || 0,
    }));
    
    const allowedCount = results.filter(r => r.allowed).length;
    const deniedCount = results.filter(r => !r.allowed).length;
    const missingPermissions = results.filter(r => !r.allowed).map(r => r.action);
    
    const allPermissionsValid = deniedCount === 0;
    
    logger.info('Permissions validation completed', { 
      organizationId,
      accountId,
      principalArn,
      totalPermissions: results.length,
      allowedCount,
      deniedCount,
      validationSuccess: allPermissionsValid
    });
    
    return success({
      success: true,
      valid: allPermissionsValid,
      principalArn,
      summary: {
        total: results.length,
        allowed: allowedCount,
        denied: deniedCount,
        percentage: results.length > 0 ? Math.round((allowedCount / results.length) * 100) : 0,
      },
      results,
      missingPermissions,
    });
    
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Validate Permissions error', err as Error, { 
      organizationId,
      userId: user.sub,
      requestId: context.awsRequestId,
      errorMessage: errMsg,
    });
    
    // Return actionable error messages for known cases
    if (errMsg.includes('SimulatePrincipalPolicy')) {
      return error('The IAM role does not have permission to simulate policies (iam:SimulatePrincipalPolicy). Please add this permission to the role.', 403);
    }
    if (errMsg.includes('AccessDenied') || errMsg.includes('is not authorized')) {
      return error('Access denied. Please verify the IAM role has sufficient permissions.', 403);
    }
    
    return error('An unexpected error occurred. Please try again.', 500);
  }
});
