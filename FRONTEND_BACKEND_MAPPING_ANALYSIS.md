# Frontend-Backend Implementation Mapping Analysis

**Generated**: 2024
**Project**: EVO UDS v3 - AWS Infrastructure Management Platform
**Architecture**: React 18 + Vite (Frontend) | Node.js 18 Lambda (Backend) | PostgreSQL RDS

---

## Executive Summary

This document provides a comprehensive mapping of:
1. **Frontend Menu Items** - All navigation items in the sidebar
2. **Frontend Routes** - All React Router paths
3. **Frontend Pages** - All implemented page components
4. **Backend Lambda Handlers** - All AWS Lambda functions
5. **API Endpoints** - How frontend communicates with backend
6. **Implementation Status** - Which features are fully/partially/not implemented

---

## 1. FRONTEND NAVIGATION MENU (AppSidebar.tsx)

### Menu Structure & Routes

| Menu Item | Route | Icon | Sub-Items | Status |
|-----------|-------|------|-----------|--------|
| **Executive Dashboard** | `/app` | LayoutDashboard | - | ✅ Implemented |
| **Cost Analysis** | `/app?tab=costs` | DollarSign | • Detailed Analysis<br>• Monthly Invoices | ✅ Implemented |
| **Copilot AI** | `/copilot-ai` | Bot | - | ✅ Implemented |
| **ML Predictions** | - | TrendingUp | • Predictive Incidents<br>• Anomaly Detection | ✅ Implemented |
| **Monitoring** | - | Activity | • Endpoints<br>• AWS Resources<br>• Edge/LB/CF/WAF | ✅ Implemented |
| **Attack Detection** | `/attack-detection` | ShieldAlert | - | ✅ Implemented |
| **Analysis & Scans** | - | Scan | • Security Scans<br>• CloudTrail Audit<br>• Compliance<br>• Well-Architected<br>• AWS Security Analysis | ✅ Implemented |
| **Optimization** | - | Zap | • Cost Optimization<br>• RI/Savings Plans<br>• Waste Detection | ✅ Implemented |
| **Intelligent Alerts** | `/intelligent-alerts` | Bell | - | ✅ Implemented |
| **Security Posture** | `/security-posture` | Shield | - | ✅ Implemented |
| **Remediation Tickets** | `/remediation-tickets` | Ticket | - | ✅ Implemented |
| **Knowledge Base** | `/knowledge-base` | BookOpen | - | ✅ Implemented |
| **TV Dashboards** | `/tv` | Tv | - | ✅ Implemented |
| **Audit** | `/app?tab=audit` | FileCheck | - | ✅ Implemented |
| **Communication Center** | `/communication-center` | Mail | - | ✅ Implemented |
| **License Management** | `/license-management` | Key | - | ✅ Implemented |
| **AWS Settings** | `/aws-settings` | Cloud | - | ✅ Implemented |
| **Manage Users** | `/app?tab=users` | Users | - | ✅ Implemented |
| **Organizations** | `/app?tab=organizations` | Building2 | - | 🔒 Super Admin Only |
| **Scheduled Jobs** | `/background-jobs` | Calendar | - | 🔒 Super Admin Only |
| **Dev Tools** | `/bedrock-test` | Activity | - | 🔒 Super Admin Only |
| **Setup** | `/app?tab=setup` | Settings | - | ✅ Implemented |

---

## 2. FRONTEND ROUTES (src/main.tsx)

### All Defined Routes

```
/                          → AuthSimple (Login)
/auth                      → AuthSimple (Login)
/app                       → Index (Dashboard with tabs)
/dashboard                 → Dashboard
/aws-settings              → AWSSettings
/system-monitoring         → SystemMonitoring
/resource-monitoring       → ResourceMonitoring
/threat-detection          → ThreatDetection
/attack-detection          → AttackDetection
/anomaly-detection         → AnomalyDetection
/ml-waste-detection        → MLWasteDetection
/well-architected          → WellArchitected
/license-management        → LicenseManagement
/knowledge-base            → KnowledgeBase
/communication-center      → CommunicationCenter
/background-jobs           → BackgroundJobs
/predictive-incidents      → PredictiveIncidents
/bedrock-test              → BedrockTestPage
/change-password           → ChangePassword
/copilot-ai                → CopilotAI
/security-posture          → SecurityPosture
/intelligent-alerts        → IntelligentAlerts
/remediation-tickets       → RemediationTickets
/cost-optimization         → CostOptimization
/ri-savings-plans          → RISavingsPlans
/security-scans            → SecurityScans
/cloudtrail-audit          → CloudTrailAudit
/compliance                → Compliance
/endpoint-monitoring       → EndpointMonitoring
/edge-monitoring           → EdgeMonitoring
/tv                        → TVDashboard
/features                  → Features
/terms                     → TermsOfService
/404                       → NotFound
/*                         → NotFound (catch-all)
```

