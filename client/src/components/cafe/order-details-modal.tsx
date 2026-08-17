import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Box, Truck, CheckCircle2, AlertCircle, Clock, MapPin,
  Store, Layers, RotateCcw, Calendar, Zap, Package, XCircle,
  Sun, Moon, X, ChevronRight, User,
} from "lucide-react";
import { useThemeStore } from "@/store/theme-store";
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

// Delivery lifecycle labels (deliveryStatusEnum) — distinct from the Shop order status
// above. A sub-order only has a `delivery` once its own status reaches READY.
const DELIVERY_STATUS_META: Record<string, { label: string; badgeDk: string; badgeLt: string }> = {
  AVAILABLE: { label: "En attente de collecte", badgeDk: "bg-amber-500/20 text-amber-300", badgeLt: "bg-amber-100 text-amber-800" },
  ACCEPTED:  { label: "Prise en charge",         badgeDk: "bg-blue-500/20 text-blue-300",   badgeLt: "bg-blue-100 text-blue-800" },
  ASSIGNED:  { label: "Chauffeur assigné",       badgeDk: "bg-indigo-500/20 text-indigo-300", badgeLt: "bg-indigo-100 text-indigo-800" },
  PICKED_UP: { label: "Collectée",               badgeDk: "bg-purple-500/20 text-purple-300", badgeLt: "bg-purple-100 text-purple-800" },
  IN_TRANSIT:{ label: "En transit",              badgeDk: "bg-purple-500/20 text-purple-300", badgeLt: "bg-purple-100 text-purple-800" },
  DELIVERED: { label: "Livrée",                  badgeDk: "bg-green-500/20 text-green-300", badgeLt: "bg-green-100 text-green-800" },
  CANCELLED: { label: "Livraison annulée",       badgeDk: "bg-red-500/20 text-red-300",     badgeLt: "bg-red-100 text-red-800" },
};

const ORDER_PROGRESS_STAGES = [
  { status: "PENDING", label: "Order Placed", icon: Clock },
  { status: "CONFIRMED", label: "Confirmed", icon: CheckCircle2 },
  { status: "PREPARING", label: "Preparing", icon: Box },
  { status: "READY", label: "Ready for Delivery", icon: Package },
  { status: "IN_DELIVERY", label: "Out for Delivery", icon: Truck },
  { status: "DELIVERED", label: "Delivered", icon: CheckCircle2 },
] as const;

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

