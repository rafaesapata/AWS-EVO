# WAF Backend Implementation Guide

## Quick Reference for Backend Developer

This guide provides the exact code needed to implement the missing backend endpoints for the WAF improvements.

---

## 1. Update waf-dashboard-api.ts

**File**: `backend/src/handlers/security/waf-dashboard-api.ts`

### Add Timeline Action Handler

```typescript
/**
 * Handle timeline action - returns hourly blocked/allowed requests for last 24h
 */
async function handleTimeline(
  organizationId: string,
  accountId: string
): Promise<{ timeline: Array<{ timestamp: string; blocked: number; allowed: number }> }> {
  const prisma = getPrismaClient();
  
  // Get hourly aggregated data for last 24 hours
  const timeline = await prisma.$queryRaw<Array<{
    hour: Date;
    blocked: number;
    allowed: number;
  }>>`
    SELECT 
      DATE_TRUNC('hour', timestamp) as hour,
      COUNT(CASE WHEN action = 'BLOCK' THEN 1 END)::int as blocked,
      COUNT(CASE WHEN action = 'ALLOW' THEN 1 END)::int as allowed
    FROM waf_events
    WHERE 
      organization_id = ${organizationId}
      AND account_id = ${accountId}
      AND timestamp >= NOW() - INTERVAL '24 hours'
    GROUP BY hour
    ORDER BY hour ASC
  `;
  
  // Format for frontend
  const formattedTimeline = timeline.map(row => ({
    timestamp: row.hour.toISOString(),
    blocked: row.blocked,
    allowed: row.allowed,
  }));
  
  return { timeline: formattedTimeline };
}
```

### Update Metrics Action to Include Previous Period

```typescript
/**
 * Handle metrics action - returns current and previous period metrics
 */
async function handleMetrics(
  organizationId: string,
  accountId: string
): Promise<{ metrics: any; period: string }> {
  const prisma = getPrismaClient();
  
  // Current period (last 24h)
  const currentMetrics = await prisma.$queryRaw<Array<{
    total_requests: bigint;
    blocked_requests: bigint;
    allowed_requests: bigint;
    counted_requests: bigint;
    unique_ips: bigint;
    unique_countries: bigint;
    critical_threats: bigint;
    high_threats: bigint;
    medium_threats: bigint;
    low_threats: bigint;
  }>>`
    SELECT 
      COUNT(*)::bigint as total_requests,
      COUNT(CASE WHEN action = 'BLOCK' THEN 1 END)::bigint as blocked_requests,
      COUNT(CASE WHEN action = 'ALLOW' THEN 1 END)::bigint as allowed_requests,
      COUNT(CASE WHEN action = 'COUNT' THEN 1 END)::bigint as counted_requests,
      COUNT(DISTINCT source_ip)::bigint as unique_ips,
      COUNT(DISTINCT country)::bigint as unique_countries,
      COUNT(CASE WHEN severity = 'CRITICAL' THEN 1 END)::bigint as critical_threats,
      COUNT(CASE WHEN severity = 'HIGH' THEN 1 END)::bigint as high_threats,
      COUNT(CASE WHEN severity = 'MEDIUM' THEN 1 END)::bigint as medium_threats,
      COUNT(CASE WHEN severity = 'LOW' THEN 1 END)::bigint as low_threats
    FROM waf_events
    WHERE 
      organization_id = ${organizationId}
      AND account_id = ${accountId}
      AND timestamp >= NOW() - INTERVAL '24 hours'
  `;
  
  // Previous period (24-48h ago)
  const previousMetrics = await prisma.$queryRaw<Array<{
    total_requests: bigint;
    blocked_requests: bigint;
    unique_ips: bigint;
    critical_threats: bigint;
    high_threats: bigint;
  }>>`
    SELECT 
      COUNT(*)::bigint as total_requests,
      COUNT(CASE WHEN action = 'BLOCK' THEN 1 END)::bigint as blocked_requests,
      COUNT(DISTINCT source_ip)::bigint as unique_ips,
      COUNT(CASE WHEN severity = 'CRITICAL' THEN 1 END)::bigint as critical_threats,
      COUNT(CASE WHEN severity = 'HIGH' THEN 1 END)::bigint as high_threats
    FROM waf_events
    WHERE 
      organization_id = ${organizationId}
      AND account_id = ${accountId}
      AND timestamp >= NOW() - INTERVAL '48 hours'
      AND timestamp < NOW() - INTERVAL '24 hours'
  `;
  
  const current = currentMetrics[0];
  const previous = previousMetrics[0];
  
  // Count active campaigns (simplified - groups of 100+ events from same IP in 1h)
  const activeCampaigns = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT source_ip)::bigint as count
    FROM (
      SELECT source_ip, COUNT(*) as event_count
      FROM waf_events
      WHERE 
        organization_id = ${organizationId}
        AND account_id = ${accountId}
        AND timestamp >= NOW() - INTERVAL '1 hour'
        AND action = 'BLOCK'
      GROUP BY source_ip
      HAVING COUNT(*) >= 100
    ) campaigns
  `;
  
  const previousCampaigns = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT source_ip)::bigint as count
    FROM (
      SELECT source_ip, COUNT(*) as event_count
      FROM waf_events
      WHERE 
        organization_id = ${organizationId}
        AND account_id = ${accountId}
        AND timestamp >= NOW() - INTERVAL '25 hours'
        AND timestamp < NOW() - INTERVAL '1 hour'
        AND action = 'BLOCK'
      GROUP BY source_ip
      HAVING COUNT(*) >= 100
    ) campaigns
  `;
  
  return {
    metrics: {
      totalRequests: Number(current.total_requests),
      blockedRequests: Number(current.blocked_requests),
      allowedRequests: Number(current.allowed_requests),
      countedRequests: Number(current.counted_requests),
      uniqueIps: Number(current.unique_ips),
      uniqueCountries: Number(current.unique_countries),
      criticalThreats: Number(current.critical_threats),
      highThreats: Number(current.high_threats),
      mediumThreats: Number(current.medium_threats),
      lowThreats: Number(current.low_threats),
      activeCampaigns: Number(activeCampaigns[0]?.count || 0),
      previousPeriod: {
        totalRequests: Number(previous.total_requests),
        blockedRequests: Number(previous.blocked_requests),
        uniqueIps: Number(previous.unique_ips),
        criticalThreats: Number(previous.critical_threats),
        highThreats: Number(previous.high_threats),
        activeCampaigns: Number(previousCampaigns[0]?.count || 0),
      },
    },
    period: 'last24h',
  };
}
```

