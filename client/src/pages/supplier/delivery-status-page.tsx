import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck, CheckCircle, Clock, MapPin } from "lucide-react";

const fakeDeliveries = [
  { id: "DEL-001", order: "ORD-61", cafe: "Cafe des Nattes", driver: "Karim Bousselmi", address: "12 Rue Bab Souika, Tunis", status: "In Transit", updated: "10 min ago" },
  { id: "DEL-002", order: "ORD-88", cafe: "Ariana Lounge", driver: "Yassine Tlili", address: "Av. Kheireddine Pacha, Ariana", status: "Delivered", updated: "2h ago" },
  { id: "DEL-003", order: "ORD-42", cafe: "Cafe des Nattes", driver: "Fatma Jedidi", address: "Place Bab Bhar, Sfax", status: "Pending Pickup", updated: "30 min ago" },
  { id: "DEL-004", order: "ORD-19", cafe: "Ariana Lounge", driver: "Karim Bousselmi", address: "Rue de la Liberté, La Marsa", status: "In Transit", updated: "5 min ago" },
  { id: "DEL-005", order: "ORD-55", cafe: "Saffron Lounge", driver: "Sami Gharbi", address: "Av. Habib Bourguiba, Sousse", status: "Delivered", updated: "1d ago" },
];

const statusStyle: Record<string, { badge: string; icon: any }> = {
  "In Transit": { badge: "bg-indigo-100 text-indigo-700", icon: Truck },
  "Delivered": { badge: "bg-green-100 text-green-700", icon: CheckCircle },
  "Pending Pickup": { badge: "bg-amber-100 text-amber-700", icon: Clock },
};

export default function DeliveryStatusPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Delivery Status</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Real-time overview of active deliveries.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "In Transit", value: 2, icon: Truck, cls: "bg-indigo-500/10 text-indigo-600" },
          { label: "Delivered Today", value: 2, icon: CheckCircle, cls: "bg-green-500/10 text-green-600" },
          { label: "Pending Pickup", value: 1, icon: Clock, cls: "bg-amber-500/10 text-amber-600" },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`rounded-xl p-3 ${cls.split(" ")[0]}`}><Icon className={`w-5 h-5 ${cls.split(" ")[1]}`} /></div>
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        {fakeDeliveries.map((d) => {
          const { badge, icon: Icon } = statusStyle[d.status] || { badge: "bg-gray-100 text-gray-600", icon: Truck };
          return (
            <Card key={d.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-4">
                    <div className={`rounded-lg p-2 mt-0.5 ${badge.split(" ")[0].replace("text", "bg").replace("-700", "-500/10")}`}>
                      <Icon className={`w-4 h-4 ${badge.split(" ")[1]}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{d.id}</p>
                        <Badge variant="secondary" className={badge}>{d.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Order: <span className="font-medium text-foreground">{d.order}</span> · Cafe: <span className="font-medium text-foreground">{d.cafe}</span></p>
                      <p className="text-xs text-muted-foreground">Driver: <span className="font-medium text-foreground">{d.driver}</span></p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" /> {d.address}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{d.updated}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
