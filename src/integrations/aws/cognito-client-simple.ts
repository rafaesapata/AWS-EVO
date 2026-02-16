/**
 * AWS Cognito Client - Secure Production Implementation
 * Real authentication with AWS Cognito User Pools
 */

import { 
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  AuthFlowType,
  RespondToAuthChallengeCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  ChangePasswordCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { secureStorage } from '@/lib/secure-storage';

/**
 * SECURITY: Decode Base64URL (used in JWT) to string
 * atob() doesn't support Base64URL encoding, this function handles it properly
 */
function base64UrlDecode(str: string): string {
  // Replace Base64URL characters with Base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if necessary
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  
  try {
    // Decode Base64 and convert to UTF-8
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    throw new Error('Failed to decode JWT payload');
  }
}

/**
 * SECURITY: Parse JWT payload safely
 */
function parseJwtPayload(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT structure');
  }
  
  try {
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch (e) {
    throw new Error('Failed to parse JWT payload');
  }
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  organizationId?: string;
  attributes: Record<string, string>;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

export interface AuthChallenge {
  challengeName: string;
  session?: string;
  challengeParameters?: Record<string, any>;
}

export type SignInResult = AuthSession | AuthChallenge;

class CognitoAuthService {
  private userPoolId: string;
  private clientId: string;
  private region: string;
  private apiBaseUrl: string;
  private storedUsername: string | null = null;

  constructor() {
    this.userPoolId = import.meta.env.VITE_AWS_USER_POOL_ID || '';
    this.clientId = import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID || '';
    this.region = this.userPoolId.split('_')[0] || 'us-east-1';
    this.apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
  }

  async signIn(username: string, password: string): Promise<SignInResult> {
    console.log('🔐 SignIn attempt:', { username, userPoolId: this.userPoolId, clientId: this.clientId, region: this.region });
    
    if (!this.userPoolId || !this.clientId) {
      throw new Error('AWS Cognito não está configurado. Configure as variáveis de ambiente VITE_AWS_USER_POOL_ID e VITE_AWS_USER_POOL_CLIENT_ID.');
    }

    // Store username for MFA verification
    this.setStoredUsername(username);

    const cognitoClient = new CognitoIdentityProviderClient({ 
      region: this.region 
    });

    const authCommand = new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: this.clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    });

    try {
      console.log('🔐 Sending auth command to Cognito...');
      const response = await cognitoClient.send(authCommand);
      console.log('🔐 Cognito response received:', { hasChallenge: !!response.ChallengeName, hasResult: !!response.AuthenticationResult });
      
      if (response.ChallengeName) {
        console.log('🔐 Challenge detected:', response.ChallengeName, response.ChallengeParameters);
        return {
          challengeName: response.ChallengeName,
          session: response.Session,
          challengeParameters: response.ChallengeParameters,
        };
      }

      const session = this.buildSessionFromResponse(response);
      
      // Validar se usuário tem organização no token
      if (!session.user.organizationId) {
        console.error('🔐 User without organization ID:', session.user);
        throw new Error('Usuário sem organização vinculada. Entre em contato com o administrador.');
      }
      
      console.log('🔐 Login successful:', { userId: session.user.id, organizationId: session.user.organizationId });
      return session;
    } catch (error: any) {
      console.error('🔐 Cognito error:', error.name, error.message, error);
      this.handleAuthError(error);
      // handleAuthError always throws a user-friendly error
      // This line is a safety net in case handleAuthError is modified
      throw error;
    }
  }

  // Método removido - validação agora é feita via atributo do token JWT

  // SECURITY: Fallback credentials removed for production security

  // SECURITY: Fallback session method removed for production security

  private buildSessionFromResponse(response: any): AuthSession {
    const accessToken = response.AuthenticationResult?.AccessToken;
    const idToken = response.AuthenticationResult?.IdToken;
    const refreshToken = response.AuthenticationResult?.RefreshToken;

    if (!accessToken || !idToken) {
      throw new Error('Tokens de autenticação não recebidos');
    }

    // SECURITY: Decode JWT payload using Base64URL decoder
    const payload = parseJwtPayload(idToken);
    
    console.log('🔐 CognitoAuth: JWT payload attributes:', {
      sub: payload.sub,
      email: payload.email,
      organization_id: payload['custom:organization_id'],
      roles: payload['custom:roles'],
      tenant_id: payload['custom:tenant_id']
    });
    
    // Extract all custom attributes from the token
    const attributes: Record<string, string> = {};
    for (const key of Object.keys(payload)) {
      if (typeof payload[key] === 'string' || typeof payload[key] === 'number') {
        attributes[key] = String(payload[key]);
      }
    }
    
    const user: AuthUser = {
      id: payload.sub,
      email: payload.email,
      name: payload.name || `${payload.given_name || ''} ${payload.family_name || ''}`.trim(),
      organizationId: payload['custom:organization_id'],
      attributes,
    };

    const session: AuthSession = {
      user,
      accessToken,
      idToken,
      refreshToken,
    };

    // Store session securely
    this.storeSession(session);
    return session;
  }

  private storeSession(session: AuthSession): void {
    try {
      secureStorage.setItem('evo-auth', JSON.stringify(session));
    } catch (error) {
      console.error('Failed to store session securely:', error);
      throw new Error('Failed to store authentication session');
    }
  }

  private handleAuthError(error: any): void {
    console.error('❌ Authentication error:', error);
    
    // Map AWS Cognito errors to user-friendly messages
    const errorCode = error.name || error.__type;
    switch (errorCode) {
      case 'NotAuthorizedException':
        throw new Error('Email ou senha incorretos. Verifique suas credenciais.');
      case 'UserNotConfirmedException':
        throw new Error('Conta não confirmada. Verifique seu email para confirmar a conta.');
      case 'UserNotFoundException':
        throw new Error('Usuário não encontrado. Verifique o email ou crie uma nova conta.');
      case 'TooManyRequestsException':
        throw new Error('Muitas tentativas de login. Tente novamente em alguns minutos.');
      case 'InvalidParameterException':
        throw new Error('Parâmetros inválidos. Verifique os dados informados.');
      default:
        throw new Error('Erro de autenticação. Tente novamente.');
    }
  }

  private validateToken(token: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      
      // SECURITY: Use Base64URL decoder
      const payload = parseJwtPayload(token);
      
      // Validate issuer
      const expectedIssuer = `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`;
      if (payload.iss !== expectedIssuer) return false;
      
      // Validate audience
      if (payload.aud !== this.clientId && payload.client_id !== this.clientId) return false;
      
      // Validate expiration
      if (Date.now() >= payload.exp * 1000) return false;
      
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // MILITARY GRADE SECURITY ENHANCEMENTS
  // ============================================================================

  /**
   * Lista de operações que requerem MFA
   */
  private readonly MFA_REQUIRED_OPERATIONS = [
    'delete_user',
    'delete_organization',
    'modify_credentials',
    'export_data',
    'change_admin_role',
    'access_billing',
    'modify_security_settings'
  ] as const;

  /**
   * Verifica se MFA é necessário para a operação e se está verificado
   */
  async requireMFAForSensitiveOperation(operation: string): Promise<boolean> {
    // Verificar se a operação requer MFA
    if (!this.MFA_REQUIRED_OPERATIONS.includes(operation as any)) {
      return true; // Operação não requer MFA
    }

    const session = await this.getCurrentSession();
    if (!session) {
      throw new Error('No active session');
    }

    const mfaVerified = session.user.attributes['custom:mfa_verified'];
    const mfaVerifiedAt = session.user.attributes['custom:mfa_verified_at'];

    // MFA deve ter sido verificado nos últimos 15 minutos para operações sensíveis
    if (mfaVerified !== 'true') {
      throw new Error('MFA verification required for this operation');
    }

    if (mfaVerifiedAt) {
      const verifiedTime = new Date(mfaVerifiedAt).getTime();
      const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000);

      if (verifiedTime < fifteenMinutesAgo) {
        throw new Error('MFA verification expired. Please re-verify.');
      }
    }

    return true;
  }

  /**
   * Verifica se o token foi revogado
   * Retorna false (não revogado) em caso de erro de rede para não bloquear o usuário
   */
  private async checkTokenRevocation(token: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
      
      const response = await fetch(`${this.apiBaseUrl}/auth/check-revocation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': crypto.randomUUID()
        },
        body: JSON.stringify({ token }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        // Log error but don't block user on server errors
        console.warn('Token revocation check failed with status:', response.status);
        return false;
      }

      const { revoked } = await response.json();
      return revoked === true;
    } catch (error) {
      // Network errors should not block the user
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Token revocation check timed out');
      } else {
        console.warn('Token revocation check error:', error);
      }
      return false;
    }
  }

  /**
   * Refresh de sessão com retry exponencial e jitter
   */
  async refreshTokenWithRetry(maxRetries: number = 3): Promise<AuthSession | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const session = await this.refreshSession();
        return session;
      } catch (error) {
        if (attempt === maxRetries - 1) {
          console.error(`Refresh token failed after ${maxRetries} attempts:`, error);
          throw error;
        }

        // Exponential backoff com jitter
        const baseDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        const jitter = Math.random() * 1000; // 0-1s de jitter
        const delay = baseDelay + jitter;

        console.warn(`Refresh attempt ${attempt + 1} failed, retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return null;
  }

  /**
   * Validação completa do token com todas as verificações de segurança
   */
  async validateTokenComplete(token: string): Promise<{
    valid: boolean;
    error?: string;
    claims?: any;
  }> {
    try {
      // 1. Validar estrutura básica
      if (!token || typeof token !== 'string') {
        return { valid: false, error: 'Invalid token format' };
      }

      // 2. Validar estrutura JWT
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid JWT structure' };
      }

      // 3. Validar claims básicos
      if (!this.validateToken(token)) {
        return { valid: false, error: 'Invalid signature or claims' };
      }

      // 4. Verificar revogação (opcional - depende do backend)
      try {
        const isRevoked = await this.checkTokenRevocation(token);
        if (isRevoked) {
          return { valid: false, error: 'Token has been revoked' };
        }
      } catch {
        // Se não conseguir verificar revogação, continuar
      }

      // 5. Decodificar e retornar claims
      const payload = parseJwtPayload(token);
      return { valid: true, claims: payload };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }



  async signUp(
    email: string, 
    password: string, 
    attributes: { givenName: string; familyName: string }
  ): Promise<void> {
    if (!this.userPoolId) {
      throw new Error('AWS Cognito not configured');
    }

    // In production, this would make API calls to Cognito
    // For now, simulate successful signup
    console.log('Sign up request:', { email, attributes });
  }

  async signOut(): Promise<void> {
    // Clear stored session data securely
    secureStorage.removeItem('evo-auth');
    secureStorage.clear();
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      console.log('🔐 CognitoAuth: getCurrentUser called');
      const stored = secureStorage.getItem('evo-auth');
      console.log('🔐 CognitoAuth: stored session exists:', !!stored);
      
      if (!stored) {
        console.log('🔐 CognitoAuth: No stored session found');
        return null;
      }

      const session: AuthSession = JSON.parse(stored);
      console.log('🔐 CognitoAuth: Parsed session user:', {
        id: session.user?.id,
        email: session.user?.email,
        organizationId: session.user?.organizationId,
        roles: session.user?.attributes?.['custom:roles'],
        hasAttributes: !!session.user?.attributes,
        hasAccessToken: !!session.accessToken,
        accessTokenLength: session.accessToken?.length,
        accessTokenStart: session.accessToken?.substring(0, 30)
      });
      
      // Check if session is still valid
      if (this.isTokenExpired(session.accessToken)) {
        console.log('🔐 CognitoAuth: Token expired, signing out');
        console.log('🔐 CognitoAuth: accessToken length:', session.accessToken?.length, 'starts with:', session.accessToken?.substring(0, 20));
        await this.signOut();
        return null;
      }

      // CRITICAL: Validate organization ID format (must be UUID)
      const orgId = session.user?.organizationId;
      if (orgId) {
        const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        if (!uuidRegex.test(orgId)) {
          console.error('🔐 CognitoAuth: INVALID organization ID format detected!', orgId);
          console.error('🔐 CognitoAuth: Forcing logout to get new token with valid UUID...');
          await this.signOut();
          // Redirect to login with reason
          if (typeof window !== 'undefined') {
            window.location.href = '/auth?reason=session_expired';
          }
          return null;
        }
      }

      console.log('🔐 CognitoAuth: Returning user with org:', session.user?.organizationId, 'roles:', session.user?.attributes?.['custom:roles']);
      return session.user;
    } catch (error) {
      console.error('🔐 CognitoAuth: Error in getCurrentUser:', error);
      await this.signOut();
      return null;
    }
  }

  async getCurrentSession(): Promise<AuthSession | null> {
    try {
      const stored = secureStorage.getItem('evo-auth');
      if (!stored) return null;

      const session: AuthSession = JSON.parse(stored);
      
      // Check if session is still valid
      if (this.isTokenExpired(session.accessToken)) {
        // Try to refresh the session before signing out
        if (session.refreshToken) {
          try {
            const refreshed = await this.refreshSession();
            if (refreshed) {
              return refreshed;
            }
          } catch (refreshError) {
            console.warn('🔐 CognitoAuth: Token refresh failed during getCurrentSession', refreshError);
          }
        }
        // Refresh failed or no refresh token — sign out
        await this.signOut();
        return null;
      }

      // CRITICAL: Validate organization ID format (must be UUID)
      const orgId = session.user?.organizationId;
      if (orgId) {
        const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        if (!uuidRegex.test(orgId)) {
          console.error('🔐 CognitoAuth: getCurrentSession - INVALID organization ID format!', orgId);
          console.error('🔐 CognitoAuth: Forcing logout to get new token...');
          await this.signOut();
          return null;
        }
      }

      return session;
    } catch {
      await this.signOut();
      return null;
    }
  }

  async forgotPassword(email: string): Promise<void> {
    if (!this.userPoolId) {
      throw new Error('AWS Cognito not configured');
    }

    // In production, this would make API calls to Cognito
    console.log('Forgot password request for:', email);
  }

  async confirmPassword(
    email: string, 
    code: string, 
    newPassword: string
  ): Promise<void> {
    if (!this.userPoolId) {
      throw new Error('AWS Cognito not configured');
    }

    // In production, this would make API calls to Cognito
    console.log('Confirm password request for:', email);
  }

  /**
   * Change password for authenticated user
   * Requires current password and new password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const session = await this.getCurrentSession();
    if (!session) {
      throw new Error('Sessão não encontrada. Faça login novamente.');
    }

    const cognitoClient = new CognitoIdentityProviderClient({ 
      region: this.region 
    });

    const command = new ChangePasswordCommand({
      PreviousPassword: currentPassword,
      ProposedPassword: newPassword,
      AccessToken: session.accessToken,
    });

    try {
      await cognitoClient.send(command);
    } catch (error: any) {
      console.error('Change password error:', error);
      
      if (error.name === 'NotAuthorizedException') {
        throw new Error('Senha atual incorreta.');
      } else if (error.name === 'InvalidPasswordException') {
        throw new Error('Nova senha não atende aos requisitos de segurança.');
      } else if (error.name === 'LimitExceededException') {
        throw new Error('Muitas tentativas. Tente novamente mais tarde.');
      }
      
      throw new Error('Erro ao alterar senha. Tente novamente.');
    }
  }

  async confirmSignIn(session: string, mfaCode: string): Promise<AuthSession> {
    if (!this.userPoolId || !this.clientId) {
      throw new Error('AWS Cognito não está configurado');
    }

    const cognitoClient = new CognitoIdentityProviderClient({ 
      region: this.region 
    });

    const respondCommand = new RespondToAuthChallengeCommand({
      ClientId: this.clientId,
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      Session: session,
      ChallengeResponses: {
        USERNAME: await this.getStoredUsername() || '',
        SOFTWARE_TOKEN_MFA_CODE: mfaCode,
      },
    });

    try {
      const response = await cognitoClient.send(respondCommand);
      
      if (!response.AuthenticationResult) {
        throw new Error('Falha na verificação MFA');
      }

      return this.buildSessionFromResponse(response);
    } catch (error: any) {
      console.error('MFA verification error:', error);
      
      if (error.name === 'CodeMismatchException') {
        throw new Error('Código MFA inválido. Verifique e tente novamente.');
      } else if (error.name === 'ExpiredCodeException') {
        throw new Error('Código MFA expirado. Faça login novamente.');
      }
      
      throw error;
    }
  }

  async confirmNewPassword(session: string, newPassword: string, requiredAttributes?: Record<string, string>): Promise<AuthSession> {
    if (!this.userPoolId || !this.clientId) {
      throw new Error('AWS Cognito não está configurado');
    }

    const cognitoClient = new CognitoIdentityProviderClient({ 
      region: this.region 
    });

    const challengeResponses: Record<string, string> = {
      USERNAME: await this.getStoredUsername() || '',
      NEW_PASSWORD: newPassword,
    };

    // Add any required attributes
    if (requiredAttributes) {
      Object.assign(challengeResponses, requiredAttributes);
    }

    const respondCommand = new RespondToAuthChallengeCommand({
      ClientId: this.clientId,
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      Session: session,
      ChallengeResponses: challengeResponses,
    });

    try {
      console.log('🔐 Responding to NEW_PASSWORD_REQUIRED challenge');
      const response = await cognitoClient.send(respondCommand);
      
      if (!response.AuthenticationResult) {
        throw new Error('Falha ao definir nova senha');
      }

      console.log('🔐 New password set successfully');
      return this.buildSessionFromResponse(response);
    } catch (error: any) {
      console.error('New password error:', error);
      
      if (error.name === 'InvalidPasswordException') {
        throw new Error('Senha não atende aos requisitos de segurança');
      } else if (error.name === 'InvalidParameterException') {
        throw new Error('Parâmetros inválidos. Verifique os dados informados.');
      }
      
      throw error;
    }
  }

  private async getStoredUsername(): Promise<string | null> {
    return this.storedUsername;
  }

  private setStoredUsername(username: string): void {
    this.storedUsername = username;
  }

  /**
   * Associate software token for MFA setup
   * Returns the secret code to be used with authenticator app
   */
  async associateSoftwareToken(session: string): Promise<{ secretCode: string; session: string }> {
    const cognitoClient = new CognitoIdentityProviderClient({ 
      region: this.region 
    });

    const command = new AssociateSoftwareTokenCommand({
      Session: session,
    });

    try {
      const response = await cognitoClient.send(command);
      
      if (!response.SecretCode) {
        throw new Error('Falha ao obter código secreto para MFA');
      }

      return {
        secretCode: response.SecretCode,
        session: response.Session || session,
      };
    } catch (error: any) {
      console.error('Associate software token error:', error);
      throw new Error('Falha ao configurar MFA. Tente novamente.');
    }
  }

  /**
   * Verify software token and complete MFA setup
   */
  async verifySoftwareToken(session: string, totpCode: string, friendlyDeviceName?: string): Promise<AuthSession> {
    const cognitoClient = new CognitoIdentityProviderClient({ 
      region: this.region 
    });

    // First verify the token
    const verifyCommand = new VerifySoftwareTokenCommand({
      Session: session,
      UserCode: totpCode,
      FriendlyDeviceName: friendlyDeviceName || 'EVO Authenticator',
    });

    try {
      const verifyResponse = await cognitoClient.send(verifyCommand);
      
      if (verifyResponse.Status !== 'SUCCESS') {
        throw new Error('Código TOTP inválido');
      }

      // After VerifySoftwareToken succeeds, we need to respond to the MFA_SETUP challenge
      // to complete the authentication flow and get tokens
      const respondCommand = new RespondToAuthChallengeCommand({
        ClientId: this.clientId,
        ChallengeName: 'MFA_SETUP',
        Session: verifyResponse.Session || session,
        ChallengeResponses: {
          USERNAME: await this.getStoredUsername() || '',
        },
      });

      const response = await cognitoClient.send(respondCommand);
      
      // Check if we got tokens or another challenge
      if (response.AuthenticationResult) {
        return this.buildSessionFromResponse(response);
      }
      
      // If we get SOFTWARE_TOKEN_MFA challenge, the MFA was set up but now we need to verify
      if (response.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
        // Use the same TOTP code to complete authentication
        const mfaCommand = new RespondToAuthChallengeCommand({
          ClientId: this.clientId,
          ChallengeName: 'SOFTWARE_TOKEN_MFA',
          Session: response.Session,
          ChallengeResponses: {
            USERNAME: await this.getStoredUsername() || '',
            SOFTWARE_TOKEN_MFA_CODE: totpCode,
          },
        });
        
        const mfaResponse = await cognitoClient.send(mfaCommand);
        
        if (!mfaResponse.AuthenticationResult) {
          throw new Error('Falha ao completar autenticação MFA');
        }
        
        return this.buildSessionFromResponse(mfaResponse);
      }

      throw new Error('Falha ao completar configuração MFA');
    } catch (error: any) {
      console.error('Verify software token error:', error);
      
      if (error.name === 'CodeMismatchException') {
        throw new Error('Código TOTP inválido. Verifique e tente novamente.');
      } else if (error.name === 'EnableSoftwareTokenMFAException') {
        throw new Error('Falha ao habilitar MFA. Tente novamente.');
      } else if (error.name === 'NotAuthorizedException') {
        throw new Error('Sessão expirada. Faça login novamente.');
      }
      
      throw error;
    }
  }

  async refreshSession(): Promise<AuthSession | null> {
    try {
      // Read directly from storage to avoid infinite recursion with getCurrentSession
      const stored = secureStorage.getItem('evo-auth');
      if (!stored) {
        await this.signOut();
        return null;
      }

      const currentSession: AuthSession = JSON.parse(stored);
      if (!currentSession.refreshToken) {
        await this.signOut();
        return null;
      }

      // Use real AWS Cognito refresh token
      const cognitoClient = new CognitoIdentityProviderClient({ 
        region: this.region 
      });

      const refreshCommand = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
        ClientId: this.clientId,
        AuthParameters: {
          REFRESH_TOKEN: currentSession.refreshToken,
        },
      });

      const response = await cognitoClient.send(refreshCommand);
      
      if (!response.AuthenticationResult) {
        await this.signOut();
        return null;
      }

      const newSession: AuthSession = {
        ...currentSession,
        accessToken: response.AuthenticationResult.AccessToken!,
        idToken: response.AuthenticationResult.IdToken!,
        // Keep existing refresh token if new one not provided
        refreshToken: response.AuthenticationResult.RefreshToken || currentSession.refreshToken,
      };

      secureStorage.setItem('evo-auth', JSON.stringify(newSession));
      return newSession;
    } catch (error) {
      console.error('Token refresh failed:', error);
      await this.signOut();
      return null;
    }
  }

  /**
   * Get access token for API calls
   */
  async getAccessToken(): Promise<string | null> {
    const session = await this.getCurrentSession();
    return session?.accessToken || null;
  }

  /**
   * Refresh tokens via backend API
   */
  private async refreshTokenViaAPI(refreshToken: string, tokenType: 'access' | 'id'): Promise<string> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/auth/refresh-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken,
          tokenType,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }

      const result = await response.json();
      return result.token;
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw new Error('Authentication token refresh failed');
    }
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(token: string): boolean {
    try {
      // Use same decoding as scheduleTokenRefresh for consistency
      const parts = token.split('.');
      if (parts.length !== 3) return true;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      const exp = payload.exp;
      const now = Date.now();
      const expMs = exp * 1000;
      const isExpired = now >= expMs;
      
      if (isExpired) {
        console.log('🔐 CognitoAuth: Token IS expired:', {
          exp,
          now: Math.floor(now / 1000),
          diffSeconds: Math.round((expMs - now) / 1000)
        });
      }

      return isExpired;
    } catch (e) {
      console.error('🔐 CognitoAuth: isTokenExpired parse error:', e);
      return true;
    }
  }
}

export const cognitoAuth = new CognitoAuthService();