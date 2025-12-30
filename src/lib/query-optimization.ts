/**
 * React Query Optimization
 * Advanced caching and query optimization strategies
 */

import { QueryClient, QueryKey, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { logger } from './logging';
import { metricsCollector } from './metrics-collector';

// Optimized query client configuration
export const createOptimizedQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Stale time - how long data is considered fresh
        staleTime: 5 * 60 * 1000, // 5 minutes
        
        // Cache time - how long data stays in cache after becoming unused
        cacheTime: 10 * 60 * 1000, // 10 minutes
        
        // Retry configuration
        retry: (failureCount, error: any) => {
          // Don't retry on 4xx errors (client errors)
          if (error?.status >= 400 && error?.status < 500) {
            return false;
          }
          
          // Retry up to 3 times for other errors
          return failureCount < 3;
        },
        
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        
        // Background refetch settings
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: true,
        
        // Network mode
        networkMode: 'online',
        
        // Error handling
        onError: (error: any) => {
          logger.error('Query error', error);
          metricsCollector.record('query_error', 1, {
            errorType: error?.name || 'unknown',
            status: error?.status?.toString() || 'unknown'
          });
        },
        
        // Success metrics
        onSuccess: (data: any, query: any) => {
          metricsCollector.record('query_success', 1, {
            queryKey: Array.isArray(query.queryKey) ? query.queryKey[0] : 'unknown'
          });
        },
      },
      
      mutations: {
        retry: 1,
        retryDelay: 1000,
        
        onError: (error: any) => {
          logger.error('Mutation error', error);
          metricsCollector.record('mutation_error', 1, {
            errorType: error?.name || 'unknown',
            status: error?.status?.toString() || 'unknown'
          });
        },
        
        onSuccess: (data: any, variables: any, context: any) => {
          metricsCollector.record('mutation_success', 1);
        },
      },
    },
    
    // Query cache configuration
    queryCache: {
      onError: (error, query) => {
        logger.error('Query cache error', error, {
          queryKey: query.queryKey,
          queryHash: query.queryHash
        });
      },
      
      onSuccess: (data, query) => {
        // Log successful cache hits for monitoring
        if (query.state.dataUpdatedAt > 0) {
          metricsCollector.record('query_cache_hit', 1, {
            queryKey: Array.isArray(query.queryKey) ? query.queryKey[0] : 'unknown'
          });
        }
      },
    },
    
    // Mutation cache configuration
    mutationCache: {
      onError: (error, variables, context, mutation) => {
        logger.error('Mutation cache error', error, {
          mutationKey: mutation.options.mutationKey
        });
      },
    },
  });
};

// Query key factories for consistent caching
export const queryKeys = {
  // Organizations
  organizations: ['organizations'] as const,
  organization: (id: string) => ['organizations', id] as const,
  organizationUsers: (id: string) => ['organizations', id, 'users'] as const,
  
  // AWS Accounts
  awsAccounts: ['aws-accounts'] as const,
  awsAccount: (id: string) => ['aws-accounts', id] as const,
  awsAccountStatus: (id: string) => ['aws-accounts', id, 'status'] as const,
  
  // Security
  securityScans: ['security-scans'] as const,
  securityScan: (id: string) => ['security-scans', id] as const,
  securityFindings: (filters?: any) => ['security-findings', filters] as const,
  securityPosture: (orgId: string) => ['security-posture', orgId] as const,
  
  // Cost Management
  costAnalysis: (params: any) => ['cost-analysis', params] as const,
  costOptimization: (orgId: string, accountId?: string) => 
    ['cost-optimization', orgId, accountId] as const,
  wasteDetection: (orgId: string, accountId?: string) => 
    ['waste-detection', orgId, accountId] as const,
  
  // ML & AI
  mlRecommendations: (orgId: string, accountId?: string) => 
    ['ml-recommendations', orgId, accountId] as const,
  anomalyDetection: (orgId: string) => ['anomaly-detection', orgId] as const,
  
  // Monitoring
  systemHealth: ['system-health'] as const,
  backgroundJobs: (orgId: string) => ['background-jobs', orgId] as const,
  
  // Knowledge Base
  knowledgeBase: (orgId: string, filters?: any) => 
    ['knowledge-base', orgId, filters] as const,
  kbArticle: (id: string) => ['knowledge-base', 'article', id] as const,
  
  // User & Profile
  userProfile: ['user-profile'] as const,
  userSettings: ['user-settings'] as const,
  
  // Compliance
  complianceChecks: (orgId: string, framework?: string) => 
    ['compliance-checks', orgId, framework] as const,
  
  // Alerts
  alerts: (orgId: string, filters?: any) => ['alerts', orgId, filters] as const,
} as const;

