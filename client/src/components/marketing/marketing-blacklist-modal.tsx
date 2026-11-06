import { useState } from "react";
import type { MarketingMarketplaceCard } from "@/hooks/use-marketing";
import { MarketingDetailModal } from "@/components/marketing/marketing-detail-modal";
import { useThemeStore } from "@/store/theme-store";
import { useMarketingPublishedReports } from "@/hooks/use-marketing-reports";
import { EntityPublishedReportsModal } from "@/components/shared/entity-published-reports-modal";
import { ReportedEntityBadge } from "@/components/shared/reported-entity-badge";
import { mapPublishedReportRow, type PublishedReportRow } from "@/components/published-reports-list";
import { BLACKLIST_SECTIONS, resolveAccentClassName } from "@/components/shared/blacklist-sections";

// Coffee Owner's Marketing Hero "report modal" (task: "Extend the Shared
// Reporting System to Print, Academy, and Marketing") — a **public**,
// read-only feed of reports an Admin has explicitly published
// (GET /api/marketing/reports/published), replacing the previous "my own
// submitted reports" view. No submission UI here; the Marketing detail
// modal's own Signaler is the sole report-submission entry point. Preserves
// the existing click-through to MarketingDetailModal (already wired here
// before this task).
//
// Kept as its own dedicated wrapper, NOT folded into SimpleBlacklistModal
// (task: "Safely Consolidate the Six Blacklist Modal Components into One
// Shared Component", approved architecture §6/§7 of
// BLACKLIST_MODAL_REFACTOR_AUDIT.md) — this one takes a required
// `onRequestQuote` prop its parent page relies on, with no equivalent in
// Barista's or Maintenance's integrations. Only the icon/title/subtitle/
// accent/row-mapping (identical shape, different field names) are now
// pulled from the shared blacklist-sections config instead of duplicated.
// headerVariant="centered" (task: "Unify the Design of All Six Blacklist
// Modals") matches this modal's header to Shop's, the approved visual
// reference.
const config = BLACKLIST_SECTIONS.MARKETING;

export function MarketingBlacklistModal({
  open, onClose, onRequestQuote,
}: {
  open: boolean;
  onClose: () => void;
  onRequestQuote: (provider: MarketingMarketplaceCard) => void;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const [detailProviderId, setDetailProviderId] = useState<number | null>(null);

  const openReported = (report: PublishedReportRow) => {
    if (report.professionalId != null) setDetailProviderId(report.professionalId);
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
        usePublishedReports={useMarketingPublishedReports}
        mapRow={(r: any) => mapPublishedReportRow(r, config)}
        onSelectProfessional={openReported}
        accentClassName={resolveAccentClassName(config, isDark)}
        headerVariant="centered"
      />

      {/* Clicking a reported provider opens the exact same shared Details modal
          used everywhere else — no separate profile implementation. */}
      <MarketingDetailModal
        marketingUserId={detailProviderId}
        open={detailProviderId != null}
        onClose={() => setDetailProviderId(null)}
        onRequestQuote={(p) => { setDetailProviderId(null); onRequestQuote(p); }}
      />
    </>
  );
}
