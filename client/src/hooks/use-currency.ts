import { useQuery } from '@tanstack/react-query';
import { formatCurrency, formatDecimalCurrency } from '@/lib/format';

/** Returns the current global currency symbol (e.g. "DT", "$", "€"). */
export function useCurrency(): string {
  const { data } = useQuery<{ symbol: string }>({
    queryKey: ['/api/system-currency'],
    staleTime: Infinity,
  });
  return data?.symbol ?? 'DT';
}

/** Returns a formatter for cent-based amounts (divides by 100). */
export function useFormatCurrency() {
  const symbol = useCurrency();
  return (cents: number) => formatCurrency(cents, symbol);
}

/** Returns a formatter for decimal amounts (already in display units, e.g. 12.50). */
export function useFormatDecimalCurrency() {
  const symbol = useCurrency();
  return (amount: number) => formatDecimalCurrency(amount, symbol);
}
