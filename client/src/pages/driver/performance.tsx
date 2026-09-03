import { LayoutDashboard, Activity, Wallet } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import DriverAccountPage from "@/pages/driver/account";
import DriverActivityPage from "@/pages/driver/activity";
import DriverWalletPage from "@/pages/driver/wallet";

// Performance tab — Dashboard / Analytics / Revenue, mapped to Driver's own
// existing equivalents: Mon Compte (Dashboard), Informations sur les
// activités (Analytics) and Portefeuille (Revenue) — each reused as-is.
export default function DriverPerformance() {
  return (
    <SubTabSwitcher
      testIdPrefix="driver-performance"
      activeTextClass="text-blue-600 dark:text-blue-400"
      tabs={[
        { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, content: <DriverAccountPage /> },
        { key: "analytics", label: "Analytics", icon: Activity, content: <DriverActivityPage /> },
        { key: "revenue", label: "Revenue", icon: Wallet, content: <DriverWalletPage /> },
      ]}
    />
  );
}
