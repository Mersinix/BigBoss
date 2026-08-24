import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, X, Store } from "lucide-react";
import { useThemeStore } from "@/store/theme-store";
import { formatDate } from "@/lib/format";
import { useFormatCurrency } from "@/hooks/use-currency";
import type { OrderWithDetails } from "@shared/schema";
import { buildFinancialRows, PAYOUT_STATUS_META, PAYMENT_COLLECTION_META, payoutReference } from "@/lib/financial-rows";

// Read-only payout breakdown for one order, derived from the same sub-order data as the
// Supplier/Admin Payouts pages (see lib/financial-rows.ts) — never a separate record, so it
// can never disagree with what Supplier/Admin see there. One card per supplier sub-order,
// since a multi-supplier order has one independent payout per supplier, not one combined
// figure (see shared/schema.ts subOrders — one row per supplier within an order).

function useTheme(isDark: boolean) {
  const dk = isDark;
  return {
    dk,
    modalBg: dk ? "bg-gray-900" : "bg-white",
    headerBg: dk ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100",
    stickyBg: dk ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100",
    cardBg: dk ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100",
    cardHeader: dk ? "bg-gray-800/80 border-gray-700/50" : "bg-gray-50 border-gray-100",
    textPrimary: dk ? "text-white" : "text-gray-900",
    textMuted: dk ? "text-gray-400" : "text-gray-500",
    textSubtle: dk ? "text-gray-500" : "text-gray-400",
    iconBtn: dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800",
  };
}

export default function PayoutInfoModal({
  open, onClose, order,
}: {
  open: boolean;
  onClose: () => void;
  order: OrderWithDetails | null;
}) {
  const { isDark } = useThemeStore();
  const t = useTheme(isDark);
  const fmt = useFormatCurrency();

  if (!order) return null;
  const rows = buildFinancialRows([order]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`max-w-lg w-[calc(100%-2rem)] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden ${t.modalBg}`}>
        <DialogTitle className="sr-only">Informations de paiement — Commande #{String(order.id).padStart(6, "0")}</DialogTitle>

        <div className={`flex flex-col max-h-[85vh] overflow-hidden ${t.modalBg}`}>
          <div className={`shrink-0 border-b px-6 pt-5 pb-4 flex items-center justify-between ${t.headerBg}`}>
            <button onClick={onClose} aria-label="Fermer" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${t.iconBtn}`}>
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-500" />
              <span className={`text-[15px] font-bold tracking-tight ${t.textPrimary}`}>Paiement fournisseur</span>
            </div>
            <span className="w-8 h-8" />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-3">
            {rows.length === 0 && (
              <p className={`text-sm text-center py-8 ${t.textMuted}`}>Aucune information de paiement pour cette commande.</p>
            )}
            {rows.map((r) => (
              <div key={r.subOrderId} className={`border rounded-2xl overflow-hidden ${t.cardBg}`}>
                <div className={`px-4 py-2.5 border-b flex items-center gap-2 ${t.cardHeader}`}>
                  <Store className="w-3.5 h-3.5 text-amber-500" />
                  <span className={`font-semibold text-sm ${t.textPrimary}`}>{r.supplierName}</span>
                  <span className={`font-mono text-[10px] ml-auto ${t.textSubtle}`}>{payoutReference(r.subOrderId)}</span>
                </div>
                <div className="px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className={t.textMuted}>Montant sous-commande</span>
                    <span className={t.textPrimary}>{fmt(r.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={t.textMuted}>Commission plateforme (5%)</span>
                    <span className={t.textPrimary}>−{fmt(r.commission)}</span>
                  </div>
                  <div className={`flex justify-between font-bold border-t pt-2 ${t.dk ? "border-gray-700/50" : "border-gray-100"}`}>
                    <span className={t.textPrimary}>Montant fournisseur</span>
                    <span className="text-amber-500">{fmt(r.netAmount)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge variant="secondary" className={PAYOUT_STATUS_META[r.payoutStatus].className}>
                      {PAYOUT_STATUS_META[r.payoutStatus].label}
                    </Badge>
                    <Badge variant="secondary" className={PAYMENT_COLLECTION_META[r.paymentCollectionStatus].className}>
                      {PAYMENT_COLLECTION_META[r.paymentCollectionStatus].label}
                    </Badge>
                  </div>
                  {r.deliveredAt && (
                    <p className={`text-xs pt-1 ${t.textMuted}`}>Livré le {formatDate(r.deliveredAt as any)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className={`shrink-0 border-t px-6 py-4 ${t.stickyBg}`}>
            <DialogFooter>
              <Button
                variant="outline"
                className={`flex-1 rounded-xl h-11 font-semibold ${t.dk ? "border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white bg-transparent" : "border-gray-200 text-gray-700 hover:bg-gray-50 bg-white"}`}
                onClick={onClose}
              >
                Fermer
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
