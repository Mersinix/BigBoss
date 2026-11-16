# Academy ↔ Marketing Design Synchronization — Audit

## 1. Initial Academy vs Marketing differences

| Aspect | Academy (before) | Marketing (reference, current final state) |
|---|---|---|
| Organization/Agency card | `AcademyStoreCardTile` — `aspect-[16/9]` cover, small favorite, name/description/course-count/distance in body, **no type badge, no Avis overlay** | `MarketingStoreCardTile` — same cover, **+ org-type badge top-left**, **+ Avis overlay bottom-right**, ~1.5× scale (bigger avatar/text/padding) |
| Organization grid | Two modes: default horizontal-scroll strip (`w-52 sm:w-60` fixed width) + a *different* 3/4-column grid only when expanded | One grid, always: `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4` |
| Formation/Service card | `TrainingCard` — horizontal split (2/5 image left, info right), address+distance text line, Avis above price, no category/availability badges on the image | `MarketingMappedServiceCard` — vertical, image-on-top, agency-name badge top-left, favorite top-right, availability dot bottom-left, category badge bottom-right, title → description → price+Avis row |
| Formation/Service grid | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (3 columns at `lg`) | `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4` (4 columns at `lg`) |
| Store Details header | Full address (`card.location`) | Real dynamic distance (`formatDistance(card.distanceKm)`) |
| Store Details course/service cards | `StoreCourseCard` — a *third*, separately-drifting card design | Reuses the exact same shared `MarketingMappedServiceCard` as the main grid |
| Store Details action icons (Disponibilité/Avis/Signaler) | **Already present and already matching** the Marketing reference exactly (built in an earlier session task) | Reference |
| Formation Detail modal (cover/close/preview buttons) | **Already present and already matching** the Marketing/Preview Detail design exactly (hero cover, black/40 circular close+favorite+Signaler/Disponibilité/Avis buttons) | Reference |
| Availability data for a single course/service | Marketing's `MarketingServiceCard.agencyIsAvailable` already existed; Academy's `AcademyCourseCard` had **no equivalent field at all** | `agencyIsAvailable: boolean` |
| Single-academy distance (Store Details) | `getAcademyProfileCard` never computed `distanceKm` | `getMarketingCard` already did |
| Organization "type" field | **Does not exist** in `academyProfiles` (no `profileType` column) | `marketingProfiles.profileType` (Agency/Freelancer/Studio) |
| Category taxonomy/icon system | **Does not exist** — `academyCourses.category` is free text, no admin-managed taxonomy table, no icon field | `marketingCategoryTaxonomy` with admin-set `icon` |

## 2. Components reviewed
`client/src/pages/cafe/barista/barista-academy-page.tsx`, `client/src/pages/cafe/barista/academy-store-detail-page.tsx`, `client/src/components/academy/academy-detail-modal.tsx`, `client/src/components/academy/academy-fast-search.tsx`, `client/src/hooks/use-barista-academy.ts`, and their exact Marketing counterparts (`marketing-page.tsx`, `marketing-store-detail-page.tsx`, `marketing-service-detail-modal.tsx`, `marketing-mapped-service-card.tsx`, `lib/marketing-category-icon.ts`), plus the `shared/schema.ts`/`server/storage.ts` backing of both.

## 3. Components modified
- **New**: `client/src/components/academy/academy-mapped-course-card.tsx` — the shared `AcademyMappedCourseCard`, Academy's equivalent of `MarketingMappedServiceCard`, used identically by both `/academy` and Academy Store Details (mirrors Marketing's own card-unification pattern, not a parallel one-off per page).
- `client/src/pages/cafe/barista/barista-academy-page.tsx` — `AcademyStoreCardTile` enlarged + org-type badge + Avis overlay; `AcademyStoresSection` grid unified; `TrainingCard` reduced to a thin adapter around the shared card; Formation grid moved to 4 columns.
- `client/src/pages/cafe/barista/academy-store-detail-page.tsx` — header now shows distance instead of address; `StoreCourseCard` removed, replaced by the shared `AcademyMappedCourseCard`; course grid moved to 4 columns.
- `shared/schema.ts`, `server/storage.ts`, `client/src/hooks/use-barista-academy.ts`, `server/routes.ts` — added the two real, previously-missing data points needed for honest parity (see Section 7).

## 4. Organization card changes
Mirrors `MarketingStoreCardTile` exactly: ~1.5× scale (avatar `11×11→16×16`, name `text-sm→text-base`, padding `p-3→p-4`, favorite button `w-7 h-7→w-9 h-9`), a top-left type badge (`"Académie"` — see Section 7 for why this is a real, not fabricated, value), and a bottom-right Avis overlay (real `rating`/`reviewCount`, only rendered when `reviewCount > 0`). Preserved untouched: cover image, description, course count, distance, favorite logic/behavior.

