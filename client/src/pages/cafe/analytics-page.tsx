import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line
} from "recharts";
import { TrendingUp, ShoppingBag, Package, Star } from "lucide-react";

const monthlySpend = [
  { month: "Jul", amount: 120 },
  { month: "Aug", amount: 180 },
  { month: "Sep", amount: 95 },
  { month: "Oct", amount: 210 },
  { month: "Nov", amount: 340 },
  { month: "Dec", amount: 280 },
  { month: "Jan", amount: 190 },
  { month: "Feb", amount: 420 },
  { month: "Mar", amount: 370 },
];

const categorySpend = [
  { category: "Coffee Beans", total: 840 },
  { category: "Dairy Alt.", total: 522 },
  { category: "Equipment", total: 310 },
  { category: "Capsules", total: 180 },
  { category: "Cold Brew", total: 145 },
];

const topProducts = [
  { name: "Espresso Roast 1kg", orders: 18, spend: 450 },
  { name: "Oat Milk 1L x 6", orders: 12, spend: 216 },
  { name: "Cold Brew 5L", orders: 8, spend: 336 },
  { name: "Arabica Blend 500g", orders: 6, spend: 174 },
];

export default function CafeAnalyticsPage() {
  const { data: orders = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/orders"] });

  const totalOrders = orders.length || 38;
  const totalSpend = orders.reduce((s, o) => s + (o.totalAmount || 0), 0) || 317200;
  const delivered = orders.filter((o) => o.status === "DELIVERED").length || 29;

  const tooltipStyle = {
    contentStyle: {
      background: "hsl(var(--card))",
      border: "1px solid hsl(var(--border))",
      borderRadius: 8,
      fontSize: 12,
    },
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your café purchasing insights.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3">
              <ShoppingBag className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Orders</p>
              <p className="text-2xl font-bold">{totalOrders}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Spend</p>
              <p className="text-2xl font-bold text-green-600">TND {(totalSpend / 100).toFixed(0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-blue-500/10 rounded-xl p-3">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Delivered</p>
              <p className="text-2xl font-bold">{delivered}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3">
              <Star className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg. Rating Given</p>
              <p className="text-2xl font-bold">4.7</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Monthly Spend (TND)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlySpend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [`TND ${v}`, "Spend"]} />
                <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Spend by Category (TND)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categorySpend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="category" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip {...tooltipStyle} formatter={(v: any) => [`TND ${v}`, "Spend"]} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Top Ordered Products</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border/40">
            {topProducts.map((p, i) => (
              <div key={p.name} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-muted-foreground w-5">#{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.orders} orders</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-amber-500">TND {p.spend}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
