import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/dashboard-kit";
import { Star } from "lucide-react";
import { useDeliveryCompanyReviews } from "@/hooks/use-delivery-company-marketplace";

const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

// Real Delivery Company reviews — GET /api/delivery-company/reviews/:userId reads the
// same shared supplierProductReviews table (reviewType='DELIVERY_COMPANY') that the
// marketplace card rating / Admin Delivery overview already compute live from. A
// Delivery Company IS reviewed — by the Supplier who dispatched through it (see
// shared/schema.ts: cafeId/cafeName/cafeOwnerName are reused to hold the reviewing
// Supplier's identity for this review type) — so this replaces the previous
// PerformanceEmptyState placeholder that incorrectly claimed no review system exists.
// Single source of truth: nothing here is denormalized or duplicated, mirroring
// pages/printer/reviews.tsx and pages/marketing/reviews.tsx.
export default function DeliveryCompanyReviewsPage() {
  const { user } = useAuth();
  const { data: reviews = [], isLoading } = useDeliveryCompanyReviews(user?.id ?? null);

  const stats = useMemo(() => {
    if (reviews.length === 0) return { average: 0, count: 0 };
    const sum = reviews.reduce((s, r) => s + r.rating, 0);
    return { average: sum / reviews.length, count: reviews.length };
  }, [reviews]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Avis</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Avis laissés par les fournisseurs sur vos livraisons.</p>
      </div>

      <Card className={CARD_CLASS}>
        <CardContent className="p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <Star className="w-6 h-6 text-amber-500 fill-amber-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.count > 0 ? stats.average.toFixed(1) : "—"}</p>
            <p className="text-xs text-muted-foreground">{stats.count} avis</p>
          </div>
        </CardContent>
      </Card>

      <Card className={CARD_CLASS}>
        <CardContent className="p-0 divide-y divide-border/40">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Chargement…</p>
          ) : reviews.length === 0 ? (
            <EmptyState icon={Star} message="Aucun avis pour le moment" />
          ) : (
            reviews.map((review) => (
              <div key={review.id} className="p-4" data-testid={`row-review-${review.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{review.cafeName || "Fournisseur"}</p>
                  <div className="flex items-center gap-1 text-amber-500 shrink-0">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} className={`w-3.5 h-3.5 ${i < review.rating ? "fill-amber-500" : "fill-none text-gray-300"}`} />
                    ))}
                  </div>
                </div>
                {review.comment && <p className="text-sm text-muted-foreground mt-1.5">{review.comment}</p>}
                <p className="text-xs text-muted-foreground/70 mt-1.5">
                  {review.deliveryId ? `Livraison #${review.deliveryId} · ` : ""}
                  {review.createdAt ? new Date(review.createdAt).toLocaleDateString("fr-FR") : ""}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
