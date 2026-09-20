# BigBossCoffee Delivery System — Forensic Analysis
### Read-only investigation. No files modified.

---

## 1. Executive Summary

BigBossCoffee has a **real, server-authoritative delivery pricing engine** — not a placeholder. A single private method, `computeDeliveryFee` (`server/storage.ts:2107-2143`), computes every delivery's fee from **haversine distance × a per-vehicle-type rate × a global surge multiplier, floored by a per-vehicle minimum**, then splits that fee between the Coffee Owner and the Supplier using an admin-configured percentage — collapsing to 100% Supplier-paid when an active `FREE_SHIPPING` promotion applies. The fee is computed twice per delivery (a provisional estimate when a sub-order reaches `READY`, then a final, permanently frozen value once a driver is assigned) and is **never recalculated after that**, so historical orders are immune to later pricing changes.

The engine is genuinely centralized — there is exactly one pricing function, and I found **zero duplicated or client-side delivery-fee calculations** anywhere in the frontend. Every fee value a client ever sees is either a direct server value or a sum of server values.

That said, the system is **narrow**: it has no weight/volume/multi-stop/waiting-time inputs, no automated weather or demand pricing (the "surge" field is a single manually-typed global multiplier with a cosmetic text label — currently set to "Pluie Forte" with the multiplier left at neutral 1.0×, i.e. doing nothing), no driver-payout/commission concept distinct from the raw delivery fee, no pre-checkout fee preview for the Coffee Owner, and no pricing difference between "Delivery Company" and "Supplier's own driver" delivery modes.

---

## 2. Delivery Architecture

```text
Delivery System
│
├── Frontend
│   ├── Café Owner    — cart-page.tsx, order-confirmation-modal.tsx, order-details-modal.tsx,
│   │                    order-invoice-modal.tsx, order/delivery-progress.tsx (status only, no map)
│   ├── Supplier       — supplier/delivery-status-page.tsx, supplier/my-deliveries-page.tsx,
│   │                    supplier/delivery-drivers-page.tsx, supplier-order-details-modal.tsx
│   ├── Driver          — pages/driver/{wallet,payments,planning,profile,opportunities,...}.tsx
│   ├── Delivery Company — pages/delivery/{available-deliveries,my-deliveries,driver-deliveries,
│   │                     drivers,vehicles,dashboard}-page.tsx
│   ├── Admin          — admin/delivery-page.tsx (management), admin/system-management-page.tsx
│   │                     (pricing config — DeliveryPricingSection)
│   └── Shared         — components/delivery/{driver-roster-view,delivery-route-map,
│                         supplier-delivery-tabs,delivery-company-detail-modal}.tsx,
│                         components/order/delivery-progress.tsx, hooks/use-deliveries.ts,
│                         hooks/use-delivery-ecosystem.ts
│
├── API (server/routes.ts)
│   ├── POST /api/orders                      — order creation, no fee input accepted
│   ├── PATCH /api/orders/:subOrderId/status  — READY triggers delivery creation
│   ├── PATCH /api/deliveries/:id/dispatch    — Supplier chooses DELIVERY_COMPANY | SUPPLIER
│   ├── PATCH /api/deliveries/:id/accept      — Delivery Company claims an AVAILABLE delivery
│   ├── PATCH /api/deliveries/:id/assign      — driver assigned, FEE FINALIZED HERE
│   ├── PATCH /api/deliveries/:id/reassign    — driver swap before pickup, fee recomputed again
│   ├── PATCH /api/deliveries/:id/status      — PICKED_UP/IN_TRANSIT/DELIVERED/CANCELLED
│   ├── GET/PATCH /api/admin/delivery-pricing — the only route that writes pricing CONFIG
│   └── GET/POST /api/{supplier|delivery-company}/vehicles, /api/driver/vehicle
│
├── Database (shared/schema.ts, Drizzle/Postgres)
│   ├── deliveries               — one row per sub-order; fee + split + distance + vehicle snapshot
│   ├── deliveryPricingSettings  — singleton config (rates, surge, split %)
│   ├── vehicles                 — one row per Driver/Delivery-Company/Supplier vehicle
│   ├── subOrders                — per-supplier order slice (NO delivery-fee field)
│   ├── orders                   — customer-facing order (deliveryFee column is dead/always 0)
│   └── users                    — locationLat/Lng on suppliers, cafés, drivers (static snapshot)
│
├── Pricing
│   └── server/storage.ts: haversineKm() + computeDeliveryFee()  — the ONE pricing engine
│
├── Driver Assignment
│   └── server/storage.ts: dispatchDelivery() → acceptDelivery() → assignDriver()/reassignDriver()
│                            → updateDeliveryStatus() — full DELIVERY_TRANSITIONS state machine
│
└── Admin
    ├── system-management-page.tsx → DeliveryPricingSection — rates/surge/split config
    └── admin/delivery-page.tsx — status/driver/company visibility, single "Frais" total only
```

---

## 3. Complete File Map

