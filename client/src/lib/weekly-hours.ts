import type { OpeningHoursMap } from "@shared/schema";

// Shared per-day schedule day-list — same { monday: {open, close, closed}, ... }
// shape as supplierStores.openingHours, reused by Maintenance and Barista
// Marketplace availability (both account editors and the Coffee-Owner-facing
// Availability modals) rather than each defining its own day/label list.
export const WEEKLY_DAY_DEFS: { key: keyof OpeningHoursMap; label: string; short: string }[] = [
  { key: "monday", label: "Lundi", short: "Lun" },
  { key: "tuesday", label: "Mardi", short: "Mar" },
  { key: "wednesday", label: "Mercredi", short: "Mer" },
  { key: "thursday", label: "Jeudi", short: "Jeu" },
  { key: "friday", label: "Vendredi", short: "Ven" },
  { key: "saturday", label: "Samedi", short: "Sam" },
  { key: "sunday", label: "Dimanche", short: "Dim" },
];

// Migration fallback — derives a per-day schedule from a legacy list of short
// day labels (e.g. Maintenance's old workingDays, Barista's availableDays) so
// an account that never touched the new per-day editor still gets a sensible
// starting point. No data loss, nothing hardcoded that isn't derived from what
// was actually saved before.
export function buildWeeklyHoursFallback(activeDays: string[], defaultOpen = "08:00", defaultClose = "18:00"): OpeningHoursMap {
  const map = {} as OpeningHoursMap;
  for (const d of WEEKLY_DAY_DEFS) {
    map[d.key] = { open: defaultOpen, close: defaultClose, closed: !activeDays.includes(d.short) };
  }
  return map;
}
