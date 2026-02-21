import { useState, useCallback, useMemo, Fragment } from 'react';
import { Layout } from '@/components/Layout';
import { Tags, Trash2, Pencil, Loader2, Shield, AlertTriangle, Download, ChevronDown, ChevronRight, ExternalLink, X, Clock, Wrench, FileText } from 'lucide-react';
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
import {
  useTagList, useTagCoverage, useDeleteTag, useUpdateTag, useTagCostReport,
  useTagSecurityFindings, useResourcesByTag, useUnassignTag,
  useTagPolicies, useSaveTagPolicies, useRecentActivity, useEnrichLegacy,
  type Tag, type ResourceAssignment, type TagPolicies,
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
  const { data: coverageReal } = useTagCoverage({ enabled: !isInDemoMode });
  const deleteTag = useDeleteTag();
  const updateTag = useUpdateTag();
  const unassignTag = useUnassignTag();
  const enrichLegacy = useEnrichLegacy();
  const { data: costReportReal } = useTagCostReport(isInDemoMode ? null : selectedCostTag);
  const { data: secFindingsReal } = useTagSecurityFindings(isInDemoMode ? [] : selectedSecTags);
  const { data: expandedTagResources, isLoading: isLoadingResources } = useResourcesByTag(
    isInDemoMode ? null : expandedTagId
  );
  const { data: policiesData } = useTagPolicies({ enabled: !isInDemoMode });
  const savePolicies = useSaveTagPolicies();
  const { data: recentActivity } = useRecentActivity({ limit: 8, enabled: !isInDemoMode });

  // Local policies state — initialized from backend
  const [localPolicies, setLocalPolicies] = useState<TagPolicies | null>(null);
  const policies = localPolicies || policiesData || {
    enforce_naming: true, prevent_duplicates: true, require_category: false,
    alert_low_coverage: true, coverage_threshold: 80, alert_untagged_new: false,
    required_keys: ['environment', 'cost-center', 'team'],
  };
  // Sync from backend when loaded
  if (policiesData && !localPolicies) {
    // Will trigger on next render
    setTimeout(() => setLocalPolicies(policiesData), 0);
  }

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

  // Melhoria 1: Edit tag handler
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

  // Melhoria 2: Unassign single resource
  const handleUnassignResource = useCallback(async (tagId: string, resourceId: string) => {
    await unassignTag.mutateAsync({ tagId, resourceIds: [resourceId] });
    toast.success('Atribuição removida');
  }, [unassignTag]);

  // Melhoria 9: Save policies to backend
  const handleSavePolicies = useCallback(async () => {
    if (!localPolicies) return;
    await savePolicies.mutateAsync(localPolicies);
  }, [localPolicies, savePolicies]);

  const updatePolicy = useCallback((key: keyof TagPolicies, value: any) => {
    setLocalPolicies(prev => prev ? { ...prev, [key]: value } : { ...policies, [key]: value });
  }, [policies]);

  const coverageColor = (coverage?.coveragePercentage ?? 0) >= 80 ? 'text-green-500' :
    (coverage?.coveragePercentage ?? 0) >= 50 ? 'text-yellow-500' : 'text-red-500';

  const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#22C55E', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'];

  if (shouldShowQuickstart) {
    return (
      <Layout title={t('tags.management', 'Tag Management')} description={t('tags.managementDesc', 'Organize and classify your cloud resources with tags')} icon={<Tags className="h-4 w-4 text-white" />}>
        <QuickstartWizard onComplete={() => setQuickstartDismissed(true)} onSkip={() => setQuickstartDismissed(true)} />
      </Layout>
    );
  }

  return (
    <Layout title={t('tags.management', 'Tag Management')} description={t('tags.managementDesc', 'Organize and classify your cloud resources with tags')} icon={<Tags className="h-4 w-4 text-white" />}>
      <div className="space-y-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="glass">
            <TabsTrigger value="overview">{t('tags.overview', 'Overview')}</TabsTrigger>
            <TabsTrigger value="library">{t('tags.library', 'Tags Library')}</TabsTrigger>
            <TabsTrigger value="costs">{t('tags.costReports', 'Cost Reports')}</TabsTrigger>
            <TabsTrigger value="security">{t('tags.security', 'Security')}</TabsTrigger>
            <TabsTrigger value="settings">{t('tags.settings', 'Settings')}</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card className="glass border-primary/20">
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t('tags.totalTags', 'Total Tags')}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{total}</p></CardContent>
              </Card>
              <Card className="glass border-primary/20">
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t('tags.totalAssignments', 'Total Assignments')}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{coverage?.taggedResources || 0}</p></CardContent>
              </Card>
              <Card className="glass border-primary/20">
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t('tags.untaggedResources', 'Untagged Resources')}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{coverage?.untaggedResources || 0}</p></CardContent>
              </Card>
              <Card className="glass border-primary/20">
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t('tags.coverage', 'Coverage')}</CardTitle></CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold ${coverageColor}`}>{coverage?.coveragePercentage?.toFixed(1) || 0}%</p>
                  <Progress value={coverage?.coveragePercentage || 0} className="h-2 mt-2" />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Top Tags by Usage */}
              <Card className="glass border-primary/20">
                <CardHeader><CardTitle className="text-sm">{t('tags.topTagsByUsage', 'Top Tags by Usage')}</CardTitle></CardHeader>
                <CardContent>
                  {tags.length > 0 ? (
                    <div className="space-y-3">
                      {[...tags].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0)).slice(0, 5).map((tag) => (
                        <div key={tag.id} className="flex items-center justify-between">
                          <TagBadge tag={tag} />
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">{tag.usage_count || 0} {t('tags.resources', 'resources')}</span>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setExpandedTagId(tag.id); setTab('library'); }}>
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {tags.every(t => !t.usage_count) && (
                        <p className="text-sm text-muted-foreground text-center py-4">{t('tags.noAssignmentsYet', 'No assignments yet. Use Bulk Tagging to assign tags to resources.')}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">{t('tags.noTagsCreated', 'No tags created yet')}</p>
                  )}
                </CardContent>
              </Card>

              {/* Melhoria 5: Recent Activity */}
              <Card className="glass border-primary/20">
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" />{t('tags.recentActivity', 'Recent Activity')}</CardTitle></CardHeader>
                <CardContent>
                  {recentActivity && recentActivity.length > 0 ? (
                    <div className="space-y-2">
                      {recentActivity.slice(0, 6).map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.tag_color }} />
                            <span className="font-medium truncate">{item.tag_key}:{item.tag_value}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="truncate text-muted-foreground">{item.resource_name || item.resource_type}</span>
                          </div>
                          <span className="text-muted-foreground shrink-0 ml-2">{new Date(item.assigned_at).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">{t('tags.noRecentActivity', 'No recent activity')}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Coverage by Provider + Tags by Category */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="glass border-primary/20">
                <CardHeader><CardTitle className="text-sm">{t('tags.coverageByProvider', 'Resources by Provider')}</CardTitle></CardHeader>
                <CardContent>
                  {coverage?.breakdownByProvider && Object.keys(coverage.breakdownByProvider).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(coverage.breakdownByProvider).map(([provider, count]) => (
                        <div key={provider} className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">{provider}</Badge>
                          <span className="text-sm font-medium">{count} {t('tags.resources', 'resources')}</span>
                        </div>
                      ))}
                      {coverage.resourceSource && (
                        <p className="text-xs text-muted-foreground mt-2">{t('tags.dataSource', 'Source')}: {coverage.resourceSource === 'daily_costs' ? t('tags.costData', 'Cost data') : t('tags.inventory', 'Resource inventory')}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">{t('tags.noProviderData', 'No provider data available')}</p>
                  )}
                </CardContent>
              </Card>

              {tags.length > 0 && (
                <Card className="glass border-primary/20">
                  <CardHeader><CardTitle className="text-sm">{t('tags.tagsByCategory', 'Tags by Category')}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(tags.reduce((acc, tag) => { const cat = tag.category || 'CUSTOM'; acc[cat] = (acc[cat] || 0) + 1; return acc; }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                        <div key={cat} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50">
                          <span className="text-xs font-medium">{cat.replace('_', ' ')}</span>
                          <Badge variant="secondary" className="text-xs h-5">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <Card className="glass border-primary/20">
              <CardHeader><CardTitle className="text-sm">{t('tags.quickActions', 'Quick Actions')}</CardTitle></CardHeader>
              <CardContent className="flex gap-3">
                <BulkTaggingDrawer preFilter={{ tagStatus: 'untagged' }} />
                <Button variant="outline" size="sm" className="glass hover-glow" onClick={() => setTab('library')}>
                  <Tags className="h-3.5 w-3.5 mr-1" />{t('tags.manageTags', 'Manage Tags')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tags Library Tab — Melhoria 1 (edit) + Melhoria 2 (unassign) */}
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
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
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
                                            {/* Melhoria 2: Unassign button */}
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

          {/* Cost Reports Tab */}
          <TabsContent value="costs" className="space-y-6">
            <Card className="glass border-primary/20">
              <CardHeader><CardTitle className="text-sm">{t('tags.selectTagForCost', 'Select a tag to view cost breakdown')}</CardTitle></CardHeader>
              <CardContent>
                <Select value={selectedCostTag || ''} onValueChange={setSelectedCostTag}>
                  <SelectTrigger className="w-[300px] h-8 text-sm"><SelectValue placeholder={t('tags.selectTag', 'Select tag...')} /></SelectTrigger>
                  <SelectContent>
                    {tags.map((tag) => (<SelectItem key={tag.id} value={tag.id}>{tag.key}: {tag.value}</SelectItem>))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
            {costReport && (
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
          </TabsContent>

          {/* Security Tab — Melhoria 4: Tag multi-select */}
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
                {secFindings?.findings?.length > 0 ? (
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

          {/* Settings Tab — Melhoria 9: Backend-persisted policies + Melhoria 6 & 10 */}
          <TabsContent value="settings" className="space-y-6">
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

            {/* Melhoria 6 & 10: Data Management */}
            <Card className="glass border-primary/20">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Wrench className="h-4 w-4" />{t('tags.dataManagement', 'Data Management')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {/* Melhoria 6: Enrich legacy */}
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
                {/* Melhoria 10: Export with assignments */}
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

            {/* Save Policies Button */}
            <div className="flex justify-end">
              <Button className="glass hover-glow" disabled={isInDemoMode || savePolicies.isPending} onClick={handleSavePolicies}>
                {savePolicies.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t('common.save', 'Save Settings')}
              </Button>
            </div>
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

        {/* Melhoria 1: Edit Tag Dialog */}
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
