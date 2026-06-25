import { useAuth } from "@/hooks/use-auth";
import { useOrders } from "@/hooks/use-orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useOrders();

  if (isLoading) {
    return <div className="h-full flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  // Calculate stats based on role
  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o => o.status === 'PENDING' || o.status === 'CONFIRMED').length;
  const totalRevenue = orders
    .filter(o => o.status !== 'CANCELLED')
    .reduce((sum, order) => sum + order.totalAmount, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">
          Welcome back, {user?.name}
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Here's what's happening with your business today.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Orders</CardTitle>
            <Package className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-display font-bold">{totalOrders}</div>
          </CardContent>
        </Card>
        
        <Card className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active/Pending</CardTitle>
            <Clock className="h-5 w-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-display font-bold">{pendingOrders}</div>
          </CardContent>
        </Card>

        {user?.role !== 'DRIVER' && (
          <Card className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {user?.role === 'CAFE_OWNER' ? 'Total Spent' : 'Total Revenue'}
              </CardTitle>
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-display font-bold">{formatCurrency(totalRevenue)}</div>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-primary uppercase tracking-wider">System Status</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-medium text-foreground mt-2">All systems operational</div>
          </CardContent>
        </Card>
      </div>

      {/* Placeholder for charts or recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="col-span-1 rounded-2xl border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="font-display">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">No recent activity found.</p>
            ) : (
              <div className="space-y-4">
                {orders.slice(0, 5).map(order => (
                  <div key={order.id} className="flex items-center justify-between p-4 rounded-xl bg-secondary/50">
                    <div>
                      <p className="font-semibold text-sm">Order #{order.id}</p>
                      <p className="text-xs text-muted-foreground">{order.status}</p>
                    </div>
                    <div className="font-medium text-sm">
                      {formatCurrency(order.totalAmount)}
                    </div>
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
