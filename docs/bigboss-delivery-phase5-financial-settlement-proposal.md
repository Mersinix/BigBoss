# BigBossCoffee Delivery — Phase 5: Financial Settlement, Commission & Ledger
### Proposal / analysis only. No code, schema, database, UI, or API was changed to produce this document.

This document builds directly on `docs/bigboss-delivery-financial-business-model.md` and the four implemented, tested phases (Phase 1: pricing pipeline; Phase 2: route/vehicle/compatibility; Phase 3: driver-payout separation; Phase 4: weather/peak/zone/waiting/safety/subsidy/budget). Every "CURRENT IMPLEMENTATION" statement below was verified against the actual code as it exists today (`shared/schema.ts`, `server/storage.ts`, `server/routes.ts`, the delivery-related client components/hooks) — not against what was planned or proposed earlier.

---

## 1. Executive Summary

BigBossCoffee's delivery system, as it stands after Phase 4, is a **complete, accurate pricing and payout calculator** — it can tell you, for any delivery, exactly what the customer should pay, what the driver should earn, what the company should retain, what the supplier subsidizes, and whether the numbers are funded. What it **cannot** do — and what nothing in Phases 1-4 was ever asked to do — is tell you whether any of that money has actually **changed hands**. Every dollar amount in the `deliveries` table today is a *calculation*, frozen at a point in time, never a *record of payment*. There is no ledger, no settlement run, no balance, no refund mechanism tied to delivery economics, and no concept of "this specific 8 DT was actually transferred to this specific driver on this specific date." Phase 5 is entirely about building that missing layer — not by replacing the calculator, but by making it the **source of ledger entries** for a genuinely new subsystem underneath it.

**Who pays, who earns, who owes, who was paid** are four different questions today answered by, respectively: the frozen `cafeOwnerFeeShareCents`/`supplierFeeShareCents` (pays), the frozen `driverPayoutCents`/`companyPayoutCents` (earns, in the sense of "is entitled to"), *nothing* (owes — no debt/obligation record exists), and *nothing* (paid — no payment record exists). This proposal's central recommendation is a new, strictly additive **`deliveryFinancialLedger`** — an append-only table of typed entries, one row per financial fact, built by reading (never rewriting) the existing Phase 1-4 snapshot — plus a **settlement layer** on top that groups ledger entries into periodic payouts per actor, with its own PENDING→READY→PROCESSING→PAID lifecycle, entirely separate from delivery status.

The single most important architectural principle carried through this entire document: **PRICING, ECONOMICS, and SETTLEMENT are three different layers, and Phase 5 must never let them collapse into one.** Pricing (Phases 1-4) answers "what should this cost." Economics (also Phases 1-4, extended by the ledger) answers "who funds it and who is entitled to what." Settlement (new in Phase 5) answers "has it actually been paid, and to whom, and when." A `driverPayoutCents` of 800 has always meant "the driver is entitled to 8 DT for this delivery" — it must never be read as "the driver has been paid 8 DT," and no part of this proposal treats it that way.

---

## 2. Current Financial Flow — Verified From Code

### 2.1 What is currently calculated
Every delivery's `computeDeliveryFee` call (frozen at driver assignment via `feeFinalizedAt`) produces: the customer fee (`deliveryFee`), its Coffee-Owner/Supplier split (`cafeOwnerFeeShareCents`/`supplierFeeShareCents`), the supplier subsidy amount folded into that split (`supplierSubsidyCents`), an always-explicit-zero BigBoss subsidy (`bigBossSubsidyCents`), and — via the separate `computeDeliveryPayout` call — the driver's and (in `DELIVERY_COMPANY` mode) the company's entitlement (`driverPayoutCents`/`companyPayoutCents`, including any weather/peak incentive). A `DeliveryBudgetEngine` comparison (`budgetResultUsed`/`budgetDeficitCentsUsed`) is also computed and frozen at the same moment. Waiting compensation (`waitingCustomerFeeCentsUsed`/`waitingDriverCompensationCentsUsed`/`waitingMinutesBilled`) is calculated once, separately, at the `PICKED_UP` transition.

### 2.2 What is currently stored
All of the above — as columns on the single `deliveries` row for that sub-order. Nothing is stored anywhere else: no separate financial-event table, no per-actor row, no audit log of *when* a value was computed or *why* it changed between the provisional estimate and the frozen final figure (only the two values themselves are visible, not a change history).

### 2.3 What is only derived (never stored)
`payoutStatus` (`PENDING`/`EARNED`/`VOID`, computed from current delivery status) and `totalDriverPayoutCents` (`driverPayoutCents` + waiting compensation) are both computed fresh on every read, in `storage.toDeliveryWithDetails` — never persisted. This is the *only* place today where "is this money actually owed yet" is even approximated, and it approximates it purely from delivery status, not from any payment fact.

### 2.4 What is frozen
Every field written at `feeFinalizedAt` (assignment time) — the full Phase 1-4 pricing/payout/subsidy/budget snapshot — is never touched again by any later code path. `updateDeliveryStatus` (including cancellation) never rewrites these fields; only the three waiting fields are written later, exactly once, at `PICKED_UP`, and never again after that.

