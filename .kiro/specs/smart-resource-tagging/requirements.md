# Requirements Document — v2.0

## Smart Resource Tagging System — EVO Platform

**Version:** 2.0.0 · **Status:** RFC · **Classification:** Internal Engineering
Previous version issues resolved: 25 (see Changelog at end)

## Introduction

Smart Resource Tagging is a local tagging system for the EVO Platform that enables organizations to classify, search, and report on any cloud resource tracked by the platform. Tags are stored exclusively in the EVO database (PostgreSQL) — no write-back to AWS or Azure. The system supports bulk operations, smart suggestions, cost-center reports, security-findings filtering, and multi-cloud compatibility (AWS + Azure).

## Glossary

| Term | Definition |
|------|-----------|
| **Tag_Service** | Backend service responsible for CRUD on tag definitions, smart suggestions, and template management. |
| **Tag_Assignment_Service** | Backend service responsible for associating and disassociating tags with cloud resources, including bulk operations. |
| **Report_Service** | Backend service responsible for generating cost, security, and inventory reports filtered or grouped by tags. |
| **Tag_Manager_UI** | Frontend page for managing tag definitions (library), coverage metrics, reports, and settings. |
| **Tag_Selector_UI** | Frontend combobox for selecting and assigning tags to a single resource. |
| **Bulk_Tagging_UI** | Frontend 3-step drawer/wizard for applying tags to multiple resources simultaneously. |
| **Tag_Filter_Bar_UI** | Frontend component for filtering resource lists and reports by tags. |
| **Resource** | Any cloud entity tracked by the EVO Platform (EC2, S3, Lambda, RDS, VPC, IAM, EKS, AKS, Azure VMs, Azure Storage, Azure Functions, etc.) sourced from the `ResourceInventory` table. |
| **Organization** | A tenant in the EVO Platform; all data is isolated by `organization_id`. |
| **Tag_Key** | Lowercase kebab-case identifier (1–64 chars, `/^[a-z0-9\-_]+$/`). Normalized to lowercase before storage. |
| **Tag_Value** | The value associated with a tag key (1–128 chars, alphanumeric with spaces, hyphens, underscores, dots). Normalized to lowercase before storage. |
| **Tag_Category** | One of: `COST_CENTER`, `ENVIRONMENT`, `TEAM`, `PROJECT`, `COMPLIANCE`, `CRITICALITY`, `CUSTOM`. |
| **EVO Local Tag** | A tag managed exclusively within the EVO database, never replicated to AWS or Azure. |
| **Native Cloud Tag** | A tag existing natively in AWS (Resource Tags) or Azure (Azure Tags), imported as read-only metadata. |
| **Bulk_Operation** | An operation applying or removing tags on up to 1,000 resources in a single API request. |
| **Tag_Coverage** | Percentage of tracked resources in an organization that have at least one EVO Local Tag assigned. |
| **Untagged_Resource** | A resource in `ResourceInventory` with no `ResourceTagAssignment` records. |
| **Partial_Success** | A response mode where some items in a batch operation succeed and others fail, returning a summary of both. |

## Out of Scope — v1

The following capabilities are explicitly excluded from this version to maintain focus:

- Write-back of EVO Local Tags to AWS Resource Tags or Azure Tags
- Hierarchical tags (parent/child relationships)
- Tag policies and enforcement rules
- Tag budget alerts and cost thresholds per tag
- Bulk import of tags via CSV file
- OR-logic filtering across multiple selected tags (v1 uses AND-only)
- Tag governance workflows (approval flows for tag creation)

## Requirements

### Requirement 1: Create Tag

**User Story:** As an editor, I want to create a tag definition with a key, value, color, category, and optional description, so that I can classify resources consistently.

#### Acceptance Criteria

1. WHEN an editor submits a valid tag key, value, color, category, and optional description, THE Tag_Service SHALL create a new tag definition and return the created tag with its generated UUID, normalized key, normalized value, and `created_at` timestamp.
2. THE Tag_Service SHALL normalize the tag key by converting to lowercase and trimming whitespace before validation and storage.
3. THE Tag_Service SHALL validate that the normalized tag key matches `/^[a-z0-9\-_]+$/` and is between 1 and 64 characters; otherwise return a 422 Unprocessable Entity with a field-level error message.
4. THE Tag_Service SHALL normalize the tag value by converting to lowercase and trimming whitespace before validation and storage.
5. THE Tag_Service SHALL validate that the normalized tag value is between 1 and 128 characters and contains only alphanumeric characters, spaces, hyphens, underscores, or dots; otherwise return a 422 with a field-level error message.
6. THE Tag_Service SHALL validate that the color is one of the 12 predefined hex values defined in the design system; otherwise return a 422 with the list of valid values.
7. THE Tag_Service SHALL validate that the category is a valid Tag_Category enum value; if omitted, it SHALL default to `CUSTOM`.
8. THE Tag_Service SHALL accept an optional description field of up to 256 characters; descriptions exceeding 256 characters SHALL be rejected with a 422 error.
9. IF the combination of organization_id + normalized_key + normalized_value already exists, THEN THE Tag_Service SHALL return a 409 Conflict with a descriptive message identifying the duplicate.
10. IF the organization already has 500 tag definitions, THEN THE Tag_Service SHALL return a 422 error indicating the tag limit; the limit SHALL be included in the error payload.
11. THE Tag_Service SHALL associate every tag with the requesting user's organization_id extracted from the JWT; tags SHALL never be created across organization boundaries.
12. THE Tag_Service SHALL record an audit log entry (`TAG_CREATED`) with user ID, organization ID, tag ID, key, value, and timestamp.

### Requirement 2: List Organization Tags

**User Story:** As a viewer, I want to list all tags in my organization with usage counts, so that I can see available classifications.

#### Acceptance Criteria

