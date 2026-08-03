import { useState } from "react";
import { useOrders, useUpdateSubOrderStatus } from "@/hooks/use-orders";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/format";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Clock, Box, Store, Package, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SupplierOrderDetailsModal from "@/components/supplier/supplier-order-details-modal";
import type { OrderWithDetails } from "@shared/schema";

export default function OrderRequestsPage() {
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useOrders();
  const updateSubOrderStatus = useUpdateSubOrderStatus();
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);

  // Extract all subOrders for this supplier from the orders
  const mySubOrders = orders.flatMap(order =>
    (order.subOrders ?? [])
      .filter((so: any) => so.supplierId === user?.id)
      .map((so: any) => ({
        ...so,
        orderId: order.id,
        cafeName: order.cafe?.name ?? "Inconnu",
        cafeId: order.cafeId,
        orderCreatedAt: order.createdAt,
        orderPriority: (order as any).priority ?? "NORMAL",
        orderScheduledAt: (order as any).scheduledAt,
        deliveryAddress: (order as any).deliveryAddress,
        _order: order, // full order for details modal
      }))
  ).sort((a, b) => new Date(b.orderCreatedAt as any).getTime() - new Date(a.orderCreatedAt as any).getTime());

  const pendingRequests = mySubOrders.filter(so => so.status === "PENDING");
  const approvedRequests = mySubOrders.filter(so => so.status === "CONFIRMED" || so.status === "PREPARING");
  const rejectedRequests = mySubOrders.filter(so => so.status === "CANCELLED");

  const handleApprove = (subOrderId: number) => {
    updateSubOrderStatus.mutate({ subOrderId, status: "CONFIRMED" }, {
      onSuccess: () => toast({ title: "Commande acceptée", description: "La sous-commande a été confirmée." }),
      onError: () => toast({ title: "Erreur", description: "Impossible de confirmer.", variant: "destructive" }),
    });
  };

  const handleReject = (subOrderId: number) => {
    updateSubOrderStatus.mutate({ subOrderId, status: "CANCELLED" }, {
      onSuccess: () => toast({ title: "Commande refusée", description: "La sous-commande a été annulée." }),
      onError: () => toast({ title: "Erreur", description: "Impossible d'annuler.", variant: "destructive" }),
    });
  };

  const priorityBadge = (priority: string) => {
    if (priority === "URGENT") return <Badge variant="destructive" className="text-[10px]">Urgent</Badge>;
    if (priority === "HIGH") return <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200">Haute prio.</Badge>;
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Demandes de commandes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Examinez et répondez aux nouvelles commandes reçues.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "En attente", value: pendingRequests.length,  icon: Clock,        color: "text-amber-500 bg-amber-500/10" },
          { label: "Acceptées",  value: approvedRequests.length, icon: CheckCircle,  color: "text-green-600 bg-green-500/10" },
          { label: "Refusées",   value: rejectedRequests.length, icon: XCircle,      color: "text-red-600 bg-red-500/10" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`rounded-xl p-3 ${color.split(" ")[1]}`}>
                <Icon className={`w-5 h-5 ${color.split(" ")[0]}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pending requests */}
      {pendingRequests.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Box className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold text-lg">Aucune demande en attente</p>
            <p className="text-sm text-muted-foreground mt-1">Les nouvelles commandes s'afficheront ici.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="px-5 pt-5 pb-3 border-b border-border/50">
              <h2 className="font-semibold">Demandes en attente ({pendingRequests.length})</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Commande</TableHead>
                  <TableHead>Café</TableHead>
                  <TableHead>Articles</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Priorité</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRequests.map(so => (
                  <TableRow key={so.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      #{String(so.orderId).padStart(6, "0")}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-muted-foreground" />
                        {so.cafeName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        {(so.items ?? []).slice(0, 3).map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-1 text-xs text-muted-foreground">
                            {item.packId
                              ? <Package className="w-3 h-3 shrink-0" />
                              : <Box className="w-3 h-3 shrink-0" />
                            }
                            <span className="truncate max-w-[140px]">
                              {item.quantity}× {item.packId ? item.packName : item.product?.name}
                            </span>
                          </div>
                        ))}
                        {(so.items ?? []).length > 3 && (
                          <p className="text-xs text-muted-foreground">+{(so.items ?? []).length - 3} autre(s)</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">{fmt(so.subtotal)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(so.orderCreatedAt)}
                    </TableCell>
                    <TableCell>
                      {priorityBadge(so.orderPriority) ?? (
                        <span className="text-xs text-muted-foreground">Normal</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                          onClick={() => handleApprove(so.id)}
                          disabled={updateSubOrderStatus.isPending}
                          data-testid={`button-approve-${so.id}`}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => handleReject(so.id)}
                          disabled={updateSubOrderStatus.isPending}
                          data-testid={`button-reject-${so.id}`}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-primary"
                          onClick={() => setSelectedOrder((so as any)._order ?? null)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* All requests history */}
      {mySubOrders.filter(so => so.status !== "PENDING").length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-5 pt-5 pb-3 border-b border-border/50">
              <h2 className="font-semibold">Historique des demandes</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Commande</TableHead>
                  <TableHead>Café</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mySubOrders.filter(so => so.status !== "PENDING").map(so => {
                  const statusMap: Record<string, { label: string; color: string }> = {
                    CONFIRMED:   { label: "Acceptée",    color: "bg-blue-100 text-blue-700" },
                    PREPARING:   { label: "En préparation", color: "bg-orange-100 text-orange-700" },
                    READY:       { label: "Prête",       color: "bg-teal-100 text-teal-700" },
                    IN_DELIVERY: { label: "En livraison", color: "bg-purple-100 text-purple-700" },
                    DELIVERED:   { label: "Livrée",      color: "bg-green-100 text-green-700" },
                    CANCELLED:   { label: "Refusée",     color: "bg-red-100 text-red-700" },
                  };
                  const s = statusMap[so.status] ?? { label: so.status, color: "bg-gray-100 text-gray-700" };
                  return (
                    <TableRow key={so.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        #{String(so.orderId).padStart(6, "0")}
                      </TableCell>
                      <TableCell className="font-medium">{so.cafeName}</TableCell>
                      <TableCell className="font-semibold">{fmt(so.subtotal)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatDate(so.orderCreatedAt)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`${s.color} text-xs`}>{s.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <SupplierOrderDetailsModal
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        order={selectedOrder}
        supplierId={user?.id ?? 0}
      />
    </div>
  );
}
