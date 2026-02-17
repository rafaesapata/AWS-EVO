import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { DollarSign, Save, RefreshCw, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  updated_at?: string;
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

export default function BudgetManagement() {
  const { t, i18n } = useTranslation();
  const { selectedProvider } = useCloudAccount();
  const provider = selectedProvider || 'AWS';
  const sym = getCurrencySymbol(getProviderCurrency(provider));

  const [budgets, setBudgets] = useState<Map<string, BudgetRow>>(new Map());
  const [editValues, setEditValues] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savedMonths, setSavedMonths] = useState<Set<string>>(new Set());

  const months = generateMonthsList(12);

  const fetchBudgets = async () => {
    setLoading(true);
    try {
      const res = await apiClient.lambda('manage-cloud-budget', {
        action: 'list',
        provider,
      });
      const map = new Map<string, BudgetRow>();
      (res.budgets || []).forEach((b: BudgetRow) => map.set(b.year_month, b));
      setBudgets(map);
    } catch {
      toast.error(t('budgetManagement.loadError', 'Erro ao carregar orçamentos'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBudgets(); }, [provider]);

  const handleSave = async (yearMonth: string) => {
    const val = editValues.get(yearMonth);
    const amount = parseFloat(val || '');
    if (isNaN(amount) || amount < 0) return;

    setSaving(prev => new Set(prev).add(yearMonth));
    try {
      await apiClient.lambda('manage-cloud-budget', {
        action: 'save',
        provider,
        year_month: yearMonth,
        amount,
      });
      // Update local state
      const existing = budgets.get(yearMonth);
      setBudgets(prev => {
        const next = new Map(prev);
        next.set(yearMonth, {
          ...existing,
          year_month: yearMonth,
          cloud_provider: provider,
          amount,
          currency: 'USD',
          source: 'manual',
          actual_spend: existing?.actual_spend || 0,
        } as BudgetRow);
        return next;
      });
      setEditValues(prev => { const n = new Map(prev); n.delete(yearMonth); return n; });
      setSavedMonths(prev => new Set(prev).add(yearMonth));
      setTimeout(() => setSavedMonths(prev => { const n = new Set(prev); n.delete(yearMonth); return n; }), 2000);
      toast.success(t('executiveDashboard.budgetSaved', 'Orçamento salvo'));
    } catch {
      toast.error(t('budgetManagement.saveError', 'Erro ao salvar orçamento'));
    } finally {
      setSaving(prev => { const n = new Set(prev); n.delete(yearMonth); return n; });
    }
  };

  const getEditValue = (ym: string): string => {
    if (editValues.has(ym)) return editValues.get(ym)!;
    const b = budgets.get(ym);
    return b ? String(Math.round(b.amount)) : '';
  };

  const isModified = (ym: string): boolean => {
    if (!editValues.has(ym)) return false;
    const b = budgets.get(ym);
    const original = b ? String(Math.round(b.amount)) : '';
    return editValues.get(ym) !== original;
  };

  return (
    <Layout
      title={t('budgetManagement.title', 'Gestão de Orçamento')}
      description={t('budgetManagement.description', 'Configure o orçamento mensal por provedor cloud')}
      icon={<DollarSign className="h-4 w-4 text-white" />}
    >
      <div className="space-y-6">
        {/* Info card */}
        <Card className="glass border-primary/20">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {t('budgetManagement.info', 'O orçamento é preenchido automaticamente com 85% do gasto do mês anterior quando não existe valor definido. Você pode editar o valor de qualquer mês abaixo.')}
            </p>
          </CardContent>
        </Card>

        {/* Budget table */}
        <Card className="glass border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {t('budgetManagement.monthlyBudgets', 'Orçamentos Mensais')} — {provider}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="glass hover-glow"
                onClick={fetchBudgets}
                disabled={loading}
              >
                <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
                {t('budgetManagement.refresh', 'Atualizar')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-primary/10">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                      {t('budgetManagement.month', 'Mês')}
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      {t('budgetManagement.actualSpend', 'Gasto Real')}
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      {t('budgetManagement.budgetAmount', 'Orçamento')}
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                      {t('budgetManagement.source', 'Origem')}
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                      {t('budgetManagement.usage', 'Uso')}
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">
                      {t('budgetManagement.actions', 'Ações')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((ym) => {
                    const b = budgets.get(ym);
                    const spend = b?.actual_spend || 0;
                    const budget = b?.amount || 0;
                    const usage = budget > 0 ? Math.round((spend / budget) * 100) : 0;
                    const isSaving = saving.has(ym);
                    const justSaved = savedMonths.has(ym);
                    const modified = isModified(ym);

                    return (
                      <tr key={ym} className="border-b border-primary/5 hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-medium capitalize">
                          {formatMonth(ym, i18n.language)}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums">
                          {spend > 0 ? `${sym}${spend.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-muted-foreground">{sym}</span>
                            <Input
                              type="number"
                              min="0"
                              step="100"
                              value={getEditValue(ym)}
                              onChange={(e) => setEditValues(prev => new Map(prev).set(ym, e.target.value))}
                              onKeyDown={(e) => { if (e.key === 'Enter' && modified) handleSave(ym); }}
                              className="w-28 text-right tabular-nums h-8"
                              placeholder="0"
                            />
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {b ? (
                            <Badge variant={b.source === 'auto' ? 'secondary' : 'default'} className="text-xs">
                              {b.source === 'auto'
                                ? t('executiveDashboard.budgetAutoFilled', 'auto')
                                : t('executiveDashboard.budgetManual', 'manual')}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {budget > 0 ? (
                            <span className={cn(
                              'tabular-nums font-medium',
                              usage >= 100 ? 'text-red-500' :
                              usage >= 90 ? 'text-amber-500' : 'text-green-600'
                            )}>
                              {usage}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {justSaved ? (
                            <Check className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSave(ym)}
                              disabled={!modified || isSaving}
                              className={cn(
                                'h-7 px-2',
                                modified && 'text-primary hover:text-primary'
                              )}
                            >
                              <Save className="h-3.5 w-3.5 mr-1" />
                              {isSaving ? '...' : t('executiveDashboard.budgetSave', 'Salvar')}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
