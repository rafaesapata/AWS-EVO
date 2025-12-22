import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../../lib/logging.js';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

interface TVTokenRequest {
  token: string;
  deviceId: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body: TVTokenRequest = JSON.parse(event.body || '{}');
    const { token, deviceId } = body;

    if (!token || !deviceId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'token and deviceId are required' }) };
    }

    // Buscar token no banco
    const tvToken = await prisma.tvDisplayToken.findFirst({
      where: {
        token,
        is_active: true,
        expires_at: { gt: new Date() }
      }
    });

    if (!tvToken) {
      // Registrar tentativa falha
      await prisma.securityEvent.create({
        data: {
          organization_id: 'default',
          event_type: 'TV_TOKEN_INVALID',
          severity: 'MEDIUM',
          description: 'Invalid TV token attempt',
          metadata: { deviceId, tokenPrefix: token.substring(0, 8) }
        }
      });

      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) };
    }

    // Verificar rate limiting
    const recentRequests = await prisma.tvTokenUsage.count({
      where: {
        token_id: tvToken.id,
        used_at: { gt: new Date(Date.now() - 60000) } // último minuto
      }
    });

    if (recentRequests > 60) {
      return { statusCode: 429, body: JSON.stringify({ error: 'Rate limit exceeded' }) };
    }

    // Registrar uso
    await prisma.tvTokenUsage.create({
      data: {
        token_id: tvToken.id,
        ip_address: event.requestContext.identity?.sourceIp
      }
    });

    // Atualizar último uso (campo não existe no schema, removendo)
    // await prisma.tvDisplayToken.update({
    //   where: { id: tvToken.id },
    //   data: { lastUsedAt: new Date() }
    // });

    // Gerar token de sessão temporário
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionExpiry = new Date(Date.now() + 3600000); // 1 hora

    await prisma.tvSession.create({
      data: {
        token_id: tvToken.id,
        session_data: { sessionToken, deviceId }
      }
    });

    // Buscar dados do dashboard configurado
    const dashboardData = await getDashboardData('default', tvToken.organization_id);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        sessionToken,
        expiresAt: sessionExpiry.toISOString(),
        organization: {
          id: tvToken.organization_id,
          name: 'Organization'
        },
        dashboard: {
          id: 'default',
          name: 'Default Dashboard',
          type: 'security',
          config: {}
        },
        data: dashboardData,
        refreshInterval: 60
      })
    };
  } catch (error) {
    logger.error('TV token verification error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

async function getDashboardData(dashboardId: string | null, organizationId: string): Promise<Record<string, unknown>> {
  if (!dashboardId) {
    // Retornar dados padrão
    return getDefaultDashboardData(organizationId);
  }

  const dashboard = await prisma.dashboard.findUnique({
    where: { id: dashboardId }
  });

  if (!dashboard) {
    return getDefaultDashboardData(organizationId);
  }

  // Buscar dados baseado no tipo de dashboard (usando config como fallback)
  const dashboardType = (dashboard.config as any)?.type || 'SECURITY_OVERVIEW';
  switch (dashboardType) {
    case 'SECURITY_OVERVIEW':
      return getSecurityOverviewData(organizationId);
    case 'COST_OVERVIEW':
      return getCostOverviewData(organizationId);
    case 'COMPLIANCE_STATUS':
      return getComplianceStatusData(organizationId);
    default:
      return getDefaultDashboardData(organizationId);
  }
}

async function getDefaultDashboardData(organizationId: string): Promise<Record<string, unknown>> {
  const [securityStats, costStats, complianceStats] = await Promise.all([
    getSecurityStats(organizationId),
    getCostStats(organizationId),
    getComplianceStats(organizationId)
  ]);

  return { security: securityStats, cost: costStats, compliance: complianceStats };
}

async function getSecurityOverviewData(organizationId: string): Promise<Record<string, unknown>> {
  return { security: await getSecurityStats(organizationId) };
}

async function getCostOverviewData(organizationId: string): Promise<Record<string, unknown>> {
  return { cost: await getCostStats(organizationId) };
}

async function getComplianceStatusData(organizationId: string): Promise<Record<string, unknown>> {
  return { compliance: await getComplianceStats(organizationId) };
}

async function getSecurityStats(organizationId: string): Promise<Record<string, unknown>> {
  const [openFindings, recentScans] = await Promise.all([
    prisma.securityFinding.groupBy({
      by: ['severity'],
      where: { organization_id: organizationId, status: 'open' },
      _count: true
    }),
    prisma.securityScan.findMany({
      where: { organization_id: organizationId },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: { id: true, scan_type: true, status: true, created_at: true }
    })
  ]);

  return {
    findingsBySeverity: openFindings.reduce((acc, f) => ({ ...acc, [f.severity]: (f._count || 0) }), {}),
    recentScans,
    totalOpenFindings: openFindings.reduce((sum, f) => sum + f._count, 0)
  };
}

async function getCostStats(organizationId: string): Promise<Record<string, unknown>> {
  const accounts = await prisma.awsAccount.findMany({
    where: { organization_id: organizationId },
    select: { id: true, account_name: true }
  });

  const costData = await prisma.dailyCost.findMany({
    where: {
      account_id: { in: accounts.map(a => a.id) },
      date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    },
    orderBy: { date: 'desc' }
  });

  const totalCost = costData.reduce((sum, c) => sum + c.cost, 0);

  return {
    totalLast30Days: totalCost,
    accountCount: accounts.length,
    trend: costData.slice(0, 7).map(c => ({ date: c.date, amount: c.cost }))
  };
}

async function getComplianceStats(organizationId: string): Promise<Record<string, unknown>> {
  const complianceScans = await prisma.complianceScan.findMany({
    where: { organization_id: organizationId },
    orderBy: { created_at: 'desc' },
    take: 1
  });

  const latestScan = complianceScans[0];

  return {
    lastScanDate: latestScan?.created_at,
    overallScore: 85, // Mock score
    frameworks: { 'CIS': 90, 'PCI-DSS': 80 }
  };
}
