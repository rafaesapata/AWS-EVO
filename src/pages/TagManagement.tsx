import { useState, useCallback, useMemo } from 'react';
import { Layout } from '@/components/Layout';
import { Tags, Trash2, Pencil, Loader2, Shield, AlertTriangle, Bell, Download } from 'lucide-react';
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
  useTagList, useTagCoverage, useDeleteTag, useTagCostReport,
  useTagSecurityFindings, type Tag,
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
  const [quickstartDismissed, setQuickstartDismissed] = useState(false);
  const [selectedCostTag, setSelectedCostTag] = useState<string | null>(null);
  const [selectedSecTags, setSelectedSecTags] = useState<string[]>([]);
  const [newRequiredKey, setNewRequiredKey] = useState('');
  const [tagSettings, setTagSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('tag-settings-org');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      enforceNaming: true,
      preventDuplicates: true,
      requireCategory: false,
      alertLowCoverage: true,
      coverageThreshold: 80,
      alertUntaggedNew: false,
      requiredKeys: ['environment', 'cost-center', 'team'],
    };
  });
  const { isInDemoMode } = useDemoAwareQuery();

  // Real queries — disabled in demo mode, explicitly enabled otherwise
  const { data: tagData, isLoading: _isLoadingQuery } = useTagList({
    search: search || undefined,
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    limit: 100,
    enabled: !isInDemoMode,
  });
  const { data: coverageReal } = useTagCoverage({ enabled: !isInDemoMode });
  const deleteTag = useDeleteTag();
  const { data: costReportReal } = useTagCostReport(isInDemoMode ? null : selectedCostTag);
  const { data: secFindingsReal } = useTagSecurityFindings(isInDemoMode ? [] : selectedSecTags);

  // Demo data — memoized, only generated when isInDemoMode is true
  const demoTagData = useMemo(() => isInDemoMode ? filterDemoTags({
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    search: search || undefined,
  }) : null, [isInDemoMode, categoryFilter, search]);
  const demoCoverage = useMemo(() => isInDemoMode ? generateDemoCoverage() : null, [isInDemoMode]);
  const demoCostReport = useMemo(() => isInDemoMode && selectedCostTag ? generateDemoCostReport(selectedCostTag) : null, [isInDemoMode, selectedCostTag]);
  const demoSecFindings = useMemo(() => isInDemoMode && selectedSecTags.length > 0 ? generateDemoSecurityFindings(selectedSecTags) : null, [isInDemoMode, selectedSecTags]);

  // Resolve: demo data takes precedence when in demo mode
  const isLoading = isInDemoMode ? false : _isLoadingQuery;
  const tags = isInDemoMode ? (demoTagData?.tags || []) : (tagData?.tags || []);
  const total = isInDemoMode ? (demoTagData?.total || 0) : (tagData?.total || 0);
  const coverage = isInDemoMode ? demoCoverage : coverageReal;
  const costReport = isInDemoMode ? demoCostReport : costReportReal;
  const secFindings = isInDemoMode ? demoSecFindings : secFindingsReal;

  // Show quickstart if no tags and user hasn't dismissed it (never in demo mode)
  const shouldShowQuickstart = !isLoading && total === 0 && !quickstartDismissed && !isInDemoMode;

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || isInDemoMode) return;
    await deleteTag.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, deleteTag, isInDemoMode]);

  const coverageColor = (coverage?.coveragePercentage ?? 0) >= 80 ? 'text-green-500' :
    (coverage?.coveragePercentage ?? 0) >= 50 ? 'text-yellow-500' : 'text-red-500';

  if (shouldShowQuickstart) {
    return (
      <Layout
        title={t('tags.management', 'Tag Management')}
        description={t('tags.managementDesc', 'Organize and classify your cloud resources with tags')}
        icon={<Tags className="h-4 w-4 text-white" />}
      >
        <QuickstartWizard onComplete={() => setQuickstartDismissed(true)} onSkip={() => setQuickstartDismissed(true)} />
      </Layout>
    );
  }

  return (
    <Layout
      title={t('tags.management', 'Tag Management')}
      description={t('tags.managementDesc', 'Organize and classify your cloud resources with tags')}
      icon={<Tags className="h-4 w-4 text-white" />}
    >
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

            <Card className="glass border-primary/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{t('tags.quickActions', 'Quick Actions')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex gap-3">
                <BulkTaggingDrawer preFilter={{ tagStatus: 'untagged' }} />
                <Button variant="outline" size="sm" className="glass hover-glow" onClick={() => setTab('library')}>
                  <Tags className="h-3.5 w-3.5 mr-1" />
                  {t('tags.manageTags', 'Manage Tags')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tags Library Tab */}
          <TabsContent value="library" className="space-y-6">
            <div className="flex items-center gap-3">
              <Input
                placeholder={t('tags.searchTags', 'Search tags...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs h-8 text-sm"
              />
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px] h-8 text-sm">
                  <SelectValue placeholder={t('tags.allCategories', 'All Categories')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('tags.allCategories', 'All Categories')}</SelectItem>
                  {['COST_CENTER', 'ENVIRONMENT', 'TEAM', 'PROJECT', 'COMPLIANCE', 'CRITICALITY', 'CUSTOM'].map((c) => (
                    <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="ml-auto">
                <TagSelector assignedTags={[]} onAssign={() => {}} onUnassign={() => {}} />
              </div>
            </div>

            <Card className="glass border-primary/20">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('tags.tag', 'Tag')}</TableHead>
                        <TableHead>{t('tags.category', 'Category')}</TableHead>
                        <TableHead className="text-right">{t('tags.usageCount', 'Usage')}</TableHead>
                        <TableHead className="text-right">{t('tags.actions', 'Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tags.map((tag) => (
                        <TableRow key={tag.id}>
                          <TableCell><TagBadge tag={tag} /></TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{tag.category?.replace('_', ' ') || 'CUSTOM'}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm">{tag.usage_count || 0}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => !isInDemoMode && setDeleteTarget(tag)} disabled={isInDemoMode}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {tags.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                            {t('tags.noTagsFound', 'No tags found')}
                          </TableCell>
                        </TableRow>
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
              <CardHeader>
                <CardTitle className="text-sm">{t('tags.selectTagForCost', 'Select a tag to view cost breakdown')}</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={selectedCostTag || ''} onValueChange={setSelectedCostTag}>
                  <SelectTrigger className="w-[300px] h-8 text-sm">
                    <SelectValue placeholder={t('tags.selectTag', 'Select tag...')} />
                  </SelectTrigger>
                  <SelectContent>
                    {tags.map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>{tag.key}: {tag.value}</SelectItem>
                    ))}
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
                        <span>{svc}</span>
                        <span className="font-medium">${(cost as number).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle className="text-sm">{t('tags.securityByTags', 'Security Findings by Tags')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {t('tags.securityDesc', 'Select tags to filter security findings across your resources.')}
                </p>
                {secFindings?.findings?.length > 0 ? (
                  <div className="space-y-2">
                    {secFindings.findings.slice(0, 20).map((f: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                        <span className="truncate flex-1">{f.title || f.resource_id}</span>
                        <Badge variant={f.severity === 'CRITICAL' ? 'destructive' : 'outline'} className="text-xs ml-2">
                          {f.severity}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">{t('tags.noFindings', 'Select tags to view findings')}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            {/* Naming Policies */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  {t('tags.namingPolicies', 'Naming Policies')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">{t('tags.enforceNamingConvention', 'Enforce naming convention')}</Label>
                    <p className="text-xs text-muted-foreground">{t('tags.enforceNamingDesc', 'Tag keys must follow lowercase-with-hyphens format (e.g. cost-center)')}</p>
                  </div>
                  <Switch checked={tagSettings.enforceNaming} onCheckedChange={(v) => setTagSettings(s => ({ ...s, enforceNaming: v }))} disabled={isInDemoMode} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">{t('tags.preventDuplicates', 'Prevent duplicate tags')}</Label>
                    <p className="text-xs text-muted-foreground">{t('tags.preventDuplicatesDesc', 'Block creation of tags with same key:value pair (case-insensitive)')}</p>
                  </div>
                  <Switch checked={tagSettings.preventDuplicates} onCheckedChange={(v) => setTagSettings(s => ({ ...s, preventDuplicates: v }))} disabled={isInDemoMode} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">{t('tags.requireCategory', 'Require category')}</Label>
                    <p className="text-xs text-muted-foreground">{t('tags.requireCategoryDesc', 'All tags must have a category assigned (not CUSTOM)')}</p>
                  </div>
                  <Switch checked={tagSettings.requireCategory} onCheckedChange={(v) => setTagSettings(s => ({ ...s, requireCategory: v }))} disabled={isInDemoMode} />
                </div>
              </CardContent>
            </Card>

            {/* Coverage Alerts */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {t('tags.coverageAlerts', 'Coverage Alerts')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">{t('tags.alertLowCoverage', 'Alert on low coverage')}</Label>
                    <p className="text-xs text-muted-foreground">{t('tags.alertLowCoverageDesc', 'Show warning when tag coverage drops below threshold')}</p>
                  </div>
                  <Switch checked={tagSettings.alertLowCoverage} onCheckedChange={(v) => setTagSettings(s => ({ ...s, alertLowCoverage: v }))} disabled={isInDemoMode} />
                </div>
                {tagSettings.alertLowCoverage && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-4">
                      <Label className="text-sm whitespace-nowrap">{t('tags.coverageThreshold', 'Minimum coverage')}</Label>
                      <Select value={String(tagSettings.coverageThreshold)} onValueChange={(v) => setTagSettings(s => ({ ...s, coverageThreshold: parseInt(v) }))} disabled={isInDemoMode}>
                        <SelectTrigger className="w-[120px] h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[50, 60, 70, 80, 90, 95].map(v => (
                            <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                          ))}
                        </SelectContent>
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
                  <Switch checked={tagSettings.alertUntaggedNew} onCheckedChange={(v) => setTagSettings(s => ({ ...s, alertUntaggedNew: v }))} disabled={isInDemoMode} />
                </div>
              </CardContent>
            </Card>

            {/* Default Categories */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Tags className="h-4 w-4" />
                  {t('tags.defaultCategories', 'Required Tag Keys')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">{t('tags.requiredKeysDesc', 'Define tag keys that should be present on all resources. Resources missing these keys will be flagged.')}</p>
                <div className="flex flex-wrap gap-2">
                  {tagSettings.requiredKeys.map((key) => (
                    <Badge key={key} variant="outline" className="text-xs gap-1">
                      {key}
                      {!isInDemoMode && (
                        <button onClick={() => setTagSettings(s => ({ ...s, requiredKeys: s.requiredKeys.filter(k => k !== key) }))} className="ml-1 hover:text-destructive">×</button>
                      )}
                    </Badge>
                  ))}
                </div>
                {!isInDemoMode && (
                  <div className="flex gap-2">
                    <Input
                      placeholder={t('tags.addRequiredKey', 'Add required key (e.g. environment)...')}
                      className="h-8 text-sm max-w-xs"
                      value={newRequiredKey}
                      onChange={(e) => setNewRequiredKey(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newRequiredKey.trim()) {
                          const key = newRequiredKey.trim().toLowerCase();
                          if (!tagSettings.requiredKeys.includes(key)) {
                            setTagSettings(s => ({ ...s, requiredKeys: [...s.requiredKeys, key] }));
                          }
                          setNewRequiredKey('');
                        }
                      }}
                    />
                    <Button variant="outline" size="sm" className="h-8 glass hover-glow" onClick={() => {
                      if (newRequiredKey.trim()) {
                        const key = newRequiredKey.trim().toLowerCase();
                        if (!tagSettings.requiredKeys.includes(key)) {
                          setTagSettings(s => ({ ...s, requiredKeys: [...s.requiredKeys, key] }));
                        }
                        setNewRequiredKey('');
                      }
                    }}>
                      {t('common.add', 'Add')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Export & Actions */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  {t('tags.exportData', 'Export & Data')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-3">
                  <Button variant="outline" size="sm" className="glass hover-glow" disabled={isInDemoMode} onClick={() => {
                    const data = JSON.stringify({ tags, coverage, settings: tagSettings }, null, 2);
                    const blob = new Blob([data], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `tags-export-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click(); URL.revokeObjectURL(url);
                    toast.success(t('tags.exportSuccess', 'Tags exported successfully'));
                  }}>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    {t('tags.exportJson', 'Export as JSON')}
                  </Button>
                  <Button variant="outline" size="sm" className="glass hover-glow" disabled={isInDemoMode} onClick={() => {
                    const rows = [['Key', 'Value', 'Color', 'Category', 'Usage Count', 'Created At']];
                    tags.forEach(tag => rows.push([tag.key, tag.value, tag.color, tag.category || 'CUSTOM', String(tag.usage_count || 0), tag.created_at]));
                    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `tags-export-${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click(); URL.revokeObjectURL(url);
                    toast.success(t('tags.exportSuccess', 'Tags exported successfully'));
                  }}>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    {t('tags.exportCsv', 'Export as CSV')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button className="glass hover-glow" disabled={isInDemoMode} onClick={() => {
                localStorage.setItem(`tag-settings-${isInDemoMode ? 'demo' : 'org'}`, JSON.stringify(tagSettings));
                toast.success(t('tags.settingsSaved', 'Tag settings saved'));
              }}>
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
                {t('tags.deleteConfirm', 'Are you sure you want to delete this tag? This will remove it from all {{count}} assigned resources.', {
                  count: deleteTarget?.usage_count || 0,
                })}
              </DialogDescription>
            </DialogHeader>
            {deleteTarget && (
              <div className="py-2"><TagBadge tag={deleteTarget} size="md" /></div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel', 'Cancel')}</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleteTag.isPending}>
                {deleteTag.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {t('tags.confirmDelete', 'Delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
