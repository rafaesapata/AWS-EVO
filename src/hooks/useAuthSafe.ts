/**
 * Safe Authentication Hook
 * Prevents infinite loops and recursion in auth operations
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
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    if (authOperationRef.current) return;
    
    authOperationRef.current = true;
    setIsLoading(true);

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
      return true;
    } catch (error: any) {
      console.error('❌ Confirm new password failed:', error);
      setError(error.message || 'Falha ao definir nova senha');
      return false;
    } finally {
      setIsLoading(false);
      authOperationRef.current = false;
    }
  }, []);

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