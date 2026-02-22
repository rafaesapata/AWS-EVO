/**
 * Ticket Workflow Engine
 * - State machine for status transitions
 * - Auto-assignment via rules + round-robin
 * - Watcher notification helpers
 * - Bulk operation helpers
 */

import { logger } from './logger.js';

// ==================== STATE MACHINE ====================

/**
 * Valid status transitions map.
 * Key = current status, Value = array of allowed next statuses.
 */
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  open:           ['in_progress', 'cancelled', 'blocked'],
  in_progress:    ['pending_review', 'blocked', 'resolved', 'cancelled', 'open'],
  pending_review: ['in_progress', 'resolved', 'blocked', 'open'],
  blocked:        ['open', 'in_progress', 'cancelled'],
  resolved:       ['closed', 'open'], // reopen goes to open
  closed:         ['open'], // reopen
  cancelled:      ['open'], // reopen
  reopened:       ['open'], // alias — always maps to open
};

export function isValidTransition(currentStatus: string, newStatus: string): boolean {
  // "reopened" is a virtual status that always maps to "open"
  const effectiveNew = newStatus === 'reopened' ? 'open' : newStatus;
  const allowed = STATUS_TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.includes(effectiveNew);
}

export function getAllowedTransitions(currentStatus: string): string[] {
  return STATUS_TRANSITIONS[currentStatus] || [];
}

// ==================== AUTO-ASSIGNMENT ====================

export interface AssignmentRuleMatch {
  ruleId: string;
  assignTo: string;
  ruleName: string;
  strategy: string;
}

/**
 * Find the best matching assignment rule for a ticket.
 * Rules are evaluated by priority (desc). First match wins.
 * For round_robin, returns the next user in pool and increments index.
 */
export async function findAssignment(
  prisma: any,
  organizationId: string,
  ticket: { severity?: string; category?: string; metadata?: any },
  dryRun = false
): Promise<AssignmentRuleMatch | null> {
  const rules = await prisma.assignmentRule.findMany({
    where: { organization_id: organizationId, is_active: true },
    orderBy: { priority: 'desc' },
  });

  const services = ticket.metadata?.services as string[] | undefined;

  for (const rule of rules) {
    // Check severity match
    if (rule.match_severity && rule.match_severity !== ticket.severity) continue;
    // Check category match
    if (rule.match_category && rule.match_category !== ticket.category) continue;
    // Check service match
    if (rule.match_service) {
      if (!services || !services.includes(rule.match_service)) continue;
    }

    if (rule.strategy === 'specific_user' && rule.assign_to) {
      return { ruleId: rule.id, assignTo: rule.assign_to, ruleName: rule.name, strategy: 'specific_user' };
    }

    if (rule.strategy === 'round_robin' && rule.round_robin_pool.length > 0) {
      const pool = rule.round_robin_pool as string[];
      const idx = rule.round_robin_index % pool.length;
      const assignTo = pool[idx];

      // Increment round-robin index atomically (skip in dryRun)
      if (!dryRun) {
        await prisma.assignmentRule.update({
          where: { id: rule.id },
          data: { round_robin_index: (rule.round_robin_index + 1) % pool.length },
        });
      }

      return { ruleId: rule.id, assignTo, ruleName: rule.name, strategy: 'round_robin' };
    }
  }

  return null;
}

// ==================== WATCHER NOTIFICATIONS ====================

export type WatchEventType = 'status_changed' | 'commented' | 'assigned' | 'sla_warning' | 'sla_breached' | 'resolved' | 'escalated';

/**
 * Get all watcher emails for a ticket event, filtered by watch_type.
 * Also includes assigned_to user if not already a watcher.
 */
export async function getWatcherRecipients(
  prisma: any,
  ticketId: string,
  organizationId: string,
  eventType: WatchEventType,
  excludeUserId?: string
): Promise<Array<{ userId: string; email: string; name: string | null }>> {
  // Map event types to watch_type filters
  const watchTypeFilter = eventType === 'commented'
    ? ['all', 'comments_only']
    : ['all', 'status_only'];

  const watchers = await prisma.ticketWatcher.findMany({
    where: {
      ticket_id: ticketId,
      watch_type: { in: watchTypeFilter },
      ...(excludeUserId ? { user_id: { not: excludeUserId } } : {}),
    },
    select: { user_id: true, user_email: true, user_name: true },
  });

  const recipients: Array<{ userId: string; email: string; name: string | null }> = [];
  const seenIds = new Set<string>();

  for (const w of watchers) {
    if (w.user_email && !seenIds.has(w.user_id)) {
      seenIds.add(w.user_id);
      recipients.push({ userId: w.user_id, email: w.user_email, name: w.user_name });
    }
  }

  // Also include assigned_to if they have a profile with email
  const ticket = await prisma.remediationTicket.findFirst({
    where: { id: ticketId, organization_id: organizationId },
    select: { assigned_to: true },
  });

  if (ticket?.assigned_to && !seenIds.has(ticket.assigned_to) && ticket.assigned_to !== excludeUserId) {
    const profile = await prisma.profile.findFirst({
      where: { id: ticket.assigned_to, organization_id: organizationId },
      select: { id: true, email: true, full_name: true },
    });
    if (profile?.email) {
      recipients.push({ userId: profile.id, email: profile.email, name: profile.full_name });
    }
  }

  return recipients;
}

/**
 * Auto-watch: add the creator and assignee as watchers if not already watching.
 */
export async function autoWatch(
  prisma: any,
  ticketId: string,
  userId: string,
  userName: string | null,
  userEmail: string | null
): Promise<void> {
  try {
    await prisma.ticketWatcher.upsert({
      where: { ticket_id_user_id: { ticket_id: ticketId, user_id: userId } },
      create: {
        ticket_id: ticketId,
        user_id: userId,
        user_name: userName,
        user_email: userEmail,
        watch_type: 'all',
      },
      update: {}, // no-op if already exists
    });
  } catch (err) {
    logger.warn('Auto-watch failed (non-critical)', { ticketId, userId, error: (err as Error).message });
  }
}

// ==================== BULK VALIDATION ====================

/**
 * Validate that all ticket IDs belong to the organization.
 * Returns the valid ticket IDs and any invalid ones.
 */
export async function validateTicketOwnership(
  prisma: any,
  ticketIds: string[],
  organizationId: string
): Promise<{ valid: string[]; invalid: string[] }> {
  const tickets = await prisma.remediationTicket.findMany({
    where: { id: { in: ticketIds }, organization_id: organizationId },
    select: { id: true },
  });

  const validSet = new Set(tickets.map((t: any) => t.id));
  const valid = ticketIds.filter(id => validSet.has(id));
  const invalid = ticketIds.filter(id => !validSet.has(id));

  return { valid, invalid };
}
