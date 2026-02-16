import { getCurrencyFlag, getCurrencySymbol, getProviderCurrency } from '@/lib/format-cost';
import { useCloudAccount } from '@/contexts/CloudAccountContext';

/**
 * Tiny inline flag indicator next to currency values.
 * Shows 🇧🇷 for BRL (Azure) and 🇺🇸 for USD (AWS).
 */
export function CurrencyIndicator({ className }: { className?: string }) {
  const { selectedProvider } = useCloudAccount();
  const currency = getProviderCurrency(selectedProvider);
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

/**
 * Standalone flag component that accepts currency directly (for components
 * that don't use useCloudAccount context).
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
