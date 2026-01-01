"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const database_js_1 = require("../../lib/database.js");
const response_js_1 = require("../../lib/response.js");
const middleware_js_1 = require("../../lib/middleware.js");
const crypto = __importStar(require("crypto"));
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    // Note: TV token verification doesn't use standard Cognito auth
    // It uses its own token-based authentication
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        const body = JSON.parse(event.body || '{}');
        const { token, deviceId } = body;
        if (!token || !deviceId) {
            return (0, response_js_1.badRequest)('token and deviceId are required', undefined, origin);
        }
        // Buscar token no banco
        const tvToken = await prisma.tvDisplayToken.findFirst({
            where: {
                token,
                is_active: true,
                expires_at: { gt: new Date() }
            }
        });
        if (!tvToken) {
            await prisma.securityEvent.create({
                data: {
                    organization_id: 'default',
                    event_type: 'TV_TOKEN_INVALID',
                    severity: 'MEDIUM',
                    description: 'Invalid TV token attempt',
                    metadata: { deviceId, tokenPrefix: token.substring(0, 8) }
                }
            });
            return (0, response_js_1.error)('Invalid or expired token', 401, undefined, origin);
        }
        // Rate limiting
        const recentRequests = await prisma.tvTokenUsage.count({
            where: {
                token_id: tvToken.id,
                used_at: { gt: new Date(Date.now() - 60000) }
            }
        });
        if (recentRequests > 60) {
            return (0, response_js_1.tooManyRequests)('Rate limit exceeded', 60, origin);
        }
        // Registrar uso
        const sourceIp = event.requestContext?.identity?.sourceIp ||
            event.headers?.['x-forwarded-for']?.split(',')[0] || 'unknown';
        await prisma.tvTokenUsage.create({
            data: { token_id: tvToken.id, ip_address: sourceIp }
        });
        // Gerar token de sessão temporário
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionExpiry = new Date(Date.now() + 3600000);
        await prisma.tvSession.create({
            data: { token_id: tvToken.id, session_data: { sessionToken, deviceId } }
        });
        // Buscar dados do dashboard
        const dashboardData = await getDashboardData(tvToken.organization_id);
        return (0, response_js_1.success)({
            sessionToken,
            expiresAt: sessionExpiry.toISOString(),
            organization: { id: tvToken.organization_id },
            dashboard: { id: 'default', name: 'Default Dashboard', type: 'security' },
            data: dashboardData,
            refreshInterval: 60
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('TV token verification error:', err);
        return (0, response_js_1.error)('Internal server error', 500, undefined, origin);
    }
}
async function getDashboardData(organizationId) {
    const prisma = (0, database_js_1.getPrismaClient)();
    const [securityStats, costStats] = await Promise.all([
        getSecurityStats(organizationId),
        getCostStats(organizationId)
    ]);
    return { security: securityStats, cost: costStats };
}
async function getSecurityStats(organizationId) {
    const prisma = (0, database_js_1.getPrismaClient)();
    const [openFindings, recentScans] = await Promise.all([
        prisma.securityFinding.groupBy({
            by: ['severity'],
            where: { organization_id: organizationId, status: 'open' },
            _count: true
        }),
        prisma.securityScan.findMany({
            where: { organization_id: organizationId },
            orderBy: { created_at: 'desc' },
            take: 5,
            select: { id: true, scan_type: true, status: true, created_at: true }
        })
    ]);
    return {
        findingsBySeverity: openFindings.reduce((acc, f) => ({ ...acc, [f.severity]: f._count }), {}),
        recentScans,
        totalOpenFindings: openFindings.reduce((sum, f) => sum + f._count, 0)
    };
}
async function getCostStats(organizationId) {
    const prisma = (0, database_js_1.getPrismaClient)();
    const accounts = await prisma.awsAccount.findMany({
        where: { organization_id: organizationId },
        select: { id: true, account_name: true }
    });
    // Aggregate costs by date for the organization
    const costData = await prisma.dailyCost.groupBy({
        by: ['date'],
        where: {
            organization_id: organizationId,
            date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        },
        _sum: { cost: true },
        orderBy: { date: 'desc' }
    });
    return {
        totalLast30Days: costData.reduce((sum, c) => sum + Number(c._sum.cost || 0), 0),
        accountCount: accounts.length,
        trend: costData.slice(0, 7).map(c => ({ date: c.date, amount: Number(c._sum.cost || 0) }))
    };
}
//# sourceMappingURL=verify-tv-token.js.map