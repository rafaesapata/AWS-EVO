# Production Fix Summary - WebAuthn Check Endpoint

**Date**: 2026-02-04 22:50 UTC
**Issue**: CORS error on `/api/functions/webauthn-check` endpoint (404)

## Problem Identified

Frontend was calling `POST /api/functions/webauthn-check` but:
1. API Gateway route didn't exist (404 error)
2. Database tables `users` and `webauthn_credentials` didn't exist
3. Lambda missing Cognito environment variables

## Actions Taken

### 1. Created API Gateway Route
```bash
# Created integration
aws apigatewayv2 create-integration --api-id w5gyvgfskh \
  --integration-type AWS_PROXY \
  --integration-uri "arn:aws:lambda:us-east-1:523115032346:function:evo-uds-v3-production-webauthn-check"

# Created route
aws apigatewayv2 create-route --api-id w5gyvgfskh \
  --route-key "POST /api/functions/webauthn-check" \
  --target "integrations/tq7n5z5"

# Added Lambda permission
aws lambda add-permission --function-name evo-uds-v3-production-webauthn-check \
  --statement-id apigateway-webauthn-check-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com
```

### 2. Created Database Tables
Created migration `20260204_add_users_and_webauthn_tables` and executed via Bastion:

```sql
-- users table
CREATE TABLE "users" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL UNIQUE,
    "full_name" TEXT,
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- webauthn_credentials table
CREATE TABLE "webauthn_credentials" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "credential_id" TEXT NOT NULL UNIQUE,
    "public_key" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "device_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6)
);
```

### 3. Added Environment Variables
```bash
aws lambda update-function-configuration \
  --function-name evo-uds-v3-production-webauthn-check \
  --environment "Variables={
    DATABASE_URL=postgresql://...,
    COGNITO_USER_POOL_ID=us-east-1_BUJecylbm,
    COGNITO_CLIENT_ID=a761ofnfjjo7u5mhpe2r54b7j,
    AWS_REGION_COGNITO=us-east-1,
    NODE_ENV=production
  }"
```

## Verification

### Test WebAuthn Check
```bash
curl -X POST https://api.evo.nuevacore.com/api/functions/webauthn-check \
  -H "Content-Type: application/json" \
  -H "Origin: https://evo.nuevacore.com" \
  -d '{"email":"test@example.com"}'

# Response: {"hasWebAuthn":false,"credentialsCount":0}
```

### Test CORS Headers
```bash
curl -X POST https://api.evo.nuevacore.com/api/functions/webauthn-check \
  -H "Origin: https://evo.nuevacore.com" \
  -v 2>&1 | grep "access-control-allow-origin"

# Response: < access-control-allow-origin: *
```

## Status

✅ **RESOLVED** - Endpoint is now functional and returning correct responses

## Files Modified

1. `backend/prisma/migrations/20260204_add_users_and_webauthn_tables/migration.sql` - New migration
2. `PRODUCTION-ISSUES.md` - Updated with fix details

## Next Steps

- Monitor endpoint usage in CloudWatch Logs
- Consider adding CORS origin restriction (currently allows `*`)
- Ensure CI/CD pipeline includes this migration for future deployments

---

**Fixed by**: Kiro AI Assistant
**Execution Time**: ~15 minutes
**Method**: Manual infrastructure configuration (API Gateway + Database + Lambda)
