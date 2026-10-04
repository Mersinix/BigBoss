# Flash Preview — Item Mapping for Academy, Marketing, Print — Audit

## 1. Root cause of the missing item mapping

The previous task (`docs/flash_academy_marketing_print_audit.md`, v2) extended `AcademyFastSearch`/`MarketingFastSearch`/`PrintFastSearch` with a `previewMode` that reused the real component's chrome (correct accent color, Dialog sizing, badge) — but its `previewMode` branch **bypassed the courses/services/cards array entirely**, rendering only a static "name + Flash/photo image" hero card, with `courses={[]}`/`services={[]}`/`cards={[]}` passed from each caller. This satisfied the visual-chrome requirement but not the actual content: a Coffee Owner's real Fast Search always shows real, swipeable items; the preview showed none. This task fixes that gap by feeding each component with the authenticated professional's own real, correctly-filtered items.

## 2. Actual data relationships discovered

All three Coffee-Owner-facing endpoints already compute a fully-enriched card (joining the item with its owner's identity fields) and are **public** (no `requireAuth`) — confirmed by reading each route/storage method in full, not assumed from naming:

| Module | Ownership field | Coffee Owner's data source | Endpoint | Storage method |
|---|---|---|---|---|
| Academy | `academyCourses.academyUserId` (`.notNull()`, indexed) | `useAcademyCourses()` → `AcademyCourseCard[]` | `GET /api/academy/courses` | `getPublishedAcademyCourses` |
| Marketing | `marketingServices.marketingUserId` (`.notNull()`, indexed) | `useMarketingServices()` → `MarketingServiceCard[]` | `GET /api/marketing/services` | `getPublishedMarketingServices` |
| Print | `printCatalogItems.printerId` (`.notNull()`, indexed) | inline `useQuery` → `PrintCatalogCard[]` | `GET /api/print/marketplace` (**already accepts a `printerId` filter param**) | `getPrintMarketplaceCards` |

Each storage method applies the same visibility/approval gate before returning anything (read in full for all three, not assumed to match):
- `getPublishedAcademyCourses`: `academyCourses.isPublished = true AND users.role = 'BARISTA_ACADEMY' AND users.status = 'approved'`, then filtered again in application code for `academyProfiles.marketplaceVisible !== false AND academyProfiles.publicationStatus === 'APPROVED'` (the GO-Live gate).
- `getPublishedMarketingServices`: same shape — published services from approved, marketplace-visible, GO-Live-approved agencies only.
- `getPrintMarketplaceCards`: `printCatalogItems.isActive = true AND users.role = 'PRINTER' AND users.status = 'approved'`, plus an optional `printerId` AND-clause, then the same marketplace-visible/GO-Live filter applied in application code.

**Consequence, confirmed deliberately correct rather than a bug**: a professional whose own account is not yet GO-Live-approved will see an **empty preview** even if they have real published items — because a real Coffee Owner would not see them either yet. This is exactly "respect existing publication/approval/visibility rules," not a defect.

**Live verification performed** (not just code reading) against the running dev server:
- `GET /api/academy/courses` → 3 real courses, all `academyUserId: 55` ("Formation Tunisie", `publicationStatus: APPROVED`, `marketplaceVisible: true` — confirmed via a direct DB query).
- `GET /api/print/marketplace?printerId=28` → 4 items, and confirmed **identical** to filtering the full unfiltered `GET /api/print/marketplace` list (8 items total) down to `printerId === 28` by hand — proving the existing `printerId` server-side filter is correct and exactly equivalent to the client-side ownership filter used for the other two modules.
- `GET /api/marketing/services` → 3 real services, all `marketingUserId: 19`.

## 3. Components, endpoints, and queries reused

No new backend code was required for any of the three modules — every endpoint and its mapping/filtering logic already existed and was already public:

- **Academy**: `barista-academy/profile.tsx` now also calls the existing `useAcademyCourses()` hook (same one `barista-academy-page.tsx` uses for Coffee Owner) and filters the result to `academyUserId === user.id` with a `useMemo`.
- **Marketing**: `marketing/profile.tsx` now also calls the existing `useMarketingServices()` hook (same one `marketing-page.tsx` uses) and filters to `marketingUserId === user.id`.
- **Print**: `printer/profile.tsx` adds one new `useQuery` call hitting the **same** `/api/print/marketplace` endpoint `print-page.tsx` already uses, passing `?printerId=<own id>` — reusing the endpoint's own existing server-side filter rather than fetching everything and filtering client-side (the only module where this was possible, since the other two endpoints don't expose an equivalent server-side filter param).

