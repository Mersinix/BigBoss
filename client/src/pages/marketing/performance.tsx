import { LayoutDashboard, BarChart2, DollarSign } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import MarketingDashboard from "@/pages/marketing/dashboard";
import MarketingAnalytics from "@/pages/marketing/analytics";
import MarketingRevenuePage from "@/pages/marketing/revenue";

// Performance tab — Dashboard / Analytics / Revenue. Revenue reuses the exact same
// useMarketingRevenue() data already fetched by Dashboard/Analytics (same query key,
// no second data source) — see revenue.tsx.
export default function MarketingPerformance() {
  return (
    <SubTabSwitcher
      testIdPrefix="marketing-performance"
      activeTextClass="text-fuchsia-600 dark:text-fuchsia-400"
      tabs={[
        { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, content: <MarketingDashboard /> },
        { key: "analytics", label: "Analyses", icon: BarChart2, content: <MarketingAnalytics /> },
        { key: "revenue", label: "Revenus", icon: DollarSign, content: <MarketingRevenuePage /> },
      ]}
    />
  );
}
