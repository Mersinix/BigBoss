import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Building2 } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { SectionCard, RankRow, EmptyState } from "@/components/dashboard/dashboard-kit";
import { useMyBaristaJobApplications, useBaristaReviews, type BaristaJobApplicationStatus } from "@/hooks/use-barista-marketplace";

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };
// Same background/border/radius as the Barista Marketplace Dashboard/Revenus reference
// (revenue.tsx's KPI cards).
const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

const APPLICATION_STATUSES: BaristaJobApplicationStatus[] = ["PENDING", "PRESELECTED", "INTERVIEW_SCHEDULED", "ACCEPTED", "REJECTED"];
const STATUS_LABELS: Record<BaristaJobApplicationStatus, string> = {
  PENDING: "En attente", PRESELECTED: "Présélectionné", INTERVIEW_SCHEDULED: "Entretien planifié",
  ACCEPTED: "Accepté", REJECTED: "Rejeté",
};

// Mission-workflow cleanup (barista_performance_flash_audit.md) — every
// metric here used to come from useBaristaRequests()/useBaristaMissions()
// (the legacy 1:1 request/mission system, which no longer has any creation UI
// anywhere in the Barista Marketplace). Rebuilt entirely on
// useMyBaristaJobApplications() (GET /api/barista/applications/mine, scoped
// to the authenticated barista server-side) — covers both Offer and Mission
// applications, using the real `status`/`meeting`/`recordType` fields already
// persisted. No duplicate analytics storage, no mock/invented data, no
// legacy-request figures counted as current applications.
export default function BaristaAnalyticsPage() {
  const { user } = useAuth();
  const { data: applications = [], isLoading } = useMyBaristaJobApplications();
  const { data: reviews = [] } = useBaristaReviews(user?.id ?? null);

  const applicationsByMonth = useMemo(() => {
    const now = new Date();
    const buckets: { month: string; applications: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const count = applications.filter((a) => {
        const ad = new Date(a.createdAt);
        return ad.getFullYear() === d.getFullYear() && ad.getMonth() === d.getMonth();
      }).length;
      buckets.push({ month: MONTH_LABELS[d.getMonth()], applications: count });
    }
    return buckets;
  }, [applications]);

  const statusBreakdown = useMemo(
    () => APPLICATION_STATUSES.map((status) => ({
      status: STATUS_LABELS[status],
      count: applications.filter((a) => a.status === status).length,
    })),
    [applications],
  );

  // "Cafés les plus sollicités" — replaces the old revenue-ranked "Meilleurs
  // clients" (built on missions.cafeOwnerName); ranked by application count
  // per café (establishment, already persisted on the job post), excluding
  // REJECTED the same way the old ranking excluded CANCELLED missions (don't
  // rank a negative outcome as "solicited").
  const topCafes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of applications) {
      if (a.status === "REJECTED") continue;
      if (!a.establishment) continue;
      counts.set(a.establishment, (counts.get(a.establishment) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([establishment, count]) => ({ establishment, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [applications]);

  const applicationsToOffers = applications.filter((a) => a.recordType === "OFFER").length;
  const applicationsToMissions = applications.filter((a) => a.recordType === "MISSION").length;
  const pendingApplications = applications.filter((a) => a.status === "PENDING").length;
  const scheduledInterviews = applications.filter((a) => a.meeting && (a.meeting.status === "PROPOSED" || a.meeting.status === "CONFIRMED")).length;
  const acceptedApplications = applications.filter((a) => a.status === "ACCEPTED").length;
  const acceptanceRate = applications.length > 0 ? Math.round((acceptedApplications / applications.length) * 100) : null;
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Analyses"
        subtitle="Vue d'ensemble de la performance de votre activité Barista."
        stat={reviews.length > 0 ? avgRating.toFixed(1) : undefined}
        statLabel="Note moyenne"
        icon={TrendingUp}
        gradientClass="bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent border-green-500/20"
        iconBgClass="bg-green-500/15"
        iconTextClass="text-green-600 dark:text-green-400"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Candidatures — Offres</p><p className="text-xl font-bold">{applicationsToOffers}</p></CardContent></Card>
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Candidatures — Missions</p><p className="text-xl font-bold">{applicationsToMissions}</p></CardContent></Card>
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">En attente</p><p className="text-xl font-bold">{pendingApplications}</p></CardContent></Card>
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Entretiens planifiés</p><p className="text-xl font-bold">{scheduledInterviews}</p></CardContent></Card>
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux d'acceptation</p><p className="text-xl font-bold text-green-600">{acceptanceRate != null ? `${acceptanceRate}%` : "—"}</p></CardContent></Card>
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Note moyenne</p><p className="text-xl font-bold">{reviews.length > 0 ? avgRating.toFixed(1) : "—"}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Candidatures reçues par mois" icon={TrendingUp} className={CARD_CLASS}>
          {applicationsByMonth.every((h) => h.applications === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={applicationsByMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [`${v} candidature${v > 1 ? "s" : ""}`, "Candidatures"]} />
                <Bar dataKey="applications" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Candidatures par statut" icon={TrendingUp} className={CARD_CLASS}>
          {applications.length === 0 ? <EmptyState message="Aucune candidature pour le moment." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusBreakdown} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="status" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" name="Candidatures" fill="#4ade80" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Cafés les plus sollicités" icon={Building2} className={CARD_CLASS}>
        {topCafes.length === 0 ? <EmptyState message="Aucune candidature pour le moment." /> : (
          <div className="divide-y divide-border/40">
            {topCafes.map((c, i) => <RankRow key={c.establishment} rank={i + 1} title={c.establishment} subtitle={`${c.count} candidature${c.count > 1 ? "s" : ""}`} value={String(c.count)} />)}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
