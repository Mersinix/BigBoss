import { useEffect, useMemo, useState } from "react";
import { useOrders } from "@/hooks/use-orders";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, DollarSign } from "lucide-react";
import { buildFinancialRows } from "@/lib/financial-rows";
import {
  FinancialFilterBar, applyFinancialFilters, DEFAULT_FINANCIAL_FILTERS,
} from "@/components/financial/financial-filter-bar";
import OrderInvoiceModal from "@/components/financial/order-invoice-modal";
import { InvoiceCard } from "@/components/financial/financial-cards";
import { DataPagination, usePagination } from "@/components/financial/data-pagination";

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

// Same underlying data as Payouts (one row per sub-order — see lib/financial-rows.ts),
// presented as invoices issued to each café. No separate invoices table exists; this is
// real order/sub-order data, not mock records.
export default function InvoicesPage() {
  const fmt = useFormatCurrency();
  const { data: orders = [], isLoading } = useOrders();
  const [filters, setFilters] = useState(DEFAULT_FINANCIAL_FILTERS);
  const [viewing, setViewing] = useState<{ orderId: number; subOrderId: number } | null>(null);

  const allRows = useMemo(() => buildFinancialRows(orders), [orders]);
  const rows = useMemo(
    () => applyFinancialFilters(allRows, filters, { statusField: "subOrderStatus", amountField: "subtotal" })
      .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()),
    [allRows, filters],
  );

  const nonCancelled = allRows.filter((r) => r.subOrderStatus !== "CANCELLED");
  const totalCollected = nonCancelled.filter((r) => r.paymentCollectionStatus === "COLLECTED").reduce((s, r) => s + r.subtotal, 0);
  const totalOutstanding = nonCancelled.filter((r) => r.paymentCollectionStatus === "PENDING").reduce((s, r) => s + r.subtotal, 0);

  const viewingOrder = orders.find((o) => o.id === viewing?.orderId) ?? null;

  const pagination = usePagination(rows.length);
  useEffect(() => { pagination.resetPage(); }, [filters]);
  const pageRows = rows.slice(pagination.start, pagination.end);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage and track all your invoices.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><FileText className="w-5 h-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total Invoices</p><p className="text-2xl font-bold">{nonCancelled.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><DollarSign className="w-5 h-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">Collected</p><p className="text-2xl font-bold text-green-600">{fmt(totalCollected)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3"><DollarSign className="w-5 h-5 text-amber-600" /></div>
            <div><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-2xl font-bold text-amber-600">{fmt(totalOutstanding)}</p></div>
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
        <CardHeader><CardTitle className="text-base font-semibold">Invoice List</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-2xl" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">No invoices yet</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pageRows.map((inv) => (
                  <InvoiceCard
                    key={inv.subOrderId}
                    row={inv}
                    showSupplier={false}
                    onView={() => setViewing({ orderId: inv.orderId, subOrderId: inv.subOrderId })}
                  />
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
                itemLabel="factures"
              />
            </>
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
