/**
 * Lambda handler for running raw SQL queries (READ ONLY)
 * Admin-only operation for debugging and data inspection
 * MILITARY GRADE: Strict validation to prevent SQL injection
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions, unauthorized } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { withErrorMonitoring } from '../../lib/error-middleware.js';
import { getHttpMethod, getOrigin } from '../../lib/middleware.js';
import { getUserFromEvent, isSuperAdmin } from '../../lib/auth.js';
import { parseAndValidateBody } from '../../lib/validation.js';
import { z } from 'zod';

// Zod schema for SQL query validation
const runSqlSchema = z.object({
  sql: z.string().min(1, 'SQL query is required').max(5000, 'Query too long (max 5000 characters)'),
});

// MILITARY GRADE: Dangerous SQL patterns that could be used for injection
const DANGEROUS_PATTERNS = [
  /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)/i,
  /--/,  // SQL comments
  /\/\*/,  // Block comments
  /UNION\s+(ALL\s+)?SELECT/i,
  /INTO\s+(OUTFILE|DUMPFILE)/i,
  /LOAD_FILE/i,
  /BENCHMARK\s*\(/i,
  /SLEEP\s*\(/i,
  /WAITFOR\s+DELAY/i,
  /xp_cmdshell/i,
  /EXEC\s*\(/i,
  /EXECUTE\s*\(/i,
];

// MILITARY GRADE: Allowed tables for read-only queries
const ALLOWED_TABLES = [
  'daily_costs',
  'aws_credentials',
  'security_scans',
  'findings',
  'profiles',
  'organizations',
  'users',
  'audit_logs',
  'security_events',
];

export const handler = withErrorMonitoring('run-sql', async (
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> => {
  const origin = getOrigin(event) || '*';
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions(origin);
  }
  
  // MILITARY GRADE: Only super_admin can run raw SQL
  const user = getUserFromEvent(event);
  if (!isSuperAdmin(user)) {
    logger.security('unauthorized_sql_access', 'HIGH', { userId: user.sub });
    return unauthorized('Only super_admin can execute raw SQL queries', origin);
  }

  // Parse and validate body using centralized validation
  const validation = parseAndValidateBody(runSqlSchema, event.body);
  if (!validation.success) {
    return validation.error;
  }
  
  const { sql } = validation.data;
  
  // Only allow SELECT queries for safety
  const normalizedSql = sql.trim().toUpperCase();
  if (!normalizedSql.startsWith('SELECT')) {
    return badRequest('Only SELECT queries are allowed');
  }

  // MILITARY GRADE: Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(sql)) {
      logger.security('dangerous_sql_pattern', 'HIGH', { 
        userId: user.sub, 
        pattern: pattern.toString(),
        sql: sql.substring(0, 100) 
      });
      return badRequest('Query contains forbidden patterns');
    }
  }

  // MILITARY GRADE: Validate that query only references allowed tables
  const sqlLower = sql.toLowerCase();
  const tablePattern = /(?:from|join|into|update|table)\s+([a-z_][a-z0-9_]*)/gi;
  let tableMatch;
  const referencedTables: string[] = [];
  while ((tableMatch = tablePattern.exec(sqlLower)) !== null) {
    referencedTables.push(tableMatch[1]);
  }
  
  const disallowedTables = referencedTables.filter(t => !ALLOWED_TABLES.includes(t));
  if (disallowedTables.length > 0) {
    logger.security('sql_restricted_table_access', 'HIGH', { 
      userId: user.sub, 
      disallowedTables,
      sql: sql.substring(0, 200) 
    });
    return badRequest(`Query references restricted tables: ${disallowedTables.join(', ')}`);
  }

  // MILITARY GRADE: Block semicolons entirely to prevent statement chaining
  if (sql.includes(';')) {
    return badRequest('Multiple statements are not allowed');
  }

  // Block subqueries that could reference restricted tables
  const subqueryPattern = /\(\s*SELECT/i;
  if (subqueryPattern.test(sql)) {
    return badRequest('Subqueries are not allowed');
  }

  // Block information_schema and pg_catalog access
  if (/information_schema|pg_catalog|pg_tables|pg_stat/i.test(sql)) {
    return badRequest('System catalog access is not allowed');
  }

  // Enforce result limit to prevent memory exhaustion
  const hasLimit = /\bLIMIT\s+\d+/i.test(sql);
  const finalSql = hasLimit ? sql : `${sql} LIMIT 1000`;

  logger.audit('sql_query_executed', {
    userId: user.sub,
    sql: sql.substring(0, 500),
    referencedTables,
  });
  
  const prisma = getPrismaClient();
  const results = await prisma.$queryRawUnsafe(finalSql);
  
  return success({
    success: true,
    data: results,
    rowCount: Array.isArray(results) ? results.length : 1,
  });
});
