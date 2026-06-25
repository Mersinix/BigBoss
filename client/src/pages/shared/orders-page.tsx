import { useOrders, useUpdateOrderStatus } from "@/hooks/use-orders";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Box, Truck, CheckCircle2, AlertCircle, Clock } from "lucide-react";

export default function OrdersPage() {
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useOrders();
  const updateStatus = useUpdateOrderStatus();

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading orders...</div>;

  const handleStatusChange = (orderId: number, status: string) => {
    updateStatus.mutate({ id: orderId, status: status as any });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-400';
      case 'CONFIRMED': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400';
      case 'PREPARING': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/20 dark:text-orange-400';
      case 'READY': return 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-500/20 dark:text-teal-400';
      case 'IN_DELIVERY': return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-500/20 dark:text-purple-400';
      case 'DELIVERED': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-500/20 dark:text-green-400';
      case 'CANCELLED': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-500/20 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING': return <Clock className="w-4 h-4 mr-1" />;
      case 'PREPARING': return <Box className="w-4 h-4 mr-1" />;
      case 'IN_DELIVERY': return <Truck className="w-4 h-4 mr-1" />;
      case 'DELIVERED': return <CheckCircle2 className="w-4 h-4 mr-1" />;
      case 'CANCELLED': return <AlertCircle className="w-4 h-4 mr-1" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">
          {user?.role === 'CAFE_OWNER' ? 'Order History' : 
           user?.role === 'SUPPLIER' ? 'Manage Orders' : 'Delivery Board'}
        </h1>
        <p className="text-muted-foreground mt-1">Track and manage order lifecycle.</p>
      </div>

      <div className="space-y-6">
        {orders.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-2xl border border-border/50">
            <Box className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="font-display font-bold text-xl text-foreground">No orders yet</h3>
            <p className="text-muted-foreground mt-2">When orders arrive, they will show up here.</p>
          </div>
        ) : (
          orders.map((order) => (
            <Card key={order.id} className="rounded-2xl border-border/50 shadow-sm overflow-hidden transition-all hover:shadow-md">
              <div className="bg-secondary/30 px-6 py-4 border-b border-border/50 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-sm font-semibold text-foreground uppercase tracking-wider">Order ID</p>
                    <p className="font-mono mt-1">#{order.id.toString().padStart(6, '0')}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground uppercase tracking-wider">Date</p>
                    <p className="text-sm mt-1 text-muted-foreground">{order.createdAt ? formatDate(order.createdAt) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground uppercase tracking-wider">Total</p>
                    <p className="text-sm mt-1 font-bold text-foreground">{formatCurrency(order.totalAmount)}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <Badge variant="outline" className={`${getStatusColor(order.status)} border px-3 py-1 text-xs font-bold rounded-lg flex items-center`}>
                    {getStatusIcon(order.status)}
                    {order.status.replace('_', ' ')}
                  </Badge>

                  {/* Role-based actions */}
                  {user?.role === 'SUPPLIER' && order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
                    <Select defaultValue={order.status} onValueChange={(val) => handleStatusChange(order.id, val)}>
                      <SelectTrigger className="w-[160px] h-9 rounded-xl bg-white">
                        <SelectValue placeholder="Update Status" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="PENDING">Pending</SelectItem>
                        <SelectItem value="CONFIRMED">Confirm</SelectItem>
                        <SelectItem value="PREPARING">Preparing</SelectItem>
                        <SelectItem value="READY">Ready for Pickup</SelectItem>
                        <SelectItem value="CANCELLED" className="text-destructive">Cancel Order</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {(user?.role === 'DELIVERY_COMPANY' || user?.role === 'DRIVER') && (order.status === 'READY' || order.status === 'IN_DELIVERY') && (
                    <Select defaultValue={order.status} onValueChange={(val) => handleStatusChange(order.id, val)}>
                      <SelectTrigger className="w-[180px] h-9 rounded-xl bg-white">
                        <SelectValue placeholder="Delivery Status" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="READY">Awaiting Pickup</SelectItem>
                        <SelectItem value="IN_DELIVERY">In Transit</SelectItem>
                        <SelectItem value="DELIVERED" className="text-emerald-600 font-bold">Mark Delivered</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              
              <CardContent className="p-6">
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">Items</h4>
                    <div className="space-y-3">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-start justify-between">
                          <div className="flex gap-3">
                            <span className="font-bold text-muted-foreground">{item.quantity}x</span>
                            <span className="font-medium">{item.product.name}</span>
                          </div>
                          <span className="text-muted-foreground">{formatCurrency(item.unitPrice * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="bg-secondary/30 rounded-xl p-5 h-fit">
                    <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">Details</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cafe:</span>
                        <span className="font-medium">{order.cafe.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Supplier:</span>
                        <span className="font-medium">{order.supplier?.name ?? "—"}</span>
                      </div>
                      {order.delivery && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Logistics:</span>
                          <span className="font-medium">{order.delivery.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
