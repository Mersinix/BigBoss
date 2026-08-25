import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DollarSign, TrendingUp, Percent, Wallet } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { formatDate } from "@/lib/format";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { flattenOrders, resolveDateRange, monthlySeries, type DateRangePreset } from "@/lib/marketplace-analytics";
import {
  buildFinancialRows, PLATFORM_COMMISSION_RATE, PAYOUT_STATUS_META, payoutReference,
} from "@/lib/financial-rows";
import { DashboardHero, StatCard, SectionCard, EmptyState } from "@/components/dashboard/dashboard-kit";

// Supplier "Revenus" tab — no separate payout/invoice system exists (see lib/financial-rows.ts);
// this reuses that exact same derivation so numbers here always agree with Supplier Payouts/
// Invoices and Admin Payments/Earnings for the same orders. GET /api/orders already returns
// only this supplier's own sub-orders (see storage.getOrders), so every row below is already
// scoped. Built on the same shared dashboard kit as Admin Earnings (components/dashboard/
// dashboard-kit.tsx) so the two "Earnings" tabs read as one financial product.
export default function SupplierEarningsPage() {
  const fmt = useFormatCurrency();
  const { data: orders = [] } = useQuery<OrderWithDetails[]>({ queryKey: ["/api/orders"] });
  const [preset, setPreset] = useState<DateRangePreset>("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const allLines = useMemo(() => flattenOrders(orders), [orders]);
  const series = useMemo(() => monthlySeries(allLines, 12), [allLines]);
  const range = useMemo(() => resolveDateRange(preset, custom), [preset, custom]);

  const allRows = useMemo(() => buildFinancialRows(orders), [orders]);
  const rows = useMemo(() => {
    const filtered = allRows.filter((r) => {
      if (!range.from && !range.to) return true;
      if (!r.createdAt) return false;
      const d = new Date(r.createdAt as any);
      if (range.from && d < range.from) return false;
      if (range.to && d > range.to) return false;
      return true;
    });
    return filtered.sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());
  }, [allRows, range]);

  const nonCancelled = rows.filter((r) => r.payoutStatus !== "CANCELLED");
  const due = rows.filter((r) => r.payoutStatus === "DUE");
  const upcoming = rows.filter((r) => r.payoutStatus === "UPCOMING");
  const grossDelivered = due.reduce((s, r) => s + r.subtotal, 0);
  const commission = due.reduce((s, r) => s + r.commission, 0);
  const netEarnings = due.reduce((s, r) => s + r.netAmount, 0);
  const pendingNet = upcoming.reduce((s, r) => s + r.netAmount, 0);

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
          <p className="text-sm text-muted-foreground mt-0.5">Aperçu financier de votre activité.</p>
        </div>
        <DateRangeFilter preset={preset} onPresetChange={setPreset} custom={custom} onCustomChange={setCustom} />
      </div>

      <DashboardHero
        title="Gains nets"
        subtitle="Après déduction de la commission plateforme, sur les commandes livrées."
        stat={fmt(netEarnings)}
        statLabel="Sur la période sélectionnée"
        icon={Wallet}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Chiffre d'affaires livré" value={fmt(grossDelivered)} icon={DollarSign} tone="amber" />
        <StatCard label="Croissance mensuelle" value={`${monthGrowth >= 0 ? "+" : ""}${monthGrowth.toFixed(1)}%`} icon={TrendingUp} tone={monthGrowth >= 0 ? "green" : "red"} subtext="vs mois précédent" />
        <StatCard label="Commission plateforme" value={fmt(commission)} icon={Percent} tone="blue" subtext={`${(PLATFORM_COMMISSION_RATE * 100).toFixed(0)}% du livré`} />
        <StatCard label="Versements à venir" value={fmt(pendingNet)} icon={Wallet} tone="amber" subtext="Commandes en cours" />
      </div>

      <SectionCard title="Revenu mensuel" icon={TrendingUp} right={<span className="text-xs text-muted-foreground">12 derniers mois</span>}>
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

      <SectionCard title="Versements récents" icon={Wallet} contentClassName="overflow-x-auto">
        {rows.length === 0 ? <EmptyState message="Aucun versement pour cette période." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Réf.</TableHead>
                <TableHead>Café</TableHead>
                <TableHead>Brut</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Net</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 15).map((r) => (
                <TableRow key={r.subOrderId} data-testid={`row-earning-${r.subOrderId}`}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{payoutReference(r.subOrderId)}</TableCell>
                  <TableCell className="font-medium">{r.cafeName}</TableCell>
                  <TableCell>{fmt(r.subtotal)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmt(r.commission)}</TableCell>
                  <TableCell className="font-semibold text-green-600">{fmt(r.netAmount)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.createdAt ? formatDate(r.createdAt as any) : "—"}</TableCell>
                  <TableCell><Badge variant="secondary" className={PAYOUT_STATUS_META[r.payoutStatus].className}>{PAYOUT_STATUS_META[r.payoutStatus].label}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <p className="text-xs text-muted-foreground">{nonCancelled.length} sous-commande(s) facturable(s) sur la période.</p>
    </div>
  );
}
