import { useDeliveryCompanyDrivers, useCreateDriver } from "@/hooks/use-deliveries";
import DriverRosterView from "@/components/delivery/driver-roster-view";

const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

export default function DeliveryCompanyDriversPage() {
  return (
    <div className="p-6">
      <DriverRosterView
        title="Chauffeurs"
        subtitle="Gérez les chauffeurs de votre entreprise."
        useDrivers={useDeliveryCompanyDrivers}
        useCreateDriver={useCreateDriver}
        ownerType="DELIVERY_COMPANY"
        cardClassName={CARD_CLASS}
      />
    </div>
  );
}
