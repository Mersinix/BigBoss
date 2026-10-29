import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Ban } from "lucide-react";
import type { MaintenanceMarketplaceCard } from "@shared/schema";
import { AgentDetailModal } from "@/pages/cafe/maintenance/maintenance-page";
import { useMaintenancePublishedReports } from "@/hooks/use-maintenance-reports";
import { EntityPublishedReportsModal } from "@/components/shared/entity-published-reports-modal";
import type { PublishedReportRow } from "@/components/published-reports-list";

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
        title="Professionnels signalés"
        subtitle="Signalements publiés par l'équipe Admin concernant des professionnels Maintenance."
        icon={
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-red-900/40" : "bg-red-100"}`}>
            <Ban className={`w-4 h-4 ${isDark ? "text-red-400" : "text-red-600"}`} />
          </div>
        }
        usePublishedReports={useMaintenancePublishedReports}
        mapRow={(r: any) => ({
          id: r.id, professionalId: r.maintenanceUserId, professionalName: r.maintenanceName, professionalImageUrl: r.maintenanceProfileImageUrl,
          rating: r.rating, comment: r.reason, createdAt: r.createdAt, publishedAt: r.resolvedAt,
        })}
        onSelectProfessional={openReported}
        accentClassName={isDark ? "text-amber-400" : "text-orange-500"}
      />

      <AgentDetailModal agent={detailAgent} open={!!detailAgent} onClose={() => setDetailAgent(null)} onContact={contact} isDark={isDark} />
    </>
  );
}
