# Error Fix Prompt Generator - Requirements Document

## Introduction

This specification defines the requirements for the AI-Powered Error Fix Prompt Generator system, which analyzes errors in real-time and generates automated fix prompts based on known patterns and error context. The system helps developers quickly diagnose and resolve common Lambda, database, and API Gateway issues.

## Current State Analysis

The Error Fix Prompt Generator is currently operational with:
- ✅ Lambda handler `generate-error-fix-prompt` deployed
- ✅ Pattern matching for 5 common error types
- ✅ Automated fix command generation
- ✅ Integration with Platform Monitoring dashboard
- ✅ Centralized body validation using `parseAndValidateBody`

### Current Error Patterns Supported:
1. **Deployment Errors** - "Cannot find module '../../lib/'" (incorrect Lambda deploy)
2. **Database Errors** - PrismaClientInitializationError, connection failures
3. **Azure SDK Errors** - Missing @azure/* or @typespec modules
4. **CORS Errors** - Access-Control-Allow-Origin issues
5. **Timeout Errors** - Lambda timeout exceeded

## Glossary

- **Error_Pattern**: A regex-based pattern that matches specific error types
- **Fix_Prompt**: An AI-generated markdown document with diagnosis and solution steps
- **Pattern_Matching**: The process of identifying error types from error messages
- **Severity_Level**: Classification of error impact (critical, high, medium, low)
- **Generic_Prompt**: A fallback prompt generated when no pattern matches

## Requirements

### Requirement 1: Expanded Error Pattern Library

**User Story:** As a DevOps engineer, I want the system to recognize more error patterns, so that I can get automated fix suggestions for a wider variety of issues.

#### Acceptance Criteria

1. THE system SHALL support at least 15 distinct error patterns
2. WHEN a new error pattern is identified, THE system SHALL provide a mechanism to add it to the library
3. THE system SHALL categorize patterns by: deployment, database, dependencies, api-gateway, performance, authentication, permissions
4. WHEN multiple patterns match, THE system SHALL select the most specific pattern
5. THE system SHALL maintain pattern accuracy metrics to identify false positives
6. THE system SHALL support pattern versioning for updates and rollbacks
7. WHEN patterns are updated, THE system SHALL log changes for audit purposes
8. THE system SHALL provide pattern testing capabilities before deployment

### Requirement 2: Enhanced Fix Prompt Quality

**User Story:** As a developer, I want fix prompts to be comprehensive and actionable, so that I can resolve issues quickly without additional research.

#### Acceptance Criteria

1. THE fix prompt SHALL include: error diagnosis, root cause analysis, step-by-step solution, validation commands
2. WHEN generating prompts, THE system SHALL include relevant documentation links
3. THE system SHALL provide estimated time to resolution for each fix
4. THE system SHALL include rollback instructions when applicable
5. WHEN fixes involve multiple steps, THE system SHALL provide progress checkpoints
6. THE system SHALL generate copy-paste ready commands with proper escaping
7. THE system SHALL include common pitfalls and warnings for each fix type
8. THE system SHALL support multiple languages (Portuguese and English)

### Requirement 3: Context-Aware Prompt Generation

**User Story:** As a platform engineer, I want fix prompts to consider the specific context of my environment, so that solutions are tailored to my actual infrastructure.

#### Acceptance Criteria

1. THE system SHALL use Lambda name to determine handler category and file path
2. WHEN generating database fixes, THE system SHALL use the correct DATABASE_URL from steering
3. THE system SHALL reference correct API Gateway IDs and resource paths
4. THE system SHALL include organization-specific context when available
5. WHEN generating VPC-related fixes, THE system SHALL use correct subnet and security group IDs
6. THE system SHALL adapt commands based on the AWS region
7. THE system SHALL include correct Layer ARNs for dependency fixes
8. THE system SHALL reference correct Cognito User Pool IDs for auth issues

### Requirement 4: Integration with Platform Monitoring

**User Story:** As a system administrator, I want error fix prompts integrated into the monitoring dashboard, so that I can access solutions directly from error alerts.

#### Acceptance Criteria

1. THE Platform Monitoring dashboard SHALL display a "Get Fix" button for each error
2. WHEN clicking "Get Fix", THE system SHALL call the generate-error-fix-prompt API
3. THE system SHALL display the fix prompt in a modal or side panel
4. THE system SHALL support copying the entire fix prompt to clipboard
5. WHEN a fix is applied, THE system SHALL allow marking the error as resolved
6. THE system SHALL track which fixes were applied and their success rate
7. THE system SHALL provide a history of generated fix prompts per error type
8. THE system SHALL support exporting fix prompts as markdown files

### Requirement 5: Learning and Improvement System

**User Story:** As a DevOps lead, I want the system to learn from successful fixes, so that prompt quality improves over time.

#### Acceptance Criteria

1. THE system SHALL track fix success/failure feedback from users
2. WHEN a fix is marked as unsuccessful, THE system SHALL collect feedback on why
3. THE system SHALL analyze patterns in unsuccessful fixes to identify improvements
4. THE system SHALL support A/B testing of different fix prompt versions
5. WHEN fix success rate drops below threshold, THE system SHALL alert administrators
6. THE system SHALL provide analytics on most common error types and fix effectiveness
7. THE system SHALL support manual prompt refinement by administrators
8. THE system SHALL maintain a knowledge base of edge cases and special scenarios

### Requirement 6: Real-Time Error Detection Integration

**User Story:** As a site reliability engineer, I want automatic error detection to trigger fix prompt generation, so that solutions are ready before I even investigate.

#### Acceptance Criteria

1. THE system SHALL integrate with CloudWatch Logs for real-time error detection
2. WHEN a critical error is detected, THE system SHALL pre-generate the fix prompt
3. THE system SHALL cache generated prompts to reduce latency
4. THE system SHALL support webhook notifications with fix prompts attached
5. WHEN the same error occurs multiple times, THE system SHALL deduplicate prompts
6. THE system SHALL provide error frequency analysis to prioritize fixes
7. THE system SHALL support custom error detection rules
8. THE system SHALL integrate with existing alert channels (email, Slack, SNS)

### Requirement 7: Security and Access Control

**User Story:** As a security administrator, I want fix prompts to respect access controls, so that sensitive information is only shown to authorized users.

#### Acceptance Criteria

1. THE system SHALL require authentication for all API calls
2. WHEN generating prompts, THE system SHALL NOT include actual secrets or passwords
3. THE system SHALL respect organization boundaries for multi-tenant isolation
4. THE system SHALL audit all fix prompt generations with user and timestamp
5. WHEN prompts include sensitive commands, THE system SHALL add security warnings
6. THE system SHALL support role-based access to different prompt categories
7. THE system SHALL sanitize error messages to remove potential PII
8. THE system SHALL implement rate limiting to prevent abuse

### Requirement 8: API and Integration Capabilities

**User Story:** As a platform engineer, I want comprehensive APIs for the fix prompt system, so that I can integrate it into CI/CD pipelines and automation workflows.

#### Acceptance Criteria

1. THE system SHALL provide RESTful API for prompt generation
2. WHEN called via API, THE system SHALL support batch error processing
3. THE system SHALL provide API for pattern management (CRUD operations)
4. THE system SHALL support webhook callbacks for async prompt generation
5. WHEN integrating with CI/CD, THE system SHALL provide exit codes for automation
6. THE system SHALL provide API documentation with OpenAPI/Swagger spec
7. THE system SHALL support API versioning for backward compatibility
8. THE system SHALL provide SDK examples for common integration scenarios

## Technical Constraints

1. **Architecture Compliance**: All implementations MUST follow the established Node.js/TypeScript architecture
2. **Database Usage**: Pattern configurations and analytics MUST be stored in PostgreSQL via Prisma ORM
3. **Multi-Tenant Isolation**: All operations MUST respect organization_id boundaries
4. **Real Data Policy**: All testing MUST use real error scenarios, never mocked data
5. **Validation**: All input MUST be validated using centralized `parseAndValidateBody` function
6. **Response Format**: All responses MUST use standardized `success()` and `error()` functions

## Success Metrics

1. **Pattern Coverage**: 90% of common errors matched by specific patterns
2. **Fix Success Rate**: 80% of applied fixes resolve the issue on first attempt
3. **Response Time**: 95% of prompt generations complete within 2 seconds
4. **User Satisfaction**: 85% positive feedback on prompt quality
5. **False Positive Rate**: Less than 10% of pattern matches are incorrect
6. **Adoption Rate**: 70% of errors in Platform Monitoring use "Get Fix" feature

## Implementation Phases

### Phase 1: Core Enhancements (Current)
- ✅ Basic pattern matching for 5 error types
- ✅ Centralized body validation
- 🔄 Deploy updated handler with validation improvements

### Phase 2: Pattern Expansion (Weeks 1-2)
- Add 10 additional error patterns
- Implement pattern categorization
- Add multi-language support (PT/EN)

### Phase 3: Integration Enhancement (Weeks 3-4)
- Deep integration with Platform Monitoring UI
- Fix tracking and success metrics
- Clipboard and export functionality

### Phase 4: Learning System (Weeks 5-6)
- User feedback collection
- Analytics dashboard
- Pattern effectiveness tracking

## Dependencies

1. **AWS Services**: Lambda, API Gateway, CloudWatch Logs
2. **Database**: PostgreSQL with Prisma ORM
3. **Frontend**: React 18 with shadcn/ui components
4. **Authentication**: AWS Cognito integration
5. **Monitoring**: Platform Monitoring dashboard integration
6. **Validation**: Centralized validation library (`lib/validation.ts`)

## Related Files

- `backend/src/handlers/monitoring/generate-error-fix-prompt.ts` - Main handler
- `backend/src/lib/validation.ts` - Centralized validation
- `.kiro/steering/error-monitoring.md` - Error monitoring guidelines
- `.kiro/steering/lambda-deploy-process.md` - Deploy process documentation
