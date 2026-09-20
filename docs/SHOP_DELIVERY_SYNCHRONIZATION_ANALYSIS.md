# SHOP ↔ DELIVERY Synchronization Analysis

**Scope:** Read-only analysis of the BigBossCoffee codebase. No code, schema, or config was modified while producing this report.

---

## 1. Executive Summary

Shop and Delivery are **not two synchronized systems** — Delivery is not a system at all. There is no `deliveries` table, no delivery API namespace, no driver-assignment mechanism, and no delivery-specific status model anywhere in the codebase. What exists instead:

- A single `orders` table whose `status` enum (`shared/schema.ts:10`) already includes the delivery-stage values `READY`, `IN_DELIVERY`, `DELIVERED` — i.e. Shop and "Delivery" already share one status field, not two synchronized ones.
- `orders.deliveryId` (`shared/schema.ts:139`) is a foreign key **to `users.id`**, not to a delivery record (`ordersRelations.delivery`, `shared/schema.ts:687`). It is defined in the schema, referenced by `getOrders()` filters and `canUserAccessOrder()`, but **no code path anywhere in the app ever sets it** (confirmed by grep — zero client references to `deliveryId` when calling the update-status endpoint).
- Three of the four delivery-facing screens are non-functional or disconnected from real data: `supplier/delivery-status-page.tsx` and `supplier/drivers-page.tsx` are 100% hardcoded arrays with zero API calls; `admin/delivery-page.tsx` calls a real endpoint but its action buttons are **guaranteed to fail** with 403 (Section 13, 🔴 CRITICAL #1).
- The one working delivery interaction — `shared/orders-page.tsx`'s "Active Deliveries" board for `DELIVERY_COMPANY`/`DRIVER` — works only because the backend authorization for that role pair has **no ownership check**, which is itself a critical security gap (Section 11).

In short: the platform has the *vocabulary* of delivery (a role enum, a status enum, a `deliveryId` column, four UI pages) but none of the *mechanics* (assignment, a delivery entity, driver-scoped queues, notifications, fees, tracking). Anything built for "synchronization" needs to build the Delivery domain model first — there is nothing to synchronize with yet.

---

## 2. Project Architecture

Single Node/TypeScript monorepo-style app (not a multi-package monorepo) — one `client/`, one `server/`, one `shared/`.

| Layer | Location | Notes |
|---|---|---|
| Frontend | `client/src/` | React 18 + TypeScript, Vite, Tailwind v3, Shadcn/Radix UI, TanStack Query, Wouter router, Zustand stores |
| Backend | `server/` | Express v5, single `server/routes.ts` (3,852 lines) registers virtually all REST endpoints |
| Data access | `server/storage.ts` (4,830 lines) | One `DatabaseStorage` class — no repository-per-entity split |
| Schema | `shared/schema.ts` (1,581 lines) | Drizzle ORM, single source of truth for tables + Zod insert schemas + rich response types |
| Typed API contract | `shared/routes.ts` (169 lines) | Only covers `auth`, `products`, `orders` — most endpoints in `routes.ts` are untyped ad hoc routes, not present here |
| Realtime | `server/ws.ts` | Raw `ws` WebSocketServer at `/ws`, session-authenticated, `broadcast()` (all clients) and `broadcastToUsers()` (targeted) |
| Auth | `server/session.ts` + inline middleware in `routes.ts` | `express-session` + `MemoryStore`; role-check middleware (`requireAuth`, `requireAdmin`, `requireApprovedCafeOwner`, `requireApprovedSupplier`, `requireSupplier`) defined inline in `routes.ts`, not centralized |
| Migrations | `migrations/*.sql` | 5 migrations; none create anything delivery-related |

**Roles** (`userRoleEnum`, `shared/schema.ts:6-9`): `SUPER_ADMIN, ADMIN, SUPPLIER, CAFE_OWNER, DELIVERY_COMPANY, DRIVER, PRINTER, MARKETING, BARISTA_ACADEMY, BARISTA_MARKETPLACE, MAINTENANCE`.

**Modules relevant to this analysis:**
- **Coffee Owner (SHOP buyer)**: `client/src/pages/cafe/*` (browse, cart, checkout), `client/src/pages/shared/orders-page.tsx` (order history)
- **Supplier**: `client/src/pages/supplier/*` (order-requests, orders, drivers, delivery-status, inventory, packs, store)
- **Delivery Company / Driver**: `client/src/pages/delivery/messages-page.tsx` only, plus shared `orders-page.tsx` and `admin/delivery-page.tsx`
- **Admin**: `client/src/pages/admin/*` (delivery-page, users-page, roles-page — the latter two are where `DELIVERY_COMPANY`/`DRIVER` accounts are provisioned)

There is **no Supplier module distinct from a "Coffee Owner ordering" module** in the schema — `orders`/`subOrders`/`orderItems` serve both sides. There is likewise no distinct "Delivery module" table set — it would need to be built.

---

## 3. SHOP Architecture — Complete Order Flow

### 3.1 Coffee Owner side

| Step | File | Function/Component |
|---|---|---|
| Browse | `client/src/pages/cafe/browse-products.tsx` | marketplace listing |
| Cart | `client/src/pages/cafe/cart-page.tsx` | Zustand cart store, delivery address picker, `useCreateOrder()` |
| Checkout call | `client/src/hooks/use-orders.ts:50-71` | `useCreateOrder()` → `fetch(api.orders.create.path, POST)` |
| Order creation (server) | `server/routes.ts:1007-1131` | validates items/pack items, requires `deliveryAddress` when `deliveryMethod === 'DELIVERY_SERVICE'`, evaluates promotions, calls `storage.createOrder` |
| Order creation (storage) | `server/storage.ts:975-1130` | inserts `orders` row (`status: 'PENDING'`), deducts listing/variant stock immediately, creates one `sub_orders` row per involved supplier, inserts `order_items` |
| Order history | `client/src/pages/shared/orders-page.tsx` | shared page, role-branches on `user.role` |
| Order details | `client/src/components/cafe/order-details-modal.tsx` | shown from `orders-page.tsx` |
| Reorder | `server/routes.ts:1275` `GET /api/orders/:id/reorder` | rebuilds cart from a past order |
| Cancel | `server/routes.ts:1133-1156` via `canUpdateOrderStatus` (`routes.ts:84-86`) | Coffee Owner may only cancel their own `PENDING` order |

**Payment**: only `CASH_ON_DELIVERY` is accepted — `server/routes.ts:1065-1067` rejects anything else with a 400. The `paymentMethod`/`paymentStatus` columns exist but no gateway integration exists.

**Delivery address**: captured client-side as a `GeoLocation` (`address, lat, lng, placeId, details`) and stored verbatim in `orders.deliveryAddress` (jsonb). Validated server-side by `deliveryAddressSchema` (`routes.ts:1009-1026`).

### 3.2 Supplier side

| Step | File | Function |
|---|---|---|
| Order requests inbox | `client/src/pages/supplier/order-requests-page.tsx` | lists `sub_orders` scoped to the logged-in supplier |
| Accept | `order-requests-page.tsx:125` `handleAccept` → `useUpdateSubOrderStatus` → `PATCH /api/suborders/:id/status` `{status:'CONFIRMED'}` | |
| Reject | `order-requests-page.tsx:131-133` `handleReject` → same endpoint, `{status:'CANCELLED'}` | |
| Prepare / Ready | same endpoint, `{status:'PREPARING'}` then `{status:'READY'}` | |
| Server handler | `server/routes.ts:1160-1212` | requires `ADMIN`/`SUPER_ADMIN`/`SUPPLIER`; for `SUPPLIER` enforces `subOrder.supplierId === user.id` |
| Status update (storage) | `server/storage.ts:648-705` `updateSubOrderStatus()` | updates the `sub_orders` row **and aggregates the parent `orders.status`** (see §9) |
| Order history / analytics | `client/src/pages/supplier/orders-page.tsx`, `finance-analytics-page.tsx` | |

Supplier order-requests never send `READY`→`IN_DELIVERY`/`DELIVERED` — those two values are only ever sent by `DRIVER`/`DELIVERY_COMPANY`/(intended-but-broken) `ADMIN` through the **top-level** `PATCH /api/orders/:id/status` endpoint, not the sub-order one.

### 3.3 Backend inventory (orders-related)

All order endpoints live in one file, `server/routes.ts`:

| Endpoint | Line | Guard |
|---|---|---|
| `GET /api/orders` | 983 | `requireAuth` + role-based filter branch |
| `GET /api/orders/:id` | 996 | `requireAuth` + `storage.canUserAccessOrder` |
| `POST /api/orders` | 1007 | `requireApprovedCafeOwner` |
| `PATCH /api/orders/:id/status` | 1133 | `requireAuth` + `canUpdateOrderStatus` (local function, `routes.ts:82-97`) |
| `PATCH /api/suborders/:id/status` | 1160 | `requireAuth` + inline role/ownership check |
| `DELETE /api/orders/:id` (cascade) | 1256 | `requireAdmin` |
| `GET /api/orders/:id/reorder` | 1275 | `requireApprovedCafeOwner` |
| `GET /api/returns`, `POST /api/returns`, `PATCH /api/returns/:id/status` | 1289, 1307, 1327 | `requireAuth`/`requireApprovedCafeOwner` |

**There is no `/api/delivery*` or `/api/driver*` route anywhere in `server/routes.ts`.** (Confirmed by exhaustively grepping every `app.get/post/put/patch/delete(...)` call in the file — full list captured during this analysis; none matches `delivery` or `driver`.)

### 3.4 Database — SHOP models

| Model | File:line | Key fields | Notes |
|---|---|---|---|
| `orders` | `shared/schema.ts:135-151` | `id`, `cafeId`, `supplierId` (nullable — null for multi-supplier orders), `deliveryId` (nullable, **FK→users.id**), `status` (enum), `totalAmount`, `deliveryAddress` (jsonb), `deliveryMethod`, `deliveryFee`, `courierInstructions`, `paymentMethod`, `paymentStatus`, `priority`, `scheduledAt` | One row per checkout, may span multiple suppliers |
| `sub_orders` | `shared/schema.ts:154-170` | `id`, `orderId`, `supplierId`, `supplierName`, `subtotal`, `status` (**plain `text`, not an enum**), promotion snapshot fields | One row per supplier within an order |
| `order_items` | `shared/schema.ts:172-186` | `id`, `orderId`, `subOrderId`, `productId`/`packId`, `quantity`, `unitPrice`, `snapshot` (jsonb) | Line items, product or pack |
| `order_returns` | `shared/schema.ts:195-210` | own `returnStatusEnum` (`PENDING_REVIEW…RESOLVED`) | Independent of delivery |

**Relations** (`shared/schema.ts:684-690`):
```ts
export const ordersRelations = relations(orders, ({ one, many }) => ({
  cafe: one(users, { fields: [orders.cafeId], references: [users.id], relationName: 'cafeOrders' }),
  supplier: one(users, { fields: [orders.supplierId], references: [users.id], relationName: 'supplierOrders' }),
  delivery: one(users, { fields: [orders.deliveryId], references: [users.id], relationName: 'deliveryOrders' }),
  items: many(orderItems),
  subOrders: many(subOrders),
}));
```
`delivery` resolves to a **user**, never a delivery record. `OrderWithDetails.delivery` is typed `{ id: number; name: string }` (`shared/schema.ts:1416`) — literally a user's id/name.

---

## 4. DELIVERY Architecture — What Actually Exists

### 4.1 Delivery Company

- **Routing**: only one route is registered for `DELIVERY_COMPANY` in `client/src/App.tsx:440-442` — `/delivery/messages`.
- **Sidebar** (`client/src/components/layout/app-sidebar.tsx:251-261`) additionally links to `/` (generic dashboard) and `/orders` (shared order board) — these routes exist and are reachable, but were not purpose-built for this role (see §4.4, §10).
- **No dashboard, no request inbox, no acceptance/rejection flow, no fee visibility, no driver roster management UI tied to any API.**
- `supplier/drivers-page.tsx` *looks* like a driver-roster page but is scoped to the `SUPPLIER` role (`App.tsx:253-255`, `allowedRoles=["SUPPLIER"]`), not `DELIVERY_COMPANY` — i.e. the one "manage my drivers" screen in the app belongs to the wrong role for a delivery-company-owns-drivers model, and it's non-functional regardless (§4.4).

### 4.2 Driver

- Same single route as Delivery Company: `/delivery/messages`.
- The sidebar for `DRIVER` is identical to `DELIVERY_COMPANY`'s (`app-sidebar.tsx:251`, same branch for both roles) — Drivers and Delivery Companies see the **exact same UI**, with no differentiation between "a logistics company" and "an individual driver."
- `DRIVER` is **not self-registerable**: `registerBodySchema` (`server/routes.ts:105`) and `REGISTERABLE_ROLES` (`admin/users-page.tsx:58`) both omit `DRIVER`. A `DRIVER` account can only be created by an Admin via `POST /api/admin/users` (`routes.ts:1353-1374`), which destructures `role` straight from `req.body` with **no schema validation at all** — any string is accepted server-side.
- No pickup/delivery/proof-of-delivery/navigation feature exists anywhere in the code.

### 4.3 Backend

Zero delivery-specific routes, services, or storage methods. The only backend code that is *delivery-role-aware* lives inside the generic order endpoints:

- `GET /api/orders` (`routes.ts:983-994`) — filters by `deliveryId` for `DRIVER` only; no branch for `DELIVERY_COMPANY`.
- `canUpdateOrderStatus()` (`routes.ts:82-97`) — allows `DRIVER`/`DELIVERY_COMPANY` to move any order from `READY`/`IN_DELIVERY` to `READY`/`IN_DELIVERY`/`DELIVERED`.
- `canUserAccessOrder()` (`server/storage.ts:531-543`) — grants `DRIVER`/`DELIVERY_COMPANY` read access to an order if `order.deliveryId === userId` **or** the order's status is `READY`/`IN_DELIVERY`/`DELIVERED`.

No middleware equivalent to `requireApprovedSupplier`/`requireApprovedCafeOwner` exists for these two roles.

### 4.4 Frontend reality-check (evidence)

| Page | Role | Data source | Verdict |
|---|---|---|---|
| `admin/delivery-page.tsx` | Admin | `useQuery(["/api/orders"])`, real | **Broken**: its "Start Delivery"/"Mark Delivered" buttons (`delivery-page.tsx:119-128`) call `PATCH /api/orders/:id/status`, but `canUpdateOrderStatus()` has no branch for `ADMIN`/`SUPER_ADMIN` and returns `false` — every click 403s. |
| `supplier/delivery-status-page.tsx` | Supplier | `const fakeDeliveries = [...]` (`delivery-status-page.tsx:5-11`), zero API calls | **Entirely mock** |
| `supplier/drivers-page.tsx` | Supplier | `const fakeDrivers = [...]` (`drivers-page.tsx:8-14`), zero API calls | **Entirely mock**; "Assign" button (`drivers-page.tsx:87`) has no `onClick` at all |
| `delivery/messages-page.tsx` | DELIVERY_COMPANY, DRIVER | reuses the generic `MessagesPanel` / `conversations` system | Real, but generic (not delivery-specific — see §11) |
| `shared/orders-page.tsx` ("Active Deliveries") | DELIVERY_COMPANY, DRIVER (also Admin/Cafe/Supplier) | `useOrders()` → real `GET /api/orders` | Real, but built on the SHOP `orders` table with no assignment model (§9, §11) |

### 4.5 Database — DELIVERY models

**None exist.** No `deliveries`, `driver_assignments`, `delivery_requests`, or `delivery_companies` table anywhere in `shared/schema.ts` or in `migrations/*.sql`. The only delivery-related columns live *inside* `orders`: `deliveryId`, `deliveryAddress`, `deliveryMethod`, `deliveryFee`.

---

## 5. Current SHOP ↔ DELIVERY Connection — Traced Flow

```text
Coffee Owner
    ↓ POST /api/orders (routes.ts:1007)
Order created (orders.status = PENDING) + sub_orders per supplier
    ↓ storage.createOrder (storage.ts:975)
broadcastToUsers(involvedSupplierIds, 'order_created')   ← Supplier notified via WS
    ↓
Supplier accepts/prepares/marks READY
    (PATCH /api/suborders/:id/status → storage.updateSubOrderStatus, storage.ts:648)
    ↓ aggregate propagation (storage.ts:671-701)
orders.status becomes READY once every active sub-order reaches READY
    ↓
    ??? — NOTHING CREATES A DELIVERY RECORD. NOTHING NOTIFIES DELIVERY_COMPANY. ???
    ↓
Any DRIVER or DELIVERY_COMPANY account that reaches /orders (shared/orders-page.tsx)
sees this order in an unfiltered "READY" list (because canUserAccessOrder's
status-based OR-clause makes it visible to every such account — §11) and can
click "En transit" / "Marquer livré", which calls the SAME endpoint the
Coffee Owner's cancel and the Supplier's accept use:
    PATCH /api/orders/:id/status
    ↓
orders.status = IN_DELIVERY, then DELIVERED
    ↓
broadcastToUsers([order.cafeId], 'order_status_changed')   ← Cafe Owner notified
broadcast('order_status_changed', ...)                      ← everyone connected, global
```

**What actually happens when a Coffee Owner places an order, mapped to the prompt's template:**

```text
Coffee Owner → Cart → Checkout → POST /api/orders → Order created
    ↓
Supplier notified?        YES  (broadcastToUsers → 'order_created', targeted WS event)
    ↓
Delivery created?         NO   (no such entity exists)
    ↓
Delivery Company notified?  NO  (no targeted event; DELIVERY_COMPANY is never in a
                                 broadcastToUsers() recipient list anywhere in routes.ts)
    ↓
Driver assigned?          NO   (no assignment endpoint or UI exists; orders.deliveryId
                                 is never written by any code path in the app)
```

The only thing that connects the two "systems" today is that **Delivery reuses the Shop order's own `status` column** for its final three states, and that any account with role `DRIVER`/`DELIVERY_COMPANY` is authorized (too broadly — §11) to write to that same column.

---

## 6. Synchronization Gap Matrix

| Data / Process | SHOP | DELIVERY | Synchronized? |
|---|---|---|---|
| Order ID | `orders.id` | referenced nowhere in a delivery entity (none exists) | ❌ No delivery entity to sync to |
| Supplier | `orders.supplierId` / `sub_orders.supplierId` | not modeled | ❌ |
| Coffee Owner | `orders.cafeId` | not modeled | ❌ |
| Pickup location | n/a (implicit: supplier's own address) | `users.locationLat/Lng/Address` reused informally, no explicit "pickup" field | ⚠️ Reused, not modeled as delivery data |
| Destination | `orders.deliveryAddress` (jsonb GeoLocation) | same field, no separate copy | ✅ *Same field* (not duplicated, but also not delivery-owned) |
| Order items | `order_items` | n/a | ❌ Not needed for a "who delivers what" record but no delivery-item scoping exists |
| Quantity | `order_items.quantity` | n/a | ❌ |
| Total amount | `orders.totalAmount` | n/a | ⚠️ Shown on `admin/delivery-page.tsx`, otherwise unused |
| Delivery fee | `orders.deliveryFee` | same column | ❌ **Always 0** — `POST /api/orders` never accepts/forwards a fee (`routes.ts:1028-1063` has no `deliveryFee` field; `storage.createOrder` only uses `opts?.deliveryFee ?? 0`, `storage.ts:1010`) |
| Order status | `orders.status` (enum) | **is** the delivery status | ⚠️ One field serves both concepts — see §9 |
| Delivery status | n/a | reuses `orders.status` | ⚠️ Same as above |
| Driver | `orders.deliveryId` → FK to `users.id` | never populated | ❌ Dead column |
| Delivery Company | not modeled | not modeled | ❌ |
| Notifications | `order_created`, `order_status_changed` targeted at cafe/supplier | none targeted at delivery roles | ❌ |

---

## 7. Status Analysis

### 7.1 Enumerated values found

```text
SHOP ORDER STATUS (orderStatusEnum, shared/schema.ts:10 — Postgres enum, strictly validated)
- PENDING
- CONFIRMED
- PREPARING
- READY
- IN_DELIVERY
- DELIVERED
- CANCELLED

SUB-ORDER STATUS (sub_orders.status, shared/schema.ts:160 — plain `text`, NOT an enum,
validated only as z.string() at PATCH /api/suborders/:id/status, routes.ts:1173)
Values actually produced by the Supplier UI (order-requests-page.tsx:21-26):
- PENDING, CONFIRMED, PREPARING, READY, CANCELLED
Values referenced internally but never produced by any UI (storage.ts:658, :1153,
CONFIRMED_STATUSES set): 'APPROVED', 'PROCESSING', 'SHIPPED', 'DELIVERED'
  → these three ('APPROVED','PROCESSING','SHIPPED') are dead/vestigial — no code path
    ever writes them into sub_orders.status.

ORDER RETURN STATUS (returnStatusEnum, shared/schema.ts:190-192)
- PENDING_REVIEW, APPROVED, REJECTED, IN_PROGRESS, RESOLVED

DRIVER STATUS
- Does not exist. No driver-specific status field anywhere.

DELIVERY STATUS
- Does not exist as a separate concept. Reuses orderStatusEnum's READY/IN_DELIVERY/DELIVERED.
```

### 7.2 Behavior today

- **Are the statuses duplicated?** Partially — `orders.status` and `sub_orders.status` overlap in vocabulary (`PENDING/CONFIRMED/PREPARING/READY/CANCELLED`) but are different columns with different validation strictness (enum vs. free text).
- **Are they different concepts?** Yes in intent (order-level aggregate vs. per-supplier fulfillment state) but the same literal string values are reused for both, which is a source of confusion, not clarity.
- **Currently synchronized?** One-directional only. `storage.updateSubOrderStatus()` (`storage.ts:648-705`) recomputes `orders.status` as the **minimum-rank** status among active sub-orders every time a sub-order changes (`STATUS_RANK` map, `storage.ts:681-684`, ranks `PENDING:0 … DELIVERED:5`). There is **no reverse propagation**: `storage.updateOrderStatus()` (`storage.ts:1132-1144`), which is what `DRIVER`/`DELIVERY_COMPANY`/(broken) `ADMIN` call for `READY→IN_DELIVERY→DELIVERED`, only ever writes the `orders` row — it never touches `sub_orders`.
- **Proven consequence**: once a driver/delivery-company account marks an order `IN_DELIVERY` or `DELIVERED`, the underlying `sub_orders` rows for that order remain frozen at `READY` forever. Any UI keyed off sub-order status (`order-requests-page.tsx`'s status badges, `SupplierOrderDetailsModal`) will keep showing "Prête" to the Supplier while the Coffee Owner, Admin, and Driver see "Livrée." This is a real, reproducible status desync, not a hypothetical one.
- **What happens when a delivery is "accepted"?** Nothing — there is no accept step. Any `DRIVER`/`DELIVERY_COMPANY` account can move a `READY` order straight to `IN_DELIVERY` with no prior "claim" or "assign" action.
- **What happens when a driver picks up the order?** `orders.status` becomes `IN_DELIVERY`. No timestamp is recorded (`orders` has no `pickedUpAt`/`inTransitAt` column).
- **What happens when delivery is completed?** `orders.status` becomes `DELIVERED`. No timestamp is recorded, no proof-of-delivery, no automatic trigger back to the Supplier's sub-order.
- **Does the Shop order status change automatically when delivery completes?** It *is* the same field, so trivially "yes," but this also means the Supplier's own layer (`sub_orders.status`) does **not** advance to reflect it (previous bullet) — an inconsistency, not a feature.
- **Conflicting transitions?** Yes: `canUpdateOrderStatus()` lets `DRIVER`/`DELIVERY_COMPANY` write `READY` back onto an order that's already `READY` or `IN_DELIVERY` (`routes.ts:93`, the target-state list includes `READY` itself), and lets them do so for *any* order in that state, not just ones assigned to them (§11).

---

## 8. Data Flow Diagrams (Current State)

```text
Coffee Owner
    ↓
Shop (cart-page.tsx)
    ↓  POST /api/orders
Order (orders + sub_orders + order_items rows)
    ↓  broadcastToUsers(supplierIds, 'order_created')
Supplier (order-requests-page.tsx)
    ↓  PATCH /api/suborders/:id/status  (CONFIRMED → PREPARING → READY)
    ↓  storage.updateSubOrderStatus aggregates → orders.status
Order.status reaches READY
```

```text
Order.status = READY
    ↓  (no delivery entity, no assignment, no notification to DELIVERY_COMPANY)
Any DRIVER / DELIVERY_COMPANY account
    ↓  shared/orders-page.tsx "Active Deliveries" board
    ↓  PATCH /api/orders/:id/status  (READY → IN_DELIVERY → DELIVERED)
Order.status = DELIVERED
    ↓  broadcastToUsers([cafeId], 'order_status_changed')
Coffee Owner sees "Livrée"
    ↓
Supplier's own sub_orders.status is STILL "READY" — never updated (§7.2)
```

---

## 9. Security Analysis

Authorization is enforced by two hand-written functions, not a policy layer: `canUpdateOrderStatus()` (`routes.ts:82-97`) and `storage.canUserAccessOrder()` (`storage.ts:531-543`). Findings, ranked by how directly they affect delivery synchronization work:

### 9.1 🔴 `DELIVERY_COMPANY` has no list filter → sees every order in the system

`GET /api/orders` (`routes.ts:983-994`):
```ts
let filters: any = {};
if (user?.role === 'CAFE_OWNER') filters.cafeId = user.id;
if (user?.role === 'SUPPLIER') filters.supplierId = user.id;
if (user?.role === 'DRIVER') filters.deliveryId = user.id;
res.json(await storage.getOrders(filters));
```
There is no `if (user?.role === 'DELIVERY_COMPANY')` branch. `filters` stays `{}`, and `storage.getOrders({})` (`storage.ts:471-524`) applies no filter at all when its filter keys are unset — every `DELIVERY_COMPANY` account receives **every order in the database**, in every status, from every cafe and supplier, including ones still `PENDING` and never even seen by their own supplier yet.

### 9.2 🔴 `DRIVER`'s list filter is dead code — it is always empty

The one branch that *does* exist (`filters.deliveryId = user.id` for `DRIVER`) filters against a column that no code path ever writes (§4.5, §1). Every `DRIVER` account's `GET /api/orders` result is therefore **permanently empty** — the "Active Deliveries" board a Driver sees is always blank in practice, the opposite failure mode from `DELIVERY_COMPANY` (§9.1) despite both roles sharing identical UI and identical `isDelivery` branching in `shared/orders-page.tsx:105`.

### 9.3 🔴 Single-order access has no ownership check for delivery roles — IDOR

`storage.canUserAccessOrder()` (`storage.ts:531-543`):
```ts
if (userRole === 'DRIVER' || userRole === 'DELIVERY_COMPANY') {
  return order.deliveryId === userId || ['READY', 'IN_DELIVERY', 'DELIVERED'].includes(order.status);
}
```
Since `deliveryId` is never set (§9.2), this condition collapses to *"is the order's status READY/IN_DELIVERY/DELIVERED?"* — true for any such order regardless of who, if anyone, is "assigned." Combined with `orders.id` being a small sequential `serial` primary key (trivially enumerable), **any authenticated `DRIVER` or `DELIVERY_COMPANY` account can fetch full details — cafe name, delivery address, phone-bearing account, items, totals — for any order in a delivery-eligible state by guessing/incrementing `GET /api/orders/:id`.**

### 9.4 🔴 Status-write access has no ownership check for delivery roles

`canUpdateOrderStatus()` (`routes.ts:92-95`):
```ts
if (user.role === 'DRIVER' || user.role === 'DELIVERY_COMPANY') {
  return ['READY', 'IN_DELIVERY', 'DELIVERED'].includes(newStatus)
      && ['READY', 'IN_DELIVERY'].includes(order.status);
}
```
No comparison to `order.deliveryId` or `user.id` at all. Any `DRIVER`/`DELIVERY_COMPANY` account can transition **any** `READY`/`IN_DELIVERY` order platform-wide — including one "claimed" (informally, since claiming doesn't exist) by a competing delivery company. Compare to the `SUPPLIER` branch two lines above it (`routes.ts:87-90`), which correctly checks `order.supplierId === user.id` first — the delivery branch was evidently never given the equivalent check.

### 9.5 🟠 Admin's own Delivery page is unusable

`canUpdateOrderStatus()` has no branch for `ADMIN`/`SUPER_ADMIN` (falls through to `return false`, `routes.ts:96`) — consistent with the comment at `routes.ts:83` ("Admin has read-only access to orders; status management is Supplier-only"). But `admin/delivery-page.tsx:33-40,119-128` renders "Start Delivery"/"Mark Delivered" buttons that call exactly this endpoint. Every click 403s. This is a design/implementation contradiction shipped in the current build, not a hypothetical risk.

### 9.6 🟡 `POST /api/admin/users` does not validate `role`

`routes.ts:1353-1374` destructures `role` from `req.body` with no Zod schema and passes it straight to `storage.createUser`. Guarded by `requireAdmin`, so exploitability is limited to already-trusted admins, but it means any typo or unvalidated integration writing to this endpoint can create a user with an out-of-enum role value that Postgres will then reject at the DB layer with an opaque 500 (`res.status(500).json({message:"Error"})`, line 1373) rather than a clean 400.

### 9.7 Ownership checks that ARE correct (for contrast)

- `CAFE_OWNER` order access/cancel: correctly scoped to `order.cafeId === user.id` (`storage.ts:535`, `routes.ts:85`).
- `SUPPLIER` order access/status update/sub-order update: correctly scoped to `order.supplierId === user.id` or sub-order membership (`storage.ts:536-538`, `routes.ts:88-90`, `routes.ts:1170-1172`).
- `ADMIN`/`SUPER_ADMIN` read access: correctly unrestricted (`storage.ts:534`), consistent with an oversight role.

---

## 10. Duplicate / Legacy Architecture

- **No duplicate Order or Delivery models** — there is exactly one order pipeline (`orders`/`sub_orders`/`order_items`), no legacy v1 table found in `migrations/*.sql`.
- **Duplicated status vocabulary, not duplicated models**: `orders.status` (strict enum) and `sub_orders.status` (free `text`) share overlapping string values with different validation strength (§7.1). Any delivery status introduced later should not add a *third* independent vocabulary — it should either extend the existing enum-based pattern or explicitly branch off it with a translation layer, not copy the sub-order free-text pattern.
- **Three separate UI surfaces claim to own "delivery status" and none of them coordinate**:
  1. `admin/delivery-page.tsx` (broken — §9.5)
  2. `shared/orders-page.tsx`'s delivery-role board (functional but insecure — §9.3–9.4)
  3. `supplier/delivery-status-page.tsx` (fake data, no backend at all)
  
  A synchronization implementation must pick **one** authoritative place to mutate delivery state and make the others either read-only views of it or remove them, rather than adding a fourth parallel writer.
- **Two "manage drivers" surfaces with no shared backend**: `supplier/drivers-page.tsx` (fake, scoped to `SUPPLIER`) implies a "supplier owns drivers" model, while the `DELIVERY_COMPANY` role's name and `roles-page.tsx:34` description ("Logistics partners that handle order deliveries") implies a "delivery company owns drivers, assigns them to orders" model. **These two product assumptions conflict** and should be resolved (a product decision, not just a technical one) before building an assignment feature.
- **Vestigial sub-order status values**: `'APPROVED'`, `'PROCESSING'`, `'SHIPPED'` are checked for in `storage.ts:658` and `storage.ts:1153` but never produced by any UI (§7.1) — dead branches that will silently never fire unless some other integration writes them directly.
- **`platformServices` / `MARKETPLACE_SERVICE_IDS`** (`shared/schema.ts:16`, `= ['SHOP','PRINT','BARISTA','MARKETING','MAINTENANCE']`) — the admin-controlled Visible/Hidden/ComingSoon gating system that every other marketplace vertical (Print, Barista, Marketing, Maintenance) is wired into does **not include Delivery**. Delivery was never onboarded as a first-class "service" in the platform's own service-visibility framework, which is further evidence it was scaffolded (role + a few pages) but never built out.

---

## 11. Frontend → Backend → Database Traces

### SHOP — Create order
```
client/src/pages/cafe/cart-page.tsx
  → client/src/hooks/use-orders.ts:50 useCreateOrder()
    → fetch POST /api/orders
      → server/routes.ts:1007 app.post(api.orders.create.path, requireApprovedCafeOwner, ...)
        → server/storage.ts:545 resolveOrderItems() / :609 resolvePackOrderItems()
        → server/storage.ts:975 createOrder()
          → INSERT orders, INSERT sub_orders (one per supplier), INSERT order_items
          → UPDATE supplier_product_listings / supplier_product_variants (stock--)
        → broadcastToUsers(supplierIds, 'order_created')  [server/ws.ts:65]
```

### SHOP — Supplier receives & updates order
```
client/src/pages/supplier/order-requests-page.tsx
  → client/src/hooks/use-orders.ts:93 useUpdateSubOrderStatus()
    → fetch PATCH /api/suborders/:id/status
      → server/routes.ts:1160 (role/ownership check inline)
        → server/storage.ts:648 updateSubOrderStatus()
          → UPDATE sub_orders SET status
          → conditionally deductPackComponentStock() / restoreSubOrderPackStock()
          → recompute + UPDATE orders SET status (aggregate, storage.ts:671-701)
        → broadcastToUsers([cafeId, supplierId], 'suborder_status_changed')
        → broadcast('suborder_status_changed')  [global]
```

### DELIVERY — Creation
```
NO CODE PATH EXISTS. No file creates a delivery record because no delivery
table exists to insert into.
```

### DELIVERY — Delivery Company receives request
```
NO CODE PATH EXISTS. DELIVERY_COMPANY is never a target of broadcastToUsers()
anywhere in server/routes.ts (grepped exhaustively — the only broadcastToUsers
recipients across the whole file are cafeId and supplier ids).
```

### DELIVERY — Driver assignment
```
NO CODE PATH EXISTS. orders.deliveryId is defined (shared/schema.ts:139) and
readable (storage.ts:492, :519), and storage.updateOrderStatus() *can* accept
a deliveryId to set it (storage.ts:1132,1135: `if (deliveryId) updates.deliveryId
= deliveryId;`), and the typed contract even allows the client to send one
(shared/routes.ts:148 `deliveryId: z.number().optional()`) — but no client
component anywhere constructs that field when calling the endpoint (verified
by grepping client/src for "deliveryId": zero matches). The plumbing for
"assign at status-update time" exists on the server and is simply never
invoked by any UI.
```

### DELIVERY — Driver updates delivery / completion
```
client/src/pages/shared/orders-page.tsx (isDelivery branch, line 105)
  → client/src/hooks/use-orders.ts:73 useUpdateOrderStatus()
    → fetch PATCH /api/orders/:id/status
      → server/routes.ts:1133
        → canUpdateOrderStatus() [routes.ts:92-95 — no ownership check, §9.4]
        → server/storage.ts:1132 updateOrderStatus()
          → UPDATE orders SET status (and deliveryId, if the caller sent one — never does)
        → broadcastToUsers([order.cafeId], 'order_status_changed')
        → broadcast('order_status_changed')  [global]
```

---

## 12. Notifications / Real-Time Communication

- Mechanism: raw `ws` WebSocketServer at `/ws` (`server/ws.ts:22-53`), authenticated from the existing HTTP session cookie (not a separate token). No polling, SSE, push notifications, email, or SMS anywhere in the codebase for orders/delivery.
- `broadcast(event, data)` (`ws.ts:56-62`): sends to **every** connected client regardless of role.
- `broadcastToUsers(userIds, event, data)` (`ws.ts:65-75`): targeted.
- Order-related events fired: `order_created`, `conversation_updated`, `inventory_updated`, `order_status_changed`, `suborder_status_changed`, `suborder_rejected` (all in `server/routes.ts` around lines 1119-1207).
- **`DELIVERY_COMPANY`/`DRIVER` are never in a `broadcastToUsers()` recipient list anywhere.** They only ever receive events via the global `broadcast()` calls (e.g. the global echo of `order_status_changed` at `routes.ts:1151`, or `suborder_status_changed`/`inventory_updated`), which reach them only incidentally, as it reaches literally every other connected client, not because the system intentionally notified them.
- No `delivery_created`, `delivery_assigned`, or `driver_assigned` event exists.

---

## 13. Location & Address Synchronization

- **Coffee Owner / order destination**: `orders.deliveryAddress` (jsonb), shape `GeoLocation` (`shared/schema.ts:1384-1390`: `address, lat, lng, placeId, details: AddressDetails`), captured at checkout via `deliveryAddressSchema` (`routes.ts:1009-1026`) and Google Maps autocomplete on the client (`VITE_GOOGLE_MAPS_API_KEY`, per `replit.md:26`).
- **Supplier / implicit pickup location**: `users.locationLat`, `users.locationLng`, `users.locationAddress`, `users.locationPlaceId`, `users.locationDetails` (`shared/schema.ts:34-38`) — the *account-level* location, set once at registration/profile edit (`PATCH /api/auth/me/location`, `routes.ts:359`). This same field is reused as `StoreCard.supplierLat/supplierLng` (`shared/schema.ts:1048-1049`) and `PackDetail.supplierLat/supplierLng` (`shared/schema.ts:1007-1008`) for marketplace map pins.
- **No dedicated "pickup location" field exists on the order.** A future delivery flow would have to derive pickup location from `users.locationLat/Lng` of the *first* (or each) involved supplier — which is imprecise for multi-supplier orders (a single order can have multiple `sub_orders`, each with a different supplier and therefore a different real-world pickup point, but there is exactly one `deliveryAddress` destination and zero pickup addresses modeled).
- **Same `GeoLocation`/`AddressDetails` shape is reused consistently** between account location and order delivery address (`shared/schema.ts:1370-1390`) — this is a genuine point of *existing* synchronization worth preserving/reusing rather than inventing a third address shape for a future `deliveries` table.
- **`orders.deliveryFee` is always `0`** in practice (§6) — no distance/zone-based fee calculation exists anywhere in the code.

---

## 14. Recommended Target Architecture (NOT implemented — description only)

Given the existing patterns already in the codebase (sub-order aggregation, `GeoLocation`/`AddressDetails` reuse, `requireApproved*` middleware convention, `broadcastToUsers` targeting), the lowest-risk target design would:

1. **Add a first-class `deliveries` table** — one row per order (or per sub-order, if per-supplier pickup ever needs independent tracking), with its own `deliveryStatusEnum` distinct from `orderStatusEnum`, `deliveryCompanyId`, `driverId` (nullable until assigned), `pickupAddress` (`GeoLocation`, sourced from the relevant supplier(s)), reuse of the existing `destinationAddress` (`orders.deliveryAddress`), a real `deliveryFee`, and timestamps (`assignedAt`, `pickedUpAt`, `deliveredAt`).
2. **Keep `orders.status` as the customer-facing aggregate**, driven *from* the new delivery status the same way it is already driven from `sub_orders.status` today (`storage.ts:671-701` is the existing precedent to extend, not replace) — so there is one propagation pattern, not two.
3. **Repoint or retire `orders.deliveryId`** — its current meaning (FK to a user) is confusing and unused; either repurpose it to point at the new `deliveries.id`, or add a new column and formally deprecate this one, since `OrderWithDetails.delivery` (`shared/schema.ts:1416`) and its relation (`schema.ts:687`) currently assume "delivery = a user."
4. **Fix the two IDOR-class authorization gaps (§9.3, §9.4) as a prerequisite**, not as a side effect — any new assignment feature is meaningless if unassigned drivers can still read/write orders that aren't theirs.
5. **Add `requireApprovedDeliveryCompany`/`requireDriver` middleware** mirroring the existing `requireApprovedSupplier`/`requireApprovedCafeOwner` pattern (`routes.ts:51-67`).
6. **Add delivery-specific WebSocket events** (`delivery_created`, `delivery_assigned`, `delivery_status_changed`) targeted via the existing `broadcastToUsers()` at the assigned delivery company + driver, following the exact pattern already used for `order_created`.
7. **Resolve the driver-ownership product question (§10)** — does a `DELIVERY_COMPANY` own a roster of `DRIVER`s it assigns, or is `DRIVER` an independent self-service role? The current UI scaffolding (`supplier/drivers-page.tsx` under `SUPPLIER`) contradicts the role model and should not be treated as a spec.

## 15. Recommended End-to-End Flow (target — NOT implemented)

```text
Coffee Owner → Shop → Order (PENDING)
    → Supplier accepts/prepares/READY (existing sub_orders flow — unchanged)
    → [NEW] a Delivery record is created (auto on last-sub-order-READY, or manual)
    → [NEW] Delivery Company(ies) covering the pickup zone are notified (targeted WS)
    → [NEW] Delivery Company accepts the delivery request
    → [NEW] Delivery Company assigns a Driver (writes deliveries.driverId)
    → [NEW] Driver: assigned → picked up → in transit → delivered
        (ownership-checked at every write — driverId/deliveryCompanyId must match caller)
    → [NEW] deliveries.status change propagates orders.status (extends existing
      sub-order aggregation pattern, §14.2)
    → Coffee Owner sees "Delivered"; Supplier's own sub_orders view now stays
      consistent because propagation is bidirectional by construction, not bolted on
```

---

## 16. Exact Files to Modify Later (analysis only — not modified now)

| File | Why it needs modification | Current responsibility | Sync concern |
|---|---|---|---|
| `shared/schema.ts` | Add `deliveries` table, `deliveryStatusEnum`, relations, insert/select types | Single source of truth for all tables | No delivery entity exists at all |
| `shared/routes.ts` | Add `api.delivery.*` typed contract | Only covers auth/products/orders today | Most endpoints (including the future delivery ones) currently bypass this typed layer entirely |
| `server/routes.ts:82-97` (`canUpdateOrderStatus`) | Add ownership checks for `DRIVER`/`DELIVERY_COMPANY`; add an `ADMIN` branch or remove the admin buttons that assume one | Central authorization gate for order status writes | §9.4, §9.5 |
| `server/routes.ts:983-994` (`GET /api/orders`) | Add a `DELIVERY_COMPANY` filter branch | Role-based order list filtering | §9.1 |
| `server/storage.ts:531-543` (`canUserAccessOrder`) | Replace status-based OR-clause with real assignment check | Single-order read authorization | §9.3 |
| `server/storage.ts:471-524` (`getOrders`) | Add delivery-table joins/filters once it exists; currently loads entire `orders`/`order_items`/`products`/`users`/`sub_orders` tables into memory and filters in JS (`storage.ts:472-476`) — a scalability concern independent of delivery | Order list assembly | New filter dimension needed |
| `server/storage.ts:1132-1144` (`updateOrderStatus`) | Extend or replace with delivery-table writes; add reverse propagation to `sub_orders` (§7.2) | Top-level order status mutation | Root cause of the proven one-way status desync |
| `server/ws.ts` | No structural change, but new call sites need `broadcastToUsers` targeting delivery company/driver | Realtime transport | §12 |
| `client/src/pages/admin/delivery-page.tsx` | Replace direct order-status PATCH with delivery-specific endpoints; currently non-functional (§9.5) | Admin oversight view | Rebuild on the new entity |
| `client/src/pages/supplier/delivery-status-page.tsx` | Replace hardcoded array with real data, once the ownership model (§10, §14.7) is decided | Currently pure UI mock | Needs a backing API + a decision about which role owns this view |
| `client/src/pages/supplier/drivers-page.tsx` | Same as above; also decide if this belongs under `SUPPLIER` at all | Currently pure UI mock | Product-model conflict (§10) |
| `client/src/pages/shared/orders-page.tsx:103-105,307-316` | Key the delivery board off real assignment, not blanket status | The only currently-functional delivery interaction | Directly depends on the §9.3/§9.4 fixes |
| `client/src/App.tsx:167-193` (`SmartDashboard`/`HomeRoute`) | Add a branch for `DELIVERY_COMPANY`/`DRIVER` | Landing-page role dispatch | Currently these roles fall through to the generic Cafe/Supplier-oriented `Dashboard` |
| `client/src/components/layout/app-sidebar.tsx:251-261` | Extend nav once real pages exist | Already scaffolds "Dashboard / Active Deliveries / Messages" for these roles | Nav already anticipates more than the backend supports |
| `client/src/hooks/use-orders.ts` | Add delivery-specific hooks alongside `useOrders`/`useUpdateOrderStatus`, following the same `fetch`+`useMutation` pattern | Central order data-fetching hooks | Establishes the client-side pattern to mirror |

---

## 17. Database Changes That May Be Required (description only)

- New `deliveries` table (see §14.1 for proposed shape) with a foreign key to `orders.id`.
- New `deliveryStatusEnum` (Postgres enum), separate from `orderStatusEnum`, to stop overloading the Shop status field with delivery-stage meaning.
- Either repoint `orders.deliveryId` to reference the new `deliveries.id`, or add a new column and deprecate the old one — it currently references `users.id`, which is a breaking semantic change to alter in place (§20).
- Consider indexing: `getOrders()` currently does full unfiltered `db.select().from(orders)` / `.from(orderItems)` / `.from(users)` scans and filters in application code (`storage.ts:472-476`) — any new delivery-scoped queries (by `driverId`, by `deliveryCompanyId`) should not repeat this pattern at scale.

## 18. API Changes That May Be Required (description only)

- `POST /api/deliveries` — create/dispatch a delivery for a `READY` order.
- `GET /api/deliveries` — role-scoped list (driver's own, delivery company's own, admin's all).
- `PATCH /api/deliveries/:id/assign` — delivery company assigns a driver.
- `PATCH /api/deliveries/:id/status` — driver-only, ownership-checked, replacing today's use of `PATCH /api/orders/:id/status` for delivery-stage transitions.
- Fix (not add): `GET /api/orders` `DELIVERY_COMPANY` filter branch (§9.1); `canUserAccessOrder`/`canUpdateOrderStatus` ownership checks (§9.3, §9.4).

## 19. Frontend Changes That May Be Required (description only)

- Real dashboards for `DELIVERY_COMPANY` and `DRIVER` (currently share the generic `Dashboard` component that was written for Cafe/Supplier stats — `dashboard.tsx:59` only toggles between "Total Spent"/"Total Revenue").
- Replace the two mock pages (`supplier/delivery-status-page.tsx`, `supplier/drivers-page.tsx`) with real, API-backed equivalents once the ownership model (§10) is resolved — and re-home them under the correct role if the product decision is "delivery company owns drivers."
- Driver-assignment UI for Delivery Companies (does not exist in any form today, mock or real).
- Delivery tracking surfaced in the Coffee Owner's `OrderDetailsModal` (currently shows order/item data only).
- `SmartDashboard` branch for the two delivery roles.

## 20. Implementation Risks

- **Duplicate deliveries**: if delivery creation is triggered both automatically (e.g. on last-sub-order-READY) and manually (an admin/delivery-company action), guard against creating more than one `deliveries` row per order — no such guard exists today because no such table exists yet.
- **Inconsistent statuses**: the codebase already has a proven, live example of this exact bug class (§7.2 — one-way `sub_orders` → `orders` propagation, no reverse). A new `deliveries` status must not become a third disconnected status source; it should plug into the same aggregation pattern, bidirectionally.
- **Race conditions**: `storage.createOrder()` (`storage.ts:975-1130`) performs multiple sequential, separately-awaited stock-decrement `UPDATE`s per item, not wrapped in a single DB transaction — under concurrent checkouts this can under/over-decrement stock. Any new delivery-assignment writes should not repeat this pattern (e.g. two delivery companies "claiming" the same order simultaneously with no transactional guard).
- **Orphan deliveries**: `DELETE /api/orders/:id` already cascades order data (`routes.ts:1256`) — this cascade must be extended to any new `deliveries` row, or cancelled/deleted orders will leave dangling delivery records.
- **Incorrect driver/company assignment**: §9.4's missing ownership check must be fixed *before* an assignment feature is added, otherwise "assignment" is cosmetic — any driver can still self-serve any order regardless of who it was assigned to.
- **Security regressions carried forward**: building delivery-company/driver features on top of the current `canUserAccessOrder`/`canUpdateOrderStatus` functions without first fixing §9.1–9.4 would give the new feature set an IDOR and a cross-tenant data leak on day one.
- **Backwards compatibility**: `orders.deliveryId`'s current type (FK to `users.id`, per the Drizzle relation at `schema.ts:687`) and its exposure via `OrderWithDetails.delivery: {id,name}` (`schema.ts:1416`) assume "delivery = a user." Repointing this column's meaning is a breaking semantic change for any code (or future integration) that reads `order.delivery.name` expecting a user's name — this argues for a new column/relation rather than silently repurposing the existing one.
- **Data loss risk during migration**: since `deliveryId` is currently dead (never populated), there is no existing data to migrate for that column specifically — but `orders.deliveryFee` (always `0` today, §6) and `orders.deliveryMethod`/`deliveryAddress` (populated, real data) must be preserved/reconciled if a new `deliveries` table takes over responsibility for fee and address.

---

*End of analysis. No files, schema, or configuration were changed in the course of producing this report.*
