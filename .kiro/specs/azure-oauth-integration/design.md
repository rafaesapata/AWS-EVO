# Design Document: Azure OAuth Integration

## Overview

Este documento descreve a arquitetura e implementação da integração Azure OAuth/OIDC, permitindo que usuários conectem suas contas Azure com um único clique usando o fluxo OAuth 2.0 Authorization Code com PKCE.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Frontend      │────▶│   Backend       │────▶│   Azure AD      │
│   (React)       │     │   (Lambda)      │     │   (Microsoft)   │
│                 │◀────│                 │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       ▼                       │
        │               ┌─────────────────┐             │
        │               │   PostgreSQL    │             │
        │               │   (Encrypted    │             │
        │               │    Tokens)      │             │
        │               └─────────────────┘             │
        │                                               │
        └───────────────────────────────────────────────┘
                    OAuth Redirect Flow
```

### Fluxo OAuth Detalhado

```
1. User clicks "Connect with Azure"
   │
   ▼
2. Frontend calls POST /api/functions/azure-oauth-initiate
   │
   ▼
3. Backend generates:
   - state (random, stored in DB with expiry)
   - code_verifier (PKCE)
   - code_challenge (SHA256 of verifier)
   │
   ▼
4. Backend returns authorization URL
   │
   ▼
5. Frontend redirects to Azure AD
   │
   ▼
6. User authenticates & consents
   │
   ▼
7. Azure redirects to /azure/callback?code=xxx&state=xxx
   │
   ▼
8. Frontend calls POST /api/functions/azure-oauth-callback
   │
   ▼
9. Backend:
   - Validates state
   - Exchanges code for tokens
   - Encrypts refresh_token
   - Lists subscriptions
   - Saves credentials
   │
   ▼
10. Frontend shows success & subscription list
```

## Components and Interfaces

### 1. Azure App Registration (Pre-requisite)

Configuração necessária no Azure Portal:

```json
{
  "displayName": "EVO Platform - Azure Integration",
  "signInAudience": "AzureADMultipleOrgs",
  "web": {
    "redirectUris": [
      "https://evo.ai.udstec.io/azure/callback",
      "http://localhost:5173/azure/callback"
    ]
  },
  "requiredResourceAccess": [
    {
      "resourceAppId": "797f4846-ba00-4fd7-ba43-dac1f8f63013",
      "resourceAccess": [
        {
          "id": "41094075-9dad-400e-a0bd-54e686782033",
          "type": "Scope"
        }
      ]
    }
  ],
  "api": {
    "requestedAccessTokenVersion": 2
  }
}
```

### 2. Backend Handlers

#### azure-oauth-initiate.ts

```typescript
interface InitiateRequest {
  // No body required - uses authenticated user context
}

interface InitiateResponse {
  authorizationUrl: string;
  state: string; // For frontend to verify on callback
}

// Endpoint: POST /api/functions/azure-oauth-initiate
// Auth: Required (Cognito)
```

#### azure-oauth-callback.ts

```typescript
interface CallbackRequest {
  code: string;           // Authorization code from Azure
  state: string;          // State parameter to validate
  codeVerifier: string;   // PKCE code verifier
}

interface CallbackResponse {
  success: boolean;
  subscriptions: AzureSubscription[];
  message?: string;
}

interface AzureSubscription {
  subscriptionId: string;
  subscriptionName: string;
  tenantId: string;
  state: string; // Enabled, Disabled, etc.
}

// Endpoint: POST /api/functions/azure-oauth-callback
// Auth: Required (Cognito)
```

#### azure-oauth-refresh.ts

```typescript
interface RefreshRequest {
  credentialId: string;
}

interface RefreshResponse {
  success: boolean;
  expiresAt?: string;
  error?: string;
}

// Endpoint: POST /api/functions/azure-oauth-refresh
// Auth: Required (Cognito)
// Note: Also called internally by other Azure handlers
```

#### azure-oauth-revoke.ts

```typescript
interface RevokeRequest {
  credentialId: string;
}

interface RevokeResponse {
  success: boolean;
  azureRevokeUrl?: string; // URL to revoke in Azure Portal
}

// Endpoint: POST /api/functions/azure-oauth-revoke
// Auth: Required (Cognito)
```

### 3. Frontend Components

#### AzureOAuthButton.tsx

```typescript
interface AzureOAuthButtonProps {
  onSuccess: (subscriptions: AzureSubscription[]) => void;
  onError: (error: string) => void;
}

