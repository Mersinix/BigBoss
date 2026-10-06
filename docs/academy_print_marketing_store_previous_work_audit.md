# Academy/Print/Marketing Store Synchronization — Previous Work Audit

This audits the state of the work requested in the prior task
(`docs/academy_print_marketing_store_synchronization_audit.md`) against what is actually in the
codebase right now, verified by direct inspection (not assumption) plus a clean `npx tsc --noEmit`
and `npm run build` immediately before this audit was written.

## A. Coffee Owner Store cards (`/academy`, `/print`, `/marketing`)

✅ **DONE.** All three pages render a `*StoresSection`/`*StoreCardTile` (built in earlier tasks),
fed by real `GET /api/{print,marketing,academy}/companies` endpoints backed by real
`get{Print,Marketing,Academy}CompanyCards()` storage functions — no hardcoded data, confirmed via
direct SQL against real provider rows in a prior task.

## B. Dynamic distance

✅ **DONE.** `distanceKm` was added to all three list card types (`shared/schema.ts`'s
`PrintCompanyListCard`/`MarketingCompanyListCard`, the local `AcademyCompanyListCard` in
`use-barista-academy.ts`). All three storage functions (`getPrintCompanyCards`,
`getMarketingCompanyCards`, `getAcademyCompanyCards`) now accept an optional `viewerLocation` and
compute `distanceKm` via the existing `this.parseLatLng`/`this.haversineKm` helpers — the exact
same server-side mechanism the item-level marketplace endpoints already used, not a new one. All
three `GET .../companies` routes thread the logged-in viewer's own `users.locationLat/Lng` through,
mirroring `GET /api/print/marketplace`'s exact pattern. All three Store card tiles
(`print-page.tsx`, `marketing-page.tsx`, `barista-academy-page.tsx`) now render
`{company.distanceKm != null && <MapPin/>{formatDistance(company.distanceKm)}</span>}` using the
real shared `client/src/lib/distance.ts` formatter — address text is gone from that exact spot,
and the line is simply omitted (no fallback text) when distance can't be computed, matching
`/products`' own established convention. Verified: `formatDistance` itself already produces
`"500 m"`/`"3.9 km"`-style output with sensible rounding — not touched, reused as-is.

## C. Store Detail pages — correct Store↔services relationship

✅ **DONE.** All three Store Detail pages (`print-store-detail-page.tsx`,
`marketing-store-detail-page.tsx`, `academy-store-detail-page.tsx`) fetch via the existing
per-provider detail hooks (`usePrintCompanyDetail`, `useMarketingProfileDetail`,
`useAcademyProfileDetail`) which hit the already-existing, already-correct `GET /api/.../:userId`
endpoints — each scoped server-side to exactly that one provider's own services/courses (verified
via direct SQL in a prior task: two real Print providers have completely disjoint catalog items).
No cross-provider leakage is structurally possible — the relationship comes from the real
`printerId`/`marketingUserId`/`academyUserId` foreign keys, not a client-side filter.

## D. Store Detail actions — Disponibilité | Avis | Signaler