## 4. Files modified and why

| File | Change |
|---|---|
| `client/src/components/academy/academy-fast-search.tsx` | `previewMode` no longer bypasses `courses`; it now reuses the normal swipe/filter/card rendering for any array passed in. Removed `previewName`/`previewFlashImageUrl`/`previewProfileImageUrl` (no longer needed — the real course cards already carry the academy's own identity). Kept `onOpenOwnDetail` as an empty-state-only fallback. Hero image now uses `getPreferredImageUrl(current.flashImageUrl, ...)` in preview mode only (a real, previously-unused field on `AcademyCourseCard` — see Section 5). Favorite/"S'inscrire" omitted only in preview mode; Filter/Info/prev-next stay functional in both modes. |
| `client/src/components/marketing/marketing-fast-search.tsx` | Same restructuring. `MarketingServiceCard` has no agency-level Flash field, so the per-item hero image is unchanged in both modes (it was already correct — the service's own image, exactly what Coffee Owner sees). Favorite/"Demander un devis" omitted only in preview mode. |
| `client/src/components/print/print-fast-search.tsx` | Same restructuring. `PrintCatalogCard` has no Flash field either, so the per-item hero image is unchanged in both modes. Favorite omitted only in preview mode. |
| `client/src/pages/barista-academy/profile.tsx` | Added `useAcademyCourses()` + `myPublishedCourses` (ownership-filtered `useMemo`); Flash preview now passes `courses={myPublishedCourses}`, `onOpenDetail` opens the existing `AcademyDetailModal` for that specific course (same as Coffee Owner's own Info action), empty-state fallback still reopens `AcademyProfileModal`. |
| `client/src/pages/marketing/profile.tsx` | Added `useMarketingServices()` + `myPublishedServices`; Flash preview now passes `services={myPublishedServices}`, `onOpenDetail` opens the existing `MarketingServiceDetailModal`, empty-state fallback reopens `MarketingDetailModal`. |
| `client/src/pages/printer/profile.tsx` | Added a `useQuery` reusing `/api/print/marketplace?printerId=<own id>`; Flash preview now passes `cards={myPublishedCatalog}`, `onOpenDetail` opens the existing `PrintServiceDetailModal`, empty-state fallback reopens `PrintCompanyDetailModal`. |
| `docs/flash_academy_marketing_print_mapping_audit.md` | This report. |

**Not modified**: any backend route, storage method, or schema (none needed — see Section 3); `BaristaFastSearch`, `MaintenanceFastSearch`, and their Coffee-Owner call sites; `client/src/pages/delivery/profile.tsx`, `client/src/pages/driver/profile.tsx`; the three Coffee-Owner call sites of the edited components (`barista-academy-page.tsx:585`, `marketing-page.tsx:568`, `print-page.tsx:596` — all three re-confirmed to pass no `previewMode`, so their behavior is unaffected).

## 5. How preview mode retrieves and filters the correct items

- **Academy/Marketing**: the professional's own profile page calls the exact same public, already-authorized hook the Coffee Owner's own Fast Search uses (`useAcademyCourses()`/`useMarketingServices()`), then applies one `.filter()` by the authenticated `user.id` against the card's own `academyUserId`/`marketingUserId` field — both confirmed present on every returned card (Section 2). This guarantees the preview can never show an item that wouldn't already be visible to a real Coffee Owner, and can never show another provider's item, since it starts from the exact same already-correctly-scoped public dataset.
- **Print**: the professional's own profile page calls the same public endpoint with its own existing `printerId` query parameter — the filtering happens **server-side**, in the same `getPrintMarketplaceCards` code path Coffee Owner's own marketplace list and any other `printerId`-scoped caller already use.
- In all three cases, **no query was previously disabled in `previewMode`** that needed re-enabling — the gap was that the right query simply wasn't being called from these three pages at all before this task; adding it was additive, not a fix to a broken disable.

## 6. How read-only behavior is enforced

- **Favorite** (all three) and **"S'inscrire"/"Demander un devis"** (Academy/Marketing) are now rendered conditionally on `!previewMode` — in preview mode, these buttons do not render at all, so their `useFavorites`/`onEnroll`/`onRequestQuote` callbacks can never be invoked from this surface.
- **Filter** and **Info** remain fully functional in preview mode — both are read-only by nature (local array filtering; opening a read-only detail modal) and were explicitly kept per the task's instruction to preserve "existing Info button behavior and existing read-only detail modals."
- **Info**, in preview mode, now opens the **real, specific item's** existing read-only detail modal (`AcademyDetailModal readOnly`, `MarketingServiceDetailModal readOnly`, `PrintServiceDetailModal readOnly` — all three already existed and already had `readOnly` wired by an earlier task; none were modified). This is a genuine improvement in fidelity over the prior version (which could only reopen the agency/company-level profile modal, never a specific item).
- The **empty-state-only** "Voir mon profil" fallback (`onOpenOwnDetail`) still reopens each account's own pre-existing read-only profile modal (`AcademyProfileModal`/`MarketingDetailModal`/`PrintCompanyDetailModal`), unchanged from the prior task.
- None of the three Coffee-Owner call sites pass `previewMode`, so their Favorite/Enroll/Quote buttons, filter, and Info all continue to work exactly as before (confirmed via `git diff` showing zero changes to those three pages).

## 7. Authorization and data ownership checks

- All three underlying endpoints (`/api/academy/courses`, `/api/marketing/services`, `/api/print/marketplace`) are **public** (no session required) and were **already** the exact data a logged-out visitor or any Coffee Owner can retrieve — calling them from a professional's own profile page does not expose anything that wasn't already public, and does not bypass any authorization (there is no authorization to bypass on an already-public, read-only marketplace listing).
- The ownership filter (`academyUserId`/`marketingUserId === user.id`, or the server-side `printerId` param) only ever **narrows** what the authenticated user sees to their own subset of already-public data — it cannot be used to see another provider's **private** data, because none of these three endpoints ever return private data to begin with (only published/active/approved/visible rows, identical to what Coffee Owner sees).
- No client-supplied company/provider ID is trusted for anything privileged: the `printerId` passed to `/api/print/marketplace` is always `user.id` from the authenticated session (`useAuth()`), never a value from props, URL params, or user input — confirmed by reading the exact line added in `printer/profile.tsx`.
- No existing authorization check, role gate, or GO-Live gate was touched, loosened, or bypassed anywhere in this task.

## 8. Tests executed and their real results

No automated test suite exists in this project (confirmed, not assumed — no `test` script in `package.json`).

**Live, executed verification against the running dev server** (not merely code inspection):
- `GET /api/academy/courses` → returned 3 real courses, all belonging to academy user 55, matching a direct DB query of `academy_courses`/`academy_profiles` for that account's publication/visibility state. Confirms the Academy mapping end-to-end.
- `GET /api/print/marketplace?printerId=28` (4 items) vs. the full unfiltered `GET /api/print/marketplace` (8 items) manually filtered to `printerId === 28` (4 items) — **identical result**, confirming the server-side `printerId` filter this task relies on is correct.
- `GET /api/marketing/services` → 3 real services, all belonging to agency user 19.
- All scratch response files used for these checks were deleted immediately after.

## 9. TypeScript and build results

- `npx tsc --noEmit` — **clean, exit 0**, run after each of the six file edits (three components, three profile pages).
- `npm run build` — **succeeded** (`✓ built in 23.91s`; server bundled to `dist/index.cjs`, 2.0mb; same pre-existing >500kB chunk-size warning as every prior build in this project, unrelated).
- `git status` after all edits: exactly the 6 files in Section 4 plus this report show new changes from this turn; `delivery/profile.tsx`, `driver/profile.tsx`, and `maintenance/*` show diffs carried over from prior tasks only (confirmed unchanged by this turn).

## 10. Remaining manual browser verification

**No browser-automation tool was available in this session.** The data-layer correctness was verified live (Section 8), and the component logic was verified by direct code reading, but the following still need an actual rendered check:
1. Opening Espace Barista Academy's own Flash button as the seeded academy account (user 55) and confirming its 3 real courses actually render, swipe correctly, and that "Info" opens the correct course's detail.
2. Same for the Marketing account (user 19) and Print account (user 28), each with their real items.
3. Confirming the empty state (and its "Voir mon profil" fallback) renders correctly for a professional account with zero published items.
4. Confirming the Favorite/Enroll/Quote buttons are genuinely absent (not just styled differently) when inspecting the live DOM in preview mode, and that no network request fires when swiping/filtering.
5. Mobile layout check for all three previews, now rendering real multi-item swipe content instead of a single static card.
