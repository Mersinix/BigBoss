# BigBossCoffee Delivery — Phase 5C.1 Settlement Foundation

### Status: **IMPLEMENTED, TESTED.** Builds on `docs/bigboss-delivery-settlement-architecture.md` (design) and everything through Phase 5B hardening.

This is the FINANCIAL LEDGER → SETTLEMENT step only. The SETTLEMENT → PAYMENT step (payments table, payment providers, COD reconciliation, refunds, adjustments) is explicitly **not implemented** — see "Not Implemented" at the bottom.

---

## Settlement Model

A settlement converts a delivery's already-frozen, already-AUTHORIZED ledger CREDIT entries into one grouped, approvable obligation for **one recipient actor**. It never recomputes pricing or payout — every `amountCents` traces straight back to `deliveryFinancialLedger.amountCents`, which itself traces back to Phase 1–4's frozen snapshot columns on `deliveries`.

Two new tables, following the architecture doc's own recommendation (§4) of a separate layer rather than mutating the ledger:

- **`settlements`** — one row per (delivery, recipient actor). Fields: `deliveryId`/`orderId`/`subOrderId` (denormalized, matching the ledger's own convention), `actorRole`/`actorUserId` (who is paid), `counterpartyRole`/`counterpartyUserId` (who owes it — copied from the ledger entries), `amountCents`/`currency`, `status`, `budgetResultAtCalculation`/`budgetDeficitCentsAtCalculation` (a frozen snapshot of the delivery's own `DeliveryBudgetEngine` result at calculation time), `sourceReference`, `idempotencyKey`, `calculatedAt`/`approvedAt`/`approvedByUserId`/`voidedAt`.
- **`settlement_items`** — the join that explains "why is this actor owed this amount." One row per ledger entry claimed. `ledgerEntryId` carries a **global** unique constraint (not just unique-per-settlement) — a single ledger entry can be claimed by **at most one settlement, ever**, enforced by the database itself, not just application logic.

**Who ever gets a settlement**: only `DRIVER` and `DELIVERY_COMPANY` — the only two `LedgerActorRole` values that ever appear on a CREDIT ledger entry. `CAFE_OWNER`, `SUPPLIER` (as a funder), and `BIGBOSS` (as a subsidy funder) entries are always DEBIT — funding sources, never settlement recipients — and structurally can never produce a settlement row, since `calculateDeliverySettlement` only ever reads `direction = 'CREDIT'` entries. This was verified directly: across every test in this phase, zero settlements were ever created for `CAFE_OWNER` or `SUPPLIER`.

---

## Settlement Lifecycle

```
PENDING  →  APPROVED  (Admin-only, amount frozen at this point)
PENDING  →  VOID      (Admin-only, only while still PENDING)
```

Deliberately **not** `PAID`/`PARTIALLY_PAID`/`FAILED` — the architecture doc's own full future state set (§3) — because no payment layer exists yet to ever set them. Adding them now would be a state no code path could ever reach. `APPROVED` cannot be voided (approval is this phase's amount-freeze point, mirroring `deliveryFinancialLedger`'s own "status only ever progresses forward" discipline); voiding an approved settlement would require a correction mechanism (a future ADJUSTMENT/REFUND phase, architecture doc §10), out of scope here.

---

## Ledger → Settlement Relationship

`calculateDeliverySettlement(deliveryId)` (private, `server/storage.ts`) is the single function that ever writes to `settlements`/`settlement_items`. It:

1. Reads **only** ledger entries with `status = 'AUTHORIZED'` **and** `direction = 'CREDIT'` for the delivery.
2. Groups them by `(actorRole, actorUserId)` — in practice at most two groups: `DRIVER` (whenever a driver was paid) and `DELIVERY_COMPANY` (only in `DELIVERY_COMPANY` mode).
3. Writes one settlement per group, `amountCents` = the exact sum of the group's ledger entries, and one `settlement_items` row per entry claimed.

A ledger entry only ever reaches `AUTHORIZED` once, at the moment `updateDeliveryStatus` transitions a delivery to `DELIVERED` — and that transition only promotes whichever entries are **currently** `CALCULATED` (i.e. the single active assignment's entries; every earlier, superseded assignment's entries are already `VOID` by then — see the Phase 5B hardening `assignmentSequence` doc). This means `calculateDeliverySettlement` never needs to filter by `sourceReference`/`assignmentSequence` itself: `status = 'AUTHORIZED'` already guarantees exactly one assignment's worth of entries per delivery, forever.

