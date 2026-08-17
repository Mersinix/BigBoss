import { useState, useMemo } from "react";
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
import { Clock, Calendar, Archive, Search, X, Box, Zap, Store, MapPin, Trash2, Loader2 } from "lucide-react";
import OrderDetailsModal from "@/components/cafe/order-details-modal";
import SupplierOrderDetailsModal from "@/components/supplier/supplier-order-details-modal";
import { useToast } from "@/hooks/use-toast";
import type { OrderWithDetails } from "@shared/schema";

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

function isToday(dateStr: any) {
  const d = new Date(dateStr), now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isFuture(order: OrderWithDetails) {
  const scheduledAt = (order as any).scheduledAt;
  if (!scheduledAt) return false;
  const scheduled = new Date(scheduledAt);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0,0,0,0);
  return scheduled >= tomorrow;
}

// Derive the most meaningful order status from its sub-orders.
// The DB `order.status` column only advances when ALL sub-orders complete, so it
// can lag behind the individual supplier statuses that are already visible inside
// the Order Details modal body.  Using this helper keeps every card badge in sync
// with what the modal shows — there is no separate local state to maintain.
//
// Rule: minimum (least-advanced) non-cancelled sub-order status, which represents
// the current bottleneck. Falls back to order.status when there are no sub-orders.
const _STATUS_RANK: Record<string, number> = {
  PENDING: 0, CONFIRMED: 1, PREPARING: 2,
  READY: 3, IN_DELIVERY: 4, DELIVERED: 5,
};

function deriveOrderStatus(order: OrderWithDetails): string {
  const subs = (order.subOrders ?? []) as any[];
  if (!subs.length) return order.status;
  const active = subs.filter((s: any) => s.status !== "CANCELLED");
  if (active.length === 0) return "CANCELLED";
  const minRank = active.reduce((min: number, s: any) => {
    const rank = _STATUS_RANK[s.status ?? "PENDING"] ?? 0;
    return rank < min ? rank : min;
  }, Infinity);
  return Object.keys(_STATUS_RANK).find((k) => _STATUS_RANK[k] === minRank) ?? order.status;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const { data: orders = [], isLoading } = useOrders();
  const deleteOrder = useDeleteOrder();

  const [view, setView] = useState<"today" | "future" | "old">("today");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [cafeSearch, setCafeSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isSupplier = user?.role === "SUPPLIER";

  // Split orders by time view
  const filteredByView = useMemo(() => {
    return orders.filter(o => {
      if (view === "today") return isToday(o.createdAt) && !isFuture(o) && !["DELIVERED","CANCELLED"].includes(o.status);
      if (view === "future") return isFuture(o) && !["DELIVERED","CANCELLED"].includes(o.status);
      return ["DELIVERED","CANCELLED"].includes(o.status) || (!isToday(o.createdAt) && !isFuture(o));
    });
  }, [orders, view]);

  // Apply filters
  const filtered = useMemo(() => {
    return filteredByView.filter(o => {
      if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
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

  const clearFilters = () => { setStatusFilter("ALL"); setCafeSearch(""); setSupplierSearch(""); setProductSearch(""); setDateFilter(""); };
  const hasFilters = statusFilter !== "ALL" || cafeSearch || supplierSearch || productSearch || dateFilter;

  const views = [
    { id: "today",  label: "Aujourd'hui",  icon: Clock,    count: orders.filter(o => isToday(o.createdAt) && !isFuture(o) && !["DELIVERED","CANCELLED"].includes(o.status)).length },
    { id: "future", label: "Futures",      icon: Calendar, count: orders.filter(o => isFuture(o) && !["DELIVERED","CANCELLED"].includes(o.status)).length },
    { id: "old",    label: "Historique",   icon: Archive,  count: orders.filter(o => ["DELIVERED","CANCELLED"].includes(o.status) || (!isToday(o.createdAt) && !isFuture(o))).length },
  ];

  if (isLoading) return (
    <div className="flex flex-col gap-4 p-6">{[1,2,3].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
  );

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold">
          {isAdmin ? "Gestion des Commandes" : "Mes Commandes"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Suivez et gérez le cycle de vie des commandes.</p>
      </div>

      {/* ── View switcher ── */}
      <div className="flex gap-1 bg-secondary/40 rounded-xl p-1">
        {views.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            onClick={() => setView(id as any)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${view === id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
            {count > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${view === id ? "bg-amber-500 text-white" : "bg-secondary text-muted-foreground"}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

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
              {view === "today" ? "Aucune commande active aujourd'hui." : view === "future" ? "Aucune commande planifiée." : "Aucun historique disponible."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            // Derive the display status from sub-orders so every card badge stays in sync
            // with what the Order Details modal shows — there is a single source of truth
            // (the sub-order rows) and no separate cached state on the cards.
            //
            // • Supplier  → their own sub-order status (already correct from previous fix)
            // • All other roles (Admin, Coffee Owner, Delivery) → aggregate status derived
            //   from sub-orders via deriveOrderStatus(), which mirrors the Order Details
            //   modal body. This avoids relying on the DB order.status column, which only
            //   advances when ALL sub-orders complete and can lag behind individual updates.
            const displayStatus = isSupplier
              ? ((order.subOrders ?? []).find((so: any) => so.supplierId === user?.id) as any)?.status ?? order.status
              : deriveOrderStatus(order);
            const badgeColor = STATUS_BADGE[displayStatus] ?? "bg-gray-100 text-gray-800";
            const label = STATUS_LABELS[displayStatus] ?? displayStatus;
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
                        <Badge variant="secondary" className={`${badgeColor} text-xs`}>{label}</Badge>
                        {priority && priority !== "NORMAL" && (
                          <Badge variant="secondary" className={`text-xs ${priority === "URGENT" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
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
