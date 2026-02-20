import { useCurrencyStore } from '@/hooks/useCurrencyConversion';
import { useTranslation } from 'react-i18next';

interface CurrencyIndicatorProps {
  className?: string;
}

/**
 * Inline indicator that shows "~" when values are converted (estimated).
 * Place before currency values to signal they are approximate.
 */
export function CurrencyIndicator({ className }: CurrencyIndicatorProps) {
  const { isConverted } = useCurrencyStore();
  const { t } = useTranslation();

  if (!isConverted) return null;

  return (
    <span
      className={`text-amber-500 dark:text-amber-400 font-medium ${className ?? ''}`}
      title={t('currency.disclaimer', 'Estimated values based on daily exchange rate')}
    >
      ~
    </span>
  );
}
