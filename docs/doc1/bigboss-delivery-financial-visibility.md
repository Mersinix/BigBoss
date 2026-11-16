# BigBossCoffee Delivery — Financial Visibility & Reassignment Accounting (Phase 5B + Final Hardening)
### Implemented, tested. Builds on Phase 5A's ledger foundation — see `docs/bigboss-delivery-financial-ledger.md`.

**Hardening pass (this revision)**: fixed the two items listed as "Known Limitations" in the original Phase 5B revision of this document — the A→B→A idempotency-key collision, and the `deliveryFee`/`cafeOwnerFeeShareCents`/`supplierFeeShareCents` redaction gap. Both are now resolved; see "Reassignment Accounting" and "Role Visibility Matrix" below for the corrected behavior, and "Hardening Changelog" at the bottom for the exact before/after.

---

## Role Visibility Matrix

| Role | Can see |
|---|---|
| Coffee Owner | Own delivery fee, own contribution (`cafeOwnerFeeShareCents`), whether free delivery was applied, delivery status. **Never**: driver payout, company retained amount, supplier contribution (`supplierFeeShareCents`), any subsidy. |
| Supplier | Own contribution context (`cafeOwnerFeeShareCents`, allowed for context), own subsidy usage, own delivery fee context, own margin (`supplierFeeShareCents`) for its own deliveries, and — **only for its own SUPPLIER-mode deliveries** — its own driver's payout/incentives/waiting compensation (an existing Phase 3/4 rule, reused, never duplicated). **Never**: another supplier's data, an external Delivery Company's internal driver split, BigBoss subsidy/margin. |
| Supplier Driver | Own payout, own weather/peak incentive, own waiting compensation, own payout status. **Never**: the customer-facing fee breakdown (`cafeOwnerFeeShareCents`/`supplierFeeShareCents`), Coffee Owner or Supplier contribution, another driver's earnings. |
| Delivery Company | Own gross/retained amount, its own drivers' payouts, its own delivery fee context, `cafeOwnerFeeShareCents`/`supplierFeeShareCents` for context. **Never**: another company's records, BigBoss subsidy/margin. |
| Delivery Company Driver | Same shape as Supplier Driver — own payout only. |
| Admin | Full ledger, full per-delivery breakdown, including BigBoss-only fields (subsidy, budget result/deficit). |

**Hardening fix**: `redactDeliveryCodes` now also redacts `cafeOwnerFeeShareCents` (hidden from `DRIVER`) and `supplierFeeShareCents` (hidden from `CAFE_OWNER` and `DRIVER`) — closing the gap described in the original Phase 5B revision of this document, where these two fields were visible to every viewer role regardless of the matrix above. `deliveryFee` (the raw total, not the split) remains deliberately **unredacted** for every role, including `DRIVER` — this is an intentional, re-confirmed decision, not an oversight: `delivery-details.tsx` has an existing, tested historical-fallback display path that reads `deliveryFee` when `driverPayoutCents` is `null` (pre-Phase-3 deliveries), and the total fee alone does not reveal the Coffee Owner/Supplier split. `getDeliveryFinancialSummary` (below) remains the stricter, authoritative source when a full role-scoped summary — not just delivery-detail display — is required.

Because `cafeOwnerFeeShareCents`/`supplierFeeShareCents` are genuinely `NOT NULL` database columns (unlike the already-nullable `driverPayoutCents`/`companyPayoutCents`), redacting them to `null` required widening their type at the redaction boundary. `server/storage.ts` introduces a module-level `RedactedDelivery` type (`Omit<Delivery, 'cafeOwnerFeeShareCents' | 'supplierFeeShareCents'> & { cafeOwnerFeeShareCents: number | null; supplierFeeShareCents: number | null }`) used as `redactDeliveryCodes`'s return type; `shared/schema.ts`'s `DeliveryWithDetails` type is widened the same way. This is a type-system-only change — the underlying DB columns remain `NOT NULL`; only the redacted, in-memory, role-scoped view can be `null`.