1. WHEN a user requests the tag list, THE Tag_Service SHALL return all tag definitions belonging to the user's organization, including: id, key, value, color, category, description, usage_count, created_at, updated_at.
2. THE Tag_Service SHALL support optional filtering by `category` (exact match), `key` (prefix match), and `search` (substring match across key and value combined).
3. THE Tag_Service SHALL support cursor-based pagination via `limit` (1–100, default 50) and `cursor` (last returned ID) parameters.
4. THE Tag_Service SHALL include a `usage_count` (number of ResourceTagAssignment records) for each tag. This value SHALL be served from cache (Redis TTL: 5 minutes) to avoid expensive COUNT queries on every request.
5. THE Tag_Service SHALL filter results exclusively by the requesting user's organization_id.
6. THE Tag_Service SHALL support `sort_by` parameter: `usage_count` (desc), `key` (asc), `created_at` (desc). Default: `created_at` desc.

### Requirement 3: Get Tag Details

**User Story:** As a viewer, I want detailed information about a specific tag including its usage breakdown, so that I can understand how it is applied across resources.

#### Acceptance Criteria

1. WHEN a user requests a tag by ID, THE Tag_Service SHALL return the full tag definition and usage statistics: total assignment count, breakdown by resource type (top 10), and breakdown by cloud provider.
2. IF the requested tag does not exist or belongs to a different organization, THEN THE Tag_Service SHALL return a 404 Not Found; the error response SHALL NOT reveal whether the tag exists in another organization.
3. THE Tag_Service SHALL filter the tag lookup exclusively by the requesting user's organization_id.

### Requirement 4: Update Tag

**User Story:** As an editor, I want to update a tag's color, category, or description, so that I can keep tag definitions accurate.

#### Acceptance Criteria

1. WHEN an editor submits updated fields for a tag, THE Tag_Service SHALL apply the updates using the same normalization and validation rules as tag creation (R1 ACs 2–8), and return the full updated tag.
2. THE Tag_Service SHALL permit updating: color, category, description. The key and value fields SHALL be immutable after creation.
3. IF the tag does not exist or belongs to a different organization, THEN THE Tag_Service SHALL return a 404 Not Found.
4. THE Tag_Service SHALL record an audit log entry (`TAG_UPDATED`) with user ID, organization ID, tag ID, changed fields, old values, new values, and timestamp.

### Requirement 5: Delete Tag

**User Story:** As an admin, I want to permanently delete a tag definition and all its assignments, so that I can remove obsolete classifications.

#### Acceptance Criteria

1. WHEN an admin requests deletion of a tag, THE Tag_Service SHALL delete the tag definition and cascade-delete all associated ResourceTagAssignment records in the same database transaction.
2. THE Tag_Service SHALL return in the response the count of assignments removed as part of the deletion.
3. IF the tag does not exist or belongs to a different organization, THEN THE Tag_Service SHALL return a 404 Not Found.
4. Tag deletion is irreversible. THE Tag_Service SHALL NOT implement soft delete for tag definitions or their assignments.
5. THE Tag_Service SHALL restrict tag deletion exclusively to users with admin role; editors and viewers SHALL receive a 403 Forbidden.
6. THE Tag_Service SHALL record an audit log entry (`TAG_DELETED`) with user ID, organization ID, tag ID, key, value, and count of assignments removed.

### Requirement 6: Assign Tag to Resources

**User Story:** As an editor, I want to assign a tag to one or more resources, so that I can classify resources for reporting and filtering.

#### Acceptance Criteria

1. WHEN an editor submits a tag ID and a list of resource identifiers (1–100 per non-bulk call), THE Tag_Assignment_Service SHALL attempt to create an assignment for each resource and return a Partial_Success response containing: `assigned_count`, `skipped_count` (already assigned), `failed_count`, and a `failures` array with per-resource error details.
2. THE Tag_Assignment_Service SHALL store for each assignment: `resource_id`, `resource_type` (standardized namespace per R22 AC2), `cloud_provider`, `resource_name`, `resource_region`, `aws_account_id` or `azure_credential_id` as appropriate.
3. IF a resource already has the specified tag assigned, THEN THE Tag_Assignment_Service SHALL count it in `skipped_count` without treating it as an error and without creating a duplicate record.
4. IF a resource already has 50 tags assigned, THEN THE Tag_Assignment_Service SHALL add it to the `failures` array with error code `RESOURCE_TAG_LIMIT_EXCEEDED` and continue processing remaining resources. The operation SHALL NOT be rolled back for other resources in the list.
5. THE Tag_Assignment_Service SHALL verify that each `aws_account_id` or `azure_credential_id` supplied belongs to the requesting user's organization before creating the assignment; mismatched accounts SHALL result in a 403 Forbidden for that resource item.
6. THE Tag_Assignment_Service SHALL associate every assignment with the requesting user's organization_id.
7. THE Tag_Assignment_Service SHALL record an audit log entry (`TAG_ASSIGNED`) with user ID, organization ID, tag ID, and summary counts.

### Requirement 7: Remove Tag from Resources

**User Story:** As an editor, I want to remove a tag from one or more resources, so that I can correct misclassifications.

#### Acceptance Criteria

1. WHEN an editor submits a tag ID and a list of resource identifiers, THE Tag_Assignment_Service SHALL delete the matching assignment records and return a response containing `removed_count` and `not_found_count`.
2. IF an assignment does not exist for a given resource, THEN THE Tag_Assignment_Service SHALL count it in `not_found_count` without treating it as an error.
3. THE Tag_Assignment_Service SHALL filter deletions exclusively by the requesting user's organization_id; assignments belonging to other organizations SHALL be silently excluded from the deletion scope.
4. THE Tag_Assignment_Service SHALL record an audit log entry (`TAG_REMOVED`) with user ID, organization ID, tag ID, removed_count, and timestamp.

### Requirement 8: Bulk Tag Assignment

**User Story:** As an editor, I want to assign or remove tags on up to 1,000 resources in a single operation, so that I can classify large resource sets efficiently.

