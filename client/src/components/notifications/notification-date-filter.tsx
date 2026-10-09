import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { resolveDateRange, type DateRangePreset } from "@/lib/marketplace-analytics";
import type { Notification } from "@shared/schema";

// Applies the active (preset | customDate) date state to a notification list —
// shared by all three consumers so the filtering rule is defined exactly once.
// Preset mode reuses resolveDateRange's existing, already-correct local-time
// boundaries; custom mode matches the exact local calendar day.
export function filterNotificationsByDate<T extends Pick<Notification, "createdAt">>(
  notifications: T[],
  preset: DateRangePreset | "",
  customDate: string,
): T[] {
  if (preset) {
    const { from, to } = resolveDateRange(preset);
    return notifications.filter((n) => {
      const d = new Date(n.createdAt as any);
      return (!from || d >= from) && (!to || d <= to);
    });
  }
  if (customDate) {
    return notifications.filter((n) => {
      const d = new Date(n.createdAt as any);
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return local === customDate;
    });
  }
  return notifications;
}

// Shared date filter for the three notification surfaces (Admin/Supplier bell
// dropdown, Coffee Owner notification modal) — a preset picklist (reusing the
// exact same DateRangePreset/resolveDateRange machinery as the already-working
// ProviderNotificationsPage date filter, just a different, notification-specific
// label/order set per docs/notification_date_filters_dark_mode_and_tab_pagination_audit.md)
// next to the existing single-day custom date input. The two inputs are
// mutually exclusive: picking a preset clears the custom date, and typing a
// custom date clears the preset, so the Select never shows a stale "active"
// preset that no longer matches what's actually filtering the list.
export const NOTIFICATION_DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Aujourd'hui" },
  { value: "7d", label: "7 derniers jours" },
  { value: "30d", label: "30 derniers jours" },
  { value: "month", label: "Ce mois" },
  { value: "lastMonth", label: "Mois précédent" },
  { value: "year", label: "Cette année" },
];

export function NotificationDateFilter({
  preset, onPresetChange, customDate, onCustomDateChange, isDark, testIdPrefix = "notification",
}: {
  preset: DateRangePreset | "";
  onPresetChange: (p: DateRangePreset) => void;
  customDate: string;
  onCustomDateChange: (d: string) => void;
  // Only needed by callers that do NOT sit under a real Tailwind `.dark`
  // ancestor class — see DataPagination's identical prop for the full
  // explanation. Admin/Supplier's bell dropdown omits this (real `.dark`
  // class via DashboardLayout); the Coffee Owner notification modal passes it.
  isDark?: boolean;
  testIdPrefix?: string;
}) {
  const hasFilter = !!preset || !!customDate;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Select value={preset || undefined} onValueChange={(v) => onPresetChange(v as DateRangePreset)}>
        <SelectTrigger
          className={`h-8 text-xs w-[145px] shrink-0 ${isDark ? "bg-gray-800 border-gray-700 text-gray-200" : ""}`}
          data-testid={`select-${testIdPrefix}-date-preset`}
        >
          <SelectValue placeholder="Personnalisé" />
        </SelectTrigger>
        <SelectContent className={isDark ? "bg-gray-800 border-gray-700 text-gray-100 [&_[data-highlighted]]:bg-gray-700 [&_[data-highlighted]]:text-white" : undefined}>
          {NOTIFICATION_DATE_PRESETS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        type="date"
        value={customDate}
        onChange={(e) => onCustomDateChange(e.target.value)}
        className={`h-8 text-xs w-[135px] shrink-0 dark:[color-scheme:dark] ${isDark ? "bg-gray-800 border-gray-700 text-gray-200 [color-scheme:dark]" : ""}`}
        data-testid={`input-${testIdPrefix}-date-filter`}
      />
      {hasFilter && (
        <button
          onClick={() => { onCustomDateChange(""); onPresetChange("" as DateRangePreset); }}
          aria-label="Effacer le filtre de date"
          className={`p-1 rounded-full transition-colors shrink-0 ${isDark ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}
          data-testid={`button-clear-${testIdPrefix}-date-filter`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
