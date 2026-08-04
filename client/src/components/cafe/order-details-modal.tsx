import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Box, Truck, CheckCircle2, AlertCircle, Clock, MapPin,
  Store, Layers, RotateCcw, Calendar, Zap, Package, XCircle,
  Sun, Moon, X, ChevronRight,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderWithDetails } from "@shared/schema";

// ── Status helpers ──────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; badgeDk: string; badgeLt: string; icon: any }> = {
  PENDING:     { label: "En attente",      badgeDk: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",   badgeLt: "bg-yellow-100 text-yellow-800 border-yellow-200",   icon: Clock },
  CONFIRMED:   { label: "Confirmée",       badgeDk: "bg-blue-500/20 text-blue-300 border-blue-500/30",         badgeLt: "bg-blue-100 text-blue-800 border-blue-200",         icon: CheckCircle2 },
  PREPARING:   { label: "En préparation",  badgeDk: "bg-orange-500/20 text-orange-300 border-orange-500/30",   badgeLt: "bg-orange-100 text-orange-800 border-orange-200",   icon: Box },
  READY:       { label: "Prête",           badgeDk: "bg-teal-500/20 text-teal-300 border-teal-500/30",         badgeLt: "bg-teal-100 text-teal-800 border-teal-200",         icon: Box },
  IN_DELIVERY: { label: "En livraison",    badgeDk: "bg-purple-500/20 text-purple-300 border-purple-500/30",   badgeLt: "bg-purple-100 text-purple-800 border-purple-200",   icon: Truck },
  DELIVERED:   { label: "Livrée",          badgeDk: "bg-green-500/20 text-green-300 border-green-500/30",      badgeLt: "bg-green-100 text-green-800 border-green-200",      icon: CheckCircle2 },
  CANCELLED:   { label: "Annulée",         badgeDk: "bg-red-500/20 text-red-300 border-red-500/30",            badgeLt: "bg-red-100 text-red-800 border-red-200",            icon: AlertCircle },
};

const PRIORITY_META: Record<string, { label: string; badgeDk: string; badgeLt: string }> = {
  NORMAL: { label: "Normal",          badgeDk: "bg-gray-700 text-gray-300",                badgeLt: "bg-gray-100 text-gray-700" },
  HIGH:   { label: "Haute priorité",  badgeDk: "bg-orange-500/25 text-orange-300",         badgeLt: "bg-orange-100 text-orange-700" },
  URGENT: { label: "Urgent",          badgeDk: "bg-red-500/25 text-red-300",               badgeLt: "bg-red-100 text-red-700" },
};

const SUBORDER_STATUS: Record<string, { label: string; badgeDk: string; badgeLt: string }> = {
  PENDING:     { label: "En attente",      badgeDk: "bg-yellow-500/20 text-yellow-300", badgeLt: "bg-yellow-100 text-yellow-800" },
  CONFIRMED:   { label: "Confirmée",       badgeDk: "bg-blue-500/20 text-blue-300",     badgeLt: "bg-blue-100 text-blue-800" },
  PREPARING:   { label: "En préparation",  badgeDk: "bg-orange-500/20 text-orange-300", badgeLt: "bg-orange-100 text-orange-800" },
  READY:       { label: "Prête",           badgeDk: "bg-teal-500/20 text-teal-300",     badgeLt: "bg-teal-100 text-teal-800" },
  IN_DELIVERY: { label: "En livraison",    badgeDk: "bg-purple-500/20 text-purple-300", badgeLt: "bg-purple-100 text-purple-800" },
  DELIVERED:   { label: "Livrée",         badgeDk: "bg-green-500/20 text-green-300",   badgeLt: "bg-green-100 text-green-800" },
  CANCELLED:   { label: "Annulée",         badgeDk: "bg-red-500/20 text-red-300",       badgeLt: "bg-red-100 text-red-800" },
};

// Statuses where the cafe owner can still cancel
const CANCELLABLE_STATUSES = new Set(["PENDING"]);

// ── Design system (mirrors pack-quick-view-modal) ─────────────────────────────

