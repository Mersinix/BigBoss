import { useMemo } from "react";
import { useFormatCurrency } from "@/hooks/use-currency";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Briefcase, Users, Percent, Layers, CheckCircle2, XCircle } from "lucide-react";
import { StatCard, SectionCard, RankRow, EmptyState } from "@/components/dashboard/dashboard-kit";
import { MARKETING_PROJECT_STATUS_META, formatMonthKey } from "@/lib/marketing-project-status";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketingProjects, useMarketingRevenue } from "@/hooks/use-marketing";

const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };
const PIE_COLORS = ["hsl(var(--primary))", "#f59e0b", "#3b82f6", "#8b5cf6", "#06b6d4", "#22c55e", "#ef4444"];

// Real Marketing analytics — every number computed client-side from the live
// /api/marketing/projects and /api/marketing/revenue endpoints, mirroring
// pages/printer/analytics.tsx exactly. Charts show an empty state instead of
// fabricated numbers when there isn't enough history yet.
export default function MarketingAnalytics() {
  const fmt = useFormatCurrency();
  const { data: projects = [], isLoading: projectsLoading } = useMarketingProjects();
  const { data: revenue, isLoading: revenueLoading } = useMarketingRevenue();
  const isLoading = projectsLoading || revenueLoading;

  const nonCancelled = useMemo(() => projects.filter((p) => !["CANCELLED", "REJECTED"].includes(p.status)), [projects]);
  const completedProjects = useMemo(() => projects.filter((p) => p.status === "COMPLETED"), [projects]);
  const cancelledProjects = useMemo(() => projects.filter((p) => ["CANCELLED", "REJECTED"].includes(p.status)), [projects]);
  const clientCount = useMemo(() => new Set(projects.map((p) => p.cafeOwnerId)).size, [projects]);
  const averageProjectValue = completedProjects.length > 0
    ? Math.round(completedProjects.reduce((s, p) => s + (p.finalAmountInCents ?? 0), 0) / completedProjects.length)
    : 0;

  const statusChart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
    return Array.from(counts.entries()).map(([status, count]) => ({
      status: MARKETING_PROJECT_STATUS_META[status as keyof typeof MARKETING_PROJECT_STATUS_META]?.label ?? status,
      count,
    }));
  }, [projects]);

  const revenueChart = useMemo(
    () => (revenue?.history ?? []).map((h) => ({ month: formatMonthKey(h.month), revenue: h.totalCents / 100, projects: h.projects })),
    [revenue],
  );

  const serviceBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of nonCancelled) map.set(p.service || "Autres", (map.get(p.service || "Autres") ?? 0) + 1);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [nonCancelled]);

  const topClients = useMemo(() => {
    const map = new Map<string, { name: string; projects: number; revenue: number }>();
    for (const p of projects) {
      const key = String(p.cafeOwnerId);
      const cur = map.get(key) ?? { name: p.cafeOwner ?? "Client", projects: 0, revenue: 0 };
      cur.projects += 1;
      cur.revenue += p.finalAmountInCents ?? 0;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [projects]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Performance de votre activité Marketing.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Revenu total" value={fmt(revenue?.totalEarnedCents ?? 0)} icon={TrendingUp} tone="green" />
        <StatCard label="Projets" value={projects.length} icon={Briefcase} tone="primary" subtext={`Valeur moyenne ${fmt(averageProjectValue)}`} />
        <StatCard label="Terminés" value={completedProjects.length} icon={CheckCircle2} tone="green" />
        <StatCard label="Annulés / refusés" value={cancelledProjects.length} icon={XCircle} tone="red" />
        <StatCard label="Clients" value={clientCount} icon={Users} tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Chiffre d'affaires par mois" icon={TrendingUp}>
          {revenueChart.every((d) => d.revenue === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueChart} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [fmt(Math.round((v as number) * 100)), "Revenu"]} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Projets par statut" icon={Layers}>
          {statusChart.length === 0 ? <EmptyState message="Aucun projet pour le moment." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusChart} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="status" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Meilleurs clients" icon={Users}>
          {topClients.length === 0 ? <EmptyState message="Aucune donnée pour le moment." /> : (
            <div className="divide-y divide-border/40">
              {topClients.map((c, i) => (
                <RankRow key={c.name + i} rank={i + 1} title={c.name} subtitle={`${c.projects} projet(s)`} value={fmt(c.revenue)} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Répartition par service" icon={Layers}>
          {serviceBreakdown.length === 0 ? <EmptyState message="Aucun projet pour le moment." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={serviceBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(entry: any) => entry.name}>
                  {serviceBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Percent className="w-3.5 h-3.5" /> Ce mois-ci : {fmt(revenue?.currentMonthCents ?? 0)} sur {revenue?.currentMonthProjects ?? 0} projet(s) terminé(s).
      </p>
    </div>
  );
}
