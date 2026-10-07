# Marketing Cards Final Layout & Store Detail Synchronization — Audit

## Audit (Part 19 questions, answered first)

1. **`/marketing` agency cards** render via `MarketingStoreCardTile` inside `MarketingStoresSection`, in `client/src/pages/cafe/marketing/marketing-page.tsx`, fed by `useMarketingCompanies()` → `GET /api/marketing/companies` → `storage.getMarketingCompanyCards()`.
2. **`/marketing` mapped service cards** render via `ServiceCard` (same file), fed by `useMarketingServices()` → `GET /api/marketing/services` → `storage.getPublishedMarketingServices()`.
3. **`/marketing/stores/:storeId` service cards** rendered via a *separate* `StoreServiceCard` component in `client/src/pages/cafe/marketing/marketing-store-detail-page.tsx`, fed by `useMarketingProfileDetail(agencyId)` → `GET /api/marketing/profile/:userId`.
4. **Did both pages already share one card component?** No — `ServiceCard` and `StoreServiceCard` were two independent implementations before this task (built in the previous task, already visually similar but not the same component). This is exactly the "visually similar but technically separate design" the task forbids continuing.
5. **Category icon source**: `taxonomy` from `useMarketingTaxonomy()` + a local `CATEGORY_ICON_FALLBACK` map, both only inside `marketing-page.tsx` — `/marketing/stores/:storeId`'s own category chips never consulted either, they rendered plain text with no icon at all.
6. **Agency type**: `marketingProfiles.profileType` (`"Agency" | "Freelancer" | "Studio"`) — real column, already labeled via `providerTypeLabel()`/`providerTypeColor()` in `marketing-page.tsx`, but **missing from `MarketingCompanyListCard`** (the type/list `getMarketingCompanyCards()` returns) — the mapped agency card had no way to show it because the field was never surfaced through that endpoint.
7. **Service description**: `marketingServices.description` — real column, already fetched everywhere, just not displayed on the main `/marketing` card (which showed agency+distance in that slot instead).
8. **Availability**: `agencyIsAvailable` (derived from `!isOnVacation`, boolean) for the dot; `responseTime` (real text) was the old bottom-row text being removed per this task.
9. **Reviews/rating**: `rating`/`reviewCount` — real, agency-level (Marketing reviews are tied to the agency, not an individual service — by design, every service card of one agency legitimately shows the same rating).
10. **Distance**: `distanceKm`, computed server-side (`storage.haversineKm` against the viewer's own location) in both `getMarketingCompanyCards()` and `getPublishedMarketingServices()` — confirmed real/dynamic, untouched.
11. **Favorites**: Zustand `useFavorites()` store — `marketingAgencies`/`toggleMarketingAgency` (agency-level) and `marketingServices`/`toggleMarketingService` (service-level, already used on `/marketing`, never wired on Store Details before this task).

**Conclusion**: the safest reusable source of truth was to (a) add the one missing field (`profileType`) to the existing `getMarketingCompanyCards()` output rather than inventing a new endpoint, and (b) extract the mapped-service-card presentation into one new shared component so `/marketing` and `/marketing/stores/:storeId` literally run the same code, instead of keeping two hand-synchronized implementations.

## Root cause
Not a bug — the previous task built two visually-similar-but-separate card components, and left `profileType` (a real, already-used field) out of the one list endpoint the agency card reads from. This task's layout requests (1.5× agency cards, moved badges, description-instead-of-distance, availability dot, avis-next-to-price) required restructuring both cards again, which was the natural point to also eliminate the duplication.

## Changes

### New shared component
- `client/src/components/marketing/marketing-mapped-service-card.tsx` — `MarketingMappedServiceCard`, the **one** presentation component now used by both `/marketing`'s `ServiceCard` (thin adapter around it) and `/marketing/stores/:storeId`'s service grid directly. Layout: image (agency-name badge top-left, favorite top-right, availability dot bottom-left, category badge bottom-right) → service name → service description → price row with avis inline (`À partir de　★4.9(12)` / price below).
- `client/src/lib/marketing-category-icon.ts` — the **one** category icon resolver (`MARKETING_CATEGORY_ICON_FALLBACK` + `resolveMarketingCategoryIcon(name, taxonomy)`), moved out of `marketing-page.tsx` so both pages import the same source instead of each keeping/copying a map.

### Backend (minimal, additive)
- `shared/schema.ts` / `server/storage.ts`: added `profileType: profile.profileType` to `MarketingCompanyListCard` / `getMarketingCompanyCards()` — surfaces the already-real `marketingProfiles.profileType` column through the agency list endpoint. No new table/column; no DB migration needed (verified via `psql` that `profile_type` already has real data for every agency).

### Coffee Owner `/marketing` (`marketing-page.tsx`)
- **Agency cards ~1.5×**: grid columns reduced (`2/3/4/4/4` → `1/2/3/3/3`), collapsed-scroll item width `w-52 sm:w-60` → `w-72 sm:w-80`, avatar `11×11` → `16×16`, name `text-sm` → `text-base`, description `text-xs` → `text-sm`, padding `p-3` → `p-4`, gaps `gap-3` → `gap-4`, favorite button `w-7 h-7` → `w-9 h-9`.
- **Agency type badge** — top-left over the image, real `providerTypeLabel(company.profileType)`.
- **Agency Avis overlay** — bottom-right over the image, real `company.rating`/`company.reviewCount`, only rendered when `reviewCount > 0` (same convention as every other Store hero in this codebase).
- **Service cards** now delegate to `MarketingMappedServiceCard`: description replaces the old "agency · distance" line, `< 24h` text row removed, availability now the bottom-left image dot, avis moved inline next to "À partir de".
- `CATEGORY_ICON_FALLBACK` local map removed; filter strip and card badge both now call `resolveMarketingCategoryIcon`.

### Marketing Store Details (`marketing-store-detail-page.tsx`)
- `StoreServiceCard` deleted entirely; its grid now renders `MarketingMappedServiceCard` directly, fed by the agency `card`'s own `name`/`profileImageUrl`/`rating`/`reviewCount`/`isOnVacation` (agency-level fields, same ones the page already had) plus each `service`'s own `category`/`description`/`imageUrl`/`startingPriceInCents`.
- Added a real per-service favorite heart (`useFavorites().marketingServices`/`toggleMarketingService`) — the exact same store/action `/marketing` already uses, not a new favorite system; this page simply never had a per-service favorite control before.
- Category filter chips (`Tout`/`Ads`/`Branding`/`Photo`/…) now resolve their icon via the same `resolveMarketingCategoryIcon(cat, taxonomy)` as `/marketing`'s own strip; the `Tout` chip's icon changed from a generic lucide `Megaphone` to the literal `📢` `/marketing` already uses for its own "All" chip, for true visual parity.
- Grid column count aligned with the new service card's size (`2/3/4/5` → `1/2/3/4`, matching `/marketing`'s gap of `gap-4`).

