import { LayoutDashboard, BarChart2, DollarSign } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import { PerformanceEmptyState } from "@/components/account/performance-empty-state";
import MaintenanceDashboardOverview from "@/pages/maintenance/dashboard-overview";

// Performance tab — Dashboard / Analytics / Revenue. Dashboard is now a real,
// dedicated overview (reservation KPIs, next intervention, recent activity —
// all from the same live endpoints Planning/Profil already use), separate
// from Planning (which stays its own unchanged tab, never reused as a stand-in
// dashboard). Maintenance has no separate Analytics/Revenue data source yet,
// so those sub-tabs show a real empty state rather than fabricated numbers.
export default function MaintenancePerformance() {
  return (
    <SubTabSwitcher
      testIdPrefix="maintenance-performance"
      activeTextClass="text-orange-600 dark:text-orange-400"
      tabs={[
        { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, content: <MaintenanceDashboardOverview /> },
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
