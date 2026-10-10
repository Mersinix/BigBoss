import { useDeliveryCompanyDrivers } from "@/hooks/use-deliveries";
import VehicleFleetView from "@/components/delivery/vehicle-fleet-view";

export default function DeliveryVehiclesPage() {
  return (
    <VehicleFleetView
      ownerType="DELIVERY_COMPANY"
      useDrivers={useDeliveryCompanyDrivers}
      title="Véhicules"
      subtitle="Gérez la flotte de votre entreprise et assignez un véhicule à chaque chauffeur."
      heroGradientClass="bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent border-teal-500/20"
      heroIconBgClass="bg-teal-500/15"
      heroIconTextClass="text-teal-600 dark:text-teal-400"
    />
  );
}
