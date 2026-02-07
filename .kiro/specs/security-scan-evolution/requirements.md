# Requirements Document

## Introduction

This feature evolves the existing AWS security scanning system with four closely related improvements: incremental/delta scanning via finding fingerprinting, finding deduplication and lifecycle tracking, false positive management with suppression, and an improved security posture scoring algorithm. These changes transform the scan pipeline from a destructive delete-and-recreate model into a stateful, lifecycle-aware system that tracks findings over time.

## Glossary

- **Security_Engine**: The existing security scanning subsystem (`backend/src/lib/security-engine/`) that orchestrates 38 AWS service scanners and produces findings.
- **Finding**: A security issue detected by the Security_Engine, stored in the `findings` PostgreSQL table via Prisma.
- **Fingerprint**: A deterministic hash (SHA-256) derived from a finding's `resource_arn`, `scan_type`, and `title`, used to uniquely identify a finding across scans within an organization and account.
- **Scan_Handler**: The Lambda function (`security-scan.ts`) that invokes the Security_Engine and persists findings to the database.
- **Posture_Calculator**: The Lambda function (`get-security-posture.ts`) that computes the organization's security posture score.
- **Findings_API**: The Lambda function (`get-findings.ts`) that retrieves findings with filtering and pagination.
- **Suppression**: The act of marking a finding as a false positive or accepted risk, excluding it from the security posture score.
- **MTTR**: Mean Time To Remediate — the average duration between a finding's `first_seen` and `resolved_at` timestamps.
- **Finding_Lifecycle**: The state machine governing finding status transitions: `new → active → resolved → reopened`.

## Requirements

### Requirement 1: Finding Fingerprinting

**User Story:** As a security engineer, I want each finding to have a stable fingerprint, so that the system can identify the same finding across consecutive scans.

#### Acceptance Criteria

1. WHEN the Security_Engine produces a finding, THE Scan_Handler SHALL compute a Fingerprint by hashing the combination of `resource_arn`, `scan_type`, and `title` using SHA-256.
2. THE Finding model SHALL include a `fingerprint` field of type String that stores the computed hash.
3. WHEN a Fingerprint is computed, THE Scan_Handler SHALL produce the same Fingerprint value for identical `resource_arn`, `scan_type`, and `title` inputs regardless of scan timing or other finding fields.
4. THE Finding model SHALL enforce a unique constraint on the combination of `organization_id`, `aws_account_id`, and `fingerprint`.

### Requirement 2: Incremental Delta Scanning

**User Story:** As a security engineer, I want scans to update existing findings instead of deleting and recreating them, so that finding history and metadata are preserved across scans.

#### Acceptance Criteria

1. WHEN a scan produces findings, THE Scan_Handler SHALL use an upsert strategy keyed on Fingerprint instead of deleting all pending findings and recreating them.
2. WHEN a finding with a matching Fingerprint already exists in the database, THE Scan_Handler SHALL update the `last_seen` timestamp and increment the `occurrence_count` field.
3. WHEN a finding with a new Fingerprint is detected, THE Scan_Handler SHALL create a new Finding record with `first_seen` set to the current timestamp, `last_seen` set to the current timestamp, and `occurrence_count` set to 1.
4. WHEN a previously active finding is not present in the current scan results, THE Scan_Handler SHALL set the finding status to `resolved` and record the `resolved_at` timestamp.
5. THE Finding model SHALL include `first_seen`, `last_seen`, and `resolved_at` fields of type DateTime.
6. THE Finding model SHALL include an `occurrence_count` field of type Integer with a default value of 1.

### Requirement 3: Finding Lifecycle Management

**User Story:** As a security engineer, I want findings to follow a defined lifecycle, so that I can track how findings evolve over time and measure remediation effectiveness.

#### Acceptance Criteria

