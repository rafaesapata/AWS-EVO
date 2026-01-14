# Implementation Plan: Azure OAuth Integration

## Overview

Este plano implementa a integração Azure OAuth/OIDC em fases incrementais, começando pela infraestrutura de banco de dados, seguido pelos handlers backend, e finalizando com os componentes frontend.

## Tasks

- [x] 1. Database Schema and Prisma Updates
  - [x] 1.1 Add OAuth fields to AzureCredential model in Prisma schema
    - Add auth_type, encrypted_refresh_token, token_expires_at, oauth_tenant_id, oauth_user_email, last_refresh_at, refresh_error fields
    - _Requirements: 3.1, 3.2, 3.4_
  - [x] 1.2 Create OAuthState model in Prisma schema
    - Add id, organization_id, user_id, state, code_verifier, created_at, expires_at, used fields
    - _Requirements: 1.5, 2.1_
  - [x] 1.3 Generate and run Prisma migration
    - Run `npx prisma migrate dev --name add_azure_oauth`
    - _Requirements: 3.1, 3.2_

- [x] 2. Token Encryption Library
  - [x] 2.1 Create token-encryption.ts library
    - Implement AES-256-GCM encryption with IV and auth tag
    - Support key rotation with keyId field
    - _Requirements: 3.5, 2.5_
  - [x] 2.2 Write property test for encryption round-trip
    - **Property 3: Token Encryption Round-Trip**
    - **Validates: Requirements 2.5, 3.1, 3.5**

- [x] 3. OAuth Utilities Library
  - [x] 3.1 Create oauth-utils.ts library
    - Implement generateState() - 256-bit random state
    - Implement generatePKCE() - code_verifier and code_challenge
    - Implement buildAuthorizationUrl() - construct Azure AD URL
    - _Requirements: 1.2, 1.3, 1.4_
  - [x] 3.2 Write property test for state uniqueness
    - **Property 1: State Parameter Uniqueness**
    - **Validates: Requirements 1.3, 2.1**
  - [x] 3.3 Write property test for PKCE correctness
    - **Property 2: PKCE Code Challenge Correctness**
    - **Validates: Requirements 1.2, 2.4, 8.1**

- [x] 4. Checkpoint - Core Libraries Complete
  - All library tests pass (oauth-utils, token-encryption)

- [x] 5. OAuth Initiate Handler
  - [x] 5.1 Create azure-oauth-initiate.ts handler
    - Generate state and PKCE values
    - Store state in oauth_states table with 10-minute expiry
    - Return authorization URL
    - _Requirements: 1.1, 1.2, 1.3, 1.5_
  - [x] 5.2 Create API Gateway endpoint for azure-oauth-initiate
    - POST /api/functions/azure-oauth-initiate
    - Cognito authorization required
    - Resource ID: bs1pz7
    - _Requirements: 1.1_

- [x] 6. OAuth Callback Handler
  - [x] 6.1 Create azure-oauth-callback.ts handler
    - Validate state parameter against stored value
    - Check state expiration (10 minutes)
    - Exchange authorization code for tokens using PKCE
    - Encrypt refresh_token before storage
    - List available subscriptions
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [x] 6.2 Create API Gateway endpoint for azure-oauth-callback
    - POST /api/functions/azure-oauth-callback
    - Cognito authorization required
    - Resource ID: oqanpl
    - _Requirements: 2.1_
  - [ ] 6.3 Write property test for state expiration
    - **Property 4: State Expiration Enforcement**
    - **Validates: Requirements 1.5, 2.2**
  - [ ] 6.4 Write property test for invalid state rejection
    - **Property 5: Invalid State Rejection**
    - **Validates: Requirements 2.1, 2.2**

- [x] 7. OAuth Refresh Handler
  - [x] 7.1 Create azure-oauth-refresh.ts handler
    - Decrypt stored refresh_token
    - Call Azure AD token endpoint
    - Update stored tokens if new refresh_token provided
    - Handle refresh errors and mark credential invalid if needed
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 7.2 Create API Gateway endpoint for azure-oauth-refresh
    - POST /api/functions/azure-oauth-refresh
    - Cognito authorization required
    - Resource ID: bb4jp5
    - _Requirements: 4.1_
  - [ ] 7.3 Write property test for invalid credential no-refresh
    - **Property 9: Invalid Credential No-Refresh**
    - **Validates: Requirements 4.5**

