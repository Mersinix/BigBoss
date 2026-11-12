import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, X, Tag, Percent, DollarSign, ShoppingBag, BarChart3, Truck, Gift, Star, Calendar, Layers, PackageCheck } from "lucide-react";
import { useFormatCurrency } from "@/hooks/use-currency";
import type { CustomerPromotionDetail, PromotionType } from "@shared/schema";

// Customer-facing French labels — a small, file-local map (same convention used
// elsewhere in this app for display-only lookups), not the Supplier Promotions
// page's own TYPE_LABELS (that one is Supplier-only French copy, not reused here
// to avoid coupling two independent UIs to the same literal strings).
const TYPE_LABELS: Record<PromotionType, string> = {
  PERCENTAGE: "Réduction en %",
  FIXED_AMOUNT: "Montant fixe",
  BUY_X_GET_Y: "Achetez X, obtenez Y",
  QUANTITY_TIER: "Tarification par palier",
  CATEGORY_DISCOUNT: "Réduction par catégorie",
  FREE_SHIPPING: "Livraison gratuite",
  GIFT: "Cadeau gratuit",
  MIN_ORDER_AMOUNT: "Montant minimum de commande",
  MIN_QUANTITY: "Quantité minimum",
  FIRST_ORDER: "Première commande",
};

const TYPE_ICONS: Record<PromotionType, JSX.Element> = {
  PERCENTAGE: <Percent className="w-4 h-4" />,
  FIXED_AMOUNT: <DollarSign className="w-4 h-4" />,
  BUY_X_GET_Y: <ShoppingBag className="w-4 h-4" />,
  QUANTITY_TIER: <BarChart3 className="w-4 h-4" />,
  CATEGORY_DISCOUNT: <Tag className="w-4 h-4" />,
  FREE_SHIPPING: <Truck className="w-4 h-4" />,
  GIFT: <Gift className="w-4 h-4" />,
  MIN_ORDER_AMOUNT: <DollarSign className="w-4 h-4" />,
  MIN_QUANTITY: <ShoppingBag className="w-4 h-4" />,
  FIRST_ORDER: <Star className="w-4 h-4" />,
};

