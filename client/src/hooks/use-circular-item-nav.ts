import { useMemo } from "react";

/**
 * Circular variant of use-item-nav.ts's useItemNav — same ordered-ID-list
 * navigation shape ({prevId, nextId, hasNav}), but Previous/Next wrap around
 * instead of stopping at either end (task: "Make Store Navigation Loop
 * Continuously"). Deliberately a separate hook rather than making
 * useItemNav itself circular: that hook is shared by several non-circular
 * callers (Barista/Maintenance/Marketing Service/Academy Formation/Print
 * Service item nav, and the other services' own Store Page nav), which an
 * earlier task explicitly required to stay non-circular — this hook only
 * backs the Coffee Owner Shop's own Store Page navigation.
 */
export function useCircularItemNav(currentId: number | null, navIds: number[]) {
  return useMemo(() => {
    const n = navIds.length;
    const idx = currentId != null ? navIds.indexOf(currentId) : -1;
    // Unmatched current id (stale selection, empty list) — never guess.
    if (idx === -1) return { prevId: null, nextId: null, hasNav: false };
    // A single-item list has nothing to loop to — same convention as
    // useItemNav (hasNav requires at least 2 items), not an invented
    // "loop to itself" button.
    const hasNav = n > 1;
    const prevId = hasNav ? navIds[(idx - 1 + n) % n] : null;
    const nextId = hasNav ? navIds[(idx + 1) % n] : null;
    return { prevId, nextId, hasNav };
  }, [currentId, navIds]);
}