#### Acceptance Criteria

1. WHEN an editor submits a bulk assignment request with one or more tag IDs and up to 1,000 resource identifiers, THE Tag_Assignment_Service SHALL process all assignments and return a Partial_Success response with `total_processed`, `assigned_count`, `skipped_count`, `failed_count`, and a `failures` array.
2. THE Tag_Assignment_Service SHALL accept between 1 and 1,000 resource identifiers per bulk request; requests exceeding 1,000 resources SHALL be rejected with a 422 error and an explanation of the limit.
3. THE Tag_Assignment_Service SHALL complete a bulk operation of 1,000 resources in less than 10 seconds under normal database load conditions.
4. THE Tag_Assignment_Service SHALL process bulk assignments in internal database batches of 100 records per transaction to avoid lock contention; a failure in one batch SHALL NOT roll back already-committed batches.
5. THE Tag_Assignment_Service SHALL apply the same per-resource validation rules as single assignment (R6 AC3–5), reporting per-resource failures in the `failures` array without halting the overall operation.
6. THE Tag_Assignment_Service SHALL apply rate limiting to bulk endpoints using the `api_heavy` tier (20 requests per minute per organization) defined in the distributed rate limiter.
7. THE Tag_Assignment_Service SHALL record a single audit log entry (`TAG_BULK_ASSIGNED`) for the entire operation including: user ID, organization ID, tag IDs, total_processed, assigned_count, failed_count, and resource_types array.

### Requirement 9: List Tags for a Resource

**User Story:** As a viewer, I want to see all EVO Local Tags assigned to a specific resource, so that I can understand how it is classified.

#### Acceptance Criteria

1. WHEN a user requests tags for a resource by `resource_id`, THE Tag_Assignment_Service SHALL return all tag definitions assigned to that resource, including: id, key, value, color, category, description.
2. THE Tag_Assignment_Service SHALL filter results exclusively by the requesting user's organization_id.
3. THE Tag_Assignment_Service SHALL return an empty array (not a 404) if the resource has no assignments.

### Requirement 10: List Resources by Tag

**User Story:** As a viewer, I want to see all resources that have a specific tag assigned, so that I can find related resources.

#### Acceptance Criteria

1. WHEN a user requests resources for a tag by tag ID, THE Tag_Assignment_Service SHALL return the list of assignment records for that tag.
2. THE Tag_Assignment_Service SHALL support cursor-based pagination via `limit` (1–100, default 50) and `cursor` parameters.
3. THE Tag_Assignment_Service SHALL support filtering by `resource_type` and `cloud_provider`.
4. THE Tag_Assignment_Service SHALL filter results exclusively by the requesting user's organization_id.

### Requirement 11: Smart Tag Suggestions

**User Story:** As an editor, I want ranked tag suggestions based on a resource's name, type, account, and region, so that I can tag resources faster.

#### Acceptance Criteria

1. WHEN an editor requests suggestions for a resource (providing `resource_type`, `resource_name`, `aws_account_id` or `azure_credential_id`, and `region`), THE Tag_Service SHALL return a ranked list of suggested EVO Local Tags.
2. THE Tag_Service SHALL apply a three-strategy scoring model:
   - **Score 3** (highest): Tags frequently applied to resources of the same `resource_type` within the organization.
   - **Score 2**: Tags applied to resources in the same account and region.
   - **Score 1**: Tags whose key or value contains meaningful substrings extracted from the resource name.
3. THE Tag_Service SHALL deduplicate suggestions across strategies and sort by descending score, then by `usage_count` as a tiebreaker.
4. THE Tag_Service SHALL return a maximum of 10 suggestions per request.
5. THE Tag_Service SHALL respond to suggestion requests in less than 300 milliseconds (p95), served from cache where possible (Redis TTL: 2 minutes per `resource_type` + account).
6. THE Tag_Service SHALL filter suggestions exclusively by the requesting user's organization_id.

### Requirement 12: Tag Templates (Quickstart)

**User Story:** As an editor, I want to apply predefined tag template sets, so that I can quickly establish common tagging schemes.

#### Acceptance Criteria

1. WHEN an editor requests available templates, THE Tag_Service SHALL return a static list of predefined template sets: Environment (`env`: production/staging/development/testing), Cost Center (with example values), Team, Criticality, and Compliance.
2. WHEN an editor applies one or more selected templates, THE Tag_Service SHALL create, within a single operation, all tag definitions from those templates that do not already exist in the organization.
3. IF a tag from the template already exists (same normalized key + value), THEN THE Tag_Service SHALL skip that tag without error and include it in a `skipped_count` in the response.
4. THE Tag_Service SHALL associate all created tags with the requesting user's organization_id.
5. THE Tag_Service SHALL return the list of created tags and skipped tags in the response so the UI can provide accurate feedback.

### Requirement 13: Cost Report by Tag

**User Story:** As a viewer, I want a cost report grouped by tag, so that I can understand spending by cost center, team, or project.

#### Acceptance Criteria

1. WHEN a user requests a cost report for a given tag ID, THE Report_Service SHALL aggregate cost data from the `DailyCost` table by joining on `cloud_provider` and `service` fields against the resource types represented in `ResourceTagAssignment` records for that tag. Cost attribution SHALL operate at the service level (e.g., all EC2 costs for tagged EC2 resources), with a clear disclaimer in the response that costs are service-aggregated, not per-resource.
2. THE Report_Service SHALL support filtering by: `start_date`, `end_date`, `cloud_provider`, and `aws_account_id` or `azure_credential_id`.
3. THE Report_Service SHALL return the following breakdown in the response: total cost, cost by service type, cost by cloud provider, cost time series (daily), and resource count for the tag within the period.
4. THE Report_Service SHALL generate reports in less than 5 seconds for organizations with up to 10,000 tagged resources, served from cache where possible (Redis TTL: 1 hour per `tag_id` + `date_range`).
5. THE Report_Service SHALL filter all cost and assignment data exclusively by the requesting user's organization_id.
6. THE Report_Service SHALL support export in CSV and PDF formats via a `format` query parameter; export requests SHALL be subject to the export rate-limit tier (3 per 5 minutes per organization).

