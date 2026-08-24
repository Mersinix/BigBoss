import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Printer, X, Box, Layers, Store, User } from "lucide-react";
import { useThemeStore } from "@/store/theme-store";
import { formatDate } from "@/lib/format";
import { useFormatCurrency } from "@/hooks/use-currency";
import type { OrderWithDetails } from "@shared/schema";
import { PackCompositionView } from "@/components/order/pack-composition-view";
import { groupOrderItemsByProduct } from "@/lib/order-item-grouping";
import { invoiceNumber } from "@/lib/financial-rows";

// Digital invoice — rendered entirely from the order/sub-order data the app already loads
// (OrderWithDetails, from GET /api/orders), never a separate invoice record. Packs render
// via the existing PackCompositionView, which already resolves the *actual* purchased
// flavor/size selection from the order item's snapshot rather than the pack's current/
// generic definition — see components/order/pack-composition-view.tsx. No order data is
// modified by opening this — it is a read-only presentation of what already exists.

function useTheme(isDark: boolean) {
  const dk = isDark;
  return {
    dk,
    modalBg: dk ? "bg-gray-900" : "bg-white",
    headerBg: dk ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100",
    stickyBg: dk ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100",
    cardBg: dk ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100",
    cardHeader: dk ? "bg-gray-800/80 border-gray-700/50" : "bg-gray-50 border-gray-100",
    innerCard: dk ? "bg-gray-800/60 border-gray-700/40" : "bg-gray-50 border-gray-100",
    rowDivide: dk ? "divide-gray-700/50" : "divide-gray-100",
    textPrimary: dk ? "text-white" : "text-gray-900",
    textMuted: dk ? "text-gray-400" : "text-gray-500",
    textSubtle: dk ? "text-gray-500" : "text-gray-400",
    iconBtn: dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800",
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  order: OrderWithDetails | null;
  /** Show only this one supplier's invoice (Supplier's own Invoices tab). Omit to show the
   * full order across every supplier (Coffee Owner / Admin "View Invoice"). */
  subOrderId?: number | null;
};

export default function OrderInvoiceModal({ open, onClose, order, subOrderId = null }: Props) {
  const { isDark } = useThemeStore();
  const t = useTheme(isDark);
  const fmt = useFormatCurrency();

  if (!order) return null;

  const allSubOrders = order.subOrders ?? [];
  const subOrders = subOrderId != null ? allSubOrders.filter((s) => s.id === subOrderId) : allSubOrders;
  const singleSupplier = subOrders.length === 1 ? subOrders[0] : null;
  const number = singleSupplier ? invoiceNumber(singleSupplier.id) : `INV-O${String(order.id).padStart(5, "0")}`;
  // Legacy orders created before sub-orders existed have none — fall back to the order's own
  // flat items (same fallback OrderDetailsModal already uses) rather than showing an empty
  // invoice for a real, historical order.
  const isLegacyFlatOrder = allSubOrders.length === 0 && (order.items ?? []).length > 0;
  const legacyItems = isLegacyFlatOrder ? (order.items ?? []).filter((i: any) => i.status !== "CANCELLED") : [];
  const linesTotal = isLegacyFlatOrder
    ? legacyItems.reduce((s: number, i: any) => s + (i.totalPrice ?? (i.unitPrice ?? 0) * (i.quantity ?? 0)), 0)
    : subOrders.reduce((s, so) => s + (so.subtotal ?? 0), 0);
  // Delivery fee is charged once per order (not per supplier) — only attribute it to the
  // grand total when this invoice covers the whole order, never to a single supplier's slice.
  const deliveryFee = subOrderId == null ? Number((order as any).deliveryFee ?? 0) : 0;
  const grandTotal = linesTotal + deliveryFee;
  const paymentMethod = (order as any).paymentMethod ?? "CASH_ON_DELIVERY";
  const paymentLabel = paymentMethod === "CASH_ON_DELIVERY" ? "Cash on Delivery"
    : paymentMethod === "CREDIT_CARD" ? "Credit Card"
    : paymentMethod === "MOBILE_PAYMENT" ? "Mobile Payment" : "Bank Transfer";
  // Same DELIVERED-derived "collected" convention already used across Payments/Earnings/
  // Payouts (see lib/financial-rows.ts) — orders.paymentStatus itself never changes from
  // PENDING (only COD is supported), so it is not a usable live signal.
  const allDelivered = isLegacyFlatOrder
    ? order.status === "DELIVERED"
    : subOrders.length > 0 && subOrders.every((s) => s.status === "DELIVERED");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`max-w-2xl w-[calc(100%-2rem)] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden print:shadow-none print:rounded-none ${t.modalBg}`}>
        <DialogTitle className="sr-only">Facture {number}</DialogTitle>

        <div className={`flex flex-col max-h-[90vh] overflow-hidden transition-colors duration-200 ${t.modalBg}`}>
          {/* Header */}
          <div className={`shrink-0 border-b px-6 pt-5 pb-4 flex items-center justify-between ${t.headerBg}`}>
            <button onClick={onClose} aria-label="Fermer" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors print:hidden ${t.iconBtn}`}>
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-500" />
              <span className={`font-mono text-[15px] font-bold tracking-tight ${t.textPrimary}`}>{number}</span>
            </div>
            <button onClick={() => window.print()} aria-label="Imprimer" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors print:hidden ${t.iconBtn}`}>
              <Printer className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
            {/* Order + parties */}
            <div className={`border rounded-2xl p-4 space-y-3 ${t.innerCard}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className={`font-mono text-xs ${t.textMuted}`}>Commande #{String(order.id).padStart(6, "0")}</span>
                <span className={`text-xs ${t.textMuted}`}>{formatDate(order.createdAt as any)}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Facturé à</p>
                    <p className={`text-sm font-medium ${t.textPrimary}`}>{order.cafe?.name ?? "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                    <Store className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Fournisseur{subOrders.length > 1 ? "s" : ""}</p>
                    <p className={`text-sm font-medium ${t.textPrimary}`}>
                      {subOrders.length ? subOrders.map((s) => s.supplierName).join(", ") : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Line items, grouped by supplier — mirrors Order Details so the invoice never
                disagrees with what the Coffee Owner already sees for this order. */}
            {subOrders.map((sub: any) => (
              <div key={sub.id} className={`border rounded-2xl overflow-hidden ${t.cardBg}`}>
                {subOrders.length > 1 && (
                  <div className={`px-4 py-2.5 border-b flex items-center gap-2 ${t.cardHeader}`}>
                    <Store className="w-3.5 h-3.5 text-amber-500" />
                    <span className={`font-semibold text-sm ${t.textPrimary}`}>{sub.supplierName}</span>
                    <Badge variant="outline" className="ml-auto text-[10px]">{sub.status}</Badge>
                  </div>
                )}
                <div className={`divide-y ${t.rowDivide}`}>
                  {groupOrderItemsByProduct((sub.items ?? []).filter((i: any) => i.status !== "CANCELLED")).map((group: any) => (
                    <div key={`product-${group.productId}`} className="px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <div className={`w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shrink-0 mt-0.5 ${t.dk ? "bg-gray-700" : "bg-gray-100"}`}>
                          {group.productImageUrl ? <img src={group.productImageUrl} alt="" className="w-full h-full object-cover" /> : <Box className={`w-4 h-4 ${t.textMuted}`} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`font-medium text-sm ${t.textPrimary}`}>{group.productName}</p>
                          <div className="mt-1 space-y-1">
                            {group.variants.map((variant: any) => (
                              <div key={variant.key} className="flex items-center justify-between gap-2">
                                <span className={`text-xs ${t.textMuted}`}>
                                  {[variant.flavorName, variant.sizeName].filter(Boolean).join(" · ") || "—"}
                                  <span className="ml-1.5">×{variant.quantity} @ {fmt(variant.totalPrice / Math.max(variant.quantity, 1))}</span>
                                </span>
                                <span className={`text-xs font-semibold ${t.textPrimary}`}>{fmt(variant.totalPrice)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <span className={`font-semibold text-sm shrink-0 ${t.textPrimary}`}>{fmt(group.subtotal)}</span>
                      </div>
                    </div>
                  ))}
                  {(sub.items ?? []).filter((i: any) => !!i.packId && i.status !== "CANCELLED").map((item: any, idx: number) => {
                    const snapshot = item.snapshot as any;
                    const packSnapshot = snapshot?.kind === "PACK" ? snapshot : null;
                    const itemName = packSnapshot?.packName ?? item.packName ?? "Pack";
                    return (
                      <div key={`pack-${item.id ?? idx}`} className="px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shrink-0 mt-0.5 bg-amber-500/15">
                            {packSnapshot?.packImageUrl ? <img src={packSnapshot.packImageUrl} alt="" className="w-full h-full object-cover" /> : <Layers className="w-4 h-4 text-amber-500" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`font-medium text-sm ${t.textPrimary}`}>{itemName} ×{item.quantity}</p>
                            <PackCompositionView packId={item.packId} quantity={item.quantity} snapshot={packSnapshot} t={t} />
                          </div>
                          <span className={`font-semibold text-sm shrink-0 ${t.textPrimary}`}>{fmt((item.unitPrice ?? 0) * item.quantity)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className={`px-4 py-2.5 border-t flex justify-between items-center ${t.dk ? "border-gray-700/50" : "border-gray-100"}`}>
                  <span className={`text-xs font-medium ${t.textMuted}`}>Sous-total {sub.supplierName}</span>
                  <span className={`font-bold text-sm ${t.textPrimary}`}>{fmt(sub.subtotal)}</span>
                </div>
                {sub.discountAmount > 0 && (
                  <div className="px-4 pb-2.5 flex justify-between text-xs text-green-500 font-medium">
                    <span>Réduction ({sub.promotionName ?? "Promotion"})</span>
                    <span>−{fmt(sub.discountAmount)}</span>
                  </div>
                )}
              </div>
            ))}

            {/* Legacy fallback: orders created before sub-orders existed have no supplier
                breakdown — render the order's flat items directly, same as
                OrderDetailsModal's own fallback section. */}
            {isLegacyFlatOrder && (
              <div className={`border rounded-2xl overflow-hidden ${t.cardBg}`}>
                <div className={`divide-y ${t.rowDivide}`}>
                  {groupOrderItemsByProduct(legacyItems).map((group: any) => (
                    <div key={`legacy-product-${group.productId}`} className="px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <div className={`w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shrink-0 mt-0.5 ${t.dk ? "bg-gray-700" : "bg-gray-100"}`}>
                          {group.productImageUrl ? <img src={group.productImageUrl} alt="" className="w-full h-full object-cover" /> : <Box className={`w-4 h-4 ${t.textMuted}`} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`font-medium text-sm ${t.textPrimary}`}>{group.productName}</p>
                          <div className="mt-1 space-y-1">
                            {group.variants.map((variant: any) => (
                              <div key={variant.key} className="flex items-center justify-between gap-2">
                                <span className={`text-xs ${t.textMuted}`}>
                                  {[variant.flavorName, variant.sizeName].filter(Boolean).join(" · ") || "—"}
                                  <span className="ml-1.5">×{variant.quantity}</span>
                                </span>
                                <span className={`text-xs font-semibold ${t.textPrimary}`}>{fmt(variant.totalPrice)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <span className={`font-semibold text-sm shrink-0 ${t.textPrimary}`}>{fmt(group.subtotal)}</span>
                      </div>
                    </div>
                  ))}
                  {legacyItems.filter((i: any) => !!i.packId).map((item: any, idx: number) => {
                    const snapshot = item.snapshot as any;
                    const packSnapshot = snapshot?.kind === "PACK" ? snapshot : null;
                    const itemName = packSnapshot?.packName ?? item.packName ?? "Pack";
                    return (
                      <div key={`legacy-pack-${item.id ?? idx}`} className="px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shrink-0 mt-0.5 bg-amber-500/15">
                            {packSnapshot?.packImageUrl ? <img src={packSnapshot.packImageUrl} alt="" className="w-full h-full object-cover" /> : <Layers className="w-4 h-4 text-amber-500" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`font-medium text-sm ${t.textPrimary}`}>{itemName} ×{item.quantity}</p>
                            <PackCompositionView packId={item.packId} quantity={item.quantity} snapshot={packSnapshot} t={t} />
                          </div>
                          <span className={`font-semibold text-sm shrink-0 ${t.textPrimary}`}>{fmt((item.unitPrice ?? 0) * item.quantity)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {subOrders.length === 0 && !isLegacyFlatOrder && (
              <p className={`text-sm text-center py-8 ${t.textMuted}`}>Aucun article facturable.</p>
            )}
          </div>

          {/* Sticky footer */}
          <div className={`shrink-0 border-t px-6 py-4 space-y-3 ${t.stickyBg}`}>
            <div className="space-y-1.5 text-sm">
              <div className={`flex justify-between ${t.textMuted}`}>
                <span>Sous-total</span><span>{fmt(linesTotal)}</span>
              </div>
              {deliveryFee > 0 && (
                <div className={`flex justify-between ${t.textMuted}`}>
                  <span>Livraison</span><span>{fmt(deliveryFee)}</span>
                </div>
              )}
              <div className={`flex justify-between items-center font-bold border-t pt-2 ${t.dk ? "border-gray-800" : "border-gray-100"}`}>
                <span className={t.textPrimary}>Total</span>
                <span className="text-amber-500 text-xl">{fmt(grandTotal)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded-lg px-2.5 py-1 ${t.dk ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
                Paiement: {paymentLabel}
              </span>
              <span className={`rounded-lg px-2.5 py-1 ${allDelivered ? "bg-green-500/15 text-green-600" : (t.dk ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700")}`}>
                {allDelivered ? "Encaissé" : "En attente"}
              </span>
            </div>
            <DialogFooter className="print:hidden">
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
