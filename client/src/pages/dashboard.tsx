import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrders } from "@/hooks/use-orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, ShoppingBag, Clock, Percent } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useFormatCurrency } from "@/hooks/use-currency";
import { formatDate } from "@/lib/format";
import {
  flattenOrders, summarize, monthlySeries, topSuppliers, topProducts, topPacks, topCustomers,
  FR_STATUS_LABEL, PLATFORM_COMMISSION_RATE,
} from "@/lib/marketplace-analytics";

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  CONFIRMED: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  PREPARING: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  READY: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
  IN_DELIVERY: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  DELIVERED: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
};

const STATUS_ORDER = ["PENDING", "CONFIRMED", "PREPARING", "READY", "IN_DELIVERY", "DELIVERED", "CANCELLED"];

// Admin-only landing dashboard (see App.tsx SmartDashboard/HomeRoute — Cafe Owner is
// redirected to /products and every other role has its own branch, so this component is
// reached only by ADMIN/SUPER_ADMIN). Deliberately mirrors supplier/dashboard.tsx's layout
// rhythm (KPI row → chart+breakdown row → recent+ranking row → ranking+ranking row) card for
// card, so the two dashboards read as the same product — only the underlying data differs
// (marketplace-wide here vs. one supplier there). All data/derivation logic is unchanged
// from the previous pass (lib/marketplace-analytics.ts), still built on GET /api/orders,
// which use-realtime.ts already keeps live — this task only restructures the presentation.
export default function Dashboard() {
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useOrders();
  const fmt = useFormatCurrency();

  const lines = useMemo(() => flattenOrders(orders), [orders]);
  const stats = useMemo(() => summarize(lines), [lines]);
  const series = useMemo(() => monthlySeries(lines, 12), [lines]);
  const suppliers = useMemo(() => topSuppliers(lines, 5), [lines]);
  const products = useMemo(() => topProducts(lines, 5), [lines]);
  const packs = useMemo(() => topPacks(lines, 5), [lines]);
  const customers = useMemo(() => topCustomers(lines, 5), [lines]);
  const maxStatus = Math.max(...STATUS_ORDER.map((s) => stats.statusCounts[s] ?? 0), 1);
  const pendingSupplierRequests = stats.statusCounts["PENDING"] ?? 0;
  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()).slice(0, 6),
    [orders],
  );

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Bon retour, {user?.name}. Voici ce qu'il se passe sur votre marketplace aujourd'hui.</p>
      </div>

      {/* KPI row — same card anatomy as the Supplier dashboard: icon top-right, small
          label, large bold figure, one-line context underneath. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Chiffre d'affaires</p>
              <DollarSign className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-amber-500">{fmt(stats.grossRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">Livré: {fmt(stats.deliveredRevenue)} · En cours: {fmt(stats.pendingRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Commandes</p>
              <ShoppingBag className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold">{stats.orderCount}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.activeCount} active(s) · {stats.deliveredCount} livrée(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">En attente fournisseur</p>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-amber-500">{pendingSupplierRequests}</p>
            <p className="text-xs text-muted-foreground mt-1">Annulées: {stats.cancelledCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Commission plateforme</p>
              <Percent className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold text-green-500">{fmt(stats.commission)}</p>
            <p className="text-xs text-muted-foreground mt-1">{(PLATFORM_COMMISSION_RATE * 100).toFixed(0)}% du chiffre livré</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart + status breakdown — same two-column row and chart styling as the Supplier
          dashboard's "Aperçu des ventes" / "Répartition des statuts". */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Aperçu du chiffre d'affaires</CardTitle>
              <span className="text-xs text-muted-foreground">12 derniers mois</span>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="adminSalesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d97706" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [fmt(v as number), "Revenu"]} />
                <Area type="monotone" dataKey="revenue" stroke="#d97706" strokeWidth={2} fill="url(#adminSalesGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Répartition par statut</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {STATUS_ORDER.map((status) => {
              const value = stats.statusCounts[status] ?? 0;
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-32 shrink-0">{FR_STATUS_LABEL[status]}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${status === "CANCELLED" ? "bg-red-500" : status === "DELIVERED" ? "bg-green-500" : "bg-amber-500"}`} style={{ width: `${(value / maxStatus) * 100}%` }} />
                  </div>
                  <span className="text-xs w-4 text-right text-muted-foreground">{value}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Recent orders + top suppliers — same 2/1-column split as the Supplier dashboard's
          "Commandes récentes" / "Meilleurs clients" row. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Activité récente</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    {["Commande", "Client", "Montant", "Statut", "Date"].map((h) => (
                      <th key={h} className="text-left py-2 px-2 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-2 font-mono text-muted-foreground">#{String(order.id).padStart(6, "0")}</td>
                      <td className="py-2 px-2 font-medium">{order.cafe?.name}</td>
                      <td className="py-2 px-2 font-semibold">{fmt(order.totalAmount)}</td>
                      <td className="py-2 px-2">
                        <Badge variant="secondary" className={`text-[10px] ${STATUS_BADGE[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {FR_STATUS_LABEL[order.status] ?? order.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{formatDate(order.createdAt as any)}</td>
                    </tr>
                  ))}
                  {recentOrders.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-muted-foreground py-6">Aucune activité récente</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top fournisseurs</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {suppliers.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Aucune donnée.</p>}
            {suppliers.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate"><span className="text-muted-foreground mr-1">#{i + 1}</span>{s.name}</p>
                  <p className="text-[10px] text-muted-foreground">{s.orders} commande(s)</p>
                </div>
                <span className="text-xs font-semibold shrink-0">{fmt(s.revenue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Top clients + top products — same two 1-column card row as the Supplier
          dashboard's "Top Products" / "Low Stock Alerts" row. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top clients</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {customers.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Aucune donnée.</p>}
            {customers.map((c, i) => (
              <div key={c.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate"><span className="text-muted-foreground mr-1">#{i + 1}</span>{c.name}</p>
                  <p className="text-[10px] text-muted-foreground">{c.orders} commande(s)</p>
                </div>
                <span className="text-xs font-semibold shrink-0">{fmt(c.revenue)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Produits les plus vendus</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  {["Produit", "Qté vendue", "Revenu"].map((h) => <th key={h} className="text-left py-2 text-muted-foreground font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-border/30">
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 text-muted-foreground">{p.quantity}</td>
                    <td className="py-2 font-semibold text-amber-500">{fmt(p.revenue)}</td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr><td colSpan={3} className="text-center text-muted-foreground py-6">Aucune vente</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Top packs — closing full-width section, same table treatment as Top Products. */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Packs les plus vendus</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                {["Pack", "Qté vendue", "Revenu"].map((h) => <th key={h} className="text-left py-2 text-muted-foreground font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {packs.map((p) => (
                <tr key={p.id} className="border-b border-border/30">
                  <td className="py-2 font-medium">{p.name}</td>
                  <td className="py-2 text-muted-foreground">{p.quantity}</td>
                  <td className="py-2 font-semibold text-amber-500">{fmt(p.revenue)}</td>
                </tr>
              ))}
              {packs.length === 0 && (
                <tr><td colSpan={3} className="text-center text-muted-foreground py-6">Aucune vente</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
