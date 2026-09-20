# SHOP ↔ DELIVERY Synchronization — Implementation Report

Implements the Delivery domain described in `SHOP_DELIVERY_SYNCHRONIZATION_ANALYSIS.md`, connected to (not replacing) the existing Shop order/sub-order pipeline.

**V2 addendum (Supplier-owned delivery, complete order details, Driver navigation) is documented in §12 at the end of this file — read §1–11 first for the base architecture V2 extends.**

---

## 1. Architecture

**One Delivery per sub-order**, not per order — a Shop order can span multiple suppliers with different physical pickup points, so each supplier's sub-order gets its own, independently-tracked delivery. The Coffee Owner still experiences one order.

```
                 SHOP ORDER
                     │
          ┌──────────┼──────────┐
          ↓          ↓          ↓
      SubOrder A  SubOrder B  SubOrder C
          │          │          │
          ↓          ↓          ↓
      Delivery A  Delivery B  Delivery C   (created only once each sub-order is READY)
          │          │          │
       Driver A   Driver B   Driver C
```

`deliveryStatusEnum` (`PENDING, AVAILABLE, ACCEPTED, ASSIGNED, PICKED_UP, IN_TRANSIT, DELIVERED, CANCELLED`) is a separate lifecycle from `orderStatusEnum`. Delivery status is the source of truth for the physical delivery; `orders.status` / `sub_orders.status` remain the source of truth for the customer-facing Shop lifecycle, driven *from* delivery status via the existing sub-order aggregation mechanism (extended, not replaced).

---

## 2. Database Changes

