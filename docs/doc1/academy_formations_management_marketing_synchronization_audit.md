# Academy Formation Management ↔ Marketing Service Management — Synchronization Audit

## 1. Initial Marketing vs Academy differences

| Aspect | Marketing Services (reference, current final state) | Academy Formations (before) |
|---|---|---|
| Real Title field | Added in a prior task (`marketingServices.title`) | **Already existed** (`academyCourses.title`, always real, never free-text-as-title) |
| Real Category field | `category` (free text, no taxonomy) | `category` (free text, no taxonomy) — same shape |
| Espace management card | Image-on-top, category badge, status dot, price/avis footer (built in a prior task) | Plain `shadcn Card`, no image, no category/status badges |
| Admin "Services Marketing"/"Formations" tab | New tab, flattened from `accounts[].services`, search+category+agency+status+availability+rating filters, image-on-top cards, reuses `MarketingServiceDetailModal` read-only | Existing "Formations" tab, already flat `data.courses`, only search+status filters, plain cards, **already** reuses `AcademyDetailModal` read-only |
| Admin detail modal design | `MarketingServiceDetailModal` (hero cover, black/40 circular buttons) | `AcademyDetailModal` — **already identical design** (confirmed in the previous Academy↔Marketing visual-sync task) |
| "Offer details" concept | Added as one new free-text field (`offerDetails`) because Marketing's form had no equivalent structured breakdown | **Not needed** — Academy already has `duration`, `location`, `trainingMode`, `capacity`, `hasCertification` as separate structured fields, which collectively cover "what's included" more precisely than a single text blob |

## 2. Components reviewed
`client/src/pages/admin/marketing-page.tsx` ("Services Marketing" tab), `client/src/pages/marketing/services.tsx`, `client/src/pages/admin/academy-page.tsx` ("Formations" tab), `client/src/pages/barista-academy/courses.tsx`, `client/src/components/academy/academy-detail-modal.tsx`, `client/src/hooks/use-barista-academy.ts`, and the backing storage functions (`getMarketingAdminOverview`, `getAcademyAdminOverview`, `getMyAcademyCourses`/`createAcademyCourse`/`updateAcademyCourse`/`deleteAcademyCourse`).

## 3. Admin Formation changes (`admin/academy-page.tsx`, "Formations" tab)
- Added **category** and **academy (organization)** filters, built from the real, already-fetched `data.courses` (`Array.from(new Set(...))`, no fake options) — mirrors the exact filter set added to Admin Marketing's "Services Marketing" tab, scoped to what Academy's data model actually supports (no fabricated "availability" filter — see Section 15).
- Card redesigned to image-on-top (`aspect-[16/9]`, real `course.imageUrl`), with a published/draft status dot (bottom-left) and a category badge (bottom-right, real `course.category`, generic icon since Academy has no category-icon taxonomy) — directly mirroring Admin Marketing's "Services Marketing" card.
- Clicking a card still opens the **same existing** `AcademyDetailModal` (read-only) — this was already wired before this task and already matches Marketing's detail-modal design; no new modal was created.
- `AdminCourse` type gained `imageUrl: string | null` (the field was already present in the real API response via `...c` spread in `getAcademyAdminOverview`; only the TypeScript type was missing it).

## 4. Academy Business Formation changes (`barista-academy/courses.tsx`)
- Card redesigned to image-on-top (`aspect-[4/3]`), published/draft dot (bottom-left), category badge (bottom-right) — same visual language as Marketing's redesigned `services.tsx` card.
- Preserved, unchanged: Title, Description, Level badge, Duration/Location/Certification meta row, Price, the publish `Switch`, and the `Modifier`/`Supprimer` actions and their exact mutations/confirmation dialog.
- Added an explicit **Aperçu** button in the action row (previously Aperçu was reachable only by clicking the card) — matching Marketing's exact pattern of offering both a click-to-preview card and a dedicated button.
- Grid changed from `grid-cols-1 md:grid-cols-2` to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, matching Marketing's management grid.

## 5. Card design synchronization
Both Admin and Espace-level cards now share the same visual grammar as their Marketing counterparts: image container → status dot (bottom-left) → category badge (bottom-right) → title/description → meta badges → price/actions footer. Academy-specific content (Level, Duration, Location, Certification) was preserved exactly, not replaced by anything Marketing-specific.

