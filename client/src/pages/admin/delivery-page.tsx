import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Truck, Clock, CheckCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

const statusColors: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PREPARING: "bg-amber-400 text-amber-700",
  READY: "bg-yellow-100 text-yellow-700",
  IN_DELIVERY: "bg-indigo-100 text-indigo-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default function DeliveryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: orders = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/orders"] });

  const deliveryOrders = orders.filter((o) => ["READY", "IN_DELIVERY", "DELIVERED"].includes(o.status));
  const inDelivery = orders.filter((o) => o.status === "IN_DELIVERY").length;
  const delivered = orders.filter((o) => o.status === "DELIVERED").length;

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", buildUrl("/api/orders/:id/status", { id }), { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Order status updated" });
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Delivery</h1>
        <p className="text-muted-foreground text-sm mt-1">Track and manage all delivery assignments.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-indigo-500/10 rounded-xl p-3">
              <Truck className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">In Delivery</p>
              <p className="text-2xl font-bold">{inDelivery}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Ready for Pickup</p>
              <p className="text-2xl font-bold">{orders.filter((o) => o.status === "READY").length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Delivered</p>
              <p className="text-2xl font-bold">{delivered}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Delivery Orders</CardTitle>
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
                  <TableHead>Supplier</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveryOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">#{o.id}</TableCell>
                    <TableCell>{o.cafe?.name}</TableCell>
                    <TableCell>{o.supplier?.name}</TableCell>
                    <TableCell>DT{((o.totalAmount || 0) / 100).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusColors[o.status] || ""}>
                        {o.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {o.status === "READY" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: o.id, status: "IN_DELIVERY" })}>
                          Start Delivery
                        </Button>
                      )}
                      {o.status === "IN_DELIVERY" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: o.id, status: "DELIVERED" })}>
                          Mark Delivered
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {deliveryOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">No delivery orders</TableCell>
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
