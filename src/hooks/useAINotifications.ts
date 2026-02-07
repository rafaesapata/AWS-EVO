/**
 * Hook para gerenciar notificações proativas da IA
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthSafe } from '@/hooks/useAuthSafe';
import { apiClient } from '@/integrations/aws/api-client';

export interface AINotification {
  id: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  suggested_action?: string;
  action_type?: string;
  action_params?: Record<string, unknown>;
  context?: Record<string, unknown>;
  status: string;
  created_at: string;
}

interface NotificationsResponse {
  notifications: AINotification[];
  unread_count: number;
}

export function useAINotifications() {
  const { session } = useAuthSafe();
  const isAuthenticated = !!session;
  const queryClient = useQueryClient();

  // Polling a cada 30 segundos
  const { data, isLoading, error, refetch } = useQuery<NotificationsResponse>({
    queryKey: ['ai-notifications'],
    queryFn: async () => {
      const response = await apiClient.invoke('get-ai-notifications', {});
      if (response.error) {
        throw new Error(response.error);
      }
      return response.data;
    },
    enabled: isAuthenticated,
    refetchInterval: 30000, // 30 segundos
    refetchIntervalInBackground: false, // Não fazer polling quando tab não está ativa
    staleTime: 10000, // 10 segundos
  });

  // Mutation para atualizar status
  const updateNotification = useMutation({
    mutationFn: async ({
      notificationId,
      action,
    }: {
      notificationId: string;
      action: 'read' | 'actioned' | 'dismissed';
    }) => {
      const response = await apiClient.invoke('update-ai-notification', {
        body: {
          notification_id: notificationId,
          action,
        },
      });
      if (response.error) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: (_data, variables) => {
      // For 'read' action, don't invalidate immediately — the notification
      // should remain visible in the chat. Only refetch for dismiss/actioned
      // so the unread count updates properly.
      if (variables.action !== 'read') {
        queryClient.invalidateQueries({ queryKey: ['ai-notifications'] });
      }
    },
  });

  return {
    notifications: data?.notifications || [],
    unreadCount: data?.unread_count || 0,
    isLoading,
    error,
    refetch,
    markAsRead: (notificationId: string) =>
      updateNotification.mutate({ notificationId, action: 'read' }),
    markAsActioned: (notificationId: string) =>
      updateNotification.mutate({ notificationId, action: 'actioned' }),
    dismiss: (notificationId: string) =>
      updateNotification.mutate({ notificationId, action: 'dismissed' }),
    isUpdating: updateNotification.isPending,
  };
}