## 5. Formation card changes
`TrainingCard` now delegates to `AcademyMappedCourseCard`: image-on-top (`aspect-[4/3]`), academy-name badge top-left, favorite top-right (same existing `toggleAcademyCourse` call), availability dot bottom-left (real `academyIsAvailable`), category badge bottom-right (real `course.category`, shown only when non-empty — no fabricated per-category icon, since no such taxonomy exists for Academy), then title → description → Level/Certification/Duration meta row (Academy-specific data, preserved, not present in Marketing) → price+Avis row (same visual hierarchy as Marketing's final service card). Formation title remains the real `course.title`, never replaced by category.

## 6. Grid changes
Both the Organization grid and the Formation grid now use `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4` — identical classes, same as Marketing's own unified grids (from the two prior Marketing tasks this session). The Organization section's old horizontal-scroll/fixed-width mode was removed (mirrors the exact fix applied to Marketing's own Agency grid). Loading skeletons updated to match (height/column count).

## 7. Distance changes (and the two real backend gaps this surfaced)
- **Organization cards** (`/academy` list) already had real `distanceKm` (`getAcademyCompanyCards`, built in an earlier task) — untouched.
- **Academy Store Details header**: `getAcademyProfileCard` never computed distance at all. Added `viewerLocation` param + `distanceKm` computation (mirrors `getMarketingCard`'s exact pattern — `parseLatLng`/`haversineKm`), wired through the `GET /api/academy/profile/:userId` route (now passes the viewer's own `locationLat`/`locationLng`), and the client `AcademyProfileCard` type. Header now reads `{courses.length} formation(s) · {formatDistance(card.distanceKm)}` instead of the raw address.
- **Per-course availability**: `AcademyCourseCard` (both the shared type in `shared/schema.ts` and the client type in `use-barista-academy.ts`) had no availability field at all, unlike Marketing's `agencyIsAvailable`. Added `academyIsAvailable: boolean` (`!academyProfiles.isOnVacation`), computed in all three storage functions that build an `AcademyCourseCard` (`getPublishedAcademyCourses`, `getAcademyCourseCard`, and `getAcademyProfileCard`'s own course list) — each already had the `academyProfiles` row joined/fetched, so this is a zero-new-query addition.
- **Organization type badge**: Academy has no `profileType`-equivalent column (confirmed via schema audit — `academyProfiles` has no such field). The badge uses the fixed string `"Académie"`, the same real descriptor this exact card's own favorite-toggle call (`type: "Académie"`) already used before this task — not a fabricated per-record value, since every organization on `/academy` genuinely is one.
- No multiple/competing distance calculation was introduced — all three contexts (`/academy`, Academy Store Details, the shared Formation card) read from the same `parseLatLng`/`haversineKm` pair already used by every other service this session, via `formatDistance()` from `client/src/lib/distance.ts`.

## 8. Store Details changes
Header distance (see Section 7); Disponibilité/Avis/Signaler action icons were **already present and already matching** the Marketing reference exactly (verified, not re-built); Formation cards now reuse the exact same shared `AcademyMappedCourseCard` as `/academy`'s own grid (no third, separately-drifting card design); grid moved to 4 columns.

## 9. Detail modal changes
**None required.** `AcademyDetailModal` was already built (in an earlier session task) with the identical hero-cover + black/40-backdrop circular close/favorite/Signaler/Disponibilité/Avis-button treatment as Marketing's `MarketingServiceDetailModal` — verified side-by-side, no drift found. Category is already shown in the modal's info grid. Address+distance are shown together in the modal (not distance-replacing-address) — this matches Marketing's own `MarketingServiceDetailModal`, which also keeps both in its full detail view (the address→distance swap only applies to space-constrained card/header contexts, per the actual reference behavior).

## 10. Nested modal behavior
`AcademyDetailModal`'s "Académie" section opens `AcademyProfileModal` as a sibling Radix `Dialog` (not a `DropdownMenu`-in-`Dialog`, which was the actual root cause of the one nested-modal bug fixed earlier this session). This is structurally identical to Marketing's own `MarketingServiceDetailModal` → `MarketingDetailModal` pattern, which has gone through multiple rounds of testing this session without a reported dismiss issue. No code change was needed or made; verified by direct structural comparison rather than live interaction (see Section 12).

## 11. Responsive behavior
Both new/updated grids use the exact same breakpoint set as Marketing's own (`1 → sm:2 → md:3 → lg:4`), so mobile/tablet/desktop behavior is identical by construction (same Tailwind classes, not a parallel system). No Academy-only breakpoint was introduced.

## 12. Tests executed
- `npx tsc --noEmit`: clean (after fixing 3 call sites in `server/storage.ts` that needed the new `academyIsAvailable` field once it became required on `AcademyCourseCard`).
- `npm run build`: clean (client + server).
- SQL sanity check (`psql`): confirmed `academy_profiles.is_on_vacation`/`marketplace_visible` are real, non-fabricated columns backing the new availability dot.
- Confirmed live via the user's already-running dev server (Vite HMR): fetched the served grid classes for both the Organization and Formation grids on `/academy` and found the identical `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4` string (3 occurrences — org grid, formation grid, formation loading skeleton), and confirmed the new shared `academy-mapped-course-card.tsx` module is served.
- Backend changes (distance/availability computation, route param) require a server restart to take effect on the live instance, per this session's established, documented limitation — not restarted by me.
- Full visual/interactive browser verification (hover states, nested-modal click-through, exact pixel spacing) was **not performed** — no browser-automation tool available in this environment; stated honestly rather than claimed.

## 13. Remaining limitations
- The "Académie" organization-type badge is a fixed, real descriptor rather than a per-record field, because Academy's data model has no organization-type column — this is a deliberate, documented decision, not an oversight.
- The Formation category badge has no per-category icon (plain `GraduationCap` + real text) because Academy has no admin-managed category/icon taxonomy the way Marketing does — adding one would be a new business-logic feature, explicitly out of scope for a visual-synchronization task.
- Live backend verification (distance/availability actually rendering real numbers in a browser) could not be completed because it requires restarting the user's own dev server, which was not done without being asked.
