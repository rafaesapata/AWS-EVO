# Azure Multi-Cloud Support - Deployment Guide

**Version:** 1.0.0  
**Date:** 2026-01-12  
**Status:** Ready for Deployment

## Prerequisites

- AWS CLI configured with credentials for account 383234048592
- Node.js 18.x installed
- Access to AWS Lambda, API Gateway, S3, and CloudFront
- Prisma Client generated (`npm run prisma:generate` in backend)

## Deployment Steps

### Step 1: Build Backend

```bash
cd backend
npm run build
cd ..
```

Verify: `backend/dist/` directory should contain compiled JavaScript files.

### Step 2: Deploy Azure Lambda Handlers

Use the script below to deploy all Azure handlers:

```bash
#!/bin/bash
# deploy-azure-handlers.sh

REGION="us-east-1"
ACCOUNT_ID="383234048592"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/evo-lambda-role"
LAYER_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:layer:evo-prisma-deps-layer:2"
PREFIX="evo-uds-v3-production"

# Array of handlers to deploy
HANDLERS=(
  "validate-azure-credentials"
  "save-azure-credentials"
  "list-azure-credentials"
  "delete-azure-credentials"
  "azure-security-scan"
  "azure-fetch-costs"
  "azure-resource-inventory"
  "azure-activity-logs"
)

# Deploy each handler
for HANDLER in "${HANDLERS[@]}"; do
  echo "Deploying ${HANDLER}..."
  
  # Create temp directory
  rm -rf /tmp/lambda-deploy
  mkdir -p /tmp/lambda-deploy
  
  # Copy and fix imports
  sed 's|require("../../lib/|require("./lib/|g' backend/dist/handlers/azure/${HANDLER}.js | \
  sed 's|require("../../types/|require("./types/|g' > /tmp/lambda-deploy/${HANDLER}.js
  
  # Copy dependencies
  cp -r backend/dist/lib /tmp/lambda-deploy/
  cp -r backend/dist/types /tmp/lambda-deploy/
  
  # Create ZIP
  pushd /tmp/lambda-deploy > /dev/null
  zip -r -q /tmp/lambda.zip .
  popd > /dev/null
  
  # Check if function exists
  if aws lambda get-function --function-name ${PREFIX}-${HANDLER} --region ${REGION} 2>/dev/null; then
    # Update existing function
    echo "  Updating existing function..."
    aws lambda update-function-code \
      --function-name ${PREFIX}-${HANDLER} \
      --zip-file fileb:///tmp/lambda.zip \
      --region ${REGION} > /dev/null
  else
    # Create new function
    echo "  Creating new function..."
    aws lambda create-function \
      --function-name ${PREFIX}-${HANDLER} \
      --runtime nodejs18.x \
      --handler ${HANDLER}.handler \
      --zip-file fileb:///tmp/lambda.zip \
      --role ${ROLE_ARN} \
      --layers ${LAYER_ARN} \
      --timeout 30 \
      --memory-size 256 \
      --region ${REGION} \
      --environment "Variables={DATABASE_URL=postgresql://...,NODE_ENV=production}" > /dev/null
  fi
  
  echo "  ✓ ${HANDLER} deployed"
done

# Deploy unified cloud handler
echo "Deploying list-cloud-credentials..."
rm -rf /tmp/lambda-deploy
mkdir -p /tmp/lambda-deploy

sed 's|require("../../lib/|require("./lib/|g' backend/dist/handlers/cloud/list-cloud-credentials.js | \
sed 's|require("../../types/|require("./types/|g' > /tmp/lambda-deploy/list-cloud-credentials.js

cp -r backend/dist/lib /tmp/lambda-deploy/
cp -r backend/dist/types /tmp/lambda-deploy/

pushd /tmp/lambda-deploy > /dev/null
zip -r -q /tmp/lambda.zip .
popd > /dev/null

if aws lambda get-function --function-name ${PREFIX}-list-cloud-credentials --region ${REGION} 2>/dev/null; then
  aws lambda update-function-code \
    --function-name ${PREFIX}-list-cloud-credentials \
    --zip-file fileb:///tmp/lambda.zip \
    --region ${REGION} > /dev/null
else
  aws lambda create-function \
    --function-name ${PREFIX}-list-cloud-credentials \
    --runtime nodejs18.x \
    --handler list-cloud-credentials.handler \
    --zip-file fileb:///tmp/lambda.zip \
    --role ${ROLE_ARN} \
    --layers ${LAYER_ARN} \
    --timeout 30 \
    --memory-size 256 \
    --region ${REGION} \
    --environment "Variables={DATABASE_URL=postgresql://...,NODE_ENV=production}" > /dev/null
fi

echo "  ✓ list-cloud-credentials deployed"
echo ""
echo "All handlers deployed successfully!"
```

