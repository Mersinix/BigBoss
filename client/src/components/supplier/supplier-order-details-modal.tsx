import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Box, Truck, CheckCircle2, AlertCircle, Clock, MapPin,
  Store, Layers, Calendar, Zap, Package, X,
  Sun, Moon, User,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import { useUpdateSubOrderStatus } from "@/hooks/use-orders";
import type { OrderWithDetails } from "@shared/schema";
import { PackCompositionView } from "@/components/order/pack-composition-view";
import { groupOrderItemsByProduct } from "@/lib/order-item-grouping";

// ── Status meta ───────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; badgeDk: string; badgeLt: string; icon: any }> = {
  PENDING:     { label: "En attente",      badgeDk: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",  badgeLt: "bg-yellow-100 text-yellow-800 border-yellow-200",  icon: Clock },
  CONFIRMED:   { label: "Confirmée",       badgeDk: "bg-blue-500/20 text-blue-300 border-blue-500/30",        badgeLt: "bg-blue-100 text-blue-800 border-blue-200",        icon: CheckCircle2 },
  PREPARING:   { label: "En préparation",  badgeDk: "bg-orange-500/20 text-orange-300 border-orange-500/30",  badgeLt: "bg-orange-100 text-orange-800 border-orange-200",  icon: Box },
  READY:       { label: "Prête",           badgeDk: "bg-teal-500/20 text-teal-300 border-teal-500/30",        badgeLt: "bg-teal-100 text-teal-800 border-teal-200",        icon: Box },
  IN_DELIVERY: { label: "En livraison",    badgeDk: "bg-purple-500/20 text-purple-300 border-purple-500/30",  badgeLt: "bg-purple-100 text-purple-800 border-purple-200",  icon: Truck },
  DELIVERED:   { label: "Livrée",          badgeDk: "bg-green-500/20 text-green-300 border-green-500/30",     badgeLt: "bg-green-100 text-green-800 border-green-200",     icon: CheckCircle2 },
  CANCELLED:   { label: "Annulée",         badgeDk: "bg-red-500/20 text-red-300 border-red-500/30",           badgeLt: "bg-red-100 text-red-800 border-red-200",           icon: AlertCircle },
};

// Forward-moving statuses available to the supplier for each current state. The supplier's
// authority stops at READY — once a sub-order is READY, a Delivery is created and the
// physical delivery lifecycle (picked up / in transit / delivered) is owned entirely by the
// assigned Delivery Company / Driver via /api/deliveries/*, not by the supplier. See
// SHOP_DELIVERY_SYNCHRONIZATION_IMPLEMENTATION.md.
const SUPPLIER_NEXT_STATUSES: Record<string, { value: string; label: string; variant: "default" | "destructive" | "outline" }[]> = {
  PENDING: [
    { value: "CONFIRMED",   label: "Accepter",                   variant: "default" },
    { value: "CANCELLED",   label: "Refuser",                    variant: "destructive" },
  ],
  CONFIRMED: [
    { value: "PREPARING",   label: "Commencer la préparation",   variant: "default" },
    { value: "READY",       label: "Marquer comme prête",        variant: "default" },
    { value: "CANCELLED",   label: "Annuler",                    variant: "destructive" },
  ],
  PREPARING: [
    { value: "READY",       label: "Marquer comme prête",        variant: "default" },
    { value: "CANCELLED",   label: "Annuler",                    variant: "destructive" },
  ],
  READY: [],
  IN_DELIVERY: [],
  DELIVERED:   [],
  CANCELLED:   [],
};

const DELIVERY_STATUS_META: Record<string, { label: string; badgeDk: string; badgeLt: string }> = {
  AVAILABLE: { label: "En attente de collecte", badgeDk: "bg-amber-500/20 text-amber-300", badgeLt: "bg-amber-100 text-amber-800" },
  ACCEPTED:  { label: "Prise en charge",         badgeDk: "bg-blue-500/20 text-blue-300",   badgeLt: "bg-blue-100 text-blue-800" },
  ASSIGNED:  { label: "Chauffeur assigné",       badgeDk: "bg-indigo-500/20 text-indigo-300", badgeLt: "bg-indigo-100 text-indigo-800" },
  PICKED_UP: { label: "Collectée",               badgeDk: "bg-purple-500/20 text-purple-300", badgeLt: "bg-purple-100 text-purple-800" },
  IN_TRANSIT:{ label: "En transit",              badgeDk: "bg-purple-500/20 text-purple-300", badgeLt: "bg-purple-100 text-purple-800" },
  DELIVERED: { label: "Livrée",                  badgeDk: "bg-green-500/20 text-green-300", badgeLt: "bg-green-100 text-green-800" },
  CANCELLED: { label: "Livraison annulée",       badgeDk: "bg-red-500/20 text-red-300",     badgeLt: "bg-red-100 text-red-800" },
};

