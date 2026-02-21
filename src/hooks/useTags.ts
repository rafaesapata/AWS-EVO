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
  totalResources: number;
  taggedResources: number;
  untaggedResources: number;
  coveragePercentage: number;
  breakdownByProvider: Record<string, number>;
  resourceSource?: string;
}

export interface CostReportResult {
  totalCost: number;
  costByService: Record<string, number>;
  costByProvider: Record<string, number>;
  timeSeries: Array<{ date: string; cost: number }>;
  resourceCount: number;
  disclaimer: string;
}

/** Extract error message from API response and throw */
function throwIfError(res: any): void {
  if ('error' in res && res.error) {
    const msg = typeof res.error === 'object' ? res.error.message : String(res.error);
    throw new Error(msg || 'Request failed');
  }
}

export function useTagList(params?: { category?: string; search?: string; sortBy?: string; limit?: number; cursor?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: ['tags', 'list', params],
    queryFn: async () => {
      const res = await apiClient.lambda<{ tags: Tag[]; nextCursor?: string; total: number }>('tag-crud', {
        action: 'list',
        ...params,
      });
      throwIfError(res);
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
      throwIfError(res);
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
      throwIfError(res);
      return (res as any).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      toast.success('Tag criada com sucesso');
    },
    onError: (err: Error) => {
      const msg = err.message || 'Erro ao criar tag';
      // Translate common backend messages to user-friendly Portuguese
      if (msg.includes('already exists')) {
        toast.error('Esta tag já existe. Use uma combinação diferente de chave e valor.', { duration: 5000 });
      } else if (msg.includes('tag limit')) {
        toast.error('Limite de tags da organização atingido.', { duration: 5000 });
      } else {
        toast.error(msg, { duration: 5000 });
      }
    },
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tagId, ...input }: { tagId: string; color?: string; category?: string; description?: string }) => {
      const res = await apiClient.lambda<Tag>('tag-crud', { action: 'update', tagId, ...input });
      throwIfError(res);
      return (res as any).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      toast.success('Tag atualizada');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao atualizar tag');
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      const res = await apiClient.lambda<{ assignmentsRemoved: number }>('tag-crud', { action: 'delete', tagId });
      throwIfError(res);
      return (res as any).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      toast.success('Tag removida');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao remover tag');
    },
  });
}

export function useAssignTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tagId: string; resources: Array<{ resourceId: string; resourceType: string; cloudProvider: string }> }) => {
      const res = await apiClient.lambda<any>('tag-assign', { action: 'assign', ...input });
      throwIfError(res);
      return (res as any).data;
    },
    onSuccess: () => { qc.refetchQueries({ queryKey: ['tags'] }); },
    onError: (err: Error) => { toast.error(err.message || 'Erro ao atribuir tag'); },
  });
}

export function useUnassignTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tagId: string; resourceIds: string[] }) => {
      const res = await apiClient.lambda<any>('tag-assign', { action: 'unassign', ...input });
      throwIfError(res);
      return (res as any).data;
    },
    onSuccess: () => { qc.refetchQueries({ queryKey: ['tags'] }); },
    onError: (err: Error) => { toast.error(err.message || 'Erro ao remover atribuição'); },
  });
}

export interface BulkResource {
  resourceId: string;
  resourceType?: string;
  resourceName?: string;
  cloudProvider?: string;
  awsAccountId?: string;
}

export function useBulkAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tagIds: string[]; resources: BulkResource[] }) => {
      const res = await apiClient.lambda<any>('tag-bulk-assign', {
        tagIds: input.tagIds,
        resources: input.resources,
      });
      throwIfError(res);
      return (res as any).data;
    },
    onSuccess: (data) => {
      // Force immediate refetch of all tag-related queries so indicators update
      qc.refetchQueries({ queryKey: ['tags'] });
      const assigned = data?.assignedCount || 0;
      const skipped = data?.skippedCount || 0;
      if (assigned > 0) {
        toast.success(`${assigned} atribuições criadas${skipped > 0 ? `, ${skipped} já existiam` : ''}`, { duration: 5000 });
      } else if (skipped > 0) {
        toast.info(`Todas as ${skipped} atribuições já existiam`, { duration: 5000 });
      }
    },
    onError: (err: Error) => { toast.error(err.message || 'Erro na atribuição em massa', { duration: 5000 }); },
  });
}