### Requirement 14: Security Findings by Tag

**User Story:** As a viewer, I want to filter security findings by one or more tags, so that I can focus on issues affecting specific teams, projects, or environments.

#### Acceptance Criteria

1. WHEN a user requests security findings filtered by one or more tag IDs, THE Report_Service SHALL return only findings from the `Finding` table where `resource_id` is present in `ResourceTagAssignment` records for ALL specified tag IDs (AND logic; see Out of Scope for OR logic).
2. THE Report_Service SHALL support cursor-based pagination.
3. THE Report_Service SHALL include in each result: finding_id, severity, title, resource_id, resource_type, resource_name, region, cloud_provider, status, and the list of EVO Local Tags assigned to that resource.
4. THE Report_Service SHALL support additional filtering by `severity`, `status`, and `cloud_provider` applied on top of the tag filter.
5. THE Report_Service SHALL filter results exclusively by the requesting user's organization_id.

### Requirement 15: Resource Inventory by Tag

**User Story:** As a viewer, I want an inventory report of resources grouped by tag, so that I can see resource distribution across classifications.

#### Acceptance Criteria

1. WHEN a user requests a resource inventory for a given tag ID, THE Report_Service SHALL return resource counts grouped by `resource_type` and `cloud_provider` from `ResourceTagAssignment` records.
2. THE Report_Service SHALL support optional filtering by `resource_type` and `cloud_provider`.
3. THE Report_Service SHALL filter data exclusively by the requesting user's organization_id.
4. THE Report_Service SHALL support export in CSV and PDF formats, subject to the export rate-limit tier.

### Requirement 16: Tag Management Hub Page

**User Story:** As a viewer, I want a dedicated Tag Management page to manage, report, and configure all tags in one place.

#### Acceptance Criteria

1. THE Tag_Manager_UI SHALL display a page at the route `/tag-management` with five tabs: Overview, Tags Library, Cost Reports, Security, and Settings.
2. The Overview tab SHALL display: total tag definition count, total resource assignment count, untagged resource count, Tag_Coverage percentage, and a top-5 cost-by-tag bar chart.
3. The Tags Library tab SHALL display a searchable, category-filterable table of all organization tags. Each row SHALL show: key, value, color swatch, category badge, usage count, and actions (Edit, Delete).
4. The Tags Library tab SHALL provide inline Edit and Delete actions. Delete SHALL require a confirmation dialog that displays the number of assignments that will be permanently removed.
5. The Tag Management page SHALL have an entry in the AppSidebar navigation under a Tag (Lucide icon), positioned after the existing "Cost Analysis" group.
6. WHEN there are zero tag definitions in the organization, THE Tag_Manager_UI SHALL automatically display the Quickstart Wizard (R21) on first access instead of the empty Overview tab.

### Requirement 17: Tag Badge Display

**User Story:** As a viewer, I want tags displayed as colored pills on resources in list views, so that I can quickly identify resource classifications.

#### Acceptance Criteria

1. THE Tag_Manager_UI SHALL render each EVO Local Tag as a pill badge displaying `{key}: {value}`.
2. THE Tag_Manager_UI SHALL style each badge with: background color = tag hex color at 13% opacity, text color = tag hex color, border color = tag hex color at 27% opacity. This ensures readability on both light and dark themes regardless of the chosen color.
3. THE Tag_Manager_UI SHALL automatically compute text color (dark `#0F172A` or light `#FFFFFF`) based on the relative luminance of the tag's hex color, ensuring WCAG AA contrast ratio (≥ 4.5:1) is maintained for the label text.
4. WHEN more than 3 tags are assigned to a resource in a list row, THE Tag_Manager_UI SHALL display the first 3 tags and a `+N` overflow indicator (e.g., `+4`).
5. WHEN a user clicks or hovers the `+N` indicator, THE Tag_Manager_UI SHALL display all tags in a non-blocking popover.
6. THE Tag_Manager_UI SHALL visually distinguish EVO Local Tags (colored pill with label) from Native Cloud Tags (monochrome outline pill with a cloud provider icon prefix) when both are displayed together in a resource panel.

### Requirement 18: Tag Selector Component

**User Story:** As an editor, I want a dropdown/combobox to select and assign tags to a resource inline, so that I can tag resources with minimal navigation.

#### Acceptance Criteria

1. THE Tag_Selector_UI SHALL display a searchable combobox that opens on click and lists all available organization tags.
2. THE Tag_Selector_UI SHALL support filtering by category and free-text search across key and value, updating results within 200 milliseconds of each keystroke (debounced at 150ms).
3. THE Tag_Selector_UI SHALL allow selecting multiple tags within a single open session before closing.
4. THE Tag_Selector_UI SHALL display already-assigned tags as pre-selected and visually distinct (checked state); these SHALL be excluded from the "Add" action but can be removed by deselecting.
5. WHEN a user types text that matches no existing tag, THE Tag_Selector_UI SHALL display a "Create '{typed_text}'" option at the bottom of the list that opens an inline creation form.
6. The inline creation form SHALL expose fields for key (auto-populated from the search term if it contains a colon separator, e.g., `env:prod`), value, color (visual color picker with the 12 predefined swatches), and category. Description SHALL be available via an expandable "Add description" link.
7. THE Tag_Selector_UI SHALL confirm assignments optimistically (immediate UI update), reverting with an error toast if the API call fails.

### Requirement 19: Bulk Tagging Drawer

**User Story:** As an editor, I want a full-screen 3-step wizard to apply tags to multiple resources at once, so that I can efficiently classify large resource sets.

#### Acceptance Criteria

