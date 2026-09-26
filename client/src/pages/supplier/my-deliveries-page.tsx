import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useDeliveries, useAssignDriver, useSupplierDrivers } from "@/hooks/use-deliveries";
import { useFormatCurrency } from "@/hooks/use-currency";
import { formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Store, ArrowRight, Truck, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SupplierDeliveryTabs from "@/components/delivery/supplier-delivery-tabs";
import { DELIVERY_STATUS_META } from "@/components/delivery/delivery-details";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { DispatchDialog } from "@/pages/supplier/delivery-status-page";
import type { DeliveryWithDetails } from "@shared/schema";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

function AssignDriverControl({ delivery }: { delivery: DeliveryWithDetails }) {
  const { data: drivers = [] } = useSupplierDrivers();
  const assignDriver = useAssignDriver();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string>("");

  return (
    <div className="flex items-center gap-2">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="h-8 flex-1 min-w-0 text-xs"><SelectValue placeholder="Choisir un chauffeur" /></SelectTrigger>
        <SelectContent>
          {drivers.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Aucun chauffeur — ajoutez-en un</div>}
          {drivers.map((d) => <SelectItem key={d.id} value={String(d.id)} className="text-xs">{d.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-8 text-xs shrink-0"
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

// Note: the previous driver-only "ReassignDriverControl" (Part 32/33) has been superseded by
// opening the full DispatchDialog for this exact same ASSIGNED-but-not-yet-picked-up window
// (task: "Réassigner" must become a gateway to the existing full dispatch choice — Entreprise
// de livraison / Choisir une entreprise / Mes chauffeurs — not just a driver switch).
// storage.reassignDriver itself is untouched and its own route/API still exists unchanged —
// only this page's trigger for it was replaced. See supplier/delivery-status-page.tsx's
// exported DispatchDialog, reused here rather than duplicated.

// deliveryMode = SUPPLIER only — deliveries the supplier operates directly with its own
// drivers. Delivery-Company-dispatched deliveries are visible (read-only) on the Delivery
// Status tab instead, never here.
export default function SupplierMyDeliveriesPage() {
  const { data: deliveries = [], isLoading } = useDeliveries();
  const fmt = useFormatCurrency();
  const [view, setView] = useState<"active" | "completed">("active");
  const [dispatchTarget, setDispatchTarget] = useState<DeliveryWithDetails | null>(null);

  // Supplier workflow "Next" hop (task: "Connect the Complete Order → Delivery Workflow"): a
  // ?focus=<orderId> query param, set by the Delivery Status page's own Next button, singles
  // out the exact related delivery regardless of which tab (En cours/Historique) this page was
  // last left on.
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const focusOrderId = useMemo(() => {
    const raw = new URLSearchParams(searchStr).get("focus");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }, [searchStr]);

  const mine = deliveries.filter((d) => d.deliveryMode === "SUPPLIER");
  const active = mine.filter((d) => !["DELIVERED", "CANCELLED"].includes(d.status));
  const completed = mine.filter((d) => ["DELIVERED", "CANCELLED"].includes(d.status));
  const list = view === "active" ? active : completed;

  const pagination = usePagination(list.length);
  useEffect(() => { pagination.resetPage(); }, [view]);
  const pageList = list.slice(pagination.start, pagination.end);

  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Delivery"
        subtitle="Livraisons gérées directement avec vos propres chauffeurs."
      />

      <SupplierDeliveryTabs />

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
      ) : focusOrderId != null ? (
        <>
          {/* Supplier workflow "Next" landing: bypasses the En cours/Historique tab above
              entirely so the linked delivery is always shown, regardless of what this page was
              last left on. */}
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Livraison liée affichée — <span className="font-mono text-foreground">#{focusOrderId}</span>
              </p>
              <Button size="sm" variant="outline" onClick={() => setLocation("/delivery/my-deliveries")} data-testid="button-clear-my-delivery-focus">
                Voir toutes les livraisons
              </Button>
            </CardContent>
          </Card>
          {(() => {
            const focused = mine.find(d => d.orderId === focusOrderId);
            if (!focused) {
              return (
                <Card>
                  <CardContent className="py-16 text-center text-muted-foreground">Livraison introuvable.</CardContent>
                </Card>
              );
            }
            return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{renderDeliveryCard(focused)}</div>;
          })()}
        </>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {view === "active"
              ? "Aucune livraison en cours. Choisissez \"Mes chauffeurs\" lors du dispatch depuis Delivery Status pour en voir apparaître ici."
              : "Aucun historique disponible."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pageList.map((d) => renderDeliveryCard(d))}
        </div>
      )}

      {!isLoading && focusOrderId == null && (
        <DataPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={list.length}
          totalPages={pagination.totalPages}
          start={pagination.start}
          end={pagination.end}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          itemLabel="livraisons"
        />
      )}

      {dispatchTarget && <DispatchDialog delivery={dispatchTarget} onClose={() => setDispatchTarget(null)} />}
    </div>
  );

  function renderDeliveryCard(d: DeliveryWithDetails) {
    const meta = DELIVERY_STATUS_META[d.status] ?? { label: d.status, cls: "bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-400" };
    return (
      <Card key={d.id} className="border-border/50 hover:shadow-md transition-shadow" data-testid={`card-my-delivery-${d.id}`}>
        <CardContent className="p-4 space-y-3">
          {/* Header: order # + café name + status */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="font-mono text-xs text-muted-foreground">#{d.orderId}</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Store className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <h3 className="font-semibold text-sm break-words">{d.cafe.name}</h3>
              </div>
            </div>
            <Badge variant="secondary" className={`${meta.cls} text-xs shrink-0`}>{meta.label}</Badge>
          </div>

          {/* Driver, when already known */}
          {d.driver && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="flex items-center gap-1 text-xs">
                <Truck className="w-3 h-3" /> {d.driver.name}
              </Badge>
            </div>
          )}

          {/* Meta: created date */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />{formatDate(d.createdAt as any)}
          </div>

          {/* Addresses: pickup → destination */}
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
            <span className="truncate">{d.pickupAddress?.address || "—"}</span>
            <ArrowRight className="w-3 h-3 shrink-0" />
            <span className="truncate">{d.destinationAddress?.address || "—"}</span>
          </div>

          {/* Footer: fee + driver assignment actions. The assign control (a Select
              plus a Button) is too wide to sit beside the price in a 1/3-width card,
              so it always gets its own row below instead of squeezing in next to it. */}
          <div className="pt-1 space-y-2">
            <p className="font-bold text-amber-500 text-lg">{fmt(d.deliveryFee ?? 0)}</p>
            {d.status === "ACCEPTED" && <AssignDriverControl delivery={d} />}
            {d.status === "ASSIGNED" && (
              // Redispatch (task: "Supplier redispatch before driver confirmation") —
              // opens the same "Comment livrer cette commande ?" choice used for a
              // first-ever dispatch; still-eligible since the driver has not yet
              // progressed past ASSIGNED.
              <Button size="sm" variant="outline" className="h-8 text-xs w-full" onClick={() => setDispatchTarget(d)} data-testid={`button-reassign-${d.id}`}>
                Réassigner
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
}
