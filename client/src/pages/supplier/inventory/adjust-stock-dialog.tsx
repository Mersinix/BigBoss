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
import type { InventoryItem } from "@shared/schema";

const REASONS = ["Restock", "Damaged goods", "Manual recount", "Sample given out", "Correction", "Other"];

export function AdjustStockDialog({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<"INCREASE" | "DECREASE" | "SET">("INCREASE");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/supplier/inventory/${item.listingId}/stock`, {
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
  const preview = type === "INCREASE" ? item.stock + qty : type === "DECREASE" ? Math.max(0, item.stock - qty) : qty;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="dialog-adjust-stock">
        <DialogHeader>
          <DialogTitle>Adjust Stock — {item.productName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm bg-secondary/40 rounded-lg p-3">
            <span className="text-muted-foreground">Current stock</span>
            <span className="font-semibold">{item.stock} {item.unit}</span>
          </div>

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
            <span className="font-semibold">{preview} {item.unit}</span>
          </div>
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
