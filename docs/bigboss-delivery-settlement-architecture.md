# BigBossCoffee Delivery — Phase 5C Settlement Architecture

### Status: **MOSTLY IMPLEMENTED** as of Phase 5C.2. `settlements`/`settlement_items` (§23, "5C.1"), `payments` (§13, "5C.2"), a minimal `cod_reconciliations` (§11), `refunds` (§9), and `adjustments` (§10) are all now built — see `docs/bigboss-delivery-financial-strategy.md` for the complete as-built behavior across every layer. Still architecture/design only, deliberately not implemented: `payment_attempts`, any real payment-provider integration/webhook, disputes, financial closing, full Admin GMV-style reporting, and every item §25 lists as an unresolved business decision (commission structures, driver minimum guarantee, cancellation compensation, deficit responsibility, settlement batching/frequency policy, COD discrepancy responsibility).

This document's original analysis (as of Phase 5B hardening) proposed the target architecture for the settlement/payment layers; `docs/bigboss-delivery-financial-strategy.md` records what was actually built on top of it, including the few points where implementation deliberately diverged from or narrowed this proposal (e.g. one settlement per delivery per actor rather than any batching engine). The business decisions below remain open regardless of what has since been implemented — nothing in Phase 5C.1/5C.2 resolves any of them.

Builds on: `docs/bigboss-delivery-financial-ledger.md` (Phase 5A), `docs/bigboss-delivery-financial-visibility.md` (Phase 5B + hardening), `docs/bigboss-delivery-financial-business-model.md`, `docs/bigboss-delivery-phase5-financial-settlement-proposal.md`, `docs/bigboss-delivery-business-rules-money-flow.md`.

---

## 1. Four Distinct Concepts

The single biggest source of financial bugs in delivery/marketplace systems is collapsing these into one. They must stay strictly separate, at every layer (naming, storage, and mental model):

| Concept | Question it answers | Where it lives today | Mutability |
|---|---|---|---|
| **Pricing** | "What should this delivery cost, given current conditions?" | `computeDeliveryFee` / `runDeliveryPricingPipeline` (Phase 1–4 engines) | Recomputed freely until frozen at assignment |
| **Economic Obligation** | "Who owes what to whom, as of a specific business event?" | `deliveryFinancialLedger` (Phase 5A/5B) | Append-only; a `CALCULATED` entry is frozen at write time, never edited — only voided by writing a new status row |
| **Settlement** | "When and how is that obligation grouped, approved, and scheduled to be paid?" | **Does not exist yet** — this document's primary subject | Would progress through a small state machine, one direction only |
| **Actual Payment** | "Did money actually move, through which rail, and can we prove it?" | **Does not exist yet** | Represents an external, physically-verified fact; never inferred, always confirmed |

A pricing figure is a *quote*. An obligation is a *fact about responsibility*, frozen once. A settlement is a *batch/approval wrapper* around one or more obligations. A payment is *evidence money moved*. Today the system has the first two. This document designs the last two without touching the first two's existing behavior.

**Rule that governs every design decision below**: a settlement or payment record may **reference** a ledger entry and **summarize** it, but must never **rewrite** it. If a settlement is voided, refunded, or adjusted, the correction is a **new** ledger/settlement entry, never an edit to the original.

---

## 2. Complete Money Flow, Case by Case

Each case traces money from customer to final recipient, and identifies exactly which layer (Pricing/Obligation/Settlement/Payment) is responsible for each step. Amounts are illustrative structure, not invented business values — none of the percentages here are policy.

### Case A — Supplier-owned delivery (`deliveryMode = 'SUPPLIER'`)
```
Customer pays deliveryFee (bundled into order total, method = order's existing payment method, e.g. COD)
  → Supplier is economically responsible for the delivery leg (they run their own driver)
  → Ledger: CAFE_OWNER_CONTRIBUTION (DEBIT, cafeOwner) + SUPPLIER_CONTRIBUTION (DEBIT, supplier) + DRIVER_PAYOUT (CREDIT, driver)
  → Driver is paid by/through the Supplier — BigBoss is not a money-moving intermediary in this leg today
  → companyPayoutCents is always 0 in this mode (no Delivery Company involved)
```
Settlement in this case is largely a Supplier-internal concern (Supplier ↔ its own driver). BigBoss's settlement layer's role is limited to: recording the obligation existed, and (if BigBoss ever becomes a payment intermediary — not decided, see §25) tracking whether the Supplier→Driver leg was settled.

