import { CalendarClock, Truck, Receipt, Award, UserCheck } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import DriverPlanningPage from "@/pages/driver/planning";
import DriverDeliveriesPage from "@/pages/delivery/driver-deliveries-page";
import DriverPaymentsPage from "@/pages/driver/payments";
import DriverRewardsPage from "@/pages/driver/rewards";
import DriverProfilePage from "@/pages/driver/profile";

// Business tab — Planification / Livraisons / Paiements / Récompenses /
// Profil, each the account's own existing page component moved under one
// switcher (same mechanism as the Barista Marketplace, Maintenance and
// Delivery Company Business tabs, see sub-tab-switcher.tsx). No content
// duplicated or rewritten: same data, statuses, actions and synchronization
// as before — only the main navigation entry point changed.
export default function DriverBusiness() {
  return (
    <SubTabSwitcher
      testIdPrefix="driver-business"
      activeTextClass="text-blue-600 dark:text-blue-400"
      tabs={[
        { key: "planning", label: "Planification", icon: CalendarClock, content: <DriverPlanningPage /> },
        { key: "deliveries", label: "Livraisons", icon: Truck, content: <DriverDeliveriesPage /> },
        { key: "payments", label: "Paiements", icon: Receipt, content: <DriverPaymentsPage /> },
        { key: "rewards", label: "Récompenses", icon: Award, content: <DriverRewardsPage /> },
        { key: "profile", label: "Profil", icon: UserCheck, content: <DriverProfilePage /> },
      ]}
    />
  );
}
