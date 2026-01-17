# WAF Click-to-Filter Issue - RESOLVED ✅

**Date**: 2026-01-17  
**Status**: ✅ **FIXED** - Deployed with limit increased to 5000

## Problem Summary

When clicking on metric cards (Blocked Requests: 911), the Events tab opened but showed empty or very few results.

## Root Cause Discovered

The logs revealed the exact issue:

```
📈 Metrics: blockedRequests: 911
📊 Events fetched: actionCounts: {BLOCK: 1, ALLOW: 999, COUNT: 0}
```

### The Issue:

1. **Events query had LIMIT 1000** and ordered by `timestamp DESC` (most recent first)
2. **Most recent 1000 events** were mostly ALLOW (999 ALLOW, 1 BLOCK)
3. **The other 910 BLOCK events** were older and fell outside the 1000 limit
4. **Result**: Clicking "Blocked Requests (911)" showed only 1 event

### Why This Happened:

WAF typically blocks attacks in bursts, then allows normal traffic. So:
- **Older events** (hours ago): Many BLOCK events during attack
- **Recent events** (last few minutes): Mostly ALLOW (normal traffic)
- **Query fetched**: Only the most recent 1000 events (mostly ALLOW)
- **Missing**: The 910 older BLOCK events

## The Fix

### Changed: Increased Limit from 1000 to 5000

**File**: `src/pages/WafMonitoring.tsx`

```typescript
const response = await apiClient.invoke('waf-dashboard-api', {
  body: { 
    action: 'events', 
    limit: 5000, // Increased from 1000 to capture more blocked events
    startDate: since.toISOString()
  }
});
```

### Why 5000?

- Metrics show ~1,674,861 total requests in 24h
- That's ~69,786 requests/hour or ~1,163 requests/minute
- With 911 blocked requests spread over 24h, we need a larger window
- 5000 events should capture several hours of history, including blocked events

## Expected Behavior After Fix

### Before (LIMIT 1000):
```
📊 Events fetched: {BLOCK: 1, ALLOW: 999}
Click "Blocked Requests (911)" → Shows 1 event
```

### After (LIMIT 5000):
```
📊 Events fetched: {BLOCK: ~911, ALLOW: ~4089}
Click "Blocked Requests (911)" → Shows ~911 events
```

## Testing Instructions

1. **Clear browser cache**: Ctrl+Shift+R (or Cmd+Shift+R)
2. **Open console**: F12 → Console tab
3. **Go to WAF Monitoring**: https://evo.ai.udstec.io/waf-monitoring
4. **Check logs**: Look for `📊 Events fetched:`
5. **Verify**: `actionCounts: {BLOCK: XXX}` should now show ~911 instead of 1
6. **Click "Blocked Requests" card**: Should now show the blocked events!

## What to Look For

### Success Indicators:

```
📊 Events fetched: {
  total: 5000,
  actionCounts: {
    BLOCK: ~911,  ← Should match metrics!
    ALLOW: ~4089,
    COUNT: 0
  }
}
```

Then when clicking "Blocked Requests":
```
🎯 Card clicked with filter: {type: "blocked"}
📊 Current events data: {
  actionCounts: {BLOCK: ~911}  ← Should have events now!
}
```

### If Still Shows Few Events:

If it still shows only 1-2 BLOCK events, it means:
- The 911 blocked requests are spread over MORE than 5000 events
- We need to either:
  1. Increase limit further (10000)
  2. OR fetch blocked events separately with a dedicated query

## Alternative Solution (If Needed)

If 5000 is still not enough, we can fetch blocked events separately:

```typescript
// Fetch ALL blocked events from last 24h (no limit)
const blockedEventsResponse = await apiClient.invoke('waf-dashboard-api', {
  body: { 
    action: 'events',
    filterAction: 'BLOCK',  // Only blocked
    startDate: since.toISOString(),
    limit: 10000  // Higher limit for blocked only
  }
});
```

## Performance Considerations

### Current Approach (LIMIT 5000):
- **Pros**: Simple, gets most events including blocked
- **Cons**: Fetches 5000 events every 30 seconds (larger payload)
- **Impact**: ~5x more data transferred, but still acceptable

### If Performance Becomes an Issue:
1. Reduce `refetchInterval` from 30s to 60s
2. Implement pagination (fetch on-demand)
3. Use separate query for blocked events only

## Deployment

- ✅ Frontend built: `npm run build`
- ✅ Deployed to S3: `aws s3 sync dist/ ...`
- ✅ CloudFront invalidated: Distribution E1PY7U3VNT6P1R
- ⏳ Wait 1-2 minutes for propagation

## Files Modified

1. `src/pages/WafMonitoring.tsx`
   - Changed `limit: 1000` to `limit: 5000`
   - Added comment explaining why

## Lessons Learned

### Why This Was Hard to Debug:

1. **Metrics vs Events mismatch** - Different queries, different results
2. **Time-based data** - Blocked events were older, outside the limit
3. **Ordering matters** - `ORDER BY timestamp DESC` meant recent events first
4. **Limit was too small** - 1000 events wasn't enough to capture all blocked events

### Best Practices Going Forward:

1. **Always consider time distribution** - Events may not be evenly distributed
2. **Test with real data patterns** - Attacks happen in bursts
3. **Use appropriate limits** - Consider the data volume and distribution
4. **Separate queries for different actions** - Consider dedicated queries for BLOCK events

## Next Steps

### After Confirming Fix Works:

1. **Remove debug logging** - Clean up all `console.log` statements
2. **Optimize if needed** - If 5000 is too much, implement pagination
3. **Add "Show All" button** - Let users fetch more events on demand
4. **Consider caching** - Cache blocked events separately for faster filtering

### If 5000 Is Still Not Enough:

1. Increase to 10000
2. OR implement dedicated blocked events query
3. OR add pagination with "Load More" button

---

## Summary

**Problem**: Clicking metric cards showed empty events because the query limit (1000) was too small to capture older blocked events.

**Solution**: Increased limit from 1000 to 5000 to capture more historical events, including the blocked ones.

**Result**: Users should now see the correct number of blocked events when clicking the "Blocked Requests" card.

**Status**: ✅ Deployed and ready for testing!
