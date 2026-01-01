"use strict";
/**
 * Check Costs - Debug handler to check daily_costs data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const database_js_1 = require("../../lib/database.js");
async function handler() {
    logging_js_1.logger.info('🔍 Checking daily_costs data...');
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        // Get table structure
        const columns = await prisma.$queryRaw `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'daily_costs'
      ORDER BY ordinal_position
    `;
        // Get total count
        const totalResult = await prisma.$queryRaw `SELECT COUNT(*)::int as count FROM daily_costs`;
        // Get sample records - just get all columns
        const samples = await prisma.$queryRaw `SELECT * FROM daily_costs LIMIT 5`;
        // Get distinct organization_ids
        const orgIds = await prisma.$queryRaw `
      SELECT organization_id, COUNT(*)::int as count 
      FROM daily_costs 
      GROUP BY organization_id
    `;
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                tableColumns: columns,
                totalRecords: totalResult[0]?.count || 0,
                organizationBreakdown: orgIds,
                sampleRecords: samples,
            }, null, 2),
        };
    }
    catch (err) {
        logging_js_1.logger.error('❌ Check costs failed:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
            }),
        };
    }
}
//# sourceMappingURL=check-costs.js.map