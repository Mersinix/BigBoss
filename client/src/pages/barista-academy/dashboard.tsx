import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Users, BookOpen, Star, TrendingUp, Clock } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const salesData = [
  { month: "Jan", enrollments: 8 }, { month: "Fév", enrollments: 15 }, { month: "Mar", enrollments: 22 },
  { month: "Avr", enrollments: 18 }, { month: "Mai", enrollments: 30 }, { month: "Jun", enrollments: 27 },
];

const recentEnrollments = [
  { id: "ACE-01", student: "Ahmed Trabelsi", course: "Espresso Fundamentals", date: "10 Jun 2026", status: "Confirmé" },
  { id: "ACE-02", student: "Café Médina (2 pers.)", course: "Latte Art Pro", date: "12 Jun 2026", status: "En attente" },
  { id: "ACE-03", student: "Sonia Ben Amor", course: "Coffee Tasting", date: "14 Jun 2026", status: "Confirmé" },
];

export default function BaristaAcademyDashboard() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Barista Academy</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Bienvenue, {user?.name}. Gérez vos formations et étudiants.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Étudiants ce mois", value: "27", icon: Users, color: "text-emerald-500" },
          { label: "Formations actives", value: "8", icon: BookOpen, color: "text-blue-500" },
          { label: "En attente", value: "3", icon: Clock, color: "text-amber-500" },
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
              <TrendingUp className="w-4 h-4 text-emerald-500" /> Inscriptions (6 mois)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={salesData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="academyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v} inscrits`, "Inscriptions"]} />
                <Area type="monotone" dataKey="enrollments" stroke="#10b981" strokeWidth={2} fill="url(#academyGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Inscriptions récentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentEnrollments.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-secondary/20">
                  <div>
                    <p className="font-medium text-sm">{e.student}</p>
                    <p className="text-xs text-muted-foreground">{e.course} · {e.date}</p>
                  </div>
                  <Badge variant="secondary" className={
                    e.status === "Confirmé" ? "bg-green-100 text-green-700" : "bg-amber-400 text-amber-700"
                  }>{e.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
