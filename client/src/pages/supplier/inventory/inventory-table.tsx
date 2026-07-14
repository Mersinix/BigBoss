import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Package, MoreVertical, Plus, History, Pencil, Eye, EyeOff, Trash2, Layers, ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { InventoryItem, InventoryVariantItem, StockStatus } from "@shared/schema";

const STOCK_BADGE: Record<StockStatus, string> = {
  IN_STOCK: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  LOW_STOCK: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  OUT_OF_STOCK: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
};
const STOCK_LABEL: Record<StockStatus, string> = { IN_STOCK: "In Stock", LOW_STOCK: "Low Stock", OUT_OF_STOCK: "Out of Stock" };

export function InventoryTable({
  items, isLoading, selectedIds, onToggleSelect, onToggleSelectAll,
  onAdjust, onAdjustVariant, onHistory, onEdit, onToggleVisibility, onDelete,
}: {
  items: InventoryItem[];
  isLoading: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  onAdjust: (item: InventoryItem) => void;
  onAdjustVariant: (item: InventoryItem, variant: InventoryVariantItem) => void;
  onHistory: (item: InventoryItem) => void;
  onEdit: (item: InventoryItem) => void;
  onToggleVisibility: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.listingId));

  const toggleExpand = (listingId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(listingId)) next.delete(listingId); else next.add(listingId);
      return next;
    });
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading inventory...</div>;
  }
  if (!items.length) {
    return (
      <div className="p-12 flex flex-col items-center gap-3 text-center">
        <Package className="w-10 h-10 text-muted-foreground opacity-40" />
        <div>
          <p className="font-medium">No products match your filters</p>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-secondary/30">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} data-testid="checkbox-select-all" /></TableHead>
            <TableHead>Product</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const isExpanded = expandedIds.has(item.listingId);
            return (
              <>
                {/* ── Product row ── */}
                <TableRow key={item.listingId} className="hover:bg-secondary/20" data-testid={`row-inventory-${item.listingId}`}>
                  <TableCell>
                    <Checkbox checked={selectedIds.has(item.listingId)} onCheckedChange={() => onToggleSelect(item.listingId)} data-testid={`checkbox-select-${item.listingId}`} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-border/50 shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0"><Package className="w-4 h-4 text-muted-foreground" /></div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate max-w-[220px]">{item.productName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {item.hasVariants && (
                            <button
                              onClick={() => toggleExpand(item.listingId)}
                              className="flex items-center gap-0.5 text-[10px] font-medium border border-border/60 rounded px-1.5 py-0 hover:bg-secondary/50 transition-colors"
                              data-testid={`button-expand-variants-${item.listingId}`}
                            >
                              {isExpanded
                                ? <ChevronDown className="w-2.5 h-2.5" />
                                : <ChevronRight className="w-2.5 h-2.5" />}
                              {item.variants.length} Variant{item.variants.length !== 1 ? "s" : ""}
                            </button>
                          )}
                          {item.hasPacks && <Badge variant="outline" className="text-[10px] px-1.5 py-0"><Layers className="w-2.5 h-2.5 mr-0.5" />In Pack</Badge>}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{item.sku || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.categoryName || "—"}</TableCell>
                  <TableCell>
                    {item.hasVariants ? (
                      <span className="text-xs text-muted-foreground italic">See variants ↓</span>
                    ) : (
                      <>
                        <span className={item.stockStatus !== "IN_STOCK" ? "font-semibold" : ""}>
                          {item.stock} {item.unit}
                        </span>
                        <p className="text-xs text-muted-foreground">min {item.minStock}</p>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{formatCurrency(item.price)}</TableCell>
                  <TableCell className="text-sm">{formatCurrency(item.inventoryValue)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant="secondary" className={`${STOCK_BADGE[item.stockStatus]} border-0 w-fit`}>{STOCK_LABEL[item.stockStatus]}</Badge>
                      {item.visibility === "HIDDEN" && <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0">Hidden</Badge>}
                      {item.productStatus === "PENDING" && <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0">Draft</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!item.hasVariants && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Quick adjust stock" onClick={() => onAdjust(item)} data-testid={`button-adjust-${item.listingId}`}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`button-menu-${item.listingId}`}><MoreVertical className="w-3.5 h-3.5" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onHistory(item)} data-testid={`menu-history-${item.listingId}`}><History className="w-3.5 h-3.5 mr-2" />Stock History</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onEdit(item)} data-testid={`menu-edit-${item.listingId}`}><Pencil className="w-3.5 h-3.5 mr-2" />Edit Details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onToggleVisibility(item)} data-testid={`menu-visibility-${item.listingId}`}>
                            {item.visibility === "VISIBLE" ? <><EyeOff className="w-3.5 h-3.5 mr-2" />Hide Product</> : <><Eye className="w-3.5 h-3.5 mr-2" />Show Product</>}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onDelete(item)} className="text-destructive" data-testid={`menu-delete-${item.listingId}`}>
                            <Trash2 className="w-3.5 h-3.5 mr-2" />Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>

                {/* ── Variant sub-rows (shown when expanded) ── */}
                {item.hasVariants && isExpanded && item.variants.map((variant) => (
                  <TableRow
                    key={`${item.listingId}-v${variant.variantId}`}
                    className="bg-secondary/10 hover:bg-secondary/20"
                    data-testid={`row-variant-${variant.variantId}`}
                  >
                    {/* checkbox placeholder — variants are not individually selectable */}
                    <TableCell className="border-l-2 border-l-primary/30" />
                    <TableCell>
                      <div className="flex items-center gap-2 pl-10">
                        <div className="w-0.5 h-5 bg-border/60 rounded-full shrink-0" />
                        <span className="text-sm font-medium">{variant.variantName}</span>
                        <span className="text-xs text-muted-foreground">({variant.unit})</span>
                      </div>
                    </TableCell>
                    <TableCell /> {/* SKU — belongs to listing, not variant */}
                    <TableCell /> {/* Category */}
                    <TableCell>
                      <span className={`text-sm${variant.stockStatus !== "IN_STOCK" ? " font-semibold" : ""}`}>
                        {variant.stock} {variant.unit}
                      </span>
                      {variant.minStock != null && (
                        <p className="text-xs text-muted-foreground">min {variant.minStock}</p>
                      )}
                      {variant.maxStock != null && (
                        <p className="text-xs text-muted-foreground">max {variant.maxStock}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{formatCurrency(variant.price)}</TableCell>
                    <TableCell /> {/* Value — aggregate shown at product level */}
                    <TableCell>
                      <Badge variant="secondary" className={`${STOCK_BADGE[variant.stockStatus]} border-0 w-fit`}>
                        {STOCK_LABEL[variant.stockStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon" variant="ghost" className="h-8 w-8"
                        title={`Adjust stock — ${variant.variantName}`}
                        onClick={() => onAdjustVariant(item, variant)}
                        data-testid={`button-adjust-variant-${variant.variantId}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
