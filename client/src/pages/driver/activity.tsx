import { useMemo } from "react";
import { useDeliveries } from "@/hooks/use-deliveries";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Truck, CheckCircle2, XCircle, Clock } from "lucide-react";
import { StatCard, SectionCard } from "@/components/dashboard/dashboard-kit";

const MONTH_NAMES = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

// "Informations sur les activités" — real activity counts and a real monthly completed-
// deliveries trend, both derived from GET /api/deliveries (this driver's own rows only).
export default function DriverActivityPage() {
  const { data: deliveries = [], isLoading } = useDeliveries();

  const stats = useMemo(() => {
    const completed = deliveries.filter((d) => d.status === "DELIVERED");
    const cancelled = deliveries.filter((d) => d.status === "CANCELLED");
    const active = deliveries.filter((d) => !["DELIVERED", "CANCELLED"].includes(d.status));
    return { total: deliveries.length, completed: completed.length, cancelled: cancelled.length, active: active.length };
  }, [deliveries]);

  const series = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_NAMES[d.getMonth()], count: 0 });
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const d of deliveries) {
      if (d.status !== "DELIVERED" || !d.deliveredAt) continue;
      const dt = new Date(d.deliveredAt as any);
      const key = `${dt.getFullYear()}-${dt.getMonth()}`;
      const i = idx.get(key);
      if (i != null) buckets[i].count += 1;
    }
    return buckets;
  }, [deliveries]);

  if (isLoading) {
    return <div className="space-y-4"><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">Informations sur les activités</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Votre activité de livraison en un coup d'œil.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total livraisons" value={stats.total} icon={Truck} tone="primary" />
        <StatCard label="Terminées" value={stats.completed} icon={CheckCircle2} tone="green" />
        <StatCard label="En cours" value={stats.active} icon={Clock} tone="amber" />
        <StatCard label="Annulées" value={stats.cancelled} icon={XCircle} tone="red" />
      </div>

      <SectionCard title="Livraisons terminées par mois" icon={CheckCircle2} right={<span className="text-xs text-muted-foreground">12 derniers mois</span>}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={series} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [v, "Livraisons"]} />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>
    </div>
  );
}
