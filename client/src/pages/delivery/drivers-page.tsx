import { useDeliveryCompanyDrivers, useCreateDriver } from "@/hooks/use-deliveries";
import DriverRosterView from "@/components/delivery/driver-roster-view";

export default function DeliveryCompanyDriversPage() {
  return (
    <div className="p-6">
      <DriverRosterView
        title="Chauffeurs"
        subtitle="Gérez les chauffeurs de votre entreprise."
        useDrivers={useDeliveryCompanyDrivers}
        useCreateDriver={useCreateDriver}
      />
    </div>
  );
}
