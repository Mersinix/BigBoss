import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/format";
import { ChevronLeft, ChevronRight, EyeOff, Eye, Trash2, X } from "lucide-react";
import type { InventoryStats, InventoryListResult, InventoryItem, InventoryVariantItem, CategoryWithCount, BrandWithCount } from "@shared/schema";
import { InventoryStatsCards } from "./inventory/inventory-stats-cards";
import { InventoryFilterBar, EMPTY_INVENTORY_FILTERS, type InventoryFilterState } from "./inventory/inventory-filter-bar";
import { InventoryTable } from "./inventory/inventory-table";
import { AdjustStockDialog } from "./inventory/adjust-stock-dialog";
import { StockHistoryDialog } from "./inventory/stock-history-dialog";
import { EditListingDialog } from "./inventory/edit-listing-dialog";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

function buildQueryString(filters: InventoryFilterState, extra?: Record<string, string | number>) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.categoryId) params.set("categoryId", String(filters.categoryId));
  if (filters.brandId) params.set("brandId", String(filters.brandId));
  if (filters.status) params.set("status", filters.status);
  if (filters.stockStatus) params.set("stockStatus", filters.stockStatus);
  if (filters.sort) params.set("sort", filters.sort);
  if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  return params.toString();
}

export default function InventoryPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<InventoryFilterState>(EMPTY_INVENTORY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustVariant, setAdjustVariant] = useState<{ item: InventoryItem; variant: InventoryVariantItem } | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);

  const hasActiveFilters = !!(filters.search || filters.categoryId || filters.brandId || filters.status || filters.stockStatus);

  const { data: categories = [] } = useQuery<CategoryWithCount[]>({ queryKey: ["/api/categories"] });
  const { data: brands = [] } = useQuery<BrandWithCount[]>({ queryKey: ["/api/brands"] });

  const { data: stats, isLoading: statsLoading } = useQuery<InventoryStats>({
    queryKey: ["/api/supplier/inventory/stats"],
    queryFn: async () => {
      const res = await fetch("/api/supplier/inventory/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
  });

  const filteredQs = buildQueryString(filters);
  const { data: filteredStats } = useQuery<InventoryStats>({
    queryKey: ["/api/supplier/inventory/stats", filteredQs],
    queryFn: async () => {
      const res = await fetch(`/api/supplier/inventory/stats?${filteredQs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
    enabled: hasActiveFilters,
  });

  const listQs = buildQueryString(filters, { page, pageSize });
  const { data: listResult, isLoading: listLoading } = useQuery<InventoryListResult>({
    queryKey: ["/api/supplier/inventory", listQs],
    queryFn: async () => {
      const res = await fetch(`/api/supplier/inventory?${listQs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load inventory");
      return res.json();
    },
  });

  const items = listResult?.items ?? [];
  const total = listResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const bulkMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/supplier/inventory/bulk", body),
    onSuccess: (_, body) => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/inventory"] });
      toast({ title: `Updated ${selectedIds.size} product${selectedIds.size === 1 ? "" : "s"}` });
      setSelectedIds(new Set());
    },
    onError: (err: any) => toast({ title: "Bulk action failed", description: err?.message, variant: "destructive" }),
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ listingId, visibility }: { listingId: number; visibility: "VISIBLE" | "HIDDEN" }) =>
      apiRequest("PATCH", `/api/supplier/inventory/${listingId}`, { visibility }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/inventory"] });
      toast({ title: "Visibility updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (listingId: number) => apiRequest("POST", "/api/supplier/inventory/bulk", { action: "delete", listingIds: [listingId] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/inventory"] });
      toast({ title: "Product removed from inventory" });
    },
  });

  const handleChangeFilters = (f: InventoryFilterState) => { setFilters(f); setPage(1); };
  const handleClearFilters = () => { setFilters(EMPTY_INVENTORY_FILTERS); setPage(1); };

  const handleExport = () => {
    const qs = buildQueryString(filters);
    window.open(`/api/supplier/inventory/export?${qs}`, "_blank");
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (items.every((i) => prev.has(i.listingId))) return new Set();
      return new Set(items.map((i) => i.listingId));
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track stock levels, adjust quantities, and manage product visibility in real time.</p>
      </div>

      <InventoryStatsCards stats={stats} isLoading={statsLoading} />

      <Card>
        <CardContent className="p-4 space-y-4">
          <InventoryFilterBar
            filters={filters}
            onChange={handleChangeFilters}
            categories={categories}
            brands={brands}
            onExport={handleExport}
            hasActiveFilters={hasActiveFilters}
            onClear={handleClearFilters}
          />

          {hasActiveFilters && filteredStats && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-3" data-testid="filtered-totals">
              <span>Filtered results: <strong className="text-foreground">{filteredStats.totalProducts}</strong> products</span>
              <span>Filtered units: <strong className="text-foreground">{filteredStats.totalUnits.toLocaleString()}</strong></span>
              <span>Filtered value: <strong className="text-foreground">{formatCurrency(filteredStats.inventoryValue)}</strong></span>
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg p-2.5" data-testid="bulk-action-bar">
              <span className="text-sm font-medium px-1">{selectedIds.size} selected</span>
              <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ action: "hide", listingIds: Array.from(selectedIds) })} data-testid="button-bulk-hide">
                <EyeOff className="w-3.5 h-3.5 mr-1.5" />Hide
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkMutation.mutate({ action: "show", listingIds: Array.from(selectedIds) })} data-testid="button-bulk-show">
                <Eye className="w-3.5 h-3.5 mr-1.5" />Show
              </Button>
              <Button
                size="sm" variant="outline" className="text-destructive hover:text-destructive"
                onClick={() => { if (confirm(`Remove ${selectedIds.size} product(s) from your inventory?`)) bulkMutation.mutate({ action: "delete", listingIds: Array.from(selectedIds) }); }}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />Remove
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelectedIds(new Set())} data-testid="button-clear-selection">
                <X className="w-3.5 h-3.5 mr-1" />Clear selection
              </Button>
            </div>
          )}

          <InventoryTable
            items={items}
            isLoading={listLoading}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onAdjust={setAdjustItem}
            onAdjustVariant={(item, variant) => setAdjustVariant({ item, variant })}
            onHistory={setHistoryItem}
            onEdit={setEditItem}
            onToggleVisibility={(item) => visibilityMutation.mutate({ listingId: item.listingId, visibility: item.visibility === "VISIBLE" ? "HIDDEN" : "VISIBLE" })}
            onDelete={(item) => { if (confirm(`Remove "${item.productName}" from your inventory?`)) deleteMutation.mutate(item.listingId); }}
          />

          <div className="flex items-center justify-between flex-wrap gap-3 border-t pt-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Showing {items.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total}</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-[100px] h-8" data-testid="select-page-size"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((s) => <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="button-prev-page">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm px-2">Page {page} of {totalPages}</span>
              <Button size="icon" variant="outline" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} data-testid="button-next-page">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {adjustItem && <AdjustStockDialog item={adjustItem} onClose={() => setAdjustItem(null)} />}
      {adjustVariant && <AdjustStockDialog item={adjustVariant.item} variant={adjustVariant.variant} onClose={() => setAdjustVariant(null)} />}
      {historyItem && <StockHistoryDialog item={historyItem} onClose={() => setHistoryItem(null)} />}
      {editItem && <EditListingDialog item={editItem} onClose={() => setEditItem(null)} />}
    </div>
  );
}
