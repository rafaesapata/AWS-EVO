/**
 * Safe Authentication Hook
 * Prevents infinite loops and recursion in auth operations
 * Includes automatic token refresh to keep users logged in
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { cognitoAuth, AuthSession, AuthUser } from '@/integrations/aws/cognito-client-simple';

interface UseAuthSafeReturn {
  session: AuthSession | null;
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  challengeSession: string | null;
  challengeName: string | null;
  signIn: (username: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  confirmNewPassword: (session: string, newPassword: string) => Promise<boolean>;
  clearError: () => void;
}

export function useAuthSafe(): UseAuthSafeReturn {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [challengeSession, setChallengeSession] = useState<string | null>(null);
  const [challengeName, setChallengeName] = useState<string | null>(null);
  
  // Prevent multiple simultaneous auth operations
  const authOperationRef = useRef<boolean>(false);
  const initializationRef = useRef<boolean>(false);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize auth state
  useEffect(() => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    const initializeAuth = async () => {
      try {
        setIsLoading(true);
        const currentSession = await cognitoAuth.getCurrentSession();
        
        if (currentSession) {
          setSession(currentSession);
          setUser(currentSession.user);
          
          // Start auto-refresh timer
          scheduleTokenRefresh(currentSession.accessToken);
        }
      } catch (error) {
        console.error('❌ Auth initialization failed:', error);
        setError('Falha na inicialização da autenticação');
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Auto-refresh token before expiration
  const scheduleTokenRefresh = useCallback((accessToken: string) => {
    // Clear existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    try {
      // Decode JWT to get expiration time
      const parts = accessToken.split('.');
      if (parts.length !== 3) return;

      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      const exp = payload.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      
      // Refresh 5 minutes before expiration (or immediately if less than 5 min left)
      const refreshTime = exp - now - (5 * 60 * 1000);
      const timeUntilRefresh = Math.max(refreshTime, 0);

      console.log('🔄 Token refresh scheduled in', Math.round(timeUntilRefresh / 1000 / 60), 'minutes');

      refreshTimerRef.current = setTimeout(async () => {
        console.log('🔄 Auto-refreshing token...');
        
        try {
          const newSession = await cognitoAuth.refreshSession();
          
          if (newSession) {
            console.log('✅ Token refreshed successfully');
            setSession(newSession);
            setUser(newSession.user);
            
            // Schedule next refresh
            scheduleTokenRefresh(newSession.accessToken);
          } else {
            console.warn('⚠️ Token refresh returned null, user will be logged out');
            setSession(null);
            setUser(null);
          }
        } catch (error) {
          console.error('❌ Auto-refresh failed:', error);
          // Don't log out immediately, let the user continue until token actually expires
          // The API will return 401 and trigger logout then
        }
      }, timeUntilRefresh);
    } catch (error) {
      console.error('❌ Failed to schedule token refresh:', error);
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string): Promise<boolean> => {
    // Prevent concurrent auth operations
    if (authOperationRef.current) {
      console.warn('⚠️ Auth operation already in progress');
      return false;
    }

    authOperationRef.current = true;
    setIsLoading(true);
    setError(null);
    setChallengeSession(null);
    setChallengeName(null);

    try {
      const result = await cognitoAuth.signIn(username, password);
      
      console.log('🔐 [useAuthSafe] SignIn result type:', typeof result);
      console.log('🔐 [useAuthSafe] SignIn result keys:', Object.keys(result));
      console.log('🔐 [useAuthSafe] Has user property:', 'user' in result);
      
      if ('user' in result) {
        console.log('🔐 [useAuthSafe] Login successful, setting session');
        setSession(result);
        setUser(result.user);
        
        // Start auto-refresh timer
        scheduleTokenRefresh(result.accessToken);
        
        return true;
      } else if ('challengeName' in result) {
        console.log('🔐 [useAuthSafe] Challenge detected:', result.challengeName);
        
        // Store challenge information
        setChallengeSession(result.session || '');
        setChallengeName(result.challengeName);
        
        if (result.challengeName === 'NEW_PASSWORD_REQUIRED') {
          setError('É necessário definir uma nova senha');
        } else if (result.challengeName === 'SOFTWARE_TOKEN_MFA') {
          setError('MFA ou desafio adicional necessário');
        } else {
          setError(`Desafio necessário: ${result.challengeName}`);
        }
        return false;
      } else {
        console.log('🔐 [useAuthSafe] Unknown result format:', result);
        setError('Resposta de autenticação inesperada');
        return false;
      }
    } catch (error: any) {
      console.error('❌ SignIn failed:', error);
      
      // Handle specific error types
      if (error.message?.includes('Maximum call stack')) {
        setError('Erro interno do sistema. Tente recarregar a página.');
      } else if (error.message?.includes('Credenciais inválidas')) {
        setError('Usuário ou senha incorretos');
      } else {
        setError(error.message || 'Falha na autenticação');
      }
      
      return false;
    } finally {
      setIsLoading(false);
      authOperationRef.current = false;
    }
  }, [scheduleTokenRefresh]);

  const signOut = useCallback(async (): Promise<void> => {
    if (authOperationRef.current) return;
    
    authOperationRef.current = true;
    setIsLoading(true);

    // Clear refresh timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    try {
      await cognitoAuth.signOut();
      setSession(null);
      setUser(null);
      setError(null);
      setChallengeSession(null);
      setChallengeName(null);
    } catch (error) {
      console.error('❌ SignOut failed:', error);
      // Force clear local state even if signOut fails
      setSession(null);
      setUser(null);
      setChallengeSession(null);
      setChallengeName(null);
    } finally {
      setIsLoading(false);
      authOperationRef.current = false;
    }
  }, []);

  const confirmNewPassword = useCallback(async (session: string, newPassword: string): Promise<boolean> => {
    if (authOperationRef.current) {
      console.warn('⚠️ Auth operation already in progress');
      return false;
    }

    authOperationRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const result = await cognitoAuth.confirmNewPassword(session, newPassword);
      setSession(result);
      setUser(result.user);
      
      // Start auto-refresh timer
      scheduleTokenRefresh(result.accessToken);
      
      return true;
    } catch (error: any) {
      console.error('❌ Confirm new password failed:', error);
      setError(error.message || 'Falha ao definir nova senha');
      return false;
    } finally {
      setIsLoading(false);
      authOperationRef.current = false;
    }
  }, [scheduleTokenRefresh]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    session,
    user,
    isLoading,
    error,
    challengeSession,
    challengeName,
    signIn,
    signOut,
    confirmNewPassword,
    clearError
  };
}