import { useEffect, useMemo, useState } from "react";
import { useOrders } from "@/hooks/use-orders";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, DollarSign, Lock } from "lucide-react";
import { useSupplierTabSettings } from "@/hooks/use-supplier-tab-settings";
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

// Same underlying data as Payouts (one row per sub-order — see lib/financial-rows.ts),
// presented as invoices issued to each café. No separate invoices table exists; this is
// real order/sub-order data, not mock records.
export default function InvoicesPage() {
  const fmt = useFormatCurrency();
  // Admin → System Management → Supplier → Onglet's "Onglet Factures" toggle (task: "Add
  // Supplier Payments and Invoices Visibility Controls"). Also checked directly through the
  // normal URL, same "clean UX, backend is the real enforcement" principle as the Returns page's
  // own gate — except this page's data (/api/orders) is shared, generic order data with no
  // dedicated endpoint of its own, so there is nothing to additionally gate server-side without
  // over-reaching into the shared Orders feature; hiding this tab never touches that data.
  // Reactive — kept in sync by use-realtime.ts's supplier_tab_settings_updated handler.
  const { settings: supplierTabSettings } = useSupplierTabSettings();
  const { data: orders = [], isLoading } = useOrders();
  const [filters, setFilters] = useState(DEFAULT_FINANCIAL_FILTERS);
  const [viewing, setViewing] = useState<{ orderId: number; subOrderId: number } | null>(null);
  const isMobile = useIsMobile();
  const [kpiModalOpen, setKpiModalOpen] = useState(false);

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

  if (!supplierTabSettings.invoicesTabVisible) {
    return (
      <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
        <DashboardHero title="Factures" subtitle="Gérez et suivez toutes vos factures." />
        <div className="rounded-2xl border border-border/50 p-16 text-center text-muted-foreground">
          <Lock className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Cette fonctionnalité est temporairement indisponible.</p>
          <p className="text-sm mt-1">Contactez votre administrateur pour plus d'informations.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Factures"
        subtitle="Gérez et suivez toutes vos factures."
        action={isMobile && <KpiOverviewButton onClick={() => setKpiModalOpen(true)} />}
      />

      {!isMobile && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-primary/10 rounded-xl p-3"><FileText className="w-5 h-5 text-primary" /></div>
              <div><p className="text-xs text-muted-foreground">Total des factures</p><p className="text-2xl font-bold">{nonCancelled.length}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-green-500/10 rounded-xl p-3"><DollarSign className="w-5 h-5 text-green-600" /></div>
              <div><p className="text-xs text-muted-foreground">Encaissé</p><p className="text-2xl font-bold text-green-600">{fmt(totalCollected)}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-amber-500/10 rounded-xl p-3"><DollarSign className="w-5 h-5 text-amber-600" /></div>
              <div><p className="text-xs text-muted-foreground">En attente</p><p className="text-2xl font-bold text-amber-600">{fmt(totalOutstanding)}</p></div>
            </CardContent>
          </Card>
        </div>
      )}

      <KpiOverviewModal open={isMobile && kpiModalOpen} onClose={() => setKpiModalOpen(false)}>
        <div className="grid grid-cols-1 gap-3">
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-primary/10 rounded-xl p-3"><FileText className="w-5 h-5 text-primary" /></div>
              <div><p className="text-xs text-muted-foreground">Total des factures</p><p className="text-2xl font-bold">{nonCancelled.length}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-green-500/10 rounded-xl p-3"><DollarSign className="w-5 h-5 text-green-600" /></div>
              <div><p className="text-xs text-muted-foreground">Encaissé</p><p className="text-2xl font-bold text-green-600">{fmt(totalCollected)}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-amber-500/10 rounded-xl p-3"><DollarSign className="w-5 h-5 text-amber-600" /></div>
              <div><p className="text-xs text-muted-foreground">En attente</p><p className="text-2xl font-bold text-amber-600">{fmt(totalOutstanding)}</p></div>
            </CardContent>
          </Card>
        </div>
      </KpiOverviewModal>

      <FinancialFilterBar
        filters={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder="Café..."
      />

      {/* Mapped invoice cards — sit directly on the page background, same structure
          as Supplier → Delivery's mapped cards (no wrapping title/container). */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-2xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Aucune facture pour le moment</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pageRows.map((inv) => (
              <InvoiceCard
                key={inv.subOrderId}
                row={inv}
                showSupplier={false}
                onView={() => setViewing({ orderId: inv.orderId, subOrderId: inv.subOrderId })}
                clickable
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

      <OrderInvoiceModal
        open={!!viewing}
        onClose={() => setViewing(null)}
        order={viewingOrder}
        subOrderId={viewing?.subOrderId ?? null}
        isolatedPrint
      />
    </div>
  );
}
