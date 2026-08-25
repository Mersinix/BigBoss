import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
import { TrendingUp, ShoppingBag, Package, Percent, Users, Layers, XCircle } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import {
  flattenOrders, filterLinesByDate, resolveDateRange, summarize, monthlySeries, topCustomers,
  topProducts, topPacks, type DateRangePreset,
} from "@/lib/marketplace-analytics";
import { PLATFORM_COMMISSION_RATE } from "@/lib/financial-rows";
import { StatCard, SectionCard, RankRow, EmptyState } from "@/components/dashboard/dashboard-kit";

const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };

// Every figure on this page is scoped to the current Supplier by construction — GET
// /api/orders already returns only this supplier's own sub-orders/items for a SUPPLIER
// viewer (see storage.getOrders), so flattenOrders() can never mix in another supplier's
// data even on a shared/misconfigured query cache.
export default function FinanceAnalyticsPage() {
  const fmt = useFormatCurrency();
  const { data: orders = [] } = useQuery<OrderWithDetails[]>({ queryKey: ["/api/orders"] });
  const { data: listings = [] } = useQuery<any[]>({ queryKey: ["/api/supplier/listings"] });
  const [preset, setPreset] = useState<DateRangePreset>("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const allLines = useMemo(() => flattenOrders(orders), [orders]);
  const range = useMemo(() => resolveDateRange(preset, custom), [preset, custom]);
  const lines = useMemo(() => filterLinesByDate(allLines, range), [allLines, range]);
  const stats = useMemo(() => summarize(lines), [lines]);
  const series = useMemo(() => monthlySeries(allLines, 12), [allLines]);
  const customers = useMemo(() => topCustomers(lines, 5), [lines]);
  const products = useMemo(() => topProducts(lines, 5), [lines]);
  const packs = useMemo(() => topPacks(lines, 5), [lines]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Analyses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Performance financière et insights de vente.</p>
        </div>
        <DateRangeFilter preset={preset} onPresetChange={setPreset} custom={custom} onCustomChange={setCustom} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="CA livré" value={fmt(stats.deliveredRevenue)} icon={TrendingUp} tone="amber" />
        <StatCard label="Commandes" value={stats.orderCount} icon={ShoppingBag} tone="primary" subtext={`PMC ${fmt(stats.averageOrderValue)}`} />
        <StatCard label="Livrées / annulées" value={`${stats.deliveredCount} / ${stats.cancelledCount}`} icon={XCircle} tone="red" subtext={`${(stats.cancellationRate * 100).toFixed(1)}% annulé`} />
        <StatCard label="Produits référencés" value={listings.length} icon={Package} tone="green" />
        <StatCard label="Commission plateforme" value={fmt(stats.commission)} icon={Percent} tone="blue" subtext={`${(PLATFORM_COMMISSION_RATE * 100).toFixed(0)}%`} />
        <StatCard label="Gains nets" value={fmt(stats.supplierNet)} icon={TrendingUp} tone="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Revenu mensuel" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={series} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip {...tooltipStyle} formatter={(v: any) => [fmt(v as number), "Revenu"]} />
              <Bar dataKey="revenue" fill="#d97706" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Commandes mensuelles" icon={ShoppingBag}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip {...tooltipStyle} formatter={(v: any) => [v, "Commandes"]} />
              <Line type="monotone" dataKey="orders" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Produits les plus vendus" icon={Package}>
          {products.length === 0 ? <EmptyState message="Aucune donnée pour cette période." /> : (
            <div className="divide-y divide-border/40">
              {products.map((p, i) => <RankRow key={p.id} rank={i + 1} title={p.name} subtitle={`${p.quantity} unité(s)`} value={fmt(p.revenue)} />)}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Packs les plus vendus" icon={Layers}>
          {packs.length === 0 ? <EmptyState message="Aucune donnée pour cette période." /> : (
            <div className="divide-y divide-border/40">
              {packs.map((p, i) => <RankRow key={p.id} rank={i + 1} title={p.name} subtitle={`${p.quantity} unité(s)`} value={fmt(p.revenue)} />)}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Meilleurs clients" icon={Users}>
        {customers.length === 0 ? <EmptyState message="Aucune donnée pour cette période." /> : (
          <div className="divide-y divide-border/40">
            {customers.map((c, i) => <RankRow key={c.id} rank={i + 1} title={c.name} subtitle={`${c.orders} commande(s)`} value={fmt(c.revenue)} />)}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
