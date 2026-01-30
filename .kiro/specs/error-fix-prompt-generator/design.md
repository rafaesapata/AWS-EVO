# Error Fix Prompt Generator - Design Document

## Overview

This document outlines the technical design for enhancing the AI-Powered Error Fix Prompt Generator system. The design addresses all requirements specified in `requirements.md` while adhering to the project's Node.js/TypeScript architecture.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Platform Monitoring UI                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ Error List  │  │  Get Fix    │  │ Fix Modal   │  │  Feedback   │   │
│  │  Component  │──│   Button    │──│  Display    │──│  Collector  │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           API Gateway                                    │
│  POST /api/functions/generate-error-fix-prompt                          │
│  POST /api/functions/submit-fix-feedback                                │
│  GET  /api/functions/get-fix-analytics                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Lambda Functions                                 │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐ │
│  │ generate-error-fix  │  │ submit-fix-feedback │  │ get-fix-        │ │
│  │ -prompt             │  │                     │  │ analytics       │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Core Services                                    │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐ │
│  │ Pattern Matcher     │  │ Prompt Generator    │  │ Context         │ │
│  │ Service             │  │ Service             │  │ Resolver        │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL (Prisma)                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │ error_patterns  │  │ fix_prompts     │  │ fix_feedback            │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Models

### Prisma Schema Additions

```prisma
// Error pattern definitions
model ErrorPattern {
  id              String   @id @default(uuid())
  name            String   @unique
  category        String   // deployment, database, dependencies, api-gateway, performance, auth, permissions
  regex_pattern   String   // Regex to match error messages
  priority        Int      @default(100) // Lower = higher priority for multiple matches
  severity        String   // critical, high, medium, low
  version         Int      @default(1)
  is_active       Boolean  @default(true)
  
  // Prompt template
  title_template_en    String
  title_template_pt    String
  diagnosis_template   String   @db.Text
  solution_template    String   @db.Text
  validation_commands  String[] // Commands to verify fix
  estimated_time_min   Int      @default(5)
  documentation_links  String[]
  common_pitfalls      String[] // Warnings to include
  
  // Metadata
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
  created_by      String?
  
  // Relations
  fix_prompts     FixPrompt[]
  
  @@index([category])
  @@index([is_active])
}

// Generated fix prompts (for caching and analytics)
model FixPrompt {
  id              String   @id @default(uuid())
  organization_id String
  pattern_id      String?
  
  // Error context
  error_message   String   @db.Text
  lambda_name     String?
  error_source    String?  // cloudwatch, api-gateway, frontend
  
  // Generated content
  prompt_content  String   @db.Text
  language        String   @default("en") // en, pt
  
  // Tracking
  was_applied     Boolean  @default(false)
  was_successful  Boolean?
  resolution_time_min Int?
  
  created_at      DateTime @default(now())
  
  // Relations
  pattern         ErrorPattern? @relation(fields: [pattern_id], references: [id])
  feedback        FixFeedback[]
  
  @@index([organization_id])
  @@index([pattern_id])
  @@index([created_at])
}

// User feedback on fix prompts
model FixFeedback {
  id              String   @id @default(uuid())
  fix_prompt_id   String
  user_id         String
  organization_id String
  
  was_helpful     Boolean
  feedback_text   String?  @db.Text
  failure_reason  String?  // Pattern categories for unsuccessful fixes
  
  created_at      DateTime @default(now())
  
  // Relations
  fix_prompt      FixPrompt @relation(fields: [fix_prompt_id], references: [id])
  
  @@index([fix_prompt_id])
  @@index([organization_id])
}
```

## Component Design

### 1. Pattern Matcher Service

**Location:** `backend/src/lib/error-fix/pattern-matcher.ts`