| File | Responsibility | Key functions | Talks to |
|---|---|---|---|
| `server/storage.ts` | All delivery business logic and the pricing engine | `computeDeliveryFee`, `haversineKm`, `createDeliveryForSubOrder`, `dispatchDelivery`, `acceptDelivery`, `assignDriver`, `reassignDriver`, `updateDeliveryStatus`, `getDeliveryPricingSettings`, `updateDeliveryPricingSettings`, `hasApplicableFreeDeliveryPromotion` | Postgres via Drizzle; called by `server/routes.ts` |
| `server/routes.ts` | HTTP layer — auth/role gates, zod validation, broadcasts, notifications | `/api/deliveries/*`, `/api/admin/delivery-pricing`, `/api/orders` (create), `/api/{supplier,delivery-company,driver}/vehicles` | `storage.ts`; emits realtime events consumed by `use-realtime.ts` |
| `shared/schema.ts` | Drizzle schema + shared TS types | `deliveries`, `deliveryPricingSettings`, `vehicles`, `subOrders`, `orders`, enums | Imported by both server and client |
| `client/src/hooks/use-deliveries.ts` | Café/Admin/Supplier delivery queries | `useDeliveries`, `useDispatchDelivery`, `useAssignDriver` | `/api/deliveries`, `/api/orders` |
| `client/src/hooks/use-delivery-ecosystem.ts` | Vehicles, pricing settings, driver reviews, opportunities | `useDeliveryPricingSettings`, `useUpdateDeliveryPricingSettings`, `VEHICLE_TYPE_LABELS` (single source of truth for vehicle labels) | `/api/admin/delivery-pricing`, `/api/*/vehicles` |
| `client/src/pages/cafe/cart-page.tsx` | Cart totals before checkout | `grandTotal` calc (line 205) — **no delivery term** | `/api/orders` on submit |
| `client/src/components/cafe/order-confirmation-modal.tsx` | Final checkout confirmation | `grandTotal` calc (line 179-180) — **no delivery term** | `/api/orders` |
| `client/src/components/cafe/order-details-modal.tsx` | Post-purchase order detail (Admin + Coffee Owner, shared) | sums `cafeOwnerFeeShareCents` across sub-orders (only place delivery fee first appears to the café) | `/api/orders` |
| `client/src/components/supplier/supplier-order-details-modal.tsx` | Supplier's own sub-order detail | shows this supplier's own delivery fee + share | `/api/orders` |
| `client/src/pages/supplier/delivery-status-page.tsx` | Supplier dispatch/track queue | dispatch dialog, reassign dialog | `use-deliveries.ts` |
| `client/src/pages/supplier/my-deliveries-page.tsx` | Supplier's own-driver deliveries | driver assignment | `use-deliveries.ts` |
| `client/src/pages/delivery/available-deliveries-page.tsx` | Delivery Company's claim queue | shows `deliveryFee` **before** accept | `use-deliveries.ts` |
| `client/src/pages/delivery/dashboard.tsx` | Delivery Company KPI home | `totalFees` = client-side sum of `deliveryFee` over today's completed deliveries | `use-deliveries.ts` |
| `client/src/pages/delivery/vehicles-page.tsx` | Delivery Company fleet CRUD | no pricing shown | `use-delivery-ecosystem.ts` |
| `client/src/pages/driver/wallet.tsx` | Driver "earnings" | sums raw `deliveryFee` (not a computed payout) | `use-deliveries.ts` |
| `client/src/pages/driver/payments.tsx` | Driver per-delivery fee history | same raw `deliveryFee` field, filterable | `use-deliveries.ts` |
| `client/src/pages/driver/opportunities.tsx` | Dead route | explicit in-code comment: drivers cannot self-claim work; route redirects home | — |
| `client/src/pages/admin/system-management-page.tsx` | **Admin pricing configuration** (`DeliveryPricingSection`, lines 667-798) | per-vehicle rate/min-fee inputs, default vehicle, café share %, surge multiplier + label | `/api/admin/delivery-pricing` |
| `client/src/pages/admin/delivery-page.tsx` | Admin delivery **management** (status/driver/company) | single `InfoTile` showing total `Frais` — no breakdown | `use-deliveries.ts` |
| `client/src/components/delivery/delivery-route-map.tsx` | Visual navigation map | Google Maps JS, straight-line connector (not turn-by-turn) | Google Maps JS API |
| `client/src/components/order/delivery-progress.tsx` | Café-facing status stepper | pure status display, no map/coordinates | — |
| `client/src/components/delivery/driver-roster-view.tsx` | Shared Supplier/Delivery-Company driver roster UI | vehicle assignment dropdown | `use-delivery-ecosystem.ts` |

---

## 4. Delivery Data Model

```text
Table: deliveries
Purpose: One row per SUB-ORDER's physical delivery (never per order — a multi-supplier
         order has one independent Delivery per supplier).
Key fields:
  id, subOrderId, orderId, supplierId, cafeId (denormalized)
  deliveryMode: 'DELIVERY_COMPANY' | 'SUPPLIER'
  deliveryCompanyId, driverId
  status: PENDING | AVAILABLE | ACCEPTED | ASSIGNED | PICKED_UP | IN_TRANSIT | DELIVERED | CANCELLED
  pickupCode, dropoffCode                        — 6-digit confirmation codes, redacted per role
  pickupAddress, destinationAddress (jsonb)       — GeoLocation snapshots, frozen at creation
  deliveryFee                                     — full driver/operator compensation (never
                                                     reduced by free-delivery)
  cafeOwnerFeeShareCents, supplierFeeShareCents   — the actual money-flow split
  freeDeliveryApplied
  vehicleId, vehicleType, distanceKm, surgeMultiplierPermille  — audit snapshot of what produced the fee
  feeFinalizedAt                                  — once set, fee fields are frozen forever
  createdAt/acceptedAt/assignedAt/pickedUpAt/inTransitAt/deliveredAt/cancelledAt
Relationships: subOrder (1:1 active), order, supplier, cafe, deliveryCompany, driver, vehicle

Table: deliveryPricingSettings  (singleton — always exactly one row)
Purpose: Admin-editable pricing configuration, the sole input to the pricing engine besides distance.
Key fields: vehiclePricing (jsonb, {pricePerKmCents, minFeeCents} per vehicle type),
            defaultVehicleType, surgeMultiplierPermille (×1000), surgeLabel (free text),
            cafeOwnerSharePercent (0-100)

Table: vehicles
Purpose: One vehicle per Driver/Delivery-Company/Supplier owner, optionally assigned to a driver.
Key fields: ownerType, ownerId, type, brand, model, plateNumber, hasAirConditioning,
            assignedDriverId (partial-unique: one vehicle per driver)

Table: subOrders
Purpose: The per-supplier slice of a customer order. NO delivery-fee field of any kind.
Fields relevant here: subtotal (already net of promo + discount code), status
                       (READY transition is what triggers Delivery creation)

Table: orders
Purpose: The customer-facing order. `deliveryFee` column exists but is legacy/dead — the
         checkout route never populates it; it is permanently 0. Never read by the pricing
         engine.

Table: users
Fields relevant here: locationLat, locationLng, locationAddress, locationDetails — used as
         the supplier's pickup snapshot and the driver's position input. No live-GPS field
         exists; these are static profile coordinates, manually shared/updated.
```

