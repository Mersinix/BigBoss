# BigBossCoffee Delivery — Business Rules & Money Flow Specification
### Proposal only. No code, schema, or database was changed to produce this document.

This document builds on `docs/bigboss-delivery-financial-business-model.md` and `docs/bigboss-delivery-phase5-financial-settlement-proposal.md`, and on direct inspection of the current implementation (`shared/schema.ts`, `server/storage.ts`, `server/routes.ts`, the delivery-related client hooks/components) as it exists after Phases 1-4. Every "CURRENT IMPLEMENTATION" statement is verified against the real code; every "PROPOSED" statement is clearly labeled and not live anywhere. Six concepts are kept rigorously separate throughout: **PRICING** (what should this cost), **ECONOMICS** (who funds it / who's entitled to what), **OBLIGATION** (a debt that has become real and owed), **PAYMENT** (money that has actually moved), **SETTLEMENT** (the batched process of discharging obligations), and **PROFIT** (BigBoss's own net result). A `driverPayoutCents` value is PRICING/ECONOMICS output only — it is never, anywhere in this document, treated as an OBLIGATION or a PAYMENT.

---

## 2. Current System vs. Proposed Business Model — Method Note

Every engine named in the task was re-verified against the live code before writing this document:

| Engine | Current implementation confirms |
|---|---|
| `DeliveryPricingEngine` (`runDeliveryPricingPipeline`/`computeDeliveryFee`) | Computes `deliveryFee`, split by `cafeOwnerFeeShareCents`/`supplierFeeShareCents`; weather/peak/zone multipliers real (Phase 4), demand/urgency still no-ops |
| `DeliveryPricingSnapshot` | Frozen at `feeFinalizedAt` (driver assignment); ~30 nullable snapshot columns on `deliveries`, never rewritten after freeze |
| `DriverPayoutEngine` (`computeDeliveryPayout`) | `driverPayoutCents` = base %-of-fee + weather/peak incentives; `companyPayoutCents` = fee − base share, always 0 in `SUPPLIER` mode |
| `DeliveryBudgetEngine` (`computeDeliveryBudget`) | Purely analytical: `FUNDED`/`BREAK_EVEN`/`DEFICIT` + deficit amount, computed and frozen, **never blocks anything** |
| `SupplierSubsidyEngine` (`resolveSupplierSubsidy`) | Generalizes `FREE_SHIPPING` via `promotions.deliverySubsidyPercent` (null = legacy 100%); most-generous-wins priority |
| `WeatherPricingEngine`/`DeliverySafetyEngine` (`resolveWeatherPricing`) | Manual Admin-declared condition (`activeWeatherCondition`), no live weather API; safety states `ALLOW`/`ALLOW_WITH_WARNING`/`RESTRICT`/`SUSPEND` enforced only at driver assignment |
| `PeakHourEngine`/`ZonePricingEngine` | Admin-defined jsonb lists on the single `deliveryPricingSettings` row; zone matches destination governorate |
| `WaitingTimePricingEngine` | Only the supplier-pickup scenario is wired (`arrivedAtPickupAt` → billed once at `PICKED_UP`); customer/dropoff waiting **not implemented** |
| `RouteEngine` (`getRoute`) | Haversine fallback only, always `distanceSource='fallback'`, `estimatedDurationMinutes` always null (no invented ETA) |
| `VehicleCompatibilityEngine` | Ordinal type check + optional capacity check, enforced at assignment |
| `DeliveryDispatchEngine` (`getAssignableDriversForDelivery`) | Read-only recommendation layer; no auto-assignment, no driver accept/decline |
| `SelfPickupEngine` | `deliveryMethod='SELF_PICKUP'` → zero `deliveries` rows created, ever |
| `PickupCodeService` | Two parallel instances (normal delivery `pickupCode`/`dropoffCode`; self-pickup `selfPickupCode`) |

**No ledger, settlement, balance, payment record, or COD-specific delivery logic exists anywhere in the codebase today.** This is the single most important "current implementation" fact this document rests on.

---

## 3. The Actors — Financial Role Definitions

