import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Store, MapPin, ExternalLink, X, ShoppingBag } from "lucide-react";
import { useThemeStore } from "@/store/theme-store";
import { useToast } from "@/hooks/use-toast";
import { useConfirmSelfPickup } from "@/hooks/use-orders";
import type { GeoLocation } from "@shared/schema";

// Self Pickup details (Delivery System V2) — opened from the "Go" action on a READY
// self-pickup sub-order. Reuses the exact same Google-Maps deep-link convention already used
// by components/delivery/delivery-route-map.tsx ("Ouvrir dans Maps"), just without the
// embedded map widget — a Coffee Owner going to pick up an order themselves doesn't need
// turn-by-turn tracking infrastructure, only a destination hand-off to their own phone's map
// app. Destination is always the SUPPLIER (never the café's own address) since this is a
// pickup, not a delivery.

function useTheme(isDark: boolean) {
  const dk = isDark;
  return {
    dk,
    modalBg: dk ? "bg-gray-900" : "bg-white",
    headerBg: dk ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100",
    innerCard: dk ? "bg-gray-800/60 border-gray-700/40" : "bg-gray-50 border-gray-100",
    textPrimary: dk ? "text-white" : "text-gray-900",
    textMuted: dk ? "text-gray-400" : "text-gray-500",
    textSubtle: dk ? "text-gray-500" : "text-gray-400",
    iconBtn: dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800",
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  subOrderId: number;
  orderId: number;
  supplierName: string;
  pickupAddress: GeoLocation | null | undefined;
  /** The Coffee Owner's own stored delivery/customer address (order.deliveryAddress) — used
   * as the route's origin so the Maps link shows the actual Café ↔ Supplier route from stored
   * data, not just "wherever the device happens to be right now". Optional: when unavailable,
   * falls back to the original destination-only link (device's live location as origin). */
  cafeAddress?: GeoLocation | null;
  /** Sub-order status — the code entry only shows while still READY (before confirmation). */
  status: string;
};

export default function SelfPickupModal({ open, onClose, subOrderId, orderId, supplierName, pickupAddress, cafeAddress, status }: Props) {
  const { isDark } = useThemeStore();
  const t = useTheme(isDark);
  const { toast } = useToast();
  const confirmPickup = useConfirmSelfPickup();
  const [code, setCode] = useState("");

  const alreadyConfirmed = status !== "READY";

  // Same URL pattern as delivery-route-map.tsx's "Ouvrir dans Maps". Destination is always the
  // Supplier's pickup address. Origin is the Coffee Owner's own stored address when available —
  // this makes the link show the real Café ↔ Supplier route from data already in the system,
  // rather than relying on the opening device's live GPS position (which may not even be the
  // Coffee Owner's own address, e.g. when checking from a different device/location). Falls
  // back to the original destination-only behavior (device's live location as origin) when the
  // café address isn't available, preserving the existing behavior exactly.
  const destination = pickupAddress?.lat && pickupAddress?.lng
    ? `${pickupAddress.lat},${pickupAddress.lng}`
    : pickupAddress?.address;
  const origin = cafeAddress?.lat && cafeAddress?.lng
    ? `${cafeAddress.lat},${cafeAddress.lng}`
    : cafeAddress?.address;
  const gmapsUrl = destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}${origin ? `&origin=${encodeURIComponent(origin)}` : ""}`
    : null;

  const handleConfirm = () => {
    if (code.trim().length === 0) return;
    confirmPickup.mutate({ subOrderId, code: code.trim() }, {
      onSuccess: () => {
        toast({ title: "Retrait confirmé", description: "Bon appétit !" });
        setCode("");
        onClose();
      },
      onError: (err: Error) => toast({ title: "Code incorrect", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setCode(""); onClose(); } }}>
      <DialogContent className={`max-w-sm w-[calc(100%-2rem)] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden ${t.modalBg}`}>
        <DialogTitle className="sr-only">Self Pickup — Commande #{String(orderId).padStart(6, "0")}</DialogTitle>

        <div className={`shrink-0 border-b px-6 pt-5 pb-4 flex items-center justify-between ${t.headerBg}`}>
          <button onClick={onClose} aria-label="Fermer" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${t.iconBtn}`}>
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-500" />
            <span className={`text-[15px] font-bold tracking-tight ${t.textPrimary}`}>Self Pickup</span>
          </div>
          <div className="w-8" />
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className={`text-center font-mono text-xs ${t.textMuted}`}>Commande #{String(orderId).padStart(6, "0")}</p>

          <div className={`border rounded-2xl p-4 space-y-3 ${t.innerCard}`}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <Store className="w-4 h-4 text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-semibold mb-0.5 ${t.textMuted}`}>Fournisseur</p>
                <p className={`text-sm font-medium ${t.textPrimary}`}>{supplierName}</p>
              </div>
            </div>
            <div className={`flex items-start gap-3 pt-2.5 border-t ${t.dk ? "border-gray-700/50" : "border-gray-100"}`}>
              <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-semibold mb-0.5 ${t.textMuted}`}>Pickup address</p>
                <p className={`text-sm font-medium ${t.textPrimary}`}>{pickupAddress?.address || "Adresse non renseignée"}</p>
              </div>
            </div>
            <div className={`flex items-center justify-between pt-2.5 border-t ${t.dk ? "border-gray-700/50" : "border-gray-100"}`}>
              <span className={`text-xs font-semibold ${t.textMuted}`}>Status</span>
              <Badge variant="outline" className={`text-xs ${alreadyConfirmed ? "text-green-500 border-green-500/30" : "text-amber-500 border-amber-500/30"}`}>
                {alreadyConfirmed ? "Retiré" : "Ready for Pickup"}
              </Badge>
            </div>
          </div>

          {gmapsUrl && (
            <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" className="block">
              <Button variant="outline" className={`w-full gap-2 ${t.dk ? "text-white border-white" : ""}`} data-testid="button-open-in-maps">
                <ExternalLink className="w-4 h-4" /> Ouvrir dans Maps
              </Button>
            </a>
          )}

          {!alreadyConfirmed && (
            <div className="space-y-2">
              <p className={`text-xs font-semibold uppercase tracking-wide ${t.textSubtle}`}>Pickup confirmation code</p>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="______"
                maxLength={10}
                className="text-center tracking-[0.3em] font-mono text-lg"
                data-testid="input-self-pickup-code"
              />
              <p className={`text-xs ${t.textMuted}`}>Demandez ce code au fournisseur une fois sur place.</p>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-6">
          {alreadyConfirmed ? (
            <Button variant="outline" className="w-full" onClick={onClose}>Fermer</Button>
          ) : (
            <Button
              className="w-full"
              onClick={handleConfirm}
              disabled={code.trim().length === 0 || confirmPickup.isPending}
              data-testid="button-confirm-pickup"
            >
              {confirmPickup.isPending ? "Confirmation…" : "Confirm Pickup"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
