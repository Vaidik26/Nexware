/**
 * Currency exchange rates relative to USD (Base 1.00)
 * Hardcoded as per business requirements.
 */
export const EXCHANGE_RATES: Record<string, number> = {
  USD: 1.00,
  AED: 3.67,
  OMR: 0.3846, // 1 OMR = 2.60 USD -> 1 USD = 0.3846 OMR
};

export type SupportedCurrency = 'USD' | 'AED' | 'OMR';

/**
 * Converts a monetary amount from one currency to another using the hardcoded base rates.
 * 
 * @param amount - The numeric amount to convert
 * @param fromCurrency - The original currency of the amount
 * @param toCurrency - The target currency to convert to
 * @returns The converted amount, or the original amount if currencies match or are unsupported
 */
export function convertCurrency(
  amount: number | null | undefined, 
  fromCurrency: string, 
  toCurrency: string
): number | null {
  if (amount == null) return null;
  if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return amount;

  const rateFrom = EXCHANGE_RATES[fromCurrency.toUpperCase()];
  const rateTo = EXCHANGE_RATES[toCurrency.toUpperCase()];

  if (!rateFrom || !rateTo) {
    return amount; // Fallback if unsupported currency
  }

  // Convert to base (USD), then to target
  const amountInUSD = amount / rateFrom;
  const convertedAmount = amountInUSD * rateTo;

  return Number(convertedAmount.toFixed(2));
}

/**
 * Formats a converted price for display with its currency symbol.
 */
export function formatCurrencyDisplay(amount: number | null | undefined, currency: string): string {
  if (amount == null) return '—';
  
  const formattedAmount = amount.toFixed(2);
  
  switch (currency.toUpperCase()) {
    case 'USD':
      return `$${formattedAmount}`;
    case 'AED':
      return `${formattedAmount} AED`;
    case 'OMR':
      return `${formattedAmount} OMR`;
    default:
      return `${formattedAmount} ${currency}`;
  }
}
