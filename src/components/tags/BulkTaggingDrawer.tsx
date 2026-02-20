import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Tags, CheckCircle2, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { TagBadge } from './TagBadge';
import { useTagList, useBulkAssign, useUntaggedResources, type Tag } from '@/hooks/useTags';

interface BulkTaggingDrawerProps {
  trigger?: React.ReactNode;
  preFilter?: { tagStatus?: 'untagged' };
}

type Step = 'resources' | 'tags' | 'review' | 'done';

export function BulkTaggingDrawer({ trigger, preFilter }: BulkTaggingDrawerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('resources');
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [resourceSearch, setResourceSearch] = useState('');
  const [result, setResult] = useState<any>(null);

  const { data: untaggedData, isLoading: loadingResources } = useUntaggedResources(
    preFilter?.tagStatus === 'untagged' ? { enabled: true } : undefined
  );
  const { data: tagData } = useTagList({ limit: 100, enabled: true });
  const bulkAssign = useBulkAssign();

  const resources = untaggedData?.data || [];
  const tags = tagData?.tags || [];

  const filteredResources = resources.filter((r: any) =>
    !resourceSearch || r.resource_name?.toLowerCase().includes(resourceSearch.toLowerCase()) ||
    r.resource_id?.toLowerCase().includes(resourceSearch.toLowerCase())
  );

  const toggleResource = useCallback((id: string) => {
    setSelectedResources((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : prev.length < 1000 ? [...prev, id] : prev
    );
  }, []);

  const toggleTag = useCallback((tag: Tag) => {
    setSelectedTags((prev) =>
      prev.find((t) => t.id === tag.id) ? prev.filter((t) => t.id !== tag.id) : [...prev, tag]
    );
  }, []);

  const handleExecute = useCallback(async () => {
    try {
      const res = await bulkAssign.mutateAsync({
        tagIds: selectedTags.map((t) => t.id),
        resourceIds: selectedResources,
      });
      setResult(res);
      setStep('done');
    } catch {
      // handled by mutation
    }
  }, [bulkAssign, selectedTags, selectedResources]);

  const reset = useCallback(() => {
    setStep('resources');
    setSelectedResources([]);
    setSelectedTags([]);
    setResult(null);
    setResourceSearch('');
  }, []);

  return (
    <Sheet open={open} onOpenChange={(v: boolean) => { setOpen(v); if (!v) reset(); }}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="glass hover-glow gap-1">
            <Package className="h-3.5 w-3.5" />
            {t('tags.bulkTagging', 'Bulk Tagging')}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t('tags.bulkTagging', 'Bulk Tagging')}</SheetTitle>
        </SheetHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 my-4">
          {(['resources', 'tags', 'review'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                step === s ? 'bg-primary text-primary-foreground' :
                (['resources', 'tags', 'review'].indexOf(step) > i || step === 'done') ? 'bg-primary/20 text-primary' :
                'bg-muted text-muted-foreground'
              }`}>
                {i + 1}
              </div>
              {i < 2 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        {step === 'resources' && (
          <div className="space-y-3">
            <Input
              placeholder={t('tags.searchResources', 'Search resources...')}
              value={resourceSearch}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResourceSearch(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{selectedResources.length} {t('tags.selected', 'selected')}</span>
              {selectedResources.length >= 900 && (
                <Badge variant="destructive" className="text-[10px]">{t('tags.nearLimit', 'Near 1000 limit')}</Badge>
              )}
            </div>
            <ScrollArea className="h-[400px]">
              {loadingResources ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <div className="space-y-1">
                  {filteredResources.map((r: any) => (
                    <label key={r.resource_id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer">
                      <Checkbox
                        checked={selectedResources.includes(r.resource_id)}
                        onCheckedChange={() => toggleResource(r.resource_id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{r.resource_name || r.resource_id}</p>
                        <p className="text-xs text-muted-foreground">{r.resource_type} · {r.cloud_provider}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
            <Button
              className="w-full glass hover-glow"
              disabled={selectedResources.length === 0}
              onClick={() => setStep('tags')}
            >
              {t('tags.next', 'Next')} → {t('tags.selectTags', 'Select Tags')}
            </Button>
          </div>
        )}

        {step === 'tags' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('tags.selectTagsToApply', 'Select tags to apply to {{count}} resources', { count: selectedResources.length })}</p>
            <ScrollArea className="h-[400px]">
              <div className="space-y-1">
                {tags.map((tag) => (
                  <label key={tag.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer">
                    <Checkbox
                      checked={!!selectedTags.find((t) => t.id === tag.id)}
                      onCheckedChange={() => toggleTag(tag)}
                    />
                    <TagBadge tag={tag} />
                  </label>
                ))}
              </div>
            </ScrollArea>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('resources')}>
                {t('tags.back', 'Back')}
              </Button>
              <Button
                className="flex-1 glass hover-glow"
                disabled={selectedTags.length === 0}
                onClick={() => setStep('review')}
              >
                {t('tags.review', 'Review')}
              </Button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div className="glass border-primary/20 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">{t('tags.summary', 'Summary')}</p>
              <p className="text-sm text-muted-foreground">
                {t('tags.bulkSummary', '{{tagCount}} tags → {{resourceCount}} resources', {
                  tagCount: selectedTags.length,
                  resourceCount: selectedResources.length,
                })}
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedTags.map((tag) => <TagBadge key={tag.id} tag={tag} />)}
              </div>
            </div>
            {bulkAssign.isPending && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t('tags.processing', 'Processing...')}</p>
                <Progress value={undefined} className="h-2" />
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('tags')} disabled={bulkAssign.isPending}>
                {t('tags.back', 'Back')}
              </Button>
              <Button className="flex-1 glass hover-glow" onClick={handleExecute} disabled={bulkAssign.isPending}>
                {bulkAssign.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {t('tags.apply', 'Apply Tags')}
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-lg font-medium">{t('tags.bulkComplete', 'Bulk Tagging Complete')}</p>
            <div className="text-sm text-muted-foreground text-center space-y-1">
              <p>{t('tags.assigned', 'Assigned')}: {result.assignedCount || 0}</p>
              <p>{t('tags.skipped', 'Skipped')}: {result.skippedCount || 0}</p>
              {result.failedCount > 0 && <p className="text-destructive">{t('tags.failed', 'Failed')}: {result.failedCount}</p>}
            </div>
            <Button className="glass hover-glow" onClick={() => { reset(); setOpen(false); }}>
              {t('common.close', 'Close')}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
