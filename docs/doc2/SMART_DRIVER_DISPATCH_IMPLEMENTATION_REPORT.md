# Smart Driver Dispatch System — Implementation Report

Implements `SMART_DRIVER_DISPATCH_AUDIT.md`'s recommended architecture in full. Built and verified incrementally — `tsc`/build were re-run after the schema change, after the backend storage layer, after each route addition, and after every frontend phase; all passed clean on first try except two frontend mistakes caught and fixed immediately (noted below).

## Schema changes (Phase 1)

Both additive, zero removed lines in `shared/schema.ts` (confirmed via `git diff`):

- `driverProfiles.acceptingNewOffers boolean NOT NULL DEFAULT true` — the dispatch preference, deliberately separate from the pre-existing `isOnVacation` column.
- New table `deliveryDriverOffers` (`id, deliveryId, driverId, status, attemptNumber, createdAt, respondedAt, expiresAt`) + `deliveryDriverOfferStatusEnum` (`PENDING/ACCEPTED/REFUSED/EXPIRED/CANCELLED`). Indexes: `deliveryId`, `driverId`, composite `(driverId, status)` for the acceptance-rate aggregation, and a **partial unique index on `deliveryId` WHERE `status = 'PENDING'`** — the real, database-enforced guarantee behind "only one driver can have a pending offer per delivery at any time."

**Migration/deployment requirement**: this project's workflow is `drizzle-kit push` (schema-diff push against a live database), not generated migration files. **No `DATABASE_URL` is configured in this environment**, so `npm run db:push` could not be run here — the schema change is written and `tsc`-verified against the Drizzle schema, but has **not been applied to any actual database**. This must be run (`npm run db:push`) against the target database before this feature can work at runtime.

## Backend (Phases 2–4)

All new logic lives in `server/storage/domains/delivery.storage.ts`, thin facade delegates in `server/storage.ts`, routes in `server/routes/delivery.routes.ts`. One batched helper (`computeDriverReviewStats`, previously confirmed dead code with zero callers) was changed from `private` to a real, used method — exposed via a new facade delegate `getDriverReviewStatsBatch` — rather than writing a second review-aggregation query.

### Eligibility and availability (Phase 2/3)

- Vehicle eligibility: `checkDeliveryVehicleCompatibility` reused verbatim, zero duplication.
- Busy state: `isDriverBusy(driverId)` — same `ASSIGNED/PICKED_UP/IN_TRANSIT` definition `getDeliveryCompanyDriverCards` already used, now a real shared method instead of a second inline copy.
- Availability preference: `acceptingNewOffers`, defaulting `true` for any driver without a profile row yet (never a false opt-out by omission).
- `PATCH /api/driver/profile` extended with one optional field (`acceptingNewOffers`); driver identity resolved only from `req.session.userId`, as it already was for every other field on that route.

### Offer lifecycle (Phase 4)

- `rankEligibleDriversForOffer` — fully batched (one query per dimension: roster, profiles, vehicles, busy deliveries, offer-history counts, review stats — never one per driver). Filters: company membership, `approved` status, compatible vehicle, `acceptingNewOffers`, not busy, not already offered. Ranks: acceptance rate (only once ≥5 resolved offers; below that, ranked as a whole group beneath drivers who've reached it) → distance (driver's registered coordinates, explicitly not claimed as live GPS) → average review rating → driver id as the final deterministic tiebreaker.
- `dispatchNextOffer` — creates the next `PENDING` offer or reports `exhausted`; a unique-constraint violation on concurrent attempts is treated as a benign no-op, not an error.
- `acceptDriverOffer` — **the one place the task asked for the most care.** Re-read `assignDriver` end-to-end first: it manages its own internal `db.transaction` and is not transaction-aware from outside, so nesting a second transaction inside it is unsupported. The offer is read and validated (ownership, `PENDING`, not expired, not busy) **before** calling `assignDriver` as a plain top-level call; the offer row is flipped to `ACCEPTED` **only after** `assignDriver` has already returned successfully — never before. If `assignDriver` throws (lost a race to a manual assignment, vehicle incompatibility, weather restriction), the offer is marked `CANCELLED` (guarded by `status='PENDING'`) instead of left stale, and the error is rethrown unchanged. `assignDriver` itself was not modified at all — its own atomic compare-and-swap on the delivery's status is what actually makes two simultaneous acceptances impossible; this method's own checks are additional guards on top of that, never a replacement for it.
- `refuseDriverOffer` — a single conditional `UPDATE ... WHERE id=:id AND driverId=:id AND status='PENDING'`, combining the ownership and concurrency guarantee in one atomic statement.
- `cancelPendingOfferForDelivery` — best-effort, deliberately not nested in any other transaction; even if skipped by a crash, a stale `PENDING` offer can never be successfully accepted afterward because `acceptDriverOffer` always re-validates through `assignDriver`'s own CAS.
- `expireOverduePendingOffers` — the expiration worker's core sweep: a single conditional `UPDATE ... WHERE status='PENDING' AND expiresAt <= now()`, safe across multiple app instances and correct after a restart (DB-clock-based, not an in-memory timer).

