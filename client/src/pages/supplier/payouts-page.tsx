import { useEffect, useMemo, useState } from "react";
import { useOrders } from "@/hooks/use-orders";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, CreditCard, Percent } from "lucide-react";
import { buildFinancialRows, type FinancialRow } from "@/lib/financial-rows";
import {
  FinancialFilterBar, applyFinancialFilters, DEFAULT_FINANCIAL_FILTERS,
} from "@/components/financial/financial-filter-bar";
import { PaymentCard } from "@/components/financial/financial-cards";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import PaymentDetailsModal from "@/components/financial/payment-details-modal";

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

  const [viewing, setViewing] = useState<FinancialRow | null>(null);
  const viewingOrder = orders.find((o) => o.id === viewing?.orderId) ?? null;

  const pagination = usePagination(rows.length);
  useEffect(() => { pagination.resetPage(); }, [filters]);
  const pageRows = rows.slice(pagination.start, pagination.end);

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
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-2xl" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Aucun payout</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pageRows.map((r) => (
                  <PaymentCard key={r.subOrderId} row={r} showSupplier={false} onView={() => setViewing(r)} />
                ))}
              </div>
              <DataPagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                totalItems={rows.length}
                totalPages={pagination.totalPages}
                start={pagination.start}
                end={pagination.end}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
                itemLabel="payouts"
              />
            </>
          )}
        </CardContent>
      </Card>

      <PaymentDetailsModal open={!!viewing} onClose={() => setViewing(null)} row={viewing} order={viewingOrder} />
    </div>
  );
}
