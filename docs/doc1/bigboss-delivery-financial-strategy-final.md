# BigBossCoffee Delivery — Financial Strategy (FINAL, closed)

### Status: **CLOSED.** This hardening pass audited the full implementation against the actual code (not prior reports), found and fixed two concrete concurrency defects, verified them under genuine concurrent load, and re-ran a focused end-to-end regression. No new functionality, no new business policy, no schema change.

Full detail: `docs/bigboss-delivery-settlement-architecture.md` (design), `docs/bigboss-delivery-settlement-foundation.md` (Phase 5C.1 as-built), `docs/bigboss-delivery-financial-strategy.md` (Phase 5C.2 as-built, now updated with the concurrency fix).

---

### Implemented
- Pricing pipeline (Phases 1–4) — untouched this pass
- Delivery financial ledger (Phase 5A/5B) — append-only, immutable, untouched this pass
- Settlement foundation (Phase 5C.1) — one settlement per delivery per recipient actor
- Payments (Phase 5C.2) — `INITIATED → CONFIRMED/FAILED`, `CONFIRMED → REVERSED`; settlement `PENDING → APPROVED → PARTIALLY_PAID/PAID` derived purely from confirmed-payment sums
- COD reconciliation (Phase 5C.2) — `EXPECTED → COLLECTED → REMITTED → RECONCILED/DISCREPANCY`, separate from delivery status
- Refunds (Phase 5C.2) — `REQUESTED → CONFIRMED/FAILED/CANCELLED`, capped at refundable confirmed amount
- Adjustments (Phase 5C.2) — additive-only correction records
- Financial summaries — Admin (6 categories, never blended) and self-service (Owed/Approved/Paid/Outstanding)
- Role-scoped financial visibility — Driver/Supplier/Delivery Company, reusing existing authorization, no parallel rules
- Reassignment/idempotency protections — `assignmentSequence`-keyed ledger entries, settlement only ever built from `AUTHORIZED` (never `VOID`) entries
- **This pass**: row-level locking (`FOR UPDATE`) added to `confirmPayment` and `confirmRefund` — closes a genuine TOCTOU race where two concurrent confirmations against the same settlement/payment could together exceed their respective caps

### Intentionally Deferred
- Payment providers / webhooks
- Wallets / banking integration
- Accounting periods / financial closing
- Dispute engine
- `payment_attempts` table (no concrete defect required it this pass)

### Business Decisions Still Open
- Delivery Company / BigBoss commission structure
- Driver minimum guarantee
- Cancellation compensation
- BigBoss subsidy funding responsibility
- Delivery deficit responsibility
- COD discrepancy responsibility
- Settlement batching / frequency policy
- Payment provider selection / provider fees

None of these were touched, assumed, or defaulted this pass. Where code surfaces one (deficit on a settlement row, COD discrepancy amount), the value remains visible and queryable, never auto-assigned to an actor.

### Architectural Invariants (audited and confirmed intact)
- The ledger is immutable — only `status` ever progresses (`CALCULATED → AUTHORIZED/VOID`); `amountCents`/`direction`/`actorUserId`/`entryType` are never rewritten.
- Settlement never rewrites the ledger — it only reads `AUTHORIZED`+`CREDIT` entries and references them via `settlement_items` (globally unique `ledgerEntryId` — one entry, one settlement, ever).
- Payment never rewrites the ledger or the settlement's `amountCents` — it only records whether/how that frozen amount moved, and derives the settlement's own status from confirmed-payment sums.
- Refund never rewrites the original payment or ledger entry — it is always a new record, capped at the refundable confirmed amount.
- Adjustment is additive only — references a ledger entry or settlement without ever modifying it.
- Self Pickup has no delivery economics — a `SELF_PICKUP` sub-order has no `deliveries` row at all, so no ledger/settlement/payment/COD/waiting record can structurally exist for it.
- Historical deliveries are preserved — every new-layer trigger (settlement calculation, COD creation) is wired to a live status *transition*, never to a status *value*, so a delivery already `DELIVERED` before a phase shipped is never retroactively backfilled.
- Financial visibility is role-scoped — every new endpoint reuses `canUserAccessDelivery`/the existing actor-vs-counterparty scoping; no endpoint accepts a client-supplied actor id in place of the session-derived one.