1. THE Bulk_Tagging_UI SHALL be accessible via a "Bulk Tag" button in the Tag Management Hub and via a "Bulk Tag" action button in the header of any resource list page (Cost Overview, Security Scans, Resource Monitoring).
2. THE Bulk_Tagging_UI SHALL present a 3-step wizard:
   - **Step 1 — Select Resources:** Filterable, searchable, paginated list of resources from `ResourceInventory`, with multi-select checkboxes and a "Select All Matching" option. Filtering options SHALL include: cloud provider, account/subscription, region, resource type, and tag status (all / has at least one tag / has no tags).
   - **Step 2 — Select Tags:** List of organization tags grouped by category, with multi-select and smart suggestions (R11) pre-populated based on the Step 1 selection. SHALL include a "+ Create New Tag" inline action without leaving the drawer.
   - **Step 3 — Review & Confirm:** Summary of selected resources (count + breakdown by type) and selected tags. A warning SHALL be shown if any selected resources already have a selected tag (indicating those will be skipped as duplicates).
3. The resource list in Step 1 SHALL use virtual scrolling (windowed rendering) to handle lists of 10,000+ resources without performance degradation.
4. Step 1 filter — "No tags": Filtering by tag status = "has no tags" SHALL query `ResourceInventory` records for which no `ResourceTagAssignment` exists in the organization.
5. THE Bulk_Tagging_UI SHALL display a progress indicator (determinate progress bar showing batch progress) during bulk operation execution.
6. WHEN the bulk operation completes, THE Bulk_Tagging_UI SHALL display a success screen with: total resources tagged, tags applied, time elapsed, and action buttons: "View Tagged Resources", "Tag More Resources", "Go to Reports", and "Done".
7. THE Bulk_Tagging_UI SHALL limit resource selection to 1,000 resources and display a warning when approaching the limit (≥ 900 selected).
8. On desktop (viewport ≥ 1024px), Steps 1, 2, and 3 SHALL be rendered as a 3-column side-by-side layout within the drawer. On mobile/tablet (< 1024px), a sequential stepper with back/forward navigation SHALL be used instead.

### Requirement 20: Tag Filter Bar

**User Story:** As a viewer, I want a global filter bar to filter resource lists and reports by tags on any platform page.

#### Acceptance Criteria

1. THE Tag_Filter_Bar_UI SHALL render as a horizontal bar with a "Filter by tag:" label, a tag selector trigger button, and removable chip badges for each active tag filter.
2. WHEN multiple tags are selected, THE Tag_Filter_Bar_UI SHALL apply AND logic — only resources possessing all selected tags SHALL be shown. This behavior SHALL be explicitly communicated in the UI via a tooltip or label ("Showing resources matching ALL selected tags").
3. OR logic is explicitly out of scope for v1. THE Tag_Filter_Bar_UI SHALL NOT implement OR logic.
4. WHEN tag filters are applied, THE Tag_Filter_Bar_UI SHALL trigger an API re-fetch within 500 milliseconds and update the displayed resource list or report data.
5. THE Tag_Filter_Bar_UI SHALL persist selected tag filters in URL query parameters (e.g., `?tags=uuid1,uuid2`) for shareability and browser back-navigation compatibility.
6. WHEN a user navigates between pages, active tag filters SHALL be cleared; filters SHALL only persist within the same page session unless bookmarked via URL.
7. A "Clear all" action SHALL remove all active tag filters and update the URL.

### Requirement 21: Tag Quickstart Wizard

**User Story:** As a new user, I want a quickstart wizard that helps me set up common tag schemes immediately, so that I can start organizing resources without manual configuration.

#### Acceptance Criteria

1. WHEN a user accesses `/tag-management` and the organization has zero tag definitions, THE Tag_Manager_UI SHALL automatically display the Quickstart Wizard as a full-page overlay instead of the empty Overview tab.
2. THE Quickstart Wizard SHALL present a multi-select checklist of template categories: Cost Center, Environment, Team, Criticality, Project, and Compliance — with a brief description of each.
3. WHEN the user confirms their selection, THE Tag_Manager_UI SHALL call the template application endpoint (R12) and display a loading state, followed by a success screen listing the created tags.
4. THE Quickstart Wizard SHALL offer a clearly visible "Skip — I'll set up tags manually" action that bypasses the wizard and shows the normal Overview tab.
5. After the wizard is completed or skipped once, it SHALL NOT appear automatically again for that organization.

### Requirement 22: Multi-Cloud Resource Identification

**User Story:** As a viewer, I want tags to work consistently across AWS and Azure resources, so that I can classify resources regardless of cloud provider.

#### Acceptance Criteria

1. THE Tag_Assignment_Service SHALL accept AWS resource identifiers in ARN format (`arn:aws:service:region:account-id:resource`) and Azure resource identifiers in Azure Resource ID format (`/subscriptions/{sub}/resourceGroups/{rg}/providers/{provider}/{type}/{name}`).
2. THE Tag_Assignment_Service SHALL store a standardized `resource_type` in namespace format for each assignment: `aws:{service}:{resource-type}` for AWS (e.g., `aws:ec2:instance`, `aws:s3:bucket`) and `azure:{provider-namespace}:{type}` for Azure (e.g., `azure:compute:virtualmachine`). Unrecognized types SHALL be stored as-is and flagged with a `type_normalized: false` field in the response.
3. THE Tag_Manager_UI SHALL display a cloud-provider badge next to each resource in tag-related views: orange "AWS" badge for AWS resources, blue "AZ" badge for Azure resources.
4. THE Tag_Filter_Bar_UI SHALL support an additional `cloud_provider` chip filter (independent of tag filters) to restrict any filtered view to AWS-only or Azure-only resources.
5. THE Tag_Manager_UI SHALL visually distinguish EVO Local Tags from Native Cloud Tags (per R17 AC6) in resource detail panels.


### Requirement 23: Tenant Isolation and RBAC

