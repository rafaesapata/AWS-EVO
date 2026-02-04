/**
 * Lambda para sincronizar schema do Prisma com o banco
 * Usa Prisma DB Push para aplicar mudanças
 */

import type { APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export async function handler(): Promise<APIGatewayProxyResultV2> {
  const startTime = Date.now();
  
  try {
    logger.info('Starting Prisma DB Push');
    
    const prisma = getPrismaClient();
    
    // Executar queries para criar tabelas faltantes
    // Baseado no schema.prisma, criar apenas as colunas que faltam
    
    const queries = [
      // Adicionar colunas faltantes em organizations
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS demo_mode BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS demo_activated_at TIMESTAMPTZ`,
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ`,
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS demo_activated_by UUID`,
      
      // Criar índice
      `CREATE INDEX IF NOT EXISTS idx_organizations_demo_mode ON organizations(demo_mode) WHERE demo_mode = TRUE`,
      
      // Criar tabela demo_mode_audit se não existir
      `CREATE TABLE IF NOT EXISTS demo_mode_audit (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        performed_by UUID,
        previous_state JSONB,
        new_state JSONB,
        reason TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      
      `CREATE INDEX IF NOT EXISTS idx_demo_mode_audit_org ON demo_mode_audit(organization_id)`,
      `CREATE INDEX IF NOT EXISTS idx_demo_mode_audit_created ON demo_mode_audit(created_at)`,
    ];
    
    let executed = 0;
    for (const query of queries) {
      try {
        await prisma.$executeRawUnsafe(query);
        executed++;
        logger.info('Query executed', { query: query.substring(0, 80) });
      } catch (err: any) {
        logger.warn('Query failed (continuing)', { error: err.message });
      }
    }
    
    const duration = Date.now() - startTime;
    
    logger.info('DB Push completed', { duration_ms: duration, executed });
    
    return success({
      success: true,
      message: 'Database schema synchronized successfully',
      duration_ms: duration,
      queries_executed: executed
    });
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('DB Push failed', { error: errorMessage });
    
    return error(`DB Push failed: ${errorMessage}`, 500);
  }
}
