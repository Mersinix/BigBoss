import { useState } from "react";
import { Ban } from "lucide-react";
import type { BaristaMarketplaceCard } from "@/hooks/use-barista-marketplace";
import { BaristaDetailModal } from "@/components/barista/barista-detail-modal";
import { RecruitDialog } from "@/pages/cafe/barista/barista-page";
import { useThemeStore } from "@/store/theme-store";
import { useBaristaPublishedReports } from "@/hooks/use-barista-reports";
import { EntityPublishedReportsModal } from "@/components/shared/entity-published-reports-modal";
import type { PublishedReportRow } from "@/components/published-reports-list";

// Coffee Owner's Barista Hero "report modal" (task: "Add a Grabber to the
// Maintenance Reports Modal and Extend the Reporting System to Barista") —
// rebuilt on the exact same pattern as MaintenanceBlacklistModal: a
// **public**, read-only feed of reports an Admin has explicitly published
// (GET /api/barista/reports/published), replacing the previous "my own
// submitted reports" view (GET /api/barista/reports/mine — still a valid
// route, just no longer this modal's data source). No submission UI here;
// the Barista detail modal's own Signaler (BaristaDetailModal -> ReportModal)
// is the sole report-submission entry point.
export function BaristaBlacklistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const isDark = useThemeStore((s) => s.isDark);
  const [detailBaristaId, setDetailBaristaId] = useState<number | null>(null);
  const [recruitTarget, setRecruitTarget] = useState<BaristaMarketplaceCard | null>(null);

  const openReported = (report: PublishedReportRow) => {
    if (report.professionalId != null) setDetailBaristaId(report.professionalId);
  };

  return (
    <>
      <EntityPublishedReportsModal
        open={open}
        onClose={onClose}
        isDark={isDark}
        title="Baristas signalés"
        subtitle="Signalements publiés par l'équipe Admin concernant des baristas."
        icon={
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-red-900/40" : "bg-red-100"}`}>
            <Ban className={`w-4 h-4 ${isDark ? "text-red-400" : "text-red-600"}`} />
          </div>
        }
        usePublishedReports={useBaristaPublishedReports}
        mapRow={(r: any) => ({
          id: r.id, professionalId: r.baristaUserId, professionalName: r.baristaName, professionalImageUrl: r.baristaProfileImageUrl,
          rating: r.rating, comment: r.reason, createdAt: r.createdAt, publishedAt: r.resolvedAt,
        })}
        onSelectProfessional={openReported}
        accentClassName={isDark ? "text-emerald-400" : "text-green-600"}
      />

      {/* Clicking a reported Barista opens the exact same shared Details modal
          used everywhere else — no separate profile implementation. */}
      <BaristaDetailModal
        baristaUserId={detailBaristaId}
        open={detailBaristaId != null}
        onClose={() => setDetailBaristaId(null)}
        onRecruit={(b) => { setDetailBaristaId(null); setRecruitTarget(b); }}
      />
      <RecruitDialog
        barista={recruitTarget}
        open={!!recruitTarget}
        onClose={() => setRecruitTarget(null)}
        isDark={isDark}
      />
    </>
  );
}
