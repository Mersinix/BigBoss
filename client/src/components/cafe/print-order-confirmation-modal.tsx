import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Minus, Plus, Trash2, ArrowRight, CheckCircle, AlertTriangle, X, Package, Clock } from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useThemeStore } from "@/store/theme-store";
import type { PrintCartItem } from "@/hooks/use-cart";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ConfirmPrintOrderOpts = {
  modifiedItems: PrintCartItem[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: PrintCartItem[];
  isSubmitting: boolean;
  onConfirm: (opts: ConfirmPrintOrderOpts) => void;
};

// ── Design system (same tokens as OrderConfirmationModal, tinted blue for PRINT
// instead of amber — matches the existing SHOP=amber / PRINT=blue convention
// already established on the Cart page itself) ─────────────────────────────

function useTheme(isDark: boolean) {
  const dk = isDark;
  return {
    dk,
    modalBg:      dk ? "bg-gray-900"                         : "bg-white",
    headerBg:     dk ? "bg-gray-900 border-gray-800"         : "bg-white border-gray-100",
    stickyBg:     dk ? "bg-gray-900 border-gray-800"         : "bg-white border-gray-100",
    cardBg:       dk ? "bg-gray-800 border-blue-500/25"      : "bg-white border-blue-100",
    cardHeader:   dk ? "bg-blue-500/10 border-blue-500/25"   : "bg-blue-50 border-blue-100",
    rowDivide:    dk ? "divide-gray-700/50"                  : "divide-gray-100",
    dividerBg:    dk ? "bg-gray-800"                         : "bg-gray-100",
    textPrimary:  dk ? "text-white"                          : "text-gray-900",
    textMuted:    dk ? "text-gray-400"                       : "text-gray-500",
    textSubtle:   dk ? "text-gray-500"                       : "text-gray-400",
    iconBtn:      dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
                     : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800",
    stepperBorder: dk ? "border-gray-700"                    : "border-gray-200",
    stepperBtn:   dk ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "hover:bg-gray-100 text-gray-500",
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PrintOrderConfirmationModal({ open, onClose, items, isSubmitting, onConfirm }: Props) {
  const { isDark } = useThemeStore();
  const t = useTheme(isDark);
  const fmt = useFormatCurrency();

  // Local editable draft of the PRINT cart — exact same pattern as the SHOP
  // recap (OrderConfirmationModal): editing/removing a line here only ever
  // touches this local state, never the real Cart, until Confirm is pressed.
  const [localItems, setLocalItems] = useState<PrintCartItem[]>([]);

  useEffect(() => {
    if (open) setLocalItems(structuredClone(items));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // If a line disappeared from the live cart while this modal was already open
  // (e.g. removed from another tab), drop it from the draft too — same
  // reconciliation OrderConfirmationModal does for SHOP items/packs.
  useEffect(() => {
    if (!open) return;
    setLocalItems((prev) => prev.filter((li) => items.some((it) => it.id === li.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const updateItemQty = (id: string, qty: number) => {
    setLocalItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(i.minQuantity, qty) } : i)));
  };

  const removeItem = (id: string) => {
    setLocalItems((prev) => prev.filter((i) => i.id !== id));
  };

  const total = localItems.reduce((s, i) => s + i.unitPriceInCents * i.quantity, 0);
  const isEmpty = localItems.length === 0;

  // Group by printer — mirrors OrderConfirmationModal's grouping by supplier.
  const byPrinter = new Map<number, { printerName: string; items: PrintCartItem[] }>();
  for (const item of localItems) {
    if (!byPrinter.has(item.printerId)) byPrinter.set(item.printerId, { printerName: item.printerName, items: [] });
    byPrinter.get(item.printerId)!.items.push(item);
  }

  const handleConfirm = () => {
    if (isEmpty || isSubmitting) return;
    onConfirm({ modifiedItems: localItems });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-2xl sm:w-[calc(100%-2rem)] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden">
        <DialogTitle className="sr-only">Récapitulatif de commande PRINT</DialogTitle>

        <div className={`flex flex-col max-h-[90vh] overflow-hidden transition-colors duration-200 ${t.modalBg}`}>

          {/* ── Header ── */}
          <div className={`shrink-0 border-b px-6 pt-5 pb-4 ${t.headerBg}`}>
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => { if (!isSubmitting) onClose(); }}
                aria-label="Fermer"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${t.iconBtn}`}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2">
                <CheckCircle className={`w-4 h-4 ${t.dk ? "text-blue-400" : "text-blue-600"}`} />
                <span className={`text-[15px] font-bold tracking-tight ${t.textPrimary}`}>
                  Récapitulatif de commande
                </span>
              </div>

              {/* Spacer to keep the title centered without a second icon button
                  (the SHOP modal's theme toggle was removed from /cart entirely). */}
              <div className="w-8 h-8" />
            </div>
            <p className={`text-sm text-center ${t.textMuted}`}>
              Vérifiez votre commande PRINT avant de confirmer.
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
            {/* ── Items by printer ── */}
            {Array.from(byPrinter.entries()).map(([printerId, group]) => (
              <div key={printerId} className={`border rounded-2xl overflow-hidden ${t.cardBg}`}>
                <div className={`px-4 py-3 flex items-center gap-2.5 border-b ${t.cardHeader}`}>
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${t.dk ? "bg-blue-500/20" : "bg-blue-100"}`}>
                    <Printer className={`w-3.5 h-3.5 ${t.dk ? "text-blue-400" : "text-blue-600"}`} />
                  </div>
                  <span className={`font-semibold text-sm ${t.dk ? "text-blue-400" : "text-blue-700"}`}>{group.printerName}</span>
                </div>

                <div className={`divide-y ${t.rowDivide}`}>
                  {group.items.map((item) => {
                    const isPdf = item.uploadedFileName?.toLowerCase().endsWith(".pdf");
                    return (
                      <div key={item.id} className="px-4 py-3">
                        <div className="flex gap-3">
                          <div className={`w-11 h-11 rounded-xl overflow-hidden shrink-0 border ${t.dk ? "bg-gray-700 border-gray-700" : "bg-white border-gray-100"}`}>
                            {item.uploadedFileDataUrl && !isPdf ? (
                              <img src={item.uploadedFileDataUrl} className="w-full h-full object-cover" alt="Design" />
                            ) : item.imageUrl ? (
                              <img src={item.imageUrl} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <div className={`w-full h-full flex items-center justify-center ${t.dk ? "bg-gray-700" : "bg-blue-50"}`}>
                                <Package className={`w-4 h-4 ${t.dk ? "text-blue-400/40" : "text-blue-300"}`} />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold text-sm truncate ${t.textPrimary}`}>{item.name}</p>
                            {item.uploadedFileName && (
                              <p className={`text-xs truncate ${t.dk ? "text-blue-400" : "text-blue-600"}`}>📎 {item.uploadedFileName}</p>
                            )}
                            {item.material && (
                              <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-xl border mt-1 ${t.dk ? "bg-gray-700 border-gray-600 text-gray-300" : "bg-gray-100 border-gray-200 text-gray-600"}`}>
                                {item.material}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 flex items-center gap-2.5">
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs ${t.textSubtle}`}>{fmt(item.unitPriceInCents)} chacun</p>
                            <p className={`text-xs flex items-center gap-1 mt-0.5 ${t.textMuted}`}>
                              <Clock className="w-3 h-3" />{item.productionTimeDays}j de production
                            </p>
                          </div>
                          <div className={`flex items-center border rounded-xl overflow-hidden shrink-0 ${t.stepperBorder}`}>
                            <button
                              className={`px-2.5 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${t.stepperBtn}`}
                              onClick={() => updateItemQty(item.id, item.quantity - 1)}
                              disabled={item.quantity <= item.minQuantity}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className={`px-3 text-sm font-bold w-8 text-center ${t.textPrimary}`}>{item.quantity}</span>
                            <button
                              className={`px-2.5 py-1.5 transition-colors ${t.stepperBtn}`}
                              onClick={() => updateItemQty(item.id, item.quantity + 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className={`text-sm font-bold min-w-[64px] text-right shrink-0 ${t.textPrimary}`}>
                            {fmt(item.unitPriceInCents * item.quantity)}
                          </span>
                          <button
                            className={`transition-colors shrink-0 ${t.textMuted} hover:text-red-400`}
                            onClick={() => removeItem(item.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {item.notes && (
                          <div className={`mt-2 p-2 rounded-xl text-xs border ${t.dk ? "bg-gray-700/60 border-gray-600 text-gray-300" : "bg-gray-50 border-gray-100 text-gray-600"}`}>
                            <span className="font-semibold">Notes : </span>{item.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* ── Empty cart warning ── */}
            {isEmpty && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${t.dk ? "bg-blue-500/10" : "bg-blue-50"}`}>
                  <AlertTriangle className={`w-7 h-7 ${t.dk ? "text-blue-400" : "text-blue-600"}`} />
                </div>
                <p className={`font-semibold ${t.textPrimary}`}>Panier PRINT vide</p>
                <p className={`text-sm mt-1 ${t.textMuted}`}>Ajoutez des articles avant de confirmer.</p>
              </div>
            )}

            {/* bottom breathing room */}
            <div className="h-1" />
          </div>

          {/* ── Sticky footer: total + actions ── */}
          <div className={`shrink-0 border-t px-6 py-4 space-y-4 ${t.stickyBg}`}>
            <div className="space-y-1.5">
              <div className={`flex justify-between font-bold text-base pt-2 border-t ${t.dk ? "border-gray-800" : "border-gray-100"}`}>
                <span className={t.textPrimary}>Total PRINT</span>
                <span className={`text-lg ${t.dk ? "text-blue-400" : "text-blue-600"}`}>{fmt(total)}</span>
              </div>
            </div>

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
                className={`flex-1 rounded-xl h-11 font-semibold text-white border-0 transition-colors active:scale-[.98] ${t.dk ? "bg-blue-600 hover:bg-blue-500" : "bg-blue-600 hover:bg-blue-700"}`}
                onClick={handleConfirm}
                disabled={isEmpty || isSubmitting}
                data-testid="button-confirm-print-order"
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
