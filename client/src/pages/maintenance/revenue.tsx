import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, CalendarCheck, ClipboardList } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type MaintenanceRevenueSummary = {
  totalEarnedCents: number; completedReservations: number; currentMonthCents: number; currentMonthReservations: number;
  pendingCents: number; pendingReservations: number; dailyRateInCents: number;
  history: { month: string; totalCents: number; reservations: number }[];
};

// Mirrors barista-academy/revenue.tsx exactly (same real-data-only,
// COMPLETED-vs-CONFIRMED split). No payment processor exists in this
// project, and maintenanceReservations captures no per-booking price at
// all (unlike academyRegistrations) — each figure below is the provider's
// CURRENT daily rate (Business → Profil, "Tarif journalier") multiplied by
// a real reservation count, so it's an honest estimate from real
// synchronized data, never a fabricated number. Framed explicitly as an
// estimate below since the rate can change over time.
export default function MaintenanceRevenuePage() {
  const { user } = useAuth();
  const fmt = useFormatCurrency();
  const { data, isLoading } = useQuery<MaintenanceRevenueSummary>({
    queryKey: ["/api/maintenance/revenue"],
    enabled: user?.role === "MAINTENANCE",
  });

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

  const chartData = data.history.map((h) => ({ month: h.month.slice(5), total: h.totalCents / 100 }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Revenus</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Estimation basée sur votre tarif journalier actuel ({fmt(data.dailyRateInCents)}) et vos interventions terminées.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total estimé", value: fmt(data.totalEarnedCents), icon: DollarSign, color: "text-green-600" },
          { label: "Interventions terminées", value: String(data.completedReservations), icon: ClipboardList, color: "text-blue-500" },
          { label: "Ce mois-ci", value: fmt(data.currentMonthCents), icon: TrendingUp, color: "text-orange-500" },
          { label: "Terminées ce mois-ci", value: String(data.currentMonthReservations), icon: CalendarCheck, color: "text-amber-500" },
        ].map((kpi) => (
          <Card key={kpi.label}>
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

      {data.pendingReservations > 0 && (
        <Card className="bg-orange-50/60 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/40">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Interventions confirmées, pas encore terminées</p>
              <p className="text-xs text-muted-foreground mt-0.5">{data.pendingReservations} intervention{data.pendingReservations > 1 ? "s" : ""} — pas encore comptée{data.pendingReservations > 1 ? "s" : ""} dans le total ci-dessus.</p>
            </div>
            <p className="font-bold text-orange-600">{fmt(data.pendingCents)}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-orange-500" /> Revenus estimés (6 mois)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.totalEarnedCents === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucun revenu pour le moment. Terminez une intervention pour commencer à générer des revenus.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="maintenanceRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [fmt(Math.round(v * 100)), "Revenus"]} />
                <Area type="monotone" dataKey="total" stroke="#f97316" strokeWidth={2} fill="url(#maintenanceRevenueGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
