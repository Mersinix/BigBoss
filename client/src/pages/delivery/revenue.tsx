import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDeliveries } from "@/hooks/use-deliveries";
import { useMyFinancialSummary } from "@/hooks/use-delivery-ecosystem";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Package, Banknote } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";
const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

// Espace Livraison → Performance → Revenus — previously a placeholder pointing back to the
// Dashboard tab (see delivery/performance.tsx). No dedicated delivery-revenue backend
// endpoint exists, so every figure here is computed client-side from the same real
// useDeliveries()/useMyFinancialSummary() data already used by delivery/dashboard.tsx (same
// companyPayoutCents field, same fallback to deliveryFee for pre-Phase-3 deliveries) — mirrors
// the client-bucketed convention maintenance/analytics.tsx already uses. No mock data.
export default function DeliveryRevenuePage() {
  const { user } = useAuth();
  const fmt = useFormatCurrency();
  const { data: deliveries = [], isLoading } = useDeliveries();
  const { data: financialSummary } = useMyFinancialSummary();

  const mine = useMemo(() => deliveries.filter((d) => d.deliveryCompanyId === user?.id), [deliveries, user?.id]);
  const delivered = mine.filter((d) => d.status === "DELIVERED");
  const payoutOf = (d: (typeof mine)[number]) => d.companyPayoutCents ?? d.deliveryFee ?? 0;
  const totalConserve = delivered.reduce((s, d) => s + payoutOf(d), 0);
  const avgPerDelivery = delivered.length > 0 ? Math.round(totalConserve / delivered.length) : 0;

  const now = new Date();
  const thisMonth = delivered.filter((d) => {
    if (!d.deliveredAt && !d.createdAt) return false;
    const dd = new Date((d.deliveredAt ?? d.createdAt) as any);
    return dd.getFullYear() === now.getFullYear() && dd.getMonth() === now.getMonth();
  });
  const thisMonthTotal = thisMonth.reduce((s, d) => s + payoutOf(d), 0);

  const byMonth = useMemo(() => {
    const buckets: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const total = delivered
        .filter((del) => {
          const dd = new Date((del.deliveredAt ?? del.createdAt) as any);
          return dd.getFullYear() === d.getFullYear() && dd.getMonth() === d.getMonth();
        })
        .reduce((s, del) => s + payoutOf(del), 0);
      buckets.push({ month: MONTH_LABELS[d.getMonth()], revenue: total / 100 });
    }
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivered]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Revenus"
        subtitle="Montants conservés par votre entreprise sur vos livraisons."
        stat={fmt(totalConserve)}
        statLabel="Total conservé"
        icon={DollarSign}
        gradientClass="bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent border-teal-500/20"
        iconBgClass="bg-teal-500/15"
        iconTextClass="text-teal-600 dark:text-teal-400"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total conservé", value: fmt(totalConserve), icon: DollarSign, color: "text-green-600" },
          { label: "Ce mois-ci", value: fmt(thisMonthTotal), icon: TrendingUp, color: "text-teal-500" },
          { label: "Livraisons livrées", value: String(delivered.length), icon: Package, color: "text-blue-500" },
          { label: "Montant moyen / livraison", value: fmt(avgPerDelivery), icon: DollarSign, color: "text-amber-500" },
        ].map((kpi) => (
          <Card key={kpi.label} className={CARD_CLASS}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {financialSummary && (
        <Card className={CARD_CLASS}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Banknote className="w-4 h-4 text-teal-600" />Règlement</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm pt-0">
            <div><p className="text-xs text-muted-foreground">Dû</p><p className="font-semibold">{fmt(financialSummary.owedCents)}</p></div>
            <div><p className="text-xs text-muted-foreground">Approuvé</p><p className="font-semibold">{fmt(financialSummary.approvedCents)}</p></div>
            <div><p className="text-xs text-muted-foreground">Payé</p><p className="font-semibold text-emerald-600">{fmt(financialSummary.paidCents)}</p></div>
            <div><p className="text-xs text-muted-foreground">En attente</p><p className="font-semibold text-amber-600">{fmt(financialSummary.outstandingCents)}</p></div>
          </CardContent>
        </Card>
      )}

      <Card className={CARD_CLASS}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-500" /> Revenus conservés (6 mois)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalConserve === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucun revenu pour le moment. Livrez une commande pour commencer à générer des revenus.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={byMonth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="deliveryRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [fmt(Math.round(v * 100)), "Revenus"]} />
                <Area type="monotone" dataKey="revenue" stroke="#0d9488" strokeWidth={2} fill="url(#deliveryRevenueGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
