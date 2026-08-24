import { useMemo, useState } from "react";
import { useOrders } from "@/hooks/use-orders";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, CreditCard, Percent } from "lucide-react";
import { formatDate } from "@/lib/format";
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

// Payout data is derived live from the same orders/sub-orders the rest of the app uses —
// no separate payouts table exists (see lib/financial-rows.ts). Real-time updates come for
// free: use-realtime.ts already invalidates ["/api/orders"] on every order/sub-order/
// delivery status change, and useOrders() reads that same query.
export default function PayoutsPage() {
  const fmt = useFormatCurrency();
  const { data: orders = [], isLoading } = useOrders();
  const [filters, setFilters] = useState(DEFAULT_FINANCIAL_FILTERS);

  const allRows = useMemo(() => buildFinancialRows(orders), [orders]);
  const rows = useMemo(
    () => applyFinancialFilters(allRows, filters, { statusField: "payoutStatus", amountField: "netAmount" })
      .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()),
    [allRows, filters],
  );

  const totalDue = allRows.filter((r) => r.payoutStatus === "DUE").reduce((s, r) => s + r.netAmount, 0);
  const totalUpcoming = allRows.filter((r) => r.payoutStatus === "UPCOMING").reduce((s, r) => s + r.netAmount, 0);
  const totalCommission = allRows.filter((r) => r.payoutStatus !== "CANCELLED").reduce((s, r) => s + r.commission, 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Payouts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track your earnings and payout history.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><DollarSign className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">À verser (livrées)</p><p className="text-2xl font-bold text-green-600">{fmt(totalDue)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3"><CreditCard className="w-5 h-5 text-amber-600" /></div>
            <div><p className="text-xs text-muted-foreground">À venir (en cours)</p><p className="text-2xl font-bold text-amber-600">{fmt(totalUpcoming)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><Percent className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Commission plateforme (5%)</p><p className="text-2xl font-bold">{fmt(totalCommission)}</p></div>
          </CardContent>
        </Card>
      </div>

      <FinancialFilterBar
        filters={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder="Café..."
      />

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Payout History</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Commande</TableHead>
                  <TableHead>Café</TableHead>
                  <TableHead>Brut</TableHead>
                  <TableHead>Commission (5%)</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Paiement</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.subOrderId} data-testid={`row-payout-${r.subOrderId}`}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{payoutReference(r.subOrderId)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">#{String(r.orderId).padStart(6, "0")}</TableCell>
                    <TableCell className="font-medium">{r.cafeName}</TableCell>
                    <TableCell>{fmt(r.subtotal)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmt(r.commission)}</TableCell>
                    <TableCell className="font-semibold text-green-600">{fmt(r.netAmount)}</TableCell>
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
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-10">Aucun payout</TableCell>
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
