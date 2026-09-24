import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Box, Truck, CheckCircle2, AlertCircle, Clock, MapPin,
  Store, Layers, Calendar, Zap, X,
  Sun, Moon, User, ListX, Ticket, Wallet, KeyRound, Eye, EyeOff,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import { useUpdateSubOrderStatus, useUpdateTransportRequirements } from "@/hooks/use-orders";
import { VEHICLE_TYPE_LABELS, type DeliveryVehicleType } from "@/hooks/use-delivery-ecosystem";
import type { OrderWithDetails } from "@shared/schema";
import { PackCompositionView } from "@/components/order/pack-composition-view";
import { DeliveryProgress } from "@/components/order/delivery-progress";
import { OrderProgress } from "@/components/order/order-progress";
import { groupOrderItemsByProduct } from "@/lib/order-item-grouping";
import SupplierCancelItemsModal from "@/components/supplier/supplier-cancel-items-modal";

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

// Sub-order statuses at which the Supplier can still cancel part of their own order —
// identical to the boundary the status picklist below already enforces for the whole-order
// "Annuler"/"Refuser" action (SUPPLIER_NEXT_STATUSES never offers CANCELLED past PREPARING),
// and mirrors storage.cancelSupplierSubOrderItems's own server-side check.
const GRANULAR_CANCEL_STATUSES = new Set(["PENDING", "CONFIRMED", "PREPARING"]);

