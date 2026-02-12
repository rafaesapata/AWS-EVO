/**
 * Database Migration Utilities
 * 
 * Estratégia de migrações para ambiente serverless (AWS Lambda):
 * 
 * 1. DEPLOY TIME: Migrações são aplicadas via CI/CD usando `npx prisma migrate deploy`
 * 2. RUNTIME: Lambdas apenas verificam conectividade, NÃO alteram schema
 * 3. FALLBACK: Lambda db-init pode verificar integridade do schema
 * 
 * ⚠️ IMPORTANTE: Nunca execute migrações em runtime de Lambda!
 * Isso causa race conditions e inconsistências.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

// Constantes de conversão (exportadas para uso em handlers)
export const BYTES_PER_KB = 1024;
export const BYTES_PER_MB = BYTES_PER_KB * 1024;

// Tabelas essenciais que DEVEM existir para o sistema funcionar
const ESSENTIAL_TABLES = [
  'organizations',
  'profiles',
  'aws_credentials',
  'azure_credentials',
  'security_scans',
  'findings',
  'daily_costs',
  'licenses',
  'background_jobs',
  'audit_logs',
] as const;

// Tabelas por domínio (para verificação granular)
const DOMAIN_TABLES = {
  auth: ['profiles', 'mfa_factors', 'webauthn_credentials', 'oauth_states'],
  security: ['security_scans', 'findings', 'compliance_checks', 'guardduty_findings'],
  cost: ['daily_costs', 'waste_detections', 'ri_sp_recommendations'],
  monitoring: ['alerts', 'alert_rules', 'monitored_endpoints'],
  azure: ['azure_credentials', 'azure_activity_events', 'azure_defender_findings'],
} as const;

export interface SchemaStatus {
  isValid: boolean;
  version: string | null;
  missingTables: string[];
  existingTables: string[];
  lastMigration: string | null;
  pendingMigrations: number;
}

export interface TableInfo {
  tableName: string;
  rowCount: number;
  sizeBytes: number;
}

export interface ConnectivityResult {
  connected: boolean;
  latencyMs: number;
  version: string | null;
}

export interface DomainValidation {
  valid: boolean;
  missing: string[];
}

/** Relatório completo de saúde do schema */
export interface SchemaHealthReport {
  timestamp: string;
  connectivity: ConnectivityResult;
  schema: SchemaStatus;
  tables: TableInfo[];
  domains: Record<string, DomainValidation>;
}

// Tipos para o middleware
type LambdaEvent = {
  requestContext?: {
    http?: {
      method?: string;
    };
  };
  [key: string]: unknown;
};

type LambdaContext = {
  functionName?: string;
  awsRequestId?: string;
  [key: string]: unknown;
};

type LambdaHandler<T> = (event: LambdaEvent, context: LambdaContext) => Promise<T>;

// Schema padrão do PostgreSQL
const DEFAULT_SCHEMA = 'public';

/**
 * Busca lista de tabelas públicas do banco (query reutilizável)
 */