### Expiration worker

A `setInterval` (15s) added at the end of `registerDeliveryRoutes` in `delivery.routes.ts` — no new process, no new infrastructure, consistent with the audit's "no existing scheduler, add a lightweight in-process worker" recommendation. Each tick calls `expireOverduePendingOffers` and, for every newly-expired offer, broadcasts `dispatch_offer_expired` and triggers the next dispatch attempt.

### Routes added

`GET /api/driver/offers/pending`, `PATCH /api/driver/offers/:id/accept`, `PATCH /api/driver/offers/:id/refuse`, `GET /api/deliveries/:id/dispatch-status`, `POST /api/deliveries/:id/dispatch/retry`, `GET /api/delivery-company/dispatch-stats`, `GET /api/drivers/:driverId/dispatch-stats`. All identity resolution is session-only (`req.session.userId`/`req.driver`/`req.deliveryCompany`) — no route accepts a driver or company id from the client as an authorization boundary; the last one reuses the exact same self/admin/own-operator permission check as the pre-existing `GET /api/drivers/:driverId/details`.

### Hooks added into the existing lifecycle

- `PATCH /api/deliveries/:id/accept` → fires `dispatchNextOffer` after the response is sent (best-effort; accepting the delivery is the primary action and must succeed on its own).
- `PATCH /api/deliveries/:id/assign` (manual) → calls `cancelPendingOfferForDelivery` right after `assignDriver` succeeds.
- `PATCH /api/deliveries/:id/status` with `status='CANCELLED'` → same cancellation call.

### `getAssignableDriversForDelivery` extended, not duplicated

Two new fields (`busy`, `acceptingNewOffers`) added to its existing per-driver return shape, computed via two new **batched** queries added before its existing per-driver loop (not inside it) — the pre-existing per-driver vehicle lookup in that loop was left exactly as it already was.

## Frontend

### Phase 5 — Espace Livraison → Mes livraisons

`client/src/pages/delivery/my-deliveries-page.tsx`: `AssignDriverControl` now reads `useAssignableDrivers` (the previously-unused `getAssignableDriversForDelivery` endpoint, now wired up for the first time) instead of the plain driver-name list, filters out vehicle-incompatible drivers from the dropdown, shows "Occupé"/"Indisponible" inline badges, and opens a confirm dialog before assigning a busy/unavailable driver rather than silently blocking or silently allowing it. A new `DispatchStatusPill` renders alongside it for `ACCEPTED` deliveries, showing the French status labels, the pending driver's name, a live countdown, attempt count, and a "Réessayer" button once exhausted (wired to the new retry endpoint). `ReassignDriverControl` and every other part of this page are untouched.

### Phase 6 — Espace Chauffeur → Planification

