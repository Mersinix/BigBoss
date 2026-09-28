import { LayoutDashboard, BarChart2, DollarSign } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import DeliveryDashboard from "@/pages/delivery/dashboard";
import DeliveryAnalyticsPage from "@/pages/delivery/analytics";
import DeliveryRevenuePage from "@/pages/delivery/revenue";

// Performance tab — Dashboard / Analyses / Revenus. Analyses/Revenus now have
// their own real, data-backed content (client-computed from the same
// useDeliveries()/useMyFinancialSummary() data Dashboard already uses — see
// analytics.tsx/revenue.tsx), matching the other 6 service accounts'
// Performance tabs instead of pointing back to Dashboard.
export default function DeliveryPerformance() {
  return (
    <SubTabSwitcher
      testIdPrefix="delivery-performance"
      activeTextClass="text-teal-600 dark:text-teal-400"
      tabs={[
        { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, content: <DeliveryDashboard /> },
        { key: "analytics", label: "Analyses", icon: BarChart2, content: <DeliveryAnalyticsPage /> },
        { key: "revenue", label: "Revenus", icon: DollarSign, content: <DeliveryRevenuePage /> },
      ]}
    />
  );
}
