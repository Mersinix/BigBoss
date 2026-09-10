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

const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

// "Portefeuille" — every figure here is the real deliveries.deliveryFee column (see
// shared/schema.ts), summed over this driver's own completed deliveries (GET /api/deliveries
// is already scoped server-side). deliveryFee is computed by the real, centrally-configured
// delivery pricing engine (storage.computeDeliveryFee / deliveryPricingSettings) — provisional
// at creation, finalized once a driver+vehicle is assigned — so these are genuine recorded
// amounts, not a placeholder. Today/Cette semaine/Ce mois filter that same real figure by
// deliveredAt, so a balance with nothing "today" simply means no delivery was completed today.
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
        <StatCard label="Aujourd'hui" value={fmt(stats.today)} icon={Clock} tone="amber" className={CARD_CLASS} />
        <StatCard label="Cette semaine" value={fmt(stats.week)} icon={TrendingUp} tone="blue" className={CARD_CLASS} />
        <StatCard label="Ce mois" value={fmt(stats.month)} icon={TrendingUp} tone="green" className={CARD_CLASS} />
      </div>

      <SectionCard title="Livraisons rémunérées" icon={CheckCircle2} className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-muted-foreground">Livraisons terminées</span>
          <span className="text-sm font-semibold">{stats.paidDeliveries}</span>
        </div>
      </SectionCard>

      <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/30 px-4 py-3">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 dark:text-blue-300">
          Les frais de chaque livraison sont calculés automatiquement selon la grille tarifaire de la plateforme et finalisés dès qu'un chauffeur y est assigné — les montants ci-dessus reflètent ces frais réellement enregistrés.
        </p>
      </div>
    </div>
  );
}