function useTheme(isDark: boolean) {
  const dk = isDark;
  return {
    dk,
    modalBg:      dk ? "bg-gray-900"                         : "bg-white",
    headerBg:     dk ? "bg-gray-900 border-gray-800"         : "bg-white border-gray-100",
    stickyBg:     dk ? "bg-gray-900 border-gray-800"         : "bg-white border-gray-100",
    cardBg:       dk ? "bg-gray-800 border-gray-700/60"      : "bg-white border-gray-100",
    cardHeader:   dk ? "bg-gray-800/80 border-gray-700/50"   : "bg-gray-50 border-gray-100",
    innerCard:    dk ? "bg-gray-800/60 border-gray-700/40"   : "bg-gray-50 border-gray-100",
    rowDivide:    dk ? "divide-gray-700/50"                  : "divide-gray-100",
    dividerBg:    dk ? "bg-gray-800"                         : "bg-gray-100",
    textPrimary:  dk ? "text-white"                          : "text-gray-900",
    textMuted:    dk ? "text-gray-400"                       : "text-gray-500",
    textSubtle:   dk ? "text-gray-500"                       : "text-gray-400",
    iconBtn:      dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
                     : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800",
    badge: (status: string, map: Record<string, { badgeDk: string; badgeLt: string }>) =>
      dk ? (map[status]?.badgeDk ?? "bg-gray-700 text-gray-300")
         : (map[status]?.badgeLt ?? "bg-gray-100 text-gray-700"),
  };
}

// ── Pack composition hook + view ──────────────────────────────────────────────

type PackCompositionItem = {
  listingId: number;
  variantId: number | null;
  productName: string;
  flavorName: string | null;
  sizeName: string | null;
  quantity: number;
};