### Case B — Delivery Company delivery (`deliveryMode = 'DELIVERY_COMPANY'`)
```
Customer pays deliveryFee
  → Delivery Company is economically responsible; company's own driver performs the delivery
  → Ledger: CAFE_OWNER_CONTRIBUTION + SUPPLIER_CONTRIBUTION (DEBIT, whoever funds it — see §6) + DRIVER_PAYOUT (CREDIT, driver) + COMPANY_PAYOUT (CREDIT, company — the retained commission)
  → driverPayoutCents + companyPayoutCents together account for the full deliveryFee (split determined by the company's configured driver-share percent, §6)
```
This is the primary case where a BigBoss-mediated settlement makes sense: BigBoss (or the Delivery Company's own back office) periodically settles accumulated `DRIVER_PAYOUT` and `COMPANY_PAYOUT` obligations into scheduled payments.

### Case C — Supplier subsidy (delivery partially/fully funded by a supplier promotion)
```
Customer pays a REDUCED or zero deliveryFee (promotion-driven)
  → Ledger already records supplierSubsidyCents as a distinct, explicit amount (Phase 4 SupplierSubsidyEngine)
  → The delta between the driver/company's full payout and what the customer paid is a DEBIT against the Supplier, not the customer
  → Settlement must treat supplierSubsidyCents as its own line item — never silently netted into supplierFeeShareCents — so a future Supplier statement can show "delivery revenue" and "subsidy cost" separately
```

### Case D — BigBoss subsidy (architecturally supported, currently always 0)
```
Same shape as Case C, but the DEBIT falls on BigBoss instead of the Supplier (bigBossSubsidyCents)
  → Currently always 0 in production (no BigBoss-funded promotion exists yet) — the ledger field and pipeline already exist (Phase 4/5A), unused
  → Settlement design must not assume this stays 0 forever: the settlement schema must have a place for "BigBoss as funding source," structurally identical to Case C's Supplier-funding row, just a different `actorRole`
```

### Case E — Delivery deficit (`computeDeliveryBudget` result = `DEFICIT`)
```
The computed driver/company payout exceeds what the customer + any subsidy actually covers
  → budgetResultUsed='DEFICIT', budgetDeficitCentsUsed=<positive amount> are already recorded (Phase 4/5A) — purely analytical, never blocks the delivery
  → OPEN BUSINESS QUESTION (do not invent an answer): who absorbs a deficit? Candidates: BigBoss absorbs it as a cost of running the marketplace; the Supplier/Company absorbs it as a cost of choosing to subsidize; the driver's guaranteed minimum is honored anyway and the deficit is tracked as an unfunded liability. This is not a technical decision — it requires a BigBoss business decision (see §25). The settlement layer's job, until that decision is made, is only to make the deficit **visible and queryable** (a "who's holding this deficit" reporting field), never to silently assign it to an actor.
```

---

## 3. Settlement Lifecycle States

The proposal lists a maximal state set — `PENDING/CALCULATED/AUTHORIZED/PARTIALLY_SETTLED/SETTLED/FAILED/VOID/REFUNDED/ADJUSTED`. Analyzed against what the current system actually needs, not adopted wholesale:

- `CALCULATED` — already exists as a **ledger entry** status (Phase 5A), meaning "this obligation is known and frozen." A settlement record should not duplicate this; it **references** ledger entries already at `CALCULATED`.
- `VOID` — already exists at the ledger level (reassignment, cancellation). A settlement, separately, needs its own `VOID` (a settlement batch created in error, before any payment attempt).
- `PARTIALLY_SETTLED` — only meaningful if a single settlement can bundle multiple obligations and some pay out before others. Whether that's needed depends on §7 (settlement frequency/grouping), an open business decision. Include it in the state model, but as an available-not-mandatory state.
- `REFUNDED`/`ADJUSTED` — these are not settlement *states* but **separate record types** that *reference* a settlement (see §14/§15). Folding them into the settlement's own state enum conflates "what happened to the money" with "what corrective action was taken," which is exactly the kind of collapse §1 warns against.

**Smallest correct state model proposed** (settlement-record states only):
```
PENDING        → obligation(s) grouped into a settlement, not yet approved
APPROVED       → an authorized actor (see §17) signed off; amount is now frozen for payment
PAID           → a payment record exists and is CONFIRMED for the full settlement amount
PARTIALLY_PAID → some but not all of the settlement's amount has a CONFIRMED payment (only if partial payment is ever allowed — flag, don't assume)
FAILED         → a payment attempt was made and definitively failed (not "pending," not silently retried forever)
VOID           → the settlement itself was cancelled before payment (e.g. created in error) — never after PAID
```
`REFUNDED` and `ADJUSTED` are deliberately excluded from this enum — they are separate record types layered on top (§14, §15), because a settlement that has been partially refunded is still, at its own layer, `PAID`; the refund is a new fact, not a retroactive change to what "PAID" meant.

---

## 4. Can `deliveryFinancialLedger` Support Settlement Directly?

**No — recommend a separate layer.** Reasoning:

- The ledger's entire design contract (Phase 5A) is: one row = one immutable economic fact about one delivery, keyed by `(sourceEvent, sourceReference, entryType)`. Its idempotency and immutability guarantees depend on staying that granular and that narrowly scoped.
- Settlement is inherently a **grouping** concept — "pay this driver for these 40 deliveries' worth of accumulated `DRIVER_PAYOUT` entries in one transfer." Grouping 40 rows requires either (a) a join table mapping ledger entries to a settlement batch, or (b) mutating the ledger rows themselves to point at a settlement id. Option (b) violates the immutability contract that makes the ledger trustworthy as a historical record — it would mean a ledger row's meaning ("here is this delivery's obligation") becomes entangled with a payment-processing concern that has nothing to do with the delivery's own history.
- **Recommended model**: `Economic Ledger (existing) → Settlement Records → Settlement Items (join) → Payment Records`. The Settlement Item is the only new thing that "touches" a ledger entry, and it does so by **reference** (`ledgerEntryId` foreign key), never by mutation. This mirrors accounting practice: a general ledger entry is never edited to say "paid" — a separate payment record cites which ledger entries it discharges.

This also directly satisfies the task's own constraint ("do not create unnecessary duplicate financial storage") — the ledger remains the single source of truth for *what is owed*; the new tables only track *the process of paying it*.

---

## 5. Actor Balances — Derived vs. Materialized

**Recommend: derived (computed on demand from the ledger + settlement layer), not materialized, at least initially.**

- Derived (a query: `SUM(amountCents) WHERE actorUserId = X AND status = 'CALCULATED' AND NOT settled`) is always correct by construction — there is no separate "balance" row that can drift out of sync with the ledger it's summarizing. This is the same principle the ledger itself already follows (Phase 5A: "reconstruct truth from entries, never trust a cached total").
- Materialized (a `balances` table updated incrementally) becomes worth the complexity only if the derived query becomes a measurable performance problem — e.g. an Admin dashboard aggregating thousands of drivers' running balances on every page load. At current and near-term scale (the whole system today runs comfortably on live aggregate queries per Phase 5A/5B's own design), this is premature.
- **If** materialization is later needed for performance, the correct pattern is a **read-only cache with a rebuild function**, not a second source of truth: the cache must be fully reconstructable from the ledger + settlements at any time (exactly the kind of "deterministic reconstruction from ledger entries" already required and tested in Phase 5B hardening), and any discrepancy between cache and reconstruction is treated as a cache bug, never as grounds to trust the cache over the ledger.