**User Story:** As a platform administrator, I want tag operations to be restricted by role and isolated by organization, so that data integrity and access control are maintained.

#### Acceptance Criteria

1. ALL tag-related API endpoints SHALL extract `organization_id` from the authenticated user's JWT and use it as a mandatory filter in every database query. No endpoint SHALL accept `organization_id` as a request parameter.
2. THE Tag_Service and Tag_Assignment_Service SHALL enforce the following permission keys mapped to roles:

| Permission Key | Viewer | Editor | Admin |
|---------------|--------|--------|-------|
| `tags:read` | ✅ | ✅ | ✅ |
| `tags:create` | ❌ | ✅ | ✅ |
| `tags:update` | ❌ | ✅ | ✅ |
| `tags:delete` | ❌ | ❌ | ✅ |
| `tags:assign` | ❌ | ✅ | ✅ |
| `tags:bulk_assign` | ❌ | ✅ | ✅ |
| `tags:export` | ✅ | ✅ | ✅ |

3. THE Tag_Service SHALL register the following new `AuditAction` values in the audit system: `TAG_CREATED`, `TAG_UPDATED`, `TAG_DELETED`, `TAG_ASSIGNED`, `TAG_REMOVED`, `TAG_BULK_ASSIGNED`. Each audit entry SHALL include: `userId`, `organizationId`, `action`, `resourceType: 'tag'`, `resourceId`, `details` (JSON with operation-specific data), `ipAddress`, and `userAgent`.
4. WHEN a user attempts an operation without the required permission, THE service SHALL return a 403 Forbidden with a message indicating the required permission key.
5. THE Tag_Service SHALL use the existing `getUserFromEvent()` and `getOrganizationId()` helpers from `lib/auth.js` for all authentication and tenant extraction.
6. Impersonation scenarios SHALL use `getOrganizationIdWithImpersonation(event, user)` to allow admin users to operate on behalf of another organization when the `x-impersonate-org` header is present.

### Requirement 24: Integration with Existing Pages

**User Story:** As a viewer, I want to filter and view tag information directly from existing platform pages (cost, security, dashboard), so that tags are seamlessly integrated into my daily workflow without navigating to a separate page.

#### Acceptance Criteria

1. THE following existing pages SHALL integrate the `Tag_Filter_Bar_UI` component (R20) to enable tag-based filtering of their primary data:

| Page | Component | Route | Integration Point |
|------|-----------|-------|-------------------|
| Cost Overview | `CostOverviewPage` | `/cost-overview` | Filter cost summary cards and charts by tags |
| Cost Analysis | `CostAnalysisPage` | `/cost-analysis` | Filter detailed cost breakdown table by tags |
| Monthly Invoices | `MonthlyInvoicesPage` | `/monthly-invoices` | Filter invoice line items by tags |
| Security Posture | `SecurityPosturePage` | `/security-posture` | Filter findings summary and charts by tags |
| Security Scans | `SecurityScansPage` | `/security-scans` | Filter scan results and findings by tags |
| Executive Dashboard | `ExecutiveDashboardPage` | `/dashboard` | Filter all dashboard widgets by tags |

2. THE existing API endpoints for the pages listed in AC1 SHALL accept an optional `tag_ids` query parameter (comma-separated UUIDs). When present, the endpoint SHALL JOIN against `resource_tag_assignments` to filter results to only resources matching ALL specified tag IDs (AND logic).
3. Tag data SHALL be centralized exclusively in the `tags` and `resource_tag_assignments` tables. Existing pages SHALL NOT duplicate or cache tag data in their own tables. All tag-based filtering SHALL be performed via JOINs against the centralized tag tables at query time.
4. THE `ResourceTagPanel` component SHALL be added to the detail/drawer views of the following pages, displaying all EVO Local Tags assigned to the selected resource with inline assign/remove capability via `Tag_Selector_UI` (R18):
   - Cost Analysis → Resource detail drawer
   - Security Scans → Finding detail drawer
   - Resource Monitoring → Resource detail panel
5. THE Executive Dashboard SHALL include a "Tag Coverage" widget displaying: Tag_Coverage percentage (progress bar), total tagged resources vs. total resources, and a "View Untagged" link navigating to the Bulk Tagging Drawer (R19) pre-filtered to untagged resources.
6. WHEN `tag_ids` is provided to an existing endpoint, the response payload SHALL remain identical in structure — only the result set is filtered. No new response fields are added to existing endpoints.
7. THE integration SHALL NOT require schema changes to existing tables (`DailyCost`, `Finding`, `ResourceInventory`, etc.). All tag relationships are resolved through `resource_tag_assignments` JOINs using `resource_id` and `organization_id`.

### Requirement 25: Tag Coverage Metrics

**User Story:** As a viewer, I want to see what percentage of my resources are tagged, so that I can track tagging adoption and identify gaps.

#### Acceptance Criteria

1. THE Tag_Service SHALL expose a `GET /api/v1/tags/coverage` endpoint that returns: `total_resources` (count of `ResourceInventory` records for the organization), `tagged_resources` (count of resources with at least one `ResourceTagAssignment`), `untagged_resources` (difference), `coverage_percentage` (tagged / total × 100, rounded to 1 decimal), and `breakdown_by_provider` (coverage per cloud provider).
2. THE Tag_Service SHALL serve coverage metrics from Redis cache with a TTL of 10 minutes. Cache key pattern: `tags:coverage:{organization_id}`.
3. THE Tag_Service SHALL invalidate the coverage cache when any tag assignment or removal operation completes for the organization.
4. THE Tag_Manager_UI Overview tab SHALL display the Tag_Coverage percentage as a progress bar with color coding: green (≥ 80%), yellow (50–79%), red (< 50%).
5. THE Tag_Service SHALL filter all coverage calculations exclusively by the requesting user's organization_id.

### Requirement 26: Untagged Resource Discovery

**User Story:** As an editor, I want to find all resources that have no tags assigned, so that I can prioritize tagging efforts.

