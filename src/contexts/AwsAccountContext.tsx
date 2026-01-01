import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/integrations/aws/api-client';
import { useOrganization } from '@/hooks/useOrganization';
import { ErrorHandler, ErrorFactory } from '@/lib/error-handler';
import { useCacheInvalidation } from '@/lib/cache-invalidation';
import { createQueryKey } from '@/hooks/useQueryCache';

interface AwsAccount {
  id: string;
  account_name: string;
  account_id: string | null;
  regions: string[];
  is_active: boolean;
  _isOrphaned?: boolean; // Flag for orphaned cost data
}

interface AwsAccountContextType {
  accounts: AwsAccount[];
  selectedAccountId: string | null;
  selectedAccount: AwsAccount | null;
  setSelectedAccountId: (id: string | null) => void;
  isLoading: boolean;
  error: Error | null;
  hasMultipleAccounts: boolean;
  refreshAccounts: () => void;
}

// Default context for use outside provider (e.g., TV Dashboard mode)
const defaultContext: AwsAccountContextType = {
  accounts: [],
  selectedAccountId: null,
  selectedAccount: null,
  setSelectedAccountId: () => {},
  isLoading: false,
  error: null,
  hasMultipleAccounts: false,
  refreshAccounts: () => {},
};

const AwsAccountContext = createContext<AwsAccountContextType>(defaultContext);

const STORAGE_KEY = 'evo_selected_aws_account';