export function useTagSuggestions(params: { resourceType?: string; resourceName?: string; accountId?: string; region?: string }) {
  const hasResourceType = !!params.resourceType && params.resourceType.length > 0;
  return useQuery({
    queryKey: ['tags', 'suggestions', params],
    queryFn: async () => {
      const res = await apiClient.lambda<Tag[]>('tag-suggestions', params);
      throwIfError(res);
      return (res as any).data;
    },
    enabled: hasResourceType,
    retry: false,
  });
}

export function useTagTemplates(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['tags', 'templates'],
    queryFn: async () => {
      const res = await apiClient.lambda<TagTemplate[]>('tag-templates', { action: 'list' });
      throwIfError(res);
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
      throwIfError(res);
      return (res as any).data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      toast.success(`${data.createdCount} tags criadas, ${data.skippedCount} já existiam`);
    },
    onError: (err: Error) => { toast.error(err.message || 'Erro ao aplicar templates'); },
  });
}

export function useTagCoverage(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['tags', 'coverage'],
    queryFn: async () => {
      const res = await apiClient.lambda<CoverageMetrics>('tag-coverage', {});
      throwIfError(res);
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
      throwIfError(res);
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
      throwIfError(res);
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
      throwIfError(res);
      return (res as any).data;
    },
    enabled: params?.enabled ?? false,
    retry: false,
  });
}

export interface ResourceAssignment {
  id: string;
  resource_id: string;
  resource_type: string;
  resource_name: string | null;
  cloud_provider: string;
  aws_account_id: string | null;
  azure_credential_id: string | null;
  assigned_at: string;
  assigned_by: string;
}

export function useResourcesByTag(tagId: string | null, params?: { limit?: number; resourceType?: string; cloudProvider?: string }) {
  return useQuery({
    queryKey: ['tags', 'resources-by-tag', tagId, params],
    queryFn: async () => {
      const res = await apiClient.lambda<{ data: ResourceAssignment[]; nextCursor: string | null }>('tag-resources', {
        action: 'resources-by-tag',
        tagId,
        ...params,
      });
      throwIfError(res);
      return (res as any).data;
    },
    enabled: !!tagId,
  });
}

export function useTagsForResource(resourceId: string | null) {
  return useQuery({
    queryKey: ['tags', 'resource', resourceId],
    queryFn: async () => {
      const res = await apiClient.lambda<Tag[]>('tag-resources', { action: 'tags-for-resource', resourceId });
      throwIfError(res);
      return (res as any).data as Tag[];
    },
    enabled: !!resourceId,
  });
}

// ============================================================================
// Tag Policies (Melhoria 9)
// ============================================================================

export interface TagPolicies {
  enforce_naming: boolean;
  prevent_duplicates: boolean;
  require_category: boolean;
  alert_low_coverage: boolean;
  coverage_threshold: number;
  alert_untagged_new: boolean;
  required_keys: string[];
}

export function useTagPolicies(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['tags', 'policies'],
    queryFn: async () => {
      const res = await apiClient.lambda<TagPolicies>('tag-crud', { action: 'get-policies' });
      throwIfError(res);
      return (res as any).data as TagPolicies;
    },
    retry: false,
    enabled: options?.enabled ?? false,
  });
}

export function useSaveTagPolicies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<TagPolicies>) => {
      const res = await apiClient.lambda<TagPolicies>('tag-crud', { action: 'save-policies', ...input });
      throwIfError(res);
      return (res as any).data as TagPolicies;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags', 'policies'] });
      toast.success('Políticas de tags salvas');
    },
    onError: (err: Error) => { toast.error(err.message || 'Erro ao salvar políticas'); },
  });
}

// ============================================================================
// Recent Activity (Melhoria 5)
// ============================================================================