#### Acceptance Criteria

1. THE Tag_Assignment_Service SHALL expose a `GET /api/v1/resources/untagged` endpoint that returns `ResourceInventory` records for which no `ResourceTagAssignment` exists in the requesting user's organization.
2. THE endpoint SHALL support cursor-based pagination via `limit` (1–100, default 50) and `cursor` parameters.
3. THE endpoint SHALL support filtering by `resource_type`, `cloud_provider`, `region`, and `aws_account_id` or `azure_credential_id`.
4. THE endpoint SHALL return for each resource: `resource_id`, `resource_type`, `resource_name`, `cloud_provider`, `region`, `account_id` (AWS account or Azure subscription), and `last_seen_at`.
5. THE Bulk_Tagging_UI (R19) Step 1 "No tags" filter SHALL use this endpoint as its data source.
6. THE Tag_Assignment_Service SHALL filter results exclusively by the requesting user's organization_id.

---

## Non-Functional Requirements

### NFR-1: Performance

| Operation | Target | Condition |
|-----------|--------|-----------|
| Create/Update/Delete Tag | < 200ms p95 | Single tag operation |
| List Tags (paginated) | < 300ms p95 | Up to 500 tags per org |
| Assign Tag (single, 1–100 resources) | < 1s p95 | 100 resources |
| Bulk Assign (up to 1,000 resources) | < 10s p95 | 1,000 resources, batches of 100 |
| Smart Suggestions | < 300ms p95 | Redis-cached |
| Cost Report by Tag | < 5s p95 | Up to 10,000 tagged resources |
| Tag Coverage Metrics | < 200ms p95 | Redis-cached |
| Tag Filter Bar re-fetch | < 500ms | After filter change |
| Tag Selector search | < 200ms | Debounced at 150ms |

### NFR-2: Scalability

1. The system SHALL support up to 500 tag definitions per organization.
2. The system SHALL support up to 50 tags per individual resource.
3. The system SHALL support up to 1,000,000 total `ResourceTagAssignment` records per organization without performance degradation beyond the targets in NFR-1.
4. Bulk operations SHALL process up to 1,000 resources per request.
5. The system SHALL support organizations with up to 100,000 resources in `ResourceInventory`.

### NFR-3: Availability and Atomicity

1. Tag creation, update, and deletion SHALL be atomic database transactions. A failure mid-operation SHALL result in a complete rollback.
2. Tag deletion SHALL cascade-delete all assignments in the same transaction (R5 AC1).
3. Bulk operations SHALL use batched transactions (100 per batch). A failure in one batch SHALL NOT roll back previously committed batches (R8 AC4). The response SHALL report partial success.
4. The system SHALL gracefully degrade when Redis is unavailable: cache misses SHALL fall through to direct database queries with no user-visible errors. Cached features (usage counts, suggestions, coverage) SHALL function correctly but with higher latency.

### NFR-4: Security and Privacy

1. All tag-related endpoints SHALL require a valid JWT with `organization_id` claim.
2. No endpoint SHALL accept `organization_id` as a request parameter; it SHALL always be extracted from the JWT.
3. Error responses for cross-organization access attempts SHALL return 404 (not 403) to prevent organization enumeration.
4. All mutation operations SHALL record audit log entries per the AuditAction values defined in R23 AC3.
5. Tag keys and values SHALL be sanitized (HTML-escaped) before storage to prevent XSS in UI rendering.

### NFR-5: Accessibility

1. All tag-related UI components SHALL meet WCAG 2.1 Level AA compliance.
2. Tag badges SHALL maintain a minimum contrast ratio of 4.5:1 between text and background (R17 AC3).
3. The Tag Selector combobox SHALL be fully keyboard-navigable (arrow keys, Enter to select, Escape to close).
4. The Bulk Tagging Drawer SHALL announce step transitions to screen readers via ARIA live regions.
5. Color SHALL NOT be the sole means of conveying tag information; all tags SHALL display `key: value` text labels alongside color.

### NFR-6: Cache Strategy

| Cache Key Pattern | TTL | Invalidation Trigger |
|-------------------|-----|---------------------|
| `tags:list:{org_id}:{hash}` | 5 min | Tag create/update/delete |
| `tags:usage:{org_id}:{tag_id}` | 5 min | Tag assign/remove |
| `tags:suggestions:{org_id}:{resource_type}:{account}` | 2 min | Tag assign/remove |
| `tags:coverage:{org_id}` | 10 min | Tag assign/remove |
| `tags:report:cost:{org_id}:{tag_id}:{date_range}` | 1 hour | Tag assign/remove, daily cost refresh |
| `tags:report:security:{org_id}:{hash}` | 15 min | Tag assign/remove, new scan |

1. ALL cache operations SHALL use the existing Redis client from `lib/redis.js`.
2. Cache invalidation SHALL be performed synchronously after the database transaction commits, before the API response is sent.
3. WHEN Redis is unavailable, the system SHALL bypass cache operations and query the database directly without throwing errors to the client.

---

## Appendix A: Data Model Summary

### Table: `tags`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK, default `gen_random_uuid()` |
| `organization_id` | UUID | FK → organizations.id, NOT NULL |
| `key` | VARCHAR(64) | NOT NULL, normalized lowercase |
| `value` | VARCHAR(128) | NOT NULL, normalized lowercase |
| `color` | VARCHAR(7) | NOT NULL, hex format |
| `category` | ENUM(Tag_Category) | NOT NULL, default `CUSTOM` |
| `description` | VARCHAR(256) | NULLABLE |
| `created_by` | UUID | FK → profiles.id, NOT NULL |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default `now()` |

**Indexes:**
- `UNIQUE(organization_id, key, value)` — prevents duplicate tags per org
- `INDEX(organization_id, category)` — category filtering
- `INDEX(organization_id, key)` — prefix search on key