---

## Audit Findings This Pass

### Concrete defects found and fixed
1. **`confirmPayment` overpayment race** — the overpayment check (sum of other CONFIRMED payments + this one ≤ settlement amount) was a plain read followed by a single-row compare-and-swap. Two different payments against the same settlement, confirmed at nearly the same instant, could each pass the check against stale data and together exceed the settlement's frozen amount. **Fixed**: wrapped in a transaction that takes a `SELECT settlements ... FOR UPDATE` lock before re-reading the confirmed sum, serializing concurrent confirmations against the same settlement.
2. **`confirmRefund` refundable-cap race** — identical shape: the "re-validate at confirm time" defense was itself an unprotected read + compare-and-swap. **Fixed**: wrapped in a transaction that locks the referenced payment (or settlement) via `FOR UPDATE` before re-validating the cap.

Both fixes were verified under genuine concurrent load (`Promise.allSettled` racing two confirmations designed to together exceed the cap) — in both cases, exactly one confirmation succeeds and the total never exceeds the cap.

### Security findings
No new finding. Re-verified: Coffee Owner cannot see a driver's settlement/payout via `getDeliverySettlements` (stricter-than-delivery-access filter, unchanged from Phase 5C.1); an unrelated Supplier/Driver/Delivery Company is rejected with `Forbidden` on every settlement/COD endpoint tested; every mutation (payment/refund/adjustment/reconcile) remains reachable only through `requireAdmin` routes except the two explicit COD self-service actions (collect/remit), which are scoped via the existing `canUserAccessDelivery`. No endpoint accepts a client-supplied actor id.

### Financial consistency findings
No inconsistency found beyond the two concurrency defects above. `reconcileSettlement` (byte-level re-derivation of a settlement's total from its ledger-referenced items) continues to hold for every settlement created during this pass's testing. Settlement status derivation (`recomputeSettlementPaymentStatus`) correctly moves both up (`APPROVED → PARTIALLY_PAID → PAID`) and down (a reversed payment correctly demotes `PAID → PARTIALLY_PAID`) without ever touching `amountCents`.

### Self-Pickup / Multi-supplier — confirmed safe
Self Pickup: re-verified structurally impossible to produce any financial record (no `deliveries` row exists for a `SELF_PICKUP` sub-order). Multi-supplier: deliveries #48/#49 (different suppliers, same order) confirmed to have fully independent, zero-cross-contaminated settlement/COD state; an unrelated actor cannot view either via ID guessing.

### Historical deliveries — confirmed safe
Delivery #51 (pre-Phase-1) unchanged (`deliveryFee` still 300, zero settlements). No settlement/payment/COD/refund/adjustment table has any backfill code path — every row requires an explicit live trigger.

---

## Tests Executed

34 assertions (final regression suite) + 4 assertions (dedicated refund-race verification) = **38/38 passed**, covering: normal delivery full path to PAID, self pickup, multi-supplier isolation, driver reassignment A→B→C→A with VOID-entries-never-payable verification, settlement/payment state transitions (partial/full/reversal/failed/idempotent/overpayment), the two concurrency fixes under genuine `Promise.allSettled` contention, COD full lifecycle + authorization, refund cap + confirmed double-confirm race, adjustment immutability, cross-actor isolation (driver/supplier/company), and historical-delivery compatibility. All test artifacts (including one freshly created, fully lifecycle-driven delivery and one temporary driver user) fully reverted or deleted; final DB state confirmed clean via direct query.

One unrelated observation: live settlement/COD/adjustment rows (deliveries #59–61) were found in the database during this pass, created by real concurrent use of the Admin financial UI (not by any test script) — left untouched, as they are not test data.

## Build / Typecheck / DB

- `tsc --noEmit`: clean (2 pre-existing baseline errors, unrelated to delivery/financial code).
- `npm run build`: clean.
- `npm run db:push`: applied with zero schema diff (no `shared/schema.ts` changes this pass — the two fixes were storage-layer logic only).

---

## FINAL STATUS: DELIVERY FINANCIAL STRATEGY CLOSED
