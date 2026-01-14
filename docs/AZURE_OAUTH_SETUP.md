# Azure OAuth Setup Guide

## Overview

This guide explains how to configure Azure OAuth integration for the EVO platform, enabling 1-click Azure connection for users.

## Prerequisites

- Azure AD tenant with admin access
- Azure subscription(s) to connect
- EVO platform deployed and running

## Azure App Registration

### 1. Create App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Configure:
   - **Name**: `EVO Platform`
   - **Supported account types**: `Accounts in any organizational directory (Any Azure AD directory - Multitenant)`
   - **Redirect URI**: 
     - Type: `Single-page application (SPA)`
     - URI: `https://your-domain.com/azure/callback`

### 2. Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission**
3. Select **Azure Service Management**
4. Choose **Delegated permissions**
5. Select `user_impersonation`
6. Click **Add permissions**
7. Click **Grant admin consent** (if you have admin rights)

### 3. Configure Authentication

1. Go to **Authentication**
2. Under **Single-page application**, add redirect URIs:
   - Production: `https://evo.ai.udstec.io/azure/callback`
   - Development: `http://localhost:5173/azure/callback`
3. Enable **Access tokens** and **ID tokens** under Implicit grant
4. Set **Supported account types** to **Multitenant**

### 4. Get Client ID

1. Go to **Overview**
2. Copy the **Application (client) ID**
3. This is your `AZURE_OAUTH_CLIENT_ID`

### 5. Create Client Secret (Optional for PKCE)

Note: With PKCE flow, client secret is not required for SPA apps.

If needed for server-side operations:
1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Set description and expiration
4. Copy the secret value immediately (shown only once)

## Environment Variables

Configure these in your Lambda environment:

```bash
AZURE_OAUTH_CLIENT_ID=your-client-id-here
AZURE_OAUTH_REDIRECT_URI=https://your-domain.com/azure/callback
TOKEN_ENCRYPTION_KEY=your-32-byte-encryption-key
```

### Generating TOKEN_ENCRYPTION_KEY

```bash
# Generate a secure 32-byte key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## OAuth Flow

### 1. Initiate Flow

Frontend calls `POST /api/functions/azure-oauth-initiate`:

```typescript
const response = await apiClient.invoke('azure-oauth-initiate', {});
const { authorizationUrl, state, codeVerifier } = response.data;

// Store for callback
sessionStorage.setItem('azure_oauth_state', state);
sessionStorage.setItem('azure_oauth_code_verifier', codeVerifier);

// Redirect to Azure
window.location.href = authorizationUrl;
```

### 2. Handle Callback

Azure redirects to `/azure/callback?code=...&state=...`

Frontend calls `POST /api/functions/azure-oauth-callback`:

```typescript
const code = new URLSearchParams(window.location.search).get('code');
const state = new URLSearchParams(window.location.search).get('state');
const codeVerifier = sessionStorage.getItem('azure_oauth_code_verifier');

const response = await apiClient.invoke('azure-oauth-callback', {
  body: { code, state, codeVerifier }
});

const { subscriptions, tenantId, userEmail } = response.data;
```

### 3. Save Credentials

User selects subscriptions, frontend calls `POST /api/functions/save-azure-credentials`:

```typescript
await apiClient.invoke('save-azure-credentials', {
  body: {
    subscriptions: selectedSubscriptions,
    tenantId,
    authType: 'oauth'
  }
});
```

## Security Considerations

### PKCE (Proof Key for Code Exchange)

The implementation uses PKCE to protect against authorization code interception:

1. Frontend generates `code_verifier` (random string)
2. Backend creates `code_challenge` = SHA256(code_verifier)
3. `code_challenge` is sent to Azure during authorization
4. `code_verifier` is sent during token exchange
5. Azure verifies the challenge matches

### State Parameter

Prevents CSRF attacks:

1. Backend generates random `state`
2. State is stored in database with expiration
3. Frontend stores state in sessionStorage
4. Callback verifies state matches

### Token Encryption

Refresh tokens are encrypted at rest using AES-256-GCM:

```typescript
// Encryption
const encrypted = encrypt(refreshToken, TOKEN_ENCRYPTION_KEY);

// Decryption
const decrypted = decrypt(encrypted, TOKEN_ENCRYPTION_KEY);
```

### Rate Limiting

- 5 OAuth initiations per user per hour
- 10 OAuth initiations per organization per hour
- Prevents abuse and brute force attempts

## Troubleshooting

### "State mismatch" Error

**Cause**: Session storage was cleared or user opened multiple tabs

**Solution**: 
- Ensure only one OAuth flow is active at a time
- Don't clear sessionStorage during OAuth flow
- Use `useRef` to prevent duplicate callback processing

### "Invalid grant" Error

**Cause**: Authorization code expired or already used

**Solution**:
- Codes expire in 10 minutes
- Each code can only be used once
- Restart the OAuth flow

### "AADSTS50011" Error

**Cause**: Redirect URI mismatch

**Solution**:
- Verify redirect URI in Azure App Registration matches exactly
- Check for trailing slashes
- Ensure protocol (http/https) matches

### "Insufficient privileges" Error

**Cause**: User doesn't have access to any subscriptions

**Solution**:
- User needs at least Reader role on a subscription
- Admin needs to grant API permissions

## API Reference

### POST /api/functions/azure-oauth-initiate

Initiates OAuth flow.

**Response**:
```json
{
  "authorizationUrl": "https://login.microsoftonline.com/...",
  "state": "random-state-string",
  "codeVerifier": "pkce-code-verifier",
  "expiresAt": "2024-01-01T00:10:00Z"
}
```

### POST /api/functions/azure-oauth-callback

Processes OAuth callback.

**Request**:
```json
{
  "code": "authorization-code",
  "state": "state-from-initiate",
  "codeVerifier": "code-verifier-from-initiate"
}
```

**Response**:
```json
{
  "subscriptions": [
    {
      "subscriptionId": "...",
      "displayName": "...",
      "state": "Enabled"
    }
  ],
  "tenantId": "...",
  "userEmail": "user@example.com"
}
```

### POST /api/functions/azure-oauth-refresh

Refreshes access token.

**Request**:
```json
{
  "credentialId": "credential-uuid"
}
```

### POST /api/functions/azure-oauth-revoke

Revokes OAuth credentials.

**Request**:
```json
{
  "credentialId": "credential-uuid"
}
```

## Related Documentation

- [Multi-Cloud Architecture](./MULTI_CLOUD_ARCHITECTURE.md)
- [Adding Azure Scanners](./ADDING_AZURE_SCANNER.md)
- [Azure SDK Lambda Layers](../.kiro/steering/azure-lambda-layers.md)
