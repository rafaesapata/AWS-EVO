import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/integrations/aws/api-client';
import { toast } from 'sonner';

export interface Tag {
  id: string;
  key: string;
  value: string;
  color: string;
  category: string;
  description?: string;
  usage_count?: number;
  created_at: string;
}

export interface TagTemplate {
  id: string;
  name: string;
  description: string;
  tags: Array<{ key: string; value: string; color: string; category: string }>;
}

export interface CoverageMetrics {
  total_resources: number;
  tagged_resources: number;
  untagged_resources: number;
  coverage_percentage: number;
  breakdown_by_provider: Record<string, { total: number; tagged: number }>;
}

export interface CostReportResult {
  totalCost: number;
  costByService: Record<string, number>;
  costByProvider: Record<string, number>;
  timeSeries: Array<{ date: string; cost: number }>;
  resourceCount: number;
  disclaimer: string;
}

export function useTagList(params?: { category?: string; search?: string; sortBy?: string; limit?: number; cursor?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: ['tags', 'list', params],
    queryFn: async () => {
      const res = await apiClient.lambda<{ tags: Tag[]; nextCursor?: string; total: number }>('tag-crud', {
        action: 'list',
        ...params,
      });
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data;
    },
    retry: false,
    enabled: params?.enabled ?? false,
  });
}

export function useTagDetails(tagId: string | null) {
  return useQuery({
    queryKey: ['tags', 'details', tagId],
    queryFn: async () => {
      const res = await apiClient.lambda<any>('tag-crud', { action: 'get', tagId });
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data;
    },
    enabled: !!tagId,
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: string; value: string; color: string; category?: string; description?: string }) => {
      const res = await apiClient.lambda<Tag>('tag-crud', { action: 'create', ...input });
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); },
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tagId, ...input }: { tagId: string; color?: string; category?: string; description?: string }) => {
      const res = await apiClient.lambda<Tag>('tag-crud', { action: 'update', tagId, ...input });
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      const res = await apiClient.lambda<{ assignmentsRemoved: number }>('tag-crud', { action: 'delete', tagId });
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); },
  });
}

export function useAssignTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tagId: string; resources: Array<{ resourceId: string; resourceType: string; cloudProvider: string }> }) => {
      const res = await apiClient.lambda<any>('tag-assign', { action: 'assign', ...input });
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); },
  });
}

export function useUnassignTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tagId: string; resourceIds: string[] }) => {
      const res = await apiClient.lambda<any>('tag-assign', { action: 'unassign', ...input });
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); },
  });
}

export function useBulkAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tagIds: string[]; resourceIds: string[] }) => {
      const res = await apiClient.lambda<any>('tag-bulk-assign', input);
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); },
  });
}

export function useTagSuggestions(params: { resourceType?: string; resourceName?: string; accountId?: string; region?: string }) {
  return useQuery({
    queryKey: ['tags', 'suggestions', params],
    queryFn: async () => {
      const res = await apiClient.lambda<Tag[]>('tag-suggestions', params);
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data;
    },
    enabled: !!params.resourceType,
  });
}

export function useTagTemplates(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['tags', 'templates'],
    queryFn: async () => {
      const res = await apiClient.lambda<TagTemplate[]>('tag-templates', { action: 'list' });
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data;
    },
    enabled: options?.enabled ?? false,
    retry: false,
  });
}

export function useApplyTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateIds: string[]) => {
      const res = await apiClient.lambda<any>('tag-templates', { action: 'apply', templateIds });
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      toast.success('Templates applied successfully');
    },
  });
}

export function useTagCoverage(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['tags', 'coverage'],
    queryFn: async () => {
      const res = await apiClient.lambda<CoverageMetrics>('tag-coverage', {});
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data as CoverageMetrics;
    },
    retry: false,
    enabled: options?.enabled ?? false,
  });
}

export function useTagCostReport(tagId: string | null, params?: { startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: ['tags', 'cost-report', tagId, params],
    queryFn: async () => {
      const res = await apiClient.lambda<CostReportResult>('tag-cost-report', { tagId, ...params });
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data as CostReportResult;
    },
    enabled: !!tagId,
  });
}

export function useTagSecurityFindings(tagIds: string[], params?: { severity?: string; status?: string }) {
  return useQuery({
    queryKey: ['tags', 'security-findings', tagIds, params],
    queryFn: async () => {
      const res = await apiClient.lambda<any>('tag-security-findings', { tagIds, ...params });
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data;
    },
    enabled: tagIds.length > 0,
  });
}

export function useUntaggedResources(params?: { resourceType?: string; cloudProvider?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: ['tags', 'untagged', params],
    queryFn: async () => {
      const res = await apiClient.lambda<any>('tag-untagged-resources', params || {});
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data;
    },
    enabled: params?.enabled ?? false,
    retry: false,
  });
}

export function useTagsForResource(resourceId: string | null) {
  return useQuery({
    queryKey: ['tags', 'resource', resourceId],
    queryFn: async () => {
      const res = await apiClient.lambda<Tag[]>('tag-resources', { action: 'tags-for-resource', resourceId });
      if ('error' in res && res.error) throw new Error(res.error);
      return (res as any).data as Tag[];
    },
    enabled: !!resourceId,
  });
}
