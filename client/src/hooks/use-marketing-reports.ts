import { createEntityReportHooks } from "@/hooks/use-entity-reports";

// Marketing's own instance of the shared entity-report hooks (task: "Extend
// the Shared Reporting System to Print, Academy, and Marketing").
export const {
  useSubmitReport: useSubmitMarketingReport,
  usePublishedReports: useMarketingPublishedReports,
  useAdminReports: useAdminMarketingReportsRated,
  useModerateReport: useModerateMarketingReport,
} = createEntityReportHooks("marketing");
