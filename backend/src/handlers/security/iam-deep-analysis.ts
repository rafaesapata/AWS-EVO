import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for IAM Deep Analysis
 * AWS Lambda Handler for iam-deep-analysis
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { IAMClient, ListUsersCommand, ListUserPoliciesCommand, ListAttachedUserPoliciesCommand } from '@aws-sdk/client-iam';

interface IAMDeepAnalysisRequest {
  accountId: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationId(user);
  
  logger.info('IAM Deep Analysis started', { 
    organizationId,
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const body: IAMDeepAnalysisRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId } = body;
    
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
    
    const iamClient = new IAMClient({
      region: 'us-east-1',
      credentials: toAwsCredentials(resolvedCreds),
    });
    
    // Listar usuários
    const usersResponse = await iamClient.send(new ListUsersCommand({}));
    const users = usersResponse.Users || [];
    
    const analysis: any[] = [];
    
    for (const iamUser of users) {
      const userName = iamUser.UserName!;
      
      // Listar políticas inline
      const inlinePolicies = await iamClient.send(
        new ListUserPoliciesCommand({ UserName: userName })
      );
      
      // Listar políticas anexadas
      const attachedPolicies = await iamClient.send(
        new ListAttachedUserPoliciesCommand({ UserName: userName })
      );
      
      const issues: string[] = [];
      const recommendations: string[] = [];
      let riskScore = 0;
      
      // Análise 1: Usuário sem MFA
      if (!iamUser.PasswordLastUsed) {
        issues.push('User has never logged in');
        riskScore += 10;
      }
      
      // Análise 2: Muitas políticas inline
      if ((inlinePolicies.PolicyNames?.length || 0) > 3) {
        issues.push(`User has ${inlinePolicies.PolicyNames?.length} inline policies`);
        recommendations.push('Consider using managed policies instead of inline policies');
        riskScore += 15;
      }
      
      // Análise 3: Políticas com permissões amplas
      const hasAdminPolicy = attachedPolicies.AttachedPolicies?.some(
        p => p.PolicyName?.includes('Admin') || p.PolicyName?.includes('FullAccess')
      );
      
      if (hasAdminPolicy) {
        issues.push('User has administrative permissions');
        recommendations.push('Review if admin access is necessary, consider least privilege');
        riskScore += 30;
      }
      
      // Análise 4: Usuário inativo
      const daysSinceLastUse = iamUser.PasswordLastUsed
        ? Math.floor((Date.now() - iamUser.PasswordLastUsed.getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      
      if (daysSinceLastUse > 90) {
        issues.push(`User inactive for ${daysSinceLastUse} days`);
        recommendations.push('Consider disabling or removing inactive user');
        riskScore += 20;
      }
      
      // Determinar nível de risco
      let riskLevel: 'low' | 'medium' | 'high' | 'critical';
      if (riskScore >= 50) riskLevel = 'critical';
      else if (riskScore >= 30) riskLevel = 'high';
      else if (riskScore >= 15) riskLevel = 'medium';
      else riskLevel = 'low';
      
      analysis.push({
        userName,
        userId: iamUser.UserId,
        createdDate: iamUser.CreateDate,
        lastUsed: iamUser.PasswordLastUsed,
        inlinePoliciesCount: inlinePolicies.PolicyNames?.length || 0,
        attachedPoliciesCount: attachedPolicies.AttachedPolicies?.length || 0,
        issues,
        recommendations,
        riskScore,
        riskLevel,
      });
    }
    
    // Ordenar por risk score
    analysis.sort((a, b) => b.riskScore - a.riskScore);
    
    const summary = {
      totalUsers: users.length,
      critical: analysis.filter(a => a.riskLevel === 'critical').length,
      high: analysis.filter(a => a.riskLevel === 'high').length,
      medium: analysis.filter(a => a.riskLevel === 'medium').length,
      low: analysis.filter(a => a.riskLevel === 'low').length,
    };
    
    logger.info('IAM Deep Analysis completed', { 
      organizationId, 
      accountId,
      usersAnalyzed: users.length,
      criticalRisk: summary.critical,
      highRisk: summary.high 
    });
    
    return success({
      success: true,
      analysis,
      summary,
    });
    
  } catch (err) {
    logger.error('IAM Deep Analysis error', err as Error, { 
      organizationId,
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
