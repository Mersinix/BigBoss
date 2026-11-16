# Marketing Agency Cards — 4-Column Grid Synchronization Audit

## Existing Agency vs Service grid difference
Both sections live in `client/src/pages/cafe/marketing/marketing-page.tsx`:
- **Marketing Services grid** (`filteredServices.map(...)`): a single, always-on wrapping grid — `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4` (4 columns at `lg` and up).
- **Agences grid** (`MarketingStoresSection`): had **two different rendering modes** depending on its own local `expanded` state (default `false`):
  - Collapsed (the default, and the only state ever shown when there are ≤5 agencies, e.g. today's real data — 1 agency): a **horizontal scroll strip** of fixed-width cards, `shrink-0 w-72 sm:w-80` — i.e. a flat 288px/320px card width, not a grid at all.
  - Expanded ("Voir plus", only reachable with >5 agencies): a wrapping grid, but `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3` (3 columns at `lg`, from the earlier "1.5× agency card" task).

## Root cause
Two unrelated column/width systems for the two sections: Services always used a responsive wrapping grid; Agencies used a fixed-pixel horizontal-scroll strip by default (and a *different*, 3-column grid only in its rarely-reached expanded state). Neither matched the Services grid's breakpoints, so Agency cards rendered wider than Service cards at every screen size.

## Fix
Replaced both of `MarketingStoresSection`'s rendering branches with one single grid, using the exact same Tailwind classes as the Services grid: `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`. This applies identically whether the section is collapsed (first 5 agencies) or expanded ("Voir plus" — all agencies) — same column count, same gap, same breakpoints as Marketing Services, at every screen size. The horizontal-scroll/fixed-width mode was removed entirely since Services never had an equivalent mode to match.

No change was made to `MarketingStoreCardTile` itself (image, agency-type badge, name, Avis overlay, description, distance, availability dot, favorite button, styling) — only the grid container around it.

## Files changed
- `client/src/pages/cafe/marketing/marketing-page.tsx` — `MarketingStoresSection`'s grid/collapsed-scroll rendering unified into one grid matching the Services grid's classes.

## Final grid behavior
- Mobile (`<sm`): 1 column — both sections.
- `sm`–`md`: 2 columns — both sections.
- `md`–`lg`: 3 columns — both sections.
- `lg` and up: **4 columns** — both sections, identical card width (same grid, same gap, same column count).
- The "Voir plus/Voir moins" toggle still works exactly as before — it only changes how many agencies are included in `visible`, not the grid itself.

## Verification performed
- `npx tsc --noEmit`: clean.
- `npm run build`: clean (client + server).
- Confirmed live on the user's already-running dev server (Vite HMR, frontend-only change): fetched the served module directly and found the identical grid class string (`grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`) present for both the Agency grid and the Service grid (3 occurrences total: 1 Agency + 2 Service, including its loading skeleton).
- No backend/schema/API/ordering/filtering/favorites/availability/review logic was touched — purely a grid-container CSS/layout change in one component.
- `/marketing/stores/:storeId` was not touched and does not share this component, so it is unaffected (as expected, since the task scoped this to `/marketing`'s own Agency section only).
- Visual confirmation in an actual browser (hover states, exact pixel overflow check) was not performed — no browser-automation tool available in this environment; stated honestly rather than claimed.
