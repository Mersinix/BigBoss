import { LayoutDashboard, BarChart2, DollarSign } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import { PerformanceEmptyState } from "@/components/account/performance-empty-state";
import PrinterDashboard from "@/pages/printer/dashboard";
import PrinterAnalytics from "@/pages/printer/analytics";

// Performance tab — Dashboard / Analytics / Revenue. Printer has no separate
// Revenue page: revenue figures already live on Dashboard/Analytics and
// invoicing lives under Facturation, so Revenue points there rather than
// duplicating that data into a new page.
export default function PrinterPerformance() {
  return (
    <SubTabSwitcher
      testIdPrefix="printer-performance"
      activeTextClass="text-blue-600 dark:text-blue-400"
      tabs={[
        { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, content: <PrinterDashboard /> },
        { key: "analytics", label: "Analytics", icon: BarChart2, content: <PrinterAnalytics /> },
        {
          key: "revenue", label: "Revenue", icon: DollarSign,
          content: <PerformanceEmptyState message="Vos revenus PRINT sont détaillés dans les onglets Dashboard, Analytics et Facturation." />,
        },
      ]}
    />
  );
}
