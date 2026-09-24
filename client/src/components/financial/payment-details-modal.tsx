import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, X, Coffee, Store, Receipt, Calendar, Truck, Ticket, Tag } from "lucide-react";
import { useThemeStore } from "@/store/theme-store";
import { formatDate } from "@/lib/format";
import { useFormatCurrency } from "@/hooks/use-currency";
import type { OrderWithDetails } from "@shared/schema";
import {
  PAYOUT_STATUS_META, PAYMENT_COLLECTION_META, invoiceNumber, payoutReference, type FinancialRow,
} from "@/lib/financial-rows";

// Payment/payout details — same visual language as OrderInvoiceModal (the Invoice details
// modal), but surfaces payment-specific figures (gross/commission/net/payout status) instead
// of a line-item breakdown. Every figure comes straight from the same FinancialRow already
// computed in lib/financial-rows.ts (never recalculated here) plus the real sub-order/
// delivery data already loaded on `order` — no new financial or delivery-pricing logic.

function useTheme(isDark: boolean) {
  const dk = isDark;
  return {
    dk,
    modalBg: dk ? "bg-gray-900" : "bg-white",
    headerBg: dk ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100",
    stickyBg: dk ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100",
    innerCard: dk ? "bg-gray-800/60 border-gray-700/40" : "bg-gray-50 border-gray-100",
    textPrimary: dk ? "text-white" : "text-gray-900",
    textMuted: dk ? "text-gray-400" : "text-gray-500",
    textSubtle: dk ? "text-gray-500" : "text-gray-400",
    iconBtn: dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800",
  };
}

