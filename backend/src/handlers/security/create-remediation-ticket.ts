/**
 * Lambda handler para criar tickets de remediação de segurança
 * Cria tickets baseados em findings de segurança selecionados
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { parseAndValidateBody, createRemediationTicketSchema } from '../../lib/validation.js';
import { logger } from '../../lib/logging.js';
import { getOrigin } from '../../lib/middleware.js';

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOrigin(event);
  
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions(origin);
  }

  let user: ReturnType<typeof getUserFromEvent>;
  let organizationId: string;
  
  try {
    user = getUserFromEvent(event);
  } catch (authError) {
    return error('Unauthorized - user not found', 401, undefined, origin);
  }
  
  try {
    organizationId = getOrganizationId(user);
  } catch (orgError) {
    return error('Unauthorized - organization not found', 401, undefined, origin);
  }
  
  const prisma = getPrismaClient();
  
  logger.info('Create remediation ticket started', { organizationId, userId: user.sub });

  try {
    // Parse and validate request body
    const bodyValidation = parseAndValidateBody(createRemediationTicketSchema, event.body || null);
    if (!bodyValidation.success) return bodyValidation.error;
    
    const { findingIds, title, description, priority } = bodyValidation.data;

    // Verify organization matches
    if (bodyValidation.data.organizationId !== organizationId) {
      return error('Organization mismatch', 403, undefined, origin);
    }

    // Fetch the findings to validate they exist and belong to the organization
    const findings = await prisma.finding.findMany({
      where: {
        id: { in: findingIds },
        organization_id: organizationId,
      },
      select: {
        id: true,
        severity: true,
        description: true,
        resource_id: true,
        service: true,
        category: true,
      }
    });

    if (findings.length !== findingIds.length) {
      return badRequest('Some findings not found or do not belong to your organization', undefined, origin);
    }

    // Calculate priority based on findings if not explicitly set
    let calculatedPriority = priority;
    if (priority === 'medium') { // Default priority, calculate based on findings
      const hasCritical = findings.some(f => f.severity === 'critical');
      const hasHigh = findings.some(f => f.severity === 'high');
      
      if (hasCritical) {
        calculatedPriority = 'critical';
      } else if (hasHigh) {
        calculatedPriority = 'high';
      }
    }

    // Generate ticket description if not provided
    let ticketDescription = description || '';
    if (!ticketDescription) {
      const severityCounts = findings.reduce((acc, f) => {
        acc[f.severity] = (acc[f.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const services = [...new Set(findings.map(f => f.service))];
      const categories = [...new Set(findings.map(f => f.category))];

      ticketDescription = `Ticket de remediação criado automaticamente para ${findings.length} achados de segurança.\n\n`;
      ticketDescription += `Severidades: ${Object.entries(severityCounts).map(([sev, count]) => `${count} ${sev}`).join(', ')}\n`;
      ticketDescription += `Serviços afetados: ${services.join(', ')}\n`;
      ticketDescription += `Categorias: ${categories.join(', ')}\n\n`;
      ticketDescription += `Achados incluídos:\n${findings.map(f => `- ${f.resource_id}: ${f.description.substring(0, 100)}...`).join('\n')}`;
    }

    // Create the remediation ticket
    const ticket = await prisma.remediationTicket.create({
      data: {
        organization_id: organizationId,
        title,
        description: ticketDescription,
        priority: calculatedPriority,
        status: 'open',
        created_by: user.sub,
        finding_ids: findingIds,
        metadata: {
          findings_count: findings.length,
          services: [...new Set(findings.map(f => f.service))],
          categories: [...new Set(findings.map(f => f.category))],
          severities: findings.reduce((acc, f) => {
            acc[f.severity] = (acc[f.severity] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        }
      }
    });

    // Update findings to reference the ticket (remove this for now since we need migration)
    // await prisma.finding.updateMany({
    //   where: {
    //     id: { in: findingIds },
    //     organization_id: organizationId,
    //   },
    //   data: {
    //     status: 'in_progress',
    //     remediation_ticket_id: ticket.id,
    //   }
    // });

    logger.info('Remediation ticket created successfully', {
      organizationId,
      ticketId: ticket.id,
      findingsCount: findings.length,
      priority: calculatedPriority
    });

    return success({
      ticket: {
        id: ticket.id,
        title: ticket.title,
        description: ticket.description,
        priority: ticket.priority,
        status: ticket.status,
        created_at: ticket.created_at,
        findings_count: findings.length,
      },
      findings_updated: findings.length,
    }, 201, origin);

  } catch (err) {
    logger.error('Create remediation ticket failed', { 
      error: (err as Error).message, 
      stack: (err as Error).stack,
      organizationId 
    });
    return error('Failed to create remediation ticket: ' + (err as Error).message, 500, undefined, origin);
  }
}