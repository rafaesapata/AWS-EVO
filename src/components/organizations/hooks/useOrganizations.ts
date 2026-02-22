/**
 * Custom hooks for Organizations management
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/integrations/aws/api-client";
import type { 
  Organization, 
  OrganizationUser, 
  LicensesResponse, 
  SeatAssignmentsResponse,
  OrganizationDetails,
  NewOrganization 
} from "../types";

// Helper to extract error message from API response
function getErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error) {
    return (error as { message: string }).message;
  }
  return 'Unknown error';
}

// Fetch organizations list
export function useOrganizationsList() {
  return useQuery({
    queryKey: ['organizations'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.invoke<Organization[]>('manage-organizations', {
        body: { action: 'list' }
      });

      if ('error' in response && response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data || [];
    },
  });
}

// Fetch organization users
export function useOrganizationUsers(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['organization-users', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return [];
      
      const response = await apiClient.invoke<OrganizationUser[]>('manage-organizations', {
        body: { action: 'list_users', id: organizationId }
      });

      if ('error' in response && response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data || [];
    },
  });
}

// Fetch organization licenses
export function useOrganizationLicenses(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['organization-licenses', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return null;
      
      const response = await apiClient.invoke<LicensesResponse>('manage-organizations', {
        body: { action: 'list_licenses', id: organizationId }
      });

      if ('error' in response && response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
  });
}

// Fetch seat assignments
export function useSeatAssignments(organizationId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['organization-seat-assignments', organizationId],
    enabled: !!organizationId && enabled,
    queryFn: async () => {
      if (!organizationId) return null;
      
      const response = await apiClient.invoke<SeatAssignmentsResponse>('manage-organizations', {
        body: { action: 'list_seat_assignments', id: organizationId }
      });

      if ('error' in response && response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
  });
}

// Fetch organization details
export function useOrganizationDetails(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['organization-details', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return null;
      
      const response = await apiClient.invoke<OrganizationDetails>('manage-organizations', {
        body: { action: 'get', id: organizationId }
      });

      if ('error' in response && response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
  });
}

// Create organization mutation
export function useCreateOrganization(onSuccess: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orgData: NewOrganization) => {
      const response = await apiClient.invoke('manage-organizations', {
        body: {
          action: 'create',
          name: orgData.name,
          description: orgData.description,
          domain: orgData.domain,
          billing_email: orgData.billing_email,
        }
      });

      if ('error' in response && response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Organização criada",
        description: "A organização foi criada com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar organização",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });
}

// Update organization mutation
export function useUpdateOrganization(onSuccess: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orgData: Partial<Organization> & { id: string }) => {
      const response = await apiClient.invoke('manage-organizations', {
        body: {
          action: 'update',
          id: orgData.id,
          name: orgData.name,
          description: orgData.description,
          domain: orgData.domain,
          billing_email: orgData.billing_email,
        }
      });

      if ('error' in response && response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Organização atualizada",
        description: "A organização foi atualizada com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar organização",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive"
      });
    }
  });
}

// Toggle demo mode mutation
export function useToggleDemoMode(onSuccess: () => void) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId, action, expiresInDays, reason }: { 
      organizationId: string; 
      action: 'activate' | 'deactivate'; 
      expiresInDays?: number;
      reason?: string;
    }) => {
      const response = await apiClient.invoke('manage-demo-mode', {
        body: {
          action,
          organizationId,
          expiresInDays,
          reason
        }
      });

      if ('error' in response && response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.action === 'activate' 
          ? t('demo.admin.activated', 'Modo demo ativado com sucesso')
          : t('demo.admin.deactivated', 'Modo demo desativado com sucesso'),
      });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Erro'),
        description: error instanceof Error ? error.message : t('common.unknownError', 'Erro desconhecido'),
        variant: "destructive"
      });
    }
  });
}

// Suspend/Unsuspend organization mutation
export function useSuspendOrganization(onSuccess: () => void) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId, action, reason }: { 
      organizationId: string; 
      action: 'suspend' | 'unsuspend'; 
      reason?: string;
    }) => {
      const response = await apiClient.invoke('manage-organizations', {
        body: {
          action,
          id: organizationId,
          reason
        }
      });

      if ('error' in response && response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.action === 'suspend' 
          ? t('organizations.suspended', 'Organização suspensa com sucesso')
          : t('organizations.unsuspended', 'Organização reativada com sucesso'),
        description: variables.action === 'suspend'
          ? t('organizations.suspendedDesc', 'Todas as licenças foram desativadas')
          : t('organizations.unsuspendedDesc', 'Licenças válidas foram reativadas'),
      });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: t('common.error', 'Erro'),
        description: error instanceof Error ? error.message : t('common.unknownError', 'Erro desconhecido'),
        variant: "destructive"
      });
    }
  });
}

// Sync license mutation
export function useSyncLicense(organizationId: string | undefined) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orgId: string) => {
      const response = await apiClient.invoke('admin-sync-license', {
        body: {
          organization_ids: [orgId]
        }
      });

      if ('error' in response && response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: t('organizations.licenseSynced', 'Licença sincronizada'),
        description: t('organizations.licenseSyncedDesc', 'A licença foi sincronizada com sucesso.'),
      });
      queryClient.invalidateQueries({ queryKey: ['organization-licenses', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['organization-details', organizationId] });
    },
    onError: (error) => {
      toast({
        title: t('organizations.licenseSyncError', 'Erro ao sincronizar licença'),
        description: error instanceof Error ? error.message : t('common.unknownError', 'Erro desconhecido'),
        variant: "destructive"
      });
    }
  });
}

// Update license config mutation (super admin)
export function useUpdateLicenseConfig(onSuccess: () => void) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId, customer_id, auto_sync, trigger_sync }: {
      organizationId: string;
      customer_id: string;
      auto_sync: boolean;
      trigger_sync: boolean;
    }) => {
      const response = await apiClient.invoke('manage-organizations', {
        body: {
          action: 'update_license_config',
          id: organizationId,
          customer_id,
          auto_sync,
          trigger_sync,
        }
      });

      if ('error' in response && response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: (data, variables) => {
      toast({
        title: t('organizations.licenseConfigUpdated', 'Configuração de licença atualizada'),
        description: variables.trigger_sync
          ? t('organizations.licenseConfigSynced', 'Configuração salva e sincronização disparada.')
          : t('organizations.licenseConfigSaved', 'Configuração salva com sucesso.'),
      });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization-details', variables.organizationId] });
      queryClient.invalidateQueries({ queryKey: ['organization-licenses', variables.organizationId] });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: t('organizations.licenseConfigError', 'Erro ao atualizar configuração de licença'),
        description: error instanceof Error ? error.message : t('common.unknownError', 'Erro desconhecido'),
        variant: "destructive"
      });
    }
  });
}

// Release seat mutation
export function useReleaseSeat(organizationId: string | undefined, onSuccess: () => void) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId, seatAssignmentId }: { organizationId: string; seatAssignmentId: string }) => {
      const response = await apiClient.invoke('manage-organizations', {
        body: {
          action: 'release_seat',
          id: organizationId,
          seat_assignment_id: seatAssignmentId
        }
      });

      if ('error' in response && response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: () => {
      toast({
        title: t('organizations.seatReleased', 'Assento liberado'),
        description: t('organizations.seatReleasedDesc', 'O assento foi liberado com sucesso.'),
      });
      queryClient.invalidateQueries({ queryKey: ['organization-seat-assignments', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['organization-licenses', organizationId] });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: t('organizations.seatReleaseError', 'Erro ao liberar assento'),
        description: error instanceof Error ? error.message : t('common.unknownError', 'Erro desconhecido'),
        variant: "destructive"
      });
    }
  });
}

// Get cost overhead for an organization
export function useCostOverhead(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['cost-overhead', organizationId],
    queryFn: async () => {
      const response = await apiClient.invoke<{ cost_overhead_percentage: number }>('manage-cost-overhead', {
        body: { action: 'get', organizationId }
      });
      if ('error' in response && response.error) {
        throw new Error(getErrorMessage(response.error));
      }
      return response.data as { cost_overhead_percentage: number };
    },
    enabled: !!organizationId,
  });
}

// Update cost overhead mutation
export function useUpdateCostOverhead(onSuccess?: () => void) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId, overhead_percentage }: { organizationId: string; overhead_percentage: number }) => {
      const response = await apiClient.invoke('manage-cost-overhead', {
        body: { action: 'update', organizationId, overhead_percentage }
      });
      if ('error' in response && response.error) {
        throw new Error(getErrorMessage(response.error));
      }
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: t('organizations.overheadUpdated', 'Overhead atualizado'),
        description: t('organizations.overheadUpdatedDesc', 'O percentual de overhead foi atualizado com sucesso.'),
      });
      queryClient.invalidateQueries({ queryKey: ['cost-overhead'] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      onSuccess?.();
    },
    onError: (error) => {
      toast({
        title: t('organizations.overheadError', 'Erro ao atualizar overhead'),
        description: error instanceof Error ? error.message : t('common.unknownError', 'Erro desconhecido'),
        variant: "destructive"
      });
    }
  });
}
