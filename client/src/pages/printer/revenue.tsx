import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, CalendarCheck, ClipboardList } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatMonthKey } from "@/lib/print-order-status";

const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

type PrintRevenueSummary = {
  totalEarnedCents: number;
  completedOrders: number;
  currentMonthCents: number;
  currentMonthOrders: number;
  history: { month: string; totalCents: number; orders: number }[];
};

// Reuses the exact same GET /api/print/revenue query (same query key) already fetched by
// dashboard.tsx/analytics.tsx — react-query dedupes/caches it, so this is not a second data
// source. Mirrors pages/barista-academy/revenue.tsx's KPI-tiles + 6-month-chart layout.
export default function PrinterRevenuePage() {
  const fmt = useFormatCurrency();
  const { data, isLoading } = useQuery<PrintRevenueSummary>({ queryKey: ["/api/print/revenue"] });

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  const chartData = data.history.map((h) => ({ month: formatMonthKey(h.month), total: h.totalCents / 100 }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Revenus</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Revenus générés par vos commandes livrées.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total gagné", value: fmt(data.totalEarnedCents), icon: DollarSign, color: "text-green-600" },
          { label: "Commandes livrées", value: String(data.completedOrders), icon: ClipboardList, color: "text-blue-500" },
          { label: "Ce mois-ci", value: fmt(data.currentMonthCents), icon: TrendingUp, color: "text-indigo-500" },
          { label: "Livrées ce mois-ci", value: String(data.currentMonthOrders), icon: CalendarCheck, color: "text-amber-500" },
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

      <Card className={CARD_CLASS}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500" /> Revenus (6 mois)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.totalEarnedCents === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucun revenu pour le moment. Livrez une commande pour commencer à générer des revenus.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="printerRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [fmt(Math.round(v * 100)), "Revenus"]} />
                <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#printerRevenueGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