function usePackComposition(packId: number | null) {
  return useQuery<PackCompositionItem[]>({
    queryKey: ["/api/packs", packId, "composition"],
    queryFn: async () => {
      const res = await fetch(`/api/packs/${packId}/composition`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pack composition");
      return res.json();
    },
    enabled: packId != null,
    staleTime: 5 * 60 * 1000,
  });
}

function PackCompositionView({ packId, quantity, t }: { packId: number; quantity: number; t: ReturnType<typeof useTheme> }) {
  const { data: composition, isLoading } = usePackComposition(packId);

  if (isLoading) {
    return (
      <div className={`mt-2 rounded-xl p-3 space-y-1.5 ${t.innerCard} border`}>
        {[1, 2].map(i => (
          <div key={i} className={`h-4 rounded animate-pulse ${t.dk ? "bg-gray-700" : "bg-gray-200"}`} />
        ))}
      </div>
    );
  }

  if (!composition?.length) return null;

  return (
    <div className={`mt-2 rounded-xl p-3 border ${t.innerCard}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${t.textSubtle}`}>
        Composition du pack × {quantity}
      </p>
      <div className="space-y-2">
        {composition.map((comp, i) => {
          const totalQty = comp.quantity * quantity;
          return (
            <div key={i} className={`flex items-start gap-2 text-xs ${t.textPrimary}`}>
              <ChevronRight className={`w-3 h-3 mt-0.5 shrink-0 ${t.textSubtle}`} />
              <div className="flex-1 min-w-0">
                <span className="font-medium">{comp.productName}</span>
                {(comp.flavorName || comp.sizeName) && (
                  <span className={`ml-1.5 ${t.textMuted}`}>
                    {comp.flavorName && <span>Saveur: <b>{comp.flavorName}</b></span>}
                    {comp.flavorName && comp.sizeName && <span className="mx-1">·</span>}
                    {comp.sizeName && <span>Taille: <b>{comp.sizeName}</b></span>}
                  </span>
                )}
              </div>
              <span className={`font-bold shrink-0 ${t.textMuted}`}>×{totalQty}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  order: OrderWithDetails | null;
  /** Show the Reorder button. Default: true. Pass false for Admin/Supplier views. */
  showReorder?: boolean;
  /** Show the Cancel button (for Cafe Owner). Default: false. */
  showCancel?: boolean;
};

export default function OrderDetailsModal({
  open, onClose, order,
  showReorder = true,
  showCancel = false,
}: Props) {
  const [isDark, setIsDark] = useState(true);
  const t = useTheme(isDark);

  const { addItem, addPackItem } = useCart();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [reordering, setReordering] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const fmt = useFormatCurrency();

  if (!order) return null;

  const statusMeta    = STATUS_META[order.status] ?? { label: order.status, badgeDk: "bg-gray-700 text-gray-300", badgeLt: "bg-gray-100 text-gray-700", icon: Box };
  const StatusIcon    = statusMeta.icon;
  const priorityMeta  = PRIORITY_META[(order as any).priority ?? "NORMAL"] ?? PRIORITY_META.NORMAL;
  const scheduledAt   = (order as any).scheduledAt;
  const deliveryAddress   = (order as any).deliveryAddress as { address: string } | null;
  const courierInstructions = (order as any).courierInstructions as string | null;

  const canCancel = showCancel && CANCELLABLE_STATUSES.has(order.status);

  // ── Reorder ────────────────────────────────────────────────────────────────

  const handleReorder = async () => {
    setReordering(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/reorder`, { credentials: "include" });
      if (!res.ok) throw new Error("Impossible de préparer la re-commande");
      const data = await res.json() as {
        items: any[];
        packItems: any[];
        unavailable: { name: string; reason: string }[];
      };

      // Append to existing cart (do NOT clear — preserve what's already there)
      for (const item of data.items) {
        addItem({
          listingId: item.listingId,
          productId: item.productId,
          supplierId: item.supplierId,
          supplierName: item.supplierName ?? "",
          flavorId: item.flavorId ?? null,
          sizeId: item.sizeId ?? null,
          flavorName: item.flavorName ?? null,
          sizeName: item.sizeName ?? null,
          unitPrice: item.unitPrice,
          productName: item.productName ?? "",
          productImageUrl: item.productImageUrl ?? null,
          productCategory: item.productCategory ?? "",
        }, item.quantity);
      }

      for (const pack of data.packItems) {
        addPackItem({
          packId: pack.packId,
          packName: pack.packName ?? "",
          packImageUrl: pack.packImageUrl ?? null,
          supplierId: pack.supplierId,
          supplierName: pack.supplierName ?? "",
          unitPrice: pack.unitPrice ?? 0,
          includedProducts: pack.includedProducts ?? [],
        }, pack.quantity);
      }

      const addedCount = data.items.length + data.packItems.length;
      const unavailableCount = data.unavailable.length;

      if (addedCount === 0 && unavailableCount > 0) {
        toast({
          title: "Aucun article disponible",
          description: `${unavailableCount} article(s) ne sont plus disponibles.`,
          variant: "destructive",
        });
        return;
      }

      let desc = `${addedCount} article(s) ajouté(s) au panier.`;
      if (unavailableCount > 0) desc += ` ${unavailableCount} article(s) non disponible(s).`;

      toast({ title: "Articles ajoutés au panier", description: desc });
      onClose();
      setLocation("/cart");
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setReordering(false);
    }
  };

  // ── Cancel order ────────────────────────────────────────────────────────────

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Impossible d'annuler la commande" }));
        throw new Error(err.message ?? "Impossible d'annuler la commande");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Commande annulée", description: "La commande a été annulée avec succès." });
      onClose();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const subOrders  = order.subOrders ?? [];
  const hasSubOrders = subOrders.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-2xl w-[calc(100%-2rem)] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden"
      >
        {/* Accessible title */}
        <DialogTitle className="sr-only">Commande #{String(order.id).padStart(6, "0")}</DialogTitle>

        <div className={`flex flex-col max-h-[90vh] overflow-hidden transition-colors duration-200 ${t.modalBg}`}>

          {/* ── Header ── */}
          <div className={`shrink-0 border-b px-6 pt-5 pb-4 ${t.headerBg}`}>

            {/* Top row: close / order number / theme toggle */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={onClose}
                aria-label="Fermer"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${t.iconBtn}`}
              >
                <X className="w-4 h-4" />
              </button>

              <span className={`font-mono text-[15px] font-bold tracking-tight ${t.textPrimary}`}>
                Commande #{String(order.id).padStart(6, "0")}
              </span>

              <button
                onClick={() => setIsDark(d => !d)}
                aria-label="Changer le thème"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${t.iconBtn}`}
              >
                {t.dk
                  ? <Sun className="w-4 h-4 text-amber-400" />
                  : <Moon className="w-4 h-4 text-gray-500" />
                }
              </button>
            </div>

            {/* Status + meta row */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {/* Status badge */}
              <Badge
                variant="outline"
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${t.badge(order.status, STATUS_META)}`}
              >
                <StatusIcon className="w-3 h-3" />
                {statusMeta.label}
              </Badge>

              {/* Date */}
              <span className={`flex items-center gap-1 text-xs ${t.textMuted}`}>
                <Clock className="w-3 h-3" />
                {formatDate(order.createdAt as any)}
              </span>

              {/* Priority (non-normal only) */}
              {(order as any).priority && (order as any).priority !== "NORMAL" && (
                <Badge
                  variant="secondary"
                  className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${t.badge((order as any).priority, PRIORITY_META)}`}
                >
                  <Zap className="w-3 h-3 mr-1" />
                  {priorityMeta.label}
                </Badge>
              )}

              {/* Scheduled */}
              {scheduledAt && (
                <span className={`flex items-center gap-1 text-xs font-medium ${t.dk ? "text-blue-400" : "text-blue-600"}`}>
                  <Calendar className="w-3 h-3" />
                  Planifiée : {formatDate(scheduledAt)}
                </span>
              )}
            </div>
          </div>

          {/* ── Scrollable body ── */}
          <div
            className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4
              [&::-webkit-scrollbar]:w-1
              [&::-webkit-scrollbar-track]:bg-transparent
              [&::-webkit-scrollbar-thumb]:rounded-full
              [&::-webkit-scrollbar-thumb]:bg-gray-700
              hover:[&::-webkit-scrollbar-thumb]:bg-gray-600"
            style={{ WebkitOverflowScrolling: "touch" }}
          >

            {/* ── Delivery info ── */}
            {(deliveryAddress || courierInstructions) && (
              <div className={`border rounded-2xl p-4 space-y-3 ${t.innerCard}`}>
                {deliveryAddress && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold mb-0.5 ${t.textMuted}`}>Adresse de livraison</p>
                      <p className={`text-sm font-medium ${t.textPrimary}`}>{deliveryAddress.address}</p>
                    </div>
                  </div>
                )}
                {courierInstructions && (
                  <div className={`flex items-start gap-3 pt-2.5 border-t ${t.dk ? "border-gray-700/50" : "border-gray-100"}`}>
                    <div className="w-8 h-8 rounded-xl bg-gray-500/10 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold mb-0.5 ${t.textMuted}`}>Instructions coursier</p>
                      <p className={`text-sm ${t.textPrimary}`}>{courierInstructions}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── SubOrders by supplier ── */}
            {hasSubOrders ? (
              <div className="space-y-3">
                {subOrders.map((sub: any) => {
                  const subStatusBadge = t.badge(sub.status, SUBORDER_STATUS);
                  return (
                    <div key={sub.id} className={`border rounded-2xl overflow-hidden ${t.cardBg}`}>

                      {/* Supplier header */}
                      <div className={`px-4 py-3 flex items-center justify-between gap-3 border-b ${t.cardHeader}`}>
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                            <Store className="w-3.5 h-3.5 text-amber-500" />
                          </div>
                          <span className={`font-semibold text-sm ${t.textPrimary}`}>{sub.supplierName}</span>
                        </div>
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${subStatusBadge}`}>
                          {SUBORDER_STATUS[sub.status]?.label ?? sub.status}
                        </span>
                      </div>

                      {/* Item rows */}
                      <div className={`divide-y ${t.rowDivide}`}>
                        {(sub.items ?? []).map((item: any, idx: number) => {
                          const variant = [item.flavorName, item.sizeName].filter(Boolean).join(" · ");
                          const isPackItem = !!item.packId;
                          return (
                            <div key={idx} className="px-4 py-3">
                              <div className="flex items-start gap-2.5">
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                  isPackItem
                                    ? "bg-amber-500/15"
                                    : (t.dk ? "bg-gray-700" : "bg-gray-100")
                                }`}>
                                  {isPackItem
                                    ? <Layers className="w-3 h-3 text-amber-500" />
                                    : <Box className={`w-3 h-3 ${t.textMuted}`} />
                                  }
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={`font-medium text-sm ${t.textPrimary}`}>
                                    {isPackItem ? item.packName : item.product?.name}
                                  </p>
                                  {variant && !isPackItem && (
                                    <p className={`text-xs mt-0.5 ${t.textMuted}`}>{variant}</p>
                                  )}
                                  {isPackItem && (
                                    <PackCompositionView
                                      packId={item.packId}
                                      quantity={item.quantity}
                                      t={t}
                                    />
                                  )}
                                </div>
                                <div className="shrink-0 text-right">
                                  <span className={`text-xs font-semibold block ${t.textMuted}`}>
                                    ×{item.quantity}
                                  </span>
                                  <span className={`font-semibold text-sm ${t.textPrimary}`}>
                                    {fmt((item.unitPrice ?? 0) * item.quantity)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Subtotal row */}
                      <div className={`px-4 py-2.5 border-t flex justify-between items-center ${t.dk ? "border-gray-700/50" : "border-gray-100"}`}>
                        <span className={`text-xs font-medium ${t.textMuted}`}>
                          Sous-total {sub.supplierName}
                        </span>
                        <span className={`font-bold text-sm ${t.textPrimary}`}>
                          {fmt(sub.subtotal)}
                        </span>
                      </div>

                      {/* Discount row */}
                      {sub.discountAmount > 0 && (
                        <div className={`px-4 pb-2.5 flex justify-between text-xs text-green-500 font-medium`}>
                          <span>Réduction ({sub.promotionName ?? "Promotion"})</span>
                          <span>−{fmt(sub.discountAmount)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Fallback: flat items when no subOrders */
              <div className={`border rounded-2xl overflow-hidden ${t.cardBg}`}>
                <div className={`divide-y ${t.rowDivide}`}>
                  {(order.items ?? []).map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold w-6 ${t.textMuted}`}>{item.quantity}×</span>
                        <span className={`font-medium text-sm ${t.textPrimary}`}>{item.product?.name}</span>
                      </div>
                      <span className={`text-sm ${t.textMuted}`}>
                        {fmt((item.unitPrice ?? 0) * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* bottom breathing room */}
            <div className="h-1" />
          </div>

          {/* ── Sticky footer: total + actions ── */}
          <div className={`shrink-0 border-t px-6 py-4 space-y-4 ${t.stickyBg}`}>

            {/* Grand total */}
            <div className={`flex justify-between items-center font-bold border-b pb-3 ${t.dk ? "border-gray-800" : "border-gray-100"}`}>
              <span className={t.textPrimary}>Total commande</span>
              <span className="text-amber-500 text-xl">{fmt(order.totalAmount)}</span>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              {/* Close */}
              <Button
                variant="outline"
                className={`flex-1 min-w-[80px] rounded-xl h-11 font-semibold border transition-colors
                  ${t.dk
                    ? "border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white bg-transparent"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50 bg-white"
                  }`}
                onClick={onClose}
              >
                Fermer
              </Button>

              {/* Cancel */}
              {canCancel && (
                <Button
                  variant="outline"
                  className={`flex-1 min-w-[140px] rounded-xl h-11 font-semibold gap-2 transition-colors
                    ${t.dk
                      ? "border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 bg-transparent"
                      : "border-red-300 text-red-600 hover:bg-red-50 bg-white"
                    }`}
                  onClick={handleCancel}
                  disabled={cancelling}
                  data-testid="button-cancel-order"
                >
                  <XCircle className="w-4 h-4" />
                  {cancelling ? "Annulation…" : "Annuler la commande"}
                </Button>
              )}

              {/* Reorder */}
              {showReorder && (
                <Button
                  variant="outline"
                  className={`flex-1 min-w-[120px] rounded-xl h-11 font-semibold gap-2 transition-colors
                    ${t.dk
                      ? "border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white bg-transparent"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50 bg-white"
                    }`}
                  onClick={handleReorder}
                  disabled={reordering}
                  data-testid="button-reorder"
                >
                  <RotateCcw className="w-4 h-4" />
                  {reordering ? "Chargement…" : "Recommander"}
                </Button>
              )}
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
