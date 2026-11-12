# Coffee Owner Product Details — Taxonomy Realtime Synchronization — Report

## 1. Root cause of outdated taxonomy badges

The `products` table (`shared/schema.ts`) has, for category specifically, **two** fields side by side:

```ts
category: text("category").notNull().default(""),  // denormalized free-text snapshot
categoryId: integer("category_id"),                  // canonical FK to the categories table
```

Subcategory and brand have **no** such denormalized text column — only `subCategoryId`/`brandId` (FK only). Every `MarketplaceProduct` the server returns (both the browse listing and the single-product detail endpoint — see §2) already carries the canonical, always-fresh `categoryLabel`/`subCategoryLabel`/`brandLabel` objects, resolved from the live `categories`/`subCategories`/`brands` tables on **every single request** (no server-side caching across requests — see §4).

The Product Detail Modal's category badge (`client/src/components/product-detail-content.tsx`'s `categoryBadges`) was the one place in the whole Coffee Owner client still reading the **stale denormalized** `product.category` text field directly for display, instead of the already-available, always-fresh `product.categoryLabel.name`:

```tsx
// before
{product.category && (
  <Badge ...>{product.category}</Badge>
)}
```

`product.category` is written once when a product is created or its category is (re)assigned, and is **never rewritten** when an admin later renames the linked `categories` row elsewhere — so it silently drifts out of sync with the canonical name the instant that rename happens, while every other surface reading `categoryLabel.name` stays correct automatically.

The subcategory and brand badges in the exact same block were, on inspection, **already correct** — they already read `product.subCategoryLabel.name`/`product.brandLabel.name`, the canonical fields, with no stale fallback involved (confirmed there is no `subCategory`/`brand` denormalized text column on `products` at all, so this specific failure mode was structurally impossible for those two). This matches the task's own example precisely: only the category badge was reported stale, and the audit confirms *why* only category, specifically, could ever have been.

This was **not** a missing/incorrect realtime-invalidation problem (§5) — the existing mechanism already correctly reaches this exact query. It was purely a client-side field-selection bug: the right data was already being fetched and delivered; the component was just reading the wrong field of it.

## 2. API endpoints and components inspected

- `shared/schema.ts` — the `products` table's `category`/`categoryId`/`subCategoryId`/`brandId` columns; `ProductWithTaxonomy`/`MarketplaceProduct`'s `categoryLabel`/`subCategoryLabel`/`brandLabel` fields.
- `server/storage.ts` — `buildTaxonomyCache()` (a fresh `db.select()` against `categories`/`subCategories`/`flavors`/`sizes`/`brands` on every call, no persistent server-side cache) and `enrichProduct()` (builds `categoryLabel`/`subCategoryLabel`/`brandLabel` from that fresh read, for every product, every time).
- `server/storage/domains/marketplace.storage.ts` — `getMarketplaceProducts()` (the browse-listing query function) and `getMarketplaceProduct(productId, supplierId?)`, which **literally calls `getMarketplaceProducts()` and `.find()`s the one product** — confirming the listing and the single-product detail endpoint share one identical server-side resolution path; there is no separate, divergent code for the detail view at the server level.
- `server/routes/shop-catalog.routes.ts` — `GET /api/marketplace/:productId` (the detail endpoint `product-detail-content.tsx` calls) and `PATCH /api/categories/:id`/`/api/subcategories/:id`/`/api/brands/:id` (each already calling `broadcast("taxonomy_updated", {})` on a successful rename — pre-existing, unmodified).
- `client/src/hooks/use-realtime.ts` — the `TAXONOMY_EVENTS` handler, which already invalidates `["/api/categories"]`, `["/api/subcategories"]`, `["/api/brands"]`, `["/api/admin/products"]`, `["/api/supplier/admin-products"]`, and — critically — calls `invalidateMarketplace(qc)`.
- `client/src/lib/invalidate-marketplace.ts` — `invalidateMarketplace(qc, productId?)`, which (when called with no `productId`, as the `TAXONOMY_EVENTS` handler does) invalidates the query key `["/api/marketplace"]`.
- `client/src/components/product-detail-content.tsx` — the shared component rendering the Product Detail Modal's `categoryBadges` (the actual bug, §1), and its own `useQuery` (`queryKey: ["/api/marketplace", productId, supplierId ?? null]`, no `staleTime` override — default `0`, i.e. always eligible for an immediate refetch on invalidation).
- `client/src/components/product-quick-view-modal.tsx`, `client/src/pages/cafe/product-detail-page.tsx` — confirmed both are thin wrappers around `ProductDetailContent` with no taxonomy-badge rendering of their own, so the one fix in the shared component covers both the quick-view modal and the full-page detail view.
- `client/src/pages/cafe/browse-products.tsx` (`categoryName = product.categoryLabel?.name ?? product.category ?? null`, line 235) and `client/src/pages/cafe/store-detail-page.tsx` (`product.categoryLabel?.name` throughout) — confirmed both the Shop grid card and the Store page's product card **already** use the correct canonical-first fallback pattern for category — this is exactly why the task's own report states listings/cards already show the new name, and it is the exact pattern this fix now also applies inside the Product Detail Modal.
- `client/src/pages/supplier/manage-products.tsx`, `manage-packs.tsx` — confirmed the Supplier's own product/pack interfaces already read `categoryLabel`/`subCategoryLabel`/`categoryLabels` exclusively, never a stale denormalized field — nothing to fix on the Supplier side, consistent with the task's own statement that Supplier interfaces were already correct.

