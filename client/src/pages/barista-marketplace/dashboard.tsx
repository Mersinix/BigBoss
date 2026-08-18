import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useBaristaRequests, useBaristaMissions, useBaristaReviews, type BaristaRequestStatus } from "@/hooks/use-barista-marketplace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Briefcase, Star, Clock, TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const STATUS_LABELS: Record<BaristaRequestStatus, string> = {
  PENDING: "En attente",
  DISCUSSION: "En discussion",
  ACCEPTED: "Acceptée",
  REJECTED: "Refusée",
  CANCELLED: "Annulée",
  COMPLETED: "Terminée",
};

const STATUS_COLORS: Record<BaristaRequestStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  DISCUSSION: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-600",
  COMPLETED: "bg-purple-100 text-purple-700",
};

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

export default function BaristaMarketplaceDashboard() {
  const { user } = useAuth();
  const { data: requests = [], isLoading: requestsLoading } = useBaristaRequests();
  const { data: missions = [], isLoading: missionsLoading } = useBaristaMissions();
  const { data: reviews = [] } = useBaristaReviews(user?.id ?? null);

  const isLoading = requestsLoading || missionsLoading;

  const now = new Date();
  const thisMonthRequests = requests.filter((r) => {
    const d = new Date(r.createdAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const activeMissions = missions.filter((m) => m.status === "ACTIVE").length;
  const pendingRequests = requests.filter((r) => r.status === "PENDING").length;
  const avgRating = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : "—";

  const chartData = useMemo(() => {
    const buckets: { month: string; requests: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const count = requests.filter((r) => {
        const rd = new Date(r.createdAt);
        return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth();
      }).length;
      buckets.push({ month: MONTH_LABELS[d.getMonth()], requests: count });
    }
    return buckets;
  }, [requests]);

  const recentRequests = useMemo(
    () => [...requests].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)).slice(0, 5),
    [requests]
  );

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Marketplace Barista</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Bienvenue, {user?.name}. Gérez vos offres et demandes.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Demandes ce mois", value: String(thisMonthRequests), icon: Briefcase, color: "text-indigo-500" },
            { label: "Missions actives", value: String(activeMissions), icon: Users, color: "text-blue-500" },
            { label: "En attente", value: String(pendingRequests), icon: Clock, color: "text-amber-500" },
            { label: "Note", value: avgRating, icon: Star, color: "text-yellow-500" },
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
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" /> Demandes (6 mois)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="baristaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v} demandes`, "Demandes"]} />
                <Area type="monotone" dataKey="requests" stroke="#6366f1" strokeWidth={2} fill="url(#baristaGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Demandes récentes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
            ) : recentRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Aucune demande pour le moment.</p>
            ) : (
              <div className="space-y-3">
                {recentRequests.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-secondary/20">
                    <div>
                      <p className="font-medium text-sm">{r.cafeOwnerName}</p>
                      <p className="text-xs text-muted-foreground">{r.missionType} · {r.startDate}</p>
                    </div>
                    <Badge variant="secondary" className={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