export interface RecentActivityItem {
  id: string;
  tag_key: string;
  tag_value: string;
  tag_color: string;
  tag_id: string;
  resource_id: string;
  resource_name: string | null;
  resource_type: string;
  cloud_provider: string;
  assigned_by: string;
  assigned_at: string;
}

export function useRecentActivity(options?: { limit?: number; enabled?: boolean }) {
  return useQuery({
    queryKey: ['tags', 'recent-activity', options?.limit],
    queryFn: async () => {
      const res = await apiClient.lambda<RecentActivityItem[]>('tag-resources', {
        action: 'recent-activity',
        limit: options?.limit || 10,
      });
      throwIfError(res);
      return (res as any).data as RecentActivityItem[];
    },
    retry: false,
    enabled: options?.enabled ?? false,
  });
}

// ============================================================================
// All Resources - tagged + untagged (Melhoria 3)
// ============================================================================

export function useAllResources(params?: { resourceType?: string; cloudProvider?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: ['tags', 'all-resources', params],
    queryFn: async () => {
      const res = await apiClient.lambda<any>('tag-resources', {
        action: 'all-resources',
        ...params,
      });
      throwIfError(res);
      return (res as any).data;
    },
    enabled: params?.enabled ?? false,
    retry: false,
  });
}

// ============================================================================
// Enrich Legacy Assignments (Melhoria 6)
// ============================================================================

export function useEnrichLegacy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.lambda<any>('tag-resources', { action: 'enrich-legacy' });
      throwIfError(res);
      return (res as any).data;
    },
    onSuccess: (data) => {
      qc.refetchQueries({ queryKey: ['tags'] });
      toast.success(`${data.enriched} de ${data.total} atribuições enriquecidas`);
    },
    onError: (err: Error) => { toast.error(err.message || 'Erro ao enriquecer atribuições'); },
  });
}

// ============================================================================
// Auto-Tagging Rules (Melhoria 1 - Advanced)
// ============================================================================

export interface TagAutoRule {
  id: string;
  name: string;
  description: string | null;
  conditions: Record<string, any>;
  tag_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  last_run_matched: number | null;
  last_run_applied: number | null;
  total_applied: number;
  created_by: string | null;
}

export function useAutoRules(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['tags', 'auto-rules'],
    queryFn: async () => {
      const res = await apiClient.lambda<TagAutoRule[]>('tag-crud', { action: 'list-auto-rules' });
      throwIfError(res);
      return (res as any).data as TagAutoRule[];
    },
    retry: false,
    enabled: options?.enabled ?? false,
  });
}

export function useCreateAutoRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; conditions: Record<string, any>; tagIds: string[]; priority?: number }) => {
      const res = await apiClient.lambda<TagAutoRule>('tag-crud', { action: 'create-auto-rule', ...input });
      throwIfError(res);
      return (res as any).data as TagAutoRule;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags', 'auto-rules'] });
      toast.success('Regra de auto-tagging criada');
    },
    onError: (err: Error) => { toast.error(err.message || 'Erro ao criar regra'); },
  });
}

export function useUpdateAutoRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ruleId, ...input }: { ruleId: string; name?: string; description?: string; conditions?: Record<string, any>; tagIds?: string[]; isActive?: boolean }) => {
      const res = await apiClient.lambda<TagAutoRule>('tag-crud', { action: 'update-auto-rule', ruleId, ...input });
      throwIfError(res);
      return (res as any).data as TagAutoRule;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags', 'auto-rules'] });
      toast.success('Regra atualizada');
    },
    onError: (err: Error) => { toast.error(err.message || 'Erro ao atualizar regra'); },
  });
}

export function useDeleteAutoRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ruleId: string) => {
      const res = await apiClient.lambda<any>('tag-crud', { action: 'delete-auto-rule', ruleId });
      throwIfError(res);
      return (res as any).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags', 'auto-rules'] });
      toast.success('Regra removida');
    },
    onError: (err: Error) => { toast.error(err.message || 'Erro ao remover regra'); },
  });
}

