import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Layout } from '@/components/Layout';
import { Wallet, RefreshCw, Check, TrendingUp, TrendingDown, Target, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { apiClient } from '@/integrations/aws/api-client';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { getCurrencySymbol, getProviderCurrency } from '@/lib/format-cost';
import { cn } from '@/lib/utils';

interface BudgetRow {
  id?: string;
  year_month: string;
  cloud_provider: string;
  amount: number;
  currency: string;
  source: 'auto' | 'manual';
  actual_spend: number;
}

function generateMonthsList(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function formatMonth(ym: string, locale: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(locale === 'pt' ? 'pt-BR' : locale === 'es' ? 'es-ES' : 'en-US', {
    month: 'long', year: 'numeric',
  });
}

const DEBOUNCE_MS = 1200;
const SAVED_FEEDBACK_MS = 2000;
const AZURE_SYNC_MONTHS = 11;
const AZURE_SYNC_TIMEOUT_MS = 120000;

export default function BudgetManagement() {
  const { t, i18n } = useTranslation();
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  const provider = selectedProvider || 'AWS';
  const sym = getCurrencySymbol(getProviderCurrency(provider));
  const isAzure = provider === 'AZURE';

  const [budgets, setBudgets] = useState<Map<string, BudgetRow>>(new Map());
  const [editValues, setEditValues] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [savedMonths, setSavedMonths] = useState<Set<string>>(new Set());
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const months = generateMonthsList(12);

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.lambda('manage-cloud-budget', {
        action: 'list',
        provider,
      });
      const rows: BudgetRow[] = res.budgets || [];
      const map = new Map<string, BudgetRow>();
      rows.forEach((b: BudgetRow) => map.set(b.year_month, b));
      setBudgets(map);
      setEditValues(new Map());

      // Azure auto-sync: if all months have 0 actual_spend, trigger cost sync in background
      const hasAnySpend = rows.some((b: BudgetRow) => b.actual_spend > 0);
      if (isAzure && selectedAccountId && !hasAnySpend && !syncingRef.current) {
        syncingRef.current = true;
        setSyncing(true);
        // Run sync in background - don't block the page
        (async () => {
          try {
            const now = new Date();
            const startDate = new Date(now.getFullYear(), now.getMonth() - AZURE_SYNC_MONTHS, 1);
            const syncRes = await apiClient.invoke('azure-fetch-costs', {
              body: {
                credentialId: selectedAccountId,
                startDate: startDate.toISOString().split('T')[0],
                endDate: now.toISOString().split('T')[0],
                granularity: 'DAILY',
              },
              timeoutMs: AZURE_SYNC_TIMEOUT_MS,
            });
            // Check if sync returned an error
            if (syncRes && 'error' in syncRes && syncRes.error) {
              console.warn('Azure cost sync error:', syncRes.error);
              toast.error(t('budgetManagement.syncError', 'Erro ao sincronizar custos Azure. Tente novamente.'));
              return;
            }
            // Re-fetch budgets after successful sync
            const retryRes = await apiClient.lambda('manage-cloud-budget', {
              action: 'list',
              provider,
            });
            if (retryRes && !('error' in retryRes && retryRes.error)) {
              const retryMap = new Map<string, BudgetRow>();
              ((retryRes as any).budgets || []).forEach((b: BudgetRow) => retryMap.set(b.year_month, b));
              setBudgets(retryMap);
              setEditValues(new Map());
            }
          } catch {
            toast.error(t('budgetManagement.syncError', 'Erro ao sincronizar custos Azure. Tente novamente.'));
          } finally {
            syncingRef.current = false;
            setSyncing(false);
          }
        })();
      }
    } catch {
      toast.error(t('budgetManagement.loadError', 'Erro ao carregar orçamentos'));
    } finally {
      setLoading(false);
    }
  }, [provider, isAzure, selectedAccountId, t]);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      debounceTimers.current.forEach(timer => clearTimeout(timer));
    };
  }, []);

  const saveBudget = useCallback(async (yearMonth: string, amount: number) => {
    setSaving(prev => new Set(prev).add(yearMonth));
    try {
      await apiClient.lambda('manage-cloud-budget', {
        action: 'save',
        provider,
        year_month: yearMonth,
        amount,
      });
      setBudgets(prev => {
        const next = new Map(prev);
        const existing = prev.get(yearMonth);
        next.set(yearMonth, {
          year_month: yearMonth,
          cloud_provider: provider,
          amount,
          currency: 'USD',
          source: 'manual',
          actual_spend: existing?.actual_spend || 0,
        });
        return next;
      });
      setSavedMonths(prev => new Set(prev).add(yearMonth));
      setEditValues(prev => { const n = new Map(prev); n.delete(yearMonth); return n; });
      setTimeout(() => setSavedMonths(prev => { const n = new Set(prev); n.delete(yearMonth); return n; }), SAVED_FEEDBACK_MS);
    } catch {
      toast.error(t('budgetManagement.saveError', 'Erro ao salvar orçamento'));
    } finally {
      setSaving(prev => { const n = new Set(prev); n.delete(yearMonth); return n; });
    }
  }, [provider, t]);

  const handleChange = useCallback((yearMonth: string, value: string) => {
    setEditValues(prev => new Map(prev).set(yearMonth, value));

    // Clear previous debounce
    const existing = debounceTimers.current.get(yearMonth);
    if (existing) clearTimeout(existing);

    // Auto-save after debounce period of inactivity
    const amount = parseFloat(value);
    if (value === '' || isNaN(amount) || amount < 0) return;

    const timer = setTimeout(() => {
      const b = budgets.get(yearMonth);
      const original = b ? Math.round(b.amount) : 0;
      if (Math.round(amount) !== original) {
        saveBudget(yearMonth, amount);
      }
      debounceTimers.current.delete(yearMonth);
    }, DEBOUNCE_MS);
    debounceTimers.current.set(yearMonth, timer);
  }, [budgets, saveBudget]);

  const getDisplayValue = (ym: string): string => {
    if (editValues.has(ym)) return editValues.get(ym)!;
    const b = budgets.get(ym);
    return b ? String(Math.round(b.amount)) : '';
  };

  const summary = useMemo(() => {
    const currentMonth = months[0];
    const currentBudget = budgets.get(currentMonth);
    const currentUsage = currentBudget && currentBudget.amount > 0
      ? Math.round((currentBudget.actual_spend / currentBudget.amount) * 100) : 0;
    const overBudgetCount = Array.from(budgets.values()).filter(b => b.amount > 0 && b.actual_spend > b.amount).length;
    return {
      currentBudget: currentBudget?.amount || 0,
      currentSpend: currentBudget?.actual_spend || 0,
      currentUsage,
      overBudgetCount,
    };
  }, [budgets, months]);

  return (
    <Layout
      title={t('budgetManagement.title', 'Gestão de Orçamento')}
      description={t('budgetManagement.description', 'Configure o orçamento mensal por provedor cloud')}
      icon={<Wallet className="h-4 w-4 text-white" />}
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="glass border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('budgetManagement.currentBudget', 'Orçamento Atual')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-24" /> : (
                <div className="space-y-1">
                  <div className="text-2xl font-semibold tabular-nums">
                    {sym}{summary.currentBudget.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{formatMonth(months[0], i18n.language)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('budgetManagement.currentSpend', 'Gasto Atual')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-24" /> : (
                <div className="space-y-1">
                  <div className="text-2xl font-semibold tabular-nums">
                    {sym}{summary.currentSpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    {summary.currentUsage >= 90
                      ? <TrendingUp className="h-3 w-3 text-red-500" />
                      : <TrendingDown className="h-3 w-3 text-green-500" />}
                    <span className={cn(
                      summary.currentUsage >= 90 ? 'text-red-500' :
                      summary.currentUsage >= 75 ? 'text-amber-500' : 'text-green-600'
                    )}>
                      {summary.currentUsage}% {t('budgetManagement.ofBudget', 'do orçamento')}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('executiveDashboard.budgetUtilization', 'Utilização do Orçamento')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-24" /> : (
                <div className="space-y-2">
                  <div className={cn('text-2xl font-semibold tabular-nums',
                    summary.currentUsage >= 100 ? 'text-red-500' :
                    summary.currentUsage >= 90 ? 'text-amber-500' : 'text-green-600'
                  )}>{summary.currentUsage}%</div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-700',
                      summary.currentUsage >= 100 ? 'bg-red-500' :
                      summary.currentUsage >= 90 ? 'bg-amber-500' :
                      summary.currentUsage >= 75 ? 'bg-yellow-500' : 'bg-green-500'
                    )} style={{ width: `${Math.min(100, summary.currentUsage)}%` }} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('budgetManagement.overBudget', 'Acima do Orçamento')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-2xl font-semibold tabular-nums',
                      summary.overBudgetCount > 0 ? 'text-red-500' : 'text-green-600'
                    )}>{summary.overBudgetCount}</span>
                    {summary.overBudgetCount > 0
                      ? <AlertTriangle className="h-5 w-5 text-red-500" />
                      : <Target className="h-5 w-5 text-green-500" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {summary.overBudgetCount === 0
                      ? t('budgetManagement.allOnTrack', 'Todos dentro do orçamento')
                      : t('budgetManagement.monthsOverBudget', 'meses acima do limite')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info Banner */}
        <Card className="glass border-primary/20">
          <CardContent className="py-4 px-6">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                {t('budgetManagement.infoAutoSave', 'O orçamento é salvo automaticamente ao digitar. Preenchido com 85% do gasto do mês anterior quando não existe valor definido.')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Budget Table */}
        <Card className="glass border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                {t('budgetManagement.monthlyBudgets', 'Orçamentos Mensais')}
                <Badge variant="outline" className="text-xs font-normal">{provider}</Badge>
              </CardTitle>
              <Button variant="outline" size="sm" className="glass hover-glow" onClick={fetchBudgets} disabled={loading || syncing}>
                <RefreshCw className={cn('h-4 w-4 mr-1', (loading || syncing) && 'animate-spin')} />
                {syncing
                  ? t('budgetManagement.syncing', 'Sincronizando...')
                  : t('budgetManagement.refresh', 'Atualizar')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-5 w-20 ml-auto" />
                    <Skeleton className="h-8 w-28" />
                    <Skeleton className="h-5 w-14" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-sm" role="table">
                  <thead>
                    <tr className="border-b border-primary/10">
                      <th className="text-left py-3 px-6 font-medium text-muted-foreground" scope="col">
                        {t('budgetManagement.month', 'Mês')}
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground" scope="col">
                        {t('budgetManagement.actualSpend', 'Gasto Real')}
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground" scope="col">
                        {t('budgetManagement.budgetAmount', 'Orçamento')}
                      </th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground" scope="col">
                        {t('budgetManagement.source', 'Origem')}
                      </th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground" scope="col">
                        {t('budgetManagement.usage', 'Uso')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((ym, idx) => {
                      const b = budgets.get(ym);
                      const spend = b?.actual_spend || 0;
                      const budget = b?.amount || 0;
                      const usage = budget > 0 ? Math.round((spend / budget) * 100) : 0;
                      const isSaving = saving.has(ym);
                      const justSaved = savedMonths.has(ym);
                      const isCurrentMonth = idx === 0;

                      return (
                        <tr key={ym} className={cn(
                          'border-b border-primary/5 transition-colors',
                          isCurrentMonth ? 'bg-primary/5' : 'hover:bg-muted/30'
                        )}>
                          <td className="py-3 px-6">
                            <div className="flex items-center gap-2">
                              <span className="font-medium capitalize">{formatMonth(ym, i18n.language)}</span>
                              {isCurrentMonth && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {t('budgetManagement.current', 'atual')}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums">
                            {syncing
                              ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground inline-block" />
                              : spend > 0
                                ? <span className="font-medium">{sym}{spend.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                                : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-muted-foreground text-xs">{sym}</span>
                              <Input
                                type="number"
                                min="0"
                                step="100"
                                value={getDisplayValue(ym)}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(ym, e.target.value)}
                                className="w-28 text-right tabular-nums h-8 text-sm"
                                placeholder="0"
                                aria-label={`${t('budgetManagement.budgetAmount', 'Orçamento')} ${formatMonth(ym, i18n.language)}`}
                              />
                              <div className="w-5 flex items-center justify-center">
                                {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                                {justSaved && !isSaving && <Check className="h-3.5 w-3.5 text-green-500" />}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {b ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>
                                      <Badge variant={b.source === 'auto' ? 'secondary' : 'default'} className="text-xs cursor-default">
                                        {b.source === 'auto'
                                          ? t('executiveDashboard.budgetAutoFilled', 'auto')
                                          : t('executiveDashboard.budgetManual', 'manual')}
                                      </Badge>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {b.source === 'auto'
                                      ? t('budgetManagement.autoTooltip', '85% do gasto do mês anterior')
                                      : t('budgetManagement.manualTooltip', 'Definido manualmente')}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {budget > 0 ? (
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className={cn('h-full rounded-full transition-all',
                                    usage >= 100 ? 'bg-red-500' : usage >= 90 ? 'bg-amber-500' : 'bg-green-500'
                                  )} style={{ width: `${Math.min(100, usage)}%` }} />
                                </div>
                                <span className={cn('tabular-nums font-medium text-xs min-w-[3ch]',
                                  usage >= 100 ? 'text-red-500' : usage >= 90 ? 'text-amber-500' : 'text-green-600'
                                )}>{usage}%</span>
                              </div>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
