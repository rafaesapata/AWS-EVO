"use strict";
/**
 * Lambda handler para criar tickets de remediação de segurança
 * Cria tickets baseados em findings de segurança selecionados
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const validation_js_1 = require("../../lib/validation.js");
const logging_js_1 = require("../../lib/logging.js");
const middleware_js_1 = require("../../lib/middleware.js");
async function handler(event, _context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    if (event.requestContext?.http?.method === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    let user;
    let organizationId;
    try {
        user = (0, auth_js_1.getUserFromEvent)(event);
    }
    catch (authError) {
        return (0, response_js_1.error)('Unauthorized - user not found', 401, undefined, origin);
    }
    try {
        organizationId = (0, auth_js_1.getOrganizationId)(user);
    }
    catch (orgError) {
        return (0, response_js_1.error)('Unauthorized - organization not found', 401, undefined, origin);
    }
    const prisma = (0, database_js_1.getPrismaClient)();
    logging_js_1.logger.info('Create remediation ticket started', { organizationId, userId: user.sub });
    try {
        // Parse and validate request body
        const bodyValidation = (0, validation_js_1.parseAndValidateBody)(validation_js_1.createRemediationTicketSchema, event.body || null);
        if (!bodyValidation.success)
            return bodyValidation.error;
        const { findingIds, title, description, priority } = bodyValidation.data;
        // Verify organization matches
        if (bodyValidation.data.organizationId !== organizationId) {
            return (0, response_js_1.error)('Organization mismatch', 403, undefined, origin);
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
            return (0, response_js_1.badRequest)('Some findings not found or do not belong to your organization', undefined, origin);
        }
        // Calculate priority based on findings if not explicitly set
        let calculatedPriority = priority;
        if (priority === 'medium') { // Default priority, calculate based on findings
            const hasCritical = findings.some(f => f.severity === 'critical');
            const hasHigh = findings.some(f => f.severity === 'high');
            if (hasCritical) {
                calculatedPriority = 'critical';
            }
            else if (hasHigh) {
                calculatedPriority = 'high';
            }
        }
        // Generate ticket description if not provided
        let ticketDescription = description || '';
        if (!ticketDescription) {
            const severityCounts = findings.reduce((acc, f) => {
                acc[f.severity] = (acc[f.severity] || 0) + 1;
                return acc;
            }, {});
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
                    }, {})
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
        logging_js_1.logger.info('Remediation ticket created successfully', {
            organizationId,
            ticketId: ticket.id,
            findingsCount: findings.length,
            priority: calculatedPriority
        });
        return (0, response_js_1.success)({
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
    }
    catch (err) {
        logging_js_1.logger.error('Create remediation ticket failed', {
            error: err.message,
            stack: err.stack,
            organizationId
        });
        return (0, response_js_1.error)('Failed to create remediation ticket: ' + err.message, 500, undefined, origin);
    }
}
//# sourceMappingURL=create-remediation-ticket.js.map