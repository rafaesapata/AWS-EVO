import { useState, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { Tags, Trash2, Pencil, Loader2 } from 'lucide-react';
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
import { TagBadge } from '@/components/tags/TagBadge';
import { TagSelector } from '@/components/tags/TagSelector';
import { BulkTaggingDrawer } from '@/components/tags/BulkTaggingDrawer';
import { QuickstartWizard } from '@/components/tags/QuickstartWizard';
import {
  useTagList, useTagCoverage, useDeleteTag, useTagCostReport,
  useTagSecurityFindings, type Tag,
} from '@/hooks/useTags';

export default function TagManagement() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const [showQuickstart, setShowQuickstart] = useState(false);
  const [selectedCostTag, setSelectedCostTag] = useState<string | null>(null);
  const [selectedSecTags, setSelectedSecTags] = useState<string[]>([]);

  const { data: tagData, isLoading } = useTagList({
    search: search || undefined,
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
    limit: 100,
  });
  const { data: coverage } = useTagCoverage();
  const deleteTag = useDeleteTag();
  const { data: costReport } = useTagCostReport(selectedCostTag);
  const { data: secFindings } = useTagSecurityFindings(selectedSecTags);

  const tags = tagData?.tags || [];
  const total = tagData?.total || 0;

  // Show quickstart if no tags
  const shouldShowQuickstart = !isLoading && total === 0 && !showQuickstart;

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteTag.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, deleteTag]);

  const coverageColor = (coverage?.coverage_percentage ?? 0) >= 80 ? 'text-green-500' :
    (coverage?.coverage_percentage ?? 0) >= 50 ? 'text-yellow-500' : 'text-red-500';

  if (shouldShowQuickstart) {
    return (
      <Layout
        title={t('tags.management', 'Tag Management')}
        description={t('tags.managementDesc', 'Organize and classify your cloud resources with tags')}
        icon={<Tags className="h-4 w-4 text-white" />}
      >
        <QuickstartWizard onComplete={() => setShowQuickstart(false)} onSkip={() => setShowQuickstart(false)} />
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
                <CardContent><p className="text-2xl font-bold">{coverage?.tagged_resources || 0}</p></CardContent>
              </Card>
              <Card className="glass border-primary/20">
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t('tags.untaggedResources', 'Untagged Resources')}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{coverage?.untagged_resources || 0}</p></CardContent>
              </Card>
              <Card className="glass border-primary/20">
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t('tags.coverage', 'Coverage')}</CardTitle></CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold ${coverageColor}`}>{coverage?.coverage_percentage?.toFixed(1) || 0}%</p>
                  <Progress value={coverage?.coverage_percentage || 0} className="h-2 mt-2" />
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
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteTarget(tag)}>
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
            <Card className="glass border-primary/20">
              <CardHeader><CardTitle className="text-sm">{t('tags.settingsPlaceholder', 'Settings')}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{t('tags.settingsComingSoon', 'Tag settings and policies coming soon.')}</p>
              </CardContent>
            </Card>
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
