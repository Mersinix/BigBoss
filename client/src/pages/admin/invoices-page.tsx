import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileText, DollarSign, Eye } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { OrderWithDetails } from "@shared/schema";
import { buildFinancialRows, PAYMENT_COLLECTION_META, invoiceNumber } from "@/lib/financial-rows";
import {
  FinancialFilterBar, applyFinancialFilters, DEFAULT_FINANCIAL_FILTERS,
} from "@/components/financial/financial-filter-bar";
import OrderInvoiceModal from "@/components/financial/order-invoice-modal";

const STATUS_OPTIONS = [
  { value: "ALL", label: "Tous les statuts" },
  { value: "PENDING", label: "En attente" },
  { value: "CONFIRMED", label: "Confirmée" },
  { value: "PREPARING", label: "En préparation" },
  { value: "READY", label: "Prête" },
  { value: "IN_DELIVERY", label: "En livraison" },
  { value: "DELIVERED", label: "Livrée" },
  { value: "CANCELLED", label: "Annulée" },
];

// Admin's global invoice view — same real per-sub-order data as Supplier Invoices (see
// lib/financial-rows.ts), scoped to every supplier instead of just one. Fixes the previous
// version, which showed o.supplier?.name / o.totalAmount — both wrong/null for any order
// spanning more than one supplier (see shared/schema.ts subOrders).
export default function InvoicesPage() {
  const { data: orders = [], isLoading } = useQuery<OrderWithDetails[]>({ queryKey: ["/api/orders"] });
  const fmt = useFormatCurrency();
  const [filters, setFilters] = useState(DEFAULT_FINANCIAL_FILTERS);
  const [viewing, setViewing] = useState<{ orderId: number; subOrderId: number } | null>(null);

  const allRows = useMemo(() => buildFinancialRows(orders), [orders]);
  const supplierOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of allRows) map.set(r.supplierId, r.supplierName);
    return Array.from(map.entries()).map(([value, label]) => ({ value: String(value), label }));
  }, [allRows]);
  const rows = useMemo(
    () => applyFinancialFilters(allRows, filters, { statusField: "subOrderStatus", amountField: "subtotal" })
      .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()),
    [allRows, filters],
  );

  const nonCancelled = allRows.filter((r) => r.subOrderStatus !== "CANCELLED");
  const totalInvoiced = nonCancelled.reduce((s, r) => s + r.subtotal, 0);

  const viewingOrder = orders.find((o) => o.id === viewing?.orderId) ?? null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
        <p className="text-muted-foreground text-sm mt-1">View and export order invoices.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Invoices</p>
              <p className="text-2xl font-bold">{nonCancelled.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Invoiced Amount</p>
              <p className="text-2xl font-bold text-green-600">{fmt(totalInvoiced)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <FinancialFilterBar
        filters={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder="Café ou fournisseur..."
        supplierOptions={supplierOptions}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Invoice List</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Cafe</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.subOrderId} data-testid={`row-invoice-${r.subOrderId}`}>
                    <TableCell className="font-medium">{invoiceNumber(r.subOrderId)}</TableCell>
                    <TableCell>{r.cafeName}</TableCell>
                    <TableCell>{r.supplierName}</TableCell>
                    <TableCell>{fmt(r.subtotal)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.createdAt ? formatDate(r.createdAt as any) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={PAYMENT_COLLECTION_META[r.paymentCollectionStatus].className}>
                        {PAYMENT_COLLECTION_META[r.paymentCollectionStatus].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm" variant="ghost" className="gap-1 text-muted-foreground"
                        onClick={() => setViewing({ orderId: r.orderId, subOrderId: r.subOrderId })}
                        data-testid={`button-view-invoice-${r.subOrderId}`}
                      >
                        <Eye className="w-3 h-3" /> Voir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">No invoices yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <OrderInvoiceModal
        open={!!viewing}
        onClose={() => setViewing(null)}
        order={viewingOrder}
        subOrderId={viewing?.subOrderId ?? null}
      />
    </div>
  );
}
