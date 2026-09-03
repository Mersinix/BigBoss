import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/dashboard-kit";
import { Star } from "lucide-react";
import { useMarketingReviews } from "@/hooks/use-marketing";

// Real Marketing reviews only — GET /api/marketing/reviews/:marketingUserId reads
// the same shared supplierProductReviews table (reviewType='MARKETING') that the
// Coffee Owner's "leave a review" flow writes to and that the marketplace card
// rating / Admin Marketing overview both already compute live from. Single
// source of truth: nothing here is denormalized or duplicated, mirroring
// pages/printer/reviews.tsx exactly.
export default function MarketingReviewsPage() {
  const { user } = useAuth();
  const { data: reviews = [], isLoading } = useMarketingReviews(user?.id ?? null);

  const stats = useMemo(() => {
    if (reviews.length === 0) return { average: 0, count: 0 };
    const sum = reviews.reduce((s, r) => s + r.rating, 0);
    return { average: sum / reviews.length, count: reviews.length };
  }, [reviews]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Avis</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Avis laissés par les cafés sur vos services Marketing.</p>
      </div>

      <Card className="rounded-2xl">
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

      <Card className="rounded-2xl">
        <CardContent className="p-0 divide-y divide-border/40">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Chargement…</p>
          ) : reviews.length === 0 ? (
            <EmptyState message="Aucun avis pour le moment" icon={Star} />
          ) : (
            reviews.map((review) => (
              <div key={review.id} className="p-4" data-testid={`row-review-${review.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{review.cafeName || "Café"}</p>
                  <div className="flex items-center gap-1 text-amber-500 shrink-0">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} className={`w-3.5 h-3.5 ${i < review.rating ? "fill-amber-500" : "fill-none text-gray-300"}`} />
                    ))}
                  </div>
                </div>
                {review.comment && <p className="text-sm text-muted-foreground mt-1.5">{review.comment}</p>}
                <p className="text-xs text-muted-foreground/70 mt-1.5">
                  {review.marketingProjectId ? `Projet #${review.marketingProjectId} · ` : ""}
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
