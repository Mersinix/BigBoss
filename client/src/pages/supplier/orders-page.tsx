import { useState, useMemo } from "react";
import { useOrders, useUpdateSubOrderStatus } from "@/hooks/use-orders";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Calendar, Clock, Archive, Search, X, Store, Box, Layers, MapPin, Package, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import OrderDetailsModal from "@/components/cafe/order-details-modal";
import type { OrderWithDetails } from "@shared/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_OPTS = [
  { value: "ALL", label: "Tous les statuts" },
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

const NEXT_STATUSES: Record<string, { value: string; label: string }[]> = {
  CONFIRMED:   [
    { value: "PREPARING", label: "Commencer la préparation" },
    { value: "PENDING",   label: "Retourner aux demandes" },
  ],
  PREPARING:   [{ value: "READY",     label: "Marquer comme prête" }],
  READY:       [],
  IN_DELIVERY: [],
  DELIVERED:   [],
};

function isToday(dateStr: any): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isFuture(order: any): boolean {
  if (order.scheduledAt) {
    const scheduled = new Date(order.scheduledAt);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0,0,0,0);
    return scheduled >= tomorrow;
  }
  return false;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SupplierOrdersPage() {
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useOrders();
  const updateSubOrderStatus = useUpdateSubOrderStatus();
  const { toast } = useToast();

  const [view, setView] = useState<"today" | "future" | "old">("today");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [cafeSearch, setCafeSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);

  // Extract suborders for this supplier
  const mySubOrders = useMemo(() => orders.flatMap(order =>
    (order.subOrders ?? [])
      .filter((so: any) => so.supplierId === user?.id && so.status !== "PENDING") // PENDING = order requests tab
      .map((so: any) => ({
        ...so,
        orderId: order.id,
        cafeName: order.cafe?.name ?? "Inconnu",
        orderCreatedAt: order.createdAt,
        orderPriority: (order as any).priority ?? "NORMAL",
        orderScheduledAt: (order as any).scheduledAt,
        deliveryAddress: (order as any).deliveryAddress,
        _order: order,
      }))
  ), [orders, user?.id]);

  // Split by time view
  const filteredByView = useMemo(() => {
    return mySubOrders.filter(so => {
      if (view === "today") return isToday(so.orderCreatedAt) && !isFuture(so._order) && !["DELIVERED","CANCELLED"].includes(so.status);
      if (view === "future") return isFuture(so._order) && !["DELIVERED","CANCELLED"].includes(so.status);
      // old = delivered, cancelled, or older than today
      return ["DELIVERED","CANCELLED"].includes(so.status) || (!isToday(so.orderCreatedAt) && !isFuture(so._order));
    });
  }, [mySubOrders, view]);

  // Apply other filters
  const filtered = useMemo(() => {
    return filteredByView.filter(so => {
      if (statusFilter !== "ALL" && so.status !== statusFilter) return false;
      if (cafeSearch && !so.cafeName.toLowerCase().includes(cafeSearch.toLowerCase())) return false;
      if (productSearch) {
        const pSearch = productSearch.toLowerCase();
        const hasMatch = (so.items ?? []).some((item: any) => {
          const name = item.packId ? item.packName ?? "" : item.product?.name ?? "";
          return name.toLowerCase().includes(pSearch);
        });
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [filteredByView, statusFilter, cafeSearch, productSearch]);

  const handleStatusUpdate = (subOrderId: number, status: string) => {
    updateSubOrderStatus.mutate({ subOrderId, status }, {
      onSuccess: () => toast({ title: "Statut mis à jour" }),
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    });
  };

  const clearFilters = () => { setStatusFilter("ALL"); setCafeSearch(""); setProductSearch(""); };
  const hasFilters = statusFilter !== "ALL" || cafeSearch || productSearch;

  const views = [
    { id: "today",  label: "Aujourd'hui",     icon: Clock,    count: mySubOrders.filter(so => isToday(so.orderCreatedAt) && !isFuture(so._order) && !["DELIVERED","CANCELLED"].includes(so.status)).length },
    { id: "future", label: "Futures",          icon: Calendar, count: mySubOrders.filter(so => isFuture(so._order) && !["DELIVERED","CANCELLED"].includes(so.status)).length },
    { id: "old",    label: "Historique",       icon: Archive,  count: mySubOrders.filter(so => ["DELIVERED","CANCELLED"].includes(so.status) || (!isToday(so.orderCreatedAt) && !isFuture(so._order))).length },
  ];

  if (isLoading) {
    return <div className="flex flex-col gap-4 p-6">{[1,2,3].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>;
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold">Mes Commandes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez et suivez vos commandes en cours.</p>
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
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Filtrer par café..."
            value={cafeSearch}
            onChange={e => setCafeSearch(e.target.value)}
            className="pl-9 w-44"
          />
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Filtrer par produit..."
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            className="pl-9 w-44"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={clearFilters}>
            <X className="w-3.5 h-3.5" /> Effacer
          </Button>
        )}
      </div>

      {/* ── Order list ── */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Box className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold text-lg">Aucune commande</p>
            <p className="text-sm text-muted-foreground mt-1">
              {view === "today" ? "Aucune commande active aujourd'hui." : view === "future" ? "Aucune commande planifiée." : "Aucune commande dans l'historique."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(so => {
            const badgeColor = STATUS_BADGE[so.status] ?? "bg-gray-100 text-gray-800";
            const label = STATUS_LABELS[so.status] ?? so.status;
            const nextStatuses = NEXT_STATUSES[so.status] ?? [];
            const priority = so.orderPriority;
            return (
              <Card key={so.id} className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    {/* Left: order info */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          #{String(so.orderId).padStart(6,"0")}
                        </span>
                        <Badge variant="secondary" className={`${badgeColor} text-xs`}>{label}</Badge>
                        {priority && priority !== "NORMAL" && (
                          <Badge variant="secondary" className={`text-xs ${priority === "URGENT" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                            <Zap className="w-3 h-3 mr-0.5" />{priority === "URGENT" ? "Urgent" : "Haute prio."}
                          </Badge>
                        )}
                        {so.orderScheduledAt && (
                          <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {formatDate(so.orderScheduledAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Store className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium">{so.cafeName}</span>
                        <span className="text-muted-foreground text-xs">· {formatDate(so.orderCreatedAt)}</span>
                      </div>
                      {so.deliveryAddress?.address && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{so.deliveryAddress.address}</span>
                        </div>
                      )}
                      {/* Items preview */}
                      <div className="flex flex-wrap gap-1.5">
                        {(so.items ?? []).slice(0, 4).map((item: any, idx: number) => {
                          const isPackItem = !!item.packId;
                          const name = isPackItem ? item.packName : item.product?.name ?? "–";
                          return (
                            <span key={idx} className="inline-flex items-center gap-1 text-xs bg-secondary/60 px-2 py-0.5 rounded-full text-muted-foreground">
                              {isPackItem ? <Layers className="w-2.5 h-2.5" /> : <Box className="w-2.5 h-2.5" />}
                              {item.quantity}× {name}
                            </span>
                          );
                        })}
                        {(so.items ?? []).length > 4 && (
                          <span className="text-xs text-muted-foreground self-center">+{(so.items ?? []).length - 4}</span>
                        )}
                      </div>
                    </div>

                    {/* Right: total + actions */}
                    <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2 shrink-0">
                      <p className="font-bold text-amber-500">{formatCurrency(so.subtotal)}</p>
                      <div className="flex gap-2">
                        {nextStatuses.map(ns => (
                          <Button key={ns.value} size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => handleStatusUpdate(so.id, ns.value)}
                            disabled={updateSubOrderStatus.isPending}
                          >
                            {ns.label}
                          </Button>
                        ))}
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-primary"
                          onClick={() => setSelectedOrder(so._order)}
                        >
                          Détails
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <OrderDetailsModal
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        order={selectedOrder}
        showReorder={false}
      />
    </div>
  );
}
