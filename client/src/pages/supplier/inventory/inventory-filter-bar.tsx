import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X, Download } from "lucide-react";
import type { CategoryWithCount, BrandWithCount, InventoryFilters, InventorySort } from "@shared/schema";

export type InventoryFilterState = InventoryFilters & { sort: InventorySort };

export const EMPTY_INVENTORY_FILTERS: InventoryFilterState = { search: "", sort: "name_asc" };

const SORT_OPTIONS: { value: InventorySort; label: string }[] = [
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "stock_asc", label: "Stock (Low–High)" },
  { value: "stock_desc", label: "Stock (High–Low)" },
  { value: "price_asc", label: "Price (Low–High)" },
  { value: "price_desc", label: "Price (High–Low)" },
  { value: "updated_desc", label: "Recently Updated" },
  { value: "created_desc", label: "Recently Added" },
];

export function InventoryFilterBar({
  filters, onChange, categories, brands, onExport, hasActiveFilters, onClear,
}: {
  filters: InventoryFilterState;
  onChange: (f: InventoryFilterState) => void;
  categories: CategoryWithCount[];
  brands: BrandWithCount[];
  onExport: () => void;
  hasActiveFilters: boolean;
  onClear: () => void;
}) {
  const set = <K extends keyof InventoryFilterState>(key: K, value: InventoryFilterState[K]) => onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[220px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, SKU, or barcode..."
          value={filters.search ?? ""}
          onChange={(e) => set("search", e.target.value)}
          data-testid="input-search-inventory"
        />
      </div>

      <Select value={filters.categoryId ? String(filters.categoryId) : "__all__"} onValueChange={(v) => set("categoryId", v === "__all__" ? undefined : Number(v))}>
        <SelectTrigger className="w-[150px]" data-testid="select-filter-category"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Categories</SelectItem>
          {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.brandId ? String(filters.brandId) : "__all__"} onValueChange={(v) => set("brandId", v === "__all__" ? undefined : Number(v))}>
        <SelectTrigger className="w-[140px]" data-testid="select-filter-brand"><SelectValue placeholder="Brand" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Brands</SelectItem>
          {brands.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.status ?? "__all__"} onValueChange={(v) => set("status", v === "__all__" ? undefined : (v as any))}>
        <SelectTrigger className="w-[130px]" data-testid="select-filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Status</SelectItem>
          <SelectItem value="ACTIVE">Active</SelectItem>
          <SelectItem value="HIDDEN">Hidden</SelectItem>
          <SelectItem value="DRAFT">Draft</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.stockStatus ?? "__all__"} onValueChange={(v) => set("stockStatus", v === "__all__" ? undefined : (v as any))}>
        <SelectTrigger className="w-[150px]" data-testid="select-filter-stock-status"><SelectValue placeholder="Stock Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Stock</SelectItem>
          <SelectItem value="IN_STOCK">In Stock</SelectItem>
          <SelectItem value="LOW_STOCK">Low Stock</SelectItem>
          <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.sort} onValueChange={(v) => set("sort", v as InventorySort)}>
        <SelectTrigger className="w-[170px]" data-testid="select-sort"><SelectValue placeholder="Sort" /></SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2 ml-auto">
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground" data-testid="button-clear-inventory-filters">
            <X className="w-4 h-4 mr-1" />Clear
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onExport} data-testid="button-export-inventory">
          <Download className="w-4 h-4 mr-1.5" />Export CSV
        </Button>
      </div>
    </div>
  );
}
