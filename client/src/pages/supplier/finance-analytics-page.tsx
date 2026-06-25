import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
import { TrendingUp, ShoppingBag, Package, Percent } from "lucide-react";

const monthly = [
  { month: "Jul", revenue: 820, orders: 6 },
  { month: "Aug", revenue: 1340, orders: 9 },
  { month: "Sep", revenue: 980, orders: 7 },
  { month: "Oct", revenue: 1650, orders: 11 },
  { month: "Nov", revenue: 2100, orders: 14 },
  { month: "Dec", revenue: 1820, orders: 12 },
  { month: "Jan", revenue: 2340, orders: 16 },
  { month: "Feb", revenue: 1960, orders: 13 },
  { month: "Mar", revenue: 2680, orders: 18 },
  { month: "Apr", revenue: 3100, orders: 21 },
  { month: "May", revenue: 2870, orders: 19 },
  { month: "Jun", revenue: 3624, orders: 24 },
];

const topCafes = [
  { cafe: "Ariana Lounge", orders: 14, revenue: 1840 },
  { cafe: "Cafe des Nattes", orders: 9, revenue: 1240 },
  { cafe: "Saffron Lounge", orders: 6, revenue: 820 },
  { cafe: "The Brew Lab", orders: 4, revenue: 560 },
  { cafe: "Central Perk", orders: 3, revenue: 420 },
];

const tooltipStyle = {
  contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 },
};

export default function FinanceAnalyticsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Financial performance and sales insights.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: "TND 3,624", icon: TrendingUp, cls: "text-amber-500 bg-amber-500/10" },
          { label: "Total Orders", value: "162", icon: ShoppingBag, cls: "text-primary bg-primary/10" },
          { label: "Products Listed", value: "27", icon: Package, cls: "text-green-600 bg-green-500/10" },
          { label: "Platform Fee", value: "TND 181", icon: Percent, cls: "text-blue-600 bg-blue-500/10" },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`rounded-xl p-3 ${cls.split(" ")[1]}`}><Icon className={`w-5 h-5 ${cls.split(" ")[0]}`} /></div>
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base font-semibold">Monthly Revenue (TND)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthly} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [`TND ${v}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-semibold">Monthly Orders</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthly} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [v, "Orders"]} />
                <Line type="monotone" dataKey="orders" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Top Customers</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y divide-border/40">
            {topCafes.map((c, i) => (
              <div key={c.cafe} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-muted-foreground w-5">#{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.cafe}</p>
                    <p className="text-xs text-muted-foreground">{c.orders} orders</p>
                  </div>
                </div>
                <span className="font-semibold text-sm text-amber-500">TND {c.revenue}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
