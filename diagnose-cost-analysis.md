# Cost Analysis Troubleshooting Guide

## Issue
The cost analysis page at https://evo.ai.udstec.io/app?tab=cost-analysis is not showing data.

## Root Cause Analysis

Based on the investigation, I found the following issues:

### 1. Prisma Field Mismatch Error
The `fetch-daily-costs` Lambda is failing with a PrismaClientValidationError:
```
Invalid `prisma.dailyCost.findFirst()` invocation:
aws_account_id: "447d6499-19f3-4382-9249-5f12a320e835",
~~~~~~~~~~~~~~
```

This suggests the Lambda code is using `aws_account_id` but the database table might still have the old `account_id` column.

### 2. No Historical Data
The cost analysis page queries the `daily_costs` table, but if no data has been fetched from AWS Cost Explorer yet, the table will be empty.

## Solutions

### Option 1: Trigger Cost Data Fetch (Recommended)

1. **Get your JWT token** from the browser:
   - Go to https://evo.ai.udstec.io/app
   - Open browser dev tools (F12)
   - Go to Network tab
   - Refresh the page
   - Look for any API request and copy the `Authorization: Bearer ...` token

2. **Run the cost fetch trigger**:
   ```bash
   export JWT_TOKEN="your-jwt-token-here"
   node trigger-cost-fetch.js
   ```

3. **Alternative: Use curl directly**:
   ```bash
   curl -X POST https://api-evo.ai.udstec.io/api/functions/fetch-daily-costs \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Origin: https://evo.ai.udstec.io" \
     -d '{"incremental": true, "granularity": "DAILY"}'
   ```

### Option 2: Check AWS Credentials

The cost fetch requires active AWS credentials with Cost Explorer permissions:

1. **Check if AWS credentials are configured**:
   - Go to https://evo.ai.udstec.io/app?tab=aws-accounts
   - Ensure you have at least one active AWS account configured
   - The account needs IAM permissions for `ce:GetCostAndUsage`

2. **Required IAM permissions**:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "ce:GetCostAndUsage",
           "ce:GetUsageReport"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

### Option 3: Database Schema Fix (If needed)

If the Prisma error persists, the database schema might need updating:

1. **Check current table structure**:
   ```sql
   \d daily_costs
   ```

2. **If the table has `account_id` instead of `aws_account_id`**:
   ```sql
   ALTER TABLE daily_costs RENAME COLUMN account_id TO aws_account_id;
   ```

## Expected Behavior After Fix

Once cost data is fetched successfully:

1. **Cost Analysis Page** should show:
   - Daily cost breakdown by service
   - Total costs for the selected period
   - Interactive charts and tables
   - Export functionality

2. **Data Flow**:
   - Frontend queries `daily_costs` table via `/api/functions/query-table`
   - Data is aggregated by date and service
   - Charts and tables are populated with real AWS cost data

## Monitoring

To monitor the cost fetch process:

1. **Check Lambda logs**:
   ```bash
   aws logs tail /aws/lambda/evo-uds-v3-production-fetch-daily-costs --follow
   ```

2. **Check API Gateway logs** for the cost analysis page requests

3. **Verify data in database** (if you have access):
   ```sql
   SELECT COUNT(*) FROM daily_costs;
   SELECT date, service, cost FROM daily_costs ORDER BY date DESC LIMIT 10;
   ```

## Prevention

To prevent this issue in the future:

1. **Set up automated cost fetching** (daily cron job or EventBridge rule)
2. **Add monitoring alerts** for failed cost fetches
3. **Include cost data validation** in deployment checks