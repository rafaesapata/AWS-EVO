import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { getPrismaClient } from '../../lib/database.js';
import { success, error, badRequest, corsOptions, tooManyRequests } from '../../lib/response.js';
import { getOrigin } from '../../lib/middleware.js';
import * as crypto from 'crypto';

interface TVTokenRequest {
  token: string;
  deviceId: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  // Note: TV token verification doesn't use standard Cognito auth
  // It uses its own token-based authentication

  try {
    const prisma = getPrismaClient();
    const body: TVTokenRequest = JSON.parse(event.body || '{}');
    const { token, deviceId } = body;

    if (!token || !deviceId) {
      return badRequest('token and deviceId are required', undefined, origin);
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
      await prisma.securityEvent.create({
        data: {
          organization_id: 'default',
          event_type: 'TV_TOKEN_INVALID',
          severity: 'MEDIUM',
          description: 'Invalid TV token attempt',
          metadata: { deviceId, tokenPrefix: token.substring(0, 8) }
        }
      });
      return error('Invalid or expired token', 401, undefined, origin);
    }

    // Rate limiting
    const recentRequests = await prisma.tvTokenUsage.count({
      where: {
        token_id: tvToken.id,
        used_at: { gt: new Date(Date.now() - 60000) }
      }
    });

    if (recentRequests > 60) {
      return tooManyRequests('Rate limit exceeded', 60, origin);
    }

    // Registrar uso
    const sourceIp = event.requestContext?.identity?.sourceIp || 
                     event.headers?.['x-forwarded-for']?.split(',')[0] || 'unknown';
    await prisma.tvTokenUsage.create({
      data: { token_id: tvToken.id, ip_address: sourceIp }
    });

    // Gerar token de sessão temporário
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionExpiry = new Date(Date.now() + 3600000);

    await prisma.tvSession.create({
      data: { token_id: tvToken.id, session_data: { sessionToken, deviceId } }
    });

    // Buscar dados do dashboard
    const dashboardData = await getDashboardData(tvToken.organization_id);

    return success({
      sessionToken,
      expiresAt: sessionExpiry.toISOString(),
      organization: { id: tvToken.organization_id },
      dashboard: { id: 'default', name: 'Default Dashboard', type: 'security' },
      data: dashboardData,
      refreshInterval: 60
    }, 200, origin);
  } catch (err) {
    logger.error('TV token verification error:', err);
    return error('Internal server error', 500, undefined, origin);
  }
}

async function getDashboardData(organizationId: string): Promise<Record<string, unknown>> {
  const prisma = getPrismaClient();
  
  const [securityStats, costStats] = await Promise.all([
    getSecurityStats(organizationId),
    getCostStats(organizationId)
  ]);

  return { security: securityStats, cost: costStats };
}

async function getSecurityStats(organizationId: string): Promise<Record<string, unknown>> {
  const prisma = getPrismaClient();
  
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
    findingsBySeverity: openFindings.reduce((acc, f) => ({ ...acc, [f.severity]: f._count }), {}),
    recentScans,
    totalOpenFindings: openFindings.reduce((sum, f) => sum + f._count, 0)
  };
}

async function getCostStats(organizationId: string): Promise<Record<string, unknown>> {
  const prisma = getPrismaClient();
  
  const accounts = await prisma.awsAccount.findMany({
    where: { organization_id: organizationId },
    select: { id: true, account_name: true }
  });

  // Aggregate costs by date for the organization
  const costData = await prisma.dailyCost.groupBy({
    by: ['date'],
    where: {
      organization_id: organizationId,
      date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    },
    _sum: { cost: true },
    orderBy: { date: 'desc' }
  });

  return {
    totalLast30Days: costData.reduce((sum, c) => sum + Number(c._sum.cost || 0), 0),
    accountCount: accounts.length,
    trend: costData.slice(0, 7).map(c => ({ date: c.date, amount: Number(c._sum.cost || 0) }))
  };
}
