# BigBossCoffee Delivery — Two-Leg Distance Model (as-built)

### Status: **IMPLEMENTED, TESTED.**

## What changed

A delivery's distance was previously computed as ONE combined value: `driverToSupplier + supplierToCafe`, fed into a single pricing pipeline. This meant the Coffee Owner's delivery fee (and their `cafeOwnerFeeShareCents` share of it) silently included the cost of the driver travelling to the Supplier to collect the order — a real bug, not a documented business rule.

Now:
- **Leg 2 (Supplier → Coffee Owner)** — unchanged in meaning: `deliveries.distanceKm`/`roadDistanceKm`/`estimatedDurationMinutes`/`distanceSource`/`deliveryFee`/`cafeOwnerFeeShareCents`/`supplierFeeShareCents` all continue to mean exactly what they meant before, now computed from the Supplier→Coffee Owner distance **alone**.
- **Leg 1 (driver's current position → Supplier)** — new, parallel snapshot fields (`pickupLegDistanceKm`, `pickupLegRoadDistanceKm`, `pickupLegEstimatedDurationMinutes`, `pickupLegDistanceSource`, `pickupLegFeeCents`), priced via the exact same pipeline/vehicle rate/global settings, charged **entirely to the Supplier** via a new `SUPPLIER_PICKUP_LEG` ledger entry (DEBIT) — never merged into `supplierFeeShareCents`, so the existing `deliveryFee = cafeOwnerFeeShareCents + supplierFeeShareCents` relationship every current UI display relies on remains exactly true.

Driver's position source is unchanged (`users.locationLat/locationLng`, already read at `assignDriver`/`reassignDriver` time) — this model only stopped merging its distance into the customer fee.

## Decisions made — flagged, not silently assumed

Two points required judgment calls beyond what the task text specified literally. Both are implemented as the most literal, defensible reading of "these two legs must be treated separately," but are flagged here per the task's own instruction to report rather than silently invent policy:

1. **The minimum-fee floor is applied independently to each leg.** Leg 1 and Leg 2 each run through the full pricing pipeline (base fee → surge → **minimum fee floor** → weather/peak multipliers) separately. Consequence: the *total* money moving on a delivery (customer fee + supplier pickup-leg cost) is generally **slightly higher** than the old single combined-distance calculation would have produced, because two independent floors can each round up short distances, where one combined calculation floored only once. No new rate or percentage was invented — this is the *existing* pipeline, applied twice instead of once, which is the most literal reading of "two distinct movement legs... treated separately." An alternative (proportionally splitting one single combined-distance calculation) was considered and rejected because it isn't meaningfully more "correct" and floors both legs implicitly at different points depending on which leg is "larger" — the independent-pipeline approach is simpler, more transparent, and independently auditable per leg.
2. **The pickup leg excludes the zone multiplier**, using neutral (1000‰) instead. The zone multiplier is resolved from the **Coffee Owner's** governorate (`resolveZonePricing`) — it has no defined meaning for a leg that never involves the Coffee Owner. Weather and peak-hour multipliers *are* reused (same driver, same trip, same conditions), and the vehicle's own base `minFeeCents` is used rather than the zone-adjusted `effectiveMinFeeCents` (for the same reason).

Neither of these invents a commission, percentage, or subsidy value — both reuse existing rates/settings, applied to a newly-separated leg the existing formula never previously priced on its own.

## Driver / Delivery Company payout

`driverPayoutCents` is now computed on `Leg2Fee + Leg1Fee` combined (previously computed on the old, erroneously-combined single distance — so the driver's total compensation for the same physical trip is essentially unchanged in shape, just now correctly sourced from two separately-tracked, separately-funded legs). `companyPayoutCents` (DELIVERY_COMPANY mode) = `(Leg2Fee + Leg1Fee) − driverPayoutCents`, same existing formula, fed the corrected combined total — this was necessary to avoid a negative company payout that would otherwise result from driver compensation exceeding the now-smaller Leg-2-only fee alone.

`computeDeliveryBudget` was extended with an explicit `pickupLegFeeCents` funding parameter — without it, every two-leg delivery would show a false `DEFICIT` purely because Leg 1's driver compensation wasn't counted as funded by anything. This is not a new business decision; it's counting a genuine funding source (the Supplier's pickup-leg payment) in an existing analytical calculation that already sums funding sources.

## Delivery Company mode

Verified unchanged in responsibility: the pickup leg is **always** charged to the Supplier (`delivery.supplierId`), regardless of `deliveryMode`. A Delivery Company's own driver still travels to the Supplier to collect — that travel cost remains the Supplier's, not the company's or the Coffee Owner's, consistent with the task's own framing ("SUPPLIER RESPONSIBILITY: Driver → Supplier pickup distance," stated without a Delivery-Company-mode exception).

## Historical safety

No existing delivery's frozen row is touched. `pickupLegFeeCents`/etc. are all nullable and only ever written at a live `assignDriver`/`reassignDriver` call — a delivery already `DELIVERED` (or even just already `ASSIGNED`) before this model shipped keeps its old, single-combined-distance `deliveryFee` exactly as it was, and never gets a `SUPPLIER_PICKUP_LEG` entry retroactively.

## Role visibility

- **Coffee Owner**: never sees `pickupLegFeeCents`/`pickupLegDistanceKm`/etc. (redacted in `redactDeliveryCodes`, absent from `getOrders`' Coffee-Owner-facing shape).
- **Supplier / Delivery Company**: see the pickup-leg distance and its cost — it's their own financial responsibility (Supplier) or operationally relevant to a delivery they're fulfilling (Company).
- **Driver**: sees the pickup-leg distance/route (needed to perform the collection) but not gated to also see its cents amount specifically — matches "Driver should see the route information necessary to perform the delivery," not a financial breakdown role.
- **Admin**: sees everything, unredacted.

## Not changed

No commission percentage, subsidy value, driver minimum guarantee, or cancellation compensation was invented. Vehicle pricing/compatibility/capacity logic is untouched — both legs use the same assigned vehicle's existing rate as the sole source of truth. Self Pickup remains structurally excluded (no `deliveries` row exists for it, so no leg — of either kind — can ever be computed).
