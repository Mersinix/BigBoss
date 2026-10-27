// Global formatting rule for every monetary price in the app: amount first,
// exactly 3 decimal digits, a space, then the configured currency symbol on
// the right (e.g. "230.000 DT", "230.000 د.ت"). The symbol itself always
// comes from the Global Currency setting (useCurrency/useFormatCurrency) —
// never hardcoded — this function only controls position/precision.
export function formatCurrency(cents: number, symbol = 'DT'): string {
  return `${(cents / 100).toFixed(3)} ${symbol}`;
}

export function formatDecimalCurrency(amount: number, symbol = 'DT'): string {
  return `${amount.toFixed(3)} ${symbol}`;
}

export function formatDate(dateString: string | Date): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
