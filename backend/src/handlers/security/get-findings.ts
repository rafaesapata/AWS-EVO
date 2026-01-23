import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler para obter findings
 * AWS Lambda Handler for get-findings
 * 
 * DEMO MODE: Suporta modo demonstração para organizações com demo_mode=true
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient, withTenantIsolation } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { isOrganizationInDemoMode, generateDemoSecurityFindings } from '../../lib/demo-data-service.js';

interface GetFindingsRequest {
  severity?: string;
  status?: string;
  service?: string;
  category?: string;
  scan_type?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
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
  
  logger.info('Get findings started', { 
    organizationId,
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  try {
    const prisma = getPrismaClient();
    
    // Check for Demo Mode (FAIL-SAFE: returns false on any error)
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    
    if (isDemo === true) {
      // Return demo data for organizations in demo mode
      logger.info('Returning demo findings', {
        organizationId,
        isDemo: true,
        requestId: context.awsRequestId
      });
      
      const demoFindings = generateDemoSecurityFindings();
      const critical = demoFindings.filter(f => f.severity === 'critical').length;
      const high = demoFindings.filter(f => f.severity === 'high').length;
      const medium = demoFindings.filter(f => f.severity === 'medium').length;
      const low = demoFindings.filter(f => f.severity === 'low').length;
      
      return success({
        _isDemo: true,
        findings: demoFindings.map(f => ({
          ...f,
          organization_id: organizationId,
          aws_account_id: 'demo-account',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
        pagination: {
          total: demoFindings.length,
          limit: 50,
          offset: 0,
          has_more: false,
        },
        summary: {
          total: demoFindings.length,
          critical,
          high,
          medium,
          low,
        },
      });
    }
    
    // Parse query parameters - support both REST API (queryStringParameters) and HTTP API (rawQueryString)
    const params = getHttpMethod(event) === 'GET'
      ? (event.queryStringParameters || parseQueryParams(event.rawQueryString || ''))
      : (event.body ? JSON.parse(event.body) : {});
    
    const {
      severity,
      status,
      service,
      category,
      scan_type,
      limit = 50,
      offset = 0,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = params as GetFindingsRequest;
    
    // Build where clause with tenant isolation
    const where = {
      organization_id: organizationId,
      ...(severity && { severity }),
      ...(status && { status }),
      ...(service && { service }),
      ...(category && { category }),
      ...(scan_type && { scan_type }),
    };
    
    // Get findings with pagination
    const [findings, total] = await Promise.all([
      prisma.finding.findMany({
        where,
        take: Math.min(limit, 100), // Max 100 per request
        skip: offset,
        orderBy: {
          [sort_by]: sort_order,
        },
      }),
      prisma.finding.count({ where }),
    ]);
    
    // Get summary statistics (case-insensitive severity)
    const stats = await prisma.finding.groupBy({
      by: ['severity'],
      where: { organization_id: organizationId },
      _count: true,
    });
    
    // Normalize severity counts (handle both upper and lower case)
    const normalizedStats: Record<string, number> = {};
    stats.forEach(s => {
      const key = (s.severity || 'low').toLowerCase();
      normalizedStats[key] = (normalizedStats[key] || 0) + s._count;
    });
    
    const summary = {
      total,
      critical: normalizedStats['critical'] || 0,
      high: normalizedStats['high'] || 0,
      medium: normalizedStats['medium'] || 0,
      low: normalizedStats['low'] || 0,
    };
    
    logger.info('Findings retrieved successfully', { 
      organizationId,
      findingsReturned: findings.length,
      totalFindings: total,
      filters: { severity, status, service, category, scan_type }
    });
    
    return success({
      findings,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + findings.length < total,
      },
      summary,
    });
    
  } catch (err) {
    logger.error('Get findings error', err as Error, { 
      organizationId,
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}

/**
 * Parse query string parameters
 */
function parseQueryParams(queryString: string): Record<string, any> {
  if (!queryString) return {};
  
  const params: Record<string, any> = {};
  const pairs = queryString.split('&');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      const decodedKey = decodeURIComponent(key);
      const decodedValue = decodeURIComponent(value);
      
      // Convert numeric strings to numbers
      if (/^\d+$/.test(decodedValue)) {
        params[decodedKey] = parseInt(decodedValue, 10);
      } else {
        params[decodedKey] = decodedValue;
      }
    }
  }
  
  return params;
}