```typescript
interface PatternMatchResult {
  pattern: ErrorPattern | null;
  confidence: number; // 0-100
  matchedGroups: Record<string, string>; // Captured regex groups
}

interface PatternMatcherService {
  // Find best matching pattern for an error
  findPattern(errorMessage: string): Promise<PatternMatchResult>;
  
  // Get all patterns by category
  getPatternsByCategory(category: string): Promise<ErrorPattern[]>;
  
  // Validate a pattern regex
  validatePattern(regex: string, testCases: string[]): ValidationResult;
}
```

**Pattern Categories:**
- `deployment` - Lambda deploy issues, module not found
- `database` - Prisma, connection, query errors
- `dependencies` - Missing npm packages, SDK issues
- `api-gateway` - CORS, authorization, routing
- `performance` - Timeout, memory, throttling
- `authentication` - Cognito, JWT, MFA issues
- `permissions` - IAM, STS, access denied

### 2. Prompt Generator Service

**Location:** `backend/src/lib/error-fix/prompt-generator.ts`

```typescript
interface PromptGeneratorOptions {
  language: 'en' | 'pt';
  includeDocLinks: boolean;
  includeValidation: boolean;
  includeRollback: boolean;
}

interface GeneratedPrompt {
  title: string;
  severity: string;
  estimatedTime: string;
  sections: {
    diagnosis: string;
    rootCause: string;
    solution: string;
    validation: string;
    rollback?: string;
    warnings: string[];
    documentation: string[];
  };
  copyableCommands: string[];
  markdown: string; // Full rendered markdown
}

interface PromptGeneratorService {
  // Generate fix prompt from pattern and context
  generate(
    pattern: ErrorPattern,
    context: ErrorContext,
    options: PromptGeneratorOptions
  ): Promise<GeneratedPrompt>;
  
  // Generate generic prompt when no pattern matches
  generateGeneric(
    errorMessage: string,
    context: ErrorContext,
    options: PromptGeneratorOptions
  ): Promise<GeneratedPrompt>;
}
```

### 3. Context Resolver Service

**Location:** `backend/src/lib/error-fix/context-resolver.ts`

```typescript
interface ErrorContext {
  // Lambda context
  lambdaName?: string;
  handlerPath?: string;
  handlerCategory?: string; // auth, security, cost, etc.
  
  // Infrastructure context
  region: string;
  vpcId?: string;
  subnetIds?: string[];
  securityGroupId?: string;
  
  // Database context
  databaseUrl?: string; // Sanitized
  rdsEndpoint?: string;
  
  // API Gateway context
  apiGatewayId: string;
  stage: string;
  authorizerId?: string;
  
  // Layer context
  currentLayerArn?: string;
  recommendedLayerArn?: string;
  
  // Cognito context
  userPoolId?: string;
  clientId?: string;
  
  // Organization context
  organizationId: string;
}

interface ContextResolverService {
  // Resolve full context from Lambda name
  resolveFromLambda(lambdaName: string, orgId: string): Promise<ErrorContext>;
  
  // Get infrastructure constants
  getInfrastructureContext(): InfrastructureContext;
}
```

### 4. Expanded Error Patterns (15+ patterns)