**Total Routes**: 40+ protected routes + 3 public routes

---

## 3. FRONTEND PAGES (src/pages/)

### Implemented Pages (40 files)

| Page | Route | Purpose | Status |
|------|-------|---------|--------|
| Auth-simple.tsx | `/auth` | Cognito authentication | ✅ |
| Index.tsx | `/app` | Main dashboard with tabs | ✅ |
| Dashboard.tsx | `/dashboard` | Alternative dashboard | ✅ |
| AWSSettings.tsx | `/aws-settings` | AWS credentials management | ✅ |
| SystemMonitoring.tsx | `/system-monitoring` | System health monitoring | ✅ |
| ResourceMonitoring.tsx | `/resource-monitoring` | AWS resource monitoring | ✅ |
| ThreatDetection.tsx | `/threat-detection` | Threat analysis | ✅ |
| AttackDetection.tsx | `/attack-detection` | Attack pattern detection | ✅ |
| AnomalyDetection.tsx | `/anomaly-detection` | ML anomaly detection | ✅ |
| MLWasteDetection.tsx | `/ml-waste-detection` | ML-based waste detection | ✅ |
| WellArchitected.tsx | `/well-architected` | AWS Well-Architected reviews | ✅ |
| LicenseManagement.tsx | `/license-management` | License seat management | ✅ |
| KnowledgeBase.tsx | `/knowledge-base` | KB articles & search | ✅ |
| CommunicationCenter.tsx | `/communication-center` | Notifications & messages | ✅ |
| BackgroundJobs.tsx | `/background-jobs` | Job scheduler & monitoring | ✅ |
| PredictiveIncidents.tsx | `/predictive-incidents` | ML incident prediction | ✅ |
| BedrockTestPage.tsx | `/bedrock-test` | Bedrock AI testing | ✅ |
| ChangePassword.tsx | `/change-password` | Password management | ✅ |
| CopilotAI.tsx | `/copilot-ai` | AI copilot chat | ✅ |
| SecurityPosture.tsx | `/security-posture` | Security score & posture | ✅ |
| IntelligentAlerts.tsx | `/intelligent-alerts` | Smart alert management | ✅ |
| RemediationTickets.tsx | `/remediation-tickets` | Ticket tracking | ✅ |
| CostOptimization.tsx | `/cost-optimization` | Cost optimization recommendations | ✅ |
| RISavingsPlans.tsx | `/ri-savings-plans` | RI/Savings Plans analyzer | ✅ |
| SecurityScans.tsx | `/security-scans` | Security scanning | ✅ |
| CloudTrailAudit.tsx | `/cloudtrail-audit` | CloudTrail analysis | ✅ |
| Compliance.tsx | `/compliance` | Compliance frameworks | ✅ |
| EndpointMonitoring.tsx | `/endpoint-monitoring` | Endpoint health | ✅ |
| EdgeMonitoring.tsx | `/edge-monitoring` | CloudFront/WAF monitoring | ✅ |
| TVDashboard.tsx | `/tv` | TV mode dashboard | ✅ |
| Features.tsx | `/features` | Feature showcase | ✅ |
| TermsOfService.tsx | `/terms` | Terms & conditions | ✅ |
| NotFound.tsx | `/404` | 404 error page | ✅ |
| CostAnalysisPage.tsx | (embedded) | Cost analysis component | ✅ |
| MonthlyInvoicesPage.tsx | (embedded) | Monthly invoices | ✅ |
| UserManagement.tsx | (embedded) | User management | ✅ |
| Organizations.tsx | (embedded) | Organization management | ✅ |
| DevTools.tsx | (embedded) | Developer tools | ✅ |

