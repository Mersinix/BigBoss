# BigBossCoffee Delivery — Financial Ledger (Phase 5A)
### Implemented, tested. Foundation only — see "Current Limitations" for exactly what is NOT yet built.

This document describes the `deliveryFinancialLedger` table and its integration, implemented per `docs/bigboss-delivery-business-rules-money-flow.md`. It records **economic events** derived from the already-existing, already-frozen Phase 1-4 pricing/payout snapshot — it does not change pricing, payout calculation, delivery assignment, or Self Pickup behavior in any way.

---

## Purpose

Before Phase 5A, every financial figure in BigBossCoffee's delivery system (`deliveryFee`, `driverPayoutCents`, `companyPayoutCents`, etc.) existed only as columns on the single, frozen `deliveries` row for that sub-order. There was no durable, append-only, auditable record of "this economic fact was true, for this delivery, at this moment" independent of the delivery row itself. The ledger is that record — a permanent, queryable history of every economic event a delivery generates, from the moment its pricing/payout is frozen through its completion or cancellation.

## Entry Types

```
DELIVERY_CHARGE           — the Coffee Owner's own delivery contribution
SUPPLIER_CONTRIBUTION     — the Supplier's contribution (includes any subsidy)
DRIVER_PAYOUT              — what the driver economically earned
DELIVERY_COMPANY_PAYOUT   — what the Delivery Company retains (DELIVERY_COMPANY mode only)
BIGBOSS_SUBSIDY            — BigBoss-funded subsidy (never written today — always 0)
WEATHER_INCENTIVE          — driver weather bonus (only written when active)
PEAK_INCENTIVE              — driver peak-hour bonus (only written when active)
WAITING_COMPENSATION        — driver waiting compensation (only written when actually billed)
CANCELLATION_COMPENSATION  — reserved; never written (not yet calculated by the current system)
REFUND                      — reserved; never written (no refund engine yet)
ADJUSTMENT                  — reserved; never written (no adjustment engine yet)
BONUS, DEMAND_SURGE, SETTLEMENT — reserved for future phases; never written by any Phase 5A code
```

## Statuses

```
CALCULATED  — default, set at write time. An economic fact has been computed.
AUTHORIZED  — set (status-only, bulk) when the delivery reaches DELIVERED.
VOID        — set (status-only, bulk) when the delivery reaches CANCELLED.
OWED, PAID, REFUNDED, DISPUTED — reserved for a future settlement/refund/adjustment phase.
              No Phase 5A code path ever sets any of these.
```
**Why entries never automatically reach PAID**: there is no payment execution system anywhere in this codebase. An entry reaching `PAID` would imply real money moved — Phase 5A makes no such claim about any figure it records.

## Direction Semantics

