# Requirements Document

## Introduction

Este documento define os requisitos para implementar a integração Azure OAuth/OIDC, permitindo que usuários conectem suas contas Azure com um único clique, sem necessidade de criar Service Principals manualmente ou copiar credenciais.

## Glossary

- **OAuth_Flow**: Fluxo de autorização OAuth 2.0 que redireciona o usuário para o Azure AD para autenticação e consentimento
- **Azure_AD**: Azure Active Directory, serviço de identidade da Microsoft
- **Consent_Screen**: Tela onde o usuário autoriza as permissões solicitadas pelo aplicativo
- **Access_Token**: Token de curta duração usado para acessar Azure APIs
- **Refresh_Token**: Token de longa duração usado para obter novos access tokens
- **Authorization_Code**: Código temporário retornado após o consentimento, trocado por tokens
- **PKCE**: Proof Key for Code Exchange, extensão de segurança para OAuth em aplicações públicas
- **State_Parameter**: Parâmetro anti-CSRF que vincula a requisição ao usuário
- **Callback_URL**: URL para onde o Azure redireciona após autenticação
- **Token_Encryption**: Criptografia dos tokens antes de armazenar no banco de dados

## Requirements

### Requirement 1: Iniciar Fluxo OAuth

**User Story:** As a user, I want to click a single button to connect my Azure account, so that I don't need to manually create Service Principals or copy credentials.

#### Acceptance Criteria

1. WHEN a user clicks "Connect with Azure" button, THE OAuth_Flow SHALL redirect to Azure AD authorization endpoint with correct parameters
2. THE OAuth_Flow SHALL include PKCE code_challenge for security
3. THE OAuth_Flow SHALL include a cryptographically random state parameter to prevent CSRF attacks
4. THE OAuth_Flow SHALL request the following scopes: `openid`, `profile`, `email`, `offline_access`, `https://management.azure.com/.default`
5. THE State_Parameter SHALL be stored in session/localStorage with expiration of 10 minutes
6. WHEN the user is already authenticated in Azure, THE Consent_Screen SHALL show only permission consent (not login)

### Requirement 2: Processar Callback OAuth

**User Story:** As a user, I want the system to automatically process my authorization and save my Azure connection, so that I can immediately start using Azure features.

#### Acceptance Criteria

1. WHEN Azure redirects to Callback_URL with authorization_code, THE System SHALL validate the state parameter matches the stored value
2. IF the state parameter is invalid or expired, THEN THE System SHALL return an error and not process the callback
3. WHEN state is valid, THE System SHALL exchange the authorization_code for access_token and refresh_token
4. THE System SHALL use PKCE code_verifier when exchanging the authorization code
5. WHEN tokens are received, THE System SHALL encrypt them using Token_Encryption before storing
6. THE System SHALL extract tenant_id and subscription information from the token claims
7. WHEN processing is complete, THE System SHALL redirect user back to the credentials page with success message

### Requirement 3: Armazenar Credenciais OAuth

**User Story:** As a user, I want my Azure connection to persist securely, so that I don't need to reconnect every time I use the platform.

#### Acceptance Criteria

1. THE System SHALL store encrypted refresh_token in the database associated with organization_id
2. THE System SHALL store token metadata (tenant_id, expiration, scopes) alongside the encrypted token
3. THE System SHALL NOT store access_tokens in the database (only in memory during requests)
4. WHEN storing credentials, THE System SHALL mark the authentication_type as 'oauth' to distinguish from 'service_principal'
5. THE Token_Encryption SHALL use AWS KMS or AES-256-GCM with organization-specific keys

### Requirement 4: Renovar Tokens Automaticamente

**User Story:** As a user, I want my Azure connection to remain active without manual intervention, so that scheduled scans and monitoring continue working.

#### Acceptance Criteria

1. WHEN an access_token is expired or about to expire (within 5 minutes), THE System SHALL automatically refresh it using the refresh_token
2. WHEN refresh succeeds, THE System SHALL update the stored refresh_token if a new one is provided
3. IF refresh fails due to revoked consent, THEN THE System SHALL mark the credential as 'invalid' and notify the user
4. THE System SHALL implement exponential backoff for refresh retries (max 3 attempts)
5. WHEN a credential is marked invalid, THE System SHALL NOT attempt further refreshes until user re-authenticates

### Requirement 5: Listar Subscriptions Disponíveis

**User Story:** As a user, I want to see all Azure subscriptions I have access to after connecting, so that I can choose which ones to monitor.

#### Acceptance Criteria

1. WHEN OAuth connection is established, THE System SHALL list all subscriptions the user has access to
2. THE System SHALL display subscription name, subscription ID, and tenant ID for each subscription
3. THE User SHALL be able to select one or more subscriptions to monitor
4. WHEN subscriptions are selected, THE System SHALL save them as separate credential entries (one per subscription)
5. THE System SHALL validate access to each selected subscription before saving

### Requirement 6: Revogar Conexão OAuth

**User Story:** As a user, I want to disconnect my Azure account when needed, so that I maintain control over my data access.

#### Acceptance Criteria

1. WHEN user clicks "Disconnect" on an OAuth credential, THE System SHALL delete the stored tokens from the database
2. THE System SHALL provide option to revoke consent in Azure AD (redirect to Azure portal)
3. WHEN credential is deleted, THE System SHALL stop all scheduled scans for that subscription
4. THE System SHALL log the disconnection event for audit purposes

### Requirement 7: Fallback para Service Principal

**User Story:** As a user, I want the option to use Service Principal authentication if OAuth doesn't meet my needs, so that I have flexibility in how I connect.

#### Acceptance Criteria

1. THE System SHALL maintain the existing Service Principal authentication method
2. THE User SHALL be able to choose between "Connect with Azure" (OAuth) and "Manual Setup" (Service Principal)
3. WHEN displaying credentials, THE System SHALL indicate the authentication type (OAuth or Service Principal)
4. THE System SHALL support mixed authentication types within the same organization

### Requirement 8: Segurança e Compliance

**User Story:** As a security administrator, I want the OAuth integration to follow security best practices, so that our Azure connections are protected.

#### Acceptance Criteria

1. THE System SHALL use PKCE (Proof Key for Code Exchange) for all OAuth flows
2. THE System SHALL validate all redirect URIs against a whitelist
3. THE System SHALL implement rate limiting on callback endpoints (10 requests/minute per IP)
4. THE System SHALL log all OAuth events (initiate, callback, refresh, revoke) for audit
5. THE Token_Encryption keys SHALL be rotated every 90 days
6. THE System SHALL NOT log or expose tokens in error messages or logs
7. WHEN an OAuth error occurs, THE System SHALL display a user-friendly message without exposing technical details