**Trigger**: `calculateDeliverySettlement` runs automatically, inside the **same database transaction** as the `DELIVERED` status transition and the `CALCULATED → AUTHORIZED` ledger transition (see `updateDeliveryStatus`). There is no standalone "calculate settlement" API endpoint — settlement creation is a deterministic consequence of delivery completion, never a separate user action, per the task's own preference for internal/service-level calculation over an unnecessary endpoint.

---

## Reassignment Behavior

Directly tested for A→B, A→B→C, A→B→A, A→B→C→A (reusing the exact reassignment machinery Phase 5B hardening already proved correct at the ledger level):

- Every reassignment before `DELIVERED` voids the superseded assignment's ledger entries (Phase 5B behavior, unchanged).
- Only the **final, active** assignment's entries ever reach `AUTHORIZED` — reassignment is blocked once a delivery reaches `DELIVERED` (pre-existing guard), so there is no way to reassign *after* a settlement has been calculated.
- **A→B→A test result**: delivery reassigned Driver A → Driver B → back to Driver A, then delivered. Exactly **one** settlement was created, belonging to Driver A (the final assignment, `sourceReference = delivery:45:seq:3`) — never Driver B, and never confused with Driver A's own first (voided) assignment. The settlement's `settlement_items` reference only the `AUTHORIZED` entries; none reference any `VOID` entry, verified by direct id cross-check against the ledger.

---

## Idempotency

`calculateDeliverySettlement` uses the exact `ON CONFLICT DO NOTHING` + read-back pattern already proven for `createFinancialLedgerEntry` (Phase 5A): `idempotencyKey = DELIVERY_SETTLEMENT:<sourceReference>:<actorRole>:<actorUserId>`, unique-constrained. Calling it twice (or a hundred times) for the same delivery produces exactly the same settlement rows — directly tested (`beforeCount === afterCount` after a duplicate call).

`settlement_items.ledgerEntryId`'s **global** uniqueness is a second, independent layer of defense: even if two different settlements' calculation somehow raced past the settlement-level idempotency key, the same ledger entry could still never be claimed twice.

## Concurrency

Two simultaneous `calculateDeliverySettlement` calls for the same delivery were run via `Promise.all` — both converged to the same single settlement (same `id`), never two competing rows. The database's unique constraint on `idempotencyKey` is the actual safety mechanism (not application-level locking): whichever `INSERT` loses the race gets `ON CONFLICT DO NOTHING`'d and reads back the winner's row.

---

## Authorization

Mirrors the exact Phase 5B hardening discipline, never duplicated:

