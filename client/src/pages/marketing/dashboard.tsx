import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getAvatarUrl } from "@/lib/avatar";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Megaphone, Users, Briefcase, CheckCircle2, TrendingUp, Star, Mail, Phone, MapPin } from "lucide-react";
import { DashboardHero, StatCard, SectionCard, EmptyState } from "@/components/dashboard/dashboard-kit";
import { useMarketingProjects, useMarketingRevenue } from "@/hooks/use-marketing";
import { MARKETING_PROJECT_STATUS_META, formatMonthKey } from "@/lib/marketing-project-status";

// Real Marketing dashboard — every number here is computed client-side from the
// live /api/marketing/projects and /api/marketing/revenue endpoints (no mock
// data), mirroring pages/printer/dashboard.tsx's structure exactly.
export default function MarketingDashboard() {
  const { user } = useAuth();
  const fmt = useFormatCurrency();

  const { data: projects = [], isLoading: projectsLoading } = useMarketingProjects();
  const { data: revenue, isLoading: revenueLoading } = useMarketingRevenue();
  const isLoading = projectsLoading || revenueLoading;

  const statusMeta: Record<string, { label: string; cls: string }> = {
    approved: { label: "Compte approuvé", cls: "bg-green-100 text-green-700" },
    pending: { label: "En attente d'approbation", cls: "bg-amber-100 text-amber-700" },
    rejected: { label: "Compte refusé", cls: "bg-red-100 text-red-700" },
  };
  const accountStatus = statusMeta[(user as any)?.status ?? "approved"] ?? { label: (user as any)?.status ?? "—", cls: "bg-gray-100 text-gray-700" };

  const activeClients = useMemo(() => new Set(projects.filter((p) => !["CANCELLED", "REJECTED"].includes(p.status)).map((p) => p.cafeOwnerId)).size, [projects]);
  const activeProjects = useMemo(() => projects.filter((p) => ["ACCEPTED", "IN_PROGRESS"].includes(p.status)).length, [projects]);
  const completedProjects = useMemo(() => projects.filter((p) => p.status === "COMPLETED").length, [projects]);
  const recentProjects = useMemo(
    () => [...projects].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6),
    [projects],
  );

  const chartData = useMemo(
    () => (revenue?.history ?? []).map((h) => ({ month: formatMonthKey(h.month), revenue: h.totalCents / 100 })),
    [revenue],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden bg-gradient-to-br from-fuchsia-500/10 via-fuchsia-500/5 to-transparent border-fuchsia-500/20">
        <CardContent className="p-6 flex flex-wrap items-center gap-5">
          <Avatar className="w-16 h-16 shrink-0">
            <AvatarImage src={getAvatarUrl(user as any)} alt={user?.name ?? "Marketing"} />
            <AvatarFallback className="bg-fuchsia-600 text-white font-bold text-xl">
              {user?.name?.charAt(0)?.toUpperCase() ?? "M"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-display font-bold text-foreground truncate">{user?.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge variant="secondary" className={accountStatus.cls}>{accountStatus.label}</Badge>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs text-muted-foreground">
              {user?.email && <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{user.email}</span>}
              {(user as any)?.phone && <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{(user as any).phone}</span>}
              {(user as any)?.locationAddress && <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{(user as any).locationAddress}</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <DashboardHero
        title="Dashboard Marketing"
        subtitle={`Bienvenue, ${user?.name}. Voici un aperçu de votre activité.`}
        stat={fmt(revenue?.currentMonthCents ?? 0)}
        statLabel="CA ce mois-ci"
        icon={Megaphone}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Clients actifs" value={activeClients} icon={Users} tone="primary" />
        <StatCard label="Projets en cours" value={activeProjects} icon={Briefcase} tone="blue" />
        <StatCard label="Projets terminés" value={completedProjects} icon={CheckCircle2} tone="green" />
        <StatCard label="Note moyenne" value={"—"} icon={Star} tone="amber" subtext="Voir l'onglet Avis" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Chiffre d'affaires (6 mois)" icon={TrendingUp}>
          {chartData.every((d) => d.revenue === 0) ? (
            <EmptyState message="Pas encore de revenus." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="marketingGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [fmt(Math.round(v * 100)), "Revenu"]} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#marketingGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Projets récents" icon={Briefcase}>
          {recentProjects.length === 0 ? (
            <EmptyState message="Aucun projet pour le moment." icon={Briefcase} />
          ) : (
            <div className="space-y-3">
              {recentProjects.map((p) => {
                const meta = MARKETING_PROJECT_STATUS_META[p.status] ?? MARKETING_PROJECT_STATUS_META.PENDING;
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-secondary/20">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.cafeOwner ?? "Client"}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.service}{p.title ? ` · ${p.title}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold text-sm">{fmt(p.finalAmountInCents ?? p.quoteAmountInCents ?? 0)}</span>
                      <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
