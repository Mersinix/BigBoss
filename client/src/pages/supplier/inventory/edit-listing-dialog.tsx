import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { InventoryItem, InventoryVariantItem } from "@shared/schema";

type VariantDraft = { stock: string; minStock: string; maxStock: string };

export function EditListingDialog({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sku, setSku] = useState(item.sku ?? "");
  const [barcode, setBarcode] = useState(item.barcode ?? "");
  // Listing-level fields — only used/sent when this product has no variants.
  const [minStock, setMinStock] = useState(String(item.minStock));
  const [maxStock, setMaxStock] = useState(item.maxStock != null ? String(item.maxStock) : "");
  const [unit, setUnit] = useState(item.unit);

  // Per-variant drafts, keyed by variantId — only used/sent when this product has variants.
  const [variantDrafts, setVariantDrafts] = useState<Record<number, VariantDraft>>(() => {
    const initial: Record<number, VariantDraft> = {};
    for (const v of item.variants) {
      initial[v.variantId] = {
        stock: String(v.stock),
        minStock: v.minStock != null ? String(v.minStock) : "",
        maxStock: v.maxStock != null ? String(v.maxStock) : "",
      };
    }
    return initial;
  });

  const updateVariantDraft = (variantId: number, field: keyof VariantDraft, value: string) => {
    setVariantDrafts((prev) => ({ ...prev, [variantId]: { ...prev[variantId], [field]: value } }));
  };

  const hasVariants = item.variants.length > 0;

  const maxStockExceeded = (v: InventoryVariantItem) => {
    const draft = variantDrafts[v.variantId];
    if (!draft) return false;
    const max = draft.maxStock.trim() ? Number(draft.maxStock) : null;
    const stock = Number(draft.stock) || 0;
    return max != null && stock > max;
  };

  const anyVariantInvalid = hasVariants && item.variants.some((v) => maxStockExceeded(v));

  const mutation = useMutation({
    mutationFn: async () => {
      // SKU/Barcode always live on the listing.
      const listingBody: Record<string, unknown> = {
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
      };
      if (!hasVariants) {
        listingBody.minStock = Number(minStock) || 0;
        listingBody.maxStock = maxStock.trim() ? Number(maxStock) : null;
        listingBody.unit = unit.trim() || "unit";
      }
      await apiRequest("PATCH", `/api/supplier/inventory/${item.listingId}`, listingBody);

      if (hasVariants) {
        for (const v of item.variants) {
          const draft = variantDrafts[v.variantId];
          if (!draft) continue;
          const newStock = Number(draft.stock) || 0;
          const newMin = draft.minStock.trim() ? Number(draft.minStock) : null;
          const newMax = draft.maxStock.trim() ? Number(draft.maxStock) : null;
          const stockChanged = newStock !== v.stock;
          const limitsChanged = newMin !== (v.minStock ?? null) || newMax !== (v.maxStock ?? null);
          if (!stockChanged && !limitsChanged) continue; // only PATCH modified variants

          if (limitsChanged) {
            await apiRequest("PATCH", `/api/supplier/inventory/${item.listingId}/variants/${v.variantId}`, {
              minStock: newMin, maxStock: newMax,
            });
          }
          if (stockChanged) {
            await apiRequest("PATCH", `/api/supplier/inventory/${item.listingId}/variants/${v.variantId}/stock`, {
              type: "SET", quantity: newStock, reason: "Edited from Inventory Details",
            });
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/inventory"] });
      toast({ title: "Product details updated" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Couldn't save changes", description: err?.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={hasVariants ? "max-w-2xl" : undefined} data-testid="dialog-edit-listing">
        <DialogHeader>
          <DialogTitle>Edit Inventory Details — {item.productName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto space-y-4 pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>SKU</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. ESP-1KG-001" data-testid="input-sku" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Barcode</Label>
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="e.g. 6291041500213" data-testid="input-barcode" />
            </div>

            {!hasVariants && (
              <>
                <div className="space-y-1.5">
                  <Label>Stock quantity</Label>
                  <Input type="number" min={0} value={minStock === "" ? "" : undefined} disabled placeholder="Use Adjust Stock" data-testid="input-stock-disabled-hint" />
                </div>
                <div />
                <div className="space-y-1.5">
                  <Label>Minimum stock</Label>
                  <Input type="number" min={0} value={minStock} onChange={(e) => setMinStock(e.target.value)} data-testid="input-min-stock" />
                </div>
                <div className="space-y-1.5">
                  <Label>Maximum stock</Label>
                  <Input type="number" min={0} value={maxStock} onChange={(e) => setMaxStock(e.target.value)} placeholder="Optional" data-testid="input-max-stock" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Unit of measure</Label>
                  <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit, kg, box, case..." data-testid="input-unit" />
                </div>
              </>
            )}
          </div>

          {hasVariants && (
            <div className="space-y-3">
              <Label className="text-sm">Per-variant inventory</Label>
              {item.variants.map((v) => {
                const draft = variantDrafts[v.variantId];
                const invalid = maxStockExceeded(v);
                return (
                  <div key={v.variantId} className="border rounded-lg p-3 space-y-2" data-testid={`edit-variant-row-${v.variantId}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{v.variantName}</p>
                      <span className="text-xs text-muted-foreground">Unit: {v.unit}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Stock quantity</Label>
                        <Input
                          type="number" min={0}
                          value={draft?.stock ?? ""}
                          onChange={(e) => updateVariantDraft(v.variantId, "stock", e.target.value)}
                          className={invalid ? "border-destructive" : undefined}
                          data-testid={`input-variant-stock-${v.variantId}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Min stock</Label>
                        <Input
                          type="number" min={0}
                          value={draft?.minStock ?? ""}
                          onChange={(e) => updateVariantDraft(v.variantId, "minStock", e.target.value)}
                          placeholder="Optional"
                          data-testid={`input-variant-min-${v.variantId}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max stock</Label>
                        <Input
                          type="number" min={0}
                          value={draft?.maxStock ?? ""}
                          onChange={(e) => updateVariantDraft(v.variantId, "maxStock", e.target.value)}
                          placeholder="Optional"
                          data-testid={`input-variant-max-${v.variantId}`}
                        />
                      </div>
                    </div>
                    {invalid && <p className="text-xs text-destructive">Stock quantity cannot exceed the maximum stock for this variant.</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || anyVariantInvalid} data-testid="button-save-listing-details">
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
