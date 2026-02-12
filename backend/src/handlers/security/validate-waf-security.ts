import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Validate WAF Security
 * AWS Lambda Handler for validate-waf-security
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, safeHandler} from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { WAFV2Client, ListWebACLsCommand, GetWebACLCommand } from '@aws-sdk/client-wafv2';

interface ValidateWAFRequest {
  accountId: string;
  region?: string;
  scope?: 'REGIONAL' | 'CLOUDFRONT';
}

export const handler = safeHandler(async (
  event: AuthorizedEvent,
  context: LambdaContext
) => {
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationIdWithImpersonation(event, user);
  
  logger.info('Validate WAF Security started', { 
    organizationId,
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const body: ValidateWAFRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId, region: requestedRegion, scope = 'REGIONAL' } = body;
    
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
    
    // Usar região solicitada, ou primeira região da conta, ou padrão
    const accountRegions = account.regions as string[] | null;
    const region = requestedRegion || 
                   (accountRegions && accountRegions.length > 0 ? accountRegions[0] : 'us-east-1');
    
    const resolvedCreds = await resolveAwsCredentials(account, region);
    
    const wafClient = new WAFV2Client({
      region: scope === 'CLOUDFRONT' ? 'us-east-1' : region,
      credentials: toAwsCredentials(resolvedCreds),
    });
    
    const listResponse = await wafClient.send(new ListWebACLsCommand({ Scope: scope }));
    
    const webACLs = listResponse.WebACLs || [];
    const analysis: any[] = [];
    
    for (const acl of webACLs) {
      const getResponse = await wafClient.send(new GetWebACLCommand({
        Name: acl.Name!,
        Scope: scope,
        Id: acl.Id!,
      }));
      
      const webACL = getResponse.WebACL!;
      const issues: string[] = [];
      
      if (!webACL.Rules || webACL.Rules.length === 0) {
        issues.push('No rules configured');
      }
      
      if (webACL.DefaultAction?.Allow) {
        issues.push('Default action is Allow (should be Block)');
      }
      
      analysis.push({
        name: webACL.Name,
        id: webACL.Id,
        rulesCount: webACL.Rules?.length || 0,
        defaultAction: webACL.DefaultAction?.Allow ? 'Allow' : 'Block',
        issues,
        status: issues.length === 0 ? 'secure' : 'needs_review',
      });
    }
    
    logger.info('WAF security validation completed', { 
      organizationId, 
      accountId, 
      region,
      scope,
      webACLsCount: webACLs.length,
      secureCount: analysis.filter(a => a.status === 'secure').length,
      needsReviewCount: analysis.filter(a => a.status === 'needs_review').length
    });
    
    return success({
      success: true,
      webACLs: analysis,
      summary: {
        total: webACLs.length,
        secure: analysis.filter(a => a.status === 'secure').length,
        needsReview: analysis.filter(a => a.status === 'needs_review').length,
      },
    });
    
  } catch (err) {
    logger.error('Validate WAF Security error', err as Error, { 
      organizationId,
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    return error('An unexpected error occurred. Please try again.', 500);
  }
});
