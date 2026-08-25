import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Percent, XCircle } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import {
  flattenOrders, filterLinesByDate, resolveDateRange, summarize, monthlySeries, topSuppliers,
  type DateRangePreset,
} from "@/lib/marketplace-analytics";
import { buildFinancialRows, PLATFORM_COMMISSION_RATE } from "@/lib/financial-rows";

// Reuses the exact same commission/net formula as Admin Payouts/Invoices (lib/financial-rows.ts)
// and the same delivered/cancelled revenue recognition as the Admin Dashboard/Analytics (lib/
// marketplace-analytics.ts) — so a number shown here can never disagree with what those pages
// show for the same period (see the task's "same business event must produce consistent
// results across Admin/Supplier/Payouts/Invoices" rule).
export default function EarningsPage() {
  const fmt = useFormatCurrency();
  const { data: orders = [], isLoading } = useQuery<OrderWithDetails[]>({ queryKey: ["/api/orders"] });
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
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revenus</h1>
          <p className="text-muted-foreground text-sm mt-1">Vue financière de la marketplace.</p>
        </div>
        <DateRangeFilter preset={preset} onPresetChange={setPreset} custom={custom} onCustomChange={setCustom} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground font-medium">Chiffre d'affaires livré</p>
                <div className="bg-amber-500/10 p-1.5 rounded-lg"><DollarSign className="w-4 h-4 text-amber-500" /></div>
              </div>
              <p className="text-2xl font-bold text-amber-500">{fmt(stats.deliveredRevenue)}</p>
              <p className="text-xs text-muted-foreground mt-1">Commandes livrées sur la période</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground font-medium">Ce mois</p>
                <div className="bg-green-500/10 p-1.5 rounded-lg"><TrendingUp className="w-4 h-4 text-green-500" /></div>
              </div>
              <p className="text-2xl font-bold text-green-500">{fmt(series[series.length - 1]?.revenue ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">Mois en cours</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground font-medium">Croissance mensuelle</p>
                <div className={`p-1.5 rounded-lg ${monthGrowth >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                  {monthGrowth >= 0 ? <TrendingUp className="w-4 h-4 text-green-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
                </div>
              </div>
              <p className={`text-2xl font-bold ${monthGrowth >= 0 ? "text-green-500" : "text-red-500"}`}>{monthGrowth >= 0 ? "+" : ""}{monthGrowth.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground mt-1">vs mois précédent</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground font-medium">Commission plateforme</p>
                <div className="bg-blue-500/10 p-1.5 rounded-lg"><Percent className="w-4 h-4 text-blue-500" /></div>
              </div>
              <p className="text-2xl font-bold text-blue-500">{fmt(stats.commission)}</p>
              <p className="text-xs text-muted-foreground mt-1">{(PLATFORM_COMMISSION_RATE * 100).toFixed(0)}% du livré</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium">Montant à verser aux fournisseurs</p>
            <p className="text-xl font-bold text-green-600 mt-1">{fmt(paidOut)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium">Versements à venir</p>
            <p className="text-xl font-bold text-amber-600 mt-1">{fmt(pendingPayout)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium">Chiffre d'affaires annulé (exclu)</p>
              <p className="text-lg font-bold text-red-500 mt-0.5">{fmt(stats.cancelledRevenue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Revenu mensuel (livré)</CardTitle>
              <span className="text-xs text-muted-foreground">12 derniers mois</span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-52 w-full" /> : (
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
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-semibold">Revenus par fournisseur</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : (
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
                  {suppliers.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Aucune donnée pour cette période</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
