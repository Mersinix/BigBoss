# Smart Driver Dispatch System — Architecture Audit (Phase 1)

Audit only. No application code, schema, UI, or business logic was modified to produce this report.

## 1. Current architecture and delivery lifecycle

One row per sub-order (`shared/schema.ts:366`, `deliveries` table). Status enum (`shared/schema.ts:16`):

`PENDING → AVAILABLE | ACCEPTED → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED`, with `CANCELLED` reachable from `PENDING`/`AVAILABLE`/`ACCEPTED`/`ASSIGNED`.

Exact allowed-transition map, enforced in code (`server/storage/domains/delivery.storage.ts:305`):

```
PENDING:   [AVAILABLE, ACCEPTED, CANCELLED]
AVAILABLE: [ACCEPTED, CANCELLED]
ACCEPTED:  [ASSIGNED, CANCELLED]
ASSIGNED:  [PICKED_UP, CANCELLED]
PICKED_UP: [IN_TRANSIT]
IN_TRANSIT:[DELIVERED]
DELIVERED: []
CANCELLED: []
```

Transitions are applied as an **atomic, ownership-scoped compare-and-swap** (`UPDATE ... WHERE id = :id AND status = :expectedCurrentStatus AND <owner condition>`, not read-then-write) — the file's own comment at line 298 states this explicitly as the reason two concurrent status calls can't both succeed. `updateDeliveryStatus` (`delivery.storage.ts:922`) re-reads `DELIVERY_TRANSITIONS[current.status]` on every call.