function PackCompositionView({
  packId,
  quantity,
  snapshot,
  t,
}: {
  packId: number;
  quantity: number;
  snapshot?: any;
  t: ReturnType<typeof useTheme>;
}) {
  const { data: composition, isLoading } = usePackComposition(packId);
  const historicalComposition = Array.isArray(snapshot?.includedProducts) ? snapshot.includedProducts : null;

  if (!historicalComposition && isLoading) {
    return (
      <div className={`mt-2 rounded-xl p-3 space-y-1.5 ${t.innerCard} border`}>
        {[1, 2].map(i => (
          <div key={i} className={`h-4 rounded animate-pulse ${t.dk ? "bg-gray-700" : "bg-gray-200"}`} />
        ))}
      </div>
    );
  }

  const rows = historicalComposition ?? composition ?? [];
  if (!rows.length) return null;

  return (
    <div className={`mt-2 rounded-xl p-3 border ${t.innerCard}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${t.textSubtle}`}>
        Composition du pack × {quantity}
      </p>
      <div className="space-y-2">
        {rows.map((comp: any, i: number) => {
          // Stored order snapshots already contain the exact included quantity
          // captured at checkout. Legacy orders use live composition rows, where
          // quantity is per pack and must still be multiplied.
          const totalQty = historicalComposition ? comp.quantity : comp.quantity * quantity;
          return (
            <div key={i} className={`flex items-start gap-2 text-xs ${t.textPrimary}`}>
              <ChevronRight className={`w-3 h-3 mt-0.5 shrink-0 ${t.textSubtle}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                  {comp.productImageUrl && (
                    <img
                      src={comp.productImageUrl}
                      alt=""
                      className="w-7 h-7 rounded-lg object-cover shrink-0"
                    />
                  )}
                  <span className="font-medium">{comp.productName}</span>
                </div>
                {(comp.brandName || comp.categoryName || comp.subCategoryName) && (
                  <p className={`mt-1 text-[10px] ${t.textSubtle}`}>
                    {[comp.brandName, comp.categoryName, comp.subCategoryName].filter(Boolean).join(" · ")}
                  </p>
                )}
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
  const { isDark, toggle } = useThemeStore();
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
          brandName: item.brandName ?? null,
          categoryName: item.categoryName ?? item.productCategory ?? null,
          subCategoryName: item.subCategoryName ?? null,
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
          includedProducts: (pack.includedProducts ?? []).map((item: any) => ({
            productId: item.productId ?? 0,
            productName: item.productName ?? "",
            productImageUrl: item.productImageUrl ?? null,
            brandName: item.brandName ?? null,
            categoryName: item.categoryName ?? null,
            subCategoryName: item.subCategoryName ?? null,
            flavorName: item.flavorName ?? null,
            sizeName: item.sizeName ?? null,
            quantity: item.quantity ?? 0,
          })),
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
  const currentProgressIndex = ORDER_PROGRESS_STAGES.findIndex((stage) => stage.status === order.status);
  const deliveryMethod = (order as any).deliveryMethod ?? "DELIVERY_SERVICE";
  const paymentMethod = (order as any).paymentMethod ?? "CASH_ON_DELIVERY";
  const paymentStatus = (order as any).paymentStatus ?? "PENDING";
  const deliveryFee = Number((order as any).deliveryFee ?? 0);
  const deliveryLabel = deliveryMethod === "SELF_PICKUP" ? "Self Pickup" : "Delivery Service";
  const paymentLabel = paymentMethod === "CASH_ON_DELIVERY"
    ? "Cash on Delivery"
    : paymentMethod === "CREDIT_CARD"
      ? "Credit Card"
      : paymentMethod === "MOBILE_PAYMENT"
        ? "Mobile Payment"
        : "Bank Transfer";

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
                onClick={toggle}
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

            {/* ── Order info: café client + delivery ── */}
            {(order.cafe?.name || deliveryAddress || courierInstructions) && (
              <div className={`border rounded-2xl p-4 space-y-3 ${t.innerCard}`}>
                {/* Café client */}
                {order.cafe?.name && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold mb-0.5 ${t.textMuted}`}>Café client</p>
                      <p className={`text-sm font-medium ${t.textPrimary}`}>{order.cafe.name}</p>
                    </div>
                  </div>
                )}
                {deliveryAddress && (
                  <div className={`flex items-start gap-3 ${order.cafe?.name ? `pt-2.5 border-t ${t.dk ? "border-gray-700/50" : "border-gray-100"}` : ""}`}>
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

            {/* ── Order progress ──
                Sub-orders have independent statuses, so their progress is
                rendered inside each supplier section below. Keep this
                order-level track only for legacy orders without sub-orders. */}
            {!hasSubOrders && (
              <div className={`border rounded-2xl p-4 ${t.innerCard}`}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <p className={`text-sm font-semibold ${t.textPrimary}`}>Order progress</p>
                  <Badge
                    variant="outline"
                    className={`text-[10px] rounded-lg ${t.badge(order.status, STATUS_META)}`}
                  >
                    {statusMeta.label}
                  </Badge>
                </div>
                {order.status === "CANCELLED" ? (
                  <div className="flex items-center gap-2 text-sm text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    This order was cancelled.
                  </div>
                ) : (
                  <div className="flex items-start overflow-x-auto pb-1">
                    {ORDER_PROGRESS_STAGES.map((stage, index) => {
                      const StageIcon = stage.icon;
                      const complete = currentProgressIndex >= index;
                      const current = currentProgressIndex === index;
                      return (
                        <div key={stage.status} className="flex items-start min-w-[92px] flex-1">
                          <div className="flex flex-col items-center min-w-[72px]">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                              complete
                                ? (current ? "bg-amber-500 border-amber-400 text-white ring-2 ring-amber-500/25" : "bg-amber-500/20 border-amber-500 text-amber-400")
                                : (t.dk ? "bg-gray-800 border-gray-700 text-gray-500" : "bg-gray-50 border-gray-200 text-gray-400")
                            }`}>
                              <StageIcon className="w-3.5 h-3.5" />
                            </div>
                            <span className={`text-[10px] text-center leading-tight mt-1.5 ${current ? "font-bold text-amber-500" : t.textMuted}`}>
                              {stage.label}
                            </span>
                          </div>
                          {index < ORDER_PROGRESS_STAGES.length - 1 && (
                            <div className={`h-0.5 flex-1 mt-4 min-w-[14px] ${currentProgressIndex > index ? "bg-amber-500" : (t.dk ? "bg-gray-700" : "bg-gray-200")}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Delivery & payment information ── */}
            <div className={`border rounded-2xl p-4 space-y-3 ${t.innerCard}`}>
              <p className={`text-sm font-semibold flex items-center gap-2 ${t.textPrimary}`}>
                <Truck className="w-4 h-4 text-amber-500" />
                Delivery & payment
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className={`rounded-xl border p-3 ${t.cardBg}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Delivery</p>
                  <p className={`text-sm font-semibold mt-1 ${t.textPrimary}`}>{deliveryLabel}</p>
                  {deliveryMethod === "SELF_PICKUP" ? (
                    <p className={`text-xs mt-1 ${t.textMuted}`}>Order collected directly from the supplier.</p>
                  ) : (
                    <>
                      {deliveryAddress && <p className={`text-xs mt-1 ${t.textMuted}`}>{deliveryAddress.address}</p>}
                      <p className={`text-xs mt-1 ${t.textMuted}`}>Status: {statusMeta.label}</p>
                    </>
                  )}
                  <p className={`text-xs mt-1 ${t.textMuted}`}>Delivery fee: {fmt(deliveryFee)}</p>
                  {order.delivery?.name && <p className={`text-xs mt-1 ${t.textMuted}`}>Driver: {order.delivery.name}</p>}
                </div>
                <div className={`rounded-xl border p-3 ${t.cardBg}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Payment</p>
                  <p className={`text-sm font-semibold mt-1 ${t.textPrimary}`}>{paymentLabel}</p>
                  <p className={`text-xs mt-1 ${t.textMuted}`}>Status: {paymentStatus}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className={`rounded-lg px-2.5 py-1 ${t.dk ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
                  Priority: {priorityMeta.label}
                </span>
                <span className={`rounded-lg px-2.5 py-1 ${t.dk ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
                  Planning: {scheduledAt ? "Scheduled" : "Immediate"}
                </span>
              </div>
            </div>

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

                      {/* Each supplier/sub-order progresses independently. */}
                      <div className={`px-4 py-3 border-b ${t.dk ? "border-gray-700/50" : "border-gray-100"}`}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <p className={`text-xs font-semibold ${t.textPrimary}`}>Order progress</p>
                          <span className={`text-[10px] font-medium ${t.textMuted}`}>
                            {SUBORDER_STATUS[sub.status]?.label ?? sub.status}
                          </span>
                        </div>
                        {sub.status === "CANCELLED" ? (
                          <div className="flex items-center gap-2 text-xs text-red-400">
                            <AlertCircle className="w-3.5 h-3.5" />
                            This supplier order was cancelled.
                          </div>
                        ) : (
                          <div className="flex items-start overflow-x-auto pb-1">
                            {ORDER_PROGRESS_STAGES.map((stage, index) => {
                              const StageIcon = stage.icon;
                              const subProgressIndex = ORDER_PROGRESS_STAGES.findIndex(
                                (progressStage) => progressStage.status === sub.status,
                              );
                              const complete = subProgressIndex >= index;
                              const current = subProgressIndex === index;
                              return (
                                <div key={stage.status} className="flex items-start min-w-[92px] flex-1">
                                  <div className="flex flex-col items-center min-w-[72px]">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                                      complete
                                        ? (current ? "bg-amber-500 border-amber-400 text-white ring-2 ring-amber-500/25" : "bg-amber-500/20 border-amber-500 text-amber-400")
                                        : (t.dk ? "bg-gray-800 border-gray-700 text-gray-500" : "bg-gray-50 border-gray-200 text-gray-400")
                                    }`}>
                                      <StageIcon className="w-3.5 h-3.5" />
                                    </div>
                                    <span className={`text-[10px] text-center leading-tight mt-1.5 ${current ? "font-bold text-amber-500" : t.textMuted}`}>
                                      {stage.label}
                                    </span>
                                  </div>
                                  {index < ORDER_PROGRESS_STAGES.length - 1 && (
                                    <div className={`h-0.5 flex-1 mt-4 min-w-[14px] ${subProgressIndex > index ? "bg-amber-500" : (t.dk ? "bg-gray-700" : "bg-gray-200")}`} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Item rows */}
                      <div className={`divide-y ${t.rowDivide}`}>
                        {(sub.items ?? []).map((item: any, idx: number) => {
                          const snapshot = item.snapshot as any;
                          const isPackItem = !!item.packId;
                          const productSnapshot = snapshot?.kind === "PRODUCT" ? snapshot : null;
                          const packSnapshot = snapshot?.kind === "PACK" ? snapshot : null;
                          const variant = [
                            productSnapshot?.flavorName ?? item.flavorName,
                            productSnapshot?.sizeName ?? item.sizeName,
                          ].filter(Boolean).join(" · ");
                          const itemName = isPackItem
                            ? (packSnapshot?.packName ?? item.packName ?? "Pack")
                            : (productSnapshot?.productName ?? item.product?.name ?? "Product");
                          const itemImage = isPackItem
                            ? packSnapshot?.packImageUrl
                            : (productSnapshot?.productImageUrl ?? item.product?.imageUrl);
                          return (
                            <div key={idx} className="px-4 py-3">
                              <div className="flex items-start gap-2.5">
                                <div className={`w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center shrink-0 mt-0.5 ${
                                  isPackItem ? "bg-amber-500/15" : (t.dk ? "bg-gray-700" : "bg-gray-100")
                                }`}>
                                  {itemImage
                                    ? <img src={itemImage} alt="" className="w-full h-full object-cover" />
                                    : isPackItem
                                      ? <Layers className="w-4 h-4 text-amber-500" />
                                      : <Box className={`w-4 h-4 ${t.textMuted}`} />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={`font-medium text-sm ${t.textPrimary}`}>
                                    {itemName}
                                  </p>
                                  {!isPackItem && (
                                    <p className={`text-[10px] mt-0.5 ${t.textMuted}`}>
                                      {[
                                        productSnapshot?.brandName,
                                        productSnapshot?.categoryName,
                                        productSnapshot?.subCategoryName,
                                      ].filter(Boolean).join(" · ")}
                                    </p>
                                  )}
                                  {variant && !isPackItem && (
                                    <p className={`text-xs mt-0.5 ${t.textMuted}`}>{variant}</p>
                                  )}
                                  {isPackItem && (
                                    <PackCompositionView
                                      packId={item.packId}
                                      quantity={item.quantity}
                                      snapshot={packSnapshot}
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

                      {/* Delivery — present once this sub-order's own delivery exists (created
                          when the supplier marks it READY). Read-only: the Coffee Owner tracks
                          delivery progress here but doesn't act on it. */}
                      {sub.delivery && (
                        <div className={`px-4 py-3 border-t flex items-start gap-3 ${t.dk ? "border-gray-700/50 bg-gray-800/40" : "border-gray-100 bg-gray-50/60"}`}>
                          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
                            <Truck className="w-4 h-4 text-indigo-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-semibold ${t.textMuted}`}>Livraison</span>
                              <Badge variant="outline" className={`text-[11px] px-2 py-0.5 rounded-lg border-0 ${t.badge(sub.delivery.status, DELIVERY_STATUS_META)}`}>
                                {DELIVERY_STATUS_META[sub.delivery.status]?.label ?? sub.delivery.status}
                              </Badge>
                            </div>
                            {sub.delivery.driver && (
                              <p className={`text-xs mt-1 ${t.textPrimary}`}>Chauffeur: {sub.delivery.driver.name}</p>
                            )}
                          </div>
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
                  {(order.items ?? []).map((item: any, idx: number) => {
                    const snapshot = item.snapshot as any;
                    const isPackItem = !!item.packId;
                    const itemName = isPackItem
                      ? (snapshot?.packName ?? item.packName ?? "Pack")
                      : (snapshot?.productName ?? item.product?.name ?? "Product");
                    const image = isPackItem
                      ? snapshot?.packImageUrl
                      : (snapshot?.productImageUrl ?? item.product?.imageUrl);
                    return (
                      <div key={idx} className="flex items-center justify-between px-4 py-3 gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shrink-0 ${t.dk ? "bg-gray-700" : "bg-gray-100"}`}>
                            {image
                              ? <img src={image} alt="" className="w-full h-full object-cover" />
                              : isPackItem ? <Layers className="w-4 h-4 text-amber-500" /> : <Box className={`w-4 h-4 ${t.textMuted}`} />}
                          </div>
                          <div className="min-w-0">
                            <span className={`text-xs font-bold ${t.textMuted}`}>{item.quantity}× </span>
                            <span className={`font-medium text-sm ${t.textPrimary}`}>{itemName}</span>
                            {!isPackItem && (
                              <p className={`text-[10px] truncate ${t.textMuted}`}>
                                {[snapshot?.brandName, snapshot?.categoryName, snapshot?.subCategoryName, snapshot?.flavorName, snapshot?.sizeName].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className={`text-sm shrink-0 ${t.textMuted}`}>
                          {fmt((item.unitPrice ?? 0) * item.quantity)}
                        </span>
                      </div>
                    );
                  })}
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
                  {cancelling ? "Annulation…" : "Annuler"}
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