// Optimized query options factory
export const createQueryOptions = <TData = unknown, TError = Error>(
  queryKey: QueryKey,
  queryFn: () => Promise<TData>,
  options?: Partial<UseQueryOptions<TData, TError>>
): UseQueryOptions<TData, TError> => {
  const baseOptions: UseQueryOptions<TData, TError> = {
    queryKey,
    queryFn,
    
    // Performance optimizations based on query type
    staleTime: getOptimalStaleTime(queryKey),
    cacheTime: getOptimalCacheTime(queryKey),
    
    // Smart refetch strategy
    refetchOnWindowFocus: shouldRefetchOnFocus(queryKey),
    refetchInterval: getRefetchInterval(queryKey),
    
    // Data selection optimization
    select: options?.select || ((data: TData) => data),
    
    // Error handling
    onError: (error: TError) => {
      logger.error('Query failed', error as Error, {
        queryKey: JSON.stringify(queryKey)
      });
      
      // Custom error handling based on query type
      handleQueryError(queryKey, error);
    },
    
    // Success handling
    onSuccess: (data: TData) => {
      // Record metrics for monitoring
      metricsCollector.record('query_execution_success', 1, {
        queryType: getQueryType(queryKey),
        dataSize: JSON.stringify(data).length
      });
    },
    
    ...options,
  };

  return baseOptions;
};

// Optimized mutation options factory
export const createMutationOptions = <TData = unknown, TError = Error, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: Partial<UseMutationOptions<TData, TError, TVariables>>
): UseMutationOptions<TData, TError, TVariables> => {
  return {
    mutationFn,
    
    // Optimistic updates for better UX
    onMutate: async (variables: TVariables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries();
      
      // Snapshot previous value
      const previousData = queryClient.getQueryData(options?.mutationKey || []);
      
      // Optimistically update if applicable
      if (options?.onMutate) {
        return options.onMutate(variables);
      }
      
      return { previousData };
    },
    
    // Error handling with rollback
    onError: (error: TError, variables: TVariables, context: any) => {
      // Rollback optimistic update
      if (context?.previousData) {
        queryClient.setQueryData(options?.mutationKey || [], context.previousData);
      }
      
      logger.error('Mutation failed', error as Error, {
        mutationKey: JSON.stringify(options?.mutationKey),
        variables: JSON.stringify(variables)
      });
      
      if (options?.onError) {
        options.onError(error, variables, context);
      }
    },
    
    // Success handling with cache invalidation
    onSuccess: (data: TData, variables: TVariables, context: any) => {
      // Invalidate related queries
      invalidateRelatedQueries(options?.mutationKey, variables);
      
      metricsCollector.record('mutation_success', 1, {
        mutationType: getMutationType(options?.mutationKey)
      });
      
      if (options?.onSuccess) {
        options.onSuccess(data, variables, context);
      }
    },
    
    ...options,
  };
};

// Helper functions for optimization
function getOptimalStaleTime(queryKey: QueryKey): number {
  const keyStr = JSON.stringify(queryKey);
  
  // Real-time data - short stale time
  if (keyStr.includes('system-health') || keyStr.includes('alerts')) {
    return 30 * 1000; // 30 seconds
  }
  
  // Frequently changing data - medium stale time
  if (keyStr.includes('findings') || keyStr.includes('jobs')) {
    return 2 * 60 * 1000; // 2 minutes
  }
  
  // Semi-static data - long stale time
  if (keyStr.includes('organizations') || keyStr.includes('users')) {
    return 15 * 60 * 1000; // 15 minutes
  }
  
  // Static data - very long stale time
  if (keyStr.includes('knowledge-base') || keyStr.includes('compliance')) {
    return 30 * 60 * 1000; // 30 minutes
  }
  
  // Default
  return 5 * 60 * 1000; // 5 minutes
}

function getOptimalCacheTime(queryKey: QueryKey): number {
  const keyStr = JSON.stringify(queryKey);
  
  // Critical data - keep in cache longer
  if (keyStr.includes('user-profile') || keyStr.includes('organizations')) {
    return 30 * 60 * 1000; // 30 minutes
  }
  
  // Regular data
  return 10 * 60 * 1000; // 10 minutes
}

