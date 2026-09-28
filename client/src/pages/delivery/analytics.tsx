import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDeliveries, useDeliveryCompanyDrivers } from "@/hooks/use-deliveries";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users, Truck } from "lucide-react";
import { DashboardHero, SectionCard, RankRow, EmptyState } from "@/components/dashboard/dashboard-kit";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";
const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Disponible", ACCEPTED: "Acceptée", ASSIGNED: "Assignée", PICKED_UP: "Collectée",
  IN_TRANSIT: "En transit", DELIVERED: "Livrée", CANCELLED: "Annulée",
};
const STATUS_ORDER = ["ACCEPTED", "ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "CANCELLED"];

// Espace Livraison → Performance → Analyses — previously a placeholder pointing back to the
// Dashboard tab (see delivery/performance.tsx). No dedicated delivery-analytics backend
// endpoint exists, so every figure here is computed client-side from the same real
// useDeliveries()/useDeliveryCompanyDrivers() data already used by delivery/dashboard.tsx —
// mirrors the exact convention maintenance/analytics.tsx already uses (client-bucketed
// monthly stats from a raw list, no separate analytics table/endpoint). No mock data.
export default function DeliveryAnalyticsPage() {
  const { user } = useAuth();
  const { data: deliveries = [], isLoading } = useDeliveries();
  const { data: drivers = [] } = useDeliveryCompanyDrivers();

  const mine = useMemo(() => deliveries.filter((d) => d.deliveryCompanyId === user?.id), [deliveries, user?.id]);
  const nonCancelled = mine.filter((d) => d.status !== "CANCELLED");
  const delivered = mine.filter((d) => d.status === "DELIVERED");
  const cancelled = mine.filter((d) => d.status === "CANCELLED");
  const deliveryRate = nonCancelled.length > 0 ? Math.round((delivered.length / nonCancelled.length) * 100) : 0;
  const activeDriverIds = new Set(mine.filter((d) => d.driver).map((d) => d.driver!.id));

  const byMonth = useMemo(() => {
    const now = new Date();
    const buckets: { month: string; livraisons: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const count = mine.filter((del) => {
        if (!del.createdAt) return false;
        const dd = new Date(del.createdAt as any);
        return dd.getFullYear() === d.getFullYear() && dd.getMonth() === d.getMonth();
      }).length;
      buckets.push({ month: MONTH_LABELS[d.getMonth()], livraisons: count });
    }
    return buckets;
  }, [mine]);

  const statusBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of mine) counts.set(d.status, (counts.get(d.status) ?? 0) + 1);
    const max = Math.max(...STATUS_ORDER.map((s) => counts.get(s) ?? 0), 1);
    return STATUS_ORDER.map((s) => ({ status: s, label: STATUS_LABELS[s] ?? s, count: counts.get(s) ?? 0, max }));
  }, [mine]);

  const topDrivers = useMemo(() => {
    const counts = new Map<number, number>();
    for (const d of mine) {
      if (d.status !== "DELIVERED" || !d.driver) continue;
      counts.set(d.driver.id, (counts.get(d.driver.id) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([driverId, count]) => ({ driverId, name: drivers.find((dr) => dr.id === driverId)?.name ?? `Chauffeur #${driverId}`, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [mine, drivers]);

  if (isLoading) {
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
        subtitle="Vue d'ensemble de la performance de vos livraisons."
        stat={`${deliveryRate}%`}
        statLabel="Taux de livraison"
        icon={TrendingUp}
        gradientClass="bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent border-teal-500/20"
        iconBgClass="bg-teal-500/15"
        iconTextClass="text-teal-600 dark:text-teal-400"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Livraisons totales</p><p className="text-xl font-bold">{mine.length}</p></CardContent></Card>
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Taux de livraison</p><p className="text-xl font-bold text-green-600">{deliveryRate}%</p></CardContent></Card>
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Annulées</p><p className="text-xl font-bold text-red-500">{cancelled.length}</p></CardContent></Card>
        <Card className={CARD_CLASS}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Chauffeurs actifs</p><p className="text-xl font-bold text-teal-600">{activeDriverIds.size} / {drivers.length}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Livraisons par mois" icon={TrendingUp} className={CARD_CLASS}>
          {byMonth.every((h) => h.livraisons === 0) ? <EmptyState message="Aucune donnée pour le moment." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [`${v} livraisons`, "Livraisons"]} />
                <Bar dataKey="livraisons" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
        <SectionCard title="Répartition par statut" icon={Truck} className={CARD_CLASS}>
          {mine.length === 0 ? <EmptyState message="Aucune livraison pour le moment." /> : (
            <div className="space-y-2.5">
              {statusBreakdown.map(({ status, label, count, max }) => (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${status === "CANCELLED" ? "bg-red-500" : status === "DELIVERED" ? "bg-green-500" : "bg-teal-500"}`} style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                  <span className="text-xs w-6 text-right font-medium text-foreground">{count}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Meilleurs chauffeurs" icon={Users} className={CARD_CLASS}>
        {topDrivers.length === 0 ? <EmptyState message="Aucune livraison terminée pour le moment." /> : (
          <div className="divide-y divide-border/40">
            {topDrivers.map((d, i) => <RankRow key={d.driverId} rank={i + 1} title={d.name} subtitle={`${d.count} livraison${d.count > 1 ? "s" : ""} terminée${d.count > 1 ? "s" : ""}`} value={String(d.count)} />)}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
