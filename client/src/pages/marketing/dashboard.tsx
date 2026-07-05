import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Users, TrendingUp, Star, BarChart2, Clock } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const salesData = [
  { month: "Jan", revenue: 420 }, { month: "Fév", revenue: 780 }, { month: "Mar", revenue: 960 },
  { month: "Avr", revenue: 1240 }, { month: "Mai", revenue: 1580 }, { month: "Jun", revenue: 1920 },
];

const recentProjects = [
  { id: "MKT-01", client: "Café Médina", service: "Réseaux sociaux", duration: "3 mois", amount: 450, status: "Actif" },
  { id: "MKT-02", client: "Ariana Lounge", service: "Photographie", duration: "1 séance", amount: 320, status: "Terminé" },
  { id: "MKT-03", client: "TunRoast", service: "Branding", duration: "1 mois", amount: 890, status: "En cours" },
];

export default function MarketingDashboard() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Marketing</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Bienvenue, {user?.name}. Gérez vos projets et clients.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Clients actifs", value: "12", icon: Users, color: "text-purple-500" },
          { label: "Projets en cours", value: "5", icon: Clock, color: "text-amber-500" },
          { label: "Projets terminés", value: "34", icon: BarChart2, color: "text-green-500" },
          { label: "Note moyenne", value: "4.9", icon: Star, color: "text-yellow-500" },
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
              <TrendingUp className="w-4 h-4 text-purple-500" /> Chiffre d'affaires (6 mois)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={salesData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="marketingGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`TND ${v}`, "Revenu"]} />
                <Area type="monotone" dataKey="revenue" stroke="#a855f7" strokeWidth={2} fill="url(#marketingGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Projets récents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentProjects.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-secondary/20">
                  <div>
                    <p className="font-medium text-sm">{p.client}</p>
                    <p className="text-xs text-muted-foreground">{p.service} · {p.duration}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">TND {p.amount}</span>
                    <Badge variant="secondary" className={
                      p.status === "Terminé" ? "bg-green-100 text-green-700" :
                      p.status === "Actif" ? "bg-purple-100 text-purple-700" :
                      "bg-amber-400 text-amber-700"
                    }>{p.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