- [x] 8. OAuth Revoke Handler
  - [x] 8.1 Create azure-oauth-revoke.ts handler
    - Delete stored tokens from database
    - Stop scheduled scans for subscription
    - Return Azure portal revoke URL
    - Log disconnection event
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 8.2 Create API Gateway endpoint for azure-oauth-revoke
    - POST /api/functions/azure-oauth-revoke
    - Cognito authorization required
    - Resource ID: d87n72
    - _Requirements: 6.1_
  - [ ] 8.3 Write property test for credential deletion cascade
    - **Property 10: Credential Deletion Cascade**
    - **Validates: Requirements 6.1, 6.3**

- [ ] 9. Checkpoint - Backend Handlers Complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Update Azure Provider for OAuth
  - [x] 10.1 Modify AzureProvider to support OAuth tokens
    - Add method to get access_token (from refresh if needed)
    - Auto-refresh tokens before expiration
    - Handle both OAuth and Service Principal auth types
    - _Requirements: 4.1, 7.4_
  - [ ] 10.2 Write property test for mixed auth type support
    - **Property 13: Mixed Auth Type Support**
    - **Validates: Requirements 7.4**

- [x] 11. Update Existing Azure Handlers
  - [x] 11.1 Update list-azure-credentials.ts to show auth_type
    - Include auth_type in response
    - Show different status for OAuth vs Service Principal
    - _Requirements: 7.3_
  - [x] 11.2 Update save-azure-credentials.ts to support OAuth
    - Accept subscriptions from OAuth flow
    - Save with auth_type='oauth'
    - _Requirements: 5.4_
  - [ ] 11.3 Write property test for credential isolation
    - **Property 6: Credential Organization Isolation**
    - **Validates: Requirements 3.2, 8.4**

- [ ] 12. Checkpoint - Backend Integration Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Frontend OAuth Button Component
  - [x] 13.1 Create AzureOAuthButton.tsx component
    - "Connect with Azure" button with Microsoft branding
    - Call initiate endpoint and redirect to Azure
    - Store code_verifier in sessionStorage
    - Handle popup/redirect flow
    - _Requirements: 1.1, 1.6_

- [x] 14. Frontend Callback Handler
  - [x] 14.1 Create AzureOAuthCallback.tsx page
    - Parse authorization code and state from URL
    - Retrieve code_verifier from sessionStorage
    - Call callback endpoint
    - Show loading state during processing
    - Redirect to credentials page on success
    - _Requirements: 2.7_

- [x] 15. Frontend Subscription Selector
  - [x] 15.1 Create AzureSubscriptionSelector.tsx component
    - Display list of available subscriptions
    - Allow multi-select with checkboxes
    - Show subscription name, ID, and tenant
    - Validate and save selected subscriptions
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 16. Update Credentials Page
  - [x] 16.1 Update AzureCredentialsManager.tsx
    - Add "Connect with Azure" button alongside manual setup
    - Show auth_type badge on credentials (OAuth/Service Principal)
    - Add disconnect button for OAuth credentials
    - _Requirements: 7.2, 7.3, 6.1_

- [x] 17. Add Route for OAuth Callback
  - [x] 17.1 Add /azure/callback route to React Router
    - Route to AzureOAuthCallback component
    - Handle error query parameters
    - _Requirements: 2.7_

- [ ] 18. Checkpoint - Frontend Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Security and Audit
  - [x] 19.1 Add rate limiting to OAuth endpoints
    - 5 req/min for initiate
    - 10 req/min for callback
    - 20 req/min for refresh
    - _Requirements: 8.3_
  - [x] 19.2 Add audit logging for OAuth events
    - Log initiate, callback, refresh, revoke events
    - Include organization_id, user_id, timestamp
    - _Requirements: 8.4_
  - [ ] 19.3 Write property test for token non-exposure in logs
    - **Property 12: Token Non-Exposure in Logs**
    - **Validates: Requirements 8.6, 8.7**
  - [ ] 19.4 Write property test for redirect URI whitelist
    - **Property 11: Redirect URI Whitelist**
    - **Validates: Requirements 8.2**

- [x] 20. Deploy and Documentation
  - [x] 20.1 Deploy all Lambda handlers
    - Build and deploy azure-oauth-* handlers
    - Update Lambda layer if needed (v47)
    - _Requirements: All_
  - [x] 20.2 Create Azure App Registration guide
    - Step-by-step instructions for Azure Portal
    - Required permissions and redirect URIs
    - _Requirements: All_
  - [x] 20.3 Update steering documentation
    - Add OAuth flow to azure-lambda-layers.md
    - Document environment variables
    - _Requirements: All_

- [ ] 21. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property-based tests are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- The Azure App Registration must be created manually in Azure Portal before testing
