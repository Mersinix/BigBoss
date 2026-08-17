import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDeliveries, useAssignDriver, useDeliveryCompanyDrivers } from "@/hooks/use-deliveries";
import { useFormatCurrency } from "@/hooks/use-currency";
import { formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Store, ArrowRight, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DeliveryDetails, { DELIVERY_STATUS_META as STATUS_META } from "@/components/delivery/delivery-details";
import type { DeliveryWithDetails } from "@shared/schema";

function AssignDriverControl({ delivery }: { delivery: DeliveryWithDetails }) {
  const { data: drivers = [] } = useDeliveryCompanyDrivers();
  const assignDriver = useAssignDriver();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string>("");

  return (
    <div className="flex items-center gap-2">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Choisir un chauffeur" /></SelectTrigger>
        <SelectContent>
          {drivers.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Aucun chauffeur — ajoutez-en un</div>}
          {drivers.map((d) => <SelectItem key={d.id} value={String(d.id)} className="text-xs">{d.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-8 text-xs"
        disabled={!selected || assignDriver.isPending}
        onClick={() => assignDriver.mutate({ deliveryId: delivery.id, driverId: Number(selected) }, {
          onSuccess: () => toast({ title: "Chauffeur assigné" }),
          onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
        })}
      >
        Assigner
      </Button>
    </div>
  );
}

export default function MyDeliveriesPage() {
  const { user } = useAuth();
  const { data: deliveries = [], isLoading } = useDeliveries();
  const fmt = useFormatCurrency();
  const [view, setView] = useState<"active" | "completed">("active");
  const [viewTarget, setViewTarget] = useState<DeliveryWithDetails | null>(null);

  const mine = deliveries.filter((d) => d.deliveryCompanyId === user?.id);
  const active = mine.filter((d) => !["DELIVERED", "CANCELLED"].includes(d.status));
  const completed = mine.filter((d) => ["DELIVERED", "CANCELLED"].includes(d.status));
  const list = view === "active" ? active : completed;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mes livraisons</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Livraisons acceptées par votre entreprise.</p>
      </div>

      <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 w-fit">
        {(["active", "completed"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${view === v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {v === "active" ? `En cours (${active.length})` : `Historique (${completed.length})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
      ) : list.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Aucune livraison ici.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {list.map((d) => {
            const meta = STATUS_META[d.status] ?? { label: d.status, cls: "bg-gray-100 text-gray-700" };
            return (
              <Card key={d.id}>
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">Commande #{d.orderId}</span>
                      <Badge variant="secondary" className={meta.cls}>{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(d.createdAt as any)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <Store className="w-3.5 h-3.5 text-muted-foreground" /> {d.supplier.name}
                      {d.driver && <span className="text-xs text-muted-foreground ml-2">· Chauffeur: {d.driver.name}</span>}
                    </div>
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                      <span className="truncate">{d.pickupAddress?.address || "—"}</span>
                      <ArrowRight className="w-3 h-3 shrink-0" />
                      <span className="truncate">{d.destinationAddress?.address || "—"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-sm">{fmt(d.deliveryFee ?? 0)}</span>
                    {d.status === "ACCEPTED" && <AssignDriverControl delivery={d} />}
                    {["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(d.status) && (
                      <Badge variant="outline" className="flex items-center gap-1 text-xs">
                        <Truck className="w-3 h-3" /> {d.driver?.name ?? "—"}
                      </Badge>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setViewTarget(d)}>Détails</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!viewTarget} onOpenChange={(v) => { if (!v) setViewTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Détails de la livraison</DialogTitle></DialogHeader>
          {viewTarget && <DeliveryDetails delivery={viewTarget} viewerRole="DELIVERY_COMPANY" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