export default function SupplierOrderDetailsModal({ open, onClose, order, supplierId, readOnly = false }: Props) {
  const [isDark, setIsDark] = useState(true);
  const t = useTheme(isDark);
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const updateSubOrderStatus = useUpdateSubOrderStatus();
  const updateTransportRequirements = useUpdateTransportRequirements();
  const [cancelItemsTarget, setCancelItemsTarget] = useState<any | null>(null);
  const [showPickupCode, setShowPickupCode] = useState(false);
  // Transport requirements: once saved, shown as a read-only summary + "Modifier" button
  // rather than an always-editable form — toggled explicitly by the Supplier, not derived from
  // status. Reset to false whenever the sub-order changes (see the sync effect below) so
  // switching between orders never leaves a stale edit session open.
  const [isEditingTransport, setIsEditingTransport] = useState(false);
  const [transport, setTransport] = useState({
    requiredVehicleType: "" as string,
    totalWeightKg: "",
    totalVolumeL: "",
    numberOfPackages: "",
    numberOfItems: "",
    isFragile: false,
    specialHandling: "",
  });

  // Find the sub-order belonging to this supplier — computed before the early return below so
  // the sync effect can run unconditionally (Rules of Hooks): every hook in this component
  // must be called on every render, regardless of whether `order` is currently null.
  const subOrder = (order?.subOrders ?? []).find((so: any) => so.supplierId === supplierId);

  useEffect(() => {
    if (!subOrder) return;
    setTransport({
      requiredVehicleType: (subOrder as any).requiredVehicleType ?? "",
      totalWeightKg: (subOrder as any).totalWeightKg ?? "",
      totalVolumeL: (subOrder as any).totalVolumeL ?? "",
      numberOfPackages: (subOrder as any).numberOfPackages != null ? String((subOrder as any).numberOfPackages) : "",
      numberOfItems: (subOrder as any).numberOfItems != null ? String((subOrder as any).numberOfItems) : "",
      isFragile: !!(subOrder as any).isFragile,
      specialHandling: (subOrder as any).specialHandling ?? "",
    });
    setIsEditingTransport(false);
  }, [subOrder?.id, (subOrder as any)?.requiredVehicleType, (subOrder as any)?.totalWeightKg, (subOrder as any)?.totalVolumeL, (subOrder as any)?.numberOfPackages, (subOrder as any)?.numberOfItems, (subOrder as any)?.isFragile, (subOrder as any)?.specialHandling]);

  if (!order) return null;

  const subStatus = subOrder?.status ?? "PENDING";
  const nextStatuses = SUPPLIER_NEXT_STATUSES[subStatus] ?? [];
  const isSelfPickup = (order as any).deliveryMethod === "SELF_PICKUP";
  // Locked once "Out for Delivery" (IN_DELIVERY) or later — same status value/threshold the
  // backend now enforces (see storage.updateSubOrderTransportRequirements) and the same one
  // already rendered as "Out for Delivery" by OrderProgress's ORDER_PROGRESS_STAGES.
  const transportEditable = subOrder && !["IN_DELIVERY", "DELIVERED", "CANCELLED"].includes(subOrder.status);
  // Any field actually saved on the sub-order row itself (never a second/duplicate record —
  // see storage.updateSubOrderTransportRequirements, a plain UPDATE on this same row).
  const hasSavedTransportRequirements = !!subOrder && (
    !!(subOrder as any).requiredVehicleType || !!(subOrder as any).totalWeightKg || !!(subOrder as any).totalVolumeL ||
    (subOrder as any).numberOfPackages != null || !!(subOrder as any).specialHandling || !!(subOrder as any).isFragile
  );
  // Read-only summary shows once something is saved and the Supplier isn't actively editing;
  // the empty-state (always-editable form, "Aucune exigence" placeholder) is preserved exactly
  // as before for a sub-order with nothing saved yet.
  const showTransportSummary = hasSavedTransportRequirements && !isEditingTransport;

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

  const handleSaveTransport = () => {
    if (!subOrder) return;
    updateTransportRequirements.mutate({
      subOrderId: subOrder.id,
      requiredVehicleType: transport.requiredVehicleType || null,
      totalWeightKg: transport.totalWeightKg.trim() || null,
      totalVolumeL: transport.totalVolumeL.trim() || null,
      numberOfPackages: transport.numberOfPackages.trim() ? parseInt(transport.numberOfPackages, 10) : null,
      numberOfItems: transport.numberOfItems.trim() ? parseInt(transport.numberOfItems, 10) : null,
      isFragile: transport.isFragile,
      specialHandling: transport.specialHandling.trim() || null,
    }, {
      onSuccess: () => {
        toast({ title: "Exigences de transport enregistrées" });
        setIsEditingTransport(false);
      },
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  const items = subOrder?.items ?? [];

  return (
    <>
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

            {/* ── Order progress — same shared stepper/logic as the Admin and Coffee Owner
                modals, driven by this supplier's own sub-order status (never the parent
                order's aggregate status). ── */}
            <div className={`border rounded-2xl p-4 ${t.innerCard}`}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <p className={`text-sm font-semibold ${t.textPrimary}`}>Order progress</p>
                <Badge variant="outline" className={`text-[10px] rounded-lg ${t.badge(subStatus, STATUS_META)}`}>
                  {statusMeta.label}
                </Badge>
              </div>
              <OrderProgress status={subStatus} t={t} fulfillmentType={(order as any).deliveryMethod === "SELF_PICKUP" ? "SELF_PICKUP" : "DELIVERY_SERVICE"} />
            </div>

            {/* ── Delivery & payment — payment method/status, priority and planning belong
                to the parent order (shared across every supplier); delivery specifics for
                THIS supplier's own sub-order are shown further below, once its Delivery
                exists. ── */}
            <div className={`border rounded-2xl p-4 space-y-3 ${t.innerCard}`}>
              <p className={`text-sm font-semibold flex items-center gap-2 ${t.textPrimary}`}>
                <Wallet className="w-4 h-4 text-amber-500" />
                Delivery & payment
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className={`rounded-xl border p-3 ${t.dk ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100"}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Delivery</p>
                  <p className={`text-sm font-semibold mt-1 ${t.textPrimary}`}>
                    {((order as any).deliveryMethod ?? "DELIVERY_SERVICE") === "SELF_PICKUP" ? "Self Pickup" : "Delivery Service"}
                  </p>
                  {((order as any).deliveryMethod ?? "DELIVERY_SERVICE") === "SELF_PICKUP" && (
                    <p className={`text-xs mt-1 ${t.textMuted}`}>Collected directly from you.</p>
                  )}
                </div>
                <div className={`rounded-xl border p-3 ${t.dk ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100"}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Payment</p>
                  <p className={`text-sm font-semibold mt-1 ${t.textPrimary}`}>
                    {(() => {
                      const pm = (order as any).paymentMethod ?? "CASH_ON_DELIVERY";
                      return pm === "CASH_ON_DELIVERY" ? "Cash on Delivery"
                        : pm === "CREDIT_CARD" ? "Credit Card"
                        : pm === "MOBILE_PAYMENT" ? "Mobile Payment" : "Bank Transfer";
                    })()}
                  </p>
                  <p className={`text-xs mt-1 ${t.textMuted}`}>Status: {(order as any).paymentStatus ?? "PENDING"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className={`rounded-lg px-2.5 py-1 ${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
                  Priority: {priority === "URGENT" ? "Urgent" : priority === "HIGH" ? "Haute priorité" : "Normal"}
                </span>
                <span className={`rounded-lg px-2.5 py-1 ${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
                  Planning: {scheduledAt ? "Scheduled" : "Immediate"}
                </span>
              </div>
            </div>

            {/* ── Self Pickup — reveal the code to give the Coffee Owner in person. Never
                fetched pre-revealed: the raw code is included in this order's data (see
                storage.getOrders redaction — Supplier is one of the two roles allowed to read
                it), but stays masked client-side until the supplier explicitly asks to see
                it, mirroring how the Coffee Owner never sees it at all. ── */}
            {isSelfPickup && subOrder && (
              <div className={`border rounded-2xl p-4 space-y-3 ${t.innerCard}`}>
                <p className={`text-sm font-semibold flex items-center gap-2 ${t.textPrimary}`}>
                  <KeyRound className="w-4 h-4 text-amber-500" />
                  SELF PICKUP
                </p>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${t.textMuted}`}>Pickup status</span>
                  <Badge variant="outline" className={`text-xs ${["IN_DELIVERY", "DELIVERED"].includes(subStatus) ? "text-green-500 border-green-500/30" : "text-amber-500 border-amber-500/30"}`}>
                    {["IN_DELIVERY", "DELIVERED"].includes(subStatus) ? "Retiré" : "Waiting for customer"}
                  </Badge>
                </div>
                <div className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${t.dk ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100"}`}>
                  <div>
                    <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Pickup confirmation code</p>
                    <p className={`font-mono text-lg font-bold tracking-[0.3em] ${t.textPrimary}`}>
                      {showPickupCode ? ((subOrder as any).selfPickupCode ?? "——————") : "••••••"}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className={isDark ? "text-white border-white" : ""} onClick={() => setShowPickupCode((v) => !v)} data-testid="button-reveal-pickup-code">
                    {showPickupCode ? <EyeOff className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
                    {showPickupCode ? "Masquer" : "Reveal / Show Code"}
                  </Button>
                </div>
              </div>
            )}

            {/* ── Transport requirements (Delivery System V2) — informational + vehicle
                compatibility gating only (see storage.isVehicleCompatible); never affects
                pricing. Normal-delivery orders only — a self-pickup order has no driver to
                match a vehicle against. ── */}
            {!isSelfPickup && subOrder && (
              <div className={`border rounded-2xl p-4 space-y-3 ${t.innerCard}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-semibold flex items-center gap-2 ${t.textPrimary}`}>
                    <Truck className="w-4 h-4 text-amber-500" />
                    Transport requirements
                  </p>
                  {showTransportSummary && transportEditable && (
                    <Button size="sm" variant="outline" className={isDark ? "text-white border-white" : ""} onClick={() => setIsEditingTransport(true)} data-testid="button-edit-transport-requirements">
                      Modifier
                    </Button>
                  )}
                </div>

                {/* Read-only summary once something is saved and not actively editing —
                    preserves the same fields (vehicle/weight/volume/packages/special handling)
                    as plain text instead of an always-editable form. */}
                {showTransportSummary ? (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Required vehicle</p>
                      <p className={t.textPrimary}>{transport.requiredVehicleType ? VEHICLE_TYPE_LABELS[transport.requiredVehicleType as DeliveryVehicleType] : "Aucune exigence"}</p>
                    </div>
                    <div>
                      <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Poids total (kg)</p>
                      <p className={t.textPrimary}>{transport.totalWeightKg || "—"}</p>
                    </div>
                    <div>
                      <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Volume total (L)</p>
                      <p className={t.textPrimary}>{transport.totalVolumeL || "—"}</p>
                    </div>
                    <div>
                      <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Nb. colis</p>
                      <p className={t.textPrimary}>{transport.numberOfPackages || "—"}</p>
                    </div>
                    {transport.specialHandling && (
                      <div className="col-span-2">
                        <p className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Manipulation spéciale</p>
                        <p className={t.textPrimary}>{transport.specialHandling}</p>
                      </div>
                    )}
                    {transport.isFragile && (
                      <div className="col-span-2">
                        <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">Fragile — manipuler avec précaution</Badge>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Required vehicle</label>
                        <Select
                          value={transport.requiredVehicleType || "__none__"}
                          onValueChange={(v) => setTransport((f) => ({ ...f, requiredVehicleType: v === "__none__" ? "" : v }))}
                          disabled={!transportEditable}
                        >
                          <SelectTrigger className={`h-9 text-sm ${isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200"}`} data-testid="select-required-vehicle">
                            <SelectValue placeholder="Aucune exigence" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Aucune exigence</SelectItem>
                            {(Object.keys(VEHICLE_TYPE_LABELS) as DeliveryVehicleType[]).map((v) => (
                              <SelectItem key={v} value={v}>{VEHICLE_TYPE_LABELS[v]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Poids total (kg)</label>
                        <Input
                          value={transport.totalWeightKg}
                          onChange={(e) => setTransport((f) => ({ ...f, totalWeightKg: e.target.value }))}
                          placeholder="0.0"
                          disabled={!transportEditable}
                          className={`h-9 text-sm ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                          data-testid="input-total-weight"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Volume total (L)</label>
                        <Input
                          value={transport.totalVolumeL}
                          onChange={(e) => setTransport((f) => ({ ...f, totalVolumeL: e.target.value }))}
                          placeholder="0.0"
                          disabled={!transportEditable}
                          className={`h-9 text-sm ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                          data-testid="input-total-volume"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Nb. colis</label>
                        <Input
                          type="number" min={0}
                          value={transport.numberOfPackages}
                          onChange={(e) => setTransport((f) => ({ ...f, numberOfPackages: e.target.value }))}
                          placeholder="0"
                          disabled={!transportEditable}
                          className={`h-9 text-sm ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                          data-testid="input-number-packages"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className={`text-[10px] font-semibold uppercase tracking-wide ${t.textSubtle}`}>Manipulation spéciale (optionnel)</label>
                      <Input
                        value={transport.specialHandling}
                        onChange={(e) => setTransport((f) => ({ ...f, specialHandling: e.target.value }))}
                        placeholder="ex : garder au frais, ne pas empiler…"
                        disabled={!transportEditable}
                        className={`h-9 text-sm ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                        data-testid="input-special-handling"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={transport.isFragile}
                        onChange={(e) => setTransport((f) => ({ ...f, isFragile: e.target.checked }))}
                        disabled={!transportEditable}
                        className="w-3.5 h-3.5 rounded accent-primary"
                        data-testid="checkbox-is-fragile"
                      />
                      <span className={t.textMuted}>Fragile — manipuler avec précaution</span>
                    </label>
                    {transportEditable && (
                      <div className="flex gap-2">
                        <Button size="sm" className={isDark ? "text-white border-white" : ""} onClick={handleSaveTransport} disabled={updateTransportRequirements.isPending} data-testid="button-save-transport-requirements">
                          {updateTransportRequirements.isPending ? "Enregistrement…" : "Enregistrer"}
                        </Button>
                        {hasSavedTransportRequirements && (
                          <Button size="sm" variant="outline" className={isDark ? "text-white border-white" : ""}
                            onClick={() => {
                              setTransport({
                                requiredVehicleType: (subOrder as any).requiredVehicleType ?? "",
                                totalWeightKg: (subOrder as any).totalWeightKg ?? "",
                                totalVolumeL: (subOrder as any).totalVolumeL ?? "",
                                numberOfPackages: (subOrder as any).numberOfPackages != null ? String((subOrder as any).numberOfPackages) : "",
                                numberOfItems: (subOrder as any).numberOfItems != null ? String((subOrder as any).numberOfItems) : "",
                                isFragile: !!(subOrder as any).isFragile,
                                specialHandling: (subOrder as any).specialHandling ?? "",
                              });
                              setIsEditingTransport(false);
                            }}
                            data-testid="button-cancel-edit-transport-requirements">
                            Annuler
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

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
                        <div className={`w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center shrink-0 mt-0.5 ${isDark ? "bg-gray-700" : "bg-gray-100"}`}>
                          {group.productImageUrl
                            ? <img src={group.productImageUrl} alt="" className="w-full h-full object-cover" />
                            : <Box className={`w-4 h-4 ${t.textMuted}`} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm ${t.textPrimary}`}>{group.productName}</p>
                          {(group.brandName || group.categoryName || group.subCategoryName) && (
                            <p className={`text-[10px] mt-0.5 ${t.textMuted}`}>
                              {[group.brandName, group.categoryName, group.subCategoryName].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`font-semibold text-sm ${t.textPrimary}`}>{fmt(group.subtotal)}</span>
                        </div>
                      </div>
                      {/* Variants — full width beneath the image/name row instead of being
                          squeezed into the narrow middle column (same principle already used
                          for pack composition below). */}
                      <div className="mt-1.5 space-y-1.5 min-w-0">
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
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-400/50 text-red-500">Annulé par le café</Badge>
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
                  ))}
                  {items.filter((item: any) => !!item.packId).map((item: any, idx: number) => {
                    const snapshot = item.snapshot as any;
                    const packSnapshot = snapshot?.kind === "PACK" ? snapshot : null;
                    const itemName = packSnapshot?.packName ?? item.packName;
                    const itemImage = packSnapshot?.packImageUrl;
                    const cancelled = item.status === "CANCELLED";
                    return (
                      <div key={`pack-${item.id ?? idx}`} className="px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <div className={`w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center shrink-0 mt-0.5 ${cancelled ? (isDark ? "bg-gray-700" : "bg-gray-100") : "bg-amber-500/15"}`}>
                            {itemImage
                              ? <img src={itemImage} alt="" className={`w-full h-full object-cover ${cancelled ? "opacity-40 grayscale" : ""}`} />
                              : <Layers className={`w-4 h-4 ${cancelled ? t.textSubtle : "text-amber-500"}`} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className={`font-medium text-sm ${cancelled ? `line-through ${t.textSubtle}` : t.textPrimary}`}>{itemName}</p>
                              {cancelled && <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-400/50 text-red-500">Annulé par le café</Badge>}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={`text-xs font-semibold block ${t.textMuted}`}>×{item.quantity}</span>
                            <span className={`font-semibold text-sm ${cancelled ? `line-through ${t.textSubtle}` : t.textPrimary}`}>
                              {fmt((item.unitPrice ?? 0) * item.quantity)}
                            </span>
                          </div>
                        </div>
                        {/* Pack composition — full width beneath the image/name row instead of
                            being squeezed into the narrow middle column (same principle used for
                            normal products above). */}
                        {!cancelled && (
                          <div className="mt-1.5 min-w-0">
                            <PackCompositionView
                              packId={item.packId}
                              quantity={item.quantity}
                              snapshot={packSnapshot}
                              t={t}
                            />
                          </div>
                        )}
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

                {/* Discount / promotion — same persisted sub-order snapshot the Admin and
                    Coffee Owner Order Details modals already read, never recomputed here. */}
                {subOrder && (subOrder as any).discountAmount > 0 && (
                  <div className="px-4 pb-2.5 flex justify-between text-xs text-green-500 font-medium">
                    <span>Réduction ({(subOrder as any).promotionName ?? "Promotion"})</span>
                    <span>−{fmt((subOrder as any).discountAmount)}</span>
                  </div>
                )}
                {subOrder && (subOrder as any).discountCodeAmount > 0 && (
                  <div className="px-4 pb-2.5 flex justify-between text-xs text-green-500 font-medium">
                    <span className="flex items-center gap-1"><Ticket className="w-3 h-3" />Code {(subOrder as any).discountCodeSnapshot ?? "promo"}</span>
                    <span>−{fmt((subOrder as any).discountCodeAmount)}</span>
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
                      {/* This supplier's own delivery-fee responsibility — real persisted
                          figures from the same deliveries row every other surface reads
                          (see storage.computeDeliveryFee); never a second calculation. */}
                      <div className={`mt-2 pt-2 border-t space-y-0.5 ${isDark ? "border-gray-700/50" : "border-gray-200"}`}>
                        <div className={`flex justify-between text-xs ${t.textMuted}`}>
                          <span>Frais de livraison total</span>
                          <span className={t.textPrimary}>{fmt((subOrder as any).delivery.deliveryFee)}</span>
                        </div>
                        <div className={`flex justify-between text-xs ${t.textMuted}`}>
                          <span>Pris en charge par vous{(subOrder as any).delivery.freeDeliveryApplied ? " (livraison offerte)" : ""}</span>
                          <span className={t.textPrimary}>{fmt((subOrder as any).delivery.supplierFeeShareCents ?? 0)}</span>
                        </div>
                        {/* Two-Leg Delivery Distance Model — the Supplier's own, separate
                            pickup-leg obligation (driver → supplier collection distance) —
                            never part of the Coffee Owner's delivery fee above. */}
                        {(subOrder as any).delivery.pickupLegFeeCents != null && (
                          <div className={`flex justify-between text-xs ${t.textMuted}`}>
                            <span>Frais de collecte (trajet chauffeur → vous)</span>
                            <span className={t.textPrimary}>{fmt((subOrder as any).delivery.pickupLegFeeCents)}</span>
                          </div>
                        )}
                      </div>
                      <DeliveryProgress
                        status={(subOrder as any).delivery.status}
                        pickupCode={(subOrder as any).delivery.status === "ASSIGNED" ? (subOrder as any).delivery.pickupCode : null}
                        t={t}
                      />
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

            {/* Cancel specific items — a Pack, a product, a variant, or part of a line's
                quantity — instead of only being able to refuse the whole order above. */}
            {!readOnly && subOrder && items.length > 0 && GRANULAR_CANCEL_STATUSES.has(subStatus) && (
              <Button
                variant="outline"
                className={`w-full rounded-xl h-10 font-semibold gap-2 border transition-colors ${
                  isDark
                    ? "border-red-500/40 text-red-400 hover:bg-red-500/10 bg-transparent"
                    : "border-red-300 text-red-600 hover:bg-red-50 bg-white"
                }`}
                onClick={() => setCancelItemsTarget(subOrder)}
                data-testid="button-open-supplier-cancel-items"
              >
                <ListX className="w-4 h-4" />
                Annuler des articles
              </Button>
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

    <SupplierCancelItemsModal subOrder={cancelItemsTarget} onClose={() => setCancelItemsTarget(null)} t={t} />
    </>
  );
}
