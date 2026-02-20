import { useState, useEffect, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { Wallet, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { apiClient } from '@/integrations/aws/api-client';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { useDemoAwareQuery } from '@/hooks/useDemoAwareQuery';
import { useCurrency } from '@/hooks/useCurrency';
import { BudgetSummaryCards } from './budget/BudgetSummaryCards';
import { BudgetProgressBar } from './budget/BudgetProgressBar';
import { BudgetInput } from './budget/BudgetInput';
import { AISuggestionButton } from './budget/AISuggestionButton';
import { AISuggestionDetails } from './budget/AISuggestionDetails';
import { BudgetCostTrend } from './budget/BudgetCostTrend';
import type { AISuggestionResponse } from './budget/AISuggestionButton';

interface BudgetCurrentResponse {
  budget: {
    id: string;
    amount: number;
    currency: string;
    source: string;
    year_month: string;
    cloud_provider: string;
    updated_at: string;
  } | null;
  mtd_spend: number;
  utilization_percentage: number;
  is_over_budget: boolean;
}

export default function BudgetManagement() {
  const { t } = useTranslation();
  const { selectedProvider, selectedAccountId } = useCloudAccount();
  const { isInDemoMode } = useDemoAwareQuery();

  const [provider, setProvider] = useState<string>(selectedProvider || 'AWS');
  const { sym, convert } = useCurrency();

  const [budgetData, setBudgetData] = useState<BudgetCurrentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [budgetValue, setBudgetValue] = useState(0);
  const [suggestionData, setSuggestionData] = useState<AISuggestionResponse | null>(null);

  // Sync provider tab with global provider selection
  useEffect(() => {
    if (selectedProvider) setProvider(selectedProvider);
  }, [selectedProvider]);

  const fetchBudget = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.lambda<BudgetCurrentResponse>('manage-cloud-budget', {
        action: 'get_current',
        provider,
        accountId: selectedAccountId,
      });
      if ('error' in res && res.error) {
        toast.error(t('budgetManagement.loadError', 'Erro ao carregar orçamentos'));
        return;
      }
      const data = (res as { data: BudgetCurrentResponse }).data;
      setBudgetData(data);
      setBudgetValue(data?.budget?.amount ?? 0);
    } catch {
      toast.error(t('budgetManagement.loadError', 'Erro ao carregar orçamentos'));
    } finally {
      setLoading(false);
    }
  }, [provider, selectedAccountId, t]);

  useEffect(() => {
    fetchBudget();
  }, [fetchBudget]);

  const saveBudget = useCallback(async (amount: number, source: string = 'manual') => {
    if (isInDemoMode) return;
    try {
      await apiClient.lambda('manage-cloud-budget', {
        action: 'save',
        provider,
        accountId: selectedAccountId,
        amount,
        source,
      });
      // Update local state optimistically
      setBudgetData(prev => {
        if (!prev) return prev;
        const utilization = amount > 0 ? (prev.mtd_spend / amount) * 100 : 0;
        return {
          ...prev,
          budget: {
            id: prev.budget?.id ?? '',
            amount,
            currency: prev.budget?.currency ?? 'USD',
            source,
            year_month: prev.budget?.year_month ?? '',
            cloud_provider: provider,
            updated_at: new Date().toISOString(),
          },
          utilization_percentage: utilization,
          is_over_budget: prev.mtd_spend > amount,
        };
      });
    } catch {
      toast.error(t('budgetManagement.saveError', 'Erro ao salvar orçamento'));
    }
  }, [provider, selectedAccountId, isInDemoMode, t]);

  const handleBudgetChange = (value: number) => {
    setBudgetValue(value);
  };

  const handleBudgetSave = (value: number) => {
    saveBudget(value, 'manual');
  };

  const handleSuggestionApplied = (suggestedAmount: number, data: AISuggestionResponse) => {
    setBudgetValue(suggestedAmount);
    setSuggestionData(data);
    saveBudget(suggestedAmount, 'ai_suggestion');
  };

  const handleProviderChange = (value: string) => {
    setProvider(value);
    setSuggestionData(null);
  };

  // Reset suggestion when account changes
  useEffect(() => {
    setSuggestionData(null);
  }, [selectedAccountId]);

  const mtdSpend = budgetData?.mtd_spend ?? 0;
  const utilization = budgetValue > 0 ? Math.round((mtdSpend / budgetValue) * 100 * 100) / 100 : 0;

  return (
    <Layout
      title={t('budgetManagement.title', 'Gestão de Orçamento')}
      description={t('budgetManagement.description', 'Configure o orçamento mensal por provedor cloud')}
      icon={<Wallet className="h-4 w-4 text-white" />}
    >
      <div className="space-y-6">
        {/* Provider Tabs + Refresh */}
        <div className="flex items-center justify-between">
          <Tabs value={provider} onValueChange={handleProviderChange}>
            <TabsList className="glass">
              <TabsTrigger value="AWS">AWS</TabsTrigger>
              <TabsTrigger value="AZURE">Azure</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            className="glass hover-glow"
            onClick={fetchBudget}
            disabled={loading}
          >
            <RefreshCw className={loading ? 'h-4 w-4 mr-1 animate-spin' : 'h-4 w-4 mr-1'} />
            {t('budgetManagement.refresh', 'Atualizar')}
          </Button>
        </div>

        {/* Summary Cards */}
        <BudgetSummaryCards
          budgetAmount={budgetValue}
          mtdSpend={mtdSpend}
          utilizationPercentage={utilization}
          currencySymbol={sym}
          loading={loading}
        />

        {/* Progress Bar */}
        <BudgetProgressBar utilizationPercentage={utilization} />

        {/* Budget Input with AI Suggestion Button */}
        <BudgetInput
          value={budgetValue}
          onChange={handleBudgetChange}
          onSave={handleBudgetSave}
          loading={loading}
          disabled={isInDemoMode}
          maxBudget={suggestionData?.previous_month_spend ? Math.round(suggestionData.previous_month_spend * 2) : undefined}
          actionSlot={
            <AISuggestionButton
              provider={provider}
              accountId={selectedAccountId}
              onSuggestionApplied={handleSuggestionApplied}
              disabled={isInDemoMode || loading}
            />
          }
        />

        {/* AI Suggestion Details (expandable) */}
        <AISuggestionDetails suggestion={suggestionData} currencySymbol={sym} />

        {/* Cost Trend Chart */}
        <BudgetCostTrend currencySymbol={sym} budgetAmount={budgetValue} />
      </div>
    </Layout>
  );
}
