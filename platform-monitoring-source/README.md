# Platform Monitoring - Source Code Package

## Overview

This package contains the complete source code for the Platform Monitoring feature of the EVO platform.

**Coverage:** 100%
- 114 Lambda functions monitored
- 111 API Gateway endpoints monitored
- Frontend error tracking
- Performance metrics
- Dynamic error fix prompts

## Structure

```
platform-monitoring-source/
├── README.md                    # This file
├── frontend/
│   ├── PlatformMonitoring.tsx   # Main page component
│   └── LambdaHealthMonitor.tsx  # Lambda health component
└── backend/
    ├── get-platform-metrics.ts      # Aggregates all metrics
    ├── get-recent-errors.ts         # Real-time error fetching
    ├── get-lambda-health.ts         # Critical Lambda health check
    └── generate-error-fix-prompt.ts # AI-powered fix prompts
```

## Frontend Components

### PlatformMonitoring.tsx
Main dashboard page with:
- Overview tab with metrics by category
- Lambda Health tab with real-time monitoring
- Errors tab with recent errors from all sources
- Patterns tab with error pattern detection
- Performance tab with Lambda execution metrics
- Alarms tab with CloudWatch alarm status

### LambdaHealthMonitor.tsx
Dedicated component for monitoring critical Lambdas:
- Onboarding: save-aws-credentials, validate-aws-credentials, etc.
- Security: security-scan, compliance-scan, etc.
- Auth: mfa-enroll, webauthn-register, etc.
- Core: query-table, bedrock-chat, etc.

## Backend Handlers

### get-platform-metrics.ts
- Fetches metrics from CloudWatch for all 114 Lambdas
- Aggregates errors, invocations, and durations
- Returns coverage statistics

### get-recent-errors.ts
- Queries CloudWatch Logs for recent errors
- Supports filtering by source (backend, frontend, api-gateway)
- Extracts error types and patterns

### get-lambda-health.ts
- Monitors critical Lambda functions
- Checks configuration, error rates, and issues
- Returns health scores and status

### generate-error-fix-prompt.ts
- AI-powered error analysis
- Pattern matching for known errors
- Generates detailed fix prompts with commands

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/functions/get-platform-metrics` | POST | Get all platform metrics |
| `/api/functions/get-recent-errors` | POST | Get recent errors |
| `/api/functions/get-lambda-health` | POST | Get Lambda health status |
| `/api/functions/generate-error-fix-prompt` | POST | Generate fix prompt |

## Dependencies

### Frontend
- React 18
- @tanstack/react-query
- shadcn/ui components
- lucide-react icons
- i18next for translations

### Backend
- AWS SDK v3 (CloudWatch, CloudWatch Logs, Lambda)
- Zod for validation
- Prisma (for auth helpers)

## Deployment

### Frontend
```bash
npm run build
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"
```

### Backend
Follow the standard Lambda deployment process in `.kiro/steering/architecture.md`

## Version

- **Date:** 2026-01-15
- **Version:** 1.0.0
- **Coverage:** 100%
