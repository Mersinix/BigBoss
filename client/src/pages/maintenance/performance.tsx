import { LayoutDashboard, BarChart2, DollarSign } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import MaintenanceDashboardOverview from "@/pages/maintenance/dashboard-overview";
import MaintenanceAnalyticsPage from "@/pages/maintenance/analytics";
import MaintenanceRevenuePage from "@/pages/maintenance/revenue";

// Performance tab — Dashboard / Analytics / Revenue. All 3 are now real,
// dedicated pages built from the same live endpoints Planning/Profil/Avis
// already use (GET /api/maintenance/reservations, /api/maintenance/reviews/:userId,
// /api/maintenance/revenue) — no mock data. Planning stays its own
// unchanged tab, never reused as a stand-in dashboard.
export default function MaintenancePerformance() {
  return (
    <SubTabSwitcher
      testIdPrefix="maintenance-performance"
      activeTextClass="text-orange-600 dark:text-orange-400"
      tabs={[
        { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, content: <MaintenanceDashboardOverview /> },
        { key: "analytics", label: "Analyses", icon: BarChart2, content: <MaintenanceAnalyticsPage /> },
        { key: "revenue", label: "Revenus", icon: DollarSign, content: <MaintenanceRevenuePage /> },
      ]}
    />
  );
}
