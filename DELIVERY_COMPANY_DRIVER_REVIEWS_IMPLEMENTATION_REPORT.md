# Fix Delivery Company Avis — Include Coffee Owner Reviews of Its Drivers — Implementation Report

Implements the gap found and audited in `DELIVERY_COMPANY_DRIVER_REVIEWS_GAP_AUDIT.md`.

## Original cause

The Delivery Company's Avis dashboard (built in the previous task) only ever queried `reviewType = 'DELIVERY_COMPANY'` — Supplier-authored reviews of the company as a whole. By design (an explicit decision in the original feature's own audit, to avoid conflating two different reviewer audiences into one average), it never queried `reviewType = 'DRIVER'` — Coffee-Owner-authored reviews of an individual driver. A real functional test showed this was too conservative: the Delivery Company legitimately wants visibility into both, as long as they stay clearly separated. This was a missing feature, not a bug in the previous implementation.

## Data model (confirmed, unchanged)

- `supplierProductReviews` (`reviewType = 'DRIVER'`): `driverId` (reviewed driver), `deliveryId`, `cafeId`/`cafeName`/`cafeOwnerName` (the Cafe Owner reviewer's real identity — this column's original meaning, not reused for a different role here).
- `deliveries.deliveryCompanyId`/`deliveries.driverId`: frozen the moment a delivery leaves `ASSIGNED` (re-confirmed by re-reading `reassignDriver`), and a review can only exist for a `DELIVERED` delivery — so `deliveries.deliveryCompanyId` at read time is always the company that actually handled that specific delivery, independent of the driver's current `users.deliveryCompanyId`.
- No schema change was needed or made.

## Files modified

