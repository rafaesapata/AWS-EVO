# Error Fix Prompt Generator - Implementation Tasks

## Phase 1: Core Enhancements

### Task 1.1: Add Prisma Models
- [ ] Add `ErrorPattern` model to `backend/prisma/schema.prisma`
- [ ] Add `FixPrompt` model to `backend/prisma/schema.prisma`
- [ ] Add `FixFeedback` model to `backend/prisma/schema.prisma`
- [ ] Run `npx prisma migrate dev --name add-error-fix-models`
- [ ] Update Lambda layer with new Prisma client

**Files:**
- `backend/prisma/schema.prisma`

### Task 1.2: Create Pattern Matcher Service
- [ ] Create `backend/src/lib/error-fix/pattern-matcher.ts`
- [ ] Implement `findPattern()` method with regex matching
- [ ] Implement pattern priority handling for multiple matches
- [ ] Add pattern validation utility
- [ ] Export from `backend/src/lib/error-fix/index.ts`

**Files:**
- `backend/src/lib/error-fix/pattern-matcher.ts`
- `backend/src/lib/error-fix/index.ts`

### Task 1.3: Create Error Pattern Definitions
- [ ] Create `backend/src/lib/error-fix/patterns/deployment.ts` (3 patterns)
- [ ] Create `backend/src/lib/error-fix/patterns/database.ts` (3 patterns)
- [ ] Create `backend/src/lib/error-fix/patterns/dependencies.ts` (3 patterns)
- [ ] Create `backend/src/lib/error-fix/patterns/api-gateway.ts` (2 patterns)
- [ ] Create `backend/src/lib/error-fix/patterns/performance.ts` (2 patterns)
- [ ] Create `backend/src/lib/error-fix/patterns/authentication.ts` (2 patterns)
- [ ] Create `backend/src/lib/error-fix/patterns/permissions.ts` (2 patterns)

**Files:**
- `backend/src/lib/error-fix/patterns/*.ts`

### Task 1.4: Create Context Resolver Service
- [ ] Create `backend/src/lib/error-fix/context-resolver.ts`
- [ ] Implement `resolveFromLambda()` to extract handler category
- [ ] Implement `getInfrastructureContext()` with correct IDs from steering
- [ ] Add VPC, subnet, security group resolution
- [ ] Add Layer ARN resolution

**Files:**
- `backend/src/lib/error-fix/context-resolver.ts`

### Task 1.5: Create Prompt Generator Service
- [ ] Create `backend/src/lib/error-fix/prompt-generator.ts`
- [ ] Implement template variable substitution
- [ ] Implement markdown generation with sections
- [ ] Add command escaping for copy-paste
- [ ] Add multi-language support (EN/PT)

**Files:**
- `backend/src/lib/error-fix/prompt-generator.ts`

### Task 1.6: Update generate-error-fix-prompt Handler
- [ ] Integrate PatternMatcherService
- [ ] Integrate ContextResolverService
- [ ] Integrate PromptGeneratorService
- [ ] Add prompt caching to database
- [ ] Add language parameter support
- [ ] Deploy updated Lambda

**Files:**
- `backend/src/handlers/monitoring/generate-error-fix-prompt.ts`

---

## Phase 2: Frontend Integration

### Task 2.1: Create ErrorFixButton Component
- [ ] Create `src/components/monitoring/ErrorFixButton.tsx`
- [ ] Add loading state with spinner
- [ ] Add error handling with toast
- [ ] Style with shadcn/ui Button

**Files:**
- `src/components/monitoring/ErrorFixButton.tsx`

### Task 2.2: Create FixPromptModal Component
- [ ] Create `src/components/monitoring/FixPromptModal.tsx`
- [ ] Add markdown rendering with react-markdown
- [ ] Add syntax highlighting for code blocks
- [ ] Add copy-to-clipboard for commands
- [ ] Add export as markdown file
- [ ] Add severity badge display

**Files:**
- `src/components/monitoring/FixPromptModal.tsx`