// Renders "Connect with Azure" button
// Handles OAuth popup/redirect flow
// Stores code_verifier in sessionStorage
```

#### AzureSubscriptionSelector.tsx

```typescript
interface AzureSubscriptionSelectorProps {
  subscriptions: AzureSubscription[];
  onSelect: (selected: AzureSubscription[]) => void;
}

// Shows list of available subscriptions
// Allows multi-select
// Validates access before saving
```

### 4. Database Schema Updates

```sql
-- Add OAuth fields to azure_credentials table
ALTER TABLE azure_credentials ADD COLUMN IF NOT EXISTS auth_type VARCHAR(20) DEFAULT 'service_principal';
ALTER TABLE azure_credentials ADD COLUMN IF NOT EXISTS encrypted_refresh_token TEXT;
ALTER TABLE azure_credentials ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP;
ALTER TABLE azure_credentials ADD COLUMN IF NOT EXISTS oauth_tenant_id VARCHAR(100);
ALTER TABLE azure_credentials ADD COLUMN IF NOT EXISTS oauth_user_email VARCHAR(255);
ALTER TABLE azure_credentials ADD COLUMN IF NOT EXISTS last_refresh_at TIMESTAMP;
ALTER TABLE azure_credentials ADD COLUMN IF NOT EXISTS refresh_error TEXT;

-- OAuth state storage (temporary, for CSRF protection)
CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id VARCHAR(255) NOT NULL,
  state VARCHAR(255) NOT NULL UNIQUE,
  code_verifier VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_oauth_states_state ON oauth_states(state);
CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);
```

## Data Models

### Prisma Schema Updates

```prisma
model AzureCredential {
  id                    String    @id @default(uuid())
  organizationId        String    @map("organization_id")
  subscriptionId        String    @map("subscription_id")
  subscriptionName      String?   @map("subscription_name")
  
  // Service Principal fields (existing)
  tenantId              String?   @map("tenant_id")
  clientId              String?   @map("client_id")
  encryptedClientSecret String?   @map("encrypted_client_secret")
  
  // OAuth fields (new)
  authType              String    @default("service_principal") @map("auth_type")
  encryptedRefreshToken String?   @map("encrypted_refresh_token")
  tokenExpiresAt        DateTime? @map("token_expires_at")
  oauthTenantId         String?   @map("oauth_tenant_id")
  oauthUserEmail        String?   @map("oauth_user_email")
  lastRefreshAt         DateTime? @map("last_refresh_at")
  refreshError          String?   @map("refresh_error")
  
  // Common fields
  isActive              Boolean   @default(true) @map("is_active")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")
  
  @@map("azure_credentials")
}

model OAuthState {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  userId         String   @map("user_id")
  state          String   @unique
  codeVerifier   String   @map("code_verifier")
  createdAt      DateTime @default(now()) @map("created_at")
  expiresAt      DateTime @map("expires_at")
  used           Boolean  @default(false)
  
  @@map("oauth_states")
}
```

### Token Encryption

```typescript
// lib/token-encryption.ts

interface EncryptedToken {
  ciphertext: string;  // Base64 encoded
  iv: string;          // Base64 encoded
  tag: string;         // Base64 encoded (for GCM)
  keyId: string;       // For key rotation
}

// Uses AES-256-GCM with organization-specific derived keys
// Master key stored in AWS Secrets Manager or environment variable
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: State Parameter Uniqueness

*For any* set of OAuth initiations, all generated state parameters SHALL be unique and have at least 256 bits of entropy.

**Validates: Requirements 1.3, 2.1**

### Property 2: PKCE Code Challenge Correctness

*For any* code_verifier of at least 43 characters, the code_challenge SHALL equal the base64url-encoded SHA256 hash of the code_verifier.

**Validates: Requirements 1.2, 2.4, 8.1**

### Property 3: Token Encryption Round-Trip

*For any* valid refresh_token string, encrypting then decrypting SHALL produce the original token value unchanged.

**Validates: Requirements 2.5, 3.1, 3.5**

### Property 4: State Expiration Enforcement

*For any* OAuth state with creation time more than 10 minutes ago, the callback handler SHALL reject it and return an error.

**Validates: Requirements 1.5, 2.2**

### Property 5: Invalid State Rejection

*For any* callback request with a state parameter that does not exist in the database or has already been used, the system SHALL reject it and not process the authorization code.

**Validates: Requirements 2.1, 2.2**