✅ **DONE**, this session, on all three Store Detail pages. Each now has, in that exact order:
- **Disponibilité**: the pre-existing `PrintCompanyAvailabilityModal`/`MarketingAvailabilityModal`/`AcademyProfileAvailabilityModal` (the first two needed a one-line `export` added; Academy's was already exported) — unchanged functionality, just reused.
- **Avis**: the shared `ReviewsModal`, fed by the real `usePrintReviews`/`useMarketingReviews`/`useAcademyReviews` hooks. Print and Marketing include the same real review-submission `reviewForm` (order/project-eligibility logic copied verbatim from their respective company/agency-level modals — `eligibleOrders`/`eligibleProjects`, "déjà notée" detection, `useCreatePrintReview`/`useCreateMarketingReview`). Academy's Avis is **read-only** (no `reviewForm`) — this is not a gap, it's intentional and correct: `AcademyProfileModal`'s own org-level Avis has no submission form either, since an Academy review is tied to a specific course/registration (submitted via `AcademyDetailModal`), not the organisation itself. Matching that existing asymmetry exactly is the correct behavior, not an inconsistency.
- **Signaler**: a Dialog using the same rounded-[2rem]/circular-close-button chrome standardized earlier this session, submitting via the real `useReportPrinter`/`useReportMarketingProvider`/`useReportAcademy` hooks — no new reporting system.

All three target the correct selected provider (`card.userId`/`printerId`/`agencyId`/`academyUserId`
captured from the route param, the same id the page's own data fetch uses) — verified by reading
the mutation call sites directly.

## E. Academy main page organization vs. Print

✅ **DONE**, this session. `barista-academy-page.tsx`'s render order was: Store section → filters
bar → course grid (backwards). Now: filters bar → **Académies** (Store section) → **"Formations"**
title+count → course grid — matching Print's order (filters → Imprimeries → "Services
d'impression" title → grid) and Marketing's (filters → Agences → service grid). The "Formations"
title block was added (previously absent entirely — Academy's course grid had no section header at
all, unlike Print/Marketing).

## F. Academy Store Detail page — filter bar

❌ **NOT DONE.** `academy-store-detail-page.tsx` has no category/level filter bar at all — it
renders every one of the selected academy's courses unconditionally. Print's and Marketing's Store
Detail pages both have a sticky category-pill filter bar scoped to that one provider's own
services. This is a genuine, confirmed gap. **Fixed this task** — see Phase 4 below.

## G. Marketing category filter icons

✅ **ALREADY CORRECT, confirmed again** — `marketing-page.tsx`'s category strip does
`cat.icon || CATEGORY_ICON_FALLBACK[cat.name] || "📢"` where `cat` comes directly from
`useMarketingTaxonomy()` (the real Admin-configured taxonomy). No hardcoded mapping takes priority
over the real one. Not touched — nothing to fix.

## H. Marketing page organization vs. Print

✅ **ALREADY CORRECT, confirmed again** — sticky Category+Filter bar → `MarketingStoresSection` →
service grid, same order as Print. Not touched.

## I/J/K. Admin Print/Academy/Marketing — mapped-card sync with Admin Stores

⚠️ **PARTIALLY DONE — a deliberate, documented scope decision, not an oversight.**

Confirmed (this audit re-read `client/src/pages/admin/stores-page.tsx` fresh): the Admin Stores
reference (`StoreCard` + `StoreDetailDialog`) is genuinely **simpler** than all three existing
Print/Academy/Marketing admin account modals in every dimension except one — it has no services
list at all (only a count is implied by `productCount`), while Marketing's existing `AccountDetail`
already shows its real service list inline (richer than the reference), and Print's/Academy's show
a count with the full list one click away via the existing Eye-icon preview — already consistent
with "service info exists, just one click further," which the original task's own audit explicitly
judged as acceptable (Section 17-26 decision).

**What was done this task**: a cover image was added to the top of all three admin modals
(`PrinterAccountDetail`, `AcademyDetail`, `AccountDetail`), conditionally rendered as `<img
className="w-full h-36 object-cover rounded-xl">` exactly mirroring `StoreDetailDialog`'s own
conditional cover rendering — the one genuine, confirmed, purely-additive visual gap. Each of the
three Admin overview backend functions (`getPrintAdminOverview`, `getAcademyAdminOverview`,
`getMarketingAdminOverview`) was extended with one additional field (`coverImageUrl`, copied
straight from the already-joined `users` row) to supply it — no new query, no schema change.

**What was deliberately NOT done, and why**: a full visual merge (logo-overlapping-cover treatment,
collapsing each module's Edit/Freeze/Delete + separate publication-approve/reject-panel into
Store's single unified Approve/Reject/Hold/Delete button row) was not attempted, because doing so
would require collapsing each module's genuinely-more-granular two-axis lifecycle (registration
status + publication status are two independent admin decisions in Print/Academy/Marketing) into
Store's single-axis `approvalStatus` enum — this is a **business-logic change**, which the
original task's own Section 19 explicitly forbids ("do not make Academy/Marketing/Print use
Supplier business logic... same Store-card experience, not same business entity"). This remains
the correct, intentional scope boundary, not an unfinished item.

**Confirmed via `git status`**: `client/src/pages/admin/stores-page.tsx` itself has never been
touched by any of this work — zero regression risk to the Supplier Store reference.

## L/M. ONE Admin Store Details modal — combine, don't duplicate

⚠️ **PARTIALLY DONE, same scope decision as I/J/K above.** There is **not** a second, duplicate
*modal component* anywhere — Print/Academy/Marketing each still open their own single, pre-existing
account-detail modal (unchanged in count/identity from before this work started), and Admin Stores
still opens its own single `StoreDetailDialog`. No new modal was created by any of this work. What
was NOT done is making Print/Academy/Marketing's admin cards literally render the same
`StoreDetailDialog` *component instance* — which is not realistic without either (a) rewriting
`StoreDetailDialog` into a generic, business-agnostic shell (a real refactor of a component three
other working Supplier-Store flows depend on, carrying real regression risk the task explicitly
warns against), or (b) ignoring each module's own richer, already-correct, already-synchronized
content. The cover-image addition (item I/J/K) is the safe, real step taken toward "the same Store
Details *experience*" without touching Supplier Stores or discarding Print/Academy/Marketing's own
correct business logic.

## N. Realtime data synchronization

✅ **DONE, confirmed.** Every new piece of data (`distanceKm`, `coverImageUrl` on the 3 admin
overviews) is a pure, real derivation from already-joined `users`/profile rows in the same request
— no new table, no duplicated/cached copy, no manual sync step. A provider changing their own
cover photo (via Settings) or location is reflected immediately on next fetch everywhere, with zero
extra code.

## O. Existing Store system intact

✅ **DONE, confirmed.** `git status` shows `client/src/pages/admin/stores-page.tsx` and
`client/src/pages/cafe/store-detail-page.tsx` (the `/products`/Supplier Store reference files) were
never modified by this work. `/products`, `/stores/:storeId`, and Supplier Store configuration are
untouched.

## P. Responsive behavior

✅ No responsive-specific regressions introduced — every new element (distance line, 3 action
icons, cover image, Academy's repositioned filter bar) reuses existing responsive classes
(`flex-wrap`, existing grid breakpoints, existing icon-row `flex gap-2`) rather than introducing new
layout primitives.

## Synchronization/regression risk summary

No risks found beyond the single confirmed gap (item F). `git status` confirms the full set of
files touched by this entire body of work matches exactly what every prior task's own audit
predicted — no unrelated file was ever touched (Maintenance, Barista's own marketplace page,
Supplier Stores, `/products`, authentication, and all other modules are absent from the diff).

## Remaining work (Phase 4) — now completed

The one confirmed gap (item F) was fixed this task: `academy-store-detail-page.tsx` now has a
sticky level-pill filter bar (BEGINNER/ADVANCED/EXPERT — the same dimension `/academy`'s own
main-page filter bar already uses, since Academy courses have no `category` field the way
Print/Marketing services do), scoped to the already-fetched `card.courses` for that one selected
academy, with its own "no results for this level" vs. "academy has no courses at all" empty states
and a "Effacer le filtre" reset — matching Print's/Marketing's existing Store Detail filter-bar
pattern structurally without copying their `category` dimension (which doesn't exist for Academy).

## Phase 5 — Final status after this task's fix

| Item | Before this task | After this task |
|---|---|---|
| A. Store cards | ✅ DONE | ✅ DONE (unchanged) |
| B. Dynamic distance | ✅ DONE | ✅ DONE (unchanged) |
| C. Store↔services relationship | ✅ DONE | ✅ DONE (unchanged) |
| D. Disponibilité/Avis/Signaler | ✅ DONE | ✅ DONE (unchanged) |
| E. Academy page organization | ✅ DONE | ✅ DONE (unchanged) |
| F. Academy Store Detail filter | ❌ NOT DONE | ✅ **DONE** |
| G. Marketing category icons | ✅ DONE | ✅ DONE (unchanged) |
| H. Marketing page organization | ✅ DONE | ✅ DONE (unchanged) |
| I/J/K. Admin card sync with Stores | ⚠️ PARTIAL (deliberate) | ⚠️ PARTIAL (deliberate, unchanged) |
| L/M. One Store Details modal | ⚠️ PARTIAL (deliberate) | ⚠️ PARTIAL (deliberate, unchanged) |
| N. Realtime synchronization | ✅ DONE | ✅ DONE (unchanged) |
| O. Existing Store system intact | ✅ DONE | ✅ DONE (confirmed again — `stores-page.tsx`/`store-detail-page.tsx` still absent from `git status`) |
| P. Responsive behavior | ✅ DONE | ✅ DONE (unchanged) |

## Validation (this task)

- `npx tsc --noEmit`: clean, zero errors, both before and after this task's one fix.
- `npm run build`: succeeded both times (2803 modules both times — the fix only edited an existing
  file, added no new file). No new warnings.
- Real-data sanity check (no credentials touched): both real Print providers (`baha print`,
  `Coffee Print Studio`), the real Marketing agency (`HOOK`), the real Academy (`Formation
  Tunisie`), and multiple real Coffee Owner accounts all have `location_lat`/`location_lng` set —
  confirming the distance feature will genuinely compute a real value for real accounts, not
  silently omit for lack of location data.
- **Not performed**: live browser verification of any flow in this task or the ones before it —
  no browser session was opened.
