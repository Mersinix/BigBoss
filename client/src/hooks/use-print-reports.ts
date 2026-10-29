import { createEntityReportHooks } from "@/hooks/use-entity-reports";

// Print's own instance of the shared entity-report hooks (task: "Extend the
// Shared Reporting System to Print, Academy, and Marketing") — same
// one-liner as use-maintenance-reports.ts/use-barista-reports.ts.
export const {
  useSubmitReport: useSubmitPrintReport,
  usePublishedReports: usePrintPublishedReports,
  useAdminReports: useAdminPrintReportsRated,
  useModerateReport: useModeratePrintReport,
} = createEntityReportHooks("print");