### Property 6: Credential Organization Isolation

*For any* OAuth credential query, the results SHALL only include credentials where organization_id matches the requesting user's organization.

**Validates: Requirements 3.2, 8.4**

### Property 7: Access Token Non-Persistence

*For any* database query on azure_credentials table, the result SHALL NOT contain any access_token values (only encrypted refresh_tokens).

**Validates: Requirements 3.3**

### Property 8: Token Refresh Auto-Trigger

*For any* access_token that expires within 5 minutes, the system SHALL automatically attempt to refresh it before making Azure API calls.

**Validates: Requirements 4.1**

### Property 9: Invalid Credential No-Refresh

*For any* credential marked as invalid (refresh_error is not null), the system SHALL NOT attempt token refresh until the user re-authenticates.

**Validates: Requirements 4.5**

### Property 10: Credential Deletion Cascade

*For any* OAuth credential deletion, all associated scheduled scans for that subscription SHALL be stopped/deleted.

**Validates: Requirements 6.1, 6.3**

### Property 11: Redirect URI Whitelist

*For any* OAuth callback, the redirect_uri parameter SHALL match one of the pre-configured whitelist values.

**Validates: Requirements 8.2**

### Property 12: Token Non-Exposure in Logs

*For any* log entry or error message generated by the OAuth system, it SHALL NOT contain access_token or refresh_token values.

**Validates: Requirements 8.6, 8.7**

### Property 13: Mixed Auth Type Support

*For any* organization, the system SHALL support having both OAuth and Service Principal credentials simultaneously without conflict.

**Validates: Requirements 7.4**

## Error Handling

### OAuth Errors

| Error Code | Description | User Message |
|------------|-------------|--------------|
| `invalid_state` | State parameter mismatch | "Session expired. Please try again." |
| `access_denied` | User denied consent | "You declined the authorization request." |
| `invalid_grant` | Code expired or already used | "Authorization expired. Please try again." |
| `consent_required` | Admin consent needed | "Your Azure administrator needs to approve this app." |
| `token_refresh_failed` | Refresh token invalid | "Your Azure connection expired. Please reconnect." |

### Error Response Format

```typescript
interface OAuthErrorResponse {
  error: string;
  errorDescription: string;
  userMessage: string;
  retryable: boolean;
  reconnectRequired?: boolean;
}
```

## Testing Strategy

### Unit Tests

- State generation randomness
- PKCE code_challenge calculation
- Token encryption/decryption
- State expiration logic
- Error message mapping

### Property-Based Tests

- State uniqueness across many generations
- Encryption round-trip for various token lengths
- PKCE verifier/challenge relationship
- Concurrent refresh handling

### Integration Tests

- Full OAuth flow with mock Azure AD
- Token refresh flow
- Subscription listing
- Credential revocation

### E2E Tests (Manual)

- Complete OAuth flow in browser
- Multi-subscription selection
- Token expiration and auto-refresh
- Disconnect and reconnect

## Security Considerations

### Token Storage

1. **Never store access_tokens** - Only keep in memory during request
2. **Encrypt refresh_tokens** - AES-256-GCM before database storage
3. **Key rotation** - Support multiple encryption keys for rotation

### CSRF Protection

1. **State parameter** - Cryptographically random, single-use
2. **State expiration** - 10 minute maximum lifetime
3. **State binding** - Tied to user session/organization

### Rate Limiting

1. **Initiate endpoint** - 5 requests/minute per user
2. **Callback endpoint** - 10 requests/minute per IP
3. **Refresh endpoint** - 20 requests/minute per organization

### Audit Logging

Log all OAuth events:
- `oauth.initiate` - User started OAuth flow
- `oauth.callback.success` - Successful authorization
- `oauth.callback.failure` - Failed authorization (with reason)
- `oauth.refresh.success` - Token refreshed
- `oauth.refresh.failure` - Refresh failed
- `oauth.revoke` - User disconnected

## Environment Variables

```bash
# Azure App Registration
AZURE_OAUTH_CLIENT_ID=<app-client-id>
AZURE_OAUTH_CLIENT_SECRET=<app-client-secret>
AZURE_OAUTH_REDIRECT_URI=https://evo.ai.udstec.io/azure/callback

# Token Encryption
TOKEN_ENCRYPTION_KEY=<32-byte-base64-key>

# Optional: Use AWS Secrets Manager instead
# AWS_SECRETS_AZURE_OAUTH=evo/azure-oauth-secrets
```
