import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { ArrowUp, ArrowDown, Equal } from "lucide-react";
import type { InventoryAdjustment, InventoryItem } from "@shared/schema";

const TYPE_META: Record<string, { icon: JSX.Element; cls: string }> = {
  INCREASE: { icon: <ArrowUp className="w-3 h-3" />, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" },
  DECREASE: { icon: <ArrowDown className="w-3 h-3" />, cls: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400" },
  SET: { icon: <Equal className="w-3 h-3" />, cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400" },
};

export function StockHistoryDialog({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { data, isLoading } = useQuery<InventoryAdjustment[]>({
    queryKey: ["/api/supplier/inventory", item.listingId, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/supplier/inventory/${item.listingId}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-stock-history">
        <DialogHeader>
          <DialogTitle>Stock History — {item.productName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {isLoading ? (
            [...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
          ) : !data?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No stock adjustments recorded yet.</p>
          ) : (
            data.map((h) => {
              const meta = TYPE_META[h.adjustmentType] ?? TYPE_META.SET;
              return (
                <div key={h.id} className="flex items-start justify-between gap-3 border rounded-lg p-3" data-testid={`history-row-${h.id}`}>
                  <div className="flex items-start gap-2">
                    <Badge variant="secondary" className={`${meta.cls} border-0 shrink-0`}>{meta.icon}</Badge>
                    <div>
                      <p className="text-sm font-medium">{h.reason}</p>
                      {h.notes && <p className="text-xs text-muted-foreground mt-0.5">{h.notes}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {h.createdAt ? formatDate(h.createdAt) : ""}{h.userId == null ? " · System" : ""}
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
