import { useState } from "react";
import type { BaristaMarketplaceCard } from "@/hooks/use-barista-marketplace";
import { BaristaDetailModal } from "@/components/barista/barista-detail-modal";
import { RecruitDialog } from "@/pages/cafe/barista/barista-page";
import { useThemeStore } from "@/store/theme-store";
import { useBaristaPublishedReports } from "@/hooks/use-barista-reports";
import { EntityPublishedReportsModal } from "@/components/shared/entity-published-reports-modal";
import { ReportedEntityBadge } from "@/components/shared/reported-entity-badge";
import { mapPublishedReportRow, type PublishedReportRow } from "@/components/published-reports-list";
import { BLACKLIST_SECTIONS, resolveAccentClassName } from "@/components/shared/blacklist-sections";

// Coffee Owner's Barista Hero "report modal" (task: "Add a Grabber to the
// Maintenance Reports Modal and Extend the Reporting System to Barista") —
// rebuilt on the exact same pattern as MaintenanceBlacklistModal: a
// **public**, read-only feed of reports an Admin has explicitly published
// (GET /api/barista/reports/published), replacing the previous "my own
// submitted reports" view (GET /api/barista/reports/mine — still a valid
// route, just no longer this modal's data source). No submission UI here;
// the Barista detail modal's own Signaler (BaristaDetailModal -> ReportModal)
// is the sole report-submission entry point.
//
// Kept as its own dedicated wrapper, NOT folded into SimpleBlacklistModal
// (task: "Safely Consolidate the Six Blacklist Modal Components into One
// Shared Component", approved architecture §6/§7 of
// BLACKLIST_MODAL_REFACTOR_AUDIT.md) — this one has its own click-through
// to BaristaDetailModal/RecruitDialog (onRecruit), a different integration
// shape than Maintenance's or Marketing's. Only the icon/title/subtitle/
// accent/row-mapping (identical shape, different field names) are now
// pulled from the shared blacklist-sections config instead of duplicated.
// headerVariant="centered" (task: "Unify the Design of All Six Blacklist
// Modals") matches this modal's header to Shop's, the approved visual
// reference — the click-through row behavior (onSelectProfessional) is
// unaffected, since it's part of the row list, not the header.
const config = BLACKLIST_SECTIONS.BARISTA;

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
        title={config.title}
        subtitle={config.subtitle}
        icon={<ReportedEntityBadge isDark={isDark} />}
        usePublishedReports={useBaristaPublishedReports}
        mapRow={(r: any) => mapPublishedReportRow(r, config)}
        onSelectProfessional={openReported}
        accentClassName={resolveAccentClassName(config, isDark)}
        headerVariant="centered"
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
