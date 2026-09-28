import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { SectionCard, RankRow, EmptyState } from "@/components/dashboard/dashboard-kit";
import { useBaristaRequests, useBaristaMissions, useBaristaRevenue, useBaristaReviews } from "@/hooks/use-barista-marketplace";

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };
// Same background/border/radius as the Barista Marketplace Dashboard/Revenus reference
// (revenue.tsx's KPI cards).
const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

// Mirrors maintenance/analytics.tsx exactly — every metric computed client-side
// from the same real endpoints already used by Demandes/Mes missions/Revenus/Avis
// (useBaristaRequests → GET /api/barista/requests, useBaristaMissions → GET
// /api/barista/missions, useBaristaRevenue → GET /api/barista/revenue,
// useBaristaReviews → GET /api/barista/reviews/:userId). No duplicate analytics
// storage, no mock/invented data — this replaces the previous PerformanceEmptyState
// placeholder.
export default function BaristaAnalyticsPage() {
  const { user } = useAuth();
  const fmt = useFormatCurrency();
  const { data: requests = [], isLoading: requestsLoading } = useBaristaRequests();
  const { data: missions = [] } = useBaristaMissions();
  const { data: revenue } = useBaristaRevenue();
  const { data: reviews = [] } = useBaristaReviews(user?.id ?? null);

  const requestsByMonth = useMemo(() => {
    const now = new Date();
    const buckets: { month: string; requests: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const count = requests.filter((r) => {
        const rd = new Date(r.createdAt);
        return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth();
      }).length;
      buckets.push({ month: MONTH_LABELS[d.getMonth()], requests: count });
    }
    return buckets;
  }, [requests]);

  const revenueByMonth = useMemo(() => (revenue?.history ?? []).map((h) => ({ month: h.month.slice(5), revenue: h.totalCents / 100 })), [revenue]);

  const topClients = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of missions) {
      if (m.status === "CANCELLED") continue;
      counts.set(m.cafeOwnerName, (counts.get(m.cafeOwnerName) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([cafeOwnerName, count]) => ({ cafeOwnerName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [missions]);

  const nonCancelled = missions.filter((m) => m.status !== "CANCELLED");
  const completed = missions.filter((m) => m.status === "COMPLETED");
  const completionRate = nonCancelled.length > 0 ? Math.round((completed.length / nonCancelled.length) * 100) : 0;
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const missionTypesUsed = new Set(missions.map((m) => m.missionType).filter(Boolean)).size;

  if (requestsLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux de complétion</p><p className="text-xl font-bold text-green-600">{completionRate}%</p></CardContent></Card>
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Note moyenne</p><p className="text-xl font-bold">{reviews.length > 0 ? avgRating.toFixed(1) : "—"}</p></CardContent></Card>
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Missions totales</p><p className="text-xl font-bold">{missions.length}</p></CardContent></Card>
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Types de mission</p><p className="text-xl font-bold text-green-600">{missionTypesUsed}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Demandes reçues par mois" icon={TrendingUp} className={CARD_CLASS}>
          {requestsByMonth.every((h) => h.requests === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={requestsByMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [`${v} demandes`, "Demandes"]} />
                <Bar dataKey="requests" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Revenu estimé par mois" icon={TrendingUp} className={CARD_CLASS}>
          {revenueByMonth.every((h) => h.revenue === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueByMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [fmt(Math.round((v as number) * 100)), "Revenus"]} />
                <Bar dataKey="revenue" fill="#4ade80" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Meilleurs clients" icon={Users} className={CARD_CLASS}>
        {topClients.length === 0 ? <EmptyState message="Aucune mission pour le moment." /> : (
          <div className="divide-y divide-border/40">
            {topClients.map((c, i) => <RankRow key={c.cafeOwnerName} rank={i + 1} title={c.cafeOwnerName} subtitle={`${c.count} mission${c.count > 1 ? "s" : ""}`} value={String(c.count)} />)}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
