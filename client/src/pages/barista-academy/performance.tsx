import { LayoutDashboard, BarChart2, DollarSign } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import BaristaAcademyDashboard from "@/pages/barista-academy/dashboard";
import BaristaAcademyAnalyticsPage from "@/pages/barista-academy/analytics";
import BaristaAcademyRevenuePage from "@/pages/barista-academy/revenue";

// Performance tab — Dashboard / Analytics / Revenue, each the account's own
// existing page reused as-is under one switcher.
export default function AcademyPerformance() {
  return (
    <SubTabSwitcher
      testIdPrefix="academy-performance"
      activeTextClass="text-indigo-600 dark:text-indigo-400"
      tabs={[
        { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, content: <BaristaAcademyDashboard /> },
        { key: "analytics", label: "Analyses", icon: BarChart2, content: <BaristaAcademyAnalyticsPage /> },
        { key: "revenue", label: "Revenus", icon: DollarSign, content: <BaristaAcademyRevenuePage /> },
      ]}
    />
  );
}
