import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler para obter findings
 * AWS Lambda Handler for get-findings
 * 
 * DEMO MODE: Suporta modo demonstração para organizações com demo_mode=true
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, safeHandler } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient, withTenantIsolation } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { isOrganizationInDemoMode, generateDemoSecurityFindings } from '../../lib/demo-data-service.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';

interface GetFindingsRequest {
  severity?: string;
  status?: string;
  service?: string;
  category?: string;
  scan_type?: string;
  suppressed?: boolean;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  action?: 'suppress' | 'unsuppress';
  findingId?: string;
  reason?: string;
  expiresAt?: string;
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
      
      // Map demo findings to match the ScanFinding interface expected by frontend
      const mappedFindings = demoFindings.map(f => ({
        id: f.id,
        organization_id: organizationId,
        aws_account_id: 'demo-account',
        severity: f.severity,
        description: f.description,
        details: {
          title: f.title,
          check_name: f.title,
          resource_type: f.service,
          region: 'us-east-1',
        },
        status: f.status,
        source: 'security-scan',
        resource_id: f.resource_id,
        resource_arn: `arn:aws:${f.service.toLowerCase()}:us-east-1:demo-account:${f.resource_id}`,
        scan_type: 'deep',
        service: f.service,
        category: getCategoryForService(f.service),
        compliance: getComplianceForSeverity(f.severity),
        remediation: JSON.stringify({
          description: f.remediation,
          steps: [f.remediation],
          estimated_effort: f.severity === 'critical' ? 'high' : f.severity === 'high' ? 'medium' : 'low',
          automation_available: f.service === 'S3' || f.service === 'IAM',
        }),
        risk_vector: getRiskVectorForService(f.service),
        evidence: null,
        remediation_ticket_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _isDemo: true,
      }));
      
      return success({
        _isDemo: true,
        findings: mappedFindings,
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
      suppressed,
      limit = 50,
      offset = 0,
      sort_by = 'created_at',
      sort_order = 'desc',
      action,
      findingId,
      reason,
      expiresAt,
    } = params as GetFindingsRequest;
    
    // Handle suppress/unsuppress actions
    if (action === 'suppress' && findingId) {
      const finding = await prisma.finding.findFirst({
        where: { id: findingId, organization_id: organizationId },
      });
      if (!finding) {
        return error('Finding not found', 404);
      }
      
      await prisma.finding.update({
        where: { id: findingId },
        data: {
          suppressed: true,
          suppressed_by: user.sub,
          suppressed_at: new Date(),
          suppression_reason: reason || 'No reason provided',
          suppression_expires_at: expiresAt ? new Date(expiresAt) : null,
        },
      });
      
      logAuditAsync({
        organizationId,
        userId: user.sub,
        action: 'SETTINGS_UPDATE',
        resourceType: 'security_scan',
        resourceId: findingId,
        details: { action: 'suppress', reason, expiresAt },
        ipAddress: getIpFromEvent(event),
        userAgent: getUserAgentFromEvent(event),
      });
      
      logger.info('Finding suppressed', { findingId, userId: user.sub, reason });
      return success({ success: true, action: 'suppress', findingId });
    }
    
    if (action === 'unsuppress' && findingId) {
      const finding = await prisma.finding.findFirst({
        where: { id: findingId, organization_id: organizationId },
      });
      if (!finding) {
        return error('Finding not found', 404);
      }
      
      await prisma.finding.update({
        where: { id: findingId },
        data: {
          suppressed: false,
          suppressed_by: null,
          suppressed_at: null,
          suppression_reason: null,
          suppression_expires_at: null,
        },
      });
      
      logAuditAsync({
        organizationId,
        userId: user.sub,
        action: 'SETTINGS_UPDATE',
        resourceType: 'security_scan',
        resourceId: findingId,
        details: { action: 'unsuppress' },
        ipAddress: getIpFromEvent(event),
        userAgent: getUserAgentFromEvent(event),
      });
      
      logger.info('Finding unsuppressed', { findingId, userId: user.sub });
      return success({ success: true, action: 'unsuppress', findingId });
    }
    
    // Build where clause with tenant isolation
    const where: any = {
      organization_id: organizationId,
      ...(severity && { severity }),
      ...(status && { status }),
      ...(service && { service }),
      ...(category && { category }),
      ...(scan_type && { scan_type }),
    };
    
    // Filter by suppressed state if specified
    if (suppressed !== undefined) {
      where.suppressed = suppressed;
    }
    
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
    return error('An unexpected error occurred. Please try again.', 500);
  }
});

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

/**
 * Helper function to get category based on AWS service
 */
function getCategoryForService(service: string): string {
  const categoryMap: Record<string, string> = {
    'S3': 'Data Protection',
    'EC2': 'Network Security',
    'RDS': 'Data Protection',
    'IAM': 'Identity & Access',
    'CloudTrail': 'Logging & Monitoring',
    'Lambda': 'Compute Security',
    'VPC': 'Network Security',
    'KMS': 'Encryption',
  };
  return categoryMap[service] || 'General Security';
}

/**
 * Helper function to get compliance frameworks based on severity
 */
function getComplianceForSeverity(severity: string): string[] {
  const complianceMap: Record<string, string[]> = {
    'critical': ['CIS AWS Foundations', 'PCI-DSS', 'SOC 2', 'LGPD'],
    'high': ['CIS AWS Foundations', 'PCI-DSS', 'SOC 2'],
    'medium': ['CIS AWS Foundations', 'SOC 2'],
    'low': ['CIS AWS Foundations'],
  };
  return complianceMap[severity] || ['CIS AWS Foundations'];
}

/**
 * Helper function to get risk vector based on AWS service
 */
function getRiskVectorForService(service: string): string {
  const riskMap: Record<string, string> = {
    'S3': 'Data Exposure',
    'EC2': 'Unauthorized Access',
    'RDS': 'Data Breach',
    'IAM': 'Privilege Escalation',
    'CloudTrail': 'Audit Gap',
    'Lambda': 'Code Injection',
    'VPC': 'Network Intrusion',
    'KMS': 'Encryption Weakness',
  };
  return riskMap[service] || 'Security Misconfiguration';
}
