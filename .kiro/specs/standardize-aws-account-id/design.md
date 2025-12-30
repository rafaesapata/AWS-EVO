# Design Document: Standardize AWS Account ID Fields

## Overview

This design document describes the migration strategy to standardize AWS account reference fields across all database tables. The current system has inconsistent field naming where some tables use `account_id` (storing AWS account numbers as strings) while others use `aws_account_id` (storing UUIDs referencing the `aws_accounts` table). This inconsistency requires field mapping workarounds in the query layer and causes confusion in the codebase.

The migration will:
1. Rename `account_id` to `aws_account_id` in affected tables
2. Convert string account numbers to UUID references
3. Update the Prisma schema and regenerate the client
4. Remove field mapping workarounds from the query layer
5. Update frontend and backend code to use consistent field names

## Architecture

### Current State

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                  │
│  Uses aws_account_id in API calls                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Query Table Lambda                            │
│  FIELD_MAPPING: { 'daily_costs': { 'aws_account_id': 'account_id' } }  │
│  Translates aws_account_id → account_id for some tables         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL (RDS)                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  daily_costs    │  │ waste_detections│  │    findings     │  │
│  │  account_id ❌  │  │  account_id ❌  │  │ aws_account_id ✓│  │
│  │  (String)       │  │  (String)       │  │  (UUID)         │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Target State

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                  │
│  Uses aws_account_id in API calls (no change)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Query Table Lambda                            │
│  No field mapping needed - direct pass-through                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL (RDS)                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  daily_costs    │  │ waste_detections│  │    findings     │  │
│  │ aws_account_id ✓│  │ aws_account_id ✓│  │ aws_account_id ✓│  │
│  │  (UUID)         │  │  (UUID)         │  │  (UUID)         │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Prisma Migration

A new Prisma migration will be created to:
- Add new `aws_account_id` column (UUID) to affected tables
- Populate the new column by looking up UUIDs from `aws_accounts` table
- Drop the old `account_id` column
- Rename `aws_credentials.account_id` to `aws_account_number` for clarity

```sql
-- Migration: standardize_aws_account_id

-- Step 1: Add new aws_account_id column to daily_costs
ALTER TABLE daily_costs ADD COLUMN aws_account_id_new UUID;

-- Step 2: Populate from aws_accounts lookup
UPDATE daily_costs dc
SET aws_account_id_new = aa.id
FROM aws_accounts aa
WHERE dc.account_id = aa.account_id
  AND dc.organization_id = aa.organization_id;

-- Step 3: Drop old column and rename new
ALTER TABLE daily_costs DROP COLUMN account_id;
ALTER TABLE daily_costs RENAME COLUMN aws_account_id_new TO aws_account_id;

-- Repeat for other tables...
```

### 2. Affected Tables

| Table | Current Field | New Field | Data Type Change |
|-------|---------------|-----------|------------------|
| `daily_costs` | `account_id` (String) | `aws_account_id` (UUID) | String → UUID |
| `waste_detections` | `account_id` (String) | `aws_account_id` (UUID) | String → UUID |
| `compliance_violations` | `account_id` (String) | `aws_account_id` (UUID) | String → UUID |
| `iam_behavior_anomalies` | `account_id` (String) | `aws_account_id` (UUID) | String → UUID |
| `aws_credentials` | `account_id` (String) | `aws_account_number` (String) | Rename only |

### 3. Query Table Lambda Updates

After migration, remove field mappings from `FIELD_MAPPING` object:

```typescript
// BEFORE
const FIELD_MAPPING: Record<string, Record<string, string | null>> = {
  'daily_costs': { 'aws_account_id': 'account_id', 'cost_date': 'date' },
  'waste_detections': { 'aws_account_id': 'account_id' },
  'compliance_violations': { 'aws_account_id': 'account_id' },
  'iam_behavior_anomalies': { 'aws_account_id': 'account_id' },
  // ...
};

// AFTER
const FIELD_MAPPING: Record<string, Record<string, string | null>> = {
  'daily_costs': { 'cost_date': 'date' },  // Only date mapping remains
  // aws_account_id mappings removed
};
```

### 4. Frontend Updates

Update any frontend code that directly references `account_id` to use `aws_account_id`:

- `src/pages/MonthlyInvoicesPage.tsx` - Already uses `account_id` filter (mapped by backend)
- Other pages using cost/waste/compliance data

## Data Models

### aws_accounts (Reference Table - No Change)

```prisma
model AwsAccount {
  id                String   @id @default(uuid()) @db.Uuid
  organization_id   String   @db.Uuid
  account_id        String   // 12-digit AWS account number (e.g., "383234048592")
  account_name      String
  // ...
}
```

### daily_costs (After Migration)

