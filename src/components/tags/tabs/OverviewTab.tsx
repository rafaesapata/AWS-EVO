import { Tags, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { TagBadge } from '@/components/tags/TagBadge';
import { BulkTaggingDrawer } from '@/components/tags/BulkTaggingDrawer';
import type { Tag, CoverageMetrics, RecentActivityItem } from '@/hooks/useTags';

interface OverviewTabProps {
  tags: Tag[];
  total: number;
  coverage: CoverageMetrics | null | undefined;
  recentActivity: RecentActivityItem[] | undefined;
  isInDemoMode: boolean;
  onExpandTag: (tagId: string) => void;
  onSwitchTab: (tab: string) => void;
}

export function OverviewTab({ tags, total, coverage, recentActivity, isInDemoMode, onExpandTag, onSwitchTab }: OverviewTabProps) {
  const { t } = useTranslation();

  const coverageColor = (coverage?.coveragePercentage ?? 0) >= 80 ? 'text-green-500' :
    (coverage?.coveragePercentage ?? 0) >= 50 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className="space-y-6">
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
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { onExpandTag(tag.id); onSwitchTab('library'); }}>
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
                      <span className="truncate text-muted-foreground">{item.resource_name || (item.resource_type && item.resource_type !== 'unknown' ? item.resource_type : item.resource_id?.split('::')[0] || 'unknown')}</span>
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
          <Button variant="outline" size="sm" className="glass hover-glow" onClick={() => onSwitchTab('library')}>
            <Tags className="h-3.5 w-3.5 mr-1" />{t('tags.manageTags', 'Manage Tags')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
