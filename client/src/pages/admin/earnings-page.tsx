import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Percent } from "lucide-react";

export default function EarningsPage() {
  const { data: orders = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/orders"] });

  const deliveredOrders = orders.filter((o) => o.status === "DELIVERED");
  const totalEarnings = deliveredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const thisMonth = deliveredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const commission = Math.round(totalEarnings * 0.05);

  // Group delivered orders by supplier for the table
  const supplierMap: Record<string, { name: string; orders: number; total: number }> = {};
  deliveredOrders.forEach((o) => {
    const key = String(o.supplierId);
    if (!supplierMap[key]) supplierMap[key] = { name: o.supplier?.name || "Unknown", orders: 0, total: 0 };
    supplierMap[key].orders += 1;
    supplierMap[key].total += o.totalAmount || 0;
  });
  const supplierRows = Object.values(supplierMap).sort((a, b) => b.total - a.total);

  // Chart: monthly placeholder using last 12 months labels
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentMonth = new Date().getMonth();
  const chartData = months.map((m, i) => ({
    month: m,
    revenue: i === currentMonth ? totalEarnings / 100 : 0,
  }));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Earnings</h1>
        <p className="text-muted-foreground text-sm mt-1">Revenue and earnings overview.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground font-medium">Total Earnings</p>
                <div className="bg-amber-500/10 p-1.5 rounded-lg">
                  <DollarSign className="w-4 h-4 text-amber-500" />
                </div>
              </div>
              <p className="text-2xl font-bold text-amber-500">DT{(totalEarnings / 100).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">All time delivered orders</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground font-medium">This Month</p>
                <div className="bg-green-500/10 p-1.5 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                </div>
              </div>
              <p className="text-2xl font-bold text-green-500">DT{(thisMonth / 100).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">Current month</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground font-medium">Monthly Growth</p>
                <div className="bg-green-500/10 p-1.5 rounded-lg">
                  <TrendingDown className="w-4 h-4 text-green-500" />
                </div>
              </div>
              <p className="text-2xl font-bold text-green-500">+0.0%</p>
              <p className="text-xs text-muted-foreground mt-1">vs last month</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground font-medium">Platform Commission</p>
                <div className="bg-blue-500/10 p-1.5 rounded-lg">
                  <Percent className="w-4 h-4 text-blue-500" />
                </div>
              </div>
              <p className="text-2xl font-bold text-blue-500">DT{(commission / 100).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">5% of total</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Monthly Revenue</CardTitle>
              <span className="text-xs text-muted-foreground">Last 12 months</span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="#d97706" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Supplier Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierRows.map((s) => (
                    <TableRow key={s.name}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.orders}</TableCell>
                      <TableCell className="text-right font-semibold text-amber-500">
                        ${(s.total / 100).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {supplierRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">No earnings data</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
