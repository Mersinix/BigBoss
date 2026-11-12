# Coffee Owner Checkout — Realtime Promotion Recalculation — Report

## 1. Root cause of the stale discount

`client/src/components/cafe/order-confirmation-modal.tsx` (the "Récapitulatif de commande" modal) maintains its own **independent local draft** of the cart — `localItems`/`localPackItems`, deep-cloned from the `items`/`packItems` props the moment the modal opens (`structuredClone`, so it never shares references with the real Cart). Editing or removing a line inside the modal (`updateItemQty`, `removeItem`, the pack "Supprimer"/"Edit" buttons) **only ever mutates this local draft** — by design, so the Coffee Owner can adjust their order right up to confirmation without touching the real Cart if they cancel.

The bug: `promoEval` — the value driving the displayed `discount` and therefore `grandTotal` — was received as a **prop**, computed by the parent (`cart-page.tsx`) via `usePromotionEvaluation(orderableItems)`, where `orderableItems` reads the **live Cart store**, not this modal's local draft. Removing RAMI inside the modal updated `localItems` (so `itemsTotal` correctly dropped to 9.000 DT) but did nothing to the Cart store itself, so `orderableItems` — and therefore the `promoEval` prop — never changed. The modal kept displaying the discount computed from the *original* 93.000 DT cart (84.000 RAMI + 9.000 Sport Live IPTV) against a subtotal that had since shrunk to 9.000 DT, producing `Math.max(0, 9.000 - 18.600 - 0) = 0.000 DT` — exactly the reported symptom.

