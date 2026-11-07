import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useDeliveries } from "@/hooks/use-deliveries";
import { useDriverDetails, useUpdateDriverProfile } from "@/hooks/use-driver-profile";
import { useDriverPendingOffers, useDriverRefusedOffers, useAcceptOffer, useRefuseOffer, useCountdownSeconds } from "@/hooks/use-dispatch";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, Calendar, Zap, Package2, Search, ArrowRight, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import { EmptyState, DashboardHero } from "@/components/dashboard/dashboard-kit";
import DeliveryDetails, { DELIVERY_STATUS_META } from "@/components/delivery/delivery-details";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { useToast } from "@/hooks/use-toast";
import type { DeliveryWithDetails } from "@shared/schema";

// Task: "Update Espace Chauffeur → Business → Planification: Offer Acceptance, Refusal,
// and Delivery Details" — a card on this page is now one of three kinds, tagged on the
// merged item itself rather than inferred from `status` (a pending-offer delivery's real
// `status` is genuinely 'ACCEPTED', same as some already-assigned flows elsewhere — the
// tag, not the status, is what must drive Accepter/Refuser vs GO):
//  - a PENDING offer to this driver (not yet assigned — `driverId` on the real row is still
//    null) — Accepter/Refuser, no GO, products hidden;
//  - this driver's own REFUSED history ("Annulée") — read-only, non-clickable, never GO;
//  - everything else (today/upcoming/past) exactly as before — unchanged.
type PlanningItem = DeliveryWithDetails & {
  offerId?: number;
  offerExpiresAt?: string;
  refused?: boolean;
  refusedAt?: string | null;
};

// Smart Driver Dispatch System (task: "BigBossCoffee — Smart Driver Dispatch System",
// Phase 6) — the availability preference toggle (§2/§3: "Disponible"/"Indisponible"),
// deliberately NOT the existing isOnVacation switch on the Profil page (a different,
// coarser concept — see driverProfiles' own schema comment) and its own, instantly-saving
// control rather than bundled into that page's big "Sauvegarder le profil" button, since a
// driver would expect this operational toggle to take effect immediately.
function AvailabilityToggle() {
  const { user } = useAuth();
  const { data } = useDriverDetails(user?.id ?? null);
  const updateProfile = useUpdateDriverProfile();
  const { toast } = useToast();
  const accepting = data?.profile?.acceptingNewOffers ?? true;

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{accepting ? "Disponible" : "Indisponible"}</p>
          <p className="text-xs text-muted-foreground">
            {accepting ? "Vous recevez de nouvelles offres de livraison." : "Vous ne recevez plus de nouvelles offres."}
          </p>
        </div>
        <Switch
          checked={accepting}
          onCheckedChange={(v) => updateProfile.mutate({ acceptingNewOffers: v }, {
            onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
          })}
          data-testid="switch-accepting-new-offers"
        />
      </CardContent>
    </Card>
  );
}

