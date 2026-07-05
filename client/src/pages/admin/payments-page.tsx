import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, CreditCard, TrendingUp } from "lucide-react";

export default function PaymentsPage() {
  const { data: orders = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/orders"] });

  const totalRevenue = orders
    .filter((o) => o.status === "DELIVERED")
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  const pendingAmount = orders
    .filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status))
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  const commission = Math.round(totalRevenue * 0.05);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Payments</h1>
        <p className="text-muted-foreground text-sm mt-1">Overview of platform payment activity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Revenue</p>
              <p className="text-2xl font-bold text-green-600">DT{(totalRevenue / 100).toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3">
              <CreditCard className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Pending Payments</p>
              <p className="text-2xl font-bold text-amber-600">DT{(pendingAmount / 100).toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-blue-500/10 rounded-xl p-3">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Platform Commission (5%)</p>
              <p className="text-2xl font-bold text-blue-600">DT{(commission / 100).toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Payment Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Cafe</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Commission (5%)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">#{o.id}</TableCell>
                    <TableCell>{o.cafe?.name}</TableCell>
                    <TableCell>DT{((o.totalAmount || 0) / 100).toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">DT{(((o.totalAmount || 0) * 0.05) / 100).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={o.status === "DELIVERED" ? "bg-green-100 text-green-700" : "bg-amber-400 text-amber-700"}
                      >
                        {o.status === "DELIVERED" ? "Paid" : "Pending"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {orders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">No payment records</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
