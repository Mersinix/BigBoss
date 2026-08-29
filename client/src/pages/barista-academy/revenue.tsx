import { useAcademyRevenue } from "@/hooks/use-barista-academy";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, CalendarCheck, ClipboardList } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// No payment processor exists in this project (mirrors barista-marketplace/
// revenue.tsx's own note) — "Total gagné" only ever counts COMPLETED
// registrations (training actually delivered), and is kept visually distinct
// from "En attente" (CONFIRMED but not yet delivered) so nothing implies money
// was actually paid.
export default function AcademyRevenuePage() {
  const { data, isLoading } = useAcademyRevenue();
  const fmt = useFormatCurrency();

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-5 p-6">
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
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Revenus</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Revenus générés par vos formations terminées.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total gagné", value: fmt(data.totalEarnedCents), icon: DollarSign, color: "text-green-600" },
          { label: "Formations terminées", value: String(data.completedRegistrations), icon: ClipboardList, color: "text-blue-500" },
          { label: "Ce mois-ci", value: fmt(data.currentMonthCents), icon: TrendingUp, color: "text-indigo-500" },
          { label: "Terminées ce mois-ci", value: String(data.currentMonthRegistrations), icon: CalendarCheck, color: "text-amber-500" },
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

      {data.pendingRegistrations > 0 && (
        <Card className="bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/40">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Inscriptions confirmées, formation pas encore délivrée</p>
              <p className="text-xs text-muted-foreground mt-0.5">{data.pendingRegistrations} inscription{data.pendingRegistrations > 1 ? "s" : ""} — pas encore comptée{data.pendingRegistrations > 1 ? "s" : ""} dans le revenu ci-dessus.</p>
            </div>
            <p className="font-bold text-indigo-600">{fmt(data.pendingCents)}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500" /> Revenus (6 mois)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.totalEarnedCents === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucun revenu pour le moment. Terminez une formation pour commencer à générer des revenus.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="academyRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [fmt(Math.round(v * 100)), "Revenus"]} />
                <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} fill="url(#academyRevenueGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
