import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, DollarSign } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { buildFinancialRows } from "@/lib/financial-rows";
import {
  FinancialFilterBar, applyFinancialFilters, DEFAULT_FINANCIAL_FILTERS,
} from "@/components/financial/financial-filter-bar";
import OrderInvoiceModal from "@/components/financial/order-invoice-modal";
import { InvoiceCard } from "@/components/financial/financial-cards";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { DashboardHero, KpiOverviewButton, KpiOverviewModal } from "@/components/dashboard/dashboard-kit";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();
  const [kpiModalOpen, setKpiModalOpen] = useState(false);

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

  const pagination = usePagination(rows.length);
  useEffect(() => { pagination.resetPage(); }, [filters]);
  const pageRows = rows.slice(pagination.start, pagination.end);

  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Invoices"
        subtitle="View and export order invoices."
        action={isMobile && <KpiOverviewButton onClick={() => setKpiModalOpen(true)} />}
      />

      {!isMobile && (
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
      )}

      <KpiOverviewModal open={isMobile && kpiModalOpen} onClose={() => setKpiModalOpen(false)}>
        <div className="grid grid-cols-1 gap-3">
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
      </KpiOverviewModal>

      <FinancialFilterBar
        filters={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder="Café ou fournisseur..."
        supplierOptions={supplierOptions}
      />

      {/* Mapped invoice cards — sit directly on the page background, same structure
          as Admin → Delivery's mapped cards (no wrapping title/container). */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-2xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No invoices yet</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pageRows.map((r) => (
              <InvoiceCard key={r.subOrderId} row={r} onView={() => setViewing({ orderId: r.orderId, subOrderId: r.subOrderId })} />
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

      <OrderInvoiceModal
        open={!!viewing}
        onClose={() => setViewing(null)}
        order={viewingOrder}
        subOrderId={viewing?.subOrderId ?? null}
      />
    </div>
  );
}