---

## 6. Delivery Company Commission — Configurable Parameters

**Design only — no percentages proposed.** Parameters the future settlement/commission config must support, each with owner and freeze point:

| Parameter | Purpose | Owner (who sets it) | Storage | Freeze point |
|---|---|---|---|---|
| Driver share (%) | Portion of `deliveryFee` paid to the driver | Admin (platform-wide default) or per-company override | Extends the existing `deliveryPricingSettings.driverPayoutSharePercent` pattern (Phase 4), or a new per-`deliveryCompanyId` override table if per-company variance is required (business decision, §25) | At **assignment** time (already the case today — `driverPayoutSharePercentUsed` is snapshotted onto the delivery row, per Phase 3's existing design) |
| Company commission (%) | Portion of `deliveryFee` retained by the Delivery Company | Same as above; today implicitly `100% − driver share` | Same mechanism | Same — assignment time |
| BigBoss commission / platform fee | If BigBoss ever takes a cut of Delivery Company revenue (currently: no such fee exists anywhere in the system) | BigBoss Admin only | New field, not yet designed in detail — flagged as a business decision (§25) whether this exists at all | Would need to freeze at the same point as the other shares, for consistency |
| Minimum payout floor | Guarantees a driver receives at least X per delivery regardless of computed share | Admin | Could extend `deliveryPricingSettings`, mirroring `minFeeCentsUsed`'s existing pattern | Assignment time (needs to be visible before the driver accepts, not discovered after) |
| Fixed vs. percentage fee mode | Whether commission is a flat cents amount or a percentage of `deliveryFee` | Admin, per company or platform-wide | New enum field alongside the percentage field | Assignment time |

All of these should follow the **exact pattern Phase 3/4 already established**: a live, editable Admin-config value, and a `*Used`-suffixed **snapshot column** on the delivery row (or ledger entry) that freezes the value actually applied at the relevant point in time. This is not a new pattern to invent — it's the one the codebase already uses for `driverPayoutSharePercentUsed`, `weatherMultiplierPermilleUsed`, etc. Settlement calculations must always read the frozen `*Used` snapshot, never the live config (see §21).

---

## 7. Driver Minimum Guarantee — Funding Source

**No implementation. Business decision flagged, not resolved.**

If a driver is guaranteed a minimum payout per delivery (or per shift/period — undecided) and the computed share falls short, *someone* funds the gap. This is structurally the same open question as Case E's deficit (§2): candidates are BigBoss (marketplace cost of guaranteeing driver income), the Delivery Company/Supplier (cost of using drivers who might otherwise not accept low-value deliveries), or a dedicated guarantee fund. The architecture's only obligation right now is to make sure that **whichever answer is chosen later, the data model already has a place to record it**: a `GUARANTEE_TOPUP` ledger entry type (extending the existing `LedgerEntryType` enum, following the same pattern as `WEATHER_INCENTIVE`/`PEAK_INCENTIVE`), with `actorRole` naming whoever funds it. No such entry type is added by this document — this is the proposed shape for Phase 5C.4+ (§26), pending the business decision.

---

## 8. Cancellation Compensation — Architecture

**No implementation, no invented amounts.** If a delivery is cancelled after a driver has already invested time (post-`ARRIVED_AT_PICKUP`, e.g.), a compensation amount may be owed. The existing `WaitingTimePricingEngine` (Phase 4) already establishes the *mechanism* for "driver is owed something for time spent, customer/supplier is charged for it" — cancellation compensation would follow the identical shape: a new ledger entry type (e.g. `CANCELLATION_COMPENSATION`), `CREDIT` to the driver, `DEBIT` to whichever actor the business decides bears cancellation risk (this is itself a business decision — not resolved here). The **amount** must never be invented in code; it requires an Admin-configurable policy (flat fee, waiting-time-proportional, or something else), following the same live-config + frozen-snapshot pattern as every other pricing factor.

---

## 9. Refund Mechanism — Design

A refund (full, partial, delivery-fee-only, supplier-funded, or BigBoss-funded) must **never rewrite the original economic event**. Proposed shape:

- A `refunds` record (design only, §23) references the original settlement (and, transitively, the ledger entries it settled) by id — it does not alter them.
- Effect on each layer:
  - **Ledger**: unaffected. The original `CALCULATED`/settled entries remain exactly as they were — they are a historical fact ("this is what was owed and paid at the time"), and a refund doesn't change what was owed at that time, only what happens afterward.
  - **Settlement**: the settlement's own state is unaffected (stays `PAID`); the refund is tracked as a linked record, not a state transition on the settlement itself (per §3's reasoning).
  - **Payment**: a refund is itself a **new payment record**, direction reversed, referencing the original payment it corrects.
  - **Balances**: since balances are derived (§5), a refund simply appears as a new negative-direction fact in whatever the balance query aggregates over — no special-casing needed if the derivation query already includes refund records in its sum.
