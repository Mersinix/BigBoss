# Coffee Owner Favorites — Company vs. Item Split — Audit

## 1. Existing favorite architecture

- **Client cache**: `client/src/hooks/use-favorites.ts` — a single Zustand store (`useFavorites`), **no persistence middleware** (confirmed by reading the whole file — no `persist()`/`createJSONStorage`). It is a pure in-memory cache, re-hydrated on every page load via explicit `hydrateX(ids)`/`syncX(ids, cards)` calls fed by each page's own already-fetched data. The database is the only real source of truth; the client store can be freely reshaped without any risk of losing a user's actual favorites.
- **Favorites Modal**: `FavoritesPanel` inside `client/src/components/cafe/marketplace-layout.tsx` (~850 lines, not a separate file) — one `activeService: FavService` switcher (`"SHOP" | "MAINTENANCE" | "PRINT" | "BARISTA_MARKETPLACE" | "BARISTA_ACADEMY" | "MARKETING"`), each branch rendering a flat list for that one service.
- **Backend**: one dedicated table + 3 routes (`GET`/`POST`/`DELETE`) per module, all following the identical `requireAuth` → role-check (`POST` only) → `db.select` dedup-check → `db.insert`/`db.delete` pattern, confirmed by reading every route and storage method for Academy/Print/Marketing in full.

## 2. Root cause: company and item favorites are not actually independent today

Confirmed by reading every relevant table, route, storage method, and UI call site — not assumed from naming:

| Module | Table (today) | What it actually stores | Company favorite exists? | Item favorite exists? |
|---|---|---|---|---|
| Academy | `academyFavorites { userId, courseId notNull }` | Only a **course** id | **No** — no column, no route, no UI | Yes — `AcademyFastSearch` and `AcademyDetailModal` both call `toggleAcademy({ id: course.id, ... })`, genuinely course-keyed. |
| Print | `printFavorites { userId, printItemId notNull }` | Only a **catalog item** id | **No** — no column, no route, no UI | Yes — `PrintFastSearch` and `PrintServiceDetailModal` both call `togglePrint({ id: String(item.id), ... })`, genuinely item-keyed. |
| Marketing | `marketingFavorites { userId, marketingUserId notNull, serviceId nullable }` | Only ever a **marketingUserId** — `serviceId` column exists in the schema but is **never read or written anywhere** (confirmed: `getMarketingFavoritesByUser`/`addMarketingFavorite`/`removeMarketingFavorite`, the `POST`/`DELETE` routes, and every frontend caller all reference `marketingUserId` only) | Yes, already fully working | **No, despite appearances** — `MarketingFastSearch` and `MarketingServiceDetailModal`'s own "favorite" heart buttons both call `toggleMarketing({ id: service.marketingUserId, ... })` — i.e. clicking "favorite" on a *service* card silently favorites the **agency**, not the service. Confirmed by reading the exact `id:` passed at `marketing-service-detail-modal.tsx:185` and the equivalent in `marketing-fast-search.tsx`. This is precisely the "heart icon that looks functional but isn't doing what it visually represents" case the task warned about. |

**Conclusion**: all three modules need the *missing* favorite type added — Academy and Print need a brand-new company-level concept (schema + API + UI), and Marketing needs its already-declared-but-dead `serviceId` column finally wired up end-to-end (schema unchanged, only API/storage/UI).

## 3. Favorite icon audit — which ones are real

| Location | Entity favorited | Real or decorative? |
|---|---|---|
| `AcademyFastSearch` card | Course | Real (course-level, correct) |
| `AcademyDetailModal` | Course | Real (course-level, correct) |
| `AcademyProfileModal` (the org-level "Aperçu" modal) | — | **No favorite button exists at all** |
| `PrintFastSearch` card | Catalog item | Real (item-level, correct) |
| `PrintServiceDetailModal` | Catalog item | Real (item-level, correct) |
| `PrintCompanyDetailModal` | — | **No favorite button exists at all** |
| `MarketingFastSearch` card | *Looks like* a service; actually favorites the agency | Misleading — real mutation, wrong entity |
| `MarketingServiceDetailModal` | *Looks like* the service (`data-testid="button-fav-marketing-service-${service.id}"`); actually favorites the agency | Misleading — real mutation, wrong entity |
| `MarketingDetailModal` (agency-level) | Agency | Real (agency-level, correct) — this is the one already-working company favorite in the whole app, and the reference implementation this task extends to Academy/Print. |

