# WAF Monitoring Dashboard - Architecture Diagram

## Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         WAF MONITORING DASHBOARD                         │
│                         (src/pages/WafMonitoring.tsx)                    │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
        ┌───────────────────────┐         ┌───────────────────────┐
        │   OVERVIEW TAB        │         │   EVENTS TAB          │
        └───────────────────────┘         └───────────────────────┘
                    │                                   │
        ┌───────────┴───────────┐           ┌──────────┴──────────┐
        │                       │           │                     │
        ▼                       ▼           ▼                     ▼
┌──────────────┐      ┌──────────────┐  ┌──────────┐    ┌──────────────┐
│ Metrics      │      │ Status       │  │ Filters  │    │ Events Feed  │
│ Cards        │      │ Indicator    │  │ (NEW)    │    │              │
│ (ENHANCED)   │      │ (NEW)        │  └──────────┘    └──────────────┘
└──────────────┘      └──────────────┘
        │                     │
        ▼                     ▼
┌──────────────┐      ┌──────────────┐
│ Timeline     │      │ World Map    │
│ Chart (NEW)  │      │ (NEW)        │
└──────────────┘      └──────────────┘
        │                     │
        ▼                     ▼
┌──────────────┐      ┌──────────────┐
│ AI Analysis  │      │ Attack Types │
│              │      │ Chart        │
└──────────────┘      └──────────────┘
        │                     │
        ▼                     ▼
┌──────────────┐      ┌──────────────┐
│ Top          │      │ Geo          │
│ Attackers    │      │ Distribution │
└──────────────┘      └──────────────┘
        │
        ▼
┌──────────────┐
│ Blocked      │
│ Requests     │
└──────────────┘

                    ┌───────────────────────┐
                    │   CONFIG TAB          │
                    └───────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
            ┌──────────────┐      ┌──────────────┐
            │ Setup Panel  │      │ Config Panel │
            └──────────────┘      └──────────────┘
                    │
                    ▼
            ┌──────────────┐
            │ Alert Config │
            │ (NEW)        │
            └──────────────┘
```

---

## Component Hierarchy

```
WafMonitoring (Page)
│
├── WafMetricsCards (Enhanced with trends)
│   ├── Card 1: Total Requests + Trend
│   ├── Card 2: Blocked Requests + Trend
│   ├── Card 3: Unique Attackers + Trend
│   ├── Card 4: Critical Threats + Trend
│   ├── Card 5: High Threats + Trend
│   └── Card 6: Active Campaigns + Trend
│
├── Tabs
│   │
│   ├── Overview Tab
│   │   ├── WafStatusIndicator (NEW)
│   │   │   └── Risk Level Badge
│   │   │
│   │   ├── WafTimelineChart (NEW)
│   │   │   └── Area Chart (Recharts)
│   │   │
│   │   ├── WafAiAnalysis
│   │   │   └── AI Insights Card
│   │   │
│   │   ├── WafWorldMap (NEW)
│   │   │   ├── SVG Map (react-simple-maps)
│   │   │   └── Top Countries List
│   │   │
│   │   ├── Grid Row 1
│   │   │   ├── WafAttackTypesChart
│   │   │   └── WafGeoDistribution
│   │   │
│   │   ├── Grid Row 2
│   │   │   ├── WafTopAttackers
│   │   │   └── WafEventsFeed
│   │   │
│   │   └── WafBlockedRequestsList
│   │
│   ├── Events Tab
│   │   ├── WafFilters (NEW)
│   │   │   ├── Period Selector
│   │   │   ├── Date Range Picker
│   │   │   ├── Severity Filter
│   │   │   ├── Threat Type Filter
│   │   │   ├── IP Address Search
│   │   │   ├── Country Filter
│   │   │   └── Active Filters Display
│   │   │
│   │   └── WafEventsFeed (Filtered)
│   │       └── Paginated Event List
│   │
│   └── Config Tab
│       ├── WafSetupPanel
│       ├── WafConfigPanel
│       └── WafAlertConfig (NEW)
│           ├── Notification Channels
│           │   ├── In-App Toggle
│           │   ├── SNS Configuration
│           │   ├── Slack Configuration
│           │   └── Email Configuration
│           │
│           ├── Alert Thresholds
│           │   ├── Critical Threshold
│           │   ├── High Threshold
│           │   └── Campaign Threshold
│           │
│           ├── Auto-Block Settings
│           │   ├── Enable Toggle
│           │   ├── Threshold Input
│           │   └── Duration Selector
│           │
│           └── Campaign Detection
│               ├── Enable Toggle
│               └── Time Window Selector
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│                    (React + TypeScript)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ React Query
                              │ (useQuery hooks)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API CLIENT                                  │