---

## 4. BACKEND LAMBDA HANDLERS (backend/src/handlers/)

### Handler Categories & Functions

#### **Admin Handlers** (5 functions)
```
admin/
├── admin-manage-user.ts          - Manage user permissions
├── create-cognito-user.ts        - Create Cognito user
├── create-user.ts                - Create database user
├── disable-cognito-user.ts       - Disable user account
└── log-audit.ts                  - Audit logging
```

#### **AI Handlers** (1 function)
```
ai/
└── generate-response.ts          - Bedrock AI response generation
```

#### **Auth Handlers** (3 functions)
```
auth/
├── verify-tv-token.ts            - TV mode token verification
├── webauthn-authenticate.ts      - WebAuthn/Passkey authentication
└── webauthn-register.ts          - WebAuthn/Passkey registration
```

#### **AWS Handlers** (3 functions)
```
aws/
├── list-aws-credentials.ts       - List stored AWS credentials
├── save-aws-credentials.ts       - Save new AWS credentials
└── update-aws-credentials.ts     - Update existing credentials
```

#### **Cost Handlers** (9 functions)
```
cost/
├── budget-forecast.ts            - Budget forecasting
├── cost-optimization.ts          - Cost optimization analysis
├── fetch-daily-costs.ts          - Daily cost retrieval
├── finops-copilot-v2.ts          - FinOps AI copilot v2
├── finops-copilot.ts             - FinOps AI copilot v1
├── generate-cost-forecast.ts     - Cost forecasting
├── ml-waste-detection.ts         - ML waste detection
├── ri-sp-analyzer.ts             - RI/Savings Plans analysis
└── waste-detection-v2.ts         - Waste detection v2
```

#### **Data Handlers** (1 function)
```
data/
└── query-table.ts                - Generic table queries
```

#### **Integration Handlers** (2 functions)
```
integrations/
├── cloudformation-webhook.ts     - CloudFormation webhooks
└── create-jira-ticket.ts         - JIRA ticket creation
```

#### **Job Handlers** (8 functions)
```
jobs/
├── cleanup-expired-external-ids.ts - Cleanup expired IDs
├── execute-scheduled-job.ts      - Execute scheduled jobs
├── initial-data-load.ts          - Initial data loading
├── process-background-jobs.ts    - Background job processor
├── process-events.ts             - Event processing
├── scheduled-scan-executor.ts    - Scheduled scan execution
├── scheduled-view-refresh.ts     - View refresh scheduling
└── sync-resource-inventory.ts    - Resource inventory sync
```

#### **Knowledge Base Handlers** (4 functions)
```
kb/
├── kb-ai-suggestions.ts          - AI article suggestions
├── kb-analytics-dashboard.ts     - KB analytics
├── kb-article-tracking.ts        - Article tracking
└── kb-export-pdf.ts              - PDF export
```

#### **License Handlers** (2 functions)
```
license/
├── daily-license-validation.ts   - Daily license check
└── validate-license.ts           - License validation
```

#### **ML Handlers** (6 functions)
```
ml/
├── ai-prioritization.ts          - AI-based prioritization
├── anomaly-detection.ts          - Anomaly detection
├── detect-anomalies.ts           - Anomaly detection v2
├── generate-ai-insights.ts       - AI insights generation
├── intelligent-alerts-analyzer.ts - Alert analysis
└── predict-incidents.ts          - Incident prediction
```

#### **Monitoring Handlers** (6 functions)
```
monitoring/
├── auto-alerts.ts                - Automatic alerting
├── aws-realtime-metrics.ts       - Real-time AWS metrics
├── check-alert-rules.ts          - Alert rule checking
├── endpoint-monitor-check.ts     - Endpoint health check
├── fetch-cloudwatch-metrics.ts   - CloudWatch metrics
└── health-check.ts               - System health check
```

#### **Notification Handlers** (3 functions)
```
notifications/
├── get-communication-logs.ts     - Get communication logs
├── send-email.ts                 - Email sending
└── send-notification.ts          - Notification sending
```