```
CREDIT — this actor is ENTITLED TO RECEIVE amountCents.
DEBIT  — this actor is RESPONSIBLE FOR / CHARGED amountCents.
```
Example: `DRIVER_PAYOUT` — Driver = actor, direction=CREDIT (they're entitled to receive it); the responsible payer (`counterpartyRole`) is the Supplier (`SUPPLIER` mode) or the Delivery Company (`DELIVERY_COMPANY` mode) — **never BigBoss**, unless a real, non-zero `BIGBOSS_SUBSIDY` entry exists for the same delivery (which it never does today).

## Economic Event vs. Obligation

**A ledger entry existing means an economic amount was CALCULATED.** It does **not** mean:
- BigBoss owes anyone anything (BigBoss's own liability is represented only via `actorRole='BIGBOSS'`, which no Phase 5A code path ever writes with a non-zero amount).
- The named actor has been paid.
- Any money has physically moved.

This distinction is enforced structurally, not just by convention: `DRIVER_PAYOUT`'s `counterpartyRole` is computed directly from `delivery.deliveryMode` (`SUPPLIER` or `DELIVERY_COMPANY`), and no code path anywhere sets it to `BIGBOSS`. Live-tested: a Supplier-mode delivery's `DRIVER_PAYOUT` entry has `counterpartyRole='SUPPLIER'`; no entry for that delivery ever has `actorRole` or `counterpartyRole` equal to `'BIGBOSS'`.

## Idempotency

`idempotencyKey = ${sourceEvent}:${sourceReference}:${entryType}`, unique-constrained at the database level. Writing is `INSERT ... ON CONFLICT (idempotencyKey) DO NOTHING`, then reading back whichever row actually exists. Live-tested: calling the ledger-writing function twice with identical inputs produces exactly one row, and a later call attempting to write a *different* amount under the same key is silently ignored — the original amount is what survives.

## Immutability

Once written, an entry's `amountCents`/`direction`/`actorRole`/`actorUserId`/`entryType`/every field except `status` is **never** updated or deleted by any application code. `status` may progress forward via one narrowly-scoped method (`updateLedgerEntriesStatus`) that touches *only* the `status` column, filtered by `(deliveryId, fromStatus)` — it can never regress an entry, and it never touches any financial field. Live-tested: after a `DELIVERED` transition, every entry's `amountCents` was confirmed identical to its value at creation; only `status` changed.

## Role Visibility

Phase 5A ships **only** an Admin-only endpoint (`GET /api/admin/delivery-financial-ledger`, gated by `requireAdmin`) and an Admin-only UI panel (System Management → Grand livre financier des livraisons). Per-role self-service views (a Supplier seeing only its own entries, a Driver seeing only their own) are **not built in Phase 5A** — this is explicitly Phase 5B scope. The data model already supports this without any redesign: `actorRole`+`actorUserId` make a future per-role filter a direct `WHERE` clause, nothing more.

## Current Limitations

- **Reassignment does not yet update the ledger.** `reassignDriver` (changing the assigned driver before pickup) still works exactly as before — it re-freezes the delivery's pricing/payout fields on the `deliveries` row, unchanged behavior. It does **not** call the ledger. Correctly representing a reassignment's changed economics in an append-only ledger requires a VOID/ADJUSTMENT mechanism that is explicitly out of scope for Phase 5A. This is a deliberate, documented choice: recording nothing is safer than either double-recording or silently overwriting a prior entry.
- **`BIGBOSS_SUBSIDY` is never written.** No subsidy campaign engine exists (Phase 5F scope). The field/entry type exists so no future migration is needed once one does.
- **`CANCELLATION_COMPENSATION` is never written.** The current system does not calculate cancellation compensation at all — inventing an amount was explicitly out of scope.
- **`REFUND`/`ADJUSTMENT` are never written.** No refund or adjustment engine exists (Phase 5C scope).
- **No settlement layer.** `OWED`/`PAID` are reserved statuses with no code path that reaches them (Phase 5D scope).
- **No balance/aggregate view.** The ledger is queryable per-delivery/per-filter today; a materialized balance-per-actor view is Phase 5B scope.
- **Cash on Delivery's money flow remains undefined** (see `docs/bigboss-delivery-business-rules-money-flow.md` §20) — the ledger records the same `DELIVERY_CHARGE`/`SUPPLIER_CONTRIBUTION`/`DRIVER_PAYOUT` facts regardless of `paymentMethod`, and does not attempt to resolve who physically collects cash.

## Future Settlement Compatibility

Every field a future settlement engine would need already exists: `actorRole`/`actorUserId` (who to settle with), `amountCents`/`direction` (how much, which way), `status` (ready to progress `AUTHORIZED → OWED → PAID`), `effectiveAt` (which period an entry belongs to), and `reversedByEntryId` (reserved, unpopulated, for a future refund/adjustment reversal chain). No schema change is anticipated to be needed for Phase 5B-5D to build on this foundation.

---

## The one sentence to remember:

> **The ledger records economic/accounting events. It does not represent completed real-world payment unless a future settlement/payment system explicitly marks an entry as PAID.**