Save as `scripts/deploy-azure-handlers.sh` and run:
```bash
chmod +x scripts/deploy-azure-handlers.sh
./scripts/deploy-azure-handlers.sh
```

### Step 3: Configure API Gateway

Add the following endpoints to API Gateway (REST API ID: `3l66kn0eaj`):

```bash
#!/bin/bash
# configure-api-gateway.sh

API_ID="3l66kn0eaj"
REGION="us-east-1"
ACCOUNT_ID="383234048592"
PARENT_ID="n9gxy9"  # /api/functions resource ID
AUTHORIZER_ID="joelbs"

# Array of endpoints
ENDPOINTS=(
  "validate-azure-credentials"
  "save-azure-credentials"
  "list-azure-credentials"
  "delete-azure-credentials"
  "azure-security-scan"
  "azure-fetch-costs"
  "azure-resource-inventory"
  "azure-activity-logs"
  "list-cloud-credentials"
)

for ENDPOINT in "${ENDPOINTS[@]}"; do
  echo "Creating endpoint: ${ENDPOINT}"
  
  # Create resource
  RESOURCE_ID=$(aws apigateway create-resource \
    --rest-api-id ${API_ID} \
    --parent-id ${PARENT_ID} \
    --path-part ${ENDPOINT} \
    --region ${REGION} \
    --query 'id' \
    --output text)
  
  # Create OPTIONS method (CORS)
  aws apigateway put-method \
    --rest-api-id ${API_ID} \
    --resource-id ${RESOURCE_ID} \
    --http-method OPTIONS \
    --authorization-type NONE \
    --region ${REGION} > /dev/null
  
  aws apigateway put-integration \
    --rest-api-id ${API_ID} \
    --resource-id ${RESOURCE_ID} \
    --http-method OPTIONS \
    --type MOCK \
    --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
    --region ${REGION} > /dev/null
  
  aws apigateway put-method-response \
    --rest-api-id ${API_ID} \
    --resource-id ${RESOURCE_ID} \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":true,"method.response.header.Access-Control-Allow-Methods":true,"method.response.header.Access-Control-Allow-Origin":true}' \
    --region ${REGION} > /dev/null
  
  aws apigateway put-integration-response \
    --rest-api-id ${API_ID} \
    --resource-id ${RESOURCE_ID} \
    --http-method OPTIONS \
    --status-code 200 \
    --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization,X-Requested-With,X-API-Key,X-Request-ID,X-CSRF-Token,X-Correlation-ID,X-Amz-Date,X-Amz-Security-Token'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' \
    --region ${REGION} > /dev/null
  
  # Create POST method with Cognito auth
  aws apigateway put-method \
    --rest-api-id ${API_ID} \
    --resource-id ${RESOURCE_ID} \
    --http-method POST \
    --authorization-type COGNITO_USER_POOLS \
    --authorizer-id ${AUTHORIZER_ID} \
    --region ${REGION} > /dev/null
  
  aws apigateway put-integration \
    --rest-api-id ${API_ID} \
    --resource-id ${RESOURCE_ID} \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:evo-uds-v3-production-${ENDPOINT}/invocations" \
    --region ${REGION} > /dev/null
  
  # Add Lambda permission
  aws lambda add-permission \
    --function-name evo-uds-v3-production-${ENDPOINT} \
    --statement-id apigateway-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*/${ENDPOINT}" \
    --region ${REGION} 2>/dev/null || true
  
  echo "  ✓ ${ENDPOINT} configured"
done

# Deploy API Gateway
echo ""
echo "Deploying API Gateway..."
aws apigateway create-deployment \
  --rest-api-id ${API_ID} \
  --stage-name prod \
  --region ${REGION} > /dev/null

echo "✓ API Gateway deployed"
```

Save as `scripts/configure-api-gateway.sh` and run:
```bash
chmod +x scripts/configure-api-gateway.sh
./scripts/configure-api-gateway.sh
```

### Step 4: Deploy Frontend