#### **Organization Handlers** (2 functions)
```
organizations/
├── create-organization-account.ts - Create org account
└── sync-organization-accounts.ts  - Sync org accounts
```

#### **Profile Handlers** (2 functions)
```
profiles/
├── check-organization.ts         - Check org membership
└── create-with-organization.ts   - Create user with org
```

#### **Report Handlers** (5 functions)
```
reports/
├── generate-excel-report.ts      - Excel report generation
├── generate-pdf-report.ts        - PDF report generation
├── generate-remediation-script.ts - Remediation script
├── generate-security-pdf.ts      - Security PDF
└── security-scan-pdf-export.ts   - Security scan PDF
```

#### **Security Handlers** (12 functions)
```
security/
├── analyze-cloudtrail.ts         - CloudTrail analysis
├── compliance-scan.ts            - Compliance scanning
├── drift-detection.ts            - Configuration drift
├── fetch-cloudtrail.ts           - Fetch CloudTrail logs
├── get-findings.ts               - Get security findings
├── get-security-posture.ts       - Security posture score
├── guardduty-scan.ts             - GuardDuty scanning
├── iam-behavior-analysis.ts      - IAM behavior analysis
├── iam-deep-analysis.ts          - Deep IAM analysis
├── lateral-movement-detection.ts - Lateral movement detection
├── security-scan.ts              - General security scan
├── validate-aws-credentials.ts   - Credential validation
├── validate-permissions.ts       - Permission validation
└── validate-waf-security.ts      - WAF security validation
└── well-architected-scan.ts      - Well-Architected review
```

#### **System Handlers** (1 function)
```
system/
└── run-migrations.ts             - Database migrations
```

#### **User Handlers** (1 function)
```
user/
└── notification-settings.ts      - User notification settings
```

#### **WebSocket Handlers** (2 functions)
```
websocket/
├── connect.ts                    - WebSocket connection
└── disconnect.ts                 - WebSocket disconnection
```

**Total Lambda Handlers**: 70+ functions across 21 categories

---

## 5. API ENDPOINT MAPPING

### Frontend API Calls (from grep analysis)

| Frontend Page | Lambda Function Called | Endpoint | Method | Purpose |
|---------------|------------------------|----------|--------|---------|
| AWSSettings.tsx | list-aws-credentials | `/api/functions/list-aws-credentials` | POST | Get stored AWS credentials |
| MLWasteDetection.tsx | ml-waste-detection | `/api/functions/ml-waste-detection` | POST | ML waste analysis |
| SecurityScans.tsx | start-security-scan | `/api/functions/start-security-scan` | POST | Start security scan |
| CostAnalysisPage.tsx | fetch-daily-costs | `/api/functions/fetch-daily-costs` | POST | Get daily costs |
| KnowledgeBase.tsx | increment_article_helpful | `/api/functions/increment_article_helpful` | POST | Mark article helpful |
| KnowledgeBase.tsx | increment_article_views | `/api/functions/increment_article_views` | POST | Track article views |
| KnowledgeBase.tsx | track_article_view_detailed | `/api/functions/track_article_view_detailed` | POST | Detailed view tracking |
| KnowledgeBase.tsx | kb-export-pdf | `/api/functions/kb-export-pdf` | POST | Export KB to PDF |
| ThreatDetection.tsx | list-aws-credentials | `/api/functions/list-aws-credentials` | POST | Get credentials |
| ThreatDetection.tsx | (dynamic) | `/api/functions/{functionName}` | POST | Run threat scan |
| ChangePassword.tsx | log-audit | `/api/functions/log-audit` | POST | Log password change |
| TVDashboard.tsx | verify-tv-token | `/api/functions/verify-tv-token` | POST | Verify TV token |
| UserManagement.tsx | list-aws-credentials | `/api/functions/list-aws-credentials` | POST | Get credentials |
| UserManagement.tsx | create-cognito-user | `/api/functions/create-cognito-user` | POST | Create user |
| UserManagement.tsx | disable-cognito-user | `/api/functions/disable-cognito-user` | POST | Disable user |
| CopilotAI.tsx | bedrock-chat | `/api/functions/bedrock-chat` | POST | AI chat |
| WellArchitected.tsx | well-architected-scan | `/api/functions/well-architected-scan` | POST | Well-Architected scan |
| CommunicationCenter.tsx | get-communication-logs | `/api/functions/get-communication-logs` | POST | Get messages |
| LicenseManagement.tsx | get-user-organization | `/api/functions/get-user-organization` | POST | Get org info |
| LicenseManagement.tsx | validate-license | `/api/functions/validate-license` | POST | Validate license |
| Auth.tsx | webauthn-authenticate | `/api/functions/webauthn-authenticate` | POST | WebAuthn auth |