## 3. Files modified

- `client/src/components/product-detail-content.tsx` — the only file changed. One new `const categoryDisplayName = product.categoryLabel?.name ?? product.category;` and the category badge's condition/display text switched from `product.category` to `categoryDisplayName`. Subcategory and brand badges were not touched (already correct). No other line in this file, and no other file in the repository, was modified for this task.

## 4. How category, subcategory and brand names are resolved

All three now follow one identical rule inside the Product Detail Modal, matching what the Shop grid and Store page already do: **prefer the canonical, live-joined label; fall back to the legacy denormalized text only for category, and only when no canonical link exists at all** (a legacy product with a free-text category but no `categoryId`, which the fallback preserves rather than hiding the badge entirely):

- Category: `product.categoryLabel?.name ?? product.category`
- Subcategory: `product.subCategoryLabel?.name` (already correct, unchanged — no denormalized fallback exists or is needed, since no legacy text column for subcategory exists)
- Brand: `product.brandLabel?.name` (already correct, unchanged — same reasoning)

`categoryLabel`/`subCategoryLabel`/`brandLabel` are resolved server-side, fresh, on every request, via `buildTaxonomyCache()` + `enrichProduct()` (§2) — a plain `db.select()` against the live `categories`/`subCategories`/`brands` tables with no caching layer in between. The database relationship IDs (`categoryId`/`subCategoryId`/`brandId`) remain the sole source of truth for *which* taxonomy row to display the name of; nothing in this fix matches by name, reassigns a product's taxonomy, or touches any ID.

## 5. How realtime updates reach an already-open modal

No new realtime code was needed — the existing mechanism, once traced end-to-end, already correctly delivers the update:

1. `PATCH /api/categories/:id` (or `/subcategories/:id`, `/brands/:id`) saves the rename and calls `broadcast("taxonomy_updated", {})` (pre-existing, unmodified).
2. Every connected client's `use-realtime.ts` WebSocket handler receives `taxonomy_updated` and calls `invalidateMarketplace(qc)`, which runs `qc.invalidateQueries({ queryKey: ["/api/marketplace"] })` (pre-existing, unmodified).
3. TanStack Query's `invalidateQueries` matches by **key prefix** by default (`exact: false`) — `["/api/marketplace"]` matches any cached/active query whose key starts with that array, which includes the Product Detail Modal's own query key `["/api/marketplace", productId, supplierId ?? null]`. This is not a new behavior introduced here; it is TanStack Query's documented default, confirmed by reading the query's own definition (no `staleTime` override, so it's always eligible to refetch immediately once invalidated).
4. Because the modal's query is `enabled: !!productId` and mounted for as long as the modal is open, `invalidateQueries`'s default `refetchType: 'active'` causes it to refetch **immediately**, not just get marked stale for the next mount — so an already-open modal receives the new `categoryLabel`/`subCategoryLabel`/`brandLabel` without being closed, navigated away from, or refreshed.
5. `getMarketplaceProduct` re-runs `getMarketplaceProducts()` → fresh `buildTaxonomyCache()` → fresh `enrichProduct()` for every product, so the refetched response already contains the renamed label.
6. With this task's one fix in place, the component now actually **displays** that fresh `categoryLabel.name` instead of the stale `category` text it previously preferred — closing the loop.

Opening a *different* product's detail modal after the rename works for the identical reason: its own first fetch of `GET /api/marketplace/:productId` already returns the fresh, server-resolved name — no special-casing needed.

## 6. Cache invalidation/update strategy

Unchanged from what already existed — this task added no new query keys, no new invalidation calls, and no new broadcast events. `invalidateMarketplace(qc)` (no `productId` argument, as called by the `TAXONOMY_EVENTS` handler) was confirmed to already invalidate every currently-mounted `/api/marketplace/*`-keyed query, including the per-product detail one, by TanStack Query's own prefix-matching default — there was no gap to fill here. The task's own caution — "do not assume that simply invalidating the product listing query will solve the issue" — was correct: the issue was never the invalidation at all; it was which field the already-correctly-refetched data got rendered from.

No stale-response race condition was introduced or needed guarding against: this fix changes only which field of the *already-current* query result is read for display, not how or when that result is fetched.

## 7. Confirmation that product relationships were preserved

Nothing in this change reads, writes, or compares by taxonomy *name* anywhere — `categoryDisplayName` is computed purely for **display**, from the already-resolved `categoryLabel`/`category` fields of the product object the server already returned; the underlying `categoryId`/`subCategoryId`/`brandId`/`supplierId`/variant/price/stock data on that same object is never read, written, or reassigned by this change. No database write of any kind occurs anywhere in this task — it is a pure, single-expression, client-side rendering fix.

## 8. Confirmation that no unrelated pricing or inventory logic was modified

Confirmed by `git status` after the edit: the only file touched this task is `client/src/components/product-detail-content.tsx`, and within it, only the `categoryBadges` block's category line changed (one new `const`, one `&&`-condition, one displayed expression). No pricing (`calcPromoPrice`, `VariantRow`'s add-to-cart logic, the minimum-order eligibility gate from a prior task), no promotion logic, no inventory/stock reading, no cart/order code, and no other service module (PRINT, Academy, Maintenance — confirmed `ProductDetailContent` has no consumer outside the Shop/Cafe domain, §2) was opened or modified.

