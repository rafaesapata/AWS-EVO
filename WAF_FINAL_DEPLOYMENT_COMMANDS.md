# WAF Monitoring - Final Deployment Commands

## ✅ Backend Status: DEPLOYED

The backend has been successfully deployed to Lambda `evo-uds-v3-production-waf-dashboard-api`.

## ⏳ Frontend Deployment - Step by Step

### Step 1: Fix JSON Syntax Error

The file `src/i18n/locales/pt.json` has a syntax error on line 1916 (missing comma).

**Option A: Manual Fix**
1. Open `src/i18n/locales/pt.json`
2. Go to line 1916
3. Add a comma at the end of the line
4. Save the file

**Option B: Automated Fix (if you know the exact line)**
```bash
# This will be done by the AI assistant
```

### Step 2: Build Frontend

```bash
npm run build
```

Expected output:
```
✓ built in XXXms
```

### Step 3: Deploy to S3

```bash
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete
```

Expected output:
```
upload: dist/index.html to s3://...
upload: dist/assets/... to s3://...
...
```

### Step 4: Invalidate CloudFront Cache

```bash
aws cloudfront create-invalidation \
  --distribution-id E1PY7U3VNT6P1R \
  --paths "/*"
```

Expected output:
```json
{
    "Location": "...",
    "Invalidation": {
        "Id": "...",
        "Status": "InProgress",
        "CreateTime": "..."
    }
}
```

### Step 5: Wait for Invalidation (Optional)

```bash
# Get the invalidation ID from step 4 output
aws cloudfront wait invalidation-completed \
  --distribution-id E1PY7U3VNT6P1R \
  --id INVALIDATION_ID
```

### Step 6: Verify Deployment

```bash
# Check if the frontend is accessible
curl -I https://evo.ai.udstec.io/

# Should return HTTP 200
```

## 🧪 Testing After Deployment

### 1. Load WAF Monitoring Page
```
https://evo.ai.udstec.io/waf-monitoring
```

### 2. Open Browser Console
Press F12 and check for:
- ✅ No red errors
- ✅ All components load
- ✅ API calls return 200 status

### 3. Test New Features

**Timeline Chart:**
- Should display 24h area chart
- Hover to see tooltips
- Data should update when filters change

**Status Indicator:**
- Should show risk level (Critical/High/Medium/Low/Safe)
- Color should match severity

**Filters:**
- Apply different filters
- Verify data updates
- Reset filters

**World Map:**
- Should display geographic distribution
- Hover to see country names and counts

**Alert Configuration:**
- Open alert config panel
- Modify settings
- Click Save
- Reload page
- Verify settings persisted

**Metrics Cards:**
- Should show trend indicators (↑ or ↓)
- Percentage change should be displayed
- Hover to see previous period values

### 4. Check Backend Logs

```bash
aws logs tail /aws/lambda/evo-uds-v3-production-waf-dashboard-api \
  --follow \
  --region us-east-1
```

Look for:
- ✅ No ERROR logs
- ✅ Successful API calls
- ✅ Correct response times (<500ms)

## 🐛 Troubleshooting

### Frontend Build Fails

**Error:** `SyntaxError: Unexpected token`
**Solution:** JSON syntax error not fixed. Go back to Step 1.

**Error:** `Module not found`
**Solution:** Run `npm install` and try again.

### Frontend Doesn't Update After Deploy

**Problem:** Old version still showing
**Solution:** 
1. Clear browser cache (Ctrl+Shift+R)
2. Wait 2-3 minutes for CloudFront invalidation
3. Check invalidation status:
   ```bash
   aws cloudfront get-invalidation \
     --distribution-id E1PY7U3VNT6P1R \
     --id INVALIDATION_ID
   ```

### API Calls Return 500

**Problem:** Backend error
**Solution:**
1. Check CloudWatch Logs
2. Look for error messages
3. Verify Lambda has correct environment variables
4. Test Lambda directly:
   ```bash
   aws lambda invoke \
     --function-name evo-uds-v3-production-waf-dashboard-api \
     --payload '{"requestContext":{"http":{"method":"OPTIONS"}}}' \
     --region us-east-1 \
     /tmp/test.json
   ```

### Components Don't Render

**Problem:** JavaScript error
**Solution:**
1. Open browser console (F12)
2. Look for red errors
3. Check if all translation keys exist
4. Verify API responses are correct format

## 📊 Success Metrics

After deployment, verify:

- [ ] Frontend loads without errors
- [ ] All 6 new/enhanced components render
- [ ] Timeline chart shows 24h data
- [ ] Filters work correctly
- [ ] Alert config saves and persists
- [ ] Metrics show trend indicators
- [ ] World map displays geographic data
- [ ] No console errors
- [ ] API response times <500ms
- [ ] No backend errors in CloudWatch

## 🎉 Completion Checklist

- [x] Backend implemented
- [x] Backend deployed
- [x] Backend tested (OPTIONS call successful)
- [ ] JSON syntax error fixed
- [ ] Frontend built successfully
- [ ] Frontend deployed to S3
- [ ] CloudFront cache invalidated
- [ ] Frontend tested in browser
- [ ] All features verified working
- [ ] Documentation updated

## 📝 Post-Deployment Tasks

1. **Update Documentation**
   - Mark deployment as complete in `WAF_DEPLOYMENT_CHECKLIST.md`
   - Add any issues found to known issues section

2. **Monitor for 24 Hours**
   - Watch CloudWatch Logs for errors
   - Monitor user feedback
   - Check error rates

3. **Collect Metrics**
   - Page load times
   - API response times
   - Error rates
   - User engagement

4. **Plan Next Iteration**
   - Based on user feedback
   - Performance optimizations
   - Additional features

---

**Ready to Deploy**: Yes (after JSON fix)
**Estimated Time**: 5-10 minutes
**Risk Level**: Low (backend already deployed and tested)
**Rollback Plan**: Revert S3 deployment + CloudFront invalidation

---

**Last Updated**: 2026-01-16
**Prepared By**: Kiro AI Assistant