### Add Alert Config Handlers

```typescript
/**
 * Handle save-alert-config action
 */
async function handleSaveAlertConfig(
  organizationId: string,
  accountId: string,
  config: any
): Promise<{ success: boolean }> {
  const prisma = getPrismaClient();
  
  await prisma.wafAlertConfig.upsert({
    where: {
      organization_id_account_id: {
        organization_id: organizationId,
        account_id: accountId,
      },
    },
    create: {
      organization_id: organizationId,
      account_id: accountId,
      in_app_enabled: config.channels?.inApp ?? true,
      sns_enabled: config.channels?.sns?.enabled ?? false,
      sns_topic_arn: config.channels?.sns?.topicArn ?? null,
      slack_enabled: config.channels?.slack?.enabled ?? false,
      slack_webhook_url: config.channels?.slack?.webhookUrl ?? null,
      email_enabled: config.channels?.email?.enabled ?? false,
      email_address: config.channels?.email?.address ?? null,
      critical_threshold: config.thresholds?.critical ?? 10,
      high_threshold: config.thresholds?.high ?? 50,
      campaign_threshold: config.thresholds?.campaign ?? 100,
      auto_block_enabled: config.autoBlock?.enabled ?? false,
      auto_block_threshold: config.autoBlock?.threshold ?? 20,
      block_duration: config.autoBlock?.duration ?? '24h',
      campaign_detection_enabled: config.campaignDetection?.enabled ?? true,
      campaign_window: config.campaignDetection?.window ?? '1h',
    },
    update: {
      in_app_enabled: config.channels?.inApp,
      sns_enabled: config.channels?.sns?.enabled,
      sns_topic_arn: config.channels?.sns?.topicArn,
      slack_enabled: config.channels?.slack?.enabled,
      slack_webhook_url: config.channels?.slack?.webhookUrl,
      email_enabled: config.channels?.email?.enabled,
      email_address: config.channels?.email?.address,
      critical_threshold: config.thresholds?.critical,
      high_threshold: config.thresholds?.high,
      campaign_threshold: config.thresholds?.campaign,
      auto_block_enabled: config.autoBlock?.enabled,
      auto_block_threshold: config.autoBlock?.threshold,
      block_duration: config.autoBlock?.duration,
      campaign_detection_enabled: config.campaignDetection?.enabled,
      campaign_window: config.campaignDetection?.window,
      updated_at: new Date(),
    },
  });
  
  return { success: true };
}

/**
 * Handle get-alert-config action
 */
async function handleGetAlertConfig(
  organizationId: string,
  accountId: string
): Promise<{ config: any }> {
  const prisma = getPrismaClient();
  
  const dbConfig = await prisma.wafAlertConfig.findUnique({
    where: {
      organization_id_account_id: {
        organization_id: organizationId,
        account_id: accountId,
      },
    },
  });
  
  if (!dbConfig) {
    // Return default config
    return {
      config: {
        channels: {
          inApp: true,
          sns: { enabled: false, topicArn: '' },
          slack: { enabled: false, webhookUrl: '' },
          email: { enabled: false, address: '' },
        },
        thresholds: {
          critical: 10,
          high: 50,
          campaign: 100,
        },
        autoBlock: {
          enabled: false,
          threshold: 20,
          duration: '24h',
        },
        campaignDetection: {
          enabled: true,
          window: '1h',
        },
      },
    };
  }
  
  // Format for frontend
  return {
    config: {
      channels: {
        inApp: dbConfig.in_app_enabled,
        sns: {
          enabled: dbConfig.sns_enabled,
          topicArn: dbConfig.sns_topic_arn || '',
        },
        slack: {
          enabled: dbConfig.slack_enabled,
          webhookUrl: dbConfig.slack_webhook_url || '',
        },
        email: {
          enabled: dbConfig.email_enabled,
          address: dbConfig.email_address || '',
        },
      },
      thresholds: {
        critical: dbConfig.critical_threshold,
        high: dbConfig.high_threshold,
        campaign: dbConfig.campaign_threshold,
      },
      autoBlock: {
        enabled: dbConfig.auto_block_enabled,
        threshold: dbConfig.auto_block_threshold,
        duration: dbConfig.block_duration,
      },
      campaignDetection: {
        enabled: dbConfig.campaign_detection_enabled,
        window: dbConfig.campaign_window,
      },
    },
  };
}
```

