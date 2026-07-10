---
name: Pack feature schema decisions
description: Key decisions made when extending the Pack feature with onlyForMyProducts, pack reviews, and flavor distribution.
---

## onlyForPack XOR onlyForMyProducts

Both flags live on `supplierProductListings`. They are **mutually exclusive**:
- `onlyForPack=true` → product only visible inside Pack Products, hidden from My Products marketplace
- `onlyForMyProducts=true` → product only visible in My Products, excluded from Pack Products tab
- Neither → appears in both

**Why:** The supplier needs to control distribution channel per listing without ambiguity.

**How to apply:** Enforce XOR in both POST and PATCH `/api/supplier/listings` routes (already done). UI toggles them mutually exclusive via onChange handlers. A future route touching either flag must preserve the invariant.

## Pack Reviews

Reused `supplierProductReviews` table with `reviewType='PACK'` and a new nullable `packId` column (added via `db:push`). Storage methods: `getPackReviews(packId)` and `createPackReview(data)`. API: `GET/POST /api/reviews/pack/:packId`.

**Why:** Avoids a separate table; reuses existing query/type infrastructure.

## listingVariants on PackItemDetail

Each pack item now carries `listingVariants: PackVariantOption[]` — all variants on the same listing. This lets the Coffee Owner redistribute quantities across flavors in the Quick View modal without extra queries.

**Why:** Flavor distribution is a display-time choice; having all variant options pre-loaded in the pack payload avoids N+1 fetches in the modal.

## Vite dep-optimization transient error

When a new Radix UI package (e.g. `@radix-ui/react-alert-dialog`) is added and optimized for the first time, Vite reloads and produces a brief "Invalid hook call / Cannot read properties of null" error. This is transient — it resolves on the next page load. Not a real bug.