### Table: `resource_tag_assignments`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK, default `gen_random_uuid()` |
| `organization_id` | UUID | FK → organizations.id, NOT NULL |
| `tag_id` | UUID | FK → tags.id ON DELETE CASCADE, NOT NULL |
| `resource_id` | VARCHAR(512) | NOT NULL (ARN or Azure Resource ID) |
| `resource_type` | VARCHAR(128) | NOT NULL (standardized namespace) |
| `cloud_provider` | VARCHAR(10) | NOT NULL (`aws` or `azure`) |
| `resource_name` | VARCHAR(256) | NULLABLE |
| `resource_region` | VARCHAR(64) | NULLABLE |
| `aws_account_id` | VARCHAR(12) | NULLABLE (for AWS resources) |
| `azure_credential_id` | UUID | NULLABLE (for Azure resources) |
| `assigned_by` | UUID | FK → profiles.id, NOT NULL |
| `assigned_at` | TIMESTAMPTZ | NOT NULL, default `now()` |

**Indexes:**
- `UNIQUE(organization_id, tag_id, resource_id)` — prevents duplicate assignments
- `INDEX(organization_id, resource_id)` — lookup tags for a resource
- `INDEX(organization_id, tag_id)` — lookup resources for a tag
- `INDEX(organization_id, resource_type, cloud_provider)` — filtering by type/provider
- `INDEX(resource_id)` — JOIN support for existing page queries with `tag_ids` filter

---

## Appendix B: API Endpoint Summary

| # | Method | Path | Service | Min Role | Ref |
|---|--------|------|---------|----------|-----|
| 1 | POST | `/api/v1/tags` | Tag_Service | Editor | R1 |
| 2 | GET | `/api/v1/tags` | Tag_Service | Viewer | R2 |
| 3 | GET | `/api/v1/tags/:id` | Tag_Service | Viewer | R3 |
| 4 | PATCH | `/api/v1/tags/:id` | Tag_Service | Editor | R4 |
| 5 | DELETE | `/api/v1/tags/:id` | Tag_Service | Admin | R5 |
| 6 | POST | `/api/v1/tags/:id/assign` | Tag_Assignment_Service | Editor | R6 |
| 7 | POST | `/api/v1/tags/:id/unassign` | Tag_Assignment_Service | Editor | R7 |
| 8 | POST | `/api/v1/tags/bulk-assign` | Tag_Assignment_Service | Editor | R8 |
| 9 | GET | `/api/v1/resources/:id/tags` | Tag_Assignment_Service | Viewer | R9 |
| 10 | GET | `/api/v1/tags/:id/resources` | Tag_Assignment_Service | Viewer | R10 |
| 11 | GET | `/api/v1/tags/suggestions` | Tag_Service | Editor | R11 |
| 12 | GET | `/api/v1/tags/templates` | Tag_Service | Editor | R12 |
| 13 | POST | `/api/v1/tags/templates/apply` | Tag_Service | Editor | R12 |
| 14 | GET | `/api/v1/tags/:id/cost-report` | Report_Service | Viewer | R13 |
| 15 | GET | `/api/v1/tags/security-findings` | Report_Service | Viewer | R14 |
| 16 | GET | `/api/v1/tags/:id/inventory` | Report_Service | Viewer | R15 |
| 17 | GET | `/api/v1/tags/coverage` | Tag_Service | Viewer | R25 |
| 18 | GET | `/api/v1/resources/untagged` | Tag_Assignment_Service | Viewer | R26 |

---

## Changelog v1 → v2

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | Missing tag key/value normalization rules | Added explicit lowercase + trim normalization in R1 AC2, AC4 |
| 2 | No tag definition limit per organization | Added 500-tag limit in R1 AC10 |
| 3 | Ambiguous error codes for validation failures | Standardized on 422 with field-level errors throughout |
| 4 | Missing audit log actions | Defined 6 AuditAction values in R23 AC3 |
| 5 | No RBAC permission matrix | Added complete permission key matrix in R23 AC2 |
| 6 | Bulk operation batch size undefined | Specified 100-record batches in R8 AC4 |
| 7 | Missing rate limiting on bulk endpoints | Added `api_heavy` tier (20 req/min) in R8 AC6 |
| 8 | Cost report attribution model unclear | Clarified service-level aggregation with disclaimer in R13 AC1 |
| 9 | No export rate limiting | Added export tier (3 per 5 min) in R13 AC6 |
| 10 | Missing cache strategy details | Added NFR-6 with key patterns, TTLs, and invalidation triggers |
| 11 | No Redis failure handling | Added graceful degradation in NFR-3 AC4 and NFR-6 AC3 |
| 12 | Tag badge contrast not specified | Added WCAG AA luminance calculation in R17 AC3 |
| 13 | Missing keyboard accessibility for Tag Selector | Added in NFR-5 AC3 |
| 14 | No screen reader support for Bulk Tagging | Added ARIA live regions in NFR-5 AC4 |
| 15 | Quickstart wizard re-display behavior undefined | Added "show once" rule in R21 AC5 |
| 16 | Multi-cloud resource type normalization missing | Added standardized namespace format in R22 AC2 |
| 17 | No untagged resource discovery endpoint | Added R26 with cursor-based pagination |
| 18 | Tag coverage metrics not defined | Added R25 with Redis-cached endpoint |
| 19 | Missing integration with existing cost pages | Added R24 with explicit page list and `tag_ids` parameter |
| 20 | Data centralization not enforced | Added R24 AC3 mandating JOINs, no data duplication |
| 21 | Impersonation support missing | Added in R23 AC6 |
| 22 | Partial success response format inconsistent | Standardized `Partial_Success` format across R6, R7, R8 |
| 23 | Missing responsive design for Bulk Tagging | Added desktop/mobile layouts in R19 AC8 |
| 24 | Tag Selector debounce not specified | Added 150ms debounce in R18 AC2 |
| 25 | Missing data model appendix | Added Appendix A with complete table definitions and indexes |