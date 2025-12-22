/**
 * Lambda handler para validar licença
 * AWS Lambda Handler for validate-license
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';

interface ValidateLicenseRequest {
  licenseKey?: string;
  customerId?: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🔑 Validate license started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: ValidateLicenseRequest = event.body ? JSON.parse(event.body) : {};
    const { licenseKey, customerId } = body;
    
    const prisma = getPrismaClient();
    
    // Buscar licença
    let license;
    
    if (licenseKey) {
      license = await prisma.license.findFirst({
        where: {
          license_key: licenseKey,
          organization_id: organizationId,
        },
      });
    } else if (customerId) {
      license = await prisma.license.findFirst({
        where: {
          customer_id: customerId,
          organization_id: organizationId,
        },
        orderBy: { created_at: 'desc' },
      });
    } else {
      // Buscar licença ativa da organização
      license = await prisma.license.findFirst({
        where: {
          organization_id: organizationId,
          is_active: true,
        },
        orderBy: { created_at: 'desc' },
      });
    }
    
    if (!license) {
      return success({
        valid: false,
        reason: 'License not found',
      });
    }
    
    // Validar licença
    const now = new Date();
    const validFrom = new Date(license.valid_from);
    const validUntil = new Date(license.valid_until);
    
    const isExpired = now > validUntil;
    const isNotYetValid = now < validFrom;
    const isActive = license.is_active;
    
    const valid = !isExpired && !isNotYetValid && isActive;
    
    // Verificar limites
    const accountsCount = await prisma.awsAccount.count({
      where: { organization_id: organizationId },
    });
    
    const usersCount = await prisma.profile.count({
      where: { organization_id: organizationId },
    });
    
    const withinLimits = 
      accountsCount <= license.max_accounts &&
      usersCount <= license.max_users;
    
    // Calcular dias restantes
    const daysRemaining = Math.ceil((validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    // Gerar alertas
    const alerts = [];
    
    if (daysRemaining <= 30 && daysRemaining > 0) {
      alerts.push({
        type: 'warning',
        message: `License expires in ${daysRemaining} days`,
      });
    }
    
    if (daysRemaining <= 7 && daysRemaining > 0) {
      alerts.push({
        type: 'critical',
        message: `License expires in ${daysRemaining} days - renewal required`,
      });
    }
    
    if (isExpired) {
      alerts.push({
        type: 'error',
        message: 'License has expired',
      });
    }
    
    if (!withinLimits) {
      alerts.push({
        type: 'warning',
        message: 'Usage exceeds license limits',
      });
    }
    
    logger.info(`✅ License validation: ${valid ? 'VALID' : 'INVALID'}`);
    
    return success({
      valid: valid && withinLimits,
      license: {
        plan_type: license.plan_type,
        valid_from: license.valid_from,
        valid_until: license.valid_until,
        days_remaining: daysRemaining,
        features: license.features,
      },
      usage: {
        accounts: {
          current: accountsCount,
          limit: license.max_accounts,
          percentage: Math.round((accountsCount / license.max_accounts) * 100),
        },
        users: {
          current: usersCount,
          limit: license.max_users,
          percentage: Math.round((usersCount / license.max_users) * 100),
        },
      },
      alerts,
      status: isExpired ? 'expired' : 
              daysRemaining <= 7 ? 'expiring_soon' :
              !withinLimits ? 'over_limit' : 'active',
    });
    
  } catch (err) {
    logger.error('❌ Validate license error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
