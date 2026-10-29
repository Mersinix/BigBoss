import { Ban } from "lucide-react";
import { usePrintPublishedReports } from "@/hooks/use-print-reports";
import { EntityPublishedReportsModal } from "@/components/shared/entity-published-reports-modal";

// Coffee Owner's Print Hero "report modal" (task: "Extend the Shared
// Reporting System to Print, Academy, and Marketing") — a **public**,
// read-only feed of reports an Admin has explicitly published
// (GET /api/print/reports/published), replacing the previous "my own
// submitted reports" view that also embedded its own report-submission
// form (Select "Choisir un imprimeur" + Textarea + Signaler toggle) — all
// removed, since /print now has a proper submission entry point in the
// Print company detail modal (PrintCompanyDetailModal -> ReportModal),
// matching every other service. No click-through to the company detail
// modal here (none existed before this task either — /print's own hero
// flow always browsed printers via print-detail-page.tsx, not a shared
// per-row detail modal), kept exactly as-is to avoid widening scope.
export function PrintBlacklistModal({ open, onClose, isDark }: { open: boolean; onClose: () => void; isDark: boolean }) {
  return (
    <EntityPublishedReportsModal
      open={open}
      onClose={onClose}
      isDark={isDark}
      title="Imprimeurs signalés"
      subtitle="Signalements publiés par l'équipe Admin concernant des imprimeurs."
      icon={
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-red-900/40" : "bg-red-100"}`}>
          <Ban className={`w-4 h-4 ${isDark ? "text-red-400" : "text-red-600"}`} />
        </div>
      }
      usePublishedReports={usePrintPublishedReports}
      mapRow={(r: any) => ({
        id: r.id, professionalId: r.printerId, professionalName: r.printerName, professionalImageUrl: r.printerProfileImageUrl,
        rating: r.rating, comment: r.reason, createdAt: r.createdAt, publishedAt: r.resolvedAt,
      })}
      accentClassName={isDark ? "text-blue-400" : "text-blue-600"}
    />
  );
}
