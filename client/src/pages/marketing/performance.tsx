import { LayoutDashboard, BarChart2, DollarSign } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import { PerformanceEmptyState } from "@/components/account/performance-empty-state";
import MarketingDashboard from "@/pages/marketing/dashboard";
import MarketingAnalytics from "@/pages/marketing/analytics";

// Performance tab — Dashboard / Analytics / Revenue (Part 3). Marketing has no
// separate Revenue page: revenue figures (useMarketingRevenue) already live
// inside Analytics, so the Revenue sub-tab points there rather than
// duplicating that data into a new page.
export default function MarketingPerformance() {
  return (
    <SubTabSwitcher
      testIdPrefix="marketing-performance"
      activeTextClass="text-fuchsia-600 dark:text-fuchsia-400"
      tabs={[
        { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, content: <MarketingDashboard /> },
        { key: "analytics", label: "Analytics", icon: BarChart2, content: <MarketingAnalytics /> },
        {
          key: "revenue", label: "Revenue", icon: DollarSign,
          content: <PerformanceEmptyState message="Vos revenus Marketing sont détaillés dans l'onglet Analytics ci-dessus." />,
        },
      ]}
    />
  );
}
