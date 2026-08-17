import { useState } from "react";
import { useDeliveries, useAcceptDelivery } from "@/hooks/use-deliveries";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPin, Store, ArrowRight, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DeliveryDetails from "@/components/delivery/delivery-details";
import type { DeliveryWithDetails } from "@shared/schema";

export default function AvailableDeliveriesPage() {
  const { data: deliveries = [], isLoading } = useDeliveries();
  const acceptDelivery = useAcceptDelivery();
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const [viewTarget, setViewTarget] = useState<DeliveryWithDetails | null>(null);

  // GET /api/deliveries already scopes DELIVERY_COMPANY to "own + AVAILABLE pool" —
  // filter to the pool here (own deliveries live on the "My Deliveries" page).
  const available = deliveries.filter((d) => d.status === "AVAILABLE");

  const handleAccept = (id: number) => {
    acceptDelivery.mutate(id, {
      onSuccess: () => { toast({ title: "Livraison acceptée" }); setViewTarget(null); },
      onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Livraisons disponibles</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Livraisons prêtes à être prises en charge. Première entreprise à accepter obtient la livraison.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}</div>
      ) : available.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">Aucune livraison disponible</p>
            <p className="text-sm text-muted-foreground mt-1">Revenez plus tard — de nouvelles livraisons apparaissent en temps réel.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {available.map((d) => (
            <Card key={d.id} className="border-amber-200/60">
              <CardContent className="p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">Commande #{d.orderId}</span>
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700">Disponible</Badge>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Store className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="font-medium">{d.supplier.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{d.order.itemCount} article{d.order.itemCount !== 1 ? "s" : ""}</span>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <span>{d.pickupAddress?.address || "Adresse non renseignée"}</span>
                  </div>
                  <div className="flex items-start gap-1.5 pl-0.5">
                    <ArrowRight className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{d.destinationAddress?.address || "—"}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <span className="text-sm font-semibold">{fmt(d.deliveryFee ?? 0)}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setViewTarget(d)}>Détails</Button>
                    <Button size="sm" onClick={() => handleAccept(d.id)} disabled={acceptDelivery.isPending}>
                      Accepter
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!viewTarget} onOpenChange={(v) => { if (!v) setViewTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Détails de la livraison</DialogTitle></DialogHeader>
          {viewTarget && (
            <DeliveryDetails
              delivery={viewTarget}
              viewerRole="DELIVERY_COMPANY"
              actions={
                <DialogFooter>
                  <Button className="w-full" onClick={() => handleAccept(viewTarget.id)} disabled={acceptDelivery.isPending}>
                    Accepter cette livraison
                  </Button>
                </DialogFooter>
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
