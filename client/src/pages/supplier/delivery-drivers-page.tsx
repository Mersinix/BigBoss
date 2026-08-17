import { useSupplierDrivers, useCreateSupplierDriver } from "@/hooks/use-deliveries";
import DriverRosterView from "@/components/delivery/driver-roster-view";
import SupplierDeliveryTabs from "@/components/delivery/supplier-delivery-tabs";

export default function SupplierDeliveryDriversPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Delivery</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez les chauffeurs de votre propre opération de livraison.</p>
      </div>
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