```bash
# Build frontend
npm run build

# Deploy to S3
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E1PY7U3VNT6P1R \
  --paths "/*"
```

### Step 5: Update Navigation

Add the Cloud Credentials page to the sidebar navigation. Edit the sidebar component to include:

```typescript
{
  title: t('sidebar.cloudCredentials', 'Cloud Credentials'),
  href: '/cloud-credentials',
  icon: Cloud,
}
```

### Step 6: Verify Deployment

1. **Test Lambda Functions:**
```bash
# Test validate-azure-credentials
aws lambda invoke \
  --function-name evo-uds-v3-production-validate-azure-credentials \
  --payload '{"body":"{\"tenantId\":\"test\",\"clientId\":\"test\",\"clientSecret\":\"test\",\"subscriptionId\":\"test\"}"}' \
  --region us-east-1 \
  response.json

cat response.json
```

2. **Test API Gateway:**
```bash
# Get auth token first
TOKEN="your-cognito-jwt-token"

# Test endpoint
curl -X POST \
  https://api-evo.ai.udstec.io/api/functions/list-cloud-credentials \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

3. **Test Frontend:**
- Navigate to https://evo.ai.udstec.io/cloud-credentials
- Click on Azure tab
- Try adding Azure credentials
- Verify validation works

## Environment Variables

Ensure the following environment variables are set in Lambda functions:

```bash
DATABASE_URL=postgresql://username:password@host:5432/database
NODE_ENV=production
AWS_REGION=us-east-1
```

## Monitoring

After deployment, monitor:

1. **CloudWatch Logs:**
```bash
aws logs tail /aws/lambda/evo-uds-v3-production-validate-azure-credentials --follow
```

2. **Lambda Metrics:**
- Invocations
- Errors
- Duration
- Throttles

3. **API Gateway Metrics:**
- 4XX errors
- 5XX errors
- Latency
- Request count

## Rollback Plan

If issues occur:

1. **Rollback Lambda:**
```bash
aws lambda update-function-code \
  --function-name evo-uds-v3-production-validate-azure-credentials \
  --s3-bucket your-backup-bucket \
  --s3-key lambda-backups/validate-azure-credentials-previous.zip \
  --region us-east-1
```

2. **Rollback Frontend:**
```bash
# Restore from backup
aws s3 sync s3://your-backup-bucket/frontend-backup/ s3://evo-uds-v3-production-frontend-383234048592/ --delete
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"
```

3. **Rollback Database:**
```bash
# Run down migration
npx prisma migrate resolve --rolled-back 20260112_add_azure_support
```

## Post-Deployment Testing

### Test Checklist

- [ ] Can access Cloud Credentials page
- [ ] Can switch between AWS and Azure tabs
- [ ] Can open Azure Quick Connect guide
- [ ] Can validate Azure credentials (with test subscription)
- [ ] Can save Azure credentials
- [ ] Can list Azure credentials
- [ ] Can delete Azure credentials
- [ ] Can run Azure security scan
- [ ] Can fetch Azure costs
- [ ] Can view Azure resources
- [ ] AWS functionality still works
- [ ] Account selector shows both providers
- [ ] Provider badges display correctly

### Performance Testing

- [ ] Lambda cold start < 3 seconds
- [ ] Lambda warm execution < 1 second
- [ ] API Gateway latency < 500ms
- [ ] Frontend page load < 2 seconds
- [ ] No memory leaks in long-running sessions

## Troubleshooting

### Common Issues

**Issue:** Lambda returns 502 "Cannot find module"  
**Solution:** Verify imports were adjusted correctly (../../lib/ → ./lib/)

**Issue:** CORS errors in browser  
**Solution:** Verify OPTIONS method is configured with correct headers

**Issue:** "Invalid credentials" when testing Azure  
**Solution:** Ensure Azure SDK packages are in Lambda layer

**Issue:** Database connection timeout  
**Solution:** Verify Lambda is in correct VPC subnets with NAT Gateway

**Issue:** Frontend shows "No accounts"  
**Solution:** Check CloudAccountContext is properly initialized

## Support

For issues during deployment:
1. Check CloudWatch Logs for Lambda errors
2. Verify API Gateway deployment to 'prod' stage
3. Test Lambda functions directly before testing via API Gateway
4. Ensure Prisma Client is generated and included in layer

---

**Deployment prepared by:** AI Assistant (Kiro)  
**Last updated:** 2026-01-12  
**Version:** 1.0.0
