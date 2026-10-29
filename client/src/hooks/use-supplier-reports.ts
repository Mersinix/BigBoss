import { createEntityReportHooks } from "@/hooks/use-entity-reports";

// Supplier's own instance of the shared entity-report hooks (task: "Extend
// the Shared Reporting System to Supplier Stores") — same one-liner as
// use-maintenance-reports.ts/use-barista-reports.ts/etc. Targets the
// supplier ACCOUNT (one store per supplier, see shared/schema.ts
// supplierReports), reached today via Coffee Owner -> Shop -> Store page.
export const {
  useSubmitReport: useSubmitSupplierReport,
  usePublishedReports: useSupplierPublishedReports,
  useAdminReports: useAdminSupplierReportsRated,
  useModerateReport: useModerateSupplierReport,
} = createEntityReportHooks("supplier");
