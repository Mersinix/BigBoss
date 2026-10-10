import { useSupplierDrivers } from "@/hooks/use-deliveries";
import VehicleFleetView from "@/components/delivery/vehicle-fleet-view";
import SupplierDeliveryTabs from "@/components/delivery/supplier-delivery-tabs";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

export default function SupplierVehiclesPage() {
  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Delivery"
        subtitle="Gérez les véhicules de votre propre opération de livraison."
      />
      <SupplierDeliveryTabs />
      <VehicleFleetView
        title="Véhicules"
        subtitle="Véhicules que vous gérez directement, indépendamment des entreprises de livraison."
        ownerType="SUPPLIER"
        useDrivers={useSupplierDrivers}
      />
    </div>
  );
}
