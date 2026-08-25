import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrders } from "@/hooks/use-orders";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, ShoppingBag, Clock, Percent, CheckCircle2, XCircle, Store, Users, Package, Layers,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useFormatCurrency } from "@/hooks/use-currency";
import { formatDate } from "@/lib/format";
import {
  flattenOrders, summarize, monthlySeries, topSuppliers, topProducts, topPacks, topCustomers,
  FR_STATUS_LABEL, PLATFORM_COMMISSION_RATE,
} from "@/lib/marketplace-analytics";
import {
  DashboardHero, StatCard, SectionCard, RankRow, AlertRow, EmptyState,
} from "@/components/dashboard/dashboard-kit";

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PREPARING: "bg-indigo-100 text-indigo-700",
  READY: "bg-teal-100 text-teal-700",
  IN_DELIVERY: "bg-cyan-100 text-cyan-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const STATUS_ORDER = ["PENDING", "CONFIRMED", "PREPARING", "READY", "IN_DELIVERY", "DELIVERED", "CANCELLED"];

function daysSince(date: any): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

// Admin-only landing dashboard (see App.tsx SmartDashboard/HomeRoute — Cafe Owner is
// redirected to /products and every other role has its own branch, so this component is
// reached only by ADMIN/SUPER_ADMIN). Built on top of the shared dashboard component kit
// (components/dashboard/dashboard-kit.tsx) so Admin and Supplier read as the same product.
// All figures still come from lib/marketplace-analytics.ts, unchanged — this pass only
// restructures the presentation; GET /api/orders remains the single data source, already
// kept live by use-realtime.ts's existing ["/api/orders"] invalidation.
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
  const activeSupplierCount = useMemo(() => new Set(lines.map((l) => l.supplierId)).size, [lines]);
  const activeCustomerCount = useMemo(() => new Set(lines.map((l) => l.cafeId)).size, [lines]);

  // "Needs attention": oldest still-PENDING orders (awaiting a supplier response) — real,
  // derived from createdAt, not fabricated.
  const attentionOrders = useMemo(
    () => orders
      .filter((o) => (o.subOrders?.length ? o.subOrders.some((so: any) => so.status === "PENDING") : o.status === "PENDING"))
      .sort((a, b) => new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime())
      .slice(0, 5),
    [orders],
  );

  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()).slice(0, 6),
    [orders],
  );

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <DashboardHero
        title={`Bon retour, ${user?.name ?? "Admin"}`}
        subtitle="Voici ce qu'il se passe sur votre marketplace aujourd'hui."
        stat={fmt(stats.grossRevenue)}
        statLabel="Chiffre d'affaires"
        icon={DollarSign}
      />

      {/* KPI overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Commandes" value={stats.orderCount} icon={ShoppingBag} tone="primary" subtext={`${stats.activeCount} active(s)`} />
        <StatCard label="En attente fournisseur" value={pendingSupplierRequests} icon={Clock} tone="amber" subtext="Réponse requise" />
        <StatCard label="Livrées" value={stats.deliveredCount} icon={CheckCircle2} tone="green" subtext={`PMC ${fmt(stats.averageOrderValue)}`} />
        <StatCard label="Annulées" value={stats.cancelledCount} icon={XCircle} tone="red" subtext={`${(stats.cancellationRate * 100).toFixed(1)}% du total`} />
        <StatCard label="Commission plateforme" value={fmt(stats.commission)} icon={Percent} tone="blue" subtext={`${(PLATFORM_COMMISSION_RATE * 100).toFixed(0)}% du livré`} />
      </div>

      {/* Trends: revenue evolution + status distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Évolution du chiffre d'affaires" icon={DollarSign} right={<span className="text-xs text-muted-foreground">12 derniers mois</span>}>
          <ResponsiveContainer width="100%" height={200}>
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
        </SectionCard>

        <SectionCard title="Répartition par statut" icon={Layers}>
          <div className="space-y-2.5">
            {STATUS_ORDER.map((status) => {
              const value = stats.statusCounts[status] ?? 0;
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-32 shrink-0">{FR_STATUS_LABEL[status]}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${status === "CANCELLED" ? "bg-red-500" : status === "DELIVERED" ? "bg-green-500" : "bg-amber-500"}`} style={{ width: `${(value / maxStatus) * 100}%` }} />
                  </div>
                  <span className="text-xs w-6 text-right font-medium text-foreground">{value}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Operational overview: what needs attention right now */}
      <SectionCard title="Nécessite votre attention" icon={Clock} right={<Badge variant="secondary" className="text-[10px]">{attentionOrders.length} en attente</Badge>}>
        {attentionOrders.length === 0 ? (
          <EmptyState message="Aucune commande en attente d'un fournisseur." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {attentionOrders.map((order) => {
              const age = daysSince(order.createdAt);
              return (
                <AlertRow
                  key={order.id}
                  title={`Commande #${String(order.id).padStart(6, "0")}`}
                  subtitle={order.cafe?.name}
                  value={fmt(order.totalAmount)}
                  tag={age > 0 ? `${age} j` : "Aujourd'hui"}
                  tone={age >= 2 ? "red" : "amber"}
                />
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Recent activity + top suppliers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SectionCard title="Activité récente" icon={ShoppingBag} className="lg:col-span-2" contentClassName="overflow-x-auto">
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
        </SectionCard>

        <SectionCard title="Top fournisseurs" icon={Store} right={<span className="text-[11px] text-muted-foreground">{activeSupplierCount} actifs</span>}>
          {suppliers.length === 0 ? <EmptyState message="Aucune donnée." /> : (
            <div className="divide-y divide-border/40">
              {suppliers.map((s, i) => <RankRow key={s.id} rank={i + 1} title={s.name} subtitle={`${s.orders} commande(s)`} value={fmt(s.revenue)} />)}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Top clients + top products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Top clients" icon={Users} right={<span className="text-[11px] text-muted-foreground">{activeCustomerCount} actifs</span>}>
          {customers.length === 0 ? <EmptyState message="Aucune donnée." /> : (
            <div className="divide-y divide-border/40">
              {customers.map((c, i) => <RankRow key={c.id} rank={i + 1} title={c.name} subtitle={`${c.orders} commande(s)`} value={fmt(c.revenue)} />)}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Produits les plus vendus" icon={Package} contentClassName="overflow-x-auto">
          {products.length === 0 ? <EmptyState message="Aucune vente." /> : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  {["Produit", "Qté", "Revenu"].map((h) => <th key={h} className="text-left py-2 text-muted-foreground font-medium">{h}</th>)}
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
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>

      {/* Top packs */}
      <SectionCard title="Packs les plus vendus" icon={Layers} contentClassName="overflow-x-auto">
        {packs.length === 0 ? <EmptyState message="Aucune vente." /> : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                {["Pack", "Qté", "Revenu"].map((h) => <th key={h} className="text-left py-2 text-muted-foreground font-medium">{h}</th>)}
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
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
