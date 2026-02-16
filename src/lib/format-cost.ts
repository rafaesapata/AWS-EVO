/**
 * Currency formatting utility for multi-cloud cost display.
 * AWS returns costs in USD, Azure returns in BRL.
 */

const currencyConfig: Record<string, { symbol: string; locale: string; code: string }> = {
  USD: { symbol: '$', locale: 'en-US', code: 'USD' },
  BRL: { symbol: 'R$', locale: 'pt-BR', code: 'BRL' },
};

/**
 * Format a cost value with the appropriate currency symbol.
 * @param value - The numeric cost value
 * @param currency - Currency code ('USD' | 'BRL'), defaults to 'USD'
 * @param decimals - Number of decimal places (default: 2)
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
 * Determine the default currency for a cloud provider.
 */
export function getProviderCurrency(provider: string | undefined): string {
  return provider === 'AZURE' ? 'BRL' : 'USD';
}