- `server/storage/domains/reviews.storage.ts` — new `CompanyDriverPerformanceReview` interface + new `getDriverReviewsForDeliveryCompany(deliveryCompanyUserId)` method.
- `server/storage.ts` — one new facade delegate, mirroring the existing one.
- `server/routes/delivery.routes.ts` — one new route, `GET /api/delivery-company/driver-performance-reviews`, inserted after the existing `driver-reviews` route (both now present, both gated identically, neither touches the other).
- `client/src/hooks/use-delivery-company-marketplace.ts` — new `CompanyDriverPerformanceReview` client type + `useDriverPerformanceReviews()` hook.
- `client/src/hooks/use-realtime.ts` — one new invalidation line for the new query, added to the existing `driver_review_created` event handler (the same event that already refreshes the driver's own page).
- `client/src/pages/delivery/reviews-page.tsx` — rewritten with two tabs on one shared, parametrized section component (see below).

## Files NOT touched (verified via `git diff`)

- `POST /api/driver/reviews` (Coffee Owner submission) — zero diff.
- `GET /api/driver/reviews/:driverId` and `client/src/pages/driver/reviews.tsx` (the driver's own page) — zero diff.
- `GET /api/delivery-company/reviews/:userId`, `POST /api/delivery-company/reviews`, and the existing `GET /api/delivery-company/driver-reviews` + its storage method — zero diff; the previous task's company-level feature is completely intact.

## Backend implementation

### New endpoint

`GET /api/delivery-company/driver-performance-reviews`, gated by the same `requireApprovedDeliveryCompany` middleware as every other Delivery Company route — resolves identity exclusively via `req.deliveryCompany.id`; no id is ever read from params/query/body.

### `getDriverReviewsForDeliveryCompany` — scoping, in order

1. `SELECT id, driverId FROM deliveries WHERE deliveryCompanyId = :companyId` — this company's own delivery history (not a driver roster lookup, not `users.deliveryCompanyId`). Empty → return `[]` immediately.
2. `SELECT * FROM supplierProductReviews WHERE reviewType = 'DRIVER' AND deliveryId IN (:thoseDeliveryIds)` — bounded by this company's own delivery volume, never a scan of the platform-wide `DRIVER` review population.
3. Batched `SELECT id, name, profileImageUrl FROM users WHERE id IN (:driverIds ∪ :cafeOwnerIds)` — one combined query.
4. Build the result with a plain loop (not `.map`+type-predicate, to keep the types exact): for each review, re-derive the driver from the **delivery row** (step 1's map), not from `review.driverId` directly — consistent with the same "never trust a value merely because it usually agrees" habit the previous task's sibling method follows. A review is only skipped if its delivery can't be found or has no driver at all (practically unreachable given write-time validation, but a safe guard rather than ever fabricating an attribution).

Total queries: 3 (deliveries, reviews, users) regardless of review count — no N+1. No SQL join — the result is a strict 1:1 transform of the `reviews` array, so duplicate rows are structurally impossible, same reasoning as the sibling method.

## Frontend implementation

`reviews-page.tsx` now has two tabs (shadcn `Tabs`, already used elsewhere in Espace Livraison, e.g. `driver-deliveries-page.tsx`):

- **"Avis sur l'entreprise"** — the existing company-level dataset, unchanged in content.
- **"Avis sur les chauffeurs"** — the new driver-level dataset.

Both render through one shared, parametrized `ReviewDashboardSection` component (not exported, local to this file) instead of duplicating the ~200-line summary/filter/pagination block twice. It takes an already-normalized `NormalizedReview[]` (both datasets are mapped into this one shape via `useMemo` in the parent) plus per-section labels:

- The company tab passes `reviewerFilterLabel="Fournisseur"` and no `targetFilterLabel` — exactly the 3-filter shape (Fournisseur/Période/Note) the previous task already had, unchanged in behavior.
- The driver tab passes `reviewerFilterLabel="Café"` **and** `targetFilterLabel="Chauffeur"` — the 4-filter shape the task asked for (Café/Chauffeur/Période/Note), with the driver sub-line and fallback ("Chauffeur indisponible") shown on each card only because `targetFilterLabel` is set for this tab.

Each tab's summary (average/total/star distribution) is computed via `useMemo` over that tab's own full, unfiltered array — the two never mix into one number, and switching tabs never recomputes the other tab's stats from a filtered view. Filters, reset, and pagination are independent per tab (each tab mounts its own section instance with its own local state).

## Security checks

- Session-only identity (`req.deliveryCompany.id`), re-confirmed by reading the route handler.
- Historical ownership via `deliveries.deliveryCompanyId`, never `users.deliveryCompanyId` — re-confirmed by reading the storage method; a driver who has since moved to another company still correctly shows up under the company that owned the delivery when it happened.
- A company can only ever see reviews whose underlying delivery's `deliveryCompanyId` equals its own id, because that is the filter applied in step 1 before any review is even looked up — there is no code path that could return another company's driver reviews.

## Test scenarios (code-level verification — see Phase 3 note below for what remains unverified)

1. **Coffee Owner reviews Driver A (Company A)** → traced the full path: review row has `driverId = A`, `deliveryId = X`; `deliveries` row `X` has `deliveryCompanyId = CompanyA`; step 1 of the query includes delivery `X` since it's scoped to `CompanyA`; step 2 then finds the review. Confirmed by code reading.
2. **Multiple drivers** → each review is attributed independently via its own `deliveryId → driverId` lookup; no shared state across reviews. Confirmed.
3. **Company B isolation** → Company B's step-1 query (`WHERE deliveryCompanyId = CompanyB`) would never include delivery `X` (it belongs to Company A), so Company B's step-2 review query's `IN (...)` list never contains that review's `deliveryId`, so the review can never appear for Company B. Confirmed by code reading.
4. **Driver changes company after the delivery** → `deliveries.deliveryCompanyId`/`driverId` are frozen at `ASSIGNED`, never rewritten afterward (confirmed again in this task by re-reading `reassignDriver`'s guard) — the historical row is unaffected by any later change to `users.deliveryCompanyId`. Confirmed by code reading, not by actually reassigning a driver in a live database.
5. **No comment** → `{review.comment && <p>...}`, same guard as the company tab — unchanged pattern, confirmed present.
6. **Driver account unavailable** → `userById.get(driverId)` returns `undefined` → `driverName: null` → UI shows "Chauffeur indisponible" with the default avatar fallback; the review itself is still returned (not dropped). Confirmed by code reading.
7. **Supplier/company reviews still visible and separated** → the company tab's data path, hook, and route are byte-for-byte unchanged; the two tabs render from two independently-fetched, independently-computed datasets that are never concatenated or averaged together. Confirmed by code reading.
8. **Existing submission flows unaffected** → zero diff on both submission routes, confirmed via `git diff`.
9. **Filters/stats/pagination independent per section** → each tab renders its own instance of `ReviewDashboardSection`, which owns its own `useState` for every filter and its own `usePagination` — there is no shared state between the two tabs. Confirmed by code reading.

## TypeScript / build results

- `npx tsc --noEmit` — clean (two real type errors were found and fixed during implementation: a missing destructured prop in the new section component, and a type-predicate narrowing conflict in the new storage method's result-building step, fixed by switching from `.map().filter(predicate)` to a plain accumulator loop).
- `npm run build` — succeeded (client: 2856 modules; server bundle built).

## Database / browser testing

**Not performed — same limitation as the previous task, re-confirmed in this one.** No `DATABASE_URL` is configured in this environment, so none of the 9 scenarios above were executed against real or disposable data; all are verified by static code reading only. No browser-automation tool is available, so no live UI interaction (clicking between tabs, filtering, paginating, viewing on mobile/desktop, light/dark) was exercised. This is stated explicitly rather than implied as done, per the task's own instruction.

## Remaining limitations

1. No live-database verification of any of the 9 Phase 3 scenarios.
2. No browser testing of the new tabs, filters, or cards.
3. No automated test suite exists in this repository.
4. The two tabs' review counts (`companyReviews.length`/`driverReviews.length`, shown in the `TabsTrigger` labels) require both queries to fetch eagerly on page load regardless of which tab is active — this is necessary (the counts must be visible before a tab is even selected), not an unnecessary request.