`shared/schema.ts`, migration `migrations/0005_delivery_domain.sql` (applied via `npm run db:push`, the project's existing workflow — confirmed no other migration in this repo is applied any other way).

- **`deliveries` table** (new): `id, subOrderId, orderId, supplierId, cafeId, deliveryCompanyId, driverId, status, pickupAddress (jsonb GeoLocation snapshot), destinationAddress (jsonb GeoLocation snapshot), deliveryFee, createdAt, acceptedAt, assignedAt, pickedUpAt, inTransitAt, deliveredAt, cancelledAt`.
  - Indexes: `subOrderId, orderId, deliveryCompanyId, driverId, status`.
  - **Partial unique index** `deliveries_sub_order_active_unique` on `(sub_order_id) WHERE status <> 'CANCELLED'` — at most one *active* delivery per sub-order; a cancelled one doesn't block a fresh delivery being created for the same sub-order later.
- **`users.delivery_company_id`** (new, nullable): set only on `DRIVER` accounts — which `DELIVERY_COMPANY` owns them. Null for every other role.
- **`orders.delivery_id` left untouched** — still references `users.id`, still unused by any new code path, per the analysis's explicit instruction not to silently repurpose it. Documented as deprecated in-line (`shared/schema.ts`).
- Pickup/destination are **snapshots** taken at delivery-creation time (from the supplier's `users.locationLat/Lng/Address` and the order's `deliveryAddress`), not live references — a supplier changing their profile address later cannot rewrite an already-created delivery's pickup point.
- `deliveryFee` is copied as-is from `orders.deliveryFee` at creation (still always `0` today — no fee algorithm was invented; the column exists so one can be added later without another schema change).

No destructive operation was performed. All 53 pre-existing orders and their `deliveryAddress` data were verified intact after the migration and after two dev-server restarts.

---

## 3. Status Lifecycle

```
AVAILABLE → ACCEPTED → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
    ↓           ↓           ↓
CANCELLED   CANCELLED   CANCELLED
```

Enforced server-side in `storage.ts` (`DELIVERY_TRANSITIONS` map) — every transition is validated against the *current* DB row status with an atomic `UPDATE ... WHERE id = ? AND status = ?` (compare-and-swap), not a read-then-write pair. Invalid transitions (e.g. `DELIVERED → PICKED_UP`) are rejected with `409`. Verified live via curl.

`PENDING` is reserved for a future pre-publish step (e.g. zone-restricted dispatch) and is not used by the current flow — deliveries are created directly in `AVAILABLE`, visible to every approved delivery company (see §11 Known Limitations).

**Sub-order status now includes an authority boundary that didn't exist before**: a Supplier can only move a sub-order up to `READY` (`PATCH /api/suborders/:id/status` now rejects `IN_DELIVERY`/`DELIVERED` with a 400, and rejects any change to an already-`DELIVERED`/`CANCELLED` sub-order with 409). Those two values are now written *only* by the Delivery domain. This closes a gap found while implementing: the pre-existing Supplier UI (`SUPPLIER_NEXT_STATUSES` in `supplier-order-details-modal.tsx`) offered "mark as delivered" directly to suppliers, which would have let them self-report a delivery that no courier ever performed — a second, conflicting status writer the spec explicitly prohibited. Fixed on both client and server.

---

## 4. Shop ↔ Delivery Synchronization

- **READY → Delivery creation**: `storage.createDeliveryForSubOrder()`, called from inside `storage.updateSubOrderStatus()`'s transaction the moment a sub-order transitions into `READY`. Idempotent via `ON CONFLICT DO NOTHING` against the partial unique index — re-firing `READY` twice (verified) still yields exactly one delivery. Self-pickup orders (`deliveryMethod !== 'DELIVERY_SERVICE'`) never get a delivery.
- **Transactional**: sub-order status write + delivery creation/cancellation + order aggregation happen inside one `db.transaction()`, so "READY but no Delivery" can never be observed. (Pack-component stock adjustments remain outside the transaction, unchanged from their pre-existing non-transactional behavior — out of scope for this change, not touched.)
- **Delivery → sub-order → order (the fix for the one-way desync)**: `storage.updateDeliveryStatus()` writes `PICKED_UP`/`IN_TRANSIT` → sub-order `IN_DELIVERY`, and `DELIVERED` → sub-order `DELIVERED`, then calls the **same** `recomputeOrderAggregateStatus()` helper that the supplier-driven path already used — extracted from the original single-writer implementation rather than reimplemented, so there is exactly one aggregation algorithm, not two. Verified end-to-end: order 61's `orders.status` and `sub_orders.status` both reached `DELIVERED` together, and stayed consistent across a server restart.
- **Multi-supplier orders**: verified conceptually via the (unchanged) rank-based aggregation — an order only advances to `DELIVERED` when every active sub-order's delivery has completed; a still-`IN_TRANSIT` sub-order holds the whole order at `IN_DELIVERY`.
- **Cancellation guard**: if a supplier cancels a sub-order that already has an active delivery, `cancelActiveDeliveryForSubOrder()` cancels it in the same transaction (orphan-delivery prevention).
- **Cascade delete**: `storage.deleteOrder()` (admin order deletion) now also deletes the order's `deliveries` rows.

---

## 5. API Endpoints

| Endpoint | Guard | Purpose |
|---|---|---|
| `GET /api/deliveries` | `requireAuth` | Role-scoped list (see §6) |
| `GET /api/deliveries/:id` | `requireAuth` + `canUserAccessDelivery` | Single delivery |
| `POST /api/deliveries` | `requireAdmin` | Manual/recovery creation for a stuck `READY` sub-order — reuses the same idempotent method, cannot bypass business rules |
| `PATCH /api/deliveries/:id/accept` | `requireApprovedDeliveryCompany` | `AVAILABLE → ACCEPTED` |
| `PATCH /api/deliveries/:id/assign` | `requireApprovedDeliveryCompany` | `ACCEPTED → ASSIGNED`, driver must belong to the caller's company |
| `PATCH /api/deliveries/:id/status` | `requireAuth` (role/ownership checked inside) | Driver: `PICKED_UP/IN_TRANSIT/DELIVERED`. Owning company or admin: `CANCELLED` |
| `GET /api/delivery-company/drivers` | `requireApprovedDeliveryCompany` | Own driver roster |
| `POST /api/delivery-company/drivers` | `requireApprovedDeliveryCompany` | Create a driver under the caller's company |

**`PATCH /api/orders/:id/status` no longer accepts delivery-role transitions** — the `DRIVER`/`DELIVERY_COMPANY` branch was removed from `canUpdateOrderStatus()` entirely. Delivery-stage changes go exclusively through `/api/deliveries/*`.

Typed contract additions in `shared/routes.ts` (`api.deliveries.*`, `api.deliveryCompanyDrivers.*`), following the existing `api.orders` pattern.

---

## 6. Authorization Model

New middleware in `server/routes.ts`, mirroring `requireApprovedSupplier`/`requireApprovedCafeOwner`: `requireApprovedDeliveryCompany`, `requireDriver`.

| Role | Order access (`GET /api/orders[/:id]`) | Delivery access (`GET /api/deliveries[/:id]`) |
|---|---|---|
| `CAFE_OWNER` | own orders only | own orders' deliveries only |
| `SUPPLIER` | own supplier/sub-order orders only | own supplier's deliveries only |
| `DELIVERY_COMPANY` | **only orders it has an actual delivery relationship to** (`deliveries.deliveryCompanyId = self`) | own deliveries **plus** the `AVAILABLE` pool |
| `DRIVER` | only orders with a delivery assigned to it (`deliveries.driverId = self`) | own assigned deliveries only |
| `ADMIN`/`SUPER_ADMIN` | all | all |

This replaces the pre-existing logic that granted `DRIVER`/`DELIVERY_COMPANY` access to **any** order in `READY`/`IN_DELIVERY`/`DELIVERED` status (the IDOR identified in the analysis) and the missing `DELIVERY_COMPANY` filter branch that returned *every* order in the system. `canUserAccessOrder()` and `getOrders()` in `server/storage.ts` now check real `deliveries` rows, never order status.

**Verified live** (see §9 Tests Performed): a second, unrelated delivery company and a second, unrelated driver were registered and confirmed to receive `403`/empty results against the first company's/driver's data, including attempts to accept an already-accepted delivery (`409`) and assign a driver who doesn't belong to the caller's company (`409`).

Full order detail (cafe identity, all items) is intentionally *not* exposed through `GET /api/orders` for the `AVAILABLE`/unclaimed pool — that's what the lighter `GET /api/deliveries` payload is for. A delivery company only gets full order access once it has actually claimed the delivery.

---

## 7. WebSocket Events

Reuses `server/ws.ts`'s existing `broadcast()`/`broadcastToUsers()` — no new infrastructure. New events: `delivery_created`, `delivery_accepted`, `delivery_assigned`, `delivery_status_changed`.

- **Targeted** (`broadcastToUsers`): full context (delivery id, status, order/sub-order id) sent only to the directly-involved actors — the accepting/owning delivery company, the assigned driver, the cafe owner, the supplier.
- **Global minimal ping** (`broadcast`): `{deliveryId, status}` only (no addresses, no customer identity) sent to every connected client so other delivery-company/driver/admin dashboards refresh their "available" pool in realtime — mirrors the existing `order_status_changed` global-echo pattern already used elsewhere in the app.
- When a delivery status change propagates into the sub-order/order aggregate, the existing `order_status_changed`/`suborder_status_changed`/`inventory_updated` events are echoed too, so the Coffee Owner/Supplier/Admin views (which already listen for those) invalidate correctly without needing new client wiring for them.
- Client-side: `client/src/hooks/use-realtime.ts` gained a `DELIVERY_EVENTS` list that invalidates the `/api/deliveries` and `/api/orders` query caches — this hook is already mounted app-wide via `DashboardLayout`/`MarketplaceLayout`, so no new mount points were needed.

**Verified live** with a raw WebSocket client connected as the delivery company: confirmed `delivery_created` arrives the moment a sub-order reaches `READY`, and `delivery_accepted` + the global `delivery_status_changed` ping both arrive on accept.

---

## 8. Frontend Changes

| Area | Change |
|---|---|
| `client/src/hooks/use-deliveries.ts` | **New.** `useDeliveries`, `useDelivery`, `useAcceptDelivery`, `useAssignDriver`, `useUpdateDeliveryStatus`, `useDeliveryCompanyDrivers`, `useCreateDriver` — same `fetch` + TanStack Query mutation pattern as `use-orders.ts`, with cache invalidation on success |
| `client/src/pages/delivery/dashboard.tsx` | **New.** Real KPIs (from `useDeliveries()`), role-branches `DELIVERY_COMPANY` vs `DRIVER` |
| `client/src/pages/delivery/available-deliveries-page.tsx` | **New.** `DELIVERY_COMPANY` — the `AVAILABLE` pool, Accept action |
| `client/src/pages/delivery/my-deliveries-page.tsx` | **New.** `DELIVERY_COMPANY` — own deliveries, driver assignment control |
| `client/src/pages/delivery/drivers-page.tsx` | **New.** `DELIVERY_COMPANY` — real driver roster + create-driver form (replaces the old fake `supplier/drivers-page.tsx` concept) |
| `client/src/pages/delivery/driver-deliveries-page.tsx` | **New.** `DRIVER` — current/active/completed deliveries, pickup/in-transit/delivered actions |
| `client/src/pages/supplier/delivery-status-page.tsx` | **Rewritten.** Was 100% hardcoded `fakeDeliveries` array; now real, read-only, `GET /api/deliveries` scoped to the supplier |
| `client/src/pages/supplier/drivers-page.tsx` | **Deleted.** Was 100% hardcoded `fakeDrivers`, implied "supplier owns drivers" — conflicts with the `DELIVERY_COMPANY` role model per the analysis; driver management now lives exclusively under Delivery Company |
| `client/src/pages/admin/delivery-page.tsx` | **Rewritten.** Was calling `PATCH /api/orders/:id/status`, which always 403'd for Admin; now a real oversight table over `/api/deliveries` with a `CANCEL` action (the only operation Admin performs directly — everything else is Delivery Company/Driver operational territory) |
| `client/src/pages/shared/orders-page.tsx` | Removed the `isDelivery` status-select block and header branch — Delivery Company/Driver no longer act on orders through this page; they have their own dedicated pages now. `handleStatusChange`/`useUpdateOrderStatus` (now unused here) removed |
| `client/src/components/cafe/order-details-modal.tsx` | Added a read-only "Delivery" section per sub-order (status badge, driver name) — shown only once `sub.delivery` exists |
| `client/src/components/supplier/supplier-order-details-modal.tsx` | Added the same read-only Delivery section; `SUPPLIER_NEXT_STATUSES` no longer offers `IN_DELIVERY`/`DELIVERED` (see §3) |
| `client/src/App.tsx` | New routes (`/delivery/available`, `/delivery/my-deliveries`, `/delivery/drivers`, `/delivery/deliveries`), removed `/supplier/drivers`, `SmartDashboard` now branches `DELIVERY_COMPANY`/`DRIVER` to the new dashboard instead of falling through to the generic Cafe/Supplier one |
| `client/src/components/layout/app-sidebar.tsx` | Split the old combined `DELIVERY_COMPANY`/`DRIVER` nav block into two real, role-specific navs; removed "Drivers" from the Supplier nav |

No mock/fake data remains in any active Delivery-related screen.

---

## 9. Tests Performed

No automated test suite exists in this repository (no test runner is configured — `npm run check` is `tsc` only). Verification was done by: (1) a full strict TypeScript compile (`npx tsc --noEmit`, `strict: true`, covering `client/src`, `server`, `shared`) — zero new errors, only 3 pre-existing unrelated ones (`prospecting-page.tsx`, `maintenance-page.tsx`, `prospecting-engine.ts`); (2) live end-to-end integration testing against the running dev server and a real local Postgres database via curl and a raw WebSocket client, covering:

- **Scenario A (single supplier)**: Coffee Owner order → Supplier `CONFIRMED → PREPARING → READY` → Delivery auto-created (`AVAILABLE`) → Delivery Company sees & accepts (`ACCEPTED`) → creates & assigns a Driver (`ASSIGNED`) → Driver `PICKED_UP → IN_TRANSIT → DELIVERED` → sub-order becomes `DELIVERED` → order becomes `DELIVERED`. Full chain confirmed twice (orders #61 and #62, the second after a full dev-server restart, confirming DB persistence).
- **Idempotency**: re-firing `READY` on an already-`READY` sub-order still yields exactly one delivery row.
- **Invalid transitions**: `DELIVERED → PICKED_UP` rejected with `409`.
- **Supplier bypass closed**: direct `IN_DELIVERY`/`DELIVERED` on a sub-order now rejected with `400`; a `DELIVERED` sub-order rejects further edits with `409`.
- **Security isolation**: a second, independently-registered Delivery Company and a second Driver were confirmed to get `403 Forbidden` reading the first company's/driver's delivery, `409` trying to accept an already-accepted delivery or assign a driver outside their own company, and an empty list from `GET /api/orders`/`GET /api/deliveries` for anything not theirs.
- **`DELIVERY_COMPANY` no longer sees every order**: confirmed the company saw only its own claimed order while Admin's view still showed the full 53-order table.
- **Realtime**: `delivery_created` observed arriving at the delivery company's live WebSocket connection the instant a sub-order reached `READY`; `delivery_accepted` (targeted) and `delivery_status_changed` (global minimal) both observed on accept.
- **Existing Shop flow untouched**: order creation, promotion evaluation, stock deduction, sub-order creation, and the Supplier accept/reject vocabulary were exercised repeatedly throughout the above scenarios without incident.

**Not done**: a visual/browser check of the new UI — no browser automation tool was available in this session. The frontend code passed a strict TypeScript compile and follows the exact component/hook patterns already used successfully elsewhere in the app, but it has not been visually confirmed in a live browser. **Recommend a manual pass in the browser (log in as `dispatch@speedy.tn` / `karim@speedy.tn` / any admin, password `password`) before considering this UI-complete.**

---

## 10. Migration

`migrations/0005_delivery_domain.sql` — additive only (`CREATE TYPE`, `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), applied to the local dev database via `npm run db:push` (this project's existing, only migration mechanism — `migrations/*.sql` files are historical references, not auto-applied; confirmed by `migrations/meta/_journal.json`, which doesn't track entries 0002–0005 either, matching the pre-existing pattern). No table was altered destructively; no data was deleted.

---

## 11. Known Limitations / Future Extension Points

- **No zone/territory dispatch.** Every approved `DELIVERY_COMPANY` sees every `AVAILABLE` delivery (first to accept wins) — per the spec's explicit instruction not to invent a geographic dispatch algorithm. `getDeliveries()`/the `delivery_created` broadcast recipient list are the two places a future zone-based filter would plug in.
- **`deliveryFee` is still always `0`.** No pricing algorithm was introduced; the column is wired through and snapshotted so a real one can be added later without another schema change.
- **Passwords remain unhashed** (`createDriverForOwner`, like the pre-existing `createUser`, stores plaintext) — this is a pre-existing, cross-cutting issue in the whole app's auth system, not something introduced or fixed here; out of scope for a delivery-domain change.
- **Pickup address quality depends on the supplier's profile.** If a supplier never set `locationLat/Lng`, the pickup snapshot has empty coordinates (observed with the seeded `supplier@beans.com` account, which has an address but no lat/lng). Not a regression — no coordinate data existed to snapshot.
- **`orders.deliveryId` remains in the schema, unused**, exactly as instructed — a future cleanup migration could drop it once confirmed safe, but that's a separate, deliberate decision, not made here.
- **No automated test suite** exists in this repo to add delivery tests to; verification was manual/live (§9). Introducing a test framework was out of scope for this change.
- **Sub-order → Delivery is 1:1 by design** (partial unique index); if a business need ever arises for a supplier to split one sub-order's items across two couriers, that would require a schema change (delivery scoped to a subset of order_items rather than a whole sub-order) — not needed by anything in the current spec.

---

## 12. V2 — Supplier-Owned Delivery, Complete Order Details, Driver Navigation

Extends §1–11 above. Does not replace or rebuild any of it — the Delivery Company accept/assign/track workflow is untouched; a second delivery operator (the Supplier itself) was added alongside it.

### 12.1 Architecture change: the dispatch step

Previously, `storage.createDeliveryForSubOrder()` created a delivery directly in `AVAILABLE`, instantly visible to every approved Delivery Company. V2 needed the supplier to *choose* an operator first, so delivery creation now starts the delivery in **`PENDING`** — visible only to the supplier — and a new explicit action publishes it:

```
Sub-order READY
      ↓
Delivery created, status = PENDING, deliveryMode = null   (visible only to the supplier)
      ↓
Supplier dispatches  ──►  PATCH /api/deliveries/:id/dispatch  { mode }
      │
      ├─ mode = DELIVERY_COMPANY → status = AVAILABLE (existing accept/assign queue, unchanged)
      │
      └─ mode = SUPPLIER → status = ACCEPTED directly (no company acceptance step — the
                            supplier is its own operator), then the supplier assigns one of
                            its own drivers via the *same* PATCH /api/deliveries/:id/assign
                            endpoint already built for Delivery Companies
```

One Delivery row throughout — `dispatchDelivery()` is an atomic `UPDATE ... WHERE status='PENDING' AND supplierId=caller`, never a second insert. No Delivery Company is notified (`delivery_created` broadcast) until dispatch actually chooses that mode; the supplier alone is notified when the delivery first becomes PENDING.

### 12.2 Driver ownership: two operators, one Driver model

`users.supplierId` (new column, mirrors the existing `users.deliveryCompanyId`) — a `DRIVER` account belongs to **exactly one** operator. Enforced with a DB `CHECK` constraint (`users_driver_single_owner_check`, declared via drizzle's `check()` in `shared/schema.ts` so `db:push` creates it automatically): a row can never have both `deliveryCompanyId` and `supplierId` set. Verified live — a direct `UPDATE` attempting to set both was rejected by Postgres.

`storage.getDriversForOwner(ownerType, ownerId)` / `createDriverForOwner(ownerType, ownerId, data)` replace the old Delivery-Company-only `getDeliveryCompanyDrivers`/`createCompanyDriver` — one implementation, branching only on which FK column to filter/set. Two thin, separately-authorized route groups sit on top: `/api/delivery-company/drivers` (`requireApprovedDeliveryCompany`) and `/api/supplier/drivers` (`requireApprovedSupplier`). `storage.assignDriver()` was similarly generalized to accept `{id, role}` of the caller and branch on `delivery.deliveryMode`, re-verifying ownership against the *delivery's actual mode* server-side — never trusting which endpoint the client called.

The client mirrors this with one generic component (`client/src/components/delivery/driver-roster-view.tsx`) parameterized by which pair of hooks to use (`useDeliveryCompanyDrivers`/`useCreateDriver` vs. `useSupplierDrivers`/`useCreateSupplierDriver`, both generated by a single `makeDriverRosterHooks()` factory in `use-deliveries.ts`) — not two parallel driver-management UIs.

### 12.3 Supplier delivery section (3 tabs, real routes)

`client/src/components/delivery/supplier-delivery-tabs.tsx` — a small link-based tab bar reused across three pages, each a real route (not a fourth duplicated route set — `/delivery/my-deliveries` and `/delivery/drivers` already existed for Delivery Company; their `allowedRoles` was widened to include `SUPPLIER`, and `App.tsx` gained two tiny role-branch wrapper components, `MyDeliveriesRoute`/`DriversRoute`, mirroring the existing `SmartDashboard` pattern):

| Tab | Route | Page | Shows |
|---|---|---|---|
| Delivery Status | `/supplier/delivery-status` | `pages/supplier/delivery-status-page.tsx` (rewritten) | **All** the supplier's deliveries (both modes), with a filter bar (status, date, delivery mode, free-text search over order/cafe/driver/company) and the PENDING→dispatch action |
| My Deliveries | `/delivery/my-deliveries` | `pages/supplier/my-deliveries-page.tsx` (new) | Only `deliveryMode = SUPPLIER` deliveries — driver assignment lives here |
| Drivers | `/delivery/drivers` | `pages/supplier/delivery-drivers-page.tsx` (new) | The supplier's own driver roster (via `DriverRosterView`) |

All three read from the same `GET /api/deliveries` (already scoped server-side to `deliveries.supplierId = self`, regardless of status or mode) and filter client-side — consistent with how `shared/orders-page.tsx` already does view filtering, no new server-side filter params were added.

### 12.4 Complete order details everywhere

`shared/schema.ts`'s `DeliveryWithDetails` was extended (order `createdAt`/`itemCount`, sub-order `subtotal`, cafe `phone`/`locationAddress`, supplier `phone`/`locationAddress`/`locationLat`/`locationLng`, driver `locationLat`/`locationLng`, and a new `items: DeliveryOrderItemDetail[]`). `storage.toDeliveryWithDetails()` builds the item list from the **existing** `order_items.snapshot` jsonb (already populated at checkout with product/flavor/size/pack names — see V1 `createOrder`) — no product data is duplicated onto the `deliveries` table itself, exactly as instructed.

One shared component, `client/src/components/delivery/delivery-details.tsx`, renders this full picture (order, cafe, supplier, products, delivery/mode/fee) and is used, unchanged, by all four consumers instead of four near-identical detail views:

- `admin/delivery-page.tsx` — "Détails" dialog
- `delivery/available-deliveries-page.tsx` (Delivery Company) — "Détails" dialog + inline Accept action
- `delivery/my-deliveries-page.tsx` (Delivery Company) — "Détails" dialog
- `supplier/delivery-status-page.tsx` — "Détails" dialog
- `delivery/driver-deliveries-page.tsx` (Driver) — rendered inline for the current delivery (with `showNavigation`), and in a dialog for any other delivery in the list

Role differences are handled through the `actions` slot (each page supplies its own buttons) rather than the component branching internally — the four roles' *data* needs turned out to be nearly identical (which the spec's own example confirms — driver differs only by the navigation map), so one component with pluggable actions was the simplest faithful implementation.

### 12.5 Driver navigation (two-stage map)

`client/src/components/delivery/delivery-route-map.tsx` — reuses the **existing** raw Google Maps JS loader (`loadGoogleMapsScript`, exported from `location-picker-modal.tsx` rather than duplicated) and the same marker-icon style already used for address picking. No new map technology, no Directions API (avoided deliberately — see §12.7).

- **Stage 1 (before pickup)**: markers for the driver's current location (blue dot, from `users.locationLat/Lng` — the same account-level location field every role already has, not a new tracking system) and the supplier's pickup point (amber pin, from `deliveries.pickupAddress`). A straight dashed connector line between them.
- **Stage 2 (after `PICKED_UP`)**: destination marker swaps to the cafe (green pin, from `deliveries.destinationAddress`); driver marker stays live.
- Stage is derived purely from `delivery.status` (`PICKED_UP`/`IN_TRANSIT`/`DELIVERED` → stage 2, else → stage 1) — no separate stage field was added.
- An "Ouvrir dans Maps" button hands off to `https://www.google.com/maps/dir/?...`, giving the driver real turn-by-turn navigation via their own phone's map app — the pragmatic way to get actual routing without adding a routing API to this project.
- If the driver has never set an account location, the map still renders (pickup/destination only) with an explanatory note — no crash, no fake position invented.

### 12.6 Status synchronization — unchanged mechanism, verified for both modes

No new status system was introduced. `updateDeliveryStatus()`'s `PICKED_UP`/`IN_TRANSIT` → sub-order `IN_DELIVERY`, `DELIVERED` → sub-order `DELIVERED`, then `recomputeOrderAggregateStatus()` — exactly the V1 mechanism — runs identically regardless of `deliveryMode`, because the driver-step authorization check (`current.driverId === actingUser.id`) never looked at company/supplier ownership in the first place. Verified live end-to-end for **both** modes in the same session (orders #66 SUPPLIER-mode and #67 DELIVERY_COMPANY-mode both reached `DELIVERED` on both `orders.status` and `sub_orders.status`).

### 12.7 Explicitly not built (matches the spec's "don't over-engineer" instruction)

- No Directions/routing API — straight-line connector + a link out to the driver's own maps app instead.
- No live GPS tracking — reuses the existing static `users.locationLat/Lng` account field, refreshed whenever the driver updates it via the pre-existing account-location flow, not a new polling/websocket location stream.
- No geographic zone/coverage model for Delivery Company dispatch — unchanged from V1 (every approved company still sees the same `AVAILABLE` pool once a supplier dispatches to that mode).

### 12.8 Tests performed (live, against the running dev server + real Postgres)

- Supplier A creates its own driver (`supplierId` set, `deliveryCompanyId` null) — verified in the DB.
- Full **SUPPLIER-mode** lifecycle: order → READY → delivery PENDING (visible only to Supplier A) → dispatch(`SUPPLIER`) → `ACCEPTED` (no company involved) → assign own driver → `ASSIGNED` → driver `PICKED_UP` → `IN_TRANSIT` → `DELIVERED` → sub-order `DELIVERED` → order `DELIVERED`.
- Full **DELIVERY_COMPANY-mode regression**: same order lifecycle, dispatch(`DELIVERY_COMPANY`) → `AVAILABLE` → company accept → assign company driver → full pickup/transit/delivered chain → order `DELIVERED`. Confirms the pre-existing V1 flow survived the PENDING/dispatch change unmodified in behavior once dispatched.
- **Cross-tenant isolation**, all confirmed live:
  - Supplier B: `403` reading Supplier A's PENDING delivery; `409` attempting to dispatch it.
  - Supplier A: `409` assigning Supplier B's driver to its own delivery.
  - A Delivery Company: `409` attempting to assign a driver to a `SUPPLIER`-mode delivery ("Only the operating supplier can assign a driver to this delivery").
  - Driver B: `409` attempting to advance Driver A's assigned delivery.
  - A `DELIVERY_COMPANY`/`DRIVER` never sees a `PENDING` delivery (absent from both `GET /api/deliveries` and `GET /api/orders`) until/unless the supplier dispatches it to that operator.
- **DB constraint**: a direct `UPDATE users SET delivery_company_id = X WHERE ...` on a supplier-owned driver was rejected by Postgres with the `users_driver_single_owner_check` violation, confirming the mutual-exclusivity guarantee holds even below the application layer.
- Full strict `tsc --noEmit` pass across the entire repo after every phase of V2 — zero new errors (same 3 pre-existing, unrelated errors as before V2).

**Not done**: visual/browser verification of the new UI (tabs, dispatch dialog, driver roster forms, navigation map rendering) — no browser automation tool was available this session, same limitation as V1. The map component in particular (`delivery-route-map.tsx`) has not been visually confirmed to render correctly; its Google Maps API calls follow the exact pattern already working in `location-picker-modal.tsx`, but a live check (with a valid `VITE_GOOGLE_MAPS_API_KEY`, already present in `.env`) is recommended before considering it done.

### 12.9 Known limitations (V2-specific, additive to §11)

- A supplier's dispatch decision is a manual, per-delivery action — there's no "always use my drivers" default preference. Adding one would be a small, backward-compatible follow-up (a `users` preference column read at `createDeliveryForSubOrder` time to skip straight past `PENDING`), not implemented here since the spec's own example UI shows a per-delivery radio choice.
- The navigation map's "current location" is the driver's last-saved account location, not live GPS — a driver who doesn't periodically re-save their location via the existing account-location flow will see a stale position. This mirrors the spec's explicit instruction not to build real-time tracking.
- `DeliveryDetails`'s `viewerRole` prop is accepted but not yet used to hide any field — all four roles currently see the same information, which matches what the spec's own per-role field lists actually specify (they're nearly identical; only Driver gets the extra map). It's left in place as the documented extension point if a future role needs a narrower view.