### 2.5 What is NOT yet represented financially
- **No obligation/debt concept.** There is no row anywhere that says "BigBoss owes driver X, 8 DT, for delivery Y, due by date Z."
- **No payment record.** There is no row anywhere that says "this 8 DT was actually transferred on this date, via this method, with this reference."
- **No running balance.** A driver's or company's or supplier's total outstanding amount across many deliveries is not computable from any single query today — it would require summing `driverPayoutCents` across `deliveries` rows filtered by `payoutStatus='EARNED'`, which is a *reconstruction*, not a stored fact, and it has no notion of "already settled" to exclude.
- **No refund/reversal concept tied to delivery economics.** Order-level payment/refund handling (if any exists elsewhere in the codebase for the order's own `totalAmount`) is out of this document's scope and was not found wired to any delivery-specific financial field.
- **No audit trail of Admin configuration changes** (who changed `driverPayoutSharePercent` from 100 to 90, and when) — only the *current* value of `deliveryPricingSettings` exists; its history is not tracked.
- **No idempotency guard specific to financial side-effects** beyond the database-level compare-and-swap that already protects `deliveries` row mutations from double-processing the SAME status transition (e.g., `updateDeliveryStatus`'s `.where(eq(deliveries.status, current.status))` guard) — this protects against re-entrancy of the *status change itself*, but there is no separate concept of "has a financial ledger entry already been written for this event," because no ledger exists to check against.

### 2.6 What can currently be considered "owed" vs. "paid"
**Owed (approximately)**: `driverPayoutCents` on a delivery whose `payoutStatus` (derived) is `EARNED` (i.e., `status='DELIVERED'`) — but this is an inference from status, not a recorded fact, and it has no corresponding "has this been paid" flag. **Paid**: literally nothing in this codebase currently represents "paid." This is the single largest gap Phase 5 exists to close, and this document does not overstate the current system's capability here — no calculated amount, however confidently displayed in the Admin UI, should be read as evidence that money has moved.

---

## 3. Financial Actors — Responsibilities (Existing vs. Proposed, No Invented Percentages)

| Actor | Already computed today | Proposed to add in Phase 5 |
|---|---|---|
| **Coffee Owner** | `cafeOwnerFeeShareCents` (delivery contribution, frozen); order payment is a separate, pre-existing concern outside delivery economics | Refund entries when a delivery-side event (cancellation) warrants returning their contribution — see §16 |
| **Supplier** | `supplierFeeShareCents` (includes any subsidy), `supplierSubsidyCents` (explicit) | A settlement record if BigBoss ever collects/disburses on the Supplier's behalf (depends on the still-undefined real-world payment flow — see §34) |
| **Supplier Driver** | `driverPayoutCents` (base % + weather/peak incentive), `waitingDriverCompensationCentsUsed` | Bonus entries (§9), cancellation compensation (§8), a minimum-guarantee top-up entry (§7) — all as *ledger line items*, not new columns on `deliveries` |
| **Delivery Company** | `companyPayoutCents` (today: `fee − base driver share`, i.e. "whatever's left," not a real commission) | A real, contract-driven commission structure (§6), its own settlement record |
| **Delivery Company Driver** | Same fields as Supplier Driver (the codebase does not distinguish driver *type* financially — `driverPayoutCents` means the same thing in both modes) | Same as Supplier Driver |
| **BigBoss** | `bigBossSubsidyCents` (always 0 today — field exists, no campaign engine funds it), `budgetResultUsed`/`budgetDeficitCentsUsed` (analytical) | Platform commission (does not exist today — currently 0 by design), promotion/subsidy budget tracking (§10), payment-processing cost tracking (if BigBoss ever touches real payment rails — genuinely unknown today), operational cost tracking, a real margin ledger (§20) |

No percentages, commission rates, or subsidy amounts are proposed anywhere in this table — every one of them is an explicit **BUSINESS DECISION REQUIRED** per §34.

---

## 4-5. Commercial Models — Supplier-Owned Delivery vs. Delivery Company

### A. Supplier-owned delivery
```
Coffee Owner contribution (cafeOwnerFeeShareCents)
    +
Supplier contribution (supplierFeeShareCents, already includes supplierSubsidyCents)
    =
Delivery funding
    →
Supplier driver payout (driverPayoutCents) — an INTERNAL transfer within the Supplier's own
    business, since the driver is the Supplier's own staff/contractor (confirmed: companyPayoutCents
    is always 0 in this mode, because there is no company in the relationship — verified in Phase 3).
```
**How BigBoss should represent its economics even though it never directly pays this driver**: as a **pass-through ledger pair** — `SUPPLIER_CONTRIBUTION` (money BigBoss is due to remit to/credit the Supplier) is recorded distinctly from `DRIVER_PAYOUT` (a figure BigBoss *computes and displays* for transparency, but does not itself settle, since the Supplier compensates its own driver through its own means). This preserves BigBoss's honest role in this mode: **funder-of-record, not payer-of-record** for the driver leg.

### B. Delivery Company
```
Customer delivery funding (cafeOwnerFeeShareCents + supplierFeeShareCents)
    →
Delivery Company (a real economic actor BigBoss transacts with)
    →
Driver payout (driverPayoutCents) — the company's own driver, company's own responsibility to pay
    →
Company retained amount (companyPayoutCents, today = fee − base driver share; §6 proposes a
    real contract-driven commission instead)
```
BigBoss should record, per delivery, **four distinct ledger amounts**: `delivery company gross amount` (= `driverPayoutCents + companyPayoutCents`, i.e. the full amount owed to the company relationship), `driver payout` (informational — what the company owes its own driver, useful for BigBoss's own visibility into fair-labor practices but not something BigBoss itself disburses), `company retained amount` (`companyPayoutCents` — what BigBoss actually owes the company entity), and `BigBoss amount` (whatever, if anything, BigBoss retains — 0 today, since the full fee currently flows to driver+company with no platform cut). No arbitrary percentage is assumed for any of these; every one is either already computed by the existing engine or explicitly deferred to §6/§34.

---

## 6. Delivery Company Contract Model

```
DeliveryCompanyContract (proposed, not implemented):
  deliveryCompanyId
  contractType            — e.g. 'PERCENTAGE' | 'FIXED_FEE' | 'PER_KM' | 'NEGOTIATED'
  driverPayoutModel        — reference to how the company's own driver payout is computed
                              (today: same global driverPayoutSharePercent everyone shares;
                              proposed: per-contract override)
  companyCommissionPercent — nullable; if set, OVERRIDES the global driverPayoutSharePercent's
                              complement for this company specifically
  minimumPayoutCents        — nullable; per-contract driver minimum guarantee override (§7)
  waitingCompensationOverride — nullable; per-contract waiting rate override (Phase 4's rates
                              are currently global-only)
  weatherIncentiveOverride    — nullable; per-contract weather incentive override
  peakIncentiveOverride       — nullable; per-contract peak incentive override
  cancellationCompensationOverride — nullable; per-contract cancellation rules (§8)
  effectiveDate / expiryDate  — contracts must be time-scoped; a delivery always resolves the
                              contract version that was ACTIVE at the moment of assignment,
                              never the current one, for historical accuracy (see §14)
  isActive
```
**Where do these values belong?** `deliveryCompanyId`-scoped, Admin-authored (Admin negotiates and enters the real-world contract terms — a Delivery Company should not be able to self-declare its own commission rate, which would be a trust boundary violation), but visible in read-only form to the Delivery Company itself (a company should be able to see the terms it's being paid under — matches the existing role-visibility discipline from Phase 3/4). Drivers never see contract terms directly — only their own resulting payout figures, exactly as today.

**Supporting future contract changes without touching historical deliveries**: the ledger entries a delivery generates must snapshot the *resolved values* at assignment time (already the exact discipline Phase 1-4 uses for pricing — this is a direct extension, not a new pattern), and the contract table itself should be **append-only-by-version** (a new contract row with a new `effectiveDate` rather than an in-place update to an existing row) so "what contract applied to delivery #4821 on 2026-03-01" remains answerable forever, even after the company renegotiates in 2026-06.

---

## 7. Driver Minimum Guarantee

**Mechanism** (formula only — no real minimum proposed):
```
finalDriverPayoutCents = max(computedDriverPayoutCents, minimumGuaranteeCents[vehicleType][deliveryCompanyId?])
guaranteeTopUpCents    = finalDriverPayoutCents − computedDriverPayoutCents   (0 if the computed
                          amount already met or exceeded the guarantee)
```
- **Where Admin configures it**: the same `deliveryPricingSettings`-style global table, extended per-vehicle-type (matching the existing `vehiclePricing` jsonb pattern exactly — see Phase 2's capacity fields for precedent), with an optional per-Delivery-Company override via the contract model in §6.
- **Differs by vehicle?** Yes — a Camion driver's viable minimum trip compensation is not the same as a Vélo's; reuse the existing per-vehicle-type table shape.
- **Differs by Delivery Company?** Optionally, via the contract override — a company with a more generous driver-welfare policy could set its own higher floor.
- **Are weather/peak incentives included in the comparison?** No — the guarantee should compare against the BASE computed payout only (before incentives), and incentives should always be added on top of whichever of the two (computed or guaranteed) wins. This keeps "is the base job worth doing" and "extra compensation for extra difficulty" as two separate, non-conflated questions, consistent with Phase 4's explicit design principle that incentives must never be diluted by unrelated math.
- **Who funds the difference?** This is a genuine, unresolved business question — options are: (a) BigBoss absorbs it as a subsidy (a `BIGBOSS_GUARANTEE_TOPUP` ledger entry, negative BigBoss margin, explicit and budget-tracked like any other subsidy), (b) the Supplier/Delivery Company absorbs it as a cost of doing business with BigBoss, or (c) a blended rule. **No default is proposed here** — see §34.
- **How does BigBoss record the additional cost?** A dedicated ledger entry type, `DRIVER_GUARANTEE_TOPUP`, separate from `DRIVER_PAYOUT` — so "how much of what drivers earn is baseline-computed vs. guarantee-subsidized" remains a reportable, auditable split, never blended into one opaque number.
- **How is the amount frozen historically?** Exactly like every other Phase 1-4 field — computed once, at assignment, written to the ledger, never recalculated even if Admin changes the guarantee table the next day.

---

## 8. Cancellation Compensation

**Proposed stage model** (extending, not replacing, the existing `deliveryStatusEnum` — these are *sub-states* only meaningful for compensation calculation, not new persisted delivery statuses, since the task explicitly says elsewhere not to change existing statuses):

| Stage (derived from existing timestamps) | Compensation logic (structure only, no amounts) |
|---|---|
| `NOT_STARTED` (cancelled while `PENDING`/`AVAILABLE`, no driver assigned) | No driver compensation — nothing was committed |
| `ASSIGNED` (driver assigned, `assignedAt` set, not yet moving) | Possibly a small commitment fee — **undefined amount** |
| `ARRIVED_AT_PICKUP` (Phase 4's `arrivedAtPickupAt` is set — real, verifiable evidence of driver effort) | Higher justified compensation — the driver's time is already independently timestamped, so this stage has an objective basis unlike the others |
| `PICKED_UP` / `OUT_FOR_DELIVERY` (`pickedUpAt`/`inTransitAt` set) | Should generally NOT be a "cancellation" in the ordinary sense — closer to a delivery failure/return scenario, out of this proposal's scope (matches the existing codebase's own design: `CANCELLED` is not a valid transition from `PICKED_UP`/`IN_TRANSIT` in `DELIVERY_TRANSITIONS` today) |

**Compensation calculation, without inventing values**: `cancellationCompensationCents = f(stage, vehicleType, deliveryCompanyId?)` — an Admin-configured table keyed by stage (mirroring the vehicle-type table pattern again), with `arrivedAtPickupAt`'s presence as the trigger for the highest tier, since it's the one stage Phase 4 already gives BigBoss verifiable, timestamped proof of real driver effort.

**Who funds it?** Attribution-based, matching the existing Phase 4 waiting-compensation philosophy (§23 of the Phase 4 spec: "who caused the delay"): a Supplier-initiated cancellation after the driver has already committed effort should be charged to the Supplier; a Coffee-Owner-initiated cancellation (via the order-level cancel flow) should be charged to the Coffee Owner; a platform-side cancellation (e.g., BigBoss forcibly cancelling due to a safety SUSPEND) should never be charged to any party and should be absorbed by BigBoss if compensation is owed at all.

---

## 9. Driver Bonus Architecture (Design Only)

```
DriverBonusEntry (conceptual — a ledger entry TYPE, not a new persisted concept beyond the
ledger itself, see §12):
  driverId, deliveryId?           — nullable deliveryId, since some bonuses (e.g. a monthly
                                     completion-count bonus) aren't tied to one specific delivery
  bonusType                       — 'WEATHER' | 'PEAK' | 'DELIVERY_COUNT' | 'CAMPAIGN' | 'PERFORMANCE'
  amountCents
  reason / campaignReference
  awardedAt
```
**Weather/peak bonuses**: already exist today as `weatherIncentiveCentsUsed`/`peakIncentiveCentsUsed`, folded directly into `driverPayoutCents` — Phase 5's ledger would simply surface these as their own typed entries (`DRIVER_INCENTIVE`) rather than inventing a new mechanism.
**Delivery-count / campaign / performance bonuses**: genuinely new, not delivery-triggered in the same way — these need a bonus-award *event* (not a pricing computation) that the ledger can still represent uniformly (a `DRIVER_BONUS` entry type with a nullable `deliveryId`, since these can span multiple deliveries or none at all). **No amounts, thresholds, or trigger rules are proposed** — this section defines only the shape needed so a future bonus program doesn't require a ledger redesign.

---

## 10. BigBoss Subsidy — Full Mechanism

| Lifecycle stage | Proposed mechanism |
|---|---|
| **Authorized** | An Admin-created `bigBossSubsidyCampaign` record (name, scope, budget cap, date range, eligibility rules) — this is the "authorization," distinct from any individual delivery's use of it |
| **Calculated** | At delivery pricing time (already the correct point — Phase 4's pipeline already has the slot; `bigBossSubsidyCents` just needs a real campaign to read from instead of being hardcoded 0) |
| **Frozen** | Exactly like every other Phase 1-4 field, at assignment — the delivery's `bigBossSubsidyCents` never changes after that, even if the campaign's budget later runs out or its rules change |
| **Tracked** | The campaign's own `spentCents` running total, incremented by a ledger entry (`BIGBOSS_SUBSIDY`) per delivery that used it — never by re-summing `deliveries.bigBossSubsidyCents` ad hoc, since that would double-count if a delivery is later refunded (see §15) |
| **Budgeted** | `spentCents` vs. `budgetCapCents` on the campaign — once exhausted, `bigBossSubsidyCents` resolves to 0 for further deliveries, exactly the same "neutral once exhausted" principle Phase 4 already uses for every dynamic factor |
| **Settled** | The subsidy is BigBoss's own cost — no external settlement needed (BigBoss doesn't "pay itself"), but it should still appear in BigBoss's own margin ledger as a cost line (§20) |
| **Reported** | Per-campaign spend/remaining-budget, per-supplier/per-café subsidy usage, both derivable from the ledger's `BIGBOSS_SUBSIDY` entries filtered by campaign reference |

**Supported campaign scopes** (structure only): promotion-wide, supplier-specific, Coffee-Owner-specific, global, each with `maxSubsidyPerDeliveryCents` (a per-delivery cap, independent of the overall campaign budget cap — prevents one large order from draining an entire campaign) and `startDate`/`endDate`. **This proposal does not build the campaign engine** — it only ensures the ledger/snapshot architecture has somewhere honest to record a subsidy once one exists, matching the task's explicit instruction.

---

## 11. Delivery Budget Engine → Financial Accounting Evolution

Today's `DeliveryBudgetEngine` (Phase 4) is a **pricing-time** analytical check: does the funded amount (customer + supplier + BigBoss-subsidy contributions) cover the computed cost (driver + company payout)? It runs once, at assignment, and never again.

**Proposed evolution** — the SAME comparison, but re-askable at any later point using the ledger instead of only the frozen snapshot:
```
Pricing layer:    "What SHOULD this delivery cost?" — computeDeliveryFee (unchanged)
Economics layer:  "Who funds it, who earns it?" — cafeOwnerFeeShareCents/supplierFeeShareCents/
                   bigBossSubsidyCents vs. driverPayoutCents/companyPayoutCents (unchanged)
Budget layer:     "Does funding cover cost, RIGHT NOW, accounting for any refunds/adjustments
                   since?" — a ledger-driven re-evaluation, not just the frozen snapshot
Settlement layer: "Has this actually been paid?" — entirely new (§18)
```
The Budget Engine's role expands from "one-time check at assignment" to "the query that answers 'is this delivery's ledger balanced' at any point in its lifecycle" — surplus/deficit, BigBoss's exposure per delivery, and (aggregated) BigBoss's total exposure across all open deliveries. This still never blocks anything by default (Phase 4's own explicit rule), but it becomes genuinely useful for financial reporting rather than a point-in-time curiosity.

---

## 12. Ledger Architecture

This is the core proposal. A new, **append-only** table:

### `deliveryFinancialLedger` (proposed — not created)

| Field | Purpose |
|---|---|
| `id` | Primary key |
| `entryType` | One of the types below |
| `amountCents` | Always a positive integer; `direction` (below) determines sign/meaning — never a signed amount, to avoid sign-convention bugs |
| `currency` | Always `"TND"` today (no multi-currency need found anywhere in the codebase) — included for completeness/future-proofing, not because multi-currency is planned |
| `direction` | `'CREDIT'` (money owed TO the actor) or `'DEBIT'` (money owed BY / paid BY the actor) — a standard double-entry-adjacent convention without requiring full double-entry bookkeeping complexity |
| `actorType` / `actorId` | Who this entry concerns — `'CAFE_OWNER'`/`'SUPPLIER'`/`'DRIVER'`/`'DELIVERY_COMPANY'`/`'BIGBOSS'` + the user id (or a sentinel for BIGBOSS) |
| `counterpartyType` / `counterpartyId` | Who's on the other side of this specific entry, where meaningful (nullable — some entries, like `BIGBOSS_SUBSIDY`, don't have a natural counterparty) |
| `deliveryId` | Always set except for non-delivery-scoped entries (e.g. a monthly performance bonus) — nullable for that reason only |
| `orderId` / `subOrderId` | Denormalized from the delivery, matching the project's existing denormalization convention (e.g. `deliveries.supplierId`/`cafeId` are already denormalized from the order) — avoids a join for every financial report query |
| `status` | `CALCULATED` → `AUTHORIZED` → `OWED` → `PAID` / `REFUNDED` / `VOID` / `DISPUTED` (see §13) |
| `createdAt` | When the entry was written (audit fact) |
| `effectiveAt` | When the entry's amount was actually determined (may differ from `createdAt` — e.g. a `DRIVER_GUARANTEE_TOPUP` computed retroactively should carry the ORIGINAL delivery's effective date for reporting-period purposes, not the adjustment's own creation date) |
| `reference` | A human/system-readable link back to the source computation (e.g. `"assignDriver:deliveryId=4821"` or `"campaign:CAMP-2026-03"`) — never a recomputation trigger, purely traceability |
| `idempotencyKey` | See §25 — unique, prevents the same real-world event from ever producing two entries |
| `reversedByEntryId` | Nullable self-reference — if this entry was later reversed (refund/void), points to the reversing entry, never mutated in place (see §14/§15) |

**Proposed entry types** (as given in the task, confirmed all are needed given the current system, none extraneous):
`CUSTOMER_DELIVERY_CHARGE`, `SUPPLIER_CONTRIBUTION`, `BIGBOSS_SUBSIDY`, `DRIVER_PAYOUT`, `DELIVERY_COMPANY_PAYOUT`, `DRIVER_INCENTIVE` (weather/peak), `WAITING_COMPENSATION`, `CANCELLATION_COMPENSATION`, `DRIVER_GUARANTEE_TOPUP` (added — see §7, a distinct enough concept from generic incentive to warrant its own type for reporting), `DRIVER_BONUS` (added — see §9), `BIGBOSS_REVENUE`, `BIGBOSS_COST`, `REFUND`, `ADJUSTMENT`.

**Why append-only, never updated in place**: this is the direct database-level expression of §14's immutability requirement — a financial record that could be silently edited is not an audit trail, it's a liability. Every "change" is a new entry (an `ADJUSTMENT` or `REFUND`) that references what it corrects, never an `UPDATE` statement against an existing entry.

---

## 13. Money States

```
CALCULATED  — the pricing/payout engine has computed an amount (this is ALL that exists today
              for driverPayoutCents/cafeOwnerFeeShareCents/etc. — a calculation, not a commitment)
AUTHORIZED  — an Admin/system decision has confirmed this amount is real and should be acted on
              (e.g., the delivery reached DELIVERED, so the driver payout is confirmed, not just
              computed) — roughly where today's derived payoutStatus='EARNED' sits, but as a
              real, persisted ledger status rather than an inferred one
OWED        — AUTHORIZED and now part of an actor's outstanding balance, awaiting settlement
PAID        — a settlement run (§18) has actually disbursed this amount (or recorded that it was
              disbursed through an external process) — this is the ONLY state that should ever be
              read as "money moved"
REFUNDED    — a PAID or OWED entry was reversed via a new REFUND entry (§15) — the original
              entry's status becomes REFUNDED, but its amount/fields are NEVER edited
VOID        — an entry that should never have counted at all (e.g., a cancelled-before-any-real-
              effort delivery) — distinct from REFUNDED (which implies money genuinely changed
              hands and is being reversed) vs. VOID (which implies it never should have been owed)
DISPUTED    — a party contests an entry; frozen from further automatic processing until an Admin
              resolves it via an ADJUSTMENT entry
```
**The critical discipline this section exists to state explicitly**: `driverPayoutCents` on a `deliveries` row is, and will remain even after Phase 5, a `CALCULATED` amount at the moment it's written. It only becomes `AUTHORIZED`/`OWED`/`PAID` through the NEW ledger's own state progression — nothing about Phase 5 should retroactively reinterpret the existing frozen columns as having always meant more than they did.

---

## 14. Immutability

| Event | How Phase 5 should handle it (never an overwrite) |
|---|---|
| Pricing config change (Admin edits `deliveryPricingSettings`) | Already correctly ignored by every existing frozen delivery (Phase 1-4's entire discipline) — the ledger inherits this for free by only ever reading the frozen snapshot, never live config, when generating entries |
| Contract change (§6) | New contract row with a new `effectiveDate`; a delivery's ledger entries reference the contract version resolved AT ASSIGNMENT TIME (stored as a snapshot reference, not a live foreign key lookup) |
| Driver payout change (Admin manually corrects an error) | A new `ADJUSTMENT` entry (§26) — the original `DRIVER_PAYOUT` entry is never edited, only referenced |
| Subsidy change | Same pattern — campaign budget changes don't retroactively alter already-written `BIGBOSS_SUBSIDY` entries |
| Refund | A new `REFUND` entry reversing a specific prior entry (§15) |
| Cancellation | The delivery's existing frozen snapshot is untouched (already true today — verified: `CANCELLED` never rewrites `deliveryFee`/`driverPayoutCents`); the ledger adds new entries (e.g. `CANCELLATION_COMPENSATION`, possibly a `REFUND` of the `CUSTOMER_DELIVERY_CHARGE`) rather than erasing what was already calculated |
| Manual adjustment | Always a new `ADJUSTMENT` entry, `reference`-linked to what it corrects (§26) |

---

## 15. Refunds

| Event | Ledger representation |
|---|---|
| Full cancellation before any driver effort | `REFUND` entry reversing `CUSTOMER_DELIVERY_CHARGE` (full amount) and `SUPPLIER_CONTRIBUTION` (full amount, if any was charged); the original `CUSTOMER_DELIVERY_CHARGE`/`SUPPLIER_CONTRIBUTION` entries move to `REFUNDED` status; no driver/company entries were ever created (nothing to reverse) |
| Partial cancellation (e.g., an order-level partial-item cancellation reduces the sub-order's value, which could reduce a fee that was proportional to subtotal — narrow edge case) | A partial `REFUND` entry for the delta only, `reference`-linked to the original charge |
| Delivery fee refund specifically (as opposed to product refund) | Same `REFUND` entry type, scoped to just the `CUSTOMER_DELIVERY_CHARGE` entry |
| Supplier refund (BigBoss returns a supplier's contribution, e.g. because the cancellation wasn't the supplier's fault) | `REFUND` entry against `SUPPLIER_CONTRIBUTION` |
| BigBoss subsidy reversal | `REFUND` entry against `BIGBOSS_SUBSIDY`, which should also decrement the originating campaign's `spentCents` (the one case where a ledger entry's reversal has a side effect on another record — the campaign budget — and this should be the ONLY such side effect anywhere in the design, kept deliberately narrow) |
| Driver compensation (despite the cancellation, driver still gets cancellation compensation per §8) | NOT a refund — a fresh `CANCELLATION_COMPENSATION` entry, entirely separate from whatever `REFUND` entries the cancellation also generates on the customer/supplier side |

**Not implemented in this phase** — this section is a design for how the ledger WOULD represent these events, per the task's explicit instruction; no refund processing logic is proposed as buildable yet without the ledger foundation (§36) existing first.

---

## 16. Multi-Supplier Orders — Financial Independence

Already structurally guaranteed today (one `deliveries` row per sub-order, fully independent pricing/payout — verified across all four phases' live tests, e.g. order #146). The ledger extends this same guarantee one layer down:

```
Order #146
 ├── SubOrder A (Supplier A) ── Delivery A ── Ledger entries WHERE deliveryId = Delivery A's id
 │                                              (CUSTOMER_DELIVERY_CHARGE_A, SUPPLIER_CONTRIBUTION_A,
 │                                               DRIVER_PAYOUT_A, ...)
 └── SubOrder B (Supplier B) ── Delivery B ── Ledger entries WHERE deliveryId = Delivery B's id
                                                (CUSTOMER_DELIVERY_CHARGE_B, SUPPLIER_CONTRIBUTION_B,
                                                 DRIVER_PAYOUT_B, ...)
```
Every ledger entry carries its own `deliveryId` (never a bare `orderId`-only entry for anything delivery-specific — `orderId`/`subOrderId` are denormalized onto each entry purely for query convenience, never as the entry's primary scope). A settlement run (§18) that aggregates a Supplier's total owed amount across many orders naturally sums correctly across sub-orders without any special-casing, because each ledger entry is already correctly scoped to exactly one delivery.

---

## 17. Self Pickup — Financial Non-Existence

Unchanged and permanent: Self Pickup creates **zero** `deliveries` rows (verified structurally across every phase's regression tests) — therefore it can create **zero** ledger entries, since every proposed entry type above requires a `deliveryId`. No `CUSTOMER_DELIVERY_CHARGE`, no `DRIVER_PAYOUT`, no `DELIVERY_COMPANY_PAYOUT`, no subsidy of any kind. This falls out of the existing architecture automatically — the ledger doesn't need a special "skip Self Pickup" rule, because Self Pickup was already designed (Phase 1-4) to never enter the pricing pipeline at all.

---

## 18. Settlement Model

```
DeliverySettlement (proposed — not implemented):
  id
  actorType / actorId          — who this settlement pays (SUPPLIER / DRIVER / DELIVERY_COMPANY)
  periodStart / periodEnd       — the settlement period this run covers
  status                        — PENDING → READY → PROCESSING → PAID / FAILED / DISPUTED
  grossAmountCents               — sum of all OWED CREDIT ledger entries for this actor/period
  deductionsCents                 — e.g. platform fees, if BigBoss ever takes one (0 today)
  adjustmentsCents                 — sum of any ADJUSTMENT entries applied within the period
  netAmountCents                    — gross − deductions ± adjustments
  paidAmountCents                    — what was actually disbursed (may differ from netAmountCents
                                       if a partial/failed payment occurred — tracked honestly,
                                       never silently reconciled to match)
  remainingAmountCents                — netAmountCents − paidAmountCents
  createdAt / processedAt / paidAt
  paymentReference                     — an external reference (bank transfer id, etc.) — NOT a
                                         payment provider integration; this field simply records
                                         whatever reference a manual or future-automated process
                                         provides
```
**Settlement period**: proposed as Admin-configurable (weekly/bi-weekly/monthly), not hard-coded — matches every other Phase 4 configuration convention. **No payment provider is assumed** — `PROCESSING`→`PAID` could be triggered by a manual Admin action recording a bank transfer today, or by a real payment-provider webhook later, without the settlement model itself needing to change; the model is deliberately payment-rail-agnostic.

A settlement, once created, **reads** a batch of `OWED` ledger entries, marks them `PAID` upon success (or leaves them `OWED` and the settlement `FAILED` on failure — never a partial silent success), and itself becomes an immutable record of "this is what we told the actor we'd pay them, and this is what we told them we did pay." If a later dispute arises, it's resolved via a new `ADJUSTMENT` ledger entry feeding into the NEXT settlement period, never by editing a past `DeliverySettlement` row.

---

## 19. Account Balances — Ledger vs. Materialized Balance

| Approach | Auditability | Correctness | Scalability | Multi-supplier | Refunds/cancellations | Disputes | Future payment integration |
|---|---|---|---|---|---|---|---|
| **Pure ledger** (sum entries on demand) | Highest — every number is reconstructable from first principles, always | Highest — no risk of a cached balance drifting from reality | Good until volume is very large, then aggregate queries need indexing/materialized views anyway | Trivial — already scoped per-delivery | Trivial — a new entry, sum still correct | Trivial — dispute freezes specific entries, sum still correct for everything else | Agnostic — a balance is just a query result, not a stored commitment |
| **Maintained running balance** (a `balances` table updated on every event) | Lower — a bug in the update logic silently corrupts the "source of truth" balance while the ledger (if kept alongside) would show the truth | Requires careful transactional discipline (every ledger write must atomically update the balance) — a real source of subtle bugs | Better raw read performance for "what's my balance right now" | Same as above, no special handling needed | Requires the SAME careful update-on-every-reversal discipline, doubling the risk surface | Same risk — a disputed entry must be excluded from the balance calculation, another place logic can drift | Same agnosticism, but now there's a second thing to keep in sync |

**Recommendation**: **pure ledger as the source of truth**, with an optional **read-only materialized balance view** (a database view or a periodically-refreshed summary table, never hand-maintained via application-level increment/decrement logic) purely for dashboard read performance once real volume justifies it. This is the standard, low-risk pattern for exactly this kind of multi-actor financial system, and it matches this codebase's own existing philosophy: Phase 1-4 never introduced a "cached" pricing value anywhere — every figure is either computed fresh or frozen once, explicitly, never incrementally maintained. A hand-maintained balance table would be the first departure from that discipline in this whole delivery system, and this proposal recommends against it as the primary mechanism.

---

## 20. BigBoss Margin Model

```
grossDeliveryRevenue     = Σ (CUSTOMER_DELIVERY_CHARGE + SUPPLIER_CONTRIBUTION entries)  [does NOT
                            include BIGBOSS_SUBSIDY — that's BigBoss's own money, not revenue]
platformCost              = Σ (DRIVER_PAYOUT + DELIVERY_COMPANY_PAYOUT + DRIVER_INCENTIVE +
                            WAITING_COMPENSATION + CANCELLATION_COMPENSATION + DRIVER_GUARANTEE_TOPUP
                            + DRIVER_BONUS entries)
subsidyCost                = Σ (BIGBOSS_SUBSIDY entries)
otherOperationalCost        = Σ (BIGBOSS_COST entries — e.g. payment-processing fees, IF BigBoss
                            ever incurs any; 0/nonexistent today, never invented here)
BigBoss delivery margin      = grossDeliveryRevenue − platformCost − subsidyCost − otherOperationalCost
```
This is a **direct extension** of §18 of `docs/bigboss-delivery-financial-business-model.md` (already proposed there conceptually) — Phase 5's contribution is making it a real, queryable SUM over actual ledger rows instead of a conceptual formula over live/frozen snapshot fields that would need to be re-derived per-delivery with no aggregate source. **No cost is invented**: `otherOperationalCost` is explicitly allowed to be, and likely should remain, 0/empty until BigBoss identifies a real operational cost it wants tracked (e.g., if it ever integrates a paid SMS/notification service specifically for delivery, or incurs real payment-processing fees).

---

## 21. Financial Snapshots — Are Phase 1-4's Sufficient?

**Mostly yes, for PRICING and ECONOMICS.** The existing frozen fields (pricing inputs: `pricePerKmCentsUsed`/`minFeeCentsUsed`/multipliers; pricing result: `deliveryFee`/`baseFeeCents`/`adjustedFeeCents`; funding: `cafeOwnerFeeShareCents`/`supplierFeeShareCents`/`supplierSubsidyCents`/`bigBossSubsidyCents`; payout: `driverPayoutCents`/`companyPayoutCents`/incentive fields; budget: `budgetResultUsed`/`budgetDeficitCentsUsed`) already cover everything Phases 1-4 were asked to freeze, and this document finds no gap in that layer worth adding to — duplicating any of it into the ledger's own columns would violate "avoid unnecessary duplication," so ledger entries should **reference** a `deliveryId` and read these existing fields when needed for a report, rather than copying their VALUES into the ledger row itself (the one exception: `amountCents` on each entry necessarily duplicates a piece of that snapshot, because a ledger entry must be self-contained/immutable even if the source delivery's data model somehow changed later — this is the one deliberate, justified duplication in this whole design).

**Genuinely missing, and proposed as NEW**: contract-version reference (§6, once contracts exist), settlement-batch reference (once an entry is paid, which settlement paid it), and the ledger's own state (§13) — none of which exist in any form today, because SETTLEMENT as a concept does not exist today.

---

## 22. Audit Trail

Every financial CONFIGURATION change (not delivery-specific event — those are covered by the ledger itself) should be tracked in a proposed `adminAuditLog` (or reuse an existing audit mechanism if the codebase has one elsewhere — not found scoped to delivery pricing during this review, so proposed as new, minimal, and reusable beyond delivery if one doesn't exist project-wide):
```
adminAuditLog (proposed):
  id, actorUserId, action, entityType, entityId, previousValue (jsonb), newValue (jsonb), createdAt
```
Applies to: `deliveryPricingSettings` changes (vehicle rates, driver payout share, weather/peak/zone/waiting config — all of Phase 4's Admin surface), `DeliveryCompanyContract` changes (§6), subsidy campaign changes (§10), and any manual `ADJUSTMENT`/settlement-approval action (§18/§26). This is a genuinely new capability — nothing in Phases 1-4 tracks *who* changed a pricing config or *when*, only the current value.

---

## 23. Role Visibility (Extends Phase 4's Existing Redaction)

| Role | Sees (ledger/settlement layer) |
|---|---|
| Coffee Owner | Own `CUSTOMER_DELIVERY_CHARGE` and any `REFUND` entries against it — never driver/company/BigBoss entries |
| Supplier | Own `SUPPLIER_CONTRIBUTION`, `SUPPLIER_SUBSIDY`-related entries, and (per Phase 3/4's existing rule) `DRIVER_PAYOUT` only for its OWN `SUPPLIER`-mode deliveries — never for an external Delivery Company's driver; own settlement records |
| Driver | Own `DRIVER_PAYOUT`, `DRIVER_INCENTIVE`, `WAITING_COMPENSATION`, `DRIVER_BONUS`, `DRIVER_GUARANTEE_TOPUP`, `CANCELLATION_COMPENSATION` entries; own settlement status |
| Delivery Company | Own `DELIVERY_COMPANY_PAYOUT`, its drivers' `DRIVER_PAYOUT` (already the Phase 3 rule), own settlement records |
| Admin | Everything, including `BIGBOSS_REVENUE`/`BIGBOSS_COST`/`BIGBOSS_SUBSIDY`/margin — never shown to any non-Admin role, exactly matching Phase 4's existing `bigBossSubsidyCents`/`budgetResultUsed` redaction (both hard-coded to `null` for every role except Admin in `storage.redactDeliveryCodes` today) |

This table is a direct, mechanical extension of the existing `redactDeliveryCodes` role matrix — no new visibility PRINCIPLE is introduced, only new fields following the same already-established rules.

---

## 24. Accounting Precision — Rounding & Allocation

All amounts remain integer cents — no floating point anywhere, continuing the exact discipline already used in every Phase 1-4 calculation (`Math.round` at every division point, verified in `runDeliveryPricingPipeline`/`computeDeliveryPayout`/`computeDeliveryBudget`).

**Allocation rule (the "333/333/334" pattern the task itself illustrates)**: whenever a total must be split across N parties in defined proportions, compute N−1 shares by rounding, and let the LAST share be `total − Σ(the other N−1)` — never round every share independently, which risks a 1-cent reconciliation gap. This is **already exactly how the existing split works**: `supplierFeeShareCents = remainingAfterSubsidies − cafeOwnerFeeShareCents + supplierSubsidyCents` (the Supplier's share is always "whatever's left," never independently rounded) — Phase 5's ledger must preserve this exact pattern for any NEW multi-way split it introduces (e.g., if a settlement ever needs to split a `DELIVERY_COMPANY_PAYOUT` further between the company and a driver-side deduction), and must never introduce a competing rounding approach.

**Minimum-payout rounding** (§7): the guarantee comparison (`max(computed, guarantee)`) requires no special rounding — both sides are already whole cents. **Subsidy rounding**: `supplierSubsidyCents = Math.round(feeCents × pct/100)` (already the Phase 4 formula) — the SAME formula should be reused for `bigBossSubsidyCents` once a real campaign exists, never a second independent formula. **Refund rounding**: a refund amount should always be copied verbatim from the entry it reverses — NEVER recomputed from a percentage at refund time, which could produce a different number than what was originally charged due to a config change in between (a refund must refund what was ACTUALLY charged, not what a NEW calculation says should have been charged).

**Reconciliation invariant** (must hold for every delivery, always, and should be an automated consistency check, not just a design note): `cafeOwnerFeeShareCents + supplierFeeShareCents + bigBossSubsidyCents == driverPayoutCents + companyPayoutCents + budgetSurplusOrDeficit`. This already holds today by construction (verified across every Phase 4 live test) — Phase 5's job is to make this invariant CHECKABLE against the ledger's own sum, not just trusted from the snapshot math.

---

## 25. Idempotency

**Idempotency key design**: `{eventType}:{deliveryId}:{statusTransitionOrTrigger}` — e.g. `"WAITING_COMPENSATION:4821:PICKED_UP"`, `"DRIVER_PAYOUT:4821:ASSIGNED"`, `"CANCELLATION_COMPENSATION:4821:CANCELLED"`. Before writing any ledger entry, the writer checks for an existing entry with the same `idempotencyKey` (a unique DB constraint, not just an application-level check, so a race condition can't slip through) — if found, the write is a no-op (matches exactly how `createDeliveryForSubOrder`'s `onConflictDoNothing()` already protects against duplicate delivery creation, and how `updateDeliveryStatus`'s compare-and-swap `.where(eq(deliveries.status, current.status))` already protects against double-processing a status transition — Phase 5 extends this exact discipline to the financial layer instead of inventing a new one).

**Why `PICKED_UP`/`CANCELLED`/`DELIVERED`/`REFUNDED`/`SETTLED` specifically need this**: each is a status transition that could, in theory, be re-triggered (a retried API call, a webhook redelivery, a concurrent request) — the existing DB-level compare-and-swap already prevents the STATUS from changing twice, but it does NOT by itself prevent a ledger-writing function from being called twice with the same already-determined status if the calling code isn't careful (e.g., a retry after a network timeout where the status update actually succeeded but the response was lost) — hence the belt-and-suspenders unique `idempotencyKey` constraint at the ledger-write level itself, independent of the status-transition guard.

---

## 26. Disputes / Manual Adjustments

```
Original DRIVER_PAYOUT entry:  800 cents, status OWED   (never edited)
Admin ADJUSTMENT entry:        +200 cents, reference="DRIVER_PAYOUT:4821:ASSIGNED",
                                reason="Admin correction — driver reported shorted payout",
                                approvedByUserId, createdAt
Effective driver entitlement:  800 + 200 = 1000 cents    (a SUM over both entries, computed at
                                                           read/settlement time, never a rewrite)
```
An `ADJUSTMENT` entry always references what it corrects (`reference`), always carries an explicit reason and an approving Admin's user id (this is inherently an Admin-only capability — no other role should be able to create one, matching the existing `requireAdmin` pattern already used for `deliveryPricingSettings` and every other financial-configuration route), and is itself immutable once created (a WRONG adjustment is corrected by a SECOND adjustment, never by editing the first — same append-only principle as everything else in this document).

---

## 27. Future Demand Pricing Compatibility

`DemandPricingEngine` is explicitly not built in this phase (per the task). The ledger design already accommodates it without any redesign: a future `demandMultiplierPermilleUsed` value (the column already exists, unused, from Phase 1) would flow into the SAME `CUSTOMER_DELIVERY_CHARGE` computation it already influences conceptually, and any demand-driven driver incentive would simply be one more `DRIVER_INCENTIVE`-typed entry, structurally identical to today's weather/peak incentives. No new ledger entry TYPE is even needed — `DRIVER_INCENTIVE`'s existing shape (amount + reference) already generalizes to "which factor caused this incentive" via its `reference` field.

## 28. Future Driver Offer Compatibility

A future offer (not implemented — matches the task's explicit exclusion) needs to display: estimated customer fee, driver GUARANTEED payout, distance, ETA, weather incentive, waiting policy, vehicle requirement — **all of which are either already computed today** (via `estimateDeliveryFee` and `getAssignableDriversForDelivery`'s payout preview, both built in Phases 3-4) **or directly derivable from the ledger's planned shape** (a "guaranteed payout" preview is just `max(previewComputedPayout, minimumGuaranteeCents)` from §7, computed but not yet written as a ledger entry until real acceptance occurs). Critically: an offer preview must NEVER expose `BIGBOSS_SUBSIDY`, `BIGBOSS_REVENUE`, or any company-commission internals to the driver being offered the job — exactly the existing Phase 3/4 redaction principle, extended to a not-yet-built feature by the same rule, not a new one.

## 29. Future Batching Compatibility

Batching (multiple deliveries, one driver, shared route) is the one area where this proposal flags a **real, structural question** rather than a clean extension: today's model is one `deliveries` row = one driver-leg = one set of ledger entries. A batched trip would need EITHER (a) still one `deliveries` row per sub-order, with a shared `routeId`/`batchId` grouping concept layered on top purely for the ROUTE (not the money) — in which case the ledger needs NO change at all, since each delivery's financial entries remain independently correct even if two deliveries physically share a vehicle trip — or (b) a genuine apportionment of shared route cost across batched deliveries, which WOULD need a new ledger concept (a `ROUTE_COST_ALLOCATION` entry type, splitting one shared cost across multiple `deliveryId`s). This proposal recommends (a) as the default assumption for any future batching design — it requires zero ledger changes — and flags (b) as a genuinely separate, harder problem that should get its own dedicated proposal if BigBoss ever wants trip-level (not delivery-level) cost sharing, rather than being decided speculatively here.

---

## 30. Admin Financial Dashboard — Data Required (Not Implemented)

All of the following are directly computable from the proposed ledger (SUM/GROUP BY queries, no new source-of-truth data needed beyond what §12 already defines): total delivery revenue, driver payouts, delivery company payouts, supplier contributions, Coffee Owner contributions, BigBoss subsidies, waiting compensation, cancellation compensation, BigBoss margin (§20), outstanding balances (§19), pending settlements, paid settlements — each a straightforward aggregate over `deliveryFinancialLedger` filtered by `entryType`/`status`/date range, optionally joined to `DeliverySettlement` for the last three. No dashboard UI is proposed or implied to be simple to build — only that the DATA layer this document proposes would fully support one without any further schema work.

---

## 31. Proposed Database Model (Summary Table — None Created)

| Table | Purpose | Key fields | Relationships | Immutable? | Suggested indexes |
|---|---|---|---|---|---|
| `deliveryFinancialLedger` | Append-only record of every financial fact | See §12 | `deliveryId` → `deliveries.id`; `actorId` → `users.id` | Yes (entries reversed via new entries, never edited) | `(deliveryId)`, `(actorType, actorId, status)`, unique `(idempotencyKey)` |
| `deliverySettlement` | Periodic payout batches per actor | See §18 | `actorId` → `users.id`; implicitly covers many `deliveryFinancialLedger` rows via a join table or a `settlementId` FK added to ledger entries once paid | Append-only; status progresses forward only, never reversed in place | `(actorType, actorId, periodStart, periodEnd)`, `(status)` |
| `deliveryCompanyContract` | Per-company commercial terms | See §6 | `deliveryCompanyId` → `users.id` | Append-only-by-version (new row per renegotiation) | `(deliveryCompanyId, effectiveDate)` |
| `bigBossSubsidyCampaign` | Subsidy authorization/budget | See §10 | Referenced by `deliveryFinancialLedger.reference` for `BIGBOSS_SUBSIDY` entries | Budget/spent fields mutate (they're a running counter, not a historical fact per se — the INDIVIDUAL `BIGBOSS_SUBSIDY` ledger entries remain the immutable audit trail) | `(isActive, startDate, endDate)` |
| `adminAuditLog` | Configuration change history | See §22 | `entityId` polymorphic (settings/contract/campaign) | Append-only | `(entityType, entityId, createdAt)` |
| `driverMinimumGuarantee` | Per-vehicle(-company) payout floor | See §7 | Optionally `deliveryCompanyId` → `users.id` | Mutates like any other Admin config (historical deliveries are protected by the ledger's own frozen entries, not by this table being immutable) | `(vehicleType, deliveryCompanyId)` |

None of these tables, columns, or indexes were created — this is a design summary only, consistent with the task's explicit "do not modify schema" instruction.

---

## 32. Proposed API Model (Design Only — None Implemented)

| Endpoint (illustrative) | Role | Purpose |
|---|---|---|
| `GET /api/admin/financial-summary` | Admin | Aggregate revenue/cost/margin dashboard data (§30) |
| `GET /api/deliveries/:id/financial-breakdown` | Admin, and a redacted version for Supplier/Driver/Company (reusing `redactDeliveryCodes`-style logic) | Every ledger entry for one delivery |
| `GET /api/admin/ledger` | Admin | Filterable/paginated raw ledger query (by actor, type, status, date range) |
| `GET /api/settlements/:id` | Admin, and the owning actor | One settlement's detail |
| `GET /api/driver/earnings` | Driver (own) | Own `DRIVER_PAYOUT`/incentive/bonus history + current settlement status |
| `GET /api/supplier/balance` | Supplier (own) | Own outstanding `SUPPLIER_CONTRIBUTION`-relevant balance |
| `GET /api/delivery-company/balance` | Delivery Company (own) | Own `DELIVERY_COMPANY_PAYOUT` balance |
| `POST /api/admin/adjustments` | Admin only | Create an `ADJUSTMENT` entry (§26) |
| `POST /api/admin/refunds` | Admin only | Create a `REFUND` entry (§15) |
| `POST /api/admin/settlements` | Admin only | Trigger a settlement run for a period/actor (§18) |

Every mutating endpoint here is Admin-only by design — none of these financial-control actions should ever be self-service for a Supplier/Driver/Company, matching the existing `requireAdmin` pattern used for every Phase 1-4 configuration route. No route was created; this table only specifies the shape a future implementation should follow.

---

## 33. Financial State Machine

```
DELIVERY CREATED (PENDING)
        ↓
PRICING FINALIZED (feeFinalizedAt set, at driver assignment — Phase 1-4, unchanged)
        ↓
FINANCIAL ENTRIES CALCULATED (proposed: CUSTOMER_DELIVERY_CHARGE, SUPPLIER_CONTRIBUTION,
        BIGBOSS_SUBSIDY, DRIVER_PAYOUT, DELIVERY_COMPANY_PAYOUT entries written, status=CALCULATED)
        ↓
DELIVERY PROGRESSES (PICKED_UP → IN_TRANSIT; waiting entries possibly added here — Phase 4, unchanged)
        ↓
   ┌────┴────────────────────────────┐
   ▼                                  ▼
DELIVERED                        CANCELLED
   ↓                                  ↓
Entries → AUTHORIZED               Original entries → VOID (if before real effort) or
   ↓                                REFUND entries created (if funds must be returned) +
Entries → OWED                      CANCELLATION_COMPENSATION entries (§8) if driver effort occurred
   ↓                                  ↓
SETTLEMENT READY (batched by       (no settlement — VOID/REFUNDED entries excluded from any
   period, §18)                     future settlement batch)
   ↓
SETTLEMENT PROCESSING
   ↓
PAID  (or FAILED → back to SETTLEMENT READY for retry, or DISPUTED → frozen for Admin review)
```
This state machine is layered ENTIRELY on top of the existing `deliveryStatusEnum` (`PENDING`→...→`DELIVERED`/`CANCELLED`) — it does not replace or modify it. The two machines run in parallel: delivery STATUS answers "where is the physical delivery," ledger STATUS answers "where is the money."

---

## 34. Business Decisions Required

### Already supported by the existing system (no new decision needed)
- Coffee Owner/Supplier split percentage (configurable today, Phase 1)
- Driver payout share percentage (configurable today, Phase 3)
- Supplier subsidy percentage per promotion (configurable today, Phase 4)
- Weather/peak/zone multipliers and driver incentives (configurable today, Phase 4)
- Waiting free-minutes/rate/compensation (configurable today, Phase 4)
- Combined-multiplier safety cap (configurable today, Phase 4)

### Requires BigBoss business approval (genuinely new decisions, none invented in this document)
| Decision | Why it matters | Where configured | Alternatives |
|---|---|---|---|
| Delivery Company commission structure | Determines whether the company partnership is commercially viable | Per-company contract (§6) | Flat %, fixed fee, per-km, negotiated — see §6 comparison |
| Driver minimum guarantee amounts | Protects driver income floor; affects BigBoss's worst-case per-delivery cost | Global + per-vehicle table, optional per-company override (§7) | Per-delivery, per-hour (rejected — no session/shift tracking exists), per-km |
| Cancellation compensation amounts | Balances driver trust against abuse risk | Per-stage, per-vehicle table (§8) | Flat fee vs. percentage-of-expected-payout |
| Driver bonus program rules | Genuine incentive-design question, not a technical one | A new bonus-campaign concept (§9) | Weather/peak (already exist), delivery-count, performance — none scoped yet |
| BigBoss subsidy budget & eligibility | A real P&L commitment | Campaign entity (§10) | Global vs. targeted, per-delivery cap vs. total-only cap |
| Supplier contribution rules beyond the flat default | Whether large/strategic suppliers get different terms | Per-supplier override (already flagged in the Phase 4-era business-model doc §14, still undecided) | Order-value thresholds, distance thresholds, negotiated |
| Settlement frequency | Cash-flow and trust implications for every actor | Global default, per-actor-type or per-contract override (§18) | Weekly / bi-weekly / monthly |
| Refund policy specifics (who's "at fault" in ambiguous cancellations) | Directly affects §8/§15's compensation vs. refund split | Admin-configured rule table, ultimately some cases may always need manual Admin judgment | Fully automated vs. Admin-reviewed-by-default |
| Platform commission (does BigBoss ever take a cut of the delivery fee itself, beyond subsidy accounting) | A fundamental monetization question, currently answered "no, 0%" by default everywhere | `deliveryPricingSettings`-level, if ever introduced | Requires its own dedicated proposal — not addressed further here, since it changes Phase 1's core formula, not just Phase 5's ledger |
| Payment processing costs/provider | Entirely unknown today — no payment provider integration exists anywhere in the reviewed code | A future `BIGBOSS_COST` entry type, once a provider is chosen | Out of scope for this document — a separate infrastructure decision |

---

## 35. The Three Layers — Explicit Separation (Restated as the Governing Principle)

```
1. PRICING     — "What should the delivery cost?"          → Phases 1-4, UNCHANGED by this proposal
2. ECONOMICS   — "Who funds it, who's entitled to what?"    → Phases 1-4's split/payout fields,
                                                                extended (not replaced) by the ledger
                                                                as the durable RECORD of those facts
3. SETTLEMENT  — "Who actually owes whom, and was it paid?" → ENTIRELY NEW in Phase 5 — does not
                                                                exist in any form today
```
Every table, entry type, and state machine in this document was designed to keep these three questions answerable independently. A pricing-config change never touches economics (already true). An economics calculation never implies settlement (the core discipline of §13). And a settlement failure never implies the underlying economics were wrong (a `FAILED` settlement retries against the SAME `OWED` ledger entries, it doesn't recompute them).

---

## 36. Recommended Implementation Order

Derived from this document's own dependency analysis:

**Phase 5A — Ledger foundation.** `deliveryFinancialLedger` table + a pure, read-only function that generates entries from the ALREADY-EXISTING frozen Phase 1-4 snapshot (no new business logic, just a new durable representation of facts that already exist) + the idempotency-key mechanism (§25). Lowest risk: purely additive, generates entries retroactively-explainable from data already computed today.

**Phase 5B — Money states + Admin visibility.** Wire the `CALCULATED`→`AUTHORIZED`→`OWED` progression to existing delivery-status transitions (no new UI beyond a read-only ledger view for Admin, §30's data layer only). Still no real settlement yet — this phase only makes "what does BigBoss currently owe, in total, right now" a real, queryable fact for the first time.

**Phase 5C — Refunds & cancellation compensation.** §8 and §15 — the two areas where real money-reversal logic is needed, but which don't yet require the full settlement machinery (a `REFUND`/`CANCELLATION_COMPENSATION` entry can exist and be reported on before any actual settlement run exists).

**Phase 5D — Settlement model.** §18 — the actual PAID state becomes reachable. This is the highest-complexity phase (payment-reference recording, settlement-period batching, failure/retry handling) and should not be attempted before 5A-5C are stable and trusted.

**Phase 5E — Delivery Company contracts + driver guarantees.** §6-7 — genuine new business-configuration surfaces, best sequenced after the ledger/settlement plumbing exists to actually USE contract-driven numbers, rather than building the configuration UI before there's a ledger to feed.

**Phase 5F — BigBoss subsidy campaign engine + driver bonus program.** §9-10 — the most speculative, most business-decision-dependent pieces (real budgets, real bonus rules) — correctly sequenced last, since every earlier phase's ledger/settlement foundation is a prerequisite for tracking these responsibly, and because the actual business rules for both remain entirely undecided (§34).

---

## 37. Risks and Edge Cases

| Risk/edge case | Mitigation designed into this proposal |
|---|---|
| A ledger entry is written twice due to a retried request | Unique `idempotencyKey` constraint (§25) |
| A settlement pays out an amount that later turns out to be wrong | Never edit the settlement or the original entries — a new `ADJUSTMENT` flows into the NEXT settlement period (§18/§26) |
| A refund is issued for more than was originally charged | Refund amounts always copy verbatim from the entry being reversed, never independently recomputed (§24) |
| A subsidy campaign's budget is double-counted after a refund | The campaign's `spentCents` is explicitly decremented by the `REFUND` entry against `BIGBOSS_SUBSIDY` — the one intentional cross-table side effect in this design, called out explicitly so it's never accidentally duplicated elsewhere (§15) |
| Two settlements accidentally overlap the same ledger entries | Each `OWED` entry should carry (once paid) a `settlementId` reference, making it structurally impossible for a second settlement query to re-select an already-settled entry |
| A dispute freezes money indefinitely | `DISPUTED` status is explicitly a terminal-until-Admin-action state, never silently auto-resolved by a timeout or a background job (this document proposes no auto-resolution mechanism) |
| Multi-supplier order partial cancellation confuses which delivery's ledger is affected | Every entry is `deliveryId`-scoped from day one (§16) — there is no order-level-only financial entry for anything delivery-specific |
| A Delivery Company contract changes mid-flight for an in-progress delivery | The delivery's ledger entries snapshot the contract version resolved at ASSIGNMENT time (§6/§14) — a later contract change never retroactively alters an in-flight or completed delivery's entries |
| BigBoss subsidy is exhausted mid-checkout (customer saw an estimate assuming subsidy, but it's gone by assignment) | Matches the EXISTING, already-accepted Phase 4 estimate-vs-final discrepancy pattern (an estimate is always provisional; the final frozen figure is authoritative) — no new risk introduced, just extended to cover subsidy specifically |

---

## 38. Exact Items That Should NOT Be Implemented Yet

- `DemandPricingEngine` (§27 — compatibility confirmed, not built)
- Driver accept/decline offer workflow (§28 — compatibility confirmed, not built)
- Batching/Consolidation (§29 — flagged as needing its own dedicated proposal if trip-level cost sharing is ever wanted)
- `BigBossSubsidyCampaign` engine itself (§10 — mechanism designed, no campaign UI/budget-enforcement code)
- `DeliveryCompanyContract` engine itself (§6 — mechanism designed, no contract-authoring UI)
- Driver minimum guarantee enforcement (§7 — mechanism designed, no real guarantee values chosen)
- Driver bonus program (§9 — shape designed, no bonus rules/values chosen)
- Any real payment-provider integration (§18/§34 — explicitly out of scope, provider-agnostic design only)
- The ledger table itself (`deliveryFinancialLedger`) and every other table in §31
- Any API in §32
- Any Admin dashboard UI (§30 — data requirements only)
- Any audit-log table (§22)

---

## IMPLEMENTATION STATUS:
## PROPOSAL ONLY — NO CODE CHANGES MADE