---

## Financial Summary Rules

`getDeliveryFinancialSummary(deliveryId, actingUser)` — one delivery, shaped per role:
1. Authorization: reuses the **existing** `canUserAccessDelivery` ownership check — never a duplicated rule.
2. Field visibility: reuses the **existing** `redactDeliveryCodes` for every field it already redacts (`driverPayoutCents`, `companyPayoutCents`, incentives, waiting, subsidy, BigBoss fields), and applies its own selection only for the three fields that method doesn't touch (see deviation above).
3. Returns a flat, role-appropriate object — never the raw `Delivery` row.

`getActorFinancialHistory(actingUser, filters)` — an actor's own ledger entries, across all their deliveries, paginated:
- `CAFE_OWNER`/`DRIVER`: entries where they are the **actor** only.
- `SUPPLIER`/`DELIVERY_COMPANY`: entries where they are the actor **or** the counterparty (so a Supplier sees both its own `SUPPLIER_CONTRIBUTION` and its own driver's `DRIVER_PAYOUT`, from one query).
- `ADMIN`/`SUPER_ADMIN`: rejected — Admin uses the dedicated `getFinancialLedgerEntries` query instead, which has no such per-actor restriction.
- The scope is **always** derived from `actingUser.id`/`actingUser.role`, resolved server-side from the authenticated session — no endpoint accepts a client-supplied actor id.

---

## Reassignment Accounting

`reassignDriver` now integrates with the ledger. The delivery row's own re-freeze behavior (recomputing `deliveryFee`/`driverPayoutCents`/etc. for the new driver) is **completely unchanged** — Phase 5B only adds ledger bookkeeping around it, inside the **same transaction**.

**Design (hardened)**: on reassignment, if the new driver differs from the currently-assigned one (`isRealDriverChange`):
1. The `deliveries.assignmentSequence` column (new in this hardening pass — an integer, `NOT NULL DEFAULT 0`) is incremented atomically, DB-native, via `sql\`${deliveries.assignmentSequence} + 1\``. This happens **only** on a genuine driver change — never on a same-driver no-op (Case C).
2. Every `CALCULATED` ledger entry currently on the delivery is set to `VOID` via the exact same `updateLedgerEntriesStatus` method `DELIVERED`/`CANCELLED` already use. **Status-only** — `amountCents`/`direction`/`actorUserId`/`entryType` are never touched, and the original entry is never modified beyond its `status` field.
3. A full new set of entries is written via the same `recordDeliveryFinancialEvents` function `assignDriver` itself uses (no duplicated formula), keyed by a **sequence-scoped** source reference: `delivery:<id>:seq:<assignmentSequence>`.

If the "new" driver is the **same** as the currently-assigned one, both the sequence counter and the ledger are left entirely untouched — no increment, no void, no new entries (Case C).

**The A→B→A fix**: the original Phase 5B design keyed ledger entries by `delivery:<id>:driver:<driverId>` — a **driver-identity**-scoped reference. Reassigning back to a previously-superseded driver (A→B→A) reused A's original key, which collided with A's own now-VOID entries from the first assignment; the unique-idempotency-key constraint then silently absorbed the second insert (`ON CONFLICT DO NOTHING`), leaving no fresh `CALCULATED` entry for the second A assignment. The fix replaces driver-identity keying with a **monotonic, delivery-scoped assignment counter**: `assignmentSequence` increments on every real transition (1 for the first `assignDriver`, 2/3/4/... for each subsequent `reassignDriver`), so assignment #1 (A) and assignment #3 (A again) always get distinct keys (`delivery:44:seq:1` vs. `delivery:44:seq:3`) even though the same driver occupies both. `assignDriver` itself was also changed to use this same keying scheme (`delivery:<id>:seq:1`, since it always sets `assignmentSequence` to 1), replacing its previous bare `delivery:<id>` reference, so both entry points now share one identity scheme.

**Why this stays idempotent under retries**: a retry of an already-applied reassignment presents the same `newDriverId` as the delivery's **current** `driverId`, so it is caught by the pre-existing `isRealDriverChange = previousDriverId !== newDriverId` check and falls into Case C — the no-op branch — *before* the sequence is ever incremented. The counter only advances on a genuine transition, never on a retry of one already applied. (A narrow, pre-existing exception: true *concurrent* double-submission of a reassignment — two requests racing before either commits — could each observe the same "current" driver and both proceed, incrementing the sequence twice for what was intended as one action. This is a characteristic of `reassignDriver`'s existing compare-and-swap concurrency model generally, not something newly introduced or specific to the sequence key, and was out of scope for this hardening pass to fully solve with distributed locking.)