## 9. Regression test results

**Actually executed and passed**:
- `npx tsc --noEmit -p .` — zero errors after the change.
- `npm run build` — Vite client + esbuild server both built successfully (only the pre-existing, unrelated "chunk larger than 500 kB" advisory).
- `git status` after the edit — confirmed exactly one file changed, no PRINT/Academy/Maintenance file touched.
- Repo-wide grep confirming `ProductDetailContent` has exactly three consumers (itself, the quick-view modal wrapper, and the full-page wrapper) and that neither wrapper renders its own category/subcategory/brand badge independently.
- Grep confirming the Shop grid card (`browse-products.tsx`) and Store page (`store-detail-page.tsx`) already use the identical `categoryLabel?.name ?? category` fallback this fix now also applies inside the modal — i.e. the fix brings the modal into line with the app's own existing, already-correct convention rather than inventing a new one.
- Grep confirming the Supplier's `manage-products.tsx`/`manage-packs.tsx` already read `categoryLabel`/`subCategoryLabel`/`categoryLabels` exclusively — nothing to change there.

**Automated tests added but not executed**: none — this project has no test runner configured (confirmed in prior tasks this session); no automated suite was written for Tests A–H.

**Code-level verification only** (traced through the actual server/client code and TanStack Query's documented invalidation semantics, not executed against a live system):
- **Test A** (category rename, modal open): traced the full `broadcast → invalidate → refetch → enrichProduct → categoryDisplayName` chain (§5) end-to-end; the fixed code now reads the field that chain was always correctly delivering.
- **Test B/C** (subcategory/brand rename): traced that these two badges were already reading the canonical, always-fresh fields before this task, and remain unchanged — the same realtime chain already applied to them, so the only missing piece was ever the category badge.
- **Test D** (multiple products, modal opened after rename): traced that every first-open fetch of `GET /api/marketplace/:productId` independently calls the same always-fresh `enrichProduct`, so a freshly-opened modal needs no special handling.
- **Test F** (modal open during the rename): traced that the modal's own `useQuery` has no `staleTime` override and is actively mounted, so `invalidateQueries`'s default active-refetch applies to it directly, not just to queries mounted later.
- **Test G** (relationship integrity): traced that this fix performs zero writes and reads only already-resolved display fields — `categoryId`/`subCategoryId`/`brandId`/variants/prices/inventory/supplier ownership are never touched by the changed code.
- **Test H** (regression — navigation/listings/filters/Supplier interfaces/promotion and checkout calculations): traced that none of the files implementing those (category navigation, listing cards, filters, Supplier product pages, `promotions-engine.ts`, `order-confirmation-modal.tsx`, order creation) were opened or modified in this task.

**Tests that require a live database or multiple browser sessions — not executed, could not be executed in this environment** (no `DATABASE_URL`, no browser-automation tool, the same constraint noted in every task this session):
- Test A/B/C/F's live verification that an actually-open browser modal visibly updates its badge text without any manual action, in real time, after a real admin rename.
- Test D's live verification across multiple real products.
- Test E's live verification across one real Admin browser session and one real Coffee Owner browser session simultaneously.
- Test G's live confirmation via actual database rows (categoryId/variant/price/stock/supplier columns) before and after a rename.
- Test H's live, interactive regression pass across every listed surface.