- Refund responsibility (who absorbs the cost of a refund — the Supplier, BigBoss, the Delivery Company) is a business decision (§25), not resolved here; the architecture only needs an `responsibleActorRole` field on the refund record, whatever the eventual policy fills it with.

---

## 10. Adjustment Mechanism — Design

**Additive only, never a silent modification.** An adjustment (correcting a miscalculated payout after the fact, say) is a **new** ledger-shaped entry — `direction` and `amountCents` express the correction itself (e.g. a `+150` `CREDIT` adjustment to a driver who was underpaid), referencing the original entry it corrects via a `correctsEntryId`-style pointer (design only, §23). The original entry is never touched. This is a direct extension of the immutability discipline already enforced for reassignment voiding (Phase 5B hardening) — the same "write a new fact, never edit an old one" rule, just applied to a different trigger (manual correction instead of reassignment).

---

## 11. COD Reconciliation — Design (Not Implemented)

Cash-on-Delivery introduces a distinct chain the ledger doesn't yet track end-to-end:

```
Order delivered  →  Cash expected (= order total, known at delivery time)
                 →  Cash collected (driver physically receives it — a real-world event, not inferable from delivery status alone)
                 →  Cash remitted (driver/company hands the cash to whoever is owed it — Supplier, Company, or BigBoss depending on the flow)
                 →  Cash reconciled (remitted amount confirmed to match expected amount)
                 →  Cash discrepancy (if remitted ≠ expected — must be flagged, never silently absorbed into a rounding adjustment)
```

Actors responsible at each step (design-level, not policy): the assigned **driver** is responsible for "collected," the driver's **owning entity** (Supplier or Delivery Company) is responsible for "remitted," and **Admin/Finance** is responsible for "reconciled." Each step needs its own timestamp and actor-attributed record — collapsing "delivered" and "cash collected" into one event would be incorrect, since a delivery can be marked `DELIVERED` (proof of drop-off) before cash is confirmed collected (a separate, physical-world fact). **Do not implement COD settlement in this phase** — this section exists only so the eventual settlement/payment schema (§23) reserves the right shape (a `cashCollectedAt`/`cashRemittedAt`/`cashReconciledAt` triplet, or a small `cod_reconciliation` table mirroring the same chain) rather than needing a redesign later.

---

## 12. Future Payment Methods

Card, Bank Transfer, Wallet, and any future method must be addable **without rewriting the economic ledger** — this is guaranteed structurally by §4's separation: the ledger records *obligations*, which are method-agnostic by construction (a `DRIVER_PAYOUT` entry doesn't care how the driver is eventually paid). Only the **Payment Record** layer (§13) needs a `method` field; adding a new method is adding a new enum value and a new provider-specific handler, never a ledger schema change.

---

## 13. Future Payment-Record Field Design (Design Only — No Table Created)

```
paymentId          — internal identifier
settlementId        — FK to the settlement this payment discharges
amountCents         — amount actually moved (may differ from settlement amount for a partial payment)
currency            — see §20
method              — enum: CASH | CARD | BANK_TRANSFER | WALLET | OTHER
provider             — e.g. a specific payment gateway name, nullable for CASH
providerReference    — the provider's own transaction id, for reconciliation/dispute lookups
status               — INITIATED | PENDING | CONFIRMED | FAILED | REVERSED
initiatedAt          — when the payment attempt began
completedAt          — when CONFIRMED, nullable otherwise
failedAt             — when FAILED, nullable otherwise
```
This mirrors the ledger's own event-sourced discipline: a payment record, once `CONFIRMED`, is never edited — a reversal is a new record (§9).

---

## 14. Idempotency Design for Settlement

Every trigger that could duplicate a settlement/payment action must be covered by the same idempotency-key discipline already proven in Phase 5A/5B (`ON CONFLICT DO NOTHING` + read-back-on-conflict, keyed by a deterministic string derived from the triggering event):

- **Double-click** (Admin clicks "Approve Settlement" twice) — settlement approval keyed by `settlementId` + a state-guard (`WHERE status = 'PENDING'`), identical in spirit to `reassignDriver`'s existing compare-and-swap guard.
- **API retry** — the settlement-creation endpoint should accept (or derive) an idempotency key scoped to the grouping criteria (e.g. `actorId:periodStart:periodEnd`), so retrying "create this week's settlement for driver X" never creates two.
- **Network retry** — same mechanism as API retry; the client-observed failure (timeout) doesn't mean the server-side write didn't succeed, so the key must be derived from **request content**, not a client-generated nonce alone.
- **Webhook retry** — payment providers commonly redeliver webhooks; the payment record's `providerReference` (a provider-guaranteed-unique transaction id) is the natural idempotency key for "has this specific provider event already been applied."
- **Worker retry** (a background settlement-batch job re-running after a crash) — must be safe to re-run against the same period; the settlement-creation key (above) already covers this if the worker's unit of work maps 1:1 to that key.
- **Server restart** mid-transaction — covered by ordinary DB transactional atomicity (the same guarantee `assignDriver`/`reassignDriver` already rely on today): either the whole settlement-creation transaction commits or none of it does.

