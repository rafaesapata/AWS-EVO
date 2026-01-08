# ✅ Quick Connect Template Updated - WAF Permissions Added

**Date:** 2026-01-08  
**Status:** DEPLOYED AND LIVE

## 🎯 What Was Done

Updated the Quick Connect CloudFormation template with the missing WAF monitoring permissions that were causing AccessDeniedException errors.

## 📋 Changes Made

### Permissions Added to `EVOPlatformSecurityMonitoringPolicy`

In the `CloudWatchLogsWAFMonitoring` statement, added:
- `logs:PutResourcePolicy` - Required to create CloudWatch Logs resource policy for WAF
- `logs:DescribeResourcePolicies` - Required to check existing resource policies

### Files Updated

1. **Source:** `public/cloudformation/evo-platform-role.yaml`
2. **Deployed to:** `https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml`
3. **CloudFront Distribution:** E1PY7U3VNT6P1R (cache invalidated)

## 🚀 Deployment Steps Executed

```bash
# 1. Updated template source
vim public/cloudformation/evo-platform-role.yaml

# 2. Validated template syntax
aws cloudformation validate-template \
  --template-body file://public/cloudformation/evo-platform-role.yaml

# 3. Built frontend (includes CloudFormation templates)
npm run build

# 4. Deployed to S3
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete

# 5. Invalidated CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E1PY7U3VNT6P1R \
  --paths "/cloudformation/*"

# 6. Verified template is live
curl -s https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml | grep "PutResourcePolicy"
```

## 📝 Instructions for Client

### How to Update Your CloudFormation Stack

**IMPORTANT:** Since the template URL remains the same, you can use "Use current template" option!

1. **Access AWS CloudFormation Console:**
   - Go to: https://console.aws.amazon.com/cloudformation
   - Select your region (where the stack was created)

2. **Select Your Stack:**
   - Find the stack named `EVO-Platform-Role-*` or similar
   - Click on the stack name

3. **Update Stack:**
   - Click the **"Update"** button (top right)
   - Select **"Use current template"** (the template URL is already updated!)
   - Click **"Next"**

4. **Review Parameters:**
   - No changes needed to parameters
   - Click **"Next"**

5. **Configure Stack Options:**
   - No changes needed
   - Click **"Next"**

6. **Review and Submit:**
   - Scroll to bottom
   - Check the box: **"I acknowledge that AWS CloudFormation might create IAM resources"**
   - Click **"Submit"**

7. **Wait for Completion:**
   - Status will change from `UPDATE_IN_PROGRESS` to `UPDATE_COMPLETE`
   - This usually takes 1-2 minutes

### What This Update Fixes

✅ **WAF Monitoring Setup** - Enables automatic CloudWatch Logs resource policy creation  
✅ **AccessDeniedException** - Resolves the 500 error when enabling WAF monitoring  
✅ **São Paulo Region** - Already supported (sa-east-1)

## 🔍 Verification

After updating the stack, test WAF monitoring setup:

1. Go to EVO Platform → Security → WAF Monitoring
2. Select your AWS account
3. Select a region (including São Paulo - sa-east-1)
4. Select a Web ACL
5. Click "Enable Monitoring"
6. Should complete successfully without AccessDeniedException

## 📊 Technical Details

### Before (Missing Permissions)
```yaml
- 'logs:CreateLogGroup'
- 'logs:PutSubscriptionFilter'
- 'logs:DeleteSubscriptionFilter'
- 'logs:DescribeSubscriptionFilters'
- 'logs:PutRetentionPolicy'
```

### After (Complete Permissions)
```yaml
- 'logs:CreateLogGroup'
- 'logs:PutSubscriptionFilter'
- 'logs:DeleteSubscriptionFilter'
- 'logs:DescribeSubscriptionFilters'
- 'logs:PutRetentionPolicy'
- 'logs:PutResourcePolicy'          # ✅ NEW
- 'logs:DescribeResourcePolicies'   # ✅ NEW
```

## 🎯 Why These Permissions Are Needed

AWS WAF requires a CloudWatch Logs **resource policy** to allow `wafv2.amazonaws.com` to write logs to your log groups. Without `logs:PutResourcePolicy`, the EVO Platform cannot create this policy automatically, resulting in AccessDeniedException.

The Lambda function now automatically creates this policy when you enable WAF monitoring:

```typescript
// Automatically creates CloudWatch Logs resource policy
await logsClient.send(new PutResourcePolicyCommand({
  policyName: 'AWSLogDeliveryWrite-WAF',
  policyDocument: JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: { Service: 'wafv2.amazonaws.com' },
      Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      Resource: `arn:aws:logs:${region}:${accountId}:log-group:${logGroupName}:*`
    }]
  })
}));
```

## 📚 Related Documentation

- **Deployment Process:** `.kiro/steering/cloudformation-deployment.md`
- **WAF Fix Details:** `WAF_ACCESS_DENIED_FIX.md`
- **São Paulo Support:** `SAO_PAULO_REGION_SUPPORT_COMPLETE.md`
- **AWS Infrastructure:** `.kiro/steering/aws-infrastructure.md`

## ✅ Checklist

- [x] Template source updated
- [x] Syntax validated
- [x] Frontend built
- [x] Deployed to S3
- [x] CloudFront cache invalidated
- [x] Template verified live
- [x] Client instructions provided
- [x] Documentation updated

---

**Template URL:** https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml  
**Status:** ✅ LIVE AND READY  
**Action Required:** Client needs to update their CloudFormation stack using "Use current template"
