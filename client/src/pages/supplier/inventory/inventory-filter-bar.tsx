import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X, Download } from "lucide-react";
import type { CategoryWithCount, BrandWithCount, InventoryFilters, InventorySort } from "@shared/schema";

export type InventoryFilterState = InventoryFilters & { sort: InventorySort };

export const EMPTY_INVENTORY_FILTERS: InventoryFilterState = { search: "", sort: "name_asc" };

const SORT_OPTIONS: { value: InventorySort; label: string }[] = [
  { value: "name_asc", label: "Nom (A–Z)" },
  { value: "name_desc", label: "Nom (Z–A)" },
  { value: "stock_asc", label: "Stock (croissant)" },
  { value: "stock_desc", label: "Stock (décroissant)" },
  { value: "price_asc", label: "Prix (croissant)" },
  { value: "price_desc", label: "Prix (décroissant)" },
  { value: "updated_desc", label: "Récemment modifiés" },
  { value: "created_desc", label: "Récemment ajoutés" },
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
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pb-0 sm:mb-0" style={{ scrollbarWidth: "none" }}>
      <div className="relative shrink-0 sm:flex-1 sm:min-w-[220px] sm:max-w-sm">
        {!searchOpen && (
          <button
            type="button"
            className="sm:hidden w-9 h-9 flex items-center justify-center rounded-md border border-input text-muted-foreground"
            onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 0); }}
            aria-label="Ouvrir la recherche"
            data-testid="button-open-inventory-search"
          >
            <Search className="w-4 h-4" />
          </button>
        )}
        <div className={`${searchOpen ? "flex" : "hidden"} sm:flex items-center relative w-48 sm:w-auto`}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            className="pl-9"
            placeholder="Rechercher par nom, SKU ou code-barres..."
            value={filters.search ?? ""}
            onChange={(e) => set("search", e.target.value)}
            onBlur={() => { if (!filters.search) setSearchOpen(false); }}
            data-testid="input-search-inventory"
          />
        </div>
      </div>

      <Select value={filters.categoryId ? String(filters.categoryId) : "__all__"} onValueChange={(v) => set("categoryId", v === "__all__" ? undefined : Number(v))}>
        <SelectTrigger className="w-[150px] shrink-0" data-testid="select-filter-category"><SelectValue placeholder="Catégorie" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Toutes les catégories</SelectItem>
          {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.brandId ? String(filters.brandId) : "__all__"} onValueChange={(v) => set("brandId", v === "__all__" ? undefined : Number(v))}>
        <SelectTrigger className="w-[140px] shrink-0" data-testid="select-filter-brand"><SelectValue placeholder="Marque" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Toutes les marques</SelectItem>
          {brands.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.status ?? "__all__"} onValueChange={(v) => set("status", v === "__all__" ? undefined : (v as any))}>
        <SelectTrigger className="w-[130px] shrink-0" data-testid="select-filter-status"><SelectValue placeholder="Statut" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Tous les statuts</SelectItem>
          <SelectItem value="ACTIVE">Actif</SelectItem>
          <SelectItem value="HIDDEN">Masqué</SelectItem>
          <SelectItem value="DRAFT">Brouillon</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.stockStatus ?? "__all__"} onValueChange={(v) => set("stockStatus", v === "__all__" ? undefined : (v as any))}>
        <SelectTrigger className="w-[150px] shrink-0" data-testid="select-filter-stock-status"><SelectValue placeholder="Niveau de stock" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Tous les niveaux de stock</SelectItem>
          <SelectItem value="IN_STOCK">En stock</SelectItem>
          <SelectItem value="LOW_STOCK">Stock faible</SelectItem>
          <SelectItem value="OUT_OF_STOCK">Rupture de stock</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.sort} onValueChange={(v) => set("sort", v as InventorySort)}>
        <SelectTrigger className="w-[170px] shrink-0" data-testid="select-sort"><SelectValue placeholder="Trier" /></SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={onClear} className="text-muted-foreground" data-testid="button-clear-inventory-filters">
            <X className="w-4 h-4 mr-1" />Effacer
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onExport} data-testid="button-export-inventory">
          <Download className="w-4 h-4 mr-1.5" />Exporter en CSV
        </Button>
      </div>
    </div>
  );
}
