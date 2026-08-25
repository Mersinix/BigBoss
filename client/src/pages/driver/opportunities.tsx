import { Briefcase } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/dashboard/dashboard-kit";

// "Opportunités" — audited: this application has no mechanism for a Driver to browse/claim
// additional delivery work themselves. Deliveries are always assigned TO a driver by their
// operator (a Delivery Company via the accept/assign queue, or a Supplier directly — see
// storage.assignDriver) — a driver never self-selects. There is therefore no real
// "opportunities" data to show yet. This page is the professional structure/placeholder for
// when such a mechanism is introduced, without presenting anything fake as real.
export default function DriverOpportunitiesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-display font-bold text-foreground">Opportunités</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Missions et opportunités de livraison supplémentaires.</p>
      </div>
      <SectionCard title="Opportunités disponibles" icon={Briefcase}>
        <EmptyState
          icon={Briefcase}
          message="Aucune opportunité disponible pour le moment. Les livraisons vous sont assignées directement par votre entreprise de livraison ou votre fournisseur."
        />
      </SectionCard>
    </div>
  );
}
