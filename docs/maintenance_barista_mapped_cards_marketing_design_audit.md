# Maintenance & Barista mapped cards ↔ Marketing design synchronization audit

Scope: Coffee Owner `/maintenance` and `/barista` mapped professional cards,
visually synchronized against the current `MarketingMappedServiceCard` design
(`client/src/components/marketing/marketing-mapped-service-card.tsx`). This is
a **visual-only** synchronization — Maintenance and Barista have no Store/Agency
layer, and none was introduced. Every card still represents one professional
account directly, fed by the same existing APIs/data as before.

## 1. Current Maintenance card structure (before this task)

`AgentCard`, defined inline in `client/src/pages/cafe/maintenance/maintenance-page.tsx`
(not a separate file, not shared with Fast Search). A "wide card": horizontal
flex, left 40% (`w-2/5`) = full-height photo panel (`getAvatarUrl` only — no
Flash priority), right 60% = info panel (name, jobTitle, a `profileType` Badge
+ location/distance text + responseTime text all on one wrapping row, then a
rating+reviewCount+years-experience row). No footer, no description, no price
(deliberately removed per an earlier audit). Availability shown as a dot on
the photo panel; favorite as a circular button top-right of the whole card.
Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`.

## 2. Current Barista card structure (before this task)

`BaristaCard`, defined inline in `client/src/pages/cafe/barista/barista-page.tsx`
(not shared with Fast Search). Same wide-card skeleton as Maintenance's
(explicitly built to mirror it, per its own code comment): left 40% photo
panel (`getAvatarUrl` only, no Flash priority), right 60% info panel (name, a
`level` Badge + conditional location/distance text, rating+reviewCount row),
plus — unlike Maintenance — a `border-t` footer row with one icon-only chat
button. No description/bio shown, no years-experience text, no price. Same
grid classes as Maintenance.

## 3. Current Marketing mapped Service card structure (reference)

`MarketingMappedServiceCard` — a vertical card: `aspect-[4/3]` image on top
with four overlays (agency-name badge top-left, favorite top-right,
availability dot bottom-left, category badge bottom-right), then below the
image: title → description (`line-clamp-2`) → a `border-t` footer row with
"À partir de" + price on one line and Star-rating+reviewCount on the other.

## 4. Exact visual differences (before this task)

| Aspect | Maintenance/Barista (before) | Marketing (reference) |
|---|---|---|
| Card orientation | Horizontal (photo left 40%, info right 60%) | Vertical (image on top, info below) |
| Image treatment | Fixed-height side panel, no overlay badges, `getAvatarUrl` only (no Flash priority on the main card) | `aspect-[4/3]` top image, 4 overlay badges, same Flash-aware source as the rest of the design system |
| Category/type badge | Plain inline `Badge` in the info panel body | Overlay badge bottom-right, directly on the image |
| Availability | Dot on the photo panel (same position concept, different panel) | Dot bottom-left over the image |
| Favorite | Circular button top-right of the whole card (same) | Circular button top-right over the image (same treatment, different context) |
| Description | Not shown (Maintenance has `description`, Barista has `bio` — both existed in the data model, neither was rendered on the card) | `line-clamp-2` description line under the title |
| Distance/location | Raw `"{location} · {distanceKm} km"` text concatenation | N/A on Marketing's card (no location concept there) — but the session's established pattern (applied to Print/Academy) is to prefer a formatted distance over raw address text on mapped cards |
| Footer | Maintenance: none. Barista: chat-button only. | Rating + price |
| Price | None on either (Maintenance's was deliberately removed; Barista's was never shown) | Shown |

## 5. Which existing components/styles were reused

- `useFavorites` (Zustand) — `maintenance`/`baristaMarket` slices, `toggleMaintenance`/`toggleBaristaMarket` actions — untouched, same call signature.
- `getPreferredImageUrl` (`client/src/lib/avatar.ts`) — already used by `MaintenanceFastSearch`/`BaristaFastSearch` for their hero image; now also applied to the main grid card's image (previously only `getAvatarUrl`, i.e. profile-image-only, was used there — a real gap between the grid card and Fast Search, now closed).
- `formatDistance` (`client/src/lib/distance.ts`) — already used elsewhere this session (Print/Academy sync tasks) for the same "distance over raw text" presentation; reused here rather than inventing a new formatter.
- `categoryIcons` map (Maintenance) — already built at the page level from `/api/maintenance/taxonomy`'s `competencies[].icon` for the category filter strip; now also passed into `AgentCard` for the new category overlay badge (same source, no new fetch).
- `StarRating` (both files, pre-existing local components) — reused unchanged.
- `TYPE_ICONS`/`TYPE_COLORS` (Maintenance) and `BARISTA_LEVEL_COLORS`/`BARISTA_LEVEL_LABELS` (Barista) — pre-existing local maps, reused for the new overlay badges (icon for Maintenance's type, color for Barista's level).

## 6. Maintenance-specific data preserved

`profileType` (+ icon), `jobTitle`, `description`, `categories[]` (admin taxonomy), `responseTime`, `yearsExperience`, `rating`/`reviewCount`, `available`, `location`/`distanceKm`, `flashImageUrl`/`profileImageUrl`, favorite state. `dailyRateInCents` remains intentionally not shown on the card (per the pre-existing, explicitly documented decision in `docs/maintenance_pricing_admin_performance_audit.md`) — not reintroduced.

## 7. Barista-specific data preserved

`level` (+ label/color), `bio`, `skills[]`, `rating`/`reviewCount`, `available`, `location`/`distanceKm`, `flashImageUrl`/`profileImageUrl`, favorite state, the chat button (`onChat`, gated on `canAct`). `dailyRateInCents` remains not shown on the card (unchanged).

## 8. Existing shared card components

None existed for either module before this task (`AgentCard`/`BaristaCard` were both bespoke, inline). None were extracted into new shared files by this task either — each card is used in exactly one place (its own page's grid; Fast Search uses its own separate full-screen component and does not reuse these cards), so there was no multi-consumer need for a shared file (unlike Print/Academy, which share a mapped card between a marketplace page and a Store Details page). This keeps the change minimal and avoids an unnecessary refactor.

## 9. Frontend/backend/data relationships — none changed

No API/route/storage/schema changes were made for this task. Both cards continue to read from their existing queries (`["/api/maintenance/profiles"]`, `useBaristaProfiles()`) unchanged. No Store architecture, Store IDs, or Store relationships were introduced anywhere.

## 10. Components changed

- `client/src/pages/cafe/maintenance/maintenance-page.tsx` — `AgentCard` rewritten to the vertical layout; `categoryIcons` now passed as a prop; added `getPreferredImageUrl`/`formatDistance` imports.
- `client/src/pages/cafe/barista/barista-page.tsx` — `BaristaCard` rewritten to the vertical layout; loading skeleton height adjusted (`h-36` → `h-80`) to match the new card proportions; added `getPreferredImageUrl`/`formatDistance` imports.
- No other files were modified. `maintenance-fast-search.tsx`, `barista-fast-search.tsx`, `AgentDetailModal`, `BaristaDetailModal`, and both Fast Search components are untouched (confirmed neither reuses the mapped-grid card component, so they were structurally unaffected by this change).

## 11. Visual changes (both cards)

- Converted from a horizontal "wide card" (photo-left/info-right) to a vertical card: `aspect-[4/3]` image on top with four overlay badges (type/level top-left, favorite top-right, availability dot bottom-left, category/skill bottom-right), then title → description/bio → distance/meta row → footer.
- Image now uses the real Flash → Profil → fallback priority (previously profile-image-only on the main grid card, Flash-aware only in Fast Search) — a correctness fix, not new data.
- Distance now shown via `formatDistance()` instead of a raw `"{km} km"` concatenation, and preferred over the raw location string when available (location text remains the fallback when no distance can be computed) — professional-based distance, no Store-based calculation introduced.
- Added a `description`/`bio` line under the title on both cards — real existing fields that were in the data model but not previously rendered on the grid card.
- Barista's existing chat-button footer was preserved and now sits alongside the rating in a single footer row (instead of being the footer's only content); Maintenance's years-experience text was preserved, moved into the new footer row.

## 12. Nested/detail modal behavior

Not redesigned — `AgentDetailModal` (Maintenance, same file) and `BaristaDetailModal` (Barista, separate file) are unchanged. Card-click wiring (`onOpenDetail`) is unchanged in both files, so the existing modal-open behavior is preserved exactly.

## 13. Fast Search

Not touched. Confirmed via direct read that neither `MaintenanceFastSearch` nor `BaristaFastSearch` imports or reuses `AgentCard`/`BaristaCard` — they are separate, full-screen Tinder-style components with their own hero-image/overlay logic (which already used the Flash-priority helper, unaffected by this task).

## 14. Store architecture — explicitly NOT introduced

No Store cards, Store Details pages, Store IDs, or Store relationships were added to either module. Both pages continue to render exactly one card per professional account (`userId`), fed by the same existing per-professional queries as before.

## 15. Tests executed

- `npx tsc --noEmit` — clean (no errors) after both card rewrites.
- `npm run build` — clean production build (client + server).
- Live verification via `curl` against the user's already-running Vite dev server confirmed the HMR-updated `maintenance-page.tsx` and `barista-page.tsx` modules contain the new `aspect-[4/3]` card markup, `getPreferredImageUrl`/`formatDistance` usage, and (Maintenance) the `categoryIcons` prop wiring.

## 16. Verified / Not verified / Not applicable

- **Verified**: TypeScript compiles cleanly; production build succeeds; the live dev-server-served module source reflects every intended change (frontend-only changes, fully covered by Vite HMR — no backend/schema change was made in this task, so no server restart is needed).
- **Not verified**: actual rendered-pixel/interactive browser behavior (hover states, dark-mode contrast, responsive breakpoints, modal-open flows) — no browser-automation tool is available in this environment. This was confirmed via source/structural reads and `tsc`/`build`, not a real browser session.
- **Not applicable**: database/schema changes (none made), Store architecture verification (none introduced, nothing to verify), Admin Maintenance/Admin Barista/Espace Maintenance/Espace Barista-marketplace changes (explicitly out of scope and untouched).

## 17. Remaining limitations

- No browser-automation tool is available in this environment; light/dark-mode visual contrast and responsive layout at each breakpoint should be confirmed by the user in an actual browser before considering the sync fully verified end-to-end.
- Barista's bottom-right overlay badge shows the professional's first skill (`skills[0]`) rather than a true "category," since Barista has no category taxonomy equivalent to Marketing's or Maintenance's — this was a deliberate choice to use real existing data rather than fabricate a category concept that doesn't exist in the Barista model.
- Neither page's loading state previously existed for Maintenance (no Skeleton grid was present before this task); none was added, since introducing one would go beyond the scope of a visual-only card synchronization.