```prisma
model DailyCost {
  id              String   @id @default(uuid()) @db.Uuid
  organization_id String?  @db.Uuid
  aws_account_id  String?  @db.Uuid  // UUID reference to aws_accounts.id
  date            DateTime @db.Date
  service         String?
  cost            Float    @default(0)
  // ...
}
```

### waste_detections (After Migration)

```prisma
model WasteDetection {
  id                      String   @id @default(uuid()) @db.Uuid
  organization_id         String   @db.Uuid
  aws_account_id          String   @db.Uuid  // UUID reference to aws_accounts.id
  resource_id             String
  // ...
}
```

### compliance_violations (After Migration)

```prisma
model ComplianceViolation {
  id                String   @id @default(uuid()) @db.Uuid
  organization_id   String   @db.Uuid
  aws_account_id    String   @db.Uuid  // UUID reference to aws_accounts.id
  framework         String
  // ...
}
```

### iam_behavior_anomalies (After Migration)

```prisma
model IAMBehaviorAnomaly {
  id              String   @id @default(uuid()) @db.Uuid
  organization_id String   @db.Uuid
  aws_account_id  String   @db.Uuid  // UUID reference to aws_accounts.id
  user_name       String
  // ...
}
```

### aws_credentials (After Migration)

```prisma
model AwsCredential {
  id                    String   @id @default(uuid()) @db.Uuid
  organization_id       String   @db.Uuid
  aws_account_number    String?  // Renamed from account_id for clarity
  account_name          String?
  // ...
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: UUID Reference Validity

*For any* record in `daily_costs`, `waste_detections`, `compliance_violations`, or `iam_behavior_anomalies` with a non-null `aws_account_id`, that UUID must exist in the `aws_accounts` table with matching `organization_id`.

**Validates: Requirements 1.2, 2.2, 3.2, 4.2, 5.2**

### Property 2: Data Preservation

*For any* table being migrated, the total row count and all non-account-id fields must remain unchanged after migration.

**Validates: Requirements 2.4, 3.3, 4.3, 5.3**

### Property 3: AWS Account Number Format

*For any* record in `aws_accounts`, the `account_id` field must be a 12-digit numeric string.

**Validates: Requirements 1.3**

### Property 4: Schema Consistency

*For any* table that references AWS accounts (except `aws_accounts` and `aws_credentials`), the field name must be `aws_account_id` with type UUID.

**Validates: Requirements 1.1, 6.1**

## Error Handling

### Migration Errors

1. **Unmappable Account IDs**: If an `account_id` value cannot be found in `aws_accounts`:
   - Set `aws_account_id` to NULL
   - Log warning with table name, record ID, and unmapped value
   - Continue migration (don't fail)

2. **Database Connection Errors**: 
   - Prisma migration will automatically rollback on failure
   - Log error details for debugging

3. **Constraint Violations**:
   - If foreign key constraints fail, log the specific records
   - Migration should be run in a transaction

### Runtime Errors

1. **Invalid UUID in Query**:
   - Return empty result set (graceful degradation)
   - Log warning for debugging

2. **Missing aws_account_id**:
   - Allow NULL values (some historical data may not have account references)
   - Filter queries should handle NULL gracefully

## Testing Strategy

### Unit Tests

1. **Migration Script Tests**:
   - Test UUID lookup logic with known account mappings
   - Test NULL handling for unmappable accounts
   - Test data preservation (row counts, field values)

2. **Query Table Lambda Tests**:
   - Test that aws_account_id filter works correctly after migration
   - Test backward compatibility during migration window

### Property-Based Tests

Property-based testing validates universal properties across many generated inputs. Each property test should run minimum 100 iterations.

1. **Property 1 Test: UUID Reference Validity**
   - Generate random queries to affected tables
   - Verify all returned aws_account_id values exist in aws_accounts
   - **Feature: standardize-aws-account-id, Property 1: UUID Reference Validity**

2. **Property 2 Test: Data Preservation**
   - Compare row counts before and after migration
   - Verify non-account fields are unchanged
   - **Feature: standardize-aws-account-id, Property 2: Data Preservation**

3. **Property 3 Test: AWS Account Number Format**
   - Query all aws_accounts records
   - Verify account_id matches regex `^\d{12}$`
   - **Feature: standardize-aws-account-id, Property 3: AWS Account Number Format**

### Integration Tests

1. **End-to-End Query Test**:
   - Create test data with known account mappings
   - Query through API with aws_account_id filter
   - Verify correct results returned

2. **Frontend Integration Test**:
   - Test MonthlyInvoicesPage with account filter
   - Test WasteDetectionPage with account filter
   - Verify data displays correctly

### Migration Verification Checklist

- [ ] Backup database before migration
- [ ] Run migration in staging environment first
- [ ] Verify row counts match before/after
- [ ] Verify no orphaned records (aws_account_id pointing to non-existent accounts)
- [ ] Test all affected pages in frontend
- [ ] Monitor error logs for 24 hours after production migration
