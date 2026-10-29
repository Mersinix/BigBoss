import { useEffect, useState, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { X } from "lucide-react";
import { ModalGrabber } from "@/components/shared/modal-grabber";
import { useScrollDismiss } from "@/hooks/use-scroll-dismiss";
import { PublishedReportsList, type PublishedReportRow } from "@/components/published-reports-list";

// Shared "Hero published-reports modal" shell (task: "Add a Grabber to the
// Maintenance Reports Modal and Extend the Reporting System to Barista") —
// extracted from MaintenanceBlacklistModal (the first, and until now only,
// consumer) now that a second service (Barista) needs the exact same
// chrome/pagination/real-time behavior. Owns: the grabber (new, this task),
// swipe-to-dismiss, header, and the page-accumulation + refetch-on-open
// logic already fixed for Maintenance (tasks 52-53) — fixed once here
// instead of being re-introduced (and re-broken) per service. Each caller
// keeps its own professional-detail click-through (different detail modal
// per service), supplied via `onSelectProfessional`.
interface PublishedReportsPage {
  reports: any[];
  total: number;
  page: number;
  limit: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  isDark: boolean;
  title: string;
  subtitle: string;
  icon: ReactNode;
  usePublishedReports: (page: number, limit: number) => UseQueryResult<PublishedReportsPage>;
  mapRow: (raw: any) => PublishedReportRow;
  onSelectProfessional?: (row: PublishedReportRow) => void;
  accentClassName?: string;
}

export function EntityPublishedReportsModal({
  open, onClose, isDark, title, subtitle, icon, usePublishedReports, mapRow, onSelectProfessional, accentClassName,
}: Props) {
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<Record<number, PublishedReportRow[]>>({});
  const { data, isLoading, error, refetch } = usePublishedReports(page, 10);

  // On open: drop any "Charger plus" offset beyond page 1 from a previous
  // session, but never clear an already-loaded page 1 (the Maintenance bug
  // this avoided repeating — see analyse.md tâche 53), then refetch as a
  // freshness safety net alongside real-time invalidation.
  useEffect(() => {
    if (open) {
      setPage(1);
      setPages((prev) => (prev[1] ? { 1: prev[1] } : prev));
      refetch();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data) return;
    setPages((prev) => ({ ...prev, [data.page]: data.reports.map(mapRow) }));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const reports = Object.keys(pages).sort((a, b) => Number(a) - Number(b)).flatMap((p) => pages[Number(p)]);
  const hasMore = !!data && data.page * data.limit < data.total;

  const {
    onBodyWheel, onBodyTouchStart, onBodyTouchMove, onBodyTouchEnd,
    dismissContentStyle, dismissOverlayStyle,
  } = useScrollDismiss(open, onClose, undefined, true);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className={`sm:max-w-xl rounded-2xl border-0 shadow-2xl max-h-[85vh] overflow-y-auto [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${isDark ? "bg-gray-900" : "bg-white"}`}
        style={dismissContentStyle}
        overlayStyle={dismissOverlayStyle}
        onWheel={onBodyWheel}
        onTouchStart={onBodyTouchStart}
        onTouchMove={onBodyTouchMove}
        onTouchEnd={onBodyTouchEnd}
      >
        <VisuallyHidden><DialogTitle>{title}</DialogTitle></VisuallyHidden>
        <ModalGrabber isDark={isDark} />
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <div className="min-w-0">
              <h2 className={`font-bold text-base ${isDark ? "text-white" : "text-gray-900"}`}>{title}</h2>
              <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800"}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <PublishedReportsList
          reports={reports}
          isLoading={isLoading && page === 1}
          error={error as Error | null}
          onSelectProfessional={onSelectProfessional}
          hasMore={hasMore}
          onLoadMore={() => setPage((p) => p + 1)}
          isLoadingMore={isLoading && page > 1}
          isDark={isDark}
          accentClassName={accentClassName}
        />
      </DialogContent>
    </Dialog>
  );
}
