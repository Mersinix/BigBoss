# BigBossCoffee Delivery — Financial Strategy (as-built, Phase 5C.2)

### Status: **IMPLEMENTED, TESTED.** This is the practical completion of the delivery financial architecture: `PRICING → ECONOMIC LEDGER → SETTLEMENT → PAYMENT → COD / REFUND / ADJUSTMENT / REPORTING`, all layers now real. No external payment provider anywhere. Business-decision items remain intentionally unresolved — see §14.

Builds on and does not rewrite: `docs/bigboss-delivery-settlement-architecture.md` (design), `docs/bigboss-delivery-settlement-foundation.md` (Phase 5C.1 as-built), `docs/bigboss-delivery-financial-visibility.md` (Phase 5B), `docs/bigboss-delivery-financial-ledger.md` (Phase 5A).

---

## 1. What This Phase Adds

```
PRICING
    ↓
FROZEN ECONOMIC OBLIGATION
    ↓
FINANCIAL LEDGER               (Phase 5A/5B)
    ↓
SETTLEMENT                     (Phase 5C.1)
    ↓
PAYMENT                        (Phase 5C.2 — NEW)
    ↓
COD / REFUND / ADJUSTMENT      (Phase 5C.2 — NEW)
    ↓
REPORTING (Admin summary)      (Phase 5C.2 — NEW)
```

Nothing above the `PAYMENT` line was touched. `deliveryFinancialLedger`, `settlements`, `settlement_items`, and every Phase 1–5C.1 engine/table/route/method are unchanged.

---

## 2. Payment Layer