│                  (apiClient.invoke)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS POST
                              │ Authorization: Bearer <token>
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API GATEWAY                                   │
│              (api-evo.ai.udstec.io)                              │
│                                                                   │
│  Endpoints:                                                       │
│  - POST /api/functions/waf-dashboard-api                         │
│                                                                   │
│  Actions:                                                         │
│  - metrics (with previousPeriod) ✅                              │
│  - timeline (NEW) ⏳                                             │
│  - events                                                         │
│  - top-attackers                                                  │
│  - attack-types                                                   │
│  - geo-distribution                                               │
│  - block-ip                                                       │
│  - unblock-ip                                                     │
│  - save-alert-config (NEW) ⏳                                    │
│  - get-alert-config (NEW) ⏳                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Lambda Invoke
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AWS LAMBDA                                    │
│         evo-uds-v3-production-waf-dashboard-api                  │
│                                                                   │
│  Handler: waf-dashboard-api.handler                              │
│  Runtime: Node.js 18.x                                           │
│  Memory: 512 MB                                                  │
│  Timeout: 30s                                                    │
│  Layer: evo-prisma-deps-layer:46                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Prisma Client
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    POSTGRESQL RDS                                │
│         evo-uds-v3-production-postgres                           │
│                                                                   │
│  Tables:                                                          │
│  - waf_events (existing)                                         │
│  - waf_monitoring_configs (existing)                             │
│  - waf_blocked_ips (existing)                                    │
│  - waf_alert_configs (NEW) ⏳                                   │
│                                                                   │
│  Instance: db.t4g.medium                                         │
│  Engine: PostgreSQL 15.10                                        │
│  Storage: 100 GB                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Request Flow Example

### 1. Timeline Chart Data Request

```
User opens WAF Dashboard
        │
        ▼
Frontend: useQuery(['waf-timeline'])
        │
        ▼
API Client: POST /api/functions/waf-dashboard-api
        │
        │ Body: { action: 'timeline', period: 'last24h' }
        │
        ▼
API Gateway: Validates JWT token
        │
        ▼
Lambda: waf-dashboard-api.handler()
        │
        ├─> Extract organizationId from token
        ├─> Extract accountId from request
        │
        ▼
Lambda: handleTimeline(organizationId, accountId)
        │
        ▼
Prisma: Query waf_events table
        │
        │ SELECT DATE_TRUNC('hour', timestamp) as hour,
        │        COUNT(CASE WHEN action = 'BLOCK' THEN 1 END) as blocked,
        │        COUNT(CASE WHEN action = 'ALLOW' THEN 1 END) as allowed
        │ FROM waf_events
        │ WHERE organization_id = ? AND account_id = ?
        │   AND timestamp >= NOW() - INTERVAL '24 hours'
        │ GROUP BY hour
        │ ORDER BY hour ASC
        │
        ▼
PostgreSQL: Returns 24 rows (one per hour)
        │
        ▼
Lambda: Format data for frontend
        │
        │ [
        │   { timestamp: '2026-01-16T00:00:00Z', blocked: 150, allowed: 1200 },
        │   { timestamp: '2026-01-16T01:00:00Z', blocked: 120, allowed: 1100 },
        │   ...
        │ ]
        │
        ▼
API Gateway: Returns 200 OK
        │
        ▼
Frontend: Updates WafTimelineChart component
        │
        ▼
Recharts: Renders area chart
        │
        ▼
User sees timeline visualization
```

### 2. Alert Configuration Save

```
User configures alerts
        │
        ▼
Frontend: WafAlertConfig form submission
        │
        ▼
API Client: POST /api/functions/waf-dashboard-api
        │
        │ Body: {
        │   action: 'save-alert-config',
        │   config: {
        │     channels: { inApp: true, sns: {...}, ... },
        │     thresholds: { critical: 10, ... },
        │     autoBlock: { enabled: true, ... },
        │     campaignDetection: { enabled: true, ... }
        │   }
        │ }
        │
        ▼
Lambda: handleSaveAlertConfig(organizationId, accountId, config)
        │
        ▼
Prisma: Upsert waf_alert_configs
        │
        │ INSERT INTO waf_alert_configs (...)
        │ ON CONFLICT (organization_id, account_id)
        │ DO UPDATE SET ...
        │
        ▼
PostgreSQL: Saves configuration
        │
        ▼
Lambda: Returns { success: true }
        │
        ▼
Frontend: Shows success toast
        │
        ▼
User sees "Configuration saved successfully"
```

---

