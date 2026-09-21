import { useState, useMemo, useEffect } from "react";
import { useOrders, useDeleteOrder } from "@/hooks/use-orders";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/format";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Clock, Calendar, Archive, Search, X, Box, Zap, Store, MapPin, Trash2, Loader2, History, ListChecks } from "lucide-react";
import OrderDetailsModal from "@/components/cafe/order-details-modal";
import SupplierOrderDetailsModal from "@/components/supplier/supplier-order-details-modal";
import CafeOrdersPage from "@/pages/cafe/orders-page";
import { useToast } from "@/hooks/use-toast";
import type { OrderWithDetails } from "@shared/schema";
import { deriveOrderStatus, getSupplierStatusEntries, orderMatchesStatus } from "@/lib/order-status";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_OPTS = [
  { value: "ALL",       label: "Tous les statuts" },
  { value: "PENDING",     label: "En attente" },
  { value: "CONFIRMED",   label: "Confirmée" },
  { value: "PREPARING",   label: "En préparation" },
  { value: "READY",       label: "Prête" },
  { value: "IN_DELIVERY", label: "En livraison" },
  { value: "DELIVERED",   label: "Livrée" },
  { value: "CANCELLED",   label: "Annulée" },
];

const STATUS_BADGE: Record<string, string> = {
  PENDING:     "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300",
  CONFIRMED:   "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
  PREPARING:   "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300",
  READY:       "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300",
  IN_DELIVERY: "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300",
  DELIVERED:   "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300",
  CANCELLED:   "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente", CONFIRMED: "Confirmée", PREPARING: "En préparation",
  READY: "Prête", IN_DELIVERY: "En livraison", DELIVERED: "Livrée", CANCELLED: "Annulée",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// The order's relevant planned/order date (task: "Active Orders / Historique reorganization",
// §18). orders.scheduledAt is null for immediate orders (see shared/schema.ts's own doc:
// "null = immediate"), in which case the order's creation date IS its relevant date — this
// exactly reproduces what the previous isToday/isFuture helpers already did between them
// (isToday compared createdAt, isFuture only ever looked at scheduledAt), just unified into
// one derivation reused by both the date bucket and the Historique/Active split below, so an
// order can never land in two buckets from two different date readings.
function getRelevantDate(order: OrderWithDetails): Date {
  const scheduledAt = (order as any).scheduledAt;
  return new Date(scheduledAt ?? (order.createdAt as any));
}

function classifyByDate(order: OrderWithDetails): "old" | "today" | "future" {
  const relevant = startOfDay(getRelevantDate(order)).getTime();
  const today = startOfDay(new Date()).getTime();
  if (relevant < today) return "old";
  if (relevant > today) return "future";
  return "today";
}

// Single source of truth for "is this order delivered, from THIS viewer's point of view" —
// reused for both the Historique/Active classification below and the card badge, so they can
// never disagree (task §9: "prevents delivered orders from appearing in multiple sections").
// A Supplier only ever has their own sub-order to judge by (data isolation, §10) — a
// multi-supplier order can be delivered for one supplier while another is still preparing, and
// each supplier's own Historique must reflect only their own leg. Every other role sees the
// order as a whole via deriveOrderStatus, which already only reports DELIVERED once every
// non-cancelled sub-order has reached it.
function getEffectiveStatus(order: OrderWithDetails, isSupplier: boolean, supplierId?: number): string {
  if (isSupplier) {
    return ((order.subOrders ?? []).find((so: any) => so.supplierId === supplierId) as any)?.status ?? order.status;
  }
  return deriveOrderStatus(order);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const { data: orders = [], isLoading } = useOrders();
  const deleteOrder = useDeleteOrder();

  const [mainView, setMainView] = useState<"active" | "historique">("active");
  const [activeSubView, setActiveSubView] = useState<"old" | "today" | "future">("today");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [cafeSearch, setCafeSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isSupplier = user?.role === "SUPPLIER";

  // Realtime order updates (status changes) already re-trigger classification via the `orders`
  // dependency below — but a pure calendar-day rollover (task §15 scenarios 2/3: "Futures"
  // becomes "Aujourd'hui", "Aujourd'hui" becomes "Old Orders") happens with no underlying data
  // change at all, so classifyByDate's `new Date()` would otherwise only get re-evaluated on
  // the next unrelated refetch. This tick forces a periodic re-check (a page left open across
  // midnight settles within a minute, without requiring a manual refresh).
  const [dayTick, setDayTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDayTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // Classification priority (task §9): DELIVERED first (→ Historique, regardless of date),
  // otherwise bucket by the order's relevant date (→ Old Orders / Aujourd'hui / Futures). Every
  // order lands in exactly one bucket — never duplicated across sections.
  const buckets = useMemo(() => {
    const historique: OrderWithDetails[] = [];
    const old: OrderWithDetails[] = [];
    const today: OrderWithDetails[] = [];
    const future: OrderWithDetails[] = [];
    for (const o of orders) {
      if (getEffectiveStatus(o, isSupplier, user?.id) === "DELIVERED") { historique.push(o); continue; }
      const bucket = classifyByDate(o);
      (bucket === "old" ? old : bucket === "today" ? today : future).push(o);
    }
    return { historique, old, today, future };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, isSupplier, user?.id, dayTick]);

  const filteredByView = mainView === "historique" ? buckets.historique : buckets[activeSubView];

  // Apply filters
  const filtered = useMemo(() => {
    return filteredByView.filter(o => {
      // At least one sub-order matching the selected status is enough — the raw order.status
      // column only advances once every sub-order completes, so comparing against it directly
      // hid a multi-supplier order under any status besides its slowest supplier's.
      if (!orderMatchesStatus(o, statusFilter)) return false;
      if (cafeSearch && !o.cafe?.name.toLowerCase().includes(cafeSearch.toLowerCase())) return false;
      if (supplierSearch) {
        const match = (o.subOrders ?? []).some((so: any) => so.supplierName?.toLowerCase().includes(supplierSearch.toLowerCase()));
        if (!match) return false;
      }
      if (productSearch) {
        const pSearch = productSearch.toLowerCase();
        const match = (o.items ?? []).some((item: any) => {
          const name = item.packId ? (item.packName ?? "") : (item.product?.name ?? "");
          return name.toLowerCase().includes(pSearch);
        });
        if (!match) return false;
      }
      if (dateFilter) {
        const d = new Date(o.createdAt as any);
        const f = new Date(dateFilter);
        if (d.getFullYear() !== f.getFullYear() || d.getMonth() !== f.getMonth() || d.getDate() !== f.getDate()) return false;
      }
      return true;
    });
  }, [filteredByView, statusFilter, cafeSearch, supplierSearch, productSearch, dateFilter]);

  const pagination = usePagination(filtered.length);
  useEffect(() => { pagination.resetPage(); }, [mainView, activeSubView, statusFilter, cafeSearch, supplierSearch, productSearch, dateFilter]);
  const pageOrders = filtered.slice(pagination.start, pagination.end);

  const clearFilters = () => { setStatusFilter("ALL"); setCafeSearch(""); setSupplierSearch(""); setProductSearch(""); setDateFilter(""); };
  const hasFilters = statusFilter !== "ALL" || cafeSearch || supplierSearch || productSearch || dateFilter;

  const mainViews = [
    { id: "active" as const,     label: "Active Orders", icon: ListChecks, count: buckets.old.length + buckets.today.length + buckets.future.length },
    { id: "historique" as const, label: "Historique",    icon: Archive,    count: buckets.historique.length },
  ];
  const subViews = [
    { id: "old" as const,   label: "Old Orders", icon: History,  count: buckets.old.length },
    { id: "today" as const, label: "Aujourd'hui", icon: Clock,   count: buckets.today.length },
    { id: "future" as const, label: "Futures",    icon: Calendar, count: buckets.future.length },
  ];

  // Coffee Owner gets a dedicated Today/Planifiées/Daily/Anciennes view (see
  // cafe/orders-page.tsx) instead of the Admin/Supplier management list below —
  // this is the one place /orders branches per role, so Admin's and Supplier's
  // existing experience here is completely untouched.
  if (user?.role === "CAFE_OWNER") return <CafeOrdersPage />;

  if (isLoading) return (
    <div className="flex flex-col gap-4 p-6">{[1,2,3].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
  );

  return (
    <div className="flex flex-col gap-5 p-6">
      <DashboardHero
        title={isAdmin ? "Gestion des Commandes" : "Mes Commandes"}
        subtitle="Suivez et gérez le cycle de vie des commandes."
      />

      {/* ── Main view switcher: Active Orders / Historique ── */}
      <div className="flex gap-1 bg-secondary/40 rounded-xl p-1">
        {mainViews.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            onClick={() => setMainView(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${mainView === id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
            {count > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${mainView === id ? "bg-amber-500 text-white" : "bg-secondary text-muted-foreground"}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Sub view switcher: Old Orders / Aujourd'hui / Futures — Active Orders only ── */}
      {mainView === "active" && (
        <div className="flex gap-1 bg-secondary/25 rounded-xl p-1 w-fit">
          {subViews.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => setActiveSubView(id)}
              className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-sm font-medium transition-all ${activeSubView === id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
              {count > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${activeSubView === id ? "bg-amber-500 text-white" : "bg-secondary text-muted-foreground"}`}>{count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>

        {isAdmin && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Café..." value={cafeSearch} onChange={e => setCafeSearch(e.target.value)} className="pl-9 w-40" />
          </div>
        )}

        {isAdmin && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Fournisseur..." value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} className="pl-9 w-44" />
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Produit..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pl-9 w-40" />
        </div>

        <Input
          type="date"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="w-40"
          title="Filtrer par date"
        />

        {hasFilters && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={clearFilters}>
            <X className="w-3.5 h-3.5" /> Effacer
          </Button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} commande{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Order list ── */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Box className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold text-lg">Aucune commande</p>
            <p className="text-sm text-muted-foreground mt-1">
              {mainView === "historique"
                ? "Aucune commande livrée pour le moment."
                : activeSubView === "old" ? "Aucune commande en retard."
                : activeSubView === "today" ? "Aucune commande active aujourd'hui."
                : "Aucune commande planifiée."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pageOrders.map(order => {
            // Derive the display status from sub-orders so every card badge stays in sync
            // with what the Order Details modal shows — there is a single source of truth
            // (the sub-order rows) and no separate cached state on the cards.
            //
            // • Supplier  → their own sub-order status (already correct from previous fix)
            // • All other roles (Admin, Coffee Owner, Delivery) → aggregate status derived
            //   from sub-orders via deriveOrderStatus(), which mirrors the Order Details
            //   modal body. This avoids relying on the DB order.status column, which only
            //   advances when ALL sub-orders complete and can lag behind individual updates.
            const displayStatus = getEffectiveStatus(order, isSupplier, user?.id);
            const badgeColor = STATUS_BADGE[displayStatus] ?? "bg-gray-100 text-gray-800 dark:bg-gray-500/15 dark:text-gray-400";
            const label = STATUS_LABELS[displayStatus] ?? displayStatus;
            // A supplier only ever sees their own single sub-order here, so the collapsed
            // badge above is already accurate for them. Every other role sees the full,
            // possibly multi-supplier order — for those, a single aggregate badge can hide
            // suppliers that are behind. Null (one supplier, or none) keeps today's single
            // badge; otherwise render one badge per supplier instead.
            const supplierStatuses = isSupplier ? null : getSupplierStatusEntries(order);
            const priority = (order as any).priority;
            const scheduledAt = (order as any).scheduledAt;
            const deliveryAddress = (order as any).deliveryAddress as { address: string } | null;
            const subOrderCount = order.subOrders?.length ?? 0;

            return (
              <Card key={order.id} className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    {/* Left */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">#{String(order.id).padStart(6,"0")}</span>
                        {supplierStatuses ? (
                          supplierStatuses.map((s) => (
                            <Badge key={s.supplierId} variant="secondary" className={`${STATUS_BADGE[s.status] ?? "bg-gray-100 text-gray-800 dark:bg-gray-500/15 dark:text-gray-400"} text-xs`}>
                              {s.supplierName} — {STATUS_LABELS[s.status] ?? s.status}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="secondary" className={`${badgeColor} text-xs`}>{label}</Badge>
                        )}
                        {priority && priority !== "NORMAL" && (
                          <Badge variant="secondary" className={`text-xs ${priority === "URGENT" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" : "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400"}`}>
                            <Zap className="w-3 h-3 mr-0.5" />{priority === "URGENT" ? "Urgent" : "Haute prio."}
                          </Badge>
                        )}
                        {scheduledAt && (
                          <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                            <Calendar className="w-3 h-3" /> {formatDate(scheduledAt)}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="flex items-center gap-1.5">
                          <Store className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="font-medium">{order.cafe?.name}</span>
                        </span>
                        {subOrderCount > 0 && (
                          <span className="text-xs text-muted-foreground">{subOrderCount} fournisseur{subOrderCount > 1 ? "s" : ""}</span>
                        )}
                        <span className="text-xs text-muted-foreground">{formatDate(order.createdAt as any)}</span>
                      </div>

                      {deliveryAddress && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{deliveryAddress.address}</span>
                        </div>
                      )}
                    </div>

                    {/* Right */}
                    <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2 shrink-0">
                      <p className="font-bold text-amber-500 text-lg">{fmt(order.totalAmount)}</p>
                      <div className="flex gap-2 flex-wrap justify-end">
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-primary" onClick={() => setSelectedOrder(order)}>
                          Détails
                        </Button>
                        {/* Admin delete */}
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(order.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <DataPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={filtered.length}
          totalPages={pagination.totalPages}
          start={pagination.start}
          end={pagination.end}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          itemLabel="commandes"
        />
      )}

      {/* Always resolve the modal's order from the live query data so it stays in sync
          when React Query refetches the list (e.g. after a supplier status change).
          selectedOrder is only used to track which order is open; the actual data
          comes from the fresh `orders` array — single source of truth. */}
      {isSupplier && user ? (
        <SupplierOrderDetailsModal
          open={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          order={orders.find((o) => o.id === selectedOrder?.id) ?? selectedOrder}
          supplierId={user.id}
        />
      ) : (
        <OrderDetailsModal
          open={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          order={orders.find((o) => o.id === selectedOrder?.id) ?? selectedOrder}
          showReorder={false}
          isAdmin={isAdmin}
        />
      )}

      {/* Admin: delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la commande ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La commande sera définitivement supprimée avec tous ses sous-ordres, articles et retours associés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await deleteOrder.mutateAsync(deleteTarget);
                  toast({ title: "Commande supprimée" });
                } catch (err: any) {
                  toast({ title: "Erreur", description: err.message, variant: "destructive" });
                }
                setDeleteTarget(null);
              }}
              disabled={deleteOrder.isPending}
            >
              {deleteOrder.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
