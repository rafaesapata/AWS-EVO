# Requirements Document

## Introduction

This feature standardizes the AWS account reference fields across all database tables. Currently, the system has inconsistent usage where some tables use `account_id` (AWS account number as string) and others use `aws_account_id` (UUID reference to aws_accounts table). This creates confusion in the frontend and backend, requiring field mapping workarounds.

## Glossary

- **AWS_Account_Number**: The 12-digit AWS account identifier (e.g., "971354623291")
- **AWS_Account_UUID**: The internal UUID primary key from the `aws_accounts` table
- **Organization_ID**: The UUID identifying the tenant organization
- **Migration_Handler**: A Lambda function that performs database schema and data migrations
- **Query_Table_Lambda**: The generic Lambda handler that queries database tables with field mapping

## Requirements

### Requirement 1: Standardize Field Naming Convention

**User Story:** As a developer, I want consistent field naming across all tables, so that I don't need field mapping workarounds in the query layer.

#### Acceptance Criteria

1. THE Database_Schema SHALL use `aws_account_id` as the standard field name for AWS account references in all tables
2. WHEN a table references an AWS account, THE Database_Schema SHALL store the UUID from `aws_accounts.id`, not the 12-digit account number
3. THE `aws_accounts` table SHALL remain the single source of truth for AWS account information, with `account_id` field containing the 12-digit AWS account number

### Requirement 2: Migrate DailyCost Table

**User Story:** As a system administrator, I want the daily_costs table to use standardized field names, so that cost queries work consistently.

#### Acceptance Criteria

1. WHEN the migration runs, THE Migration_Handler SHALL rename `account_id` to `aws_account_id` in the `daily_costs` table
2. WHEN the migration runs, THE Migration_Handler SHALL convert existing string account IDs to UUID references by looking up the corresponding `aws_accounts.id`
3. IF an account_id value cannot be mapped to an existing aws_account, THEN THE Migration_Handler SHALL log a warning and set the field to NULL
4. THE Migration_Handler SHALL preserve all existing cost data during the migration

### Requirement 3: Migrate WasteDetection Table

**User Story:** As a system administrator, I want the waste_detections table to use standardized field names, so that waste detection queries work consistently.

#### Acceptance Criteria

1. WHEN the migration runs, THE Migration_Handler SHALL rename `account_id` to `aws_account_id` in the `waste_detections` table
2. WHEN the migration runs, THE Migration_Handler SHALL convert existing string account IDs to UUID references
3. THE Migration_Handler SHALL preserve all existing waste detection data during the migration

### Requirement 4: Migrate ComplianceViolation Table

**User Story:** As a system administrator, I want the compliance_violations table to use standardized field names, so that compliance queries work consistently.

#### Acceptance Criteria

1. WHEN the migration runs, THE Migration_Handler SHALL rename `account_id` to `aws_account_id` in the `compliance_violations` table
2. WHEN the migration runs, THE Migration_Handler SHALL convert existing string account IDs to UUID references
3. THE Migration_Handler SHALL preserve all existing compliance violation data during the migration

### Requirement 5: Migrate IAMBehaviorAnomaly Table

**User Story:** As a system administrator, I want the iam_behavior_anomalies table to use standardized field names, so that IAM anomaly queries work consistently.

#### Acceptance Criteria

1. WHEN the migration runs, THE Migration_Handler SHALL rename `account_id` to `aws_account_id` in the `iam_behavior_anomalies` table
2. WHEN the migration runs, THE Migration_Handler SHALL convert existing string account IDs to UUID references
3. THE Migration_Handler SHALL preserve all existing IAM behavior anomaly data during the migration

### Requirement 6: Update Prisma Schema

**User Story:** As a developer, I want the Prisma schema to reflect the standardized field names, so that TypeScript types are correct.

#### Acceptance Criteria

1. THE Prisma_Schema SHALL define `aws_account_id` as `String @db.Uuid` in all affected tables
2. THE Prisma_Schema SHALL remove the old `account_id` field definitions from affected tables
3. WHEN the schema is regenerated, THE Prisma_Client SHALL provide correct TypeScript types for all affected models

### Requirement 7: Remove Field Mapping Workarounds

**User Story:** As a developer, I want to remove field mapping workarounds from the query layer, so that the code is simpler and more maintainable.

#### Acceptance Criteria

1. WHEN the migration is complete, THE Query_Table_Lambda SHALL remove field mappings for `aws_account_id` to `account_id`
2. THE Frontend_Code SHALL use `aws_account_id` consistently in all API calls
3. THE Backend_Handlers SHALL use `aws_account_id` consistently in all database queries

### Requirement 8: Backward Compatibility During Migration

**User Story:** As a system administrator, I want the migration to be backward compatible, so that the system continues to work during the migration process.

#### Acceptance Criteria

1. WHILE the migration is in progress, THE Query_Table_Lambda SHALL support both old and new field names
2. WHEN the migration is complete, THE System SHALL log a confirmation message
3. IF the migration fails, THEN THE Migration_Handler SHALL rollback changes and log the error

### Requirement 9: Update AwsCredential Table

**User Story:** As a developer, I want the aws_credentials table to clearly distinguish between the AWS account number and internal references.

#### Acceptance Criteria

1. THE `aws_credentials.account_id` field SHALL be renamed to `aws_account_number` to clarify it stores the 12-digit AWS account ID
2. THE Prisma_Schema SHALL update the field name and any related code references
