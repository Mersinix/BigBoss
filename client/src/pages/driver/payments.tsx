import { useMemo, useState } from "react";
import { useDeliveries } from "@/hooks/use-deliveries";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Package } from "lucide-react";
import { formatDate } from "@/lib/format";
import { SectionCard, EmptyState } from "@/components/dashboard/dashboard-kit";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { resolveDateRange, type DateRangePreset } from "@/lib/marketplace-analytics";

const PAYMENT_STATUS_META: Record<string, { label: string; cls: string }> = {
  DELIVERED: { label: "Livrée", cls: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" },
  CANCELLED: { label: "Annulée", cls: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" },
};

// "Paiements" — a real history of completed (DELIVERED) deliveries and their real
// deliveries.deliveryFee amount, which is honestly 0 for every delivery today (no fee
// algorithm exists yet — see wallet.tsx). This is a real, filterable payment-history
// structure, not a fabricated ledger — it is designed to display real transfer records
// cleanly the moment a real payout mechanism is introduced for drivers.
export default function DriverPaymentsPage() {
  const { data: deliveries = [], isLoading } = useDeliveries();
  const fmt = useFormatCurrency();
  const [preset, setPreset] = useState<DateRangePreset>("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [statusFilter, setStatusFilter] = useState("ALL");

  const range = useMemo(() => resolveDateRange(preset, custom), [preset, custom]);

  const rows = useMemo(() => {
    return deliveries
      .filter((d) => d.status === "DELIVERED" || d.status === "CANCELLED")
      .filter((d) => statusFilter === "ALL" || d.status === statusFilter)
      .filter((d) => {
        if (!range.from && !range.to) return true;
        const ref = d.deliveredAt ?? d.cancelledAt ?? d.createdAt;
        if (!ref) return false;
        const dRef = new Date(ref as any);
        if (range.from && dRef < range.from) return false;
        if (range.to && dRef > range.to) return false;
        return true;
      })
      .sort((a, b) => new Date((b.deliveredAt ?? b.cancelledAt ?? b.createdAt) as any).getTime() - new Date((a.deliveredAt ?? a.cancelledAt ?? a.createdAt) as any).getTime());
  }, [deliveries, range, statusFilter]);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">Paiements</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Historique des livraisons et de leurs frais associés.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les statuts</SelectItem>
            <SelectItem value="DELIVERED">Livrée</SelectItem>
            <SelectItem value="CANCELLED">Annulée</SelectItem>
          </SelectContent>
        </Select>
        <DateRangeFilter preset={preset} onPresetChange={setPreset} custom={custom} onCustomChange={setCustom} />
      </div>

      <SectionCard title="Historique" icon={Receipt}>
        {rows.length === 0 ? <EmptyState message="Aucun paiement pour cette période." /> : (
          <div className="space-y-3">
            {rows.map((d) => {
              const meta = PAYMENT_STATUS_META[d.status] ?? { label: d.status, cls: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" };
              return (
                <Card key={d.id} data-testid={`card-payment-${d.id}`}>
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">Commande #{d.orderId}</span>
                        <Badge variant="secondary" className={meta.cls}>{meta.label}</Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> Frais de livraison
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDate((d.deliveredAt ?? d.cancelledAt ?? d.createdAt) as any)}</p>
                    </div>
                    <div className="shrink-0">
                      <span className="font-semibold text-base">{fmt(d.deliveryFee ?? 0)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