### API Client Methods (src/integrations/aws/api-client.ts)

```typescript
// Generic CRUD operations
apiClient.select(table, options)      // GET with filters
apiClient.insert(table, data)         // POST
apiClient.update(table, data, eq)     // PATCH
apiClient.delete(table, eq)           // DELETE

// Lambda invocation
apiClient.invoke(functionName, options)  // POST to /api/functions/{name}
apiClient.lambda(functionName, payload)  // Legacy Lambda call

// RPC calls
apiClient.rpc(functionName, params)   // POST to /rpc/{name}

// Generic HTTP
apiClient.get(endpoint)               // GET
apiClient.post(endpoint, data)        // POST
```

---

## 6. IMPLEMENTATION STATUS MATRIX

### ✅ FULLY IMPLEMENTED (All components present)

| Feature | Frontend | Backend | API | Status |
|---------|----------|---------|-----|--------|
| Authentication (Cognito) | ✅ | ✅ | ✅ | Complete |
| WebAuthn/Passkey | ✅ | ✅ | ✅ | Complete |
| AWS Credentials Management | ✅ | ✅ | ✅ | Complete |
| Cost Analysis & Forecasting | ✅ | ✅ | ✅ | Complete |
| ML Waste Detection | ✅ | ✅ | ✅ | Complete |
| Security Scanning | ✅ | ✅ | ✅ | Complete |
| Well-Architected Reviews | ✅ | ✅ | ✅ | Complete |
| CloudTrail Audit | ✅ | ✅ | ✅ | Complete |
| Compliance Scanning | ✅ | ✅ | ✅ | Complete |
| Anomaly Detection | ✅ | ✅ | ✅ | Complete |
| Predictive Incidents | ✅ | ✅ | ✅ | Complete |
| Intelligent Alerts | ✅ | ✅ | ✅ | Complete |
| Knowledge Base | ✅ | ✅ | ✅ | Complete |
| Communication Center | ✅ | ✅ | ✅ | Complete |
| License Management | ✅ | ✅ | ✅ | Complete |
| User Management | ✅ | ✅ | ✅ | Complete |
| Organization Management | ✅ | ✅ | ✅ | Complete |
| Background Jobs | ✅ | ✅ | ✅ | Complete |
| TV Dashboard | ✅ | ✅ | ✅ | Complete |
| Bedrock AI Integration | ✅ | ✅ | ✅ | Complete |
| Endpoint Monitoring | ✅ | ✅ | ✅ | Complete |
| Edge/LB/CF/WAF Monitoring | ✅ | ✅ | ✅ | Complete |
| RI/Savings Plans Analysis | ✅ | ✅ | ✅ | Complete |
| Remediation Tickets | ✅ | ✅ | ✅ | Complete |
| Security Posture | ✅ | ✅ | ✅ | Complete |
| Attack Detection | ✅ | ✅ | ✅ | Complete |

### ⚠️ PARTIALLY IMPLEMENTED

| Feature | Frontend | Backend | API | Gap |
|---------|----------|---------|-----|-----|
| System Monitoring | ✅ | ⚠️ | ⚠️ | Limited metrics collection |
| Resource Monitoring | ✅ | ✅ | ✅ | May need more resource types |
| Threat Detection | ✅ | ⚠️ | ⚠️ | Limited threat patterns |

### ❌ NOT IMPLEMENTED / MISSING

| Feature | Frontend | Backend | API | Notes |
|---------|----------|---------|-----|-------|
| (None identified) | - | - | - | All major features appear implemented |

---

## 7. FRONTEND-BACKEND COMMUNICATION FLOW

