import { Package, Truck, Users, UserCheck } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import AvailableDeliveriesPage from "@/pages/delivery/available-deliveries-page";
import MyDeliveriesPage from "@/pages/delivery/my-deliveries-page";
import DeliveryCompanyDriversPage from "@/pages/delivery/drivers-page";
import DeliveryVehiclesPage from "@/pages/delivery/vehicles-page";
import DeliveryCompanyProfilePage from "@/pages/delivery/profile";

// Business tab — Livraisons disponibles / Mes livraisons / Chauffeurs /
// Véhicules / Profil, each the account's own existing page component moved
// under one switcher (same mechanism as the Barista Marketplace and
// Maintenance Business tabs, see sub-tab-switcher.tsx). No content duplicated
// or rewritten: same data, statuses, actions and synchronization as before —
// only the main navigation entry point changed.
export default function DeliveryCompanyBusiness() {
  return (
    <SubTabSwitcher
      testIdPrefix="delivery-business"
      activeTextClass="text-teal-600 dark:text-teal-400"
      tabs={[
        { key: "available", label: "Livraisons disponibles", icon: Package, content: <AvailableDeliveriesPage /> },
        { key: "my-deliveries", label: "Mes livraisons", icon: Truck, content: <MyDeliveriesPage /> },
        { key: "drivers", label: "Chauffeurs", icon: Users, content: <DeliveryCompanyDriversPage /> },
        { key: "vehicles", label: "Véhicules", icon: Truck, content: <DeliveryVehiclesPage /> },
        { key: "profile", label: "Profil", icon: UserCheck, content: <DeliveryCompanyProfilePage /> },
      ]}
    />
  );
}
