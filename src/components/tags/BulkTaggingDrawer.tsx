import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Tags, CheckCircle2, Loader2, Filter, X, Search, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
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
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [result, setResult] = useState<any>(null);

  const { data: untaggedData, isLoading: loadingResources } = useUntaggedResources(
    preFilter?.tagStatus === 'untagged' ? { enabled: open } : { enabled: open }
  );
  const { data: tagData } = useTagList({ limit: 100, enabled: open });
  const bulkAssign = useBulkAssign();

  const resources: any[] = untaggedData?.data || [];
  const tags = tagData?.tags || [];

  // Extract unique service types for filter
  const serviceTypes = useMemo(() => {
    const types = new Set<string>();
    resources.forEach((r: any) => types.add(r.resource_type || r.resource_name || 'Unknown'));
    return Array.from(types).sort();
  }, [resources]);

  // Extract unique providers
  const providers = useMemo(() => {
    const p = new Set<string>();
    resources.forEach((r: any) => p.add(r.cloud_provider || 'AWS'));
    return Array.from(p).sort();
  }, [resources]);

  // Filtered resources
  const filteredResources = useMemo(() => {
    return resources.filter((r: any) => {
      const matchesSearch = !resourceSearch ||
        (r.resource_name || '').toLowerCase().includes(resourceSearch.toLowerCase()) ||
        (r.resource_id || '').toLowerCase().includes(resourceSearch.toLowerCase());
      const matchesService = serviceFilter === 'all' ||
        (r.resource_type || r.resource_name) === serviceFilter;
      const matchesProvider = providerFilter === 'all' ||
        r.cloud_provider === providerFilter;
      return matchesSearch && matchesService && matchesProvider;
    });
  }, [resources, resourceSearch, serviceFilter, providerFilter]);

  const toggleResource = useCallback((id: string) => {
    setSelectedResources((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  }, []);

  const toggleAll = useCallback(() => {
    const allFilteredIds = filteredResources.map((r: any) => r.resource_id);
    const allSelected = allFilteredIds.every((id: string) => selectedResources.includes(id));
    if (allSelected) {
      setSelectedResources((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedResources((prev) => {
        const newSet = new Set([...prev, ...allFilteredIds]);
        return Array.from(newSet);
      });
    }
  }, [filteredResources, selectedResources]);

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
      // handled by mutation onError
    }
  }, [bulkAssign, selectedTags, selectedResources]);

  const reset = useCallback(() => {
    setStep('resources');
    setSelectedResources([]);
    setSelectedTags([]);
    setResult(null);
    setResourceSearch('');
    setServiceFilter('all');
    setProviderFilter('all');
  }, []);

  const allFilteredSelected = filteredResources.length > 0 &&
    filteredResources.every((r: any) => selectedResources.includes(r.resource_id));

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="glass hover-glow gap-1">
            <Package className="h-3.5 w-3.5" />
            {t('tags.bulkTagging', 'Bulk Tagging')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5" />
            {t('tags.bulkTagging', 'Bulk Tagging')}
          </DialogTitle>
          {/* Step indicators */}
          <div className="flex items-center gap-3 mt-3">
            {(['resources', 'tags', 'review'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  step === s ? 'bg-primary text-primary-foreground' :
                  (['resources', 'tags', 'review'].indexOf(step) > i || step === 'done') ? 'bg-primary/20 text-primary' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {i + 1}
                </div>
                <span className={`text-sm ${step === s ? 'font-medium' : 'text-muted-foreground'}`}>
                  {s === 'resources' ? t('tags.selectResources', 'Recursos') :
                   s === 'tags' ? t('tags.selectTags', 'Tags') :
                   t('tags.review', 'Revisão')}
                </span>
                {i < 2 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-6 py-4">
          {/* STEP 1: Select Resources */}
          {step === 'resources' && (
            <div className="flex flex-col h-full gap-4">
              {/* Filters row */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('tags.searchResources', 'Buscar recursos...')}
                    value={resourceSearch}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResourceSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <Select value={serviceFilter} onValueChange={setServiceFilter}>
                  <SelectTrigger className="w-[240px] h-9">
                    <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder={t('tags.allServices', 'Todos os serviços')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('tags.allServices', 'Todos os serviços')}</SelectItem>
                    {serviceTypes.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {providers.length > 1 && (
                  <Select value={providerFilter} onValueChange={setProviderFilter}>
                    <SelectTrigger className="w-[160px] h-9">
                      <SelectValue placeholder={t('tags.allProviders', 'Todos')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('tags.allProviders', 'Todos os providers')}</SelectItem>
                      {providers.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Selection info bar */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {filteredResources.length} {t('tags.resourcesFound', 'recursos encontrados')}
                  {serviceFilter !== 'all' && (
                    <Badge variant="secondary" className="ml-2 text-xs gap-1">
                      {serviceFilter}
                      <button onClick={() => setServiceFilter('all')} className="ml-0.5 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                </span>
                <span className="font-medium">
                  {selectedResources.length} {t('tags.selected', 'selecionados')}
                </span>
              </div>

              {/* Resource table */}
              <div className="flex-1 overflow-hidden border rounded-lg">
                <ScrollArea className="h-full">
                  {loadingResources ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-[40px]">
                            <Checkbox
                              checked={allFilteredSelected}
                              onCheckedChange={toggleAll}
                              aria-label={t('tags.selectAll', 'Selecionar todos')}
                            />
                          </TableHead>
                          <TableHead>{t('tags.resourceName', 'Recurso')}</TableHead>
                          <TableHead>{t('tags.serviceType', 'Serviço')}</TableHead>
                          <TableHead>{t('tags.provider', 'Provider')}</TableHead>
                          <TableHead>{t('tags.account', 'Conta')}</TableHead>
                          <TableHead className="text-right">{t('tags.cost', 'Custo')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredResources.map((r: any) => (
                          <TableRow
                            key={r.resource_id}
                            className={`cursor-pointer transition-colors ${
                              selectedResources.includes(r.resource_id) ? 'bg-primary/5' : 'hover:bg-accent'
                            }`}
                            onClick={() => toggleResource(r.resource_id)}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedResources.includes(r.resource_id)}
                                onCheckedChange={() => toggleResource(r.resource_id)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {r.resource_name || r.resource_id}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {r.resource_type || r.resource_name}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {r.cloud_provider || 'AWS'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono">
                              {r.aws_account_id ? `...${String(r.aws_account_id).slice(-8)}` : '-'}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {r.total_cost ? `$${Number(r.total_cost).toFixed(2)}` : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredResources.length === 0 && !loadingResources && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                              {resources.length === 0
                                ? t('tags.noUntaggedResources', 'Nenhum recurso sem tag encontrado')
                                : t('tags.noMatchingResources', 'Nenhum recurso corresponde aos filtros')}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}

          {/* STEP 2: Select Tags */}
          {step === 'tags' && (
            <div className="flex flex-col h-full gap-4">
              <p className="text-sm text-muted-foreground">
                {t('tags.selectTagsToApply', 'Selecione as tags para aplicar aos {{count}} recursos selecionados', { count: selectedResources.length })}
              </p>
              <div className="flex-1 overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {tags.map((tag) => {
                    const isSelected = !!selectedTags.find((t) => t.id === tag.id);
                    return (
                      <Card
                        key={tag.id}
                        className={`cursor-pointer transition-all ${
                          isSelected ? 'glass border-primary ring-1 ring-primary/30' : 'glass border-primary/20 hover:border-primary/40'
                        }`}
                        onClick={() => toggleTag(tag)}
                      >
                        <CardContent className="p-3 flex items-center gap-3">
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleTag(tag)} />
                          <div className="flex-1 min-w-0">
                            <TagBadge tag={tag} />
                            {tag.description && (
                              <p className="text-xs text-muted-foreground mt-1 truncate">{tag.description}</p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{tag.usage_count || 0} usos</span>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                {tags.length === 0 && (
                  <div className="text-center text-muted-foreground py-12">
                    {t('tags.noTagsAvailable', 'Nenhuma tag disponível. Crie tags primeiro na aba Tags Library.')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Review */}
          {step === 'review' && (
            <div className="flex flex-col h-full gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="glass border-primary/20">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium mb-2">{t('tags.selectedResources', 'Recursos selecionados')}</p>
                    <p className="text-3xl font-bold">{selectedResources.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('tags.resourceTypes', 'tipos de serviço')}: {new Set(
                        resources.filter((r: any) => selectedResources.includes(r.resource_id))
                          .map((r: any) => r.resource_type || r.resource_name)
                      ).size}
                    </p>
                  </CardContent>
                </Card>
                <Card className="glass border-primary/20">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium mb-2">{t('tags.tagsToApply', 'Tags a aplicar')}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {selectedTags.map((tag) => <TagBadge key={tag.id} tag={tag} />)}
                    </div>
                  </CardContent>
                </Card>
              </div>
              <Card className="glass border-primary/20 flex-1">
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-3">{t('tags.previewAssignments', 'Prévia das atribuições')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('tags.bulkSummary', '{{tagCount}} tags serão aplicadas a {{resourceCount}} recursos, totalizando até {{total}} atribuições.', {
                      tagCount: selectedTags.length,
                      resourceCount: selectedResources.length,
                      total: selectedTags.length * selectedResources.length,
                    })}
                  </p>
                  <ScrollArea className="h-[200px] mt-3">
                    <div className="space-y-1">
                      {resources
                        .filter((r: any) => selectedResources.includes(r.resource_id))
                        .slice(0, 50)
                        .map((r: any) => (
                          <div key={r.resource_id} className="flex items-center gap-2 text-sm py-1 px-2 rounded bg-muted/30">
                            <span className="truncate flex-1">{r.resource_name || r.resource_id}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">{r.cloud_provider}</Badge>
                          </div>
                        ))}
                      {selectedResources.length > 50 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          ... e mais {selectedResources.length - 50} recursos
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
              {bulkAssign.isPending && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{t('tags.processing', 'Processando...')}</p>
                  <Progress value={undefined} className="h-2" />
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Done */}
          {step === 'done' && result && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <p className="text-xl font-medium">{t('tags.bulkComplete', 'Tagging Concluído')}</p>
              <div className="text-sm text-muted-foreground text-center space-y-1">
                <p>{t('tags.assigned', 'Atribuídos')}: {result.assignedCount || 0}</p>
                <p>{t('tags.skipped', 'Já existiam')}: {result.skippedCount || 0}</p>
                {result.failedCount > 0 && <p className="text-destructive">{t('tags.failed', 'Falhas')}: {result.failedCount}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Footer with navigation buttons */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <div>
            {step !== 'resources' && step !== 'done' && (
              <Button
                variant="outline"
                className="glass"
                onClick={() => setStep(step === 'tags' ? 'resources' : 'tags')}
                disabled={bulkAssign.isPending}
              >
                {t('tags.back', 'Voltar')}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === 'resources' && (
              <Button
                className="glass hover-glow"
                disabled={selectedResources.length === 0}
                onClick={() => setStep('tags')}
              >
                {t('tags.next', 'Próximo')}: {t('tags.selectTags', 'Selecionar Tags')}
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            )}
            {step === 'tags' && (
              <Button
                className="glass hover-glow"
                disabled={selectedTags.length === 0}
                onClick={() => setStep('review')}
              >
                {t('tags.review', 'Revisar')}
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            )}
            {step === 'review' && (
              <Button
                className="glass hover-glow"
                onClick={handleExecute}
                disabled={bulkAssign.isPending}
              >
                {bulkAssign.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {t('tags.applyTags', 'Aplicar Tags')}
              </Button>
            )}
            {step === 'done' && (
              <Button className="glass hover-glow" onClick={() => { reset(); setOpen(false); }}>
                {t('common.close', 'Fechar')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