---

## 5. Delivery Creation Flow

```text
Supplier marks sub-order READY
        ↓  PATCH /api/orders/:subOrderId/status  {status:"READY"}
        ↓  storage.updateSubOrderStatus (server/storage.ts:1137)
        ↓  inside one DB transaction:
        ↓    subOrders.status → 'READY'
        ↓    storage.createDeliveryForSubOrder(subOrderId, tx)   [server/storage.ts:1222]
        ↓
        ↓  createDeliveryForSubOrder:
        ↓    - refuses if order.deliveryMethod === 'SELF_PICKUP' (returns null)
        ↓    - snapshots supplier's CURRENT profile location as pickupAddress
        ↓    - reads order.deliveryAddress (the café's checkout-time address) as destinationAddress
        ↓    - calls computeDeliveryFee() for a PROVISIONAL estimate (no driver yet,
        ↓      so driver→supplier leg = 0; only supplier→cafe leg is known)
        ↓    - INSERT deliveries row, status='PENDING'
        ↓
Delivery row exists, status=PENDING — invisible to anyone except the owning Supplier
        ↓  PATCH /api/deliveries/:id/dispatch  {mode:"DELIVERY_COMPANY"|"SUPPLIER", deliveryCompanyId?}
        ↓
   ┌────┴─────────────────────────────┐
   ↓ mode=DELIVERY_COMPANY             ↓ mode=SUPPLIER
   status → AVAILABLE                  status → ACCEPTED (immediately — supplier IS the operator)
   (broadcast to company pool)
        ↓  PATCH /api/deliveries/:id/accept (Delivery Company)
        status → ACCEPTED
   └────┬─────────────────────────────┘
        ↓  PATCH /api/deliveries/:id/assign  {driverId}
        ↓  storage.assignDriver (server/storage.ts:1675)
        ↓    - verifies ownership (driver must belong to the acting supplier/company)
        ↓    - reads the driver's OWN registered vehicle (getVehicleForDriver)
        ↓    - calls computeDeliveryFee() AGAIN — now with the real driver→supplier leg
        ↓      and the real vehicle type — THIS IS THE FINAL, FROZEN FEE (feeFinalizedAt set)
        ↓    status → ASSIGNED
        ↓
        ↓  PATCH /api/deliveries/:id/status  {status:"PICKED_UP", code}  (driver, pickupCode check)
        ↓  PATCH /api/deliveries/:id/status  {status:"IN_TRANSIT"}       (driver)
        ↓  PATCH /api/deliveries/:id/status  {status:"DELIVERED", code}  (driver, dropoffCode check)
        ↓    → sub-order status propagates to IN_DELIVERY/DELIVERED, order aggregate recomputed
        ↓    → fee fields are NEVER touched again from here on
```

---

## 6. Current Pricing Logic

**BigBoss DOES dynamically calculate delivery price.** It is not a placeholder, not hardcoded per order, and not client-supplied.

