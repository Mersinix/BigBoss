import { LayoutDashboard, BarChart2, DollarSign } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import { PerformanceEmptyState } from "@/components/account/performance-empty-state";
import BaristaMarketplaceDashboard from "@/pages/barista-marketplace/dashboard";
import BaristaMarketplaceRevenuePage from "@/pages/barista-marketplace/revenue";

// Performance tab — Dashboard / Analytics / Revenue. Barista Marketplace has
// no separate Analytics page: its breakdowns already live on the Dashboard
// tab, so Analytics points there rather than duplicating that data.
export default function BaristaMarketplacePerformance() {
  return (
    <SubTabSwitcher
      testIdPrefix="barista-performance"
      activeTextClass="text-green-600 dark:text-green-400"
      tabs={[
        { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, content: <BaristaMarketplaceDashboard /> },
        {
          key: "analytics", label: "Analytics", icon: BarChart2,
          content: <PerformanceEmptyState message="Vos statistiques détaillées sont affichées sur l'onglet Dashboard ci-dessus." />,
        },
        { key: "revenue", label: "Revenue", icon: DollarSign, content: <BaristaMarketplaceRevenuePage /> },
      ]}
    />
  );
}