- `getDeliverySettlements(deliveryId, actingUser)` reuses `canUserAccessDelivery` for delivery-level access, then applies a **stricter, settlement-specific filter**: even a role that can access the delivery overall (e.g. the Coffee Owner) only ever sees settlement rows where they are the settlement's own `actorRole`/`actorUserId` or `counterpartyRole`/`counterpartyUserId`. Directly tested: the delivery's own Coffee Owner (who legitimately passes `canUserAccessDelivery`) still sees **zero** settlements — the exact leak Phase 5B hardening closed for `redactDeliveryCodes`, now closed for settlements too, from day one.
- `getActorSettlementHistory` mirrors `getActorFinancialHistory`'s scoping exactly: `DRIVER` sees only its own settlements; `SUPPLIER`/`DELIVERY_COMPANY` see settlements where they are the actor or the counterparty; `CAFE_OWNER` has no settlement history endpoint at all (a Coffee Owner is structurally never a settlement recipient).
- Every mutation (`approveSettlement`, `voidSettlement`) is reachable only through Admin-gated routes (`requireAdmin`).
- ID-tampering tests (Supplier B, Driver B, an unrelated Delivery Company, each attempting to view another actor's settlement by guessing a delivery id) all correctly return `Forbidden`.

---

## Historical Freezing / No Backfill

Two already-`DELIVERED` deliveries that predate this phase (#48, #54) were checked directly: **zero** settlement rows exist for either. Settlement creation is wired only into the live `DELIVERED` transition — a delivery that reached `DELIVERED` before this code shipped simply never re-enters that code path, so it is never retroactively settled. This is the same "no backfill, ever" discipline established in Phase 5B hardening, now inherited by the settlement layer without any extra code needed to enforce it — it falls out naturally from settlement calculation being wired to a status *transition*, not a status *value*.

One incidental discovery from this: delivery #52 (an older record with `driverPayoutCents`/`companyPayoutCents` already frozen but **zero** ledger entries — apparently assigned before the Phase 5A ledger was wired into `assignDriver`) correctly produces **zero** settlements when driven to `DELIVERED`, because settlement calculation reads only the ledger, never the delivery's own frozen columns directly. This is by design, not a bug: it demonstrates that a delivery whose obligations were never captured in the ledger cannot be settled, rather than settlement silently falling back to recomputing from `deliveries.driverPayoutCents` (which would reintroduce exactly the "recalculating historical economics" risk rule 4 of the task forbids).

---

## Deficit Handling

`settlements.budgetResultAtCalculation`/`budgetDeficitCentsAtCalculation` snapshot the delivery's own `DeliveryBudgetEngine` result (`FUNDED`/`BREAK_EVEN`/`DEFICIT`) at the exact moment the settlement was calculated — visible directly on the settlement row (and surfaced in the Admin UI), without ever silently deciding who absorbs a deficit. This remains an explicit, undecided business question (architecture doc §25) — the settlement layer's only job is to make it **visible**, never to resolve it.

---

## Self Pickup

Unaffected, structurally: a `SELF_PICKUP` sub-order has zero `deliveries` rows (unchanged since Phase 1), therefore zero ledger entries, therefore zero settlement surface. Re-verified directly.

## Multi-Supplier

Unaffected: settlement rows are scoped per-`deliveryId` exactly like every ledger entry, and the authorization layer (above) independently guarantees one supplier's actors can never see another's settlement.

---

## Financial Integrity

`reconcileSettlement(settlementId)` re-derives a settlement's total from its `settlement_items` and, transitively, their referenced ledger entries — never trusts the stored `amountCents` at face value. Every settlement created in this phase's tests reconciled exactly (`ok: true`). All amounts are `Number.isInteger`-verified — no floating-point monetary value anywhere in this layer, matching the ledger's own integer-cents discipline throughout.

---

## Database Changes

Two new tables, no changes to any existing table besides the additive read-through this phase performs on `deliveryFinancialLedger`/`deliveries` (read-only there — no column added, no existing column's meaning changed):

- `settlements` (`settlement_status` enum: `PENDING`/`APPROVED`/`VOID`)
- `settlement_items`

---

## Known Limitations

- **No dedicated Driver/Supplier/Delivery-Company settlement browsing UI.** The backend (`getDeliverySettlements`, `getActorSettlementHistory`) and client hooks (`useDeliverySettlements`, `useMySettlementHistory`) are fully implemented and tested, but only the Admin panel renders a settlement table in this phase — the exact same scope boundary Phase 5B drew for the financial ledger itself ("No dedicated ledger-entry-by-entry browsing UI for Suppliers/Drivers/Companies"). A future phase can wire the existing hooks into driver/supplier-facing pages without any backend change.
- **True concurrent double-submission of a delivery-status transition** (not a sequential retry) is bounded by `updateDeliveryStatus`'s own pre-existing compare-and-swap on `(id, status)` — only one concurrent `DELIVERED` transition can ever win, so `calculateDeliverySettlement` is never invoked twice for genuinely racing requests in the first place. This is a pre-existing characteristic of `updateDeliveryStatus`, not new to this phase.
- **A delivery with pre-Phase-5A ledger gaps** (assigned before the ledger existed, like delivery #52) can never be settled, by design — see "Historical Freezing" above. This is treated as correct behavior, not a limitation to fix, but is worth knowing: `driverPayoutCents` being populated on a delivery does **not** guarantee a settlement will ever exist for it if that delivery predates ledger wiring.
- **No approval workflow beyond a single Admin action.** `approveSettlement` records `approvedByUserId`/`approvedAt` but there is no multi-step approval chain, no notification, no batching of multiple settlements into one approval action — all explicitly deferred (architecture doc §25/§26: settlement frequency/grouping remains an undecided business question).

---

## NOT Implemented (by design — see `docs/bigboss-delivery-settlement-architecture.md` §29)

| Item | Status |
|---|---|
| Payment entities/tables | NO |
| Payment providers/webhooks | NO |
| Bank transfers / wallets | NO |
| COD reconciliation | NO |
| Refund engine | NO |
| Adjustment engine | NO |
| Dispute engine | NO |
| Driver minimum guarantee | NO — business decision still required |
| Cancellation compensation | NO — business decision still required |
| Settlement batching (multi-delivery periods) | NO — business decision still required (settlement frequency) |
| Advanced financial analytics/reporting | NO |
| Automatic payout execution | NO |

The result, exactly matching the requested final state:

```
PRICING
    ↓
FROZEN ECONOMIC OBLIGATION
    ↓
FINANCIAL LEDGER
    ↓
SETTLEMENT FOUNDATION   ← implemented and tested in this phase
    ↓
[NOT IMPLEMENTED YET]
PAYMENT
```