---

## 15. Payment-Provider Webhook Architecture

```
Webhook received
  → 1. Verify signature/authenticity (provider-specific — never trust an unverified webhook body)
  → 2. Idempotency check (has this providerReference + event type already been processed?)
  → 3. Payment state transition (INITIATED/PENDING → CONFIRMED or FAILED, on the Payment Record only)
  → 4. Settlement state update (a derived consequence of the payment transition — e.g. settlement moves to PAID once its payment is CONFIRMED)
```
**A webhook must never directly mutate economic history** — it can only ever move a Payment Record forward through its own state machine, which in turn (as a separate, explicit step) may trigger a Settlement state transition. It has no path to touch the underlying ledger entries at all — by construction, given §4's separation, a webhook handler has no reason to ever reference `deliveryFinancialLedger`.

---

## 16. Dispute Architecture (No Implementation)

What must stay immutable when a dispute is raised (e.g. a driver disputes their payout amount, or a Coffee Owner disputes a charge): **everything already covered by the ledger's existing immutability guarantee** — the original ledger entries, and any settlement/payment records already `CONFIRMED`/`PAID`, are never edited in response to a dispute. A dispute resolution, whatever it concludes, is expressed as a **new** record (an adjustment, §10, or a refund, §9) — the dispute process itself would need its own record type (`disputeId`, `raisedBy`, `reason`, `raisedAt`, `resolvedAt`, `resolution`, referencing the disputed settlement/payment by id) but is not designed further here, since no dispute record is being created in this phase.

---

## 17. Future Admin Reporting Design

Distinguishing three categories of metric, because conflating them is a common source of "why don't the numbers match" incidents:

- **Economic metrics** (from the ledger — what *should* have moved): GMV, delivery revenue, supplier-funded delivery cost, driver payouts owed, company payouts owed, BigBoss subsidies, deficits (Case E).
- **Settlement metrics** (from the settlement layer — what has been *grouped and approved*): unsettled amount (obligations with no settlement yet), settled-but-unpaid amount.
- **Cash/payment metrics** (from the payment layer — what has *actually* moved): paid amount, failed-payment amount, refunded amount, adjustment total.

A correct Admin report always labels which category a number belongs to (e.g. "Driver payouts owed: X (economic)" vs. "Driver payouts paid: Y (cash)") rather than presenting a single blended "driver earnings" figure — this directly follows from §1's core discipline.

---

## 18. Financial Closing (Design Only)

Daily/weekly/monthly closing would be a **read-only snapshot/report generation** over the existing ledger + settlement + payment layers — e.g. "as of period end, obligations totaled X, settled Y, paid Z, N disputes open." It must never retroactively alter any ledger entry (closing a period is not the same as freezing it — the ledger is already append-only and needs no additional freeze mechanism). Whether closing periods need their own record (for audit — "this is the report that was generated and shown to Finance on date D") is a further design detail deferred to the actual Phase 5C implementation proposal, not decided here.

---

## 19. Currency Architecture

The system currently uses a single currency (Tunisian Dinar, stored as integer cents/millimes — `*Cents` field naming throughout the whole codebase already reflects this). **No multi-currency support is proposed unless a concrete business need for it emerges.** If one ever does, the correct extension point is a `currency` field on the Payment Record (§13) and Settlement Record (§23) — never on the ledger, since obligations are always denominated in the currency of the original transaction and should never be silently converted. This is deliberately minimal: adding speculative multi-currency infrastructure now, with no current need, would violate the project's own stated preference against building for hypothetical future requirements.

---

## 20. Rounding Rules

**Integer cents throughout, no floating point** — this is already the system's existing convention (every `*Cents` field is an integer column, every engine from Phase 1 onward computes in integer cents with explicit `Math.round`). The settlement/payment layer must continue this without exception: any percentage-based split (driver share, company commission) rounds to the nearest integer cent using the same `Math.round` convention already used in `computeDeliveryPayout`, and any residual cent from a split (e.g. rounding both a driver's and a company's share up independently could over-allocate by a cent) must be reconciled by computing one side as "total minus the other side" rather than rounding both independently — exactly the pattern `computeDeliveryPayout` already uses for `companyPayoutCents = feeCents − baseDriverShare`.

---

## 21. Parameters That Must Be Frozen, By Point in Time

Extending the existing Phase 3/4 "`*Used`-suffixed snapshot column" convention to the settlement layer:

