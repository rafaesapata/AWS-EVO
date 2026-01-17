# WAF Event Filtering - Debug Version Deployed

**Date**: 2026-01-17  
**Status**: ✅ Deployed with extensive debugging

## Problem Summary

When clicking on metric cards (Critical Threats, Blocked Requests, etc.), the Events tab opens but shows empty list, even though metrics show:
- **Total Requests**: 1,677,957
- **Blocked Requests**: 943
- **Unique Attackers**: 231

Console logs revealed that actual events have:
- `severity: "low"`
- `action: "ALLOW"`

So filtering by `severity: "critical"` or `action: "BLOCK"` correctly returns empty results.

## Root Cause Analysis

### Issue 1: Time Window Mismatch
- **Metrics query**: Counts events from **last 24 hours**
- **Events query**: Was fetching events **without time filter** (all time)
- **Result**: Metrics might show 943 blocked requests from last 24h, but events feed was showing older events

### Issue 2: Data Discrepancy
- Metrics show 943 blocked requests
- But when filtering events by `action: "BLOCK"`, no events appear
- This suggests either:
  1. Blocked events exist but are outside the displayed time range
  2. There's a data inconsistency between metrics aggregation and events table

## Changes Deployed

### 1. Events Query Now Matches Metrics Time Window (24h)

**File**: `src/pages/WafMonitoring.tsx`

```typescript
// Get events from last 24 hours to match metrics period
const since = new Date();
since.setHours(since.getHours() - 24);

const response = await apiClient.invoke('waf-dashboard-api', {
  body: { 
    action: 'events', 
    limit: 1000, // Increased from 100
    startDate: since.toISOString() // NEW: Filter by last 24h
  }
});
```

### 2. Comprehensive Debug Logging

#### A. Events Fetch Logging
```typescript
console.log('📊 Events fetched:', {
  total: response.data?.events?.length || 0,
  sample: response.data?.events?.[0],
  actionCounts: {
    BLOCK: ...,
    ALLOW: ...,
    COUNT: ...
  },
  severityCounts: {
    critical: ...,
    high: ...,
    medium: ...,
    low: ...
  }
});
```

#### B. Card Click Logging
```typescript
console.log('🎯 Card clicked with filter:', filter);
console.log('📊 Current events data:', {
  totalEvents: events.length,
  actionCounts: { BLOCK, ALLOW, COUNT },
  severityCounts: { critical, high, medium, low }
});
```

#### C. Filter Application Logging
```typescript
console.log('🔍 Filtering first event:', {
  event: { severity, action, is_campaign },
  filters: { severityFilter, actionFilter, externalCampaignFilter },
  matches: { matchesSearch, matchesSeverity, matchesAction, matchesCampaign },
  willShow: (all matches combined)
});
```

## What to Check Now

### 1. Open Browser Console
Press F12 and go to Console tab

### 2. Refresh WAF Monitoring Page
You should see:
```
📊 Events fetched: {
  total: XXX,
  actionCounts: { BLOCK: XXX, ALLOW: XXX, COUNT: XXX },
  severityCounts: { critical: XXX, high: XXX, medium: XXX, low: XXX }
}
```

### 3. Click "Blocked Requests" Card
You should see:
```
🎯 Card clicked with filter: { type: 'blocked' }
📊 Current events data: {
  totalEvents: XXX,
  actionCounts: { BLOCK: XXX, ALLOW: XXX, COUNT: XXX }
}
🚫 Setting action filter: BLOCK
✅ External filters will be set to: { action: 'BLOCK' }
```

Then in WafEventsFeed:
```
🔄 External filters changed: { externalActionFilter: 'BLOCK' }
✅ Filters set to: { actionFilter: 'BLOCK' }
🔍 Filtering first event: {
  event: { severity: 'low', action: 'ALLOW' },
  filters: { severityFilter: 'all', actionFilter: 'BLOCK' },
  matches: { matchesAction: false },
  willShow: false
}
```

## Expected Outcomes

### Scenario A: No Blocked Events in Last 24h
If logs show:
```
📊 Events fetched: {
  actionCounts: { BLOCK: 0, ALLOW: 1234, COUNT: 0 }
}
```

**This means**: 
- ✅ The filtering is working correctly
- ❌ The metrics showing "943 blocked requests" are from a **different time period** or there's a **data inconsistency**
- **Action needed**: Check backend metrics query to verify it's counting from the same time window

### Scenario B: Blocked Events Exist But Don't Match Filter
If logs show:
```
📊 Events fetched: {
  actionCounts: { BLOCK: 943, ALLOW: 1234, COUNT: 0 }
}
🔍 Filtering first event: {
  event: { action: 'ALLOW' },
  filters: { actionFilter: 'BLOCK' },
  matches: { matchesAction: false }
}
```

**This means**:
- ✅ Blocked events exist in the data
- ❌ The filter is not matching them (case sensitivity issue?)
- **Action needed**: Check if event.action is uppercase/lowercase

### Scenario C: Events Filtered Correctly
If logs show:
```
📊 Events fetched: {
  actionCounts: { BLOCK: 943, ALLOW: 1234, COUNT: 0 }
}
🔍 Filtering first event: {
  event: { action: 'BLOCK' },
  filters: { actionFilter: 'BLOCK' },
  matches: { matchesAction: true },
  willShow: true
}
```

**This means**:
- ✅ Everything is working correctly!
- ✅ Events should now appear in the list

## Next Steps Based on Logs

### If No BLOCK Events in Last 24h
1. Check if WAF is actually blocking requests
2. Verify WAF rules are configured correctly
3. Check if events are being ingested properly

### If BLOCK Events Exist But Don't Show
1. Check case sensitivity of `action` field
2. Verify filter comparison logic
3. Check if there are other filters interfering

### If Everything Works
1. Remove all console.log statements
2. Consider adding a "No events match filter" message
3. Add time range selector to events tab

## Files Modified

1. `src/pages/WafMonitoring.tsx`
   - Added 24h time filter to events query
   - Increased limit from 100 to 1000
   - Added comprehensive debug logging

2. `src/components/waf/WafEventsFeed.tsx`
   - Added debug logging for filter application
   - Shows why each event is filtered out

## Deployment

- ✅ Built: `npm run build`
- ✅ Deployed to S3: `aws s3 sync dist/ s3://...`
- ✅ CloudFront invalidated: Distribution E1PY7U3VNT6P1R
- ⏳ Wait 1-2 minutes for CloudFront propagation

## Testing Instructions

1. **Clear browser cache**: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
2. **Open Console**: F12 → Console tab
3. **Navigate to WAF Monitoring**: https://evo.ai.udstec.io/waf-monitoring
4. **Check initial logs**: Look for "📊 Events fetched"
5. **Click "Blocked Requests" card**: Look for "🎯 Card clicked" and "🔍 Filtering first event"
6. **Share console logs**: Copy all logs and share them

## Questions to Answer

Based on the console logs, we need to determine:

1. **How many BLOCK events exist in last 24h?**
   - Look at `actionCounts: { BLOCK: XXX }`

2. **What is the actual action value in events?**
   - Look at `event: { action: 'XXX' }`

3. **Are filters being applied correctly?**
   - Look at `matches: { matchesAction: true/false }`

4. **Why do metrics show 943 blocked but events show 0?**
   - Compare metrics response with events response

---

**Next Update**: After reviewing console logs, we'll either:
- Fix the backend metrics query
- Fix the filter comparison logic
- Add better UX for "no events match filter"
- Remove debug logging once confirmed working
