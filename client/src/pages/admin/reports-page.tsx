import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { AdminCommunicationSwitcher } from "@/components/admin/admin-communication-switcher";
import { ServiceCategorySwitcher, REPORT_SERVICE_TABS, type ServiceCategoryKey } from "@/components/admin/service-category-switcher";
import { ReportModerationPanel } from "@/components/admin/report-moderation-panel";

// Which of the services shown in REPORT_SERVICE_TABS already have the
// entity-report system (rating + Submitted -> Pending -> Published/
// Rejected, see shared/schema.ts maintenanceReports) wired up, and the
// field on each service's admin report row holding the reported entity's
// display name. Product/Pack are never reportable (removed from the
// Signalements switcher entirely, task: "Extend the Shared Reporting
// System to Supplier Stores" — still reportable as reviews, unaffected).
// Delivery ("DRIVER") stays in the switcher but has no entry here — a
// Coffee-Owner-facing Driver entity-report system was never built, so it
// intentionally shows the same safe "not supported" empty state it always
// has; preserving that (not implementing it) is this task's own scope.
const REPORT_SERVICE_SLUG: Partial<Record<ServiceCategoryKey, { service: string; entityNameKey: string }>> = {
  // Supplier (task: "Extend the Shared Reporting System to Supplier
  // Stores") — targets the supplier account reached via Shop Store pages.
  SUPPLIER: { service: "supplier", entityNameKey: "supplierName" },
  MAINTENANCE: { service: "maintenance", entityNameKey: "maintenanceName" },
  // Barista (task: "Add a Grabber to the Maintenance Reports Modal and
  // Extend the Reporting System to Barista") — second service migrated to
  // the rated entity-report lifecycle.
  BARISTA_MARKETPLACE: { service: "barista", entityNameKey: "baristaName" },
  // Print/Academy/Marketing (task: "Extend the Shared Reporting System to
  // Print, Academy, and Marketing") — third/fourth/fifth services migrated.
  PRINT: { service: "print", entityNameKey: "printerName" },
  ACADEMY: { service: "academy", entityNameKey: "academyName" },
  MARKETING: { service: "marketing", entityNameKey: "marketingName" },
};

export default function AdminReportsPage() {
  const [activeTab, setActiveTab] = useState<ServiceCategoryKey>("SUPPLIER");
  const config = REPORT_SERVICE_SLUG[activeTab];

  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Signalements"
        subtitle="Centralisez la modération des signalements envoyés par les Coffee Owners, tous services confondus."
      />

      <AdminCommunicationSwitcher />

      <ServiceCategorySwitcher active={activeTab} onChange={setActiveTab} testIdPrefix="admin-reports" tabs={REPORT_SERVICE_TABS} />

      {config ? (
        <ReportModerationPanel service={config.service} entityNameKey={config.entityNameKey} />
      ) : (
        <div className="rounded-2xl border border-border/50 p-16 text-center text-muted-foreground" data-testid="empty-reports-unsupported-service">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Signalements non disponibles pour ce service</p>
          <p className="text-sm mt-1">Ce service ne prend pas encore en charge les signalements avec notation.</p>
        </div>
      )}
    </div>
  );
}
