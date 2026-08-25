import { useMemo } from "react";
import { useDeliveries } from "@/hooks/use-deliveries";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Calendar, Zap, Package2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { SectionCard, EmptyState } from "@/components/dashboard/dashboard-kit";
import { DELIVERY_STATUS_META } from "@/components/delivery/delivery-details";

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  URGENT: { label: "Urgent", cls: "bg-red-100 text-red-700" },
  HIGH: { label: "Haute priorité", cls: "bg-orange-100 text-orange-700" },
  NORMAL: { label: "Normal", cls: "bg-gray-100 text-gray-600" },
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "Planification" — organizes this driver's still-active deliveries (assigned but not yet
// delivered/cancelled) into Today / Upcoming / Unscheduled, using the order's real
// priority/scheduledAt fields (see shared/schema.ts orders.priority/scheduledAt — recently
// surfaced onto DeliveryWithDetails.order specifically to support this tab; previously only
// exposed to the Coffee Owner/Admin order views). No fabricated scheduling — a delivery
// with no scheduledAt is shown as "as soon as possible" rather than inventing a time.
export default function DriverPlanningPage() {
  const { data: deliveries = [], isLoading } = useDeliveries();
  const fmt = useFormatCurrency();

  const active = useMemo(
    () => deliveries.filter((d) => !["DELIVERED", "CANCELLED"].includes(d.status)),
    [deliveries],
  );

  const { today, upcoming, unscheduled } = useMemo(() => {
    const now = new Date();
    const today: typeof active = [];
    const upcoming: typeof active = [];
    const unscheduled: typeof active = [];
    for (const d of active) {
      const scheduled = d.order.scheduledAt ? new Date(d.order.scheduledAt) : null;
      if (!scheduled) unscheduled.push(d);
      else if (isSameDay(scheduled, now)) today.push(d);
      else upcoming.push(d);
    }
    const byTime = (a: typeof active[number], b: typeof active[number]) =>
      new Date(a.order.scheduledAt ?? a.createdAt as any).getTime() - new Date(b.order.scheduledAt ?? b.createdAt as any).getTime();
    return { today: today.sort(byTime), upcoming: upcoming.sort(byTime), unscheduled: unscheduled.sort(byTime) };
  }, [active]);

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>;
  }

  const renderRow = (d: (typeof active)[number]) => {
    const meta = DELIVERY_STATUS_META[d.status] ?? { label: d.status, cls: "bg-gray-100 text-gray-700" };
    const priority = PRIORITY_META[d.order.priority] ?? PRIORITY_META.NORMAL;
    return (
      <Card key={d.id} className="rounded-2xl border-border/50">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">#{d.orderId}</span>
            <Badge variant="secondary" className={meta.cls}>{meta.label}</Badge>
            {d.order.priority !== "NORMAL" && (
              <Badge variant="secondary" className={priority.cls}><Zap className="w-3 h-3 mr-1" />{priority.label}</Badge>
            )}
            {d.order.scheduledAt ? (
              <span className="flex items-center gap-1 text-xs text-blue-600"><Calendar className="w-3 h-3" />{formatDate(d.order.scheduledAt as any)}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Dès que possible</span>
            )}
          </div>
          <p className="text-sm font-medium">{d.supplier.name}</p>
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="truncate">{d.pickupAddress?.address || "—"} → {d.destinationAddress?.address || "—"}</span>
          </div>
          <p className="text-xs text-muted-foreground">{d.order.itemCount} article(s) · {fmt(d.subOrder.subtotal)}</p>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Aujourd'hui" icon={Calendar}>
        {today.length === 0 ? <EmptyState icon={Package2} message="Rien de planifié pour aujourd'hui." /> : (
          <div className="space-y-3">{today.map(renderRow)}</div>
        )}
      </SectionCard>

      <SectionCard title="À venir" icon={Calendar}>
        {upcoming.length === 0 ? <EmptyState icon={Package2} message="Aucune livraison planifiée à venir." /> : (
          <div className="space-y-3">{upcoming.map(renderRow)}</div>
        )}
      </SectionCard>

      <SectionCard title="Non planifiées" icon={Package2} right={<span className="text-[11px] text-muted-foreground">Dès que possible</span>}>
        {unscheduled.length === 0 ? <EmptyState icon={Package2} message="Aucune livraison sans horaire assigné." /> : (
          <div className="space-y-3">{unscheduled.map(renderRow)}</div>
        )}
      </SectionCard>
    </div>
  );
}
