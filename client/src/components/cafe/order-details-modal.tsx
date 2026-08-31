import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Box, Truck, CheckCircle2, AlertCircle, Clock, MapPin,
  Store, Layers, RotateCcw, Calendar, Zap, Package, XCircle,
  Sun, Moon, X, User, FileText, Wallet, Star,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useDriverReviewForDelivery, useCreateDriverReview } from "@/hooks/use-delivery-ecosystem";
import { useThemeStore } from "@/store/theme-store";
import { formatDate } from "@/lib/format";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import { useReorderToCart, useCancelSubOrderItems } from "@/hooks/use-orders";
import type { OrderWithDetails } from "@shared/schema";
import { PackCompositionView } from "@/components/order/pack-composition-view";
import { DeliveryProgress } from "@/components/order/delivery-progress";
import { groupOrderItemsByProduct } from "@/lib/order-item-grouping";
import { getSupplierStatusEntries } from "@/lib/order-status";
import OrderInvoiceModal from "@/components/financial/order-invoice-modal";
import PayoutInfoModal from "@/components/financial/payout-info-modal";

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

// ── Driver review (task Part 31) — one review per completed delivery, reusing the
// existing supplierProductReviews table (reviewType='DRIVER') exactly like every other
// review surface in this app (Academy/Barista/Print/Maintenance). Synchronizes with
// Driver → Avis, Driver rating, Delivery Company Driver detail, and Admin automatically —
// same live-computed rating pattern, nothing stored twice. ──────────────────────────────

