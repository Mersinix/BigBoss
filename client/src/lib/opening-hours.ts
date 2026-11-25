import type { OpeningHoursMap } from "@shared/schema";

const DAY_KEYS: (keyof OpeningHoursMap)[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

// Disponibilité icon visibility (task: "Extend Disponibilité Icon Visibility Rule to
// Other Modules" — originally implemented for Coffee Owner → Shop → Store Page).
// A day counts as genuinely configured if it's explicitly marked closed, or has real
// (non-empty) open/close times; an entity where every day is still in its untouched
// default shape (closed: false, open: "", close: "") is treated the same as a null
// schedule — not as a configured-but-empty one. Shared by every module whose weekly
// schedule uses this same OpeningHoursMap shape (Coffee Owner Store, Barista, Maintenance,
// Marketing, Academy, Print), so the rule only has to be written and reasoned about once.
export function hasConfiguredOpeningHours(hours: OpeningHoursMap | null | undefined): boolean {
  if (!hours) return false;
  return DAY_KEYS.some((key) => {
    const day = hours[key];
    return !!day && (day.closed === true || (!!day.open?.trim() && !!day.close?.trim()));
  });
}
