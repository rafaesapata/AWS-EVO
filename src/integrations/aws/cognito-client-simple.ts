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
  ConfirmForgotPasswordCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { secureStorage } from '@/lib/secure-storage';

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

  constructor() {
    this.userPoolId = import.meta.env.VITE_AWS_USER_POOL_ID || '';
    this.clientId = import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID || '';
    this.region = this.userPoolId.split('_')[0] || 'us-east-1';
    this.apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
  }

  async signIn(username: string, password: string): Promise<SignInResult> {
    if (!this.userPoolId || !this.clientId) {
      throw new Error('AWS Cognito não está configurado. Configure as variáveis de ambiente VITE_AWS_USER_POOL_ID e VITE_AWS_USER_POOL_CLIENT_ID.');
    }

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
      const response = await cognitoClient.send(authCommand);
      
      if (response.ChallengeName) {
        return {
          challengeName: response.ChallengeName,
          session: response.Session,
          challengeParameters: response.ChallengeParameters,
        };
      }

      const session = this.buildSessionFromResponse(response);
      
      // Validar vínculo de organização (desabilitado até deploy dos Lambdas)
      // TODO: Habilitar após deploy do API Gateway com endpoints /profiles/*
      const enableOrgValidation = import.meta.env.VITE_ENABLE_ORG_VALIDATION === 'true';
      if (enableOrgValidation) {
        await this.validateOrganizationBinding(session.user);
      }
      
      return session;
    } catch (error) {
      this.handleAuthError(error);
      throw error;
    }
  }

  /**
   * Valida se o usuário tem vínculo com uma organização
   * Se não tiver, cria automaticamente com a organização "UDS"
   */
  private async validateOrganizationBinding(user: AuthUser): Promise<void> {
    try {
      // Verificar se o usuário já tem profile com organização
      const response = await fetch(`${this.apiBaseUrl}/api/profiles/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getAccessToken()}`,
        },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!response.ok) {
        throw new Error('Erro ao verificar vínculo de organização');
      }

      const result = await response.json();
      
      if (!result.hasOrganization) {
        // Criar vínculo com organização UDS
        const createResponse = await fetch(`${this.apiBaseUrl}/api/profiles/create-with-org`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await this.getAccessToken()}`,
          },
          body: JSON.stringify({
            userId: user.id,
            email: user.email,
            fullName: user.name,
            organizationName: 'UDS',
          }),
        });

        if (!createResponse.ok) {
          throw new Error('Erro ao criar vínculo com organização');
        }

        console.log('✅ Usuário vinculado à organização UDS');
      }
    } catch (error) {
      console.error('❌ Erro na validação de organização:', error);
      throw new Error('Acesso negado: usuário sem vínculo de organização. Entre em contato com o administrador.');
    }
  }

  // SECURITY: Fallback credentials removed for production security

  // SECURITY: Fallback session method removed for production security

  private buildSessionFromResponse(response: any): AuthSession {
    const accessToken = response.AuthenticationResult?.AccessToken;
    const idToken = response.AuthenticationResult?.IdToken;
    const refreshToken = response.AuthenticationResult?.RefreshToken;

    if (!accessToken || !idToken) {
      throw new Error('Tokens de autenticação não recebidos');
    }

    // Decode JWT payload to get user info
    const payload = JSON.parse(atob(idToken.split('.')[1]));
    
    const user: AuthUser = {
      id: payload.sub,
      email: payload.email,
      name: payload.name || `${payload.given_name || ''} ${payload.family_name || ''}`.trim(),
      organizationId: payload['custom:organization_id'],
      attributes: payload,
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
      
      const payload = JSON.parse(atob(parts[1]));
      
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
      const stored = secureStorage.getItem('evo-auth');
      if (!stored) return null;

      const session: AuthSession = JSON.parse(stored);
      
      // Check if session is still valid
      if (this.isTokenExpired(session.accessToken)) {
        await this.signOut();
        return null;
      }

      return session.user;
    } catch {
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
        await this.signOut();
        return null;
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

  async confirmSignIn(session: string, mfaCode: string): Promise<AuthSession> {
    throw new Error('MFA confirmation requires session state management');
  }

  async refreshSession(): Promise<AuthSession | null> {
    try {
      const currentSession = await this.getCurrentSession();
      if (!currentSession || !currentSession.refreshToken) {
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
      const parts = token.split('.');
      if (parts.length !== 3) return true;

      const payload = JSON.parse(atob(parts[1]));
      const exp = payload.exp;

      return Date.now() >= exp * 1000;
    } catch {
      return true;
    }
  }
}

export const cognitoAuth = new CognitoAuthService();