// Accepter/Refuser — the ONE place this logic exists, used by both the card and the modal
// (task §2/§3: "Do not implement separate business logic for modal actions"). Local
// `responded` is only a double-click UX guard; the backend's own atomic offer-status CAS
// remains the real source of truth either way (task §6).
function OfferActionButtons({
  offerId, offerExpiresAt, onRefused, stacked,
}: {
  offerId: number;
  offerExpiresAt: string;
  onRefused?: () => void;
  /** Modal usage: full-width, stacked buttons instead of the compact inline card pair. */
  stacked?: boolean;
}) {
  const accept = useAcceptOffer();
  const refuse = useRefuseOffer();
  const { toast } = useToast();
  const seconds = useCountdownSeconds(offerExpiresAt);
  const [responded, setResponded] = useState(false);
  const disabled = responded || seconds === 0;

  return (
    <div
      className={stacked ? "flex flex-col gap-2 w-full" : "flex items-center gap-2 shrink-0"}
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        size="sm" className={stacked ? "w-full" : "h-7 text-xs"}
        disabled={disabled || accept.isPending}
        onClick={() => {
          setResponded(true);
          accept.mutate(offerId, {
            // Task §6: an offer no longer pending (expired/already resolved) must show a
            // clear message and refresh — not silently fail. The query invalidation
            // (useAcceptOffer's onSettled) removes this card/updates the modal either way.
            onError: (err: any) => { setResponded(false); toast({ title: "Offre indisponible", description: err.message, variant: "destructive" }); },
          });
        }}
        data-testid={`button-accept-offer-${offerId}`}
      >
        Accepter
      </Button>
      <Button
        size="sm" variant="outline" className={stacked ? "w-full" : "h-7 text-xs"}
        disabled={disabled || refuse.isPending}
        onClick={() => {
          setResponded(true);
          refuse.mutate(offerId, {
            onSuccess: () => { toast({ title: "Offre refusée" }); onRefused?.(); },
            onError: (err: any) => { setResponded(false); toast({ title: "Offre indisponible", description: err.message, variant: "destructive" }); },
          });
        }}
        data-testid={`button-refuse-offer-${offerId}`}
      >
        Refuser
      </Button>
    </div>
  );
}

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  URGENT: { label: "Urgent", cls: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" },
  HIGH: { label: "Haute priorité", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
  NORMAL: { label: "Normal", cls: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" },
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "Planification" — proper Aujourd'hui / À venir / Anciennes switcher (task Part 1),
// replacing the old stacked Today/Upcoming/Unscheduled sections. Unscheduled ("dès que
// possible") deliveries fold into Aujourd'hui since they need handling now, not a fourth
// tab. Anciennes surfaces DELIVERED/CANCELLED deliveries by their real completion dates,
// plus (task: "Update Espace Chauffeur → Business → Planification") this driver's own
// refused-offer history as read-only "Annulée" items. Every delivery still belongs to
// exactly one tab; none are lost. GO opens Livraisons already focused on that exact
// delivery (?focus=<id>, read by driver-deliveries-page.tsx) — no duplicate delivery page.
export default function DriverPlanningPage() {
  const [, navigate] = useLocation();
  const { data: deliveries = [], isLoading } = useDeliveries();
  const { data: pendingOffers = [] } = useDriverPendingOffers();
  const { data: refusedOffers = [] } = useDriverRefusedOffers();
  const fmt = useFormatCurrency();
  const [tab, setTab] = useState<"today" | "upcoming" | "past">("today");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [supplierFilter, setSupplierFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [viewTargetId, setViewTargetId] = useState<number | null>(null);

  // Pending/refused offers merge into the SAME active/historical lists the existing
  // useDeliveries()-driven cards already use — never a second, parallel section (task §1:
  // "Do not duplicate existing functionality"). The two sources are structurally disjoint:
  // useDeliveries() only ever returns deliveries already assigned to this driver
  // (driverId = me), and a delivery with a PENDING or REFUSED offer to this driver has no
  // driverId yet — so concatenation can never duplicate the same delivery.
  const pendingItems: PlanningItem[] = useMemo(
    () => pendingOffers.filter((o) => o.delivery != null).map((o) => ({ ...o.delivery!, offerId: o.id, offerExpiresAt: o.expiresAt })),
    [pendingOffers],
  );
  const refusedItems: PlanningItem[] = useMemo(
    () => refusedOffers.filter((o) => o.delivery != null).map((o) => ({ ...o.delivery!, refused: true, refusedAt: o.respondedAt })),
    [refusedOffers],
  );

  const active: PlanningItem[] = useMemo(
    () => [...pendingItems, ...deliveries.filter((d) => !["DELIVERED", "CANCELLED"].includes(d.status))],
    [pendingItems, deliveries],
  );
  const past: PlanningItem[] = useMemo(
    () => [...refusedItems, ...deliveries.filter((d) => ["DELIVERED", "CANCELLED"].includes(d.status))],
    [refusedItems, deliveries],
  );

  const { today, upcoming } = useMemo(() => {
    const now = new Date();
    const today: PlanningItem[] = [];
    const upcoming: PlanningItem[] = [];
    for (const d of active) {
      const scheduled = d.order.scheduledAt ? new Date(d.order.scheduledAt) : null;
      if (!scheduled || isSameDay(scheduled, now)) today.push(d);
      else upcoming.push(d);
    }
    const byTime = (a: PlanningItem, b: PlanningItem) =>
      new Date(a.order.scheduledAt ?? a.createdAt as any).getTime() - new Date(b.order.scheduledAt ?? b.createdAt as any).getTime();
    return { today: today.sort(byTime), upcoming: upcoming.sort(byTime) };
  }, [active]);

  const pastSorted = useMemo(() => [...past].sort((a, b) => {
    // A refused item sorts by when THIS driver refused it, never by the underlying
    // delivery's own deliveredAt/cancelledAt — those describe a different, unrelated event
    // (task: "must not be confused with a globally cancelled delivery").
    const dateFor = (x: PlanningItem) => x.refused ? new Date(x.refusedAt ?? x.createdAt as any) : new Date(x.deliveredAt ?? x.cancelledAt ?? x.createdAt as any);
    return dateFor(b).getTime() - dateFor(a).getTime();
  }), [past]);

  const suppliers = useMemo(() => Array.from(new Set([...active, ...past].map((d) => d.supplier.name))).sort(), [active, past]);

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

  // Same usePagination/DataPagination pattern already used throughout the app (reference:
  // Espace Livraison → Business → Chauffeurs' driver-roster-view.tsx).
  const pagination = usePagination(filtered.length);
  useEffect(() => { pagination.resetPage(); }, [tab, statusFilter, supplierFilter, search]);
  const pageFiltered = filtered.slice(pagination.start, pagination.end);

  // Re-resolved against the live, always-fresh `active` array on every render (same
  // pattern as my-deliveries-page.tsx) — never a frozen snapshot, so accepting from inside
  // the modal updates it in place without closing/reopening (task §3B).
  const viewTarget = viewTargetId != null ? (active.find((d) => d.id === viewTargetId) ?? null) : null;

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Planification"
        subtitle="Vos livraisons organisées par date."
        icon={Calendar}
        gradientClass="bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/20"
        iconBgClass="bg-blue-500/15"
        iconTextClass="text-blue-600 dark:text-blue-400"
      />

      <AvailabilityToggle />

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
        <>
        <div className="space-y-3">
          {pageFiltered.map((d) => {
            // Refused history — read-only, non-clickable, never GO/Accepter/Refuser (task
            // §4). Rendered first since it short-circuits every other branch below.
            if (d.refused) {
              return (
                <Card
                  key={d.id}
                  className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl opacity-75"
                  data-testid={`card-planning-refused-${d.id}`}
                >
                  <CardContent className="p-4 space-y-2 cursor-default">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">#{d.orderId}</span>
                      <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">Annulée</Badge>
                    </div>
                    <p className="text-sm font-medium">{d.supplier.name}</p>
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span className="truncate">{d.pickupAddress?.address || "—"} → {d.destinationAddress?.address || "—"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{d.order.itemCount} article(s) · {fmt(d.deliveryFee ?? d.subOrder.subtotal ?? 0)}</p>
                  </CardContent>
                </Card>
              );
            }

            const meta = DELIVERY_STATUS_META[d.status] ?? { label: d.status, cls: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" };
            const priority = PRIORITY_META[d.order.priority] ?? PRIORITY_META.NORMAL;
            const isPendingOffer = d.offerId != null;
            const canGo = !isPendingOffer && !["DELIVERED", "CANCELLED"].includes(d.status);
            // "Active delivery card" click-to-open (task §3) — scoped to the active tabs
            // (today/upcoming); Anciennes' normal DELIVERED/CANCELLED cards keep their
            // existing (non-clickable) behavior, unrelated to this task.
            const clickable = tab !== "past";
            return (
              <Card
                key={d.id}
                className={`bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl ${clickable ? "cursor-pointer hover:shadow-md transition-shadow" : ""} ${isPendingOffer ? "border-amber-200 dark:border-amber-700/60" : ""}`}
                onClick={clickable ? () => setViewTargetId(d.id) : undefined}
                data-testid={`card-planning-${d.id}`}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">#{d.orderId}</span>
                    <Badge variant="secondary" className={meta.cls}>{meta.label}</Badge>
                    {isPendingOffer && (
                      <OfferCountdownBadge offerExpiresAt={d.offerExpiresAt!} />
                    )}
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
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{d.order.itemCount} article(s) · {fmt(d.deliveryFee ?? d.subOrder.subtotal ?? 0)}</p>
                    {isPendingOffer ? (
                      <OfferActionButtons offerId={d.offerId!} offerExpiresAt={d.offerExpiresAt!} />
                    ) : canGo && (
                      <Button
                        size="sm" className="h-7 text-xs gap-1 shrink-0"
                        onClick={(e) => { e.stopPropagation(); navigate(`/driver/deliveries?focus=${d.id}`); }}
                        data-testid={`button-go-${d.id}`}
                      >
                        GO <ArrowRight className="w-3 h-3" />
                      </Button>
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
          totalItems={filtered.length}
          totalPages={pagination.totalPages}
          start={pagination.start}
          end={pagination.end}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          itemLabel="livraisons"
        />
        </>
      )}

      {/* Details modal — reuses the existing shared DeliveryDetails component (never a
          duplicate), products hidden before acceptance (task §3/§7), Accepter/Refuser
          shown via the same `actions` slot every other caller already uses. */}
      <Dialog open={!!viewTarget} onOpenChange={(v) => { if (!v) setViewTargetId(null); }}>
        <DialogContent hideClose className="max-w-lg max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
          <button type="button" className="absolute right-4 top-4 p-1.5 rounded-full transition-colors bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={() => setViewTargetId(null)} aria-label="Close" data-testid="button-close-planning-details">
            <X className="w-4 h-4" />
          </button>
          <DialogHeader><DialogTitle>Détails de la livraison</DialogTitle></DialogHeader>
          {viewTarget && (
            <DeliveryDetails
              delivery={viewTarget}
              viewerRole="DRIVER"
              hideProducts={viewTarget.offerId != null}
              actions={viewTarget.offerId != null ? (
                <OfferActionButtons
                  offerId={viewTarget.offerId}
                  offerExpiresAt={viewTarget.offerExpiresAt!}
                  onRefused={() => setViewTargetId(null)}
                  stacked
                />
              ) : undefined}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OfferCountdownBadge({ offerExpiresAt }: { offerExpiresAt: string }) {
  const seconds = useCountdownSeconds(offerExpiresAt);
  return (
    <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
      {seconds > 0 ? `${seconds}s pour répondre` : "Expiration…"}
    </Badge>
  );
}
