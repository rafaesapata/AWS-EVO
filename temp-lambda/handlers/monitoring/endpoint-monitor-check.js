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
const middleware_js_1 = require("../../lib/middleware.js");
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
async function handler(event, context) {
    logging_js_1.logger.info('🚀 Endpoint Monitor Check started');
    // Check if this is an EventBridge scheduled event (no HTTP context)
    const isScheduledEvent = !event.requestContext?.http && !event.httpMethod;
    if (!isScheduledEvent && (0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        let organizationId;
        let endpointId;
        // If called from API with auth, filter by organization
        // If called from EventBridge, check ALL active endpoints
        if (!isScheduledEvent) {
            try {
                const user = (0, auth_js_1.getUserFromEvent)(event);
                organizationId = (0, auth_js_1.getOrganizationId)(user);
                const body = event.body ? JSON.parse(event.body) : {};
                endpointId = body.endpointId;
            }
            catch {
                // If no auth, proceed without org filter (scheduled job)
            }
        }
        // Buscar endpoints para monitorar
        const endpoints = await prisma.monitoredEndpoint.findMany({
            where: {
                is_active: true,
                ...(organizationId && { organization_id: organizationId }),
                ...(endpointId && { id: endpointId }),
            },
        });
        if (endpoints.length === 0) {
            logging_js_1.logger.info('No active endpoints to monitor');
            return (0, response_js_1.success)({
                success: true,
                message: 'No active endpoints to monitor',
                results: [],
            });
        }
        logging_js_1.logger.info(`Found ${endpoints.length} endpoints to check`);
        const results = [];
        // Verificar cada endpoint
        for (const endpoint of endpoints) {
            const result = await checkEndpoint(endpoint.url, endpoint.timeout || 5000);
            results.push({
                endpointId: endpoint.id,
                url: endpoint.url,
                status: result.status,
                statusCode: result.statusCode,
                responseTime: result.responseTime,
                error: result.error,
                checkedAt: new Date(),
            });
            // Salvar resultado no banco
            await prisma.endpointCheckHistory.create({
                data: {
                    endpoint_id: endpoint.id,
                    status: result.status,
                    status_code: result.statusCode,
                    response_time: result.responseTime,
                    error: result.error,
                    checked_at: new Date(),
                },
            });
            // Atualizar status do endpoint (incluindo SSL)
            await prisma.monitoredEndpoint.update({
                where: { id: endpoint.id },
                data: {
                    last_status: result.status,
                    last_checked_at: new Date(),
                    last_response_time: result.responseTime,
                    ...(result.sslInfo && {
                        ssl_valid: result.sslInfo.valid,
                        ssl_expiry_date: result.sslInfo.expiryDate,
                        ssl_issuer: result.sslInfo.issuer,
                    }),
                },
            });
            // Criar alerta se endpoint estiver down
            if (result.status === 'down' && endpoint.alert_on_failure) {
                await prisma.alert.create({
                    data: {
                        organization_id: endpoint.organization_id,
                        severity: 'HIGH',
                        title: `Endpoint Down: ${endpoint.name}`,
                        message: `Endpoint ${endpoint.url} is not responding. Error: ${result.error}`,
                        metadata: {
                            endpointId: endpoint.id,
                            url: endpoint.url,
                            statusCode: result.statusCode,
                            responseTime: result.responseTime,
                        },
                        triggered_at: new Date(),
                    },
                });
            }
            // Criar alerta se SSL estiver expirando
            if (result.sslInfo && endpoint.monitor_ssl && result.sslInfo.daysUntilExpiry !== undefined) {
                const alertDays = endpoint.ssl_alert_days || 30;
                if (result.sslInfo.daysUntilExpiry <= alertDays && result.sslInfo.daysUntilExpiry > 0) {
                    // Check if alert already exists for this endpoint
                    const existingAlert = await prisma.alert.findFirst({
                        where: {
                            organization_id: endpoint.organization_id,
                            title: { contains: `SSL Expiring: ${endpoint.name}` },
                            resolved_at: null,
                        },
                    });
                    if (!existingAlert) {
                        await prisma.alert.create({
                            data: {
                                organization_id: endpoint.organization_id,
                                severity: result.sslInfo.daysUntilExpiry <= 7 ? 'CRITICAL' : 'HIGH',
                                title: `SSL Expiring: ${endpoint.name}`,
                                message: `SSL certificate for ${endpoint.url} expires in ${result.sslInfo.daysUntilExpiry} days (${result.sslInfo.expiryDate?.toLocaleDateString()})`,
                                metadata: {
                                    endpointId: endpoint.id,
                                    url: endpoint.url,
                                    sslExpiryDate: result.sslInfo.expiryDate,
                                    daysUntilExpiry: result.sslInfo.daysUntilExpiry,
                                    issuer: result.sslInfo.issuer,
                                },
                                triggered_at: new Date(),
                            },
                        });
                    }
                }
                else if (result.sslInfo.daysUntilExpiry <= 0) {
                    await prisma.alert.create({
                        data: {
                            organization_id: endpoint.organization_id,
                            severity: 'CRITICAL',
                            title: `SSL Expired: ${endpoint.name}`,
                            message: `SSL certificate for ${endpoint.url} has EXPIRED!`,
                            metadata: {
                                endpointId: endpoint.id,
                                url: endpoint.url,
                                sslExpiryDate: result.sslInfo.expiryDate,
                            },
                            triggered_at: new Date(),
                        },
                    });
                }
            }
        }
        const upCount = results.filter(r => r.status === 'up').length;
        const downCount = results.filter(r => r.status === 'down').length;
        const degradedCount = results.filter(r => r.status === 'degraded').length;
        logging_js_1.logger.info(`✅ Checked ${results.length} endpoints: ${upCount} up, ${downCount} down, ${degradedCount} degraded`);
        return (0, response_js_1.success)({
            success: true,
            results,
            summary: {
                total: results.length,
                up: upCount,
                down: downCount,
                degraded: degradedCount,
                avgResponseTime: results.length > 0 ? results.reduce((sum, r) => sum + r.responseTime, 0) / results.length : 0,
            },
        });
    }
    catch (err) {
        logging_js_1.logger.error('❌ Endpoint Monitor Check error:', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
async function checkEndpoint(url, timeout) {
    const startTime = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'EVO-UDS-Monitor/1.0',
            },
        });
        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;
        const statusCode = response.status;
        // Determinar status
        let status;
        if (statusCode >= 200 && statusCode < 300) {
            status = responseTime > 2000 ? 'degraded' : 'up';
        }
        else if (statusCode >= 500) {
            status = 'down';
        }
        else {
            status = 'degraded';
        }
        // Check SSL if HTTPS
        let sslInfo;
        if (url.startsWith('https://')) {
            sslInfo = await checkSSL(url);
        }
        return {
            status,
            statusCode,
            responseTime,
            sslInfo,
        };
    }
    catch (err) {
        const responseTime = Date.now() - startTime;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        return {
            status: 'down',
            responseTime,
            error: errorMessage,
        };
    }
}
async function checkSSL(url) {
    try {
        const https = await Promise.resolve().then(() => __importStar(require('https')));
        const { URL } = await Promise.resolve().then(() => __importStar(require('url')));
        const parsedUrl = new URL(url);
        return new Promise((resolve) => {
            const req = https.request({
                hostname: parsedUrl.hostname,
                port: 443,
                method: 'HEAD',
                rejectUnauthorized: false,
            }, (res) => {
                const socket = res.socket;
                const cert = socket.getPeerCertificate();
                if (cert && cert.valid_to) {
                    const expiryDate = new Date(cert.valid_to);
                    const now = new Date();
                    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    resolve({
                        valid: daysUntilExpiry > 0,
                        expiryDate,
                        issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
                        daysUntilExpiry,
                    });
                }
                else {
                    resolve({ valid: false });
                }
            });
            req.on('error', () => {
                resolve({ valid: false });
            });
            req.setTimeout(5000, () => {
                req.destroy();
                resolve({ valid: false });
            });
            req.end();
        });
    }
    catch {
        return { valid: false };
    }
}
//# sourceMappingURL=endpoint-monitor-check.js.map