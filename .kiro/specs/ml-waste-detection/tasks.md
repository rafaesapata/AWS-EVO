# ML-Powered Waste Detection 2.0 - Implementation Tasks

## Task Overview

| Phase | Task | Priority | Effort | Status |
|-------|------|----------|--------|--------|
| 1 | Database Schema Update | High | 2h | ✅ Complete |
| 2 | ML Analysis Library | High | 4h | ✅ Complete |
| 3 | Lambda Handler Refactor | High | 4h | ✅ Complete |
| 4 | Query Table Update | Medium | 1h | ✅ Complete |
| 5 | Frontend Updates | Medium | 2h | ✅ Complete |
| 6 | Testing & Deployment | High | 2h | ✅ Complete |

---

## Phase 1: Database Schema Update

### Task 1.1: Add ResourceUtilizationML Model to Prisma Schema

**File:** `backend/prisma/schema.prisma`

**Changes:**
```prisma
model ResourceUtilizationML {
  id                      String   @id @default(uuid()) @db.Uuid
  organization_id         String   @db.Uuid
  aws_account_id          String   @db.Uuid
  resource_id             String
  resource_name           String?
  resource_type           String
  region                  String
  
  current_size            String?
  current_monthly_cost    Float?
  
  recommendation_type     String?
  recommended_size        String?
  potential_monthly_savings Float?
  ml_confidence           Float?
  
  utilization_patterns    Json?
  auto_scaling_eligible   Boolean  @default(false)
  auto_scaling_config     Json?
  
  implementation_complexity String?
  analyzed_at             DateTime @default(now()) @db.Timestamptz(6)
  created_at              DateTime @default(now()) @db.Timestamptz(6)
  updated_at              DateTime @updatedAt @db.Timestamptz(6)
  
  @@unique([organization_id, aws_account_id, resource_id])
  @@index([organization_id])
  @@index([aws_account_id])
  @@index([recommendation_type])
  @@map("resource_utilization_ml")
}
```

**Acceptance Criteria:**
- [ ] Model added to schema.prisma
- [ ] Prisma client generated successfully
- [ ] Migration created and applied

---

### Task 1.2: Run Database Migration

**Commands:**
```bash
cd backend
npx prisma generate
npx prisma migrate dev --name add_resource_utilization_ml
```

**Or via run-migrations Lambda:**
```bash
aws lambda invoke --function-name evo-uds-v3-production-run-migrations \
  --payload '{}' --cli-binary-format raw-in-base64-out /dev/stdout
```

**Acceptance Criteria:**
- [ ] Table `resource_utilization_ml` created in PostgreSQL
- [ ] Indexes created
- [ ] Unique constraint working

---

## Phase 2: ML Analysis Library

### Task 2.1: Create Waste Analyzer Module

**File:** `backend/src/lib/ml-analysis/waste-analyzer.ts`

**Implementation:**
```typescript
export interface UtilizationMetrics {
  avgCpu: number;
  maxCpu: number;
  minCpu: number;
  stdDevCpu: number;
  avgMemory: number;
  peakHours: number[];
  weekdayPattern: number[];
  dataCompleteness: number;
}

export interface MLRecommendation {
  type: 'terminate' | 'downsize' | 'auto-scale' | 'optimize';
  confidence: number;
  recommendedSize?: string;
  savings: number;
  autoScalingConfig?: AutoScalingConfig;
  complexity: 'low' | 'medium' | 'high';
}

export function analyzeUtilization(metrics: any[]): UtilizationMetrics;
export function classifyWaste(metrics: UtilizationMetrics, resourceType: string, currentSize: string): MLRecommendation;
export function calculateAutoScalingConfig(metrics: UtilizationMetrics): AutoScalingConfig;
```

**Acceptance Criteria:**
- [ ] Statistical functions implemented (mean, stdDev, etc.)
- [ ] Pattern analysis working (peak hours, weekday patterns)
- [ ] Classification rules implemented
- [ ] Confidence calculation working
- [ ] Auto-scaling config generation working

