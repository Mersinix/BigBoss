import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardHero, EmptyState, StatCard, SectionCard } from "@/components/dashboard/dashboard-kit";
import { Star, Package, RotateCcw, ShieldAlert, Building2, Truck } from "lucide-react";
import { useDeliveryCompanyDriverReviews, useDriverPerformanceReviews } from "@/hooks/use-delivery-company-marketplace";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { resolveDateRange, type DateRangePreset } from "@/lib/marketplace-analytics";
import { getAvatarUrl } from "@/lib/avatar";

const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";
const STARS = [5, 4, 3, 2, 1] as const;

// A single row shape both sections below render — "reviewer" is whoever wrote the review
// (Supplier for the company section, Cafe Owner for the driver section); "target" is the
// secondary entity shown under the reviewer, used only by the driver section (the driver
// being reviewed) — null for the company section, which has no second entity to show/filter.
interface NormalizedReview {
  id: number;
  reviewerId: number | null;
  reviewerName: string;
  reviewerImageUrl: string | null;
  targetId: number | null;
  targetName: string | null;
  targetImageUrl: string | null;
  targetFallback: string | null;
  rating: number;
  comment: string | null;
  deliveryId: number | null;
  createdAt: string | null;
}

// Fix Delivery Company Avis — Include Coffee Owner Reviews of Its Drivers (task, see
// DELIVERY_COMPANY_DRIVER_REVIEWS_GAP_AUDIT.md) — two genuinely different reviewer/target
// populations (Supplier -> company, Cafe Owner -> driver) are deliberately never merged
// into one dataset or one average; each gets its own tab, its own summary, and its own
// filters, built on one shared, parametrized section component instead of duplicating the
// summary/filter/pagination logic twice.
function ReviewDashboardSection({
  reviews, isLoading, error,
  reviewerFilterLabel, reviewerAllLabel, targetFilterLabel, targetAllLabel,
  testIdPrefix,
}: {
  reviews: NormalizedReview[];
  isLoading: boolean;
  error: unknown;
  reviewerFilterLabel: string;
  reviewerAllLabel: string;
  /** Omitted entirely (no filter, no sub-line on cards) for the company section, which has no second entity. */
  targetFilterLabel?: string;
  targetAllLabel?: string;
  testIdPrefix: string;
}) {
  const [reviewerFilter, setReviewerFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [preset, setPreset] = useState<DateRangePreset>("all");
  const [custom, setCustom] = useState({ from: "", to: "" });

  // Summary stays computed over the FULL eligible dataset for this section — independent of
  // every filter and of pagination.
  const stats = useMemo(() => {
    const count = reviews.length;
    const average = count > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
    const distribution = STARS.map((star) => {
      const starCount = reviews.filter((r) => r.rating === star).length;
      return { star, count: starCount, pct: count > 0 ? Math.round((starCount / count) * 100) : 0 };
    });
    return { average, count, distribution };
  }, [reviews]);

  // Filter option lists come from this section's own eligible reviews — never an unrelated
  // full roster — and always key on the real id, never the display name.
  const reviewerOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of reviews) if (r.reviewerId != null && !seen.has(r.reviewerId)) seen.set(r.reviewerId, r.reviewerName);
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [reviews]);

  const targetOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of reviews) if (r.targetId != null && !seen.has(r.targetId)) seen.set(r.targetId, r.targetName ?? r.targetFallback ?? "");
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [reviews]);

  const filtered = useMemo(() => {
    let list = reviews;
    if (reviewerFilter !== "all") list = list.filter((r) => String(r.reviewerId) === reviewerFilter);
    if (targetFilterLabel && targetFilter !== "all") list = list.filter((r) => String(r.targetId) === targetFilter);
    if (ratingFilter !== "all") list = list.filter((r) => String(r.rating) === ratingFilter);
    if (preset !== "all") {
      const { from, to } = resolveDateRange(preset, custom);
      if (from && to) list = list.filter((r) => r.createdAt && new Date(r.createdAt) >= from && new Date(r.createdAt) <= to);
    }
    return list;
  }, [reviews, reviewerFilter, targetFilter, ratingFilter, preset, custom, targetFilterLabel]);

  const pagination = usePagination(filtered.length);
  useEffect(() => { pagination.resetPage(); }, [reviewerFilter, targetFilter, ratingFilter, preset, custom.from, custom.to]);
  const pageReviews = filtered.slice(pagination.start, pagination.end);

  const hasActiveFilters = reviewerFilter !== "all" || targetFilter !== "all" || ratingFilter !== "all" || preset !== "all";
  const resetFilters = () => {
    setReviewerFilter("all");
    setTargetFilter("all");
    setRatingFilter("all");
    setPreset("all");
    setCustom({ from: "", to: "" });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── Summary — always the complete eligible dataset for this section, never the filtered view ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="Note moyenne"
          value={stats.count > 0 ? `${stats.average.toFixed(1)} / 5` : "—"}
          icon={Star}
          tone="amber"
          subtext={
            <span className="flex items-center gap-0.5 text-amber-500">
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className={`w-3 h-3 ${i < Math.round(stats.average) ? "fill-amber-500" : "fill-none text-gray-300 dark:text-gray-600"}`} />
              ))}
            </span>
          }
        />
        <StatCard label="Total des avis" value={stats.count} icon={Package} tone="blue" />
      </div>

      <SectionCard title="Répartition des notes" icon={Star}>
        <p className="text-xs text-muted-foreground mb-3">
          Calculé sur l'ensemble des avis de cette section, quels que soient les filtres actifs ci-dessous.
        </p>
        {stats.count === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun avis pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {stats.distribution.map(({ star, count, pct }) => (
              <div key={star} className="flex items-center gap-2 text-sm" data-testid={`row-${testIdPrefix}-distribution-${star}`}>
                <span className="w-10 shrink-0 text-muted-foreground flex items-center gap-0.5">{star} <Star className="w-3 h-3 fill-amber-500 text-amber-500" /></span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right text-muted-foreground text-xs">{count} ({pct}%)</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Filters ── */}
      <Card className={CARD_CLASS}>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{reviewerFilterLabel}</Label>
            <Select value={reviewerFilter} onValueChange={setReviewerFilter}>
              <SelectTrigger className="w-44" data-testid={`select-${testIdPrefix}-reviewer-filter`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{reviewerAllLabel}</SelectItem>
                {reviewerOptions.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {targetFilterLabel && (
            <div className="space-y-1.5">
              <Label className="text-xs">{targetFilterLabel}</Label>
              <Select value={targetFilter} onValueChange={setTargetFilter}>
                <SelectTrigger className="w-44" data-testid={`select-${testIdPrefix}-target-filter`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{targetAllLabel}</SelectItem>
                  {targetOptions.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Période</Label>
            <DateRangeFilter preset={preset} onPresetChange={setPreset} custom={custom} onCustomChange={setCustom} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Note</Label>
            <Select value={ratingFilter} onValueChange={setRatingFilter}>
              <SelectTrigger className="w-40" data-testid={`select-${testIdPrefix}-rating-filter`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les notes</SelectItem>
                {STARS.map((star) => <SelectItem key={star} value={String(star)}>{star} étoile{star > 1 ? "s" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-destructive hover:text-destructive/80 gap-1.5" data-testid={`button-${testIdPrefix}-reset-filters`}>
              <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser les filtres
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── Review cards ── */}
      <Card className={CARD_CLASS}>
        <CardContent className="p-0 divide-y divide-border/40">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Chargement…</p>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
              <ShieldAlert className="w-10 h-10 text-red-400" />
              <p className="text-sm font-medium text-foreground">Impossible de charger les avis</p>
              <p className="text-xs max-w-xs text-muted-foreground">Veuillez réessayer dans quelques instants.</p>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Star}
              message={reviews.length === 0 ? "Aucun avis pour le moment" : "Aucun avis ne correspond à ces filtres"}
            />
          ) : (
            pageReviews.map((review) => (
              <div key={review.id} className="p-4 flex flex-col gap-2" data-testid={`row-${testIdPrefix}-review-${review.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="w-9 h-9 shrink-0 rounded-xl">
                      <AvatarImage src={getAvatarUrl({ profileImageUrl: review.reviewerImageUrl })} alt={review.reviewerName} className="object-cover rounded-xl" />
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{review.reviewerName}</p>
                      {targetFilterLabel && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                          <Avatar className="w-4 h-4 shrink-0 rounded-full">
                            <AvatarImage src={getAvatarUrl({ profileImageUrl: review.targetImageUrl })} alt={review.targetName ?? review.targetFallback ?? ""} className="object-cover rounded-full" />
                          </Avatar>
                          <span className="truncate">{review.targetName ?? review.targetFallback}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-amber-500 shrink-0">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} className={`w-3.5 h-3.5 ${i < review.rating ? "fill-amber-500" : "fill-none text-gray-300 dark:text-gray-600"}`} />
                    ))}
                  </div>
                </div>
                {review.comment && <p className="text-sm text-muted-foreground">{review.comment}</p>}
                <p className="text-xs text-muted-foreground/70">
                  {review.deliveryId ? `Livraison #${review.deliveryId} · ` : ""}
                  {review.createdAt ? new Date(review.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : ""}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Pagination — over the filtered list ── */}
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
    </div>
  );
}

export default function DeliveryCompanyReviewsPage() {
  const [tab, setTab] = useState<"company" | "drivers">("drivers");
  const { data: companyReviews = [], isLoading: companyLoading, error: companyError } = useDeliveryCompanyDriverReviews();
  const { data: driverReviews = [], isLoading: driverLoading, error: driverError } = useDriverPerformanceReviews();

  const normalizedCompany: NormalizedReview[] = useMemo(() => companyReviews.map((r) => ({
    id: r.id,
    reviewerId: r.supplierId,
    reviewerName: r.supplierName,
    reviewerImageUrl: r.supplierImageUrl,
    targetId: null,
    targetName: null,
    targetImageUrl: null,
    targetFallback: null,
    rating: r.rating,
    comment: r.comment,
    deliveryId: r.deliveryId,
    createdAt: r.createdAt,
  })), [companyReviews]);

  const normalizedDrivers: NormalizedReview[] = useMemo(() => driverReviews.map((r) => ({
    id: r.id,
    reviewerId: r.reviewerId,
    reviewerName: r.reviewerName,
    reviewerImageUrl: r.reviewerImageUrl,
    targetId: r.driverId,
    targetName: r.driverName,
    targetImageUrl: r.driverImageUrl,
    targetFallback: "Chauffeur indisponible",
    rating: r.rating,
    comment: r.comment,
    deliveryId: r.deliveryId,
    createdAt: r.createdAt,
  })), [driverReviews]);

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Avis"
        subtitle="Avis laissés par les fournisseurs sur votre entreprise, et par les cafés sur vos chauffeurs."
        icon={Star}
        gradientClass="bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent border-teal-500/20"
        iconBgClass="bg-teal-500/15"
        iconTextClass="text-teal-600 dark:text-teal-400"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "company" | "drivers")}>
        <TabsList>
           <TabsTrigger value="drivers" data-testid="tab-reviews-drivers">
            <Truck className="w-3.5 h-3.5 mr-1.5" /> Avis sur les chauffeurs ({driverReviews.length})
          </TabsTrigger>
          <TabsTrigger value="company" data-testid="tab-reviews-company">
            <Building2 className="w-3.5 h-3.5 mr-1.5" /> Avis sur l'entreprise ({companyReviews.length})
          </TabsTrigger>
         
        </TabsList>
      </Tabs>

      {tab === "company" ? (
        <ReviewDashboardSection
          reviews={normalizedCompany}
          isLoading={companyLoading}
          error={companyError}
          reviewerFilterLabel="Fournisseur"
          reviewerAllLabel="Tous les fournisseurs"
          testIdPrefix="company"
        />
      ) : (
        <ReviewDashboardSection
          reviews={normalizedDrivers}
          isLoading={driverLoading}
          error={driverError}
          reviewerFilterLabel="Café"
          reviewerAllLabel="Tous les cafés"
          targetFilterLabel="Chauffeur"
          targetAllLabel="Tous les chauffeurs"
          testIdPrefix="drivers"
        />
      )}
    </div>
  );
}
