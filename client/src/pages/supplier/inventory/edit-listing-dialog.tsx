import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { InventoryItem } from "@shared/schema";

export function EditListingDialog({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sku, setSku] = useState(item.sku ?? "");
  const [barcode, setBarcode] = useState(item.barcode ?? "");
  const [minStock, setMinStock] = useState(String(item.minStock));
  const [maxStock, setMaxStock] = useState(item.maxStock != null ? String(item.maxStock) : "");
  const [unit, setUnit] = useState(item.unit);

  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/supplier/inventory/${item.listingId}`, {
      sku: sku.trim() || null,
      barcode: barcode.trim() || null,
      minStock: Number(minStock) || 0,
      maxStock: maxStock.trim() ? Number(maxStock) : null,
      unit: unit.trim() || "unit",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/inventory"] });
      toast({ title: "Product details updated" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Couldn't save changes", description: err?.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="dialog-edit-listing">
        <DialogHeader>
          <DialogTitle>Edit Inventory Details — {item.productName}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5 col-span-2">
            <Label>SKU</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. ESP-1KG-001" data-testid="input-sku" />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Barcode</Label>
            <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="e.g. 6291041500213" data-testid="input-barcode" />
          </div>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-listing-details">
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
