import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';
import { apiClient } from '@/integrations/aws/api-client';
import { useOrganization } from './useOrganization';
import { useToast } from './use-toast';

interface SystemEvent {
  id: string;
  event_type: string;
  event_source: string;
  aggregate_id?: string;
  aggregate_type?: string;
  organization_id?: string;
  user_id?: string;
  event_data: Record<string, any>;
  metadata: Record<string, any>;
  created_at: string;
  processed_at?: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
}

export function useSystemEvents(limit: number = 50) {
  const { data: organizationId } = useOrganization();
  const { toast } = useToast();

  const { data: events, isLoading, error } = useQuery({
    queryKey: ['system-events', organizationId, limit],
    queryFn: async () => {
      if (!organizationId) return [];

      const result = await apiClient.select('system_events', {
        select: '*',
        eq: { organization_id: organizationId },
        order: { column: 'created_at', ascending: false },
        limit: limit
      });

      if (result.error) throw new Error(result.error.message);
      return (result.data || []) as unknown as SystemEvent[];
    },
    enabled: !!organizationId,
    staleTime: 30000, // 30 seconds
  });

  return {
    events: events || [],
    isLoading,
    error,
  };
}

export function usePublishEvent() {
  const { data: organizationId } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      eventType: string;
      eventSource: string;
      eventData: Record<string, any>;
      aggregateId?: string;
      aggregateType?: string;
    }) => {
      const user = await cognitoAuth.getCurrentUser();

      // Direct insert since types are not yet updated
      const result = await apiClient.insert('system_events', {
        event_type: params.eventType,
        event_source: params.eventSource,
        aggregate_id: params.aggregateId,
        aggregate_type: params.aggregateType,
        organization_id: organizationId,
        user_id: user?.id,
        event_data: params.eventData,
        metadata: {
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
        },
      });

      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-events'] });
    },
    onError: (error) => {
      toast({
        title: 'Error publishing event',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useEventStream() {
  const { data: organizationId } = useOrganization();
  const queryClient = useQueryClient();

  // Subscribe to real-time events via pg_notify
  const subscribeToEvents = () => {
    if (!organizationId) return;

    // Real-time functionality would need to be implemented with WebSockets or Server-Sent Events
    // For now, we'll use polling as a fallback
    const pollInterval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['system-events'] });
    }, 10000); // Poll every 10 seconds

    return () => {
      clearInterval(pollInterval);
    };
  };

  return { subscribeToEvents };
}