## 4. Smallest safe implementation approach

- **Academy**: add `academyUserId integer` (nullable) to `academyFavorites`; make `courseId` nullable. A row with `courseId = null` is an organisation favorite; a row with `courseId` set is a course favorite (and also stores `academyUserId` for that course, matching the existing `marketingFavorites.marketingUserId`-always-set / `serviceId`-sometimes-set shape exactly). Backfill the 3 existing rows' `academyUserId` from `academyCourses.academyUserId` via one SQL `UPDATE … FROM`.
- **Print**: add `printerId integer` (nullable) to `printFavorites`; make `printItemId` nullable. Same shape, same reasoning. Backfill the 6 existing rows' `printerId` from `printCatalogItems.printerId`.
- **Marketing**: **no schema change** — wire the already-declared `serviceId` column through the route/storage layer for the first time, and fix the two UI call sites that were silently substituting the agency id.
- All three: new `DELETE` sub-routes for the company case (`/organisation/:academyUserId`, `/company/:printerId`, keep `/:marketingUserId` for the agency but scope its `DELETE` to `serviceId IS NULL` only, and add `/service/:serviceId` for service removal) — additive, the existing item-level `DELETE /:courseId` / `DELETE /:printItemId` routes are untouched.
- Client store (`use-favorites.ts`): split each of the three single buckets into two — `academyCourses`/`academyOrganisations`, `printProducts`/`printCompanies`, `marketingAgencies`/`marketingServices` — safe to do freely since the store has no persistence (Section 1); every existing caller is updated to the new, more specific name, with **identical** behavior for the item-level ones (pure rename) and newly-correct behavior for the two Marketing call sites that were wrong.

## 5. Database/schema changes actually made

- `shared/schema.ts`: `academyFavorites.academyUserId` (nullable `integer`) added; `academyFavorites.courseId` made nullable. `printFavorites.printerId` (nullable `integer`) added; `printFavorites.printItemId` made nullable. `marketingFavorites` — **no schema change** (its `serviceId` column already existed, unused).
- Applied via `npm run db:push` (project convention — confirmed clean, no destructive-change prompts since every change was additive/nullable).
- One-off backfill (raw SQL `UPDATE … FROM`, run once, not a migration file): `academy_favorites.academy_user_id` populated from `academy_courses.academy_user_id` by `course_id` (3 rows); `print_favorites.printer_id` populated from `print_catalog_items.printer_id` by `print_item_id` (6 rows). Verified before/after row-by-row; no row was deleted or reset.

## 6. Backend API changes

