import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiClient } from '@/integrations/aws/api-client';

export interface AISuggestionResponse {
  suggested_amount: number;
  previous_month_spend: number;
  total_proposed_savings: number;
  realization_factor: number;
  savings_breakdown: {
    cost_optimization: number;
    waste_detection: number;
    ri_sp_optimization: number;
  };
  calculation: string;
  data_available: boolean;
}

export interface AISuggestionButtonProps {
  provider: string;
  onSuggestionApplied: (suggestedAmount: number, suggestionData: AISuggestionResponse) => void;
  disabled?: boolean;
}

export function AISuggestionButton({
  provider,
  onSuggestionApplied,
  disabled = false,
}: AISuggestionButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await apiClient.invoke<AISuggestionResponse>('ai-budget-suggestion', {
        body: { provider },
      });

      if (res.error) {
        toast.error(t('budgetManagement.aiSuggestionError', 'Erro ao obter sugestão IA'));
        return;
      }

      const data = res.data as AISuggestionResponse;

      if (!data.data_available) {
        toast.warning(
          t('budgetManagement.aiNoData', 'Dados insuficientes para calcular sugestão. Aguarde dados do mês anterior.'),
        );
        return;
      }

      onSuggestionApplied(data.suggested_amount, data);
      toast.success(
        t('budgetManagement.aiSuggestionApplied', 'Sugestão IA aplicada: ${{amount}}', {
          amount: data.suggested_amount.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        }),
      );
    } catch {
      toast.error(t('budgetManagement.aiSuggestionError', 'Erro ao obter sugestão IA'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      className="glass hover-glow"
      onClick={handleClick}
      disabled={disabled || loading}
      aria-label={t('budgetManagement.aiSuggestionLabel', 'Obter sugestão de orçamento por IA')}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4 mr-2" />
      )}
      {t('budgetManagement.aiSuggestion', 'Sugestão IA')}
    </Button>
  );
}
