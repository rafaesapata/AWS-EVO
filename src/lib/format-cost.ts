/**
 * Currency formatting utility for multi-cloud cost display.
 * AWS returns costs in USD, Azure returns in BRL.
 */

const currencyConfig: Record<string, { symbol: string; locale: string; code: string; flag: string }> = {
  USD: { symbol: '$', locale: 'en-US', code: 'USD', flag: '🇺🇸' },
  BRL: { symbol: 'R$', locale: 'pt-BR', code: 'BRL', flag: '🇧🇷' },
};

/**
 * Format a cost value with the appropriate currency symbol.
 */
export function formatCost(value: number, currency: string = 'USD', decimals: number = 2): string {
  const config = currencyConfig[currency] || currencyConfig.USD;
  return `${config.symbol}${value.toFixed(decimals)}`;
}

/**
 * Get the currency symbol for a provider or currency code.
 */
export function getCurrencySymbol(currency: string = 'USD'): string {
  return currencyConfig[currency]?.symbol || '$';
}

/**
 * Get the flag emoji for a currency code.
 */
export function getCurrencyFlag(currency: string = 'USD'): string {
  return currencyConfig[currency]?.flag || '🇺🇸';
}

/**
 * Determine the default currency for a cloud provider.
 */
export function getProviderCurrency(provider: string | undefined): string {
  return provider === 'AZURE' ? 'BRL' : 'USD';
}
