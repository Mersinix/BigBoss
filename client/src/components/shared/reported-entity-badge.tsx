import { Ban } from "lucide-react";

// The "reported entity" icon badge every service's blacklist modal passes as
// `icon` to EntityPublishedReportsModal — byte-identical across all six
// (task: "Safely Consolidate the Six Blacklist Modal Components into One
// Shared Component" — see BLACKLIST_MODAL_REFACTOR_AUDIT.md §2.1/§6).
// Always red/Ban regardless of section; the per-section color only shows up
// in `accentClassName`, passed separately to PublishedReportsList.
export function ReportedEntityBadge({ isDark }: { isDark: boolean }) {
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-red-900/40" : "bg-red-100"}`}>
      <Ban className={`w-4 h-4 ${isDark ? "text-red-400" : "text-red-600"}`} />
    </div>
  );
}
