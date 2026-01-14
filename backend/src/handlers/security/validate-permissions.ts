import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Validate Permissions
 * AWS Lambda Handler for validate-permissions
 * 
 * Valida permissões IAM necessárias para operações do sistema
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { IAMClient, SimulatePrincipalPolicyCommand } from '@aws-sdk/client-iam';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

interface ValidatePermissionsRequest {
  accountId: string;
  actions?: string[]; // Lista de ações para validar
}

const REQUIRED_PERMISSIONS = [
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
];

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
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
      return error('Missing required parameter: accountId');
    }
    
    const prisma = getPrismaClient();
    
    const account = await prisma.awsCredential.findFirst({
      where: { id: accountId, organization_id: organizationId, is_active: true },
    });
    
    if (!account) {
      return error('AWS account not found');
    }
    
    const resolvedCreds = await resolveAwsCredentials(account, 'us-east-1');
    
    // Obter identidade atual
    const stsClient = new STSClient({
      region: 'us-east-1',
      credentials: toAwsCredentials(resolvedCreds),
    });
    
    const identityResponse = await stsClient.send(new GetCallerIdentityCommand({}));
    const principalArn = identityResponse.Arn!;
    
    logger.info('Validating permissions for principal', { 
      organizationId, 
      accountId, 
      principalArn,
      actionsCount: actions.length 
    });
    
    // Simular políticas para validar permissões
    const iamClient = new IAMClient({
      region: 'us-east-1',
      credentials: toAwsCredentials(resolvedCreds),
    });
    
    const simulateCommand = new SimulatePrincipalPolicyCommand({
      PolicySourceArn: principalArn,
      ActionNames: actions,
    });
    
    const simulateResponse = await iamClient.send(simulateCommand);
    
    // Processar resultados
    const results = (simulateResponse.EvaluationResults || []).map(result => ({
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
        percentage: Math.round((allowedCount / results.length) * 100),
      },
      results,
      missingPermissions,
    });
    
  } catch (err) {
    logger.error('Validate Permissions error', err as Error, { 
      organizationId,
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