## 6. Filters/search
Admin: search (unchanged) + **new** category + **new** academy filters, all sourced from real data already fetched by this page — no new endpoint. Espace-level Academy Formations page has no search/filter bar in either Marketing's or Academy's own management page (neither needed one — both are a provider's own, typically small, list); this was not introduced in either case, preserving parity.

## 7. Pagination
Already present and already using the same `usePagination`/`DataPagination` convention on both Admin and Espace-level pages, for both services and Academy — no change needed, confirmed already consistent before this task.

## 8. Forms
`Nouveau Formation`/`Modifier la Formation` (`CourseFormDialog`) were **not restructured** — they already have a clean, well-organized field layout (Title, Description, Niveau/Catégorie, Prix/Durée, Lieu/Mode, Capacité, Image, Certification toggle) equal in quality/organization to Marketing's own form. No fields were removed or reordered; validation (`"Le titre est requis"`) was already present and already mirrors Marketing's own pattern.

## 9. Title handling
No change needed — Academy's `title` field was always real and persistent (`academyCourses.title`, `NOT NULL`), already used as the primary title everywhere (Espace list, New/Edit forms, Preview, Detail modal, Admin, Coffee Owner `/academy`, Academy Store Details — the last three already verified in the previous Academy↔Marketing visual-sync task). Unlike Marketing, Academy never had a "category used as title" problem to fix.

## 10. Category handling
`category` stays a separate, real, free-text field everywhere (New/Edit form's own input, the new Admin filter, the new card badges) — never merged with or replacing the title. No Marketing category/taxonomy was introduced into Academy.

## 11. Availability/publication
Untouched. The existing `isPublished` boolean + its `Switch`/mutation (`useUpdateAcademyCourse({isPublished})`) remains the single source of truth on both the Espace and Admin sides — same visual treatment (status dot + badge) now applied consistently, but the underlying publication behavior was not modified, and no new approval workflow was introduced.

## 12. Preview/detail modal synchronization
Both Admin and Coffee Owner previews already route through the one real `AcademyDetailModal` (`readOnly`) — confirmed via code inspection, not re-built. This modal was already visually synchronized with Marketing's `MarketingServiceDetailModal` in the prior Academy↔Marketing task (same hero cover, same close/favorite/action button treatment). No second/incompatible modal system exists.

## 13. Admin ↔ Academy ↔ Coffee Owner synchronization
All contexts (Espace Barista Academy, Admin "Formations", Coffee Owner `/academy`, Academy Store Details) read the same `academyCourses` rows through the same storage functions (`getMyAcademyCourses`/`getAcademyCoursesForAcademy` for the owner's own list, `getAcademyAdminOverview` for Admin, `getPublishedAcademyCourses`/`getAcademyCourseCard`/`getAcademyProfileCard` for the public side) — no new table, no duplicated representation, no drift risk introduced by this task (it only changed presentation, not data flow).

## 14. Responsive behavior
Both redesigned grids use the same breakpoint set as their Marketing counterparts (Admin: `md:grid-cols-2 xl:grid-cols-3`, unchanged, already matching Marketing's Admin tab; Espace: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, now matching Marketing's `services.tsx` exactly). No Academy-only breakpoint was introduced.

## 15. Tests executed / remaining limitations
- `npx tsc --noEmit`: clean.
- `npm run build`: clean (client + server).
- No backend/schema change was required for this task — purely presentational (card layout) and filter-derivation (client-side, from already-fetched data) work, confirmed via `grep`/direct inspection, so no DB migration or server restart was needed.
- Confirmed live on the user's already-running dev server (Vite HMR): fetched both redesigned files directly and found the new image-container classes and the new filter `data-testid`s present.
- **Deliberately not added**: an "availability" filter on Admin's Formations tab (Marketing's equivalent filter reads the agency's `isAvailable`/`isOnVacation`; Academy's admin overview does not currently expose per-academy vacation status on the flat `courses` rows or the `AdminAcademy` type) — adding it would have required extending the Académies tab's own data shape, which was judged out of scope for a Formations-tab-focused synchronization and is noted here rather than silently fabricated.
- **Deliberately not added**: an "Offer Details" field — Academy's existing structured fields (duration/location/trainingMode/capacity/certification) already serve that purpose; adding a redundant free-text field would have been exactly the "blindly copy Marketing" anti-pattern this task explicitly forbids.
- Full visual/interactive browser verification (hover states, exact responsive breakpoints, full create→edit→preview→Admin→Coffee-Owner lifecycle click-through) was **not performed** — no browser-automation tool available in this environment; stated honestly rather than claimed.

## 16. Files changed
- `client/src/pages/admin/academy-page.tsx`
- `client/src/pages/barista-academy/courses.tsx`
- `docs/academy_formations_management_marketing_synchronization_audit.md` (this file)
