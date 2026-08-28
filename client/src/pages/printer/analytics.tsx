import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, ShoppingBag, Package, Percent, Layers, CheckCircle2, XCircle } from "lucide-react";
import type { PrintCatalogItem, PrintOrderWithParties } from "@shared/schema";
import { StatCard, SectionCard, RankRow, EmptyState } from "@/components/dashboard/dashboard-kit";
import { PRINT_ORDER_STATUS_META, formatMonthKey } from "@/lib/print-order-status";
import { Skeleton } from "@/components/ui/skeleton";

type PrintRevenueSummary = {
  totalEarnedCents: number;
  completedOrders: number;
  currentMonthCents: number;
  currentMonthOrders: number;
  history: { month: string; totalCents: number; orders: number }[];
};

const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };
const PIE_COLORS = ["hsl(var(--primary))", "#f59e0b", "#3b82f6", "#8b5cf6", "#06b6d4", "#22c55e", "#ef4444"];

export default function PrinterAnalytics() {
  const fmt = useFormatCurrency();
  const { data: orders = [], isLoading: ordersLoading } = useQuery<PrintOrderWithParties[]>({ queryKey: ["/api/print/orders"] });
  const { data: catalog = [], isLoading: catalogLoading } = useQuery<PrintCatalogItem[]>({ queryKey: ["/api/print/catalog"] });
  const { data: revenue, isLoading: revenueLoading } = useQuery<PrintRevenueSummary>({ queryKey: ["/api/print/revenue"] });

  const isLoading = ordersLoading || catalogLoading || revenueLoading;

  const nonCancelled = useMemo(() => orders.filter((o) => o.status !== "CANCELLED"), [orders]);
  const deliveredOrders = useMemo(() => orders.filter((o) => o.status === "DELIVERED"), [orders]);
  const cancelledOrders = useMemo(() => orders.filter((o) => o.status === "CANCELLED"), [orders]);
  const averageOrderValue = nonCancelled.length > 0
    ? Math.round(nonCancelled.reduce((s, o) => s + o.totalInCents, 0) / nonCancelled.length)
    : 0;

  const statusChart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
    return Array.from(counts.entries()).map(([status, count]) => ({
      status: PRINT_ORDER_STATUS_META[status as keyof typeof PRINT_ORDER_STATUS_META]?.label ?? status,
      count,
    }));
  }, [orders]);

  const revenueChart = useMemo(
    () => (revenue?.history ?? []).map((h) => ({ month: formatMonthKey(h.month), revenue: h.totalCents / 100, orders: h.orders })),
    [revenue],
  );

  const topItems = useMemo(() => {
    const map = new Map<string, { quantity: number; revenue: number }>();
    for (const o of nonCancelled) {
      const cur = map.get(o.itemName) ?? { quantity: 0, revenue: 0 };
      cur.quantity += o.quantity;
      cur.revenue += o.totalInCents;
      map.set(o.itemName, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [nonCancelled]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of catalog) {
      const key = item.category || "Autres";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [catalog]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Performance de votre activité d'impression.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Revenu total" value={fmt(revenue?.totalEarnedCents ?? 0)} icon={TrendingUp} tone="green" />
        <StatCard label="Commandes" value={orders.length} icon={ShoppingBag} tone="primary" subtext={`Panier moyen ${fmt(averageOrderValue)}`} />
        <StatCard label="Livrées" value={deliveredOrders.length} icon={CheckCircle2} tone="green" />
        <StatCard label="Annulées" value={cancelledOrders.length} icon={XCircle} tone="red" />
        <StatCard label="Produits au catalogue" value={catalog.length} icon={Package} tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Chiffre d'affaires par mois" icon={TrendingUp}>
          {revenueChart.length === 0 ? <EmptyState message="Aucune donnée pour le moment." /> : (
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

        <SectionCard title="Commandes par statut" icon={Layers}>
          {statusChart.length === 0 ? <EmptyState message="Aucune commande pour le moment." /> : (
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
        <SectionCard title="Produits les plus commandés" icon={Package}>
          {topItems.length === 0 ? <EmptyState message="Aucune donnée pour le moment." /> : (
            <div className="divide-y divide-border/40">
              {topItems.map((item, i) => (
                <RankRow key={item.name} rank={i + 1} title={item.name} subtitle={`${item.quantity} unité(s)`} value={fmt(item.revenue)} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Répartition du catalogue par catégorie" icon={Layers}>
          {categoryBreakdown.length === 0 ? <EmptyState message="Aucun produit au catalogue." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={categoryBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(entry: any) => entry.name}>
                  {categoryBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Percent className="w-3.5 h-3.5" /> Ce mois-ci : {fmt(revenue?.currentMonthCents ?? 0)} sur {revenue?.currentMonthOrders ?? 0} commande(s) livrée(s).
      </p>
    </div>
  );
}
