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
export interface PublishedReportsPage {
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
  // "default" (unchanged): icon + title/subtitle on the left, close button on the
  // right, inside the Dialog's own default padding — every existing caller keeps
  // this unless it opts in. "centered" (task: "Redesign ShopBlacklistModal Header
  // to Match ReportModal Design"): grabber + a centered title row + divider,
  // mirroring client/src/components/report-modal.tsx's header exactly — opt-in
  // only, so other services' appearance is untouched.
  headerVariant?: "default" | "centered";
}

export function EntityPublishedReportsModal({
  open, onClose, isDark, title, subtitle, icon, usePublishedReports, mapRow, onSelectProfessional, accentClassName,
  headerVariant = "default",
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

  const centered = headerVariant === "centered";
  const dk = isDark;
  const bg      = dk ? "bg-gray-900" : "bg-white";
  const divider = dk ? "bg-gray-800" : "bg-gray-100";
  const iconBtn = dk
    ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
    : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800";

  const list = (
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
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className={`sm:max-w-xl rounded-2xl border-0 shadow-2xl max-h-[85vh] overflow-y-auto [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${bg}${centered ? " p-0" : ""}`}
        style={dismissContentStyle}
        overlayStyle={dismissOverlayStyle}
        onWheel={onBodyWheel}
        onTouchStart={onBodyTouchStart}
        onTouchMove={onBodyTouchMove}
        onTouchEnd={onBodyTouchEnd}
      >
        <VisuallyHidden><DialogTitle>{title}</DialogTitle></VisuallyHidden>

        {centered ? (
          <>
            <div className={`${bg} px-5 pt-1 pb-4`}>
              <ModalGrabber isDark={isDark} />
              <div className="flex items-center justify-between mb-4 mt-1 gap-2">
                <div className="shrink-0">{icon}</div>

                <div className="flex flex-col items-center gap-0.5 min-w-0 px-2">
                  <span className={`text-[13px] font-semibold tracking-tight text-center truncate max-w-full ${dk ? "text-white" : "text-gray-900"}`}>{title}</span>
                  <span className={`text-[11px] font-medium text-center truncate max-w-full ${dk ? "text-gray-400" : "text-gray-500"}`}>{subtitle}</span>
                </div>

                <button
                  onClick={onClose}
                  aria-label="Close"
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${iconBtn}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className={`mt-4 h-px w-full ${divider}`} />
            </div>

            <div className="px-5 pb-6">{list}</div>
          </>
        ) : (
          <>
            <ModalGrabber isDark={isDark} />
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                {icon}
                <div className="min-w-0">
                  <h2 className={`font-bold text-base ${dk ? "text-white" : "text-gray-900"}`}>{title}</h2>
                  <p className={`text-xs ${dk ? "text-gray-400" : "text-gray-500"}`}>{subtitle}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${iconBtn}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {list}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
