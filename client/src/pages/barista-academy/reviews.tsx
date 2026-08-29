import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAcademyReviews } from "@/hooks/use-barista-academy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Star } from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AcademyReviewsPage() {
  const { user } = useAuth();
  const { data: reviews = [], isLoading } = useAcademyReviews(user?.id ?? null);

  const avgRating = useMemo(
    () => (reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0),
    [reviews],
  );

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Avis</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Les avis laissés par les Coffee Owners après une formation terminée.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        </div>
      ) : (
        <>
          <Card className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 border-indigo-100 dark:border-indigo-900/40">
            <CardContent className="pt-5 flex items-center gap-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-indigo-700 dark:text-indigo-400">{avgRating.toFixed(1)}</p>
                <div className="flex items-center gap-0.5 justify-center mt-1 text-amber-400">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <Star key={v} className={`w-3.5 h-3.5 ${v <= Math.round(avgRating) ? "fill-amber-400" : "text-gray-300"}`} />
                  ))}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">{reviews.length} avis</p>
                <p>Note moyenne calculée sur l'ensemble de vos formations évaluées.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />Avis des Coffee Owners
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Aucun avis pour le moment. Les avis apparaîtront ici après vos premières formations terminées.</p>
              ) : (
                reviews.map((review) => (
                  <div key={review.id} className="rounded-xl bg-secondary/30 p-3" data-testid={`row-review-${review.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{review.cafeOwnerName || review.cafeName || "Coffee Owner"}</p>
                        <div className="flex items-center gap-1 mt-1 text-amber-500 text-xs">
                          {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDate(review.createdAt)}</span>
                    </div>
                    {review.comment && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{review.comment}</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