| Freeze point | What gets frozen | Already true today? |
|---|---|---|
| **Assignment** | `driverPayoutSharePercentUsed`, weather/peak/zone multipliers, `deliveryFee`, `cafeOwnerFeeShareCents`, `supplierFeeShareCents` | Yes (Phase 1–4) |
| **Completion** (`DELIVERED`) | Final `waitingDriverCompensationCentsUsed`, any cancellation-compensation amount (§8, once it exists) | Partially — waiting compensation yes; cancellation, not yet built |
| **Settlement** (new) | The commission parameters (§6) actually applied when the settlement was calculated — even if Admin changes the live config afterward, a settlement already `APPROVED` must keep referencing the config values frozen at its own calculation time, not the live ones | Not yet built — this document's proposal |
| **Payment** (new) | Nothing further needs freezing at payment time — payment only records that a settlement's already-frozen amount was transferred | N/A |

**Governing rule, unconditionally**: never recalculate a historical obligation or settlement from the *current* Admin config. Every past figure must remain explainable purely from what was frozen at the time, exactly as Phase 1's "byte-identical to the historical formula" requirement and Phase 5B's "historical safety, no backfill" requirement already establish for pricing and the ledger. The settlement layer inherits this rule unchanged.

---

## 22. Authorization Matrix (Design)

| Action | Coffee Owner | Supplier | Supplier Driver | Delivery Company | Company Driver | Admin |
|---|---|---|---|---|---|---|
| View own settlement/payment status | ✓ (own deliveries) | ✓ (own deliveries/drivers) | ✓ (own payouts) | ✓ (own deliveries/drivers) | ✓ (own payouts) | ✓ (all) |
| Calculate a settlement (group obligations) | ✗ | ✗ (own driver payouts could self-serve settle in a future company-managed model — flagged, not decided) | ✗ | Same flag as Supplier | ✗ | ✓ |
| Approve a settlement | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (only role with authority today; whether Suppliers/Companies get self-approval for their own internal driver payouts is a business decision, §25) |
| Mark as paid | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Void a settlement | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Refund | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Adjust | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

Every "✗" here follows directly from the Phase 5B hardening's existing security model — no role other than Admin currently has a write-authorization path into anything financial beyond triggering the delivery-status transitions that *generate* obligations (assign/reassign/deliver/cancel). This matrix proposes no expansion of that boundary; any relaxation (e.g. letting a Delivery Company self-approve its own driver settlements) is flagged as a business decision, not assumed.

---

## 23. Proposed Future Data Model (Design Only — Not Implemented)

Minimum entity set, each following the ledger's existing append-only/idempotent conventions:

