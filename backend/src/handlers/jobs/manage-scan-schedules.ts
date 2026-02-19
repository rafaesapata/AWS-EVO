/**
 * Lambda handler for Manage Scan Schedules
 * 
 * CRUD REST handler for scan schedule management.
 * Routes: POST (create), GET (list), PATCH (update), DELETE (remove)
 * 
 * Multi-tenancy: all queries filter by organization_id
 * Audit logging: mandatory for create, update, delete
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, notFound, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { calculateNextRun } from '../../lib/schedule-calculator.js';
import { z } from 'zod';

// ============================================================================
// Zod Schemas
// ============================================================================

const createScheduleSchema = z.object({
  accountId: z.string().uuid().optional(),
  azureCredentialId: z.string().uuid().optional(),
  cloudProvider: z.enum(['AWS', 'AZURE']),
  scanType: z.string().min(1),
  scheduleType: z.enum(['daily', 'weekly', 'monthly']),
  scheduleConfig: z.object({
    hour: z.number().int().min(0).max(23).optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
  }).optional(),
}).refine(data => {
  return !!data.accountId || !!data.azureCredentialId;
}, { message: 'Either accountId or azureCredentialId is required' });

const updateScheduleSchema = z.object({
  id: z.string().uuid(),
  scheduleType: z.enum(['daily', 'weekly', 'monthly']).optional(),
  scheduleConfig: z.object({
    hour: z.number().int().min(0).max(23).optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
  }).optional(),
  isActive: z.boolean().optional(),
});

const deleteScheduleSchema = z.object({
  id: z.string().uuid(),
});

// ============================================================================
// Handler
// ============================================================================

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const method = getHttpMethod(event);
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);

    switch (method.toUpperCase()) {
      case 'POST':
        return await createSchedule(event, user, organizationId);
      case 'GET':
        return await listSchedules(event, organizationId);
      case 'PATCH':
        return await updateSchedule(event, user, organizationId);
      case 'DELETE':
        return await deleteSchedule(event, user, organizationId);
      default:
        return badRequest(`Unsupported method: ${method}`);
    }
  } catch (err) {
    logger.error('manage-scan-schedules error', err as Error, {
      requestId: context.awsRequestId,
    });
    return error('An unexpected error occurred. Please try again.', 500);
  }
}

// ============================================================================
// POST — Create Schedule
// ============================================================================

async function createSchedule(
  event: AuthorizedEvent,
  user: any,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body || '{}');
  const parsed = createScheduleSchema.safeParse(body);

  if (!parsed.success) {
    return badRequest('Validation failed', parsed.error.flatten());
  }

  const data = parsed.data;
  const prisma = getPrismaClient();

  // Uniqueness check: no two active schedules for same account + scan_type
  const existing = await prisma.scanSchedule.findFirst({
    where: {
      organization_id: organizationId,
      ...(data.accountId
        ? { aws_account_id: data.accountId }
        : { azure_credential_id: data.azureCredentialId }),
      scan_type: data.scanType,
      is_active: true,
    },
  });

  if (existing) {
    return error(
      'Já existe um agendamento ativo para esta conta e tipo de scan',
      409,
      { existingId: existing.id }
    );
  }

  // Calculate next_run_at
  const scheduleConfig = data.scheduleConfig || {};
  const nextRunAt = calculateNextRun(data.scheduleType, scheduleConfig);

  const schedule = await prisma.scanSchedule.create({
    data: {
      organization_id: organizationId,
      ...(data.accountId
        ? { aws_account_id: data.accountId }
        : { azure_credential_id: data.azureCredentialId }),
      cloud_provider: data.cloudProvider,
      scan_type: data.scanType,
      schedule_type: data.scheduleType,
      schedule_config: scheduleConfig,
      is_active: true,
      next_run_at: nextRunAt,
    },
  });

  logAuditAsync({
    organizationId,
    userId: user.sub,
    action: 'SCHEDULE_CREATED',
    resourceType: 'scan_schedule',
    resourceId: schedule.id,
    details: {
      scheduleType: data.scheduleType,
      scanType: data.scanType,
      cloudProvider: data.cloudProvider,
    },
    ipAddress: getIpFromEvent(event),
    userAgent: getUserAgentFromEvent(event),
  });

  logger.info('Scan schedule created', {
    scheduleId: schedule.id,
    organizationId,
    scanType: data.scanType,
    scheduleType: data.scheduleType,
  });

  return success(formatScheduleResponse(schedule), 201);
}

// ============================================================================
// GET — List Schedules
// ============================================================================

async function listSchedules(
  event: AuthorizedEvent,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const params = event.queryStringParameters || {};
  const { accountId, azureCredentialId, cloudProvider } = params;
  const prisma = getPrismaClient();

  const where: any = { organization_id: organizationId };

  if (accountId) where.aws_account_id = accountId;
  if (azureCredentialId) where.azure_credential_id = azureCredentialId;
  if (cloudProvider) where.cloud_provider = cloudProvider;

  const schedules = await prisma.scanSchedule.findMany({
    where,
    orderBy: { created_at: 'desc' },
  });

  return success(schedules.map(formatScheduleResponse));
}

// ============================================================================
// PATCH — Update Schedule
// ============================================================================

async function updateSchedule(
  event: AuthorizedEvent,
  user: any,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body || '{}');
  const parsed = updateScheduleSchema.safeParse(body);

  if (!parsed.success) {
    return badRequest('Validation failed', parsed.error.flatten());
  }

  const data = parsed.data;
  const prisma = getPrismaClient();

  // Verify schedule exists and belongs to this organization
  const existing = await prisma.scanSchedule.findFirst({
    where: {
      id: data.id,
      organization_id: organizationId,
    },
  });

  if (!existing) {
    return notFound('Schedule not found');
  }

  const updateData: any = {};

  if (data.scheduleType !== undefined) {
    updateData.schedule_type = data.scheduleType;
  }
  if (data.scheduleConfig !== undefined) {
    updateData.schedule_config = data.scheduleConfig;
  }
  if (data.isActive !== undefined) {
    updateData.is_active = data.isActive;
  }

  // Recalculate next_run_at if schedule type or config changed
  if (data.scheduleType || data.scheduleConfig) {
    const newType = data.scheduleType || existing.schedule_type;
    const newConfig = data.scheduleConfig || existing.schedule_config;
    updateData.next_run_at = calculateNextRun(newType, newConfig);
  }

  const updated = await prisma.scanSchedule.update({
    where: { id: data.id },
    data: updateData,
  });

  logAuditAsync({
    organizationId,
    userId: user.sub,
    action: 'SCHEDULE_UPDATED',
    resourceType: 'scan_schedule',
    resourceId: updated.id,
    details: {
      changes: data,
    },
    ipAddress: getIpFromEvent(event),
    userAgent: getUserAgentFromEvent(event),
  });

  logger.info('Scan schedule updated', {
    scheduleId: updated.id,
    organizationId,
    changes: data,
  });

  return success(formatScheduleResponse(updated));
}

// ============================================================================
// DELETE — Delete Schedule
// ============================================================================

async function deleteSchedule(
  event: AuthorizedEvent,
  user: any,
  organizationId: string
): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body || '{}');
  const parsed = deleteScheduleSchema.safeParse(body);

  if (!parsed.success) {
    return badRequest('Validation failed', parsed.error.flatten());
  }

  const { id } = parsed.data;
  const prisma = getPrismaClient();

  // Verify schedule exists and belongs to this organization
  const existing = await prisma.scanSchedule.findFirst({
    where: {
      id,
      organization_id: organizationId,
    },
  });

  if (!existing) {
    return notFound('Schedule not found');
  }

  await prisma.scanSchedule.delete({
    where: { id },
  });

  logAuditAsync({
    organizationId,
    userId: user.sub,
    action: 'SCHEDULE_DELETED',
    resourceType: 'scan_schedule',
    resourceId: id,
    details: {
      scheduleType: existing.schedule_type,
      scanType: existing.scan_type,
      cloudProvider: existing.cloud_provider,
    },
    ipAddress: getIpFromEvent(event),
    userAgent: getUserAgentFromEvent(event),
  });

  logger.info('Scan schedule deleted', {
    scheduleId: id,
    organizationId,
  });

  return success({ deleted: true, id });
}

// ============================================================================
// Helpers
// ============================================================================

function formatScheduleResponse(schedule: any) {
  return {
    id: schedule.id,
    organizationId: schedule.organization_id,
    awsAccountId: schedule.aws_account_id || null,
    azureCredentialId: schedule.azure_credential_id || null,
    cloudProvider: schedule.cloud_provider,
    scanType: schedule.scan_type,
    scheduleType: schedule.schedule_type,
    scheduleConfig: schedule.schedule_config,
    isActive: schedule.is_active,
    lastRunAt: schedule.last_run_at?.toISOString() || null,
    nextRunAt: schedule.next_run_at?.toISOString() || null,
    createdAt: schedule.created_at?.toISOString() || null,
    updatedAt: schedule.updated_at?.toISOString() || null,
  };
}