function shouldRefetchOnFocus(queryKey: QueryKey): boolean {
  const keyStr = JSON.stringify(queryKey);
  
  // Real-time data should refetch on focus
  return keyStr.includes('system-health') || 
         keyStr.includes('alerts') || 
         keyStr.includes('findings');
}

function getRefetchInterval(queryKey: QueryKey): number | false {
  const keyStr = JSON.stringify(queryKey);
  
  // System health should auto-refresh
  if (keyStr.includes('system-health')) {
    return 60 * 1000; // 1 minute
  }
  
  // Alerts should auto-refresh
  if (keyStr.includes('alerts')) {
    return 2 * 60 * 1000; // 2 minutes
  }
  
  // No auto-refresh for other queries
  return false;
}

function getQueryType(queryKey: QueryKey): string {
  if (Array.isArray(queryKey) && queryKey.length > 0) {
    return String(queryKey[0]);
  }
  return 'unknown';
}

function getMutationType(mutationKey?: QueryKey): string {
  if (mutationKey && Array.isArray(mutationKey) && mutationKey.length > 0) {
    return String(mutationKey[0]);
  }
  return 'unknown';
}

function handleQueryError(queryKey: QueryKey, error: any): void {
  const queryType = getQueryType(queryKey);
  
  // Handle specific error types
  if (error?.status === 401) {
    // Redirect to login for auth errors
    window.location.href = '/auth';
  } else if (error?.status === 403) {
    // Show permission error
    console.warn('Permission denied for query:', queryType);
  } else if (error?.status >= 500) {
    // Server errors - could trigger retry or fallback
    console.error('Server error for query:', queryType);
  }
}

function invalidateRelatedQueries(mutationKey?: QueryKey, variables?: any): void {
  if (!mutationKey) return;
  
  const mutationType = getMutationType(mutationKey);
  
  // Invalidate related queries based on mutation type
  switch (mutationType) {
    case 'create-organization':
    case 'update-organization':
    case 'delete-organization':
      queryClient.invalidateQueries(queryKeys.organizations);
      break;
      
    case 'create-aws-account':
    case 'update-aws-account':
    case 'delete-aws-account':
      queryClient.invalidateQueries(queryKeys.awsAccounts);
      break;
      
    case 'run-security-scan':
      queryClient.invalidateQueries(queryKeys.securityScans);
      queryClient.invalidateQueries(queryKeys.securityFindings());
      break;
      
    case 'create-kb-article':
    case 'update-kb-article':
    case 'delete-kb-article':
      queryClient.invalidateQueries(queryKeys.knowledgeBase(''));
      break;
      
    default:
      // Generic invalidation
      console.log('No specific invalidation for mutation:', mutationType);
  }
}

// Query prefetching utilities
export const prefetchQueries = {
  // Prefetch user data on login
  async userData(userId: string) {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.userProfile,
        queryFn: () => fetchUserProfile(userId),
        staleTime: 15 * 60 * 1000,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.userSettings,
        queryFn: () => fetchUserSettings(userId),
        staleTime: 15 * 60 * 1000,
      }),
    ]);
  },
  
  // Prefetch organization data
  async organizationData(orgId: string) {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.organization(orgId),
        queryFn: () => fetchOrganization(orgId),
        staleTime: 15 * 60 * 1000,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.awsAccounts,
        queryFn: () => fetchAWSAccounts(orgId),
        staleTime: 10 * 60 * 1000,
      }),
    ]);
  },
  
  // Prefetch dashboard data
  async dashboardData(orgId: string, accountId?: string) {
    const prefetchPromises = [
      queryClient.prefetchQuery({
        queryKey: queryKeys.securityPosture(orgId),
        queryFn: () => fetchSecurityPosture(orgId),
        staleTime: 5 * 60 * 1000,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.securityFindings(),
        queryFn: () => fetchSecurityFindings(orgId),
        staleTime: 2 * 60 * 1000,
      }),
    ];
    
    if (accountId) {
      prefetchPromises.push(
        queryClient.prefetchQuery({
          queryKey: queryKeys.costOptimization(orgId, accountId),
          queryFn: () => fetchCostOptimization(orgId, accountId),
          staleTime: 5 * 60 * 1000,
        })
      );
    }
    
    await Promise.all(prefetchPromises);
  },
};

// Background sync for offline support
export const backgroundSync = {
  // Sync critical data in background
  async syncCriticalData() {
    const criticalQueries = [
      queryKeys.userProfile,
      queryKeys.organizations,
      queryKeys.systemHealth,
    ];
    
    await Promise.allSettled(
      criticalQueries.map(queryKey =>
        queryClient.refetchQueries({ queryKey, type: 'active' })
      )
    );
  },
  
  // Periodic background refresh
  startBackgroundRefresh() {
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.syncCriticalData();
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  },
};