## Data synchronization
Both pages now call the **same function** (`MarketingMappedServiceCard`) with values drawn from the same underlying `marketingServices`/`marketingProfiles` rows — `/marketing` via `getPublishedMarketingServices()` (already pre-joins agency fields per service), Store Details via the agency `card` + its own `services` array (two separate fetches joined client-side, since that page is already scoped to one agency). No value is computed independently in two places; category icon resolution is the one function in `lib/marketing-category-icon.ts`.

## Validation
- `npx tsc --noEmit`: clean.
- `npm run build`: clean (client + server).
- SQL sanity check (`psql`): confirmed `marketing_profiles.profile_type` has real values (`"Agency"`) and `rating`/`review_count` are real/non-fabricated for the agencies in the DB, validating the new agency type badge and avis overlay will render real data, not placeholders.
- Runtime/browser/responsive/dark-mode: **not performed** — no running dev/admin session available in this environment, consistent with every prior task this session. This remains a frontend-only change (no schema/DB migration), which bounds the risk, but live verification of the 1.5× sizing, badge overlap on long names, and hover/dark states should be spot-checked when a browser session is available.

## Files changed
- `client/src/components/marketing/marketing-mapped-service-card.tsx` (new)
- `client/src/lib/marketing-category-icon.ts` (new)
- `client/src/pages/cafe/marketing/marketing-page.tsx`
- `client/src/pages/cafe/marketing/marketing-store-detail-page.tsx`
- `shared/schema.ts`
- `server/storage.ts`
- `docs/marketing_cards_final_layout_synchronization_audit.md` (this file)

## Regression check
- No other marketplace module (Print, Academy, Maintenance, Barista, Supplier Stores) was touched.
- `marketing-fast-search.tsx` and `marketing-service-detail-modal.tsx` were not modified — out of scope, still functioning exactly as before (Fast Search is a separate search-results UI; clicking a mapped card still opens the same `MarketingServiceDetailModal`/`detailServiceId` path, unchanged).
- The `MarketingStoresSection`/category-filter-by-agency logic, `QuoteRequestDialog`, Avis/Signaler/Disponibilité modals, and the agency Details-modal path were not modified.
- `profileType` is purely additive on `MarketingCompanyListCard` — no existing consumer of that type was broken (verified via `tsc`).
