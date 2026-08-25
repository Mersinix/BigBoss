import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
import { TrendingUp, Users, Package, ShoppingBag, Percent, Store, Layers, CheckCircle2, XCircle } from "lucide-react";
import type { User, OrderWithDetails } from "@shared/schema";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import {
  flattenOrders, filterLinesByDate, resolveDateRange, summarize, monthlySeries,
  topSuppliers, topProducts, topPacks, topCustomers, FR_STATUS_LABEL,
  type DateRangePreset,
} from "@/lib/marketplace-analytics";
import { StatCard, SectionCard, RankRow, EmptyState } from "@/components/dashboard/dashboard-kit";

const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };

export default function AnalyticsPage() {
  const fmt = useFormatCurrency();
  const { data: orders = [] } = useQuery<OrderWithDetails[]>({ queryKey: ["/api/orders"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/admin/users"] });
  const { data: products = [] } = useQuery<any[]>({ queryKey: ["/api/products"] });

  const [preset, setPreset] = useState<DateRangePreset>("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const allLines = useMemo(() => flattenOrders(orders), [orders]);
  const range = useMemo(() => resolveDateRange(preset, custom), [preset, custom]);
  const lines = useMemo(() => filterLinesByDate(allLines, range), [allLines, range]);
  const stats = useMemo(() => summarize(lines), [lines]);
  const series = useMemo(() => monthlySeries(allLines, 12), [allLines]);
  const statusChart = useMemo(
    () => Object.entries(stats.statusCounts).map(([status, count]) => ({ status: FR_STATUS_LABEL[status] ?? status, count })),
    [stats.statusCounts],
  );
  const suppliers = useMemo(() => topSuppliers(lines, 5), [lines]);
  const customers = useMemo(() => topCustomers(lines, 5), [lines]);
  const products5 = useMemo(() => topProducts(lines, 5), [lines]);
  const packs5 = useMemo(() => topPacks(lines, 5), [lines]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Analyses</h1>
          <p className="text-muted-foreground text-sm mt-1">Performance de la marketplace et indicateurs clés.</p>
        </div>
        <DateRangeFilter preset={preset} onPresetChange={setPreset} custom={custom} onCustomChange={setCustom} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="CA livré" value={fmt(stats.deliveredRevenue)} icon={TrendingUp} tone="green" />
        <StatCard label="Commandes" value={stats.orderCount} icon={ShoppingBag} tone="primary" subtext={`PMC ${fmt(stats.averageOrderValue)}`} />
        <StatCard label="Livrées" value={stats.deliveredCount} icon={CheckCircle2} tone="green" />
        <StatCard label="Annulées" value={stats.cancelledCount} icon={XCircle} tone="red" subtext={`${(stats.cancellationRate * 100).toFixed(1)}%`} />
        <StatCard label="Utilisateurs" value={users.length} icon={Users} tone="blue" />
        <StatCard label="Produits" value={products.length} icon={Package} tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Chiffre d'affaires par mois" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={series} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip {...tooltipStyle} formatter={(v: any) => [fmt(v as number), "Revenu"]} />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
        <SectionCard title="Commandes par mois" icon={ShoppingBag}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip {...tooltipStyle} formatter={(v: any) => [v, "Commandes livrées"]} />
              <Line type="monotone" dataKey="orders" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <SectionCard title="Commandes par statut" icon={Layers}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={statusChart} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="status" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Fournisseurs les plus performants" icon={Store}>
          {suppliers.length === 0 ? <EmptyState message="Aucune donnée pour cette période." /> : (
            <div className="divide-y divide-border/40">
              {suppliers.map((s, i) => <RankRow key={s.id} rank={i + 1} title={s.name} subtitle={`${s.orders} commande(s)`} value={fmt(s.revenue)} />)}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Meilleurs clients" icon={Users}>
          {customers.length === 0 ? <EmptyState message="Aucune donnée pour cette période." /> : (
            <div className="divide-y divide-border/40">
              {customers.map((c, i) => <RankRow key={c.id} rank={i + 1} title={c.name} subtitle={`${c.orders} commande(s)`} value={fmt(c.revenue)} />)}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Produits les plus vendus" icon={Package}>
          {products5.length === 0 ? <EmptyState message="Aucune donnée pour cette période." /> : (
            <div className="divide-y divide-border/40">
              {products5.map((p, i) => <RankRow key={p.id} rank={i + 1} title={p.name} subtitle={`${p.quantity} unité(s)`} value={fmt(p.revenue)} />)}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Packs les plus vendus" icon={Layers}>
          {packs5.length === 0 ? <EmptyState message="Aucune donnée pour cette période." /> : (
            <div className="divide-y divide-border/40">
              {packs5.map((p, i) => <RankRow key={p.id} rank={i + 1} title={p.name} subtitle={`${p.quantity} unité(s)`} value={fmt(p.revenue)} />)}
            </div>
          )}
        </SectionCard>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Percent className="w-3.5 h-3.5" />Commission plateforme sur la période: {fmt(stats.commission)}</p>
    </div>
  );
}
