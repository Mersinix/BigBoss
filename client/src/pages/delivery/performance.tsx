import { LayoutDashboard, BarChart2, DollarSign } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import { PerformanceEmptyState } from "@/components/account/performance-empty-state";
import DeliveryDashboard from "@/pages/delivery/dashboard";

// Performance tab — Dashboard / Analytics / Revenue. Delivery Company has no
// separate Analytics/Revenue pages: KPIs (including "Frais générés") already
// live on Dashboard, so those sub-tabs point there rather than duplicating.
export default function DeliveryPerformance() {
  return (
    <SubTabSwitcher
      testIdPrefix="delivery-performance"
      activeTextClass="text-teal-600 dark:text-teal-400"
      tabs={[
        { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, content: <DeliveryDashboard /> },
        {
          key: "analytics", label: "Analytics", icon: BarChart2,
          content: <PerformanceEmptyState message="Vos statistiques sont affichées sur l'onglet Dashboard ci-dessus." />,
        },
        {
          key: "revenue", label: "Revenue", icon: DollarSign,
          content: <PerformanceEmptyState icon={DollarSign} message="Vos frais générés sont affichés sur l'onglet Dashboard ci-dessus." />,
        },
      ]}
    />
  );
}