### Task 2.3: Integrate with Platform Monitoring
- [ ] Add ErrorFixButton to error list items
- [ ] Add FixPromptModal to page
- [ ] Connect button click to modal open
- [ ] Pass error context to API call

**Files:**
- `src/pages/PlatformMonitoring.tsx`
- `src/components/monitoring/ErrorList.tsx`

### Task 2.4: Add Clipboard and Export
- [ ] Implement copy full prompt to clipboard
- [ ] Implement copy individual command
- [ ] Implement download as .md file
- [ ] Add success toast notifications

**Files:**
- `src/components/monitoring/FixPromptModal.tsx`

---

## Phase 3: Feedback System

### Task 3.1: Create submit-fix-feedback Handler
- [ ] Create `backend/src/handlers/monitoring/submit-fix-feedback.ts`
- [ ] Add input validation with Zod schema
- [ ] Save feedback to FixFeedback table
- [ ] Update FixPrompt was_successful field
- [ ] Deploy Lambda and create API Gateway endpoint

**Files:**
- `backend/src/handlers/monitoring/submit-fix-feedback.ts`
- `backend/src/lib/schemas.ts`

### Task 3.2: Create get-fix-analytics Handler
- [ ] Create `backend/src/handlers/monitoring/get-fix-analytics.ts`
- [ ] Implement success rate calculation
- [ ] Implement category breakdown query
- [ ] Implement top patterns query
- [ ] Deploy Lambda and create API Gateway endpoint

**Files:**
- `backend/src/handlers/monitoring/get-fix-analytics.ts`

### Task 3.3: Add Feedback Form to Modal
- [ ] Add "Was this helpful?" buttons
- [ ] Add optional feedback text area
- [ ] Add failure reason dropdown
- [ ] Submit feedback on close

**Files:**
- `src/components/monitoring/FixPromptModal.tsx`

### Task 3.4: Create FixAnalyticsDashboard Component
- [ ] Create `src/components/monitoring/FixAnalyticsDashboard.tsx`
- [ ] Add success rate chart (recharts)
- [ ] Add category distribution pie chart
- [ ] Add top patterns table
- [ ] Add resolution time trend

**Files:**
- `src/components/monitoring/FixAnalyticsDashboard.tsx`

---

## Phase 4: Multi-Language Support

### Task 4.1: Add Portuguese Pattern Templates
- [ ] Add PT title templates to all patterns
- [ ] Add PT diagnosis templates
- [ ] Add PT solution templates
- [ ] Add PT warning messages

**Files:**
- `backend/src/lib/error-fix/patterns/*.ts`

### Task 4.2: Implement Language Selection
- [ ] Add language parameter to API
- [ ] Detect user language from i18n context
- [ ] Pass language to prompt generator
- [ ] Add language toggle in modal

**Files:**
- `backend/src/handlers/monitoring/generate-error-fix-prompt.ts`
- `src/components/monitoring/FixPromptModal.tsx`

### Task 4.3: Add i18n Translations
- [ ] Add PT translations for UI strings
- [ ] Add EN translations for UI strings
- [ ] Update FixPromptModal to use i18n

**Files:**
- `src/i18n/locales/pt.json`
- `src/i18n/locales/en.json`

---

## Deployment Checklist

### After Each Phase:
- [ ] Run `npm run build --prefix backend`
- [ ] Deploy affected Lambdas using `./scripts/deploy-lambda.sh`
- [ ] Create API Gateway endpoints if new handlers
- [ ] Deploy frontend with `npm run build && aws s3 sync`
- [ ] Invalidate CloudFront cache
- [ ] Test in production environment

### Documentation Updates:
- [ ] Update `.kiro/steering/lambda-functions-reference.md` with new Lambdas
- [ ] Update `.kiro/steering/api-gateway-endpoints.md` with new endpoints
- [ ] Update `ERROR_MONITORING_COMPREHENSIVE_GUIDE.md`
