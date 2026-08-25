import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DollarSign, TrendingUp, Percent, XCircle, Store } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import {
  flattenOrders, filterLinesByDate, resolveDateRange, summarize, monthlySeries, topSuppliers,
  type DateRangePreset,
} from "@/lib/marketplace-analytics";
import { buildFinancialRows, PLATFORM_COMMISSION_RATE } from "@/lib/financial-rows";
import { DashboardHero, StatCard, SectionCard, EmptyState } from "@/components/dashboard/dashboard-kit";

// Reuses the exact same commission/net formula as Admin Payouts/Invoices (lib/financial-rows.ts)
// and the same delivered/cancelled revenue recognition as the Admin Dashboard/Analytics (lib/
// marketplace-analytics.ts) — so a number shown here can never disagree with what those pages
// show for the same period.
export default function EarningsPage() {
  const fmt = useFormatCurrency();
  const { data: orders = [] } = useQuery<OrderWithDetails[]>({ queryKey: ["/api/orders"] });
  const [preset, setPreset] = useState<DateRangePreset>("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const allLines = useMemo(() => flattenOrders(orders), [orders]);
  const range = useMemo(() => resolveDateRange(preset, custom), [preset, custom]);
  const lines = useMemo(() => filterLinesByDate(allLines, range), [allLines, range]);
  const stats = useMemo(() => summarize(lines), [lines]);
  const series = useMemo(() => monthlySeries(allLines, 12), [allLines]);
  const suppliers = useMemo(() => topSuppliers(lines, 10), [lines]);

  const financialRows = useMemo(() => buildFinancialRows(orders), [orders]);
  const financialInRange = useMemo(
    () => financialRows.filter((r) => {
      if (!range.from && !range.to) return true;
      if (!r.createdAt) return false;
      const d = new Date(r.createdAt as any);
      if (range.from && d < range.from) return false;
      if (range.to && d > range.to) return false;
      return true;
    }),
    [financialRows, range],
  );
  const paidOut = financialInRange.filter((r) => r.payoutStatus === "DUE").reduce((s, r) => s + r.netAmount, 0);
  const pendingPayout = financialInRange.filter((r) => r.payoutStatus === "UPCOMING").reduce((s, r) => s + r.netAmount, 0);

  const monthGrowth = useMemo(() => {
    const last = series[series.length - 1]?.revenue ?? 0;
    const prev = series[series.length - 2]?.revenue ?? 0;
    if (prev === 0) return last > 0 ? 100 : 0;
    return ((last - prev) / prev) * 100;
  }, [series]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Revenus</h1>
          <p className="text-muted-foreground text-sm mt-1">Vue financière de la marketplace.</p>
        </div>
        <DateRangeFilter preset={preset} onPresetChange={setPreset} custom={custom} onCustomChange={setCustom} />
      </div>

      <DashboardHero
        title="Chiffre d'affaires livré"
        subtitle="Total reconnu sur les commandes effectivement livrées, hors commandes annulées."
        stat={fmt(stats.deliveredRevenue)}
        statLabel="Sur la période sélectionnée"
        icon={DollarSign}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Ce mois" value={fmt(series[series.length - 1]?.revenue ?? 0)} icon={TrendingUp} tone="green" trend={monthGrowth} subtext="vs mois précédent" />
        <StatCard label="Commission plateforme" value={fmt(stats.commission)} icon={Percent} tone="blue" subtext={`${(PLATFORM_COMMISSION_RATE * 100).toFixed(0)}% du livré`} />
        <StatCard label="À verser aux fournisseurs" value={fmt(paidOut)} icon={Store} tone="green" subtext="Commandes livrées" />
        <StatCard label="Versements à venir" value={fmt(pendingPayout)} icon={Store} tone="amber" subtext="Commandes en cours" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Revenu mensuel (livré)" icon={TrendingUp} right={<span className="text-xs text-muted-foreground">12 derniers mois</span>}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: any) => [fmt(v as number), "Revenu"]}
              />
              <Bar dataKey="revenue" fill="#d97706" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Revenus par fournisseur" icon={Store}>
          {suppliers.length === 0 ? <EmptyState message="Aucune donnée pour cette période." /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Commandes</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.orders}</TableCell>
                    <TableCell className="text-right font-semibold text-amber-500">{fmt(s.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5 text-red-500" />Chiffre d'affaires annulé, exclu de tous les totaux ci-dessus: {fmt(stats.cancelledRevenue)}</p>
    </div>
  );
}
