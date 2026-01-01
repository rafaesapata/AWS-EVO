"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
async function handler(event, context) {
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    logging_js_1.logger.info('Get findings started', {
        organizationId,
        userId: user.sub,
        requestId: context.awsRequestId
    });
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        // Parse query parameters - support both REST API (queryStringParameters) and HTTP API (rawQueryString)
        const params = (0, middleware_js_1.getHttpMethod)(event) === 'GET'
            ? (event.queryStringParameters || parseQueryParams(event.rawQueryString || ''))
            : (event.body ? JSON.parse(event.body) : {});
        const { severity, status, service, category, scan_type, limit = 50, offset = 0, sort_by = 'created_at', sort_order = 'desc', } = params;
        const prisma = (0, database_js_1.getPrismaClient)();
        // Build where clause with tenant isolation
        const where = {
            organization_id: organizationId,
            ...(severity && { severity }),
            ...(status && { status }),
            ...(service && { service }),
            ...(category && { category }),
            ...(scan_type && { scan_type }),
        };
        // Get findings with pagination
        const [findings, total] = await Promise.all([
            prisma.finding.findMany({
                where,
                take: Math.min(limit, 100), // Max 100 per request
                skip: offset,
                orderBy: {
                    [sort_by]: sort_order,
                },
            }),
            prisma.finding.count({ where }),
        ]);
        // Get summary statistics (case-insensitive severity)
        const stats = await prisma.finding.groupBy({
            by: ['severity'],
            where: { organization_id: organizationId },
            _count: true,
        });
        // Normalize severity counts (handle both upper and lower case)
        const normalizedStats = {};
        stats.forEach(s => {
            const key = (s.severity || 'low').toLowerCase();
            normalizedStats[key] = (normalizedStats[key] || 0) + s._count;
        });
        const summary = {
            total,
            critical: normalizedStats['critical'] || 0,
            high: normalizedStats['high'] || 0,
            medium: normalizedStats['medium'] || 0,
            low: normalizedStats['low'] || 0,
        };
        logging_js_1.logger.info('Findings retrieved successfully', {
            organizationId,
            findingsReturned: findings.length,
            totalFindings: total,
            filters: { severity, status, service, category, scan_type }
        });
        return (0, response_js_1.success)({
            findings,
            pagination: {
                total,
                limit,
                offset,
                has_more: offset + findings.length < total,
            },
            summary,
        });
    }
    catch (err) {
        logging_js_1.logger.error('Get findings error', err, {
            organizationId,
            userId: user.sub,
            requestId: context.awsRequestId
        });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
/**
 * Parse query string parameters
 */
function parseQueryParams(queryString) {
    if (!queryString)
        return {};
    const params = {};
    const pairs = queryString.split('&');
    for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key && value) {
            const decodedKey = decodeURIComponent(key);
            const decodedValue = decodeURIComponent(value);
            // Convert numeric strings to numbers
            if (/^\d+$/.test(decodedValue)) {
                params[decodedKey] = parseInt(decodedValue, 10);
            }
            else {
                params[decodedKey] = decodedValue;
            }
        }
    }
    return params;
}
//# sourceMappingURL=get-findings.js.map