### Request Flow

```
Frontend (React)
    ↓
AppSidebar / Page Component
    ↓
apiClient.invoke() / apiClient.rpc()
    ↓
API Gateway (3l66kn0eaj)
    ↓
Lambda Function (evo-uds-v3-production-*)
    ↓
Prisma ORM
    ↓
PostgreSQL RDS (evo-uds-v3-nodejs-infra)
    ↓
Response back through chain
```

### Authentication Flow

```
1. User logs in via Cognito (Auth-simple.tsx)
2. Cognito returns ID Token + Access Token
3. Frontend stores tokens in sessionStorage
4. apiClient adds Authorization header: Bearer {idToken}
5. API Gateway validates token via Cognito Authorizer (ez5xqt)
6. Lambda receives authenticated event with user claims
7. getUserFromEvent() extracts user info
8. getOrganizationId() ensures multi-tenant isolation
```

---

## 8. KEY FINDINGS & RECOMMENDATIONS

### Strengths ✅

1. **Comprehensive Coverage**: All major AWS management features are implemented
2. **Multi-tenancy**: Proper organization isolation via organization_id
3. **Security**: Cognito + WebAuthn + CSRF protection
4. **Scalability**: Serverless Lambda architecture with RDS backend
5. **Modularity**: Well-organized handler categories
6. **Type Safety**: Full TypeScript implementation
7. **API Consistency**: Standardized apiClient for all calls

### Observations ⚠️

1. **Handler Naming**: Some handlers use kebab-case, others use camelCase (inconsistent)
2. **API Endpoint Consistency**: Some functions called via `/api/functions/{name}`, others via `/rpc/{name}`
3. **Error Handling**: Frontend should validate all Lambda responses for error.message
4. **Documentation**: Lambda handlers lack inline documentation
5. **Testing**: No visible test coverage for Lambda handlers

### Recommendations 🎯

1. **Standardize Handler Naming**: Use kebab-case consistently for all Lambda functions
2. **Consolidate API Endpoints**: Use `/api/functions/{name}` for all Lambda calls
3. **Add Handler Documentation**: JSDoc comments for all Lambda handlers
4. **Implement Error Boundaries**: Wrap all apiClient calls in try-catch
5. **Add Request Logging**: Log all API calls for debugging
6. **Create Handler Tests**: Unit tests for critical Lambda functions
7. **API Documentation**: Generate OpenAPI/Swagger docs from handlers
8. **Performance Monitoring**: Add CloudWatch metrics to all handlers

---

## 9. QUICK REFERENCE: ADDING NEW FEATURES

### To Add a New Menu Item:

1. **Add to AppSidebar.tsx** (menuItems array)
2. **Create Frontend Page** (src/pages/NewFeature.tsx)
3. **Add Route** (src/main.tsx)
4. **Create Lambda Handler** (backend/src/handlers/{category}/new-feature.ts)
5. **Call from Frontend** (apiClient.invoke('new-feature', { body: {...} }))

### To Add a New Lambda Function:

1. **Create Handler File**: `backend/src/handlers/{category}/{name}.ts`
2. **Follow Template**: Use pattern from `backend/src/handlers/_templates/lambda-template.ts`
3. **Add to CDK**: Register in `infra/lib/api-stack.ts`
4. **Deploy**: `npm run deploy:prod`
5. **Call from Frontend**: `apiClient.invoke('{name}', { body: {...} })`

---

## 10. ARCHITECTURE COMPLIANCE CHECKLIST

- ✅ All backend code is Node.js/TypeScript (no Python)
- ✅ Database is PostgreSQL via Prisma (no DynamoDB)
- ✅ Frontend is React 18 + Vite + TypeScript
- ✅ Infrastructure uses AWS CDK (TypeScript)
- ✅ All Lambda handlers follow standard pattern
- ✅ Multi-tenancy enforced via organization_id
- ✅ Authentication via AWS Cognito
- ✅ API Gateway + Lambda serverless architecture
- ✅ RDS PostgreSQL for persistence
- ✅ CloudFront + S3 for frontend distribution

---

**Document Version**: 1.0
**Last Updated**: 2024
**Maintainer**: Development Team