function formatDate(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export type PromotionBadgeTarget = {
  promotionId: number;
  listingId: number;
  flavorId: number | null;
  sizeId: number | null;
};

export function PromotionDetailsModal({
  target,
  onClose,
  isDark = false,
}: {
  target: PromotionBadgeTarget | null;
  onClose: () => void;
  // Coffee Owner pages never apply a global `.dark` class (see
  // dashboard-layout.tsx's own doc comment: "Coffee Owner's own session...
  // relies on its own separate isDark-ternary styling and never expects a
  // global `.dark` class") — Tailwind's `dark:` variant is therefore inert
  // here. This prop (sourced from the same useThemeStore the Product Detail
  // Modal already reads) drives every themed className below directly,
  // exactly like that modal's own dk-ternary pattern, so switching theme
  // while this modal is open re-renders it immediately with no separate
  // theme state of its own.
  isDark?: boolean;
}) {
  const fmt = useFormatCurrency();
  const dk = isDark;

  const bg = dk ? "bg-gray-900" : "bg-white";
  const textPrimary = dk ? "text-white" : "text-gray-900";
  const textMuted = dk ? "text-gray-400" : "text-gray-500";
  const sepColor = dk ? "bg-gray-700" : "bg-gray-200";
  const closeBtnCls = dk
    ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
    : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700";

  const { data: promo, isLoading, isError } = useQuery<CustomerPromotionDetail>({
    queryKey: [
      "/api/marketplace/promotions", target?.promotionId, target?.listingId, target?.flavorId, target?.sizeId,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({ listingId: String(target!.listingId) });
      if (target!.flavorId != null) params.set("flavorId", String(target!.flavorId));
      if (target!.sizeId != null) params.set("sizeId", String(target!.sizeId));
      const res = await fetch(`/api/marketplace/promotions/${target!.promotionId}?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!target,
  });

  // Discount headline — the one prominent, type-specific summary at the top of
  // the modal. Mirrors the per-type switch already used for supplier-side
  // display (promotions-page.tsx's discountLabel) and the client's own
  // calcPromoPrice, kept consistent so the number shown here always matches
  // the price the Coffee Owner already saw on the badge/variant row. Every
  // field here now arrives from the server already converted to cents (see
  // getPromotionDetailForListing) — fmt() is called directly, with no ad-hoc
  // client-side unit conversion (the previous `/10` here was the exact
  // "10.000 DT -> 100.000 DT" -class bug, just for a different field).
  function discountHeadline(p: CustomerPromotionDetail): string {
    switch (p.type) {
      case 'PERCENTAGE':
      case 'CATEGORY_DISCOUNT':
      case 'MIN_QUANTITY':
      case 'FIRST_ORDER':
        return `${p.discountValue / 100}% de réduction`;
      case 'FIXED_AMOUNT':
      case 'MIN_ORDER_AMOUNT':
        return `${fmt(p.discountValue)} de réduction`;
      case 'BUY_X_GET_Y':
        return `Achetez ${p.buyQuantity}, obtenez ${p.getQuantity} gratuit${(p.getQuantity ?? 1) !== 1 ? "s" : ""}`;
      case 'QUANTITY_TIER':
        return 'Tarification par palier';
      case 'FREE_SHIPPING':
        return p.freeShippingMinAmount
          ? `Livraison gratuite à partir de ${fmt(p.freeShippingMinAmount)}`
          : 'Toujours la livraison gratuite';
      case 'GIFT':
        return p.giftInfo?.description || 'Cadeau gratuit';
      default:
        return p.name;
    }
  }

  const open = !!target;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent hideClose className={`max-w-md max-h-[85vh] flex flex-col p-0 ${bg} ${dk ? "border-gray-700" : ""}`}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          data-testid="button-close-promotion-details"
          className={`absolute right-4 top-4 z-10 p-1.5 rounded-full transition-colors ${closeBtnCls}`}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-6 pb-6 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
          {isLoading && (
            <>
              <DialogHeader><DialogTitle className="sr-only">Détails de la promotion</DialogTitle></DialogHeader>
              <div className="flex items-center justify-center py-16">
                <Loader2 className={`w-6 h-6 animate-spin ${textMuted}`} />
              </div>
            </>
          )}

          {isError && !isLoading && (
            <>
              <DialogHeader><DialogTitle className="sr-only">Détails de la promotion</DialogTitle></DialogHeader>
              <div className={`py-16 text-center ${textMuted}`}>
                <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Détails de la promotion indisponibles.</p>
              </div>
            </>
          )}

          {promo && !isLoading && (
            <>
              <DialogHeader className="text-left">
                <div className={`flex items-center gap-2 text-xs font-semibold ${dk ? "text-amber-400" : "text-amber-600"}`}>
                  {TYPE_ICONS[promo.type]}
                  <span>{TYPE_LABELS[promo.type]}</span>
                </div>
                <DialogTitle className={`text-xl ${textPrimary}`}>{promo.name}</DialogTitle>
              </DialogHeader>

              {/* Discount — prominent */}
              <div className={`mt-3 rounded-2xl border px-4 py-3 ${dk ? "bg-amber-500/10 border-amber-500/30" : "bg-amber-50 border-amber-200"}`}>
                <p className={`text-lg font-bold ${dk ? "text-amber-400" : "text-amber-700"}`}>{discountHeadline(promo)}</p>
                {promo.originalPrice != null && promo.promotionalPrice != null && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-sm font-semibold ${textPrimary}`}>{fmt(promo.promotionalPrice)}</span>
                    <span className={`text-xs line-through ${textMuted}`}>{fmt(promo.originalPrice)}</span>
                  </div>
                )}
              </div>

              {promo.description && (
                <p className={`text-sm mt-4 leading-relaxed ${textMuted}`}>{promo.description}</p>
              )}

              {/* Validity */}
              {(promo.startDate || promo.endDate) && (
                <>
                  <Separator className={`my-4 ${sepColor}`} />
                  <div className="space-y-1.5">
                    <p className={`text-xs font-semibold flex items-center gap-1.5 ${textMuted}`}>
                      <Calendar className="w-3.5 h-3.5" /> Validité
                    </p>
                    {promo.startDate && (
                      <div className="flex justify-between text-sm">
                        <span className={textMuted}>Valable à partir du</span>
                        <span className={`font-medium ${textPrimary}`}>{formatDate(promo.startDate)}</span>
                      </div>
                    )}
                    {promo.endDate && (
                      <div className="flex justify-between text-sm">
                        <span className={textMuted}>Valable jusqu'au</span>
                        <span className={`font-medium ${textPrimary}`}>{formatDate(promo.endDate)}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Conditions */}
              {(promo.minimumOrderValue != null || promo.minimumQuantity != null || promo.maximumDiscount != null || promo.categoryName) && (
                <>
                  <Separator className={`my-4 ${sepColor}`} />
                  <div className="space-y-1.5">
                    <p className={`text-xs font-semibold flex items-center gap-1.5 ${textMuted}`}>
                      <Layers className="w-3.5 h-3.5" /> Conditions
                    </p>
                    {promo.minimumOrderValue != null && (
                      <div className="flex justify-between text-sm">
                        <span className={textMuted}>Commande minimale</span>
                        <span className={`font-medium ${textPrimary}`}>{fmt(promo.minimumOrderValue)}</span>
                      </div>
                    )}
                    {promo.minimumQuantity != null && (
                      <div className="flex justify-between text-sm">
                        <span className={textMuted}>Quantité minimale</span>
                        <span className={`font-medium ${textPrimary}`}>{promo.minimumQuantity}</span>
                      </div>
                    )}
                    {promo.maximumDiscount != null && (
                      <div className="flex justify-between text-sm">
                        <span className={textMuted}>Réduction maximale</span>
                        <span className={`font-medium ${textPrimary}`}>{fmt(promo.maximumDiscount)}</span>
                      </div>
                    )}
                    {promo.categoryName && (
                      <div className="flex justify-between text-sm">
                        <span className={textMuted}>Catégorie concernée</span>
                        <span className={`font-medium ${textPrimary}`}>{promo.categoryName}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Gift */}
              {promo.giftInfo && (
                <>
                  <Separator className={`my-4 ${sepColor}`} />
                  <div className={`flex items-center gap-2 text-sm rounded-xl border px-3 py-2.5 ${dk ? "bg-purple-500/10 border-purple-500/30 text-gray-200" : "bg-purple-50 border-purple-200 text-gray-900"}`}>
                    <PackageCheck className={`w-4 h-4 shrink-0 ${dk ? "text-purple-400" : "text-purple-600"}`} />
                    <span>
                      {promo.giftInfo.description}
                      {promo.giftInfo.quantity > 1 ? ` × ${promo.giftInfo.quantity}` : ""}
                    </span>
                  </div>
                </>
              )}

              {/* Cumulability */}
              <Separator className={`my-4 ${sepColor}`} />
              <Badge
                variant="outline"
                className={promo.stackable
                  ? (dk ? "text-xs text-blue-400 border-blue-500/30 bg-transparent" : "text-xs text-blue-600 border-blue-200 bg-transparent")
                  : (dk ? `text-xs ${textMuted} border-gray-700 bg-transparent` : `text-xs ${textMuted} border-gray-200 bg-transparent`)}
              >
                {promo.stackable ? "Cumulable avec d'autres promotions" : "Non cumulable avec d'autres promotions"}
              </Badge>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
