"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const logging_js_1 = require("../../lib/logging.js");
const client_cloudtrail_1 = require("@aws-sdk/client-cloudtrail");
async function handler(event, context) {
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('Lateral Movement Detection started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId, region: requestedRegion, lookbackHours = 24 } = body;
        if (!accountId) {
            return (0, response_js_1.error)('Missing required parameter: accountId');
        }
        const prisma = (0, database_js_1.getPrismaClient)();
        const account = await prisma.awsCredential.findFirst({
            where: { id: accountId, organization_id: organizationId, is_active: true },
        });
        if (!account) {
            return (0, response_js_1.error)('AWS account not found');
        }
        // Usar região solicitada, ou primeira região da conta, ou padrão
        const accountRegions = account.regions;
        const region = requestedRegion ||
            (accountRegions && accountRegions.length > 0 ? accountRegions[0] : 'us-east-1');
        const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(account, region);
        const ctClient = new client_cloudtrail_1.CloudTrailClient({
            region,
            credentials: (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds),
        });
        const startTime = new Date();
        startTime.setHours(startTime.getHours() - lookbackHours);
        const response = await ctClient.send(new client_cloudtrail_1.LookupEventsCommand({
            StartTime: startTime,
            EndTime: new Date(),
            MaxResults: 50,
        }));
        const suspiciousActivities = [];
        const events = response.Events || [];
        // Detectar AssumeRole suspeito
        const assumeRoleEvents = events.filter(e => e.EventName === 'AssumeRole');
        if (assumeRoleEvents.length > 5) {
            suspiciousActivities.push({
                type: 'excessive_assume_role',
                severity: 'medium',
                count: assumeRoleEvents.length,
                description: `${assumeRoleEvents.length} AssumeRole events detected`,
            });
        }
        // Detectar acesso a múltiplos serviços
        const services = new Set(events.map(e => e.EventSource));
        if (services.size > 10) {
            suspiciousActivities.push({
                type: 'multiple_services_access',
                severity: 'low',
                count: services.size,
                description: `Access to ${services.size} different services`,
            });
        }
        logging_js_1.logger.info('Lateral movement detection completed', {
            organizationId,
            accountId,
            region,
            eventsAnalyzed: events.length,
            suspiciousActivitiesFound: suspiciousActivities.length
        });
        return (0, response_js_1.success)({
            success: true,
            suspiciousActivities,
            eventsAnalyzed: events.length,
        });
    }
    catch (err) {
        logging_js_1.logger.error('Lateral Movement Detection error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=lateral-movement-detection.js.map