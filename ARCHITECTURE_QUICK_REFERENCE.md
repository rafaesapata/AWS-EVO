# Architecture Quick Reference Guide

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND LAYER                           │
│                    (React 18 + Vite + TypeScript)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  AppSidebar (32 Menu Items)                              │  │
│  │  ├─ Executive Dashboard                                  │  │
│  │  ├─ Cost Analysis (with sub-items)                       │  │
│  │  ├─ Copilot AI                                           │  │
│  │  ├─ ML Predictions (with sub-items)                      │  │
│  │  ├─ Monitoring (with sub-items)                          │  │
│  │  ├─ Attack Detection                                     │  │
│  │  ├─ Analysis & Scans (with sub-items)                    │  │
│  │  ├─ Optimization (with sub-items)                        │  │
│  │  ├─ Intelligent Alerts                                   │  │
│  │  ├─ Security Posture                                     │  │
│  │  ├─ Remediation Tickets                                  │  │
│  │  ├─ Knowledge Base                                       │  │
│  │  ├─ TV Dashboards                                        │  │
│  │  ├─ Audit                                                │  │
│  │  ├─ Communication Center                                 │  │
│  │  ├─ License Management                                   │  │
│  │  ├─ AWS Settings                                         │  │
│  │  ├─ Manage Users                                         │  │
│  │  ├─ Organizations (Super Admin)                          │  │
│  │  ├─ Scheduled Jobs (Super Admin)                         │  │
│  │  ├─ Dev Tools (Super Admin)                              │  │
│  │  └─ Setup                                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  React Router (43 Routes)                                │  │
│  │  ├─ /                    → AuthSimple                     │  │
│  │  ├─ /app                 → Index (Dashboard)              │  │
│  │  ├─ /dashboard           → Dashboard                      │  │
│  │  ├─ /aws-settings        → AWSSettings                    │  │
│  │  ├─ /security-scans      → SecurityScans                  │  │
│  │  ├─ /copilot-ai          → CopilotAI                      │  │
│  │  ├─ /well-architected    → WellArchitected                │  │
│  │  ├─ /knowledge-base      → KnowledgeBase                  │  │
│  │  ├─ /tv                  → TVDashboard                    │  │
│  │  └─ ... (40+ more routes)                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  API Client (src/integrations/aws/api-client.ts)         │  │
│  │  ├─ apiClient.invoke(functionName, options)              │  │
│  │  ├─ apiClient.rpc(functionName, params)                  │  │
│  │  ├─ apiClient.select(table, options)                     │  │
│  │  ├─ apiClient.insert(table, data)                        │  │
│  │  ├─ apiClient.update(table, data, eq)                    │  │
│  │  └─ apiClient.delete(table, eq)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    HTTP/HTTPS (CORS Protected)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      AWS API GATEWAY                            │
│                   (REST API ID: 3l66kn0eaj)                     │
│                   (Stage: prod)                                 │
│                   (Domain: api-evo.ai.udstec.io)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Cognito User Pools Authorizer (ez5xqt)                  │  │
│  │  ├─ Validates JWT tokens                                 │  │
│  │  ├─ Extracts user claims                                 │  │
│  │  └─ Enforces authentication                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  /api/functions/* Resource (n9gxy9)                       │  │
│  │  └─ Routes to Lambda functions                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    AWS LAMBDA LAYER                             │
│         (evo-prisma-deps-layer:2)                              │
│  ├─ @prisma/client                                             │
│  ├─ .prisma/client (generated)                                 │
│  ├─ zod (validation)                                           │
│  └─ Binary dependencies (rhel-openssl)                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  AWS LAMBDA FUNCTIONS                           │
│              (70+ Handlers across 21 categories)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Admin (5)          │  AI (1)           │  Auth (3)            │
│  ├─ manage-user     │  ├─ generate-     │  ├─ verify-tv-token  │
│  ├─ create-cognito  │  │   response     │  ├─ webauthn-auth    │
│  ├─ create-user     │  └─ (Bedrock)     │  └─ webauthn-reg     │
│  ├─ disable-cognito │                   │                      │
│  └─ log-audit       │  AWS (3)          │  Cost (9)            │
│                     │  ├─ list-creds    │  ├─ fetch-daily-     │
│  Data (1)           │  ├─ save-creds    │  │   costs            │
│  └─ query-table     │  └─ update-creds  │  ├─ budget-forecast  │
│                     │                   │  ├─ cost-optim       │
│  Integrations (2)   │  Jobs (8)         │  ├─ ml-waste-detect  │
│  ├─ cloudformation  │  ├─ execute-job   │  ├─ ri-sp-analyzer   │
│  └─ create-jira     │  ├─ process-jobs  │  ├─ finops-copilot   │
│                     │  ├─ scheduled-    │  └─ ... (4 more)     │
│  KB (4)             │  │   scan         │                      │
│  ├─ ai-suggestions  │  ├─ sync-resource │  License (2)         │
│  ├─ analytics       │  └─ ... (5 more)  │  ├─ validate-license │
│  ├─ article-track   │                   │  └─ daily-validation │
│  └─ export-pdf      │  ML (6)           │                      │
│                     │  ├─ anomaly-      │  Monitoring (6)      │
│  Notifications (3)  │  │   detection    │  ├─ fetch-cloudwatch │
│  ├─ send-email      │  ├─ predict-      │  ├─ endpoint-check   │
│  ├─ send-notif      │  │   incidents    │  ├─ auto-alerts      │
│  └─ get-logs        │  ├─ intelligent-  │  ├─ health-check     │
│                     │  │   alerts       │  └─ ... (3 more)     │
│  Organizations (2)  │  └─ ... (3 more)  │                      │
│  ├─ create-org-acc  │                   │  Reports (5)         │
│  └─ sync-org-acc    │  Profiles (2)     │  ├─ generate-excel   │
│                     │  ├─ check-org     │  ├─ generate-pdf     │
│  Security (15)      │  └─ create-with-  │  ├─ remediation-     │
│  ├─ security-scan   │     org           │  │   script          │
│  ├─ compliance-scan │                   │  └─ ... (2 more)     │
│  ├─ well-arch-scan  │  System (1)       │                      │
│  ├─ cloudtrail-     │  └─ run-migrations│  User (1)            │
│  │   analysis       │                   │  └─ notification-    │
│  ├─ iam-analysis    │  WebSocket (2)    │     settings         │
│  ├─ guardduty-scan  │  ├─ connect       │                      │
│  ├─ drift-detection │  └─ disconnect    │                      │
│  └─ ... (9 more)    │                   │                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    PRISMA ORM                                   │
│              (backend/prisma/schema.prisma)                     │
│  ├─ Type-safe database queries                                 │
│  ├─ Automatic migrations                                       │
│  └─ Multi-tenant isolation (organization_id)                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  AWS RDS PostgreSQL                             │
│              (PostgreSQL 15.10)                                 │
│              (Stack: evo-uds-v3-nodejs-infra)                  │
│  ├─ Multi-tenant database                                      │
│  ├─ Encrypted connections                                      │
│  └─ Automated backups                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Examples

### Example 1: Security Scan Flow

```
User clicks "Security Scans" in sidebar
    ↓
Navigate to /security-scans
    ↓
SecurityScans.tsx loads
    ↓
User clicks "Start Scan" button
    ↓
apiClient.invoke('start-security-scan', { body: { scanType: 'full' } })
    ↓
HTTP POST to API Gateway /api/functions/start-security-scan
    ↓
Cognito Authorizer validates JWT token
    ↓
Lambda: security/security-scan.ts handler invoked
    ↓
Handler extracts user from event
    ↓
Handler gets organizationId from user claims
    ↓
Prisma queries PostgreSQL for scan configuration
    ↓
AWS SDK calls EC2, IAM, S3 APIs to scan resources
    ↓
Results stored in PostgreSQL via Prisma
    ↓
Response returned to frontend
    ↓
Frontend updates UI with scan results
```

### Example 2: Cost Analysis Flow

```
User clicks "Cost Analysis" in sidebar
    ↓
Navigate to /app?tab=costs
    ↓
CostAnalysisPage.tsx loads
    ↓
useQuery hook triggers data fetch
    ↓
apiClient.invoke('fetch-daily-costs', { body: { accountId, days: 90 } })
    ↓
HTTP POST to API Gateway /api/functions/fetch-daily-costs
    ↓
Cognito Authorizer validates JWT
    ↓
Lambda: cost/fetch-daily-costs.ts handler invoked
    ↓
Handler gets organizationId from user claims
    ↓
AWS SDK calls Cost Explorer API
    ↓
Results cached in PostgreSQL
    ↓
Response returned with cost data
    ↓
Frontend renders charts and tables
    ↓
User can drill down into cost details
```

### Example 3: AI Copilot Flow

```
User navigates to /copilot-ai
    ↓
CopilotAI.tsx loads
    ↓
User types message in chat input
    ↓
User clicks "Send"
    ↓
apiClient.invoke('bedrock-chat', { body: { message, context } })
    ↓
HTTP POST to API Gateway /api/functions/bedrock-chat
    ↓
Cognito Authorizer validates JWT
    ↓
Lambda: ai/generate-response.ts handler invoked
    ↓
Handler extracts user context and organization
    ↓
AWS Bedrock API called with message and context
    ↓
Bedrock returns AI-generated response
    ↓
Response stored in PostgreSQL for history
    ↓
Response returned to frontend
    ↓
Frontend displays AI response in chat
```

---

## Key Configuration Values

### AWS Infrastructure
```
Region:                    us-east-1
API Gateway ID:            3l66kn0eaj
API Stage:                 prod
API Domain:                api-evo.ai.udstec.io
API Regional Endpoint:     d-lh5c9lpit7.execute-api.us-east-1.amazonaws.com
Cognito Authorizer ID:     ez5xqt
Functions Resource ID:     n9gxy9
```

### Cognito
```
User Pool ID:              us-east-1_qGmGkvmpL
Region:                    us-east-1
Auth Type:                 Cognito User Pools
Token Type:                JWT (ID Token)
```

### Lambda
```
Runtime:                   Node.js 18.x
Layer:                     evo-prisma-deps-layer:2
Layer ARN:                 arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:2
Function Prefix:           evo-uds-v3-production-
Timeout:                   30 seconds (default)
Memory:                    256 MB (default)
VPC:                       vpc-09773244a2156129c
```

### RDS PostgreSQL
```
Engine:                    PostgreSQL 15.10
Stack:                     evo-uds-v3-nodejs-infra
ORM:                       Prisma
Schema Location:           backend/prisma/schema.prisma
VPC:                       vpc-09773244a2156129c
Private Subnets:           subnet-0dbb444e4ef54d211, subnet-05383447666913b7b
```

### CloudFront
```
Frontend Distribution ID:  E1PY7U3VNT6P1R
Frontend Domain:           evo.ai.udstec.io
S3 Bucket:                 evo-uds-v3-production-frontend-383234048592
```

### VPC Networking
```
VPC ID:                    vpc-09773244a2156129c
VPC CIDR:                  10.0.0.0/16
Public Subnet:             subnet-0c7857d8ca2b5a4e0 (10.0.1.0/24)
Private Subnets:           subnet-0dbb444e4ef54d211 (10.0.3.0/24)
                           subnet-05383447666913b7b (10.0.4.0/24)
NAT Gateway:               nat-071801f85e8109355
NAT Gateway IP:            54.165.51.84
Internet Gateway:          igw-0d7006c2a96e4ef47
```

---

## Common API Calls Reference

### Invoke Lambda Function
```typescript
const result = await apiClient.invoke('function-name', {
  body: { param1: 'value1', param2: 'value2' }
});

if (result.error) {
  console.error('Error:', result.error.message);
} else {
  console.log('Success:', result.data);
}
```

### Query Database Table
```typescript
const result = await apiClient.select('table_name', {
  select: 'id, name, email',
  eq: { organization_id: orgId },
  order: { column: 'created_at', ascending: false },
  limit: 10
});
```

### Insert Data
```typescript
const result = await apiClient.insert('table_name', {
  name: 'John Doe',
  email: 'john@example.com',
  organization_id: orgId
});
```

### Update Data
```typescript
const result = await apiClient.update('table_name', 
  { name: 'Jane Doe' },
  { id: 'record-id' }
);
```

### Delete Data
```typescript
const result = await apiClient.delete('table_name', {
  id: 'record-id'
});
```

---

## Deployment Commands

### Build Frontend
```bash
npm run build
```

### Build Backend
```bash
npm run build --prefix backend
```

### Deploy Frontend
```bash
npm run deploy:frontend
# or
npm run deploy:frontend:prod
```

### Deploy Backend
```bash
npm run deploy:prod
```

### Deploy Secrets
```bash
npm run deploy:secrets:prod
```

### Invalidate CloudFront Cache
```bash
npm run invalidate-cloudfront
```

---

## Troubleshooting Quick Guide

### Lambda 502 "Cannot find module"
1. Check if layer is attached to Lambda
2. Verify module exists in layer
3. Check handler path (e.g., `handlers/security/security-scan.handler`)
4. Redeploy layer: `npm run deploy:prod`

### CORS 403 on OPTIONS
1. Verify OPTIONS method has `authorizationType: NONE`
2. Check integration response has CORS headers
3. Verify deployment is on `prod` stage (not `production`)
4. Flush cache: `aws apigateway flush-stage-cache --rest-api-id 3l66kn0eaj --stage-name prod`

### Prisma "did not initialize yet"
1. Run `prisma generate` in backend
2. Update layer with new `.prisma/client`
3. Update Lambda layer version
4. Redeploy all Lambdas

### Lambda 504 Timeout (VPC)
1. Verify NAT Gateway is active
2. Check private subnets have route to NAT
3. Verify Lambda is in correct VPC subnets
4. Increase Lambda timeout if needed

### Authentication Failures
1. Verify Cognito User Pool ID is correct
2. Check JWT token expiration
3. Verify organization_id format (UUID)
4. Check Cognito Authorizer configuration

---

## Performance Optimization Tips

1. **Lambda Optimization**
   - Increase memory for faster execution
   - Use Lambda layers for dependencies
   - Implement connection pooling for RDS

2. **Database Optimization**
   - Add indexes on frequently queried columns
   - Use Prisma query optimization
   - Implement caching for read-heavy operations

3. **Frontend Optimization**
   - Use React Query for caching
   - Implement code splitting
   - Lazy load components
   - Use CloudFront caching

4. **API Optimization**
   - Implement request batching
   - Use pagination for large datasets
   - Add response compression
   - Implement rate limiting

---

## Security Best Practices

1. **Authentication**
   - Always validate JWT tokens
   - Use Cognito for user management
   - Implement MFA where possible

2. **Authorization**
   - Always check organization_id
   - Implement role-based access control
   - Validate permissions before operations

3. **Data Protection**
   - Encrypt data in transit (HTTPS)
   - Encrypt data at rest (RDS encryption)
   - Use VPC for network isolation

4. **API Security**
   - Implement CORS properly
   - Use CSRF protection
   - Validate all inputs
   - Implement rate limiting

---

**Last Updated**: 2024
**Version**: 1.0
