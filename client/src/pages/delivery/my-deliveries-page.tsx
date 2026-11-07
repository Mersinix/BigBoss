import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDeliveries, useAssignDriver, useDeliveryCompanyDrivers } from "@/hooks/use-deliveries";
import { useReassignDriver } from "@/hooks/use-delivery-ecosystem";
import { useAssignableDrivers, useDispatchStatus, useRetryDispatch, useCountdownSeconds, type AssignableDriver, type DispatchStatus } from "@/hooks/use-dispatch";
import { useFormatCurrency } from "@/hooks/use-currency";
import { formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Store, ArrowRight, Truck, X, RotateCcw } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DeliveryDetails, { DELIVERY_STATUS_META as STATUS_META } from "@/components/delivery/delivery-details";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import type { DeliveryWithDetails } from "@shared/schema";

// Smart Driver Dispatch System (task: "BigBossCoffee — Smart Driver Dispatch System") —
// French labels for the automatic-dispatch status pill, per the task's own suggested list.
const DISPATCH_STATE_META: Record<DispatchStatus["state"], { label: string; cls: string } | null> = {
  NONE: null,
  SEARCHING: { label: "Recherche d'un chauffeur", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" },
  OFFER_PENDING: { label: "Offre envoyée", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
  EXHAUSTED: { label: "Aucun chauffeur disponible", cls: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" },
  ASSIGNED: { label: "Chauffeur assigné", cls: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" },
};

// Automatic-dispatch status for one ACCEPTED-and-unassigned delivery — current pending
// driver, response countdown, attempt count, and a manual retry action once exhausted (task
// §5/§6). Manual driver selection (AssignDriverControl below) always stays available
// alongside this, never replaced by it.
function DispatchStatusPill({ deliveryId }: { deliveryId: number }) {
  const { data } = useDispatchStatus(deliveryId);
  const retry = useRetryDispatch();
  const { toast } = useToast();
  const seconds = useCountdownSeconds(data?.pendingOffer?.expiresAt ?? null);
  const meta = data ? DISPATCH_STATE_META[data.state] : null;
  if (!data || !meta) return null;
  return (
    <div className="flex flex-col items-end gap-1">
      <Badge variant="secondary" className={`text-xs ${meta.cls}`}>{meta.label}</Badge>
      {data.state === "OFFER_PENDING" && data.pendingOffer && (
        <span className="text-xs text-muted-foreground">{data.pendingOffer.driverName} · {seconds}s restantes · Tentative {data.attemptCount}</span>
      )}
      {data.state === "EXHAUSTED" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{data.attemptCount} tentative{data.attemptCount > 1 ? "s" : ""}</span>
          <Button
            size="sm" variant="outline" className="h-7 text-xs gap-1"
            disabled={retry.isPending}
            onClick={() => retry.mutate(deliveryId, { onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }) })}
            data-testid={`button-retry-dispatch-${deliveryId}`}
          >
            <RotateCcw className="w-3 h-3" /> Réessayer
          </Button>
        </div>
      )}
    </div>
  );
}

function AssignDriverControl({ delivery }: { delivery: DeliveryWithDetails }) {
  const { data } = useAssignableDrivers(delivery.id);
  const assignDriver = useAssignDriver();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string>("");
  const [confirmTarget, setConfirmTarget] = useState<AssignableDriver | null>(null);

  // Vehicle eligibility stays mandatory: incompatible drivers are never offered for manual
  // selection either (task §6: "Do not show irrelevant drivers who fail vehicle compatibility").
  const drivers = (data?.drivers ?? []).filter((d) => d.compatible);
  const selectedDriver = drivers.find((d) => String(d.id) === selected);

  const doAssign = (driverId: number) => {
    assignDriver.mutate({ deliveryId: delivery.id, driverId }, {
      onSuccess: () => toast({ title: "Chauffeur assigné" }),
      onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    });
  };

  const handleAssignClick = () => {
    if (!selectedDriver) return;
    // Manual dispatch never uses automatic ranking to pick the driver, but still warns
    // before confirming a busy/unavailable one (task §6) rather than silently blocking it —
    // the company's explicit decision wins either way once confirmed.
    if (selectedDriver.busy || !selectedDriver.acceptingNewOffers) setConfirmTarget(selectedDriver);
    else doAssign(selectedDriver.id);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Choisir un chauffeur" /></SelectTrigger>
          <SelectContent>
            {drivers.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Aucun chauffeur compatible</div>}
            {drivers.map((d) => (
              <SelectItem key={d.id} value={String(d.id)} className="text-xs">
                <span className="flex items-center gap-1.5">
                  {d.name}
                  {d.busy && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-300">Occupé</Badge>}
                  {!d.acceptingNewOffers && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-gray-500">Indisponible</Badge>}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={!selected || assignDriver.isPending}
          onClick={handleAssignClick}
        >
          Assigner
        </Button>
      </div>

      <Dialog open={!!confirmTarget} onOpenChange={(v) => { if (!v) setConfirmTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirmer l'assignation</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmTarget?.busy
              ? `${confirmTarget?.name} a déjà une livraison active. L'assigner quand même ?`
              : `${confirmTarget?.name} a désactivé les nouvelles offres. L'assigner quand même ?`}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmTarget(null)}>Annuler</Button>
            <Button size="sm" onClick={() => { if (confirmTarget) doAssign(confirmTarget.id); setConfirmTarget(null); }} data-testid="button-confirm-assign-anyway">
              Assigner quand même
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Redispatch a delivery to another of the company's own drivers before the current driver has
// confirmed it (task: "Delivery Company redispatch before driver confirmation"). Reuses the
// existing storage.reassignDriver / PATCH /api/deliveries/:id/reassign — the same mechanism
// that already powered the Supplier's pre-Turn-5 driver-switch action — rather than a second
// implementation. That endpoint already restricts to delivery.status === 'ASSIGNED' (refuses
// once PICKED_UP/later) and is already scoped to the caller's own DELIVERY_COMPANY drivers
// server-side, so no separate eligibility check is needed here beyond reusing the same driver
// list already trusted for the initial assignment (useDeliveryCompanyDrivers, as in
// AssignDriverControl above).
function ReassignDriverControl({ delivery, onDone }: { delivery: DeliveryWithDetails; onDone: () => void }) {
  const { data: drivers = [] } = useDeliveryCompanyDrivers();
  const reassign = useReassignDriver();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string>("");
  const eligible = drivers.filter((dr) => dr.id !== delivery.driver?.id);

  return (
    <div className="flex items-center gap-2">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Choisir un chauffeur" /></SelectTrigger>
        <SelectContent>
          {eligible.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Aucun autre chauffeur disponible</div>}
          {eligible.map((dr) => <SelectItem key={dr.id} value={String(dr.id)} className="text-xs">{dr.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-8 text-xs"
        disabled={!selected || reassign.isPending}
        onClick={() => reassign.mutate({ deliveryId: delivery.id, driverId: Number(selected) }, {
          onSuccess: () => { toast({ title: "Livraison réattribuée" }); onDone(); },
          onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
        })}
        data-testid={`button-confirm-redispatch-${delivery.id}`}
      >
        Confirmer
      </Button>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onDone}>Annuler</Button>
    </div>
  );
}

export default function MyDeliveriesPage() {
  const { user } = useAuth();
  const { data: deliveries = [], isLoading } = useDeliveries();
  const fmt = useFormatCurrency();
  const [view, setView] = useState<"active" | "completed">("active");
  // Tracks only the id, never a frozen object — re-resolved against the live `deliveries`
  // array every render (same pattern as driver-deliveries-page.tsx) so a background refetch
  // (e.g. the real-time transport-requirements sync) reaches an already-open modal instead of
  // being stuck on whatever snapshot existed when it was opened.
  const [viewTargetId, setViewTargetId] = useState<number | null>(null);
  const viewTarget = viewTargetId != null ? (deliveries.find((d) => d.id === viewTargetId) ?? null) : null;
  const [redispatchId, setRedispatchId] = useState<number | null>(null);

  const mine = deliveries.filter((d) => d.deliveryCompanyId === user?.id);
  const active = mine.filter((d) => !["DELIVERED", "CANCELLED"].includes(d.status));
  const completed = mine.filter((d) => ["DELIVERED", "CANCELLED"].includes(d.status));
  const list = view === "active" ? active : completed;

  // Same usePagination/DataPagination pattern already used throughout the app (reference:
  // Business → Chauffeurs' driver-roster-view.tsx). resetPage() on the active/historique
  // toggle too, so switching tabs never leaves pagination pointing past the new list's end.
  const pagination = usePagination(list.length);
  useEffect(() => { pagination.resetPage(); }, [view, list.length]);
  const pageList = list.slice(pagination.start, pagination.end);

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        title="Mes livraisons"
        subtitle="Livraisons acceptées par votre entreprise."
        icon={Truck}
        gradientClass="bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent border-teal-500/20"
        iconBgClass="bg-teal-500/15"
        iconTextClass="text-teal-600 dark:text-teal-400"
      />

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
        <Card className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl"><CardContent className="py-16 text-center text-muted-foreground">Aucune livraison ici.</CardContent></Card>
      ) : (
        <>
          <div className="space-y-3">
            {pageList.map((d) => {
              const meta = STATUS_META[d.status] ?? { label: d.status, cls: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" };
              return (
                <Card
                  key={d.id}
                  onClick={() => setViewTargetId(d.id)}
                  className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl cursor-pointer hover:shadow-md transition-shadow"
                >
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
                    <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <span className="font-semibold text-sm">{fmt(d.deliveryFee ?? 0)}</span>
                      {d.status === "ACCEPTED" && (
                        <div className="flex flex-col items-end gap-1.5">
                          <DispatchStatusPill deliveryId={d.id} />
                          <AssignDriverControl delivery={d} />
                        </div>
                      )}
                      {d.status === "ASSIGNED" && (
                        redispatchId === d.id ? (
                          <ReassignDriverControl delivery={d} onDone={() => setRedispatchId(null)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="flex items-center gap-1 text-xs">
                              <Truck className="w-3 h-3" /> {d.driver?.name ?? "—"}
                            </Badge>
                            {/* Pre-confirmation redispatch (task: "Delivery Company redispatch
                                before driver confirmation") — only shown while ASSIGNED, i.e. the
                                driver has not yet progressed past this stage (see
                                storage.reassignDriver's own ASSIGNED-only guard). */}
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setRedispatchId(d.id)} data-testid={`button-redispatch-${d.id}`}>
                              Redispatcher
                            </Button>
                          </div>
                        )
                      )}
                      {["PICKED_UP", "IN_TRANSIT"].includes(d.status) && (
                        <Badge variant="outline" className="flex items-center gap-1 text-xs">
                          <Truck className="w-3 h-3" /> {d.driver?.name ?? "—"}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
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
        </>
      )}

      <Dialog open={!!viewTarget} onOpenChange={(v) => { if (!v) { setViewTargetId(null); setRedispatchId(null); } }}>
        {/* Thin scrollbar treatment — matches the existing Admin Order Details modal's own
            scroll container exactly, same thumb/track/hover classes, not a new scrollbar style. */}
        <DialogContent hideClose className="max-w-lg max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
          <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={() => { setViewTargetId(null); setRedispatchId(null); }} aria-label="Close" data-testid="button-close-delivery-detail">
            <X className="w-4 h-4" />
          </button>
          <DialogHeader><DialogTitle>Détails de la livraison</DialogTitle></DialogHeader>
          {viewTarget && (
            <DeliveryDetails
              delivery={viewTarget}
              viewerRole="DELIVERY_COMPANY"
              actions={viewTarget.status === "ASSIGNED" ? (
                redispatchId === viewTarget.id ? (
                  <ReassignDriverControl delivery={viewTarget} onDone={() => setRedispatchId(null)} />
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setRedispatchId(viewTarget.id)} data-testid={`button-redispatch-modal-${viewTarget.id}`}>
                    Redispatcher
                  </Button>
                )
              ) : undefined}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