This is **not** a missing React Query invalidation (the task's own caution was correct) — `usePromotionEvaluation`'s query key already changes whenever its input items change, and a straightforward `invalidateQueries` call would have done nothing here, because the query powering the stale display was never re-run with the right input in the first place: it was keyed off a value (the live Cart) that this screen doesn't mutate. The real defect is architectural: **the modal's draft and its pricing calculation read from two different sources of truth.**

The order-creation step itself was never affected — `createOrder`'s backend-authoritative recalculation (confirmed in a prior task this session) already uses `opts.modifiedItems`, i.e. the *actual submitted draft*, which is why "what currently happens after confirmation" in the bug report was already correct. The task's own framing ("make the calculation consistent before confirmation as well, not merely after") is exactly the gap this fix closes.

## 2. Files and components inspected

- `client/src/components/cafe/order-confirmation-modal.tsx` — the Récapitulatif de commande modal itself; read in full, including its draft-cloning `useEffect`, item/pack editing handlers, totals computation, and the pre-checkout delivery-fee estimate (confirmed this estimate was **already** correctly built from `localItems`/`localPackItems`, i.e. already draft-aware — not part of the bug).
- `client/src/pages/cafe/cart-page.tsx` — the Cart page: confirmed its own `usePromotionEvaluation(orderableItems)` call and totals display are reactive to the live Cart store and were **not** stale (the task's own Part 1 statement — "the promotion calculation displayed at this stage is currently considered correct" — was verified true by reading the code, not just taken on faith); confirmed how it builds and passes props into the confirmation modal; confirmed `handleConfirmOrder`'s request-building logic already uses `opts.modifiedItems`/`opts.modifiedPackItems` (the draft) for the actual order submission, and already guards the discount-code field with a "is this code's supplier still present in the submitted draft" check.
- `client/src/hooks/use-promotion-evaluation.ts` — the shared promotion-evaluation hook (`usePromotionEvaluation`), including its `itemsOverride` parameter (already existed, designed for exactly this kind of "evaluate against a specific item list" need) and its query-key construction (`cartItems.map(i => \`${i.listingId}:${i.quantity}\`).sort().join(",")`), and its existing fail-safe behavior (`evaluatePromotions` returns a zero-discount result on any HTTP failure rather than throwing — confirmed this already "fails closed," never silently retaining a stale number on error).
- `client/src/hooks/use-discount-codes.ts` — the Discount Codes feature's `useValidateDiscountCode` (a `useMutation`, imperative, used by the Cart page's own "Appliquer" button) and `ValidateItem` shape; confirmed this mutation result (`appliedDiscountCode.discountAmount`) is a **flat value captured once** and suffers the identical staleness class as `promoEval` did, just for a different mechanism.
- `server/routes/shop-catalog.routes.ts` — `POST /api/discount-codes/validate` (the preview/validation endpoint reused by this fix) and `POST /api/orders` (order creation): confirmed the order-creation route's discount-code re-validation (`storage.validateDiscountCode(discountCode, found.supplierId, supplierSubtotal)`) already computes `supplierSubtotal` from `itemsBySupplier`, itself built from `validatedItems` — the server-authoritative, re-resolved items derived from the *actual request body* (`opts.modifiedItems`), never from a client-trusted amount.
- `server/storage/domains/order.storage.ts` — `resolveOrderItems`/`createOrder`: re-confirmed (no change) that these already ignore any client-submitted price/discount and recompute everything from trusted database prices and the server's own promotion/discount-code re-evaluation, exactly as established in the prior two tasks.
- `client/src/components/cafe/print-order-confirmation-modal.tsx` — confirmed this is a **separate, unrelated component** (PRINT's own confirmation modal), not a caller of the SHOP `OrderConfirmationModal`, and was not touched.

## 3. Files modified

- `client/src/components/cafe/order-confirmation-modal.tsx` — the core fix (§5/§6 below).
- `client/src/pages/cafe/cart-page.tsx` — updated the one call site to match the modal's new, smaller prop surface (§5).

No other file was touched for this task. No backend route, no storage method, no schema — this was a pure frontend data-flow fix; the backend was already correct (§8) and needed no change.

## 4. Existing pricing and promotion services reused

No new pricing logic, calculation, or backend endpoint was introduced.

- **Automatic promotions**: the modal now calls the exact same `usePromotionEvaluation` hook the Cart page itself calls, against `POST /api/promotions/evaluate` — the same single, centralized evaluation function (`server/promotions-engine.ts`'s `evaluateCartPromotions`) audited and fixed in the two prior tasks this session (double-discount correction, minimum-order-value gate). Nothing about that engine or its eligibility rules was touched.
- **Discount Codes**: the modal now calls the exact same `POST /api/discount-codes/validate` preview endpoint the Cart page's "Appliquer" button already calls — just via a reactive `useQuery` (keyed off the draft) instead of the Cart page's imperative `useMutation` (a deliberate, user-triggered action there), since this is a different kind of call site (automatic, re-run on every draft change) that needs the same reactive-query shape `usePromotionEvaluation` already models. No new server code — the request/response shape is unchanged.
- **Delivery fee estimate**: confirmed already reusing the existing `POST /api/orders/estimate-delivery` endpoint against the live draft; untouched.

## 5. How cart changes trigger recalculation

`OrderConfirmationModal` no longer receives `promoEval`/`discountCodeAmount`/`discountCodeLabel` as props. Instead:

```ts
const { evaluation: promoEval, isLoading: isPromoRecalculating } = usePromotionEvaluation(localItems);
```

`usePromotionEvaluation`'s query key is derived from the items passed to it (`listingId:quantity` pairs). Every call to `updateItemQty`/`removeItem` (or the pack equivalents) updates `localItems`/`localPackItems` via `setState`, which on the next render produces a different query key, which TanStack Query treats as a query that needs (re)fetching — automatically, with no manual `invalidateQueries` call, no `useEffect`, and no page refresh. This is the same mechanism the Cart page itself already relies on for its own, already-correct display (§2) — just pointed at this modal's draft instead of the live Cart.

For the Discount Code (a separate mechanism — see `shared/schema.ts`'s `discountCodes` note), the same pattern is reproduced with a small, scoped `useQuery` inside the modal:

```ts
const discountCodeItems = discountCode
  ? localItems.filter(i => i.supplierId === discountCode.supplierId).map(i => ({ supplierId, quantity, unitPrice }))
  : [];
const discountCodeQueryKey = ["/api/discount-codes/validate", discountCode?.code ?? null, discountCodeItems.map(...).sort().join(",")];
const { data: discountCodeResult, isLoading: isDiscountCodeRecalculating, isError: discountCodeFailed } = useQuery({ queryKey: discountCodeQueryKey, ... enabled: !!discountCode && discountCodeItems.length > 0 });
```

`discountCode` is now passed down from `cart-page.tsx` as `{ code, supplierId } | null` — identifying information only, never a pre-computed amount. If the code's supplier's items are fully removed from the draft, `discountCodeItems.length === 0` and the amount is immediately `0` with no network request at all; if only partially reduced, the query re-fires with the new subtotal and the server's own `minimumOrderAmount`/usage-limit rules decide the result, exactly reproducing the automatic-promotion fix for this second mechanism. The task explicitly lists "Applying a promotional code… Removing a promotional code" among the triggers that must recalculate (Part 4) and requires all four pricing stages to agree (Part 9, Test G) — this closes that gap for Discount Codes too, not just automatic Promotions, using the same reactive pattern rather than a second one.

Delivery-fee estimation was already built from `localItems`/`localPackItems` before this task and needed no change (§2).

## 6. How Récapitulatif de commande receives the latest pricing

By construction: `discount`, `discountCodeAmount`, `itemsTotal`, `packsTotal`, and `grandTotal` are now all plain `const`s computed on every render directly from `localItems`/`localPackItems` and the two reactive queries above — there is no cached/frozen snapshot anywhere in this component. Opening the modal seeds the draft once (unchanged `useEffect`, §2); from that point on, every value shown in the sticky footer is re-derived from whatever `localItems`/`localPackItems` currently hold, on every single render, with the two queries keeping `promoEval`/`discountCodeResult` in sync with that draft automatically. The Coffee Owner never needs to close and reopen the modal, navigate away, or refresh the page — editing the draft directly produces the next render's correct totals.

The **Confirm** button now reads `isRecalculating = isPromoRecalculating || isDiscountCodeRecalculating` and is disabled while either query is in flight (`disabled={isEmpty || isSubmitting || isRecalculating}`), its label changes to "Recalcul en cours…", and the total shows a small spinner with a "Recalcul des promotions en cours…" caption underneath — satisfying the task's explicit "prevent confirmation using stale values… show an appropriate loading state without unnecessarily blocking unrelated interactions" (every other control — quantity steppers, delivery/payment/priority/scheduling selectors — remains fully interactive while this is shown; only the Confirm action is gated). On the very first open, this is typically invisible: `localItems` is cloned from the same item set the Cart page already evaluated, so `usePromotionEvaluation(localItems)`'s query key matches a cache entry TanStack Query already has warm from the Cart page's own call — no loading flicker for the common case of opening the modal without having edited anything yet.

If the discount-code re-validation request itself fails (network/server error, not just "code no longer valid" — which is a normal `valid:false` response, not a thrown error), `discountCodeFailed` is `true` and a small red "Impossible de revalider le code promo. Réessayez." line appears under the totals, and `discountCodeAmount` is treated as `0` for that render (never silently keeping whatever was last displayed) — satisfying "if a recalculation fails, do not silently retain a potentially incorrect discount or total."

## 7. How asynchronous stale responses are prevented

No manual request-cancellation, version counter, or AbortController was introduced — the existing TanStack Query architecture already provides this guarantee by construction, once the query key is correctly derived from the current draft (which it now is, for both queries): each distinct cart/draft state maps to its own cache key. If the Coffee Owner removes RAMI (key A) and then, before that response lands, changes Sport Live IPTV's quantity (key B), the component is now subscribed to key B's cache entry — key A's in-flight response, whenever it resolves, writes into key A's cache slot, which nothing currently reads. The displayed value is always "whatever the currently-active key's cache holds," never "whichever response happened to arrive last" — this is exactly the race the task describes, and it cannot occur with this key-per-state design. One minor, acknowledged inefficiency (not a correctness issue): the superseded request for key A is not actively aborted mid-flight, so it still completes over the network even though nothing uses its result — flagged in §11 as a limitation, not fixed, since fixing it would mean wiring `AbortSignal` support into `evaluatePromotions`/the new discount-code `queryFn`, a larger change than this task's reproduced bug required.

## 8. How backend confirmation validates the final amount

No backend change was needed or made. Re-confirmed from this and the two prior tasks' audits:
- `resolveOrderItems` (`server/storage/domains/order.storage.ts`) re-fetches every item's real price from `supplierProductListings`/`supplierProductVariants` and never reads a client-submitted `unitPrice`.
- `POST /api/orders` re-evaluates automatic promotions via `storage.evaluateCartPromotions`, using the server-resolved items (not the frontend's), and re-validates any discount code via `storage.validateDiscountCode` using a `supplierSubtotal` computed the same server-authoritative way.
- `createOrder` computes `totalAmount`/`subOrders.subtotal`/`discountAmount` purely from these server-side values; a manipulated or stale frontend total/discount cannot influence the persisted order.

This fix only changes what the Coffee Owner **sees** before clicking Confirm, so that it already matches what the backend is about to compute — it does not and did not need to touch the backend's own, already-independent authority over the final amount.

## 9. Confirmation that the previous promotion fixes remain intact

- **Double-discount correction** (cart stores the original, undiscounted `unitPrice`; the discount is applied exactly once by the shared engine): untouched. `localItems` is a `structuredClone` of the same `CartItem[]` the Cart page already holds, which already carries the original price per that fix — nothing in this task writes a discounted price into any item, draft or otherwise.
- **Minimum-order-value eligibility gate** (added to `calcDiscount` in `server/promotions-engine.ts`): untouched — and this fix is precisely what makes the *now-correctly-triggered* re-evaluation in the modal produce the right answer for Test B (a 9.000 DT draft correctly fails a 10.000+ DT minimum and shows `0.000 DT` discount, if that was the promotion's condition) rather than merely refreshing a stale calculation that would otherwise have been wrong in a different way.
- **Promotion Details modal / theming / realtime supplier-update propagation**: untouched; none of those files were modified by this task.

## 10. Confirmation that PRINT was not affected

Confirmed by `git status` after all edits: the only two files touched this task are `client/src/components/cafe/order-confirmation-modal.tsx` and `client/src/pages/cafe/cart-page.tsx`. `client/src/components/cafe/print-order-confirmation-modal.tsx` — PRINT's own, separate confirmation modal — was inspected (§2) to confirm it is not a caller of the SHOP modal and shares no code path with it, and was not edited. No PRINT route, storage method, or pricing/promotion logic of any kind was touched.

## 11. Regression test results

**Actually executed and passed**:
- `npx tsc --noEmit -p .` — run after every meaningful edit — zero errors every time.
- `npm run build` — run after every meaningful edit — Vite client + esbuild server both built successfully every time (only the pre-existing, unrelated "chunk larger than 500 kB" advisory).
- `git status` after all edits — confirmed the touched-file set (§3/§10) contains no PRINT file and nothing beyond the two files this fix required.
- Grep-based confirmation that no other component imports/uses the removed `promoEval`/`discountCodeAmount`/`discountCodeLabel` props of `OrderConfirmationModal`, and that `CartPromotionEvaluation` is no longer imported in that file (dead import check).

**Automated tests added but not executed**: none — this project has no test runner configured (confirmed in prior tasks this session), so no automated suite was written for the 10 scenarios (Tests A–J) in Part 9; this report does not claim any of them "passed" in the sense of an executed test run.

**Code-level verification only** (traced through the actual code and TanStack Query's documented key-based caching semantics, not executed against a live system):
- **Test A** (original cart, no edits): on open, `localItems` matches the exact item set the Cart page's own `usePromotionEvaluation(orderableItems)` call already evaluated — same query key, same cached result, so the modal's initial numbers are identical to the Cart page's, as required.
- **Test B** (remove all RAMI): traced that `removeItem` updates `localItems`, which changes `usePromotionEvaluation`'s query key, triggering a fresh `POST /api/promotions/evaluate` call against only `[Sport Live IPTV]`; per the already-fixed engine, if the promotion's minimum order value is not met by that reduced subtotal, `totalDiscount` becomes `0`, so `discount`, the "Réduction" line, and `grandTotal` all correctly reflect `9.000 DT` rather than the previous `0.000 DT`.
- **Tests C/D** (partial quantity reduction/repeated changes): same mechanism — each new `(listingId, quantity)` composition is a distinct query key, always re-evaluated from the latest state, with no manual action required.
- **Test E** (clear the cart entirely): `localItems`/`localPackItems` become empty arrays; `usePromotionEvaluation`'s own `enabled: cartItems.length > 0` guard means no request is made and `evaluation` falls back to its zero-value default (`totalDiscount: 0`), so `discount`/`discountCodeAmount` (also correctly `0`, since `discountCodeItems` would be empty too) /`grandTotal` are all `0.000 DT`, and `isEmpty` correctly disables confirmation.
- **Test F** (all the individual eligibility conditions — min order/quantity, category/product targeting, dates, status, caps, usage limits, priority, cumulability): none of this logic was touched; it is the same shared engine already covered by the prior two tasks' own test traces, now simply reachable with correct, non-stale input from this modal too.
- **Test G** (4-way consistency: Cart / Récapitulatif / backend / saved order): traced that all four now read from the same chain — Cart page's live state → modal's `localItems` draft (seeded from that same state, editable independently) → `POST /api/orders`'s `opts.modifiedItems` (exactly the draft) → `resolveOrderItems`/`createOrder`'s server-authoritative recomputation from that draft. No stage trusts a value computed by an earlier stage against *different* items.
- **Test H** (async race — rapid edits while a request is pending): verified via TanStack Query's documented per-query-key caching behavior (§7) that an older key's in-flight response cannot overwrite the currently-displayed (newer-key) result.
- **Test I** (previous fixes regression): confirmed by reading the unchanged engine/cart-item code (§9).
- **Test J** (PRINT regression): confirmed by the touched-file list (§10) containing no PRINT file.

**Tests that require a live database or browser — not executed, could not be executed in this environment** (no `DATABASE_URL`, no browser-automation tool — the same constraint noted in every task this session): actually opening the Cart with the RAMI/Sport Live IPTV scenario in a running app, removing RAMI inside the open Récapitulatif modal, and visually confirming the discount/total update without a refresh; exercising Tests C–H interactively; confirming the loading spinner/disabled Confirm button renders as described; confirming the discount-code error message renders on an actual network failure; placing a real order and comparing its saved `subOrders.subtotal`/`discountAmount`/`orders.totalAmount` against what the modal displayed immediately before confirming.

## 12. Remaining limitations

- As noted in §7, a superseded pricing request is not actively cancelled mid-flight — it still completes over the network even though its result is never displayed; this is a minor efficiency gap, not a correctness one, and was not fixed to avoid introducing `AbortController` plumbing beyond what this bug required.
- As noted in §5, opening the modal with an already-applied Discount Code will trigger one fresh `POST /api/discount-codes/validate` request (since the Cart page's own "Appliquer" flow is a one-off mutation with no warm query cache for this modal to reuse) — a brief, one-time loading state the very first time the modal opens in that situation, not on every subsequent edit.
- A pre-existing backend behavior, not introduced or changed by this task: if a Coffee Owner's edit inside this modal makes an already-applied Discount Code newly ineligible (e.g. reduces that supplier's subtotal below the code's own minimum, while that supplier still has *some* items in the draft), the modal now correctly displays `0.000 DT` for the code before confirmation — but `POST /api/orders` still rejects the whole order with "Code promo invalide" rather than silently dropping just the code and proceeding, because the existing route logic in `server/routes/orders.routes.ts` treats any explicitly-submitted, now-invalid code as a hard failure. This is unchanged pre-existing behavior (confirmed by reading that route), now more likely to surprise a Coffee Owner than before, since the frontend correctly shows no discount beforehand. Flagged here for visibility as a candidate follow-up; not fixed in this task, since changing order-creation's rejection behavior for an edge case outside this task's reproduced bug was judged to be scope creep beyond "fix the stale discount in the order summary."
- All of §11's "requires a live database or browser" items remain unverified beyond code-level tracing, for the environmental reason stated there.
