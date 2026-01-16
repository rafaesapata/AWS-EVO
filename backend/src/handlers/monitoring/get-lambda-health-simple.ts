/**
 * Get Lambda Health (Simplified) - Retorna status de saúde das Lambdas críticas
 * 
 * Endpoint: GET /api/functions/get-lambda-health
 * 
 * Esta versão simplificada retorna dados mockados para demonstração.
 * A versão completa com integração CloudWatch será implementada posteriormente.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { logger } from '../../lib/logging.js';

interface LambdaHealthStatus {
  name: string;
  displayName: string;
  category: 'onboarding' | 'security' | 'auth' | 'core';
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  health: number; // 0-1
  metrics: {
    errorRate: number;
    recentErrors: number;
    lastCheck: string;
  };
  configuration: {
    handler: string;
    runtime: string;
    memorySize: number;
    timeout: number;
  };
  issues: string[];
}

const CRITICAL_LAMBDAS = [
  { name: 'save-aws-credentials', displayName: 'Quick Connect AWS', category: 'onboarding' as const },
  { name: 'validate-aws-credentials', displayName: 'Validação AWS', category: 'onboarding' as const },
  { name: 'save-azure-credentials', displayName: 'Quick Connect Azure', category: 'onboarding' as const },
  { name: 'validate-azure-credentials', displayName: 'Validação Azure', category: 'onboarding' as const },
  { name: 'security-scan', displayName: 'Security Engine V3', category: 'security' as const },
  { name: 'start-security-scan', displayName: 'Iniciar Security Scan', category: 'security' as const },
  { name: 'compliance-scan', displayName: 'Compliance v2.0', category: 'security' as const },
  { name: 'start-compliance-scan', displayName: 'Iniciar Compliance Scan', category: 'security' as const },
  { name: 'mfa-enroll', displayName: 'MFA Enrollment', category: 'auth' as const },
  { name: 'mfa-verify-login', displayName: 'MFA Login', category: 'auth' as const },
  { name: 'webauthn-register', displayName: 'Passkey Registration', category: 'auth' as const },
  { name: 'webauthn-authenticate', displayName: 'Passkey Login', category: 'auth' as const },
  { name: 'fetch-daily-costs', displayName: 'Cost Dashboard', category: 'core' as const },
  { name: 'bedrock-chat', displayName: 'FinOps Copilot', category: 'core' as const },
  { name: 'get-executive-dashboard', displayName: 'Executive Dashboard', category: 'core' as const },
];

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);

    logger.info('Fetching Lambda health status (simplified)', { 
      organizationId,
      userId: user.sub 
    });

    // Generate mock health data for demonstration
    // In production, this would fetch real metrics from CloudWatch
    const healthStatuses: LambdaHealthStatus[] = CRITICAL_LAMBDAS.map(lambda => {
      // Simulate different health states
      const randomHealth = Math.random();
      let status: 'healthy' | 'degraded' | 'critical' | 'unknown';
      let health: number;
      let issues: string[] = [];

      if (randomHealth > 0.9) {
        status = 'healthy';
        health = 1.0;
      } else if (randomHealth > 0.7) {
        status = 'healthy';
        health = 0.95;
      } else if (randomHealth > 0.4) {
        status = 'degraded';
        health = 0.7;
        issues.push('Taxa de erro ligeiramente elevada');
      } else {
        status = 'critical';
        health = 0.3;
        issues.push('Múltiplos erros detectados');
        issues.push('Requer atenção imediata');
      }

      return {
        name: lambda.name,
        displayName: lambda.displayName,
        category: lambda.category,
        status,
        health,
        metrics: {
          errorRate: status === 'critical' ? 15.5 : status === 'degraded' ? 5.2 : 0.1,
          recentErrors: status === 'critical' ? 12 : status === 'degraded' ? 3 : 0,
          lastCheck: new Date().toISOString(),
        },
        configuration: {
          handler: `${lambda.name}.handler`,
          runtime: 'nodejs18.x',
          memorySize: 256,
          timeout: 30,
        },
        issues,
      };
    });

    // Calculate statistics
    const totalLambdas = healthStatuses.length;
    const healthyCount = healthStatuses.filter(h => h.status === 'healthy').length;
    const degradedCount = healthStatuses.filter(h => h.status === 'degraded').length;
    const criticalCount = healthStatuses.filter(h => h.status === 'critical').length;
    const unknownCount = healthStatuses.filter(h => h.status === 'unknown').length;

    const overallHealth = healthStatuses.reduce((sum, h) => sum + h.health, 0) / totalLambdas;

    // Group by category
    const byCategory = {
      onboarding: healthStatuses.filter(h => h.category === 'onboarding'),
      security: healthStatuses.filter(h => h.category === 'security'),
      auth: healthStatuses.filter(h => h.category === 'auth'),
      core: healthStatuses.filter(h => h.category === 'core'),
    };

    return success({
      summary: {
        total: totalLambdas,
        healthy: healthyCount,
        degraded: degradedCount,
        critical: criticalCount,
        unknown: unknownCount,
        overallHealth: Math.round(overallHealth * 100),
        lastUpdate: new Date().toISOString(),
      },
      lambdas: healthStatuses,
      byCategory,
      note: 'This is a simplified version with mock data. Real CloudWatch integration coming soon.',
    });

  } catch (err) {
    logger.error('Failed to fetch Lambda health', { 
      error: err instanceof Error ? err.message : String(err) 
    });
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
