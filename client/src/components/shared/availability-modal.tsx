import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useScrollDismiss } from "@/hooks/use-scroll-dismiss";
import { ModalGrabber } from "@/components/shared/modal-grabber";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Clock, Sun, Moon, X } from "lucide-react";
import { WEEKLY_DAY_DEFS } from "@/lib/weekly-hours";
import type { OpeningHoursMap } from "@shared/schema";

function accentClasses(accentColor: "amber" | "blue" | "indigo", dk: boolean) {
  const rowToday = { amber: "bg-amber-500/15 border-amber-500/30", blue: "bg-blue-500/15 border-blue-500/30", indigo: "bg-indigo-500/15 border-indigo-500/30" };
  const rowTodayLight = { amber: "bg-amber-50 border-amber-200", blue: "bg-blue-50 border-blue-200", indigo: "bg-indigo-50 border-indigo-200" };
  const dayTodayDark = { amber: "text-amber-400", blue: "text-blue-400", indigo: "text-indigo-400" };
  const dayTodayLight = { amber: "text-amber-600", blue: "text-blue-600", indigo: "text-indigo-600" };
  const badgeDark = { amber: "bg-amber-500/30 text-amber-300", blue: "bg-blue-500/30 text-blue-300", indigo: "bg-indigo-500/30 text-indigo-300" };
  const badgeLight = { amber: "bg-amber-100 text-amber-700", blue: "bg-blue-100 text-blue-700", indigo: "bg-indigo-100 text-indigo-700" };
  const timeDark = { amber: "text-amber-300", blue: "text-blue-300", indigo: "text-indigo-300" };
  const timeLight = { amber: "text-amber-700", blue: "text-blue-700", indigo: "text-indigo-700" };
  return {
    rowToday: dk ? rowToday[accentColor] : rowTodayLight[accentColor],
    dayToday: dk ? dayTodayDark[accentColor] : dayTodayLight[accentColor],
    badge: dk ? badgeDark[accentColor] : badgeLight[accentColor],
    time: dk ? timeDark[accentColor] : timeLight[accentColor],
  };
}

// Canonical shared Disponibilité modal — reference implementation is the
// Marketing → Stores → Disponibilité modal (formerly MarketingAvailabilityModal,
// client/src/components/marketing/marketing-detail-modal.tsx), extracted here
// unchanged in layout/behavior so Barista, Maintenance, Print (store), Academy
// (store), and Supplier (store) render the exact same component instead of
// near-duplicate copies. Purely a read-only weekly-schedule display — no
// editing, no mutation, no query — every caller keeps its own data fetching.
export function AvailabilityModal({
  open, onClose, targetName, weeklyHours, isDark,
  accentColor = "amber",
  dayDefs = WEEKLY_DAY_DEFS,
  subtitleLabel = "Disponibilité",
  todayLabel = "Aujourd'hui",
  closedLabel = "Fermé",
  noScheduleTitle = "Aucun horaire configuré",
  noScheduleHint,
  onToggleTheme,
}: {
  open: boolean;
  onClose: () => void;
  targetName: string;
  weeklyHours: OpeningHoursMap | null;
  isDark: boolean;
  accentColor?: "amber" | "blue" | "indigo";
  dayDefs?: { key: keyof OpeningHoursMap; label: string }[];
  subtitleLabel?: string;
  todayLabel?: string;
  closedLabel?: string;
  noScheduleTitle?: string;
  noScheduleHint: string;
  onToggleTheme?: () => void;
}) {
  const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const todayKey = dayDefs[todayIndex]?.key;

  const dk = isDark;
  const bg = dk ? "bg-gray-900" : "bg-white";
  const textPrimary = dk ? "text-white" : "text-gray-900";
  const textMuted = dk ? "text-gray-400" : "text-gray-500";
  const rowBg = dk ? "bg-gray-800 border-gray-700/60" : "bg-gray-50 border-gray-100";
  const timeColor = dk ? "text-gray-300" : "text-gray-700";
  const closedColor = dk ? "text-red-400" : "text-red-500";
  const iconBtn = dk ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800";
  const accent = accentClasses(accentColor, dk);

  // Swipe-to-dismiss on the grabber (task: "Standardize Grabber Design and
  // Swipe-to-Dismiss Across Store Information and Service Modals") — same
  // shared hook/parameters as the established reference.
  const {
    onBodyWheel, onBodyTouchStart, onBodyTouchMove, onBodyTouchEnd,
    dismissContentStyle, dismissOverlayStyle,
  } = useScrollDismiss(open, onClose, undefined, true);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-sm p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden"
        style={dismissContentStyle}
        overlayStyle={dismissOverlayStyle}
      >
        <VisuallyHidden><DialogTitle>{subtitleLabel} — {targetName}</DialogTitle></VisuallyHidden>
        <div className={`flex flex-col max-h-[88vh] overflow-hidden transition-colors duration-200 ${bg}`}>
          <div className={`shrink-0 ${bg} px-5 pt-1 pb-4`}>
            <ModalGrabber isDark={dk} />
            <div className="flex items-center justify-between mb-4 mt-2">
              {onToggleTheme ? (
                <button onClick={onToggleTheme} aria-label="Toggle theme" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}>
                  {dk ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
                </button>
              ) : (
                <div className="w-8 h-8" />
              )}
              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-[13px] font-semibold tracking-tight leading-tight ${textPrimary}`}>{targetName}</span>
                <span className={`text-[11px] font-medium ${textMuted}`}>{subtitleLabel}</span>
              </div>
              <button onClick={onClose} aria-label="Close" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${iconBtn}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={`h-px w-full ${dk ? "bg-gray-800" : "bg-gray-100"}`} />
          </div>
          <div
            className="flex-1 min-h-0 overflow-y-auto px-5 pb-6
              [&::-webkit-scrollbar]:w-1
              [&::-webkit-scrollbar-track]:bg-transparent
              [&::-webkit-scrollbar-thumb]:rounded-full
              [&::-webkit-scrollbar-thumb]:bg-gray-700
              hover:[&::-webkit-scrollbar-thumb]:bg-gray-600"
            style={{ WebkitOverflowScrolling: "touch" }}
            onWheel={onBodyWheel}
            onTouchStart={onBodyTouchStart}
            onTouchMove={onBodyTouchMove}
            onTouchEnd={onBodyTouchEnd}
          >
            {weeklyHours ? (
              <div className="space-y-2 pb-2">
                {dayDefs.map(({ key, label }) => {
                  const day = weeklyHours[key];
                  const isToday = key === todayKey;
                  return (
                    <div key={key} className={`flex items-center justify-between border rounded-2xl px-4 py-3 transition-colors ${isToday ? accent.rowToday : rowBg}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] font-medium ${isToday ? accent.dayToday : textPrimary}`}>{label}</span>
                        {isToday && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${accent.badge}`}>{todayLabel}</span>
                        )}
                      </div>
                      {day?.closed ? (
                        <span className={`text-[12px] font-semibold ${closedColor}`}>{closedLabel}</span>
                      ) : day ? (
                        <span className={`text-[13px] font-medium tabular-nums ${isToday ? accent.time : timeColor}`}>{day.open}&thinsp;–&thinsp;{day.close}</span>
                      ) : (
                        <span className={`text-[12px] ${textMuted}`}>—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`text-center py-12 ${textMuted}`}>
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className={`text-sm font-medium ${textPrimary}`}>{noScheduleTitle}</p>
                <p className="text-xs mt-1 opacity-50">{noScheduleHint}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
