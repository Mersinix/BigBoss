import { createEntityReportHooks } from "@/hooks/use-entity-reports";

// Barista's own instance of the shared entity-report hooks (task: "Add a
// Grabber to the Maintenance Reports Modal and Extend the Reporting System
// to Barista") — same one-liner as client/src/hooks/use-maintenance-reports.ts.
export const {
  useSubmitReport: useSubmitBaristaReport,
  usePublishedReports: useBaristaPublishedReports,
  useAdminReports: useAdminBaristaReportsRated,
  useModerateReport: useModerateBaristaReport,
} = createEntityReportHooks("barista");
