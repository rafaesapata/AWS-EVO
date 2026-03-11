/**
 * Trial License Context
 * 
 * Gerencia o estado da licença trial da organização.
 * Exibe banner informativo quando a organização está em período de trial.
 * 
 * REGRAS:
 * - isTrialLicense só é TRUE quando backend confirma is_trial = true
 * - Durante carregamento, isTrialLicense permanece FALSE
 * - Componentes de trial SÓ renderizam quando isTrialLicense === true E isLoading === false
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { apiClient } from '@/integrations/aws/api-client';
import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';

interface TrialLicenseState {
  /** Se a organização está em período de trial */
  isTrialLicense: boolean;
  
  /** Se estamos carregando o status da licença */
  isLoading: boolean;
  
  /** Se o status foi verificado com sucesso */
  isVerified: boolean;
  
  /** Data de início da licença */
  validFrom: string | null;
  
  /** Data de expiração da licença trial */
  validUntil: string | null;
  
  /** Dias restantes até expiração */
  daysRemaining: number | null;
  
  /** Se o trial está próximo de expirar (7 dias ou menos) */
  isExpiringSoon: boolean;
  
  /** Se o trial expirou */
  isExpired: boolean;
  
  /** Chave da licença */
  licenseKey: string | null;
}

interface TrialLicenseContextType extends TrialLicenseState {
  /** Força uma nova verificação do status da licença */
  refreshTrialStatus: () => Promise<void>;
}

/** Number of days before expiration to show "expiring soon" warning */
const EXPIRING_SOON_THRESHOLD_DAYS = 7;

const TrialLicenseContext = createContext<TrialLicenseContextType | undefined>(undefined);

/**
 * Calcula dias restantes até uma data
 */
function calculateDaysRemaining(validUntil: string | null): number | null {
  if (!validUntil) return null;
  const expDate = new Date(validUntil);
  const now = new Date();
  const diffMs = expDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Verifica se a licença expirou
 */
function isLicenseExpired(validUntil: string | null): boolean {
  if (!validUntil) return false;
  return new Date(validUntil) < new Date();
}

export function TrialLicenseProvider({ children }: { children: ReactNode }) {
  // CRITICAL: Use cognitoAuth directly instead of useAuthSafe() to avoid
  // creating a separate auth state instance that may be out of sync.
  // This is the same pattern used by DemoModeContext.
  const hasQueriedBackendRef = useRef(false);
  
  const [state, setState] = useState<Omit<TrialLicenseState, 'daysRemaining' | 'isExpiringSoon' | 'isExpired'>>({
    isTrialLicense: false,
    isLoading: true,
    isVerified: false,
    validFrom: null,
    validUntil: null,
    licenseKey: null
  });

  const fetchTrialStatus = useCallback(async () => {
    // Check session directly from cognitoAuth (single source of truth)
    let session;
    try {
      session = await cognitoAuth.getCurrentSession();
    } catch {
      session = null;
    }

    if (!session?.accessToken) {
      // Only mark as verified if we previously had a session (logout scenario)
      if (hasQueriedBackendRef.current) {
        setState({
          isTrialLicense: false,
          isLoading: false,
          isVerified: true,
          validFrom: null,
          validUntil: null,
          licenseKey: null
        });
      } else {
        // No session yet, stay in loading state
        // auth-state-changed event will trigger re-fetch once login completes
        setState(prev => ({ ...prev, isLoading: false }));
      }
      return;
    }

    try {
      // Buscar status da licença do backend
      const response = await apiClient.invoke<{
        valid: boolean;
        licenses?: Array<{
          is_trial: boolean;
          valid_from: string;
          valid_until: string;
          days_remaining: number;
          is_expired: boolean;
          license_key: string;
        }>;
      }>('validate-license', { body: {} });
      
      hasQueriedBackendRef.current = true;
      
      if (response && 'data' in response && response.data?.valid && response.data.licenses?.length) {
        const primaryLicense = response.data.licenses[0];
        
        setState({
          isTrialLicense: primaryLicense.is_trial === true,
          isLoading: false,
          isVerified: true,
          validFrom: primaryLicense.valid_from || null,
          validUntil: primaryLicense.valid_until || null,
          licenseKey: primaryLicense.license_key || null
        });
      } else {
        setState({
          isTrialLicense: false,
          isLoading: false,
          isVerified: true,
          validFrom: null,
          validUntil: null,
          licenseKey: null
        });
      }
    } catch (error) {
      console.error('Failed to fetch trial license status:', error);
      setState({
        isTrialLicense: false,
        isLoading: false,
        isVerified: false,
        validFrom: null,
        validUntil: null,
        licenseKey: null
      });
    }
  }, []);

  useEffect(() => {
    fetchTrialStatus();

    // Handle token changes in storage (multi-tab login/logout)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && (e.key.includes('idToken') || e.key.includes('accessToken'))) {
        fetchTrialStatus();
      }
    };

    // CRITICAL: Listen for auth-state-changed event (dispatched by useAuthSafe after login)
    // This ensures trial status is fetched immediately after login completes
    const handleAuthChange = () => {
      fetchTrialStatus();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('auth-state-changed', handleAuthChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth-state-changed', handleAuthChange);
    };
  }, [fetchTrialStatus]);

  const refreshTrialStatus = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    await fetchTrialStatus();
  }, [fetchTrialStatus]);

  const contextValue = useMemo<TrialLicenseContextType>(() => {
    const daysRemaining = calculateDaysRemaining(state.validUntil);
    const isExpiringSoon = daysRemaining !== null && daysRemaining <= EXPIRING_SOON_THRESHOLD_DAYS;
    const isExpired = isLicenseExpired(state.validUntil);
    
    return {
      ...state,
      daysRemaining,
      isExpiringSoon,
      isExpired,
      refreshTrialStatus
    };
  }, [state, refreshTrialStatus]);

  return (
    <TrialLicenseContext.Provider value={contextValue}>
      {children}
    </TrialLicenseContext.Provider>
  );
}

/**
 * Hook para usar o contexto de trial license
 */
export function useTrialLicense(): TrialLicenseContextType {
  const context = useContext(TrialLicenseContext);
  if (context === undefined) {
    throw new Error('useTrialLicense must be used within a TrialLicenseProvider');
  }
  return context;
}

/**
 * Hook opcional para usar o contexto de trial license
 */
export function useTrialLicenseOptional(): TrialLicenseContextType {
  const context = useContext(TrialLicenseContext);
  
  if (context === undefined) {
    return {
      isTrialLicense: false,
      isLoading: false,
      isVerified: true,
      validFrom: null,
      validUntil: null,
      licenseKey: null,
      daysRemaining: null,
      isExpiringSoon: false,
      isExpired: false,
      refreshTrialStatus: async () => {}
    };
  }
  
  return context;
}

export default TrialLicenseContext;
