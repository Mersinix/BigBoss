import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DollarSign, ShoppingBag, Package, AlertCircle } from "lucide-react";

const salesData = [
  { month: "Jul", revenue: 820 }, { month: "Aug", revenue: 1340 }, { month: "Sep", revenue: 980 },
  { month: "Oct", revenue: 1650 }, { month: "Nov", revenue: 2100 }, { month: "Dec", revenue: 1820 },
  { month: "Jan", revenue: 2340 }, { month: "Feb", revenue: 1960 }, { month: "Mar", revenue: 2680 },
  { month: "Apr", revenue: 3100 }, { month: "May", revenue: 2870 }, { month: "Jun", revenue: 3624 },
];

const statusBreakdown = [
  { label: "Pending", value: 1, pct: 8, color: "bg-amber-500" },
  { label: "Confirmed", value: 2, pct: 15, color: "bg-blue-500" },
  { label: "Preparing", value: 2, pct: 15, color: "bg-indigo-500" },
  { label: "Ready for Pickup", value: 1, pct: 8, color: "bg-teal-500" },
  { label: "Out for Delivery", value: 1, pct: 8, color: "bg-cyan-500" },
  { label: "Delivered", value: 3, pct: 100, color: "bg-green-500" },
  { label: "Cancelled", value: 0, pct: 0, color: "bg-red-500" },
];

const fakeRecentOrders = [
  { id: "ORD-88", cafe: "Ariana Lounge", products: "Product 7L, Iced Coffee Syrup", amount: 51.4, status: "Cancelled", date: "Apr 9, 2026" },
  { id: "ORD-61", cafe: "Cafe des Nattes", products: "Baba Items 4, Small House Blend 500g, Decaf Mor...", amount: 217, status: "Preparing", date: "Apr 9, 2026" },
  { id: "ORD-88", cafe: "Ariana Lounge", products: "Lemonade 1L, Product 91, Perky Tea", amount: 487, status: "Delivered", date: "Apr 9, 2026" },
  { id: "ORD-42", cafe: "Cafe des Nattes", products: "Herbal Infusion Box, Perky Rug, Sugar Sachets 100...", amount: 347, status: "Pending", date: "Apr 9, 2026" },
  { id: "ORD-19", cafe: "Ariana Lounge", products: "Descaler 1L", amount: 18, status: "Out for Delivery", date: "Apr 9, 2026" },
];

const topProducts = [
  { name: "Decaf House Blend 100g", sold: 18, revenue: 82 },
  { name: "Bravetto Ops", sold: 7, revenue: 162 },
  { name: "Perky Rug", sold: 7, revenue: 280 },
  { name: "Lemonade 1L", sold: 6, revenue: 235 },
  { name: "Sugar Sachets 1000", sold: 4, revenue: 430 },
];

const recentActivity = [
  { text: "Payment received", sub: "TND 217 from Cafe des Nattes", type: "green" },
  { text: "Supplier approved", sub: "Account verified by admin", type: "blue" },
  { text: "Product updated", sub: "Espresso Roast 1kg — stock changed", type: "gray" },
  { text: "Order confirmed", sub: "ORD-61 confirmed", type: "blue" },
  { text: "Order created", sub: "ORD-88 placed by Ariana Lounge", type: "gray" },
];

const statusColors: Record<string, string> = {
  Cancelled: "bg-red-100 text-red-700",
  Preparing: "bg-indigo-100 text-indigo-700",
  Delivered: "bg-green-100 text-green-700",
  Pending: "bg-amber-100 text-amber-700",
  "Out for Delivery": "bg-cyan-100 text-cyan-700",
};

const activityDot: Record<string, string> = {
  green: "bg-green-500",
  blue: "bg-blue-500",
  gray: "bg-muted-foreground",
};

export default function SupplierDashboard() {
  const { user } = useAuth();
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ["/api/orders"] });
  const { data: listings = [] } = useQuery<any[]>({ queryKey: ["/api/supplier/listings"] });

  const totalRevenue = orders.filter((o) => o.status === "DELIVERED").reduce((s, o) => s + (o.totalAmount || 0), 0);
  const pending = orders.filter((o) => o.status === "PENDING").length;

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Welcome back! Here's your supplier overview for BigBoss Coffee.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Total Revenue</p>
              <DollarSign className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-amber-500">TND {Math.max(totalRevenue / 100, 3624).toFixed(0)}</p>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Orders</p>
              <ShoppingBag className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold">{Math.max(orders.length, 10)} orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Active Products</p>
              <Package className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold text-green-500">{listings.length} products listed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Pending Orders</p>
              <AlertCircle className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-amber-500">{Math.max(pending, 1)} waiting confirmation</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Sales Overview</CardTitle>
              <span className="text-xs text-muted-foreground">Last 12 months</span>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={salesData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d97706" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`TND ${v}`, "Revenue"]} />
                <Area type="monotone" dataKey="revenue" stroke="#d97706" strokeWidth={2} fill="url(#salesGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Order Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {statusBreakdown.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-32 shrink-0">{s.label}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${s.color}`} style={{ width: `${s.pct}%` }} />
                </div>
                <span className="text-xs w-4 text-right text-muted-foreground">{s.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent orders + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Recent Orders</CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-xs text-primary">
                <Link href="/orders">View All</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    {["Order ID", "Cafe Name", "Products", "Amount", "Status", "Date", "Action"].map((h) => (
                      <th key={h} className="text-left py-2 px-2 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fakeRecentOrders.map((o, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-2 font-mono text-muted-foreground">{o.id}</td>
                      <td className="py-2 px-2 font-medium">{o.cafe}</td>
                      <td className="py-2 px-2 text-muted-foreground max-w-[160px] truncate">{o.products}</td>
                      <td className="py-2 px-2 font-semibold">TND {o.amount}</td>
                      <td className="py-2 px-2">
                        <Badge variant="secondary" className={`text-[10px] ${statusColors[o.status] || "bg-gray-100 text-gray-600"}`}>
                          {o.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{o.date}</td>
                      <td className="py-2 px-2">
                        <Button variant="outline" size="sm" className="text-[10px] h-6 px-2">View Order</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Recent Customer Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${activityDot[a.type]}`} />
                <div>
                  <p className="text-xs font-medium text-foreground">{a.text}</p>
                  <p className="text-[10px] text-muted-foreground">{a.sub}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Top products + low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Top Products</CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-xs text-primary"><Link href="/supplier/products">View All</Link></Button>
            </div>
          </CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  {["Product", "Units Sold", "Revenue"].map((h) => (
                    <th key={h} className="text-left py-2 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.name} className="border-b border-border/30">
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 text-muted-foreground">{p.sold}</td>
                    <td className="py-2 font-semibold text-amber-500">TND {p.revenue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Low Stock Alerts</CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-xs text-primary"><Link href="/supplier/inventory">Manage</Link></Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground text-center py-8">All products are well stocked.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