---

### Task 2.2: Create Pricing Module

**File:** `backend/src/lib/cost/pricing.ts`

**Implementation:**
```typescript
export const EC2_PRICING: Record<string, number>;
export const RDS_PRICING: Record<string, number>;
export const LAMBDA_PRICING: { requestCost: number; durationCost: number };

export function getHourlyCost(resourceType: string, size: string): number;
export function getMonthlyCost(resourceType: string, size: string): number;
export function getDownsizeRecommendation(resourceType: string, currentSize: string, maxUtilization: number): string;
```

**Acceptance Criteria:**
- [ ] EC2 pricing table complete (t3, m5, c5, r5 families)
- [ ] RDS pricing table complete
- [ ] Lambda pricing implemented
- [ ] Downsize mapping working

---

## Phase 3: Lambda Handler Refactor

### Task 3.1: Refactor ml-waste-detection.ts

**File:** `backend/src/handlers/cost/ml-waste-detection.ts`

**Changes:**
1. Import new ML analysis modules
2. Add multi-resource type support (EC2, RDS, Lambda)
3. Collect 7-day CloudWatch metrics
4. Apply ML classification
5. Save to `resource_utilization_ml` table
6. Return structured response

**Key Functions:**
```typescript
async function analyzeEC2Instances(account, region): Promise<MLResult[]>;
async function analyzeRDSInstances(account, region): Promise<MLResult[]>;
async function analyzeLambdaFunctions(account, region): Promise<MLResult[]>;
async function saveRecommendations(orgId, accountId, recommendations): Promise<void>;
```

**Acceptance Criteria:**
- [ ] EC2 analysis working with real CloudWatch data
- [ ] RDS analysis working
- [ ] Lambda analysis working
- [ ] Results saved to database
- [ ] Response matches frontend expectations
- [ ] Execution time < 25 seconds

---

### Task 3.2: Update Lambda Deployment Package

**Commands:**
```bash
cd backend
npm run build

# Create deployment package
rm -rf /tmp/ml-waste-detection-deploy
mkdir -p /tmp/ml-waste-detection-deploy
cp -r dist/handlers /tmp/ml-waste-detection-deploy/
cp -r dist/lib /tmp/ml-waste-detection-deploy/
cp -r node_modules/uuid /tmp/ml-waste-detection-deploy/node_modules/

cd /tmp/ml-waste-detection-deploy
zip -r /tmp/ml-waste-detection.zip .

# Deploy
aws lambda update-function-code \
  --function-name evo-uds-v3-production-ml-waste-detection \
  --zip-file fileb:///tmp/ml-waste-detection.zip \
  --region us-east-1
```

**Acceptance Criteria:**
- [ ] Lambda deployed successfully
- [ ] No module not found errors
- [ ] Handler path correct

---

## Phase 4: Query Table Update

### Task 4.1: Add Table Mapping

**File:** `backend/src/handlers/data/query-table.ts`

**Changes:**
```typescript
const TABLE_MAPPINGS: Record<string, string> = {
  // ... existing
  'resource_utilization_ml': 'resourceUtilizationML',
};

// Add case in switch
case 'resourceUtilizationML':
  data = await prisma.resourceUtilizationML.findMany({
    where: buildWhereClause(eq, organizationId),
    orderBy: buildOrderBy(order),
    take: limit,
    skip: offset,
  });
  break;
```

**Acceptance Criteria:**
- [ ] Table mapping added
- [ ] Query working via API
- [ ] Organization isolation enforced

---

### Task 4.2: Deploy Query Table Lambda

**Commands:**
```bash
cd backend && npm run build

rm -rf /tmp/query-table-deploy
mkdir -p /tmp/query-table-deploy
cp -r dist/handlers /tmp/query-table-deploy/
cp -r dist/lib /tmp/query-table-deploy/
cp -r node_modules/uuid /tmp/query-table-deploy/node_modules/

cd /tmp/query-table-deploy
zip -r /tmp/query-table.zip .

aws lambda update-function-code \
  --function-name evo-uds-v3-production-query-table \
  --zip-file fileb:///tmp/query-table.zip \
  --region us-east-1
```

