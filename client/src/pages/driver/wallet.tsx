import { useMemo } from "react";
import { useDeliveries } from "@/hooks/use-deliveries";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, TrendingUp, Clock, CheckCircle2, Info } from "lucide-react";
import { DashboardHero, StatCard, SectionCard } from "@/components/dashboard/dashboard-kit";

function isSameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }
function isSameWeek(a: Date, b: Date) {
  const start = new Date(b); start.setDate(b.getDate() - b.getDay()); start.setHours(0, 0, 0, 0);
  return a >= start;
}
function isSameMonth(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }

// "Portefeuille" — every figure here is the real deliveries.deliveryFee column (see
// shared/schema.ts), summed over this driver's own completed deliveries (GET /api/deliveries
// is already scoped server-side). IMPORTANT, verified during the audit: no delivery-fee
// calculation algorithm exists yet anywhere in the system — orders.deliveryFee (which
// deliveries.deliveryFee snapshots at creation) is always 0 today. This page therefore
// honestly shows real (currently zero) figures rather than fabricating a commission model —
// it will start reflecting real amounts automatically once that pricing logic is built,
// with no changes needed here.
export default function DriverWalletPage() {
  const { data: deliveries = [], isLoading } = useDeliveries();
  const fmt = useFormatCurrency();

  const stats = useMemo(() => {
    const completed = deliveries.filter((d) => d.status === "DELIVERED" && d.deliveredAt);
    const now = new Date();
    const sum = (rows: typeof completed) => rows.reduce((s, d) => s + (d.deliveryFee ?? 0), 0);
    return {
      total: sum(completed),
      today: sum(completed.filter((d) => isSameDay(new Date(d.deliveredAt as any), now))),
      week: sum(completed.filter((d) => isSameWeek(new Date(d.deliveredAt as any), now))),
      month: sum(completed.filter((d) => isSameMonth(new Date(d.deliveredAt as any), now))),
      paidDeliveries: completed.length,
    };
  }, [deliveries]);

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-32 w-full rounded-2xl" /><div className="grid grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div></div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero title="Portefeuille" subtitle="Vos gains liés aux livraisons." stat={fmt(stats.total)} statLabel="Solde cumulé" icon={Wallet} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Aujourd'hui" value={fmt(stats.today)} icon={Clock} tone="amber" />
        <StatCard label="Cette semaine" value={fmt(stats.week)} icon={TrendingUp} tone="blue" />
        <StatCard label="Ce mois" value={fmt(stats.month)} icon={TrendingUp} tone="green" />
      </div>

      <SectionCard title="Livraisons rémunérées" icon={CheckCircle2}>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-muted-foreground">Livraisons terminées</span>
          <span className="text-sm font-semibold">{stats.paidDeliveries}</span>
        </div>
      </SectionCard>

      <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/30 px-4 py-3">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 dark:text-blue-300">
          Le calcul des frais de livraison par course n'est pas encore configuré dans le système — les montants ci-dessus reflètent les frais réellement enregistrés pour chaque livraison.
        </p>
      </div>
    </div>
  );
}
