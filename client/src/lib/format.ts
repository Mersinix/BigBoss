export function formatCurrency(cents: number, symbol = 'DT'): string {
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export function formatDecimalCurrency(amount: number, symbol = 'DT'): string {
  return `${symbol}${amount.toFixed(2)}`;
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
