/**
 * Hook that provides currency symbol and conversion function
 * based on the current provider and user's conversion preference.
 * 
 * Drop-in replacement for the pattern:
 *   const sym = getCurrencySymbol(getProviderCurrency(selectedProvider));
 * 
 * Usage:
 *   const { sym, convert, isConverted, disclaimer } = useCurrency();
 *   // Then use: `${sym}${convert(value).toFixed(2)}`
 */

import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { getProviderCurrency } from '@/lib/format-cost';
import { useCurrencyStore } from '@/hooks/useCurrencyConversion';
import { useTranslation } from 'react-i18next';

export function useCurrency() {
  const { t } = useTranslation();
  const { selectedProvider } = useCloudAccount();
  const { isConverted, exchangeRate } = useCurrencyStore();
  const nativeCurrency = getProviderCurrency(selectedProvider);

  const displayCurrency = isConverted
    ? (nativeCurrency === 'USD' ? 'BRL' : 'USD')
    : nativeCurrency;

  const sym = displayCurrency === 'BRL' ? 'R$' : '$';

  const convert = (value: number): number => {
    if (!isConverted || !exchangeRate) return value;
    if (nativeCurrency === 'USD') return value * exchangeRate.usdToBrl;
    if (nativeCurrency === 'BRL') return value * exchangeRate.brlToUsd;
    return value;
  };

  const disclaimer = isConverted
    ? t('currency.disclaimer', 'Estimated values based on daily exchange rate')
    : '';

  return { sym, convert, isConverted, displayCurrency, nativeCurrency, disclaimer, exchangeRate };
}
