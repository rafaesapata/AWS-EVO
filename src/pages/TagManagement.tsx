import { useState, useCallback, useMemo, useEffect, Fragment } from 'react';
import { Layout } from '@/components/Layout';
import { Tags, Trash2, Pencil, Loader2, Shield, AlertTriangle, Download, ChevronDown, ChevronRight, ExternalLink, X, Clock, Wrench, FileText, Zap, GitMerge, Play, Plus, Power, PowerOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { TagBadge } from '@/components/tags/TagBadge';
import { TagSelector } from '@/components/tags/TagSelector';
import { BulkTaggingDrawer } from '@/components/tags/BulkTaggingDrawer';
import { QuickstartWizard } from '@/components/tags/QuickstartWizard';
import { OverviewTab } from '@/components/tags/tabs/OverviewTab';
import {
  useTagList, useTagCoverage, useDeleteTag, useUpdateTag, useTagCostReport,
  useTagSecurityFindings, useResourcesByTag, useUnassignTag,
  useTagPolicies, useSaveTagPolicies, useRecentActivity, useEnrichLegacy,
  useAutoRules, useCreateAutoRule, useDeleteAutoRule, useUpdateAutoRule, useExecuteAutoRules,
  useTagTree, useMergeTags, useRenameTag,
  useTagCostDrilldown,
  type Tag, type ResourceAssignment, type TagPolicies, type TagAutoRule, type TagTreeNode,
} from '@/hooks/useTags';
import { useDemoAwareQuery } from '@/hooks/useDemoAwareQuery';
import {
  filterDemoTags, generateDemoCoverage, generateDemoCostReport,
  generateDemoSecurityFindings,
} from '@/lib/demo/tag-demo-data';

export default function TagManagement() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const [editTarget, setEditTarget] = useState<Tag | null>(null);
  const [editColor, setEditColor] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [quickstartDismissed, setQuickstartDismissed] = useState(false);
  const [selectedCostTag, setSelectedCostTag] = useState<string | null>(null);
  const [selectedSecTags, setSelectedSecTags] = useState<string[]>([]);
  const [expandedTagId, setExpandedTagId] = useState<string | null>(null);
  const { isInDemoMode } = useDemoAwareQuery();

  // Real queries
  const { data: tagData, isLoading: _isLoadingQuery } = useTagList({
    search: search || undefined,
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    limit: 100,
    enabled: !isInDemoMode,
  });
  const { data: coverageReal, isLoading: isLoadingCoverage } = useTagCoverage({ enabled: !isInDemoMode });
  const deleteTag = useDeleteTag();
  const updateTag = useUpdateTag();
  const unassignTag = useUnassignTag();
  const enrichLegacy = useEnrichLegacy();
  const { data: costReportReal, isLoading: isLoadingCost } = useTagCostReport(isInDemoMode ? null : selectedCostTag);
  const { data: secFindingsReal, isLoading: isLoadingSec } = useTagSecurityFindings(isInDemoMode ? [] : selectedSecTags);
  const { data: expandedTagResources, isLoading: isLoadingResources } = useResourcesByTag(
    isInDemoMode ? null : expandedTagId
  );
  const { data: policiesData, isLoading: isLoadingPolicies } = useTagPolicies({ enabled: !isInDemoMode });
  const savePolicies = useSaveTagPolicies();
  const { data: recentActivity, isLoading: isLoadingActivity } = useRecentActivity({ limit: 8, enabled: !isInDemoMode });

  // Advanced features hooks
  const { data: autoRules, isLoading: loadingRules } = useAutoRules({ enabled: !isInDemoMode && tab === 'automation' });
  const createAutoRule = useCreateAutoRule();
  const deleteAutoRule = useDeleteAutoRule();
  const updateAutoRuleMut = useUpdateAutoRule();
  const executeAutoRules = useExecuteAutoRules();
  const { data: tagTree, isLoading: isLoadingTree } = useTagTree({ enabled: !isInDemoMode && tab === 'hierarchy' });
  const mergeTags = useMergeTags();
  const renameTagMut = useRenameTag();
  const [drilldownTagId, setDrilldownTagId] = useState<string | null>(null);
  const { data: drilldownData } = useTagCostDrilldown(!isInDemoMode ? drilldownTagId : null);
  const [mergeSourceIds, setMergeSourceIds] = useState<string[]>([]);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [renameTarget, setRenameTarget] = useState<Tag | null>(null);
  const [renameKey, setRenameKey] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleConditionType, setNewRuleConditionType] = useState('resource_type');
  const [newRuleConditionValue, setNewRuleConditionValue] = useState('');
  const [newRuleTagIds, setNewRuleTagIds] = useState<string[]>([]);

  // Melhoria 12: useEffect instead of setTimeout anti-pattern
  const [localPolicies, setLocalPolicies] = useState<TagPolicies | null>(null);
  const policies = localPolicies || policiesData || {
    enforce_naming: true, prevent_duplicates: true, require_category: false,
    alert_low_coverage: true, coverage_threshold: 80, alert_untagged_new: false,
    required_keys: ['environment', 'cost-center', 'team'],
  };
  useEffect(() => {
    if (policiesData && !localPolicies) {
      setLocalPolicies(policiesData);
    }
  }, [policiesData, localPolicies]);

  // Demo data
  const demoTagData = useMemo(() => isInDemoMode ? filterDemoTags({
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    search: search || undefined,
  }) : null, [isInDemoMode, categoryFilter, search]);
  const demoCoverage = useMemo(() => isInDemoMode ? generateDemoCoverage() : null, [isInDemoMode]);
  const demoCostReport = useMemo(() => isInDemoMode && selectedCostTag ? generateDemoCostReport(selectedCostTag) : null, [isInDemoMode, selectedCostTag]);
  const demoSecFindings = useMemo(() => isInDemoMode && selectedSecTags.length > 0 ? generateDemoSecurityFindings(selectedSecTags) : null, [isInDemoMode, selectedSecTags]);

  // Resolve
  const isLoading = isInDemoMode ? false : _isLoadingQuery;
  const tags = isInDemoMode ? (demoTagData?.tags || []) : (tagData?.tags || []);
  const total = isInDemoMode ? (demoTagData?.total || 0) : (tagData?.total || 0);
  const coverage = isInDemoMode ? demoCoverage : coverageReal;
  const costReport = isInDemoMode ? demoCostReport : costReportReal;
  const secFindings = isInDemoMode ? demoSecFindings : secFindingsReal;

  const shouldShowQuickstart = !isLoading && total === 0 && !quickstartDismissed && !isInDemoMode;

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || isInDemoMode) return;
    await deleteTag.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, deleteTag, isInDemoMode]);

  const handleEdit = useCallback((tag: Tag) => {
    setEditTarget(tag);
    setEditColor(tag.color);
    setEditCategory(tag.category || 'CUSTOM');
    setEditDescription(tag.description || '');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editTarget) return;
    await updateTag.mutateAsync({
      tagId: editTarget.id,
      color: editColor,
      category: editCategory,
      description: editDescription || undefined,
    });
    setEditTarget(null);
  }, [editTarget, editColor, editCategory, editDescription, updateTag]);

  const handleUnassignResource = useCallback(async (tagId: string, resourceId: string) => {
    await unassignTag.mutateAsync({ tagId, resourceIds: [resourceId] });
    toast.success('Atribuição removida');
  }, [unassignTag]);

  const handleSavePolicies = useCallback(async () => {
    if (!localPolicies) return;
    await savePolicies.mutateAsync(localPolicies);
  }, [localPolicies, savePolicies]);

  const updatePolicy = useCallback((key: keyof TagPolicies, value: any) => {
    setLocalPolicies(prev => prev ? { ...prev, [key]: value } : { ...policies, [key]: value });
  }, [policies]);

  const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#22C55E', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'];

  if (shouldShowQuickstart) {
    return (
      <Layout title={t('tags.management', 'Tag Management')} description={t('tags.managementDesc', 'Organize and classify your cloud resources with tags')} icon={<Tags className="h-4 w-4" />}>
        <QuickstartWizard onComplete={() => setQuickstartDismissed(true)} onSkip={() => setQuickstartDismissed(true)} />
      </Layout>
    );
  }

  return (
    <Layout title={t('tags.management', 'Tag Management')} description={t('tags.managementDesc', 'Organize and classify your cloud resources with tags')} icon={<Tags className="h-4 w-4" />}>
      <div className="space-y-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="glass">
            <TabsTrigger value="overview">{t('tags.overview', 'Overview')}</TabsTrigger>
            <TabsTrigger value="library">{t('tags.library', 'Tags Library')}</TabsTrigger>
            <TabsTrigger value="automation">{t('tags.automation', 'Auto-Rules')}</TabsTrigger>
            <TabsTrigger value="hierarchy">{t('tags.hierarchy', 'Hierarchy')}</TabsTrigger>
            <TabsTrigger value="costs">{t('tags.costReports', 'Cost Reports')}</TabsTrigger>
            <TabsTrigger value="security">{t('tags.security', 'Security')}</TabsTrigger>
            <TabsTrigger value="settings">{t('tags.settings', 'Settings')}</TabsTrigger>
          </TabsList>

          {/* Melhoria 11: Overview extracted to component */}
          <TabsContent value="overview" className="space-y-6">
            <OverviewTab tags={tags} total={total} coverage={coverage} recentActivity={recentActivity} isInDemoMode={isInDemoMode} onExpandTag={setExpandedTagId} onSwitchTab={setTab} isLoading={isLoading} isLoadingCoverage={isLoadingCoverage} isLoadingActivity={isLoadingActivity} />
          </TabsContent>

          {/* Tags Library Tab */}
          <TabsContent value="library" className="space-y-6">
            <div className="flex items-center gap-3">
              <Input placeholder={t('tags.searchTags', 'Search tags...')} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs h-8 text-sm" />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px] h-8 text-sm"><SelectValue placeholder={t('tags.allCategories', 'All Categories')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('tags.allCategories', 'All Categories')}</SelectItem>
                  {['COST_CENTER', 'ENVIRONMENT', 'TEAM', 'PROJECT', 'COMPLIANCE', 'CRITICALITY', 'CUSTOM'].map((c) => (
                    <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="ml-auto"><TagSelector assignedTags={[]} onAssign={() => {}} onUnassign={() => {}} /></div>
            </div>

            <Card className="glass border-primary/20">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-4 space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4 px-2">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-6 w-24 rounded-full" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <div className="ml-auto flex items-center gap-3">
                          <Skeleton className="h-4 w-8" />
                          <Skeleton className="h-7 w-7 rounded" />
                          <Skeleton className="h-7 w-7 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>{t('tags.tag', 'Tag')}</TableHead>
                        <TableHead>{t('tags.category', 'Category')}</TableHead>
                        <TableHead className="text-right">{t('tags.usageCount', 'Usage')}</TableHead>
                        <TableHead className="text-right">{t('tags.actions', 'Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tags.map((tag) => (
                        <Fragment key={tag.id}>
                          <TableRow className={expandedTagId === tag.id ? 'border-b-0' : ''}>
                            <TableCell className="w-8 pr-0">
                              {(tag.usage_count || 0) > 0 && (
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpandedTagId(expandedTagId === tag.id ? null : tag.id)}>
                                  {expandedTagId === tag.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </Button>
                              )}
                            </TableCell>
                            <TableCell><TagBadge tag={tag} /></TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{tag.category?.replace('_', ' ') || 'CUSTOM'}</Badge></TableCell>
                            <TableCell className="text-right">
                              <span className={`text-sm ${(tag.usage_count || 0) > 0 ? 'font-medium' : 'text-muted-foreground'}`}>{tag.usage_count || 0}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(tag)} disabled={isInDemoMode}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => !isInDemoMode && setDeleteTarget(tag)} disabled={isInDemoMode}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {expandedTagId === tag.id && (
                            <TableRow>
                              <TableCell colSpan={5} className="bg-muted/30 p-0">
                                <div className="px-6 py-3">
                                  <p className="text-xs font-medium text-muted-foreground mb-2">{t('tags.assignedResources', 'Assigned Resources')}</p>
                                  {isLoadingResources ? (
                                    <div className="flex items-center gap-2 py-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="text-xs text-muted-foreground">{t('common.loading', 'Loading...')}</span></div>
                                  ) : expandedTagResources?.data && expandedTagResources.data.length > 0 ? (
                                    <div className="space-y-1.5">
                                      {expandedTagResources.data.map((res: ResourceAssignment) => (
                                        <div key={res.id} className="flex items-center justify-between text-xs p-2 rounded bg-background/50">
                                          <div className="flex items-center gap-3">
                                            <Badge variant="outline" className="text-[10px] h-5">{res.cloud_provider || 'AWS'}</Badge>
                                            <span className="font-medium">{res.resource_name || res.resource_id}</span>
                                            {res.resource_name && res.resource_name !== res.resource_id && (
                                              <span className="text-muted-foreground truncate max-w-[200px]">{res.resource_id}</span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <Badge variant="secondary" className="text-[10px] h-5">{res.resource_type || 'unknown'}</Badge>
                                            <span className="text-muted-foreground">{new Date(res.assigned_at).toLocaleDateString()}</span>
                                            {!isInDemoMode && (
                                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive/60 hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleUnassignResource(tag.id, res.resource_id); }}>
                                                <X className="h-3 w-3" />
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                      {expandedTagResources.nextCursor && (
                                        <p className="text-xs text-muted-foreground text-center pt-1">{t('tags.moreResources', 'More resources available...')}</p>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground py-2">{t('tags.noResourcesAssigned', 'No resources assigned to this tag')}</p>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                      {tags.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">{t('tags.noTagsFound', 'No tags found')}</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Automation Tab — Melhoria 13: error state */}
          <TabsContent value="automation" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Regras automáticas aplicam tags a recursos com base em condições. Quando executadas, cada regra verifica os recursos e atribui as tags configuradas.</p>
              </div>
              <Button className="glass hover-glow" disabled={isInDemoMode || executeAutoRules.isPending} onClick={() => executeAutoRules.mutate()}>
                {executeAutoRules.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                Executar Regras
              </Button>
            </div>

            <Card className="glass border-primary/20">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Plus className="h-4 w-4" />Nova Regra</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm">Nome da regra</Label>
                    <Input value={newRuleName} onChange={(e) => setNewRuleName(e.target.value)} placeholder="Ex: Tag EC2 de produção" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Condição</Label>
                    <div className="flex gap-2">
                      <Select value={newRuleConditionType} onValueChange={setNewRuleConditionType}>
                        <SelectTrigger className="w-[160px] h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="resource_type">Tipo de recurso</SelectItem>
                          <SelectItem value="cloud_provider">Cloud provider</SelectItem>
                          <SelectItem value="resource_name_contains">Nome contém</SelectItem>
                          <SelectItem value="account_id">Account ID</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input value={newRuleConditionValue} onChange={(e) => setNewRuleConditionValue(e.target.value)} placeholder="Valor..." className="h-8 text-sm flex-1" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Tags a aplicar</Label>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => {
                      const isSelected = newRuleTagIds.includes(tag.id);
                      return (
                        <button key={tag.id} onClick={() => setNewRuleTagIds(prev => isSelected ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                          className={`transition-all rounded-md ${isSelected ? 'ring-2 ring-primary ring-offset-1' : 'opacity-50 hover:opacity-100'}`}>
                          <TagBadge tag={tag} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Button className="glass hover-glow" disabled={!newRuleName || !newRuleConditionValue || newRuleTagIds.length === 0 || createAutoRule.isPending}
                  onClick={async () => {
                    await createAutoRule.mutateAsync({
                      name: newRuleName,
                      conditions: [{ field: newRuleConditionType, operator: 'contains', value: newRuleConditionValue }] as any,
                      tagIds: newRuleTagIds,
                    });
                    setNewRuleName(''); setNewRuleConditionValue(''); setNewRuleTagIds([]);
                  }}>
                  {createAutoRule.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Criar Regra
                </Button>
              </CardContent>
            </Card>

            <Card className="glass border-primary/20">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" />Regras Ativas</CardTitle></CardHeader>
              <CardContent>
                {loadingRules ? (
                  <div className="space-y-3 p-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-5 w-40 rounded-full" />
                        <Skeleton className="h-4 w-10" />
                        <Skeleton className="h-5 w-14 rounded-full" />
                        <div className="ml-auto flex gap-1">
                          <Skeleton className="h-7 w-7 rounded" />
                          <Skeleton className="h-7 w-7 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : autoRules && autoRules.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Condições</TableHead>
                        <TableHead>Execuções</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {autoRules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="font-medium">{rule.name}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(Array.isArray(rule.conditions) ? rule.conditions : []).map((c: any, i: number) => (
                                <Badge key={i} variant="outline" className="text-xs">{c.field} {c.operator} {c.value}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{rule.total_applied || 0}</TableCell>
                          <TableCell>
                            <Badge variant={rule.is_active ? 'default' : 'secondary'} className="text-xs">
                              {rule.is_active ? 'Ativa' : 'Inativa'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                                onClick={() => updateAutoRuleMut.mutate({ ruleId: rule.id, isActive: !rule.is_active })}>
                                {rule.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                                onClick={() => deleteAutoRule.mutate(rule.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhuma regra de auto-tagging criada ainda.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Hierarchy Tab */}
          <TabsContent value="hierarchy" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="glass border-primary/20">
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Tags className="h-4 w-4" />Árvore de Tags</CardTitle></CardHeader>
                <CardContent>
                  {isLoadingTree ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i}>
                          <div className="flex items-center gap-2 p-2">
                            <Skeleton className="h-3 w-3 rounded-full" />
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </div>
                          {i % 2 === 0 && (
                            <div className="flex items-center gap-2 p-2 pl-8">
                              <Skeleton className="h-2.5 w-2.5 rounded-full" />
                              <Skeleton className="h-4 w-24" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : tagTree && tagTree.length > 0 ? (
                    <div className="space-y-1">
                      {tagTree.map((node) => (
                        <Fragment key={node.id}>
                          <div className="flex items-center gap-2 p-2 rounded hover:bg-muted/50">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: node.color }} />
                            <span className="text-sm font-medium">{node.key}:{node.value}</span>
                            {node.children && node.children.length > 0 && (
                              <Badge variant="secondary" className="text-xs">{node.children.length} filhos</Badge>
                            )}
                          </div>
                          {node.children && node.children.map((child) => (
                            <div key={child.id} className="flex items-center gap-2 p-2 pl-8 rounded hover:bg-muted/50">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: child.color }} />
                              <span className="text-sm">{child.key}:{child.value}</span>
                            </div>
                          ))}
                        </Fragment>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">Nenhuma hierarquia definida. Use a aba Tags Library para organizar tags em grupos pai/filho.</p>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="glass border-primary/20">
                  <CardHeader><CardTitle className="text-sm flex items-center gap-2"><GitMerge className="h-4 w-4" />Mesclar Tags</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-xs text-muted-foreground">Selecione tags de origem para mesclar em uma tag de destino. As atribuições serão movidas e as tags de origem removidas.</p>
                    <div className="space-y-2">
                      <Label className="text-sm">Tags de origem (serão removidas)</Label>
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => {
                          const isSelected = mergeSourceIds.includes(tag.id);
                          return (
                            <button key={tag.id} onClick={() => setMergeSourceIds(prev => isSelected ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                              className={`transition-all rounded-md ${isSelected ? 'ring-2 ring-destructive ring-offset-1' : 'opacity-50 hover:opacity-100'}`}
                              disabled={tag.id === mergeTargetId}>
                              <TagBadge tag={tag} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Tag de destino (receberá atribuições)</Label>
                      <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecionar tag destino..." /></SelectTrigger>
                        <SelectContent>
                          {tags.filter(t => !mergeSourceIds.includes(t.id)).map((tag) => (
                            <SelectItem key={tag.id} value={tag.id}>{tag.key}: {tag.value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button variant="destructive" size="sm" disabled={mergeSourceIds.length === 0 || !mergeTargetId || mergeTags.isPending}
                      onClick={async () => {
                        await mergeTags.mutateAsync({ sourceTagIds: mergeSourceIds, targetTagId: mergeTargetId });
                        setMergeSourceIds([]); setMergeTargetId('');
                      }}>
                      {mergeTags.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                      Mesclar {mergeSourceIds.length} tag{mergeSourceIds.length !== 1 ? 's' : ''}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="glass border-primary/20">
                  <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Pencil className="h-4 w-4" />Renomear Tag</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Tag a renomear</Label>
                      <Select value={renameTarget?.id || ''} onValueChange={(v) => {
                        const tag = tags.find(t => t.id === v);
                        if (tag) { setRenameTarget(tag); setRenameKey(tag.key); setRenameValue(tag.value); }
                      }}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecionar tag..." /></SelectTrigger>
                        <SelectContent>
                          {tags.map((tag) => (<SelectItem key={tag.id} value={tag.id}>{tag.key}: {tag.value}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    {renameTarget && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Nova chave</Label>
                          <Input value={renameKey} onChange={(e) => setRenameKey(e.target.value)} className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Novo valor</Label>
                          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="h-8 text-sm" />
                        </div>
                      </div>
                    )}
                    <Button className="glass hover-glow" size="sm" disabled={!renameTarget || !renameKey || !renameValue || renameTagMut.isPending}
                      onClick={async () => {
                        if (!renameTarget) return;
                        await renameTagMut.mutateAsync({ tagId: renameTarget.id, newKey: renameKey, newValue: renameValue });
                        setRenameTarget(null); setRenameKey(''); setRenameValue('');
                      }}>
                      {renameTagMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                      Renomear
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Cost Reports Tab */}
          <TabsContent value="costs" className="space-y-6">
            <Card className="glass border-primary/20">
              <CardHeader><CardTitle className="text-sm">{t('tags.selectTagForCost', 'Select a tag to view cost breakdown')}</CardTitle></CardHeader>
              <CardContent>
                <Select value={selectedCostTag || ''} onValueChange={(v) => { setSelectedCostTag(v); setDrilldownTagId(v); }}>
                  <SelectTrigger className="w-[300px] h-8 text-sm"><SelectValue placeholder={t('tags.selectTag', 'Select tag...')} /></SelectTrigger>
                  <SelectContent>
                    {tags.map((tag) => (<SelectItem key={tag.id} value={tag.id}>{tag.key}: {tag.value}</SelectItem>))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
            {selectedCostTag && isLoadingCost ? (
              <Card className="glass border-primary/20">
                <CardHeader><CardTitle className="text-sm">{t('tags.costBreakdown', 'Cost Breakdown')}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-3 w-48" />
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : costReport && (
              <Card className="glass border-primary/20">
                <CardHeader><CardTitle className="text-sm">{t('tags.costBreakdown', 'Cost Breakdown')}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-2xl font-bold">${costReport.totalCost?.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{costReport.disclaimer}</p>
                  <div className="space-y-2">
                    {Object.entries(costReport.costByService || {}).map(([svc, cost]) => (
                      <div key={svc} className="flex items-center justify-between text-sm">
                        <span>{svc}</span><span className="font-medium">${(cost as number).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {drilldownData && (
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="glass border-primary/20">
                  <CardHeader><CardTitle className="text-sm">Custo por Serviço (Drill-Down)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(drilldownData.byService || drilldownData.items || []).slice(0, 10).map((item: any) => (
                        <div key={item.service} className="flex items-center justify-between text-sm">
                          <span className="truncate">{item.service}</span>
                          <span className="font-medium tabular-nums">${Number(item.cost).toFixed(2)}</span>
                        </div>
                      ))}
                      {(!drilldownData.byService && !drilldownData.items) && (
                        <p className="text-sm text-muted-foreground text-center py-4">Sem dados de custo por serviço</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Card className="glass border-primary/20">
                  <CardHeader><CardTitle className="text-sm">Top Recursos por Custo</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(drilldownData.byResource || []).slice(0, 10).map((item: any) => (
                        <div key={item.resourceId} className="flex items-center justify-between text-sm">
                          <span className="truncate max-w-[200px]">{item.resourceName || item.resourceId}</span>
                          <span className="font-medium tabular-nums">${Number(item.cost).toFixed(2)}</span>
                        </div>
                      ))}
                      {(!drilldownData.byResource || drilldownData.byResource.length === 0) && (
                        <p className="text-sm text-muted-foreground text-center py-4">Sem dados de custo por recurso</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card className="glass border-primary/20">
              <CardHeader><CardTitle className="text-sm">{t('tags.securityByTags', 'Security Findings by Tags')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t('tags.securityDesc', 'Select tags to filter security findings across your resources.')}</p>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => {
                    const isSelected = selectedSecTags.includes(tag.id);
                    return (
                      <button key={tag.id} onClick={() => setSelectedSecTags(prev => isSelected ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                        className={`transition-all rounded-md ${isSelected ? 'ring-2 ring-primary ring-offset-1' : 'opacity-60 hover:opacity-100'}`}>
                        <TagBadge tag={tag} />
                      </button>
                    );
                  })}
                </div>
                {selectedSecTags.length > 0 && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedSecTags([])}>Limpar seleção</Button>
                )}
                {isLoadingSec && selectedSecTags.length > 0 ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : secFindings?.findings?.length > 0 ? (
                  <div className="space-y-2">
                    {secFindings.findings.slice(0, 20).map((f: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                        <span className="truncate flex-1">{f.title || f.resource_id}</span>
                        <Badge variant={f.severity === 'CRITICAL' ? 'destructive' : 'outline'} className="text-xs ml-2">{f.severity}</Badge>
                      </div>
                    ))}
                  </div>
                ) : selectedSecTags.length > 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">{t('tags.noFindingsForTags', 'No findings found for selected tags')}</p>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">{t('tags.selectTagsToFilter', 'Click tags above to filter findings')}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            {isLoadingPolicies ? (
              <div className="space-y-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="glass border-primary/20">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {Array.from({ length: 3 }).map((_, j) => (
                        <div key={j} className="flex items-center justify-between">
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-3 w-56" />
                          </div>
                          <Skeleton className="h-5 w-9 rounded-full" />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
            <>
            <Card className="glass border-primary/20">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" />{t('tags.namingPolicies', 'Naming Policies')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">{t('tags.enforceNamingConvention', 'Enforce naming convention')}</Label>
                    <p className="text-xs text-muted-foreground">{t('tags.enforceNamingDesc', 'Tag keys must follow lowercase-with-hyphens format')}</p>
                  </div>
                  <Switch checked={policies.enforce_naming} onCheckedChange={(v) => updatePolicy('enforce_naming', v)} disabled={isInDemoMode} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">{t('tags.preventDuplicates', 'Prevent duplicate tags')}</Label>
                    <p className="text-xs text-muted-foreground">{t('tags.preventDuplicatesDesc', 'Block creation of tags with same key:value pair')}</p>
                  </div>
                  <Switch checked={policies.prevent_duplicates} onCheckedChange={(v) => updatePolicy('prevent_duplicates', v)} disabled={isInDemoMode} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">{t('tags.requireCategory', 'Require category')}</Label>
                    <p className="text-xs text-muted-foreground">{t('tags.requireCategoryDesc', 'All tags must have a category assigned')}</p>
                  </div>
                  <Switch checked={policies.require_category} onCheckedChange={(v) => updatePolicy('require_category', v)} disabled={isInDemoMode} />
                </div>
              </CardContent>
            </Card>

            <Card className="glass border-primary/20">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{t('tags.coverageAlerts', 'Coverage Alerts')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">{t('tags.alertLowCoverage', 'Alert on low coverage')}</Label>
                    <p className="text-xs text-muted-foreground">{t('tags.alertLowCoverageDesc', 'Show warning when tag coverage drops below threshold')}</p>
                  </div>
                  <Switch checked={policies.alert_low_coverage} onCheckedChange={(v) => updatePolicy('alert_low_coverage', v)} disabled={isInDemoMode} />
                </div>
                {policies.alert_low_coverage && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-4">
                      <Label className="text-sm whitespace-nowrap">{t('tags.coverageThreshold', 'Minimum coverage')}</Label>
                      <Select value={String(policies.coverage_threshold)} onValueChange={(v) => updatePolicy('coverage_threshold', parseInt(v))} disabled={isInDemoMode}>
                        <SelectTrigger className="w-[120px] h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{[50, 60, 70, 80, 90, 95].map(v => (<SelectItem key={v} value={String(v)}>{v}%</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">{t('tags.alertUntaggedNew', 'Alert on new untagged resources')}</Label>
                    <p className="text-xs text-muted-foreground">{t('tags.alertUntaggedNewDesc', 'Notify when newly discovered resources have no tags')}</p>
                  </div>
                  <Switch checked={policies.alert_untagged_new} onCheckedChange={(v) => updatePolicy('alert_untagged_new', v)} disabled={isInDemoMode} />
                </div>
              </CardContent>
            </Card>

            <Card className="glass border-primary/20">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Tags className="h-4 w-4" />{t('tags.defaultCategories', 'Required Tag Keys')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">{t('tags.requiredKeysDesc', 'Define tag keys that should be present on all resources.')}</p>
                <div className="flex flex-wrap gap-2">
                  {(policies.required_keys || []).map((key) => (
                    <Badge key={key} variant="outline" className="text-xs gap-1">
                      {key}
                      {!isInDemoMode && (
                        <button onClick={() => updatePolicy('required_keys', policies.required_keys.filter(k => k !== key))} className="ml-1 hover:text-destructive">×</button>
                      )}
                    </Badge>
                  ))}
                </div>
                {!isInDemoMode && (
                  <div className="flex gap-2">
                    <Input placeholder={t('tags.addRequiredKey', 'Add required key...')} className="h-8 text-sm max-w-xs" id="new-required-key"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const input = e.currentTarget;
                          const key = input.value.trim().toLowerCase();
                          if (key && !policies.required_keys.includes(key)) {
                            updatePolicy('required_keys', [...policies.required_keys, key]);
                          }
                          input.value = '';
                        }
                      }} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass border-primary/20">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Wrench className="h-4 w-4" />{t('tags.dataManagement', 'Data Management')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">{t('tags.enrichLegacy', 'Enrich legacy assignments')}</Label>
                    <p className="text-xs text-muted-foreground">{t('tags.enrichLegacyDesc', 'Update old assignments that have missing resource metadata')}</p>
                  </div>
                  <Button variant="outline" size="sm" className="glass hover-glow" disabled={isInDemoMode || enrichLegacy.isPending} onClick={() => enrichLegacy.mutate()}>
                    {enrichLegacy.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    {t('tags.enrichNow', 'Enrich Now')}
                  </Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">{t('tags.exportData', 'Export Tags & Assignments')}</Label>
                    <p className="text-xs text-muted-foreground">{t('tags.exportDataDesc', 'Download complete tag data including resource assignments')}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="glass hover-glow" disabled={isInDemoMode} onClick={() => {
                      const data = JSON.stringify({ tags, coverage, policies, recentActivity: recentActivity || [] }, null, 2);
                      const blob = new Blob([data], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url; a.download = `tags-full-export-${new Date().toISOString().slice(0, 10)}.json`;
                      a.click(); URL.revokeObjectURL(url);
                      toast.success(t('tags.exportSuccess', 'Tags exported successfully'));
                    }}>
                      <FileText className="h-3.5 w-3.5 mr-1" />JSON
                    </Button>
                    <Button variant="outline" size="sm" className="glass hover-glow" disabled={isInDemoMode} onClick={() => {
                      const rows = [['Key', 'Value', 'Color', 'Category', 'Usage Count', 'Created At']];
                      tags.forEach(tag => rows.push([tag.key, tag.value, tag.color, tag.category || 'CUSTOM', String(tag.usage_count || 0), tag.created_at]));
                      const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url; a.download = `tags-export-${new Date().toISOString().slice(0, 10)}.csv`;
                      a.click(); URL.revokeObjectURL(url);
                      toast.success(t('tags.exportSuccess', 'Tags exported successfully'));
                    }}>
                      <Download className="h-3.5 w-3.5 mr-1" />CSV
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button className="glass hover-glow" disabled={isInDemoMode || savePolicies.isPending} onClick={handleSavePolicies}>
                {savePolicies.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t('common.save', 'Save Settings')}
              </Button>
            </div>
            </>
            )}
          </TabsContent>
        </Tabs>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('tags.deleteTag', 'Delete Tag')}</DialogTitle>
              <DialogDescription>
                {t('tags.deleteConfirm', 'Are you sure you want to delete this tag? This will remove it from all {{count}} assigned resources.', { count: deleteTarget?.usage_count || 0 })}
              </DialogDescription>
            </DialogHeader>
            {deleteTarget && <div className="py-2"><TagBadge tag={deleteTarget} size="md" /></div>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel', 'Cancel')}</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleteTag.isPending}>
                {deleteTag.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t('tags.confirmDelete', 'Delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Tag Dialog */}
        <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('tags.editTag', 'Edit Tag')}</DialogTitle>
              <DialogDescription>{editTarget ? `${editTarget.key}: ${editTarget.value}` : ''}</DialogDescription>
            </DialogHeader>
            {editTarget && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label className="text-sm">{t('tags.color', 'Color')}</Label>
                  <div className="flex gap-2">
                    {COLORS.map((c) => (
                      <button key={c} className={`w-7 h-7 rounded-full transition-all ${editColor === c ? 'ring-2 ring-primary ring-offset-2' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c }} onClick={() => setEditColor(c)} />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">{t('tags.category', 'Category')}</Label>
                  <Select value={editCategory} onValueChange={setEditCategory}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['COST_CENTER', 'ENVIRONMENT', 'TEAM', 'PROJECT', 'COMPLIANCE', 'CRITICALITY', 'CUSTOM'].map((c) => (
                        <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">{t('tags.description', 'Description')}</Label>
                  <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder={t('tags.descriptionPlaceholder', 'Optional description...')} className="h-8 text-sm" />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTarget(null)}>{t('common.cancel', 'Cancel')}</Button>
              <Button className="glass hover-glow" onClick={handleSaveEdit} disabled={updateTag.isPending}>
                {updateTag.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t('common.save', 'Save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
