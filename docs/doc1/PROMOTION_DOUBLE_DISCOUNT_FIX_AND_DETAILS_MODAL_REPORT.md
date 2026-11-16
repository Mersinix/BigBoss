# Promotion Double-Discount Fix & Promotion Details Modal — Report

## 1. Root cause of the double-discount problem

**One line of client-side code**, `client/src/components/product-detail-content.tsx`'s `VariantRow.handleAdd()`, wrote the *already-discounted* price into the cart item's `unitPrice` field:

```ts
unitPrice: promoPrice ?? variant.price,   // promoPrice = original price with the % /fixed discount already applied
```

`unitPrice` is the field every downstream pricing computation treats as the item's **original, pre-discount** price — the SHOP promotion engine (`server/promotions-engine.ts`), the cart's own totals (`use-cart.ts`'s `getTotal()`), the client-side promotion preview (`use-promotion-evaluation.ts` → `POST /api/promotions/evaluate`), and the cart/checkout breakdown in `cart-page.tsx` / `order-confirmation-modal.tsx` all compute `subtotal = unitPrice × quantity` and then apply the promotion's discount **on top of** that subtotal. Because the cart's `unitPrice` was already 20% below the real original price, every one of those computations re-applied the same 20% discount a second time — exactly the "9.600 → 7.680" behavior described in the task.

## 2. Existing pricing flow before the correction

Traced end-to-end, file by file, before changing anything:

1. **Product Detail Modal** (`product-detail-content.tsx`): `calcPromoPrice(variant.price, bestPricePromo)` correctly computes a *display-only* promotional price from the true original `variant.price`. This part was always correct — the bug was specifically that `handleAdd()` then put that display value into the cart as if it were the item's base price.
2. **Cart** (`use-cart.ts`): a plain Zustand store; `getTotal()` just sums `unitPrice × quantity` — it has no concept of "already discounted," so it faithfully (and incorrectly, given step 1) summed the pre-discounted total.
3. **Client-side promotion preview** (`use-promotion-evaluation.ts` → `POST /api/promotions/evaluate` → `server/promotions-engine.ts`): takes the cart's `unitPrice` as the *original* price and computes a fresh discount from it. With an already-discounted `unitPrice` as input, this produced a second, smaller-but-still-wrong discount on top of the first.
4. **Checkout display** (`cart-page.tsx`, `order-confirmation-modal.tsx`): `totalShop = Σ unitPrice × quantity` (already discounted) **minus** `promoEval.totalDiscount` (the second discount from step 3) — this is exactly where "Café Bondin 9.600, Discount % −1.920, Total SHOP 7.680" came from.
5. **Order creation** (`server/routes/orders.routes.ts` → `storage.resolveOrderItems`, `server/storage/domains/order.storage.ts`): this is the one place that was **already correct**, and for a reason worth stating explicitly — `resolveOrderItems` never reads the client-submitted `unitPrice` at all. It re-fetches `variant.price` / `listing.price` straight from the database and uses *that* as `unitPrice` for every subsequent computation (promotion evaluation, discount-code validation, the inserted `orders`/`subOrders`/`orderItems` rows). So the **persisted order total was already mathematically correct** (single discount, computed from the true original price) even before this fix — the bug was entirely in what the Coffee Owner was *shown* during cart/checkout, not in what was actually charged/recorded. This is still a critical, "Issue 1"-severity bug: it is a transparency/trust failure (the customer sees a lower total than what the order record says), and it made the client-side promotion-preview math wrong for any future feature that might rely on it, so it was fixed at the root rather than left as "harmless because the server happens to override it."

## 3. Files inspected and modified

**Inspected only (no changes needed — confirmed already correct):**
- `server/storage/domains/order.storage.ts` — `resolveOrderItems`, `resolvePackOrderItems`, `createOrder` (confirmed server-authoritative pricing, see §2 point 5 and §5).
- `server/promotions-engine.ts` — the evaluation algorithm itself (priority, stackable, cumulability, min order/quantity, discount caps, tiers) — untouched; it was never the source of the bug, it just received a wrong input.
- `server/storage/domains/discount-codes.storage.ts`'s validation path, `client/src/hooks/use-orders.ts`'s reorder-to-cart flow — both already build cart items from server-side `variant.price`/`listing.price`, never a pre-discounted value.
- `client/src/pages/cafe/cart-page.tsx`, `client/src/components/cafe/order-confirmation-modal.tsx` — their breakdown math (`totalShop − promoEval.totalDiscount`, per-supplier subtotal/discount rows) was already written assuming `unitPrice` is the original price. No code change was needed here; fixing the one write-site in §4 makes their existing formulas produce correct numbers.

**Modified:**
- `client/src/components/product-detail-content.tsx` — the one-line pricing fix (§4), plus the clickable-badge wiring and new modal state (§7).
- `shared/schema.ts` — added `CustomerPromotionDetail` type (§8).
- `server/storage/domains/promotions.storage.ts` — added `getPromotionDetailForListing` (§8).
- `server/storage.ts`, `server/storage/types/istorage.ts` — facade/interface wiring for the new storage method.
- `server/routes/shop-catalog.routes.ts` — added `GET /api/marketplace/promotions/:id` (§8).

**New file:**
- `client/src/components/promotion-details-modal.tsx` — the Promotion Details modal (§7–8).

No database schema, migration, existing route body, or existing storage method was modified.

## 4. Exact pricing strategy implemented

The task's own "Preferred approach" was applied literally and minimally:

```diff
- unitPrice: promoPrice ?? variant.price,
+ unitPrice: variant.price,
```

The cart now **always** stores the true original price. `calcPromoPrice`/`promoPrice`/the strikethrough price/the promo badge in the Product Detail Modal are untouched — they remain exactly what the Coffee Owner sees as a *preview* of the discounted price before adding to cart. Only the value that gets *persisted into cart state* changed. Every other computation in the lifecycle (cart totals, the promotion-evaluation preview, the checkout breakdown, discount-code validation preview, and the already-correct server-side order creation) reads `unitPrice` as "the original price" — which, as of this fix, it now actually is, everywhere, consistently. This is "one consistent pricing strategy," not a second parallel one: no new pricing module, type, or field was introduced for this part of the fix.

## 5. How duplicate discount application is prevented

- **Single source of base price**: the cart item's `unitPrice` is now unconditionally the DB's `variant.price`/`listing.price` at the moment it was added — never a value with any discount already folded in.
- **Single source of discount calculation**: `server/promotions-engine.ts`'s `calcDiscount`/`evaluateCartPromotions` is the only place a promotion discount is computed, called from exactly two places — the client preview (`POST /api/promotions/evaluate`, for display only) and order creation (`POST /api/orders`, authoritative) — both of which now receive the same correct original-price input.
- **No stacking of the fix with the engine's own stacking logic**: the engine's existing stackable/non-stackable, priority, and "never apply the same promotion twice" logic (one promotion can only contribute once per supplier group, picked by `bestPromo`/`stackable[]`) was not touched and continues to decide *which* promotions apply; this fix only ensures the *input subtotal* that logic operates on is correct, so it can no longer be double-counted against an already-discounted figure.

## 6. Server-side validation changes

**None were needed, and none were made.** Auditing `resolveOrderItems` (server/storage/domains/order.storage.ts:228) confirmed the server already:
1. Re-fetches the real product/variant/listing rows from the database for every item (ignores the client's submitted `unitPrice` entirely — the Zod schema accepts it as an optional field, but `resolveOrderItems` never reads `item.unitPrice` from the request).
2. Re-evaluates eligible promotions via `storage.evaluateCartPromotions` using these server-authoritative prices (`orders.routes.ts` lines 123–139).
3. Validates quantities (stock checks with atomic conditional UPDATEs), promotion dates/status/usage limits/cafe eligibility (`isPromotionValid`/`isCafeEligible` in `promotions-engine.ts`), and listing/category targeting (`getTargetedItems`).
4. Computes the final order total and per-supplier sub-order subtotal from that single, correctly-computed discount (`order.storage.ts`'s `createOrder`: `rawTotal − totalDiscount`).
5. Persists `orders.totalAmount`, `subOrders.subtotal`/`discountAmount`/`originalSubtotal`, and `orderItems.unitPrice`/`totalPrice` (at the true original price) using the existing schema — no new columns, no migration.

A manipulated/forged `unitPrice` or an arbitrary `promotionId` submitted by a tampered client was already impossible to turn into a wrong charge before this task, and remains impossible after it (Scenario 9). This fix's job was exclusively to make the **client-side preview** (what the Coffee Owner sees before confirming) match that already-correct server truth.

## 7. Promotion Details modal implementation

**New component**: `client/src/components/promotion-details-modal.tsx` (`PromotionDetailsModal`). Rendered once, as a sibling inside `product-detail-content.tsx`'s existing `auxModals` block (alongside `LocationPickerModal`/`ReviewModal`) — present in both the quick-view-modal and full-page layouts without duplicating any JSX.

**State & wiring**: a single `promoTarget: { promotionId, listingId, flavorId, sizeId } | null` piece of state lives in `ProductDetailContent` itself (not in `VariantRow`/`SupplierSection`, which stay presentation-only). It is:
- Set by either badge's `onClick` — the price-affecting badge rendered inside `VariantRow` (now a `<button>` instead of a `<span>`) or the non-price "supplier-level" badges rendered inside `SupplierSection` (Free Shipping / Gift / Buy X Get Y / Tier Pricing / Min Order Amount) — each passing its own exact `promotionId` + `listingId` (+ `flavorId`/`sizeId` for the variant-level badge, `null`/`null` for the listing-level ones).
- Cleared when the modal's own close button is clicked, **and** when the Coffee Owner navigates to a different product via Previous/Next (the same `useEffect` that already reset `selectedFlavorId`/`selectedSizeId`/`reviewModalOpen` on `productId` change now also resets `promoTarget`), so a stale promotion can never be shown against a different product.
- Never affects or is affected by the underlying product detail modal's own open/closed state — clicking a badge does not navigate away, close, or remount anything; closing the Promotion Details modal returns to the exact same product detail view, filters, and scroll position (Scenario 8).

**Multiple badges on the same product**: because each badge click carries its own `promotionId`+`listingId` captured at render time (from that specific `ListingPromotion`/variant), two different suppliers' badges — or a supplier's price badge and its own free-shipping badge — each open their own, independently-fetched promotion detail. There is no shared/last-clicked state that could leak one promotion's data into another's modal.

## 8. Data sources used for promotion details

**New endpoint**: `GET /api/marketplace/promotions/:id?listingId=X&flavorId=Y&sizeId=Z` (`server/routes/shop-catalog.routes.ts`), delegating to a new storage method `getPromotionDetailForListing` (`server/storage/domains/promotions.storage.ts`), reached through the existing facade pattern (`server/storage.ts` + `server/storage/types/istorage.ts`) — the same structure every other Promotions storage method already uses. No existing method's signature or body was changed; this is a pure addition.

This reuses the **exact same promotion records** created by the supplier at `/supplier/promotions` (the `promotions` table — the same rows `PromotionsStorage.getPromotions`/`getPromotion`/`createPromotion` already operate on) and the **exact same eligibility rules** already implemented in `getPromotionsForListings` (active status, start/end dates, `maxUses`, cafe eligibility, and — for `targetType`/`CATEGORIES`/`PRODUCTS` — the same listing/category targeting logic), reapplied here scoped to one promotion + one listing instead of many. No promotion data is duplicated, hardcoded, or invented: every field in the response is read live from the `promotions` row (plus the listing/variant's live price, and the category name when relevant).

**Security / authorization** (Part 3 & Scenario 9): the storage method returns `undefined` (→ HTTP 404) unless *all* of the following hold:
- The promotion belongs to the same supplier as the given `listingId`'s listing (prevents cross-supplier lookups).
- The promotion is `ACTIVE`, within its start/end dates, and under its `maxUses`.
- The requesting cafe (resolved from the session, never trusted from the client) is in `eligibleCafeIds` when that restriction is set.
- The promotion's `targetType`/`targetListingIds`/`targetCategoryIds` actually cover this specific `listingId` (for `CATEGORIES`, by resolving the listing's product's real `categoryId` from the database, exactly like `getPromotionsForListings` does).

A Coffee Owner therefore cannot fetch an arbitrary promotion ID, another supplier's promotion, or a promotion that doesn't actually apply to the product/variant they're viewing — every one of those cases 404s.

## 9. Confirmation that internal notes are not exposed

`CustomerPromotionDetail` (`shared/schema.ts`) is a hand-written, deliberately narrow type — it does **not** extend or `Omit<>` from `Promotion`, so there is no risk of a future field addition to `Promotion` silently leaking through. It contains only: `promotionId, name, type, description, discountValue, maximumDiscount, minimumOrderValue, minimumQuantity, buyQuantity, getQuantity, freeShippingMinAmount, giftInfo, stackable, startDate, endDate, categoryName, originalPrice, promotionalPrice`.

Verified absent from both the type and the storage method's returned object, by inspection of every field the `promotions` table has: `internalNotes` (never read or forwarded — confirmed by reading `getPromotionDetailForListing`'s full body), `eligibleCafeIds`, `targetListingIds`, `targetCategoryIds` (used only internally to compute the boolean `eligible`/`categoryName`, never returned raw), `usageCount`, `priority`, `supplierId`. `description` is the one field named `description` on the `promotions` table — the same "customer-visible description" field the Supplier's own promotion form labels "Description (visible par les clients)" (as opposed to the separate `internalNotes` field, labelled "Notes internes (non visibles par les clients)" on that same form) — confirming this is the correct, already-customer-facing field, not a mistaken alias for internal notes.

## 10. Tests actually executed, with their results

- `npx tsc --noEmit -p .` — **actually run, twice** (once after the pricing fix + initial modal wiring, once after a later accessibility tweak to the modal) — **passed both times, zero errors.**
- `npm run build` — **actually run, twice** (same two points) — **passed both times**: Vite client bundle and esbuild server bundle both built successfully (only the pre-existing, unrelated "chunk larger than 500 kB" advisory warning).
- Full read-through of the entire pricing call chain, end to end, file by file, as the method of verifying the fix and the "no double discount" claim (§2–§6) — this is **code-level reasoning / manual inspection**, not an executed runtime test.
- `git status` after all edits — **actually run** — confirmed the only files touched this task are the ones listed in §3, and no PRINT-domain file was touched.

**Automated tests added but not executed**: none. No test runner/framework invocation exists in this project for this kind of scenario (`package.json` has no `test` script, confirmed in a prior task this session), so no automated test suite was written for Scenarios 1–10; writing one without a way to execute it would not meet the "do not claim a test passed unless it was actually executed" rule, so none was fabricated.

**Tests that require a live database or browser — not executed, could not be executed in this environment** (no `DATABASE_URL`, no browser-automation tool, consistent with every prior task this session):
- Scenario 1 (single percentage promotion, qty 1): verified by formula trace only (§2, §4) — 12.000 DT × 20% = 2.400 DT discount, 9.600 DT final, matching the task's expected table exactly once the fix is applied; not run against a live cart/checkout.
- Scenario 2 (qty 3): verified by formula trace only — 36.000 DT subtotal, 7.200 DT discount, 28.800 DT final.
- Scenario 3 (no eligible promotion): verified by code inspection — `unitPrice: variant.price` is now unconditional regardless of whether `bestPricePromo` is null.
- Scenario 4 (expired/paused promotion): verified by code inspection — `isPromotionValid` in `promotions-engine.ts` (unchanged) already excludes `PAUSED`/`EXPIRED`/out-of-date-range promotions at order-creation time regardless of what the client last displayed.
- Scenario 5 (category eligibility): verified by code inspection — `getTargetedItems`/`getPromotionsForListings`/the new `getPromotionDetailForListing`'s category-matching logic is unchanged/newly-added-but-mirrored, not newly introduced logic needing a fresh audit.
- Scenario 6 (multiple/stackable promotions, priority): verified by code inspection of the unchanged `evaluateCartPromotions` stacking logic, now fed a correct input.
- Scenario 7 (usage limits): verified by code inspection — `maxUses`/`usageByPromo` logic unchanged.
- Scenario 8 (Promotion Details modal — clicking badges, correct data, no internal notes, close/return, multiple badges): verified by code inspection of the component/endpoint logic (§7–9) — not opened in an actual browser.
- Scenario 9 (security — manipulated cart prices/promotion IDs can't change the server total): verified by code inspection of `resolveOrderItems` and `getPromotionDetailForListing`'s eligibility re-validation (§6, §8) — not exercised with an actual forged request.
- Scenario 10 (regression — SHOP ordering, PRINT checkout, promotion management, unrelated product/cart functionality): verified by `git status`/diff review confirming the touched-file set (§3) contains no PRINT-domain file and no change to any existing method's body besides the single one-line fix — not exercised by actually placing orders of either kind.

## 11. Confirmation of SHOP and PRINT regression checks

**SHOP**: every file touched (§3) is SHOP-only or shared-but-additive:
- `product-detail-content.tsx` is the Shop/Pack marketplace's product detail component (confirmed it calls `useCart()`'s `addItem`, the SHOP cart action — never `addPrintItem`). Its only non-additive change is the single `unitPrice` line (§4); everything else added (modal state, badge `onClick`s) is new, optional-by-default behavior that does nothing until a promotion badge exists and is clicked.
- `shared/schema.ts`, `promotions.storage.ts`, `storage.ts`, `istorage.ts`, `shop-catalog.routes.ts` all received **additions only** — one new type, one new storage method, one new facade forwarding method, one new interface declaration, one new route. No existing method body, route handler, or type was edited.

**PRINT**: confirmed via `git status` that no file under any PRINT-related path (`print-*` routes/storage/pages/components) was touched. The shared pricing primitives PRINT could theoretically have in common with SHOP — `promotions-engine.ts`, `order.storage.ts`'s `resolveOrderItems`/`createOrder` — were **inspected, not modified** (§3); PRINT orders are handled by an entirely separate catalog/order path (`PrintCatalogItem`/print orders) that was never in this fix's call chain in the first place, confirmed by reading `resolveOrderItems`/`createOrder` end-to-end and finding no PRINT-specific branch there to begin with.

## 12. Remaining limitations

- All Scenario verification in §10 is code-level reasoning/manual trace, not an executed runtime test — this environment has no database connection and no browser-automation tool, a constraint that has applied to every task this session.
- The Promotion Details modal's `categoryName` field is populated only for `CATEGORIES`-targeted promotions; for `PRODUCTS`-targeted promotions, the modal does not enumerate the other specific products the promotion also applies to (a deliberate scope decision — enumerating a supplier's full target-listing list for every promotion a Coffee Owner views would expose more of the supplier's catalog/targeting strategy than the task's "customer-safe" and "do not expose internal supplier configuration" instructions call for; the Coffee Owner already knows the promotion applies to the product they're currently viewing, which is the information that matters at the point this modal is opened).
- `QUANTITY_TIER`-type promotions show the generic label "Tarification par palier" in the modal rather than a full tier breakdown table — the underlying `tiers` array was deliberately left out of `CustomerPromotionDetail` to keep the first implementation minimal and because no such promotion existed in the task's own worked example; adding a tier table is a straightforward follow-up if a QUANTITY_TIER promotion's full schedule needs to be customer-visible later.
- The pre-existing Discount Code preview request (`cart-page.tsx`'s `validateDiscountCode.mutate`, a separate mechanism from Promotions) also sends cart `unitPrice` as its subtotal input; it incidentally becomes correct as a side effect of this fix (the cart no longer holds a pre-discounted price) but was not itself audited beyond that observation, since Discount Codes are explicitly out of this task's scope ("a code the Coffee Owner types... Completely separate mechanism from Promotions").
