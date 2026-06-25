import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ShoppingBag, Clock, CheckCircle, DollarSign, Star } from "lucide-react";

const statusList = [
  { key: "PENDING", label: "Pending" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PREPARING", label: "Preparing" },
  { key: "IN_DELIVERY", label: "Out for Delivery" },
  { key: "DELIVERED", label: "Delivered" },
  { key: "CANCELLED", label: "Cancelled" },
];

const fakeTopSuppliers = [
  { name: "Premium Beans Co", orders: 14, total: 84500 },
  { name: "Oat & Grain Supply", orders: 9, total: 52200 },
  { name: "Arabica Direct", orders: 6, total: 31800 },
  { name: "TunRoast", orders: 4, total: 18600 },
];

export default function CafeDashboard() {
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/orders"] });

  const total = orders.length;
  const inProgress = orders.filter((o) => ["PENDING", "CONFIRMED", "PREPARING", "READY", "IN_DELIVERY"].includes(o.status)).length;
  const delivered = orders.filter((o) => o.status === "DELIVERED").length;
  const spent = orders.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + (o.totalAmount || 0), 0);

  const statusCounts: Record<string, number> = {};
  orders.forEach((o) => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
  const maxCount = Math.max(...Object.values(statusCounts), 1);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Overview of your café purchases and supplier activity.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Total Orders</p>
              <ShoppingBag className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold text-foreground">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Orders In Progress</p>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-3xl font-bold text-amber-500">{inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Orders Delivered</p>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-3xl font-bold text-green-500">{delivered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Total Money Spent</p>
              <DollarSign className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-primary">TND {(spent / 100).toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Favorite Suppliers</p>
              <Star className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-3xl font-bold text-foreground">4</p>
          </CardContent>
        </Card>
      </div>

      {/* Order Status + Top Suppliers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Order Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {statusList.map(({ key, label }) => {
              const count = statusCounts[key] || 0;
              const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
              return (
                <div key={key} className="flex items-center gap-4">
                  <span className="w-32 text-sm text-muted-foreground shrink-0">{label}</span>
                  <Progress value={pct} className="flex-1 h-2" />
                  <span className="text-sm font-semibold w-5 text-right">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Top Suppliers</CardTitle>
          </CardHeader>
          <CardContent>
            {fakeTopSuppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No suppliers yet. Place an order to see insights here.</p>
            ) : (
              <div className="space-y-3">
                {fakeTopSuppliers.map((s) => (
                  <div key={s.name} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.orders} orders</p>
                    </div>
                    <span className="text-sm font-semibold text-amber-500">TND {(s.total / 100).toFixed(0)}</span>
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
