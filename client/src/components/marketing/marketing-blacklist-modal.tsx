import { useState } from "react";
import { Ban } from "lucide-react";
import type { MarketingMarketplaceCard } from "@/hooks/use-marketing";
import { MarketingDetailModal } from "@/components/marketing/marketing-detail-modal";
import { useThemeStore } from "@/store/theme-store";
import { useMarketingPublishedReports } from "@/hooks/use-marketing-reports";
import { EntityPublishedReportsModal } from "@/components/shared/entity-published-reports-modal";
import type { PublishedReportRow } from "@/components/published-reports-list";

// Coffee Owner's Marketing Hero "report modal" (task: "Extend the Shared
// Reporting System to Print, Academy, and Marketing") — a **public**,
// read-only feed of reports an Admin has explicitly published
// (GET /api/marketing/reports/published), replacing the previous "my own
// submitted reports" view. No submission UI here; the Marketing detail
// modal's own Signaler is the sole report-submission entry point. Preserves
// the existing click-through to MarketingDetailModal (already wired here
// before this task).
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
        title="Prestataires signalés"
        subtitle="Signalements publiés par l'équipe Admin concernant des prestataires Marketing."
        icon={
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-red-900/40" : "bg-red-100"}`}>
            <Ban className={`w-4 h-4 ${isDark ? "text-red-400" : "text-red-600"}`} />
          </div>
        }
        usePublishedReports={useMarketingPublishedReports}
        mapRow={(r: any) => ({
          id: r.id, professionalId: r.marketingUserId, professionalName: r.marketingName, professionalImageUrl: r.marketingProfileImageUrl,
          rating: r.rating, comment: r.reason, createdAt: r.createdAt, publishedAt: r.resolvedAt,
        })}
        onSelectProfessional={openReported}
        accentClassName={isDark ? "text-purple-400" : "text-purple-600"}
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