export function useExecuteAutoRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.lambda<{ rulesExecuted: number; totalAssigned: number }>('tag-crud', { action: 'execute-auto-rules' });
      throwIfError(res);
      return (res as any).data;
    },
    onSuccess: (data) => {
      qc.refetchQueries({ queryKey: ['tags'] });
      toast.success(`${data.rulesExecuted} regras executadas, ${data.totalAssigned} atribuições criadas`);
    },
    onError: (err: Error) => { toast.error(err.message || 'Erro ao executar regras'); },
  });
}

// ============================================================================
// Tag Hierarchy (Melhoria 2 - Advanced)
// ============================================================================

export interface TagTreeNode {
  id: string;
  key: string;
  value: string;
  color: string;
  parent_id: string | null;
  children: TagTreeNode[];
}

export function useTagTree(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['tags', 'tree'],
    queryFn: async () => {
      const res = await apiClient.lambda<TagTreeNode[]>('tag-crud', { action: 'get-tree' });
      throwIfError(res);
      return (res as any).data as TagTreeNode[];
    },
    retry: false,
    enabled: options?.enabled ?? false,
  });
}

export function useSetTagParent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tagId, parentId }: { tagId: string; parentId: string | null }) => {
      const res = await apiClient.lambda<any>('tag-crud', { action: 'set-parent', tagId, parentId });
      throwIfError(res);
      return (res as any).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      toast.success('Hierarquia atualizada');
    },
    onError: (err: Error) => { toast.error(err.message || 'Erro ao definir hierarquia'); },
  });
}

// ============================================================================
// Merge & Rename (Melhoria 9 - Advanced)
// ============================================================================

export function useMergeTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourceTagIds, targetTagId }: { sourceTagIds: string[]; targetTagId: string }) => {
      const res = await apiClient.lambda<{ movedAssignments: number; deletedTags: number }>('tag-crud', { action: 'merge', sourceTagIds, targetTagId });
      throwIfError(res);
      return (res as any).data;
    },
    onSuccess: (data) => {
      qc.refetchQueries({ queryKey: ['tags'] });
      toast.success(`Tags mescladas: ${data.movedAssignments} atribuições movidas, ${data.deletedTags} tags removidas`);
    },
    onError: (err: Error) => { toast.error(err.message || 'Erro ao mesclar tags'); },
  });
}

export function useRenameTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tagId, newKey, newValue }: { tagId: string; newKey: string; newValue: string }) => {
      const res = await apiClient.lambda<any>('tag-crud', { action: 'rename', tagId, newKey, newValue });
      throwIfError(res);
      return (res as any).data;
    },
    onSuccess: () => {
      qc.refetchQueries({ queryKey: ['tags'] });
      toast.success('Tag renomeada');
    },
    onError: (err: Error) => { toast.error(err.message || 'Erro ao renomear tag'); },
  });
}

// ============================================================================
// Cost Drill-Down (Melhoria 3 - Advanced)
// ============================================================================

export interface CostDrilldownResult {
  tagId: string;
  totalCost: number;
  byService: Array<{ service: string; cost: number }>;
  byResource: Array<{ resourceId: string; resourceName: string | null; cost: number }>;
  byDay: Array<{ date: string; cost: number }>;
}

export function useTagCostDrilldown(tagId: string | null, params?: { startDate?: string; endDate?: string; groupBy?: string }) {
  return useQuery({
    queryKey: ['tags', 'cost-drilldown', tagId, params],
    queryFn: async () => {
      const res = await apiClient.lambda<CostDrilldownResult>('tag-crud', { action: 'cost-drilldown', tagId, ...params });
      throwIfError(res);
      return (res as any).data as CostDrilldownResult;
    },
    enabled: !!tagId,
  });
}

export function useTagCostSparkline(tagId: string | null) {
  return useQuery({
    queryKey: ['tags', 'cost-sparkline', tagId],
    queryFn: async () => {
      const res = await apiClient.lambda<Array<{ date: string; cost: number }>>('tag-crud', { action: 'cost-sparkline', tagId });
      throwIfError(res);
      return (res as any).data as Array<{ date: string; cost: number }>;
    },
    enabled: !!tagId,
  });
}
