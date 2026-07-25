import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ShoppingBag, Store, Layers, MapPin, Clock, AlertTriangle,
  Minus, Plus, Trash2, Zap, ArrowRight, Calendar, CheckCircle
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { CartItem, PackCartItem } from "@/hooks/use-cart";
import type { CartPromotionEvaluation, GeoLocation, OrderPriority } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ConfirmOrderOpts = {
  modifiedItems: CartItem[];
  modifiedPackItems: PackCartItem[];
  priority: OrderPriority;
  scheduledAt: string | undefined;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  packItems: PackCartItem[];
  deliveryAddress: GeoLocation | null;
  courierInstructions: string;
  promoEval: CartPromotionEvaluation;
  isSubmitting: boolean;
  onConfirm: (opts: ConfirmOrderOpts) => void;
};

// ── Priority config ────────────────────────────────────────────────────────────

const PRIORITIES: { value: OrderPriority; label: string; color: string; ring: string }[] = [
  { value: "NORMAL",  label: "Normal",       color: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",          ring: "ring-gray-400" },
  { value: "HIGH",    label: "Haute priorité", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", ring: "ring-orange-400" },
  { value: "URGENT",  label: "Urgent",        color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",            ring: "ring-red-400" },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function OrderConfirmationModal({
  open, onClose, items, packItems, deliveryAddress, courierInstructions,
  promoEval, isSubmitting, onConfirm,
}: Props) {
  // Local editable copies of cart items
  const [localItems, setLocalItems] = useState<CartItem[]>([]);
  const [localPackItems, setLocalPackItems] = useState<PackCartItem[]>([]);
  const [priority, setPriority] = useState<OrderPriority>("NORMAL");
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(""); // "YYYY-MM-DD"
  const [scheduledTime, setScheduledTime] = useState("09:00");

  // Sync local state from props when modal opens
  useEffect(() => {
    if (open) {
      setLocalItems(items.map(i => ({ ...i })));
      setLocalPackItems(packItems.map(p => ({ ...p })));
      setPriority("NORMAL");
      setIsScheduled(false);
      setScheduledDate("");
      setScheduledTime("09:00");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Item editing ─────────────────────────────────────────────────────────────

  const updateItemQty = (listingId: number, flavorId: number | null, sizeId: number | null, qty: number) => {
    if (qty <= 0) {
      removeItem(listingId, flavorId, sizeId);
      return;
    }
    setLocalItems(prev => prev.map(i =>
      i.listingId === listingId && (i.flavorId ?? null) === (flavorId ?? null) && (i.sizeId ?? null) === (sizeId ?? null)
        ? { ...i, quantity: qty } : i
    ));
  };

  const removeItem = (listingId: number, flavorId: number | null, sizeId: number | null) => {
    setLocalItems(prev => prev.filter(i =>
      !(i.listingId === listingId && (i.flavorId ?? null) === (flavorId ?? null) && (i.sizeId ?? null) === (sizeId ?? null))
    ));
  };

  const updatePackQty = (packId: number, qty: number) => {
    if (qty <= 0) { setLocalPackItems(prev => prev.filter(p => p.packId !== packId)); return; }
    setLocalPackItems(prev => prev.map(p => p.packId === packId ? { ...p, quantity: qty } : p));
  };

  // ── Totals ───────────────────────────────────────────────────────────────────

  const itemsTotal = localItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const packsTotal = localPackItems.reduce((s, p) => s + p.unitPrice * p.quantity, 0);
  const discount = promoEval.totalDiscount;
  const grandTotal = Math.max(0, itemsTotal + packsTotal - discount);

  const isEmpty = localItems.length === 0 && localPackItems.length === 0;

  // Group items by supplier
  const bySupplier = new Map<number, { supplierName: string; items: CartItem[] }>();
  for (const item of localItems) {
    if (!bySupplier.has(item.supplierId)) bySupplier.set(item.supplierId, { supplierName: item.supplierName, items: [] });
    bySupplier.get(item.supplierId)!.items.push(item);
  }

  // ── Confirm ──────────────────────────────────────────────────────────────────

  const handleConfirm = () => {
    if (isEmpty || isSubmitting) return;
    let scheduledAt: string | undefined;
    if (isScheduled && scheduledDate) {
      scheduledAt = new Date(`${scheduledDate}T${scheduledTime || "09:00"}:00`).toISOString();
    }
    onConfirm({ modifiedItems: localItems, modifiedPackItems: localPackItems, priority, scheduledAt });
  };

  // ── Today's date for min date constraint ────────────────────────────────────
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isSubmitting) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <CheckCircle className="w-5 h-5 text-amber-500" />
            Récapitulatif de commande
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">Vérifiez votre commande avant de confirmer.</p>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── Items by supplier ── */}
          {Array.from(bySupplier.entries()).map(([supplierId, group]) => (
            <div key={supplierId} className="border border-border/50 rounded-xl overflow-hidden">
              <div className="bg-secondary/40 px-4 py-2.5 flex items-center gap-2 border-b border-border/50">
                <Store className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-sm">{group.supplierName}</span>
              </div>
              <div className="divide-y divide-border/40">
                {group.items.map(item => {
                  const variant = [item.flavorName, item.sizeName].filter(Boolean).join(" · ");
                  return (
                    <div key={`${item.listingId}-${item.flavorId ?? 0}-${item.sizeId ?? 0}`} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.productName}</p>
                        {variant && <p className="text-xs text-muted-foreground">{variant}</p>}
                        <p className="text-xs text-muted-foreground">{formatCurrency(item.unitPrice)} / unité</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center border border-border/60 rounded-lg overflow-hidden">
                          <button className="px-2 py-1 hover:bg-secondary/60 transition-colors" onClick={() => updateItemQty(item.listingId, item.flavorId, item.sizeId, item.quantity - 1)}>
                            <Minus className="w-3 h-3 text-muted-foreground" />
                          </button>
                          <span className="px-2.5 text-sm font-medium w-7 text-center">{item.quantity}</span>
                          <button className="px-2 py-1 hover:bg-secondary/60 transition-colors" onClick={() => updateItemQty(item.listingId, item.flavorId, item.sizeId, item.quantity + 1)}>
                            <Plus className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                        <span className="text-sm font-bold min-w-[60px] text-right">{formatCurrency(item.unitPrice * item.quantity)}</span>
                        <button className="text-muted-foreground hover:text-red-500 transition-colors ml-1" onClick={() => removeItem(item.listingId, item.flavorId, item.sizeId)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── Packs ── */}
          {localPackItems.map(pack => (
            <div key={pack.packId} className="border border-amber-200 dark:border-amber-700/40 rounded-xl overflow-hidden">
              <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 flex items-center gap-2 border-b border-amber-200 dark:border-amber-700/40">
                <Layers className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-sm text-amber-700 dark:text-amber-300">{pack.supplierName} · Pack</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{pack.packName}</p>
                  {pack.includedProducts.length > 0 && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {pack.includedProducts.map(ip => `${ip.quantity}× ${ip.productName}`).join(", ")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{formatCurrency(pack.unitPrice)} / pack</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center border border-border/60 rounded-lg overflow-hidden">
                    <button className="px-2 py-1 hover:bg-secondary/60 transition-colors" onClick={() => updatePackQty(pack.packId, pack.quantity - 1)}>
                      <Minus className="w-3 h-3 text-muted-foreground" />
                    </button>
                    <span className="px-2.5 text-sm font-medium w-7 text-center">{pack.quantity}</span>
                    <button className="px-2 py-1 hover:bg-secondary/60 transition-colors" onClick={() => updatePackQty(pack.packId, pack.quantity + 1)}>
                      <Plus className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                  <span className="text-sm font-bold min-w-[60px] text-right">{formatCurrency(pack.unitPrice * pack.quantity)}</span>
                  <button className="text-muted-foreground hover:text-red-500 transition-colors ml-1" onClick={() => setLocalPackItems(prev => prev.filter(p => p.packId !== pack.packId))}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* ── Empty cart warning ── */}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <AlertTriangle className="w-10 h-10 text-amber-500 mb-2" />
              <p className="font-medium">Panier vide</p>
              <p className="text-sm text-muted-foreground">Ajoutez des articles avant de confirmer.</p>
            </div>
          )}

          <Separator />

          {/* ── Delivery info ── */}
          {deliveryAddress && (
            <div className="flex items-start gap-3 p-3 bg-secondary/30 rounded-xl border border-border/50">
              <MapPin className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground mb-0.5">Adresse de livraison</p>
                <p className="text-sm font-medium truncate">{deliveryAddress.address}</p>
                {courierInstructions && <p className="text-xs text-muted-foreground mt-0.5">Instructions : {courierInstructions}</p>}
              </div>
            </div>
          )}

          {/* ── Priority ── */}
          <div className="space-y-2">
            <p className="text-sm font-semibold flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Priorité</p>
            <div className="flex gap-2 flex-wrap">
              {PRIORITIES.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${p.color} ${priority === p.value ? `ring-2 ${p.ring} border-transparent` : "border-border/40 hover:border-border"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Schedule ── */}
          <div className="space-y-2">
            <p className="text-sm font-semibold flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Planification</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsScheduled(false)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${!isScheduled ? "bg-primary text-primary-foreground border-primary" : "border-border/40 hover:border-border text-muted-foreground"}`}
              >
                Immédiat
              </button>
              <button
                type="button"
                onClick={() => setIsScheduled(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${isScheduled ? "bg-primary text-primary-foreground border-primary" : "border-border/40 hover:border-border text-muted-foreground"}`}
              >
                <Calendar className="w-3.5 h-3.5" /> Planifier
              </button>
            </div>
            {isScheduled && (
              <div className="flex gap-3 mt-2">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Date</label>
                  <input
                    type="date"
                    min={todayStr}
                    value={scheduledDate}
                    onChange={e => setScheduledDate(e.target.value)}
                    className="w-full border border-border/60 rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div className="w-32 space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Heure</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={e => setScheduledTime(e.target.value)}
                    className="w-full border border-border/60 rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Sticky totals + actions ── */}
        <div className="border-t border-border/50 px-6 py-4 space-y-3 shrink-0 bg-background">
          <div className="space-y-1 text-sm">
            {itemsTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Articles</span><span>{formatCurrency(itemsTotal)}</span>
              </div>
            )}
            {packsTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Packs</span><span>{formatCurrency(packsTotal)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between text-green-600 font-medium">
                <span>Réduction</span><span>−{formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1 border-t border-border/40">
              <span>Total</span><span className="text-amber-500">{formatCurrency(grandTotal)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={isSubmitting}>
              Annuler
            </Button>
            <Button
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleConfirm}
              disabled={isEmpty || isSubmitting}
              data-testid="button-confirm-order"
            >
              {isSubmitting
                ? "Traitement…"
                : <span className="flex items-center gap-1.5">Confirmer la commande <ArrowRight className="w-4 h-4" /></span>
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