1. WHEN a finding is first detected, THE Scan_Handler SHALL set the finding status to `new`.
2. WHEN a finding with status `new` is detected again in a subsequent scan, THE Scan_Handler SHALL transition the finding status to `active`.
3. WHEN a finding with status `active` is not present in the current scan results, THE Scan_Handler SHALL transition the finding status to `resolved` and record the `resolved_at` timestamp.
4. WHEN a finding with status `resolved` is detected again in a subsequent scan, THE Scan_Handler SHALL transition the finding status to `reopened`, clear the `resolved_at` field, and update `last_seen`.
5. WHEN a finding with status `reopened` is detected again in a subsequent scan, THE Scan_Handler SHALL transition the finding status to `active`.
6. THE Findings_API SHALL accept a `status` filter parameter that supports values `new`, `active`, `resolved`, and `reopened`.

### Requirement 4: False Positive Suppression

**User Story:** As a security engineer, I want to suppress findings that are false positives or accepted risks, so that the security posture score reflects actionable findings only.

#### Acceptance Criteria

1. WHEN a user suppresses a finding, THE Findings_API SHALL set the `suppressed` field to true, record the `suppressed_by` user identifier, `suppressed_at` timestamp, and `suppression_reason` text.
2. WHEN a user suppresses a finding with an expiration date, THE Findings_API SHALL record the `suppression_expires_at` timestamp.
3. WHEN a suppression expiration date has passed, THE Scan_Handler SHALL clear the suppression fields and restore the finding to its previous lifecycle status.
4. WHEN a user unsuppresses a finding, THE Findings_API SHALL set the `suppressed` field to false and clear the `suppressed_by`, `suppressed_at`, `suppression_reason`, and `suppression_expires_at` fields.
5. THE Finding model SHALL include `suppressed` (Boolean, default false), `suppressed_by` (String, nullable), `suppressed_at` (DateTime, nullable), `suppression_reason` (String, nullable), and `suppression_expires_at` (DateTime, nullable) fields.
6. THE Findings_API SHALL accept a `suppressed` filter parameter to include or exclude suppressed findings from query results.

### Requirement 5: Improved Security Posture Scoring

**User Story:** As a security engineer, I want the security posture score to account for finding age, suppression status, service coverage, and trend direction, so that the score provides a more accurate representation of the organization's security health.

#### Acceptance Criteria

1. WHEN calculating the security posture score, THE Posture_Calculator SHALL exclude suppressed findings from the score computation.
2. WHEN calculating the security posture score, THE Posture_Calculator SHALL apply a time-exposure penalty that increases the weight of findings that have been open longer than 7 days, with critical findings receiving the highest penalty.
3. WHEN calculating the security posture score, THE Posture_Calculator SHALL compute a service coverage ratio as the number of services with at least one scan divided by the total number of scannable services (38).
4. WHEN calculating the security posture score, THE Posture_Calculator SHALL compute a trend direction by comparing the current finding counts by severity with the previous scan's finding counts.
5. THE Posture_Calculator SHALL return a response that includes the overall score, risk level, finding counts by severity, service coverage percentage, trend direction (improving, stable, or degrading), and a breakdown object containing the base score, time exposure penalty, and service coverage bonus.
6. WHEN the trend direction is `improving`, THE Posture_Calculator SHALL apply a bonus of up to 5 points to the overall score, and WHEN the trend direction is `degrading`, THE Posture_Calculator SHALL apply a penalty of up to 5 points.

### Requirement 6: Database Schema Migration

**User Story:** As a developer, I want the database schema to support all new fields, so that the system can persist fingerprints, lifecycle data, and suppression metadata.

#### Acceptance Criteria

1. THE Prisma schema SHALL include a migration that adds the `fingerprint`, `first_seen`, `last_seen`, `resolved_at`, `occurrence_count`, `suppressed`, `suppressed_by`, `suppressed_at`, `suppression_reason`, and `suppression_expires_at` fields to the Finding model.
2. THE migration SHALL add a unique index on `(organization_id, aws_account_id, fingerprint)` to the Finding model.
3. THE migration SHALL add an index on the `fingerprint` field to the Finding model.
4. THE migration SHALL add an index on the `suppressed` field to the Finding model.
5. THE migration SHALL set default values for existing records: `first_seen` and `last_seen` to `created_at`, `occurrence_count` to 1, and `suppressed` to false.