// ── Theme helper ─────────────────────────────────────────────────────────────

function useTheme(isDark: boolean) {
  return {
    dk: isDark,
    modalBg:    isDark ? "bg-gray-900"                       : "bg-white",
    headerBg:   isDark ? "bg-gray-900 border-gray-800"       : "bg-white border-gray-100",
    stickyBg:   isDark ? "bg-gray-900 border-gray-800"       : "bg-white border-gray-100",
    cardBg:     isDark ? "bg-gray-800 border-gray-700/60"    : "bg-white border-gray-100",
    cardHeader: isDark ? "bg-gray-800/80 border-gray-700/50" : "bg-gray-50 border-gray-100",
    innerCard:  isDark ? "bg-gray-800/60 border-gray-700/40" : "bg-gray-50 border-gray-100",
    rowDivide:  isDark ? "divide-gray-700/50"                : "divide-gray-100",
    textPrimary:isDark ? "text-white"                        : "text-gray-900",
    textMuted:  isDark ? "text-gray-400"                     : "text-gray-500",
    textSubtle: isDark ? "text-gray-500"                     : "text-gray-400",
    iconBtn:    isDark
      ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
      : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800",
    badge: (status: string, map: Record<string, { badgeDk: string; badgeLt: string }>) =>
      isDark ? (map[status]?.badgeDk ?? "bg-gray-700 text-gray-300")
             : (map[status]?.badgeLt ?? "bg-gray-100 text-gray-700"),
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  order: OrderWithDetails | null;
  supplierId: number;
  /** When true, hides all status-update actions (read-only history view). */
  readOnly?: boolean;
};

// ── Main component ────────────────────────────────────────────────────────────

export default function SupplierOrderDetailsModal({ open, onClose, order, supplierId, readOnly = false }: Props) {
  const [isDark, setIsDark] = useState(true);
  const t = useTheme(isDark);
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const updateSubOrderStatus = useUpdateSubOrderStatus();

  if (!order) return null;

  // Find the sub-order belonging to this supplier
  const subOrder = (order.subOrders ?? []).find((so: any) => so.supplierId === supplierId);
  const subStatus = subOrder?.status ?? "PENDING";
  const nextStatuses = SUPPLIER_NEXT_STATUSES[subStatus] ?? [];

  const statusMeta = STATUS_META[subStatus] ?? STATUS_META.PENDING;
  const StatusIcon = statusMeta.icon;

  const deliveryAddress = (order as any).deliveryAddress as { address: string } | null;
  const scheduledAt = (order as any).scheduledAt;
  const priority = (order as any).priority ?? "NORMAL";

  const handleStatusUpdate = (status: string) => {
    if (!subOrder) return;
    updateSubOrderStatus.mutate({ subOrderId: subOrder.id, status }, {
      onSuccess: () => {
        toast({ title: "Statut mis à jour avec succès" });
        if (status === "CANCELLED") onClose();
      },
      onError: () => toast({ title: "Erreur", description: "Impossible de mettre à jour le statut.", variant: "destructive" }),
    });
  };

  const items = subOrder?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl w-[calc(100%-2rem)] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
        <DialogTitle className="sr-only">Commande #{String(order.id).padStart(6, "0")}</DialogTitle>

        <div className={`flex flex-col max-h-[90vh] overflow-hidden transition-colors duration-200 ${t.modalBg}`}>

          {/* ── Header ── */}
          <div className={`shrink-0 border-b px-6 pt-5 pb-4 ${t.headerBg}`}>
            <div className="flex items-center justify-between mb-3">
              <button onClick={onClose} aria-label="Fermer"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${t.iconBtn}`}>
                <X className="w-4 h-4" />
              </button>

              <span className={`font-mono text-[15px] font-bold tracking-tight ${t.textPrimary}`}>
                Commande #{String(order.id).padStart(6, "0")}
              </span>

              <button onClick={() => setIsDark(d => !d)} aria-label="Changer le thème"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${t.iconBtn}`}>
                {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
              </button>
            </div>

            {/* Status + meta */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant="outline"
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${t.badge(subStatus, STATUS_META)}`}>
                <StatusIcon className="w-3 h-3" />
                {statusMeta.label}
              </Badge>

              <span className={`flex items-center gap-1 text-xs ${t.textMuted}`}>
                <Clock className="w-3 h-3" />
                {formatDate(order.createdAt as any)}
              </span>

              {priority !== "NORMAL" && (
                <Badge variant="secondary"
                  className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
                    priority === "URGENT" ? "bg-red-500/20 text-red-300" : "bg-orange-500/20 text-orange-300"
                  }`}>
                  <Zap className="w-3 h-3 mr-1" />
                  {priority === "URGENT" ? "Urgent" : "Haute priorité"}
                </Badge>
              )}

              {scheduledAt && (
                <span className={`flex items-center gap-1 text-xs font-medium ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                  <Calendar className="w-3 h-3" />
                  Planifiée: {formatDate(scheduledAt)}
                </span>
              )}
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4
            [&::-webkit-scrollbar]:w-1
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb]:bg-gray-700
            hover:[&::-webkit-scrollbar-thumb]:bg-gray-600"
            style={{ WebkitOverflowScrolling: "touch" }}>

            {/* ── Order info: delivery + cafe ── */}
            <div className={`border rounded-2xl p-4 space-y-3 ${t.innerCard}`}>

              {/* Cafe owner info */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold mb-0.5 ${t.textMuted}`}>Café client</p>
                  <p className={`text-sm font-medium ${t.textPrimary}`}>{order.cafe?.name ?? "—"}</p>
                </div>
              </div>

              {/* Delivery address */}
              {deliveryAddress?.address && (
                <div className={`flex items-start gap-3 pt-2.5 border-t ${isDark ? "border-gray-700/50" : "border-gray-100"}`}>
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold mb-0.5 ${t.textMuted}`}>Adresse de livraison</p>
                    <p className={`text-sm font-medium ${t.textPrimary}`}>{deliveryAddress.address}</p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Items for this supplier ── */}
            {items.length > 0 && (
              <div className={`border rounded-2xl overflow-hidden ${t.cardBg}`}>
                {/* Section header */}
                <div className={`px-4 py-3 flex items-center gap-2.5 border-b ${t.cardHeader}`}>
                  <div className="w-7 h-7 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                    <Store className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <span className={`font-semibold text-sm ${t.textPrimary}`}>Articles commandés</span>
                </div>

                {/* Item list — same grouping helper and pack composition renderer as the
                    Coffee Owner's Order Details modal, so both surfaces show identical data
                    for the same order (see groupOrderItemsByProduct + PackCompositionView). */}
                <div className={`divide-y ${t.rowDivide}`}>
                  {groupOrderItemsByProduct(items).map((group) => (
                    <div key={`product-${group.productId}`} className="px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isDark ? "bg-gray-700" : "bg-gray-100"}`}>
                          <Box className={`w-3 h-3 ${t.textMuted}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm ${t.textPrimary}`}>{group.productName}</p>
                          {(group.brandName || group.categoryName || group.subCategoryName) && (
                            <p className={`text-[10px] mt-0.5 ${t.textMuted}`}>
                              {[group.brandName, group.categoryName, group.subCategoryName].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          <div className="mt-1.5 space-y-1.5">
                            {group.variants.map((variant) => {
                              const cancelled = variant.status === "CANCELLED";
                              return (
                                <div key={variant.key} className="flex items-center justify-between gap-2">
                                  <span className={`text-xs ${cancelled ? `line-through ${t.textSubtle}` : t.textMuted}`}>
                                    {[variant.flavorName, variant.sizeName].filter(Boolean).join(" · ") || "—"}
                                  </span>
                                  <span className="flex items-center gap-1.5 shrink-0">
                                    {cancelled && (
                                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-400/50 text-red-500">Annulé par le café</Badge>
                                    )}
                                    <span className={`text-xs font-semibold ${cancelled ? `line-through ${t.textSubtle}` : t.textPrimary}`}>
                                      ×{variant.quantity} {fmt(variant.totalPrice)}
                                    </span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`font-semibold text-sm ${t.textPrimary}`}>{fmt(group.subtotal)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {items.filter((item: any) => !!item.packId).map((item: any, idx: number) => {
                    const snapshot = item.snapshot as any;
                    const packSnapshot = snapshot?.kind === "PACK" ? snapshot : null;
                    const itemName = packSnapshot?.packName ?? item.packName;
                    const cancelled = item.status === "CANCELLED";
                    return (
                      <div key={`pack-${item.id ?? idx}`} className="px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${cancelled ? (isDark ? "bg-gray-700" : "bg-gray-100") : "bg-amber-500/15"}`}>
                            <Layers className={`w-3 h-3 ${cancelled ? t.textSubtle : "text-amber-500"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className={`font-medium text-sm ${cancelled ? `line-through ${t.textSubtle}` : t.textPrimary}`}>{itemName}</p>
                              {cancelled && <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-400/50 text-red-500">Annulé par le café</Badge>}
                            </div>
                            {!cancelled && (
                              <PackCompositionView
                                packId={item.packId}
                                quantity={item.quantity}
                                snapshot={packSnapshot}
                                t={t}
                              />
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={`text-xs font-semibold block ${t.textMuted}`}>×{item.quantity}</span>
                            <span className={`font-semibold text-sm ${cancelled ? `line-through ${t.textSubtle}` : t.textPrimary}`}>
                              {fmt((item.unitPrice ?? 0) * item.quantity)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Sub-total */}
                {subOrder && (
                  <div className={`px-4 py-2.5 border-t flex justify-between items-center ${isDark ? "border-gray-700/50" : "border-gray-100"}`}>
                    <span className={`text-xs font-medium ${t.textMuted}`}>Sous-total</span>
                    <span className={`font-bold text-sm ${t.textPrimary}`}>{fmt(subOrder.subtotal)}</span>
                  </div>
                )}

                {/* Delivery — read-only status of this sub-order's Delivery, once one exists
                    (created automatically when the sub-order reaches READY). The supplier
                    tracks it here but all actions (accept/assign/pickup/deliver) happen on
                    the Delivery Company / Driver side via /api/deliveries/*. */}
                {(subOrder as any)?.delivery && (
                  <div className={`px-4 py-3 border-t flex items-start gap-3 ${isDark ? "border-gray-700/50 bg-gray-800/40" : "border-gray-100 bg-gray-50/60"}`}>
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
                      <Truck className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold ${t.textMuted}`}>Livraison</span>
                        <Badge variant="outline" className={`text-[11px] px-2 py-0.5 rounded-lg border-0 ${t.badge((subOrder as any).delivery.status, DELIVERY_STATUS_META)}`}>
                          {DELIVERY_STATUS_META[(subOrder as any).delivery.status]?.label ?? (subOrder as any).delivery.status}
                        </Badge>
                      </div>
                      {(subOrder as any).delivery.deliveryCompany && (
                        <p className={`text-xs mt-1 ${t.textPrimary}`}>Transporteur: {(subOrder as any).delivery.deliveryCompany.name}</p>
                      )}
                      {(subOrder as any).delivery.driver && (
                        <p className={`text-xs ${t.textPrimary}`}>Chauffeur: {(subOrder as any).delivery.driver.name}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="h-1" />
          </div>

          {/* ── Footer: actions ── */}
          <div className={`shrink-0 border-t px-6 py-4 space-y-3 ${t.stickyBg}`}>

            {/* Status picklist — hidden in readOnly mode */}
            {!readOnly && nextStatuses.length > 0 && (
              <div className="space-y-2">
                <p className={`text-xs font-semibold uppercase tracking-wide ${t.textSubtle}`}>
                  Mettre à jour le statut
                </p>
                <Select
                  onValueChange={(val) => handleStatusUpdate(val)}
                  disabled={updateSubOrderStatus.isPending}
                >
                  <SelectTrigger className={`h-9 rounded-xl text-sm ${
                    isDark
                      ? "bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
                      : "bg-white border-gray-200 text-gray-900"
                  }`}>
                    <SelectValue placeholder="Sélectionner un statut…" />
                  </SelectTrigger>
                  <SelectContent>
                    {nextStatuses.map((ns) => (
                      <SelectItem
                        key={ns.value}
                        value={ns.value}
                        className={ns.variant === "destructive" ? "text-red-600 focus:text-red-600" : ""}
                      >
                        {ns.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Close button */}
            <Button
              variant="outline"
              className={`w-full rounded-xl h-10 font-semibold border transition-colors ${
                isDark
                  ? "border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white bg-transparent"
                  : "border-gray-200 text-gray-700 hover:bg-gray-50 bg-white"
              }`}
              onClick={onClose}
            >
              Fermer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