**Who operates a delivery** — `deliveries.deliveryMode` (`'DELIVERY_COMPANY' | 'SUPPLIER'`), set once at dispatch, never rewritten (`PENDING` has no mode yet). `SUPPLIER` mode: the supplier assigns directly from its own driver roster (`ACCEPTED` happens automatically — "no acceptance step needed since the supplier is the operator," line 303). `DELIVERY_COMPANY` mode: enters the existing accept/assign queue — a Delivery Company must first **accept** the delivery (`AVAILABLE → ACCEPTED`, not audited in file/line detail here since it's unaffected by this feature) before it can **assign a driver** (`ACCEPTED → ASSIGNED`, via `assignDriver`).

### `assignDriver` (`delivery.storage.ts:568`)

Validates: delivery exists; driver exists and `role === 'DRIVER'`; ownership (`SUPPLIER` mode → `driver.supplierId === actingUser.id`; `DELIVERY_COMPANY` mode → `driver.deliveryCompanyId === actingUser.id`); vehicle compatibility (`checkDeliveryVehicleCompatibility`, line 1302 — see §2); weather-safety gate (SUSPEND/RESTRICT). On success, wrapped in `db.transaction` (line 661): sets `status = 'ASSIGNED'`, `driverId`, freezes `deliveryFee`/payout fields, and increments `assignmentSequence` via a **DB-native atomic `SET assignmentSequence = assignmentSequence + 1`** (never a client-computed "current + 1" — line 665's own comment on why: avoiding a race under true concurrent calls). `assignmentSequence` is a monotonic per-delivery counter, incremented once per *actual driver change* (re-assigning the *same* driver does not increment it) — purpose-built so a later A→B→A reassignment chain produces three distinct financial-ledger idempotency keys (`delivery:<id>:seq:<n>`, schema.ts:547).

### `reassignDriver` (`delivery.storage.ts:746`)

Only permitted while `delivery.status === 'ASSIGNED'` — explicitly rejects once "already been collected" (`PICKED_UP`/`IN_TRANSIT`/`DELIVERED`). Re-validates ownership and vehicle compatibility (`reassignCompatibility`, line 769) exactly like `assignDriver`, wrapped in its own `db.transaction` (line 814). **Consequence directly relevant to this feature**: `deliveries.driverId` and `deliveries.deliveryCompanyId` are therefore frozen for the entire remaining lifetime of any delivery that reaches `PICKED_UP` or later — i.e. for every delivery a review can ever be submitted against (re-confirmed in two earlier tasks' audits on this same codebase, cited here again since Smart Dispatch's own ranking/statistics will read the same frozen fields).

### Cancellation / history

`CANCELLED` is reachable from `PENDING`/`AVAILABLE`/`ACCEPTED`/`ASSIGNED` only (not from `PICKED_UP` onward) per the transition map above. `getDeliveries(userId, role)` is the single role-scoped read path every delivery list (Driver Planification, Delivery Company Mes livraisons, Admin) already uses — no second query path exists to audit separately.

### Where automatic dispatch should start

The natural insertion point is **immediately after a `DELIVERY_COMPANY`-mode delivery is `ACCEPTED`** (i.e. exactly where a human today manually opens the assignment UI and calls `assignDriver`) — automatic dispatch would be an *alternative producer* of the same `assignDriver` call, not a new transition. This preserves the existing `ACCEPTED → ASSIGNED` transition and its compare-and-swap safety untouched; dispatch logic only decides *which driver id* to pass in, nothing about the state machine changes. `SUPPLIER`-mode deliveries (no acceptance step, no queue) are out of scope for automatic dispatch unless explicitly requested later — the task's own three affected areas are all Delivery-Company-specific.

## 2. Existing database tables and relationships

- `deliveries` (`schema.ts:366`): `id`, `deliveryMode`, `deliveryCompanyId`, `driverId`, `status`, `pickupAddress`/`destinationAddress` (jsonb `GeoLocation`, snapshotted — never re-derived from a live profile), `vehicleType`, `assignmentSequence`.
- `subOrders`: `requiredVehicleType`, `totalWeightKg`, `totalVolumeL`, `numberOfPackages`, `numberOfItems`, `isFragile` (`schema.ts:294-299`) — the delivery's own capacity/vehicle requirement, set at order time.
- `users` (role `DRIVER`): `deliveryCompanyId` XOR `supplierId` (DB CHECK constraint, `schema.ts:79`) — current operator membership; `locationLat`/`locationLng` (text columns) — the driver's **registered account address**, not a live GPS feed (no live-location table or column exists anywhere in the schema — confirmed by a full-file search).
- `driverProfiles` (`schema.ts:637`): `bio`, `experienceYears`, `certifications`, `weeklyHours`, **`isOnVacation`** (boolean), `publicationStatus`. This is the *only* existing availability-adjacent field for a driver, and it is coarse (on/off vacation), not a "willing to receive new delivery offers" toggle.
- `vehicles` (`schema.ts:605`): `type`, `isActive`, `assignedDriverId` (unique per driver via a partial unique index) — `getVehicleForDriver(driverId)` is the single existing lookup (`delivery.storage.ts`, used by `assignDriver`/`reassignDriver`/`getAssignableDriversForDelivery`).
- `supplierProductReviews` (`reviewType = 'DRIVER'`): `driverId`, `deliveryId`, `rating`, `comment`, reviewer = Cafe Owner (re-confirmed across two prior tasks on this same codebase). `getDriverReviews(driverId)` is the single existing read path (`reviews.storage.ts:703`); already consumed by both the driver's own Avis page and the Admin driver detail modal (§7).
- `deliveryOpportunities` (`schema.ts:1108`) — **looks adjacent but is a different concept**: a Delivery-Company-published labor/staffing shift a driver applies to/fills (`OPEN`/`FILLED`/`CLOSED`/`CANCELLED`). The table's own comment states explicitly: "accepting an opportunity does not itself create a Delivery... kept deliberately separate." **Not reusable** for per-delivery dispatch offers — a different status enum, no `deliveryId`, no expiration semantics, no acceptance-rate concept.
- `deliveryPricingSettings`: per-vehicle-type pricing/capacity config, used by `checkDeliveryVehicleCompatibility`.

No existing table represents a per-delivery, per-driver **offer** (the thing §3/§7 need). None of the six tables above is a safe substitute — confirmed by reading all six's actual columns.

## 3. Driver eligibility and vehicle compatibility findings

`checkDeliveryVehicleCompatibility` (`delivery.storage.ts:1302`, private): ordinal vehicle-type check (a delivery's `requiredVehicleType` must be ≤ the driver's assigned vehicle's capability on some ordinal scale — exact ordinals not re-derived here since the method is unchanged and out of scope) plus optional capacity checks (weight/volume/package count) **only when** `deliveryPricingSettings.vehiclePricing[type]` has those limits configured — unset means "always compatible" (explicit backward-compatibility default, confirmed by the schema comment at line 673). This is the exact, already-existing eligibility check `assignDriver`/`reassignDriver`/`getAssignableDriversForDelivery` all call — **fully reusable as-is** for automatic dispatch; no new compatibility logic should be written.

**Existing read-only recommendation layer already built**: `getAssignableDriversForDelivery(deliveryId, actingUser)` (`delivery.storage.ts:1120`, documented there as "Delivery System V2 Phase 3 — Dispatch Engine + Driver Offer Engine... a read-only recommendation/information layer... It never assigns anything itself"). It already: resolves the correct owner/roster via `getDriversForOwner`, annotates each driver with the same `checkDeliveryVehicleCompatibility` result, and computes a provisional `expectedPayoutCents` preview. **This is almost exactly the "filter by vehicle eligibility" step of the task's §5 algorithm, already built and already enforcing the same ownership boundaries (rule 7/15/16 in its own doc comment: "a company/supplier must never assign another company's/supplier's driver").** It does not yet rank by acceptance rate/distance/rating, does not filter by busy/availability, and never creates an offer — those are the genuine gaps.

Driver eligibility inputs available today, confirmed field-by-field:

1. **Vehicle eligibility** — yes, fully available (`checkDeliveryVehicleCompatibility`, reused as-is).
2. **"Open to new offers"** — **not available**. Only `driverProfiles.isOnVacation` exists, and it is not what the task means by an availability *preference* (a driver who is not on vacation has no way to say "don't send me offers right now").
3. **Currently busy** — **available**, already computed elsewhere: `getDeliveryCompanyDriverCards` (`server/storage.ts:2008-2019`) derives `busy` as `status IN ('ASSIGNED','PICKED_UP','IN_TRANSIT')` for that driver across any of their deliveries — explicitly commented "never an invented status." This exact query is the correct, reusable "operationally busy" check for dispatch too.
4. **Distance from pickup** — **partially available**. `driver.locationLat`/`locationLng` (the driver's static registered address) are already used as `driverLocation` in `computeDeliveryFee` (`assignDriver`, line 618) via the existing haversine distance function. There is **no live GPS feed** for a driver's current position — any "distance to pickup" ranking today can only be computed against the driver's registered address, not their real-time location. This is a genuine, reportable gap if true live tracking is wanted; the registered-address distance is a reasonable, already-available proxy for a first version.

## 4. Driver availability and busy-state findings

Confirms the task's own two-concept framing is **not yet implemented as two concepts** — only the operational half exists:

- **Operational availability (busy)**: exists, as described in §3.4 — a driver is busy iff they have a delivery in `ASSIGNED`/`PICKED_UP`/`IN_TRANSIT`. Correct, reusable, needs no new field.
- **Availability preference (willing to receive offers)**: does **not** exist. `isOnVacation` is the nearest existing field, but conflating it with a dispatch on/off switch would silently repurpose a field whose current meaning (shown today, presumably, on vacation-related UI) is different from "pause new offers." **Recommendation**: a new boolean, e.g. `driverProfiles.acceptingNewOffers` (default `true`, so every existing driver is unaffected on day one) — a small, additive column on an already-existing driver-owned table, not a new table. This is the smallest safe addition that satisfies the task's explicit "do not assume active = available" instruction.

## 5. Existing notification/realtime infrastructure

- `server/ws.ts`: `broadcast(event, data)` (all connected clients) and `broadcastToUsers(userIds, event, data)` (targeted) — already the exact primitive needed to push "you have a new offer" to one driver (`broadcastToUsers([driverId], 'dispatch_offer_created', {...})`) and "offer accepted/expired" back to the company.
- `server/notify.ts`: `notify`/`notifyMany` — the existing persisted-notification system (bell icon, etc.), separate from the ephemeral WS broadcast; both are already used together elsewhere (e.g. `driver_review_created` broadcasts AND presumably persists a notification — not re-verified line-by-line here since both primitives are already well-established and unchanged by this feature).
- `client/src/hooks/use-realtime.ts`: a single WS listener dispatching on `event` name into grouped `qc.invalidateQueries` calls per feature area (`DELIVERY_ECOSYSTEM_EVENTS`, `DELIVERY_COMPANY_MARKETPLACE_EVENTS`, etc.) — the established pattern for wiring a new event into React Query cache invalidation; a new `DISPATCH_EVENTS` group would follow the exact same shape.
- **No periodic/background job infrastructure exists anywhere in `server/`** (confirmed: no `setInterval`, no cron library, no scheduled-task runner in the codebase). The existing precedent for "something that expires" (password-reset codes, `server/storage/domains/user.storage.ts` — audited in an earlier session) is **lazy expiry**: the expiry condition (`now() > expiresAt`) is checked at *read/verify time*, not swept proactively by a background process. This is the established pattern to follow for offer expiration too, unless the task explicitly wants proactive auto-advance-to-next-driver the instant a timer elapses even with no client connected — which would be new infrastructure, not an extension of an existing pattern, and should be called out as a deliberate scope decision in Phase 2, not assumed.

## 6. Recommended offer data model

A **new, dedicated table** is recommended — `deliveryDriverOffers` (or similar) — not reuse of `deliveryOpportunities` (wrong concept, confirmed in §2) and not a set of new columns bolted onto `deliveries` (a delivery can have *many* offers over its dispatch attempts — one per candidate driver tried — which doesn't fit a 1:1 column-per-delivery shape).

Proposed columns (naming illustrative, not final):

```
id              serial PK
deliveryId      int NOT NULL        -- references deliveries.id
driverId        int NOT NULL        -- references users.id (role DRIVER)
status          enum('PENDING','ACCEPTED','REFUSED','EXPIRED','CANCELLED')
attemptNumber   int NOT NULL        -- this delivery's Nth offer overall (mirrors assignmentSequence's
                                    -- "DB-native atomic increment" pattern, §1 — never client-computed)
createdAt       timestamp
respondedAt     timestamp NULL
expiresAt       timestamp NOT NULL
```

Indexes mirroring the existing convention (`deliveryOpportunities`'s own `companyIdx`/`statusIdx`, schema.ts:1123-1126): an index on `deliveryId` (one delivery's offer history), on `driverId` (a driver's own offer/acceptance-rate history — needed for the §8 ranking calculation), and a **partial unique index** on `(deliveryId)` WHERE `status = 'PENDING'` — mirroring the exact existing `deliveries_sub_order_active_unique`/`vehicles_assigned_driver_unique` "one active X at a time" pattern (schema.ts:573, 622) — guaranteeing at most one outstanding offer per delivery at the database level, which directly answers §8's "prevent duplicate offers for the same delivery" at the strongest possible layer (a constraint, not just application logic).

This is the right layer, not a reuse of an existing table, because: offers are genuinely a new concept (a transient negotiation state between a delivery and a candidate driver) with their own lifecycle (`PENDING→ACCEPTED/REFUSED/EXPIRED/CANCELLED`) that is explicitly *not* the delivery's own lifecycle (one delivery can accumulate many offers; a delivery's own status never changes until an offer is actually accepted, at which point the existing `assignDriver` call — already transaction-safe — runs exactly as it does for a manual assignment today).

## 7. Recommended automatic dispatch algorithm

The task's proposed 9-step flow (eligible → roster → vehicle filter → availability/busy filter → rank → offer → wait → retry-on-refusal/expiry → fall back to manual) maps directly onto existing primitives:

- Step 2 (roster): `getDriversForOwner('DELIVERY_COMPANY', companyId)` — existing, unchanged.
- Step 3 (vehicle filter): `checkDeliveryVehicleCompatibility`, already used by `getAssignableDriversForDelivery` — existing, unchanged.
- Step 4 (availability/busy filter): the `busy` computation from `getDeliveryCompanyDriverCards` (existing) + the new `acceptingNewOffers` field (§4, new).
- Step 5 (ranking) — **new**, no existing code computes this today. Three inputs, in the task's own stated priority order:
  1. **Acceptance rate** = `ACCEPTED / (ACCEPTED + REFUSED)` over the new offers table, **excluding `EXPIRED`** (per the task's own explicit instruction) and **excluding `CANCELLED`** (an offer cancelled by the company before the driver ever responded is not a reliability signal either way).
  2. **Distance to pickup** — haversine against the driver's registered `locationLat`/`locationLng` (§3.4's available proxy), using the same distance function already used by `computeDeliveryFee`'s own driver-location leg — no new distance math.
  3. **Average review rating** — `getDriverReviews(driverId)`'s existing aggregate (already computed inline wherever it's displayed today, e.g. the Admin modal; a single shared helper should compute this once rather than each caller recomputing it — see §10/§performance note below).
- **Small-sample handling** (task's explicit ask: don't let one lucky driver outrank an experienced one): a simple, transparent, auditable approach — compute acceptance rate only once a driver has reached a minimum offer count (e.g. 5), and until then rank such a driver *below* every driver who has reached that threshold (never fabricate a rate from too little data, and never let it accidentally win a tiebreak by looking artificially perfect). This is a design choice to confirm with the user before Phase 2, not something to decide unilaterally here — a Bayesian/Wilson-score adjustment is the more statistically rigorous alternative but adds complexity the task's own "transparent ranking" wording suggests is not wanted for a first version.
- Steps 6-9 (offer/wait/retry/fallback): new orchestration logic over the new offers table — create a `PENDING` offer for the top-ranked candidate (enforced unique by the partial index in §6), broadcast it (§5's WS primitive), and on `REFUSED`/`EXPIRED` (lazy-checked, §5-realtime) re-run the ranking excluding drivers already offered this delivery, until either one `ACCEPTED`s (→ calls the existing `assignDriver`, unchanged) or the roster is exhausted (→ delivery stays `ACCEPTED`/unassigned, surfaced to the company for manual dispatch, §8/§9 below).

## 8. Recommended manual dispatch workflow

Espace Livraison → Mes livraisons already has (or, per `getAssignableDriversForDelivery`'s own doc comment, is clearly intended to have) a "pick a specific driver" UI backed by that same method. Manual dispatch should:

- Still call `checkDeliveryVehicleCompatibility` (never skip eligibility — the task's own instruction) via the same `getAssignableDriversForDelivery` read.
- **Not** apply the automatic ranking (§7) — the company is choosing directly.
- If the chosen driver is busy or has `acceptingNewOffers = false`: **warn, don't silently block** — a confirmation dialog ("This driver currently has an active delivery / has paused new offers — assign anyway?") is the simplest strategy that satisfies "clear warning... without unnecessary complexity." The actual `assignDriver` call is unaffected either way (it has no concept of "busy" today and shouldn't gain one at that layer — the warning belongs in the UI/route layer, before the call, not inside the existing storage method whose contract other callers already depend on).
- If automatic dispatch has an outstanding `PENDING` offer for this delivery when the company manually assigns a driver: the manual assignment should **cancel** that pending offer (`status = 'CANCELLED'`) as part of the same action — otherwise a driver could accept a stale offer for a delivery the company already resolved another way. This is exactly the kind of race the partial-unique-index (§6) plus an explicit cancel-on-manual-assign step is designed to close.

## 9. Acceptance-rate calculation and statistics

Formula per the task: `ACCEPTED / (ACCEPTED + REFUSED) × 100`, `EXPIRED` tracked and excluded. This requires only a `GROUP BY driverId, status` count query over the new offers table — no denormalized counter column is needed or recommended (the existing codebase's own convention, confirmed repeatedly across this session's prior audits, is to compute statistics live from source rows rather than maintain a second cached number that can drift — the one deliberate exception already in this codebase, `deliveryCompanyProfiles.rating`/`reviewCount`, is a cache explicitly refreshed on every write by `refreshDeliveryCompanyReviewStats`, not a precedent to follow here unless the same discipline is applied).

**Single source of truth recommendation**: one new storage method (e.g. `getDriverDispatchStats(driverId)`) returning `{ totalOffers, accepted, refused, expired, acceptanceRate, completedDeliveries, avgRating, reviewCount }`, called by both: Espace Livraison → Performance (aggregated across the company's whole roster) and the Admin driver detail modal (single driver). This avoids the exact "duplicate calculations between frontend and backend" the task warns against — today, `avgRating`/`reviewCount`/`completed` are already each computed inline in at least two places (the Admin modal, `driver-detail-modal.tsx:170-173`, and presumably the driver's own dashboard) rather than through one shared function; Phase 2 should not add a third inline computation for the new stats, and ideally consolidates the existing ones into the same new shared method while it's being written (a reasonable, small adjacent cleanup — not scope creep, since it's the exact same data the new feature needs to expose anyway).

## 10. Security, concurrency, and idempotency strategy

Every mechanism needed already has a direct precedent in this codebase to mirror, not invent:

- **A driver can only respond to their own offers**: `requireAuth` + `offer.driverId === req.session.userId` check, same shape as `requireDriver` (`server/routes/shared/middleware.ts:64`) already used elsewhere.
- **A company can only dispatch its own deliveries/drivers**: the exact ownership checks `assignDriver` already performs (`delivery.deliveryCompanyId === actingUser.id`, `driver.deliveryCompanyId === actingUser.id`) — reused verbatim when creating an offer, not re-derived.
- **Prevent multiple simultaneous offers for the same delivery**: the partial unique index from §6 (`WHERE status = 'PENDING'`) — a database-enforced guarantee, not just an application check, so even a race between two dispatch attempts (automatic + a concurrent manual click) cannot both insert a `PENDING` row.
- **Prevent a driver accepting two conflicting deliveries**: accepting an offer should re-check busy status (§3.4's existing `busy` query) inside the same transaction that flips the offer to `ACCEPTED` and calls `assignDriver` — mirroring `assignDriver`'s own existing transaction-wrapped, compare-and-swap pattern (§1) rather than a read-then-write.
- **Offer expiring while the driver is accepting it**: resolve with a compare-and-swap UPDATE exactly like `updateDeliveryStatus` already does (`UPDATE offers SET status='ACCEPTED' WHERE id=:id AND status='PENDING'` — zero rows affected means someone else (the expiry check, or a cancel) got there first; the caller must check the affected-row count and respond accordingly, not assume success).
- **Company manually assigns while automatic dispatch has a pending offer**: handled by §8's "cancel the pending offer as part of manual assignment" step.
- **Cancellation during dispatch**: the existing `CANCELLED` transition is already reachable from `ACCEPTED`/`ASSIGNED` (§1); cancelling a delivery with a `PENDING` offer should also cancel that offer in the same transaction (same reasoning as §8).
- **Driver becomes unavailable after receiving an offer** (e.g. toggles `acceptingNewOffers` off mid-offer, or another delivery makes them busy): do **not** auto-cancel the outstanding offer — the driver already has it and may still reasonably accept or refuse it; the next *dispatch attempt* (not this one) should simply respect the updated availability. Auto-cancelling a live offer out from under a driver who is actively looking at it would be a confusing, unrequested behavior change, not a safety requirement.

## 11. Exact files likely to be modified (Phase 2, not yet touched)

**Backend**:
- `shared/schema.ts` — new `deliveryDriverOffers` table + enum; new `driverProfiles.acceptingNewOffers` column.
- `server/storage/domains/delivery.storage.ts` — new dispatch orchestration methods, alongside existing `assignDriver`/`reassignDriver`/`getAssignableDriversForDelivery` (which stay unchanged and get called, not rewritten).
- A new or extended storage domain for offers (could live in `delivery.storage.ts` given how tightly coupled it is to `assignDriver`, or its own file — a Phase 2 naming decision, not an audit finding).
- `server/routes/delivery.routes.ts` — new routes: create/accept/refuse offer, toggle `acceptingNewOffers`, dispatch stats.
- `server/ws.ts`/`client/src/hooks/use-realtime.ts` — new event names following the existing grouped-invalidation pattern.

**Frontend**:
- `client/src/pages/delivery/*` (Mes livraisons) — eligible-driver selection UI (extends whatever already calls `getAssignableDriversForDelivery`), pending-offer visibility, manual-assign warning dialog (§8).
- `client/src/pages/driver/planning.tsx` — incoming-offer section, Accept/Refuse actions, response countdown, availability toggle. Must coexist with the existing `useDeliveries()`-driven Aujourd'hui/À venir/Anciennes tabs without disturbing them (an offer is not yet a delivery the driver "has" — it should render as its own section, not injected into the existing tab lists).
- `client/src/components/driver/driver-detail-modal.tsx` (Admin) — new stats block next to the existing `avgRating`/`reviewCount`/`completed` block (lines 170-173, 236) — same component, same data-fetching convention (a new hook alongside the existing `useDriverReviews`).
- A new "Performance" section/page for Espace Livraison per the task's §7 — exact existing file to extend not yet located in this audit pass (not required for the audit's own completeness — flagged for a quick confirmation at the start of Phase 2 rather than guessed here).

## 12. Required schema changes

Two additive changes, both backward-compatible (every existing row is valid under the new shape with no backfill required):

1. New table `deliveryDriverOffers` (§6).
2. New column `driverProfiles.acceptingNewOffers boolean NOT NULL DEFAULT true` (§4).

No change to any existing column, enum, or table. No migration of existing data is needed (new rows only; the new boolean defaults every existing driver to "available," matching current real-world behavior exactly).

## 13. Potential regressions and migration risks

- **None to the existing manual-assignment path** if automatic dispatch is implemented as "an alternative producer of the same `assignDriver` call" (§1) rather than a parallel path — `assignDriver`/`reassignDriver`'s own validation, transaction-safety, and financial-freeze logic are reused unchanged, not forked.
- **Risk if `acceptingNewOffers` is misapplied**: if any future code mistakenly uses it to gate something other than *dispatch offers* (e.g. accidentally hides a driver from the Admin roster entirely), that would be a real regression — Phase 2 should name and scope this field narrowly and grep for every place "driver availability" is currently read before introducing it, to avoid a second, conflicting meaning of "available" appearing elsewhere in the app.
- **Risk from the lazy-expiry decision (§5)**: if the business actually wants near-real-time auto-advance-to-next-driver the instant an offer expires even with no one's browser open, the lazy-check pattern alone won't deliver that — it only resolves on the next read. This should be confirmed explicitly before Phase 2, since building proactive expiry would be new infrastructure (§5), a meaningfully larger addition than the rest of this feature.
- **No risk to reviews, payouts, or settlements** — nothing in this feature touches `supplierProductReviews`, the ledger, or settlement calculation; `assignDriver`'s existing fee-freeze logic is called, not modified.

## 14. Phased implementation plan (proposed, for Phase 2 approval)

1. **Schema**: add `deliveryDriverOffers` + `driverProfiles.acceptingNewOffers`, with their indexes (§6/§12). No behavior change yet — purely additive, deployable alone.
2. **Manual dispatch parity first**: wire up the "pick a specific driver" UI in Mes livraisons against the existing `getAssignableDriversForDelivery`, with the busy/unavailable warning (§8) — delivers immediate value and exercises the new `acceptingNewOffers` field end-to-end before any ranking logic exists.
3. **Offer lifecycle (no ranking yet)**: a company can send ONE offer to a chosen driver (still manual pick), driver Accept/Refuse in Planification, expiry lazily checked on read — proves out the concurrency/idempotency model (§10) on the simplest possible case before automation is layered on.
4. **Automatic ranking + retry chain** (§7): the dispatch algorithm itself, built entirely on top of step 3's already-proven offer primitives.
5. **Statistics/Admin integration** (§9): the shared `getDriverDispatchStats` method, wired into Espace Livraison → Performance and the Admin driver detail modal.
6. **Realtime polish**: WS events for offer created/accepted/refused/expired, wired into `use-realtime.ts`'s existing grouped-invalidation pattern.

Each step is independently shippable and independently revertible, and no step requires touching the existing `assignDriver`/`reassignDriver`/status-transition code.

## Summary — existing vs. missing vs. proposed

- **Existing, fully reusable as-is**: vehicle compatibility, ownership checks, the compare-and-swap transition pattern, the atomic `assignmentSequence` increment pattern (a direct model for offer attempt-numbering), the `busy` query, driver review aggregation, WS broadcast primitives, the `use-realtime.ts` grouped-invalidation pattern, `getAssignableDriversForDelivery`'s eligibility layer.
- **Missing**: any offer/acceptance-rate data model, an availability-preference field distinct from `isOnVacation`, live driver GPS (static registered address is the available proxy), any background/cron infrastructure (lazy-expiry is the existing pattern to extend instead).
- **Proposed, not yet built**: `deliveryDriverOffers` table, `acceptingNewOffers` column, the ranking algorithm, the offer accept/refuse routes and UI, the shared dispatch-stats method, the three frontend integration points.
