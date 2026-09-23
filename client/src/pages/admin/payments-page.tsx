import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, CreditCard, TrendingUp } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { buildFinancialRows, type FinancialRow } from "@/lib/financial-rows";
import {
  FinancialFilterBar, applyFinancialFilters, DEFAULT_FINANCIAL_FILTERS,
} from "@/components/financial/financial-filter-bar";
import { PaymentCard } from "@/components/financial/financial-cards";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import PaymentDetailsModal from "@/components/financial/payment-details-modal";
import { DashboardHero, KpiOverviewButton, KpiOverviewModal } from "@/components/dashboard/dashboard-kit";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();
  const [kpiModalOpen, setKpiModalOpen] = useState(false);

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

  const [viewing, setViewing] = useState<FinancialRow | null>(null);
  const viewingOrder = orders.find((o) => o.id === viewing?.orderId) ?? null;

  const pagination = usePagination(rows.length);
  useEffect(() => { pagination.resetPage(); }, [filters]);
  const pageRows = rows.slice(pagination.start, pagination.end);

  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Payments"
        subtitle="Overview of platform payment activity."
        action={isMobile && <KpiOverviewButton onClick={() => setKpiModalOpen(true)} />}
      />

      {!isMobile && (
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
      )}

      <KpiOverviewModal open={isMobile && kpiModalOpen} onClose={() => setKpiModalOpen(false)}>
        <div className="grid grid-cols-1 gap-3">
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
      </KpiOverviewModal>

      <FinancialFilterBar
        filters={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder="Café ou fournisseur..."
        supplierOptions={supplierOptions}
      />

      {/* Mapped payment cards — sit directly on the page background, same structure
          as Admin → Delivery's mapped cards (no wrapping title/container). */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-2xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No payment records</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pageRows.map((r) => (
              <PaymentCard key={r.subOrderId} row={r} onView={() => setViewing(r)} />
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
            itemLabel="paiements"
          />
        </>
      )}

      <PaymentDetailsModal open={!!viewing} onClose={() => setViewing(null)} row={viewing} order={viewingOrder} />
    </div>
  );
}