// Query client instance
export const queryClient = createOptimizedQueryClient();

// Real API implementations using the AWS API client
import { apiClient } from '../integrations/aws/api-client';

/**
 * Fetch user profile data
 */
async function fetchUserProfile(userId: string): Promise<{
  id: string;
  user_id: string;
  organization_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  created_at: string;
  updated_at: string;
}> {
  const response = await apiClient.select('profiles', {
    eq: { user_id: userId },
    limit: 1
  });

  if (response.error) {
    logger.error('Failed to fetch user profile', new Error(response.error.message));
    throw new Error(response.error.message);
  }

  if (!response.data || response.data.length === 0) {
    throw new Error('User profile not found');
  }

  return response.data[0];
}

/**
 * Fetch user settings (using profile data as base)
 */
async function fetchUserSettings(userId: string): Promise<{
  userId: string;
  preferences: Record<string, any>;
  notifications: Record<string, boolean>;
  theme: string;
  language: string;
}> {
  const profile = await fetchUserProfile(userId);
  
  // Return default settings structure (can be extended with actual settings table)
  return {
    userId,
    preferences: {
      dashboard_layout: 'grid',
      auto_refresh: true,
      show_tutorials: true,
    },
    notifications: {
      email_alerts: true,
      browser_notifications: true,
      security_findings: true,
      cost_alerts: true,
    },
    theme: 'system',
    language: 'en',
  };
}

/**
 * Fetch organization data
 */
async function fetchOrganization(orgId: string): Promise<{
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
  _count?: {
    profiles: number;
    aws_accounts: number;
    findings: number;
  };
}> {
  const response = await apiClient.select('organizations', {
    eq: { id: orgId },
    limit: 1
  });

  if (response.error) {
    logger.error('Failed to fetch organization', new Error(response.error.message));
    throw new Error(response.error.message);
  }

  if (!response.data || response.data.length === 0) {
    throw new Error('Organization not found');
  }

  const org = response.data[0];

  // Fetch counts for dashboard metrics
  const [profilesResponse, accountsResponse, findingsResponse] = await Promise.allSettled([
    apiClient.select('profiles', { eq: { organization_id: orgId } }),
    apiClient.select('aws_accounts', { eq: { organization_id: orgId } }),
    apiClient.select('findings', { eq: { organization_id: orgId } })
  ]);

  const counts = {
    profiles: profilesResponse.status === 'fulfilled' && !profilesResponse.value.error 
      ? profilesResponse.value.data?.length || 0 : 0,
    aws_accounts: accountsResponse.status === 'fulfilled' && !accountsResponse.value.error 
      ? accountsResponse.value.data?.length || 0 : 0,
    findings: findingsResponse.status === 'fulfilled' && !findingsResponse.value.error 
      ? findingsResponse.value.data?.length || 0 : 0,
  };

  return {
    ...org,
    _count: counts,
  };
}

/**
 * Fetch AWS accounts for organization
 */
async function fetchAWSAccounts(orgId: string): Promise<Array<{
  id: string;
  organization_id: string;
  account_id: string;
  account_name: string;
  email: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}>> {
  const response = await apiClient.select('aws_accounts', {
    eq: { organization_id: orgId },
    order: { column: 'created_at', ascending: false }
  });

  if (response.error) {
    logger.error('Failed to fetch AWS accounts', new Error(response.error.message));
    throw new Error(response.error.message);
  }

  return response.data || [];
}

/**
 * Fetch security posture for organization
 */