- **Function**: `private computeDeliveryFee(...)` — `server/storage.ts:2107-2143`
- **Called from**: `createDeliveryForSubOrder` (`storage.ts:1244`, provisional estimate at READY) and `assignDriver`/`reassignDriver` (`storage.ts:1707`, `1766` — final, frozen value at driver assignment)
- **Inputs**: `supplierId, cafeId, subtotalCents, supplierLocation, cafeLocation, driverLocation?, vehicleType?`
- **Database values used**: `deliveryPricingSettings.vehiclePricing[type].{pricePerKmCents,minFeeCents}`, `.defaultVehicleType`, `.surgeMultiplierPermille`, `.cafeOwnerSharePercent`; `users.locationLat/Lng` (supplier + driver); `orders.deliveryAddress` (café); `promotions` table (FREE_SHIPPING check)
- **Frontend values used**: none — the client never supplies distance, rate, or fee
- **Minimum price**: `pricing.minFeeCents`, per vehicle type (floor)
- **Maximum price**: none — no cap exists
- **Weight/time calculation**: none — not implemented
- **Supplier / café-owner / driver / delivery-company contribution**: see §11
- **BigBoss (platform) contribution**: none — the platform takes no cut of the delivery fee itself (it is fully allocated between café and supplier; only the Shop *product* revenue has a separate 5% platform commission, unrelated to delivery)
- **Taxes**: none found
- **Discounts/promotions on delivery**: only the boolean `FREE_SHIPPING` promotion type, which reallocates responsibility (never discounts the driver's actual compensation)
- **Special cases**: `SELF_PICKUP` orders never create a Delivery at all (`storage.ts:1227`); missing coordinates degrade a leg to 0 km rather than blocking the order

---

## 7. Exact Current Pricing Formula

```text
distanceKm      = haversine(driver, supplier)  +  haversine(supplier, cafe)
                  (driver leg = 0 until a driver is assigned)

rawFeeCents     = round( distanceKm × pricePerKmCents[vehicleType] × surgeMultiplierPermille / 1000 )

feeCents        = max( 0, max( rawFeeCents, minFeeCents[vehicleType] ) )

freeDeliveryApplied = an ACTIVE FREE_SHIPPING promotion exists for this supplier, this café
                       is eligible, and subtotalCents ≥ that promotion's minimum amount

cafeOwnerFeeShareCents = freeDeliveryApplied ? 0 : round( feeCents × cafeOwnerSharePercent / 100 )
supplierFeeShareCents  = feeCents − cafeOwnerFeeShareCents
```

Default seeded rates (`server/storage.ts:1989-1996`, currently live and unmodified except `surgeLabel`):

| Vehicle | Price / km | Minimum fee |
|---|---|---|
| BICYCLE | 0.30 DT | 1.50 DT |
| MOTO | 0.50 DT | 3.00 DT |
| CAR | 1.00 DT | 5.00 DT |
| VAN | 1.50 DT | 8.00 DT |
| TRUCK | 2.50 DT | 15.00 DT |
| OTHER | 0.50 DT | 3.00 DT |

`cafeOwnerSharePercent` = 50 (default and current live value) · `surgeMultiplierPermille` = 1000 (= ×1.0, current live value; `surgeLabel` currently reads "Pluie Forte" but has **no numeric effect** — see §16).

---

## 8. Real Order Example — headline numbers

```text
Commande #000143
Café: BARISTAS (mersinix@cafe.com)  ·  Fournisseur: Café Bondin (supplier@beans.com)
Sub-order #151 subtotal: 93.50 DT (net of a 16.50 DT discount code)
Delivery #47: MOTO, 4.15 km, DELIVERED, driver "Ahmed"
Delivery fee: 3.00 DT total → Café pays 1.50 DT, Supplier absorbs 1.50 DT
```
Full breakdown in §16.

---

## 9. Distance Calculation

```text
Supplier's snapshotted profile location (lat/lng, frozen at delivery creation)
        ↓
Café's checkout-time delivery address (lat/lng, from the order itself)
        ↓
  haversineKm(supplier, cafe)  →  "supplier→cafe" leg  (known immediately at creation)
        ↓
Driver's own profile location (lat/lng — static, manually set/shared, NOT live GPS)
        ↓
  haversineKm(driver, supplier)  →  "driver→supplier" leg  (only known once assigned; 0 before)
        ↓
distanceKm = driver→supplier + supplier→cafe
        ↓
feeCents = f(distanceKm, vehicle rate, surge, minimum)
```

- **Method**: pure Haversine great-circle formula (`server/storage.ts:2027-2034`), **not** Google Maps Distance Matrix, Mapbox, or OpenStreetMap routing.
- **Coordinates come from**: `users.locationLat`/`users.locationLng` for both supplier and driver (`server/storage.ts:1232-1238` for the pickup snapshot; `1711-1713` for driver position at assignment); `orders.deliveryAddress.lat/lng` for the café (client-supplied and zod-validated at checkout, `server/routes.ts:3768-3772`).
- **Google Maps JS** *is* used elsewhere — `client/src/components/delivery/delivery-route-map.tsx` — but only for a **visual navigation map with a straight-line connector**, never to compute the price. It reuses the same loader as the address picker (`location-picker-modal.tsx`) and explicitly avoids the Directions API (comment at `delivery-route-map.tsx:41-44`).
- **No distance or ETA number is ever shown to any user** — not even the driver, not even on the visual map.

---

## 10. Vehicle System

| Vehicle | Exists? | Pricing impact | Capacity | Weight limit | Other rules |
|---|---|---|---|---|---|
| Vélo (BICYCLE) | ✅ | 0.30 DT/km, min 1.50 DT | NOT IMPLEMENTED | NOT IMPLEMENTED | none |
| Moto (MOTO) | ✅ (default vehicle type) | 0.50 DT/km, min 3.00 DT | NOT IMPLEMENTED | NOT IMPLEMENTED | none |
| Voiture (CAR) | ✅ | 1.00 DT/km, min 5.00 DT | NOT IMPLEMENTED | NOT IMPLEMENTED | A/C toggle available (Delivery Company fleet form only) |
| Camionnette (VAN) | ✅ | 1.50 DT/km, min 8.00 DT | NOT IMPLEMENTED | NOT IMPLEMENTED | A/C toggle available |
| Camion (TRUCK) | ✅ | 2.50 DT/km, min 15.00 DT | NOT IMPLEMENTED | NOT IMPLEMENTED | A/C toggle available |
| Autre (OTHER) | ✅ | same rate as MOTO by default | NOT IMPLEMENTED | NOT IMPLEMENTED | catch-all |

No vehicle type has a capacity/weight/volume limit, driver license requirement, or availability restriction anywhere in the code — the only differentiator is the flat price-per-km/minimum-fee pair. A delivery's vehicle type is **not chosen per dispatch** — it is inherited from whatever single vehicle the assigned driver has registered (`getVehicleForDriver`, `storage.ts:2154-2157`), falling back to the admin's `defaultVehicleType` (MOTO) if the driver has none.

---

## 11. Who Currently Pays for Delivery?

```text
Café Owner  ──── cafeOwnerFeeShareCents (default 50% of feeCents, or 0% under free delivery) ──┐
                                                                                                  ├──→ split of feeCents
Supplier    ──── supplierFeeShareCents (the remainder, up to 100% under free delivery) ─────────┘

feeCents (the driver/operator's full compensation) is NEVER reduced by the split — only who
covers it changes. BigBoss (the platform) receives and pays nothing on delivery specifically.
```

- **Supplier subsidization**: IMPLEMENTED — `freeDeliveryApplied` reroutes 100% of `feeCents` to `supplierFeeShareCents` when the supplier has an active `FREE_SHIPPING` promotion the order qualifies for (`server/storage.ts:2134-2136`).
- **Split outside free-delivery**: a single global admin-set percentage (`cafeOwnerSharePercent`, currently 50) applies to every supplier identically — **no per-supplier override exists**.
- **Driver/Delivery-Company receipt**: `deliveries.deliveryFee` is described in code comments as the driver/operator's compensation, but there is **no distinct payout record or commission split** between a Delivery Company and its driver — see §12.
- **BigBoss (platform) contribution to delivery**: NOT IMPLEMENTED — no platform subsidy or commission on delivery fees exists (the 5% Shop commission is a separate, product-revenue-only concern, not delivery).

---

## 12. Driver Compensation

**NOT IMPLEMENTED as a distinct concept.** There is no `driverPayout`, `driverEarnings`, or commission-split field anywhere in the schema. What exists:

- `client/src/pages/driver/wallet.tsx:28-39` sums `deliveries.deliveryFee` (the **full** fee — the same number the café/supplier split is computed from) over `status==='DELIVERED'` deliveries, bucketed by day/week/month, and displays it as "Solde cumulé" / "vos gains."
- `client/src/pages/driver/payments.tsx:91` shows the same raw `deliveryFee` per delivery row, labeled "Frais de livraison."
- In `DELIVERY_COMPANY` mode this means the driver's own wallet page is actually showing **the company's gross delivery revenue**, not a personal payout — there is no field anywhere recording what the company actually pays that driver.
- `computeDeliveryFee` takes no `deliveryMode` input at all (Agent finding, confirmed directly: `storage.ts:2107-2114`) — so a driver working for a Delivery Company and a driver working directly for a Supplier are computed identically; only authorization/ownership differs.

---

## 13. Supplier-Owned Driver vs Delivery Company

### CASE A — Supplier uses a Delivery Company

```text
Supplier                          dispatchDelivery(mode='DELIVERY_COMPANY')  → status AVAILABLE
   ↓ (broadcast to company pool, or targeted to one company via deliveryCompanyId)
Delivery Company                  acceptDelivery()                           → status ACCEPTED
   ↓
Delivery Company                  assignDriver(driverId ∈ company's own roster) → status ASSIGNED
                                   fee FINALIZED here (driver→supplier leg + real vehicle)
   ↓
Driver                            PICKED_UP → IN_TRANSIT → DELIVERED
```
Who pays whom: `cafeOwnerFeeShareCents` from café, `supplierFeeShareCents` from supplier, combined = `deliveryFee`, credited conceptually to "the delivery company" — but with no persisted driver-vs-company split (§12).

### CASE B — Supplier uses its own drivers

```text
Supplier                          dispatchDelivery(mode='SUPPLIER')          → status ACCEPTED (immediately —
                                                                                 no separate acceptance step, the
                                                                                 supplier IS the operator)
   ↓
Supplier                          assignDriver(driverId ∈ supplier's own roster) → status ASSIGNED
                                   fee FINALIZED here, identical formula to Case A
   ↓
Driver                            PICKED_UP → IN_TRANSIT → DELIVERED
```
Who pays whom: identical math — café pays its share, supplier pays its share (of a fee the supplier itself will now effectively also be the one physically executing/paying its own driver for). No netting logic exists between "supplier pays café's share back" and "supplier pays its own driver" — they are just two independent obligations recorded the same way as Case A.

### CASE C — BigBoss/internal delivery

**NOT IMPLEMENTED.** `deliveryModeEnum = pgEnum('delivery_mode', ['DELIVERY_COMPANY', 'SUPPLIER'])` (`shared/schema.ts:21`) — there is no third mode, no internal BigBoss fleet, no platform-operated delivery path anywhere in the schema or routes.

---

## 14. Delivery Company Flow (frontend surface)

- **Available Deliveries** (`pages/delivery/available-deliveries-page.tsx:82`): shows `deliveryFee` directly above the "Accepter" button — the only place any operator sees the fee **before** committing to a delivery.
- **Dashboard** (`pages/delivery/dashboard.tsx:37,96-99`): aggregate "Frais générés" — a client-side sum of today's completed deliveries' `deliveryFee`, purely a display aggregate.
- **Vehicles page**: fleet CRUD only — despite pricing being per-vehicle-type, this page shows no pricing at all.
- **No driver-compensation view exists anywhere** in the Delivery Company space — it can see what it earns in aggregate, never what it owes a specific driver.
- **No pricing/tariff configuration view** — `useDeliveryPricingSettings` is Admin-only.

---

## 15. Dynamic Pricing Capabilities

| Factor | Currently implemented? | Where? | How does it affect price? |
|---|---|---|---|
| Distance | ✅ | `storage.ts:2127-2129` | Directly, linearly (× price/km) |
| Time (of day) | ❌ NOT IMPLEMENTED | — | — |
| Weather | ❌ NOT IMPLEMENTED | `surgeLabel` is free text only, no weather source | Zero automated effect |
| Demand | ❌ NOT IMPLEMENTED | — | — |
| Number of available drivers | ❌ NOT IMPLEMENTED | — | — |
| Vehicle type | ✅ | `deliveryPricingSettings.vehiclePricing` | Different rate/min per type |
| Weight | ❌ NOT IMPLEMENTED | — | — |
| Volume | ❌ NOT IMPLEMENTED | — | — |
| Waiting time | ❌ NOT IMPLEMENTED | — | — |
| Urgency (order priority) | ❌ NOT IMPLEMENTED | `orders.priority` exists (NORMAL/HIGH/URGENT) but is never read by `computeDeliveryFee` | No price effect, display-only |
| Peak hour | ❌ NOT IMPLEMENTED | — | — |
| Weekend / holiday / night surcharge | ❌ NOT IMPLEMENTED | — | — |
| Zone pricing | ❌ NOT IMPLEMENTED | — | — |
| Multiple stops | ❌ NOT IMPLEMENTED | — | — |
| Long-distance surcharge | ❌ NOT IMPLEMENTED (only the minimum-fee floor, no ceiling/tiering) | — | — |
| Supplier subsidy (free delivery) | ✅ | `hasApplicableFreeDeliveryPromotion`, `storage.ts:2083-2097` | Reroutes 100% of fee to supplier |
| BigBoss subsidy | ❌ NOT IMPLEMENTED | — | — |
| Minimum order amount (for free delivery) | ✅ | `promotions.freeShippingMinAmount` | Gates the free-delivery promotion |
| Manual global surge multiplier | ✅ (but never auto-triggered) | `deliveryPricingSettings.surgeMultiplierPermille`, admin-edited | Multiplies the whole raw fee |

---

## 16. Weather Handling

**NOT IMPLEMENTED.** A repo-wide search for `weather`, `rain`, `storm`, `openweather`, `climate`, `meteo` across `server/`, `shared/`, and `client/src/` returns zero real integrations. The only trace is a placeholder string on the admin surge-label input: `client/src/pages/admin/system-management-page.tsx:786` — `placeholder="ex : Pluie forte, forte chaleur…"`. See §22 for the concrete live-data proof that this is purely decorative.

---

## 17. Demand Handling

**NOT IMPLEMENTED.** No driver-availability count, no active-order count, no queue-depth signal feeds into pricing anywhere. The single `surgeMultiplierPermille` is the only lever, and it is 100% manual.

---

## 18. Waiting Time

**NOT IMPLEMENTED.** No field, no timer, no grep hit for `waitingTime` anywhere in the codebase. A driver's dwell time at pickup or dropoff has zero effect on the fee.

---

## 19. Frontend Delivery Flow (per role)

**Café Owner**
- Cart (`cart-page.tsx:205`) and checkout confirmation (`order-confirmation-modal.tsx:177-180`) totals are `items + packs − discounts` — **no delivery term at all**. Delivery fee is **never shown before checkout**.
- It first appears **after** the order exists, in `order-details-modal.tsx:346` (sum of `cafeOwnerFeeShareCents` across sub-orders) and the invoice modal.
- The café owner has **no map/tracking view with location data** — only the status stepper (`components/order/delivery-progress.tsx`).
- Delivery price **cannot change after checkout in the sense of "renegotiated"** — but it is genuinely not fixed at checkout time either, since it doesn't exist yet; it's computed later, twice, and then frozen.

**Supplier**
- Dispatch decision (Delivery Company vs. own driver) on `supplier/delivery-status-page.tsx`.
- Delivery fee configuration: **none** — a supplier cannot set its own rates; only its own `FREE_SHIPPING` promotions (a pre-existing, separate system) affect delivery cost responsibility.
- Own-driver roster management via `supplier/delivery-drivers-page.tsx` (shared `DriverRosterView` component).

**Delivery Company**
- See §14. Sees pricing only as an already-computed number, before accepting and per delivery; never configures it.

**Driver**
- Sees fee only for deliveries already assigned (never before, since self-claiming doesn't exist — `driver/opportunities.tsx` is explicitly a dead page per its own code comment).
- "Earnings" (`driver/wallet.tsx`, `driver/payments.tsx`) is the raw `deliveryFee`, not a personal payout figure.
- Vehicle self-registration (`driver/profile.tsx:217-221`) determines what rate applies to their future deliveries.

**Admin**
- Configures pricing (§20) but the delivery **management** page (`admin/delivery-page.tsx`) shows only a single total "Frais" — no breakdown of café/supplier share, no free-delivery indicator, despite Admin being the one role that configures the split.

---

## 20. Admin Delivery Flow

**Configuration** — `admin/system-management-page.tsx`, `DeliveryPricingSection` (lines 667-798):
- A 6-row table (one per vehicle type) with two number inputs each: price/km, minimum fee.
- Default vehicle type selector.
- "Répartition Coffee Owner (%)" numeric input (0-100).
- "Multiplicateur actif (×)" numeric input.
- "Motif / étiquette" free-text input.
- Saves on blur via `PATCH /api/admin/delivery-pricing`, broadcasts `delivery_pricing_updated`.

**Management** — `admin/delivery-page.tsx`: read-only visibility into every delivery's status/driver/company, plus the one `Frais` total. No pricing breakdown, no per-supplier delivery analytics, no ability to override or cancel-and-refund a fee.

---

## 21. Security / Trust Boundaries

- **Customer (Café Owner) cannot manipulate delivery price** — the order-creation body accepts `items[].unitPrice` but it is discarded; `resolveOrderItems` (`server/storage.ts:914-976`) re-derives every price from the DB listing/variant row. No delivery-fee field is accepted in the order-creation body at all (`server/routes.ts:3787-3823`).
- **Supplier cannot manipulate delivery price** — dispatch (`routes.ts:4278-4287`) accepts only `{mode, deliveryCompanyId}`.
- **Driver cannot manipulate payout** — assign/reassign (`routes.ts:4340-4348`, `4385-4391`) accept only `{driverId}`; the fee is recomputed server-side inside `assignDriver`/`reassignDriver`, never taken from the request.
- **Frontend never sends a delivery price to the backend, anywhere** — confirmed by both a targeted grep of every mutation body in `client/src` and a full read of every relevant zod schema in `server/routes.ts`.
- **Backend always recomputes** — `computeDeliveryFee` is called from exactly two places (`storage.ts:1244`, `1707`/`1766`), both driven by DB state, never by request-body values.
- **The one endpoint that does accept money values is `PATCH /api/admin/delivery-pricing`**, gated by `requireAdmin`, and it only writes *configuration* (rates), never a specific delivery's fee.
- **Order price is trusted from the frontend?** No — same `resolveOrderItems` re-derivation applies to product pricing as well as delivery.

---

## 22. Duplicated Logic / Inconsistencies

**No duplicated pricing calculation exists.** A full grep of `client/src` for distance/rate arithmetic patterns found zero client-side fee computation — every place a delivery fee appears on the frontend is either a direct passthrough of a server value or an addition/summation of server values (e.g. `order-invoice-modal.tsx:70-71`, `driver/wallet.tsx:31`, `delivery/dashboard.tsx:37`). This is a genuinely clean single-source-of-truth architecture on the calculation side.

Real inconsistencies found, none of them duplicate-calculation bugs:

1. **Surge label vs. surge multiplier drift** — the live database currently has `surgeLabel = "Pluie Forte"` but `surgeMultiplierPermille = 1000` (neutral, ×1.0). An admin can type a weather-sounding label without it having any pricing effect — the UI doesn't warn that the label and the multiplier are two independent fields.
2. **Driver "earnings" mislabeling** — `driver/wallet.tsx` presents the raw `deliveries.deliveryFee` (the full operator compensation) as "vos gains"/"Solde cumulé," which for a Delivery-Company-employed driver is actually the company's gross revenue, not their personal payout — there is no field that would let it be anything else.
3. **`order-confirmation-modal.tsx:38`'s own comment** claims the confirmation total always matches what checkout will charge — this is not true once a delivery fee is later added, since no delivery term is included in that total at all.
4. **`deliveryStatusEnum`'s comment** (`shared/schema.ts:13-15`) says `PENDING` is "reserved for a future pre-publish step... not used by the current flow, which creates deliveries directly in AVAILABLE" — but `createDeliveryForSubOrder` actually inserts `status: 'PENDING'` (`storage.ts:1259`) and a separate dispatch step moves it to `AVAILABLE`/`ACCEPTED`. The comment is stale relative to the current dispatch-based flow.
5. **`deliveryMode` carries no pricing meaning** despite being a prominent operator-facing concept (Delivery Company vs. Supplier) — `computeDeliveryFee` doesn't take it as input at all, so both modes are priced identically; only authorization differs.

---

## 23. Current Delivery System Limitations

**Pricing**
- No maximum fee / distance cap.
- No per-supplier or per-zone rate override — one global rate table for the entire platform.
- No tiered/progressive pricing (flat rate per km regardless of total distance).

**Vehicle management**
- No capacity, weight, or volume attributes per vehicle type.
- No availability/license requirements.
- A delivery's vehicle is whatever single vehicle the assigned driver happens to have registered — no vehicle selection at dispatch time, no capacity-matching to order size.

**Driver compensation**
- No persisted payout/commission concept distinct from the raw delivery fee.
- No Delivery-Company-to-driver split — a company driver's "earnings" page shows the company's full revenue.
- No payout status/history (paid/pending) for drivers.

**Supplier contribution**
- Only a binary FREE_SHIPPING promotion toggle and the fixed global percentage split — no supplier-specific negotiated rate.

**Customer contribution**
- No pre-checkout delivery-fee preview or estimate at all.
- The café share percentage is a single global constant, not configurable per supplier/zone.

**Weather** — no integration, entirely manual and currently inert (label set but multiplier neutral).

**Demand** — no signal captured or used anywhere.

**Distance** — Haversine only (straight-line, not road distance); no live traffic/routing input.

**Weight/volume** — no fields exist at all.

**Multi-supplier orders** — each supplier's delivery is correctly independent (verified in an earlier session's live testing), but the Coffee Owner never sees a delivery estimate broken down per supplier before checkout, only after.

**Delivery-company management** — no driver-compensation visibility, no pricing configuration surface, no performance/reliability metrics beyond raw counts.

**Driver management** — no self-service opportunity/claim flow (explicitly dead code); assignment is entirely operator-driven.

**Admin configuration** — no time-of-day, weather, or zone rule builder; the delivery management page doesn't surface the café/supplier split it itself configures.

---

## 24. Recommended Architecture for Future Evolution — ANALYSIS ONLY

*(No implementation — purely naming the gaps a future design would need to close, based strictly on what §1-23 proved does and doesn't exist today.)*

- A pre-checkout fee **estimate** endpoint (reusing `computeDeliveryFee` in "estimate mode," no persistence) would close the single biggest UX gap (§19) without touching the frozen-at-assignment finalization model that already works well for historical accuracy.
- A genuine driver-payout/commission table, separate from `deliveries.deliveryFee`, would resolve §12/§22-2 without disturbing the existing café/supplier split, which is a separate and already-correct concern.
- If weather/demand pricing is wanted, it would plug in as an additional multiplier alongside — not replacing — the existing `surgeMultiplierPermille`, since that field's shape (a permille integer applied multiplicatively to `rawFeeCents`) already generalizes to multiple stacked multipliers.
- Any per-supplier/per-zone rate override would need to extend `deliveryPricingSettings` (currently a true global singleton) into a keyed table — a schema change, not a logic change, since `computeDeliveryFee` already threads `supplierId` through every call.

---

## 25. Final Conclusion

```text
CURRENT BIGBOSS DELIVERY SYSTEM

Current pricing model:        Haversine distance × per-vehicle rate × global surge multiplier,
                               floored by a per-vehicle minimum. Computed twice (estimate,
                               then frozen final) per delivery, server-side only.

Current delivery payer:       Split between Café Owner and Supplier via a single global
                               percentage (default 50/50), collapsing to 100% Supplier when a
                               FREE_SHIPPING promotion applies. BigBoss pays/receives nothing
                               on delivery specifically.

Current driver compensation:  Not a distinct concept — driver-facing "earnings" pages simply
                               display the same total delivery fee the café/supplier split is
                               computed from; no company-to-driver split exists.

Current vehicle system:       6 types (Vélo/Moto/Voiture/Camionnette/Camion/Autre), each with
                               an admin-editable rate/minimum; no capacity/weight rules; vehicle
                               is inherited from the driver's own single registered vehicle.

Current distance system:      Haversine great-circle on static profile coordinates
                               (supplier + driver) and the order's checkout address (café).
                               Google Maps JS exists only for a straight-line visual map, never
                               for price computation.

Current weather system:       Not implemented. A manually-typed free-text label with zero
                               automated pricing effect.

Current dynamic pricing:      Distance and vehicle type only, plus a manual global surge
                               scalar an admin must remember to actually change.

Current supplier subsidy:     Implemented — an active Supplier FREE_SHIPPING promotion shifts
                               100% of the delivery fee to the supplier.

Current delivery company model: Full accept/assign/status lifecycle; no pricing configuration
                               surface, no driver-compensation visibility.

Current supplier-driver model: Identical pricing math to the Delivery Company path; only
                               dispatch/authorization differs (supplier skips the acceptance
                               step since it IS the operator).
```

---

## 16 (bis). Real Example — How BigBoss Currently Calculates One Delivery

```text
══════════════════════════════════════
BIGBOSS DELIVERY PRICE ANALYSIS
══════════════════════════════════════

Order:
#000143

Customer:
BARISTAS (mersinix@cafe.com)

Supplier:
Café Bondin (supplier@beans.com)

Pickup:
R5W8+P87, Ariana, Tunisie  (lat 36.846750, lng 10.165828 — supplier's profile location,
snapshotted at delivery creation)

Dropoff:
R556+QM9, Tunis, Tunisie  (lat 36.809534, lng 10.161853 — the café's checkout-time
delivery address; detailed address: Beb Saadoun, bâtiment 90, étage 4, porte C)

Distance:
4.15 km  (driver→supplier + supplier→cafe, haversine)

Vehicle:
MOTO  (no vehicle explicitly registered by driver "Ahmed" — fell back to the admin's
defaultVehicleType)

Order value (sub-order subtotal, net of a 16.50 DT discount code "BIGBOSSCOFFEE"):
93.50 DT

──────────────────────────────────────

DELIVERY CALCULATION

Base fee:
NOT IMPLEMENTED (no separate base fee — only rate × distance, floored by a minimum)

Distance fee (raw, before minimum floor):
round(4.15 km × 0.50 DT/km × 1.0 surge) = round(2.075 DT) → 2.08 DT

Time fee:
NOT IMPLEMENTED

Vehicle fee:
folded into the per-km rate above (MOTO = 0.50 DT/km, minimum 3.00 DT)

Other:
Minimum-fee floor applied — 2.08 DT (raw) < 3.00 DT (MOTO minimum) → minimum wins

──────────────────────────────────────

CURRENT DELIVERY PRICE:
3.00 DT

──────────────────────────────────────

WHO PAYS?

Customer (Café Owner):
1.50 DT   (cafeOwnerSharePercent = 50%, no free-delivery promotion applied here)

Supplier:
1.50 DT

BigBoss:
0.00 DT   (NOT IMPLEMENTED — platform takes no delivery cut)

──────────────────────────────────────

WHO GETS PAID?

Driver / Delivery Company (deliveryMode = SUPPLIER, so this supplier's own driver "Ahmed"):
3.00 DT total compensation — NOT IMPLEMENTED as a separately-recorded "driver payout";
this is simply what deliveries.deliveryFee stores and what the Driver's own Wallet/Payments
pages later sum and display.

BigBoss:
0.00 DT

──────────────────────────────────────

ACTUAL FORMULA (server/storage.ts:2107-2143):

const rawFee = Math.round(distanceKm * pricing.pricePerKmCents * (settings.surgeMultiplierPermille / 1000));
const feeCents = Math.max(0, Math.max(rawFee, pricing.minFeeCents));
const freeDeliveryApplied = await this.hasApplicableFreeDeliveryPromotion(supplierId, cafeId, subtotalCents);
const cafeOwnerFeeShareCents = freeDeliveryApplied ? 0 : Math.round(feeCents * (settings.cafeOwnerSharePercent / 100));
const supplierFeeShareCents = feeCents - cafeOwnerFeeShareCents;

Verified against the live database row (deliveries.id = 47):
  deliveryFee = 300 cents            ✓ matches max(round(4.15×50×1.0)=208, 300) = 300
  cafeOwnerFeeShareCents = 150 cents  ✓ matches round(300 × 50/100) = 150
  supplierFeeShareCents = 150 cents   ✓ matches 300 - 150 = 150
  freeDeliveryApplied = false         ✓
  feeFinalizedAt = 2026-09-13 23:18:54.952  (frozen — will never change again)

──────────────────────────────────────

SOURCE FILES:

shared/schema.ts               (deliveries, deliveryPricingSettings, subOrders table definitions)
server/storage.ts               (haversineKm:2027, computeDeliveryFee:2107,
                                  createDeliveryForSubOrder:1222, assignDriver:1675)
server/routes.ts                (PATCH /api/deliveries/:id/assign:4340,
                                  PATCH /api/admin/delivery-pricing:4969)
client/src/components/cafe/order-details-modal.tsx   (where this fee first becomes
                                  visible to the Café Owner, line 346)
══════════════════════════════════════
```
