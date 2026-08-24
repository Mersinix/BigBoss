import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Reused across Supplier Payouts/Invoices and Admin Payouts/Invoices so the filter row
// looks and behaves identically everywhere — matches the filter-bar pattern already
// established in pages/shared/orders-page.tsx (Select + icon Inputs + date Inputs + clear
// button), just parameterized instead of copy-pasted four times.

export type FinancialFiltersState = {
  search: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  supplierId: string;
};

export const DEFAULT_FINANCIAL_FILTERS: FinancialFiltersState = {
  search: "", status: "ALL", dateFrom: "", dateTo: "", amountMin: "", amountMax: "", supplierId: "ALL",
};

export function isFinancialFiltersActive(f: FinancialFiltersState): boolean {
  return f.search !== "" || f.status !== "ALL" || f.dateFrom !== "" || f.dateTo !== ""
    || f.amountMin !== "" || f.amountMax !== "" || f.supplierId !== "ALL";
}

export function FinancialFilterBar({
  filters,
  onChange,
  statusOptions,
  searchPlaceholder,
  supplierOptions,
}: {
  filters: FinancialFiltersState;
  onChange: (next: FinancialFiltersState) => void;
  statusOptions: { value: string; label: string }[];
  searchPlaceholder: string;
  /** Admin-only: filter by supplier. Omit for Supplier's own pages (already self-scoped). */
  supplierOptions?: { value: string; label: string }[];
}) {
  const set = (patch: Partial<FinancialFiltersState>) => onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          className="pl-9 w-44"
          data-testid="input-financial-search"
        />
      </div>

      <Select value={filters.status} onValueChange={(v) => set({ status: v })}>
        <SelectTrigger className="w-40" data-testid="select-financial-status"><SelectValue placeholder="Statut" /></SelectTrigger>
        <SelectContent>
          {statusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {supplierOptions && (
        <Select value={filters.supplierId} onValueChange={(v) => set({ supplierId: v })}>
          <SelectTrigger className="w-44" data-testid="select-financial-supplier"><SelectValue placeholder="Fournisseur" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les fournisseurs</SelectItem>
            {supplierOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => set({ dateFrom: e.target.value })}
          className="w-[9.5rem]"
          title="Du"
          data-testid="input-financial-date-from"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(e) => set({ dateTo: e.target.value })}
          className="w-[9.5rem]"
          title="Au"
          data-testid="input-financial-date-to"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          inputMode="decimal"
          placeholder="Min"
          value={filters.amountMin}
          onChange={(e) => set({ amountMin: e.target.value })}
          className="w-20"
          data-testid="input-financial-amount-min"
        />
        <span className="text-xs text-muted-foreground">—</span>
        <Input
          type="number"
          inputMode="decimal"
          placeholder="Max"
          value={filters.amountMax}
          onChange={(e) => set({ amountMax: e.target.value })}
          className="w-20"
          data-testid="input-financial-amount-max"
        />
      </div>

      {isFinancialFiltersActive(filters) && (
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => onChange(DEFAULT_FINANCIAL_FILTERS)}>
          <X className="w-3.5 h-3.5" /> Effacer
        </Button>
      )}
    </div>
  );
}

/** Shared filtering logic so every Payouts/Invoices page applies filters identically. */
export function applyFinancialFilters<T extends {
  supplierId: number; supplierName: string; cafeName: string; createdAt: string | Date | null;
  subOrderStatus: string; payoutStatus?: string; subtotal: number; netAmount?: number;
}>(rows: T[], filters: FinancialFiltersState, opts?: { statusField?: "subOrderStatus" | "payoutStatus"; amountField?: "subtotal" | "netAmount" }): T[] {
  const statusField = opts?.statusField ?? "subOrderStatus";
  const amountField = opts?.amountField ?? "subtotal";
  const search = filters.search.trim().toLowerCase();
  const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const to = filters.dateTo ? new Date(filters.dateTo) : null;
  const min = filters.amountMin !== "" ? Number(filters.amountMin) * 100 : null;
  const max = filters.amountMax !== "" ? Number(filters.amountMax) * 100 : null;

  return rows.filter((r) => {
    if (filters.status !== "ALL" && (r as any)[statusField] !== filters.status) return false;
    if (filters.supplierId !== "ALL" && String(r.supplierId) !== filters.supplierId) return false;
    if (search && !(r.supplierName.toLowerCase().includes(search) || r.cafeName.toLowerCase().includes(search))) return false;
    if (r.createdAt) {
      const d = new Date(r.createdAt as any);
      if (from && d < from) return false;
      if (to) { const toEnd = new Date(to); toEnd.setHours(23, 59, 59, 999); if (d > toEnd) return false; }
    }
    const amount = (r as any)[amountField] as number;
    if (min != null && amount < min) return false;
    if (max != null && amount > max) return false;
    return true;
  });
}
