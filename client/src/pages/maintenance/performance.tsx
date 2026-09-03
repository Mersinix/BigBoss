import { LayoutDashboard, BarChart2, DollarSign } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import { PerformanceEmptyState } from "@/components/account/performance-empty-state";
import MaintenancePlanning from "@/pages/maintenance/planning";

// Performance tab — Dashboard / Analytics / Revenue. Maintenance has no
// separate Analytics/Revenue pages yet: its operational overview lives on
// Planning, so Dashboard points there and Analytics/Revenue show a real empty
// state rather than fabricated numbers.
export default function MaintenancePerformance() {
  return (
    <SubTabSwitcher
      testIdPrefix="maintenance-performance"
      activeTextClass="text-orange-600 dark:text-orange-400"
      tabs={[
        { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, content: <MaintenancePlanning /> },
        {
          key: "analytics", label: "Analytics", icon: BarChart2,
          content: <PerformanceEmptyState message="Les statistiques détaillées ne sont pas encore disponibles pour ce compte." />,
        },
        {
          key: "revenue", label: "Revenue", icon: DollarSign,
          content: <PerformanceEmptyState icon={DollarSign} message="Le suivi des revenus n'est pas encore disponible pour ce compte." />,
        },
      ]}
    />
  );
}
