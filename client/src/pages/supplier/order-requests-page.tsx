import { useState, useMemo } from "react";
import { useOrders, useUpdateSubOrderStatus } from "@/hooks/use-orders";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/format";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Clock, Box, Store, Package, Eye, Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SupplierOrderDetailsModal from "@/components/supplier/supplier-order-details-modal";
import type { OrderWithDetails } from "@shared/schema";

// ── Constants ─────────────────────────────────────────────────────────────────

const HIST_STATUS_OPTS = [
  { value: "ALL",          label: "Tous les statuts" },
  { value: "CONFIRMED",    label: "Acceptée" },
  { value: "PREPARING",    label: "En préparation" },
  { value: "READY",        label: "Prête" },
  { value: "IN_DELIVERY",  label: "En livraison" },
  { value: "DELIVERED",    label: "Livrée" },
  { value: "CANCELLED",    label: "Refusée" },
];

const PRIORITY_OPTS = [
  { value: "ALL",    label: "Toutes priorités" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH",   label: "Haute priorité" },
  { value: "URGENT", label: "Urgent" },
];

const HIST_STATUS_MAP: Record<string, { label: string; color: string }> = {
  CONFIRMED:   { label: "Acceptée",        color: "bg-blue-100 text-blue-700" },
  PREPARING:   { label: "En préparation",  color: "bg-orange-100 text-orange-700" },
  READY:       { label: "Prête",           color: "bg-teal-100 text-teal-700" },
  IN_DELIVERY: { label: "En livraison",    color: "bg-purple-100 text-purple-700" },
  DELIVERED:   { label: "Livrée",          color: "bg-green-100 text-green-700" },
  CANCELLED:   { label: "Refusée",         color: "bg-red-100 text-red-700" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchesDate(dateStr: any, filter: string): boolean {
  if (!filter) return true;
  const d = new Date(dateStr);
  const f = new Date(filter);
  return d.getFullYear() === f.getFullYear() && d.getMonth() === f.getMonth() && d.getDate() === f.getDate();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrderRequestsPage() {
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useOrders();
  const updateSubOrderStatus = useUpdateSubOrderStatus();
  const { toast } = useToast();
  const fmt = useFormatCurrency();

  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [modalReadOnly, setModalReadOnly] = useState(false);

  // View switcher
  const [requestsView, setRequestsView] = useState<"pending" | "history">("pending");

  // Pending filters
  const [pendingCafeSearch, setPendingCafeSearch] = useState("");
  const [pendingDateFilter, setPendingDateFilter] = useState("");
  const [pendingPriorityFilter, setPendingPriorityFilter] = useState("ALL");

  // History filters
  const [histStatusFilter, setHistStatusFilter] = useState("ALL");
  const [histCafeSearch, setHistCafeSearch] = useState("");
  const [histDateFilter, setHistDateFilter] = useState("");
  const [histPriorityFilter, setHistPriorityFilter] = useState("ALL");

  // ── Data ──────────────────────────────────────────────────────────────────

  const mySubOrders = useMemo(() => orders.flatMap(order =>
    (order.subOrders ?? [])
      .filter((so: any) => so.supplierId === user?.id)
      .map((so: any) => ({
        ...so,
        orderId: order.id,
        cafeName: order.cafe?.name ?? "Inconnu",
        cafeId: order.cafeId,
        orderCreatedAt: order.createdAt,
        orderPriority: (order as any).priority ?? "NORMAL",
        orderScheduledAt: (order as any).scheduledAt,
        deliveryAddress: (order as any).deliveryAddress,
        _order: order,
      }))
  ).sort((a, b) => new Date(b.orderCreatedAt as any).getTime() - new Date(a.orderCreatedAt as any).getTime()),
  [orders, user?.id]);

  const allPending = useMemo(() => mySubOrders.filter(so => so.status === "PENDING"), [mySubOrders]);
  const allHistory = useMemo(() => mySubOrders.filter(so => so.status !== "PENDING"), [mySubOrders]);

  const pendingRequests = useMemo(() => allPending.filter(so => {
    if (pendingCafeSearch && !so.cafeName.toLowerCase().includes(pendingCafeSearch.toLowerCase())) return false;
    if (pendingPriorityFilter !== "ALL" && so.orderPriority !== pendingPriorityFilter) return false;
    if (!matchesDate(so.orderCreatedAt, pendingDateFilter)) return false;
    return true;
  }), [allPending, pendingCafeSearch, pendingDateFilter, pendingPriorityFilter]);

  const historyRequests = useMemo(() => allHistory.filter(so => {
    if (histStatusFilter !== "ALL" && so.status !== histStatusFilter) return false;
    if (histCafeSearch && !so.cafeName.toLowerCase().includes(histCafeSearch.toLowerCase())) return false;
    if (histPriorityFilter !== "ALL" && so.orderPriority !== histPriorityFilter) return false;
    if (!matchesDate(so.orderCreatedAt, histDateFilter)) return false;
    return true;
  }), [allHistory, histStatusFilter, histCafeSearch, histDateFilter, histPriorityFilter]);

  // ── Counts ────────────────────────────────────────────────────────────────

  const approvedCount = allHistory.filter(so => so.status !== "CANCELLED").length;
  const rejectedCount = allHistory.filter(so => so.status === "CANCELLED").length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleApprove = (subOrderId: number) => {
    updateSubOrderStatus.mutate({ subOrderId, status: "CONFIRMED" }, {
      onSuccess: () => toast({ title: "Commande acceptée", description: "La sous-commande a été confirmée." }),
      onError: () => toast({ title: "Erreur", description: "Impossible de confirmer.", variant: "destructive" }),
    });
  };

  const handleReject = (subOrderId: number) => {
    updateSubOrderStatus.mutate({ subOrderId, status: "CANCELLED" }, {
      onSuccess: () => toast({ title: "Commande refusée", description: "La sous-commande a été annulée." }),
      onError: () => toast({ title: "Erreur", description: "Impossible d'annuler.", variant: "destructive" }),
    });
  };

  const openModal = (order: OrderWithDetails, readOnly: boolean) => {
    setSelectedOrder(order);
    setModalReadOnly(readOnly);
  };

  const priorityBadge = (priority: string) => {
    if (priority === "URGENT") return <Badge variant="destructive" className="text-[10px]">Urgent</Badge>;
    if (priority === "HIGH") return <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200">Haute prio.</Badge>;
    return <span className="text-xs text-muted-foreground">Normal</span>;
  };

  const hasPendingFilters = pendingCafeSearch || pendingDateFilter || pendingPriorityFilter !== "ALL";
  const hasHistFilters = histStatusFilter !== "ALL" || histCafeSearch || histDateFilter || histPriorityFilter !== "ALL";

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Demandes de commandes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Examinez et répondez aux nouvelles commandes reçues.</p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "En attente", value: allPending.length,  icon: Clock,       color: "text-amber-500 bg-amber-500/10" },
          { label: "Acceptées",  value: approvedCount,      icon: CheckCircle, color: "text-green-600 bg-green-500/10" },
          { label: "Refusées",   value: rejectedCount,      icon: XCircle,     color: "text-red-600 bg-red-500/10" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`rounded-xl p-3 ${color.split(" ")[1]}`}>
                <Icon className={`w-5 h-5 ${color.split(" ")[0]}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── View switcher ── */}
      <div className="flex gap-1 bg-secondary/40 rounded-xl p-1">
        {[
          { id: "pending", label: "Demandes en attente",    count: allPending.length },
          { id: "history", label: "Historique des demandes", count: allHistory.length },
        ].map(({ id, label, count }) => (
          <button
            key={id}
            onClick={() => setRequestsView(id as any)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              requestsView === id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{id === "pending" ? "En attente" : "Historique"}</span>
            {count > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                requestsView === id ? "bg-amber-500 text-white" : "bg-secondary text-muted-foreground"
              }`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Pending section ── */}
      {requestsView === "pending" && (
        <>
          {/* Pending filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Café..."
                value={pendingCafeSearch}
                onChange={e => setPendingCafeSearch(e.target.value)}
                className="pl-9 w-40"
              />
            </div>

            <Select value={pendingPriorityFilter} onValueChange={setPendingPriorityFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Priorité" /></SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={pendingDateFilter}
              onChange={e => setPendingDateFilter(e.target.value)}
              className="w-40"
              title="Filtrer par date"
            />

            {hasPendingFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => { setPendingCafeSearch(""); setPendingDateFilter(""); setPendingPriorityFilter("ALL"); }}
              >
                <X className="w-3.5 h-3.5" /> Effacer
              </Button>
            )}
          </div>

          {pendingRequests.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Box className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
                <p className="font-semibold text-lg">Aucune demande en attente</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {hasPendingFilters ? "Aucun résultat pour ces filtres." : "Les nouvelles commandes s'afficheront ici."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="px-5 pt-5 pb-3 border-b border-border/50">
                  <h2 className="font-semibold">Demandes en attente ({pendingRequests.length})</h2>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Commande</TableHead>
                      <TableHead>Café</TableHead>
                      <TableHead>Articles</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Priorité</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRequests.map(so => (
                      <TableRow key={so.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          #{String(so.orderId).padStart(6, "0")}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            <Store className="w-3.5 h-3.5 text-muted-foreground" />
                            {so.cafeName}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            {(so.items ?? []).slice(0, 3).map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-1 text-xs text-muted-foreground">
                                {item.packId
                                  ? <Package className="w-3 h-3 shrink-0" />
                                  : <Box className="w-3 h-3 shrink-0" />
                                }
                                <span className="truncate max-w-[140px]">
                                  {item.quantity}× {item.packId ? item.packName : item.product?.name}
                                </span>
                              </div>
                            ))}
                            {(so.items ?? []).length > 3 && (
                              <p className="text-xs text-muted-foreground">+{(so.items ?? []).length - 3} autre(s)</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold">{fmt(so.subtotal)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{formatDate(so.orderCreatedAt)}</TableCell>
                        <TableCell>{priorityBadge(so.orderPriority)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                              onClick={() => handleApprove(so.id)}
                              disabled={updateSubOrderStatus.isPending}
                              data-testid={`button-approve-${so.id}`}
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={() => handleReject(so.id)}
                              disabled={updateSubOrderStatus.isPending}
                              data-testid={`button-reject-${so.id}`}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-primary"
                              onClick={() => openModal((so as any)._order, false)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── History section ── */}
      {requestsView === "history" && (
        <>
          {/* History filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={histStatusFilter} onValueChange={setHistStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                {HIST_STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Café..."
                value={histCafeSearch}
                onChange={e => setHistCafeSearch(e.target.value)}
                className="pl-9 w-40"
              />
            </div>

            <Select value={histPriorityFilter} onValueChange={setHistPriorityFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Priorité" /></SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={histDateFilter}
              onChange={e => setHistDateFilter(e.target.value)}
              className="w-40"
              title="Filtrer par date"
            />

            {hasHistFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => { setHistStatusFilter("ALL"); setHistCafeSearch(""); setHistDateFilter(""); setHistPriorityFilter("ALL"); }}
              >
                <X className="w-3.5 h-3.5" /> Effacer
              </Button>
            )}
          </div>

          {historyRequests.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Box className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
                <p className="font-semibold text-lg">Aucune demande dans l'historique</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {hasHistFilters ? "Aucun résultat pour ces filtres." : "L'historique de vos demandes s'affichera ici."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="px-5 pt-5 pb-3 border-b border-border/50">
                  <h2 className="font-semibold">Historique des demandes ({historyRequests.length})</h2>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Commande</TableHead>
                      <TableHead>Café</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Priorité</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Détails</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyRequests.map(so => {
                      const s = HIST_STATUS_MAP[so.status] ?? { label: so.status, color: "bg-gray-100 text-gray-700" };
                      return (
                        <TableRow key={so.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            #{String(so.orderId).padStart(6, "0")}
                          </TableCell>
                          <TableCell className="font-medium">{so.cafeName}</TableCell>
                          <TableCell className="font-semibold">{fmt(so.subtotal)}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{formatDate(so.orderCreatedAt)}</TableCell>
                          <TableCell>{priorityBadge(so.orderPriority)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`${s.color} text-xs`}>{s.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-primary"
                              onClick={() => openModal((so as any)._order, true)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <SupplierOrderDetailsModal
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        order={selectedOrder}
        supplierId={user?.id ?? 0}
        readOnly={modalReadOnly}
      />
    </div>
  );
}
