# Implementation Plan: Security Scan Evolution

## Overview

Incremental implementation of finding fingerprinting, delta scanning, lifecycle management, false positive suppression, and improved posture scoring. Each task builds on the previous, with property tests validating correctness at each stage.

## Tasks

- [x] 1. Database schema migration and fingerprint utility
  - [x] 1.1 Update Prisma schema with new Finding fields
    - Add `fingerprint`, `first_seen`, `last_seen`, `resolved_at`, `occurrence_count`, `suppressed`, `suppressed_by`, `suppressed_at`, `suppression_reason`, `suppression_expires_at` fields to the Finding model
    - Add unique constraint `@@unique([organization_id, aws_account_id, fingerprint])` and indexes on `fingerprint`, `suppressed`, `first_seen`, `last_seen`
    - Generate Prisma migration with `npx prisma migrate dev --name add-finding-evolution-fields`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 1.2, 1.4, 2.5, 2.6, 4.5_

  - [x] 1.2 Create fingerprint utility module
    - Create `backend/src/lib/security-engine/fingerprint.ts` with `computeFingerprint(resourceArn, scanType, title)` function
    - Uses SHA-256 hash of pipe-delimited concatenation, returns 64-char hex string
    - _Requirements: 1.1, 1.3_

  - [ ]* 1.3 Write property tests for fingerprint (Properties 1)
    - **Property 1: Fingerprint determinism and format**
    - Test with fast-check: for any strings, output is deterministic 64-char hex
    - **Validates: Requirements 1.1, 1.3**

- [x] 2. Checkpoint - Verify schema migration and fingerprint utility
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Delta sync logic and lifecycle management
  - [x] 3.1 Implement delta sync in security-scan.ts
    - Replace the `deleteMany` + `createMany` block with fingerprint-based upsert logic
    - Compute fingerprints for all scan findings, fetch existing fingerprints for org+account
    - Upsert: new findings get `status=new, first_seen=now, last_seen=now, occurrence_count=1`
    - Existing findings: update `last_seen`, increment `occurrence_count`, apply lifecycle transitions
    - Missing findings: transition `new/active/reopened` → `resolved`, set `resolved_at`
    - Handle expired suppressions: clear suppression fields where `suppression_expires_at < now`
    - Wrap in Prisma transaction for atomicity
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.3_

  - [x] 3.2 Extract delta sync logic into testable pure functions
    - Create `backend/src/lib/security-engine/delta-sync.ts` with functions:
      - `classifyFindings(newFingerprints, existingFindings)` → returns `{ toCreate, toUpdate, toResolve }`
      - `computeLifecycleTransition(currentStatus, isPresent)` → returns new status
    - Import and use these from `security-scan.ts`
    - _Requirements: 2.1, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 3.3 Write property tests for delta sync (Properties 2-6)
    - **Property 2: New finding initialization** — for any new fingerprint, created record has status=new, first_seen=last_seen, occurrence_count=1
    - **Validates: Requirements 2.3, 3.1**
    - **Property 3: Existing finding update on re-detection** — occurrence_count increments by 1, first_seen preserved
    - **Validates: Requirements 2.2**
    - **Property 4: Finding resolution on absence** — missing findings transition to resolved with resolved_at set
    - **Validates: Requirements 2.4, 3.3**
    - **Property 5: Lifecycle forward transitions** — new/reopened + seen again → active
    - **Validates: Requirements 3.2, 3.5**
    - **Property 6: Reopening resolved findings** — resolved + seen again → reopened, resolved_at cleared
    - **Validates: Requirements 3.4**

- [x] 4. Checkpoint - Verify delta sync and lifecycle
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. False positive suppression
  - [x] 5.1 Add suppress/unsuppress actions to get-findings.ts
    - Add action routing: if request body contains `action: 'suppress'` or `action: 'unsuppress'`, handle accordingly
    - Suppress: set `suppressed=true`, `suppressed_by`, `suppressed_at`, `suppression_reason`, optional `suppression_expires_at`
    - Unsuppress: set `suppressed=false`, clear all suppression fields
    - Add `suppressed` filter parameter to the existing query logic
    - Add audit logging for suppress/unsuppress actions
    - _Requirements: 4.1, 4.2, 4.4, 4.6_

  - [x] 5.2 Update status filter to support new lifecycle statuses
    - Update the `where` clause builder to support `new`, `active`, `resolved`, `reopened` status values
    - _Requirements: 3.6_

  - [ ]* 5.3 Write property tests for suppression (Properties 7-8, 14)
    - **Property 7: Suppress/unsuppress round trip** — suppress then unsuppress restores original state
    - **Validates: Requirements 4.1, 4.4**
    - **Property 8: Expired suppression clearance** — expired suppressions are cleared on next scan
    - **Validates: Requirements 4.3**
    - **Property 14: Filtering correctness** — status and suppressed filters return only matching findings
    - **Validates: Requirements 3.6, 4.6**

- [x] 6. Checkpoint - Verify suppression logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Improved security posture scoring
  - [x] 7.1 Extract scoring logic into a testable module
    - Create `backend/src/lib/security-engine/posture-scoring.ts` with pure functions:
      - `calculateBaseScore(findings)` — severity-weighted penalty
      - `calculateTimeExposurePenalty(findings, now)` — age-based penalty for critical/high/medium
      - `calculateServiceCoverageBonus(scannedServices, totalServices)` — coverage ratio * 10
      - `calculateTrendAdjustment(currentCounts, previousCounts)` — returns { direction, adjustment }
      - `calculatePostureScore(params)` — combines all components, clamps to [0, 100]
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 7.2 Update get-security-posture.ts to use new scoring module
    - Replace the simplistic `weightedScore` formula with `calculatePostureScore`
    - Exclude suppressed findings from all calculations
    - Fetch previous scan data for trend calculation
    - Compute service coverage from distinct services in findings
    - Return the new response shape with `breakdown`, `trend`, `serviceCoverage`, and `suppressed` count
    - Preserve demo mode behavior unchanged
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 7.3 Write property tests for posture scoring (Properties 9-13)
    - **Property 9: Suppressed findings excluded from score** — adding suppressed findings does not change score
    - **Validates: Requirements 5.1**
    - **Property 10: Time exposure penalty monotonicity** — older findings produce lower or equal scores
    - **Validates: Requirements 5.2**
    - **Property 11: Trend direction correctness** — direction matches comparison of current vs previous totals
    - **Validates: Requirements 5.4**
    - **Property 12: Trend adjustment bounds** — adjustment is in [-5, 5], sign matches direction
    - **Validates: Requirements 5.6**
    - **Property 13: Score bounds invariant** — final score always in [0, 100]
    - **Validates: Requirements 5.5**

- [x] 8. Migration backfill and final integration
  - [x] 8.1 Add data backfill to migration
    - Write a SQL migration step that sets `first_seen = created_at`, `last_seen = created_at`, `occurrence_count = 1`, `suppressed = false` for all existing Finding records where these fields are null
    - _Requirements: 6.5_

  - [x] 8.2 Update Finding type in security-engine types.ts
    - Add `fingerprint`, `occurrence_count`, `suppressed`, `resolved_at` to the `Finding` interface
    - Ensure BaseScanner's `createFinding` does not set fingerprint (it's computed in the handler)
    - _Requirements: 1.2, 2.5, 2.6, 4.5_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The delta sync logic is extracted into pure functions to enable property testing without database dependencies
- The posture scoring is extracted into pure functions for the same reason