## State Management Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    REACT QUERY CACHE                             │
│                                                                   │
│  Keys:                                                            │
│  - ['waf-metrics', organizationId]                               │
│  - ['waf-timeline', organizationId]                              │
│  - ['waf-events', organizationId]                                │
│  - ['waf-top-attackers', organizationId]                         │
│  - ['waf-attack-types', organizationId]                          │
│  - ['waf-geo-distribution', organizationId]                      │
│  - ['waf-blocked-events', organizationId]                        │
│  - ['waf-alert-config', organizationId, accountId]               │
│                                                                   │
│  Stale Time: 30s (metrics, timeline, geo)                        │
│  Refetch Interval: 60s (auto-refresh)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    COMPONENT STATE                               │
│                                                                   │
│  WafMonitoring:                                                  │
│  - activeTab: 'overview' | 'events' | 'config'                   │
│  - filters: {                                                     │
│      period: 'last24h',                                           │
│      severity: 'all',                                             │
│      threatType: 'all',                                           │
│      ipAddress: '',                                               │
│      country: 'all',                                              │
│      startDate: null,                                             │
│      endDate: null                                                │
│    }                                                              │
│                                                                   │
│  WafAlertConfig:                                                 │
│  - config: { channels, thresholds, autoBlock, campaignDetection }│
│  - isSaving: boolean                                              │
│                                                                   │
│  WafFilters:                                                     │
│  - localFilters: { ... }                                          │
│  - showDatePicker: boolean                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Performance Optimization

```
┌─────────────────────────────────────────────────────────────────┐
│                    OPTIMIZATION STRATEGIES                       │
└─────────────────────────────────────────────────────────────────┘

1. React Query Caching
   ├─> Stale time: 30s (reduce API calls)
   ├─> Refetch interval: 60s (auto-refresh)
   └─> Cache invalidation on mutations

2. Component Memoization
   ├─> React.memo for expensive components
   ├─> useMemo for computed values
   └─> useCallback for event handlers

3. Client-Side Filtering
   ├─> Filter events in memory (fast)
   ├─> Debounce filter changes (300ms)
   └─> Pagination for large lists

4. Lazy Loading
   ├─> World map loaded on demand
   ├─> Charts rendered progressively
   └─> Images lazy loaded

5. Database Optimization
   ├─> Indexes on frequently queried columns
   ├─> Aggregation in SQL (not in code)
   ├─> Limit result sets
   └─> Connection pooling

6. Lambda Optimization
   ├─> Warm start optimization
   ├─> Efficient Prisma queries
   ├─> Response compression
   └─> Minimal dependencies
```

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                               │
└─────────────────────────────────────────────────────────────────┘

1. Authentication
   ├─> AWS Cognito JWT tokens
   ├─> Token validation in API Gateway
   └─> Token refresh on expiry

2. Authorization
   ├─> Organization-based isolation
   ├─> All queries filter by organization_id
   └─> No cross-organization data access

3. Input Validation
   ├─> Zod schemas for request validation
   ├─> SQL injection prevention (Prisma)
   └─> XSS prevention (React escaping)

4. Data Encryption
   ├─> HTTPS for all API calls
   ├─> Encrypted database connections
   └─> Sensitive config encrypted at rest

5. Rate Limiting
   ├─> API Gateway throttling
   ├─> Lambda concurrency limits
   └─> Database connection pooling

6. Audit Logging
   ├─> All config changes logged
   ├─> IP block/unblock logged
   └─> Alert config changes logged
```

---

## Monitoring & Observability

```
┌─────────────────────────────────────────────────────────────────┐
│                    MONITORING STACK                              │
└─────────────────────────────────────────────────────────────────┘

1. CloudWatch Metrics
   ├─> Lambda invocations
   ├─> Lambda errors
   ├─> Lambda duration
   ├─> API Gateway requests
   └─> Database connections

2. CloudWatch Logs
   ├─> Lambda execution logs
   ├─> Error stack traces
   ├─> Performance metrics
   └─> Audit trail

3. CloudWatch Alarms
   ├─> Lambda errors > 5 in 5 min
   ├─> Lambda duration > 10s
   ├─> API Gateway 5xx > 10 in 5 min
   └─> Database connection errors

4. Frontend Monitoring
   ├─> React Query DevTools
   ├─> Console error tracking
   ├─> Performance metrics
   └─> User interaction tracking

5. Database Monitoring
   ├─> RDS Performance Insights
   ├─> Slow query log
   ├─> Connection pool metrics
   └─> Storage utilization
```

---

## Deployment Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    CI/CD PIPELINE                                │
└─────────────────────────────────────────────────────────────────┘

Frontend Deployment:
  1. npm run build
  2. aws s3 sync dist/ s3://...
  3. aws cloudfront create-invalidation
  4. Verify deployment

Backend Deployment:
  1. npm run build (backend)
  2. Create Lambda package
  3. aws lambda update-function-code
  4. aws lambda update-function-configuration
  5. aws lambda wait function-updated
  6. Test invocation
  7. Monitor CloudWatch logs

Database Migration:
  1. npx prisma migrate dev (local)
  2. Review migration SQL
  3. npx prisma migrate deploy (production)
  4. Verify schema changes
  5. Test queries

Rollback Plan:
  1. Revert Lambda code
  2. Rollback database migration
  3. Clear CloudFront cache
  4. Verify system health
```

---

**Last Updated**: 2026-01-16
**Version**: 1.0
**Author**: Kiro AI Assistant
