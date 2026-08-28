import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getAvatarUrl } from "@/lib/avatar";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Printer, Package, ShoppingBag, TrendingUp, Clock, Factory, ClipboardList, Mail, Phone, MapPin } from "lucide-react";
import type { PrintCatalogItem, PrintOrderWithParties } from "@shared/schema";
import { DashboardHero, StatCard, SectionCard, EmptyState } from "@/components/dashboard/dashboard-kit";
import { PRINT_ORDER_STATUS_META, formatMonthKey } from "@/lib/print-order-status";

type PrintRevenueSummary = {
  totalEarnedCents: number;
  completedOrders: number;
  currentMonthCents: number;
  currentMonthOrders: number;
  history: { month: string; totalCents: number; orders: number }[];
};

// Real Printer dashboard — every number here is computed client-side from the live
// /api/print/orders, /api/print/catalog and /api/print/revenue endpoints (no mock data).
// "Note moyenne" is deliberately omitted: there is no printer-level aggregate rating
// endpoint exposed to the Printer's own dashboard, so it cannot be honestly computed
// (same convention as pages/maintenance/dashboard.tsx omitting KPIs it can't back with
// real data).
export default function PrinterDashboard() {
  const { user } = useAuth();
  const fmt = useFormatCurrency();

  const { data: orders = [], isLoading: ordersLoading } = useQuery<PrintOrderWithParties[]>({
    queryKey: ["/api/print/orders"],
  });
  const { data: catalog = [], isLoading: catalogLoading } = useQuery<PrintCatalogItem[]>({
    queryKey: ["/api/print/catalog"],
  });
  const { data: revenue, isLoading: revenueLoading } = useQuery<PrintRevenueSummary>({
    queryKey: ["/api/print/revenue"],
  });

  const isLoading = ordersLoading || catalogLoading || revenueLoading;

  const statusMeta: Record<string, { label: string; cls: string }> = {
    approved: { label: "Compte approuvé", cls: "bg-green-100 text-green-700" },
    pending: { label: "En attente d'approbation", cls: "bg-amber-100 text-amber-700" },
    rejected: { label: "Compte refusé", cls: "bg-red-100 text-red-700" },
  };
  const accountStatus = statusMeta[(user as any)?.status ?? "approved"] ?? { label: (user as any)?.status ?? "—", cls: "bg-gray-100 text-gray-700" };

  const now = new Date();
  const ordersThisMonth = useMemo(
    () => orders.filter((o) => {
      const d = new Date(o.createdAt as any);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }),
    [orders],
  );
  const pendingCount = useMemo(() => orders.filter((o) => o.status === "PENDING").length, [orders]);
  const preparingCount = useMemo(() => orders.filter((o) => o.status === "PREPARING").length, [orders]);
  const activeCatalogCount = useMemo(() => catalog.filter((c) => c.isActive).length, [catalog]);
  const recentOrders = useMemo(
    () => [...orders]
      .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
      .slice(0, 6),
    [orders],
  );

  const chartData = useMemo(
    () => (revenue?.history ?? []).map((h) => ({ month: formatMonthKey(h.month), revenue: h.totalCents / 100 })),
    [revenue],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/20">
        <CardContent className="p-6 flex flex-wrap items-center gap-5">
          <Avatar className="w-16 h-16 shrink-0">
            <AvatarImage src={getAvatarUrl(user as any)} alt={user?.name ?? "Imprimerie"} />
            <AvatarFallback className="bg-blue-600 text-white font-bold text-xl">
              {user?.name?.charAt(0)?.toUpperCase() ?? "P"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-display font-bold text-foreground truncate">{user?.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge variant="secondary" className={accountStatus.cls}>{accountStatus.label}</Badge>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs text-muted-foreground">
              {user?.email && <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{user.email}</span>}
              {(user as any)?.phone && <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{(user as any).phone}</span>}
              {(user as any)?.locationAddress && <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{(user as any).locationAddress}</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <DashboardHero
        title="Dashboard Imprimerie"
        subtitle={`Bienvenue, ${user?.name}. Voici un aperçu de votre activité.`}
        stat={fmt(revenue?.currentMonthCents ?? 0)}
        statLabel="CA ce mois-ci"
        icon={Printer}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Commandes ce mois" value={ordersThisMonth.length} icon={ShoppingBag} tone="primary" />
        <StatCard label="En attente" value={pendingCount} icon={Clock} tone="amber" />
        <StatCard label="En production" value={preparingCount} icon={Factory} tone="blue" />
        <StatCard label="Produits actifs" value={activeCatalogCount} icon={Package} tone="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Chiffre d'affaires (6 mois)" icon={TrendingUp}>
          {chartData.every((d) => d.revenue === 0) && chartData.length === 0 ? (
            <EmptyState message="Pas encore de revenus." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="printerGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [fmt(Math.round(v * 100)), "Revenu"]} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#printerGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Commandes récentes" icon={ClipboardList}>
          {recentOrders.length === 0 ? (
            <EmptyState message="Aucune commande pour le moment." icon={ClipboardList} />
          ) : (
            <div className="space-y-3">
              {recentOrders.map((o) => {
                const meta = PRINT_ORDER_STATUS_META[o.status as keyof typeof PRINT_ORDER_STATUS_META] ?? PRINT_ORDER_STATUS_META.PENDING;
                return (
                  <div key={o.id} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-secondary/20">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{o.cafeOwnerName}</p>
                      <p className="text-xs text-muted-foreground truncate">{o.itemName} · {o.quantity} unités</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold text-sm">{fmt(o.totalInCents)}</span>
                      <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