---

## Phase 5: Frontend Updates

### Task 5.1: Update MLWasteDetection Page Query

**File:** `src/pages/MLWasteDetection.tsx`

**Changes:**
- Query `resource_utilization_ml` table (already correct)
- Ensure field names match database schema
- Add loading states
- Add error handling

**Acceptance Criteria:**
- [ ] Data loads from correct table
- [ ] All fields displayed correctly
- [ ] Loading state shown
- [ ] Errors handled gracefully

---

### Task 5.2: Deploy Frontend

**Commands:**
```bash
npm run build
aws s3 sync dist/ s3://evo-uds-v3-sandbox-frontend-971354623291 --delete
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"
```

---

## Phase 6: Testing & Deployment

### Task 6.1: Integration Testing

**Test Cases:**
1. Run ML analysis on account with EC2 instances
2. Verify recommendations saved to database
3. Verify frontend displays recommendations
4. Verify cost calculations are accurate
5. Verify confidence scores are reasonable

**Commands:**
```bash
# Test via API
curl -X POST https://api-evo.nuevacore.com/api/functions/ml-waste-detection \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"accountId": "uuid-here"}'

# Check database
aws lambda invoke --function-name evo-uds-v3-production-query-table \
  --payload '{"table":"resource_utilization_ml","limit":10}' \
  --cli-binary-format raw-in-base64-out /dev/stdout
```

---

### Task 6.2: Update Prisma Layer (if needed)

**Commands:**
```bash
cd backend
npm run prisma:generate

rm -rf /tmp/lambda-layer-prisma
mkdir -p /tmp/lambda-layer-prisma/nodejs/node_modules
cp -r node_modules/@prisma /tmp/lambda-layer-prisma/nodejs/node_modules/
cp -r node_modules/.prisma /tmp/lambda-layer-prisma/nodejs/node_modules/
cp -r node_modules/zod /tmp/lambda-layer-prisma/nodejs/node_modules/

# Remove unnecessary binaries
rm -f /tmp/lambda-layer-prisma/nodejs/node_modules/.prisma/client/libquery_engine-darwin-arm64.dylib.node
rm -rf /tmp/lambda-layer-prisma/nodejs/node_modules/.prisma/client/deno

cd /tmp/lambda-layer-prisma
zip -r /tmp/prisma-layer.zip nodejs

aws lambda publish-layer-version \
  --layer-name evo-prisma-deps-layer \
  --zip-file fileb:///tmp/prisma-layer.zip \
  --compatible-runtimes nodejs18.x nodejs20.x \
  --region us-east-1

# Update Lambdas with new layer
LAYER_ARN="arn:aws:lambda:us-east-1:971354623291:layer:evo-prisma-deps-layer:92"
aws lambda update-function-configuration \
  --function-name evo-uds-v3-sandbox-ml-waste-detection \
  --layers "$LAYER_ARN" \
  --region us-east-1
```

---

## Verification Checklist

- [ ] Database table created
- [ ] ML analysis Lambda deployed
- [ ] Query table Lambda updated
- [ ] Frontend deployed
- [ ] End-to-end test passing
- [ ] Cost calculations accurate
- [ ] Performance < 25 seconds
- [ ] No errors in CloudWatch logs

---

## Rollback Plan

If issues occur:

1. **Database:** Table can be dropped without affecting other features
2. **Lambda:** Revert to previous version using AWS Lambda versions
3. **Frontend:** Redeploy previous build from git

```bash
# Rollback Lambda
aws lambda update-function-code \
  --function-name evo-uds-v3-production-ml-waste-detection \
  --s3-bucket evo-uds-v3-production-deployments \
  --s3-key lambda/ml-waste-detection-backup.zip

# Rollback Frontend
git checkout HEAD~1 -- dist/
aws s3 sync dist/ s3://evo-uds-v3-sandbox-frontend-971354623291 --delete
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"
```