```typescript
const ERROR_PATTERNS = [
  // Deployment Errors (3)
  {
    name: 'lambda-module-not-found',
    category: 'deployment',
    regex: /Cannot find module ['"]\.\.\/\.\.\/lib\/([^'"]+)['"]/,
    severity: 'critical',
  },
  {
    name: 'lambda-handler-not-found',
    category: 'deployment',
    regex: /Runtime\.ImportModuleError.*Cannot find module ['"]([^'"]+)['"]/,
    severity: 'critical',
  },
  {
    name: 'lambda-handler-path-incorrect',
    category: 'deployment',
    regex: /Handler '([^']+)' missing on module/,
    severity: 'critical',
  },
  
  // Database Errors (3)
  {
    name: 'prisma-init-error',
    category: 'database',
    regex: /PrismaClientInitializationError/,
    severity: 'critical',
  },
  {
    name: 'database-connection-refused',
    category: 'database',
    regex: /Can't reach database server at ['"]([^'"]+)['"]/,
    severity: 'critical',
  },
  {
    name: 'prisma-query-error',
    category: 'database',
    regex: /PrismaClientKnownRequestError.*code: ['"]([^'"]+)['"]/,
    severity: 'high',
  },
  
  // Dependencies Errors (3)
  {
    name: 'azure-sdk-missing',
    category: 'dependencies',
    regex: /Azure SDK not installed|Cannot find module ['"]@azure\/([^'"]+)['"]/,
    severity: 'critical',
  },
  {
    name: 'aws-sdk-missing',
    category: 'dependencies',
    regex: /Cannot find module ['"]@aws-sdk\/([^'"]+)['"]/,
    severity: 'critical',
  },
  {
    name: 'typespec-missing',
    category: 'dependencies',
    regex: /Cannot find module ['"]@typespec\/([^'"]+)['"]/,
    severity: 'critical',
  },
  
  // API Gateway Errors (2)
  {
    name: 'cors-origin-error',
    category: 'api-gateway',
    regex: /Access-Control-Allow-Origin|CORS policy/,
    severity: 'high',
  },
  {
    name: 'authorizer-error',
    category: 'api-gateway',
    regex: /Cannot read properties of undefined \(reading 'authorizer'\)/,
    severity: 'high',
  },
  
  // Performance Errors (2)
  {
    name: 'lambda-timeout',
    category: 'performance',
    regex: /Task timed out after (\d+\.\d+) seconds/,
    severity: 'high',
  },
  {
    name: 'lambda-memory-exceeded',
    category: 'performance',
    regex: /Runtime exited with error.*memory/i,
    severity: 'high',
  },
  
  // Authentication Errors (2)
  {
    name: 'cognito-token-expired',
    category: 'authentication',
    regex: /Token expired|jwt expired/i,
    severity: 'medium',
  },
  {
    name: 'cognito-invalid-token',
    category: 'authentication',
    regex: /Invalid token|jwt malformed/i,
    severity: 'medium',
  },
  
  // Permissions Errors (2)
  {
    name: 'sts-assume-role-denied',
    category: 'permissions',
    regex: /is not authorized to perform: sts:AssumeRole/,
    severity: 'critical',
  },
  {
    name: 'iam-access-denied',
    category: 'permissions',
    regex: /AccessDeniedException|Access Denied/,
    severity: 'high',
  },
];
```

## API Design

### 1. Generate Error Fix Prompt (Enhanced)

**Endpoint:** `POST /api/functions/generate-error-fix-prompt`

**Request:**
```typescript
interface GenerateFixPromptRequest {
  errorMessage: string;
  lambdaName?: string;
  errorSource?: 'cloudwatch' | 'api-gateway' | 'frontend';
  language?: 'en' | 'pt';
  includeDocLinks?: boolean;
  includeValidation?: boolean;
}
```

**Response:**
```typescript
interface GenerateFixPromptResponse {
  success: boolean;
  data: {
    promptId: string;
    pattern: {
      name: string;
      category: string;
      confidence: number;
    } | null;
    prompt: {
      title: string;
      severity: string;
      estimatedTime: string;
      markdown: string;
      copyableCommands: string[];
    };
    cached: boolean;
  };
}
```

### 2. Submit Fix Feedback (New)

**Endpoint:** `POST /api/functions/submit-fix-feedback`

**Request:**
```typescript
interface SubmitFeedbackRequest {
  fixPromptId: string;
  wasHelpful: boolean;
  feedbackText?: string;
  failureReason?: string;
  resolutionTimeMin?: number;
}
```

### 3. Get Fix Analytics (New)

**Endpoint:** `GET /api/functions/get-fix-analytics`

**Response:**
```typescript
interface FixAnalyticsResponse {
  success: boolean;
  data: {
    totalPrompts: number;
    successRate: number;
    byCategory: {
      category: string;
      count: number;
      successRate: number;
    }[];
    topPatterns: {
      name: string;
      count: number;
      successRate: number;
    }[];
    averageResolutionTime: number;
  };
}
```

