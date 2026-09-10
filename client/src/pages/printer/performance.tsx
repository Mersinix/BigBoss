import { LayoutDashboard, BarChart2, DollarSign } from "lucide-react";
import { SubTabSwitcher } from "@/components/account/sub-tab-switcher";
import PrinterDashboard from "@/pages/printer/dashboard";
import PrinterAnalytics from "@/pages/printer/analytics";
import PrinterRevenuePage from "@/pages/printer/revenue";

// Performance tab — Dashboard / Analytics / Revenue. Revenue reuses the exact same
// GET /api/print/revenue data already fetched by Dashboard/Analytics (same query key,
// no second data source) — see revenue.tsx.
export default function PrinterPerformance() {
  return (
    <SubTabSwitcher
      testIdPrefix="printer-performance"
      activeTextClass="text-blue-600 dark:text-blue-400"
      tabs={[
        { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, content: <PrinterDashboard /> },
        { key: "analytics", label: "Analyses", icon: BarChart2, content: <PrinterAnalytics /> },
        { key: "revenue", label: "Revenus", icon: DollarSign, content: <PrinterRevenuePage /> },
      ]}
    />
  );
}
