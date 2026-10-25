import { useMemo } from "react";

/**
 * Shared Previous/Next item-navigation logic (task: "Add Consistent
 * Previous/Next Navigation to All Coffee Owner Service Detail Modals") —
 * reused by every Coffee Owner section whose detail modal is opened from a
 * locally-filtered list (Barista, Maintenance, Marketing Service, Academy
 * Formation, Print Service), instead of five slightly different copies of
 * the same "find current index, clamp to bounds" logic. The Shop's Pack/
 * Product navigation (global Zustand stores, cross-page) is architecturally
 * different and intentionally left untouched — this hook is for the
 * simpler same-page case: a locally-filtered ID list plus a locally-held
 * selected ID.
 *
 * Non-circular by design (Previous/Next simply unavailable past either
 * end), matching the Shop's own established behavior and this task's own
 * "Do not introduce circular navigation" rule. If `currentId` isn't found
 * in `navIds` (e.g. a stale/missing selection after a filter change), both
 * prevId/nextId come back null and hasNav is false — safe, no guessing.
 */
export function useItemNav(currentId: number | null, navIds: number[]) {
  return useMemo(() => {
    const idx = currentId != null ? navIds.indexOf(currentId) : -1;
    const prevId = idx > 0 ? navIds[idx - 1] : null;
    const nextId = idx !== -1 && idx < navIds.length - 1 ? navIds[idx + 1] : null;
    const hasNav = idx !== -1 && navIds.length > 1;
    return { prevId, nextId, hasNav };
  }, [currentId, navIds]);
}
