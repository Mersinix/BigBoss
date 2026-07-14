---
name: Inventory module design
description: How supplier inventory management was built on top of the existing listings/variants schema — where stock lives, what fields were added, and the order-restock gap that was fixed.
---

## Where stock actually lives
`supplier_product_listings.stock` is the aggregate; `supplier_product_variants.quantity` is the per-flavor/size source of truth when a listing has variants. The listing's `stock` field is kept as a denormalized sum recalculated whenever variants change. Never trust `products.stock` for supplier-facing inventory — it's not used by suppliers.

## Fields added to `supplier_product_listings`
`sku`, `barcode`, `minStock` (default 10), `maxStock` (nullable), `unit` (default 'unit'), `visibility` ('VISIBLE'|'HIDDEN' enum), `updatedAt`. These didn't exist before; low/out-of-stock status is computed from `stock` vs `minStock`.

## New `inventory_adjustments` table
Full audit trail of every stock change: manual (quick +/-/set with reason+notes, `userId` set) and system-driven (order cancellation restock, `userId` null). No `REFUNDED` order status exists in this schema — refunds are modeled as `CANCELLED`, so cancellation restock covers both.

## Order cancellation restock — was missing entirely
Before this work, `storage.updateOrderStatus` never restored stock when an order was cancelled (stock was only ever decremented in `createOrder`). Restock logic is now centralized inside `updateOrderStatus` (fires once, on any transition into `CANCELLED`), not duplicated in route handlers. It restores both packs (`quantityAvailable`) and listings/variants, matching by product/flavor/size since `order_items` doesn't store `listingId` directly.

**Why:** the spec for a working inventory system required stock to auto-correct on cancellation; the existing order flow silently leaked stock on every cancelled order.

**How to apply:** any new code path that cancels or refunds an order should go through `storage.updateOrderStatus`, not update `orders.status` directly, or restock will be skipped.
