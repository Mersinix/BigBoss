import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, CreditCard, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { OrderWithDetails } from "@shared/schema";
import {
  buildFinancialRows, PAYOUT_STATUS_META, PAYMENT_COLLECTION_META, payoutReference,
} from "@/lib/financial-rows";
import {
  FinancialFilterBar, applyFinancialFilters, DEFAULT_FINANCIAL_FILTERS,
} from "@/components/financial/financial-filter-bar";

const STATUS_OPTIONS = [
  { value: "ALL", label: "Tous les statuts" },
  { value: "DUE", label: "À verser" },
  { value: "UPCOMING", label: "À venir" },
  { value: "CANCELLED", label: "Annulé" },
];

// Admin's payout/settlement view across every supplier — built from the same real
// orders/sub-orders as the Supplier Payouts page (see lib/financial-rows.ts), never a
// separate mock/demo dataset. One row per supplier sub-order so a multi-supplier order's
// financials are never collapsed into a single (wrong) supplier/amount — the previous
// version used order.totalAmount / order.supplier, which is null for multi-supplier orders.
export default function PaymentsPage() {
  const fmt = useFormatCurrency();
  const { data: orders = [], isLoading } = useQuery<OrderWithDetails[]>({ queryKey: ["/api/orders"] });
  const [filters, setFilters] = useState(DEFAULT_FINANCIAL_FILTERS);

  const allRows = useMemo(() => buildFinancialRows(orders), [orders]);
  const supplierOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of allRows) map.set(r.supplierId, r.supplierName);
    return Array.from(map.entries()).map(([value, label]) => ({ value: String(value), label }));
  }, [allRows]);
  const rows = useMemo(
    () => applyFinancialFilters(allRows, filters, { statusField: "payoutStatus", amountField: "netAmount" })
      .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()),
    [allRows, filters],
  );

  const totalRevenue = allRows.filter((r) => r.payoutStatus === "DUE").reduce((s, r) => s + r.subtotal, 0);
  const pendingAmount = allRows.filter((r) => r.payoutStatus === "UPCOMING").reduce((s, r) => s + r.subtotal, 0);
  const commission = allRows.filter((r) => r.payoutStatus !== "CANCELLED").reduce((s, r) => s + r.commission, 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Payments</h1>
        <p className="text-muted-foreground text-sm mt-1">Overview of platform payment activity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Revenue (livrées)</p>
              <p className="text-2xl font-bold text-green-600">{fmt(totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3">
              <CreditCard className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Pending Payments</p>
              <p className="text-2xl font-bold text-amber-600">{fmt(pendingAmount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-blue-500/10 rounded-xl p-3">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Platform Commission (5%)</p>
              <p className="text-2xl font-bold text-blue-600">{fmt(commission)}</p>
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
          <CardTitle className="text-base font-semibold">Payment Transactions</CardTitle>
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
                  <TableHead>ID</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Cafe</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Commission (5%)</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Paiement</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.subOrderId} data-testid={`row-payment-${r.subOrderId}`}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{payoutReference(r.subOrderId)}</TableCell>
                    <TableCell className="font-medium">#{String(r.orderId).padStart(6, "0")}</TableCell>
                    <TableCell>{r.cafeName}</TableCell>
                    <TableCell>{r.supplierName}</TableCell>
                    <TableCell>{fmt(r.subtotal)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmt(r.commission)}</TableCell>
                    <TableCell className="font-semibold">{fmt(r.netAmount)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{r.createdAt ? formatDate(r.createdAt as any) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={PAYMENT_COLLECTION_META[r.paymentCollectionStatus].className}>
                        {PAYMENT_COLLECTION_META[r.paymentCollectionStatus].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={PAYOUT_STATUS_META[r.payoutStatus].className}>
                        {PAYOUT_STATUS_META[r.payoutStatus].label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-10">No payment records</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
