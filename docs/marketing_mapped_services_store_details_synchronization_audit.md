# Marketing Mapped Service Cards & Store Details Synchronization — Audit

## A. Before — current implementation inspected

1. **Coffee Owner `/marketing` mapped services**: `client/src/pages/cafe/marketing/marketing-page.tsx`, `ServiceCard` component, fed by `useMarketingServices()` → `GET /api/marketing/services` → `storage.getPublishedMarketingServices()`. One card per published Marketing **service** (not per agency) — `MarketingServiceCard = MarketingService & { agencyName, agencyLocation, agencyProfileImageUrl, agencyProfileType, agencyIsAvailable, rating, reviewCount, distanceKm }`.
2. **Marketing mapped service cards (previous layout)**: horizontal split card — `w-2/5` image/avatar on the left (with a small availability dot), info on the right: category/service-name heading, an inline `Badge` showing the agency name, a `MapPin` + `agencyLocation` + `distanceKm` text line, a star-rating + review-count row, then price. Favorite heart already existed (top-right over the small image).
3. **Marketing Store Details page**: `client/src/pages/cafe/marketing/marketing-store-detail-page.tsx`, fed by `useMarketingProfileDetail(agencyId)` → `GET /api/marketing/profile/:userId` → `storage.getMarketingCard(userId, viewerLocation)` (real, server-computed `distanceKm`) + `storage.getMarketingServicesForProvider`. Already has the target "Services Marketing" / "X services disponibles" header (line 339-340) and its own `StoreServiceCard` (vertical, image-on-top, `aspect-[4/3]`) — this is the existing visual reference the task names.
4. **Category icon system**: `CATEGORY_ICON_FALLBACK` (marketing-page.tsx) combined with `useMarketingTaxonomy()`'s own admin-set `icon` field — resolved today only inside the category filter strip as `cat.icon || CATEGORY_ICON_FALLBACK[cat.name] || "📢"`. No icon was ever shown on a service card itself.
5. **Favorites**: `useFavorites` store, `toggleMarketingService` — already wired on the existing `ServiceCard`, shared with My Favorites and persisted via `/api/marketing-favorites/services`. Untouched.
6. **Availability**: `service.agencyIsAvailable` (a boolean, shown only as a colored dot) and `service.responseTime` (real text, e.g. `"< 24h"`, already shown on `StoreServiceCard` but never on the main `/marketing` card).
7. **Avis/reviews**: `service.rating`/`service.reviewCount`, rendered via the existing `StarRating` component — real data, already used, just positioned above the price row instead of at the bottom.
8. **Agency identity**: `service.agencyName`/`service.marketingUserId` — already present on every service row (never duplicated/hardcoded).
9. **Distance**: `service.distanceKm`, computed server-side in `storage.getPublishedMarketingServices()` exactly like `getMarketingCard`'s — real and dynamic already, just displayed as raw `{distanceKm} km` instead of the shared `formatDistance()` helper, and displayed glued to the address text instead of standalone.
10. **Service ordering/mapping**: one row per `marketingServices` DB row, no separate mapping table — unaffected by this task (purely presentational).

**Classification**: all ten audited items were ✅ real, server-backed, and already correctly wired — nothing was ❌/🔴. The gap was entirely **presentational**: the main `/marketing` grid card's layout didn't yet follow the Store Details card's visual language, and a few individual elements (address text, icon, section header count) needed repositioning/reuse, not new logic.

## B. Root cause
No functional bug — a visual/structural inconsistency between two card components (`ServiceCard` in `marketing-page.tsx` vs. `StoreServiceCard` in `marketing-store-detail-page.tsx`) that both render the same underlying `marketingServices` rows, plus a few fields (category icon, distance formatting, avis placement) that existed in the data but weren't yet surfaced/positioned per the desired design.

## C. Changes made

