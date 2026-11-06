import type { UseQueryResult } from "@tanstack/react-query";
import { EntityPublishedReportsModal, type PublishedReportsPage } from "@/components/shared/entity-published-reports-modal";
import { ReportedEntityBadge } from "@/components/shared/reported-entity-badge";
import { mapPublishedReportRow } from "@/components/published-reports-list";
import { BLACKLIST_SECTIONS, resolveAccentClassName, type BlacklistSectionId } from "@/components/shared/blacklist-sections";

interface Props {
  sectionId: BlacklistSectionId;
  open: boolean;
  onClose: () => void;
  isDark: boolean;
  usePublishedReports: (page: number, limit: number) => UseQueryResult<PublishedReportsPage>;
  headerVariant?: "default" | "centered";
}

// Generic blacklist modal for the three sections with no row click-through
// (Shop, Academy, Print — task: "Safely Consolidate the Six Blacklist Modal
// Components into One Shared Component", approved architecture §6/§7 of
// BLACKLIST_MODAL_REFACTOR_AUDIT.md). Barista, Maintenance and Marketing
// each wire a different detail-modal integration (onRecruit/onContact/
// onRequestQuote) and stay as their own dedicated wrapper components
// instead of being forced through this one.
export function SimpleBlacklistModal({ sectionId, open, onClose, isDark, usePublishedReports, headerVariant }: Props) {
  const config = BLACKLIST_SECTIONS[sectionId];

  return (
    <EntityPublishedReportsModal
      open={open}
      onClose={onClose}
      isDark={isDark}
      title={config.title}
      subtitle={config.subtitle}
      icon={<ReportedEntityBadge isDark={isDark} />}
      usePublishedReports={usePublishedReports}
      mapRow={(r: any) => mapPublishedReportRow(r, config)}
      accentClassName={resolveAccentClassName(config, isDark)}
      headerVariant={headerVariant}
    />
  );
}
