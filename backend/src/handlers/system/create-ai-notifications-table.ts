/**
 * Lambda handler para criar a tabela ai_notifications
 * Executa SQL diretamente no banco de dados
 */

import type { APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

const SQL_COMMANDS = [
  `CREATE TABLE IF NOT EXISTS ai_notifications (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    user_id UUID,
    type TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    suggested_action TEXT,
    action_type TEXT,
    action_params JSONB,
    context JSONB,
    status TEXT NOT NULL DEFAULT 'pending',
    delivered_at TIMESTAMPTZ(6),
    read_at TIMESTAMPTZ(6),
    actioned_at TIMESTAMPTZ(6),
    dismissed_at TIMESTAMPTZ(6),
    expires_at TIMESTAMPTZ(6),
    created_by UUID,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ai_notifications_pkey PRIMARY KEY (id)
  )`,
  `CREATE INDEX IF NOT EXISTS ai_notifications_organization_id_status_idx ON ai_notifications(organization_id, status)`,
  `CREATE INDEX IF NOT EXISTS ai_notifications_organization_id_user_id_status_idx ON ai_notifications(organization_id, user_id, status)`,
  `CREATE INDEX IF NOT EXISTS ai_notifications_expires_at_idx ON ai_notifications(expires_at)`,
  `CREATE INDEX IF NOT EXISTS ai_notifications_type_idx ON ai_notifications(type)`,
  `CREATE INDEX IF NOT EXISTS ai_notifications_priority_idx ON ai_notifications(priority)`,
];

export async function handler(): Promise<APIGatewayProxyResultV2> {
  try {
    logger.info('Creating ai_notifications table...');
    
    const prisma = getPrismaClient();
    
    // Execute each SQL command separately
    for (const sql of SQL_COMMANDS) {
      await prisma.$executeRawUnsafe(sql);
    }
    
    logger.info('ai_notifications table created successfully');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        message: 'ai_notifications table created successfully',
      }),
    };
  } catch (err) {
    logger.error('Error creating ai_notifications table', err as Error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: false,
        error: (err as Error).message,
      }),
    };
  }
}