export default function PaymentDetailsModal({
  open, onClose, row, order,
}: {
  open: boolean;
  onClose: () => void;
  row: FinancialRow | null;
  order: OrderWithDetails | null;
}) {
  const { isDark } = useThemeStore();
  const t = useTheme(isDark);
  const fmt = useFormatCurrency();

  if (!row) return null;

  const subOrder = (order?.subOrders ?? []).find((s) => s.id === row.subOrderId) as any;
  const collectionMeta = PAYMENT_COLLECTION_META[row.paymentCollectionStatus];
  const payoutMeta = PAYOUT_STATUS_META[row.payoutStatus];
  const delivery = subOrder?.delivery ?? null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`max-w-lg w-[calc(100%-2rem)] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden ${t.modalBg}`}>
        <DialogTitle className="sr-only">Paiement {payoutReference(row.subOrderId)}</DialogTitle>

        <div className={`flex flex-col max-h-[90vh] overflow-hidden transition-colors duration-200 ${t.modalBg}`}>
          <div className={`shrink-0 border-b px-4 sm:px-6 pt-5 pb-4 flex items-center justify-between ${t.headerBg}`}>
            <button onClick={onClose} aria-label="Fermer" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${t.iconBtn}`}>
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-amber-500" />
              <span className={`font-mono text-[15px] font-bold tracking-tight ${t.textPrimary}`}>{payoutReference(row.subOrderId)}</span>
            </div>
            <div className="w-8" />
          </div>

          {/* Thin scrollbar treatment — matches the existing Admin Order Details modal's own
              scroll container exactly (client/src/components/cafe/order-details-modal.tsx),
              same thumb/track/hover classes, not a new scrollbar style. */}
          <div
            className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5 space-y-4
              [&::-webkit-scrollbar]:w-1
              [&::-webkit-scrollbar-track]:bg-transparent
              [&::-webkit-scrollbar-thumb]:rounded-full
              [&::-webkit-scrollbar-thumb]:bg-gray-700
              hover:[&::-webkit-scrollbar-thumb]:bg-gray-600"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {/* Parties + order */}
            <div className={`border rounded-2xl p-4 space-y-3 ${t.innerCard}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className={`font-mono text-xs ${t.textMuted}`}>Commande #{String(row.orderId).padStart(6, "0")}</span>
                <span className={`text-xs ${t.textMuted}`}>{row.createdAt ? formatDate(row.createdAt as any) : "—"}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                    <Coffee className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Café</p>
                    <p className={`text-sm font-medium ${t.textPrimary}`}>{row.cafeName}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                    <Store className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Fournisseur</p>
                    <p className={`text-sm font-medium ${t.textPrimary}`}>{row.supplierName}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial breakdown — same figures as the Payments card/table, never recomputed */}
            <div className={`border rounded-2xl overflow-hidden ${t.innerCard}`}>
              <div className="px-4 py-3 space-y-2">
                <div className={`flex justify-between text-sm ${t.textMuted}`}>
                  <span>Montant brut</span><span className={t.textPrimary}>{fmt(row.subtotal)}</span>
                </div>
                <div className={`flex justify-between text-sm ${t.textMuted}`}>
                  <span>Commission plateforme (5%)</span><span>−{fmt(row.commission)}</span>
                </div>
                {row.discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-500">
                    <span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" />Réduction {subOrder?.promotionName ? `(${subOrder.promotionName})` : ""}</span>
                    <span>−{fmt(row.discountAmount)}</span>
                  </div>
                )}
                {(subOrder?.discountCodeAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-green-500">
                    <span className="flex items-center gap-1"><Ticket className="w-3.5 h-3.5" />Code {subOrder?.discountCodeSnapshot ?? "promo"}</span>
                    <span>−{fmt(subOrder.discountCodeAmount)}</span>
                  </div>
                )}
                <div className={`flex justify-between items-center font-bold border-t pt-2 ${t.dk ? "border-gray-800" : "border-gray-100"}`}>
                  <span className={t.textPrimary}>Net à verser</span>
                  <span className="text-green-600 text-lg">{fmt(row.netAmount)}</span>
                </div>
              </div>
            </div>

            {/* Delivery — only when this sub-order actually has one; real data only, never
                recalculated (see the existing delivery pricing engine, untouched). */}
            {delivery && (
              <div className={`border rounded-2xl p-4 space-y-2 ${t.innerCard}`}>
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-indigo-500" />
                  <span className={`text-sm font-semibold ${t.textPrimary}`}>Livraison</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">{delivery.status}</Badge>
                </div>
                <div className={`flex justify-between text-xs ${t.textMuted}`}>
                  <span>Frais de livraison</span>
                  <span className={t.textPrimary}>{fmt(delivery.deliveryFee ?? 0)}</span>
                </div>
                {delivery.deliveryCompany && (
                  <div className={`flex justify-between text-xs ${t.textMuted}`}>
                    <span>Transporteur</span><span className={t.textPrimary}>{delivery.deliveryCompany.name}</span>
                  </div>
                )}
                {delivery.driver && (
                  <div className={`flex justify-between text-xs ${t.textMuted}`}>
                    <span>Chauffeur</span><span className={t.textPrimary}>{delivery.driver.name}</span>
                  </div>
                )}
              </div>
            )}

            {/* Related invoice — same real sub-order, one payment ↔ one invoice */}
            <div className={`border rounded-2xl p-4 flex items-center justify-between ${t.innerCard}`}>
              <div className="flex items-center gap-2.5">
                <Receipt className="w-4 h-4 text-amber-500" />
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Facture associée</p>
                  <p className={`text-sm font-mono font-medium ${t.textPrimary}`}>{invoiceNumber(row.subOrderId)}</p>
                </div>
              </div>
              <Calendar className={`w-4 h-4 ${t.textSubtle}`} />
            </div>
          </div>

          {/* Sticky footer: statuses */}
          <div className={`shrink-0 border-t px-4 sm:px-6 py-4 space-y-3 ${t.stickyBg}`}>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded-lg px-2.5 py-1 ${collectionMeta.className}`}>Paiement : {collectionMeta.label}</span>
              <span className={`rounded-lg px-2.5 py-1 ${payoutMeta.className}`}>Payout : {payoutMeta.label}</span>
              <span className={`rounded-lg px-2.5 py-1 ${t.dk ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
                {row.paymentMethod === "CASH_ON_DELIVERY" ? "Cash on Delivery" : row.paymentMethod}
              </span>
            </div>
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
