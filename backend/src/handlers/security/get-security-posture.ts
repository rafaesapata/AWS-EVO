import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Get Security Posture
 * AWS Lambda Handler for get-security-posture
 * 
 * DEMO MODE: Suporta modo demonstração para organizações com demo_mode=true
 * 
 * SEGURANÇA: Dados demo são gerados APENAS no backend, nunca no frontend.
 * O frontend recebe dados completos (incluindo findings) e apenas renderiza.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions, safeHandler} from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { isOrganizationInDemoMode, generateDemoSecurityFindings } from '../../lib/demo-data-service.js';
import { calculatePostureScore, type FindingForScoring } from '../../lib/security-engine/posture-scoring.js';

export const handler = safeHandler(async (
  event: AuthorizedEvent,
  context: LambdaContext
) => {
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationIdWithImpersonation(event, user);
  
  // Parse request body for accountId and provider
  let accountId: string | undefined;
  let provider: string | undefined;
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    accountId = body.accountId;
    provider = body.provider; // 'AWS' or 'AZURE'
  } catch {
    // Ignore parse errors
  }
  
  logger.info('Get Security Posture started', { 
    organizationId,
    accountId: accountId || 'all',
    provider: provider || 'all',
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  try {
    const prisma = getPrismaClient();
    
    // Check for Demo Mode (FAIL-SAFE: returns false on any error)
    const isDemo = await isOrganizationInDemoMode(prisma, organizationId);
    
    if (isDemo === true) {
      // Return demo data for organizations in demo mode
      // IMPORTANTE: Todos os dados demo são gerados NO BACKEND
      // O frontend apenas renderiza, nunca gera dados demo
      logger.info('Returning demo security posture with findings', {
        organizationId,
        isDemo: true,
        requestId: context.awsRequestId
      });
      
      // Gerar findings demo do backend
      const demoFindings = generateDemoSecurityFindings();
      
      return success({
        _isDemo: true,
        success: true,
        posture: {
          overallScore: 72.0,
          riskLevel: 'medium',
          findings: {
            critical: 2,
            high: 5,
            medium: 8,
            low: 15,
            total: 30,
          },
          calculatedAt: new Date().toISOString(),
          accountId: accountId || 'all',
        },
        // Incluir findings completos para o frontend renderizar
        demoFindings: demoFindings,
        // Compliance scores demo
        complianceScores: {
          'CIS AWS': 78,
          'LGPD': 85,
          'PCI-DSS': 72,
          'SOC 2': 88
        }
      });
    }
    
    // Base filter - by organization and optionally by account
    const baseFilter: any = { 
      organization_id: organizationId,
    };
    
    // Filter by specific account if provided - multi-cloud compatible
    if (accountId) {
      if (provider === 'AZURE') {
        baseFilter.azure_credential_id = accountId;
      } else if (provider === 'AWS') {
        baseFilter.aws_account_id = accountId;
      } else {
        baseFilter.OR = [
          { aws_account_id: accountId },
          { azure_credential_id: accountId }
        ];
      }
    }
    
    // Fetch all findings for scoring (select only needed fields)
    const allFindings = await prisma.finding.findMany({
      where: baseFilter,
      select: {
        severity: true,
        suppressed: true,
        first_seen: true,
      },
    });
    
    // Get distinct services for coverage calculation
    const serviceStats = await prisma.finding.groupBy({
      by: ['service'],
      where: { ...baseFilter, suppressed: false },
    });
    const scannedServices = serviceStats.length;
    const totalServices = 38; // Security Engine V3 has 38 scanners
    
    // Get previous posture for trend calculation
    let previousCounts = null;
    if (!accountId) {
      const previousPosture = await prisma.securityPosture.findFirst({
        where: { organization_id: organizationId },
        orderBy: { calculated_at: 'desc' },
      });
      if (previousPosture) {
        previousCounts = {
          critical: previousPosture.critical_findings,
          high: previousPosture.high_findings,
          medium: previousPosture.medium_findings,
          low: previousPosture.low_findings,
        };
      }
    }
    
    // Calculate posture score using the new scoring module
    const findingsForScoring: FindingForScoring[] = allFindings.map(f => ({
      severity: f.severity || 'low',
      suppressed: f.suppressed ?? false,
      first_seen: f.first_seen,
    }));
    
    const posture = calculatePostureScore({
      findings: findingsForScoring,
      scannedServices,
      totalServices,
      previousCounts,
    });
    
    // Save posture (only if not filtering by account - save aggregate)
    if (!accountId) {
      await prisma.securityPosture.create({
        data: {
          organization_id: organizationId,
          overall_score: posture.overallScore,
          compliance_score: posture.overallScore,
          critical_findings: posture.counts.critical,
          high_findings: posture.counts.high,
          medium_findings: posture.counts.medium,
          low_findings: posture.counts.low,
          risk_level: posture.riskLevel,
          calculated_at: new Date(),
        },
      });
    }
    
    logger.info('Security posture calculated', { 
      organizationId,
      accountId: accountId || 'all',
      overallScore: posture.overallScore,
      riskLevel: posture.riskLevel,
      totalFindings: posture.counts.total,
    });
    
    return success({
      success: true,
      posture: {
        overallScore: posture.overallScore,
        riskLevel: posture.riskLevel,
        findings: {
          critical: posture.counts.critical,
          high: posture.counts.high,
          medium: posture.counts.medium,
          low: posture.counts.low,
          total: posture.counts.total,
          suppressed: posture.counts.suppressed,
        },
        serviceCoverage: posture.serviceCoverage,
        trend: posture.trend,
        breakdown: posture.breakdown,
        calculatedAt: new Date().toISOString(),
        accountId: accountId || 'all',
      },
    });
    
  } catch (err) {
    logger.error('Get Security Posture error', err as Error, { 
      organizationId,
      accountId: accountId || 'all',
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    return error('An unexpected error occurred. Please try again.', 500);
  }
});
