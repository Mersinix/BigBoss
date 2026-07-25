import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Box, Truck, CheckCircle2, AlertCircle, Clock, MapPin,
  Store, Layers, RotateCcw, Calendar, Zap, Package
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { OrderWithDetails } from "@shared/schema";

// ── Status helpers ──────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  PENDING:    { label: "En attente",   color: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-300", icon: Clock },
  CONFIRMED:  { label: "Confirmée",    color: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300",           icon: CheckCircle2 },
  PREPARING:  { label: "En préparation", color: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/20 dark:text-orange-300", icon: Box },
  READY:      { label: "Prête",        color: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-500/20 dark:text-teal-300",           icon: Box },
  IN_DELIVERY:{ label: "En livraison", color: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300", icon: Truck },
  DELIVERED:  { label: "Livrée",       color: "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/20 dark:text-green-300",      icon: CheckCircle2 },
  CANCELLED:  { label: "Annulée",      color: "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/20 dark:text-red-300",               icon: AlertCircle },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  NORMAL: { label: "Normal",         color: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" },
  HIGH:   { label: "Haute priorité", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  URGENT: { label: "Urgent",         color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

const SUBORDER_STATUS: Record<string, { label: string; color: string }> = {
  PENDING:     { label: "En attente",   color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300" },
  CONFIRMED:   { label: "Confirmée",    color: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300" },
  PREPARING:   { label: "En préparation", color: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300" },
  READY:       { label: "Prête",        color: "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300" },
  IN_DELIVERY: { label: "En livraison", color: "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300" },
  DELIVERED:   { label: "Livrée",       color: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300" },
  CANCELLED:   { label: "Annulée",      color: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300" },
};

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  order: OrderWithDetails | null;
};

export default function OrderDetailsModal({ open, onClose, order }: Props) {
  const { addItem, addPackItem, clearCart, clearPackItems } = useCart();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [reordering, setReordering] = useState(false);

  if (!order) return null;

  const statusMeta = STATUS_META[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-800", icon: Box };
  const StatusIcon = statusMeta.icon;
  const priorityMeta = PRIORITY_META[(order as any).priority ?? "NORMAL"] ?? PRIORITY_META.NORMAL;
  const scheduledAt = (order as any).scheduledAt;
  const deliveryAddress = (order as any).deliveryAddress as { address: string } | null;
  const courierInstructions = (order as any).courierInstructions as string | null;

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

      // Clear existing cart and populate
      clearCart();
      clearPackItems();

      for (const item of data.items) {
        addItem({
          listingId: item.listingId,
          productId: item.productId,
          supplierId: item.supplierId,
          supplierName: item.supplierName,
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
          includedProducts: [],
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

      toast({ title: "Panier reconstruit", description: desc });
      onClose();
      setLocation("/cart");
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setReordering(false);
    }
  };

  const subOrders = order.subOrders ?? [];
  const hasSubOrders = subOrders.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          {/* Order number + status */}
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="font-mono text-lg">
              Commande #{String(order.id).padStart(6, "0")}
            </DialogTitle>
            <Badge variant="outline" className={`${statusMeta.color} border flex items-center gap-1 text-xs font-bold px-2 py-0.5`}>
              <StatusIcon className="w-3 h-3" />{statusMeta.label}
            </Badge>
          </div>
          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(order.createdAt as any)}
            </span>
            {(order as any).priority && (order as any).priority !== "NORMAL" && (
              <Badge variant="secondary" className={`${priorityMeta.color} text-xs`}>
                <Zap className="w-3 h-3 mr-0.5" />{priorityMeta.label}
              </Badge>
            )}
            {scheduledAt && (
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                <Calendar className="w-3.5 h-3.5" />
                Livraison planifiée : {formatDate(scheduledAt)}
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── Delivery info ── */}
          {(deliveryAddress || courierInstructions) && (
            <div className="p-3 bg-secondary/30 border border-border/50 rounded-xl space-y-1.5">
              {deliveryAddress && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Adresse de livraison</p>
                    <p className="text-sm font-medium">{deliveryAddress.address}</p>
                  </div>
                </div>
              )}
              {courierInstructions && (
                <div className="flex items-start gap-2 pt-1 border-t border-border/30">
                  <Package className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Instructions coursier</p>
                    <p className="text-sm">{courierInstructions}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SubOrders by supplier ── */}
          {hasSubOrders ? (
            <div className="space-y-3">
              {subOrders.map((sub: any) => {
                const subStatus = SUBORDER_STATUS[sub.status] ?? { label: sub.status, color: "bg-gray-100 text-gray-800" };
                return (
                  <div key={sub.id} className="border border-border/50 rounded-xl overflow-hidden">
                    <div className="bg-secondary/40 px-4 py-2.5 flex items-center justify-between gap-2 border-b border-border/50">
                      <div className="flex items-center gap-2">
                        <Store className="w-4 h-4 text-amber-500" />
                        <span className="font-semibold text-sm">{sub.supplierName}</span>
                      </div>
                      <Badge variant="secondary" className={`${subStatus.color} text-xs`}>{subStatus.label}</Badge>
                    </div>
                    <div className="divide-y divide-border/30">
                      {(sub.items ?? []).map((item: any, idx: number) => {
                        const variant = [item.flavorName, item.sizeName].filter(Boolean).join(" · ");
                        const isPackItem = !!item.packId;
                        return (
                          <div key={idx} className="flex items-center justify-between px-4 py-2.5 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              {isPackItem
                                ? <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                : <Box className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              }
                              <div className="min-w-0">
                                <p className="font-medium truncate">
                                  {isPackItem ? item.packName : item.product?.name}
                                </p>
                                {variant && <p className="text-xs text-muted-foreground">{variant}</p>}
                              </div>
                              <span className="text-muted-foreground text-xs shrink-0">×{item.quantity}</span>
                            </div>
                            <span className="font-medium shrink-0 ml-4">
                              {formatCurrency((item.unitPrice ?? 0) * item.quantity)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {/* SubOrder subtotal */}
                    <div className="px-4 py-2 border-t border-border/30 flex justify-between text-sm">
                      <span className="text-muted-foreground">Sous-total {sub.supplierName}</span>
                      <span className="font-semibold">{formatCurrency(sub.subtotal)}</span>
                    </div>
                    {sub.discountAmount > 0 && (
                      <div className="px-4 pb-2 flex justify-between text-xs text-green-600 dark:text-green-400">
                        <span>Réduction ({sub.promotionName ?? 'Promotion'})</span>
                        <span>−{formatCurrency(sub.discountAmount)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Fallback: show flat items if no subOrders */
            <div className="border border-border/50 rounded-xl overflow-hidden">
              <div className="divide-y divide-border/30">
                {(order.items ?? []).map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-bold text-xs w-6">{item.quantity}×</span>
                      <span className="font-medium">{item.product?.name}</span>
                    </div>
                    <span className="text-muted-foreground">{formatCurrency((item.unitPrice ?? 0) * item.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer: total + actions ── */}
        <div className="border-t border-border/50 px-6 py-4 shrink-0 space-y-3 bg-background">
          <div className="flex justify-between items-center font-bold text-base">
            <span>Total commande</span>
            <span className="text-amber-500 text-xl">{formatCurrency(order.totalAmount)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Fermer</Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleReorder}
              disabled={reordering}
              data-testid="button-reorder"
            >
              <RotateCcw className="w-4 h-4" />
              {reordering ? "Chargement…" : "Recommander"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