### Update Main Handler to Route New Actions

```typescript
export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // ... existing code ...
  
  const { action } = body;
  
  switch (action) {
    case 'metrics':
      const metricsResult = await handleMetrics(organizationId, accountId);
      return success(metricsResult);
      
    case 'timeline':
      const timelineResult = await handleTimeline(organizationId, accountId);
      return success(timelineResult);
      
    case 'save-alert-config':
      const saveResult = await handleSaveAlertConfig(organizationId, accountId, body.config);
      return success(saveResult);
      
    case 'get-alert-config':
      const getResult = await handleGetAlertConfig(organizationId, accountId);
      return success(getResult);
      
    // ... existing cases ...
    
    default:
      return error('Invalid action', 400);
  }
}
```

---

## 2. Create Database Migration

**File**: `backend/prisma/migrations/YYYYMMDDHHMMSS_add_waf_alert_configs/migration.sql`

```sql
-- CreateTable
CREATE TABLE "waf_alert_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "account_id" VARCHAR(255) NOT NULL,
    
    -- Notification Channels
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sns_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sns_topic_arn" VARCHAR(500),
    "slack_enabled" BOOLEAN NOT NULL DEFAULT false,
    "slack_webhook_url" VARCHAR(500),
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "email_address" VARCHAR(255),
    
    -- Alert Thresholds
    "critical_threshold" INTEGER NOT NULL DEFAULT 10,
    "high_threshold" INTEGER NOT NULL DEFAULT 50,
    "campaign_threshold" INTEGER NOT NULL DEFAULT 100,
    
    -- Auto-Block Configuration
    "auto_block_enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_block_threshold" INTEGER NOT NULL DEFAULT 20,
    "block_duration" VARCHAR(50) NOT NULL DEFAULT '24h',
    
    -- Campaign Detection
    "campaign_detection_enabled" BOOLEAN NOT NULL DEFAULT true,
    "campaign_window" VARCHAR(50) NOT NULL DEFAULT '1h',
    
    -- Timestamps
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waf_alert_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waf_alert_configs_organization_id_account_id_key" 
ON "waf_alert_configs"("organization_id", "account_id");

-- AddForeignKey
ALTER TABLE "waf_alert_configs" 
ADD CONSTRAINT "waf_alert_configs_organization_id_fkey" 
FOREIGN KEY ("organization_id") 
REFERENCES "organizations"("id") 
ON DELETE CASCADE 
ON UPDATE CASCADE;
```

---

## 3. Update Prisma Schema

**File**: `backend/prisma/schema.prisma`

Add this model:

