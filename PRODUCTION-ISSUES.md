# Production Environment Issues & Solutions

**Date**: 2026-02-04
**Status**: In Progress

## 🚨 Critical Issues

### 1. Prisma Client Outdated in Lambda Layer

**Issue**: The Prisma Client in the Lambda Layer is outdated and doesn't match the current database schema. The `profiles` table has `full_name` column but Prisma Client is looking for old column names.

**Error**:
```
PrismaClientKnownRequestError: column "full_name" of relation "profiles" does not exist
```

**Root Cause**: Lambda Layer was created before recent schema changes. The Prisma Client needs to be regenerated with the latest schema and deployed.

**Solution**: Regenerate Prisma Client and create new Lambda Layer version.

**Steps to Fix**:
1. Run `npm run prisma:generate` in backend directory
2. Create new Lambda Layer with updated Prisma Client
3. Update all Lambdas to use new Layer version
4. OR trigger CI/CD pipeline to rebuild and deploy

**Status**: ⚠️ BLOCKED - Self-registration cannot complete until fixed

---

### 2. DNS Not Propagated

**Issue**: Domain `evo.nuevacore.com` does not resolve because nameservers are not configured at the domain registrar.

**Required Nameservers**:
```
ns-502.awsdns-62.com
ns-998.awsdns-60.net
ns-1799.awsdns-32.co.uk
ns-1360.awsdns-42.org
```

**Solution**: Configure nameservers at domain registrar (where evo.nuevacore.com was purchased).

**Verification**:
```bash
dig NS evo.nuevacore.com
dig evo.nuevacore.com
```

---

### 3. CORS Configuration Not Deployed

**Issue**: CORS headers still return `*` instead of `https://evo.nuevacore.com`.

**Status**: Code committed (commit 99d1f07) but not deployed to Lambdas.

**Solution**: Deploy updated `backend/src/lib/security-headers.ts` via CI/CD or manual Lambda update.

**Verification**:
```bash
curl -X OPTIONS https://api.evo.nuevacore.com/api/functions/self-register \
  -H "Origin: https://evo.nuevacore.com" \
  -v 2>&1 | grep "access-control-allow-origin"
# Should return: < access-control-allow-origin: https://evo.nuevacore.com
```

---

## ✅ Completed Fixes

### 1. Cognito User Pool Custom Attributes
**Status**: ✅ Fixed
**Solution**: Added custom attributes via AWS CLI
**Attributes Added**:
- `custom:roles`
- `custom:organizationId`
- `custom:profileId`
- `custom:organization_name`
- `custom:organization_id` (legacy)

### 2. Missing API Route for self-register
**Status**: ✅ Fixed
**Solution**: Created route via `scripts/create-missing-public-routes.sh`
**Route**: `POST /api/functions/self-register` (no auth required)

### 2. Missing Cognito Environment Variables
**Status**: ✅ Fixed
**Solution**: Added via `scripts/configure-lambda-env-vars.sh`
**Variables Added**:
- `COGNITO_USER_POOL_ID=us-east-1_BUJecylbm`
- `COGNITO_CLIENT_ID=a761ofnfjjo7u5mhpe2r54b7j`
- `AWS_REGION_COGNITO=us-east-1`

**Lambdas Updated**:
- self-register
- forgot-password
- mfa-enroll
- mfa-verify-login
- mfa-check
- mfa-challenge-verify
- mfa-list-factors
- mfa-unenroll

---

## 📋 Next Steps (Priority Order)

1. **Fix Cognito User Pool Attributes** (CRITICAL)
   - Add custom attributes OR create new User Pool
   - Update Lambda environment variables if new pool created

2. **Configure Domain Nameservers** (CRITICAL)
   - Contact domain registrar
   - Add Route 53 nameservers
   - Wait 24-48h for propagation

3. **Deploy CORS Changes** (HIGH)
   - Trigger CI/CD pipeline OR
   - Manually update all Lambdas with new security-headers.js

4. **Create First Admin User** (MEDIUM)
   - After Cognito attributes are fixed
   - Use AWS Console or CLI

5. **Run Smoke Tests** (MEDIUM)
   - Test self-registration
   - Test login
   - Test AWS credentials connection
   - Test security scan

---

## 🔧 Scripts Created

| Script | Purpose | Status |
|--------|---------|--------|
| `scripts/create-missing-public-routes.sh` | Create public API routes | ✅ Executed |
| `scripts/configure-lambda-env-vars.sh` | Add Cognito env vars | ✅ Executed |
| `scripts/update-lambda-env-vars.sh` | Update all Lambda env vars | ⚠️ Not needed |

---

## 📊 Current Status Summary

**Infrastructure**: ✅ 100% Deployed
- 195 Lambda functions
- 156 API routes
- Database with migrations
- CloudFront + S3
- Custom domains configured

**Configuration**: ⚠️ 80% Complete
- ✅ Lambda environment variables
- ✅ API routes
- ✅ VPC configuration
- ⚠️ Cognito custom attributes (MISSING)
- ⚠️ DNS propagation (PENDING)
- ⚠️ CORS deployment (PENDING)

**Functionality**: ⚠️ Blocked
- ❌ Self-registration (blocked by Cognito attributes)
- ❌ Login (blocked by DNS + Cognito)
- ❌ Frontend access (blocked by DNS)
- ✅ API Gateway responding
- ✅ Database accessible
- ✅ Lambdas executing

---

## 🔍 Verification Commands

### Check Cognito Attributes
```bash
AWS_PROFILE=EVO_PRODUCTION aws cognito-idp describe-user-pool \
  --user-pool-id us-east-1_BUJecylbm \
  --region us-east-1 \
  --query 'UserPool.SchemaAttributes[?starts_with(Name, `custom:`)]' \
  --output json
```

### Check Lambda Environment Variables
```bash
AWS_PROFILE=EVO_PRODUCTION aws lambda get-function-configuration \
  --function-name evo-uds-v3-production-self-register \
  --region us-east-1 \
  --query 'Environment.Variables' \
  --output json | jq 'to_entries[] | select(.key | contains("COGNITO"))'
```

### Check DNS Resolution
```bash
dig evo.nuevacore.com
dig api.evo.nuevacore.com
```

### Test API Endpoint
```bash
curl -X POST https://api.evo.nuevacore.com/api/functions/self-register \
  -H "Content-Type: application/json" \
  -H "Origin: https://evo.nuevacore.com" \
  -d '{"email":"test@test.com","password":"TestPassword123!","fullName":"Test User","phone":"+5511999999999","organizationName":"Test Org","company":"Test","country":"BR"}'
```

---

**Last Updated**: 2026-02-04 21:30 UTC
