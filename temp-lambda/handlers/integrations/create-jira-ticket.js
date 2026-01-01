"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 Create Jira Ticket started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { findingId, title, description, priority = 'Medium', issueType = 'Bug' } = body;
        if (!title || !description) {
            return (0, response_js_1.error)('Missing required parameters: title, description');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        // Buscar configuração Jira da organização
        const jiraConfig = await prisma.jiraIntegration.findFirst({
            where: { organization_id: organizationId, is_active: true },
        });
        if (!jiraConfig) {
            return (0, response_js_1.error)('Jira integration not configured');
        }
        // Criar ticket no Jira
        const jiraPayload = {
            fields: {
                project: { key: jiraConfig.project_key },
                summary: title,
                description,
                issuetype: { name: issueType },
                priority: { name: priority },
            },
        };
        const jiraResponse = await fetch(`${jiraConfig.base_url}/rest/api/3/issue`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${jiraConfig.email}:${jiraConfig.api_token}`).toString('base64')}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(jiraPayload),
        });
        if (!jiraResponse.ok) {
            const errorText = await jiraResponse.text();
            throw new Error(`Jira API error: ${errorText}`);
        }
        const jiraTicket = await jiraResponse.json();
        // Salvar referência no banco
        await prisma.jiraTicket.create({
            data: {
                organization_id: organizationId,
                finding_id: findingId,
                jira_key: jiraTicket.key,
                jira_id: jiraTicket.id,
                title,
                status: 'Open',
                url: `${jiraConfig.base_url}/browse/${jiraTicket.key}`,
            },
        });
        logging_js_1.logger.info(`✅ Created Jira ticket: ${jiraTicket.key}`);
        return (0, response_js_1.success)({
            success: true,
            ticket: {
                key: jiraTicket.key,
                id: jiraTicket.id,
                url: `${jiraConfig.base_url}/browse/${jiraTicket.key}`,
            },
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Create Jira Ticket error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=create-jira-ticket.js.map