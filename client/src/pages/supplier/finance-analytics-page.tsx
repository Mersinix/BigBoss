import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
import { TrendingUp, ShoppingBag, Package, Percent } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import {
  flattenOrders, filterLinesByDate, resolveDateRange, summarize, monthlySeries, topCustomers,
  topProducts, topPacks, type DateRangePreset,
} from "@/lib/marketplace-analytics";
import { PLATFORM_COMMISSION_RATE } from "@/lib/financial-rows";

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
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analyses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Performance financière et insights de vente.</p>
        </div>
        <DateRangeFilter preset={preset} onPresetChange={setPreset} custom={custom} onCustomChange={setCustom} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-xl p-3 bg-amber-500/10"><TrendingUp className="w-5 h-5 text-amber-500" /></div>
            <div><p className="text-xs text-muted-foreground">Chiffre d'affaires livré</p><p className="text-xl font-bold">{fmt(stats.deliveredRevenue)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-xl p-3 bg-primary/10"><ShoppingBag className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Commandes</p>
              <p className="text-xl font-bold">{stats.orderCount}</p>
              <p className="text-[11px] text-muted-foreground">PMC: {fmt(stats.averageOrderValue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-xl p-3 bg-green-500/10"><Package className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">Produits référencés</p><p className="text-xl font-bold">{listings.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="rounded-xl p-3 bg-blue-500/10"><Percent className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Commission plateforme</p>
              <p className="text-xl font-bold">{fmt(stats.commission)}</p>
              <p className="text-[11px] text-muted-foreground">Net: {fmt(stats.supplierNet)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Livrées vs annulées</span>
            <span className="text-sm font-semibold">{stats.deliveredCount} / {stats.cancelledCount}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Taux d'annulation</span>
            <span className="text-sm font-semibold">{(stats.cancellationRate * 100).toFixed(1)}%</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base font-semibold">Revenu mensuel</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={series} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [fmt(v as number), "Revenu"]} />
                <Bar dataKey="revenue" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-semibold">Commandes mensuelles</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={series} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [v, "Commandes"]} />
                <Line type="monotone" dataKey="orders" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base font-semibold">Produits les plus vendus</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border/40">
            {products.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Aucune donnée pour cette période.</p>}
            {products.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm truncate"><span className="text-muted-foreground mr-2">#{i + 1}</span>{p.name}</span>
                <span className="font-semibold text-sm shrink-0">{fmt(p.revenue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base font-semibold">Packs les plus vendus</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border/40">
            {packs.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Aucune donnée pour cette période.</p>}
            {packs.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm truncate"><span className="text-muted-foreground mr-2">#{i + 1}</span>{p.name}</span>
                <span className="font-semibold text-sm shrink-0">{fmt(p.revenue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Meilleurs clients</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y divide-border/40">
            {customers.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Aucune donnée pour cette période.</p>}
            {customers.map((c, i) => (
              <div key={c.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-muted-foreground w-5">#{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.orders} commande(s)</p>
                  </div>
                </div>
                <span className="font-semibold text-sm text-amber-500">{fmt(c.revenue)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">Commission plateforme: {(PLATFORM_COMMISSION_RATE * 100).toFixed(0)}% sur les commandes livrées.</p>
    </div>
  );
}
