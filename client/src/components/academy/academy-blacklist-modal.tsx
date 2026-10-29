import { Ban } from "lucide-react";
import { useThemeStore } from "@/store/theme-store";
import { useAcademyPublishedReports } from "@/hooks/use-academy-reports";
import { EntityPublishedReportsModal } from "@/components/shared/entity-published-reports-modal";

// Coffee Owner's Academy Hero "report modal" (task: "Extend the Shared
// Reporting System to Print, Academy, and Marketing") — a **public**,
// read-only feed of reports an Admin has explicitly published
// (GET /api/academy/reports/published), replacing the previous "my own
// submitted reports" view. No submission UI here; the Academy detail
// modal's own Signaler is the sole report-submission entry point. No
// click-through to a detail modal (preserved from the previous
// implementation's own stated decision: an Academy account isn't a single
// browsable "profile" here — its formations are — so this stays a
// read-only list, consistent with the entity being reported).
export function AcademyBlacklistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const isDark = useThemeStore((s) => s.isDark);

  return (
    <EntityPublishedReportsModal
      open={open}
      onClose={onClose}
      isDark={isDark}
      title="Académies signalées"
      subtitle="Signalements publiés par l'équipe Admin concernant des académies."
      icon={
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-red-900/40" : "bg-red-100"}`}>
          <Ban className={`w-4 h-4 ${isDark ? "text-red-400" : "text-red-600"}`} />
        </div>
      }
      usePublishedReports={useAcademyPublishedReports}
      mapRow={(r: any) => ({
        id: r.id, professionalId: r.academyUserId, professionalName: r.academyName, professionalImageUrl: r.academyProfileImageUrl,
        rating: r.rating, comment: r.reason, createdAt: r.createdAt, publishedAt: r.resolvedAt,
      })}
      accentClassName={isDark ? "text-indigo-400" : "text-indigo-600"}
    />
  );
}