### Coffee Owner
- **Can be charged**: `cafeOwnerFeeShareCents` (delivery contribution), their order's product total (separate, non-delivery concern).
- **Can contribute**: nothing beyond the above — the Coffee Owner is a payer, never a funder of OTHER parties' economics.
- **Can earn**: nothing — the Coffee Owner has no earning role in delivery economics.
- **BigBoss can owe them**: a refund (§19), never a payout.
- **They can owe BigBoss**: their contribution, until paid (order payment flow, outside this document's delivery-specific scope).
- **Should see**: own delivery fee, own contribution, own refunds — never any other actor's figures (existing rule, Phase 3/4).
- **Controls their own financial configuration?** No — nothing about a Coffee Owner's contribution is self-configurable; it is entirely a function of Admin/Supplier-configured rules applied to their specific order.

### Supplier
- **Can be charged**: nothing directly by BigBoss (Suppliers are not charged a platform fee today — no such mechanism exists).
- **Can contribute**: `supplierFeeShareCents` (includes `supplierSubsidyCents`), a `FREE_SHIPPING`/graduated-subsidy promotion they authored.
- **Can earn**: nothing from BigBoss directly in `SUPPLIER` mode (their own driver's payout is an internal transfer within their own business — see §7).
- **BigBoss can owe them**: their `cafeOwnerFeeShareCents`-derived reimbursement, IF BigBoss is ever the collecting intermediary (Model A, §5) — under Model B (§5), BigBoss owes them nothing, because BigBoss never collected on their behalf.
- **They can owe BigBoss**: only if a future platform commission is introduced (does not exist today — see §21).
- **Should see**: own delivery economics, own contribution, own subsidy usage, own driver's payout (SUPPLIER mode only — existing Phase 3/4 rule), own settlement (once one exists).
- **Controls**: their own promotion/subsidy rules (`promotions` table, already self-service today); never the global split percentage, vehicle rates, or any platform-level config.

### Supplier Driver
- **Can be charged**: nothing.
- **Can contribute**: nothing (a driver is a labor/effort provider, never a funder).
- **Can earn**: `driverPayoutCents` (base % + weather/peak incentive), `waitingDriverCompensationCentsUsed`, and (proposed, Phase 5) minimum-guarantee top-ups, bonuses, cancellation compensation.
- **BigBoss can owe them**: only under Model A (§5) — if BigBoss is the collecting/disbursing intermediary. Under Model B, the SUPPLIER owes the driver, not BigBoss (see §7's critical distinction).
- **They can owe BigBoss**: nothing, ever, in any model reviewed.
- **Should see**: own payout, own incentives, own compensation, own settlement (once one exists) — never another driver's, never the customer's/supplier's contribution breakdown.
- **Controls**: nothing about their own payout formula — entirely Admin/contract-configured.

### Delivery Company
- **Can be charged**: nothing directly today (no platform commission mechanism exists — `companyPayoutCents` is "whatever's left," not a fee BigBoss extracts).
- **Can contribute**: nothing today.
- **Can earn**: `companyPayoutCents` (today: `fee − base driver share`; proposed Phase 5: a real contract-driven commission, §15).
- **BigBoss can owe them**: `companyPayoutCents`, under either model — a Delivery Company is always a distinct economic actor BigBoss transacts with directly, unlike a Supplier's own internal driver (this is true regardless of Model A/B, since a Delivery Company is external to the Supplier by definition).
- **They can owe BigBoss**: nothing today; a future commission-on-BigBoss's-behalf or negative-balance scenario would need explicit contract terms (§15).
- **Should see**: own gross amount, own drivers' payouts, own retained amount, own settlement.
- **Controls**: nothing about the commission formula (Admin/contract-authored, §15) — but should see the terms they're being paid under, read-only.

### Delivery Company Driver
- Financially identical in shape to a Supplier Driver (the codebase does not distinguish driver TYPE financially — `driverPayoutCents` means the same thing regardless of `deliveryMode`) — but the actor who OWES them is always the Delivery Company (an external business), never the Supplier, and — depending on Model A/B — either BigBoss (as intermediary) or the Delivery Company directly.

### BigBoss
- **Can be charged**: nothing (BigBoss is never a payer TO another actor in the sense of owing a fee — it may fund subsidies, which is different, see §13).
- **Can contribute**: `bigBossSubsidyCents` (always 0 today — no campaign engine exists).
- **Can earn**: nothing today (0% platform commission, verified — `driverPayoutSharePercent` defaults to 100%, meaning the ENTIRE fee flows to driver/company, none retained by BigBoss).
- **BigBoss can owe**: drivers/companies/suppliers, entirely dependent on which collection model (§5) is adopted.
- **BigBoss is owed**: nothing today.
- **Sees**: everything (Admin role, unredacted).
- **Controls**: every global rate/percentage/multiplier/cap in `deliveryPricingSettings`, every future contract/campaign/guarantee table.

---

## 4. Core Money Flow — Lifecycle

```
ORDER (orders row — deliveryMethod chosen: SELF_PICKUP or DELIVERY_SERVICE)
   ↓
SUB-ORDER (subOrders row — one per supplier in the order; carries transport requirements)
   ↓
DELIVERY (deliveries row — created ONLY for DELIVERY_SERVICE sub-orders, one per sub-order;
          SELF_PICKUP creates none — see §9)
   ↓
DELIVERY PRICE (computeDeliveryFee — provisional estimate at creation, authoritative FROZEN
                value at driver assignment; includes weather/peak/zone dynamic factors)
   ↓
FUNDING (cafeOwnerFeeShareCents + supplierFeeShareCents [includes supplierSubsidyCents] +
         bigBossSubsidyCents [always 0 today] — WHO is paying for the priced amount)
   ↓
COST (driverPayoutCents + companyPayoutCents — WHAT it costs to actually perform the delivery)
   ↓
PAYOUT (the same COST figures, but now understood as "this is what the driver/company is
        ENTITLED to" — CALCULATED, not yet OWED — see §23)
   ↓
OBLIGATION (PROPOSED, Phase 5 — does not exist today: the moment a payout becomes a real,
            trackable debt BigBoss/Supplier/Company owes someone, distinct from a mere
            calculation)
   ↓
SETTLEMENT (PROPOSED, Phase 5 — does not exist today: a periodic batch process that groups
            OWED obligations per actor and discharges them)
   ↓
PAYMENT (PROPOSED, Phase 5 — does not exist today: the actual transfer of money, via whatever
         real-world mechanism BigBoss chooses — bank transfer, mobile money, cash reconciliation)
```
**Everything above the OBLIGATION line already exists and is tested (Phases 1-4). Everything from OBLIGATION downward is proposed and unbuilt.** This is the exact boundary this document exists to make undeniable.

---

## 5. Who Collects the Delivery Money — The Central Decision

### Model A — BigBoss as Financial Intermediary
```
Coffee Owner → BigBoss → ┬→ Supplier (its contribution reimbursed/netted)
                          └→ Delivery Company → its own Driver
                          (Supplier's OWN driver is paid by the Supplier itself, out of what
                           BigBoss remits to the Supplier — BigBoss still never touches that
                           specific leg directly)
```
- **Who pays BigBoss?** The Coffee Owner, for the FULL amount (product total + delivery contribution) at checkout.
- **Who does BigBoss pay?** The Supplier (product revenue + delivery reimbursement), the Delivery Company (its gross delivery amount) — BigBoss becomes the single settlement counterparty for everyone except a Supplier's own internal driver.
- **Who does BigBoss owe?** Every Supplier and every Delivery Company, on a running basis, until settled.
- **Who receives refunds?** BigBoss processes them FROM the Coffee Owner and, where warranted, reverses what it owes the Supplier/Company (a `REFUND` ledger entry pair, per the Phase 5 proposal).
- **Who absorbs deficits?** BigBoss is structurally exposed to every deficit first (it already collected the full amount and must still pay out the full driver/company entitlement even if the collected amount doesn't cover it) — BigBoss can then choose to pass some of that exposure back to the Supplier via contract terms, but the IMMEDIATE exposure is BigBoss's.
- **How does BigBoss earn?** Only via an explicit platform commission (does not exist today) or a float/timing advantage (holding funds between collection and settlement) — neither exists today.

### Model B — BigBoss as Marketplace Only
```
Coffee Owner → Supplier / Delivery Company → (their own) Driver
                    (BigBoss never touches the money — it only COMPUTES the numbers)
```
- **What does BigBoss calculate?** Everything it calculates today — the full price/funding/payout breakdown — exactly as Phases 1-4 already do.
- **What does BigBoss NOT collect?** Anything — the Coffee Owner pays the Supplier/Delivery Company directly (via COD, or a payment rail BigBoss doesn't intermediate), and BigBoss never holds delivery funds.
- **What does BigBoss NOT owe?** Anything to drivers, companies, or suppliers for delivery economics — BigBoss's numbers are advisory/computational, not a debt.
- **How does BigBoss earn?** A separate, explicit fee charged TO the Supplier/Delivery Company for USING the platform (a subscription, a per-transaction marketplace fee) — entirely decoupled from the delivery fee itself.
- **How do settlements happen outside BigBoss?** They don't happen "outside BigBoss" so much as they don't happen AS a BigBoss function at all — Suppliers and Delivery Companies settle with their own drivers using their own existing business processes, exactly as they presumably already do today for every other aspect of running a delivery operation.

**What the current code already implies**: the presence of Cash-on-Delivery as a payment method (`paymentMethod: 'CASH_ON_DELIVERY'` exists in the order schema per the delivery-v2-proposal document's own review) is a strong signal AGAINST Model A being the current de facto reality — if the customer pays the driver cash at the door, BigBoss is structurally NOT the collector, regardless of what its pricing engine calculates. This is a significant, concrete piece of evidence this document surfaces for the decision in §6, not an assumption.

---

## 6. Recommended Architecture

| Criterion | Model A (Intermediary) | Model B (Marketplace only) |
|---|---|---|
| **Scalability** | Requires BigBoss to build/operate real money-movement infrastructure (collection, custody, disbursement) at growing volume — a substantially larger operational undertaking | Scales as a pure computation/reporting layer — no money custody risk, no float management |
| **Financial complexity** | High — BigBoss becomes a de facto payment processor/escrow, with all associated regulatory/compliance surface (potentially requiring financial licensing depending on jurisdiction — **unknown, out of this document's scope, but a real risk to flag**) | Low — BigBoss remains a calculator/record-keeper; the actual money movement is each actor's own existing responsibility |
| **Auditability** | Higher POTENTIAL auditability (BigBoss sees every transaction) but also higher STAKES (BigBoss's own books must reconcile to real bank/mobile-money activity) | The LEDGER (Phase 5) still provides full auditability of the CALCULATED economics either way — Model B doesn't reduce ledger value, it only removes BigBoss's role as the money's custodian |
| **Refunds** | BigBoss must actually process the refund transaction | BigBoss records/recommends a refund; the actual money-return happens between the original payer and payee directly |
| **Disputes** | BigBoss is the natural arbiter (it held the money) — but also the natural target of complaints if something goes wrong | BigBoss is an informational reference; the dispute is fundamentally between the two transacting parties, with BigBoss's ledger serving as evidence, not as the party financially on the hook |
| **Supplier delivery (own driver)** | Awkward — BigBoss would be collecting money it then has to pass through the Supplier to pay a driver it has no direct relationship with, adding a hop with no clear benefit | Natural fit — the Supplier already pays its own driver; BigBoss's numbers simply tell the Supplier what's fair |
| **Delivery Companies** | Natural fit — a real external business BigBoss could reasonably intermediate for | Also workable — a Delivery Company can collect/be paid directly by Supplier/Coffee Owner per existing COD or a future payment rail, with BigBoss's contract-driven numbers (§15) as the agreed reference |
| **Drivers** | BigBoss would need a driver payout mechanism (bank/mobile-money payout) — significant new infrastructure | Drivers are paid by whoever they work for (Supplier or Delivery Company) using that entity's own means — zero new BigBoss infrastructure needed |
| **BigBoss subsidies** | Naturally fits — if BigBoss already holds the money, applying a subsidy is just "collect less / disburse the same" | Requires an explicit reimbursement mechanism (BigBoss must actually SEND the subsidy amount to whoever it's meant to benefit) — more friction, but still fully representable in the ledger as an obligation BigBoss owes |
| **Future online payments** | A natural evolution of Model A (BigBoss already in the money flow) | Requires BigBoss to newly insert itself into the flow when online payment is introduced — a bigger future change, but one that can be introduced deliberately, later, once actually needed |
| **Cash on Delivery** | Awkward under Model A — if the customer pays the DRIVER cash, BigBoss was never actually "collecting" for that transaction regardless of what the model says, creating a mismatch between the model's theory and the real cash movement (**this is the single strongest argument against Model A being accurate to today's reality**) | Fits naturally — COD is exactly what Model B already describes: money moves directly between the transacting parties, BigBoss computes but doesn't touch it |
| **Marketplace commissions** | Commission could be netted out of what BigBoss disburses (simple to implement once BigBoss already holds the money) | Commission must be collected as its OWN separate transaction (e.g., a subscription charge, a periodic invoice) — more operational work, but conceptually cleaner (never mixed with delivery money) |
| **Future expansion** | Locks BigBoss into being a financial institution-adjacent entity from early on — hard to walk back once built | Keeps BigBoss's core product (marketplace + logistics coordination) separate from a financial-services pivot, which can be added later as a deliberate, well-scoped decision rather than an early architectural default |

### Recommendation
**Model B (Marketplace Only) is the better fit for BigBossCoffee as it exists today**, based on three concrete, code-grounded observations rather than a stylistic preference: (1) Cash on Delivery already exists as a payment method, which is structurally incompatible with BigBoss being the universal collector; (2) nothing in the current codebase shows any evidence of BigBoss ever having collected or disbursed real money for a delivery — every figure computed across Phases 1-4 has been exactly that, a *figure*, with the Phase 5 proposal explicitly built around the premise that a ledger of CALCULATED facts is not the same as evidence of a transaction; (3) Model B requires zero new payment infrastructure to become useful immediately — the Phase 5 ledger (already proposed) provides full auditability and a clean path to SETTLEMENT REPORTING (i.e., "the Supplier's system should show this driver is owed X") without BigBoss ever needing to become a payment processor.

**However, a hybrid is realistic and likely the actual eventual destination**: BigBoss could remain Model B for Supplier-owned deliveries (where the Supplier already has its own driver relationship and its own means of paying them) while adopting a Model-A-like intermediary role specifically for Delivery Company transactions and/or BigBoss-subsidized deliveries (where BigBoss's own money is genuinely involved and it makes sense for BigBoss to be the one that actually disburses the subsidy portion directly, rather than trusting a third party to pass it through correctly). This hybrid requires NO new architecture beyond what Phase 5 already proposed — the ledger's `actorType`/`direction` fields (§26) already support "BigBoss owes Company X" and "BigBoss owes nobody for Supplier-mode delivery Y" as two equally valid, independently-representable facts on the same table. **This document recommends Model B as the default, with the hybrid extension for Delivery Company/subsidy cases flagged as the natural evolution — but the final choice remains an explicit BUSINESS DECISION REQUIRED (§33, item 1), since it has real regulatory/operational consequences this document cannot resolve on BigBoss's behalf.**

---

## 7. Scenario 1 — Supplier Delivery

```
Delivery price (deliveryFee)         = X   (computed, Phase 1-4, e.g. distance × rate × factors)
Coffee Owner contribution             = X × cafeOwnerSharePercent / 100   (minus any subsidy effect)
Supplier contribution                 = X − Coffee Owner contribution (includes supplierSubsidyCents)
Supplier driver payout                = X × driverPayoutSharePercent / 100 + incentives (computed,
                                         Phase 3-4 — this is what the driver is ENTITLED to, see below)
BigBoss subsidy                       = 0 (today, always — no campaign engine)
BigBoss revenue                       = 0 (today, always — no commission mechanism)
```
All percentages above are EXISTING, Admin-configurable variables (`cafeOwnerSharePercent`, `driverPayoutSharePercent`) — no new value is invented here.

**The critical distinction this section exists to state explicitly**: `driverPayoutCents` being computed and frozen on the `deliveries` row means **"the driver has earned/is entitled to this amount, per the pricing engine's own math."** It does **NOT** mean:
- ~~BigBoss owes the driver this amount~~ — under Model B (recommended, §6), BigBoss owes the driver NOTHING; the **SUPPLIER** owes the driver, because the driver is the Supplier's own staff/contractor and BigBoss never touched the money.
- ~~The driver has been paid~~ — no payment event of any kind is recorded anywhere in the current system for this or any other figure.

So, for Supplier delivery specifically:
```
Driver earned        = driverPayoutCents (a CALCULATED entitlement, computed by BigBoss's engine
                        as a service to the Supplier, so the Supplier knows what's fair)
BigBoss owes driver   = 0, always, under Model B (recommended)
Supplier owes driver  = driverPayoutCents (or the guarantee-topped-up amount, once §16 exists) —
                        this is a Supplier-internal labor obligation, settled however the Supplier
                        already settles with its own staff, entirely outside BigBoss's ledger
```

---

## 8. Scenario 2 — Delivery Company

```
Customer delivery charge (deliveryFee)      = X
Delivery Company gross amount                = driverPayoutCents + companyPayoutCents (= X, today,
                                                since the two always sum to the full fee)
Driver payout                                 = driverPayoutCents (computed, Phase 3-4)
Delivery Company retained amount              = companyPayoutCents (today: X − driverPayoutCents;
                                                proposed Phase 5 §15: a real contract commission)
BigBoss revenue                               = 0 (today)
BigBoss subsidy                                = 0 (today)
```
**Who owes whom?** Under Model B (recommended): the Coffee Owner/Supplier funding flows DIRECTLY to the Delivery Company (via whatever payment rail is used — COD or otherwise), and the Delivery Company owes its own driver, exactly mirroring the Supplier-delivery case but with the Delivery Company standing in the Supplier's operational role. Under Model A (or the hybrid extension, §6): BigBoss owes the Delivery Company its gross amount, and the Delivery Company still separately owes its own driver (BigBoss does not reach past the Company to pay the driver directly in either model — the Delivery Company is always the driver's actual employer/contractor).

---

## 9. Scenario 3 — Self Pickup

**Confirmed structurally, not merely by convention**: `orders.deliveryMethod='SELF_PICKUP'` causes `createDeliveryForSubOrder` to return `null` immediately — **zero `deliveries` rows are ever created**. Since every financial figure in this entire document (`deliveryFee`, every split, every payout, every subsidy) is a column on a `deliveries` row, Self Pickup structurally cannot produce ANY of them.

**Explicitly allowed financial events for Self Pickup**: none related to delivery. (The order's own product-total payment is a separate, pre-existing, non-delivery concern.)
**Explicitly prohibited**: `CUSTOMER_DELIVERY_CHARGE`, `SUPPLIER_CONTRIBUTION` (delivery-specific), `DRIVER_PAYOUT`, `DELIVERY_COMPANY_PAYOUT`, `BIGBOSS_SUBSIDY`, `WAITING_COMPENSATION`, any future `CANCELLATION_COMPENSATION` (there is no driver to compensate) — none of these entry types should ever be creatable with a Self-Pickup order's `orderId`, and since no `deliveries` row exists to anchor them to, this is enforced by construction, not by a rule that could be forgotten or bypassed.

---

## 10. Multi-Supplier Order — Financial Independence

```
Order #X
 ├── Supplier A → SubOrder A → Delivery A → {price_A, funding_A, payout_A, subsidy_A,
 │                                             obligation_A (future), settlement_A (future)}
 └── Supplier B → SubOrder B → Delivery B → {price_B, funding_B, payout_B, subsidy_B,
                                                obligation_B (future), settlement_B (future)}
```
Already verified structurally correct today (order #146, two suppliers, two independent `deliveries` rows, independently computed across every Phase 1-4 regression test). Every one of `price`/`funding`/`payout`/`subsidy` is already a column on the DELIVERY row, never the order row — so no cross-supplier contamination is structurally possible for these. `obligation`/`settlement` (proposed, Phase 5) must preserve this by keying every ledger entry to `deliveryId` (never `orderId`-only for anything delivery-specific), exactly as the Phase 5 proposal already specifies. `refund`: a refund event should always be resolvable to the SPECIFIC delivery(ies) it concerns — a multi-supplier order's refund is never "one blob," it is one or more delivery-scoped refund entries, even if triggered by a single customer-facing refund action.

---

## 11. Customer Contribution

**When does the Coffee Owner pay the delivery fee?** By default, always, per the existing `cafeOwnerSharePercent` split — this is the baseline behavior with no promotion/subsidy active.

**When can they receive free/partial/full subsidy?**
- **Free delivery (full subsidy)**: an active `FREE_SHIPPING` promotion with no `deliverySubsidyPercent` set (legacy 100%), or explicitly set to 100 — Supplier-funded, existing behavior.
- **Partial subsidy**: an active promotion with `deliverySubsidyPercent` between 1-99 — Supplier-funded, existing behavior (Phase 4).
- **Full subsidy, BigBoss-funded**: would require a `bigBossSubsidyCents` > 0, which requires a real campaign engine — **not implemented today** (§13 of the Phase 5 proposal).

**Refund / partial refund**: not implemented today for delivery specifically (§19).

**Customer-facing delivery price vs. actual delivery economic cost — explicitly distinct**:
```
customer-facing delivery price  = cafeOwnerFeeShareCents   (what the Coffee Owner actually pays)
actual delivery economic cost   = driverPayoutCents + companyPayoutCents   (what it costs to
                                    actually perform the delivery)
```
These are NOT the same number, and the existing `DeliveryBudgetEngine` (Phase 4) exists specifically to compare them (alongside the Supplier's and BigBoss's contributions) and flag when the customer-facing price (plus every other funding source) doesn't cover the actual cost (`DEFICIT`) — already live-tested to correctly detect this without blocking the delivery.

---

## 12. Supplier Contribution

```
Supplier contribution           = supplierFeeShareCents (existing, Phase 1, split-formula output)
Supplier subsidy                 = supplierSubsidyCents (existing, Phase 4, generalized from
                                    FREE_SHIPPING; ALREADY INCLUDED inside supplierFeeShareCents,
                                    never a separate additional charge)
Supplier-funded free delivery     = the 100%-subsidy special case of the above (existing, unchanged
                                    behavior — every pre-Phase-4 FREE_SHIPPING promotion still
                                    behaves identically, verified byte-for-byte in Phase 4 testing)
Supplier-funded driver cost        = NOT a BigBoss-tracked concept today — in SUPPLIER mode, the
                                    Supplier pays its own driver using its own means; BigBoss's
                                    driverPayoutCents is informational (§7), not something the
                                    Supplier is billed for separately from its normal contribution
```
**Interaction with `FREE_SHIPPING`/`deliverySubsidyPercent`/`SupplierSubsidyEngine`**: `resolveSupplierSubsidy` reads the `promotions` table (type=`FREE_SHIPPING`, status=`ACTIVE`, date/eligibility checks) and resolves a `subsidyPercent` (null `deliverySubsidyPercent` = legacy 100%). This value feeds DIRECTLY into the funding split formula — it is not a separate, competing mechanism from `supplierFeeShareCents`; it is one of that value's inputs. **Existing behavior is fully preserved** — this document proposes no change to this mechanism, only documents it precisely so the future ledger can represent `supplierSubsidyCents` as its own typed, auditable entry (§26) without altering how the number itself is computed.

---

## 13. BigBoss Subsidy — Precise Mechanics

```
Economic delivery cost = 12 DT   (driverPayoutCents + companyPayoutCents, illustrative)
Coffee Owner            = 5 DT   (cafeOwnerFeeShareCents, illustrative)
Supplier                 = 3 DT   (supplierFeeShareCents minus its own subsidy portion, illustrative)
BigBoss                   = 4 DT   (bigBossSubsidyCents, illustrative — ALWAYS 0 TODAY, no real
                                    subsidy mechanism exists; this is a worked example of the
                                    ALREADY-EXISTING FIELD's intended future use, not a proposal
                                    to set it to 4 DT)
```
- **Who receives the 4 DT?** Whichever party the subsidy is designed to relieve — typically it reduces the Coffee Owner's OR the Supplier's contribution (i.e., it doesn't go "to" anyone directly, it REDUCES what someone else would have owed) — see the exact split-formula precedence already implemented in Phase 4: supplier subsidy applied first, then BigBoss subsidy, then the remaining amount split by the Coffee-Owner percentage.
- **Who records the 4 DT?** BigBoss, as a `BIGBOSS_SUBSIDY` ledger entry (proposed, §26) — the ONE place this number should ever be written, never silently absorbed into `cafeOwnerFeeShareCents` or `supplierFeeShareCents`.
- **Who considers it revenue?** No one — it is explicitly NOT revenue for anyone; it is a cost BigBoss incurs.
- **Who considers it cost?** BigBoss, exclusively — it directly reduces `netDeliveryMargin` (§20 of the Phase 5 proposal, restated in §21 below).
- **What happens if the delivery is cancelled?** The subsidy entry should be reversed (a `REFUND`-type entry against the `BIGBOSS_SUBSIDY` entry, per Phase 5 §15), and the originating campaign's remaining budget should be credited back (the one explicitly-flagged cross-table side effect in the Phase 5 proposal).
- **What happens if the customer is refunded?** Same reversal logic applies to whichever portion of the subsidy was tied to the refunded amount — a partial refund implies a proportional subsidy reversal, never a full reversal of an otherwise-still-valid delivery.

**No actual subsidy percentage, budget, or eligibility rule is proposed here** — this section only precisely defines the MECHANICS for when BigBoss eventually decides to fund one.

---

## 14. Driver Payout — Component-by-Component Rules

| Component | Who funds it? | Who receives it? | Is it an obligation? | When owed? | When void? |
|---|---|---|---|---|---|
| **Base payout** (% of fee) | The funding side (Coffee Owner + Supplier + BigBoss subsidy) via the delivery fee itself | Driver | Not today (CALCULATED only) — proposed to become OWED once `DELIVERED` (§23) | At `DELIVERED` (proposed) | If the delivery is `CANCELLED` before real driver effort (§17) |
| **Minimum guarantee top-up** | Undecided (§16) — either BigBoss, or Supplier/Company, as a cost of doing business | Driver | Same as base, once it exists | Same as base | Same as base |
| **Weather incentive** | Currently folded into `driverPayoutCents`, ultimately funded by whatever funds the base payout (today, effectively BigBoss's margin, since it's not separately charged to anyone) | Driver | Same as base | Same as base | Same as base |
| **Peak incentive** | Same as weather incentive | Driver | Same as base | Same as base | Same as base |
| **Waiting compensation** | The party that CAUSED the wait (existing Phase 4 attribution — currently only Supplier-pickup waiting is modeled, so effectively the Supplier funds it via a higher effective delivery cost) | Driver | Computed once, at `PICKED_UP`, separately from the base payout freeze | At `PICKED_UP` (already computed then) — proposed OWED transition same as base | If the pickup never happens (delivery cancelled before pickup — no waiting was ever billed, since it's computed only at the `PICKED_UP` transition itself) |
| **Cancellation compensation** | The party whose action caused the cancellation (§17) — undecided which stages qualify and for how much | Driver | A NEW obligation type, independent of (and mutually exclusive with) the base payout — a cancelled delivery either earns cancellation compensation OR normal payout, never both | At the moment of cancellation, once the compensation rule exists | Never — once granted, a cancellation compensation entry is a genuine, standalone obligation, not subject to the base payout's void condition |
| **Bonus** | Undecided (§9 of the Phase 5 proposal) — likely BigBoss (a marketing/retention cost) or a specific campaign budget | Driver | A NEW, delivery-optional obligation (some bonuses aren't tied to one delivery) | At the bonus-award event, whenever that's defined | Only if the bonus program itself defines a clawback condition (not proposed here) |

---

## 15. Delivery Company Commission — Configurable Models

| Model | Description |
|---|---|
| **Percentage commission** | Company retains a % of the fee, driver gets the rest — structurally identical to today's `driverPayoutSharePercent`, just made per-company instead of global |
| **Fixed fee** | Company retains a flat DT amount per delivery regardless of fee size |
| **Driver-first model** | Driver's payout is computed first (base+distance+time, or whatever formula is chosen per `docs/bigboss-delivery-financial-business-model.md` §8), and the company retains whatever's left of the fee — closest to today's actual default behavior |
| **Company-first model** | Company's commission is computed first (fixed or %), and the driver gets whatever's left, subject to the minimum guarantee (§16) as a floor |
| **Hybrid** | E.g., a small fixed dispatch fee PLUS a percentage — common in real-world logistics contracts |

**Where should this configuration live?**
```
BigBoss Admin      → authors/approves every contract (never self-service for a Company — a
                       contract is a negotiated real-world agreement, not a public rate card)
Delivery Company    → read-only visibility into its OWN current contract terms
Delivery            → snapshots the RESOLVED contract values at assignment time (never a live
                       lookup — see immutability below)
Contract (new table)→ the actual source of truth for the negotiated terms, versioned by
                       effectiveDate
```
**Historical deliveries retain exact contract terms used at the time**: this requires the contract table to be append-only-by-version (a renegotiation creates a NEW contract row with a new `effectiveDate`, never an in-place edit to the old one) and the delivery's frozen snapshot (or its ledger entries) to reference the SPECIFIC contract version that was active at assignment — exactly the same discipline Phase 1-4 already uses for pricing config (a later Admin change to `deliveryPricingSettings` never retroactively alters an already-frozen delivery).

---

## 16. Driver Minimum Guarantee

```
Calculated payout   = 4 DT   (illustrative — driverPayoutCents as computed today)
Guarantee            = 6 DT   (illustrative — NOT a proposed real value, see §33)
Top-up                = 2 DT   (= guarantee − calculated, only when calculated < guarantee)
```
**Who funds the 2 DT?** Genuinely undecided — three structurally distinct options, each with different ledger/actor implications:
1. **BigBoss absorbs it** — a `DRIVER_GUARANTEE_TOPUP` entry funded by BigBoss, reducing BigBoss's own margin (§20/§21) — treats the guarantee as a platform-level driver-welfare commitment.
2. **The Supplier/Delivery Company absorbs it** — the entity that dispatched the delivery is charged the top-up as a cost of operating on the platform — treats the guarantee as a marketplace STANDARD BigBoss enforces but doesn't itself fund.
3. **A blended rule** — e.g., BigBoss funds it for Supplier-mode (where BigBoss has more of a "fairness to gig-adjacent labor" interest) but Delivery Companies must honor their own contract's guarantee terms out of their own commission (§15).

**No default is chosen here.** This is explicitly a **BUSINESS DECISION REQUIRED** (§33, item 5) — the mechanism (a `max()` comparison producing a top-up entry) is fully specified and ready to implement the moment BigBoss decides who pays.

---

## 17. Cancellation — Financial Behavior By Stage

| Stage | Customer refund | Supplier impact | Driver compensation | Delivery Company compensation | BigBoss impact |
|---|---|---|---|---|---|
| **Before assignment** (`PENDING`/`AVAILABLE`/`ACCEPTED`, no driver) | Full refund of `cafeOwnerFeeShareCents` if already charged (depends on WHEN in checkout the charge actually occurs — order-level concern, outside this document) | Full refund of any subsidy/contribution already recorded | None — no driver committed | None — no driver committed | Any `bigBossSubsidyCents` reversed (§13) |
| **After assignment, before travel** (`ASSIGNED`, driver known but not yet moving) | Same as above | Same as above | Possibly a small commitment fee — **undefined amount** | Possibly a small commitment fee — **undefined amount** | Same as above, plus any commitment-fee cost |
| **After acceptance / travelling to pickup** (no distinct existing status for "travelling" — inferred from `assignedAt` having passed with no `arrivedAtPickupAt` yet) | Same as above (still full refund — the CUSTOMER didn't cause this) | Depends on WHO cancelled (§8's attribution principle) | Modest compensation justified (time/fuel spent, but not independently verified) — **undefined amount** | Same, proportional to its driver's committed effort | Same reversal, plus compensation cost |
| **Arrived at pickup** (`arrivedAtPickupAt` IS set — Phase 4's real, verifiable evidence) | Same as above | Same as above, but this stage has an OBJECTIVE, timestamped basis for compensation, unlike earlier stages | Higher, justified compensation — still **undefined amount**, but the EVIDENCE for it already exists in the schema today | Same | Same |
| **After pickup / during delivery** (`PICKED_UP`/`IN_TRANSIT`) | **Not a normal cancellation** — the existing `DELIVERY_TRANSITIONS` state machine already does NOT allow `CANCELLED` from `PICKED_UP`/`IN_TRANSIT` (verified in code) — this is correctly treated as a delivery-failure/return scenario, out of this document's scope |

**Who funds cancellation compensation, in general**: attribution-based — the party whose decision caused the cancellation (Supplier, Coffee Owner via the order-cancel flow, or BigBoss itself for a platform-side reason like a safety `SUSPEND`) bears the cost; a driver/company should never be financially penalized for a cancellation they didn't cause, and should never be UNDER-compensated for real, evidenced effort (the `arrivedAtPickupAt` timestamp being the one stage with objective proof).

---

## 18. Waiting Time — Supplier vs. Customer/Dropoff

**Current implementation**: only SUPPLIER-side pickup waiting exists (`arrivedAtPickupAt` → billed once at `PICKED_UP`, per Phase 4). This document does **not** propose changing that implementation.

**Should supplier waiting and customer/dropoff waiting be treated differently?** Yes, for a structural reason already implicit in the existing design: pickup waiting has an objective cause (the Supplier wasn't ready) that the DRIVER experiences and the SUPPLIER controls — a clean attribution. Dropoff/customer waiting is murkier: in a B2B model, the "customer" is the Coffee Owner's premises, and a driver waiting there could be caused by the Coffee Owner (not present/ready to receive) OR by circumstances outside anyone's control (a busy café) — attribution is less clean, and this is likely WHY it was never implemented in Phase 4. This document recommends dropoff/customer waiting remain **unimplemented** until a clear, evidenced attribution mechanism (mirroring `arrivedAtPickupAt`, e.g. an `arrivedAtDropoffAt` capture) is deliberately designed — not because it's unimportant, but because copying the pickup pattern naively risks billing a Coffee Owner for a wait that wasn't actually their fault.

```
Free waiting           = existing waitingFreeMinutes (global, Phase 4)
Customer-billable waiting = NOT IMPLEMENTED for dropoff (only pickup exists)
Driver compensation      = existing waitingDriverCompensationPerMinuteCents (pickup only)
Supplier responsibility  = existing (pickup waiting is effectively always attributed to the
                            Supplier today, since it's the only kind that's billed at all)
```

---

## 19. Refunds — Financial Behavior

| Event | Behavior (design, not implemented) |
|---|---|
| Full order refund | Every delivery-scoped `CUSTOMER_DELIVERY_CHARGE`/`SUPPLIER_CONTRIBUTION`/`BIGBOSS_SUBSIDY` entry for every sub-order in the order gets a paired `REFUND` entry |
| Partial order refund (e.g., partial item cancellation) | A proportional `REFUND` entry against the specific delivery's charge, scoped to the delta only |
| Delivery fee refund specifically | A `REFUND` entry scoped to just `CUSTOMER_DELIVERY_CHARGE`, leaving product-total entries (outside this document) untouched |
| Supplier-funded refund | `REFUND` against `SUPPLIER_CONTRIBUTION` |
| BigBoss-funded refund | `REFUND` against `BIGBOSS_SUBSIDY`, with the originating campaign's budget credited back (§13) |
| Driver compensation after a refund | NOT a refund itself — a separate `CANCELLATION_COMPENSATION` entry if the driver had already committed real effort (§17), coexisting with whatever refund entries the customer/supplier side also generated |
| Delivery-company compensation after a refund | Same principle as driver compensation — independent of whether/how much was refunded to the customer |

**Critical rule, restated from the Phase 5 proposal and re-affirmed here**: a refund is **always a NEW entry that reverses a prior one** — it must never rewrite, delete, or silently adjust the original `CUSTOMER_DELIVERY_CHARGE`/`DRIVER_PAYOUT`/etc. entry. The original entry's `status` moves to `REFUNDED`; its `amountCents` and every other field remain exactly as originally recorded, forever.

---

## 20. Cash on Delivery — Explicit Business Decision Required

**Current implementation**: `paymentMethod` includes `'CASH_ON_DELIVERY'` as an option on orders (confirmed present in the order-creation request type). **No delivery-specific financial logic distinguishes COD from any other payment method anywhere in `server/storage.ts`'s delivery code** — the pricing/payout/subsidy/budget engines compute identical numbers regardless of `paymentMethod`.

This means, precisely:
- **Does the customer pay the driver?** Unknown/undefined — COD conceptually implies SOMEONE collects cash at the door, but nothing in the delivery model specifies whether that's the driver, and if so, what the driver is supposed to do with cash that (per the pricing model) is partly the Coffee Owner's contribution and partly meant to fund the driver's OWN payout (a driver essentially "paying themselves" out of collected cash, which needs an explicit reconciliation rule, not an assumption).
- **Does the customer pay the Supplier?** Unknown — if the driver is the Supplier's own staff, this is more plausible (cash effectively goes to the Supplier's own operation), but this is not stated anywhere in the system.
- **Does the customer pay BigBoss?** Almost certainly not, structurally — BigBoss has no cash-collection touchpoint anywhere in the reviewed code.
- **Who records the receivable?** Nothing does, today.
- **Who eventually owes whom?** Entirely undefined.

```text
BUSINESS DECISION REQUIRED
```
This document explicitly does NOT invent an answer. COD's interaction with the delivery financial model — specifically, how a cash collection event reconciles against the computed `cafeOwnerFeeShareCents`/`driverPayoutCents`/`companyPayoutCents` figures — must be resolved by BigBoss before any ledger/settlement implementation proceeds, because it directly determines whether COD deliveries even NEED an "OWED"/"PAID" ledger progression (if cash is collected instantly, in person, by the very party the money is ultimately owed to, there may be NOTHING for BigBoss's settlement layer to do for that specific leg) or whether COD needs its OWN distinct reconciliation entry type in the ledger (e.g., a `CASH_COLLECTED` entry that offsets what would otherwise be an `OWED` `DRIVER_PAYOUT`).

---

## 21. BigBoss Revenue Model

| Possible revenue source | Currently active in the codebase? |
|---|---|
| Marketplace commission (a % of delivery fee retained by BigBoss) | **No** — `driverPayoutSharePercent` defaults to 100%, meaning the entire fee is distributed to driver/company; no code path retains any portion for BigBoss |
| Delivery margin (BigBoss profits from mispricing between what it collects and what it pays out) | **No** — `DeliveryBudgetEngine`'s `FUNDED` result (funding > cost) is possible today but is NOT harvested as revenue anywhere; it's purely a reporting signal |
| Delivery service fee (a flat fee BigBoss charges independent of the delivery fee itself) | **No** such fee exists in the schema or pricing pipeline |
| Supplier subscription | **Not found** anywhere in the reviewed delivery-related code (may exist elsewhere in the platform for non-delivery features — outside this document's scope) |
| Delivery company commission (BigBoss taking a cut of what it pays a Delivery Company) | **No** — `companyPayoutCents` is entirely retained by the company; BigBoss extracts nothing |
| Promotional fees (e.g., charging a Supplier to run a subsidized-delivery campaign) | **No** — no campaign engine exists at all (§13) |
| Other | **None found** |

**BigBoss currently has ZERO active delivery-related revenue sources in the codebase.** Every `FUNDED` outcome the Budget Engine detects today is a theoretical surplus that is never captured — it simply means the customer/supplier contribution happened to exceed the driver/company cost, and that difference currently evaporates (it's not recorded as BigBoss revenue anywhere, nor is it returned to anyone — it's simply an unexploited number). This is a significant, concrete finding: **if BigBoss wants a delivery revenue model, it must be explicitly designed and built — nothing today implicitly provides one.**

**Separation, restated**: revenue (money BigBoss is entitled to keep) ≠ subsidy (money BigBoss gives away) ≠ cost (money BigBoss must pay out, e.g. a future guarantee top-up it chooses to fund) ≠ margin (revenue − cost − subsidy, the NET result, which can be positive, zero, or negative, and today is uniformly and exactly zero by construction).

---

## 22. Who Bears the Loss — Deficit Attribution

The `DeliveryBudgetEngine` already detects `DEFICIT` (verified live: a real scenario where weather+peak incentives pushed `driverPayoutCents` above the funded amount, correctly flagged, never blocked). **What happens FINANCIALLY when this occurs is entirely undefined today** — the delivery still completes normally, the driver still receives the full computed `driverPayoutCents`, and NOTHING currently identifies who, if anyone, is out of pocket for the shortfall.

Proposed attribution logic, by cause:
```
FUNDED       — surplus exists; under the recommended revenue model (§21, once one is chosen),
               this could become BigBoss revenue, or simply be left unclaimed as today
BREAK_EVEN   — no loss, no gain; no attribution needed
DEFICIT      — attribute based on WHY the deficit occurred:
   • caused by a weather/peak INCENTIVE BigBoss's own config enabled  → BigBoss bears it
     (BigBoss chose to incentivize the driver beyond what the customer-side pricing was
     configured to cover — a direct consequence of a BigBoss configuration decision)
   • caused by a minimum GUARANTEE top-up (§16)                        → depends entirely on
     which of §16's three options BigBoss chooses — this is the SAME undecided question,
     not a new one
   • caused by an under-priced vehicle/zone/minimum-fee configuration  → arguably BigBoss
     (a pricing-configuration problem, not any specific delivery's fault) — but could also be
     argued as "the cost of doing business in that zone," which a Supplier/Company contract
     could explicitly price in (§15) once contracts exist
```
**No default attribution rule is chosen here.** This is explicitly a **BUSINESS DECISION REQUIRED** (§33, item 9) — the DETECTION mechanism is fully built and tested (Phase 4); the FINANCIAL CONSEQUENCE of a detected deficit is not, and should not be inferred from this document.

---

## 23. Financial Obligation — Precise State Definitions

```
CALCULATED  — an engine has computed an amount. This is ALL that exists today for EVERY figure
              in the deliveries table (deliveryFee, driverPayoutCents, companyPayoutCents,
              supplierSubsidyCents, every incentive/waiting field). A CALCULATED amount can
              still change right up until feeFinalizedAt is set (the provisional-estimate → frozen
              transition, Phase 1's own documented behavior) — before that point it isn't even a
              stable calculation, let alone an obligation.
AUTHORIZED  — the calculation is now considered FINAL and correct (today: implicitly, the moment
              feeFinalizedAt is set — but this is not currently a distinct, named, queryable state;
              it's inferred from a timestamp's presence)
OWED        — AUTHORIZED and now understood as a genuine debt someone (Supplier/Company/BigBoss,
              depending on the collection model, §6) owes to someone else (Driver/Company/Coffee
              Owner) — DOES NOT EXIST as a concept anywhere in the current system
EARNED      — the delivery reached DELIVERED, so the underlying WORK justifying the payout is
              complete (today: exactly what the derived, non-persisted payoutStatus='EARNED'
              already represents — the closest thing to OWED that exists today, but it is a
              STATUS LABEL derived from delivery status, not a financial record)
PAID        — money has ACTUALLY moved. DOES NOT EXIST anywhere in the current system, under
              either collection model, for any actor, for any amount, ever.
REFUNDED    — a PAID or OWED amount was reversed. DOES NOT EXIST today (§19).
VOID        — an amount that should never count (e.g., CANCELLED before real effort) — today:
              approximated by payoutStatus='VOID', again a derived label, not a ledger fact.
DISPUTED    — a party contests an amount — DOES NOT EXIST today in any form.
```

**The distinction this section exists to make unmistakable**: `driverPayoutCents` is, today, permanently stuck at `CALCULATED` (with `payoutStatus` giving a rough, derived approximation of `EARNED`/`VOID`/`PENDING` on top of it) — it never becomes `OWED`, `PAID`, `REFUNDED`, or `DISPUTED`, because none of those states are tracked anywhere. **The "actual payable amount"** — what a Supplier, Delivery Company, or (under Model A) BigBoss genuinely needs to hand over in real money — does not exist as a distinct figure from `driverPayoutCents` today; it is Phase 5's entire reason for existing.

---

## 24. Settlement

**Who settles with whom** (depends on the Model A/B decision, §6):
- Under Model B (recommended): **Supplier ↔ its own Driver** (entirely outside BigBoss); **BigBoss ↔ Delivery Company** (for the gross amount, if BigBoss ever becomes even a partial intermediary for this relationship specifically — see the hybrid note in §6) or **Delivery Company ↔ its own Driver + whoever pays the Company** (fully outside BigBoss, under pure Model B).
- Under Model A: **BigBoss ↔ Supplier**, **BigBoss ↔ Delivery Company**, and (only if BigBoss chooses to disburse driver payouts directly rather than through the Supplier/Company) **BigBoss ↔ Driver**.

**Settlement frequency**: proposed Admin-configurable (weekly/bi-weekly/monthly), not hard-coded, per the Phase 5 proposal §18 — no default chosen here.

**Minimum settlement threshold**: a genuinely new question this document surfaces explicitly — should a Driver/Company with a very small outstanding balance (e.g., 3 DT) be settled every period regardless, or should amounts below a threshold roll forward to the next period to reduce transaction overhead? **Undecided — BUSINESS DECISION REQUIRED** (not explicitly listed in the Phase 5 proposal; added here as a genuinely new consideration this document's closer settlement-frequency focus surfaced).

**Settlement status**: `PENDING → READY → PROCESSING → PAID / FAILED / DISPUTED` (unchanged from the Phase 5 proposal §18).

**Payment confirmation**: proposed as a `paymentReference` field recorded on the settlement (a bank transfer ID, a manual Admin note, or a future payment-provider webhook payload reference) — no payment provider is assumed (§18 of the Phase 5 proposal, restated).

**Failed payment**: the settlement moves to `FAILED`, its underlying `OWED` ledger entries remain `OWED` (never silently marked `PAID`), and a retry creates a NEW settlement attempt referencing the same entries — never a mutation of the failed one.

**Dispute**: freezes the specific contested ledger entries (`DISPUTED` status, §13/§23) until an Admin resolves them via an `ADJUSTMENT` entry (§28) — the surrounding settlement can still proceed for every OTHER, undisputed entry in the same batch (a dispute should never hold an entire settlement period hostage for every other actor/entry unrelated to it).

---

## 25. Balances — Derived vs. Stored

**Recommendation (restated and reaffirmed from the Phase 5 proposal, §19): derive balances from the ledger; do not maintain a separately-updated balance table as the source of truth.**

**Reasoning, specific to auditability**: a stored, incrementally-updated balance is only as trustworthy as the code path that updates it — any bug, race condition, or missed edge case (a refund that forgot to decrement, a settlement that forgot to zero out) silently corrupts the "official" number while the underlying ledger (if it still exists alongside) would show the true picture, creating exactly the kind of two-sources-of-truth discrepancy that makes financial audits fail. A pure ledger, by contrast, is trivially auditable: "what is Driver X owed right now" is always `SUM(amountCents) WHERE actorId=X AND status='OWED'`, a query anyone (including an external auditor) can independently verify against the raw event log, with no possibility of drift because there is nothing BUT the events. A read-optimized materialized view/summary table is acceptable and likely necessary at scale, but strictly as a CACHE of the ledger's own truth, rebuildable from it at any time — never as an independently-maintained figure.

---

## 26. Ledger Rules — Entries and Required Fields

Restating and finalizing the entry-type list from the Phase 5 proposal (§12 there), confirmed complete against everything this document's scenario analysis (§7-20) actually needs:

```
CUSTOMER_DELIVERY_CHARGE, SUPPLIER_CONTRIBUTION, BIGBOSS_SUBSIDY, DRIVER_PAYOUT,
DELIVERY_COMPANY_PAYOUT, DRIVER_INCENTIVE (weather/peak, unified), WAITING_COMPENSATION,
CANCELLATION_COMPENSATION, DRIVER_GUARANTEE_TOPUP, DRIVER_BONUS, BIGBOSS_REVENUE, BIGBOSS_COST,
REFUND, ADJUSTMENT, SETTLEMENT (a reference/marker entry type, distinct from the DeliverySettlement
record itself — represents "this batch of entries was included in settlement #N", useful for
querying "which ledger entries were part of settlement X" without a separate join table)
```

For every entry (fields, restated from the Phase 5 proposal §12, confirmed sufficient):
```
id, entryType, amountCents (always positive), currency ("TND"), direction (CREDIT/DEBIT),
actorType, actorId, counterpartyType, counterpartyId (nullable), deliveryId (nullable only for
non-delivery-scoped entries like a standalone DRIVER_BONUS), orderId, subOrderId (denormalized),
status (§23), createdAt, effectiveAt, reference, idempotencyKey (unique), reversedByEntryId
(nullable self-reference)
```
No field is added or removed from the Phase 5 proposal's design here — this document's scenario-by-scenario analysis (§7-22) confirms every field is actually necessary and none is superfluous.

---

## 27. Immutability — What Freezes When

| Milestone | What freezes (already true today, Phases 1-4) | What NEW Phase 5 concept freezes at the same moment |
|---|---|---|
| **Pricing finalization** (`feeFinalizedAt` set, at driver assignment) | `deliveryFee`, both shares, subsidy amounts, all Phase 1-4 pipeline/weather/peak/zone/payout/budget snapshot fields | The corresponding `CUSTOMER_DELIVERY_CHARGE`/`SUPPLIER_CONTRIBUTION`/`BIGBOSS_SUBSIDY`/`DRIVER_PAYOUT`/`DELIVERY_COMPANY_PAYOUT` ledger entries are WRITTEN here (their `amountCents` is a permanent copy of the frozen snapshot value) |
| **Assignment** | Same moment as pricing finalization today (they're the same event) | Same |
| **Pickup** (`PICKED_UP`, only if `arrivedAtPickupAt` was set) | `waitingMinutesBilled`/`waitingCustomerFeeCentsUsed`/`waitingDriverCompensationCentsUsed` — written once, here, never touched again | `WAITING_COMPENSATION` ledger entry written here |
| **Delivery completion** (`DELIVERED`) | Nothing new is written to the `deliveries` row itself (status change only) | The corresponding ledger entries move from `CALCULATED`/`AUTHORIZED` to `OWED` (proposed) |
| **Cancellation** | Nothing on the `deliveries` row's financial fields is rewritten (only `status`/`cancelledAt`) | A `CANCELLATION_COMPENSATION` entry may be created (§17); relevant charge/contribution entries may receive paired `REFUND` entries (§19) — the delivery's OWN frozen snapshot is never touched, exactly as today |
| **Settlement** | N/A (does not exist today) | The settlement record itself is append-only-by-status-progression (§24) — never rewritten, only advanced forward or explicitly `FAILED` |

---

## 28. Manual Admin Adjustments

```
Who can create one?      Admin only (matches the existing requireAdmin pattern used for every
                          Phase 1-4 financial-configuration route — no exception proposed)
Why?                      Correcting a genuine error, honoring a support/goodwill decision,
                          resolving a dispute (§24/§13)
Approval?                 The creating Admin IS the approval — no separate multi-step approval
                          workflow is proposed (a genuinely new decision if BigBoss wants one —
                          see §33)
Audit trail?              Every adjustment is itself a permanent, immutable ledger entry —
                          self-auditing by construction (no separate audit table needed for
                          adjustments specifically, though the broader adminAuditLog from the
                          Phase 5 proposal §22 still covers CONFIGURATION changes, a different
                          concern from adjustment TRANSACTIONS)
Original amount?          Never touched — remains exactly as originally computed/frozen
Adjustment amount?        A new, separate ADJUSTMENT entry, reference-linked to what it corrects
Final economic result?    The SUM of the original entry + all its adjustments, computed at
                          read/settlement time — never a rewritten single number
```
```
Example:
Original DRIVER_PAYOUT entry:  800 cents (CALCULATED → OWED), NEVER EDITED
Admin ADJUSTMENT entry:        +200 cents, reference="DRIVER_PAYOUT:<id>",
                                reason="driver reported shorted payout — verified"
Final economic result:         800 + 200 = 1000 cents (a sum, not a stored single value)
```

---

## 29. Role Visibility — Final Matrix

| Role | Sees |
|---|---|
| Coffee Owner | Own `CUSTOMER_DELIVERY_CHARGE`, own `REFUND` entries against it — nothing else |
| Supplier | Own `SUPPLIER_CONTRIBUTION`/subsidy entries; `DRIVER_PAYOUT` only for its own SUPPLIER-mode deliveries (existing Phase 3/4 rule, unchanged); own future settlement |
| Supplier Driver | Own `DRIVER_PAYOUT`, `DRIVER_INCENTIVE`, `WAITING_COMPENSATION`, `DRIVER_GUARANTEE_TOPUP`, `DRIVER_BONUS`, `CANCELLATION_COMPENSATION`; own settlement |
| Delivery Company | Own `DELIVERY_COMPANY_PAYOUT`; its drivers' `DRIVER_PAYOUT` (existing Phase 3/4 rule); own settlement |
| Delivery Company Driver | Same shape as Supplier Driver |
| Admin | Everything, unredacted, including `BIGBOSS_REVENUE`/`BIGBOSS_COST`/`BIGBOSS_SUBSIDY`/margin |

**BigBoss internal margins must never leak**: this is not a new rule — it is the EXACT existing behavior of `redactDeliveryCodes` today, which already hard-codes `bigBossSubsidyCents`/`budgetResultUsed`/`budgetDeficitCentsUsed` to `null` for every non-Admin role (verified in code, Phase 4). Every new ledger entry type this document proposes follows the identical, already-established pattern — no new visibility PRINCIPLE, only new fields obeying the same principle.

---

## 30. Future Compatibility

| Future feature | Why this business-rules model already accommodates it |
|---|---|
| `DemandPricingEngine` | The pipeline slot (`demandMultiplierPermilleUsed`) already exists, unused — a future demand-driven customer charge and driver incentive are just new `CUSTOMER_DELIVERY_CHARGE`-affecting inputs and a new `DRIVER_INCENTIVE`-typed entry, structurally identical to today's weather/peak (Phase 5 proposal §27) |
| `DriverOfferEngine` / Driver Accept/Decline | An offer preview needs exactly the fields `getAssignableDriversForDelivery` (Phase 3) already assembles, plus a "guaranteed payout" preview (§16's formula, computed but not yet ledgered until real acceptance) — no ledger redesign needed (Phase 5 proposal §28) |
| Driver bonuses | Already scoped as `DRIVER_BONUS`, a nullable-`deliveryId` entry type (§9 of the Phase 5 proposal, §14 here) |
| Batching/Consolidation | Recommended default: keep one `deliveries` row per sub-order with a shared route grouping concept layered ABOVE the money (never redistributing cost across deliveries) — requires zero ledger changes under this default; true shared-cost apportionment is flagged as a separate, harder problem needing its own proposal (Phase 5 proposal §29) |
| Advanced Analytics | Every KPI in `docs/bigboss-delivery-financial-business-model.md` §37 is a direct aggregate over the ledger once it exists — no additional data source needed |
| Online Payments | Fits naturally under a future Model-A-leaning hybrid (§6) — the ledger's `OWED`→`PAID` transition is payment-rail-agnostic by design; introducing a real payment provider only affects HOW `PAID` is reached, not the ledger's shape |
| Wallets | A wallet is, structurally, just a materialized balance view (§25) with a spend/withdraw UI on top — the ledger remains the source of truth underneath it, exactly as recommended |
| Payout providers | Same as Online Payments — `paymentReference` on a settlement record already accommodates any provider's confirmation data without a settlement-model redesign |

---

## 31. Edge Cases

| Edge case | Expected financial behavior |
|---|---|
| Multi-supplier orders | Fully independent per delivery, §10, verified structurally today |
| Self Pickup | Zero financial events possible, structurally, §9 |
| Supplier cancellation | Compensation/refund attributed to the Supplier (§17), driver compensated per stage |
| Customer cancellation | Compensation/refund attributed to the Coffee Owner's action (via the order-level cancel flow), driver still compensated per stage if effort occurred |
| Driver cancellation | Not currently a distinct concept (no driver accept/decline exists) — today's only path is an Admin/Supplier/Company-initiated `CANCELLED`; once driver decline exists (§30), a driver-caused cancellation should generally NOT trigger compensation TO that same driver (they caused it) |
| Driver reassignment | `reassignDriver` already re-freezes pricing/payout for the NEW driver (Phase 1-4, unchanged) — the ORIGINAL driver's now-superseded entitlement should be explicitly VOIDED (proposed) if any ledger entry had already been written for them, never silently dropped |
| Delivery company reassignment | No such mechanism currently exists in the codebase (a delivery is dispatched to one company via `dispatchDelivery`, and reassignment between COMPANIES is not implemented) — flagged as a genuine gap, not addressed further here |
| Weather restriction (`RESTRICT`/`SUSPEND`) | Blocks assignment entirely (existing Phase 4 behavior) — no financial event is possible for a delivery that was never assigned; no compensation is owed since nothing was ever committed |
| Vehicle incompatibility | Blocks assignment (existing Phase 2 behavior) — same as above, no financial event |
| Waiting time | §18, supplier-pickup only, existing |
| Free shipping | §11/§12, existing, unchanged |
| BigBoss subsidy | §13, mechanism defined, not yet funded (always 0) |
| Delivery deficit | §22, detection exists (Phase 4), financial consequence undecided |
| Refund after driver pickup | The driver's `DRIVER_PAYOUT`/`WAITING_COMPENSATION` entries are NOT reversed by a subsequent customer-side refund — the driver already performed real work; only the customer/supplier-side `CUSTOMER_DELIVERY_CHARGE`/`SUPPLIER_CONTRIBUTION` entries are refunded, per §19's principle that compensation and refund are independent |
| Refund after delivery | Same principle — a post-delivery refund (e.g., a quality complaint) should refund the customer's charge without automatically clawing back the driver's already-earned payout, UNLESS the specific refund reason implicates the driver (a genuinely separate, Admin-judgment-driven `ADJUSTMENT`, not an automatic rule) |
| Duplicate events | Idempotency keys prevent duplicate ledger entries (§25 of the Phase 5 proposal, restated) |
| Duplicate settlement | A `settlementId` reference on each paid entry structurally prevents a second settlement from re-selecting an already-settled entry |
| Failed settlement | §24 — entries remain `OWED`, a new settlement attempt is created, never a silent retry-in-place |
| Manual adjustment | §28 — always additive, never a rewrite |

---

## 32. Final Decision Table

| Scenario | Customer Pays | Supplier Pays | Driver Earns | Delivery Company Earns | BigBoss Pays | BigBoss Earns | Final Obligation (proposed) |
|---|---|---|---|---|---|---|---|
| **Supplier delivery** | `cafeOwnerFeeShareCents` | `supplierFeeShareCents` | `driverPayoutCents` | — (n/a, no company) | 0 (today) | 0 (today) | Supplier owes Driver `driverPayoutCents` (Model B) |
| **Delivery company** | `cafeOwnerFeeShareCents` | `supplierFeeShareCents` | `driverPayoutCents` | `companyPayoutCents` | 0 (today) | 0 (today) | Company owes Driver `driverPayoutCents`; whoever funds the Company (per §6) owes Company `companyPayoutCents` |
| **Self Pickup** | 0 | 0 | — (n/a) | — (n/a) | 0 | 0 | None — no delivery, no obligation possible |
| **Free delivery** (100% supplier subsidy) | 0 | `deliveryFee` (all of it, as `supplierSubsidyCents`) | `driverPayoutCents` (unaffected — never reduced by a subsidy) | if applicable, unaffected | 0 | 0 | Supplier owes Driver, same as normal Supplier delivery — only the FUNDING side changed |
| **BigBoss subsidy** (e.g. partial) | reduced by the subsidized amount | reduced or unaffected, depending on stacking (§13) | `driverPayoutCents` (unaffected) | if applicable, unaffected | `bigBossSubsidyCents` (VARIABLE — not yet real, §13) | 0 | BigBoss owes whoever the subsidy was meant to relieve — the reduction itself IS the "payment," no separate transfer needed |
| **Cancellation** | Refund of whatever was charged (VARIABLE by stage, §17) | Refund of its contribution (VARIABLE by stage) | `CANCELLATION_COMPENSATION` (VARIABLE, undecided amount, §17) | Same, if applicable | Refund processing + any subsidy reversal | 0 | Whoever caused the cancellation bears the net cost (§17) |
| **Refund** | Receives money back (VARIABLE by refund type, §19) | May receive its contribution back (VARIABLE) | Payout is NOT automatically clawed back (§31) | Same | Reverses any subsidy given (§13) | 0 | New `REFUND` entries only — original entries never rewritten |

*(VARIABLE = depends on a business decision this document explicitly does not make — see §33.)*

---

## 33. Final Business Decisions Required

### 1. Who collects delivery money — Model A, Model B, or hybrid?
**Why it matters**: determines whether BigBoss becomes a financial intermediary/custodian (with attendant regulatory/operational weight) or remains a pure computation/marketplace layer. **Possible models**: Model A (intermediary), Model B (marketplace only, recommended), hybrid (Model B default + Model A for Delivery Company/subsidy legs). **Consequences**: Model A requires building real money-movement infrastructure; Model B requires none but limits BigBoss's direct revenue-capture options until a separate fee mechanism is added. **Recommended architecture**: Model B as default, hybrid as the natural evolution (§6) — final choice remains BigBoss's.

### 2. Delivery Company commission model
**Why it matters**: determines whether Delivery Company partnerships are commercially sustainable for both sides. **Possible models**: percentage, fixed fee, driver-first, company-first, hybrid (§15). **Consequences**: affects company retention/willingness to partner, and BigBoss's own margin if it ever takes a cut of the commission. **Recommended architecture**: per-company contract table (§15), no default rate chosen.

### 3. Driver minimum guarantee — amounts and who funds top-ups
**Why it matters**: protects driver income floor; directly determines BigBoss's or Suppliers'/Companies' worst-case per-delivery cost exposure. **Possible models**: BigBoss-funded, Supplier/Company-funded, blended (§16). **Consequences**: a BigBoss-funded guarantee is a real, recurring platform cost; a Supplier/Company-funded one shifts that risk but could reduce partner willingness. **Recommended architecture**: per-vehicle-type table with optional per-contract override — funding source undecided.

### 4. Cancellation compensation amounts and stage rules
**Why it matters**: balances driver/company trust against abuse risk (§36 of the Phase 5 proposal). **Possible models**: flat fee per stage, percentage-of-expected-payout, evidenced-stage-only (only compensate once `arrivedAtPickupAt` exists) (§17). **Consequences**: too generous invites gaming; too stingy erodes driver trust in accepting assignments. **Recommended architecture**: per-stage, per-vehicle table — no amounts chosen.

### 5. Who funds minimum-guarantee top-ups specifically
**Why it matters**: a narrower, more urgent sub-question of #3 — this is the FIRST real money-attribution decision the guarantee mechanism needs before it can be turned on at all. **Possible models**: BigBoss, Supplier/Company, blended (§16). **Consequences**: same as #3. **Recommended architecture**: same as #3 — this is listed separately because it's the most immediately-blocking unresolved question in the whole guarantee design.

### 6. Settlement frequency and minimum threshold
**Why it matters**: affects cash-flow predictability for every actor and BigBoss's own operational overhead running settlement batches. **Possible models**: weekly/bi-weekly/monthly; threshold-based rollover vs. always-settle (§24). **Consequences**: more frequent settlement improves driver/company trust and cash flow but increases processing overhead; a threshold reduces overhead but delays small-balance actors' access to their earnings. **Recommended architecture**: Admin-configurable, no default chosen.

### 7. Cash-on-Delivery money flow
**Why it matters**: COD already exists as a payment method, but nothing defines how a cash-collection event reconciles against the computed delivery economics (§20) — this is arguably the SINGLE most urgent unresolved question, since it may be actively happening in production today with no financial model behind it at all. **Possible models**: driver-collects-and-self-pays, driver-collects-and-remits-to-Supplier, driver-collects-and-remits-to-BigBoss (only under Model A). **Consequences**: directly determines whether a `CASH_COLLECTED` ledger entry type is needed and whether COD deliveries need a settlement step at all. **Recommended architecture**: none proposed — flagged as the most urgent decision in this entire document.

### 8. BigBoss delivery revenue model
**Why it matters**: today BigBoss earns exactly 0 from delivery, by construction (§21) — any monetization requires an explicit, deliberate design. **Possible models**: commission on fee, flat service fee, margin capture (harvesting `FUNDED` surpluses), Delivery-Company-side commission, none (delivery remains a value-added feature, monetized elsewhere on the platform). **Consequences**: directly shapes whether Coffee Owners/Suppliers ever see a BigBoss-attributable delivery charge distinct from driver/company compensation. **Recommended architecture**: none proposed — this is a foundational product-monetization decision, not a technical one.

### 9. Who bears delivery deficits
**Why it matters**: the Budget Engine already detects `DEFICIT` live (§22) but nothing currently happens financially when it occurs. **Possible models**: BigBoss absorbs all, Supplier/Company absorbs (via contract terms), cause-based attribution (BigBoss absorbs deficits its OWN config decisions created; Supplier/Company absorbs deficits from under-priced zones/vehicles). **Consequences**: directly affects BigBoss's worst-case exposure per delivery and whether Suppliers/Companies need deficit-risk clauses in their contracts. **Recommended architecture**: none proposed.

### 10. Refund responsibility in ambiguous cases
**Why it matters**: not every cancellation/refund has a clean "whose fault" answer — some will require ongoing manual Admin judgment even after every rule above is decided. **Possible models**: fully automated rule table (fast, but will sometimes be wrong), Admin-reviewed-by-default (slower, always correct), automated-with-Admin-override (hybrid). **Consequences**: affects operational load on Admin vs. risk of an automated system making a financially/relationship-damaging wrong call. **Recommended architecture**: none proposed — likely a hybrid, but the exact threshold for "automatic vs. needs review" is a business judgment call.

### 11. Minimum settlement threshold (surfaced newly in §24)
**Why it matters**: a genuinely new question this document's settlement-frequency analysis surfaced that wasn't explicitly named in the Phase 5 proposal. **Possible models**: always settle every period regardless of amount, roll forward below a threshold. **Consequences**: transaction overhead vs. driver/company access-to-earnings delay. **Recommended architecture**: none proposed.

### 12. Approval workflow for manual adjustments
**Why it matters**: §28 currently proposes "the creating Admin IS the approval" (single-actor) — BigBoss may want a two-person/maker-checker rule for adjustments above a certain size, given they directly move money attribution. **Possible models**: single-Admin, dual-approval-above-threshold, always-dual. **Consequences**: fraud/error risk vs. operational friction. **Recommended architecture**: none proposed.

---

## STATUS:
## BUSINESS SPECIFICATION ONLY
## NO CODE CHANGES MADE
## NO DATABASE CHANGES MADE
## NO BUSINESS VALUES INVENTED