**`settlements`**
- Purpose: groups one or more ledger obligations for a single actor into one approvable, payable unit.
- Fields: `id`, `actorUserId`, `actorRole`, `periodStart`, `periodEnd` (nullable — a settlement need not always be period-based), `totalAmountCents`, `status` (§3's enum), `calculatedAt`, `approvedAt`, `approvedByUserId`, `idempotencyKey`.
- Relationships: has many `settlement_items`; has many `payments` (usually one, but `PARTIALLY_PAID` implies possibly more).
- Immutability: `PENDING`→other transitions only; once `APPROVED`, `totalAmountCents` is frozen (an adjustment creates a new settlement or a linked adjustment record, never edits this one).
- Idempotency: keyed by `actorUserId:periodStart:periodEnd` (or equivalent grouping key) to prevent duplicate settlement creation for the same period.

**`settlement_items`**
- Purpose: the join between a settlement and the individual ledger entries it discharges — the mechanism that lets the ledger stay untouched (§4).
- Fields: `id`, `settlementId`, `ledgerEntryId` (FK to `deliveryFinancialLedger.id`), `amountCents` (normally equal to the referenced entry's `amountCents`, but kept explicit rather than always re-joining, so a settlement's total is self-contained even if ledger entries are later reinterpreted).
- Relationships: many-to-one to both `settlements` and `deliveryFinancialLedger`.
- Immutability: fully immutable once written — a settlement item is never edited or deleted, only superseded by voiding the parent settlement and creating a new one.

**`payments`**
- Purpose: records an actual, provider-confirmed or cash-confirmed money movement. Fields as in §13.
- Relationships: many-to-one to `settlements` (a settlement may need more than one payment attempt, e.g. one `FAILED` then one `CONFIRMED`).
- Immutability: `CONFIRMED`/`FAILED` are terminal; a correction is a new payment record (§9).
- Idempotency: keyed by `providerReference` for provider-originated payments; by an internal deterministic key for cash confirmations.

**`payment_attempts`**
- Purpose: distinct from `payments` if a provider integration needs to track multiple raw attempts (retries, 3DS challenges, etc.) before one succeeds — only needed if a card/bank provider is actually integrated; not needed for the current CASH-only reality. Flagged as **optional**, to be added only when a real provider integration is designed, to avoid the "no unnecessary duplicate financial storage" pitfall the task explicitly warns against.
- Fields (if built): `id`, `paymentId`, `attemptNumber`, `status`, `providerRawResponse` (opaque, for debugging), `attemptedAt`.

**`refunds`**
- Purpose: as designed in §9. Fields: `id`, `originalPaymentId` (or `originalSettlementId`), `amountCents`, `reason`, `responsibleActorRole`, `status`, `initiatedByUserId`, `initiatedAt`, `completedAt`.
- Immutability: append-only, like every other record here.

**`adjustments`**
- Purpose: as designed in §10. Fields: `id`, `correctsLedgerEntryId` (or `correctsSettlementId`), `amountCents`, `direction`, `reason`, `createdByUserId`, `createdAt`.
- Immutability: append-only.

None of these six tables are created by this document. This is the proposed shape for a future Phase 5C implementation to evaluate and refine.

---

## 24. Complete Financial Flow Diagram

```
ORDER
  │
  ▼
DELIVERY PRICING  (computeDeliveryFee / runDeliveryPricingPipeline — Phase 1–4, live, recomputable until frozen)
  │
  ▼
FROZEN ECONOMIC OBLIGATION  (deliveries.* snapshot columns frozen at assignment — Phase 3/4, existing)
  │
  ▼
FINANCIAL LEDGER  (deliveryFinancialLedger — Phase 5A/5B, append-only CALCULATED/VOID/AUTHORIZED entries, existing)
  │
  ▼
SETTLEMENT CALCULATION  (NEW — groups CALCULATED ledger entries for one actor into a settlement, §23)
  │
  ▼
SETTLEMENT APPROVAL  (NEW — Admin authorizes; amount frozen, §21/§22)
  │
  ▼
PAYMENT  (NEW — a Payment Record is created and sent to a rail: cash confirmation, card, bank transfer, wallet, §12/§13)
  │
  ▼
PAYMENT CONFIRMATION  (NEW — webhook or manual confirmation moves the Payment Record to CONFIRMED, §15)
  │
  ▼
RECONCILIATION  (NEW — settlement moves to PAID once its payment(s) are CONFIRMED for the full amount; COD adds its own parallel reconciliation chain, §11)
```
Every stage above the "NEW" line is implemented and tested (Phases 1–5B). Every stage marked NEW is architecture only, proposed by this document, not built.

---

## 25. Business Decisions — Already Defined vs. Still Required

### Already defined (do not re-litigate)
- Driver payout formula shape (`round(fee × pct/100) + incentives`) — Phase 3.
- Company payout formula shape (`fee − driverShare`, SUPPLIER mode always 0) — Phase 3.
- Supplier/BigBoss subsidy as distinct, separately-tracked amounts — Phase 4/5A.
- Marketplace-only (Model B) over BigBoss-as-intermediary (Model A) as the general money-flow model — business-rules doc, justified by COD's existing precedent.
- Ledger immutability/idempotency discipline — Phase 5A, reused everywhere above.

### Still requiring BigBoss business decisions (each listed with options, not a chosen answer)

| Decision | Options | Financial consequence | Technical consequence | Recommended data model (if decided) |
|---|---|---|---|---|
| **Delivery deficit responsibility** (Case E) | (a) BigBoss absorbs, (b) Supplier/Company absorbs, (c) driver guarantee honored + deficit tracked as unfunded liability | Determines who's economically at risk under demand/pricing edge cases | Determines `actorRole` on a future `DEFICIT_COVERAGE` ledger entry type | Extend `LedgerEntryType`, no new table |
| **Driver minimum guarantee funding source** (§7) | BigBoss / Supplier / Company / dedicated fund | Determines ongoing subsidy cost ownership | New `GUARANTEE_TOPUP` entry type, `actorRole` per decision | Extend `LedgerEntryType`, no new table |
| **Cancellation compensation policy & funder** (§8) | Flat fee / waiting-time-proportional / none; funded by BigBoss/Supplier/Company | Determines driver income stability vs. cost to the funding actor | New `CANCELLATION_COMPENSATION` entry type + Admin-configurable amount/formula | Extend `LedgerEntryType` + `deliveryPricingSettings` |
| **BigBoss subsidy activation** (Case D) | Stays 0 indefinitely, or BigBoss launches its own funded promotions | Determines whether `bigBossSubsidyCents` ever becomes nonzero in production | None — pipeline already supports it (Phase 4/5A) | No change needed; already built |
| **Refund responsibility** (§9) | Supplier-funded / BigBoss-funded / Company-funded, possibly varying by refund reason | Determines who bears the cost of order-level or delivery-level refunds | `responsibleActorRole` field value on the `refunds` record | Part of `refunds` table design (§23) |
| **COD reconciliation ownership** (§11) | Driver-level / Company-level / centralized BigBoss cash desk | Determines process design, not just data model | Determines whether `cod_reconciliation` is a delivery-level table or an actor-level periodic batch | Deferred to Phase 5C implementation proposal |
| **Settlement frequency/grouping** (§3, §23) | Per-delivery / daily / weekly / on-demand | Determines operational cadence, cash-flow predictability for drivers/companies | Determines whether `settlements.periodStart/periodEnd` is required or nullable, and worker-scheduling design | Part of `settlements` table design |
| **Payment methods to actually support** (§12) | Cash only (current reality) / add card / add bank transfer / add wallet | Determines integration scope and PCI/compliance surface if card is added | Determines which `PaymentMethod` enum values are active vs. reserved | Part of `payments` table design |
| **Dispute handling process** (§16) | Manual Admin-mediated / formal dispute workflow with SLAs | Determines operational overhead and driver/supplier trust | Determines whether a `disputes` table is needed at all in the near term | Deferred — no table proposed yet |
| **Delivery Company commission structure** (§6) | Flat platform-wide % / per-company negotiated % / BigBoss platform fee on top | Determines company economics and whether BigBoss takes a cut | Determines whether commission config is global-only or needs a per-company override table | Extends `deliveryPricingSettings` pattern, or new override table if per-company variance is confirmed needed |

---

## 26. Proposed Phase 5C Implementation Sequence (Proposal Only — Not Executed)

1. **5C.1 — Settlement core** — ✅ IMPLEMENTED (see `docs/bigboss-delivery-settlement-foundation.md`): `settlements` + `settlement_items` tables, settlement-calculation logic. One refinement made during implementation: settlement calculation groups `AUTHORIZED` ledger entries (not bare `CALCULATED` ones) — a `CALCULATED` entry can still be voided by a reassignment or cancellation before the delivery completes, so only entries that have reached `AUTHORIZED` (i.e. the delivery reached `DELIVERED`) are ever eligible for settlement. `PENDING`→`APPROVED`/`VOID` transitions, Admin-only authorization (§22), all implemented as designed.
2. **5C.2 — Cash payment confirmation** — ✅ IMPLEMENTED: `payments` table, all 5 methods present in the enum (CASH/BANK_TRANSFER/CARD/WALLET/OTHER) though only CASH is realistically used today, Admin-only create/confirm/fail/reverse flow, `APPROVED`→`PARTIALLY_PAID`/`PAID` transitions derived from confirmed-payment totals.
3. **5C.3 — Settlement/payment visibility** — ✅ IMPLEMENTED for Driver/Supplier/Delivery Company (Owed/Approved/Paid/Outstanding via `getActorFinancialSummary`/`GET /api/me/financial-summary`, surfaced on the driver wallet, supplier dashboard, and delivery/company dashboard). Full per-entry ledger/settlement/payment browsing (not just the aggregate summary) remains Admin-only.
4. **5C.4 — Guarantee/deficit/cancellation entry types**: still NOT implemented — the corresponding business decisions (§25) remain undecided. Deficit remains visible/queryable (`settlements.budgetResultAtCalculation`) but never auto-assigned.
5. **5C.5 — Refunds** — ✅ IMPLEMENTED (minimal): `refunds` table, admin-only request/confirm/fail/cancel, capped at the refundable confirmed-payment amount. Refund responsibility policy (§25) remains undecided — `responsibleActorRole` from the original design was not added since no policy exists yet to populate it; can be added additively later.
6. **5C.6 — Adjustments** — ✅ IMPLEMENTED (minimal): `adjustments` table, admin-only, single-step additive correction referencing a ledger entry or settlement.
7. **5C.7 — COD reconciliation** — ✅ IMPLEMENTED (minimal): `cod_reconciliations` table, the full EXPECTED→COLLECTED→REMITTED→RECONCILED/DISCREPANCY chain, driver/supplier-company self-service + Admin reconciliation. COD reconciliation *responsibility* policy (§25, e.g. who absorbs a discrepancy) remains undecided — discrepancies are exposed, never auto-resolved.

Each numbered step is independently shippable and independently testable, following the same phase-by-phase, zero-regression discipline used for Phases 1 through 5B.

---

## 27. Required Test-Plan Design for Future Phase 5C (Design Only — Not Implemented)

When 5C is actually implemented, its test plan should include (at minimum) these named scenarios, mirroring the rigor already applied in Phase 5B hardening:

1. Settlement calculation groups exactly the `CALCULATED` entries for one actor/period, excludes `VOID` entries.
2. Settlement calculation is idempotent — re-running for the same period produces no duplicate settlement.
3. Settlement approval is Admin-only; every other role is rejected server-side.
4. An `APPROVED` settlement's `totalAmountCents` does not change even if the underlying commission config changes afterward (§21 freeze rule).
5. A `PENDING` settlement can be voided; an `APPROVED` or `PAID` one cannot.
6. Payment confirmation moves a settlement from `APPROVED` to `PAID` only when the payment amount matches the settlement amount exactly.
7. Partial payment (if enabled) correctly produces `PARTIALLY_PAID`, never silently rounds up to `PAID`.
8. A failed payment attempt does not silently retry into a duplicate payment record.
9. A refund never modifies the original ledger entry, settlement, or payment record — only ever adds a new `refunds` row.
10. A refund correctly reduces the actor's derived balance (§5) without a materialized-balance drift.
11. An adjustment never modifies the entry it corrects — only ever adds a new `adjustments` row referencing it.
12. Two adjustments correcting the same original entry both remain visible in history (no overwrite).
13. Webhook idempotency: replaying the same provider webhook payload twice produces no duplicate payment-state transition.
14. Webhook signature verification rejects a forged/unsigned payload before any state change.
15. A settlement's ledger-entry references (`settlement_items`) survive a delivery reassignment that happens *after* settlement (should be structurally impossible if reassignment is blocked post-`DELIVERED`, per existing Phase 5B guard — test that this guard still holds once settlement exists).
16. Cross-actor security: Actor A cannot view, approve, or trigger payment for Actor B's settlement (mirrors the exact ID-tampering test pattern from Phase 5B hardening's security suite).
17. Historical safety: creating the settlement/payment layer does not alter any existing `deliveryFinancialLedger` row, and does not retroactively create settlements for historical (pre-5C) deliveries (no backfill, per the established historical-immutability rule).
18. Self Pickup and multi-supplier isolation continue to hold at the settlement layer (no settlement is ever created for a delivery that doesn't exist, and one supplier's settlement never includes another's entries).
19. A deterministic, from-empty reconstruction test: starting from an empty settlement/payment test environment, replaying a sequence of deliveries + settlement calculation + payment confirmation, and verifying the final derived balance for each actor matches hand-computed expected values — the settlement-layer equivalent of the ledger-reconstruction test already required and passed in Phase 5B hardening.