function DriverReviewButton({ driverId, deliveryId, isDark }: { driverId: number; deliveryId: number; isDark: boolean }) {
  const { toast } = useToast();
  const { data: existing, isLoading } = useDriverReviewForDelivery(deliveryId);
  const createReview = useCreateDriverReview();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  if (isLoading) return null;

  if (existing) {
    return (
      <div className="flex items-center gap-1 text-xs mt-1.5 text-amber-500">
        {"★".repeat(existing.rating)}{"☆".repeat(5 - existing.rating)}
        <span className={isDark ? "text-gray-400" : "text-gray-500"}>Avis envoyé</span>
      </div>
    );
  }

  const submit = () => {
    createReview.mutate({ driverId, deliveryId, rating, comment: comment.trim() || undefined }, {
      onSuccess: () => { toast({ title: "Avis envoyé" }); setOpen(false); },
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 text-xs mt-1.5 gap-1" onClick={() => setOpen(true)} data-testid={`button-review-driver-${deliveryId}`}>
        <Star className="w-3 h-3" /> Donner un avis
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Évaluer le chauffeur</DialogTitle>
          <div className="flex items-center gap-1 py-2">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} type="button" onClick={() => setRating(v)} data-testid={`star-driver-${v}`}>
                <Star className={`w-6 h-6 ${v <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
              </button>
            ))}
          </div>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Votre avis (optionnel)" data-testid="input-driver-review-comment" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={submit} disabled={createReview.isPending} data-testid="button-submit-driver-review">
              {createReview.isPending ? "Envoi…" : "Envoyer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

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

// ── Component ──────────────────────────────────────────────────────────────────

// ── Per-supplier-order cancellation modal ─────────────────────────────────────
// Lets the Coffee Owner select which specific product variants / packs to cancel
// within ONE still-PENDING supplier order. Only active (non-cancelled) items are
// offered — already-cancelled ones don't need to be selectable again. Reuses the
// exact same grouping helper the read-only item list above uses, so what's shown
// here is always the same data, never a second representation.
function CancelSubOrderModal({
  subOrder,
  onClose,
  t,
}: {
  subOrder: any | null;
  onClose: () => void;
  t: ReturnType<typeof useTheme>;
}) {
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const cancelItems = useCancelSubOrderItems();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const items: any[] = subOrder?.items ?? [];
  const activeItems = items.filter((item) => item.status !== "CANCELLED");
  const productGroups = groupOrderItemsByProduct(activeItems);
  const activePackItems = activeItems.filter((item) => !!item.packId);

  const toggle = (orderItemId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderItemId)) next.delete(orderItemId);
      else next.add(orderItemId);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!subOrder || selected.size === 0) return;
    cancelItems.mutate(
      { subOrderId: subOrder.id, orderItemIds: Array.from(selected) },
      {
        onSuccess: () => {
          toast({ title: "Articles annulés", description: `${selected.size} article(s) annulé(s).` });
          setSelected(new Set());
          onClose();
        },
        onError: (err: Error) => toast({ title: "Annulation impossible", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={!!subOrder} onOpenChange={(v) => { if (!v) { setSelected(new Set()); onClose(); } }}>
      <DialogContent className={`max-w-lg w-[calc(100%-2rem)] rounded-3xl border-0 shadow-2xl ${t.modalBg}`}>
        <DialogTitle className={t.textPrimary}>
          Annuler des articles {subOrder ? `— ${subOrder.supplierName}` : ""}
        </DialogTitle>
        {subOrder && (
          <>
            <p className={`text-xs ${t.textMuted}`}>
              Sélectionnez les produits, variantes ou packs à annuler pour ce fournisseur.
            </p>
            <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
              {productGroups.length === 0 && activePackItems.length === 0 && (
                <p className={`text-sm text-center py-6 ${t.textMuted}`}>Aucun article annulable.</p>
              )}
              {productGroups.map((group) => (
                <div key={group.productId} className={`border rounded-2xl p-3 ${t.innerCard}`}>
                  <p className={`font-semibold text-sm ${t.textPrimary}`}>{group.productName}</p>
                  <div className="mt-2 space-y-1.5">
                    {group.variants.map((variant) => (
                      <label
                        key={variant.key}
                        className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${t.dk ? "hover:bg-gray-700/50" : "hover:bg-gray-100"}`}
                      >
                        <Checkbox
                          checked={variant.orderItemId != null && selected.has(variant.orderItemId)}
                          onCheckedChange={() => variant.orderItemId != null && toggle(variant.orderItemId)}
                          data-testid={`checkbox-cancel-item-${variant.orderItemId}`}
                        />
                        <span className={`flex-1 text-xs ${t.textMuted}`}>
                          {[variant.flavorName, variant.sizeName].filter(Boolean).join(" · ") || "—"}
                        </span>
                        <span className={`text-xs font-semibold ${t.textPrimary}`}>
                          ×{variant.quantity} {fmt(variant.totalPrice)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {activePackItems.map((item) => {
                const snapshot = item.snapshot as any;
                const packSnapshot = snapshot?.kind === "PACK" ? snapshot : null;
                const itemName = packSnapshot?.packName ?? item.packName ?? "Pack";
                return (
                  <div key={`pack-${item.id}`} className={`border rounded-2xl p-3 ${t.innerCard}`}>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={() => toggle(item.id)}
                        data-testid={`checkbox-cancel-item-${item.id}`}
                      />
                      <span className={`flex-1 text-sm font-semibold ${t.textPrimary}`}>{itemName} ×{item.quantity}</span>
                      <span className={`text-xs font-semibold ${t.textPrimary}`}>{fmt((item.unitPrice ?? 0) * item.quantity)}</span>
                    </label>
                    <div className="mt-1 ml-7">
                      <PackCompositionView packId={item.packId} quantity={item.quantity} snapshot={packSnapshot} t={t} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={handleConfirm}
            disabled={selected.size === 0 || cancelItems.isPending}
            className="bg-red-600 hover:bg-red-700 text-white"
            data-testid="button-confirm-cancel-items"
          >
            {cancelItems.isPending ? "Annulation…" : `Confirmer l'annulation (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  order: OrderWithDetails | null;
  /** Show the Reorder button. Default: true. Pass false for Admin/Supplier views. */
  showReorder?: boolean;
  /** Show per-supplier-order cancellation (for Cafe Owner). Default: false. */
  showCancel?: boolean;
  /** Show the "View Invoice" action. Default: true. */
  showInvoice?: boolean;
  /** Show the "Payout Info" action. Default: true. */
  showPayoutInfo?: boolean;
};

export default function OrderDetailsModal({
  open, onClose, order,
  showReorder = true,
  showCancel = false,
  showInvoice = true,
  showPayoutInfo = true,
}: Props) {
  const { isDark, toggle } = useThemeStore();
  const t = useTheme(isDark);

  const { toast } = useToast();
  const { reorder, isReordering } = useReorderToCart();
  const fmt = useFormatCurrency();
  // Which sub-order's item-selection cancellation dialog is open, if any.
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [payoutInfoOpen, setPayoutInfoOpen] = useState(false);

  if (!order) return null;

  const statusMeta    = STATUS_META[order.status] ?? { label: order.status, badgeDk: "bg-gray-700 text-gray-300", badgeLt: "bg-gray-100 text-gray-700", icon: Box };
  const StatusIcon    = statusMeta.icon;
  // order.status is a single column that only advances once EVERY sub-order completes —
  // showing it as "the" order status at the top is misleading once there's more than one
  // supplier, since the per-supplier sections below (never touched here) are the real
  // source of truth. Null (one supplier, or none) keeps the existing single badge exactly
  // as before.
  const supplierStatuses = getSupplierStatusEntries(order);
  const priorityMeta  = PRIORITY_META[(order as any).priority ?? "NORMAL"] ?? PRIORITY_META.NORMAL;
  const scheduledAt   = (order as any).scheduledAt;
  const deliveryAddress   = (order as any).deliveryAddress as { address: string } | null;
  const courierInstructions = (order as any).courierInstructions as string | null;

  const handleReorder = () => reorder(order.id);

  const subOrders  = order.subOrders ?? [];
  const hasSubOrders = subOrders.length > 0;
  const currentProgressIndex = ORDER_PROGRESS_STAGES.findIndex((stage) => stage.status === order.status);
  const deliveryMethod = (order as any).deliveryMethod ?? "DELIVERY_SERVICE";
  const paymentMethod = (order as any).paymentMethod ?? "CASH_ON_DELIVERY";
  const paymentStatus = (order as any).paymentStatus ?? "PENDING";
  // Real computed fee (see storage.computeDeliveryFee) — sums this Coffee Owner's own share
  // across every sub-order delivery on this order (a Shop order can span multiple suppliers,
  // each with its own delivery). orders.deliveryFee itself stays 0/legacy (see
  // shared/schema.ts deliveries.deliveryFee comment) — the real value lives per-delivery.
  const deliveryFee = subOrders.reduce((sum, sub) => sum + (sub.delivery?.cafeOwnerFeeShareCents ?? 0), 0);
  const anyFreeDelivery = subOrders.some((sub) => sub.delivery?.freeDeliveryApplied);
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
    <>
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
              {/* Status badge — a single order-level status is only accurate for one
                  supplier; for a multi-supplier order it's replaced with a neutral count,
                  since each supplier's real status is already shown in its own section
                  below (never pretend one supplier's status stands for all of them). */}
              {supplierStatuses ? (
                <Badge
                  variant="outline"
                  className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${t.dk ? "bg-gray-700 text-gray-300 border-gray-600" : "bg-gray-100 text-gray-700 border-gray-200"}`}
                >
                  <Store className="w-3 h-3" />
                  {supplierStatuses.length} fournisseurs
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${t.badge(order.status, STATUS_META)}`}
                >
                  <StatusIcon className="w-3 h-3" />
                  {statusMeta.label}
                </Badge>
              )}

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
                      {!supplierStatuses && (
                        <p className={`text-xs mt-1 ${t.textMuted}`}>Status: {statusMeta.label}</p>
                      )}
                    </>
                  )}
                  <p className={`text-xs mt-1 ${t.textMuted}`}>Delivery fee: {anyFreeDelivery && deliveryFee === 0 ? <span className="text-green-500 font-medium">Free</span> : fmt(deliveryFee)}</p>
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
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${subStatusBadge}`}>
                            {SUBORDER_STATUS[sub.status]?.label ?? sub.status}
                          </span>
                          {/* Per-supplier-order cancellation — only while this specific
                              supplier order is still PENDING, never based on the parent
                              order's aggregate status. See Part 1 of the cancellation flow. */}
                          {showCancel && sub.status === "PENDING" && (
                            <button
                              onClick={() => setCancelTarget(sub)}
                              className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                                t.dk
                                  ? "border-red-500/40 text-red-400 hover:bg-red-500/10"
                                  : "border-red-300 text-red-600 hover:bg-red-50"
                              }`}
                              data-testid={`button-cancel-suborder-${sub.id}`}
                            >
                              <XCircle className="w-3 h-3" /> Annuler
                            </button>
                          )}
                        </div>
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

                      {/* Item rows — regular products grouped by base product (one card,
                          every purchased variant listed underneath), packs shown separately.
                          Same grouping helper the Cart/Order Summary use, adapted for order
                          items (see groupOrderItemsByProduct). */}
                      <div className={`divide-y ${t.rowDivide}`}>
                        {groupOrderItemsByProduct(sub.items ?? []).map((group) => (
                          <div key={`product-${group.productId}`} className="px-4 py-3">
                            <div className="flex items-start gap-2.5">
                              <div className={`w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center shrink-0 mt-0.5 ${t.dk ? "bg-gray-700" : "bg-gray-100"}`}>
                                {group.productImageUrl
                                  ? <img src={group.productImageUrl} alt="" className="w-full h-full object-cover" />
                                  : <Box className={`w-4 h-4 ${t.textMuted}`} />}
                              </div>
                              <div className="min-w-0 flex-1">
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
                                          <span className="ml-1.5">×{variant.quantity}</span>
                                        </span>
                                        <span className="flex items-center gap-1.5 shrink-0">
                                          {cancelled && (
                                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-400/50 text-red-500">Annulé</Badge>
                                          )}
                                          <span className={`text-xs font-semibold ${cancelled ? `line-through ${t.textSubtle}` : t.textPrimary}`}>
                                            {fmt(variant.totalPrice)}
                                          </span>
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <span className={`font-semibold text-sm ${t.textPrimary}`}>
                                  {fmt(group.subtotal)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                        {(sub.items ?? []).filter((item: any) => !!item.packId).map((item: any, idx: number) => {
                          const snapshot = item.snapshot as any;
                          const packSnapshot = snapshot?.kind === "PACK" ? snapshot : null;
                          const itemName = packSnapshot?.packName ?? item.packName ?? "Pack";
                          const itemImage = packSnapshot?.packImageUrl;
                          const cancelled = item.status === "CANCELLED";
                          return (
                            <div key={`pack-${item.id ?? idx}`} className="px-4 py-3">
                              <div className="flex items-start gap-2.5">
                                <div className={`w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center shrink-0 mt-0.5 ${cancelled ? (t.dk ? "bg-gray-700" : "bg-gray-100") : "bg-amber-500/15"}`}>
                                  {itemImage
                                    ? <img src={itemImage} alt="" className={`w-full h-full object-cover ${cancelled ? "opacity-40 grayscale" : ""}`} />
                                    : <Layers className={`w-4 h-4 ${cancelled ? t.textSubtle : "text-amber-500"}`} />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className={`font-medium text-sm ${cancelled ? `line-through ${t.textSubtle}` : t.textPrimary}`}>{itemName}</p>
                                    {cancelled && <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-400/50 text-red-500">Annulé</Badge>}
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
                                  <span className={`text-xs font-semibold block ${t.textMuted}`}>
                                    ×{item.quantity}
                                  </span>
                                  <span className={`font-semibold text-sm ${cancelled ? `line-through ${t.textSubtle}` : t.textPrimary}`}>
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
                            <DeliveryProgress
                              status={sub.delivery.status}
                              dropoffCode={["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(sub.delivery.status) ? sub.delivery.dropoffCode : null}
                              t={t}
                            />
                            {sub.delivery.status === "DELIVERED" && sub.delivery.driver && (
                              <DriverReviewButton driverId={sub.delivery.driver.id} deliveryId={sub.delivery.id} isDark={t.dk} />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Fallback: flat items when no subOrders — same grouping as above */
              <div className={`border rounded-2xl overflow-hidden ${t.cardBg}`}>
                <div className={`divide-y ${t.rowDivide}`}>
                  {groupOrderItemsByProduct(order.items ?? []).map((group) => (
                    <div key={`product-${group.productId}`} className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shrink-0 ${t.dk ? "bg-gray-700" : "bg-gray-100"}`}>
                          {group.productImageUrl
                            ? <img src={group.productImageUrl} alt="" className="w-full h-full object-cover" />
                            : <Box className={`w-4 h-4 ${t.textMuted}`} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`font-medium text-sm ${t.textPrimary}`}>{group.productName}</span>
                          {(group.brandName || group.categoryName || group.subCategoryName) && (
                            <p className={`text-[10px] truncate ${t.textMuted}`}>
                              {[group.brandName, group.categoryName, group.subCategoryName].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <span className={`text-sm shrink-0 ${t.textMuted}`}>{fmt(group.subtotal)}</span>
                      </div>
                      <div className="mt-1 ml-11 space-y-0.5">
                        {group.variants.map((variant) => (
                          <div key={variant.key} className="flex items-center justify-between gap-2">
                            <span className={`text-xs ${t.textMuted}`}>
                              {variant.quantity}× {[variant.flavorName, variant.sizeName].filter(Boolean).join(" · ") || "—"}
                            </span>
                            <span className={`text-xs shrink-0 ${t.textMuted}`}>{fmt(variant.totalPrice)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {(order.items ?? []).filter((item: any) => !!item.packId).map((item: any, idx: number) => {
                    const snapshot = item.snapshot as any;
                    const itemName = snapshot?.packName ?? item.packName ?? "Pack";
                    const image = snapshot?.packImageUrl;
                    return (
                      <div key={`pack-${item.id ?? idx}`} className="flex items-center justify-between px-4 py-3 gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shrink-0 bg-amber-500/15">
                            {image
                              ? <img src={image} alt="" className="w-full h-full object-cover" />
                              : <Layers className="w-4 h-4 text-amber-500" />}
                          </div>
                          <div className="min-w-0">
                            <span className={`text-xs font-bold ${t.textMuted}`}>{item.quantity}× </span>
                            <span className={`font-medium text-sm ${t.textPrimary}`}>{itemName}</span>
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
                  disabled={isReordering}
                  data-testid="button-reorder"
                >
                  <RotateCcw className="w-4 h-4" />
                  {isReordering ? "Chargement…" : "Recommander"}
                </Button>
              )}

              {/* Digital invoice — built live from this same order's data, see
                  components/financial/order-invoice-modal.tsx */}
              {showInvoice && (
                <Button
                  variant="outline"
                  className={`flex-1 min-w-[120px] rounded-xl h-11 font-semibold gap-2 transition-colors
                    ${t.dk
                      ? "border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white bg-transparent"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50 bg-white"
                    }`}
                  onClick={() => setInvoiceOpen(true)}
                  data-testid="button-view-invoice"
                >
                  <FileText className="w-4 h-4" />
                  Facture
                </Button>
              )}

              {/* Payout info — visible once at least one supplier sub-order exists */}
              {showPayoutInfo && hasSubOrders && (
                <Button
                  variant="outline"
                  className={`flex-1 min-w-[120px] rounded-xl h-11 font-semibold gap-2 transition-colors
                    ${t.dk
                      ? "border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white bg-transparent"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50 bg-white"
                    }`}
                  onClick={() => setPayoutInfoOpen(true)}
                  data-testid="button-payout-info"
                >
                  <Wallet className="w-4 h-4" />
                  Paiement
                </Button>
              )}
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>

    <CancelSubOrderModal subOrder={cancelTarget} onClose={() => setCancelTarget(null)} t={t} />
    <OrderInvoiceModal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} order={order} />
    <PayoutInfoModal open={payoutInfoOpen} onClose={() => setPayoutInfoOpen(false)} order={order} />
    </>
  );
}
