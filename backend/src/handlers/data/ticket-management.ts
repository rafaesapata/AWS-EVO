/**
 * Ticket Management Handler
 * Handles ticket history, comments, checklist, relations, and SLA
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
import { z } from 'zod';

// ==================== SCHEMAS ====================

const addCommentSchema = z.object({
  ticketId: z.string().uuid(),
  content: z.string().min(1).max(10000),
  isInternal: z.boolean().optional().default(false),
  isResolution: z.boolean().optional().default(false),
  parentId: z.string().uuid().optional(),
  mentions: z.array(z.string()).optional().default([]),
});

const updateCommentSchema = z.object({
  commentId: z.string().uuid(),
  content: z.string().min(1).max(10000),
});

const addChecklistItemSchema = z.object({
  ticketId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  isRequired: z.boolean().optional().default(false),
  dueDate: z.string().datetime().optional(),
  orderIndex: z.number().int().optional(),
});

const updateChecklistItemSchema = z.object({
  itemId: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  isCompleted: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  orderIndex: z.number().int().optional(),
});

const addRelationSchema = z.object({
  sourceTicketId: z.string().uuid(),
  targetTicketId: z.string().uuid(),
  relationType: z.enum(['blocks', 'blocked_by', 'duplicates', 'duplicate_of', 'related_to', 'parent_of', 'child_of', 'caused_by', 'causes']),
  notes: z.string().max(1000).optional(),
});

const createSlaPolicySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.string().optional(),
  responseTimeMinutes: z.number().int().min(1),
  resolutionTimeMinutes: z.number().int().min(1),
  escalationEnabled: z.boolean().optional().default(true),
  escalationAfterMinutes: z.number().int().optional(),
  escalationTo: z.string().uuid().optional(),
  notifyOnBreach: z.boolean().optional().default(true),
  notifyBeforeBreachMinutes: z.number().int().optional(),
});

const updateTicketStatusSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(['open', 'in_progress', 'pending_review', 'blocked', 'resolved', 'closed', 'cancelled', 'reopened']),
  comment: z.string().max(2000).optional(),
  resolutionNotes: z.string().max(5000).optional(),
});

// ==================== HELPER FUNCTIONS ====================

async function recordTicketHistory(
  prisma: any,
  ticketId: string,
  userId: string,
  userName: string | null,
  userEmail: string | null,
  action: string,
  fieldChanged?: string,
  oldValue?: string | null,
  newValue?: string | null,
  comment?: string,
  metadata?: any
) {
  return prisma.ticketHistory.create({
    data: {
      ticket_id: ticketId,
      user_id: userId,
      user_name: userName,
      user_email: userEmail,
      action,
      field_changed: fieldChanged,
      old_value: oldValue,
      new_value: newValue,
      comment,
      metadata,
    },
  });
}

async function applySlaPolicy(prisma: any, ticket: any, organizationId: string) {
  // Find matching SLA policy
  const slaPolicy = await prisma.slaPolicy.findFirst({
    where: {
      organization_id: organizationId,
      severity: ticket.severity,
      is_active: true,
      OR: [
        { category: ticket.category },
        { category: null },
      ],
    },
    orderBy: { category: 'desc' }, // Prefer category-specific policy
  });

  if (slaPolicy) {
    const slaDueAt = new Date(ticket.created_at);
    slaDueAt.setMinutes(slaDueAt.getMinutes() + slaPolicy.resolution_time_minutes);

    await prisma.remediationTicket.update({
      where: { id: ticket.id },
      data: {
        sla_policy_id: slaPolicy.id,
        sla_due_at: slaDueAt,
      },
    });

    return slaPolicy;
  }
  return null;
}

async function checkSlaBreaches(prisma: any, organizationId: string) {
  const now = new Date();
  
  // Find tickets that have breached SLA
  const breachedTickets = await prisma.remediationTicket.findMany({
    where: {
      organization_id: organizationId,
      sla_due_at: { lt: now },
      sla_breached: false,
      status: { notIn: ['resolved', 'closed', 'cancelled'] },
    },
  });

  for (const ticket of breachedTickets) {
    await prisma.remediationTicket.update({
      where: { id: ticket.id },
      data: { sla_breached: true },
    });

    await recordTicketHistory(
      prisma,
      ticket.id,
      'system',
      'System',
      null,
      'sla_breached',
      'sla_breached',
      'false',
      'true',
      'SLA breach detected automatically'
    );
  }

  return breachedTickets.length;
}

// ==================== MAIN HANDLER ====================

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const method = getHttpMethod(event);
  const path = getHttpPath(event);
  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';
  
  if (method === 'OPTIONS') {
    return corsOptions(origin);
  }

  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    const prisma = getPrismaClient();
    const body = event.body ? JSON.parse(event.body) : {};
    const action = body.action || path.split('/').pop();

    logger.info(`Ticket management action: ${action}`, { userId: user.sub, organizationId });

    // ==================== COMMENTS ====================
    
    if (action === 'add-comment') {
      const validation = addCommentSchema.safeParse(body);
      if (!validation.success) {
        return error(`Validation error: ${validation.error.message}`, 400, undefined, origin);
      }

      const { ticketId, content, isInternal, isResolution, parentId, mentions } = validation.data;

      // Verify ticket belongs to organization
      const ticket = await prisma.remediationTicket.findFirst({
        where: { id: ticketId, organization_id: organizationId },
      });

      if (!ticket) {
        return error('Ticket not found', 404, undefined, origin);
      }

      const comment = await prisma.ticketComment.create({
        data: {
          ticket_id: ticketId,
          user_id: user.sub,
          user_name: user.name || user.email,
          user_email: user.email,
          content,
          is_internal: isInternal,
          is_resolution: isResolution,
          parent_id: parentId,
          mentions,
        },
      });

      // Record first response time if this is the first comment
      if (!ticket.first_response_at) {
        const firstResponseTime = Math.round(
          (new Date().getTime() - new Date(ticket.created_at).getTime()) / 60000
        );
        await prisma.remediationTicket.update({
          where: { id: ticketId },
          data: {
            first_response_at: new Date(),
            time_to_first_response: firstResponseTime,
          },
        });
      }

      await recordTicketHistory(
        prisma, ticketId, user.sub, user.name || user.email, user.email,
        'commented', undefined, undefined, undefined, content.substring(0, 200)
      );

      return success({ comment, message: 'Comment added successfully' });
    }

    if (action === 'update-comment') {
      const validation = updateCommentSchema.safeParse(body);
      if (!validation.success) {
        return error(`Validation error: ${validation.error.message}`, 400, undefined, origin);
      }

      const { commentId, content } = validation.data;

      const existingComment = await prisma.ticketComment.findFirst({
        where: { id: commentId, user_id: user.sub },
        include: { ticket: true },
      });

      if (!existingComment || existingComment.ticket.organization_id !== organizationId) {
        return error('Comment not found or not authorized', 404, undefined, origin);
      }

      const updatedComment = await prisma.ticketComment.update({
        where: { id: commentId },
        data: { content, edited: true, edited_at: new Date() },
      });

      return success({ comment: updatedComment, message: 'Comment updated successfully' });
    }

    if (action === 'delete-comment') {
      const { commentId } = body;
      if (!commentId) return error('commentId is required', 400, undefined, origin);

      const existingComment = await prisma.ticketComment.findFirst({
        where: { id: commentId, user_id: user.sub },
        include: { ticket: true },
      });

      if (!existingComment || existingComment.ticket.organization_id !== organizationId) {
        return error('Comment not found or not authorized', 404, undefined, origin);
      }

      await prisma.ticketComment.delete({ where: { id: commentId } });

      return success({ message: 'Comment deleted successfully' });
    }

    if (action === 'get-comments') {
      const { ticketId } = body;
      if (!ticketId) return error('ticketId is required', 400);

      const ticket = await prisma.remediationTicket.findFirst({
        where: { id: ticketId, organization_id: organizationId },
      });

      if (!ticket) return error('Ticket not found', 404);

      const comments = await prisma.ticketComment.findMany({
        where: { ticket_id: ticketId },
        orderBy: { created_at: 'asc' },
      });

      return success({ comments });
    }

    // ==================== CHECKLIST ====================

    if (action === 'add-checklist-item') {
      const validation = addChecklistItemSchema.safeParse(body);
      if (!validation.success) {
        return error(`Validation error: ${validation.error.message}`, 400);
      }

      const { ticketId, title, description, isRequired, dueDate, orderIndex } = validation.data;

      const ticket = await prisma.remediationTicket.findFirst({
        where: { id: ticketId, organization_id: organizationId },
      });

      if (!ticket) return error('Ticket not found', 404);

      // Get max order index if not provided
      let finalOrderIndex = orderIndex;
      if (finalOrderIndex === undefined) {
        const maxOrder = await prisma.ticketChecklistItem.aggregate({
          where: { ticket_id: ticketId },
          _max: { order_index: true },
        });
        finalOrderIndex = (maxOrder._max.order_index || 0) + 1;
      }

      const item = await prisma.ticketChecklistItem.create({
        data: {
          ticket_id: ticketId,
          title,
          description,
          is_required: isRequired,
          due_date: dueDate ? new Date(dueDate) : null,
          order_index: finalOrderIndex,
          created_by: user.sub,
        },
      });

      await recordTicketHistory(
        prisma, ticketId, user.sub, user.name || user.email, user.email,
        'checklist_updated', 'checklist', null, title, `Added checklist item: ${title}`
      );

      return success({ item, message: 'Checklist item added successfully' });
    }

    if (action === 'update-checklist-item') {
      const validation = updateChecklistItemSchema.safeParse(body);
      if (!validation.success) {
        return error(`Validation error: ${validation.error.message}`, 400);
      }

      const { itemId, ...updates } = validation.data;

      const existingItem = await prisma.ticketChecklistItem.findFirst({
        where: { id: itemId },
        include: { ticket: true },
      });

      if (!existingItem || existingItem.ticket.organization_id !== organizationId) {
        return error('Checklist item not found', 404);
      }

      const updateData: any = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.isRequired !== undefined) updateData.is_required = updates.isRequired;
      if (updates.dueDate !== undefined) updateData.due_date = updates.dueDate ? new Date(updates.dueDate) : null;
      if (updates.orderIndex !== undefined) updateData.order_index = updates.orderIndex;

      // Handle completion status change
      if (updates.isCompleted !== undefined) {
        updateData.is_completed = updates.isCompleted;
        if (updates.isCompleted) {
          updateData.completed_by = user.sub;
          updateData.completed_by_name = user.name || user.email;
          updateData.completed_at = new Date();
        } else {
          updateData.completed_by = null;
          updateData.completed_by_name = null;
          updateData.completed_at = null;
        }
      }

      const updatedItem = await prisma.ticketChecklistItem.update({
        where: { id: itemId },
        data: updateData,
      });

      if (updates.isCompleted !== undefined) {
        await recordTicketHistory(
          prisma, existingItem.ticket_id, user.sub, user.name || user.email, user.email,
          'checklist_updated', 'checklist_item',
          existingItem.is_completed ? 'completed' : 'pending',
          updates.isCompleted ? 'completed' : 'pending',
          `${updates.isCompleted ? 'Completed' : 'Uncompleted'}: ${existingItem.title}`
        );
      }

      return success({ item: updatedItem, message: 'Checklist item updated successfully' });
    }

    if (action === 'delete-checklist-item') {
      const { itemId } = body;
      if (!itemId) return error('itemId is required', 400);

      const existingItem = await prisma.ticketChecklistItem.findFirst({
        where: { id: itemId },
        include: { ticket: true },
      });

      if (!existingItem || existingItem.ticket.organization_id !== organizationId) {
        return error('Checklist item not found', 404);
      }

      await prisma.ticketChecklistItem.delete({ where: { id: itemId } });

      await recordTicketHistory(
        prisma, existingItem.ticket_id, user.sub, user.name || user.email, user.email,
        'checklist_updated', 'checklist', existingItem.title, null, `Removed checklist item: ${existingItem.title}`
      );

      return success({ message: 'Checklist item deleted successfully' });
    }

    if (action === 'get-checklist') {
      const { ticketId } = body;
      if (!ticketId) return error('ticketId is required', 400);

      const ticket = await prisma.remediationTicket.findFirst({
        where: { id: ticketId, organization_id: organizationId },
      });

      if (!ticket) return error('Ticket not found', 404);

      const items = await prisma.ticketChecklistItem.findMany({
        where: { ticket_id: ticketId },
        orderBy: { order_index: 'asc' },
      });

      const stats = {
        total: items.length,
        completed: items.filter((i: any) => i.is_completed).length,
        required: items.filter((i: any) => i.is_required).length,
        requiredCompleted: items.filter((i: any) => i.is_required && i.is_completed).length,
      };

      return success({ items, stats });
    }

    // ==================== RELATIONS ====================

    if (action === 'add-relation') {
      const validation = addRelationSchema.safeParse(body);
      if (!validation.success) {
        return error(`Validation error: ${validation.error.message}`, 400);
      }

      const { sourceTicketId, targetTicketId, relationType, notes } = validation.data;

      if (sourceTicketId === targetTicketId) {
        return error('Cannot create relation to the same ticket', 400);
      }

      // Verify both tickets belong to organization
      const [sourceTicket, targetTicket] = await Promise.all([
        prisma.remediationTicket.findFirst({ where: { id: sourceTicketId, organization_id: organizationId } }),
        prisma.remediationTicket.findFirst({ where: { id: targetTicketId, organization_id: organizationId } }),
      ]);

      if (!sourceTicket || !targetTicket) {
        return error('One or both tickets not found', 404);
      }

      // Check for existing relation
      const existingRelation = await prisma.ticketRelation.findFirst({
        where: { source_ticket_id: sourceTicketId, target_ticket_id: targetTicketId, relation_type: relationType },
      });

      if (existingRelation) {
        return error('Relation already exists', 409);
      }

      const relation = await prisma.ticketRelation.create({
        data: {
          source_ticket_id: sourceTicketId,
          target_ticket_id: targetTicketId,
          relation_type: relationType,
          created_by: user.sub,
          created_by_name: user.name || user.email,
          notes,
        },
      });

      // Create inverse relation for bidirectional types
      const inverseTypes: Record<string, string> = {
        'blocks': 'blocked_by',
        'blocked_by': 'blocks',
        'duplicates': 'duplicate_of',
        'duplicate_of': 'duplicates',
        'parent_of': 'child_of',
        'child_of': 'parent_of',
        'caused_by': 'causes',
        'causes': 'caused_by',
      };

      if (inverseTypes[relationType]) {
        await prisma.ticketRelation.create({
          data: {
            source_ticket_id: targetTicketId,
            target_ticket_id: sourceTicketId,
            relation_type: inverseTypes[relationType],
            created_by: user.sub,
            created_by_name: user.name || user.email,
            notes,
          },
        }).catch(() => {}); // Ignore if inverse already exists
      }

      await recordTicketHistory(
        prisma, sourceTicketId, user.sub, user.name || user.email, user.email,
        'relation_added', 'relations', null, `${relationType} -> ${targetTicket.title}`,
        `Added relation: ${relationType} to ticket "${targetTicket.title}"`
      );

      return success({ relation, message: 'Relation added successfully' });
    }

    if (action === 'delete-relation') {
      const { relationId } = body;
      if (!relationId) return error('relationId is required', 400);

      const relation = await prisma.ticketRelation.findFirst({
        where: { id: relationId },
        include: { source_ticket: true, target_ticket: true },
      });

      if (!relation || relation.source_ticket.organization_id !== organizationId) {
        return error('Relation not found', 404);
      }

      // Delete both directions
      await prisma.ticketRelation.deleteMany({
        where: {
          OR: [
            { source_ticket_id: relation.source_ticket_id, target_ticket_id: relation.target_ticket_id },
            { source_ticket_id: relation.target_ticket_id, target_ticket_id: relation.source_ticket_id },
          ],
        },
      });

      await recordTicketHistory(
        prisma, relation.source_ticket_id, user.sub, user.name || user.email, user.email,
        'relation_removed', 'relations', `${relation.relation_type} -> ${relation.target_ticket.title}`, null,
        `Removed relation to ticket "${relation.target_ticket.title}"`
      );

      return success({ message: 'Relation deleted successfully' });
    }

    if (action === 'get-relations') {
      const { ticketId } = body;
      if (!ticketId) return error('ticketId is required', 400);

      const ticket = await prisma.remediationTicket.findFirst({
        where: { id: ticketId, organization_id: organizationId },
      });

      if (!ticket) return error('Ticket not found', 404);

      const relations = await prisma.ticketRelation.findMany({
        where: { source_ticket_id: ticketId },
        include: {
          target_ticket: {
            select: { id: true, title: true, status: true, severity: true, priority: true },
          },
        },
        orderBy: { created_at: 'desc' },
      });

      // Group by relation type
      const grouped = relations.reduce((acc: any, rel: any) => {
        if (!acc[rel.relation_type]) acc[rel.relation_type] = [];
        acc[rel.relation_type].push(rel);
        return acc;
      }, {});

      return success({ relations, grouped });
    }

    // ==================== SLA POLICIES ====================

    if (action === 'create-sla-policy') {
      const validation = createSlaPolicySchema.safeParse(body);
      if (!validation.success) {
        return error(`Validation error: ${validation.error.message}`, 400);
      }

      const data = validation.data;

      const policy = await prisma.slaPolicy.create({
        data: {
          organization_id: organizationId,
          name: data.name,
          description: data.description,
          severity: data.severity,
          category: data.category,
          response_time_minutes: data.responseTimeMinutes,
          resolution_time_minutes: data.resolutionTimeMinutes,
          escalation_enabled: data.escalationEnabled,
          escalation_after_minutes: data.escalationAfterMinutes,
          escalation_to: data.escalationTo,
          notify_on_breach: data.notifyOnBreach,
          notify_before_breach_minutes: data.notifyBeforeBreachMinutes,
        },
      });

      return success({ policy, message: 'SLA policy created successfully' });
    }

    if (action === 'update-sla-policy') {
      const { policyId, ...updates } = body;
      if (!policyId) return error('policyId is required', 400);

      const existingPolicy = await prisma.slaPolicy.findFirst({
        where: { id: policyId, organization_id: organizationId },
      });

      if (!existingPolicy) return error('SLA policy not found', 404);

      const updateData: any = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.responseTimeMinutes !== undefined) updateData.response_time_minutes = updates.responseTimeMinutes;
      if (updates.resolutionTimeMinutes !== undefined) updateData.resolution_time_minutes = updates.resolutionTimeMinutes;
      if (updates.escalationEnabled !== undefined) updateData.escalation_enabled = updates.escalationEnabled;
      if (updates.escalationAfterMinutes !== undefined) updateData.escalation_after_minutes = updates.escalationAfterMinutes;
      if (updates.escalationTo !== undefined) updateData.escalation_to = updates.escalationTo;
      if (updates.notifyOnBreach !== undefined) updateData.notify_on_breach = updates.notifyOnBreach;
      if (updates.notifyBeforeBreachMinutes !== undefined) updateData.notify_before_breach_minutes = updates.notifyBeforeBreachMinutes;
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

      const policy = await prisma.slaPolicy.update({
        where: { id: policyId },
        data: updateData,
      });

      return success({ policy, message: 'SLA policy updated successfully' });
    }

    if (action === 'delete-sla-policy') {
      const { policyId } = body;
      if (!policyId) return error('policyId is required', 400);

      const existingPolicy = await prisma.slaPolicy.findFirst({
        where: { id: policyId, organization_id: organizationId },
      });

      if (!existingPolicy) return error('SLA policy not found', 404);

      await prisma.slaPolicy.delete({ where: { id: policyId } });

      return success({ message: 'SLA policy deleted successfully' });
    }

    if (action === 'get-sla-policies') {
      const policies = await prisma.slaPolicy.findMany({
        where: { organization_id: organizationId },
        orderBy: [{ severity: 'asc' }, { category: 'asc' }],
      });

      return success({ policies });
    }

    if (action === 'init-default-sla-policies') {
      // Create default SLA policies if none exist
      const existingPolicies = await prisma.slaPolicy.count({
        where: { organization_id: organizationId },
      });

      if (existingPolicies > 0) {
        return success({ message: 'SLA policies already exist', created: 0 });
      }

      const defaultPolicies = [
        { severity: 'critical', name: 'Critical SLA', response_time_minutes: 60, resolution_time_minutes: 240 },
        { severity: 'high', name: 'High SLA', response_time_minutes: 240, resolution_time_minutes: 1440 },
        { severity: 'medium', name: 'Medium SLA', response_time_minutes: 480, resolution_time_minutes: 4320 },
        { severity: 'low', name: 'Low SLA', response_time_minutes: 1440, resolution_time_minutes: 10080 },
      ];

      const created = await prisma.slaPolicy.createMany({
        data: defaultPolicies.map(p => ({
          organization_id: organizationId,
          ...p,
          description: `Default ${p.severity} severity SLA policy`,
          escalation_enabled: true,
          notify_on_breach: true,
        })),
      });

      return success({ message: 'Default SLA policies created', created: created.count });
    }

    // ==================== HISTORY ====================

    if (action === 'get-history') {
      const { ticketId } = body;
      if (!ticketId) return error('ticketId is required', 400);

      const ticket = await prisma.remediationTicket.findFirst({
        where: { id: ticketId, organization_id: organizationId },
      });

      if (!ticket) return error('Ticket not found', 404);

      const history = await prisma.ticketHistory.findMany({
        where: { ticket_id: ticketId },
        orderBy: { created_at: 'desc' },
      });

      return success({ history });
    }

    // ==================== STATUS UPDATE WITH HISTORY ====================

    if (action === 'update-status') {
      const validation = updateTicketStatusSchema.safeParse(body);
      if (!validation.success) {
        return error(`Validation error: ${validation.error.message}`, 400);
      }

      const { ticketId, status, comment, resolutionNotes } = validation.data;

      const ticket = await prisma.remediationTicket.findFirst({
        where: { id: ticketId, organization_id: organizationId },
        include: { checklist_items: true },
      });

      if (!ticket) return error('Ticket not found', 404);

      // Check if resolution is blocked by required checklist items
      if (['resolved', 'closed'].includes(status)) {
        const incompleteRequired = ticket.checklist_items.filter(
          (item: any) => item.is_required && !item.is_completed
        );
        if (incompleteRequired.length > 0) {
          return error(
            `Cannot resolve ticket: ${incompleteRequired.length} required checklist item(s) not completed`,
            400
          );
        }
      }

      const oldStatus = ticket.status;
      const updateData: any = { status, updated_at: new Date() };

      if (['resolved', 'closed'].includes(status) && !ticket.resolved_at) {
        updateData.resolved_at = new Date();
        updateData.time_to_resolution = Math.round(
          (new Date().getTime() - new Date(ticket.created_at).getTime()) / 60000
        );
      }

      if (resolutionNotes) {
        updateData.resolution_notes = resolutionNotes;
      }

      if (status === 'reopened') {
        updateData.resolved_at = null;
        updateData.time_to_resolution = null;
        updateData.status = 'open';
      }

      const updatedTicket = await prisma.remediationTicket.update({
        where: { id: ticketId },
        data: updateData,
      });

      await recordTicketHistory(
        prisma, ticketId, user.sub, user.name || user.email, user.email,
        'status_changed', 'status', oldStatus, status, comment
      );

      return success({ ticket: updatedTicket, message: 'Status updated successfully' });
    }

    // ==================== CHECK SLA BREACHES ====================

    if (action === 'check-sla-breaches') {
      const breachedCount = await checkSlaBreaches(prisma, organizationId);
      return success({ breachedCount, message: `Checked SLA breaches: ${breachedCount} tickets breached` });
    }

    // ==================== GET TICKET DETAILS WITH ALL RELATIONS ====================

    if (action === 'get-ticket-details') {
      const { ticketId } = body;
      if (!ticketId) return error('ticketId is required', 400);

      const ticket = await prisma.remediationTicket.findFirst({
        where: { id: ticketId, organization_id: organizationId },
        include: {
          sla_policy: true,
          history: { orderBy: { created_at: 'desc' }, take: 50 },
          comments: { orderBy: { created_at: 'asc' } },
          checklist_items: { orderBy: { order_index: 'asc' } },
          source_relations: {
            include: {
              target_ticket: {
                select: { id: true, title: true, status: true, severity: true, priority: true },
              },
            },
          },
        },
      });

      if (!ticket) return error('Ticket not found', 404);

      // Calculate checklist stats
      const checklistStats = {
        total: ticket.checklist_items.length,
        completed: ticket.checklist_items.filter((i: any) => i.is_completed).length,
        required: ticket.checklist_items.filter((i: any) => i.is_required).length,
        requiredCompleted: ticket.checklist_items.filter((i: any) => i.is_required && i.is_completed).length,
      };

      // Calculate SLA status
      let slaStatus = 'no_sla';
      if (ticket.sla_due_at) {
        const now = new Date();
        const dueAt = new Date(ticket.sla_due_at);
        if (ticket.sla_breached) {
          slaStatus = 'breached';
        } else if (dueAt < now) {
          slaStatus = 'breached';
        } else {
          const hoursRemaining = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
          slaStatus = hoursRemaining < 2 ? 'at_risk' : 'on_track';
        }
      }

      return success({
        ticket,
        checklistStats,
        slaStatus,
        commentsCount: ticket.comments.length,
        relationsCount: ticket.source_relations.length,
      });
    }

    return error(`Unknown action: ${action}`, 400, undefined, origin);

  } catch (err) {
    logger.error('Ticket management error:', err);
    return error('An unexpected error occurred. Please try again.', 500, undefined, origin);
  }
}
