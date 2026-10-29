import { createEntityReportHooks } from "@/hooks/use-entity-reports";

// Academy's own instance of the shared entity-report hooks (task: "Extend
// the Shared Reporting System to Print, Academy, and Marketing").
export const {
  useSubmitReport: useSubmitAcademyReport,
  usePublishedReports: useAcademyPublishedReports,
  useAdminReports: useAdminAcademyReportsRated,
  useModerateReport: useModerateAcademyReport,
} = createEntityReportHooks("academy");
