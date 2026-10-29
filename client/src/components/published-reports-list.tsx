import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert } from "lucide-react";
import { SadnessRatingDisplay } from "@/components/shared/sadness-rating";

// Shared read-only "published reports" list (task: "Redesign Maintenance
// Reports Using the Avis Modal Pattern and Add Admin Moderation") — the
// hero-level public feed of admin-published reports. Generic over the
// report shape so Print/Barista/Academy/Marketing/Shop can reuse it once
// they get the same redesign; only Maintenance supplies real data today.

export interface PublishedReportRow {
  id: number;
  // The target professional's own user id — not rendered, used by the
  // caller to resolve a full profile card on click (e.g. open its detail
  // modal). Optional since a caller without that affordance may omit it.
  professionalId?: number;
  professionalName: string;
  professionalImageUrl?: string | null;
  rating: number | null;
  comment: string;
  // Submission date (always present) vs. publication date (when the admin
  // published it) — shown distinctly when both are available, per spec.
  createdAt: string;
  publishedAt?: string | null;
}

interface Props {
  reports: PublishedReportRow[];
  isLoading: boolean;
  error?: Error | null;
  onSelectProfessional?: (report: PublishedReportRow) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  isLoadingMore?: boolean;
  isDark: boolean;
  accentClassName?: string;
}

export function PublishedReportsList({
  reports, isLoading, error, onSelectProfessional, hasMore, onLoadMore, isLoadingMore, isDark, accentClassName,
}: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2 mt-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className={`h-24 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
        <ShieldAlert className={`w-10 h-10 ${isDark ? "text-red-500/60" : "text-red-400"}`} />
        <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>Impossible de charger les signalements</p>
        <p className={`text-xs max-w-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Veuillez réessayer dans quelques instants.</p>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
        <ShieldAlert className={`w-10 h-10 ${isDark ? "text-gray-600" : "text-gray-300"}`} />
        <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>Aucun signalement publié pour le moment</p>
        <p className={`text-xs max-w-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
          Les signalements validés par l'équipe Admin apparaîtront ici.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 mt-2">
      {reports.map((r) => {
        const content = (
          <>
            <Avatar className="w-14 h-14 shrink-0 rounded-xl">
              <AvatarImage src={getAvatarUrl({ profileImageUrl: r.professionalImageUrl ?? null })} alt={r.professionalName} className="object-cover rounded-xl" />
              <AvatarFallback className={`rounded-xl font-bold ${isDark ? "bg-red-900/40 text-red-300" : "bg-red-100 text-red-700"}`}>
                {r.professionalName.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className={`font-semibold text-sm truncate ${isDark ? "text-white" : "text-gray-900"}`}>{r.professionalName}</p>
              </div>
              <div className="mt-1">
                <SadnessRatingDisplay rating={r.rating} isDark={isDark} accentClassName={accentClassName} />
              </div>
              <p className={`text-sm mt-1.5 line-clamp-3 ${isDark ? "text-gray-300" : "text-gray-700"}`}>{r.comment}</p>
              <p className={`text-[11px] mt-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                Signalé le {new Date(r.createdAt).toLocaleDateString("fr-FR")}
                {r.publishedAt && r.publishedAt !== r.createdAt && ` · Publié le ${new Date(r.publishedAt).toLocaleDateString("fr-FR")}`}
              </p>
            </div>
          </>
        );
        const rowClass = `w-full text-left flex gap-3 p-3 rounded-2xl border transition-colors ${isDark ? "border-gray-700/60" : "border-gray-100"} ${onSelectProfessional ? (isDark ? "hover:bg-gray-800/60" : "hover:bg-gray-50") : ""}`;
        return onSelectProfessional ? (
          <button key={r.id} type="button" onClick={() => onSelectProfessional(r)} className={rowClass} data-testid={`row-published-report-${r.id}`}>
            {content}
          </button>
        ) : (
          <div key={r.id} className={rowClass} data-testid={`row-published-report-${r.id}`}>
            {content}
          </div>
        );
      })}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button size="sm" variant="outline" onClick={onLoadMore} disabled={isLoadingMore} data-testid="button-load-more-published-reports">
            {isLoadingMore ? "Chargement…" : "Charger plus"}
          </Button>
        </div>
      )}
    </div>
  );
}
