"use strict";
/**
 * Standalone Migration Handler - Query licenses directly
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_1 = require("@prisma/client");
let prisma = null;
function getPrisma() {
    if (!prisma) {
        prisma = new client_1.PrismaClient();
    }
    return prisma;
}
async function handler() {
    const organizationId = '865f299e-2009-4145-8279-f9a73e0278aa';
    console.log(`🔍 Querying licenses for org=${organizationId}`);
    try {
        const db = getPrisma();
        // Query licenses directly
        const licenses = await db.license.findMany({
            where: { organization_id: organizationId },
        });
        console.log(`Found ${licenses.length} licenses`);
        // Also check config
        const config = await db.organizationLicenseConfig.findUnique({
            where: { organization_id: organizationId },
        });
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                licenses_count: licenses.length,
                licenses: licenses.map((l) => ({
                    id: l.id,
                    license_key: l.license_key,
                    product_type: l.product_type,
                    is_active: l.is_active,
                    is_expired: l.is_expired,
                })),
                config: config ? {
                    customer_id: config.customer_id,
                    sync_status: config.sync_status,
                    last_sync_at: config.last_sync_at,
                } : null,
            }),
        };
    }
    catch (err) {
        console.error('❌ Query failed:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
            }),
        };
    }
}
//# sourceMappingURL=run-migration-standalone.js.map