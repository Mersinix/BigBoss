import { LayoutDashboard, BarChart2, DollarSign } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import BaristaMarketplaceDashboard from "@/pages/barista-marketplace/dashboard";
import BaristaAnalyticsPage from "@/pages/barista-marketplace/analytics";
import BaristaMarketplaceRevenuePage from "@/pages/barista-marketplace/revenue";

// Performance tab — Dashboard / Analyses / Revenus. Analyses now has its own
// real, data-backed content (client-computed from the same
// useBaristaRequests()/useBaristaMissions()/useBaristaRevenue()/useBaristaReviews()
// data Demandes/Mes missions/Revenus/Avis already use — see analytics.tsx),
// matching the other service accounts' Performance tabs instead of pointing
// back to the Dashboard tab.
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
