import { useSupplierDrivers, useCreateSupplierDriver } from "@/hooks/use-deliveries";
import DriverRosterView from "@/components/delivery/driver-roster-view";
import SupplierDeliveryTabs from "@/components/delivery/supplier-delivery-tabs";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

export default function SupplierDeliveryDriversPage() {
  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Delivery"
        subtitle="Gérez les chauffeurs de votre propre opération de livraison."
      />
      <SupplierDeliveryTabs />
      <DriverRosterView
        title="Chauffeurs"
        subtitle="Chauffeurs que vous gérez directement, indépendamment des entreprises de livraison."
        useDrivers={useSupplierDrivers}
        useCreateDriver={useCreateSupplierDriver}
      />
    </div>
  );
}
