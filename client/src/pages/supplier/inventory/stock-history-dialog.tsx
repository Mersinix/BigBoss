import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { ArrowUp, ArrowDown, Equal, X } from "lucide-react";
import type { InventoryAdjustmentWithVariant, InventoryItem } from "@shared/schema";

const TYPE_META: Record<string, { icon: JSX.Element; cls: string }> = {
  INCREASE: { icon: <ArrowUp className="w-3 h-3" />, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" },
  DECREASE: { icon: <ArrowDown className="w-3 h-3" />, cls: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400" },
  SET: { icon: <Equal className="w-3 h-3" />, cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400" },
};

export function StockHistoryDialog({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery<InventoryAdjustmentWithVariant[]>({
    queryKey: ["/api/supplier/inventory", item.listingId, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/supplier/inventory/${item.listingId}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
  });

  // Confirmed-empty only once loading has actually finished and the request did NOT fail —
  // never while still fetching (isLoading) and never on a failed request (isError), so a
  // slow network or a transient API error can't be misread as "this product has no history"
  // (task's own explicit warning). `isLoading` only reflects the very first fetch; it stays
  // false on any later background refetch, so an already-open modal with real records can
  // never be closed out from under the user by this effect.
  const confirmedEmpty = !isLoading && !isError && (data?.length ?? 0) === 0;

  useEffect(() => {
    if (confirmedEmpty) onClose();
  }, [confirmedEmpty, onClose]);

  // Nothing is rendered — not even a flash of the modal — while we don't yet know whether
  // there is any history, and never once we've confirmed there is none (task: "Do not open
  // or display the Stock History modal" / "Do not show an empty modal" for a product with
  // zero adjustment records).
  if (isLoading || confirmedEmpty) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent hideClose className="max-w-lg" data-testid="dialog-stock-history">
        <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={onClose} aria-label="Close" data-testid="button-close-stock-history">
          <X className="w-4 h-4" />
        </button>
        <DialogHeader>
          <DialogTitle>Historique du stock — {item.productName}</DialogTitle>
        </DialogHeader>
        {/* Thin scrollbar treatment — same convention used by every other scrollable modal
            in this app, applied only to this modal's own scrollable area, not globally. */}
        <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
          {isError ? (
            <p className="text-sm text-destructive text-center py-8">Impossible de charger l'historique du stock.</p>
          ) : (
            data!.map((h) => {
              const meta = TYPE_META[h.adjustmentType] ?? TYPE_META.SET;
              return (
                <div key={h.id} className="flex items-start justify-between gap-3 border rounded-lg p-3" data-testid={`history-row-${h.id}`}>
                  <div className="flex items-start gap-2">
                    <Badge variant="secondary" className={`${meta.cls} border-0 shrink-0`}>{meta.icon}</Badge>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium">{h.reason}</p>
                        {h.variantName && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{h.variantName}</Badge>}
                      </div>
                      {h.notes && <p className="text-xs text-muted-foreground mt-0.5">{h.notes}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {h.createdAt ? formatDate(h.createdAt) : ""}{h.userId == null ? " · Système" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{h.previousStock} → {h.newStock}</p>
                    <p className={`text-xs ${h.difference >= 0 ? "text-emerald-600" : "text-red-600"}`}>{h.difference >= 0 ? "+" : ""}{h.difference}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
