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
import { X } from "lucide-react";
import type { InventoryItem, InventoryVariantItem } from "@shared/schema";

const REASONS = ["Réapprovisionnement", "Marchandise endommagée", "Recomptage manuel", "Échantillon offert", "Correction", "Autre"];

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
  const title = variant ? `Ajuster le stock — ${item.productName} (${variant.variantName})` : `Ajuster le stock — ${item.productName}`;
  const endpoint = variant
    ? `/api/supplier/inventory/${item.listingId}/variants/${variant.variantId}/stock`
    : `/api/supplier/inventory/${item.listingId}/stock`;

  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", endpoint, {
      type, quantity: Number(quantity), reason, notes: notes.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/inventory"] });
      toast({ title: "Stock mis à jour" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Impossible de mettre à jour le stock", description: err?.message, variant: "destructive" }),
  });

  const qty = Number(quantity) || 0;
  const preview = type === "INCREASE" ? currentStock + qty : type === "DECREASE" ? Math.max(0, currentStock - qty) : qty;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* max-h-[90vh] + flex flex-col turns this into a fixed-height shell with the header
          and footer as non-shrinking flex items and only the form body (below) scrolling —
          so the header/footer stay visible while the body scrolls, without restructuring
          any of the form's own state/logic. */}
      <DialogContent hideClose className="max-h-[90vh] flex flex-col" data-testid="dialog-adjust-stock">
        <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={onClose} aria-label="Close" data-testid="button-close-adjust-stock">
          <X className="w-4 h-4" />
        </button>
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* Scrollable body — same thin-scrollbar treatment as the Stock History modal above. */}
        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
          <div className="flex items-center justify-between text-sm bg-secondary/40 rounded-lg p-3">
            <span className="text-muted-foreground">Stock actuel</span>
            <span className="font-semibold">{currentStock} {unit}</span>
          </div>
          {variant?.maxStock != null && (
            <p className="text-xs text-muted-foreground -mt-2">Stock maximum pour cette variante : {variant.maxStock} {unit}</p>
          )}

          <div className="space-y-1.5">
            <Label>Type d'ajustement</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger data-testid="select-adjustment-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INCREASE">Augmenter (+)</SelectItem>
                <SelectItem value="DECREASE">Diminuer (−)</SelectItem>
                <SelectItem value="SET">Définir une quantité exacte</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{type === "SET" ? "Nouvelle quantité" : "Quantité"}</Label>
            <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" data-testid="input-adjustment-quantity" />
          </div>

          <div className="space-y-1.5">
            <Label>Motif</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger data-testid="select-adjustment-reason"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optionnel)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ajoutez un contexte supplémentaire..." data-testid="textarea-adjustment-notes" />
          </div>

          <div className="flex items-center justify-between text-sm bg-primary/5 rounded-lg p-3">
            <span className="text-muted-foreground">Le nouveau stock sera</span>
            <span className="font-semibold">{preview} {unit}</span>
          </div>
          {variant?.maxStock != null && preview > variant.maxStock && (
            <p className="text-xs text-destructive">Ceci dépasse le stock maximum de la variante ({variant.maxStock} {unit}) et sera rejeté.</p>
          )}
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !quantity || Number(quantity) < 0}
            data-testid="button-confirm-adjustment"
          >
            {mutation.isPending ? "Enregistrement..." : "Enregistrer l'ajustement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
