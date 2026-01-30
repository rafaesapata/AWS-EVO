/**
 * Cloud Account Context
 * 
 * Unified context for managing cloud accounts across multiple providers (AWS, Azure).
 * Extends the existing AwsAccountContext pattern to support multi-cloud.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/integrations/aws/api-client';
import { useOrganization } from '@/hooks/useOrganization';
import { ErrorHandler } from '@/lib/error-handler';
import { useCacheInvalidation } from '@/lib/cache-invalidation';
import { getEffectiveOrganizationId } from '@/components/SuperAdminOrganizationSwitcher';

// Cloud provider types
export type CloudProvider = 'AWS' | 'AZURE';

// Unified cloud account interface
export interface CloudAccount {
  id: string;
  provider: CloudProvider;
  accountName: string;
  accountId: string | null;  // AWS Account ID or Azure Subscription ID
  regions: string[];
  isActive: boolean;
  // Provider-specific fields
  tenantId?: string;         // Azure only
  subscriptionName?: string; // Azure only
  roleArn?: string;          // AWS only
  _isOrphaned?: boolean;
}

interface CloudAccountContextType {
  // All accounts
  accounts: CloudAccount[];
  awsAccounts: CloudAccount[];
  azureAccounts: CloudAccount[];
  
  // Selection
  selectedAccountId: string | null;
  selectedAccount: CloudAccount | null;
  selectedProvider: CloudProvider | null;
  setSelectedAccountId: (id: string | null) => void;
  
  // Provider filter
  providerFilter: CloudProvider | 'ALL';
  setProviderFilter: (filter: CloudProvider | 'ALL') => void;
  filteredAccounts: CloudAccount[];
  
  // State
  isLoading: boolean;
  error: Error | null;
  hasMultipleAccounts: boolean;
  hasMultipleProviders: boolean;
  
  // Actions
  refreshAccounts: () => void;
}

// Default context for use outside provider
const defaultContext: CloudAccountContextType = {
  accounts: [],
  awsAccounts: [],
  azureAccounts: [],
  selectedAccountId: null,
  selectedAccount: null,
  selectedProvider: null,
  setSelectedAccountId: () => {},
  providerFilter: 'ALL',
  setProviderFilter: () => {},
  filteredAccounts: [],
  isLoading: false,
  error: null,
  hasMultipleAccounts: false,
  hasMultipleProviders: false,
  refreshAccounts: () => {},
};

const CloudAccountContext = createContext<CloudAccountContextType>(defaultContext);

const STORAGE_KEY = 'evo_selected_cloud_account';
const PROVIDER_FILTER_KEY = 'evo_cloud_provider_filter';

export function CloudAccountProvider({ children }: { children: React.ReactNode }) {
  const { data: userOrganizationId, isLoading: orgLoading } = useOrganization();
  // Use effective organization ID (considers impersonation for super admins)
  const organizationId = getEffectiveOrganizationId(userOrganizationId || undefined) || userOrganizationId;
  const { invalidateByTrigger } = useCacheInvalidation();
  
  // Keep queryClient reference for potential future use
  const queryClient = useQueryClient();
  
  const [selectedAccountId, setSelectedAccountIdState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY);
    }
    return null;
  });
  
  const [providerFilter, setProviderFilterState] = useState<CloudProvider | 'ALL'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(PROVIDER_FILTER_KEY);
      if (saved === 'AWS' || saved === 'AZURE' || saved === 'ALL') {
        return saved;
      }
    }
    return 'ALL';
  });

  // Track previous organization ID to detect changes
  const [prevOrgId, setPrevOrgId] = useState<string | null>(null);
  
  // Clear selected account when organization changes (e.g., during impersonation)
  useEffect(() => {
    if (organizationId && prevOrgId && organizationId !== prevOrgId) {
      // Organization changed - clear selected account to force re-selection
      setSelectedAccountIdState(null);
      localStorage.removeItem(STORAGE_KEY);
      // Invalidate cloud accounts cache for the new organization
      queryClient.invalidateQueries({ queryKey: ['cloud-accounts'] });
    }
    setPrevOrgId(organizationId);
  }, [organizationId, prevOrgId, queryClient]);

  // Fetch all cloud accounts (AWS + Azure) using unified endpoint
  const { data: accounts = [], isLoading: accountsLoading, error, refetch } = useQuery({
    queryKey: ['cloud-accounts', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      try {
        // Try unified endpoint first
        const result = await apiClient.invoke<any>('list-cloud-credentials', {});
        
        if (result.error) {
          const errorMsg = result.error.message || '';
          if (errorMsg.includes('ERR_ABORTED') || errorMsg.includes('aborted')) {
            return [];
          }
          // Fall back to separate endpoints if unified doesn't exist
          return await fetchSeparateCredentials();
        }
        
        const responseBody = result.data;
        let allAccounts: CloudAccount[] = [];
        
        if (Array.isArray(responseBody)) {
          allAccounts = responseBody;
        } else if (responseBody?.success && Array.isArray(responseBody.data)) {
          allAccounts = responseBody.data;
        } else if (responseBody?.data && Array.isArray(responseBody.data)) {
          allAccounts = responseBody.data;
        } else {
          // Fall back to separate endpoints
          return await fetchSeparateCredentials();
        }
        
        return normalizeAccounts(allAccounts);
      } catch (err) {
        if (err instanceof Error) {
          const msg = err.message || '';
          if (msg.includes('ERR_ABORTED') || msg.includes('aborted')) {
            return [];
          }
        }
        
        // Fall back to separate endpoints on error
        try {
          return await fetchSeparateCredentials();
        } catch (fallbackErr) {
          console.error('CloudAccountContext: Error fetching accounts:', fallbackErr);
          throw ErrorHandler.handle(fallbackErr, {
            component: 'CloudAccountContext',
            action: 'fetch cloud accounts',
            organizationId,
          });
        }
      }
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error instanceof Error) {
        const msg = error.message || '';
        if (msg.includes('auth') || msg.includes('ERR_ABORTED')) {
          return false;
        }
      }
      return failureCount < 2;
    },
  });

  // Fetch credentials from separate endpoints (fallback)
  async function fetchSeparateCredentials(): Promise<CloudAccount[]> {
    const allAccounts: CloudAccount[] = [];
    
    // Fetch AWS credentials
    try {
      const awsResult = await apiClient.invoke<any>('list-aws-credentials', {});
      if (awsResult.data) {
        const awsData = Array.isArray(awsResult.data) 
          ? awsResult.data 
          : awsResult.data?.data || [];
        
        for (const acc of awsData) {
          if (acc && acc.id && acc.is_active !== false) {
            allAccounts.push({
              id: acc.id,
              provider: 'AWS',
              accountName: acc.account_name || acc.accountName || 'AWS Account',
              accountId: acc.account_id || acc.accountId || null,
              regions: acc.regions || ['us-east-1'],
              isActive: acc.is_active !== false,
              roleArn: acc.role_arn || acc.roleArn,
            });
          }
        }
      }
    } catch (err) {
      console.warn('CloudAccountContext: Error fetching AWS credentials:', err);
    }
    
    // Fetch Azure credentials
    try {
      const azureResult = await apiClient.invoke<any>('list-azure-credentials', {});
      if (azureResult.data) {
        const azureData = Array.isArray(azureResult.data) 
          ? azureResult.data 
          : azureResult.data?.data || [];
        
        for (const acc of azureData) {
          if (acc && acc.id && acc.is_active !== false) {
            allAccounts.push({
              id: acc.id,
              provider: 'AZURE',
              accountName: acc.subscription_name || acc.subscriptionName || 'Azure Subscription',
              accountId: acc.subscription_id || acc.subscriptionId || null,
              regions: acc.regions || ['eastus'],
              isActive: acc.is_active !== false,
              tenantId: acc.tenant_id || acc.tenantId,
              subscriptionName: acc.subscription_name || acc.subscriptionName,
            });
          }
        }
      }
    } catch (err) {
      console.warn('CloudAccountContext: Error fetching Azure credentials:', err);
    }
    
    return allAccounts;
  }

  // Normalize accounts to unified format
  function normalizeAccounts(accounts: any[]): CloudAccount[] {
    return accounts
      .filter(acc => acc && acc.id && acc.is_active !== false)
      .map(acc => ({
        id: acc.id,
        provider: (acc.provider || acc.cloud_provider || 'AWS').toUpperCase() as CloudProvider,
        accountName: acc.account_name || acc.accountName || acc.subscription_name || acc.subscriptionName || 'Cloud Account',
        accountId: acc.account_id || acc.accountId || acc.subscription_id || acc.subscriptionId || null,
        regions: acc.regions || ['us-east-1'],
        isActive: acc.is_active !== false,
        tenantId: acc.tenant_id || acc.tenantId,
        subscriptionName: acc.subscription_name || acc.subscriptionName,
        roleArn: acc.role_arn || acc.roleArn,
        _isOrphaned: acc._isOrphaned,
      }));
  }

  // Derived state
  const awsAccounts = accounts.filter(a => a.provider === 'AWS');
  const azureAccounts = accounts.filter(a => a.provider === 'AZURE');
  const filteredAccounts = providerFilter === 'ALL' 
    ? accounts 
    : accounts.filter(a => a.provider === providerFilter);
  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || null;
  const selectedProvider = selectedAccount?.provider || null;
  const hasMultipleAccounts = accounts.length > 1;
  const hasMultipleProviders = awsAccounts.length > 0 && azureAccounts.length > 0;

  // Auto-select first account if none selected
  useEffect(() => {
    if (accounts.length > 0) {
      const currentSelected = accounts.find(a => a.id === selectedAccountId);
      if (!currentSelected) {
        const savedAccountId = localStorage.getItem(STORAGE_KEY);
        const savedAccount = savedAccountId ? accounts.find(a => a.id === savedAccountId) : null;
        
        if (savedAccount) {
          setSelectedAccountIdState(savedAccount.id);
        } else {
          const firstAccount = accounts[0];
          setSelectedAccountIdState(firstAccount.id);
          localStorage.setItem(STORAGE_KEY, firstAccount.id);
        }
      }
    } else if (accounts.length === 0 && !accountsLoading) {
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
    
    // Trigger cache invalidation when switching accounts
    if (previousAccountId !== id && organizationId) {
      invalidateByTrigger(['cloud-accounts', organizationId], { 
        accountChanged: true, 
        previousAccountId, 
        newAccountId: id 
      });
    }
  }, [selectedAccountId, organizationId, invalidateByTrigger]);

  const setProviderFilter = useCallback((filter: CloudProvider | 'ALL') => {
    setProviderFilterState(filter);
    localStorage.setItem(PROVIDER_FILTER_KEY, filter);
  }, []);

  const value: CloudAccountContextType = {
    accounts,
    awsAccounts,
    azureAccounts,
    selectedAccountId,
    selectedAccount,
    selectedProvider,
    setSelectedAccountId,
    providerFilter,
    setProviderFilter,
    filteredAccounts,
    isLoading: orgLoading || accountsLoading,
    error: error as Error | null,
    hasMultipleAccounts,
    hasMultipleProviders,
    refreshAccounts: refetch,
  };

  return (
    <CloudAccountContext.Provider value={value}>
      {children}
    </CloudAccountContext.Provider>
  );
}

export function useCloudAccount() {
  return useContext(CloudAccountContext);
}

// Hook for components that require an account to be selected
export function useRequiredCloudAccount() {
  const context = useCloudAccount();
  if (!context.selectedAccountId && !context.isLoading && context.accounts.length > 0) {
    throw new Error('No cloud account selected');
  }
  return context;
}

// Hook to get accounts for a specific provider
export function useProviderAccounts(provider: CloudProvider) {
  const context = useCloudAccount();
  return provider === 'AWS' ? context.awsAccounts : context.azureAccounts;
}

/**
 * Helper hook for API compatibility
 * Returns the correct filter object based on selected provider
 * 
 * Usage:
 * const { getAccountFilter, getAccountFilterField } = useAccountFilter();
 * 
 * // For queries:
 * const filters = { organization_id: orgId, ...getAccountFilter() };
 * 
 * // For specific field:
 * filters[getAccountFilterField()] = selectedAccountId;
 */
export function useAccountFilter() {
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  
  /**
   * Returns the correct filter object for the selected account
   * AWS: { aws_account_id: id }
   * Azure: { azure_credential_id: id }
   */
  const getAccountFilter = useCallback(() => {
    if (!selectedAccountId) return {};
    
    if (selectedProvider === 'AZURE') {
      return { azure_credential_id: selectedAccountId };
    }
    // Default to AWS
    return { aws_account_id: selectedAccountId };
  }, [selectedAccountId, selectedProvider]);
  
  /**
   * Returns the field name for the selected provider
   */
  const getAccountFilterField = useCallback(() => {
    if (selectedProvider === 'AZURE') {
      return 'azure_credential_id';
    }
    return 'aws_account_id';
  }, [selectedProvider]);
  
  /**
   * Returns account ID with provider info for API calls
   */
  const getAccountInfo = useCallback(() => {
    return {
      accountId: selectedAccountId,
      provider: selectedProvider,
      filterField: selectedProvider === 'AZURE' ? 'azure_credential_id' : 'aws_account_id',
    };
  }, [selectedAccountId, selectedProvider]);
  
  return {
    getAccountFilter,
    getAccountFilterField,
    getAccountInfo,
    selectedAccountId,
    selectedProvider,
  };
}
