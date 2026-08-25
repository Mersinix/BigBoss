import { useMemo, useState } from "react";
import { useDeliveries } from "@/hooks/use-deliveries";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt } from "lucide-react";
import { formatDate } from "@/lib/format";
import { SectionCard, EmptyState } from "@/components/dashboard/dashboard-kit";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { resolveDateRange, type DateRangePreset } from "@/lib/marketplace-analytics";

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

      <SectionCard title="Historique" icon={Receipt} contentClassName="overflow-x-auto">
        {rows.length === 0 ? <EmptyState message="Aucun paiement pour cette période." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Commande</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">#{d.orderId}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate((d.deliveredAt ?? d.cancelledAt ?? d.createdAt) as any)}</TableCell>
                  <TableCell className="text-xs">Frais de livraison</TableCell>
                  <TableCell className="text-xs">{d.status === "DELIVERED" ? "Livrée" : "Annulée"}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(d.deliveryFee ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
