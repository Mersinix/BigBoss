import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import type { PrintOrderWithParties } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/dashboard/dashboard-kit";
import { formatDate } from "@/lib/format";
import { buildPrintInvoiceRows, PRINT_INVOICE_STATUS_META, type PrintInvoiceRow, type PrintInvoiceStatus } from "@/lib/print-financial-rows";
import { PRINT_ORDER_STATUS_META } from "@/lib/print-order-status";
import { FileText, DollarSign, Clock, Eye, Search, Calendar } from "lucide-react";

function InvoiceDetailDialog({ row, onClose }: { row: PrintInvoiceRow | null; onClose: () => void }) {
  const fmt = useFormatCurrency();
  if (!row) return null;
  return (
    <Dialog open={!!row} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Facture {row.invoiceNumber}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Client</span>
            <span className="text-sm font-medium">{row.cafeOwnerName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Article</span>
            <span className="text-sm font-medium">{row.itemName} x{row.quantity}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Date</span>
            <span className="text-sm">{row.createdAt ? formatDate(row.createdAt as any) : "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Statut commande</span>
            <Badge variant="outline" className={(PRINT_ORDER_STATUS_META as any)[row.orderStatus]?.className}>
              {(PRINT_ORDER_STATUS_META as any)[row.orderStatus]?.label ?? row.orderStatus}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Paiement</span>
            <Badge variant="secondary" className={PRINT_INVOICE_STATUS_META[row.invoiceStatus].className}>
              {PRINT_INVOICE_STATUS_META[row.invoiceStatus].label}
            </Badge>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-border/50">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-lg font-bold text-primary">{fmt(row.amount)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_OPTIONS: { value: "ALL" | PrintInvoiceStatus; label: string }[] = [
  { value: "ALL", label: "Tous les statuts" },
  { value: "PAID", label: "Payé" },
  { value: "PENDING", label: "En attente" },
  { value: "CANCELLED", label: "Annulé" },
];

// PRINT has no invoices table (like every module in this app — see lib/print-financial-rows.ts)
// so every row here is derived live from /api/print/orders. No commission/payout split is
// shown: PRINT is a direct Printer <-> Coffee Owner service, unlike Supplier/SHOP's
// platform-intermediated payouts.
export default function PrinterInvoices() {
  const fmt = useFormatCurrency();
  const { data: orders = [], isLoading } = useQuery<PrintOrderWithParties[]>({ queryKey: ["/api/print/orders"] });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | PrintInvoiceStatus>("ALL");
  const [viewing, setViewing] = useState<PrintInvoiceRow | null>(null);

  const allRows = useMemo(() => buildPrintInvoiceRows(orders), [orders]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows
      .filter((r) => statusFilter === "ALL" || r.invoiceStatus === statusFilter)
      .filter((r) => !q || r.cafeOwnerName.toLowerCase().includes(q) || r.itemName.toLowerCase().includes(q) || r.invoiceNumber.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());
  }, [allRows, search, statusFilter]);

  const paid = allRows.filter((r) => r.invoiceStatus === "PAID");
  const pending = allRows.filter((r) => r.invoiceStatus === "PENDING");
  const totalPaid = paid.reduce((s, r) => s + r.amount, 0);
  const totalPending = pending.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Facturation</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Vos factures générées à partir des commandes.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><FileText className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total factures</p><p className="text-2xl font-bold">{allRows.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><DollarSign className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">Payé</p><p className="text-2xl font-bold text-green-600">{fmt(totalPaid)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div><p className="text-xs text-muted-foreground">En attente</p><p className="text-2xl font-bold text-amber-600">{fmt(totalPending)}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Rechercher une facture…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState message={allRows.length === 0 ? "Aucune facture pour le moment." : "Aucune facture ne correspond à ces filtres."} icon={FileText} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r) => (
            <Card key={r.orderId} data-testid={`card-invoice-${r.orderId}`}>
              <CardContent className="p-4 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{r.invoiceNumber}</p>
                    <p className="font-semibold text-sm truncate mt-0.5">{r.cafeOwnerName}</p>
                  </div>
                  <Badge variant="secondary" className={`shrink-0 ${PRINT_INVOICE_STATUS_META[r.invoiceStatus].className}`}>
                    {PRINT_INVOICE_STATUS_META[r.invoiceStatus].label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">{r.itemName}</p>
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                    <p className="font-bold text-sm text-primary">{fmt(r.amount)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />{r.createdAt ? formatDate(r.createdAt as any) : "—"}</p>
                </div>
                <Button size="sm" variant="outline" className="self-end" onClick={() => setViewing(r)} data-testid={`button-view-invoice-${r.orderId}`}>
                  <Eye className="w-3.5 h-3.5 mr-1" />Voir
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <InvoiceDetailDialog row={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