```prisma
model WafAlertConfig {
  id              String   @id @default(uuid()) @db.Uuid
  organization_id String   @db.Uuid
  account_id      String   @db.VarChar(255)
  
  // Notification Channels
  in_app_enabled      Boolean  @default(true)
  sns_enabled         Boolean  @default(false)
  sns_topic_arn       String?  @db.VarChar(500)
  slack_enabled       Boolean  @default(false)
  slack_webhook_url   String?  @db.VarChar(500)
  email_enabled       Boolean  @default(false)
  email_address       String?  @db.VarChar(255)
  
  // Alert Thresholds
  critical_threshold  Int      @default(10)
  high_threshold      Int      @default(50)
  campaign_threshold  Int      @default(100)
  
  // Auto-Block Configuration
  auto_block_enabled    Boolean  @default(false)
  auto_block_threshold  Int      @default(20)
  block_duration        String   @default("24h") @db.VarChar(50)
  
  // Campaign Detection
  campaign_detection_enabled  Boolean  @default(true)
  campaign_window             String   @default("1h") @db.VarChar(50)
  
  // Timestamps
  created_at  DateTime @default(now())
  updated_at  DateTime @default(now())
  
  // Relations
  organization  Organization @relation(fields: [organization_id], references: [id], onDelete: Cascade)
  
  @@unique([organization_id, account_id], name: "organization_id_account_id")
  @@map("waf_alert_configs")
}
```

Don't forget to add the relation to the Organization model:

```prisma
model Organization {
  // ... existing fields ...
  waf_alert_configs  WafAlertConfig[]
}
```

---

## 4. Deploy Steps

### Step 1: Update Prisma Schema
```bash
cd backend
# Add the model to schema.prisma
```

### Step 2: Generate Migration
```bash
npx prisma migrate dev --name add_waf_alert_configs
```

### Step 3: Update Lambda Code
```bash
# Update waf-dashboard-api.ts with new handlers
# Build
npm run build
```

### Step 4: Deploy Lambda
```bash
# Follow the deployment process in architecture.md
# Essentially:
# 1. Create deployment package with lib/ and types/
# 2. Upload to Lambda
# 3. Update handler configuration
# 4. Test
```

### Step 5: Deploy Migration to Production
```bash
npx prisma migrate deploy
```

### Step 6: Test
```bash
# Test timeline endpoint
curl -X POST https://api-evo.ai.udstec.io/api/functions/waf-dashboard-api \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"timeline","period":"last24h"}'

# Test metrics with previous period
curl -X POST https://api-evo.ai.udstec.io/api/functions/waf-dashboard-api \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"metrics"}'

# Test alert config
curl -X POST https://api-evo.ai.udstec.io/api/functions/waf-dashboard-api \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"get-alert-config"}'
```

---

## 5. Testing Checklist

- [ ] Timeline endpoint returns hourly data
- [ ] Metrics include previousPeriod object
- [ ] Alert config can be saved
- [ ] Alert config can be retrieved
- [ ] Default config is returned when none exists
- [ ] Database constraints work (unique org+account)
- [ ] Foreign key cascade works
- [ ] No console errors in frontend
- [ ] Timeline chart renders with data
- [ ] Trend indicators show percentages
- [ ] Alert config form saves successfully

---

## 6. Rollback Plan

If something goes wrong:

```bash
# Rollback migration
cd backend
npx prisma migrate resolve --rolled-back MIGRATION_NAME

# Revert Lambda code
# Deploy previous version

# Drop table manually if needed
psql $DATABASE_URL -c "DROP TABLE IF EXISTS waf_alert_configs CASCADE;"
```

---

## 7. Performance Considerations

### Indexes Needed:
```sql
-- Already created by unique constraint
CREATE INDEX idx_waf_alert_configs_org_account 
ON waf_alert_configs(organization_id, account_id);

-- For timeline query performance
CREATE INDEX idx_waf_events_timeline 
ON waf_events(organization_id, account_id, timestamp DESC) 
WHERE timestamp >= NOW() - INTERVAL '48 hours';
```

### Query Optimization:
- Timeline query uses DATE_TRUNC for hourly aggregation
- Metrics queries use CASE WHEN for conditional counting
- Previous period query uses same structure as current for consistency
- All queries filter by organization_id and account_id for multi-tenancy

---

## 8. Monitoring

Add CloudWatch alarms for:
- Timeline query duration > 1s
- Metrics query duration > 2s
- Alert config save failures
- Database connection errors

---

## Estimated Implementation Time

- Database migration: 15 minutes
- Timeline handler: 30 minutes
- Metrics update: 30 minutes
- Alert config handlers: 45 minutes
- Testing: 30 minutes
- Deployment: 30 minutes

**Total: ~3 hours**

---

**Last Updated**: 2026-01-16
**Version**: 1.0
**Author**: Kiro AI Assistant
