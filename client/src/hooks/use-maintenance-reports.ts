import { createEntityReportHooks } from "@/hooks/use-entity-reports";

// Maintenance's own instance of the shared entity-report hooks (task:
// "Redesign Maintenance Reports Using the Avis Modal Pattern and Add Admin
// Moderation") — thin, so other modules can follow this exact one-liner when
// they get the same redesign.
export const {
  useSubmitReport: useSubmitMaintenanceReport,
  usePublishedReports: useMaintenancePublishedReports,
  useAdminReports: useAdminMaintenanceReports,
  useModerateReport: useModerateMaintenanceReport,
} = createEntityReportHooks("maintenance");
