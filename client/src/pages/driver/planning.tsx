import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useDeliveries } from "@/hooks/use-deliveries";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Calendar, Zap, Package2, Search, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/dashboard/dashboard-kit";
import { DELIVERY_STATUS_META } from "@/components/delivery/delivery-details";
import type { DeliveryWithDetails } from "@shared/schema";

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  URGENT: { label: "Urgent", cls: "bg-red-100 text-red-700" },
  HIGH: { label: "Haute priorité", cls: "bg-orange-100 text-orange-700" },
  NORMAL: { label: "Normal", cls: "bg-gray-100 text-gray-600" },
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "Planification" — proper Aujourd'hui / À venir / Anciennes switcher (task Part 1),
// replacing the old stacked Today/Upcoming/Unscheduled sections. Unscheduled ("dès que
// possible") deliveries fold into Aujourd'hui since they need handling now, not a fourth
// tab. Anciennes surfaces DELIVERED/CANCELLED deliveries by their real completion dates —
// previously not shown on this page at all. Every delivery still belongs to exactly one
// tab; none are lost. GO opens Livraisons already focused on that exact delivery
// (?focus=<id>, read by driver-deliveries-page.tsx) — no duplicate delivery page.
export default function DriverPlanningPage() {
  const [, navigate] = useLocation();
  const { data: deliveries = [], isLoading } = useDeliveries();
  const fmt = useFormatCurrency();
  const [tab, setTab] = useState<"today" | "upcoming" | "past">("today");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [supplierFilter, setSupplierFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const active = useMemo(() => deliveries.filter((d) => !["DELIVERED", "CANCELLED"].includes(d.status)), [deliveries]);
  const past = useMemo(() => deliveries.filter((d) => ["DELIVERED", "CANCELLED"].includes(d.status)), [deliveries]);

  const { today, upcoming } = useMemo(() => {
    const now = new Date();
    const today: DeliveryWithDetails[] = [];
    const upcoming: DeliveryWithDetails[] = [];
    for (const d of active) {
      const scheduled = d.order.scheduledAt ? new Date(d.order.scheduledAt) : null;
      if (!scheduled || isSameDay(scheduled, now)) today.push(d);
      else upcoming.push(d);
    }
    const byTime = (a: DeliveryWithDetails, b: DeliveryWithDetails) =>
      new Date(a.order.scheduledAt ?? a.createdAt as any).getTime() - new Date(b.order.scheduledAt ?? b.createdAt as any).getTime();
    return { today: today.sort(byTime), upcoming: upcoming.sort(byTime) };
  }, [active]);

  const pastSorted = useMemo(
    () => [...past].sort((a, b) => new Date(b.deliveredAt ?? b.cancelledAt ?? b.createdAt as any).getTime() - new Date(a.deliveredAt ?? a.cancelledAt ?? a.createdAt as any).getTime()),
    [past],
  );

  const suppliers = useMemo(() => Array.from(new Set(deliveries.map((d) => d.supplier.name))).sort(), [deliveries]);

  const list = tab === "today" ? today : tab === "upcoming" ? upcoming : pastSorted;
  const filtered = useMemo(() => list.filter((d) => {
    if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
    if (supplierFilter !== "ALL" && d.supplier.name !== supplierFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = [String(d.orderId), d.cafe.name, d.supplier.name, d.pickupAddress?.address ?? "", d.destinationAddress?.address ?? ""].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }), [list, statusFilter, supplierFilter, search]);

  const statusOptions = tab === "past" ? ["DELIVERED", "CANCELLED"] : ["AVAILABLE", "ACCEPTED", "ASSIGNED", "PICKED_UP", "IN_TRANSIT"];

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">Planification</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Vos livraisons organisées par date.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setStatusFilter("ALL"); }}>
        <TabsList>
          <TabsTrigger value="today" data-testid="tab-planning-today">Aujourd'hui ({today.length})</TabsTrigger>
          <TabsTrigger value="upcoming" data-testid="tab-planning-upcoming">À venir ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past" data-testid="tab-planning-past">Anciennes ({pastSorted.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 h-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="N° commande, adresse…" data-testid="input-planning-search" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9" data-testid="select-planning-status"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous statuts</SelectItem>
            {statusOptions.map((s) => <SelectItem key={s} value={s}>{DELIVERY_STATUS_META[s]?.label ?? s}</SelectItem>)}
          </SelectContent>
        </Select>
        {suppliers.length > 1 && (
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-44 h-9" data-testid="select-planning-supplier"><SelectValue placeholder="Fournisseur" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous fournisseurs</SelectItem>
              {suppliers.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Package2} message={tab === "today" ? "Rien de planifié pour aujourd'hui." : tab === "upcoming" ? "Aucune livraison planifiée à venir." : "Aucune livraison passée."} />
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const meta = DELIVERY_STATUS_META[d.status] ?? { label: d.status, cls: "bg-gray-100 text-gray-700" };
            const priority = PRIORITY_META[d.order.priority] ?? PRIORITY_META.NORMAL;
            const canGo = !["DELIVERED", "CANCELLED"].includes(d.status);
            return (
              <Card key={d.id} className="rounded-2xl border-border/50" data-testid={`card-planning-${d.id}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">#{d.orderId}</span>
                    <Badge variant="secondary" className={meta.cls}>{meta.label}</Badge>
                    {d.order.priority !== "NORMAL" && (
                      <Badge variant="secondary" className={priority.cls}><Zap className="w-3 h-3 mr-1" />{priority.label}</Badge>
                    )}
                    {d.order.scheduledAt ? (
                      <span className="flex items-center gap-1 text-xs text-blue-600"><Calendar className="w-3 h-3" />{formatDate(d.order.scheduledAt as any)}</span>
                    ) : tab !== "past" ? (
                      <span className="text-xs text-muted-foreground">Dès que possible</span>
                    ) : null}
                  </div>
                  <p className="text-sm font-medium">{d.supplier.name}</p>
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span className="truncate">{d.pickupAddress?.address || "—"} → {d.destinationAddress?.address || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{d.order.itemCount} article(s) · {fmt(d.deliveryFee ?? d.subOrder.subtotal ?? 0)}</p>
                    {canGo && (
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => navigate(`/driver/deliveries?focus=${d.id}`)} data-testid={`button-go-${d.id}`}>
                        GO <ArrowRight className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
