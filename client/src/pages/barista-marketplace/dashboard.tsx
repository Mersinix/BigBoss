import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Briefcase, Star, Clock, TrendingUp, MessageCircle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const requestData = [
  { month: "Jan", requests: 3 }, { month: "Fév", requests: 7 }, { month: "Mar", requests: 12 },
  { month: "Avr", requests: 9 }, { month: "Mai", requests: 15 }, { month: "Jun", requests: 11 },
];

const recentRequests = [
  { id: "BAR-01", cafe: "Café des Arts", type: "Barista temps plein", date: "8 Jun 2026", status: "En discussion" },
  { id: "BAR-02", cafe: "Lounge Médina", type: "Barista événement", date: "11 Jun 2026", status: "Accepté" },
  { id: "BAR-03", cafe: "Ariana Café", type: "Formation équipe", date: "13 Jun 2026", status: "En attente" },
];

export default function BaristaMarketplaceDashboard() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Marketplace Barista</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Bienvenue, {user?.name}. Gérez vos offres et demandes.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Demandes ce mois", value: "11", icon: Briefcase, color: "text-indigo-500" },
          { label: "Missions actives", value: "2", icon: Users, color: "text-blue-500" },
          { label: "En attente", value: "4", icon: Clock, color: "text-amber-500" },
          { label: "Note", value: "4.7", icon: Star, color: "text-yellow-500" },
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" /> Demandes (6 mois)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={requestData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="baristaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
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
            <div className="space-y-3">
              {recentRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-secondary/20">
                  <div>
                    <p className="font-medium text-sm">{r.cafe}</p>
                    <p className="text-xs text-muted-foreground">{r.type} · {r.date}</p>
                  </div>
                  <Badge variant="secondary" className={
                    r.status === "Accepté" ? "bg-green-100 text-green-700" :
                    r.status === "En discussion" ? "bg-blue-100 text-blue-700" :
                    "bg-amber-100 text-amber-700"
                  }>{r.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
