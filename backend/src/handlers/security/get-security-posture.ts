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
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { isOrganizationInDemoMode, generateDemoSecurityFindings } from '../../lib/demo-data-service.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
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
      status: { in: ['pending', 'active', 'ACTIVE', 'PENDING'] }
    };
    
    // Filter by specific account if provided - multi-cloud compatible
    if (accountId) {
      if (provider === 'AZURE') {
        baseFilter.azure_credential_id = accountId;
      } else if (provider === 'AWS') {
        baseFilter.aws_account_id = accountId;
      } else {
        // No provider specified - try both (for backwards compatibility)
        // Use OR to check both AWS and Azure credential IDs
        baseFilter.OR = [
          { aws_account_id: accountId },
          { azure_credential_id: accountId }
        ];
      }
    }
    
    // Contar findings por severidade (case-insensitive, incluindo pending e active)
    const criticalFindings = await prisma.finding.count({
      where: { 
        ...baseFilter,
        severity: { in: ['critical', 'CRITICAL'] },
      },
    });
    
    const highFindings = await prisma.finding.count({
      where: { 
        ...baseFilter,
        severity: { in: ['high', 'HIGH'] },
      },
    });
    
    const mediumFindings = await prisma.finding.count({
      where: { 
        ...baseFilter,
        severity: { in: ['medium', 'MEDIUM'] },
      },
    });
    
    const lowFindings = await prisma.finding.count({
      where: { 
        ...baseFilter,
        severity: { in: ['low', 'LOW'] },
      },
    });
    
    // Calcular score (0-100)
    const totalFindings = criticalFindings + highFindings + mediumFindings + lowFindings;
    const weightedScore = (criticalFindings * 40) + (highFindings * 25) + (mediumFindings * 10) + (lowFindings * 5);
    const maxPossibleScore = totalFindings > 0 ? totalFindings * 40 : 1;
    const overallScore = Math.max(0, 100 - ((weightedScore / maxPossibleScore) * 100));
    
    // Determinar nível de risco
    let riskLevel: string;
    if (overallScore >= 80) riskLevel = 'low';
    else if (overallScore >= 60) riskLevel = 'medium';
    else if (overallScore >= 40) riskLevel = 'high';
    else riskLevel = 'critical';
    
    // Salvar postura (only if not filtering by account - save aggregate)
    if (!accountId) {
      await prisma.securityPosture.create({
        data: {
          organization_id: organizationId,
          overall_score: overallScore,
          critical_findings: criticalFindings,
          high_findings: highFindings,
          medium_findings: mediumFindings,
          low_findings: lowFindings,
          risk_level: riskLevel,
          calculated_at: new Date(),
        },
      });
    }
    
    logger.info('Security posture calculated', { 
      organizationId,
      accountId: accountId || 'all',
      overallScore: parseFloat(overallScore.toFixed(1)),
      riskLevel,
      totalFindings
    });
    
    return success({
      success: true,
      posture: {
        overallScore: parseFloat(overallScore.toFixed(1)),
        riskLevel,
        findings: {
          critical: criticalFindings,
          high: highFindings,
          medium: mediumFindings,
          low: lowFindings,
          total: totalFindings,
        },
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
}
