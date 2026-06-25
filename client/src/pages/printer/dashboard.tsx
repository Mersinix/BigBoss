import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, Package, ShoppingBag, Star, TrendingUp, Clock } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const salesData = [
  { month: "Jan", revenue: 320 }, { month: "Fév", revenue: 580 }, { month: "Mar", revenue: 760 },
  { month: "Avr", revenue: 940 }, { month: "Mai", revenue: 1120 }, { month: "Jun", revenue: 1380 },
];

const recentOrders = [
  { id: "PRT-01", client: "Café des Nattes", type: "Flyers A5", qty: 500, amount: 85, status: "En cours" },
  { id: "PRT-02", client: "Ariana Lounge", type: "Menus plastifiés", qty: 50, amount: 220, status: "Livré" },
  { id: "PRT-03", client: "Cafétéria Ennasr", type: "Kakémonos", qty: 2, amount: 180, status: "En attente" },
];

export default function PrinterDashboard() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Imprimerie</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Bienvenue, {user?.name}. Voici un aperçu de votre activité.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Commandes ce mois", value: "14", icon: ShoppingBag, color: "text-primary" },
          { label: "En cours", value: "3", icon: Clock, color: "text-amber-500" },
          { label: "Produits actifs", value: "28", icon: Package, color: "text-green-500" },
          { label: "Note moyenne", value: "4.8", icon: Star, color: "text-yellow-500" },
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
              <TrendingUp className="w-4 h-4 text-primary" /> Chiffre d'affaires (6 mois)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={salesData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="printerGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`TND ${v}`, "Revenu"]} />
                <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} fill="url(#printerGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Commandes récentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-secondary/20">
                  <div>
                    <p className="font-medium text-sm">{o.client}</p>
                    <p className="text-xs text-muted-foreground">{o.type} · {o.qty} unités</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">TND {o.amount}</span>
                    <Badge variant="secondary" className={
                      o.status === "Livré" ? "bg-green-100 text-green-700" :
                      o.status === "En cours" ? "bg-blue-100 text-blue-700" :
                      "bg-amber-100 text-amber-700"
                    }>{o.status}</Badge>
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
