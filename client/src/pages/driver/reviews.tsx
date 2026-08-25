import { Star } from "lucide-react";
import { SectionCard, EmptyState, StatCard } from "@/components/dashboard/dashboard-kit";

// "Avis" — audited: shared/schema.ts only has supplierProductReviews (product reviews left
// by Coffee Owners for a Supplier's products). There is no Driver/delivery review or rating
// table anywhere in the system. Rather than inventing reviews or a fake average rating, this
// page shows the honest current state (no data yet) with the structure ready for when a real
// Driver review mechanism is introduced.
export default function DriverReviewsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">Avis</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Votre réputation auprès des cafés et fournisseurs.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Note moyenne" value="—" icon={Star} tone="blue" subtext="Aucun avis" />
        <StatCard label="Nombre d'avis" value={0} icon={Star} tone="primary" />
      </div>

      <SectionCard title="Avis récents" icon={Star}>
        <EmptyState icon={Star} message="Aucun système d'avis pour les chauffeurs n'est encore disponible sur la plateforme." />
      </SectionCard>
    </div>
  );
}
