import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Tags, CheckCircle2, Loader2, Filter, X, Search, ArrowRight, Info } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TagBadge } from './TagBadge';
import { useTagList, useBulkAssign, useUntaggedResources, useAllResources, useTagSuggestions, type Tag, type BulkResource } from '@/hooks/useTags';

interface BulkTaggingDrawerProps {
  trigger?: React.ReactNode;
  preFilter?: { tagStatus?: 'untagged' };
}

type Step = 'resources' | 'tags' | 'review' | 'done';

export function BulkTaggingDrawer({ trigger, preFilter }: BulkTaggingDrawerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('resources');
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [resourceSearch, setResourceSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [tagSearch, setTagSearch] = useState('');
  const [result, setResult] = useState<any>(null);
  const [showAllResources, setShowAllResources] = useState(false);

  const { data: untaggedData, isLoading: loadingUntagged } = useUntaggedResources({ enabled: open && !showAllResources });
  const { data: allData, isLoading: loadingAll } = useAllResources({ enabled: open && showAllResources });
  const { data: tagData } = useTagList({ limit: 100, enabled: open });
  const bulkAssign = useBulkAssign();

  const loadingResources = showAllResources ? loadingAll : loadingUntagged;
  const resources: any[] = showAllResources ? (allData?.data || []) : (untaggedData?.data || []);
  const tags = tagData?.tags || [];

  // Extract unique service types with counts for smart filtering
  const serviceStats = useMemo(() => {
    const map = new Map<string, number>();
    resources.forEach((r: any) => {
      const svc = r.resource_type || r.resource_name || 'Unknown';
      map.set(svc, (map.get(svc) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [resources]);

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
      const svcName = r.resource_type || r.resource_name;
      const matchesService = serviceFilter === 'all' || svcName === serviceFilter;
      const matchesProvider = providerFilter === 'all' || r.cloud_provider === providerFilter;
      return matchesSearch && matchesService && matchesProvider;
    });
  }, [resources, resourceSearch, serviceFilter, providerFilter]);

  // Filtered tags for step 2
  const filteredTags = useMemo(() => {
    if (!tagSearch) return tags;
    const q = tagSearch.toLowerCase();
    return tags.filter((t) => t.key.toLowerCase().includes(q) || t.value.toLowerCase().includes(q));
  }, [tags, tagSearch]);

  // Melhoria 7: Dominant resource type from selected resources for suggestions
  const dominantResourceType = useMemo(() => {
    if (selectedResourceIds.size === 0) return undefined;
    const typeMap = new Map<string, number>();
    resources.filter((r: any) => selectedResourceIds.has(r.resource_id)).forEach((r: any) => {
      const t = r.resource_type || r.resource_name || 'unknown';
      typeMap.set(t, (typeMap.get(t) || 0) + 1);
    });
    let max = 0; let dominant = '';
    typeMap.forEach((count, type) => { if (count > max) { max = count; dominant = type; } });
    return dominant || undefined;
  }, [resources, selectedResourceIds]);

  const { data: suggestionsData } = useTagSuggestions({ resourceType: step === 'tags' ? dominantResourceType : undefined });

  // Selected resources with full data (for review and sending to backend)
  const selectedResourcesData = useMemo(() => {
    return resources.filter((r: any) => selectedResourceIds.has(r.resource_id));
  }, [resources, selectedResourceIds]);

  const toggleResource = useCallback((id: string) => {
    setSelectedResourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    const allFilteredIds = filteredResources.map((r: any) => r.resource_id);
    const allSelected = allFilteredIds.every((id: string) => selectedResourceIds.has(id));
    setSelectedResourceIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        allFilteredIds.forEach((id: string) => next.delete(id));
      } else {
        allFilteredIds.forEach((id: string) => next.add(id));
      }
      return next;
    });
  }, [filteredResources, selectedResourceIds]);

  const selectAllOfService = useCallback((serviceName: string) => {
    const ids = resources
      .filter((r: any) => (r.resource_type || r.resource_name) === serviceName)
      .map((r: any) => r.resource_id);
    setSelectedResourceIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id: string) => next.add(id));
      return next;
    });
  }, [resources]);

  const toggleTag = useCallback((tag: Tag) => {
    setSelectedTags((prev) =>
      prev.find((t) => t.id === tag.id) ? prev.filter((t) => t.id !== tag.id) : [...prev, tag]
    );
  }, []);

  const handleExecute = useCallback(async () => {
    try {
      const bulkResources: BulkResource[] = selectedResourcesData.map((r: any) => ({
        resourceId: r.resource_id,
        resourceType: r.resource_type || r.resource_name || 'unknown',
        resourceName: r.resource_name || '',
        cloudProvider: r.cloud_provider || 'AWS',
        awsAccountId: r.aws_account_id || undefined,
      }));
      const res = await bulkAssign.mutateAsync({
        tagIds: selectedTags.map((t) => t.id),
        resources: bulkResources,
      });
      setResult(res);
      setStep('done');
    } catch {
      // handled by mutation onError
    }
  }, [bulkAssign, selectedTags, selectedResourcesData]);

  const reset = useCallback(() => {
    setStep('resources');
    setSelectedResourceIds(new Set());
    setSelectedTags([]);
    setResult(null);
    setResourceSearch('');
    setServiceFilter('all');
    setProviderFilter('all');
    setTagSearch('');
    setShowAllResources(false);
  }, []);

  const allFilteredSelected = filteredResources.length > 0 &&
    filteredResources.every((r: any) => selectedResourceIds.has(r.resource_id));

  // Summary of selected resources by service type
  const selectedByService = useMemo(() => {
    const map = new Map<string, number>();
    selectedResourcesData.forEach((r: any) => {
      const svc = r.resource_type || r.resource_name || 'Unknown';
      map.set(svc, (map.get(svc) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [selectedResourcesData]);

  const formatCost = (cost: any) => {
    const n = Number(cost);
    if (!n || isNaN(n)) return '-';
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

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
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Tags className="h-5 w-5" />
            {t('tags.bulkTagging', 'Atribuição de Tags em Massa')}
          </DialogTitle>
          <div className="flex items-center gap-4 mt-2">
            {(['resources', 'tags', 'review'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  step === s ? 'bg-primary text-primary-foreground' :
                  (['resources', 'tags', 'review'].indexOf(step) > i || step === 'done') ? 'bg-primary/20 text-primary' :
                  'bg-muted text-muted-foreground'
                }`}>{i + 1}</div>
                <span className={`text-sm hidden sm:inline ${step === s ? 'font-medium' : 'text-muted-foreground'}`}>
                  {s === 'resources' ? 'Selecionar Recursos' : s === 'tags' ? 'Escolher Tags' : 'Revisar e Aplicar'}
                </span>
                {i < 2 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* STEP 1: Select Resources */}
          {step === 'resources' && (
            <div className="flex flex-col h-full">
              {/* Filters */}
              <div className="px-6 py-3 border-b space-y-3 shrink-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome do recurso..."
                      value={resourceSearch}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResourceSearch(e.target.value)}
                      className="pl-9 h-9"
                      autoFocus
                    />
                  </div>
                  <Select value={serviceFilter} onValueChange={setServiceFilter}>
                    <SelectTrigger className="w-[280px] h-9">
                      <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
                      <SelectValue placeholder="Filtrar por serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os serviços ({resources.length})</SelectItem>
                      {serviceStats.map((s) => (
                        <SelectItem key={s.name} value={s.name}>{s.name} ({s.count})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {providers.length > 1 && (
                    <Select value={providerFilter} onValueChange={setProviderFilter}>
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue placeholder="Provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {providers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {/* Selection summary bar */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {/* Melhoria 3: Toggle all/untagged */}
                    <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5">
                      <button
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${!showAllResources ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => setShowAllResources(false)}
                      >
                        Sem tag
                      </button>
                      <button
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${showAllResources ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => setShowAllResources(true)}
                      >
                        Todos
                      </button>
                    </div>
                    <span className="text-muted-foreground">
                      {filteredResources.length} recursos
                      {serviceFilter !== 'all' && (
                        <Badge variant="secondary" className="ml-2 text-xs gap-1">
                          {serviceFilter}
                          <button onClick={() => setServiceFilter('all')} className="ml-0.5 hover:text-destructive"><X className="h-3 w-3" /></button>
                        </Badge>
                      )}
                    </span>
                    {serviceFilter !== 'all' && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => selectAllOfService(serviceFilter)}>
                        Selecionar todos deste serviço
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {selectedResourceIds.size > 0 && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => setSelectedResourceIds(new Set())}>
                        Limpar seleção
                      </Button>
                    )}
                    <Badge variant={selectedResourceIds.size > 0 ? 'default' : 'secondary'} className="text-xs">
                      {selectedResourceIds.size} selecionados
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Resource table */}
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  {loadingResources ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 sticky top-0">
                          <TableHead className="w-[40px] pl-6">
                            <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} />
                          </TableHead>
                          <TableHead>Recurso</TableHead>
                          <TableHead>Serviço</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead>Conta</TableHead>
                          {showAllResources && <TableHead>Status</TableHead>}
                          <TableHead className="text-right pr-6">Custo (período)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredResources.map((r: any) => {
                          const isSelected = selectedResourceIds.has(r.resource_id);
                          return (
                            <TableRow
                              key={r.resource_id}
                              className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-accent/50'}`}
                              onClick={() => toggleResource(r.resource_id)}
                            >
                              <TableCell className="pl-6">
                                <Checkbox checked={isSelected} onCheckedChange={() => toggleResource(r.resource_id)} />
                              </TableCell>
                              <TableCell className="font-medium max-w-[300px] truncate">
                                {r.resource_name || r.resource_id?.split('::')[0] || r.resource_id}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs font-normal">
                                  {r.resource_type || r.resource_name}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">{r.cloud_provider || 'AWS'}</Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {r.aws_account_id ? `...${String(r.aws_account_id).slice(-8)}` : '-'}
                              </TableCell>
                              {showAllResources && (
                                <TableCell>
                                  {r.tag_count > 0
                                    ? <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-600">{r.tag_count} tag{r.tag_count > 1 ? 's' : ''}</Badge>
                                    : <Badge variant="outline" className="text-[10px] text-muted-foreground">sem tag</Badge>
                                  }
                                </TableCell>
                              )}
                              <TableCell className="text-right pr-6 text-sm tabular-nums">
                                {formatCost(r.total_cost)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {filteredResources.length === 0 && !loadingResources && (
                          <TableRow>
                            <TableCell colSpan={showAllResources ? 7 : 6} className="text-center text-muted-foreground py-16">
                              {resources.length === 0
                                ? (showAllResources ? 'Nenhum recurso encontrado' : 'Nenhum recurso sem tag encontrado')
                                : 'Nenhum recurso corresponde aos filtros aplicados'}
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
            <div className="flex flex-col h-full">
              <div className="px-6 py-3 border-b shrink-0 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Selecione as tags para aplicar aos <span className="font-medium text-foreground">{selectedResourceIds.size}</span> recursos selecionados
                  </p>
                  <Badge variant="secondary" className="text-xs">{selectedTags.length} tags selecionadas</Badge>
                </div>
                <div className="relative max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar tags..."
                    value={tagSearch}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTagSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                {/* Selected tags preview */}
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedTags.map((tag) => (
                      <button key={tag.id} onClick={() => toggleTag(tag)} className="group">
                        <TagBadge tag={tag} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <ScrollArea className="flex-1 px-6 py-3">
                {/* Melhoria 7: Suggested tags based on selected resource types */}
                {suggestionsData && Array.isArray(suggestionsData) && suggestionsData.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5" />
                      Sugestões para {dominantResourceType}
                    </p>
                    <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
                      {suggestionsData.filter((s: Tag) => !selectedTags.find(t => t.id === s.id)).map((tag: Tag) => (
                        <button key={tag.id} onClick={() => toggleTag(tag)}
                          className="transition-all rounded-md hover:scale-105">
                          <TagBadge tag={tag} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {filteredTags.map((tag) => {
                    const isSelected = !!selectedTags.find((t) => t.id === tag.id);
                    return (
                      <div
                        key={tag.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30 hover:bg-accent/30'
                        }`}
                        onClick={() => toggleTag(tag)}
                      >
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleTag(tag)} className="shrink-0" />
                        <div className="flex-1 min-w-0">
                          <TagBadge tag={tag} />
                          <p className="text-xs text-muted-foreground mt-0.5">{tag.category?.replace('_', ' ') || 'CUSTOM'}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{tag.usage_count || 0}</span>
                      </div>
                    );
                  })}
                </div>
                {tags.length === 0 && (
                  <div className="text-center text-muted-foreground py-16">
                    Nenhuma tag disponível. Crie tags primeiro na aba Tags Library.
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {/* STEP 3: Review */}
          {step === 'review' && (
            <div className="flex flex-col h-full px-6 py-4 gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                <Card className="glass border-primary/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold">{selectedResourceIds.size}</p>
                    <p className="text-xs text-muted-foreground mt-1">Recursos</p>
                  </CardContent>
                </Card>
                <Card className="glass border-primary/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold">{selectedTags.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Tags</p>
                  </CardContent>
                </Card>
                <Card className="glass border-primary/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold">{selectedResourceIds.size * selectedTags.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Atribuições</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
                {/* Resources by service */}
                <Card className="glass border-primary/20 flex flex-col overflow-hidden">
                  <CardContent className="p-4 flex flex-col h-full">
                    <p className="text-sm font-medium mb-3">Recursos por serviço</p>
                    <ScrollArea className="flex-1">
                      <div className="space-y-2">
                        {selectedByService.map(([svc, count]) => (
                          <div key={svc} className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-muted/30">
                            <span className="truncate">{svc}</span>
                            <Badge variant="secondary" className="text-xs shrink-0 ml-2">{count}</Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Tags to apply */}
                <Card className="glass border-primary/20 flex flex-col overflow-hidden">
                  <CardContent className="p-4 flex flex-col h-full">
                    <p className="text-sm font-medium mb-3">Tags a aplicar</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTags.map((tag) => <TagBadge key={tag.id} tag={tag} size="md" />)}
                    </div>
                    <div className="mt-4 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                          Cada tag será aplicada individualmente a cada recurso selecionado.
                          Atribuições já existentes serão ignoradas automaticamente.
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {bulkAssign.isPending && (
                <div className="space-y-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <p className="text-sm text-muted-foreground">Processando atribuições...</p>
                  </div>
                  <Progress value={undefined} className="h-2" />
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Done */}
          {step === 'done' && result && (
            <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <div className="text-center">
                <p className="text-xl font-medium">Tagging Concluído</p>
                <p className="text-sm text-muted-foreground mt-2">As tags foram aplicadas aos recursos selecionados.</p>
              </div>
              <div className="grid grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-500">{result.assignedCount || 0}</p>
                  <p className="text-xs text-muted-foreground">Atribuídos</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-muted-foreground">{result.skippedCount || 0}</p>
                  <p className="text-xs text-muted-foreground">Já existiam</p>
                </div>
                {result.failedCount > 0 && (
                  <div>
                    <p className="text-2xl font-bold text-destructive">{result.failedCount}</p>
                    <p className="text-xs text-muted-foreground">Falhas</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex items-center justify-between shrink-0">
          <div>
            {step !== 'resources' && step !== 'done' && (
              <Button variant="outline" className="glass" onClick={() => setStep(step === 'tags' ? 'resources' : 'tags')} disabled={bulkAssign.isPending}>
                Voltar
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === 'resources' && (
              <Button className="glass hover-glow" disabled={selectedResourceIds.size === 0} onClick={() => setStep('tags')}>
                Próximo: Escolher Tags
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            )}
            {step === 'tags' && (
              <Button className="glass hover-glow" disabled={selectedTags.length === 0} onClick={() => setStep('review')}>
                Revisar e Aplicar
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            )}
            {step === 'review' && (
              <Button className="glass hover-glow" onClick={handleExecute} disabled={bulkAssign.isPending}>
                {bulkAssign.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Aplicar {selectedTags.length} tags a {selectedResourceIds.size} recursos
              </Button>
            )}
            {step === 'done' && (
              <Button className="glass hover-glow" onClick={() => { reset(); setOpen(false); }}>
                Fechar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
