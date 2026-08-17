import { useState } from "react";
import { useDeliveries, useUpdateDeliveryStatus } from "@/hooks/use-deliveries";
import { useFormatCurrency } from "@/hooks/use-currency";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Truck, Clock, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DeliveryDetails, { DELIVERY_STATUS_META as STATUS_META, DELIVERY_MODE_LABEL } from "@/components/delivery/delivery-details";
import type { DeliveryWithDetails } from "@shared/schema";

// Admin oversight only — no operational actions beyond CANCEL. Status is managed through
// /api/deliveries/* by the owning Delivery Company / assigned Driver / operating Supplier;
// this page used to call PATCH /api/orders/:id/status directly, which always 403'd for Admin
// (see SHOP_DELIVERY_SYNCHRONIZATION_ANALYSIS.md §9.5) — replaced with the real delivery API.
export default function DeliveryPage() {
  const { data: deliveries = [], isLoading } = useDeliveries();
  const updateStatus = useUpdateDeliveryStatus();
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const [viewTarget, setViewTarget] = useState<DeliveryWithDetails | null>(null);

  const inTransit = deliveries.filter((d) => ["PICKED_UP", "IN_TRANSIT"].includes(d.status)).length;
  const delivered = deliveries.filter((d) => d.status === "DELIVERED").length;
  const unassigned = deliveries.filter((d) => ["AVAILABLE", "ACCEPTED"].includes(d.status)).length;

  const handleCancel = (id: number) => {
    updateStatus.mutate({ deliveryId: id, status: "CANCELLED" }, {
      onSuccess: () => toast({ title: "Livraison annulée" }),
      onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Livraisons</h1>
        <p className="text-muted-foreground text-sm mt-1">Supervision de toutes les livraisons de la plateforme.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-indigo-500/10 rounded-xl p-3"><Truck className="w-5 h-5 text-indigo-600" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">En transit</p><p className="text-2xl font-bold">{inTransit}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">Non assignées</p><p className="text-2xl font-bold">{unassigned}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><CheckCircle className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground font-medium">Livrées</p><p className="text-2xl font-bold">{delivered}</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Toutes les livraisons</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Commande</TableHead>
                  <TableHead>Café</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Transporteur</TableHead>
                  <TableHead>Chauffeur</TableHead>
                  <TableHead>Frais</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Créée le</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">#{d.orderId}</TableCell>
                    <TableCell>{d.cafe.name}</TableCell>
                    <TableCell>{d.supplier.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.deliveryMode ? DELIVERY_MODE_LABEL[d.deliveryMode] : "—"}</TableCell>
                    <TableCell>{d.deliveryCompany?.name ?? "—"}</TableCell>
                    <TableCell>{d.driver?.name ?? "—"}</TableCell>
                    <TableCell>{fmt(d.deliveryFee ?? 0)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_META[d.status]?.cls ?? ""}>
                        {STATUS_META[d.status]?.label ?? d.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(d.createdAt as any)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setViewTarget(d)}>Détails</Button>
                        {!["DELIVERED", "CANCELLED"].includes(d.status) && d.status !== "PICKED_UP" && d.status !== "IN_TRANSIT" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => handleCancel(d.id)}>
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Annuler
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {deliveries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-10">Aucune livraison</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewTarget} onOpenChange={(v) => { if (!v) setViewTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Détails de la livraison</DialogTitle></DialogHeader>
          {viewTarget && <DeliveryDetails delivery={viewTarget} viewerRole="ADMIN" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