**Live-tested** (delivery #44, chain A→B→A):
```
assignDriver(A=35)        → 3 CALCULATED entries, sourceReference=delivery:44:seq:1, assignmentSequence=1
reassignDriver(B=57)      → seq:1 entries → VOID; 3 new CALCULATED, sourceReference=delivery:44:seq:2, assignmentSequence=2
reassignDriver(A=35)      → seq:2 entries → VOID; 3 new CALCULATED, sourceReference=delivery:44:seq:3, assignmentSequence=3  ← THE FIX
reassignDriver(A=35 again) → no-op (Case C) — sequence NOT bumped, no new ledger rows
```
Final ledger: 9 rows total (3 VOID for seq:1/A, 3 VOID for seq:2/B, 3 CALCULATED for seq:3/A). Exactly ONE `CALCULATED` `DRIVER_PAYOUT` entry exists, and reconstructing responsibility from the ledger alone (querying for the single `CALCULATED` `DRIVER_PAYOUT` row) correctly identifies Driver A as currently responsible — distinct from, and never confused with, A's own first (VOID) assignment. ✓

**Also live-tested** (delivery #45, longer chain A→B→C→A): `assignmentSequence` reaches 4; 12 total ledger rows (4 assignments × 3 entries); exactly 3 `CALCULATED` (the 4th/final assignment) and 9 `VOID` (historical); the active `DRIVER_PAYOUT` entry belongs to Driver A; Driver B's and Driver C's entries remain present as `VOID` history, fully reconstructible. A direct idempotency test at the ledger-write level (re-invoking `recordDeliveryFinancialEvents` with an identical `sourceReference`, simulating a network retry) produced zero duplicate rows.

**Case D (reassignment after DELIVERED)** and **Case E (after CANCELLED)**: both already blocked by `reassignDriver`'s own pre-existing guard (`status !== 'ASSIGNED'` throws) — unchanged, re-verified live.

**Case F (reassignment before payout finalized)**: not reachable. `reassignDriver` requires `status='ASSIGNED'`, which is only ever reached via `assignDriver`, which always finalizes payout in the same transaction — by construction, if status is `ASSIGNED`, payout is already finalized.

---

## Ledger Behavior (unchanged from Phase 5A)

Idempotency (`sourceEvent:sourceReference:entryType`, unique-constrained), immutability (append-only, status-only progression via one narrowly-scoped method), and the economic-event-vs-obligation distinction all carry forward exactly as documented in `docs/bigboss-delivery-financial-ledger.md`. Phase 5B adds no new entry types, no new statuses, and no new table.

---

## Security Model

- Every self-service endpoint (`GET /api/deliveries/:id/financial-summary`, `GET /api/me/financial-history`) resolves the acting user **exclusively** from `req.session.userId` — never from a route parameter or query string.
- `getDeliveryFinancialSummary` throws `Forbidden` (mapped to HTTP 403) for any caller `canUserAccessDelivery` doesn't authorize — live-tested: a different Supplier, an unrelated Delivery Company, and a driver not assigned to the delivery are all rejected.
- `getActorFinancialHistory`'s SQL `WHERE` clause is structurally scoped to `actingUser.id` — there is no code path where changing an id in a request payload could return another actor's rows, because no id from the request is ever used in the query; only the session-resolved one is.
- The Admin ledger endpoint (`GET /api/admin/delivery-financial-ledger`) remains `requireAdmin`-gated, unchanged.

---

## Historical Safety

No historical delivery's pricing/payout fields were modified. Delivery #51 (pre-Phase-5A) re-verified: `deliveryFee` and every Phase 4/5A snapshot field unchanged, zero ledger entries. No backfill was performed for any delivery, in this phase or any prior one.

---

## Self Pickup

Unaffected — zero `deliveries` rows exist for any `SELF_PICKUP` order (structurally, unchanged since Phase 1), therefore zero ledger entries are structurally possible. Re-verified live.

---

## Multi-Supplier

Unaffected — order #146's two deliveries (different suppliers) remain fully independent; the new reassignment/summary/history logic is scoped per-`deliveryId` exactly like every other Phase 5A/5B mechanism.

---

## Database Changes

**One new column, added in the hardening pass**: `deliveries.assignmentSequence` (`integer`, `NOT NULL DEFAULT 0`) — a monotonic per-delivery counter used purely as unique event identity for ledger keying (see "Reassignment Accounting" above). No new tables. Everything else continues to build entirely on the existing `deliveryFinancialLedger` table, per the explicit instruction to prefer extending the existing ledger/event-identity architecture over introducing new schema.

---

## Known Limitations

Both limitations listed in the original Phase 5B revision of this document are now fixed (see "Hardening Changelog" below). Remaining, out-of-scope items:

- **No dedicated ledger-entry-by-entry browsing UI for Suppliers/Drivers/Companies** — the backend (`getActorFinancialHistory`) and hook (`useMyFinancialHistory`) are ready, but only the Admin panel currently renders a full ledger table. Driver-facing pages (`wallet.tsx`, `payments.tsx`) and the Delivery Company/Driver dashboard were corrected to show real payout figures (and, for drivers, an incentive/waiting breakdown per delivery) instead of the raw customer fee, but do not yet render the underlying ledger entries directly.
- **No settlement/payment/COD reconciliation** — unchanged from Phase 5A; still explicitly out of scope. See `docs/bigboss-delivery-settlement-architecture.md` for the architecture (design-only) covering this.
- **True concurrent double-submission of a reassignment** (two requests racing before either commits, as opposed to a sequential retry) could theoretically increment `assignmentSequence` twice for one intended action — a narrow, pre-existing characteristic of `reassignDriver`'s compare-and-swap concurrency model, not newly introduced by this hardening pass. Full resolution would require distributed locking or a DB-level serializable transaction around the read-modify-write, out of scope here.

---

## Hardening Changelog

| Item | Before | After |
|---|---|---|
| Reassignment ledger key | `delivery:<id>:driver:<driverId>` (driver-identity-scoped) | `delivery:<id>:seq:<assignmentSequence>` (monotonic-counter-scoped) |
| A→B→A second "A" assignment | Silently absorbed by unique-key collision — no fresh `CALCULATED` entry; ledger understated true history | Fresh, distinct `CALCULATED` entry (`seq:3`); full 3-assignment history (A/B/A) reconstructible from the ledger alone |
| `cafeOwnerFeeShareCents` via `redactDeliveryCodes` | Visible to every role, including `DRIVER` | Hidden from `DRIVER` |
| `supplierFeeShareCents` via `redactDeliveryCodes` | Visible to every role, including `DRIVER`/`CAFE_OWNER` | Hidden from `DRIVER` and `CAFE_OWNER` |
| `deliveries` schema | — | `+assignmentSequence integer NOT NULL DEFAULT 0` |