async function fetchSecurityPosture(orgId: string): Promise<{
  id: string;
  organization_id: string;
  overall_score: number;
  critical_findings: number;
  high_findings: number;
  medium_findings: number;
  low_findings: number;
  compliance_score: number | null;
  risk_level: string;
  calculated_at: string;
  trend?: {
    score_change: number;
    findings_change: number;
  };
}> {
  const response = await apiClient.select('security_posture', {
    eq: { organization_id: orgId },
    order: { column: 'calculated_at', ascending: false },
    limit: 1
  });

  if (response.error) {
    logger.error('Failed to fetch security posture', new Error(response.error.message));
    throw new Error(response.error.message);
  }

  if (!response.data || response.data.length === 0) {
    // Return default posture if none exists
    return {
      id: 'default',
      organization_id: orgId,
      overall_score: 0,
      critical_findings: 0,
      high_findings: 0,
      medium_findings: 0,
      low_findings: 0,
      compliance_score: null,
      risk_level: 'unknown',
      calculated_at: new Date().toISOString(),
      trend: {
        score_change: 0,
        findings_change: 0,
      },
    };
  }

  const posture = response.data[0];

  // Fetch previous posture for trend calculation
  const previousResponse = await apiClient.select('security_posture', {
    eq: { organization_id: orgId },
    order: { column: 'calculated_at', ascending: false },
    limit: 2
  });

  let trend = { score_change: 0, findings_change: 0 };
  
  if (previousResponse.data && previousResponse.data.length > 1) {
    const previous = previousResponse.data[1];
    trend = {
      score_change: posture.overall_score - previous.overall_score,
      findings_change: (posture.critical_findings + posture.high_findings + posture.medium_findings + posture.low_findings) -
                      (previous.critical_findings + previous.high_findings + previous.medium_findings + previous.low_findings),
    };
  }

  return {
    ...posture,
    trend,
  };
}

/**
 * Fetch security findings for organization
 */
async function fetchSecurityFindings(orgId: string): Promise<Array<{
  id: string;
  organization_id: string | null;
  event_id: string | null;
  event_name: string | null;
  event_time: string | null;
  severity: string;
  description: string;
  details: Record<string, any>;
  ai_analysis: string | null;
  status: string;
  source: string | null;
  resource_id: string | null;
  resource_arn: string | null;
  scan_type: string | null;
  service: string | null;
  category: string | null;
  compliance: string[];
  remediation: string | null;
  risk_vector: string | null;
  evidence: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}>> {
  const response = await apiClient.select('findings', {
    eq: { organization_id: orgId },
    order: { column: 'created_at', ascending: false },
    limit: 100
  });

  if (response.error) {
    logger.error('Failed to fetch security findings', new Error(response.error.message));
    throw new Error(response.error.message);
  }

  return response.data || [];
}

/**
 * Fetch cost optimization data for organization and account
 */
async function fetchCostOptimization(orgId: string, accountId: string): Promise<{
  summary: {
    total_monthly_cost: number;
    potential_savings: number;
    waste_percentage: number;
    top_services: Array<{ service: string; cost: number; percentage: number }>;
  };
  waste_detections: Array<{
    id: string;
    organization_id: string;
    account_id: string;
    resource_id: string;
    resource_type: string;
    resource_name: string | null;
    region: string;
    waste_type: string;
    confidence: number;
    estimated_monthly_cost: number;
    estimated_savings: number;
    recommendation: string;
    detected_at: string;
  }>;
  daily_costs: Array<{
    date: string;
    service: string;
    cost: number;
    usage: number | null;
  }>;
}> {
  // Fetch waste detections
  const wasteResponse = await apiClient.select('waste_detections', {
    eq: { organization_id: orgId, aws_account_id: accountId },
    order: { column: 'detected_at', ascending: false },
    limit: 50
  });

  // Fetch recent daily costs (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const costsResponse = await apiClient.select('daily_costs', {
    eq: { organization_id: orgId, aws_account_id: accountId },
    order: { column: 'date', ascending: false },
    limit: 1000
  });

  const wasteDetections = wasteResponse.error ? [] : (wasteResponse.data || []);
  const dailyCosts = costsResponse.error ? [] : (costsResponse.data || []);

  // Calculate summary metrics
  const totalMonthlyCost = dailyCosts.reduce((sum, cost) => sum + cost.cost, 0);
  const potentialSavings = wasteDetections.reduce((sum, waste) => sum + waste.estimated_savings, 0);
  const wastePercentage = totalMonthlyCost > 0 ? (potentialSavings / totalMonthlyCost) * 100 : 0;

  // Calculate top services by cost
  const servicesCosts = dailyCosts.reduce((acc, cost) => {
    acc[cost.service] = (acc[cost.service] || 0) + cost.cost;
    return acc;
  }, {} as Record<string, number>);

  const topServices = Object.entries(servicesCosts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([service, cost]) => ({
      service,
      cost,
      percentage: totalMonthlyCost > 0 ? (cost / totalMonthlyCost) * 100 : 0,
    }));

  return {
    summary: {
      total_monthly_cost: totalMonthlyCost,
      potential_savings: potentialSavings,
      waste_percentage: wastePercentage,
      top_services: topServices,
    },
    waste_detections: wasteDetections,
    daily_costs: dailyCosts,
  };
}