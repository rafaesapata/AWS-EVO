import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { useCurrencyStore } from '@/hooks/useCurrencyConversion';
import { useCloudAccount } from '@/contexts/CloudAccountContext';
import { getProviderCurrency } from '@/lib/format-cost';

/**
 * Currency toggle button for the header.
 * Shows the current display currency flag and allows switching.
 * AWS users see 🇺🇸→🇧🇷, Azure users see 🇧🇷→🇺🇸.
 */
export default function CurrencyToggle() {
  const { t } = useTranslation();
  const { isConverted, toggleCurrency, exchangeRate } = useCurrencyStore();
  const { selectedProvider } = useCloudAccount();
  const nativeCurrency = getProviderCurrency(selectedProvider);

  const displayCurrency = isConverted
    ? (nativeCurrency === 'USD' ? 'BRL' : 'USD')
    : nativeCurrency;

  const flag = displayCurrency === 'BRL' ? '🇧🇷' : '🇺🇸';
  const label = displayCurrency === 'BRL' ? 'R$' : '$';

  const rateText = exchangeRate
    ? `1 USD = R$${exchangeRate.usdToBrl.toFixed(2)}`
    : '';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCurrency}
            className="relative group overflow-hidden hover:scale-110 transition-transform"
            aria-label={t('currency.toggle', 'Toggle currency')}
          >
            <span className="text-base leading-none">{flag}</span>
            <span className="absolute bottom-0.5 right-0.5 text-[8px] font-bold opacity-80">
              {label}
            </span>
            <div className="absolute inset-0 bg-gradient-primary opacity-0 group-hover:opacity-10 transition-opacity" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px] text-center">
          <p className="text-xs font-medium">
            {isConverted
              ? t('currency.showingConverted', 'Showing converted values')
              : t('currency.showingNative', 'Showing native values')}
          </p>
          {rateText && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{rateText}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5 italic">
            {t('currency.disclaimer', 'Estimated values based on daily exchange rate')}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
