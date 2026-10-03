import { LayoutDashboard, BarChart2, DollarSign } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import BaristaMarketplaceDashboard from "@/pages/barista-marketplace/dashboard";
import BaristaAnalyticsPage from "@/pages/barista-marketplace/analytics";
import BaristaMarketplaceRevenuePage from "@/pages/barista-marketplace/revenue";

// Performance tab — Dashboard / Analyses / Revenus. Dashboard and Analyses are
// built from useMyBaristaJobApplications()/useBaristaReviews() (the current
// job-posting system's own data, covering both Offer and Mission
// applications); Revenus is unchanged (real ledger over completed legacy
// missions — see revenue.tsx's own note). See
// barista_performance_flash_audit.md for the mission-workflow-cleanup
// rationale behind this split.
export default function BaristaMarketplacePerformance() {
  return (
    <SubTabSwitcher
      testIdPrefix="barista-performance"
      activeTextClass="text-green-600 dark:text-green-400"
      tabs={[
        { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, content: <BaristaMarketplaceDashboard /> },
        { key: "analytics", label: "Analyses", icon: BarChart2, content: <BaristaAnalyticsPage /> },
        { key: "revenue", label: "Revenus", icon: DollarSign, content: <BaristaMarketplaceRevenuePage /> },
      ]}
    />
  );
}
