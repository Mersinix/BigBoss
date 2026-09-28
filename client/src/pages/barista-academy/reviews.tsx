import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAcademyReviews } from "@/hooks/use-barista-academy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Star } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { resolveDateRange, type DateRangePreset } from "@/lib/marketplace-analytics";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AcademyReviewsPage() {
  const { user } = useAuth();
  const { data: reviews = [], isLoading } = useAcademyReviews(user?.id ?? null);

  // Overall rating stays computed over the FULL, unfiltered review list — the date filter
  // below only narrows which reviews are listed/paginated, never what "your rating" means.
  const avgRating = useMemo(
    () => (reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0),
    [reviews],
  );

  const [preset, setPreset] = useState<DateRangePreset>("all");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const filtered = useMemo(() => {
    if (preset === "all") return reviews;
    const { from, to } = resolveDateRange(preset, custom);
    if (!from || !to) return reviews;
    return reviews.filter((r) => r.createdAt && new Date(r.createdAt) >= from && new Date(r.createdAt) <= to);
  }, [reviews, preset, custom]);

  const pagination = usePagination(filtered.length);
  useEffect(() => { pagination.resetPage(); }, [preset, custom.from, custom.to]);
  const pageReviews = filtered.slice(pagination.start, pagination.end);

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Avis"
        subtitle="Les avis laissés par les Coffee Owners après une formation terminée."
        stat={reviews.length > 0 ? avgRating.toFixed(1) : undefined}
        statLabel="Note moyenne"
        icon={Star}
        gradientClass="bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent border-indigo-500/20"
        iconBgClass="bg-indigo-500/15"
        iconTextClass="text-indigo-600 dark:text-indigo-400"
      />

      <DateRangeFilter preset={preset} onPresetChange={setPreset} custom={custom} onCustomChange={setCustom} />

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

          <Card className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />Avis des Coffee Owners
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {reviews.length === 0 ? "Aucun avis pour le moment. Les avis apparaîtront ici après vos premières formations terminées." : "Aucun avis sur cette période."}
                </p>
              ) : (
                pageReviews.map((review) => (
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

          <DataPagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={filtered.length}
            totalPages={pagination.totalPages}
            start={pagination.start}
            end={pagination.end}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            itemLabel="avis"
          />
        </>
      )}
    </div>
  );
}