### Model
`payments` — one row per payment attempt against a settlement. Internal record-keeping only: no external payment provider is integrated anywhere in this codebase. Fields: `settlementId`, `amountCents`, `currency`, `method` (`CASH`/`BANK_TRANSFER`/`CARD`/`WALLET`/`OTHER` — only `CASH` is realistically used today, matching the system's actual COD-only reality; the others exist so a real integration never needs a schema change), `provider`/`providerReference` (nullable, unique when present), `status` (`INITIATED`/`PENDING`/`CONFIRMED`/`FAILED`/`REVERSED`), `initiatedAt`/`completedAt`/`failedAt`, `createdByUserId`, `idempotencyKey` (unique).

### Lifecycle
```
createPayment   → INITIATED   (only against an APPROVED or PARTIALLY_PAID settlement)
confirmPayment  → CONFIRMED   (rejects overpayment — see §2.2)
failPayment     → FAILED      (never contributes to settlement paid-status)
reversePayment  → REVERSED    (CONFIRMED only; content stays immutable, only status moves)
```
A payment **never** changes `deliveryFinancialLedger` and **never** recalculates a settlement's `amountCents`. A `CONFIRMED` payment's own fields (`amountCents`/`method`/`provider`) are never edited by any code path — the only further transition is `reversePayment`, which is itself status-only.

### Settlement status derivation
`recomputeSettlementPaymentStatus` (private, called after every confirm/reverse) sums the settlement's currently-`CONFIRMED` payments and derives:
```
sum <= 0                      → APPROVED
0 < sum < settlement.amount   → PARTIALLY_PAID
sum >= settlement.amount      → PAID
```
This is purely a derived read — `settlements.amountCents` itself is never touched. **Reversing a payment correctly moves a settlement back down** (e.g. `PAID → PARTIALLY_PAID`) — this is a normal derived-status recomputation, not a rewrite of history: verified live (delivery #45's partial-payment test: reversing the second of two confirmed payments moved the settlement from `PAID` back to `PARTIALLY_PAID`).

### Overpayment
**Rejected**, not auto-adjusted. Two layers:
1. `createPayment` refuses to even create a new payment against a settlement already at `PAID` — the settlement's `APPROVED`/`PARTIALLY_PAID`-only creation guard is itself the strongest form of overpayment prevention.
2. `confirmPayment` additionally checks, at confirm time: `sum(other CONFIRMED payments) + this payment's amountCents <= settlement.amountCents` — rejects if it would exceed. This covers the case where multiple `INITIATED` payments exist speculatively (e.g. "try card, it fails, try cash") and only one should ever actually count.

### Idempotency
Same `ON CONFLICT DO NOTHING` + read-back pattern as `createFinancialLedgerEntry`/`calculateDeliverySettlement`, keyed by a caller-supplied `idempotencyKey`. **One subtlety discovered during testing**: the naive design (checking settlement status *before* checking for an existing `idempotencyKey`) rejected a legitimate retry of a payment that had *itself* just moved the settlement to `PAID` — a retry would see "settlement already PAID" and fail, when it should instead recognize "this exact payment already happened" and return the same row. Fixed by checking for an existing row by `idempotencyKey` **first**, before evaluating the settlement-status guard — a genuinely new `idempotencyKey` is still fully subject to the guard.

### Authorization
Every payment mutation (`create`/`confirm`/`fail`/`reverse`) is reachable only through `requireAdmin`-gated routes. No supplier/driver/coffee-owner write path exists anywhere in this layer.

---

## 3. COD Reconciliation

### Why separate from delivery status
`DELIVERED` is proof of drop-off; it is never treated as proof cash was physically collected — a distinct, later, real-world event. `cod_reconciliations` is a wholly separate table from `deliveries`/`deliveryFinancialLedger`.

### Model
One row per delivery (`deliveryId` globally unique), created automatically — same transaction, same trigger point as settlement calculation (`updateDeliveryStatus`'s `DELIVERED` branch) — but **only** when `orders.paymentMethod === 'CASH_ON_DELIVERY'`. A card/mobile/bank-transfer order's `DELIVERED` transition creates nothing here.

`expectedAmountCents = subOrder.subtotal + delivery.deliveryFee` — the real, already-existing amount owed for this specific delivery's sub-order, computed once and frozen at creation, never invented.

### Lifecycle
```
EXPECTED    (auto-created at DELIVERED, COD orders only)
  → COLLECTED   (driver records — recordCashCollected)
  → REMITTED    (Supplier/Delivery Company records — recordCashRemitted)
  → RECONCILED  (Admin confirms — reconcileCod, exact match)
  → DISCREPANCY (Admin confirms — reconcileCod, mismatch: exposed, never silently absorbed)
```
`discrepancyCents = remittedAmountCents − expectedAmountCents`, computed and stored either way — a nonzero value routes to `DISCREPANCY` instead of `RECONCILED`, but the number itself is always visible to Finance.

### Authorization
- **Driver**: `recordCashCollected` — only the delivery's own assigned driver (`canUserAccessDelivery`, role `DRIVER`). Verified: a different driver is rejected with `Forbidden`.
- **Supplier / Delivery Company**: `recordCashRemitted` — only the delivery's own operating Supplier or Delivery Company (`canUserAccessDelivery`, respective role). Verified: an unrelated Supplier/Company is rejected.
- **Admin**: `reconcileCod` only.

No client-supplied actor id is ever trusted — every check resolves the caller from `req.session.userId`.

### Self Pickup / Historical safety
A `SELF_PICKUP` sub-order has no `deliveries` row at all — structurally impossible to produce a COD record. A delivery already `DELIVERED` before this phase shipped (e.g. delivery #48) has zero COD rows — the trigger is wired to the `DELIVERED` *transition*, never retroactively applied to an already-`DELIVERED` *value*, so no backfill occurs.

---

## 4. Refunds

### Model
`refunds` — `paymentId` and/or `settlementId` (at least one required), `amountCents`, `reason`, `status` (`REQUESTED`/`CONFIRMED`/`FAILED`/`CANCELLED`), `initiatedByUserId`/`initiatedAt`/`completedAt`.

### Rule: never edits the original fact
A refund **never** modifies the ledger entry, settlement, or payment it refunds. Verified directly: a delivery's `DRIVER_PAYOUT` ledger entry was captured byte-for-byte before and after confirming a refund against its payment — identical.

### Refundable cap
`requestRefund`/`confirmRefund` both compute `refundableCents = sum(CONFIRMED payments) − sum(already-CONFIRMED refunds)` and reject any request/confirmation exceeding it. Checked at **both** request time (fail fast) and confirm time (defense against a race between two concurrent refund requests). Verified: a refund for more than the confirmed amount is rejected; after a partial refund is confirmed, the refundable cap correctly shrinks for any subsequent refund attempt.

### Authorization
Request and confirm/fail/cancel are all Admin-only in this phase (`requireAdmin`-gated routes) — no automatic or self-service refund path exists for any other role.

---

## 5. Adjustments

### Model
`adjustments` — `ledgerEntryId` and/or `settlementId` (at least one required), `amountCents` (always positive — `direction` carries the sign, exactly the `deliveryFinancialLedger` convention), `direction` (`CREDIT`/`DEBIT`), `reason`, `createdByUserId`/`createdAt`. No lifecycle/status — the act of creating the row **is** the correction; there is nothing to confirm afterward.

### Rule: additive only
Never modifies the entry/settlement it references. Verified: a `DRIVER_PAYOUT` ledger entry was captured before and after an adjustment referencing it was created — byte-identical.

### Authorization
Admin-only creation (`requireAdmin`-gated route). No automatic adjustment policy is invented anywhere — every adjustment requires an explicit Admin-supplied `amountCents`/`direction`/`reason`.

---

## 6. Settlement Grouping — Kept Deliberately Small

**No batching/accounting-period engine was built.** The existing one-settlement-per-delivery-per-actor model from Phase 5C.1 is unchanged. What was added instead, per the task's own "keep it small" instruction:

- **Filters**: the existing `GET /api/admin/settlements` already supported delivery/actor-role/actor-id/status filtering (Phase 5C.1); no change needed here.
- **Aggregate totals**: a new `GET /api/admin/financial-summary` endpoint (optional `fromDate`/`toDate`/`actorUserId`) returns settlement/payment/COD counts and sums **grouped by status** — giving Admin "total owed / approved / paid / unpaid / failed / void per driver/company and date range" without any new grouping schema. Settlement totals are grouped by `settlements.status`; payment totals by `payments.status`; both can be scoped to one actor via `actorUserId`.

This satisfies §2 of the task fully. No schema change was needed, and none was made.

---

## 7. Admin Financial Summary — Category Separation

`GET /api/admin/financial-summary`, rendered as a new "Résumé financier" section in the Admin System Management page, returns six **strictly separate** categories — never combined into one blended "profit" figure:

| Category | Source | Never combined with |
|---|---|---|
| **ECONOMIC** | `deliveries` aggregates (fee, driver payout, company payout, supplier contribution, subsidy, deficit) | Anything below — this is what pricing/ledger says is owed, not what moved |
| **SETTLEMENT** | `settlements` grouped by status (PENDING/APPROVED/PARTIALLY_PAID/PAID/VOID), count + sum | — |
| **PAYMENT** | `payments` grouped by status (INITIATED/PENDING/CONFIRMED/FAILED/REVERSED), count + sum | — |
| **COD** | `cod_reconciliations` grouped by status, count + expected-sum | — |
| **REFUNDS** | confirmed refund count + sum | — |
| **ADJUSTMENTS** | credit sum vs. debit sum, separately | — |

Every number in the UI is labeled with its category and status — e.g. "Driver payouts owed (économique)" is never shown next to "Driver payouts paid (paiement)" as if they were the same figure.

---

## 8. Driver / Supplier / Delivery Company Visibility — Completed

`getActorFinancialSummary` (self-service, `GET /api/me/financial-summary`) returns `{ owedCents, approvedCents, paidCents, outstandingCents }`, scoped exactly like `getActorSettlementHistory` (Phase 5C.1): `DRIVER` sees only its own settlements; `SUPPLIER`/`DELIVERY_COMPANY` see settlements where they are the actor or the counterparty (their own driver's obligations). No new authorization rule was written — this reuses the exact same scoping condition already proven in Phase 5C.1.

Wired into three existing pages, each clearly labeled and kept separate from that page's own economic-earnings figures:
- **Driver** (`wallet.tsx`): a new "Règlement" section (Dû/Approuvé/Payé/En attente) below the existing "Portefeuille" economic-earnings hero.
- **Delivery Company** (`delivery/dashboard.tsx`, shared with Driver, gated `isCompany`): a new "Règlement" card below the existing stat grid.
- **Supplier** (`supplier/dashboard.tsx`): a new "Règlement livraison (chauffeurs)" section, explicitly labeled as distinct from order/product revenue.

**Never exposed** to a non-Admin role through this layer: another actor's settlement/payment (enforced by the pre-existing `getDeliverySettlements`/`getActorSettlementHistory` scoping, unchanged), the Coffee Owner/Supplier fee split to a Driver (unchanged, Phase 5B hardening), another Supplier/Company's data, or any BigBoss-internal figure (`getAdminFinancialSummary` remains `requireAdmin`-gated only).

---

## 9. Historical Safety

Verified directly, every mechanism identical to Phase 5C.1's own no-backfill discipline (the trigger is wired to a status *transition*, never a status *value*):

- Delivery #48 (already `DELIVERED` before this phase shipped): zero settlements, zero COD records.
- Delivery #51 (pre-Phase-1): completely unchanged (`deliveryFee` still 300).
- No payment/refund/adjustment table has any backfill code path at all — every row requires an explicit trigger (a live `DELIVERED` transition for COD, an Admin action for payments/refunds/adjustments).

Self Pickup and multi-supplier isolation are unaffected — both already proven structurally impossible-to-violate at the `deliveries`-row level (Phase 1) and the authorization level (Phase 5B/5C.1), and nothing in this phase changes either mechanism.

---

## 10. Idempotency & Concurrency

| Write | Mechanism |
|---|---|
| `createPayment` | `idempotencyKey` unique constraint, `ON CONFLICT DO NOTHING` + read-back — checked for an existing key **before** the settlement-status guard (see §2's idempotency note) |
| `providerReference` | Independently unique-constrained at the DB level (partial index, `WHERE provider_reference IS NOT NULL`) |
| `confirmPayment` | Runs inside a transaction that takes a `SELECT ... FOR UPDATE` row lock on the settlement **before** re-reading the confirmed-payment sum and performing the compare-and-swap `UPDATE`. **Hardening fix (final closure pass)**: the original design checked the overpayment cap via a plain read followed by a single-row compare-and-swap on the *payment* row — safe against a double-click on the *same* payment, but not against two *different* payments for the *same* settlement being confirmed at nearly the same instant (a single-row CAS cannot protect an aggregate SUM constraint spanning multiple rows). Verified live: two payments together exceeding a settlement's amount, confirmed via `Promise.allSettled` — exactly one succeeds, the total confirmed never exceeds the settlement amount. |
| `failPayment`/`reversePayment` | Compare-and-swap `UPDATE ... WHERE id = ? AND status = ...` — a double-click can only ever succeed once. No aggregate cap to protect (reversal only ever decreases the confirmed sum), so no lock needed. |
| `approveSettlement`/`voidSettlement` | Unchanged from Phase 5C.1 — same compare-and-swap discipline |
| `cod_reconciliations` collect/remit/reconcile | Each is a compare-and-swap on the record's current status (`EXPECTED`→`COLLECTED`→`REMITTED`→`RECONCILED`/`DISCREPANCY`) — a double-click on "record collection" fails on the second attempt since the row is no longer `EXPECTED` |
| `confirmRefund` | Same fix as `confirmPayment`: runs inside a transaction that locks the referenced payment (or settlement, for a settlement-only refund) via `FOR UPDATE` before re-validating the refundable cap and updating. **Hardening fix (final closure pass)**: the original design's "re-validate at confirm time" was itself a plain read + separate compare-and-swap, vulnerable to the same TOCTOU race as payments — two REQUESTED refunds together exceeding the refundable amount could both pass an unprotected check. Verified live under genuine `Promise.allSettled` contention: exactly one of two overlapping refund confirmations succeeds, the total confirmed refund amount never exceeds the refundable cap. |
| `requestRefund` | Cap checked once at creation (fail-fast, no lock) — this only creates a `REQUESTED` row, moves no money, and the authoritative cap enforcement is `confirmRefund` above |
| `createAdjustment` | No idempotency key — each call is an explicit, distinct Admin action with its own `reason`; duplicate adjustments are a matter of Admin diligence, not a system-level idempotency concern (unlike payment/COD actions, there is no "retry" semantic to protect against — an adjustment is always a deliberate one-off correction) |

None of the above relies on frontend protection — every guard is a database-level compare-and-swap, row lock, or unique constraint.

---

## 11. Tests

All required scenarios (§11 of the task) were implemented and passed — 36 assertions, live against the database, every test artifact fully reverted/deleted afterward:

1. Settlement → confirmed payment (full lifecycle, delivery #44) ✅
2. Payment retry does not duplicate (idempotencyKey) ✅
3. Failed payment does not mark settlement paid ✅
4. Partial payment behavior (two payments, PARTIALLY_PAID → PAID; reversal moves it back down) ✅
5. Overpayment rejected (both at creation-against-PAID-settlement and at confirm-time-would-exceed) ✅
6. Confirmed payment cannot be edited (double-confirm rejected) ✅
7. Settlement cannot be changed after payment (re-approve/void a PAID settlement both rejected) ✅
8. COD expected amount (auto-created, formula verified) ✅
9. COD collection (driver) ✅
10. COD remittance (supplier) ✅
11. COD reconciliation (exact match → RECONCILED) ✅
12. COD discrepancy (mismatch → DISCREPANCY, exposed) ✅
13. Refund cannot exceed refundable amount (both initial cap and cap-after-a-confirmed-refund) ✅
14. Refund does not modify original ledger (byte-identical before/after) ✅
15. Adjustment does not modify original ledger (byte-identical before/after) ✅
16. Admin authorization (every mutation Admin-gated at the route layer) ✅
17. Driver isolation (Driver B cannot record Driver A's cash collection) ✅
18. Supplier isolation (Supplier B cannot remit for Supplier A's delivery) ✅
19. Delivery Company isolation (unrelated company cannot remit for a Supplier-mode delivery) ✅
20. Self Pickup produces no financial/COD records ✅
21. Multi-supplier isolation (unaffected, unchanged mechanism) ✅
22. Historical delivery remains unchanged (#48 zero settlements/COD, #51 deliveryFee frozen) ✅
23. Existing Phase 1–5C.1 regression (deliveries #44/#45 correctly revert to baseline; existing settlement/reassignment machinery untouched and reused, not duplicated) ✅

---

## 12. Database Changes

Four new tables, one enum extension. No existing table/column modified:

- `payments` (+ `payment_method`, `payment_status` enums)
- `cod_reconciliations` (+ `cod_reconciliation_status` enum)
- `refunds` (+ `refund_status` enum)
- `adjustments`
- `settlement_status` enum extended: `PENDING`/`APPROVED`/`VOID` (Phase 5C.1) → `+PARTIALLY_PAID`/`+PAID` (this phase) — additive `ALTER TYPE ... ADD VALUE`, no existing row's status changes as a result.

---

## 13. Files Changed

- `shared/schema.ts` — new tables/enums/types (§12)
- `server/storage.ts` — payment lifecycle, COD reconciliation, refunds, adjustments, `getAdminFinancialSummary`, `getActorFinancialSummary`; `updateDeliveryStatus`'s `DELIVERED` branch additionally calls `createCodReconciliationIfApplicable`
- `server/routes.ts` — Admin payment/COD/refund/adjustment/financial-summary routes; self-service COD collect/remit + `GET /api/me/financial-summary`
- `client/src/hooks/use-delivery-ecosystem.ts` — matching types + hooks for every new endpoint
- `client/src/pages/admin/system-management-page.tsx` — Financial Summary, COD Reconciliations, Refunds & Adjustments sections; Settlement section extended with a per-settlement Payments dialog
- `client/src/pages/driver/wallet.tsx`, `client/src/pages/delivery/dashboard.tsx`, `client/src/pages/supplier/dashboard.tsx` — self-service Owed/Approved/Paid/Outstanding sections
- `docs/bigboss-delivery-settlement-architecture.md` — status/roadmap updated to reflect what's now implemented
- `docs/bigboss-delivery-financial-strategy.md` — this document

---

## 14. Business Decisions — Still Unresolved (unchanged by this phase)

None of the following were decided or invented. Where a feature touches one, the data/state is exposed, never auto-assigned:

| Decision | Where it stays visible/queryable |
|---|---|
| Delivery Company commission | `deliveryPricingSettings.driverPayoutSharePercent` remains the sole source of truth (unchanged) |
| BigBoss commission | Not implemented anywhere — no field, no code path |
| Driver minimum guarantee | Not implemented — no `GUARANTEE_TOPUP` entry type added |
| Cancellation compensation | Not implemented — no `CANCELLATION_COMPENSATION` entry type added |
| BigBoss subsidy funding | `bigBossSubsidyCents` remains architecturally supported, always 0 in practice (unchanged) |
| Deficit responsibility | `settlements.budgetResultAtCalculation`/`budgetDeficitCentsAtCalculation` visible on every settlement row and in the Admin financial summary — never auto-assigned to any actor |
| Settlement frequency/batching policy | One settlement per delivery per actor remains the model — no period/batch engine |
| Provider fees | N/A — no provider integrated |
| COD discrepancy responsibility | `discrepancyCents` exposed on every reconciled COD record — never auto-resolved or auto-charged to any actor |

---

## 15. Remaining Technical Limitations

- No `payment_attempts` table (only needed once a real card/bank provider requiring multi-attempt tracking is integrated — explicitly deferred, per the architecture doc's own reasoning).
- No payment-provider webhook handling (no provider exists to send one).
- No dispute engine, no financial-closing/period-lock mechanism, no full GMV-style Admin report beyond the category-separated summary in §7.
- Refunds have no `responsibleActorRole` field (the architecture doc's original design included one) — omitted because no refund-responsibility policy exists yet to populate it meaningfully; additive to add later.
- The Admin "Financial Summary" date-range filter applies to `deliveries.feeFinalizedAt`/`settlements.calculatedAt`/`payments.createdAt`/`codReconciliations.createdAt` independently per category (each category's own natural timestamp) — there is no single unified "transaction date" concept across all five categories, which is intentional (each category's timestamp means something different) but worth knowing when reading a date-filtered report.

---

## 16. Final Stop Condition

Reached. No payment-provider integration, no automatic driver payouts, no wallet infrastructure, no banking integration, no accounting-period engine, no tax accounting, no commission optimization was started. The delivery financial architecture is now practically complete and internally consistent at the internal-record-keeping level described above.
