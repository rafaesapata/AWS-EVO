import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler for Create Jira Ticket
 * AWS Lambda Handler for create-jira-ticket
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { logger } from '../../lib/logging.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { createJiraTicketSchema } from '../../lib/schemas.js';
import { parseAndValidateBody } from '../../lib/validation.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('🚀 Create Jira Ticket started');
  
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Validate request body
    const validation = parseAndValidateBody(createJiraTicketSchema, event.body);
    if (!validation.success) {
      return validation.error;
    }
    const { findingId, title, description, priority = 'Medium', issueType = 'Bug' } = validation.data;
    
    const prisma = getPrismaClient();
    
    // Buscar configuração Jira da organização
    const jiraConfig = await prisma.jiraIntegration.findFirst({
      where: { organization_id: organizationId, is_active: true },
    });
    
    if (!jiraConfig) {
      return error('Jira integration not configured');
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
    
    const jiraTicket = await jiraResponse.json() as { key: string; id: string };
    
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
    
    logger.info(`✅ Created Jira ticket: ${jiraTicket.key}`);
    
    return success({
      success: true,
      ticket: {
        key: jiraTicket.key,
        id: jiraTicket.id,
        url: `${jiraConfig.base_url}/browse/${jiraTicket.key}`,
      },
    });
    
  } catch (err) {
    logger.error('❌ Create Jira Ticket error:', err);
    return error('An unexpected error occurred. Please try again.', 500);
  }
}
