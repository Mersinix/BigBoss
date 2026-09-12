import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, DashboardHero } from "@/components/dashboard/dashboard-kit";
import { Star } from "lucide-react";
import type { SupplierProductReview } from "@shared/schema";

// Real PRINT reviews only — GET /api/print/reviews/:printerId reads the same
// shared supplierProductReviews table (reviewType='PRINT') that the Coffee
// Owner's "leave a review" flow writes to and that the marketplace card
// rating / Admin PRINT overview both already compute live from. Single
// source of truth: nothing here is denormalized or duplicated.
export default function PrinterReviewsPage() {
  const { user } = useAuth();
  const { data: reviews = [], isLoading } = useQuery<SupplierProductReview[]>({
    queryKey: ["/api/print/reviews", user?.id],
    queryFn: async () => {
      const r = await fetch(`/api/print/reviews/${user?.id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Impossible de charger les avis");
      return r.json();
    },
    enabled: !!user?.id,
  });

  const stats = useMemo(() => {
    if (reviews.length === 0) return { average: 0, count: 0 };
    const sum = reviews.reduce((s, r) => s + r.rating, 0);
    return { average: sum / reviews.length, count: reviews.length };
  }, [reviews]);

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Avis"
        subtitle="Avis laissés par les cafés sur vos services PRINT."
        stat={stats.count > 0 ? stats.average.toFixed(1) : undefined}
        statLabel={`${stats.count} avis`}
        icon={Star}
        gradientClass="bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/20"
        iconBgClass="bg-blue-500/15"
        iconTextClass="text-blue-600 dark:text-blue-400"
      />

      <Card className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
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
                  {review.printOrderId ? `Commande #${review.printOrderId} · ` : ""}
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
