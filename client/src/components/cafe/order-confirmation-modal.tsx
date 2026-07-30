import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Store, Layers, MapPin, Clock, AlertTriangle,
  Minus, Plus, Trash2, Zap, ArrowRight, Calendar, CheckCircle,
  Sun, Moon, X,
} from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-currency";
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

const PRIORITIES: { value: OrderPriority; label: string; ringDk: string; ringLt: string }[] = [
  { value: "NORMAL",  label: "Normal",          ringDk: "ring-gray-600",   ringLt: "ring-gray-400" },
  { value: "HIGH",    label: "Haute priorité",  ringDk: "ring-orange-500", ringLt: "ring-orange-400" },
  { value: "URGENT",  label: "Urgent",          ringDk: "ring-red-500",    ringLt: "ring-red-400" },
];

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
    packCard:     dk ? "bg-amber-900/20 border-amber-800/50" : "bg-amber-50 border-amber-200",
    packHeader:   dk ? "bg-amber-900/30 border-amber-800/50" : "bg-amber-100/80 border-amber-200",
    rowDivide:    dk ? "divide-gray-700/50"                  : "divide-gray-100",
    dividerBg:    dk ? "bg-gray-800"                         : "bg-gray-100",
    textPrimary:  dk ? "text-white"                          : "text-gray-900",
    textMuted:    dk ? "text-gray-400"                       : "text-gray-500",
    textSubtle:   dk ? "text-gray-500"                       : "text-gray-400",
    iconBtn:      dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
                     : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800",
    stepperBorder: dk ? "border-gray-700"                    : "border-gray-200",
    stepperBtn:   dk ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "hover:bg-gray-100 text-gray-500",
    segBtn:       (active: boolean) => active
                    ? (dk ? "bg-gray-700 text-white border-gray-600"         : "bg-gray-900 text-white border-gray-900")
                    : (dk ? "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300"
                           : "border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700"),
    priorityBtn:  (active: boolean, val: OrderPriority) => {
      const baseColors: Record<OrderPriority, string> = {
        NORMAL: active ? (dk ? "bg-gray-700 text-white border-gray-600"         : "bg-gray-900 text-white border-gray-900")
                       : (dk ? "border-gray-700 text-gray-400 hover:border-gray-600" : "border-gray-200 text-gray-500 hover:border-gray-400"),
        HIGH:   active ? (dk ? "bg-orange-500/30 text-orange-300 border-orange-500/60" : "bg-orange-500 text-white border-orange-500")
                       : (dk ? "border-gray-700 text-gray-400 hover:border-orange-700" : "border-gray-200 text-gray-500 hover:border-orange-300"),
        URGENT: active ? (dk ? "bg-red-500/30 text-red-300 border-red-500/60"   : "bg-red-500 text-white border-red-500")
                       : (dk ? "border-gray-700 text-gray-400 hover:border-red-700" : "border-gray-200 text-gray-500 hover:border-red-300"),
      };
      return baseColors[val];
    },
    inputCls:     dk ? "bg-gray-800 border-gray-700 text-gray-200 placeholder:text-gray-500 focus:ring-amber-500/40"
                     : "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:ring-amber-500/40",
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function OrderConfirmationModal({
  open, onClose, items, packItems, deliveryAddress, courierInstructions,
  promoEval, isSubmitting, onConfirm,
}: Props) {
  const [isDark, setIsDark] = useState(true);
  const t = useTheme(isDark);
  const fmt = useFormatCurrency();

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
    if (qty <= 0) { removeItem(listingId, flavorId, sizeId); return; }
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
  const discount   = promoEval.totalDiscount;
  const grandTotal = Math.max(0, itemsTotal + packsTotal - discount);
  const isEmpty    = localItems.length === 0 && localPackItems.length === 0;

  // Group items by supplier
  const bySupplier = new Map<number, { supplierName: string; items: CartItem[] }>();
  for (const item of localItems) {
    if (!bySupplier.has(item.supplierId))
      bySupplier.set(item.supplierId, { supplierName: item.supplierName, items: [] });
    bySupplier.get(item.supplierId)!.items.push(item);
  }

  // ── Confirm ──────────────────────────────────────────────────────────────────

  const handleConfirm = () => {
    if (isEmpty || isSubmitting) return;
    let scheduledAt: string | undefined;
    if (isScheduled && scheduledDate)
      scheduledAt = new Date(`${scheduledDate}T${scheduledTime || "09:00"}:00`).toISOString();
    onConfirm({ modifiedItems: localItems, modifiedPackItems: localPackItems, priority, scheduledAt });
  };

  const todayStr = new Date().toISOString().split("T")[0];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isSubmitting) onClose(); }}>
      <DialogContent
        className="max-w-2xl w-[calc(100%-2rem)] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden"
      >
        {/* Accessible title (visually hidden — custom header below) */}
        <DialogTitle className="sr-only">Récapitulatif de commande</DialogTitle>

        <div className={`flex flex-col max-h-[90vh] overflow-hidden transition-colors duration-200 ${t.modalBg}`}>

          {/* ── Header ── */}
          <div className={`shrink-0 border-b px-6 pt-5 pb-4 ${t.headerBg}`}>
            <div className="flex items-center justify-between mb-3">
              {/* Close */}
              <button
                onClick={() => { if (!isSubmitting) onClose(); }}
                aria-label="Fermer"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${t.iconBtn}`}
              >
                <X className="w-4 h-4" />
              </button>

              {/* Title */}
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-amber-500" />
                <span className={`text-[15px] font-bold tracking-tight ${t.textPrimary}`}>
                  Récapitulatif de commande
                </span>
              </div>

              {/* Theme toggle */}
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
            <p className={`text-sm text-center ${t.textMuted}`}>
              Vérifiez votre commande avant de confirmer.
            </p>
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

            {/* ── Items by supplier ── */}
            {Array.from(bySupplier.entries()).map(([supplierId, group]) => (
              <div key={supplierId} className={`border rounded-2xl overflow-hidden ${t.cardBg}`}>
                {/* Supplier header */}
                <div className={`px-4 py-3 flex items-center gap-2.5 border-b ${t.cardHeader}`}>
                  <div className="w-7 h-7 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                    <Store className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <span className={`font-semibold text-sm ${t.textPrimary}`}>{group.supplierName}</span>
                </div>

                {/* Item rows */}
                <div className={`divide-y ${t.rowDivide}`}>
                  {group.items.map(item => {
                    const variant = [item.flavorName, item.sizeName].filter(Boolean).join(" · ");
                    return (
                      <div
                        key={`${item.listingId}-${item.flavorId ?? 0}-${item.sizeId ?? 0}`}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm truncate ${t.textPrimary}`}>{item.productName}</p>
                          {variant && <p className={`text-xs mt-0.5 ${t.textMuted}`}>{variant}</p>}
                          <p className={`text-xs mt-0.5 ${t.textSubtle}`}>{fmt(item.unitPrice)} / unité</p>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          {/* Stepper */}
                          <div className={`flex items-center border rounded-xl overflow-hidden ${t.stepperBorder}`}>
                            <button
                              className={`px-2.5 py-1.5 transition-colors ${t.stepperBtn}`}
                              onClick={() => updateItemQty(item.listingId, item.flavorId, item.sizeId, item.quantity - 1)}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className={`px-3 text-sm font-bold w-8 text-center ${t.textPrimary}`}>
                              {item.quantity}
                            </span>
                            <button
                              className={`px-2.5 py-1.5 transition-colors ${t.stepperBtn}`}
                              onClick={() => updateItemQty(item.listingId, item.flavorId, item.sizeId, item.quantity + 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className={`text-sm font-bold min-w-[64px] text-right ${t.textPrimary}`}>
                            {fmt(item.unitPrice * item.quantity)}
                          </span>
                          <button
                            className={`transition-colors ${t.textMuted} hover:text-red-400`}
                            onClick={() => removeItem(item.listingId, item.flavorId, item.sizeId)}
                          >
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
              <div key={pack.packId} className={`border rounded-2xl overflow-hidden ${t.packCard}`}>
                {/* Pack header */}
                <div className={`px-4 py-3 flex items-center gap-2.5 border-b ${t.packHeader}`}>
                  <div className="w-7 h-7 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                    <Layers className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <span className="font-semibold text-sm text-amber-500">{pack.supplierName} · Pack</span>
                </div>

                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${t.textPrimary}`}>{pack.packName}</p>
                    {pack.includedProducts.length > 0 && (
                      <p className={`text-xs mt-0.5 line-clamp-1 ${t.textMuted}`}>
                        {pack.includedProducts.map(ip => `${ip.quantity}× ${ip.productName}`).join(", ")}
                      </p>
                    )}
                    <p className={`text-xs mt-0.5 ${t.textSubtle}`}>{fmt(pack.unitPrice)} / pack</p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className={`flex items-center border rounded-xl overflow-hidden ${t.stepperBorder}`}>
                      <button
                        className={`px-2.5 py-1.5 transition-colors ${t.stepperBtn}`}
                        onClick={() => updatePackQty(pack.packId, pack.quantity - 1)}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className={`px-3 text-sm font-bold w-8 text-center ${t.textPrimary}`}>
                        {pack.quantity}
                      </span>
                      <button
                        className={`px-2.5 py-1.5 transition-colors ${t.stepperBtn}`}
                        onClick={() => updatePackQty(pack.packId, pack.quantity + 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className={`text-sm font-bold min-w-[64px] text-right ${t.textPrimary}`}>
                      {fmt(pack.unitPrice * pack.quantity)}
                    </span>
                    <button
                      className={`transition-colors ${t.textMuted} hover:text-red-400`}
                      onClick={() => setLocalPackItems(prev => prev.filter(p => p.packId !== pack.packId))}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* ── Empty cart warning ── */}
            {isEmpty && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-3">
                  <AlertTriangle className="w-7 h-7 text-amber-500" />
                </div>
                <p className={`font-semibold ${t.textPrimary}`}>Panier vide</p>
                <p className={`text-sm mt-1 ${t.textMuted}`}>Ajoutez des articles avant de confirmer.</p>
              </div>
            )}

            {/* ── Divider ── */}
            <div className={`h-px w-full ${t.dividerBg}`} />

            {/* ── Delivery info ── */}
            {deliveryAddress && (
              <div className={`border rounded-2xl p-4 ${t.innerCard}`}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold mb-1 ${t.textMuted}`}>Adresse de livraison</p>
                    <p className={`text-sm font-medium ${t.textPrimary}`}>{deliveryAddress.address}</p>
                    {courierInstructions && (
                      <p className={`text-xs mt-1 ${t.textMuted}`}>Instructions : {courierInstructions}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Priority ── */}
            <div className="space-y-2.5">
              <p className={`text-sm font-semibold flex items-center gap-2 ${t.textPrimary}`}>
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Priorité
              </p>
              <div className="flex gap-2 flex-wrap">
                {PRIORITIES.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all border ${t.priorityBtn(priority === p.value, p.value)}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Schedule ── */}
            <div className="space-y-2.5">
              <p className={`text-sm font-semibold flex items-center gap-2 ${t.textPrimary}`}>
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                Planification
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsScheduled(false)}
                  className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all border ${t.segBtn(!isScheduled)}`}
                >
                  Immédiat
                </button>
                <button
                  type="button"
                  onClick={() => setIsScheduled(true)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-semibold transition-all border ${t.segBtn(isScheduled)}`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Planifier
                </button>
              </div>

              {isScheduled && (
                <div className="flex gap-3 pt-1">
                  <div className="flex-1 space-y-1.5">
                    <label className={`text-xs font-medium ${t.textMuted}`}>Date</label>
                    <input
                      type="date"
                      min={todayStr}
                      value={scheduledDate}
                      onChange={e => setScheduledDate(e.target.value)}
                      className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors ${t.inputCls}`}
                    />
                  </div>
                  <div className="w-32 space-y-1.5">
                    <label className={`text-xs font-medium ${t.textMuted}`}>Heure</label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={e => setScheduledTime(e.target.value)}
                      className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors ${t.inputCls}`}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* bottom breathing room */}
            <div className="h-1" />
          </div>

          {/* ── Sticky footer: totals + actions ── */}
          <div className={`shrink-0 border-t px-6 py-4 space-y-4 ${t.stickyBg}`}>

            {/* Totals */}
            <div className="space-y-1.5">
              {itemsTotal > 0 && (
                <div className={`flex justify-between text-sm ${t.textMuted}`}>
                  <span>Articles</span>
                  <span>{fmt(itemsTotal)}</span>
                </div>
              )}
              {packsTotal > 0 && (
                <div className={`flex justify-between text-sm ${t.textMuted}`}>
                  <span>Packs</span>
                  <span>{fmt(packsTotal)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-sm text-green-500 font-medium">
                  <span>Réduction</span>
                  <span>−{fmt(discount)}</span>
                </div>
              )}
              <div className={`flex justify-between font-bold text-base pt-2 border-t ${t.dk ? "border-gray-800" : "border-gray-100"}`}>
                <span className={t.textPrimary}>Total</span>
                <span className="text-amber-500 text-lg">{fmt(grandTotal)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className={`flex-1 rounded-xl h-11 font-semibold border transition-colors
                  ${t.dk
                    ? "border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white bg-transparent"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50 bg-white"
                  }`}
                onClick={onClose}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button
                className="flex-1 rounded-xl h-11 font-semibold bg-amber-500 hover:bg-amber-400 text-white border-0 transition-colors active:scale-[.98]"
                onClick={handleConfirm}
                disabled={isEmpty || isSubmitting}
                data-testid="button-confirm-order"
              >
                {isSubmitting
                  ? "Traitement…"
                  : (
                    <span className="flex items-center gap-2">
                      Confirmer la commande
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )
                }
              </Button>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
