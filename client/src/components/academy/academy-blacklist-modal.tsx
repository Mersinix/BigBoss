import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, MapPin, Calendar, Ban } from "lucide-react";
import { useMyAcademyReports } from "@/hooks/use-barista-academy";
import { useThemeStore } from "@/store/theme-store";

const STATUS_LABELS: Record<string, string> = { PENDING: "En attente", RESOLVED: "Résolu", DISMISSED: "Ignoré" };
// This app's dark mode never adds a `.dark` class to the DOM (see the note in
// barista-detail-modal.tsx) — per-component `isDark`-driven ternary classes only.
function statusColors(isDark: boolean): Record<string, string> {
  return isDark
    ? { PENDING: "bg-amber-900/50 text-amber-300", RESOLVED: "bg-green-900/50 text-green-300", DISMISSED: "bg-gray-700 text-gray-300" }
    : { PENDING: "bg-amber-100 text-amber-700", RESOLVED: "bg-green-100 text-green-700", DISMISSED: "bg-gray-100 text-gray-600" };
}

// Coffee Owner's "Blacklist" for Academy — a scoped VIEW of the same
// academyReports table Admin moderates (GET /api/academy/reports/mine), never
// a second report system. Mirrors BaristaBlacklistModal/MarketingBlacklistModal
// exactly. Clicking a reported Academy is a dead-end here (unlike Barista/
// Marketing, an Academy isn't a single browsable "profile" — its formations
// are), so this stays a read-only list, consistent with the entity being
// reported (the Academy account, not a specific formation).
export function AcademyBlacklistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: reports = [], isLoading } = useMyAcademyReports();
  const isDark = useThemeStore((s) => s.isDark);
  const STATUS_COLORS = statusColors(isDark);
  const t = {
    modalBg: isDark ? "bg-gray-900" : "bg-white",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`sm:max-w-xl rounded-2xl border-0 shadow-2xl max-h-[85vh] overflow-y-auto ${t.modalBg}`}>
        <VisuallyHidden><DialogTitle>Académies signalées</DialogTitle></VisuallyHidden>
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-red-900/40" : "bg-red-100"}`}>
            <Ban className={`w-4 h-4 ${isDark ? "text-red-400" : "text-red-600"}`} />
          </div>
          <div>
            <h2 className={`font-bold text-base ${t.textPrimary}`}>Académies signalées</h2>
            <p className={`text-xs ${t.textMuted}`}>Les académies que vous avez personnellement signalées.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 mt-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className={`h-24 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />)}
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
            <ShieldAlert className={`w-10 h-10 ${isDark ? "text-gray-600" : "text-gray-300"}`} />
            <p className={`text-sm font-medium ${t.textPrimary}`}>Aucune académie signalée</p>
            <p className={`text-xs max-w-xs ${t.textMuted}`}>Les académies que vous signalez depuis une formation apparaîtront ici avec le motif que vous avez soumis.</p>
          </div>
        ) : (
          <div className="space-y-2.5 mt-2">
            {reports.map((r) => (
              <div key={r.id} className={`w-full text-left flex gap-3 p-3 rounded-2xl border ${t.border}`} data-testid={`row-blacklist-${r.id}`}>
                <Avatar className="w-14 h-14 shrink-0 rounded-xl">
                  <AvatarImage src={getAvatarUrl({ profileImageUrl: r.academyProfileImageUrl })} alt={r.academyName} className="object-cover rounded-xl" />
                  <AvatarFallback className={`rounded-xl font-bold ${isDark ? "bg-red-900/40 text-red-300" : "bg-red-100 text-red-700"}`}>
                    {r.academyName.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`font-semibold text-sm truncate ${t.textPrimary}`}>{r.academyName}</p>
                    <Badge className={`text-[10px] border-0 shrink-0 px-1.5 ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</Badge>
                  </div>
                  {r.academyLocation && (
                    <p className={`text-xs flex items-center gap-1 mt-0.5 ${t.textMuted}`}><MapPin className="w-3 h-3 shrink-0" /> {r.academyLocation}</p>
                  )}
                  <p className={`text-xs flex items-center gap-1 mt-0.5 ${t.textMuted}`}><Calendar className="w-3 h-3 shrink-0" /> {new Date(r.createdAt).toLocaleDateString("fr-FR")}</p>
                  <p className={`text-sm mt-1.5 line-clamp-2 ${t.textPrimary}`}>{r.reason}</p>
                  {r.status !== "PENDING" && r.resolutionNote && (
                    <p className={`text-xs mt-1 italic ${t.textMuted}`}>Réponse Admin : {r.resolutionNote}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
