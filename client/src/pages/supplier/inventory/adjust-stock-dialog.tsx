import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { InventoryItem, InventoryVariantItem } from "@shared/schema";

const REASONS = ["Restock", "Damaged goods", "Manual recount", "Sample given out", "Correction", "Other"];

/**
 * Adjusts stock for either the listing as a whole (non-variant products) or a single
 * variant (pass `variant`). Both hit their own dedicated endpoint but share this UI.
 */
export function AdjustStockDialog({ item, variant, onClose }: { item: InventoryItem; variant?: InventoryVariantItem; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<"INCREASE" | "DECREASE" | "SET">("INCREASE");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState("");

  const currentStock = variant ? variant.stock : item.stock;
  const unit = variant ? variant.unit : item.unit;
  const title = variant ? `Adjust Stock — ${item.productName} (${variant.variantName})` : `Adjust Stock — ${item.productName}`;
  const endpoint = variant
    ? `/api/supplier/inventory/${item.listingId}/variants/${variant.variantId}/stock`
    : `/api/supplier/inventory/${item.listingId}/stock`;

  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", endpoint, {
      type, quantity: Number(quantity), reason, notes: notes.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/inventory"] });
      toast({ title: "Stock updated" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Couldn't update stock", description: err?.message, variant: "destructive" }),
  });

  const qty = Number(quantity) || 0;
  const preview = type === "INCREASE" ? currentStock + qty : type === "DECREASE" ? Math.max(0, currentStock - qty) : qty;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="dialog-adjust-stock">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm bg-secondary/40 rounded-lg p-3">
            <span className="text-muted-foreground">Current stock</span>
            <span className="font-semibold">{currentStock} {unit}</span>
          </div>
          {variant?.maxStock != null && (
            <p className="text-xs text-muted-foreground -mt-2">Maximum stock for this variant: {variant.maxStock} {unit}</p>
          )}

          <div className="space-y-1.5">
            <Label>Adjustment type</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger data-testid="select-adjustment-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INCREASE">Increase (+)</SelectItem>
                <SelectItem value="DECREASE">Decrease (−)</SelectItem>
                <SelectItem value="SET">Set exact quantity</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{type === "SET" ? "New quantity" : "Quantity"}</Label>
            <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" data-testid="input-adjustment-quantity" />
          </div>

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger data-testid="select-adjustment-reason"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any extra context..." data-testid="textarea-adjustment-notes" />
          </div>

          <div className="flex items-center justify-between text-sm bg-primary/5 rounded-lg p-3">
            <span className="text-muted-foreground">New stock will be</span>
            <span className="font-semibold">{preview} {unit}</span>
          </div>
          {variant?.maxStock != null && preview > variant.maxStock && (
            <p className="text-xs text-destructive">This exceeds the variant's maximum stock ({variant.maxStock} {unit}) and will be rejected.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !quantity || Number(quantity) < 0}
            data-testid="button-confirm-adjustment"
          >
            {mutation.isPending ? "Saving..." : "Save Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
