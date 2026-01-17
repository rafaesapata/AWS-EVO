# WAF Metrics vs Events Discrepancy - Investigation & Fix

**Date**: 2026-01-17  
**Status**: 🔍 Investigation deployed with backend + frontend logging

## Problem Confirmed

Based on console logs, we have confirmed a **data discrepancy**:

### Frontend Logs Show:
```
📊 Current events data: {
  totalEvents: 1000,
  actionCounts: {BLOCK: 0, ALLOW: 1000, COUNT: 0}
}
```

### Metrics Cards Show:
- **Total Requests**: 1,677,957
- **Blocked Requests**: 943 ← **This is the problem**
- **Unique Attackers**: 231

## Root Cause

The metrics query is counting **943 blocked requests** from the last 24 hours, but the events query returns **ZERO events with `action = 'BLOCK'`**.

This indicates one of the following:

1. **Stale/cached metrics** - The metrics are from an older query and haven't been refreshed
2. **Different time zones** - The metrics and events queries are using different time calculations
3. **Data inconsistency** - The `waf_events` table has inconsistent data
4. **Query bug** - The metrics SQL query is counting incorrectly

## Changes Deployed

### Backend: Added Metrics Logging

**File**: `backend/src/handlers/security/waf-dashboard-api.ts`

Added logging to the metrics handler to show what the backend is actually counting:

```typescript
logger.info('WAF Metrics calculated', {
  organizationId,
  since: since.toISOString(),
  metrics: {
    totalRequests: metrics.totalRequests,
    blockedRequests: metrics.blockedRequests,
    allowedRequests: metrics.allowedRequests,
    uniqueIps: metrics.uniqueIps,
  }
});
```

### Frontend: Added Metrics Reception Logging

**File**: `src/pages/WafMonitoring.tsx`

Added logging to show what metrics the frontend receives:

```typescript
console.log('📈 Metrics received from backend:', {
  totalRequests: response.data?.metrics?.totalRequests,
  blockedRequests: response.data?.metrics?.blockedRequests,
  allowedRequests: response.data?.metrics?.allowedRequests,
  uniqueIps: response.data?.metrics?.uniqueIps,
  criticalThreats: response.data?.metrics?.criticalThreats,
  period: response.data?.period
});
```

## What to Check Now

### 1. Clear Browser Cache
Press Ctrl+Shift+R (or Cmd+Shift+R on Mac)

### 2. Open Browser Console
Press F12 → Console tab

### 3. Refresh WAF Monitoring Page
You should now see:

```
📈 Metrics received from backend: {
  totalRequests: 1677957,
  blockedRequests: 943,  ← Check if this is still 943
  allowedRequests: 1677014,
  uniqueIps: 231,
  period: "24h"
}
```

### 4. Check Backend Logs
```bash
aws logs tail /aws/lambda/evo-uds-v3-production-waf-dashboard-api \
  --since 5m \
  --region us-east-1 \
  --filter-pattern "WAF Metrics calculated"
```

You should see:
```
WAF Metrics calculated {
  organizationId: "...",
  since: "2026-01-17T...",
  metrics: {
    totalRequests: 1677957,
    blockedRequests: 943,  ← Check if backend is returning 943
    allowedRequests: 1677014,
    uniqueIps: 231
  }
}
```

## Expected Outcomes

### Scenario A: Backend Returns 0 Blocked Requests
If backend logs show:
```
blockedRequests: 0
```

**This means**: 
- ✅ The backend query is correct
- ❌ The frontend is showing **cached/stale metrics**
- **Fix**: Invalidate React Query cache or reduce `staleTime`

### Scenario B: Backend Returns 943 Blocked Requests
If backend logs show:
```
blockedRequests: 943
```

**This means**:
- ❌ The backend SQL query is counting incorrectly
- ❌ OR there's a data inconsistency in the database
- **Fix**: Investigate the SQL query or check database directly

### Scenario C: Metrics Change After Refresh
If after refreshing, the metrics show:
```
blockedRequests: 0
```

**This means**:
- ✅ The issue was stale cache
- ✅ The fix is working
- **Action**: Reduce `staleTime` in React Query config

## Next Steps Based on Logs

### If Backend Returns 0 (Frontend Cache Issue)
```typescript
// Reduce staleTime in WafMonitoring.tsx
staleTime: 10 * 1000, // 10 seconds instead of 30
refetchInterval: 30 * 1000, // Keep 30 second auto-refresh
```

### If Backend Returns 943 (Backend Query Issue)
Need to investigate the SQL query:
```sql
SELECT 
  COUNT(*) FILTER (WHERE action = 'BLOCK') as blocked_requests
FROM waf_events
WHERE organization_id = '...'
  AND timestamp >= '2026-01-16T17:00:00Z'
```

Check if:
1. The `action` field has correct values ('BLOCK' vs 'block' vs 'BLOCKED')
2. The timestamp filter is working correctly
3. There are actually 943 events with `action = 'BLOCK'` in the database

### If Metrics Are Correct (Events Query Issue)
If backend shows 943 blocked and they actually exist, then the events query needs fixing:
```typescript
// Check if events query is filtering correctly
const response = await apiClient.invoke('waf-dashboard-api', {
  body: { 
    action: 'events', 
    filterAction: 'BLOCK',  // Make sure this is passed correctly
    limit: 1000
  }
});
```

## Database Direct Check

To verify the actual data in the database:

```sql
-- Check total events in last 24h
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE action = 'BLOCK') as blocked,
  COUNT(*) FILTER (WHERE action = 'ALLOW') as allowed
FROM waf_events
WHERE organization_id = '0f1b33dc-cd5f-49e5-8579-fb4e7b1f5a42'
  AND timestamp >= NOW() - INTERVAL '24 hours';

-- Check action values distribution
SELECT action, COUNT(*) as count
FROM waf_events
WHERE organization_id = '0f1b33dc-cd5f-49e5-8579-fb4e7b1f5a42'
  AND timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY action;

-- Check if there are any BLOCK events
SELECT *
FROM waf_events
WHERE organization_id = '0f1b33dc-cd5f-49e5-8579-fb4e7b1f5a42'
  AND action = 'BLOCK'
  AND timestamp >= NOW() - INTERVAL '24 hours'
LIMIT 10;
```

## Deployment Status

- ✅ Backend deployed: `evo-uds-v3-production-waf-dashboard-api`
- ✅ Frontend deployed: S3 + CloudFront invalidated
- ⏳ Wait 1-2 minutes for CloudFront propagation
- 🔍 Check logs after refresh

## Files Modified

1. `backend/src/handlers/security/waf-dashboard-api.ts`
   - Added `logger.info('WAF Metrics calculated', ...)` after metrics calculation

2. `src/pages/WafMonitoring.tsx`
   - Added `console.log('📈 Metrics received from backend:', ...)` in metrics query

## Testing Instructions

1. **Clear cache**: Ctrl+Shift+R
2. **Open console**: F12
3. **Go to WAF Monitoring**: https://evo.ai.udstec.io/waf-monitoring
4. **Look for**: `📈 Metrics received from backend`
5. **Check backend logs**: `aws logs tail ...`
6. **Share both logs**: Frontend console + backend CloudWatch

---

**Next Action**: After reviewing logs, we'll know exactly where the 943 number is coming from and can fix it appropriately.