export function AwsAccountProvider({ children }: { children: React.ReactNode }) {
  const { data: organizationId, isLoading: orgLoading } = useOrganization();
  const queryClient = useQueryClient();
  const { invalidateByTrigger } = useCacheInvalidation();
  const [selectedAccountId, setSelectedAccountIdState] = useState<string | null>(() => {
    // Initialize from localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY);
    }
    return null;
  });

  // Fetch all AWS accounts for the organization using Lambda endpoint
  const { data: accounts = [], isLoading: accountsLoading, error, refetch } = useQuery({
    queryKey: createQueryKey.awsAccounts(organizationId || ''),
    queryFn: async () => {
      if (!organizationId) return [];
      
      try {
        // Use Lambda endpoint instead of REST (same as AwsCredentialsManager)
        const result = await apiClient.invoke<any>('list-aws-credentials', {});
        
        if (result.error) {
          // Ignore aborted requests (user navigated away) - return cached data or empty array
          const errorMsg = result.error.message || '';
          if (errorMsg.includes('ERR_ABORTED') || errorMsg.includes('aborted') || errorMsg.includes('Failed to fetch')) {
            console.log('🔄 AwsAccountContext: Request was aborted/cancelled, returning empty array');
            return [];
          }
          throw ErrorFactory.databaseError('fetch AWS accounts', result.error);
        }
        
        // Lambda returns { success: true, data: [...] } wrapped in apiClient response
        const responseBody = result.data;
        
        // Handle both formats: direct array or wrapped in { success, data }
        let allAccounts: AwsAccount[] = [];
        if (Array.isArray(responseBody)) {
          allAccounts = responseBody;
        } else if (responseBody?.success && Array.isArray(responseBody.data)) {
          allAccounts = responseBody.data;
        } else if (responseBody?.data && Array.isArray(responseBody.data)) {
          allAccounts = responseBody.data;
        } else {
          console.warn('AwsAccountContext: Unexpected response format:', responseBody);
          allAccounts = [];
        }
        
        // Filter only active accounts and ensure they have required properties
        const credentialAccounts = allAccounts.filter((acc: any) => {
          if (!acc || typeof acc !== 'object') return false;
          if (!acc.id || !acc.account_name) return false;
          return acc.is_active !== false; // Include if is_active is true or undefined
        });
        
        // If no credential accounts found, check for orphaned cost data
        if (credentialAccounts.length === 0) {
          console.log('🔍 AwsAccountContext: No credential accounts found, checking for orphaned cost data...');
          
          try {
            // Query for accounts that have cost data but no credentials
            const costDataResult = await apiClient.select('daily_costs', {
              eq: { organization_id: organizationId },
              order: { column: 'created_at', ascending: false },
              limit: 1
            });
            
            if (costDataResult.data && costDataResult.data.length > 0) {
              const costRecord = costDataResult.data[0];
              console.log('🔍 AwsAccountContext: Found orphaned cost data for account:', costRecord.aws_account_id);
              
              // Create a virtual account for the orphaned cost data
              return [{
                id: costRecord.aws_account_id,
                account_name: 'Conta AWS (Dados de Custo)',
                account_id: null,
                regions: ['us-east-1'],
                is_active: true,
                _isOrphaned: true // Flag to indicate this is orphaned data
              }];
            }
          } catch (costErr) {
            console.warn('AwsAccountContext: Error checking for orphaned cost data:', costErr);
          }
        }
        
        return credentialAccounts;
      } catch (err) {
        // Check if this is an aborted request error
        if (err instanceof Error) {
          const msg = err.message || '';
          if (msg.includes('ERR_ABORTED') || msg.includes('aborted') || msg.includes('Failed to fetch') || msg.includes('cancelled')) {
            console.log('🔄 AwsAccountContext: Request was aborted/cancelled in catch, returning empty array');
            return [];
          }
        }
        
        console.error('AwsAccountContext: Error fetching accounts:', err);
        const appError = ErrorHandler.handle(err, {
          component: 'AwsAccountContext',
          action: 'buscar contas AWS',
          organizationId,
        });
        throw appError;
      }
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      // Don't retry auth errors or aborted requests
      if (error instanceof Error) {
        const msg = error.message || '';
        if (msg.includes('auth') || msg.includes('ERR_ABORTED') || msg.includes('aborted')) {
          return false;
        }
      }
      return failureCount < 2; // Reduced retry count
    },
  });

  // Auto-select first account if none selected or selected is invalid
  useEffect(() => {
    if (accounts.length > 0) {
      const currentSelected = accounts.find(a => a.id === selectedAccountId);
      if (!currentSelected) {
        // Check if there's a saved preference in localStorage
        const savedAccountId = localStorage.getItem(STORAGE_KEY);
        const savedAccount = savedAccountId ? accounts.find(a => a.id === savedAccountId) : null;
        
        if (savedAccount) {
          // Use saved preference if valid
          setSelectedAccountIdState(savedAccount.id);
        } else {
          // Select first account if no valid saved preference
          const firstAccount = accounts[0];
          setSelectedAccountIdState(firstAccount.id);
          localStorage.setItem(STORAGE_KEY, firstAccount.id);
        }
      }
    } else if (accounts.length === 0 && !accountsLoading) {
      // No accounts, clear selection
      setSelectedAccountIdState(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [accounts, selectedAccountId, accountsLoading]);

  const setSelectedAccountId = useCallback((id: string | null) => {
    const previousAccountId = selectedAccountId;
    
    setSelectedAccountIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    
    // Trigger intelligent cache invalidation when switching accounts
    if (previousAccountId !== id && organizationId) {
      invalidateByTrigger(['aws-accounts', organizationId], { 
        accountChanged: true, 
        previousAccountId, 
        newAccountId: id 
      });
    }
  }, [selectedAccountId, organizationId, invalidateByTrigger]);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || null;
  const hasMultipleAccounts = accounts.length > 1;

  const value: AwsAccountContextType = {
    accounts,
    selectedAccountId,
    selectedAccount,
    setSelectedAccountId,
    isLoading: orgLoading || accountsLoading,
    error: error as Error | null,
    hasMultipleAccounts,
    refreshAccounts: refetch,
  };

  return (
    <AwsAccountContext.Provider value={value}>
      {children}
    </AwsAccountContext.Provider>
  );
}

export function useAwsAccount() {
  const context = useContext(AwsAccountContext);
  // Return default context if not within provider (e.g., TV Dashboard mode)
  // This allows components to work safely in both authenticated and TV modes
  return context;
}

// Hook for components that require an account to be selected
export function useRequiredAwsAccount() {
  const context = useAwsAccount();
  if (!context.selectedAccountId && !context.isLoading && context.accounts.length > 0) {
    throw new Error('No AWS account selected');
  }
  return context;
}
