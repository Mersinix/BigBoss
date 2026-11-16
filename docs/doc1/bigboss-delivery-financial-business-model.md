# BigBossCoffee Delivery — Complete Financial & Business Model
### Proposal / analysis only. No code, schema, or configuration was changed to produce this document.

This document builds directly on `delivery-v2-proposal.md` and the three implementation phases completed and tested since (Phase 1: pricing pipeline; Phase 2: route/vehicle/compatibility; Phase 3: driver payout separation + dispatch recommendation). Every "CURRENT IMPLEMENTATION" statement below was verified against the actual code (`server/storage.ts`, `shared/schema.ts`, `server/routes.ts`, `client/src/pages/admin/system-management-page.tsx`) as it exists today, not against what was planned. Every "PROPOSED BUSINESS RULE" is clearly labeled as such and is not live anywhere.

---

## 0. Executive Summary

**Who pays?** Today: the Coffee Owner and the Supplier, split by `deliveryPricingSettings.cafeOwnerSharePercent` (default 50/50), collapsing to 100% Supplier when a `FREE_SHIPPING` promotion applies. No BigBoss subsidy exists. **Proposed**: keep this exact split engine as the permanent core (it already generalizes to "customer pays all" and "supplier pays all" as edge cases), add an optional BigBoss subsidy as a third, always-explicit contributor — never blended invisibly into the split.