### Coffee Owner `/marketing` (`marketing-page.tsx`)
- Added a **"Services Marketing" / "X services disponibles"** header above the grid, count driven by `filteredServices.length` (the same array already rendered — respects all existing filters: search, category, profile type, location, rating).
- Restructured `ServiceCard` from a horizontal split card to a vertical, image-on-top card (`aspect-[4/3]`, same aspect ratio and container treatment as `StoreServiceCard`):
  - **Agency name** — badge, top-left, over the image (`bg-black/55 backdrop-blur-sm`).
  - **Favorite heart** — top-right, over the image — exact same classes/behavior/`toggleMarketingService` call as before, only repositioned (no new favorite system).
  - **Category** — badge, bottom-right, over the image, using the real `service.category` plus an icon resolved from the **same existing** `taxonomy`/`CATEGORY_ICON_FALLBACK` lookup the category filter strip already uses (`categoryIconByName` map built once in the parent from `taxonomy`, passed down as a prop — no second icon mapping).
  - **Address removed**; only the real `distanceKm` remains, formatted via the shared `formatDistance()` helper (`client/src/lib/distance.ts`) — the same helper used across Print/Academy/Marketing Store cards, not a new or hardcoded format.
  - **Availability** — real `service.responseTime` text with a `Clock` icon (bottom-left row), matching `StoreServiceCard`'s own existing treatment.
  - **Avis** — moved to the bottom-right row, next to availability, using the existing `StarRating` component + real `reviewCount` (no duplicated review logic).

### Marketing Store Details (`marketing-store-detail-page.tsx`)
- Header line `{services.length} services · {card.location}` → `{services.length} services · {formatDistance(card.distanceKm)}`, using the same real, server-computed `card.distanceKm` the page already receives from `getMarketingCard`. `card.location` itself is untouched/still present on the data object for any other legitimate use; only this one header line stopped reading it.

### Category/icon synchronization
No new mapping created. A single `categoryIconByName` `Map` is derived from the existing `taxonomy` query inside `marketing-page.tsx` and passed to `ServiceCard`; Store Details' `StoreServiceCard` doesn't show a category badge (services are already filtered to one category at a time there via the sticky category switcher) — left untouched, as instructed to preserve its existing design and not force this card's new badge if not inherently relevant there.

## D. Data synchronization
Both contexts read the exact same underlying rows: `/marketing`'s `ServiceCard` from `GET /api/marketing/services` (`getPublishedMarketingServices`), Store Details' `StoreServiceCard` from the same agency's `services` array inside `GET /api/marketing/profile/:userId`. Neither was changed to read from a different source; only the presentation of already-shared fields (category, distance, rating, favorite, availability) was aligned. A given service's category/price/rating/image/favorite state is therefore identical in both places by construction — there was never a second, independently-maintained representation.

## E. Validation
- `npx tsc --noEmit`: clean.
- `npm run build`: clean (client + server).
- Runtime/browser: **not performed** — no running dev/admin session available in this environment (consistent with every prior task this session); the frontend-only nature of this change (no backend/schema touched) keeps the risk of this low, but live verification of hover/dark-mode/responsive states was not executed and should be spot-checked when a browser session is available.

## F. Files changed
- `client/src/pages/cafe/marketing/marketing-page.tsx`
- `client/src/pages/cafe/marketing/marketing-store-detail-page.tsx`
- `docs/marketing_mapped_services_store_details_synchronization_audit.md` (this file)

## G. Regression check
- No backend file touched (`server/storage.ts`, `server/routes.ts`, `shared/schema.ts` untouched) — `distanceKm`/`responseTime`/`rating`/`reviewCount`/favorites were already real and server-computed; nothing new was added to the API surface.
- `marketing-fast-search.tsx` and `marketing-service-detail-modal.tsx` were inspected and intentionally left untouched — out of this task's scope (Fast Search is a separate search-results UI; the Service Detail Modal is the existing click-through target, still opened identically via `onOpenDetail`/`detailServiceId`).
- The category filter strip, its icon resolution, and the Marketing Stores section (`MarketingStoresSection`) were not modified.
- No other marketplace module (Print, Academy, Maintenance, Barista, Supplier Stores) was touched.
