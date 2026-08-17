import { useAuth } from "@/hooks/use-auth";
import { useDeliveries, useDeliveryCompanyDrivers } from "@/hooks/use-deliveries";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Truck, CheckCircle2, Clock, Users } from "lucide-react";
import { Link } from "wouter";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  AVAILABLE: { label: "Disponible", cls: "bg-amber-100 text-amber-700" },
  ACCEPTED: { label: "Acceptée", cls: "bg-blue-100 text-blue-700" },
  ASSIGNED: { label: "Assignée", cls: "bg-indigo-100 text-indigo-700" },
  PICKED_UP: { label: "Collectée", cls: "bg-purple-100 text-purple-700" },
  IN_TRANSIT: { label: "En transit", cls: "bg-purple-100 text-purple-700" },
  DELIVERED: { label: "Livrée", cls: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Annulée", cls: "bg-red-100 text-red-700" },
};

export default function DeliveryDashboard() {
  const { user } = useAuth();
  const isCompany = user?.role === "DELIVERY_COMPANY";
  const { data: deliveries = [], isLoading } = useDeliveries();
  const { data: drivers = [] } = useDeliveryCompanyDrivers();
  const fmt = useFormatCurrency();

  if (isLoading) {
    return <div className="h-full flex items-center justify-center p-10"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const mine = isCompany ? deliveries.filter((d) => d.deliveryCompanyId === user?.id) : deliveries;
  const available = isCompany ? deliveries.filter((d) => d.status === "AVAILABLE") : [];
  const active = mine.filter((d) => !["DELIVERED", "CANCELLED"].includes(d.status));
  const completedToday = mine.filter((d) => d.status === "DELIVERED");
  const totalFees = completedToday.reduce((s, d) => s + (d.deliveryFee ?? 0), 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bienvenue, {user?.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isCompany ? "Aperçu de vos livraisons et de votre flotte." : "Aperçu de vos livraisons assignées."}
        </p>
      </div>

      <div className={`grid grid-cols-2 ${isCompany ? "lg:grid-cols-5" : "lg:grid-cols-4"} gap-4`}>
        {isCompany && (
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Disponibles</p>
                <Package className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-amber-500">{available.length}</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">En cours</p>
              <Truck className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-2xl font-bold text-indigo-500">{active.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Livrées</p>
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold text-green-500">{completedToday.length}</p>
          </CardContent>
        </Card>
        {isCompany && (
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Chauffeurs</p>
                <Users className="w-4 h-4 text-primary" />
              </div>
              <p className="text-2xl font-bold">{drivers.length}</p>
            </CardContent>
          </Card>
        )}
        <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Frais générés</p>
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold">{fmt(totalFees)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">
            {isCompany ? "Livraisons actives" : "Mes livraisons en cours"}
          </CardTitle>
          <Link href={isCompany ? "/delivery/my-deliveries" : "/delivery/deliveries"} className="text-xs text-primary font-medium hover:underline">
            Voir tout
          </Link>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Aucune livraison active pour le moment.</p>
          ) : (
            <div className="space-y-2">
              {active.slice(0, 6).map((d) => {
                const meta = STATUS_META[d.status] ?? { label: d.status, cls: "bg-gray-100 text-gray-700" };
                return (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/40">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">Commande #{d.orderId} · {d.subOrder.supplierName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {d.pickupAddress?.address || "—"} → {d.destinationAddress?.address || "—"}
                      </p>
                    </div>
                    <Badge variant="secondary" className={`shrink-0 ${meta.cls}`}>{meta.label}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