async function getPublicTableNames(prisma: PrismaClient): Promise<string[]> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = ${DEFAULT_SCHEMA}
  `;
  return tables.map(t => t.tablename);
}

/**
 * Verifica se o schema do banco está válido e atualizado
 * 
 * Esta função NÃO aplica migrações - apenas verifica o estado atual.
 * Use no início de Lambdas críticas para fail-fast se o schema estiver incorreto.
 */
export async function verifySchemaIntegrity(
  prisma: PrismaClient,
  requiredTables?: string[]
): Promise<SchemaStatus> {
  const tablesToCheck = requiredTables || [...ESSENTIAL_TABLES];
  
  try {
    // 1. Buscar tabelas existentes (usando função reutilizável)
    const tableNames = await getPublicTableNames(prisma);
    
    // 2. Verificar tabelas faltantes
    const missingTables = tablesToCheck.filter(t => !tableNames.includes(t));
    
    // 3. Buscar última migração aplicada (tabela _prisma_migrations)
    let lastMigration: string | null = null;
    let pendingMigrations = 0;
    
    try {
      const migrations = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
        SELECT migration_name, finished_at 
        FROM _prisma_migrations 
        ORDER BY finished_at DESC NULLS LAST
        LIMIT 1
      `;
      
      if (migrations.length > 0) {
        lastMigration = migrations[0].migration_name;
      }
      
      // Contar migrações pendentes (finished_at IS NULL)
      const pending = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count 
        FROM _prisma_migrations 
        WHERE finished_at IS NULL
      `;
      pendingMigrations = Number(pending[0]?.count || 0);
      
    } catch {
      // Tabela _prisma_migrations não existe - schema nunca foi migrado
      logger.warn('Prisma migrations table not found - schema may not be initialized');
    }
    
    // 4. Determinar versão do schema (baseado na última migração)
    const version = lastMigration 
      ? lastMigration.split('_')[0] // Ex: "20260202" de "20260202_email_notification_system"
      : null;
    
    const isValid = missingTables.length === 0 && pendingMigrations === 0;
    
    return {
      isValid,
      version,
      missingTables,
      existingTables: tableNames,
      lastMigration,
      pendingMigrations,
    };
    
  } catch (error) {
    logger.error('Failed to verify schema integrity', error as Error);
    throw error;
  }
}

/**
 * Verifica se tabelas de um domínio específico existem
 * 
 * Útil para Lambdas que só precisam de um subset do schema.
 * Ex: Lambda de Azure só precisa verificar tabelas Azure.
 */
export async function verifyDomainTables(
  prisma: PrismaClient,
  domain: keyof typeof DOMAIN_TABLES
): Promise<DomainValidation> {
  const requiredTables = [...DOMAIN_TABLES[domain]];
  
  // Usar função reutilizável para buscar tabelas
  const existingNames = await getPublicTableNames(prisma);
  const missing = requiredTables.filter(t => !existingNames.includes(t));
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Obtém informações detalhadas sobre as tabelas do banco
 */
export async function getTableStats(prisma: PrismaClient): Promise<TableInfo[]> {
  const stats = await prisma.$queryRaw<TableInfo[]>`
    SELECT 
      relname as "tableName",
      n_live_tup as "rowCount",
      pg_total_relation_size(quote_ident(relname)::regclass) as "sizeBytes"
    FROM pg_stat_user_tables
    WHERE schemaname = ${DEFAULT_SCHEMA}
    ORDER BY pg_total_relation_size(quote_ident(relname)::regclass) DESC
  `;
  
  return stats;
}

/**
 * Verifica conectividade básica com o banco
 * 
 * Use esta função para health checks rápidos.
 * NÃO verifica schema, apenas conectividade.
 */
export async function checkDatabaseConnectivity(
  prisma: PrismaClient
): Promise<ConnectivityResult> {
  const start = Date.now();
  
  try {
    const result = await prisma.$queryRaw<[{ version: string }]>`SELECT version()`;
    
    return {
      connected: true,
      latencyMs: Date.now() - start,
      version: result[0]?.version || null,
    };
  } catch (error) {
    logger.error('Database connectivity check failed', error as Error);
    
    return {
      connected: false,
      latencyMs: Date.now() - start,
      version: null,
    };
  }
}

/**
 * Middleware para verificar schema antes de executar handler
 * 
 * Uso:
 * ```typescript
 * export const handler = withSchemaVerification(
 *   ['security_scans', 'findings'],
 *   async (event, context) => {
 *     // Handler code
 *   }
 * );
 * ```
 */
export function withSchemaVerification<T>(
  requiredTables: string[],
  handler: LambdaHandler<T>
): LambdaHandler<T> {
  return async (event: LambdaEvent, context: LambdaContext): Promise<T> => {
    // Skip verification for OPTIONS requests (CORS preflight)
    if (event.requestContext?.http?.method === 'OPTIONS') {
      return handler(event, context);
    }
    
    // Import dinamicamente para evitar circular dependency
    const { getPrismaClient } = await import('./database.js');
    const prisma = getPrismaClient();
    
    // Verificar apenas conectividade em produção (performance)
    // Verificação completa de schema deve ser feita no deploy
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      const connectivity = await checkDatabaseConnectivity(prisma);
      if (!connectivity.connected) {
        throw new Error('Database connection failed');
      }
    } else {
      // Em desenvolvimento, verificar schema completo
      const status = await verifySchemaIntegrity(prisma, requiredTables);
      if (!status.isValid) {
        logger.error('Schema verification failed', {
          missingTables: status.missingTables,
          pendingMigrations: status.pendingMigrations,
        });
        throw new Error(`Schema invalid: missing tables [${status.missingTables.join(', ')}]`);
      }
    }
    
    return handler(event, context);
  };
}

/**
 * Gera relatório de saúde do schema para debugging
 */
export async function generateSchemaHealthReport(prisma: PrismaClient): Promise<SchemaHealthReport> {
  // Executar queries em paralelo para melhor performance
  const [connectivity, schema, tables] = await Promise.all([
    checkDatabaseConnectivity(prisma),
    verifySchemaIntegrity(prisma),
    getTableStats(prisma),
  ]);
  
  // Verificar domínios em paralelo
  const domainKeys = Object.keys(DOMAIN_TABLES) as (keyof typeof DOMAIN_TABLES)[];
  const domainResults = await Promise.all(
    domainKeys.map(domain => verifyDomainTables(prisma, domain))
  );
  
  const domains: Record<string, DomainValidation> = {};
  domainKeys.forEach((key, index) => {
    domains[key] = domainResults[index];
  });
  
  return {
    timestamp: new Date().toISOString(),
    connectivity,
    schema,
    tables,
    domains,
  };
}

// Exportar constantes para uso externo
export { ESSENTIAL_TABLES, DOMAIN_TABLES };