## Frontend Components

### 1. ErrorFixButton Component

**Location:** `src/components/monitoring/ErrorFixButton.tsx`

```tsx
interface ErrorFixButtonProps {
  errorMessage: string;
  lambdaName?: string;
  errorSource?: string;
  onFixGenerated?: (prompt: GeneratedPrompt) => void;
}
```

### 2. FixPromptModal Component

**Location:** `src/components/monitoring/FixPromptModal.tsx`

Features:
- Markdown rendering with syntax highlighting
- Copy to clipboard for commands
- Export as markdown file
- Feedback submission form
- Mark as resolved action

### 3. FixAnalyticsDashboard Component

**Location:** `src/components/monitoring/FixAnalyticsDashboard.tsx`

Features:
- Success rate charts
- Pattern distribution pie chart
- Resolution time trends
- Top error patterns table

## Security Considerations

1. **Input Sanitization:** All error messages sanitized to remove potential PII
2. **Rate Limiting:** 10 requests per minute per organization
3. **Audit Logging:** All prompt generations logged with user and timestamp
4. **Secret Masking:** DATABASE_URL and other secrets masked in prompts
5. **Multi-Tenant Isolation:** All queries filtered by organization_id

## Implementation Plan

### Phase 1: Core Enhancements (Week 1)
1. Add Prisma models for patterns, prompts, feedback
2. Implement PatternMatcherService with 15 patterns
3. Implement ContextResolverService
4. Update generate-error-fix-prompt handler

### Phase 2: Frontend Integration (Week 2)
1. Create ErrorFixButton component
2. Create FixPromptModal component
3. Integrate with Platform Monitoring dashboard
4. Add clipboard and export functionality

### Phase 3: Feedback System (Week 3)
1. Create submit-fix-feedback handler
2. Create get-fix-analytics handler
3. Create FixAnalyticsDashboard component
4. Add feedback collection to modal

### Phase 4: Multi-Language Support (Week 4)
1. Add Portuguese translations for all patterns
2. Implement language detection/selection
3. Update prompt templates for both languages

## File Structure

```
backend/src/
├── handlers/
│   └── monitoring/
│       ├── generate-error-fix-prompt.ts (enhanced)
│       ├── submit-fix-feedback.ts (new)
│       └── get-fix-analytics.ts (new)
├── lib/
│   └── error-fix/
│       ├── index.ts
│       ├── pattern-matcher.ts (new)
│       ├── prompt-generator.ts (new)
│       ├── context-resolver.ts (new)
│       └── patterns/
│           ├── deployment.ts
│           ├── database.ts
│           ├── dependencies.ts
│           ├── api-gateway.ts
│           ├── performance.ts
│           ├── authentication.ts
│           └── permissions.ts

src/components/
└── monitoring/
    ├── ErrorFixButton.tsx (new)
    ├── FixPromptModal.tsx (new)
    └── FixAnalyticsDashboard.tsx (new)
```

## Testing Strategy

1. **Unit Tests:** Pattern matching accuracy with real error samples
2. **Integration Tests:** End-to-end prompt generation flow
3. **Real Error Testing:** Use actual CloudWatch error logs (no mocks)
4. **Multi-Language Tests:** Verify PT/EN prompt quality

## Success Metrics Tracking

| Metric | Target | Measurement |
|--------|--------|-------------|
| Pattern Coverage | 90% | Matched vs generic prompts |
| Fix Success Rate | 80% | Positive feedback ratio |
| Response Time | <2s | P95 latency |
| User Satisfaction | 85% | Feedback scores |
| False Positive Rate | <10% | Incorrect pattern matches |

## Dependencies

- Existing: Prisma, PostgreSQL, React, shadcn/ui
- New: react-markdown (for prompt rendering), prism-react-renderer (syntax highlighting)
