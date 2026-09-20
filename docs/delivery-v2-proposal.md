# BigBossCoffee — Delivery V2 Architecture Proposal
### Analysis + Design document only. No code, schema, or API was changed to produce this file.

This proposal is grounded in two things already verified directly against the current codebase in this workspace: `FULL DELIVERY SYSTEM ANALYSIS.md` (the pre-V2 forensic analysis, file:line cited) and the Delivery System V2 increment that was implemented and live-tested immediately before this document was written (self-pickup, vehicle compatibility, transport requirements, pre-checkout estimate, admin payout-monitoring display). Every "EXISTS" claim below reflects that verified, current state — not a plan, not an assumption.

---

## 1–2. Current System Inventory & Classification

| # | Feature | Status | Where | Limitation |
|---|---|---|---|---|
| 1 | DeliveryPricingEngine | **EXISTS** | `server/storage.ts` `computeDeliveryFee` (private) | Single global formula, no zone/time/weight/demand inputs |
| 2 | DeliveryPricingSnapshot | **EXISTS** | `deliveries.deliveryFee/cafeOwnerFeeShareCents/supplierFeeShareCents/vehicleType/distanceKm/surgeMultiplierPermille/feeFinalizedAt` | No `pricePerKm`/`minimumFee` snapshot — the *inputs* aren't frozen, only distance and the result. If Admin changes a vehicle's rate, an already-frozen delivery's fee is safe, but its snapshot can't show "what rate applied" without re-deriving from a separately-versioned settings history (which doesn't exist) |
| 3 | DeliveryEstimation | **EXISTS** (just added) | `storage.estimateDeliveryFee`, `POST /api/orders/estimate-delivery`, displayed in `order-confirmation-modal.tsx` | One-shot per supplier, no debounce/cache, no zone fallback when address is incomplete |
| 4 | DriverPayoutEngine | **PARTIALLY EXISTS** | `deliveries.deliveryFee` (full compensation); Admin-only computed display (`delivery-details.tsx`: driverPayout=deliveryFee, bigBossMargin=0) | No persisted Delivery-Company→driver split. `driver/wallet.tsx` shows the *company's* full fee as the *driver's* earnings when mode=DELIVERY_COMPANY |
| 5 | VehicleCompatibilityEngine | **EXISTS** (just added) | `storage.isVehicleCompatible`, enforced in `assignDriver`/`reassignDriver` | Ordinal capacity check only (BICYCLE<MOTO<CAR<VAN<TRUCK, OTHER=wildcard) — no weight/volume-driven rule yet, by design |
| 6 | DeliveryRequirementEngine | **EXISTS** (just added) | `subOrders.requiredVehicleType/totalWeightKg/totalVolumeL/numberOfPackages/numberOfItems/isFragile/specialHandling`, supplier-editable UI in `supplier-order-details-modal.tsx` | Manually entered only — no auto-derivation from order line items/product weight (products have no weight field today) |
| 7 | WeatherPricingEngine | **PARTIALLY EXISTS / MISLEADING** | `deliveryPricingSettings.surgeMultiplierPermille` + `surgeLabel` (free text) | Purely manual and global — live DB currently has `surgeLabel="Pluie Forte"` with `surgeMultiplierPermille=1000` (×1.0, no actual effect). No weather API, no automated trigger, no availability/safety linkage |
| 8 | DemandPricingEngine | **MISSING** | — | No driver-availability count, no active-request count, feeds nothing into pricing |
| 9 | WaitingTimePricingEngine | **MISSING** | — | No timer field anywhere on `deliveries` |
| 10 | SupplierSubsidyEngine | **EXISTS** | `promotions.type='FREE_SHIPPING'`, `hasApplicableFreeDeliveryPromotion` | Binary only (0% or 100% supplier-paid) — no partial subsidy tier |
| 11 | BigBossSubsidyEngine | **MISSING** | — | No platform-funded delivery discount concept anywhere; today the platform's delivery contribution is always exactly 0 |
| 12 | DeliveryBudgetEngine | **MISSING** | — | No check exists for "is this delivery economically viable" |
| 13 | RouteEngine | **PARTIALLY EXISTS (prep only)** | `deliveries.roadDistanceKm/estimatedDurationMinutes` (just added, nullable, unpopulated); `haversineKm` is the sole live distance source; `DeliveryRouteMap` uses raw Google Maps JS for a straight-line visual only | No routing provider call exists; the two new columns are schema-only preparation |
| 14 | DeliveryDispatchEngine | **PARTIALLY EXISTS** | `storage.dispatchDelivery` (Supplier picks DELIVERY_COMPANY vs SUPPLIER, optional target company), `assignDriver` (manual driver pick, now vehicle-gated) | Fully manual at every step — no scoring/auto-suggestion of "best" driver |
| 15 | DriverOfferEngine | **PARTIALLY EXISTS** | `available-deliveries-page.tsx` shows `deliveryFee` before a **Delivery Company** accepts | Individual drivers never browse/accept — `driver/opportunities.tsx` is explicitly dead code (own comment confirms it); a driver only ever receives a mission already decided for them |
| 16 | Batching/Consolidation | **MISSING** | — | One `deliveries` row per sub-order, one driver, one pickup→one dropoff — no multi-stop concept in the schema |
| 17 | ZonePricingEngine | **MISSING** | — | Pricing is distance×rate everywhere; no polygon/governorate zone table |
| 18 | PeakHourEngine | **MISSING** | — | `surgeMultiplierPermille` is a single always-on value, not time-scoped |
| 19 | DeliverySafetyEngine | **MISSING** | — | No NORMAL/WARNING/RESTRICTED/SUSPENDED state machine anywhere |
| 20 | SelfPickupEngine | **EXISTS** (just added) | `orders.deliveryMethod='SELF_PICKUP'` (pre-existing) + new: `subOrders.selfPickupCode/*ConfirmedAt/*ConfirmedByUserId/selfPickupAddress`, `storage.confirmSelfPickup`, `SelfPickupModal`, self-pickup progress labels | Full flow now live-verified: Go → Maps → code → confirm → Completed |
| 21 | PickupCodeService | **EXISTS**, two parallel instances | (a) `deliveries.pickupCode/dropoffCode` for normal delivery (pre-existing); (b) `subOrders.selfPickupCode` for self-pickup (new) | No expiration on either; both are single-use via a state check, not a dedicated expiry timestamp; no shared/unified code-service abstraction — two separate but structurally similar implementations |
| 22 | DeliveryAnalyticsEngine | **PARTIALLY EXISTS**, scattered | `delivery/dashboard.tsx` ("Frais générés"), `driver/wallet.tsx`/`payments.tsx` (sums), Admin delivery page (status counts) | Each is a page-local client-side reduce over already-fetched data — no centralized metrics table/endpoint, no completion/cancellation rate, no average time, no geography breakdown |

**On "NEEDS REFACTOR"**: nothing in the current delivery system needs to be torn out. Every EXISTS/PARTIALLY EXISTS item above is a sound foundation to *extend*, per the finding in `FULL DELIVERY SYSTEM ANALYSIS.md` §22 that there is no duplicated or conflicting pricing logic anywhere. The only genuine "fix, not just extend" candidate is the driver-payout display in `driver/wallet.tsx` (§4 above), which is misleading under `DELIVERY_COMPANY` mode today — see Phase 3.

---

## 3. Future Delivery Features — Detailed Analysis

### 3.1 DeliveryPricingEngine
**Today**: `computeDeliveryFee(supplierId, cafeId, subtotalCents, supplierLocation, cafeLocation, driverLocation?, vehicleType?)` → `{feeCents, distanceKm, vehicleType, surgeMultiplierPermille, cafeOwnerFeeShareCents, supplierFeeShareCents, freeDeliveryApplied}`. Formula: `max(0, max(round(distanceKm × pricePerKm × surge), minFee))`, split by a global `cafeOwnerSharePercent`.

**Proposed evolution**: keep this exact function as the *entry point* but restructure its internals into named, independently-toggleable steps — a **factor pipeline** rather than one formula:

```
baseFee = max(distanceKm × pricePerKm[vehicle], minFee[vehicle])
adjustedFee = baseFee
            × weatherMultiplier      (Phase 4, default 1.0)
            × demandMultiplier       (Phase 5, default 1.0, capped)
            × peakHourMultiplier     (Phase 4, default 1.0)
            × zoneMultiplier         (Phase 4, default 1.0)
finalFee = adjustedFee + waitingFee (Phase 4, default 0) + urgencySurcharge (Phase 4, default 0)
```

Every multiplier defaults to a no-op (1.0 / 0) so **the exact current price is reproduced bit-for-bit** the day this pipeline ships, until Admin explicitly turns a factor on. This is the single most important design constraint of this whole proposal.

**Active immediately (Phase 1–2)**: distance, vehicle, minimum fee — unchanged.
**Prepared, inactive by default**: weight/volume/packages (compatibility gate only, not yet a price factor), weather, demand, waiting, urgency, zones, peak hours.

---

### 3.2 DeliveryPricingSnapshot
**Today**: the *result* is frozen (`deliveryFee`, the two shares, `vehicleType`, `distanceKm`, `surgeMultiplierPermille`, `feeFinalizedAt`) but the *rate table itself* (`pricePerKm`, `minFee`) is not snapshotted — only referenced live at computation time, then never touched again. This already achieves the historical-stability goal in practice (a later rate change can't retroactively alter a frozen delivery, since the frozen fields are never recomputed), but it means an auditor looking at an old delivery can't see "what was the per-km rate on that day" without a settings-change log, which doesn't exist.

**Proposed**: add the full input snapshot at freeze time (same `feeFinalizedAt` moment), so the row becomes fully self-explaining:
```
pricePerKmCentsUsed, minFeeCentsUsed, weatherMultiplierUsed, demandMultiplierUsed,
peakHourMultiplierUsed, zoneMultiplierUsed, waitingFeeCentsUsed, urgencySurchargeCentsUsed,
baseFeeCents, adjustedFeeCents  (all nullable; populated only once those factors go live)
```
**Never recalculated**: every one of these, plus the existing frozen fields, once `feeFinalizedAt` is set. This is already the codebase's own stated rule (`shared/schema.ts` `deliveries.feeFinalizedAt` comment) — the proposal is to extend the *set* of frozen fields, never to change the freezing *mechanism*.

---

### 3.3 DeliveryEstimation
```
Coffee Owner picks/edits delivery address
        ↓
client calls estimateDeliveryFee() per supplier in cart (already live)
        ↓
server runs the SAME pipeline as 3.1, in "estimate mode" (no driver known,
supplier→cafe leg only — identical shape to the real creation-time estimate)
        ↓
displayed as "Estimation livraison: ~X DT (finalisée après confirmation)" —
never merged into the checkout total, always visually distinct
        ↓
Coffee Owner confirms → real order created → real sub-order created →
        ↓
at READY: same pipeline runs again for real, now persisted (3.1/3.2)
        ↓
at driver assignment: pipeline runs a THIRD time with the real driver leg,
this result is the one that's frozen (3.2)
```
**Estimation vs. final, explicitly**: estimation is *never* trusted, *never* persisted, and *always* recomputed at least twice more before money changes hands. This mirrors the existing, already-correct two-step real computation (creation estimate → assignment-time freeze) — estimation is simply a *third*, even-earlier, still-more-provisional call to the exact same function, one step before the two that already exist.

---

### 3.4 DriverPayoutEngine
**Today**: `deliveries.deliveryFee` is the sole figure — described in code comments as "the full driver/operator compensation," but there is no field distinguishing a Delivery Company's cut from what it passes to its driver.

**Proposed** (no invented percentage — this must be an explicit Admin/Delivery-Company business decision captured as *configuration*, not hardcoded here):
```
customerDeliveryFee = cafeOwnerFeeShareCents + supplierFeeShareCents   (= deliveryFee, unchanged)
driverPayoutCents    = deliveryFee × driverPayoutSharePercent           (new, configurable, default 100 —
                                                                          reproduces today's exact behavior)
companyMarginCents   = deliveryFee − driverPayoutCents                 (0 today, by construction)
bigBossMarginCents   = 0                                                (unchanged — platform takes no
                                                                          delivery cut today; this stays an
                                                                          explicit, honest zero, not omitted)
```
`driverPayoutSharePercent` would live either as a new global default in `deliveryPricingSettings` (simplest, matches the existing `cafeOwnerSharePercent` precedent) or per-Delivery-Company (if different companies negotiate different driver cuts) — that commercial-model decision belongs to BigBoss/Admin, not to this document. Default = 100% preserves current behavior exactly.

---

### 3.5 VehicleCompatibilityEngine
**Today**: `isVehicleCompatible(required, actual)` — ordinal rank (`BICYCLE:1, MOTO:2, CAR:3, VAN:4, TRUCK:5`), `OTHER` wildcard both directions, `null` required = always compatible. Enforced in `assignDriver`/`reassignDriver`, verified live (Moto→Truck-required rejected 409, Moto→Moto-required accepted 200).

**Proposed extension**, additive only: once weight/volume become *load-bearing* (Phase 4+), extend the same function's signature — never a second function — to also check `driver'sVehicle.maxWeightKg >= subOrder.totalWeightKg` etc., all short-circuiting to `true` when either side is unset (exactly the same "no requirement → always fine" principle already governing the vehicle-type check).

---

### 3.6 DeliveryRequirementEngine
**Today**: fully manual, Supplier-entered per sub-order, editable until `DELIVERED`/`CANCELLED`. No product-level weight/volume exists to auto-derive from.

**Proposed**: keep manual entry as the permanent primary path (a supplier always knows their own packaging better than a generic estimate), and *layer* an optional auto-suggestion on top once/if products gain a `weightGrams` field — the supplier would see a pre-filled, editable suggestion (`Σ productWeight × quantity`), never an auto-locked value. This keeps the human always in control, matching the project's existing "supplier confirms, never system-forces" philosophy (e.g. Admin already lets the supplier confirm auto-approve toggles rather than forcing them).

---

### 3.7 WeatherPricingEngine
**Today**: exactly one global scalar (`surgeMultiplierPermille`) plus a decorative label. No automation, no per-severity tiers, no availability/safety linkage.

**Proposed model** — keep the manual control as the *only* mechanism (no external weather API integration is recommended yet; see Risk Analysis §13 for why), but structure it as a **named condition**, not a bare multiplier:
```
weatherCondition: NORMAL | RAIN | HEAVY_RAIN | STORM | EXTREME   (Admin-selected, replaces free-text label)
each condition maps to: { customerMultiplier, driverPayoutBonus, availabilityImpact }
```
- **Customer price**: `customerMultiplier` (e.g. RAIN ×1.1, STORM ×1.3 — these are illustrative examples only, not a recommendation to hardcode)
- **Driver payout**: a flat or percentage *bonus*, independent of the customer multiplier — bad-weather driving is more dangerous and deserves direct compensation, which should not be diluted by whatever the customer-side markup happens to be
- **Availability/safety**: `EXTREME` should be able to flip the DeliverySafetyEngine (§3.19) to `SUSPENDED` for a zone, not just raise price — price and safety must be two separate levers so Admin can restrict deliveries in a dangerous zone even while keeping prices/incentives untouched elsewhere

---

### 3.8 DemandPricingEngine
**Today**: missing entirely — no driver-availability or pending-request count exists anywhere in a query.

**Proposed data needs**: `availableDriverCount` (drivers with `status='available'`-equivalent, currently not even tracked as a field — would need one), `activeDeliveryRequestCount` (deliveries in `PENDING`/`AVAILABLE`) per zone/time-window.

**Measurement**: a simple ratio, computed on demand (not a background job in Phase 1 of this feature) — `demandRatio = activeRequests / max(1, availableDrivers)`, mapped to a multiplier via an Admin-configured lookup table (not a formula BigBoss would need to derive itself), e.g. `ratio<1 → ×1.0, 1–2 → ×1.15, 2–4 → ×1.35, >4 → capped at ×1.5`.

**Caps/guarantees, non-negotiable design rule**: a hard Admin-configured **maximum multiplier** (e.g. 1.5–2.0×) and a **minimum driver payout guarantee** independent of demand pricing spikes downward — demand pricing must only ever apply to the *customer* side and to a *bonus* on top of the driver's base payout, never as a mechanism that could reduce what a driver receives below their guaranteed floor.

**Distinguish from weather**: weather is a *condition* (binary-ish, admin-declared, can trigger safety states); demand is a *ratio* (continuous, ideally computed rather than declared, never triggers safety states by itself — high demand is a business opportunity, not a hazard).

---

### 3.9 WaitingTimePricingEngine
**Today**: missing. `deliveries` has `createdAt/acceptedAt/assignedAt/pickedUpAt/inTransitAt/deliveredAt/cancelledAt` already — the raw timestamps needed to *measure* waiting already exist; only the *compensation* logic is absent.

**Proposed**:
- **Driver waiting at supplier** (supplier not ready when driver arrives): timer starts when driver's status reaches the pickup location (would need a new `driverArrivedAt` timestamp — not currently captured) and stops at `pickedUpAt`; compensation flows *to* the driver, charged against the **supplier** (their preparation delay), never the customer.
- **Customer waiting at pickup** (self-pickup, customer late): no compensation needed — this is the customer's own time, not billable to anyone.
- **Supplier preparation delay generally**: already partially visible via `PREPARING`/`READY` sub-order timestamps (no dedicated column today, but derivable from status-change history if that history were captured — it currently isn't, only the current status is stored, not a log of transitions).
- **Who pays**: the party responsible for the delay (supplier for prep delay, nobody for pure traffic/distance which is already priced via distance). This must never silently come out of the platform margin (which is already 0) or the customer's pocket for a delay they didn't cause.

---

### 3.10 SupplierSubsidyEngine
**Today**: EXISTS, binary — `FREE_SHIPPING` promotion type + `freeShippingMinAmount` threshold, evaluated fresh at delivery-creation/finalization time (never reads the stale `subOrders.freeShipping` snapshot, which is a separate/independent value from the order's own promotion display — a subtlety already correctly handled).

**Proposed extension**: add a **partial subsidy percentage** to the same promotion row (`FREE_SHIPPING` today implies 100%; a new optional `deliverySubsidyPercent` field would let a supplier fund, say, 50% of delivery instead of all-or-nothing) — this plugs directly into the existing `cafeOwnerFeeShareCents`/`supplierFeeShareCents` split calculation as a third input alongside `cafeOwnerSharePercent`, with supplier subsidy applied *first* (reducing the customer's share), then the normal split applied to whatever remains.

---

### 3.11 BigBossSubsidyEngine
**Today**: missing — the platform currently absorbs zero cost on any delivery.

**Proposed**: structurally identical mechanism to 3.10 but sourced from a platform-controlled promotional budget rather than a supplier's own account — e.g. `bigBossSubsidyPercent` on a *new*, Admin-only campaign entity (not the supplier-facing `promotions` table, to keep the two funding sources auditable and separate per the task's explicit instruction). Use cases: new-customer first-delivery-free, strategic-zone launch incentives, retention campaigns. The pricing pipeline (3.1) would apply supplier subsidy, then BigBoss subsidy, then the remaining split — each contribution tracked as its own snapshot field (3.2) so "who actually paid for this specific delivery" is always fully reconstructable.

---

### 3.12 DeliveryBudgetEngine
**Today**: missing — no check exists for whether a delivery is economically sound before it's dispatched.

**Proposed**: a pure validation function (not a blocking gate in Phase 1 — advisory/logging only until proven reliable):
```
availableBudget = cafeOwnerFeeShareCents + supplierFeeShareCents + bigBossSubsidyCents
requiredPayout  = driverPayoutCents + companyMarginCents + bigBossOperationalCostCents (if any)
shortfall = requiredPayout − availableBudget
```
**If shortfall > 0**: in early phases, log/flag for Admin review only (e.g. a long-distance delivery where the minimum fee doesn't actually cover a fair driver payout) — never silently degrade driver payout, and never silently overcharge the customer to cover it after the fact. A visible "this delivery type may be under-priced in this zone" signal for Admin to adjust `deliveryPricingSettings` is more valuable than an automatic correction that could surprise any party.

---

### 3.13 RouteEngine
**Today**: haversine only; `roadDistanceKm`/`estimatedDurationMinutes` columns exist and are prepared but unpopulated; `DeliveryRouteMap` already integrates raw Google Maps JS for a straight-line visual + external "Open in Maps" hand-off (no Directions API call).

**Proposed transition**:
```
Provider abstraction: a single `RouteProvider` interface (getRoute(origin, destination) →
  {distanceKm, durationMinutes} | null) — haversine wrapped as the built-in, always-available
  fallback implementation; a real provider (Google Directions, Mapbox Directions, OSRM) plugged
  in behind the same interface later, never a parallel/competing pricing path.
Fallback: if the real provider call fails/times out/quota-exceeded → haversine, exactly as
  today, transparently — no order should ever fail because a maps API hiccupped.
Caching: route results between the same two coordinate pairs are cacheable for a short window
  (e.g. a few minutes) since delivery-fee calls for the same supplier→cafe pair happen twice
  per delivery already (estimate at creation, final at assignment) — caching only helps API-cost,
  never changes the freezing behavior (3.2's rule still applies: once frozen, never recomputed).
API cost: only ONE real routing call per delivery lifecycle should be the target (at the final,
  driver-assignment freeze point) — the creation-time estimate can stay haversine-only forever,
  since it's provisional anyway and gets superseded.
Recalculation: NEVER after feeFinalizedAt, matching the existing, already-correct rule.
```

---

### 3.14 DeliveryDispatchEngine
**Today**: fully manual two-step decision by the Supplier (`dispatchDelivery`: DELIVERY_COMPANY vs SUPPLIER, optional targeted company) then manual driver pick (`assignDriver`, now vehicle-gated).

**Proposed**: keep both manual choices as the default/always-available path (small suppliers with 1–2 drivers don't need or want an algorithm), and add an *optional* "Suggest a driver" assist that ranks the supplier's/company's own already-compatible (§3.5-filtered) roster by: distance to supplier (haversine today, route-aware later per §3.13), current active-delivery count (workload), and last-known availability signal — presented as a *suggestion* the supplier still clicks to confirm, never an auto-assignment. This preserves the existing authorization/ownership model in `assignDriver` untouched — it only pre-fills the same `driverId` parameter that function already validates.

---

### 3.15 DriverOfferEngine
**Today**: a Delivery Company already sees `deliveryFee` before accepting a pooled delivery (`available-deliveries-page.tsx`). An individual Driver never sees an offer to accept/decline at all — they only ever receive an already-decided assignment.

**Proposed offer card** (shown to a driver before an optional future accept/decline step, not shown today): pickup, destination, distance (haversine now, route-aware later), ETA (once §3.13 exists), vehicle requirement (already computed, §3.5), weight/packages (already captured, §3.6), and a **guaranteed payout** figure.

**Should payout be frozen before acceptance?** Yes — this is a direct extension of the existing, already-correct rule that the fee is frozen at assignment (`feeFinalizedAt`). If drivers ever gain a genuine accept/decline step, the offered payout must be computed and shown *before* they decide, and whatever they see must be exactly what gets frozen if they accept — never a "we'll compute your real payout after you accept" pattern, which would erode trust in the platform.

---

### 3.16 Batching / Consolidation Engine
**Today**: strictly one driver, one pickup, one dropoff per `deliveries` row — no schema concept of a multi-stop route.

**Analysis (Phase 6, explicitly future, no schema proposed today)**: batching (same supplier, multiple cafés) is architecturally simpler than consolidation (multiple suppliers, one driver route) because the former only needs a *route* (ordered list of dropoffs) layered on top of still-separate `deliveries` rows sharing one physical trip, while the latter requires re-examining the "one delivery = one sub-order" assumption baked into `deliveries.subOrderId NOT NULL` today. Pricing implication: a batched trip's *distance-based* fee would need to be apportioned across the batched sub-orders rather than each independently re-walking the same road — this is a real, non-trivial pricing design question that should be scoped as its own follow-up proposal once Phase 1–5 are stable, not solved speculatively here.

---

### 3.17 ZonePricingEngine
**Today**: missing — no polygon/governorate/zone table exists; every location is a raw lat/lng point.

**Proposed**: a new lightweight `deliveryZones` table (name, a simple bounding definition — a governorate name match against the already-existing `locationDetails.governorate` field suppliers/cafés already fill in is the cheapest possible v1, well before real polygon geofencing), each zone carrying its own optional rate override / minimum-fee override / restricted flag. Applied as one more multiplier/override step in the pipeline (§3.1), never a second pricing engine.

---

### 3.18 PeakHourEngine
**Today**: missing — the one `surgeMultiplierPermille` is always-on, not time-scoped.

**Proposed**: an Admin-configurable list of named time windows (`{label, daysOfWeek, startTime, endTime, multiplier}`, e.g. "Lunch rush" Mon–Fri 11:30–14:00 ×1.2) — evaluated at computation time against the current server time, feeding the same pipeline slot the flat surge multiplier occupies today (in fact, the existing flat surge could become "the multiplier that applies when no peak window matches," preserving 100% of current behavior when no peak windows are configured).

---

### 3.19 DeliverySafetyEngine
**Today**: missing — no state machine, no way to suspend deliveries in a zone/globally beyond an Admin manually pausing dispatch by convention (not enforced anywhere in code).

**Proposed states**:
```
NORMAL      — full pricing/dispatch as configured
WARNING     — deliveries continue; driver-facing banner + optional payout bonus (linked to §3.7)
RESTRICTED  — only compatible/eligible vehicle types may be dispatched (e.g. no bicycles in a storm)
SUSPENDED   — no new deliveries created for the affected zone/globally; in-flight deliveries
              still complete normally (never strand a driver mid-route)
```
**Who can trigger each**: only Admin can set `RESTRICTED`/`SUSPENDED` (a safety/liability decision, never a per-supplier or per-driver call); `WARNING` could reasonably auto-follow a `HEAVY_RAIN`/`STORM` weather condition (§3.7) as a default Admin-reversible suggestion.

---

### 3.20 SelfPickupEngine
**Today, fully live and verified**:
```
Coffee Owner (checkout, pre-existing UI) → deliveryMethod='SELF_PICKUP'
        ↓
Supplier marks sub-order READY (existing status transition, unchanged)
        ↓
Coffee Owner sees "Go" (order-details-modal.tsx) → SelfPickupModal
        ↓
"Ouvrir dans Maps" → Google Maps deep link, destination = supplier's snapshotted pickup
  address, origin omitted (device geolocates automatically) — reuses the exact URL
  convention already used by DeliveryRouteMap, no second maps integration
        ↓
Supplier reveals selfPickupCode in their own modal ("Reveal / Show Code")
        ↓
Coffee Owner types the code back → PATCH /api/suborders/:id/confirm-self-pickup
  → storage.confirmSelfPickup (ownership + state + code-match + single-use, all server-side)
        ↓
sub-order status → DELIVERED directly (no intermediate courier state — there is none to
  track for a pickup the customer executes themselves)
        ↓
"Completed" — Order Progress stepper (self-pickup label set)
```
**What should still improve**: the pickup address snapshot is currently taken once at order creation and never re-validated against, e.g., a supplier's temporary alternate pickup point for a specific day — out of scope for now, flagged as a real future nuance rather than solved here.

---

### 3.21 PickupCodeService
**Today**: two structurally similar but separately-implemented instances — `deliveries.pickupCode/dropoffCode` (normal delivery, generated at delivery creation, redacted per role, single-use via the existing status-transition checks) and `subOrders.selfPickupCode` (self-pickup, generated at order creation, redacted the same way, single-use via `selfPickupCodeConfirmedAt IS NULL` guard).

**Proposed**: extract a single shared helper — `generatePickupConfirmationCode()` already exists as one private method reused by both paths today (good, no duplication there) — and additionally introduce:
- **Expiration**: neither code type expires today; add an optional `expiresAt` (e.g. 24–72h after generation) with a graceful "code expired, contact support" message rather than a silent failure — this is additive and doesn't change the happy path.
- **Audit trail**: `selfPickupConfirmedByUserId`/`selfPickupCodeConfirmedAt` already exist (new); the equivalent for normal-delivery codes (who read the code aloud, when) doesn't — worth adding symmetrically if support/dispute-resolution ever needs it.

---

### 3.22 DeliveryAnalyticsEngine
**Today**: scattered client-side reduces, no central source.

**Proposed** (read-only, additive — never a write path):
- **Operations**: delivery count, completion rate, cancellation rate, average total duration (`deliveredAt − createdAt`), average pickup delay (`pickedUpAt − assignedAt`) — all derivable from existing timestamps without new columns.
- **Economics**: average fee, average driver payout, average supplier/customer contribution, subsidy totals (once §3.10/3.11 exist), cost per delivery — derivable from existing frozen fields (§3.2) plus the new payout split (§3.4).
- **Drivers**: acceptance rate (needs an offer/decline event, §3.15, not yet emitted), completion rate, earnings, distance, utilization (active vs. idle time) — mostly derivable today except acceptance rate, which depends on a feature that doesn't exist yet.
- **Suppliers**: delivery volume, average cost, delay frequency, Self Pickup adoption rate (`count(deliveryMethod='SELF_PICKUP') / count(*)`, fully computable today).
- **Geography**: density/zone breakdowns depend on §3.17 existing first.
A single new read-only aggregation module (e.g. `server/delivery-analytics.ts`, mirroring the existing `promotions-engine.ts`/`prospecting-engine.ts` convention of one purpose-built file per engine) computing these from existing tables, exposed via new Admin-only endpoints (§8) — never duplicating `computeDeliveryFee`'s logic, only reading its already-frozen outputs.

---

## 4. Proposed Final Architecture

```
                                    ┌─────────────┐
                                    │    ADMIN    │
                                    │ (pricing,   │
                                    │  vehicles,  │
                                    │  zones,     │
                                    │  safety)    │
                                    └──────┬──────┘
                                           │ configures
                                           ▼
                              ┌────────────────────────┐
                              │ DeliveryPricingEngine   │◄────── DeliveryBudgetEngine
                              │ (factor pipeline, §3.1) │        (advisory check)
                              └────────────┬────────────┘
                                           │ produces
                                           ▼
                              ┌────────────────────────┐
                              │ DeliveryPricingSnapshot │  (frozen forever once set)
                              └────────────┬────────────┘
                                           │
        ┌──────────────────────────────────┼──────────────────────────────────┐
        ▼                                  ▼                                  ▼
┌───────────────┐               ┌─────────────────────┐              ┌───────────────┐
│ Coffee Owner   │◄─estimate────┤ DeliveryEstimation   │              │ DriverPayout   │
│ pays customer  │               │ (pre-checkout only) │              │ Engine (§3.4)  │
│ contribution   │               └─────────────────────┘              └───────┬───────┘
└───────┬───────┘                                                            │
        │ order created                                                      ▼
        ▼                                                          ┌──────────────────┐
┌───────────────┐        ┌──────────────────────┐                  │ Driver / Delivery │
│    Supplier    │──────▶│ DeliveryRequirement   │                  │ Company receives  │
│ contributes,    │       │ Engine (§3.6)         │                  │ payout            │
│ sets requirements│      └──────────┬───────────┘                  └───────────────────┘
└───────┬───────┘                    │ feeds
        │ dispatches                 ▼
        ▼                  ┌──────────────────────┐
┌────────────────┐         │ VehicleCompatibility  │
│ DeliveryDispatch│────────│ Engine (§3.5)         │
│ Engine (§3.14)  │        └──────────────────────┘
└───────┬────────┘
        │ assigns (gated by compatibility)
        ▼
┌────────────────────┐        ┌─────────────────┐
│ Supplier Driver  OR │───────▶│ RouteEngine      │
│ Delivery Company →  │       │ (§3.13, fallback │
│ Company Driver      │       │  to haversine)    │
└──────────┬──────────┘        └─────────────────┘
           │ status updates (existing realtime, unchanged)
           ▼
┌────────────────────┐
│    Coffee Owner     │  ← sees status, self-pickup code flow, or delivery tracking
└────────────────────┘

                    All of the above continuously feed:
                    ┌───────────────────────────────┐
                    │   DeliveryAnalyticsEngine      │  (read-only, Admin-facing)
                    └───────────────────────────────┘

        Cutting across everything: WeatherPricingEngine, DemandPricingEngine,
        PeakHourEngine, ZonePricingEngine, SupplierSubsidyEngine, BigBossSubsidyEngine
        are all OPTIONAL INPUT FACTORS into DeliveryPricingEngine's pipeline (§3.1) —
        none of them is a separate pricing path; DeliverySafetyEngine sits beside the
        pipeline as a gate that can block dispatch independent of price.
```

---

## 5. Proposed Pricing Formula

**Do not copy the existing formula verbatim — evolve it, backward-compatibly.**

```
Step 1 — Base delivery cost (unchanged from today):
    baseFeeCents = max( distanceKm × pricePerKmCents[vehicleType],  minFeeCents[vehicleType] )

Step 2 — Adjusted cost (new — every multiplier defaults to 1.0/0, reproducing today exactly):
    adjustedFeeCents = baseFeeCents
                      × weatherMultiplier         (default 1.0)
                      × demandMultiplier          (default 1.0, hard-capped e.g. ≤ 2.0)
                      × peakHourMultiplier         (default 1.0)
                      × zoneMultiplier             (default 1.0)
                      + waitingFeeCents           (default 0)
                      + urgencySurchargeCents      (default 0)

Step 3 — Funding (subsidies applied BEFORE the customer/supplier split):
    supplierSubsidyCents = adjustedFeeCents × supplierSubsidyPercent / 100    (existing: 0 or 100%;
                                                                                proposed: any %, §3.10)
    bigBossSubsidyCents  = (adjustedFeeCents − supplierSubsidyCents) × bigBossSubsidyPercent / 100
                                                                               (new, default 0, §3.11)
    remainingCents = adjustedFeeCents − supplierSubsidyCents − bigBossSubsidyCents

Step 4 — Customer / Supplier split (existing mechanism, unchanged formula):
    customerContributionCents  = remainingCents × cafeOwnerSharePercent / 100
    supplierContributionCents  = remainingCents − customerContributionCents

Step 5 — Payout (new, §3.4; default reproduces today exactly):
    driverPayoutCents  = adjustedFeeCents × driverPayoutSharePercent / 100    (default 100%)
    companyMarginCents = adjustedFeeCents − driverPayoutCents                 (default 0)
    bigBossMarginCents = 0   (platform takes no per-delivery operational cut today — this
                              stays an explicit, honest zero unless a future commercial
                              decision introduces one; never silently non-zero)
```

**Backward compatibility proof**: with every new multiplier at its default (1.0/0%/100%), Steps 2–5 collapse algebraically to exactly `feeCents = baseFeeCents`, `cafeOwnerFeeShareCents = feeCents × cafeOwnerSharePercent/100`, `supplierFeeShareCents = feeCents − cafeOwnerFeeShareCents` — the exact three lines `computeDeliveryFee` already computes today. This is a **superset**, not a rewrite.

---

## 6. Vehicle Model

| Attribute | Exists today? | Where |
|---|---|---|
| `pricePerKmCents` | ✅ EXISTS | `deliveryPricingSettings.vehiclePricing[type]` |
| `minFeeCents` | ✅ EXISTS | same |
| `maxWeightKg` | ❌ MISSING | proposed addition to `deliveryPricingSettings.vehiclePricing[type]` |
| `maxVolumeL` | ❌ MISSING | proposed addition, same location |
| `maxPackages` | ❌ MISSING | proposed addition, same location |
| `speedFactor` (affects ETA once RouteEngine exists) | ❌ MISSING | proposed addition, only meaningful once §3.13 ships |
| `fragilityCompatibility` (can this vehicle safely carry fragile goods) | ❌ MISSING | proposed boolean per type, feeds §3.5 alongside the existing ordinal rank |
| `specialHandlingCompatibility` | ❌ MISSING | proposed — likely a free-form capability tag set per vehicle rather than a single boolean, since "special handling" in `subOrders.specialHandling` is itself free text today |

The six existing types (`BICYCLE, MOTO, CAR, VAN, TRUCK, OTHER`) are sufficient for the foreseeable future — no new type is proposed. All new attributes above are additive to the same `vehiclePricing` jsonb blob (no schema/table change, just new optional keys per vehicle type), so existing rows with only `{pricePerKmCents, minFeeCents}` keep working with the new attributes simply absent/defaulted.

---

## 7. Data Model Proposal

### EXISTING TABLES (unchanged, reused as-is)
```
Table: deliveries
Purpose: one row per sub-order's physical delivery lifecycle + frozen pricing result
Key fields already present: deliveryFee, cafeOwnerFeeShareCents, supplierFeeShareCents,
  freeDeliveryApplied, vehicleId, vehicleType, distanceKm, roadDistanceKm (prep),
  estimatedDurationMinutes (prep), surgeMultiplierPermille, feeFinalizedAt, pickupCode,
  dropoffCode, status (full lifecycle enum)

Table: subOrders
Purpose: per-supplier order slice; now also carries transport requirements + self-pickup
Key fields already present: requiredVehicleType, totalWeightKg, totalVolumeL,
  numberOfPackages, numberOfItems, isFragile, specialHandling, selfPickupCode,
  selfPickupCodeConfirmedAt, selfPickupConfirmedByUserId, selfPickupAddress

Table: deliveryPricingSettings
Purpose: singleton global pricing configuration
Key fields already present: vehiclePricing (jsonb), defaultVehicleType,
  surgeMultiplierPermille, surgeLabel, cafeOwnerSharePercent

Table: vehicles
Purpose: one row per Driver/Delivery-Company/Supplier-owned vehicle
Key fields already present: ownerType, ownerId, type, assignedDriverId

Table: promotions
Purpose: supplier-funded promotions, including FREE_SHIPPING (delivery subsidy today)
Key fields already present: type, status, freeShippingMinAmount, eligibleCafeIds
```

### PROPOSED NEW TABLES (none proposed for immediate implementation without further review — listed here for completeness of the design, phased per §11)

```
Table: deliveryZones                                          [Phase 4]
Purpose: named geographic pricing/restriction regions
Fields: name, governorateMatch (simplest v1) or polygon (later), rateMultiplier,
  minFeeOverride, isRestricted, isSuspended
Relationships: referenced by computeDeliveryFee via the café/supplier's governorate

Table: peakHourWindows                                        [Phase 4]
Purpose: Admin-configured time-based surge windows
Fields: label, daysOfWeek, startTime, endTime, multiplier, isActive
Relationships: none — pure configuration, evaluated against server clock at compute time

Table: deliveryWeatherConditions (or a single-row "current condition" extension of
  deliveryPricingSettings — TBD at execution-prompt time)                [Phase 4]
Purpose: named condition (NORMAL/RAIN/HEAVY_RAIN/STORM/EXTREME) + its customer
  multiplier, driver bonus, and safety-state implication
Relationships: feeds both DeliveryPricingEngine and DeliverySafetyEngine

Table: bigBossDeliveryCampaigns                                [Phase 5]
Purpose: platform-funded subsidy campaigns, kept separate from supplier `promotions`
Fields: name, subsidyPercent, zoneScope, dateRange, budgetCapCents, spentCents
Relationships: read by DeliveryPricingEngine Step 3 alongside supplier subsidy

Table: deliverySafetyState                                     [Phase 4]
Purpose: current NORMAL/WARNING/RESTRICTED/SUSPENDED state per zone (or globally)
Fields: zoneId (nullable = global), state, reason, setByUserId, setAt
Relationships: read by DeliveryDispatchEngine before allowing a new delivery to be created
```

**Explicitly not proposed**: a separate "driver offer" table (§3.15) — an offer/decline event, if ever built, is naturally a new `status` value or a lightweight event log, not a new heavyweight entity; a "batching" table (§3.16) — deliberately deferred, no schema proposed until Phase 6 is actually scoped.

---

## 8. API Proposal (none of these exist yet — all illustrative, none implemented)

### Coffee Owner
- `POST /api/orders/estimate-delivery` — **EXISTS already** (input: cart items grouped by supplier + subtotal, candidate address; output: per-supplier + total estimated café contribution)
- `PATCH /api/suborders/:id/confirm-self-pickup` — **EXISTS already**

### Supplier
- `PATCH /api/suborders/:id/transport-requirements` — **EXISTS already**
- `GET /api/supplier/delivery-analytics` *(proposed, Phase 6)* — role: SUPPLIER; output: own delivery volume/cost/delay/self-pickup-rate

### Driver
- `GET /api/driver/delivery-offers` *(proposed, Phase 3, only if §3.15 is greenlit)* — role: DRIVER; output: pending offers with frozen guaranteed payout
- `PATCH /api/driver/delivery-offers/:id/accept` / `/decline` *(proposed, Phase 3)*

### Delivery Company
- `GET /api/delivery-company/driver-payouts` *(proposed, Phase 3)* — role: DELIVERY_COMPANY; output: per-driver payout history once §3.4's split is real

### Admin — Pricing
- `GET/PATCH /api/admin/delivery-pricing` — **EXISTS already**
- `GET/PATCH /api/admin/delivery-zones` *(proposed, Phase 4)*
- `GET/PATCH /api/admin/delivery-peak-hours` *(proposed, Phase 4)*
- `GET/PATCH /api/admin/delivery-weather-condition` *(proposed, Phase 4)*
- `GET/PATCH /api/admin/delivery-safety-state` *(proposed, Phase 4)*

### Admin — Dispatch / Monitoring
- `GET /api/admin/deliveries` — **EXISTS already** (`admin/delivery-page.tsx`'s data source)
- `GET /api/admin/delivery-budget-flags` *(proposed, Phase 5)* — output: deliveries flagged as economically insufficient (§3.12)

### Analytics (Admin-only, all proposed, Phase 6)
- `GET /api/admin/delivery-analytics/operations`
- `GET /api/admin/delivery-analytics/economics`
- `GET /api/admin/delivery-analytics/drivers`
- `GET /api/admin/delivery-analytics/suppliers`
- `GET /api/admin/delivery-analytics/geography` *(depends on zones existing, Phase 4+)*

### Self Pickup
- `PATCH /api/suborders/:id/confirm-self-pickup` — **EXISTS already**
- Reveal-code is not a separate endpoint — already served as part of the existing role-redacted `GET /api/orders` response, masked client-side until the supplier explicitly asks to see it (a UI-only toggle, not a security boundary — the real boundary is server-side redaction, already in place)

---

## 9. Real-Time Synchronization

**Nothing proposed here replaces the existing broadcast/notification infrastructure** — every new feature in this proposal should emit through the exact same channels already wired:

```
Admin changes pricing config → 'delivery_pricing_updated' broadcast (EXISTS today)
        ↓
Supplier sets transport requirements → 'suborder_status_changed' (EXISTS, reused by the
  new endpoint today — verified: no new event type was needed)
        ↓
Delivery dispatched/assigned/status-changed → 'delivery_status_changed',
  'delivery_created', 'delivery_assigned' (all EXIST today)
        ↓
Driver updates status → propagates to sub-order → order aggregate (EXISTS today,
  storage.recomputeOrderAggregateStatus is the single writer, already correct)
        ↓
Coffee Owner sees the update → ORDER_EVENTS/DELIVERY_EVENTS invalidate `/api/orders`
  client-side (EXISTS today, use-realtime.ts)
```

**Where new real-time IS required**: only for genuinely new *concepts* that don't yet have an event — Driver offers (§3.15, if built) would need a new `delivery_offer_created`/`delivery_offer_expired` pair; a Zone/Weather/Safety-state change (§3.7/3.17/3.19) should broadcast a new `delivery_conditions_changed` event so an open dispatch screen refreshes without a manual reload — everything else in this proposal (pricing config, transport requirements, self-pickup) already has a suitable existing event to reuse, exactly as the V2 increment already demonstrated is possible.

---

## 10. Permissions / Ownership Matrix

| Data | Coffee Owner | Supplier | Driver | Delivery Company | Admin |
|---|---|---|---|---|---|
| Delivery price (own contribution) | ✅ view only | ✅ view own share only | ❌ | ❌ | ✅ full breakdown |
| Delivery price (other party's share) | ❌ | ❌ (own only) | ❌ | ❌ | ✅ |
| Driver payout | ❌ | ❌ | ✅ view own only | ✅ view own drivers | ✅ all |
| Vehicle (own) | ❌ (n/a) | ✅ manage own drivers' | ✅ manage own | ✅ manage own fleet | ✅ view all |
| Vehicle compatibility rule (global) | ❌ | ❌ | ❌ | ❌ | ✅ configure |
| Transport requirements (own order) | ❌ view customer-relevant summary only | ✅ set/edit own sub-order | ✅ view assigned mission | ✅ view assigned mission | ✅ view all |
| Delivery status | ✅ view | ✅ view/act on own sub-order | ✅ view/update assigned | ✅ view/act within own fleet | ✅ view all |
| Customer (café) identity/address | ❌ (is the customer) | ✅ own orders only | ✅ assigned deliveries only | ✅ assigned deliveries only | ✅ all |
| Supplier identity/address | ✅ own orders only | ❌ (is the supplier) | ✅ assigned deliveries only | ✅ assigned deliveries only | ✅ all |
| Pricing configuration (rates, split %, surge) | ❌ | ❌ | ❌ | ❌ | ✅ only Admin |
| Analytics (own scope) | ❌ | ✅ own supplier scope (Phase 6) | ✅ own earnings (exists today) | ✅ own fleet scope (Phase 6) | ✅ platform-wide |
| Subsidy configuration (supplier-funded) | ❌ | ✅ own promotions | ❌ | ❌ | ✅ view all |
| Subsidy configuration (BigBoss-funded) | ❌ | ❌ | ❌ | ❌ | ✅ only Admin |
| Self Pickup code | ❌ never (receives verbally only) | ✅ own sub-order, reveal on demand | ❌ (n/a) | ❌ (n/a) | ✅ |
| Pickup/dropoff code (normal delivery) | dropoff code only, own order | pickup code only, own sub-order | ❌ (redacted from driver) | ❌ | ✅ both |

This matrix is a documentation of rules **already enforced today** (verified via `storage.getOrders`'s per-field redaction and every mutation's ownership check) extended consistently to the new concepts this proposal introduces — no relaxation of any existing boundary is proposed anywhere.

---

## 11. Phased Implementation Plan

### PHASE 1 — Foundation hardening *(low risk, high value, mostly already done)*
- Formalize the factor-pipeline refactor of `computeDeliveryFee` internals (§3.1) with every new factor defaulted to no-op — pure internal restructuring, zero behavior change.
- Extend `DeliveryPricingSnapshot` fields (§3.2) so every future factor has somewhere to freeze its value, even before that factor is activated.
- **Dependencies**: none — this is refactor-only.
- **DB changes**: additive nullable columns on `deliveries` for the new snapshot fields.
- **Risk**: low (additive, no behavior change if done correctly — the existing 3-line formula must be provably reproduced).
- **Must NOT change**: the actual numeric output of `computeDeliveryFee` for any existing scenario.

### PHASE 2 — Vehicle / requirements / route groundwork
- Vehicle attribute extensions (§6: maxWeight/maxVolume/maxPackages/speedFactor/fragility/specialHandling flags) — additive jsonb keys.
- `RouteEngine` provider abstraction (§3.13) with haversine as the only real implementation for now — no external API call yet, just the interface, so later phases can plug a provider in without touching call sites.
- **Dependencies**: Phase 1's snapshot extension (route fields need somewhere to freeze).
- **DB changes**: additive vehicle-pricing jsonb keys; `roadDistanceKm`/`estimatedDurationMinutes` already added.
- **Risk**: low.
- **Must NOT change**: `isVehicleCompatible`'s existing ordinal-rank behavior for vehicle *type* — weight/volume become an *additional* gate, never a replacement.

### PHASE 3 — Payout / dispatch assist / driver offers
- `DriverPayoutEngine` real split (§3.4) — new `driverPayoutSharePercent` config, default 100% (reproduces today).
- Fix `driver/wallet.tsx`'s mislabeled figure once the real split exists (this is the one genuine bug-fix in this whole proposal).
- Optional `DeliveryDispatchEngine` driver-suggestion assist (§3.14) — advisory only, never auto-assigns.
- Optional `DriverOfferEngine` (§3.15) — only if BigBoss decides to let individual drivers accept/decline; this is a genuine product-direction question, not purely technical, and should be confirmed before scheduling.
- **Dependencies**: Phase 1 (payout needs the pipeline's clean separation of concerns).
- **DB changes**: `driverPayoutSharePercent` on `deliveryPricingSettings` (or per-company); possibly a new offer/event log if §3.15 is greenlit.
- **Risk**: medium — touches driver-facing money display; must be tested against real existing driver accounts exactly as the V2 self-pickup/vehicle-compatibility work was.
- **Must NOT change**: `deliveries.deliveryFee`'s meaning or value — the split is a new *view* over the same frozen number, never a change to it.

### PHASE 4 — Weather / waiting / zones / peak hours / safety
- All four pricing factors (§3.7, 3.9, 3.17, 3.18) plus `DeliverySafetyEngine` (§3.19).
- **Dependencies**: Phase 1's pipeline (each factor is one more pipeline step).
- **DB changes**: new tables `deliveryZones`, `peakHourWindows`, weather-condition config, `deliverySafetyState` — all genuinely new entities, none touching existing tables destructively.
- **Risk**: medium-high — this phase introduces the most new *business* complexity (zone boundaries, peak windows, safety authority) even though the *code* risk is contained by the pipeline's default-no-op design.
- **Must NOT change**: the existing single global `surgeMultiplierPermille` should remain functional as the "no peak window active" fallback, not be deleted.

### PHASE 5 — Demand pricing / subsidies / budget check
- `DemandPricingEngine` (§3.8), `SupplierSubsidyEngine` partial-percent extension (§3.10), `BigBossSubsidyEngine` (§3.11), `DeliveryBudgetEngine` advisory check (§3.12).
- **Dependencies**: Phase 4's pipeline slots for multipliers; Phase 3's payout split (budget check needs a real payout figure to compare against).
- **DB changes**: driver-availability tracking (new field/table, since "available" isn't tracked today), `bigBossDeliveryCampaigns` table.
- **Risk**: high — demand pricing is the single riskiest feature in this entire proposal (see §13) and must ship with hard caps and a kill switch from day one.
- **Must NOT change**: driver payout floor — demand multipliers apply to customer price and/or a driver bonus, never as a mechanism to reduce a driver's guaranteed payout.

### PHASE 6 — Batching / advanced analytics
- `Batching/Consolidation Engine` (§3.16) — genuinely deferred pending its own dedicated design pass.
- Full `DeliveryAnalyticsEngine` (§3.22) across all five dimensions.
- **Dependencies**: everything above, since analytics reports on all of it.
- **DB changes**: batching needs its own follow-up schema proposal, not specified here; analytics can be read-only queries over existing + Phase 1–5 data, no new tables strictly required beyond maybe a materialized/cached rollup for performance at scale.
- **Risk**: low for analytics (read-only), high for batching (touches the core one-delivery-one-driver assumption).
- **Must NOT change**: nothing structural — this phase is additive reporting plus one clearly-scoped-later structural question.

---

## 12. Migration / Backward Compatibility

- **Existing orders/deliveries**: every proposed DB change in every phase is an additive nullable column or a wholly new table — never a rename, never a type change, never a `NOT NULL` added to an existing column. This mirrors exactly how the V2 increment was executed and verified (order #147, created before the self-pickup schema existed, rendered correctly with graceful nulls throughout, live-tested).
- **Existing prices**: `feeFinalizedAt` remains the single freezing rule for every new snapshot field added in Phase 1 onward — once set, a delivery's pricing fields (old and new) are never recomputed, exactly as today.
- **Existing drivers/suppliers/Admin configuration**: every new configuration surface (zones, peak hours, weather, safety, subsidy) defaults to a fully-inert state (no zones defined = no zone effect; no peak windows = flat surge as today; weather condition = NORMAL = ×1.0) so zero Admin action is required for the system to keep behaving exactly as it does today the moment any phase ships.
- **Existing statuses**: no new order/sub-order/delivery status values are proposed anywhere in this document — every new concept (self-pickup progress labels, safety states, offer accept/decline) is either a presentation-layer relabeling of existing statuses (already how self-pickup was done) or a wholly separate, additive state machine (safety states) that never touches `orderStatusEnum`/`deliveryStatusEnum`.
- **Historical delivery data**: already fully preserved by the existing freeze mechanism; this proposal only asks that the *set* of frozen fields grow, never that the freezing behavior itself change.

---

## 13. Risk Analysis

| Risk | Mitigation |
|---|---|
| Breaking existing pricing | Pipeline refactor (Phase 1) must be proven byte-identical against a broad regression suite of existing real orders before any factor is allowed to go non-default; every new multiplier defaults to a mathematical no-op |
| Duplicated pricing logic | Every new factor is a step *inside* `computeDeliveryFee`'s single pipeline — never a second function computing a fee; this discipline is what kept the codebase clean pre-V2 (verified: zero duplication found in the forensic analysis) and must be preserved deliberately |
| Inconsistent payouts | `driverPayoutSharePercent` lives in exactly one place (pricing settings or per-company config), read by exactly one function — never hardcoded per-page the way `driver/wallet.tsx` currently improvises today |
| Stale delivery information | Reuse existing realtime events wherever one already fits (§9) — only introduce a new event when a genuinely new concept has no existing equivalent |
| Incompatible drivers | Already mitigated and verified live (§3.5) — future weight/volume extensions must short-circuit to "compatible" when unset, exactly like the existing vehicle-type check |
| Incorrect route distance | RouteEngine's mandatory haversine fallback (§3.13) — a routing-provider outage must never block or mis-price a delivery, only make it slightly less distance-accurate for that one call |
| Weather abuse (Admin sets extreme multiplier by mistake or bad actor) | Hard-cap every multiplier at the pipeline level (Admin cannot exceed a coded maximum, not just a UI-suggested one), and log every pricing-config change with who/when (extend the existing `delivery_pricing_updated` broadcast's payload to include the actor) |
| Demand multiplier abuse | Hard cap (§3.8), plus a driver-payout floor that demand pricing can never erode — the single most important guardrail in this whole proposal |
| Database migration risk | Every change additive/nullable (§12) — no migration in this proposal ever requires a maintenance window or backfill of existing rows |
| Real-time sync issues | Reuse `recomputeOrderAggregateStatus` as the sole aggregate-status writer (already the fix for a prior desync bug per the codebase's own history) — any new status-adjacent feature must write through this single path, never a parallel one |
| Security issues | Every new endpoint follows the existing pattern verified throughout V2: server never trusts a client-supplied price/payout/compatibility value, always recomputes/re-validates from stored config + ownership checks |

---

## 14. Who Should Pay For Delivery? — Architectural Opinion

Four models exist conceptually:

1. **Coffee Owner pays 100%** — simplest, matches many food-delivery platforms' default customer expectation, but removes suppliers' ability to compete on "free delivery" as a differentiator, and doesn't reflect that delivery is also a service *to* the supplier (it lets them sell without a physical storefront reach limit).
2. **Supplier pays 100%** — maximizes customer conversion (delivery feels "free"), but suppliers with thin margins on low-value orders could find delivery economically punishing, especially over longer distances.
3. **Split (today's model)** — a configurable percentage balances both concerns and already supports both of the above as edge cases (`cafeOwnerSharePercent = 100` or `= 0`) without any code change — this is a real, already-latent strength of the current design worth explicitly recognizing.
4. **Split + BigBoss subsidy** — adds a third funding lever for strategic goals (launch incentives, retention, competing in a new zone) without permanently changing the supplier/customer economics — this is additive on top of model 3, not a replacement for it.

**Recommendation**: BigBoss should **keep model 3 as the permanent architectural default** (it already strictly generalizes to models 1 and 2 via the existing percentage, and this is a genuine, valuable property of the current system worth preserving rather than replacing) and treat model 4 as a **temporary, campaign-scoped override** layered on top via `BigBossSubsidyEngine` (§3.11) — never a permanent second pricing model businesses have to choose between. The core engine should never need to know "which of the four models are we in today" — it should only ever see percentages and subsidy amounts, all of which already collapse correctly to any of the four models as special cases. This is the single most important reason the pricing pipeline (§5) is designed the way it is: **one engine, many configurations, never four different code paths.**

---

## 15. Dynamic Pricing — How Uber-Like Without Copying Uber

The proposed pipeline (§5) already answers the *structural* half of this question (one pipeline, stacked multiplicative/additive factors). The *behavioral* half — which factors touch which party — must be answered deliberately, not symmetrically:

| Factor | Customer price | Driver payout | Supplier contribution | BigBoss subsidy |
|---|---|---|---|---|
| Distance | ✅ direct | ✅ (baseline compensation) | ✅ (shares the base) | — |
| Vehicle | ✅ | ✅ | ✅ | — |
| Weight/volume | once §3.6→pricing-linked (not yet) | ✅ (harder job) | possibly | — |
| Time (peak hour) | ✅ | ✅ bonus | shares proportionally | possibly, to protect adoption in new zones |
| Weather | ✅ moderate multiplier | ✅ **direct bonus, not diluted by customer multiplier** | shares proportionally | possibly, in extreme conditions to keep customer price fair while still protecting driver incentive |
| Demand | ✅ capped multiplier | ✅ bonus, floor-protected | generally not increased by demand (suppliers shouldn't pay more just because *other* orders are busy) | absorbs any gap the cap creates |
| Waiting | not customer-facing unless caused by the customer (self-pickup lateness is never billable) | ✅ direct compensation | ✅ if the delay was the supplier's own preparation | — |
| Zone | ✅ | ✅ | ✅ | possibly, for underserved zones |
| Urgency | ✅ (customer explicitly requested urgency) | ✅ bonus | — | — |

**Why they must not share one multiplier**: if weather raised the customer price 30% and the driver's payout only rose 30% of a *much smaller* base, the driver would be under-compensated for genuinely more dangerous conditions — the whole point of separating these paths (§5 Steps 2 and 5 are independent) is that BigBoss can be generous to drivers in bad weather *without* needing to be equally aggressive on customer pricing, funding the difference from subsidy or margin if needed, exactly the flexibility model 4 in §14 is meant to provide.

---

## 16. Five Worked Examples (conceptual — using today's live default rates: MOTO 0.50 DT/km, min 3.00 DT; TRUCK 2.50 DT/km, min 15.00 DT; café share 50%)

### Example 1 — Small order, Moto, normal weather
Distance 3km, MOTO. `baseFee = max(3×0.50, 3.00) = 3.00 DT` (minimum floor wins). No active factors (Phase 4+ all at default). Café pays 1.50 DT, supplier pays 1.50 DT — **identical to today's actual live behavior**, verified against order #143 in this session (3.00 DT fee, 1.50/1.50 split).

### Example 2 — Large order, Camionnette (VAN)
Distance 12km, VAN required (supplier declared `requiredVehicleType='VAN'`, §3.6, already live). `baseFee = max(12×1.50, 8.00) = 18.00 DT`. Vehicle compatibility (§3.5, already live) blocks any driver without a VAN-or-larger vehicle. Split 50/50 → café 9.00 DT, supplier 9.00 DT.

### Example 3 — Heavy rain
Same as Example 1 but Admin has set `weatherCondition=HEAVY_RAIN` (§3.7, proposed) with e.g. `customerMultiplier=1.15, driverBonus=1.50 DT` (illustrative only). `adjustedFee = 3.00 × 1.15 = 3.45 DT` for the customer-side split (café 1.73, supplier 1.72), while the driver additionally receives a flat +1.50 DT bonus regardless of the multiplier — total driver payout 3.45 + 1.50 = 4.95 DT, funded partly by the higher customer/supplier contribution and partly by BigBoss subsidy/margin absorbing the gap if the split alone doesn't cover it (§3.12's budget check would flag this delivery for review if it doesn't).

### Example 4 — High demand, few drivers
Same as Example 1, but `demandRatio` (§3.8) is high → `demandMultiplier=1.35` (within the hard cap). `adjustedFee = 3.00 × 1.35 = 4.05 DT`, split 50/50 (café 2.03, supplier 2.02); driver payout is *at least* the guaranteed floor (never reduced by demand pricing) and may also receive a demand bonus, funded from the higher adjusted fee.

### Example 5 — Self Pickup
No delivery is ever created (`orders.deliveryMethod='SELF_PICKUP'` short-circuits `createDeliveryForSubOrder` before any fee logic runs, already verified live). `deliveryFee = 0` for every party, always — this is the one case where the entire pricing pipeline is simply never invoked, by design, not a zero result of running it.

---

## 17. PROPOSED BIGBOSS DELIVERY V2 — Final Recommendation

**1. What we already have**: a genuinely centralized, non-duplicated pricing engine (`computeDeliveryFee`); a correct historical-freeze mechanism; a working café/supplier split with binary supplier-funded free delivery; a fully server-validated Self Pickup flow (code generation, confirmation, single-use, audit fields) built and live-tested in this session; server-enforced vehicle-compatibility gating on driver assignment, also live-tested; supplier-declared transport requirements visible consistently to every operational role via one shared component; a pre-checkout delivery estimate that never contaminates the authoritative checkout total; and a solid, reusable realtime broadcast layer that every new feature so far has been able to plug into without inventing a new mechanism.

**2. What should remain unchanged**: the 3-line core formula's shape (distance × rate, floored by minimum, split by percentage); the two-stage estimate-then-freeze pricing lifecycle; the existing status enums for orders/sub-orders/deliveries; the existing role-based redaction pattern (`getOrders`'s per-field masking); the existing realtime event names and broadcast mechanism; every existing permission boundary.

**3. What should be improved**: `driver/wallet.tsx`'s mislabeled "earnings" once a real driver-payout split exists (Phase 3) — this is the one place where current behavior is arguably misleading rather than merely incomplete.

**4. What should be added, in order**: a factor-pipeline refactor of the pricing engine with every new factor defaulted to a no-op (Phase 1); expanded vehicle attributes and a route-provider abstraction (Phase 2); a real, configurable driver-payout split (Phase 3); weather/waiting/zone/peak-hour/safety-state mechanisms (Phase 4); demand pricing and dual subsidy engines with hard driver-payout protection (Phase 5); batching and full analytics (Phase 6).

**5. What should NOT be implemented yet**: demand pricing and any form of automated weather-API integration (both carry real business/legal risk and deserve their own focused design and Admin sign-off before code exists, not just before it activates); driver self-service offer/accept (a product-direction decision, not purely a technical one); delivery batching/consolidation (needs its own dedicated schema proposal, not a paragraph in this one); any BigBoss-funded subsidy mechanism before Admin has decided on a campaign budget/approval process.

**6. Recommended implementation order**: exactly the six phases in §11, each gated on the previous phase's regression suite passing against real historical orders (the same discipline already used to verify the V2 increment this session — order #147 backward-compatibility, live wrong-code/correct-code self-pickup test, live vehicle-compatibility accept/reject test, live multi-supplier regression check).

**7. Main architectural principles**: one pricing engine, never a duplicate; every new factor a pipeline step, not a parallel formula; every new configuration surface defaults to inert; every historical delivery's frozen fields, once set, are permanent; every new endpoint follows the existing ownership/redaction/realtime conventions rather than inventing new ones; driver payout floors are never eroded by customer-side dynamic pricing; and BigBoss's own margin/subsidy is always an explicit, visible number — including when that number is honestly zero — never an implicit assumption baked silently into someone else's share.