New storage methods (`server/storage.ts`), all NULL-aware (`isNull`/`isNotNull` on the item-id column distinguishes a company-only row from an item row, mirroring the existing `marketingFavorites.serviceId` shape):
- `getAcademyOrganisationFavoritesByUser` / `addAcademyOrganisationFavorite` / `removeAcademyOrganisationFavorite`
- `getPrintCompanyFavoritesByUser` / `addPrintCompanyFavorite` / `removePrintCompanyFavorite`
- `getMarketingServiceFavoritesByUser` / `addMarketingServiceFavorite` / `removeMarketingServiceFavorite`
- Existing `getMarketingFavoritesByUser` / `addMarketingFavorite` / `removeMarketingFavorite` were re-scoped to `serviceId IS NULL` so removing the agency favorite can never delete a service favorite for that same agency (previously this distinction didn't exist because `serviceId` was never used at all).
- Existing `getAcademyFavoritesByUser` / `getPrintFavoritesByUser` were re-scoped to `courseId`/`printItemId IS NOT NULL` so a company-only row is never returned as if it were an item favorite.

New routes (`server/routes.ts`), additive siblings of the existing item-level routes (no path collision — Express disambiguates by segment count):
- `GET/POST /api/academy-favorites/organisations`, `DELETE /api/academy-favorites/organisations/:academyUserId`
- `GET/POST /api/print-favorites/companies`, `DELETE /api/print-favorites/companies/:printerId`
- `GET/POST /api/marketing-favorites/services`, `DELETE /api/marketing-favorites/services/:serviceId`
- Every `POST` still requires `requireAuth` + `role === "CAFE_OWNER"`, and every add/remove is keyed by `req.session.userId`/`user.id` — never a client-supplied user id — identical to the existing routes' pattern.
- Duplicate favorites are prevented by a `select` existence-check before each `insert` (same pattern as the pre-existing routes), scoped so a company-only check never matches an item row and vice versa.

## 7. Files modified and the reason for each

| File | Change |
|---|---|
| `shared/schema.ts` | Added `academyUserId`/made `courseId` nullable on `academyFavorites`; added `printerId`/made `printItemId` nullable on `printFavorites` (Section 5). |
| `server/storage.ts` | Added the 9 new storage methods above; re-scoped the 4 existing ones; added 6 new `IStorage` interface declarations (Academy/Print — Marketing's own existing methods were never declared on the interface either, so left consistent). |
| `server/routes.ts` | Added the 9 new routes above (3 modules × GET/POST/DELETE). |
| `client/src/hooks/use-favorites.ts` | Rewrote: split `print`/`academy`/`marketing` into 6 buckets (`printProducts`/`printCompanies`, `academyCourses`/`academyOrganisations`, `marketingAgencies`/`marketingServices`), each with its own `toggleX`/`removeX`/`hydrateX`/`syncX`; added `PrintCompanyFavItem`/`AcademyOrgFavItem`/`MarketingServiceFavItem` types; updated `selectTotalFavCount`. Safe to restructure freely — confirmed in Section 1 that this store has no persistence middleware, so the SQL tables are the only real source of truth. |
| `client/src/components/academy/academy-profile-modal.tsx` | Added a real, working organisation-level favorite (Heart) button in the header icon row, using the exact existing `w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm …` convention (previously **no favorite button existed here at all** — Section 3 finding). |
| `client/src/components/print/print-company-detail-modal.tsx` | Same fix — added a real company-level favorite button, same convention (previously **no favorite button existed here** either). |
| `client/src/components/marketing/marketing-service-detail-modal.tsx` | Fixed the misleading favorite button — it now calls `toggleMarketingService({ id: service.id, … })` instead of silently favoriting the agency (`service.marketingUserId`) as it did before (Section 3's core finding). |
| `client/src/components/marketing/marketing-fast-search.tsx` | Same fix as above — `triggerFavorite` now targets the service, not the agency. |
| `client/src/pages/cafe/marketing/marketing-page.tsx` | `ServiceCard`'s favorite button fixed (same bug as the two files above); renamed `syncMarketing`→`syncMarketingAgency`; added `syncMarketingService` fed by the already-fetched `services` list. |
| `client/src/components/marketing/marketing-detail-modal.tsx` | Rename-only (`s.marketing`→`s.marketingAgencies`, `toggleMarketing`→`toggleMarketingAgency`) — this button was already correct. |
| `client/src/pages/cafe/print/print-page.tsx`, `client/src/components/print/print-fast-search.tsx`, `client/src/components/print/print-service-detail-modal.tsx` | Rename-only for the already-correct item-level favorite (`print`→`printProducts`, `togglePrint`→`togglePrintProduct`); `print-page.tsx` additionally gained a `printCompanyFavoriteIds` query + `syncPrintCompany` effect, derived from the same already-fetched catalog cards. |
| `client/src/components/academy/academy-fast-search.tsx`, `client/src/components/academy/academy-detail-modal.tsx` | Rename-only (`academy`→`academyCourses`, `toggleAcademy`→`toggleAcademyCourse`) — already correct. |
| `client/src/pages/cafe/barista/barista-academy-page.tsx` | Rename-only for the course sync; added an `organisationFavoriteIds` query + `syncAcademyOrganisation` effect, derived from the same already-fetched course cards. |
| `client/src/components/cafe/marketplace-layout.tsx` | `FavoritesPanel` restructured: added `PrintSubTab`/`AcademySubTab`/`MarketingSubTab` state and three new sub-switcher UI blocks (ENTREPRISES/PRODUITS, FORMATIONS/ORGANISMES, AGENCES/SERVICES); split all three sync effects into 6; added 3 new row-list renderers (companies/organisations/services) reusing the exact existing row layout; wired `PrintCompanyDetailModal`/`AcademyProfileModal`/`MarketingServiceDetailModal` as new nested detail modals, each wired back to its sibling modal via the existing callback-based nested-navigation convention (no two modal files import each other). |
| `docs/coffee_owner_favorites_marketplace_audit.md` | This report. |

**Not modified**: Maintenance/Barista Marketplace/Shop/Pack favorites (untouched, verified via `git status`/`git diff` — same buckets, same routes, same storage methods); the Maintenance/Print nested-modal fix from the prior task; Delivery/Driver/other unrelated accounts; existing dark/light theme mechanism; existing responsive breakpoints; the design system (no new modal chrome — every new button/switcher reuses an exact existing class string).

## 8. Synchronization strategy

Every toggle (`toggleX`) updates the Zustand store synchronously (immediate UI update, no reload) and then fires the real API call; on a `.catch()` the store is **not** rolled back automatically by a separate mechanism — like every other favorite bucket in this app (confirmed: this is the pre-existing, unchanged pattern for all buckets, not something this task changed). Each marketplace page's own `syncX` effect re-derives the bucket from the server's favorite-id list plus the page's own already-fetched cards/courses/services on every load, which is what actually makes a failed mutation self-heal on the next page view — the same resilience the app already relied on before this task, now extended to the 3 new company/service buckets. The Favorites modal itself (`FavoritesPanel`) reads directly from the same global Zustand store used by every Fast Search/detail modal, so a toggle anywhere is reflected everywhere else instantly, including inside the modal, with no polling and no new event system — purely React re-renders from the shared store, exactly as the pre-existing buckets already worked.

## 9. Per-switcher filtering logic

- **ACADEMY**: `academySubTab` state (`"formations" | "organismes"`) selects between `academyCourseItems` (`Object.values(academyCourses)`, keyed by courseId) and `academyOrgItems` (`Object.values(academyOrganisations)`, keyed by academyUserId) — two disjoint Zustand buckets, never merged.
- **PRINT**: `printSubTab` (`"companies" | "products"`) selects between `printCompanyItems` (keyed by printerId) and `printProductItems` (keyed by catalog item id).
- **MARKETING**: `marketingSubTab` (`"agences" | "services"`) selects between `marketingAgencyItems` (keyed by marketingUserId) and `marketingServiceItems` (keyed by serviceId).
- Each sub-switcher is presentation-only routing between two independent store slices — it filters nothing by content, it simply picks which bucket to render, so there is no risk of a company accidentally appearing in the item list or vice versa.

## 10. Authorization / ownership protections

- Every new route requires `requireAuth` and, on `POST`, `role === "CAFE_OWNER"` — identical to the pre-existing routes.
- Every add/remove is keyed by `req.session.userId` (never a client-supplied user id) — verified by reading every new route handler; the client never sends its own user id for ownership purposes.
- Company vs. item favorites are never conflated: they live in different DB columns (`academyUserId` vs `courseId`, `printerId` vs `printItemId`, `marketingUserId`+`serviceId IS NULL` vs `serviceId` set) and every storage method's `WHERE` clause explicitly checks `isNull`/`isNotNull` on the item column — confirmed live (Section 11) that favoriting a company never creates/affects an item row and vice versa, even for the exact same provider.
- Duplicate-prevention is scoped per bucket (an existence check before insert), confirmed live to not create a second row on a repeated `POST`.

## 11. Tests executed and their real results

All of the following were executed against the running dev server (`npm run dev`, restarted mid-task so it would load the new `server/storage.ts`/`server/routes.ts` code) via direct `curl` calls, logged in as a real seeded `CAFE_OWNER` test account, with raw SQL `SELECT`s against the Postgres database to independently confirm each result (not just trusting the HTTP response):

1. **Academy organisation favorite**: `POST /api/academy-favorites/organisations {academyUserId:55}` → `201`; `GET /api/academy-favorites/organisations` → `[55]`; `GET /api/academy-favorites` (courses) → `[]` (unaffected) — confirmed independence. Repeating the same `POST` → `201` again but DB confirmed via direct `SELECT` that exactly **one** row existed (dedup works). `DELETE /api/academy-favorites/organisations/55` → `200`; subsequent `GET` → `[]`.
2. **Print company favorite, coexisting with a product favorite from the same printer**: `POST /api/print-favorites/companies {printerId:53}` → `201`. `POST /api/print-favorites {printItemId:3}` (item 3 belongs to printer 53) → `201`. Both `GET`s then returned `[53]` and `[3]` respectively — both present simultaneously for the same printer. `DELETE /api/print-favorites/companies/53` → `200`; immediately after, `GET /api/print-favorites/companies` → `[]` **and** `GET /api/print-favorites` → `[3]` (unchanged) — confirms removing the company favorite never touches the product favorite for the same company.
3. **Marketing — the core bug fix, verified live**: `POST /api/marketing-favorites {marketingUserId:19}` → `201` (agency). `POST /api/marketing-favorites/services {marketingUserId:19, serviceId:2}` → `201` (service 2 belongs to agency 19). Both `GET`s confirmed both exist independently (`[19]` and `[2]`). `DELETE /api/marketing-favorites/19` (the re-scoped agency-only delete) → `200`; immediately after, `GET /api/marketing-favorites` → `[]` **but** `GET /api/marketing-favorites/services` → `[2]` (untouched) — this is the exact scenario the audit flagged as broken before this task (favoriting/unfavoriting an agency could never have been scoped correctly before, since `serviceId` was dead code) and it is now confirmed correct.
4. **Data preservation**: before and after the full test run, the three tables' total row counts and every pre-existing row's `id`/`userId`/`itemId` were re-queried and confirmed byte-for-byte unchanged (3 academy, 6 print, and the original marketing row — plus one unrelated row added by independent real user activity during this session, left untouched since it predates and is unrelated to this task's testing).
5. One transient issue during testing, found and corrected, not a product defect: a few test-only rows briefly landed under a different seeded account than intended, due to a session hand-off during the dev-server restart this task required; all such test artifacts were identified by exact timestamp/content match and deleted via direct SQL, with the genuinely pre-existing and genuinely-unrelated rows left untouched.
6. `npx tsc --noEmit` — clean, exit 0, run after every backend and frontend change.
7. `npm run build` — succeeded (`✓ built in 24.32s`; server bundled to `dist/index.cjs`, 2.0mb; same pre-existing >500kB chunk-size warning as every prior build in this project, unrelated).
8. No automated test suite exists in this project (confirmed — no `test` script in `package.json`), consistent with every prior task in this session.

## 12. Remaining manual verification

**No browser-automation tool was available in this session** — the following were not performed and still need an actual rendered check:
1. Visual confirmation of the three new sub-switchers (ENTREPRISES/PRODUITS, FORMATIONS/ORGANISMES, AGENCES/SERVICES) rendering correctly in both dark and light mode, and at mobile width.
2. Visual confirmation that the new Heart buttons on `AcademyProfileModal`/`PrintCompanyDetailModal` render in the correct corner position alongside the existing Flag/Clock/Star/Zap icons without overlapping, across both themes.
3. Clicking a favorited company/organisation/service row inside the Favorites modal and confirming the correct nested detail modal opens (`PrintCompanyDetailModal`/`AcademyProfileModal`/`MarketingServiceDetailModal`) and that its own favorite button reflects the already-favorited state immediately.
4. Confirming the heart icon's fill state updates instantly (no reload) when toggled from a Fast Search card, a detail modal, and the Favorites panel in sequence, in a real browser tab.
5. Confirming an optimistic toggle rolls back visually on a real forced API failure (e.g. offline network) — the rollback behavior itself is unchanged from the pre-existing buckets (Section 8), not independently re-verified by rendering.
