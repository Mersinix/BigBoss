import { useDeliveryCompanyDrivers, useCreateDriver } from "@/hooks/use-deliveries";
import DriverRosterView from "@/components/delivery/driver-roster-view";

const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";

export default function DeliveryCompanyDriversPage() {
  return (
    <div>
      <DriverRosterView
        title="Chauffeurs"
        subtitle="Gérez les chauffeurs de votre entreprise."
        useDrivers={useDeliveryCompanyDrivers}
        useCreateDriver={useCreateDriver}
        ownerType="DELIVERY_COMPANY"
        cardClassName={CARD_CLASS}
        heroGradientClass="bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent border-teal-500/20"
        heroIconBgClass="bg-teal-500/15"
        heroIconTextClass="text-teal-600 dark:text-teal-400"
      />
    </div>
  );
}
