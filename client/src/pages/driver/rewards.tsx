import { useMemo } from "react";
import { useDeliveries } from "@/hooks/use-deliveries";
import { Skeleton } from "@/components/ui/skeleton";
import { Award, CheckCircle2, Lock } from "lucide-react";
import { SectionCard } from "@/components/dashboard/dashboard-kit";
import { cn } from "@/lib/utils";

const MILESTONES = [10, 25, 50, 100, 250, 500];

// "Récompenses" — audited: no rewards/bonus/points engine exists anywhere in the system, so
// no financial bonus is ever displayed here. What IS shown is real: delivery-count milestones
// computed live from this driver's own actual completed (DELIVERED) deliveries — a genuine,
// data-backed form of recognition rather than an invented points/currency system.
export default function DriverRewardsPage() {
  const { data: deliveries = [], isLoading } = useDeliveries();
  const completed = useMemo(() => deliveries.filter((d) => d.status === "DELIVERED").length, [deliveries]);
  const nextMilestone = MILESTONES.find((m) => m > completed);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">Récompenses</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {nextMilestone
            ? `Encore ${nextMilestone - completed} livraison(s) avant le prochain palier.`
            : "Vous avez atteint tous les paliers actuels — bravo !"}
        </p>
      </div>

      <SectionCard title="Paliers de livraisons" icon={Award}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {MILESTONES.map((m) => {
            const achieved = completed >= m;
            return (
              <div
                key={m}
                className={cn(
                  "rounded-2xl border p-4 flex flex-col items-center text-center gap-1.5",
                  achieved ? "border-blue-500/30 bg-blue-500/5" : "border-border/50 bg-muted/30",
                )}
              >
                {achieved ? <CheckCircle2 className="w-6 h-6 text-blue-600" /> : <Lock className="w-6 h-6 text-muted-foreground/50" />}
                <p className={cn("text-lg font-bold", achieved ? "text-blue-600" : "text-muted-foreground")}>{m}</p>
                <p className="text-[11px] text-muted-foreground">livraisons</p>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <p className="text-xs text-muted-foreground">
        {completed} livraison(s) terminée(s) au total. Aucun système de bonus financier n'est actuellement configuré sur la plateforme.
      </p>
    </div>
  );
}
