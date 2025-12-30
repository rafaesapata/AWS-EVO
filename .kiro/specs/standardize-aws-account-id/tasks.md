# Implementation Plan: Standardize AWS Account ID Fields

## Overview

This implementation plan migrates the inconsistent `account_id` fields to standardized `aws_account_id` (UUID) fields across all affected database tables. The migration will be done in phases to ensure backward compatibility and data integrity.

## Tasks

- [x] 1. Create database migration
  - [x] 1.1 Create Prisma migration file for schema changes
    - Add `aws_account_id` UUID column to `daily_costs`, `waste_detections`, `compliance_violations`, `iam_behavior_anomalies`
    - Rename `aws_credentials.account_id` to `aws_account_number`
    - _Requirements: 2.1, 3.1, 4.1, 5.1, 9.1_

  - [x] 1.2 Create data migration SQL script
    - Populate new `aws_account_id` columns by looking up UUIDs from `aws_accounts` table
    - Handle NULL values for unmappable accounts with logging
    - _Requirements: 2.2, 2.3, 3.2, 4.2, 5.2_

  - [x] 1.3 Update Prisma schema file
    - Change field definitions in affected models
    - Update field types from String to UUID where applicable
    - _Requirements: 6.1, 6.2_

- [x] 2. Checkpoint - Verify migration in development
  - Run migration locally and verify data integrity
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Update backend code
  - [x] 3.1 Update query-table.ts field mappings
    - Remove `aws_account_id` to `account_id` mappings for migrated tables
    - Keep only necessary mappings (e.g., `cost_date` to `date`)
    - _Requirements: 7.1_

  - [x] 3.2 Update any backend handlers using old field names
    - Search for `account_id` usage in handlers
    - Update to use `aws_account_id` or `aws_account_number` as appropriate
    - _Requirements: 7.3_

  - [ ]* 3.3 Write property test for UUID reference validity
    - **Property 1: UUID Reference Validity**
    - Verify all aws_account_id values exist in aws_accounts table
    - **Validates: Requirements 1.2, 2.2, 3.2, 4.2, 5.2**

- [x] 4. Update frontend code
  - [x] 4.1 Search and update frontend files using account_id
    - Update MonthlyInvoicesPage.tsx if needed
    - Update any other pages filtering by account
    - _Requirements: 7.2_

- [x] 5. Checkpoint - Verify full stack integration
  - Test all affected pages in the frontend
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Regenerate Prisma client and deploy
  - [x] 6.1 Regenerate Prisma client
    - Run `npx prisma generate`
    - Verify TypeScript types are correct
    - _Requirements: 6.3_

  - [x] 6.2 Build and deploy backend
    - Build backend with `npm run build --prefix backend`
    - Update Lambda layer if needed (version 21)
    - Deploy updated Lambda functions

  - [x] 6.3 Build and deploy frontend
    - Build frontend with `npm run build`
    - Deploy to S3 and invalidate CloudFront

- [x] 7. Run production migration
  - [x] 7.1 Backup production database
    - Create RDS snapshot before migration
    - Document rollback procedure

  - [x] 7.2 Execute Prisma migration on production
    - Run SQL migration via Lambda
    - Monitor for errors
    - _Requirements: 8.2, 8.3_

- [ ] 8. Final checkpoint - Production verification
  - Verify all affected pages work correctly
  - Monitor error logs for 24 hours
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 9. Write additional property tests
  - [ ]* 9.1 Write property test for data preservation
    - **Property 2: Data Preservation**
    - Verify row counts and non-account fields unchanged
    - **Validates: Requirements 2.4, 3.3, 4.3, 5.3**

  - [ ]* 9.2 Write property test for AWS account number format
    - **Property 3: AWS Account Number Format**
    - Verify aws_accounts.account_id matches 12-digit format
    - **Validates: Requirements 1.3**

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- The migration should be tested in staging before production
- Backup database before running production migration
