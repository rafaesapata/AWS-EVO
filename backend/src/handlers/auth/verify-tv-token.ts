import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logger.js';
import { getPrismaClient } from '../../lib/database.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getOrigin } from '../../lib/middleware.js';

interface TVTokenRequest {
  token: string;
  deviceId?: string;
}

const DEMO_TV_TOKEN_PREFIX = 'demo-tv-';
const DEMO_ORG_ID = 'demo-organization-id';

const DEFAULT_TV_LAYOUT = [
  { widgetId: 'executive' },
  { widgetId: 'security-posture' },
  { widgetId: 'cost-optimization' },
  { widgetId: 'compliance' }
];
const DEFAULT_REFRESH_INTERVAL = 60;

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const prisma = getPrismaClient();
    const body: TVTokenRequest = JSON.parse(event.body || '{}');
    const { token, deviceId = 'unknown' } = body;

    if (!token) {
      return badRequest('token is required', undefined, origin);
    }

    // Check if this is a demo token
    if (token.startsWith(DEMO_TV_TOKEN_PREFIX)) {
      return success({
        success: true,
        dashboard: {
          id: 'demo-dashboard',
          name: 'TV Dashboard (Demo)',
          layout: DEFAULT_TV_LAYOUT,
          refreshInterval: DEFAULT_REFRESH_INTERVAL,
          organizationId: DEMO_ORG_ID
        }
      }, 200, origin);
    }

    // First try tv_dashboards (new system with custom layouts)
    const tvDashboard = await prisma.tvDashboard.findFirst({
      where: {
        access_token: token,
        is_active: true
      }
    });

    if (tvDashboard) {
      // Update last_accessed_at asynchronously
      prisma.tvDashboard.update({
        where: { id: tvDashboard.id },
        data: { last_accessed_at: new Date() }
      }).catch((err: any) => logger.warn('Failed to update last_accessed_at', { error: err.message }));

      return success({
        success: true,
        dashboard: {
          id: tvDashboard.id,
          name: tvDashboard.name,
          layout: tvDashboard.layout as any[],
          refreshInterval: tvDashboard.refresh_interval,
          organizationId: tvDashboard.organization_id
        }
      }, 200, origin);
    }

    // Fallback to legacy tv_display_tokens
    const tvToken = await prisma.tvDisplayToken.findFirst({
      where: {
        token,
        is_active: true,
        expires_at: { gt: new Date() }
      }
    });

    if (!tvToken) {
      logger.warn('Invalid TV token attempt', { deviceId, tokenPrefix: token.substring(0, 8) });
      return error('Invalid token', 401, undefined, origin);
    }

    return success({
      success: true,
      dashboard: {
        id: tvToken.id,
        name: 'TV Dashboard',
        layout: DEFAULT_TV_LAYOUT,
        refreshInterval: DEFAULT_REFRESH_INTERVAL,
        organizationId: tvToken.organization_id
      }
    }, 200, origin);
  } catch (err) {
    logger.error('TV token verification error:', err);
    return error('Internal server error', 500, undefined, origin);
  }
}
