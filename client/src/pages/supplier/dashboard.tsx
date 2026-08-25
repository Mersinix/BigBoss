import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DollarSign, ShoppingBag, Package, AlertCircle, Layers, Users, AlertTriangle } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { formatDate } from "@/lib/format";
import {
  flattenOrders, summarize, monthlySeries, topProducts, topCustomers, FR_STATUS_LABEL,
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

// Every number here comes from GET /api/orders (already scoped server-side to this
// Supplier's own sub-orders/items — see storage.getOrders) and GET /api/supplier/listings.
// Both queries are already invalidated in realtime by use-realtime.ts on every order/
// sub-order/delivery/inventory event. Built on the same shared dashboard kit as the Admin
// Dashboard (components/dashboard/dashboard-kit.tsx) — data/derivation logic unchanged from
// the previous pass, this only restructures the presentation.
export default function SupplierDashboard() {
  const fmt = useFormatCurrency();
  const { data: orders = [], isLoading } = useQuery<OrderWithDetails[]>({ queryKey: ["/api/orders"] });
  const { data: listings = [] } = useQuery<any[]>({ queryKey: ["/api/supplier/listings"] });

  const lines = useMemo(() => flattenOrders(orders), [orders]);
  const stats = useMemo(() => summarize(lines), [lines]);
  const series = useMemo(() => monthlySeries(lines, 12), [lines]);
  const products = useMemo(() => topProducts(lines, 5), [lines]);
  const customers = useMemo(() => topCustomers(lines, 5), [lines]);
  const maxStatus = Math.max(...STATUS_ORDER.map((s) => stats.statusCounts[s] ?? 0), 1);

  const lowStock = useMemo(() => {
    // supplierProductListings.minStock always has a real value (schema default: 10), so the
    // listing's own aggregate stock vs. minStock is the one signal guaranteed to be
    // populated for every product. Per-variant minStock (shared/schema.ts) is optional/
    // supplier-configured and often null, so it's used only as an extra, more granular
    // flag when a supplier has actually set it — never relied on as the sole signal.
    const rows: { id: number; name: string; qty: number; min: number }[] = [];
    for (const listing of listings) {
      const flaggedVariant = (listing.variants ?? []).find((v: any) => v.minStock != null && v.quantity <= v.minStock);
      if (flaggedVariant) {
        rows.push({ id: flaggedVariant.id, name: `${listing.product?.name ?? "Produit"} — ${[flaggedVariant.flavorName, flaggedVariant.sizeName].filter(Boolean).join(" · ")}`, qty: flaggedVariant.quantity, min: flaggedVariant.minStock });
      } else if (listing.stock <= listing.minStock) {
        rows.push({ id: listing.id, name: listing.product?.name ?? "Produit", qty: listing.stock, min: listing.minStock });
      }
    }
    return rows;
  }, [listings]);

  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()).slice(0, 6),
    [orders],
  );

  if (isLoading) {
    return <div className="flex flex-col gap-4 p-6">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <DashboardHero
        title="Bienvenue !"
        subtitle="Voici votre aperçu fournisseur sur BigBoss Coffee."
        stat={fmt(stats.deliveredRevenue)}
        statLabel="Chiffre d'affaires livré"
        icon={DollarSign}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Commandes" value={stats.orderCount} icon={ShoppingBag} tone="primary" subtext={`${stats.deliveredCount} livrée(s)`} />
        <StatCard label="En attente" value={stats.statusCounts["PENDING"] ?? 0} icon={AlertCircle} tone="amber" subtext="À confirmer" />
        <StatCard label="Annulées" value={stats.cancelledCount} icon={AlertCircle} tone="red" subtext={`${(stats.cancellationRate * 100).toFixed(1)}% du total`} />
        <StatCard label="Produits actifs" value={listings.length} icon={Package} tone="green" subtext="référencé(s)" />
        <StatCard label="Stock faible" value={lowStock.length} icon={AlertTriangle} tone={lowStock.length > 0 ? "red" : "blue"} subtext={lowStock.length > 0 ? "à réapprovisionner" : "tout est ok"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Aperçu des ventes" icon={DollarSign} right={<span className="text-xs text-muted-foreground">12 derniers mois</span>}>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d97706" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [fmt(v as number), "Revenu"]} />
              <Area type="monotone" dataKey="revenue" stroke="#d97706" strokeWidth={2} fill="url(#salesGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Répartition des statuts" icon={Layers}>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SectionCard
          title="Commandes récentes" icon={ShoppingBag} className="lg:col-span-2" contentClassName="overflow-x-auto"
          right={<Button asChild variant="ghost" size="sm" className="text-xs text-primary"><Link href="/orders">Voir tout</Link></Button>}
        >
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                {["Commande", "Café", "Montant", "Statut", "Date"].map((h) => (
                  <th key={h} className="text-left py-2 px-2 text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-2 font-mono text-muted-foreground">#{String(o.id).padStart(6, "0")}</td>
                  <td className="py-2 px-2 font-medium">{o.cafe?.name}</td>
                  <td className="py-2 px-2 font-semibold">{fmt(o.totalAmount)}</td>
                  <td className="py-2 px-2">
                    <Badge variant="secondary" className={`text-[10px] ${STATUS_BADGE[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {FR_STATUS_LABEL[o.status] ?? o.status}
                    </Badge>
                  </td>
                  <td className="py-2 px-2 text-muted-foreground">{formatDate(o.createdAt as any)}</td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr><td colSpan={5} className="text-center text-muted-foreground py-6">Aucune commande</td></tr>
              )}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard title="Meilleurs clients" icon={Users}>
          {customers.length === 0 ? <EmptyState message="Aucune donnée." /> : (
            <div className="divide-y divide-border/40">
              {customers.map((c, i) => <RankRow key={c.id} rank={i + 1} title={c.name} subtitle={`${c.orders} commande(s)`} value={fmt(c.revenue)} />)}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard
          title="Produits les plus vendus" icon={Package} contentClassName="overflow-x-auto"
          right={<Button asChild variant="ghost" size="sm" className="text-xs text-primary"><Link href="/supplier/products">Voir tout</Link></Button>}
        >
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
        </SectionCard>

        <SectionCard
          title="Alertes stock faible" icon={AlertTriangle}
          right={<Button asChild variant="ghost" size="sm" className="text-xs text-primary"><Link href="/supplier/inventory">Gérer</Link></Button>}
        >
          {lowStock.length === 0 ? (
            <EmptyState message="Tous les produits sont bien approvisionnés." />
          ) : (
            <div className="space-y-2">
              {lowStock.slice(0, 6).map((r) => (
                <AlertRow key={r.id} title={r.name} value={`${r.qty} / min ${r.min}`} tag={r.qty === 0 ? "Rupture" : "Faible"} tone={r.qty === 0 ? "red" : "amber"} />
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
