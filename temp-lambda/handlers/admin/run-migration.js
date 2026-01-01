"use strict";
/**
 * Lambda handler for running database migrations
 * Recreates daily_costs table with proper structure for multi-tenant isolation
 * NOTE: This is an admin-only operation, invoked directly (not via API Gateway)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const response_js_1 = require("../../lib/response.js");
const database_js_1 = require("../../lib/database.js");
const logging_js_1 = require("../../lib/logging.js");
const middleware_js_1 = require("../../lib/middleware.js");
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event) || '*';
    logging_js_1.logger.info('Run Migration started', { requestId: context.awsRequestId });
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        const results = [];
        // Step 1: Drop the old table
        try {
            await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS daily_costs CASCADE`);
            results.push('Dropped old daily_costs table');
        }
        catch (e) {
            results.push(`Drop table error: ${e.message}`);
        }
        // Step 2: Create new table with correct structure
        try {
            await prisma.$executeRawUnsafe(`
        CREATE TABLE daily_costs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id UUID NOT NULL,
          aws_account_id UUID NOT NULL,
          date DATE NOT NULL,
          service VARCHAR(255),
          cost DOUBLE PRECISION NOT NULL DEFAULT 0,
          usage DOUBLE PRECISION DEFAULT 0,
          currency VARCHAR(10) DEFAULT 'USD',
          created_at TIMESTAMPTZ(6) DEFAULT NOW()
        )
      `);
            results.push('Created new daily_costs table with proper structure');
        }
        catch (e) {
            results.push(`Create table error: ${e.message}`);
        }
        // Step 3: Create indexes for performance and isolation
        try {
            await prisma.$executeRawUnsafe(`
        CREATE INDEX daily_costs_organization_id_idx ON daily_costs(organization_id)
      `);
            results.push('Created index on organization_id');
        }
        catch (e) {
            results.push(`Index org error: ${e.message}`);
        }
        try {
            await prisma.$executeRawUnsafe(`
        CREATE INDEX daily_costs_aws_account_id_idx ON daily_costs(aws_account_id)
      `);
            results.push('Created index on aws_account_id');
        }
        catch (e) {
            results.push(`Index aws error: ${e.message}`);
        }
        try {
            await prisma.$executeRawUnsafe(`
        CREATE INDEX daily_costs_date_idx ON daily_costs(date)
      `);
            results.push('Created index on date');
        }
        catch (e) {
            results.push(`Index date error: ${e.message}`);
        }
        try {
            await prisma.$executeRawUnsafe(`
        CREATE INDEX daily_costs_org_date_idx ON daily_costs(organization_id, date)
      `);
            results.push('Created composite index on organization_id, date');
        }
        catch (e) {
            results.push(`Index composite error: ${e.message}`);
        }
        // Step 4: Create unique constraint to prevent duplicates
        try {
            await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX daily_costs_unique_idx 
        ON daily_costs(organization_id, aws_account_id, date, service)
      `);
            results.push('Created unique constraint on org+account+date+service');
        }
        catch (e) {
            results.push(`Unique constraint error: ${e.message}`);
        }
        logging_js_1.logger.info('Migration completed', { results });
        return (0, response_js_1.success)({
            success: true,
            message: 'daily_costs table recreated with proper multi-tenant isolation',
            results,
        });
    }
    catch (err) {
        logging_js_1.logger.error('Migration error', err, { requestId: context.awsRequestId });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=run-migration.js.map