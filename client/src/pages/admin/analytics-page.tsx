import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
import { TrendingUp, Users, Package, ShoppingBag, Percent, Store } from "lucide-react";
import type { User, OrderWithDetails } from "@shared/schema";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import {
  flattenOrders, filterLinesByDate, resolveDateRange, summarize, monthlySeries,
  topSuppliers, topProducts, topPacks, topCustomers, FR_STATUS_LABEL,
  type DateRangePreset,
} from "@/lib/marketplace-analytics";

const tooltipStyle = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };

export default function AnalyticsPage() {
  const fmt = useFormatCurrency();
  const { data: orders = [], isLoading } = useQuery<OrderWithDetails[]>({ queryKey: ["/api/orders"] });
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
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analyses</h1>
          <p className="text-muted-foreground text-sm mt-1">Performance de la marketplace et indicateurs clés.</p>
        </div>
        <DateRangeFilter preset={preset} onPresetChange={setPreset} custom={custom} onCustomChange={setCustom} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-green-500/10 rounded-xl p-3"><TrendingUp className="w-5 h-5 text-green-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Chiffre d'affaires livré</p>
                <p className="text-xl font-bold text-green-600">{fmt(stats.deliveredRevenue)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-primary/10 rounded-xl p-3"><ShoppingBag className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Commandes</p>
                <p className="text-xl font-bold">{stats.orderCount}</p>
                <p className="text-[11px] text-muted-foreground">PMC: {fmt(stats.averageOrderValue)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-red-500/10 rounded-xl p-3"><Percent className="w-5 h-5 text-red-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Taux d'annulation</p>
                <p className="text-xl font-bold">{(stats.cancellationRate * 100).toFixed(1)}%</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-blue-500/10 rounded-xl p-3"><Users className="w-5 h-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Utilisateurs</p>
                <p className="text-xl font-bold">{users.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base font-semibold">Chiffre d'affaires par mois</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={series} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [fmt(v as number), "Revenu"]} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base font-semibold">Commandes par mois</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={series} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [v, "Commandes livrées"]} />
                <Line type="monotone" dataKey="orders" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Commandes par statut</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={statusChart} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-1.5"><Store className="w-4 h-4 text-amber-500" />Fournisseurs les plus performants</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border/40">
            {suppliers.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Aucune donnée pour cette période.</p>}
            {suppliers.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-bold text-muted-foreground w-5 shrink-0">#{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.orders} commande(s)</p>
                  </div>
                </div>
                <span className="font-semibold text-sm shrink-0">{fmt(s.revenue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-1.5"><Users className="w-4 h-4 text-blue-500" />Meilleurs clients</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border/40">
            {customers.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Aucune donnée pour cette période.</p>}
            {customers.map((c, i) => (
              <div key={c.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-bold text-muted-foreground w-5 shrink-0">#{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.orders} commande(s)</p>
                  </div>
                </div>
                <span className="font-semibold text-sm shrink-0">{fmt(c.revenue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-1.5"><Package className="w-4 h-4 text-green-500" />Produits les plus vendus</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border/40">
            {products5.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Aucune donnée pour cette période.</p>}
            {products5.map((p, i) => (
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
            {packs5.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Aucune donnée pour cette période.</p>}
            {packs5.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm truncate"><span className="text-muted-foreground mr-2">#{i + 1}</span>{p.name}</span>
                <span className="font-semibold text-sm shrink-0">{fmt(p.revenue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">{products.length} produit(s) au catalogue.</p>
    </div>
  );
}