`client/src/pages/driver/planning.tsx`: two new sections inserted between the hero and the existing Aujourd'hui/À venir/Anciennes tabs — `AvailabilityToggle` ("Disponible"/"Indisponible", an instantly-saving switch, not bundled into the Profil page's big save button) and `NewOffersSection` ("Nouvelles demandes"), rendering `IncomingOfferCard`s with order/supplier/addresses/required vehicle/fee, a live countdown, and Accept/Refuse buttons that locally disable themselves on click (an immediate UX guard against double-response, on top of the backend's own atomic guarantee). Every existing section (tabs, search, filters, delivery cards, GO navigation) is untouched.

### Phase 7 — Performance & Admin

- `client/src/pages/delivery/dashboard.tsx` (shared by `DELIVERY_COMPANY` and `DRIVER` roles): a new "Répartition automatique" card, gated by `isCompany` and an `enabled` flag on the new query so a Driver viewing this same shared page never fires the request at all. All existing cards/content unchanged.
- `client/src/components/driver/driver-detail-modal.tsx` (Admin's driver detail modal, and the driver's own Aperçu): a new "Répartition automatique" section placed right after the existing "Livraisons" counts, worded as "Accepte les offres automatiques" / "Offres automatiques en pause" — **deliberately not** reusing the words "Disponible"/"Indisponible" for this, because this exact modal already has a pre-existing badge using those words for `isOnVacation` (discovered while implementing this phase); reusing them for the unrelated `acceptingNewOffers` concept in the same modal would have been genuinely confusing. The query is keyed by `driverId`, so switching the selected driver in Admin always refetches the correct driver's own stats — no stale cross-driver bleed.

### Phase 8 — Real-time

`client/src/hooks/use-realtime.ts`: new `SMART_DISPATCH_EVENTS` group (`dispatch_offer_created/accepted/refused/expired`, `dispatch_exhausted`, `dispatch_status_changed`, `driver_availability_changed`) invalidating the driver's pending-offers query, the per-delivery dispatch-status/assignable-drivers queries, and both dispatch-stats queries. `DELIVERY_EVENTS`'s existing handler was also extended to invalidate the same per-delivery dispatch queries, since an ordinary assignment or cancellation resolves dispatch status too even though neither fires a dispatch-specific event name. No polling was introduced anywhere — the visible offer/response countdowns are a local per-second UI tick on an already-fetched timestamp (`useCountdownSeconds`), never a refetch.

## Files created

- `client/src/hooks/use-dispatch.ts`
- `SMART_DRIVER_DISPATCH_AUDIT.md`, this report.

## Files modified

`shared/schema.ts`, `server/storage/domains/delivery.storage.ts`, `server/storage/domains/reviews.storage.ts`, `server/storage.ts`, `server/routes/delivery.routes.ts`, `client/src/hooks/use-realtime.ts`, `client/src/pages/delivery/my-deliveries-page.tsx`, `client/src/pages/driver/planning.tsx`, `client/src/pages/delivery/dashboard.tsx`, `client/src/components/driver/driver-detail-modal.tsx`.

## TypeScript / build results

- `npx tsc --noEmit` — run after every phase (schema, storage methods, facade delegates, routes, worker, hooks file, realtime wiring, and each frontend page); clean on the first try in every case except one: Phase 5's `my-deliveries-page.tsx` edit dropped the `useDeliveryCompanyDrivers` import that the untouched `ReassignDriverControl` still needs — caught immediately by `tsc` and fixed by restoring the import.
- `npm run build` — succeeded at the end of the full implementation (client: 2857 modules transformed; server bundle built).
- No automated test suite exists in this repository (confirmed again in this task); none could be run.

## Regression verification

All confirmed by reading the actual `git diff`, not by assumption:

- `assignDriver`/`reassignDriver`: **zero lines removed from either method body** — confirmed by diffing `delivery.storage.ts` and inspecting every removed line (only an import line and one return-type line were ever removed in that whole file).
- Delivery statuses/transitions (`DELIVERY_TRANSITIONS`): not present in any diff — unchanged.
- Financial ledger/payout (`computeDeliveryFee`, `computeDeliveryPayout`, `recordDeliveryFinancialEvents`): not present in any diff — unchanged.
- Existing driver reviews (`getDriverReviews`, `getDriverReviewForDelivery`, `upsertDriverReview`, the driver's own `pages/driver/reviews.tsx`): not present in any diff — unchanged. `computeDriverReviewStats` only had its visibility keyword changed (`private` → implicit public), not its body.
- Supplier-mode dispatch: `assignDriver`'s `SUPPLIER` branch is untouched; `my-deliveries-page.tsx`'s richer `AssignDriverControl` only ever renders on this `DELIVERY_COMPANY`-only tab (Supplier has its own separate, untouched page); `dashboard.tsx`'s new stats card is gated by `isCompany`.
- Across the five backend files touched, **686 insertions against only 7 deletions total** — those 7 are exactly: one import line each in `delivery.storage.ts` and `delivery.routes.ts` (both replaced with an extended version, not removed functionality), one return-type line in `delivery.storage.ts` (extended, not narrowed), and the 4-line "dead code" comment + `private` keyword in `reviews.storage.ts` (the method's body is identical).

## Database / browser testing

**Not performed, and explicitly flagged rather than assumed successful:**

- No `DATABASE_URL` is configured in this environment — the schema change was never applied (`npm run db:push` could not run), and none of the 26 Phase-9 test scenarios (automatic dispatch, manual dispatch, security/concurrency, regression) could be executed against a real or disposable database. Every claim in this report about query correctness, the partial-unique-index's guarantee, the ranking algorithm's output, and the accept/refuse/expire state machine is a **static code-reading verification** — traced through the exact logic by hand — not a result of running it.
- No browser-automation tool is available in this session — the new UI (dispatch pill, offer cards, availability toggle, confirm dialog, stats cards) was verified only by `tsc` and the production build succeeding, never by rendering or clicking through it in an actual browser.

## Remaining limitations

1. The schema migration has not been applied to any database — this is a hard prerequisite before any part of this feature can run.
2. No live-database or live-browser verification of any Phase 9 scenario — all 26 are verified by code reading only.
3. No automated test suite exists in this repository.
4. `AssignDriverControl` fetches `useAssignableDrivers` once per visible `ACCEPTED` delivery card — bounded by how many such deliveries a company has open at once (typically small), not by overall platform size; flagged as a minor characteristic, not fixed, since batching it would be a second, more complex endpoint for a case the audit did not identify as a real scale concern.
5. Distance ranking uses each driver's registered account coordinates, not live GPS — exactly as the audit found and the task explicitly instructed ("do not describe them as real-time GPS locations").
6. Minimum-history threshold (5 resolved offers) and the ranking order itself are implemented exactly as specified, but have not been tuned against real usage data — there is no real data yet to tune against.
