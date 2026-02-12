/**
 * Database Initialization & Health Check Handler
 * 
 * Este handler é usado para:
 * 1. Verificar conectividade com o banco
 * 2. Verificar integridade do schema
 * 3. Gerar relatório de saúde do banco
 * 4. Seed de dados iniciais (se necessário)
 * 
 * ⚠️ IMPORTANTE: Este handler NÃO executa migrações!
 * Migrações devem ser executadas via CI/CD usando `npx prisma migrate deploy`
 * 
 * Estratégia de Migrações:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  1. CI/CD Pipeline executa: npx prisma migrate deploy          │
 * │  2. Lambdas verificam conectividade no startup                 │
 * │  3. Este handler pode verificar integridade pós-deploy         │
 * └─────────────────────────────────────────────────────────────────┘
 */

import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { PrismaClient } from '@prisma/client';
import { success, error, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import {
  verifySchemaIntegrity,
  checkDatabaseConnectivity,
  generateSchemaHealthReport,
  getTableStats,
  ESSENTIAL_TABLES,
  BYTES_PER_KB,
  BYTES_PER_MB,
  type SchemaHealthReport,
} from '../../lib/database-migrations.js';

type DbInitAction = 'verify' | 'health' | 'seed' | 'tables' | 'report';

// HTTP Status Codes
const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL_ERROR = 500;

const DEFAULT_ACTION: DbInitAction = 'verify';
const VALID_ACTIONS: readonly DbInitAction[] = ['verify', 'health', 'tables', 'seed', 'report'] as const;

// Configuração de seed (pode ser sobrescrita via variáveis de ambiente)
const SEED_CONFIG = {
  defaultOrgName: process.env.SEED_ORG_NAME || 'Default Organization',
  defaultOrgSlug: process.env.SEED_ORG_SLUG || 'default',
  defaultOrgStatus: 'active' as const,
};

interface DbInitEvent {
  action?: DbInitAction;
  requestContext?: {
    http?: {
      method?: string;
    };
  };
}

// Helper para calcular duração
const calculateDuration = (startTime: number): number => Date.now() - startTime;

// Handler para action 'verify'
async function handleVerify(prisma: PrismaClient, startTime: number): Promise<APIGatewayProxyResultV2> {
  const connectivity = await checkDatabaseConnectivity(prisma);
  
  if (!connectivity.connected) {
    return error('Database connection failed', HTTP_SERVICE_UNAVAILABLE);
  }
  
  const schema = await verifySchemaIntegrity(prisma);
  const duration = calculateDuration(startTime);

  logger.info('Database verification completed', {
    connected: connectivity.connected,
    schemaValid: schema.isValid,
    duration_ms: duration,
  });

  if (!schema.isValid) {
    return success({
      status: 'warning',
      action: 'verify',
      message: 'Database connected but schema needs attention',
      connectivity: {
        connected: true,
        latency_ms: connectivity.latencyMs,
        version: connectivity.version,
      },
      schema: {
        valid: false,
        missing_tables: schema.missingTables,
        pending_migrations: schema.pendingMigrations,
        last_migration: schema.lastMigration,
        recommendation: 'Run: npx prisma migrate deploy',
      },
      duration_ms: duration,
    });
  }

  return success({
    status: 'healthy',
    action: 'verify',
    connectivity: {
      connected: true,
      latency_ms: connectivity.latencyMs,
      version: connectivity.version,
    },
    schema: {
      valid: true,
      version: schema.version,
      last_migration: schema.lastMigration,
      total_tables: schema.existingTables.length,
    },
    duration_ms: duration,
  });
}

// Handler para action 'health'
async function handleHealth(prisma: PrismaClient, startTime: number): Promise<APIGatewayProxyResultV2> {
  const report = await generateSchemaHealthReport(prisma);
  const duration = calculateDuration(startTime);
  const overallHealth = report.connectivity.connected && report.schema.isValid;

  logger.info('Database health check completed', {
    healthy: overallHealth,
    duration_ms: duration,
  });

  return success({
    status: overallHealth ? 'healthy' : 'unhealthy',
    action: 'health',
    report: {
      ...report,
      summary: {
        connected: report.connectivity.connected,
        schema_valid: report.schema.isValid,
        total_tables: report.tables.length,
        missing_essential: report.schema.missingTables.length,
        domains_healthy: Object.values(report.domains).filter(d => d.valid).length,
        domains_total: Object.keys(report.domains).length,
      },
    },
    duration_ms: duration,
  });
}

// Handler para action 'tables'
async function handleTables(prisma: PrismaClient, startTime: number): Promise<APIGatewayProxyResultV2> {
  const tables = await getTableStats(prisma);
  const duration = calculateDuration(startTime);

  const totalRows = tables.reduce((sum, t) => sum + Number(t.rowCount), 0);
  const totalSize = tables.reduce((sum, t) => sum + Number(t.sizeBytes), 0);

  return success({
    status: 'success',
    action: 'tables',
    summary: {
      total_tables: tables.length,
      total_rows: totalRows,
      total_size_mb: (totalSize / BYTES_PER_MB).toFixed(2),
    },
    tables: tables.map(t => ({
      name: t.tableName,
      rows: Number(t.rowCount),
      size_kb: (Number(t.sizeBytes) / BYTES_PER_KB).toFixed(2),
    })),
    duration_ms: duration,
  });
}

// Handler para action 'seed'
async function handleSeed(prisma: PrismaClient): Promise<APIGatewayProxyResultV2> {
  logger.info('Seed action requested');

  const orgCount = await prisma.organization.count();

  if (orgCount === 0) {
    logger.info('Creating default organization', { config: SEED_CONFIG });

    const defaultOrg = await prisma.organization.create({
      data: {
        name: SEED_CONFIG.defaultOrgName,
        slug: SEED_CONFIG.defaultOrgSlug,
        status: SEED_CONFIG.defaultOrgStatus,
      },
    });

    return success({
      status: 'seeded',
      action: 'seed',
      created: {
        organization: {
          id: defaultOrg.id,
          name: defaultOrg.name,
          slug: defaultOrg.slug,
        },
      },
    });
  }

  return success({
    status: 'already_seeded',
    action: 'seed',
    existing: {
      organizations: orgCount,
    },
  });
}

// Handler para action 'report'
async function handleReport(prisma: PrismaClient, startTime: number): Promise<APIGatewayProxyResultV2> {
  const report = await generateSchemaHealthReport(prisma);
  const duration = calculateDuration(startTime);

  const extendedReport = {
    ...report,
    environment: {
      node_version: process.version,
      lambda_function: process.env.AWS_LAMBDA_FUNCTION_NAME || 'local',
      region: process.env.AWS_REGION || 'unknown',
      database_url_masked: process.env.DATABASE_URL 
        ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')
        : 'not set',
    },
    essential_tables: {
      required: [...ESSENTIAL_TABLES],
      present: ESSENTIAL_TABLES.filter(t => report.schema.existingTables.includes(t)),
      missing: ESSENTIAL_TABLES.filter(t => !report.schema.existingTables.includes(t)),
    },
  };

  return success({
    status: 'success',
    action: 'report',
    report: extendedReport,
    duration_ms: duration,
  });
}

export async function handler(event: DbInitEvent): Promise<APIGatewayProxyResultV2> {
  // Handle OPTIONS for CORS
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  const action = event.action || DEFAULT_ACTION;
  const startTime = Date.now();

  logger.info('Database initialization started', { action });

  try {
    const prisma = getPrismaClient();

    switch (action) {
      case 'verify':
        return handleVerify(prisma, startTime);
      
      case 'health':
        return handleHealth(prisma, startTime);
      
      case 'tables':
        return handleTables(prisma, startTime);
      
      case 'seed':
        return handleSeed(prisma);
      
      case 'report':
        return handleReport(prisma, startTime);

      default:
        return error(
          `Unknown action: ${action}. Valid actions: ${VALID_ACTIONS.join(', ')}`,
          HTTP_BAD_REQUEST
        );
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Database initialization failed', { error: errorMessage, action });

    return error('Database initialization failed. Check logs for details.', HTTP_INTERNAL_ERROR);
  }
}