**Who gets paid?** Today: whoever is assigned the delivery (a Supplier's own driver, or a Delivery Company) receives `driverPayoutCents`, computed as `deliveryFee × driverPayoutSharePercent` (default 100% — reproduces pre-Phase-3 behavior exactly). In `DELIVERY_COMPANY` mode, the company's own margin is `deliveryFee − driverPayoutCents` (0 by default). BigBoss takes 0 today. **Proposed**: keep this structure; add an explicit, configurable delivery-company commission model (§12) and a driver minimum guarantee (§9) — both currently undefined business decisions, not invented here.

**Customer price**: `max(distanceKm × pricePerKmCents[vehicle] × surge, minFeeCents[vehicle])`, computed once as an estimate at delivery creation and frozen forever at driver assignment. **Proposed**: extend the existing Phase-1 factor-pipeline (already architected for this) with weather/demand/peak/zone multipliers and waiting/urgency additive fees — each capped, each defaulting to neutral, never silently invented (§6-7, §19-23).

**Driver payout**: today a flat percentage of the customer fee (§8, Option A). **Proposed**: evolve toward Base + Distance + Time, later + incentives, with a configurable minimum guarantee — but only once each component's real-world cost inputs are supplied by BigBoss (§8-11), never invented here.

**Delivery Company payout**: today `deliveryFee − driverPayoutCents`, which is 0 unless Admin sets `driverPayoutSharePercent < 100`. **Proposed**: a real, separately-configurable commission model (§12) — percentage, fixed fee, or per-km, ideally per-contract.

**Supplier contribution**: today binary via `FREE_SHIPPING` (0% or 100% supplier-funded). **Proposed**: a graduated `SupplierSubsidyEngine` (§15) with percentage/fixed/threshold rules and explicit priority ordering.

**BigBoss subsidy**: does not exist today. **Proposed**: an explicit, budget-capped `BigBossSubsidyEngine` (§16), never merged into the customer/supplier split so its cost stays auditable.

**Bad weather**: no automated effect today (the one `surgeMultiplierPermille` is a manual, label-only value — currently "Pluie Forte" in the live database with multiplier still ×1.0, i.e. decorative). **Proposed** (§19): a *named condition* driving a capped customer multiplier, a separate driver bonus, and — in extreme cases — a `DeliverySafetyEngine` restriction, never conflating price and safety.

**High demand**: not measured or priced today. **Proposed** (§20): a capped, smoothed multiplier derived from `pending requests / available drivers`, with a driver-payout floor that demand pricing can never erode.

**Waiting**: timestamps exist (`acceptedAt`/`assignedAt`/`pickedUpAt`/etc.) but no waiting-time billing exists. **Proposed** (§23): a free grace period, then driver compensation charged to whichever party caused the delay — never the platform by default, never the customer for a delay they didn't cause.

**Cancellations**: today a `CANCELLED` delivery keeps its already-frozen `deliveryFee`/`driverPayoutCents` numbers (never rewritten) but no compensation is ever paid — `payoutStatus` (Phase 3) correctly reports it as `VOID`, not `EARNED`. **Proposed** (§24): stage-dependent compensation, still requiring an explicit BigBoss decision on amounts.

**Self Pickup**: today, and proposed to remain forever, `deliveryFee = 0`, no delivery row is even created, no driver/company payout, no BigBoss economics at all (§28).

**Multi-supplier orders**: today, and proposed to remain, fully independent per sub-order — one `deliveries` row, one price, one payout per supplier, verified never to cross-contaminate (§30).

**What remains a business decision**: driver minimum guarantee, delivery-company commission rate, cancellation compensation amounts, every dynamic-pricing multiplier's actual value and cap, BigBoss subsidy budget and eligibility rules, waiting-fee rate, free-delivery/subsidy thresholds. All flagged explicitly in §41 — none invented in this document or in the code.

---

## 1. Current System — Verified From Code

| Concept | Current implementation | Location |
|---|---|---|
| Customer fee formula | `feeCents = max(0, max(round(distanceKm × pricePerKmCents × surge/1000), minFeeCents))` | `storage.ts` `runDeliveryPricingPipeline`/`computeDeliveryFee` |
| Distance | RouteEngine fallback = haversine great-circle; `driverToSupplier + supplierToCafe`; road-distance/ETA columns exist but are always equal to the fallback (`distanceSource='fallback'` always today) | `storage.getRoute`, `deliveries.roadDistanceKm/estimatedDurationMinutes/distanceSource` |
| Vehicle types | `BICYCLE, MOTO, CAR, VAN, TRUCK, OTHER` (labels Vélo/Moto/Voiture/Camionnette/Camion/Autre) — single source of truth (`VEHICLE_TYPE_LABELS`) | `use-delivery-ecosystem.ts`, `shared/schema.ts` |
| Vehicle rates | Per-type `pricePerKmCents`/`minFeeCents`, Admin-configurable, seeded (BICYCLE 0.30/1.50, MOTO 0.50/3.00, CAR 1.00/5.00, VAN 1.50/8.00, TRUCK 2.50/15.00, OTHER 0.50/3.00 DT) | `deliveryPricingSettings.vehiclePricing` |
| Vehicle capacity | Optional `maxWeightKg`/`maxVolumeL`/`maxPackages` per type, **unset by default on every type** — no invented limits | same table (Phase 2) |
| Vehicle compatibility | Ordinal rank check (`BICYCLE<MOTO<CAR<VAN<TRUCK`, `OTHER`=wildcard) + optional capacity check, both neutral when unset | `storage.checkDeliveryVehicleCompatibility` |
| Transport requirements | `requiredVehicleType, totalWeightKg, totalVolumeL, numberOfPackages, numberOfItems, isFragile, specialHandling` — 100% supplier-editable, never auto-derived (an advisory-only suggestion function exists but never writes) | `subOrders.*`, `storage.determineRequiredVehicleType`/`suggestRequiredVehicleType` |
| Coffee Owner / Supplier split | `cafeOwnerFeeShareCents = round(fee × cafeOwnerSharePercent/100)`, `supplierFeeShareCents = fee − that`; collapses to 0/100% under an active `FREE_SHIPPING` promotion | `computeDeliveryFee`, `deliveryPricingSettings.cafeOwnerSharePercent` (default 50) |
| Driver/company payout | `driverPayoutCents = round(fee × driverPayoutSharePercent/100)` (default 100%); `companyPayoutCents = fee − driverPayoutCents` in `DELIVERY_COMPANY` mode, always 0 in `SUPPLIER` mode | `storage.computeDeliveryPayout`, `deliveryPricingSettings.driverPayoutSharePercent` |
| BigBoss margin | Always literally 0 — no platform cut of any kind exists today | derived, nowhere persisted as non-zero |
| Snapshot/freeze | Every pricing + payout field frozen once at `feeFinalizedAt` (set at driver assignment); never rewritten by a later Admin config change or by `updateDeliveryStatus` | `deliveries.feeFinalizedAt` guard |
| Dispatch | Supplier chooses `SUPPLIER` (self-operate, own drivers) or `DELIVERY_COMPANY` (publishes to a shared `AVAILABLE` pool, first company to `acceptDelivery` gets it, or a specific company can be targeted) | `storage.dispatchDelivery`/`acceptDelivery` |
| Driver assignment | Unilateral — supplier/company picks a specific driver; **no driver-level accept/decline exists** | `storage.assignDriver`/`reassignDriver` |
| Dispatch recommendation | Phase 3 read-only roster + compatibility + payout-preview endpoint, sits in front of assignment, never replaces it | `storage.getAssignableDriversForDelivery` |
| Delivery status | `PENDING→AVAILABLE→ACCEPTED→ASSIGNED→PICKED_UP→IN_TRANSIT→DELIVERED`, or `→CANCELLED` from most states | `deliveryStatusEnum` |
| Self Pickup | `orders.deliveryMethod='SELF_PICKUP'` short-circuits delivery creation entirely — zero delivery rows, zero fee, zero payout, a separate `selfPickupCode` confirmation flow | `storage.createDeliveryForSubOrder` guard, `subOrders.selfPickupCode*` |
| Admin config surface | System Management → "Tarification des livraisons": per-vehicle price/km + min fee + optional capacity, default vehicle, café share %, driver payout share %, surge multiplier + label | `system-management-page.tsx` `DeliveryPricingSection` |
| Financial visibility | Server-side role redaction (`redactDeliveryCodes`): Driver sees own payout only; Supplier sees payout only for its own `SUPPLIER`-mode deliveries; Delivery Company sees both driver+company payout for its own; Coffee Owner sees neither; Admin sees everything | `storage.redactDeliveryCodes` |
| Realtime | `delivery_pricing_updated`, `delivery_created`, `delivery_assigned`, `delivery_status_changed`, `suborder_status_changed` — no second realtime system anywhere | `use-realtime.ts`, `server/routes.ts` broadcasts |
| Weather/Demand/Peak/Zone/Waiting/Urgency | Pipeline **slots exist** (Phase 1) but every one is a hard-coded no-op (`permille=1000`, `cents=0`) on every computation — nothing dynamic is live | `runDeliveryPricingPipeline` |
| Subsidy | Supplier-side only, binary (`FREE_SHIPPING`); no BigBoss-funded subsidy concept exists anywhere | `promotions` table, `hasApplicableFreeDeliveryPromotion` |
| Batching, Safety states, Analytics engine | Do not exist | — |

---

## 2. Business Objective

BigBoss is not Uber Eats: it is a **B2B marketplace** where the "customer" (Coffee Owner) and the "merchant" (Supplier) are both businesses with recurring relationships, and delivery is frequently performed by the Supplier's *own* staff, not a gig-economy fleet. Any Uber-style dynamic-pricing sophistication must be grafted onto this reality, not copied from a B2C playbook: a Supplier running its own Moto driver has fixed labor costs regardless of demand, while a Delivery Company partner behaves much more like a classic gig marketplace. The financial model therefore needs **two coherent sub-models that share one pricing/payout engine** (already true architecturally — `deliveryMode` is the single switch), rather than two separate systems.

---

## 3. Who Pays, Who Earns — Per Scenario

### Scenario A — Coffee Owner → Supplier → Supplier Driver → Coffee Owner
**Current**: `deliveries.deliveryMode='SUPPLIER'`. Customer fee split per `cafeOwnerSharePercent`. `companyPayoutCents` always 0 (no company in this relationship — verified in Phase 3 testing). `driverPayoutCents` goes to the Supplier's own driver — but the driver is the Supplier's own employee/contractor, so this "payout" is really an **internal transfer within the Supplier's own business**, not a BigBoss-mediated payment. BigBoss's real economic role here is limited to hosting the *pricing* (deciding what the Coffee Owner and Supplier each contribute) — it never touches driver compensation operationally.
**Money flow**: Coffee Owner pays BigBoss (via the order) → BigBoss credits/invoices the Supplier the `cafeOwnerFeeShareCents` portion (exact settlement mechanism is outside this document's scope — no wallet/ledger system was found in the codebase) → the Supplier compensates its own driver however it already does off-platform.

### Scenario B — Coffee Owner → Supplier → Delivery Company → Delivery Company Driver → Coffee Owner
**Current**: `deliveryMode='DELIVERY_COMPANY'`. Same customer-side split. `driverPayoutCents` + `companyPayoutCents` sum to the fee. Here BigBoss's role is closer to Uber's: it is genuinely brokering payment to a third-party economic actor (the Delivery Company), which in turn compensates its own driver — BigBoss currently has **no visibility or control** over that inner split (a company's `driverPayoutSharePercent` today is the *same global* Admin setting used for Supplier mode, not a company-specific contract rate — flagged as a business decision in §41).

### Scenario C — Coffee Owner → Supplier → Self Pickup
**Current and proposed, unchanged**: `deliveryFee=0`, no delivery row, no payout of any kind. BigBoss's economic involvement is zero (§28).

### Scenario D — Multi-supplier order (A + B in parallel)
**Current**: each supplier's sub-order gets its own `deliveries` row, computed and dispatched completely independently (verified live across three implementation phases — different vehicle, different distance, different fee, different payout per sub-order, same order). A single order can therefore simultaneously be Scenario A for one supplier and Scenario B for another.

---

## 4. Commercial Models — Objective Comparison

| | Model 1: Owner 100% | Model 2: Supplier 100% | Model 3: Split (current) | Model 4: Split + BigBoss subsidy | Model 5: Delivery absorbed into product price | Model 6: Dynamic hybrid |
|---|---|---|---|---|---|---|
| **Advantages** | Simple, transparent, matches a classic marketplace expectation | Maximizes conversion ("free delivery" is a strong lever); supplier controls its own competitiveness | Balances both incentives; already generalizes 1 & 2 as edge cases (`cafeOwnerSharePercent`=100 or 0) | Enables strategic growth (new zones, new suppliers) without permanently changing unit economics | No separate delivery line item to reconcile; simplest checkout UX | Optimizes for margin/conversion per situation |
| **Disadvantages** | Suppliers can't differentiate on "free delivery"; large-distance orders may deter Coffee Owners | Punishes low-margin suppliers on long-distance/low-value orders; could be gamed by inflating product price instead | Requires an Admin decision (the % itself) that may not fit every supplier's margin structure | Needs a real budget/approval process BigBoss doesn't have yet; risk of open-ended cost | Hides the true delivery cost from both parties, breaking cost transparency and making the pricing engine below it useless | Highest complexity; risk of unpredictable pricing without strong caps |
| **Economic consequence** | Predictable Supplier revenue, variable Coffee Owner cost | Predictable Coffee Owner cost, variable Supplier margin | Shared, moderate variance both sides | BigBoss carries a real, capped cost | Delivery cost is cross-subsidized by product margin — invisible, hard to control | Best fit *if* caps are respected; worst if not |
| **Operational consequence** | None beyond today | None beyond today | None beyond today (already built) | Needs a campaign/budget entity (§16) | Requires re-pricing every product to absorb an average delivery cost, which breaks per-delivery accuracy | Needs the full factor pipeline (already architected) |
| **Customer experience** | Sees full delivery cost, no surprises | Perceives delivery as "free" | Sees a partial, usually smaller charge | Same as Model 3, occasionally even better (promo-funded) | Sees no delivery charge at all, but pays it inside product price without realizing | Variable, potentially confusing without clear UI communication |
| **Supplier experience** | No delivery cost exposure | Bears full delivery cost — a real margin hit on distant/low-value orders | Predictable partial cost | Predictable partial cost, occasionally subsidized | Must constantly re-estimate delivery cost into pricing, brittle at scale | Needs visibility into which factors triggered which charge |
| **BigBoss economics** | Neutral (no margin either way — BigBoss doesn't collect anything extra in any model today) | Neutral | Neutral | Deliberately negative in the subsidized case, by design and capped | Neutral, but BigBoss loses pricing-engine leverage entirely | Neutral to positive once/if BigBoss ever takes a platform cut |
| **Driver economics** | Unaffected by which model funds the fee — driver payout is a separate computation (Phase 3) in every model | Unaffected | Unaffected | Unaffected | Unaffected, but a shrunk/absorbed "fee" number could shrink payout if payout is still expressed as % of fee — a real risk worth flagging | Unaffected if payout stays decoupled per Phase 3's design |

**No model is objectively "best"** — the codebase's own existing choice (Model 3, generalizing to 1/2 via the percentage) is the only one that requires zero new infrastructure and already supports every one of Models 1, 2, and 3 as configuration, not code. Model 4 is a legitimate additive layer. Model 5 is explicitly **not recommended** because it destroys the traceability that the entire Phase 1-3 architecture was built to provide (a delivery's economics must remain visible and auditable — see §31). Model 6 is where the system is already headed (the factor pipeline), provided the caps in §7 are respected.

---

## 5. Proposed BigBoss Default Model

| Question | Proposed answer |
|---|---|
| **Who pays?** | Coffee Owner + Supplier by default (Model 3, current), with an optional third BigBoss contribution (Model 4) reserved for explicit campaigns |
| **How much?** | `cafeOwnerSharePercent` (Admin-global default, extensible to per-supplier override — §14) of the *funded* fee, after supplier/BigBoss subsidies are subtracted |
| **When?** | At order placement (estimate, non-binding) and finalized at driver assignment (authoritative, frozen) — unchanged from today |
| **Why?** | Because delivery genuinely benefits both parties (the Coffee Owner gets convenience; the Supplier gets market reach beyond its own delivery radius) — a pure single-payer model doesn't reflect that shared benefit |
| **Who receives it?** | The assigned driver/operator (`driverPayoutCents`) and, in `DELIVERY_COMPANY` mode, the company (`companyPayoutCents`) |
| **What happens when delivery becomes expensive** (long distance, bad weather, high demand)? | The *customer-facing* price should rise only within a hard cap (§7); anything the funded amount doesn't cover should be flagged by a `DeliveryBudgetEngine` (§17) for Admin review, not silently absorbed by underpaying the driver |
| **What happens when delivery is free?** | Supplier-funded (`FREE_SHIPPING`, today) or BigBoss-funded (a campaign, proposed) — the driver's payout must **never** be reduced by a free-delivery promotion, exactly as today's `freeDeliveryApplied` logic already guarantees (`deliveryFee` itself is untouched; only who *pays* it changes) |
| **Who absorbs exceptional costs?** | Whichever party's action caused them (supplier delay → supplier; platform-side demand spike the customer didn't cause → BigBoss subsidy or absorbed margin, never silently the driver) |

This is practical for a Tunisian B2B coffee marketplace specifically because: (a) Suppliers already have real, ongoing commercial relationships with their Coffee Owner customers and can reasonably be expected to shoulder part of delivery as a customer-retention cost, matching common regional B2B practice; (b) transaction values are typically wholesale-sized (multiple products, recurring orders), making a percentage-based contribution more stable than a flat fee; (c) BigBoss subsidy should stay reserved for strategic growth, not a permanent cost center, given no evidence in the codebase of an existing subsidy budget or funding mechanism.

---

## 6. Customer Delivery Price — Complete Formula

Building directly on the already-implemented Phase 1 pipeline (`runDeliveryPricingPipeline`):

```
Step 1 — Base Delivery Cost         = distanceKm × pricePerKmCents[vehicle]
Step 2 — Existing Surge Multiplier  = Base × (surgeMultiplierPermille / 1000)     [ALREADY LIVE]
Step 3 — Minimum Fee floor          = max(Step 2, minFeeCents[vehicle])          [ALREADY LIVE]

Step 4 — Adjusted Cost              = Step 3
                                       × min(weatherMultiplier, CAP_WEATHER)
                                       × min(demandMultiplier,  CAP_DEMAND)
                                       × min(peakMultiplier,    CAP_PEAK)
                                       × min(zoneMultiplier,    CAP_ZONE)
                                     + waitingFeeCents
                                     + urgencySurchargeCents

Step 5 — Combined Cap               = min(Step 4, Step 3 × CAP_COMBINED)
Step 6 — Final Customer Fee         = max(Step 5, minFeeCents[vehicle])
```

**Should multipliers stack (multiplicative) or add?** Recommendation: **multiplicative for continuous/probabilistic factors** (weather, demand, peak, zone — each represents "this delivery costs proportionally more to serve"), **additive for discrete/event-based factors** (waiting, urgency — each represents "this specific extra thing happened," not a proportional cost increase). This mirrors how the existing formula already treats surge (multiplicative, proportional) differently from how a future waiting fee naturally behaves (a flat number of minutes × a rate, unrelated to the base distance cost).

**Should some factors affect driver payout but not customer price?** Yes — see §19's weather-bonus design: paying a driver more for genuinely harder/riskier conditions is not the same decision as charging the customer more, and the two must remain independently configurable (§8, §15 of the Phase 3 report already established this separation as a core principle).

**Should some factors affect only the platform?** Potentially — e.g., BigBoss could absorb a demand spike's cost internally (as a subsidy) rather than pass it to the customer, if retaining price predictability is a strategic priority for a given supplier/zone. This is exactly what the `BigBossSubsidyEngine` (§16) is for.

---

## 7. Preventing Price Explosion

A stacked multiplicative pipeline can compound badly: 4 factors at even a modest ×1.3 each already reach ×2.86. This must be architecturally prevented, not merely discouraged.

**Proposed safeguards** (all Admin-configurable, all defaulting to neutral/inert today, matching the exact discipline already used for every Phase 1-3 default):

| Safeguard | Purpose | Why this shape |
|---|---|---|
| Per-factor cap (`CAP_WEATHER`, `CAP_DEMAND`, `CAP_PEAK`, `CAP_ZONE`) | No single factor can run away on its own | Isolates a misconfiguration in one factor from breaking the whole system |
| Combined multiplier cap (`CAP_COMBINED`) | The *product* of all active multipliers together can never exceed this, regardless of how many are active | Prevents the compounding problem even when every individual factor is within its own cap |
| Absolute maximum price (per vehicle type or globally) | A hard ceiling in DT/cents, independent of the multiplier math | A final, unambiguous backstop a support agent or Admin can reason about without doing arithmetic |
| Absolute minimum price (`minFeeCents`, already exists) | Guarantees the fee never goes to 0 or negative except via an explicit subsidy/free-delivery rule | Already implemented — extend the same floor logic to post-multiplier stages |
| Demand-multiplier hysteresis/smoothing (§20) | Prevents the fee from flickering as driver availability crosses a threshold repeatedly within minutes | Protects trust — a customer or supplier re-checking a price shouldn't see it swing wildly |

No specific numeric values (e.g. "max ×1.5") are proposed here — see §41, "Maximum dynamic multiplier" is explicitly flagged as a **BUSINESS DECISION REQUIRED**.

---

## 8. Driver Payout Model — Options

| Option | Formula | Economic behavior |
|---|---|---|
| **A — % of customer fee (current)** | `driverPayoutCents = fee × pct` | Simple, but ties driver earnings to *customer-side* pricing decisions (e.g. a free-delivery promo funded 100% by the supplier still nets the driver the same amount, which is correct — but a customer-side discount campaign, if one existed, would need care not to also shrink payout) |
| **B — Distance-based** | `payout = distanceKm × ratePerKm[vehicle]` | Directly rewards effort/distance; decoupled entirely from customer pricing — cleanest separation, but ignores time spent (traffic, stairs, waiting) |
| **C — Base + distance** | `payout = baseFee[vehicle] + distanceKm × ratePerKm[vehicle]` | Guarantees a floor for very short deliveries (where B alone would pay almost nothing) while still rewarding distance |
| **D — Base + distance + time** | `payout = base + distanceKm × ratePerKm + minutes × ratePerMinute` | Best reflects real driver cost (a slow, congested 3 km trip costs more of a driver's time than a fast one) — but requires reliable duration data, which today's fallback RouteEngine does not provide (`estimatedDurationMinutes` is always null) |
| **E — Base + distance + time + incentives** | D + bonuses (§25) | Most Uber-like; requires the most infrastructure (incentive engine, tracking) and the most business-rule definition |
| **F — Guaranteed minimum + dynamic components** | `max(any of A-E, minimumGuaranteeCents)` | Protects driver income floor regardless of which dynamic model is active — should be layered on top of whichever of A-E is chosen, not a standalone alternative |

**Proposed structure**: adopt **Option C now** (Base + Distance) as the next evolution beyond A — it requires no new data BigBoss doesn't already have (distance is already computed), and it's a strict generalization of A that can still reproduce A's exact current numbers if `base=0` and `ratePerKm` is derived to match. **Option D** should follow once RouteEngine gains a real duration source (§12/§13 of the Phase 2 report already flagged this as future work). **Option F** (the guarantee) should wrap whichever formula is active from day one — see §9.

None of Options B-F are implemented today; A is the sole live mechanism.

---

## 9. Driver Minimum Guarantee

**When does it apply?** Recommended: **per delivery**, not per hour or per mission — matches the codebase's existing per-delivery freeze model (`feeFinalizedAt`) and requires no new time-tracking infrastructure. A per-hour guarantee would require tracking driver online/active time, which does not exist anywhere in the schema today (no shift/session concept).

**Formula**:
```
driverPayoutCents = max(
    computedPayout(Option A-E, whichever is active),
    minimumGuaranteeCents[vehicleType]
)
```

**Does vehicle type affect it?** Yes — a Camion driver's minimum viable trip compensation is not the same as a Vélo's; the guarantee should be a per-vehicle-type table, matching the existing `vehiclePricing` structure exactly (same jsonb shape, same Admin UI pattern already built in Phase 2 for capacity).

**Does difficult weather affect it?** Recommended: the guarantee itself should NOT change with weather — instead, a weather *bonus* (§19) stacks on top of whichever payout (computed or guaranteed) results, keeping the two concerns independent and auditable separately.

**Does long waiting affect it?** No — waiting compensation (§23) is a separate additive line, not a modifier to the guarantee.

**Is `max(computed, guarantee)` the right model?** Yes, with one caveat: it must be evaluated **before** any subsidy/budget accounting (§17), so the guarantee is a property of what the driver is owed, never a number that gets renegotiated downward if the funding doesn't cover it (any shortfall becomes a `DeliveryBudgetEngine` deficit flag for Admin, not a reduced driver payment). The actual `minimumGuaranteeCents` values are a **BUSINESS DECISION REQUIRED** (§41) — the mechanism is proposed, the numbers are not invented here.

---

## 10. Vehicle Economics

| Vehicle | Relative operating cost | Capacity | Speed | Urban maneuverability | Typical use |
|---|---|---|---|---|---|
| Vélo (BICYCLE) | Lowest (no fuel) | Lowest | Slowest | Highest (no parking issue) | Very short, very light, dense urban |
| Moto (MOTO) | Low (fuel, minor maintenance) | Low-medium | Fast in traffic | High | The default/most common case today |
| Voiture (CAR) | Medium | Medium | Medium | Medium | Medium orders, medium distance |
| Camionnette (VAN) | Higher | High | Medium-slow | Lower (parking, size) | Bulk/large orders |
| Camion (TRUCK) | Highest | Highest | Slowest | Lowest | Very large/bulk orders |
| Autre (OTHER) | Unclassified (wildcard) | Unclassified | — | — | Catch-all, never blocks compatibility |

**How pricing/payout should treat each**: the existing per-vehicle `pricePerKmCents`/`minFeeCents` split already lets Admin reflect these real cost differences (verified: live seed data already prices TRUCK at 5× BICYCLE's per-km rate). The same per-vehicle-table pattern should extend to: driver minimum guarantee (§9), and eventually a full cost model (§11) — no new architecture required, only new optional keys on the same `vehiclePricing` jsonb structure, exactly how capacity was added in Phase 2. **No fuel prices or specific cost figures are proposed here** — Admin configuration is the correct home for anything that fluctuates with real-world fuel/maintenance markets.

---

## 11. Driver Cost Model (Future)

| Variable | Relevance to BigBoss | Why |
|---|---|---|
| `costPerKm` | High | Directly comparable to `pricePerKmCents` — enables a real margin calculation per delivery |
| `costPerMinute` | Medium-high, once duration data exists | Congestion/waiting materially affects a driver's real earning rate |
| `vehicleFixedCost` (amortized) | Low priority for BigBoss directly | This is the driver's/operator's own capital cost, not something BigBoss transacts — relevant only for BigBoss's *own* understanding of whether its rates are fair, not for per-delivery billing |
| `maintenanceCost` | Low priority, same reasoning | Same — informs rate-setting policy, not per-delivery math |
| `fuelCost` | Medium | Useful as an input to periodically recalibrate `pricePerKmCents`/payout rates, not a per-delivery variable (fuel price doesn't change per trip) |
| `insuranceCost` | Low, informational | Same as vehicleFixedCost |

**Target formula**:
```
Delivery Margin = Delivery Revenue (customer fee + supplier contribution + BigBoss subsidy)
                 − Driver Cost (driverPayoutCents)
                 − Company Cost (companyPayoutCents)
                 − Other Operational Cost (currently none modeled)
```
This is exactly what §17-18 (`DeliveryBudgetEngine`/margin) formalize. `costPerKm`/`costPerMinute` matter for **rate-setting policy** (helping Admin decide what `pricePerKmCents`/payout rates should be); they should NOT become new per-delivery database fields, since BigBoss doesn't pay these costs directly — the driver/operator does. Adding them as delivery-level snapshot fields would be exactly the kind of "speculative financial field" the Phase 1-3 reports were explicitly instructed to avoid.

---

## 12. Delivery Company Model

| Compensation model | Description | Trade-off |
|---|---|---|
| Fixed fee per delivery | Company gets a flat DT amount regardless of distance | Simple, predictable for the company; poor fit for BigBoss (short and long deliveries cost the company differently) |
| Percentage of customer fee (current default mechanism, via `driverPayoutSharePercent`'s complement) | Company margin scales with delivery price | Simple, already built; doesn't reflect the company's actual operating cost structure |
| Per-km | Company earns proportional to distance | Fairer for the company on long trips; requires a separate per-km company rate, not yet modeled |
| Base + km | Combines a floor with distance-proportional revenue | Same shape as driver Option C — natural to mirror |
| Negotiated contract rate | Each Delivery Company has its own commercial terms with BigBoss | Most realistic for a real partnership model; requires a `deliveryCompanyContracts`-style entity (not yet built) — the single biggest genuine gap identified between today's system and a real B2B logistics partnership |
| Dynamic rate | Company's cut varies with demand/coverage/performance | Most sophisticated, most premature — should follow a stable negotiated-rate model, not precede it |

**Recommendation**: today's `driverPayoutSharePercent` complement (`fee − driverPayout = companyPayout`) is a reasonable **default**, but the more strategically important gap is that it is currently **one global setting shared by every company** — there is no per-company contract concept. A real logistics partnership model needs company-specific rates. This is flagged as a business decision (§41), and the natural extension point is a `deliveryCompanyId`-keyed override table, structurally similar to `vehiclePricing`.

Customer price / company payout / driver payout / BigBoss margin must remain four separately visible numbers (already true today per the Phase 3 redaction design) — never collapsed into "the company gets whatever's left," which is today's *default* but should become a *configurable contract term*, not a hard rule.

---

## 13. Supplier Delivery Model (Own Driver)

- **Who pays the driver?** Operationally, the Supplier — BigBoss's platform economics stop at deciding the customer/supplier fee split; how the Supplier compensates its own employee/contractor driver is outside BigBoss's transaction scope (matches the current architecture: `companyPayoutCents` is explicitly 0 in this mode because there is no third-party company to pay).
- **How should BigBoss handle the delivery economics?** As a pass-through: BigBoss's only real "cost" here is the `cafeOwnerFeeShareCents` it collects from the Coffee Owner on the Supplier's behalf and must reconcile/pay out to the Supplier (a settlement mechanism outside this document's scope — no ledger/payout-disbursement system exists in the codebase today).
- **Should the Supplier receive a delivery reimbursement?** Only if BigBoss's settlement already nets the Coffee Owner's contribution to the Supplier — which appears to be the implicit model today (the Supplier absorbs `supplierFeeShareCents` as a cost and receives `cafeOwnerFeeShareCents` as reimbursed revenue via the order's own settlement, whatever that mechanism is).
- **Should the Supplier absorb some delivery cost?** Yes, by design (`supplierFeeShareCents`), and this is exactly what makes Model 3 (§4) meaningful rather than purely notional.
- **How should BigBoss account for the delivery?** As a zero-margin pass-through in this mode by default — BigBoss's `driverPayoutCents` here is informational (Admin visibility into what the Supplier's driver notionally earned per the platform's own formula), not a real BigBoss-to-driver payment.

**Keep separate**: BigBoss marketplace economics (fee split, subsidy accounting) vs. Supplier economics (what it costs the Supplier to run its own fleet, which the Supplier already manages independently) vs. Driver economics (the driver's actual take-home, which in this mode is an internal Supplier HR/payroll matter, not a BigBoss transaction) — the current architecture already respects this separation; it should not be blurred by trying to have BigBoss "pay" a Supplier's own employee directly.

---

## 14. Coffee Owner + Supplier Split — Beyond Fixed 50/50

**Is the current global percentage sufficient?** As a *default*, yes — it is simple, predictable, and already generalizes correctly. As the *only* mechanism, no — it cannot express supplier-specific commercial relationships (a large, high-volume supplier might negotiate a better split than a small one).

**Proposed flexible contribution engine** (design only, not implemented):
```
fundedFee = customerFee − supplierSubsidy − bigBossSubsidy     (§15-16)
cafeOwnerContribution = fundedFee × effectiveCafeOwnerSharePercent
supplierContribution  = fundedFee − cafeOwnerContribution

effectiveCafeOwnerSharePercent = supplierOverride ?? globalDefault (cafeOwnerSharePercent)
```
Where `supplierOverride` is an optional, per-supplier percentage — a natural extension of the exact same field, keyed additionally by `supplierId`, mirroring how `vehiclePricing` is already keyed by vehicle type. Inputs that should be able to influence `effectiveCafeOwnerSharePercent` or trigger a different rule entirely:
- **Order-value thresholds** — e.g. large orders could shift more cost to the Supplier (who benefits more from a big sale) or less (protecting margin) — direction is a business decision, not a technical one.
- **Free-delivery promotions** — already implemented (collapses to 0% Coffee Owner).
- **Minimum order value** — could gate whether delivery is offered at all, or whether a reduced fee applies.
- **Distance thresholds** — very long deliveries might warrant a different split than the default (e.g. Supplier absorbs less of a delivery it can't realistically serve cheaply).
- **Customer commercial agreements** — a specific Coffee Owner (a large chain, say) might have a negotiated rate; this would need a `cafeId`-keyed override, symmetric to the proposed `supplierId`-keyed one.

---

## 15. Supplier Subsidy Engine (Design)

```
SupplierSubsidyEngine.evaluate(supplierId, cafeId, subtotalCents, distanceKm) → {
  subsidyType: 'NONE' | 'FULL' | 'PERCENT' | 'FIXED' | 'THRESHOLD',
  subsidyAmountCents
}
```

Supported rule types (extending today's binary `FREE_SHIPPING`):
- **Supplier pays all** — today's `FREE_SHIPPING` (100%).
- **Supplier pays percentage** — `subsidyAmountCents = fee × supplierSubsidyPercent`.
- **Supplier pays fixed amount** — `subsidyAmountCents = min(fixedCents, fee)` (never subsidize more than the fee itself).
- **Supplier offers free delivery** — same as "pays all," with `freeShippingMinAmount` gating exactly as today.
- **Supplier pays above threshold** — subsidy only applies when `subtotalCents ≥ threshold` (already the exact shape of `freeShippingMinAmount`, generalized to partial amounts too).
- **Supplier-specific promotion** — reuses the existing `promotions` table's targeting (`eligibleCafeIds`, date range) already built for `FREE_SHIPPING`.

**Priority rule when multiple could apply**: recommend **most generous to the Coffee Owner wins** (i.e., the rule that results in the *lowest* Coffee Owner contribution is applied) — this matches typical promotional-stacking conventions (a customer should never be charged more because two discounts happened to both qualify) and requires no new precedence table, just a `min()` over each active rule's resulting Coffee Owner contribution.

---

## 16. BigBoss Subsidy Engine (Design)

```
BigBossSubsidyEngine.evaluate(campaign context) → { subsidyAmountCents, campaignId }
```

Use cases: customer acquisition (first-delivery-free), promotions, strategic-supplier support, minimum-order campaigns, first orders, loyalty, geographic expansion.

**Critical design requirement (explicit in the task and consistent with the whole Phase 1-3 discipline): the subsidy must never disappear inside the delivery price.** Concretely:
- It must be its own line item, computed and stored (or at minimum logged) separately from `supplierFeeShareCents`/`cafeOwnerFeeShareCents` — never blended by, say, quietly lowering `cafeOwnerSharePercent` for a campaign period, which would make the true subsidy cost invisible to Admin reporting.
- It must be **budget-capped** — a campaign entity with `budgetCapCents`/`spentCents`, so an open-ended subsidy can never silently run away (this is the single most important guardrail for this engine).
- It must be kept structurally separate from `SupplierSubsidyEngine` (§15) — a different funding source, a different table, a different accounting line — exactly as the original `delivery-v2-proposal.md` already specified.

---

## 17. Delivery Budget Engine (Design)

```
availableFunding = cafeOwnerContribution + supplierContribution + bigBossSubsidy
requiredPayout   = driverPayoutCents + companyPayoutCents + otherOperationalCost(currently 0)

surplus/deficit  = availableFunding − requiredPayout
```

- **Surplus**: funding exceeds what's owed — BigBoss keeps the difference as margin (§18) or could choose to lower future prices.
- **Break-even**: funding exactly covers payout — BigBoss margin is 0 on this delivery, same as today's universal default.
- **Deficit**: funding doesn't cover payout — this must **never** be resolved by silently underpaying the driver (violates §9's guarantee principle) or silently overcharging the customer after the fact (violates trust). The correct resolution is either (a) BigBoss absorbs the deficit as a negative-margin delivery (§18), explicitly and visibly, or (b) the delivery is flagged for Admin review before dispatch, so pricing can be corrected going forward (e.g. a minimum fee that's too low for a given vehicle/zone combination).

This engine should run in **advisory mode only** at first — logging/flagging deficits, never blocking a delivery — until its signal is proven reliable, exactly the caution already recommended in `delivery-v2-proposal.md` §3.12.

---

## 18. BigBoss Margin

```
grossDeliveryRevenue = cafeOwnerContribution + supplierContribution + bigBossSubsidy
deliveryCosts         = driverPayoutCents + companyPayoutCents
netDeliveryMargin      = grossDeliveryRevenue − deliveryCosts − bigBossSubsidy
                        = cafeOwnerContribution + supplierContribution − deliveryCosts
```
(the subsidy is added to revenue and then subtracted again because it's a BigBoss-funded cost, not real incoming revenue — this keeps the formula honest about what BigBoss actually collects from *others* vs. what it spends itself)

BigBoss should **not** be assumed to always profit on delivery — today, margin is uniformly 0 (verified: `driverPayoutSharePercent` defaults to 100%, meaning the entire customer/supplier-funded fee flows straight through). A **negative** margin is a legitimate, intentional outcome of a BigBoss subsidy campaign and must be clearly identifiable (never mixed into "unexplained losses") — this is precisely why §16 insists the subsidy stays a separate, auditable line.

---

## 19. Weather Pricing Engine (Design)

| Condition | Customer multiplier | Driver bonus | Safety implication |
|---|---|---|---|
| NORMAL | ×1.0 | none | NORMAL |
| RAIN | small, capped | small flat bonus | none/WARNING |
| HEAVY_RAIN | moderate, capped | moderate flat bonus | WARNING, possibly RESTRICTED for BICYCLE |
| STORM | higher, capped | higher flat bonus | RESTRICTED (e.g. no BICYCLE/MOTO) |
| EXTREME | at cap | at bonus cap | SUSPENDED for the affected zone |

**Should bad weather increase customer price, driver payout, both, or stop delivery?** **Both, independently, plus a safety gate** — not a single shared multiplier. Reasoning: the customer-side increase reflects genuinely higher operating difficulty/cost passed through moderately (capped, since the Coffee Owner didn't cause the weather); the driver bonus must be a **separate, direct** compensation for real personal risk/difficulty, not diluted by whatever the customer-side cap happens to allow (already established as a core principle in `delivery-v2-proposal.md` §15); and past a severity threshold, safety must override pricing entirely — a `DeliverySafetyEngine` state (`SUSPENDED`) should be capable of blocking new deliveries in a zone regardless of any multiplier, since no price is worth a preventable accident.

**Who pays the additional customer-side cost?** Follows the normal split (§14) unless BigBoss chooses to subsidize it (e.g., to keep prices stable for a strategic supplier during a storm) — a legitimate §16 use case.

**Do not rely on arbitrary weather-data assumptions**: this document deliberately does **not** propose integrating a live weather API — the existing `surgeLabel` free-text field already shows the codebase's current, honest approach (Admin manually declares the condition). Automating detection is a separate infrastructure decision (external API cost/reliability) outside this financial model's scope.

---

## 20. Demand Pricing Engine (Design)

**Signals** (all derivable from existing tables, no new tracking required): `count(deliveries WHERE status IN ('PENDING','AVAILABLE'))` (pending requests), `count(drivers currently able to accept)` (needs an availability concept that doesn't fully exist yet — today there's no "online/offline" driver state, only ownership), `time-to-assignment` (derivable from `createdAt` → `assignedAt`).

**Detecting demand levels**: a simple ratio `pendingRequests / availableDrivers`, bucketed (e.g. low/normal/high/critical) rather than a continuous function — bucketing is itself a smoothing mechanism (a ratio of 2.05 vs 2.15 shouldn't produce a different price).

**Avoiding instability**:
- **Minimum duration**: once a demand level is entered, it must persist for a minimum time window before it can change again (prevents flapping as individual deliveries complete/arrive).
- **Maximum multiplier**: capped per §7.
- **Hysteresis**: use different thresholds to *enter* a level than to *leave* it (e.g. enter "high" at ratio 2.0, but only leave "high" back to "normal" at ratio 1.5) — a classic anti-flicker technique, appropriate here since demand naturally oscillates minute to minute.

**Guardrail (non-negotiable, per the original proposal and repeated here)**: demand pricing must have a hard maximum multiplier and must never be the mechanism that reduces a driver's payout below their guaranteed minimum (§9) — it should only ever increase customer price and/or fund a driver bonus.

---

## 21. Peak Hour Engine (Design)

```
peakHourWindows: [{ label, daysOfWeek, startTime, endTime, multiplier, driverIncentive }]
```
Fully Admin-configurable, no hard-coded Tunisian business hours — the existing single flat `surgeMultiplierPermille` already demonstrates the codebase's preference for configuration over hard-coding, and this should be a direct extension (a list of named windows, evaluated against server time, feeding the same pipeline slot the flat surge occupies today; when no window matches, the flat surge remains the fallback — fully backward compatible).

---

## 22. Zone Pricing Engine (Design)

```
zones: [{ name, governorateMatch (or polygon later), rateMultiplier, minFeeOverride, isRestricted }]
```

**Interaction with other factors**: zone multiplier applies to the *already distance-priced* base (multiplicative, per §6's classification), so it never double-charges distance — it represents a location-specific cost adjustment (e.g., a remote zone with poor road access costs more to serve *per km*, not extra km). `minFeeOverride` lets a zone raise (not lower, to avoid an exploit) the effective minimum fee. Demand and weather can layer on top of a zone's own multiplier normally (each factor answers a different question: "where," "how urgent," "how hard right now").

**Avoiding double-charging distance**: the zone multiplier must never itself be a function of distance (e.g., "×1.2 per km in Zone B" would double-count what `pricePerKmCents` already prices) — it should be a flat rate adjustment for the zone as a whole.

---

## 23. Waiting Time Pricing Engine (Design)

| Concept | Design |
|---|---|
| Free waiting period | A short grace window (e.g. first N minutes) with no charge at all — matches the reasonable expectation that some wait is normal |
| Paid waiting time | Beyond the grace window, a per-minute rate applies |
| Driver compensation | The paid waiting amount flows to the driver — their time was genuinely spent |
| Customer surcharge | Only applies when the *customer/Coffee Owner* caused the delay (rare in a B2B pickup/delivery model — more relevant to Self Pickup, where it's explicitly NOT billable, §28) |
| Supplier responsibility | The common real case — supplier not ready when driver arrives — should charge the **Supplier**, not the Coffee Owner, since the Coffee Owner had no role in the delay |

**Distinguishing cause**:
- **Supplier delay** (not ready at pickup) → charged to Supplier, paid to driver.
- **Customer delay** (not present at dropoff, applicable only outside Self Pickup) → charged to Coffee Owner, paid to driver.
- **Driver delay** (driver arrives late for their own reasons) → no compensation triggered at all — this isn't "waiting" from the business's perspective.
- **System delay** (e.g. a platform outage preventing status updates) → should never be charged to any party — an operational/BigBoss cost, if any, not passed downstream.

No punitive fee (e.g. a large flat penalty beyond real driver compensation) is proposed — that would require an explicit business justification this document has no basis to invent (§41).

---

## 24. Cancellation Compensation

| Stage | Driver compensation | Company compensation | Customer charge | Supplier responsibility | BigBoss |
|---|---|---|---|---|---|
| Before driver assignment | None (no driver committed yet) | None | None | None | None |
| After dispatch, before company acceptance (`AVAILABLE`) | None | None | None | None | None |
| After company accepts (`ACCEPTED`), before driver assigned | None (no driver committed) | Possibly a small "opportunity cost" fee — **undefined, business decision** | None | None | None |
| After driver assigned (`ASSIGNED`), before pickup | Partial compensation reasonable (driver may already be en route) — **amount undefined** | Same partial logic if relevant | Possibly, if the cancellation was Coffee-Owner-initiated without cause | If Supplier-initiated, Supplier could reasonably be charged | Absorbs if platform-initiated |
| Driver already moving / arrived at supplier | Higher partial compensation justified (real time+fuel spent) — **amount undefined** | Same | As above | As above | As above |
| Order already picked up | Should generally NOT be cancellable in the normal sense — this is closer to a delivery failure/return scenario, out of this document's scope | — | — | — | — |
| Order already delivered | Not a cancellation at all | — | — | — | — |

**Not every cancellation deserves the same compensation** — the guiding principle is: compensation should scale with how much real, non-recoverable effort/cost the driver/company already incurred, and the *charge* should fall on whichever party's action triggered the cancellation. The **actual DT amounts** at each stage are explicitly a **BUSINESS DECISION REQUIRED** (§41) — this document proposes the *stages and cause-attribution logic* only, matching Phase 3's existing `payoutStatus` mechanism (`VOID` for any cancelled delivery today, correctly preventing a cancelled delivery's frozen `driverPayoutCents` from ever being mistaken for an earned amount) as the foundation to build partial-compensation logic on top of, rather than replace.

---

## 25. Driver Incentives (Design)

| Incentive | Economic justification |
|---|---|
| Bad-weather incentive | Already covered as the weather *bonus* (§19) — compensates real added difficulty/risk |
| Peak-hour incentive | Encourages driver availability exactly when demand is highest — directly supports the Peak/Demand engines' effectiveness |
| High-demand incentive | Same purpose as peak, but responsive rather than scheduled |
| Long-distance incentive | Arguably unnecessary if the base payout formula (§8, Option C/D) already scales with distance correctly — a separate incentive here risks double-compensating; only justified if the base formula under-compensates long trips specifically |
| Completion streak | Classic gamification — genuine economic value is unclear without evidence it changes driver behavior profitably; **not recommended** without a specific retention/reliability problem to solve |
| Availability incentive | Could genuinely help solve the demand-engine's core input problem (more available drivers reduces the need for demand-multiplier price spikes at all) — a legitimate lever, but requires an "availability" concept the schema doesn't have yet |

**Recommendation**: prioritize incentives that directly solve a **measured operational problem** (weather risk, peak/demand coverage) over generic engagement mechanics (streaks). Avoid gamification for its own sake, per the task's own explicit instruction.

---

## 26. Driver Accept / Decline — Business Design (Not Implemented)

**Lifecycle**:
```
OFFERED → ACCEPTED → ASSIGNED
OFFERED → DECLINED
OFFERED → EXPIRED
```

**Design decisions**:
- **Offer expiration**: a short timeout (minutes, not hours) — an unaccepted offer should recycle to the next candidate driver quickly, matching the fast-moving nature of B2B same/next-day coffee delivery.
- **Repeated offers**: if declined/expired, the system should offer to the next eligible (compatible, available) driver in the roster — exactly the roster `getAssignableDriversForDelivery` (Phase 3) already assembles; this becomes its natural next consumer.
- **Maximum number of drivers offered**: cap the number of sequential/parallel offers before escalating to manual Admin/Supplier/Company intervention, to avoid an unassignable delivery looping forever.
- **Reassignment**: unaffected by this design — the existing `reassignDriver` flow (pre-pickup only) remains the correction mechanism after an acceptance, exactly as today.
- **Driver visibility before accepting**: pickup, destination, distance, ETA (once available), vehicle requirement, weight/volume/packages, fragility, special handling, and **payout** — all already assembled by the Phase 3 `getAssignableDriversForDelivery` response shape; extending it to the driver's own view (not just the dispatcher's) is the natural implementation path.
- **Payout visibility**: must be shown **before** acceptance and must be **exactly** what gets frozen if accepted — no "discover your real payout after accepting" pattern, as already established in the original proposal (§3.15) and Phase 3's snapshot-freeze discipline.
- **Route visibility**: same data, shown to the driver instead of only the dispatcher.
- **Privacy**: a driver evaluating an offer should not see the Coffee Owner's full identity/contact until actually assigned — matches the existing redaction philosophy (`redactDeliveryCodes`) of exposing only what a role currently needs.
- **Anti-abuse**: see §36 — repeated accept-then-cancel patterns must be detectable and discourageable without punishing legitimate declines of genuinely unsuitable offers.

**This remains a genuine product-direction decision** (does BigBoss want individual drivers to have real autonomy, changing today's fully dispatcher-controlled model?) — not merely a technical one, consistent with what Phase 3's final report already flagged. This document designs the *business behavior* only, per the explicit instruction not to implement it.

---

## 27. Dispatch Economics — Objective Rules, Not a Ranking Score

Rather than a opaque scoring algorithm, propose explicit, ordered **rules with tie-breakers** (matches the task's explicit instruction against "a ranking score"):

1. **Vehicle compatibility** (hard filter — already implemented, Phase 2) — incompatible drivers are never candidates, full stop.
2. **Ownership eligibility** (hard filter — already implemented) — only the dispatching Supplier's own drivers, or the accepting Delivery Company's own drivers.
3. **Availability** (hard filter, once an availability concept exists) — a driver already on another active delivery should not be offered a new one simultaneously (today, nothing prevents this — a real gap once volume grows).
4. **Proximity** (soft ranking, tie-breaker #1) — closer to the pickup point wins, using RouteEngine's distance (haversine fallback today).
5. **Workload balance** (soft ranking, tie-breaker #2) — prefer the driver with fewer currently-active deliveries, to spread earnings/effort fairly across a roster.
6. **Reliability signal** (soft ranking, tie-breaker #3, future) — e.g. historical completion rate, once tracked.

**Supplier Driver vs. Delivery Company choice**: this decision is explicitly the **Supplier's own** today (`dispatchDelivery`'s mode choice) and should remain so — it's a commercial choice (self-operate vs. outsource), not something BigBoss should auto-decide on the Supplier's behalf. What BigBoss *can* reasonably do is surface relevant facts to help that human decision (e.g., "your own drivers: 2 available, ETA ~8min" vs. "Delivery Company pool: 5 available companies") — informational, not automated.

---

## 28. Self Pickup Economics

**Unchanged, current and permanent**:
```
deliveryFee = 0
driverPayoutCents = 0
companyPayoutCents = 0
```
No delivery row is even created (`createDeliveryForSubOrder` returns `null` for `SELF_PICKUP` orders) — there is no economic object to compute against.

**Should BigBoss ever charge a separate pickup service fee?** This document does not recommend one: Self Pickup exists specifically as the *zero-cost* alternative to delivery, and introducing any fee would blur that value proposition and would require its own dedicated business justification and UX (a new checkout line item) well outside a "delivery" financial model. If BigBoss ever wants to monetize Self Pickup convenience (e.g., a scheduling/reservation fee), that would be a **separate initiative**, not a delivery-economics one, and is explicitly out of scope here.

---

## 29. Special Order Characteristics — Pricing vs. Vehicle Requirement vs. Payout vs. Safety

| Characteristic | Pricing impact | Vehicle requirement impact | Driver payout impact | Safety impact |
|---|---|---|---|---|
| Weight | Indirect only, via the vehicle it requires (a heavier order needs a bigger vehicle, which has a higher `pricePerKmCents`) — **not** a direct surcharge | Direct (Phase 2 capacity check) | Could justify a payout premium for genuinely harder physical handling — undefined today | Could matter for driver physical safety in extreme cases (informational only) |
| Volume | Same as weight | Direct | Same as weight | Rarely safety-relevant |
| Packages (count) | Indirect (affects required vehicle capacity) | Direct | Could matter if many small packages take longer to handle/deliver | Rarely relevant |
| Items | Informational only today | None directly | None directly | None |
| Fragility | **Should not by itself change price** — it's a handling-care flag | No enforced compatibility rule exists (§29 of Phase 2 report flagged this as a missing business decision) | Could justify a small premium for careful handling — undefined | Could inform driver instructions, not safety in the risk sense |
| Special handling | Same as fragility — informational, no price/vehicle rule enforced today | None enforced | Same | Same |

**Explicit principle (per the task's own instruction)**: characteristics that only affect *which vehicle can do the job* (weight, volume, packages) should not ALSO become a separate direct customer surcharge — the vehicle's own `pricePerKmCents` already reflects that a bigger/more capable vehicle costs more to operate; charging for weight AND for the vehicle it required would double-charge the same underlying cost. Fragility/special handling remain informational only until a genuine driver-compensation or vehicle-compatibility business rule is defined for them (§41) — inventing one here would repeat exactly the mistake Phase 2 was explicitly instructed to avoid.

---

## 30. Multi-Supplier Economics

Already implemented and verified across Phases 1-3 testing (order #146, two different suppliers, two independent `deliveries` rows, different vehicle/distance/fee/payout each, zero cross-contamination). The financial model proposed throughout this document (§6-24) applies **independently per `deliveries` row** — there is no "whole order" pricing or payout concept anywhere in the architecture, and this document does not propose introducing one. Each sub-order's delivery independently computes: route → vehicle → customer contribution → supplier contribution → BigBoss subsidy → driver payout → company payout → margin, exactly mirroring the existing one-row-per-sub-order model.

---

## 31. Pricing Snapshot — What Must Be Frozen

Building on Phases 1-3's already-implemented snapshot fields, organized into three conceptual groups (as requested) to avoid duplication:

**Pricing snapshot** (already exists): `distanceKm`, `vehicleType`, `surgeMultiplierPermille`, `pricePerKmCentsUsed`, `minFeeCentsUsed`, `baseFeeCents`, `adjustedFeeCents`, plus the (currently inert) `weatherMultiplierPermilleUsed`/`demandMultiplierPermilleUsed`/`peakHourMultiplierPermilleUsed`/`zoneMultiplierPermilleUsed`/`waitingFeeCentsUsed`/`urgencySurchargeCentsUsed`. **Proposed additions** (only once each factor goes live, never speculatively): the resolved zone identifier, the resolved weather condition, the resolved demand bucket — as labels, not just multiplier numbers, so a historical delivery is human-explainable ("this cost more because Zone B + High Demand"), not just numerically frozen.

**Contribution/subsidy snapshot** (partially exists — `cafeOwnerFeeShareCents`/`supplierFeeShareCents`/`freeDeliveryApplied` today): **proposed addition** — `bigBossSubsidyCents` (currently always implicitly 0, should become explicit once §16 exists), and which specific `SupplierSubsidyEngine` rule/campaign applied (an ID reference, not the full rule — rules can change, the ID reference is what makes the historical application traceable).

**Payout snapshot** (already exists, Phase 3): `driverPayoutSharePercentUsed`, `driverPayoutCents`, `companyPayoutCents`. **Proposed additions** (only once each concept goes live): which minimum-guarantee (if any) was applied, which incentive(s) (if any) contributed to the final number — again as ID/label references, not full recomputation logic, to avoid duplicating the rule definitions themselves inside every delivery row.

**Operational snapshot** (already exists): `roadDistanceKm`, `estimatedDurationMinutes`, `distanceSource`, the pickup/dropoff codes, all delivery status timestamps. No changes proposed here beyond what Phase 2 already built.

**Avoiding duplication**: the pattern established in Phase 1 (freeze the *result* plus enough *labeled inputs* to explain it, but never re-store the full rule definition itself) should continue — e.g. store `zoneId` (a reference), not a copy of the zone's polygon/rate table.

---

## 32. Ten Numerical Examples

All using **today's live default rates** (verified): MOTO 0.50 DT/km, min 3.00 DT; CAR 1.00 DT/km, min 5.00 DT; VAN 1.50 DT/km, min 8.00 DT; TRUCK 2.50 DT/km, min 15.00 DT; café share 50%; driver payout share 100% (default). Proposed-future factors (weather/demand/zone/waiting) are shown with **illustrative, clearly-marked placeholder** values only where the example requires them, never presented as real configured numbers.

### Example 1 — Short urban delivery, Moto
Distance 2.5 km. `rawFee = round(2.5 × 50 × 1.0) = 125 cents`. `feeCents = max(125, 300) = 300` (1.25 DT floored to the 3.00 DT minimum). Café 1.50 DT / Supplier 1.50 DT. Driver payout (100%) = 3.00 DT. Company payout = 0 (SUPPLIER mode). BigBoss margin = 0.

### Example 2 — Long delivery, Voiture
Distance 18 km. `rawFee = round(18 × 100 × 1.0) = 1800 cents = 18.00 DT`. `feeCents = max(1800, 500) = 1800`. Café 9.00 DT / Supplier 9.00 DT. Driver payout = 18.00 DT. Margin = 0.

### Example 3 — Large order, Camionnette
Distance 9 km, supplier declared `requiredVehicleType='VAN'`. `rawFee = round(9 × 150) = 1350 cents = 13.50 DT`. `feeCents = max(1350, 800) = 1350`. Café 6.75 DT / Supplier 6.75 DT. Vehicle compatibility (Phase 2) blocks any Moto/Voiture driver. Driver payout = 13.50 DT.

### Example 4 — Very heavy order, Camion
Distance 6 km, `requiredVehicleType='TRUCK'`. `rawFee = round(6 × 250) = 1500 cents = 15.00 DT`. `feeCents = max(1500, 1500) = 1500` (exactly at the floor). Café 7.50 DT / Supplier 7.50 DT. Driver payout = 15.00 DT.

### Example 5 — Supplier pays part (proposed partial subsidy, §15)
Same as Example 1 (3.00 DT fee), but Supplier has configured a **PERCENT** subsidy rule at 50% (illustrative). `supplierSubsidyCents = 150`. Remaining funded fee = 150 cents. Café share (50% of remaining) = 0.75 DT, Supplier's *additional* contribution on top of its subsidy = 0.75 DT (total Supplier outlay = 1.50 + 0.75 = 2.25 DT). Driver payout unaffected = 3.00 DT (never reduced by a subsidy — matches the existing `freeDeliveryApplied` principle exactly).

### Example 6 — BigBoss subsidizes part (proposed, §16)
Same base as Example 2 (18.00 DT fee), BigBoss campaign covers 20% (illustrative, capped, budgeted). `bigBossSubsidyCents = 360`. Remaining funded fee = 1440 cents. Café 7.20 DT / Supplier 7.20 DT (down from 9.00/9.00 each without the campaign). Driver payout unaffected = 18.00 DT. BigBoss margin = **−3.60 DT** on this delivery, explicit and attributable to the named campaign.

### Example 7 — Heavy rain (proposed WeatherPricingEngine, §19)
Same base as Example 1 (3.00 DT fee), illustrative `HEAVY_RAIN` condition: customer multiplier ×1.15 (capped), driver bonus +1.50 DT flat (illustrative). Adjusted customer fee = round(300 × 1.15) = 345 cents = 3.45 DT. Café 1.73 DT / Supplier 1.72 DT. Driver payout = 3.45 + 1.50 = **4.95 DT** — funded partly by the higher customer/supplier contribution (0.45 DT of it) and partly by BigBoss absorbing the remaining 1.05 DT gap (or a `DeliveryBudgetEngine` deficit flag, per §17, if BigBoss chooses not to auto-absorb it).

### Example 8 — High demand / low driver availability (proposed DemandPricingEngine, §20)
Same base as Example 2 (18.00 DT fee), illustrative demand bucket "High" → ×1.35 (within an illustrative cap of ×1.5). Adjusted fee = round(1800 × 1.35) = 2430 cents = 24.30 DT. Café 12.15 DT / Supplier 12.15 DT. Driver payout (100% share) = 24.30 DT — at least the guaranteed floor (§9), likely well above it here since the multiplier alone already raises it substantially.

### Example 9 — Waiting time caused by Supplier (proposed WaitingTimePricingEngine, §23)
Same base as Example 1 (3.00 DT fee). Driver waits 12 minutes at the Supplier beyond an illustrative 5-minute grace period → 7 billable minutes at an illustrative 0.50 DT/minute = 3.50 DT waiting compensation. This entire amount is charged to the **Supplier** (cause-attributed, §23) and paid to the driver: Supplier's total outlay = 1.50 DT (its normal share) + 3.50 DT (waiting) = 5.00 DT. Café share unaffected = 1.50 DT. Driver payout = 3.00 + 3.50 = **6.50 DT**.

### Example 10 — Delivery Company + driver
Distance 11 km, Voiture, `deliveryMode='DELIVERY_COMPANY'`. `rawFee = round(11 × 100) = 1100 cents = 11.00 DT`. `feeCents = max(1100, 500) = 1100`. Café 5.50 DT / Supplier 5.50 DT. Admin has configured `driverPayoutSharePercent = 75` (illustrative, a real Admin decision, not this document's default). Driver payout = round(1100 × 0.75) = 825 cents = 8.25 DT. Company payout = 1100 − 825 = **2.75 DT**. BigBoss margin = 0 (the full fee is still fully distributed between driver and company; BigBoss itself still takes nothing).

---

## 33. Edge Cases

| Case | Expected behavior |
|---|---|
| 0 km (pickup = destination) | `rawFee = 0` → `feeCents = minFeeCents[vehicle]` (the floor always applies) — already correct today |
| Very short distance | Same — floor dominates, already correct |
| Very long distance | No cap exists today on the *distance* component itself — only the proposed §7 combined-multiplier cap would bound a *dynamic-factor-inflated* long-distance fee; the base distance×rate itself is intentionally uncapped (a genuinely far delivery should cost proportionally more) |
| No compatible vehicle | `assignDriver` throws with a specific reason (Phase 2, verified live) — the delivery remains unassigned, no financial event occurs |
| No available driver | Delivery stays `PENDING`/`AVAILABLE`/`ACCEPTED` indefinitely today — no timeout/escalation exists; a proposed Driver-Offer expiration (§26) would eventually need a "no one accepted" terminal handling, currently undefined |
| Driver cancellation | Not currently a distinct concept (no accept/decline exists) — today's only cancellation path is `CANCELLED` status by Supplier/Company/Admin; §24 applies |
| Supplier cancellation | Allowed (`isOwningSupplier` check in `updateDeliveryStatus`); §24 stage-based compensation applies |
| Customer cancellation | Handled at the order/sub-order level (outside this delivery-specific model) — if it results in a delivery cancellation, §24 applies the same way |
| Bad weather | §19 — currently no automated effect; the manual `surgeLabel` is purely descriptive today |
| Extreme weather | §19 — proposed to trigger `DeliverySafetyEngine` SUSPENDED, blocking new deliveries in the zone, independent of any price |
| High demand | §20 — currently no automated effect |
| Multiple multipliers active | §6-7 — multiplicative stacking with a combined cap, by design, to prevent explosion |
| Waiting | §23 — currently no billing; timestamps exist to build it on |
| Self Pickup | §28 — always zero economics, verified structurally (0 delivery rows for every Self Pickup order) |
| Multi-supplier | §30 — fully independent per sub-order, verified |
| Free delivery | Already correct today: `deliveryFee` (driver compensation) is never reduced; only the `cafeOwnerFeeShareCents`/`supplierFeeShareCents` split collapses to 0/100 |
| Subsidized delivery | §16 — proposed, must remain an explicit, budgeted line, never silently absorbed |
| Negative-margin delivery | §18 — legitimate when subsidized, must remain identifiable, never confused with an unexplained loss |
| Delivery company unavailable | Today, an `AVAILABLE` delivery simply waits in the shared pool until some company accepts it, or the Supplier can switch to `SUPPLIER` mode — no automatic re-dispatch/escalation exists |

---

## 34. Admin Controls

| Control | Scope |
|---|---|
| Vehicle rates, minimum fees, capacities | **GLOBAL PLATFORM RULES** (already exists, Phases 1-2) |
| Driver payout share % | **GLOBAL PLATFORM RULES** (already exists, Phase 3) — proposed to gain a **DELIVERY COMPANY CONTRACT** override (§12) |
| Weather/demand/peak/zone multipliers + caps | **GLOBAL PLATFORM RULES** (proposed, §19-22) |
| Waiting rate, grace period | **GLOBAL PLATFORM RULES**, with per-cause attribution logic (proposed, §23) |
| Subsidies (Supplier-funded) | **SUPPLIER-SPECIFIC RULES** (partially exists via `promotions`, proposed to extend, §15) |
| Subsidies (BigBoss-funded) | **GLOBAL PLATFORM RULES**, campaign-scoped (proposed, §16) |
| Minimum guarantees | **GLOBAL PLATFORM RULES**, per-vehicle-type (proposed, §9) |
| Cancellation compensation | **GLOBAL PLATFORM RULES** by default, potentially overridable per **DELIVERY COMPANY CONTRACT** (proposed, §24) |
| Driver incentives | **GLOBAL PLATFORM RULES** (proposed, §25) |
| Coffee Owner/Supplier split override | **SUPPLIER-SPECIFIC RULES** (proposed, §14), with a symmetric **potential Coffee-Owner-specific** override also flagged |
| Delivery-company commission rate | **DELIVERY COMPANY CONTRACT RULES** (proposed, §12) — the model's biggest structural gap versus a real per-partner logistics relationship |

---

## 35. Rule Priority / Order of Operations

Proposed order (deliberately re-derived from the actual architecture, not copied from the task's illustrative example):

```
1. Base distance × vehicle rate                (existing, Phase 1)
2. Zone multiplier                              (proposed — a location property, applies earliest since it characterizes WHERE before anything else)
3. Existing surge multiplier (manual)           (existing, Phase 1 — kept exactly where it already is)
4. Weather multiplier                           (proposed — a condition of the moment)
5. Peak-hour multiplier                         (proposed — a scheduled condition of the moment)
6. Demand multiplier                            (proposed — the most volatile/reactive factor, applied last among multipliers so it reacts to the state everything else has already established)
7. Minimum fee floor                            (existing, Phase 1 — re-applied AFTER all multipliers, not just after the base, so the floor is always the true final safety net, not something a multiplier could push back under)
8. Waiting fee (additive)                       (proposed — an event, not a rate, added after the rate-based floor is settled)
9. Urgency surcharge (additive)                 (proposed — same reasoning as waiting)
10. Combined multiplier cap + absolute max      (proposed, §7 — the final backstop)
11. Supplier subsidy                            (proposed, §15 — funding decisions happen AFTER the true cost is known, never before)
12. BigBoss subsidy                             (proposed, §16 — applied after supplier subsidy, per §15's stacking/priority rule)
13. Coffee Owner / Supplier split                (existing, Phase 1 — applied to whatever funded amount remains after all subsidies)
```

**Why this order, and why NOT the task's illustrative example order**: the task's example applies the minimum-fee floor *before* zone/peak/weather/demand, which would let those multipliers push a delivery back under the floor they were supposed to respect (e.g. a floored 3.00 DT fee × a 0.9 weather discount, if ever a discount existed, would go under the "minimum"). Re-applying the floor **after** every multiplicative factor (step 7 above) but **before** the additive waiting/urgency fees (which represent real, separately-justified costs that should never be suppressed by a "minimum" that was about the base trip, not the waiting) is the more internally consistent design. Subsidies must always be last among the "cost" steps, since they're about *who funds* an already-fully-determined cost, never about changing what that cost *is*.

**Caps/floors/precedence/conflicts**: every cap (§7) is a hard ceiling applied at its own step; the minimum fee is a hard floor applied once, at step 7, as described; if a Supplier-specific split override (§14) and a Coffee-Owner-specific split override could ever both apply to the same delivery, the more specific one should win (Coffee-Owner-specific, since it's the more granular/deliberate commercial agreement) — a conflict resolution rule proposed here for completeness, though neither override exists today.

---

## 36. Anti-Abuse / Anti-Gaming (Business-Rule Level)

| Risk | Business-level safeguard |
|---|---|
| Fake GPS location (inflating distance/zone/demand signals) | Sanity-bound any driver-reported location against the known pickup/destination (reject/flag implausible jumps); this is a verification policy, not a pricing formula change |
| Driver repeatedly declining expensive-for-them / unprofitable deliveries | Track decline patterns per driver as a *reliability signal* (§27, tie-breaker #3) rather than penalizing declines directly — a driver declining genuinely unsuitable offers is legitimate; only *excessive* patterns should affect future dispatch priority, never pay |
| Driver accepting then repeatedly cancelling | Should count against the same reliability signal, and repeated instances could reasonably reduce future offer priority — again a dispatch-level consequence, not an ad-hoc financial penalty invented here |
| Supplier intentionally causing waiting (to shift cost or stall) | The waiting-fee attribution (§23) already naturally disincentivizes this — a Supplier who repeatedly causes billable waiting pays for it every time; a pattern-detection flag for Admin review is a reasonable addition, not a new fee |
| Customer intentionally causing waiting | Same logic, on the Coffee Owner side (relevant mainly if a future customer-side waiting charge exists at all) |
| Artificial demand spikes (e.g. coordinated fake orders) | Demand pricing (§20) should be based on genuine order/driver ratios; any anomaly-detection is an operational/fraud concern outside this document's financial-model scope, but the hysteresis/smoothing already proposed (§20) naturally dampens short-lived artificial spikes |
| Excessive subsidy usage | The hard budget cap already proposed (§16) is the primary safeguard — a campaign simply stops applying once `spentCents` reaches `budgetCapCents` |
| Repeated free delivery (gaming a threshold) | `freeShippingMinAmount`-style thresholds already exist; per-cafe/per-period usage limits on a given promotion would be a natural extension, structurally similar to how the `promotions` table already scopes eligibility |
| Manipulating vehicle requirements (e.g. supplier falsely requiring an expensive vehicle to inflate driver payout, if payout ever becomes vehicle-dependent) | Requires Admin/Delivery-Company visibility into requirement-vs-actual-order-size mismatches — a monitoring/reporting concern, not a formula change |

All of these remain **business-rule-level observations**, per the task's explicit instruction — no detection algorithm or enforcement mechanism is designed or implemented here.

---

## 37. Unit Economics — KPIs to Monitor

| KPI | Calculation |
|---|---|
| Average delivery revenue | `mean(cafeOwnerContribution + supplierContribution + bigBossSubsidy)` over completed deliveries |
| Average driver payout | `mean(driverPayoutCents)` over completed deliveries |
| Average company payout | `mean(companyPayoutCents)` over `DELIVERY_COMPANY`-mode completed deliveries |
| Average subsidy | `mean(supplierSubsidyCents + bigBossSubsidyCents)` |
| Average delivery cost | `mean(driverPayoutCents + companyPayoutCents)` |
| Average delivery margin | `mean(netDeliveryMargin)` per §18 |
| Cost per km | `sum(driverPayoutCents + companyPayoutCents) / sum(distanceKm)` |
| Revenue per km | `sum(cafeOwnerContribution + supplierContribution + bigBossSubsidy) / sum(distanceKm)` |
| Driver earnings per hour | Requires a real duration source (§8, Option D) — not computable reliably today since `estimatedDurationMinutes` is always null; use `deliveredAt − assignedAt` as an interim proxy |
| Delivery completion rate | `count(status='DELIVERED') / count(all deliveries created)` |
| Cancellation rate | `count(status='CANCELLED') / count(all deliveries created)` |
| Offer acceptance rate | Only meaningful once §26 (driver offer/accept) exists — not computable today, since assignment is unilateral |
| Average waiting time | Only meaningful once §23 is tracked — `pickedUpAt − arrivedAt`-style timestamps don't exist yet (only `assignedAt`/`pickedUpAt`) |
| Average delivery time | `mean(deliveredAt − assignedAt)`, computable today from existing timestamps |

This is the natural scope of the future `DeliveryAnalyticsEngine` already named in `delivery-v2-proposal.md` §3.22 — this document does not redesign that engine, only confirms which of its inputs are already available (most operational ones) versus blocked on other proposed engines (offer acceptance, waiting, driver-hours).

---

## 38. Recommended Architecture

```
                    ADMIN CONFIGURATION
           (global rules, supplier rules, company contracts)
                              │
                              ▼
                         RouteEngine                    [EXISTS — Phase 2]
                              │  distance, (future) duration
                              ▼
                 DeliveryRequirementEngine               [EXISTS — Phase 2, advisory]
                              │  weight/volume/packages/required vehicle
                              ▼
                VehicleCompatibilityEngine                [EXISTS — Phase 2]
                              │  gates who CAN be assigned
                              ▼
                  DeliveryPricingEngine                    [EXISTS — Phase 1, extended §6-7]
                              │  customer delivery fee (frozen)
                              ▼
           Contribution / Subsidy Engine                   [PROPOSED §14-16]
        (Coffee Owner + Supplier split, Supplier subsidy, BigBoss subsidy)
                              │  who actually funds the fee
                              ▼
                  DeliveryBudgetEngine                      [PROPOSED §17]
                    (funding vs. payout, surplus/deficit)
                              │
                              ▼
                  DriverPayoutEngine                        [EXISTS — Phase 3, extended §8-9]
                    (+ minimum guarantee, + incentives §25)
                              │
                              ▼
                DeliveryDispatchEngine                       [EXISTS — Phase 3 recommendation layer]
                              │
                              ▼
                  DriverOfferEngine                          [PROPOSED §26 — business design only]
                              │
                              ▼
                          Delivery
                    (assignment, execution, snapshot)
```

**Responsibility of each engine** (only newly proposed ones need restating — existing ones are documented in §1 and the three prior phase reports):
- **Contribution/Subsidy Engine**: decides *who funds* an already-fully-priced delivery — never touches the price itself, only how it's paid for.
- **DeliveryBudgetEngine**: a pure reconciliation check between funding and payout — advisory, never blocking, never silently adjusting either side.
- **DriverOfferEngine**: the only engine in this list that changes *who gets to say yes/no* — deliberately the most conservatively scoped, since it's a product decision, not purely technical.

This extends the existing system exactly as instructed — no engine here replaces an already-built one; each new box either sits between two existing stages or wraps an existing engine's output.

---

## 39. Future Engine Classification

| Engine | Status | Why |
|---|---|---|
| DeliveryPricingEngine | **Already implemented** | Phase 1, `runDeliveryPricingPipeline`/`computeDeliveryFee` |
| DeliveryPricingSnapshot | **Already implemented** | Phase 1, frozen at `feeFinalizedAt` |
| DeliveryEstimation | **Already implemented** | `estimateDeliveryFee`, same pipeline, pre-checkout |
| DriverPayoutEngine | **Already implemented** | Phase 3, `computeDeliveryPayout` |
| VehicleCompatibilityEngine | **Already implemented** | Phase 2, `checkDeliveryVehicleCompatibility` |
| DeliveryRequirementEngine | **Already implemented** (advisory) | Phase 2, `determineRequiredVehicleType` — deliberately never auto-writes |
| WeatherPricingEngine | **Should be implemented** | Pipeline slot exists and is inert; §19 designs it; needs Admin-declared conditions, not a live API |
| DemandPricingEngine | **Should be implemented**, with caution | Pipeline slot exists; §20 requires new availability tracking first (partial gap) |
| WaitingTimePricingEngine | **Should be implemented** | Timestamps mostly exist; needs one new "arrived" timestamp + a rate config; §23 |
| SupplierSubsidyEngine | **Partially implemented** | Binary `FREE_SHIPPING` exists; §15 proposes graduated rules as a natural extension, not a rewrite |
| BigBossSubsidyEngine | **Should be implemented** | Does not exist at all; §16 — genuinely new, needs a campaign/budget entity |
| DeliveryBudgetEngine | **Should be implemented**, advisory-only first | §17 — pure reconciliation, low risk, high transparency value |
| RouteEngine | **Already implemented** (fallback only) | Phase 2; a real provider remains future work, out of this financial model's scope |
| DeliveryDispatchEngine | **Already implemented** (recommendation layer) | Phase 3, `getAssignableDriversForDelivery` |
| DriverOfferEngine | **Should remain future** | §26 — a genuine product-direction decision (driver autonomy), not purely technical; business design only, ready to build once decided |
| Batching/Consolidation Engine | **Should remain future** | Requires reconsidering the one-delivery-per-sub-order assumption; a dedicated design pass, not a quick add-on |
| ZonePricingEngine | **Should be implemented** | §22 — cheap to build (governorate-match v1), clear value |
| PeakHourEngine | **Should be implemented** | §21 — direct, low-risk extension of the existing flat surge slot |
| DeliverySafetyEngine | **Should be implemented** | §19/§33 — needed as soon as WeatherPricingEngine goes live, since extreme conditions must be able to block dispatch, not just reprice it |
| SelfPickupEngine | **Already implemented** | Full flow live and tested; no changes proposed |
| PickupCodeService | **Already implemented**, two parallel instances | Normal-delivery codes + self-pickup codes; could be unified into one shared helper later, but functionally complete today — **not necessary** to change urgently |
| DeliveryAnalyticsEngine | **Should be implemented**, partially blocked | §37 — most operational KPIs are computable today; a few (offer acceptance, waiting, driver-hours) are blocked on other proposed engines first |

**Should any be merged?** No engine here should be merged with another — each answers a distinct question (WHERE/zone, WHEN/peak, HOW URGENT/weather+demand, HOW LONG/waiting are all genuinely independent axes), and Phase 1's entire pipeline design exists specifically so they can compose without becoming one giant function. The one explicit "not necessary" is unifying the two `PickupCodeService` instances — a nice-to-have refactor, not a business-model requirement.

---

## 40. Phase Roadmap

Derived from this document's own dependency analysis (not the task's illustrative example, which this document intentionally re-derives):

**Phase 4 — Financial model foundation**
Contribution/Subsidy Engine (§14-15, extending existing `FREE_SHIPPING` to graduated Supplier rules), DeliveryBudgetEngine (§17, advisory-only). Lowest risk: purely additive, no dynamic pricing yet, immediately gives Admin visibility into funding vs. payout gaps.

**Phase 5 — BigBoss subsidy + delivery-company contracts**
BigBossSubsidyEngine (§16, budget-capped campaigns) and a per-Delivery-Company commission override (§12) — the two biggest genuine structural gaps identified in this document. Both are business/product decisions as much as technical ones; should not proceed without explicit sign-off on budget process and contract terms.

**Phase 6 — Zone + Peak Hour**
Lowest-complexity dynamic factors (§21-22) — no live external data dependency, cheapest to implement safely, good testing ground for the combined-multiplier-cap safeguards (§7) before weather/demand are layered on.

**Phase 7 — Weather + Demand + Waiting**
The higher-complexity dynamic factors (§19-20, §23) — weather needs a manual-declaration UI (not a live API, per this document's explicit recommendation) plus the DeliverySafetyEngine gate; demand needs new availability tracking plus hysteresis; waiting needs one new timestamp. Should launch only after Phase 6 proves the cap/safeguard machinery works in production.

**Phase 8 — Driver minimum guarantee + incentives**
§9 and §25 — meaningful only once real dynamic factors (Phase 7) exist to guarantee *against*; sequencing this earlier would have nothing to guarantee a floor under.

**Phase 9 — Driver Offer/Accept**
§26 — deliberately last among the "engine" phases: it's the one genuine product-direction change (driver autonomy) in this whole roadmap, and every other phase's payout/offer-visibility data becomes more valuable once it exists to actually show a driver before they decide.

**Phase 10 — Batching, Safety-state refinement, Analytics**
Final phase — batching requires its own dedicated design (§39), and full analytics (§37) is naturally last since it reports on everything built in Phases 4-9.

---

## 41. Business Decisions Required — Not Invented Here

| Decision | Why it matters | Possible options | Economic consequence | Recommended configurable structure |
|---|---|---|---|---|
| **Driver minimum guarantee amount(s)** | Protects driver income floor; without it, a very short/low-rate trip could pay almost nothing | A flat DT floor per vehicle type; or a percentage uplift over the computed amount | Sets the real cost floor of running the platform's delivery network | Per-vehicle-type table, same jsonb pattern as `vehiclePricing` (§9) |
| **Delivery-company commission rate** | Determines whether Delivery Company partnerships are commercially attractive at all | Global default (today, implicitly 0% via `driverPayoutSharePercent=100`); or per-company negotiated rate | Directly affects whether third-party companies want to work with BigBoss | Per-company override table (§12) |
| **Cancellation compensation amounts per stage** | Determines driver/company trust in accepting deliveries at all | Flat fee per stage; percentage of expected payout; none | Under-compensating discourages driver commitment; over-compensating invites abuse (§36) | Per-stage, per-vehicle-type configurable table (§24) |
| **Weather multiplier values + caps** | Balances customer fairness against driver risk compensation | Fixed table per condition (RAIN/HEAVY_RAIN/STORM/EXTREME) | Directly affects both customer price and driver take-home during bad weather | Admin-configurable condition table (§19) |
| **Demand multiplier values + caps + thresholds** | Prevents both under- and over-reacting to real supply/demand imbalance | Bucketed multiplier table + hysteresis thresholds | Affects price volatility and driver availability incentives | Admin-configurable bucket table + smoothing window (§20) |
| **Maximum combined dynamic multiplier** | The single most important anti-abuse safeguard in the whole pricing model | A hard ceiling (e.g. some multiple of the base fee) | Bounds worst-case customer price exposure | One global configurable cap, enforced in the pipeline (§7) |
| **Supplier contribution defaults/overrides** | Determines baseline commercial fairness between BigBoss's two B2B customer types | Global default (exists, 50%) + optional per-supplier override | Affects Supplier margin and Coffee Owner cost simultaneously | Per-supplier override on top of the existing global default (§14) |
| **BigBoss subsidy budget & eligibility rules** | Prevents open-ended platform cost exposure | Campaign-based, capped, time-boxed | Directly a P&L decision for BigBoss | Campaign entity with `budgetCapCents`/`spentCents` (§16) |
| **Free-delivery / subsidy thresholds** | Determines how aggressively BigBoss/Suppliers compete on "free delivery" as a growth lever | Order-value thresholds, per-supplier or platform-wide | Affects conversion vs. margin trade-off | Extends existing `freeShippingMinAmount` pattern (§15) |
| **Waiting fee rate + grace period length** | Balances fair driver compensation against not punishing normal operational variance | A per-minute rate + a grace window in minutes | Affects Supplier behavior (incentive to be ready on time) and driver earnings during delays | Global configurable rate + grace period (§23) |

None of these values are proposed, guessed, or defaulted to a "reasonable-sounding" number anywhere in this document — every formula above that references one of these is written in terms of the *variable*, not a chosen constant, exactly matching the discipline already established across Phases 1-3.

---

## 42. Executive Summary
*(See §0 at the top of this document — repeated at the top per the requested document structure.)*
