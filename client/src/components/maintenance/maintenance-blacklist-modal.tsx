import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MaintenanceMarketplaceCard } from "@shared/schema";
import { AgentDetailModal } from "@/pages/cafe/maintenance/maintenance-page";
import { useMaintenancePublishedReports } from "@/hooks/use-maintenance-reports";
import { EntityPublishedReportsModal } from "@/components/shared/entity-published-reports-modal";
import { ReportedEntityBadge } from "@/components/shared/reported-entity-badge";
import { mapPublishedReportRow, type PublishedReportRow } from "@/components/published-reports-list";
import { BLACKLIST_SECTIONS, resolveAccentClassName } from "@/components/shared/blacklist-sections";

// Coffee Owner's Maintenance Hero "report modal" (Parts 20-23, redesigned by
// task: "Redesign Maintenance Reports Using the Avis Modal Pattern and Add
// Admin Moderation", pagination/real-time bugs fixed in tasks 52-53) — a
// **public**, read-only feed of reports an Admin has explicitly published
// (GET /api/maintenance/reports/published). The modal chrome, grabber,
// pagination and refetch-on-open logic now live in the shared
// EntityPublishedReportsModal (task: "Add a Grabber to the Maintenance
// Reports Modal and Extend the Reporting System to Barista") — this
// component only supplies Maintenance-specific data/theme and the
// professional-detail click-through, which stays per-service since each
// service has its own detail modal/marketplace card type.
//
// Kept as its own dedicated wrapper, NOT folded into SimpleBlacklistModal
// (task: "Safely Consolidate the Six Blacklist Modal Components into One
// Shared Component", approved architecture §6/§7 of
// BLACKLIST_MODAL_REFACTOR_AUDIT.md) — only Maintenance needs its own
// `/api/maintenance/profiles` fetch to resolve a report row back into a
// full marketplace-card object, plus its own `contact` mutation/onContact
// wiring into AgentDetailModal. Only the icon/title/subtitle/accent/
// row-mapping (identical shape, different field names) are now pulled from
// the shared blacklist-sections config instead of duplicated.
// headerVariant="centered" (task: "Unify the Design of All Six Blacklist
// Modals") matches this modal's header to Shop's, the approved visual
// reference.
const config = BLACKLIST_SECTIONS.MAINTENANCE;

export function MaintenanceBlacklistModal({ open, onClose, isDark }: { open: boolean; onClose: () => void; isDark: boolean }) {
  const { toast } = useToast();
  const { data: providers = [] } = useQuery<MaintenanceMarketplaceCard[]>({ queryKey: ["/api/maintenance/profiles"], enabled: open });
  const [detailAgent, setDetailAgent] = useState<MaintenanceMarketplaceCard | null>(null);

  const contact = async (agent: MaintenanceMarketplaceCard) => {
    try {
      await apiRequest("POST", "/api/messages/conversations", { targetUserId: agent.userId, service: "MAINTENANCE" });
      toast({ title: "Conversation ouverte", description: "Retrouvez-la dans vos Messages." });
    } catch (err) {
      toast({ title: "Contact impossible", description: err instanceof Error ? err.message : "Veuillez réessayer.", variant: "destructive" });
    }
  };

  const openReported = (report: PublishedReportRow) => {
    const provider = providers.find((p) => p.userId === report.professionalId);
    if (provider) setDetailAgent(provider);
  };

  return (
    <>
      <EntityPublishedReportsModal
        open={open}
        onClose={onClose}
        isDark={isDark}
        title={config.title}
        subtitle={config.subtitle}
        icon={<ReportedEntityBadge isDark={isDark} />}
        usePublishedReports={useMaintenancePublishedReports}
        mapRow={(r: any) => mapPublishedReportRow(r, config)}
        onSelectProfessional={openReported}
        accentClassName={resolveAccentClassName(config, isDark)}
        headerVariant="centered"
      />

      <AgentDetailModal agent={detailAgent} open={!!detailAgent} onClose={() => setDetailAgent(null)} onContact={contact} isDark={isDark} />
    </>
  );
}
