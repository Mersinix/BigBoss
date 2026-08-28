import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency } from "@/hooks/use-currency";
import type { PrintOrderStatus, PrintOrderWithParties } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/dashboard/dashboard-kit";
import { formatDate } from "@/lib/format";
import { PRINT_ORDER_STATUS_META, PRINT_ORDER_NEXT_ACTIONS, PRINT_ORDER_STATUSES } from "@/lib/print-order-status";
import { Search, ClipboardList, Eye, MapPin, Phone, Calendar, User } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const meta = PRINT_ORDER_STATUS_META[status as PrintOrderStatus] ?? PRINT_ORDER_STATUS_META.PENDING;
  return <Badge variant="outline" className={meta.className}>{meta.label}</Badge>;
}

function OrderDetailDialog({
  order, onClose, onChangeStatus, pending,
}: {
  order: PrintOrderWithParties | null;
  onClose: () => void;
  onChangeStatus: (id: number, status: PrintOrderStatus) => void;
  pending: boolean;
}) {
  const fmt = useFormatCurrency();
  if (!order) return null;
  const actions = PRINT_ORDER_NEXT_ACTIONS[order.status as PrintOrderStatus] ?? [];
  return (
    <Dialog open={!!order} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Commande #{String(order.id).padStart(5, "0")}
            <StatusBadge status={order.status} />
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <div className="rounded-xl border border-border/50 p-3 space-y-1.5">
            <p className="text-sm font-semibold flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-muted-foreground" /> {order.cafeOwnerName}</p>
            {order.contactPhone && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone className="w-3 h-3" /> {order.contactPhone}</p>}
            {order.deliveryAddress && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {order.deliveryAddress}</p>}
          </div>

          <div className="rounded-xl border border-border/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{order.itemName}</p>
              <span className="text-sm text-muted-foreground">x{order.quantity}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Prix unitaire</span><span>{fmt(order.unitPriceInCents)}</span>
            </div>
            <div className="flex items-center justify-between font-semibold text-sm pt-1 border-t border-border/40">
              <span>Total</span><span>{fmt(order.totalInCents)}</span>
            </div>
          </div>

          {order.notes && (
            <div className="rounded-xl bg-secondary/30 p-3">
              <p className="text-xs font-medium text-foreground mb-1">Notes</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{order.notes}</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Calendar className="w-3 h-3" /> Commandée le {order.createdAt ? formatDate(order.createdAt as any) : "—"}
          </p>

          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {actions.map((a) => (
                <Button
                  key={a.status}
                  size="sm"
                  variant={a.variant === "destructive" ? "outline" : "default"}
                  className={a.variant === "destructive" ? "text-destructive border-destructive/30 hover:bg-destructive/10" : ""}
                  disabled={pending}
                  onClick={() => onChangeStatus(order.id, a.status)}
                  data-testid={`button-status-${a.status.toLowerCase()}`}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PrinterOrders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fmt = useFormatCurrency();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [viewing, setViewing] = useState<PrintOrderWithParties | null>(null);

  const { data: orders = [], isLoading } = useQuery<PrintOrderWithParties[]>({ queryKey: ["/api/print/orders"] });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: PrintOrderStatus }) =>
      apiRequest("PATCH", `/api/print/orders/${id}/status`, { status }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/print/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/print/revenue"] });
      toast({ title: "Commande mise à jour" });
      setViewing((cur) => cur && cur.id === variables.id ? { ...cur, status: variables.status } : cur);
    },
    onError: (error: Error) => toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...orders]
      .filter((o) => statusFilter === "ALL" || o.status === statusFilter)
      .filter((o) => !q || o.cafeOwnerName.toLowerCase().includes(q) || o.itemName.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());
  }, [orders, search, statusFilter]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Commandes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Suivez et gérez les commandes de vos clients Coffee Owners.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Rechercher un client ou un service…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-orders" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les statuts</SelectItem>
            {PRINT_ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{PRINT_ORDER_STATUS_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState message={orders.length === 0 ? "Aucune commande pour le moment." : "Aucune commande ne correspond à ces filtres."} icon={ClipboardList} />
      ) : (
        <div className="rounded-2xl border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Commande</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Article</TableHead>
                <TableHead>Qté</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow key={o.id} data-testid={`row-order-${o.id}`}>
                  <TableCell className="font-mono text-xs text-muted-foreground">#{String(o.id).padStart(5, "0")}</TableCell>
                  <TableCell className="font-medium text-sm">{o.cafeOwnerName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{o.itemName}</TableCell>
                  <TableCell className="text-sm">{o.quantity}</TableCell>
                  <TableCell className="font-semibold text-sm">{fmt(o.totalInCents)}</TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{o.createdAt ? formatDate(o.createdAt as any) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewing(o)} data-testid={`button-view-order-${o.id}`}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <OrderDetailDialog
        order={viewing}
        onClose={() => setViewing(null)}
        onChangeStatus={(id, status) => updateStatus.mutate({ id, status })}
        pending={updateStatus.isPending}
      />
    </div>
  );
}
