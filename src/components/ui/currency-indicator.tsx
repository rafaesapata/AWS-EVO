import { getCurrencyFlag } from '@/lib/format-cost';
import { getProviderCurrency } from '@/lib/format-cost';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { useCurrencyStore } from '@/hooks/useCurrencyConversion';
import { useTranslation } from 'react-i18next';

/**
 * Tiny inline flag indicator next to currency values.
 * Reflects the current conversion state (native or converted).
 */
export function CurrencyIndicator({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { selectedProvider } = useCloudAccount();
  const { isConverted } = useCurrencyStore();
  const nativeCurrency = getProviderCurrency(selectedProvider);
  const displayCurrency = isConverted
    ? (nativeCurrency === 'USD' ? 'BRL' : 'USD')
    : nativeCurrency;
  const flag = getCurrencyFlag(displayCurrency);

  return (
    <span
      className={`inline-flex items-center text-[10px] leading-none opacity-70 ${className || ''}`}
      title={displayCurrency === 'BRL' ? 'Real Brasileiro (R$)' : 'US Dollar ($)'}
      aria-label={displayCurrency === 'BRL' ? 'Real Brasileiro' : 'US Dollar'}
    >
      {flag}
      {isConverted && (
        <span className="ml-0.5 text-[8px] text-amber-500" title={t('currency.disclaimer', 'Estimated values based on daily exchange rate')}>
          ~
        </span>
      )}
    </span>
  );
}

/**
 * Standalone flag component that accepts currency directly.
 */
export function CurrencyFlag({ currency = 'USD', className }: { currency?: string; className?: string }) {
  const flag = getCurrencyFlag(currency);

  return (
    <span
      className={`inline-flex items-center text-[10px] leading-none opacity-70 ${className || ''}`}
      title={currency === 'BRL' ? 'Real Brasileiro (R$)' : 'US Dollar ($)'}
      aria-label={currency === 'BRL' ? 'Real Brasileiro' : 'US Dollar'}
    >
      {flag}
    </span>
  );
}
