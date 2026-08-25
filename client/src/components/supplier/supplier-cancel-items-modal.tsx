import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Layers, AlertTriangle } from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import { useSupplierCancelItems } from "@/hooks/use-orders";
import { groupOrderItemsByProduct } from "@/lib/order-item-grouping";
import { PackCompositionView } from "@/components/order/pack-composition-view";

// Lets a Supplier cancel exactly what they cannot fulfill from their own sub-order — a whole
// Pack, a single product, one variant, or part of a line's quantity — instead of only being
// able to reject the entire sub-order. Modeled on the Coffee Owner's equivalent
// (CancelSubOrderModal in components/cafe/order-details-modal.tsx) but adds a per-row
// quantity stepper, since the Supplier can cancel PART of an ordered quantity (e.g. 1 of 5)
// and not just whole lines.
//
// Selecting a quantity < the line's full quantity does not touch the rest of that line —
// the backend (storage.cancelSupplierSubOrderItems) splits the order item into an active
// remainder and a cancelled slice; both halves keep the pack's real purchased flavor/size
// selection, scaled proportionally (see splitAndCancelOrderItem).

type Theme = {
  dk: boolean;
  innerCard: string;
  cardBg: string;
  textSubtle: string;
  textPrimary: string;
  textMuted: string;
};

type SelectionMap = Record<number, number>; // orderItemId -> quantity to cancel

function QtyStepper({
  value, max, onChange, t,
}: { value: number; max: number; onChange: (v: number) => void; t: Theme }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1 ${t.dk ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"}`}>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        className={`w-5 h-5 rounded flex items-center justify-center disabled:opacity-30 ${t.dk ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className={`text-xs font-semibold w-5 text-center ${t.textPrimary}`}>{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={`w-5 h-5 rounded flex items-center justify-center disabled:opacity-30 ${t.dk ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function SupplierCancelItemsModal({
  subOrder,
  onClose,
  t,
}: {
  subOrder: any | null;
  onClose: () => void;
  t: Theme;
}) {
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const cancelItems = useSupplierCancelItems();
  const [selection, setSelection] = useState<SelectionMap>({});

  const items: any[] = subOrder?.items ?? [];
  const activeItems = items.filter((item) => item.status !== "CANCELLED");
  const productGroups = groupOrderItemsByProduct(activeItems);
  const activePackItems = activeItems.filter((item) => !!item.packId);

  const setQty = (orderItemId: number, qty: number) => {
    setSelection((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[orderItemId];
      else next[orderItemId] = qty;
      return next;
    });
  };

  const selectedEntries = useMemo(
    () => Object.entries(selection).map(([id, qty]) => ({ orderItemId: Number(id), quantity: qty })).filter((e) => e.quantity > 0),
    [selection],
  );
  const selectedCount = selectedEntries.reduce((s, e) => s + e.quantity, 0);

  const handleConfirm = () => {
    if (!subOrder || selectedEntries.length === 0) return;
    cancelItems.mutate(
      { subOrderId: subOrder.id, items: selectedEntries },
      {
        onSuccess: () => {
          toast({ title: "Articles annulés", description: `${selectedCount} article(s) annulé(s) et remis en stock.` });
          setSelection({});
          onClose();
        },
        onError: (err: Error) => toast({ title: "Annulation impossible", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={!!subOrder} onOpenChange={(v) => { if (!v) { setSelection({}); onClose(); } }}>
      <DialogContent className={`max-w-lg w-[calc(100%-2rem)] rounded-3xl border-0 shadow-2xl ${t.dk ? "bg-gray-900" : "bg-white"}`}>
        <DialogTitle className={t.textPrimary}>Annuler des articles</DialogTitle>
        {subOrder && (
          <>
            <p className={`text-xs ${t.textMuted}`}>
              Sélectionnez les produits, variantes, Packs ou quantités que vous ne pouvez pas honorer.
              Le reste de la commande n'est pas affecté.
            </p>
            <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
              {productGroups.length === 0 && activePackItems.length === 0 && (
                <p className={`text-sm text-center py-6 ${t.textMuted}`}>Aucun article annulable.</p>
              )}
              {productGroups.map((group) => (
                <div key={group.productId} className={`border rounded-2xl p-3 ${t.innerCard}`}>
                  <p className={`font-semibold text-sm ${t.textPrimary}`}>{group.productName}</p>
                  <div className="mt-2 space-y-2">
                    {group.variants.map((variant) => {
                      if (variant.orderItemId == null) return null;
                      const qty = selection[variant.orderItemId] ?? 0;
                      return (
                        <div key={variant.key} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className={`text-xs ${t.textMuted}`}>
                              {[variant.flavorName, variant.sizeName].filter(Boolean).join(" · ") || "—"}
                            </span>
                            <span className={`ml-1.5 text-xs font-semibold ${t.textPrimary}`}>
                              sur {variant.quantity} · {fmt(variant.totalPrice)}
                            </span>
                          </div>
                          <QtyStepper
                            value={qty}
                            max={variant.quantity}
                            onChange={(v) => setQty(variant.orderItemId!, v)}
                            t={t}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {activePackItems.map((item) => {
                const snapshot = item.snapshot as any;
                const packSnapshot = snapshot?.kind === "PACK" ? snapshot : null;
                const itemName = packSnapshot?.packName ?? item.packName ?? "Pack";
                const qty = selection[item.id] ?? 0;
                return (
                  <div key={`pack-${item.id}`} className={`border rounded-2xl p-3 ${t.innerCard}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className={`text-sm font-semibold truncate ${t.textPrimary}`}>{itemName}</span>
                        <span className={`text-xs ${t.textMuted}`}>sur {item.quantity} · {fmt((item.unitPrice ?? 0) * item.quantity)}</span>
                      </div>
                      <QtyStepper value={qty} max={item.quantity} onChange={(v) => setQty(item.id, v)} t={t} />
                    </div>
                    <div className="mt-1 ml-5">
                      <PackCompositionView packId={item.packId} quantity={item.quantity} snapshot={packSnapshot} t={t} />
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedEntries.length > 0 && (
              <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${t.dk ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{selectedCount} article(s) seront annulés et remis en stock. Le café pourra choisir un autre fournisseur pour ces articles.</span>
              </div>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedEntries.length === 0 || cancelItems.isPending}
            className="bg-red-600 hover:bg-red-700 text-white"
            data-testid="button-confirm-supplier-cancel-items"
          >
            {cancelItems.isPending ? "Annulation…" : `Confirmer l'annulation (${selectedCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
