# Planification — Offer Acceptance, Refusal, and Delivery Details — Report

Implements the UX change on top of the existing Smart Driver Dispatch System (built in the previous task), reusing its offer lifecycle unchanged.

## Investigation findings (before any change)

- **Planification's existing cards never opened a modal at all** — only a `GO` button that navigated to `/driver/deliveries?focus=<id>`. The "existing delivery details modal" the task refers to is the shared `DeliveryDetails` component, already used (in its own `Dialog`) by `my-deliveries-page.tsx` and `driver-deliveries-page.tsx` — reused here via a new `Dialog` local to `planning.tsx`, not duplicated.
- **`useDeliveries()` (`getDeliveries(userId, 'DRIVER')`) strictly filters `driverId = userId`.** A delivery with only a pending or refused offer to this driver has no `driverId` yet, so it can **never** appear in that query. This confirmed that pending/refused offers must be merged into the page's lists on the client, not fetched as part of `useDeliveries()` — changing that shared, multi-role query's semantics was never necessary or attempted.
- **A real, pre-existing product-visibility gap was found and fixed.** The previous task's `getDriverPendingOffers` called the existing `getDelivery(id, 'DRIVER')` directly, which always includes the full `items` array (product names, images, variants) with no offer-state awareness at all. A driver with only a pending offer — never yet accepted — was already receiving complete product data in that endpoint's response. This is exactly the leak §7 describes; it has now been closed server-side.
- `DeliveryDetails` had no concept of hiding its "Products" card; `GET /api/deliveries/:id` and `GET /api/deliveries` (list) both already correctly reject/exclude a delivery the driver only has a pending offer for (`canUserAccessDelivery`'s `DRIVER` branch checks `row.driverId === userId`), so no second leak path existed elsewhere.

## Backend changes

`server/storage/domains/delivery.storage.ts`:
- New private `redactItemsForUnacceptedOffer(delivery)` — returns the delivery with `items: []`; nothing else touched. This is the actual, backend-level enforcement (§7: "not only by hiding the Products component in React").
- `getDriverPendingOffers` now applies that redaction to every delivery it returns.
- New `getDriverRefusedOffers(driverId)` — same shape, filtered to this driver's own `REFUSED` offers, same redaction applied (so even the historical "Annulée" summary never carries product data, though the UI doesn't render it there either).

`server/storage.ts`: one new facade delegate, `getDriverRefusedOffers`.

`server/routes/delivery.routes.ts`: one new route, `GET /api/driver/offers/refused` (`requireDriver`, session-only identity — no other identity source). No existing route, including `accept`/`refuse`, was modified — the offer lifecycle itself (acceptance, refusal, the automatic-dispatch retry trigger, expiration, the 90-second window, ranking) is completely unchanged, exactly as instructed.

## Frontend changes

- **`client/src/components/delivery/delivery-details.tsx`**: one new optional prop, `hideProducts?: boolean`. When true, the entire "Products" `Card` is skipped (not rendered against an empty/misleading array). Defaults to `false`/omitted for all 8 other existing callers of this shared component — confirmed via `grep`, none of them pass it, so none of them change.
- **`client/src/hooks/use-dispatch.ts`**: new `useDriverRefusedOffers()` hook. `useAcceptOffer`/`useRefuseOffer` changed from `onSuccess`-only to `onSettled` invalidation of the pending-offers (and, for refuse, refused-offers) query — so a failed accept/refuse (offer no longer pending) also refreshes the stale list, per §6.
- **`client/src/hooks/use-realtime.ts`**: the existing `SMART_DISPATCH_EVENTS` handler now also invalidates `/api/driver/offers/refused`.
- **`client/src/pages/driver/planning.tsx`** — the main change, described below.

## How pending, accepted, refused, and expired offers are displayed

Pending-offer deliveries (`useDriverPendingOffers()`) and this driver's refused-offer history (`useDriverRefusedOffers()`) are merged client-side into the exact same `today`/`upcoming`/`past` arrays the page already builds from `useDeliveries()`, tagged (`offerId`/`offerExpiresAt` or `refused`/`refusedAt`) rather than inferred from the delivery's real `status` (which, for a pending offer, is genuinely `'ACCEPTED'` — the same status several already-assigned flows elsewhere can have). The two offer-derived sources are structurally disjoint from `useDeliveries()`'s own result (a delivery can't have `driverId = me` and simultaneously have no `driverId` yet), so concatenation can never duplicate the same delivery — confirmed by reading `getDeliveries`'s `DRIVER` branch.

- **Pending** → rendered with the standard status badge **plus** an amber "Xs pour répondre" countdown badge, no `GO`, and **Accepter**/**Refuser** buttons instead (both the inline card pair and the identical pair reused inside the modal's `actions` slot — no second implementation).
- **Accepted** → the same merged-list mechanism naturally reflects this: once `acceptDriverOffer` succeeds, the offer leaves `PENDING` (removed from `pendingOffers`) and the delivery now has `driverId` set (appears in `useDeliveries()`) — the card re-renders as a normal assigned card with `GO`, with no special-case code needed for the transition itself.
- **Refused** → removed from the active lists (the offer is no longer `PENDING`) and, via the new endpoint, appears in **Anciennes** as a fixed **"Annulée"** label — never the delivery's own real status, and the card is explicitly non-clickable (`cursor-default`, no `onClick`), with no `GO`/Accepter/Refuser.
- **Expired** → removed from `pendingOffers` the same way as an accepted/refused one (status leaves `PENDING`); no card is kept for it on this page (the task did not ask for an expired-history card, only a refused one) — the existing automatic-retry chain (unchanged) immediately tries the next eligible driver.

## How product visibility is enforced

Server-side, unconditionally: `getDriverPendingOffers`/`getDriverRefusedOffers` never return real `items` for a not-yet-accepted offer — confirmed by reading the exact code path, not inferred. The frontend's `hideProducts` prop is a second, UI-level safeguard (skips the section even if it somehow received a non-empty array), never the actual boundary. No alternative endpoint or field exposes product data for a pending offer — the two other existing read paths that could have (`GET /api/deliveries/:id`, `GET /api/deliveries`) already reject/exclude a delivery the driver isn't yet assigned to, confirmed by re-reading `canUserAccessDelivery` and `getDeliveries`.

## How refused offers are represented without globally cancelling deliveries

`refuseDriverOffer` (unchanged from the previous task) only ever updates the **offer** row's own status to `REFUSED` via a conditional `UPDATE ... WHERE status='PENDING'`; it never touches `deliveries.status`. The delivery itself stays `ACCEPTED` and automatic dispatch (also unchanged) immediately retries with the next eligible driver, excluding every driver who has ever had any offer for this exact delivery (confirmed in `dispatchNextOffer`'s own exclusion query — pre-existing, reused as-is). `getDriverRefusedOffers` reads only this driver's own offer row; it never reinterprets or displays the delivery's real, current, independently-evolving status — the "Annulée" label is hardcoded at render time specifically for `refused` items, never derived from `DELIVERY_STATUS_META[d.status]`.

## How GO navigation works

Entirely unchanged: `navigate('/driver/deliveries?focus=' + id)`, still only shown for a delivery that is both actually assigned (`offerId == null`) and not yet `DELIVERED`/`CANCELLED` — now wrapped in `e.stopPropagation()` since the card itself became clickable in this task (so clicking `GO` doesn't also open the new modal underneath it).

## Files modified

`server/storage/domains/delivery.storage.ts`, `server/storage.ts`, `server/routes/delivery.routes.ts`, `client/src/components/delivery/delivery-details.tsx`, `client/src/hooks/use-dispatch.ts`, `client/src/hooks/use-realtime.ts`, `client/src/pages/driver/planning.tsx`.

## TypeScript / build results

- `npx tsc --noEmit` — clean on the first try after every edit (schema/storage, routes, hooks, `delivery-details.tsx`, and the full `planning.tsx` rewrite each checked separately).
- `npm run build` — succeeded (client: 2857 modules; server bundle built).
- No automated test suite exists in this repository; none could be run.

## Tests executed and their actual results

All verified by **static code reading** — tracing the exact logic by hand — not by running the application, since no database connection or browser-automation tool is available in this environment:

1. **Pending offer**: traced — card renders with the countdown badge, no `GO` (gated by `offerId != null`), Accepter/Refuser shown; clicking the card (not the buttons, which stop propagation) sets `viewTargetId`, opening the modal with `hideProducts={true}` → confirmed the Products `Card` is skipped entirely in `delivery-details.tsx`.
2/3. **Accept from card / from modal**: traced — `useAcceptOffer`'s `onSettled` invalidates `/api/driver/offers/pending` and `/api/deliveries`; on the next render, `pendingItems` loses the entry and `deliveries` gains it (same `id`), so the merged list's item for that `id` switches from the offer-tagged shape to the real assigned shape automatically — the modal's `viewTarget` lookup (`active.find(d => d.id === viewTargetId)`) re-resolves against the same live array without being closed, so it updates in place; `hideProducts` becomes `false` and `actions` becomes `undefined` (no buttons) once `offerId` is gone.
4/5. **Refuse from card / from modal**: traced — `refuseDriverOffer`'s CAS (unchanged) flips the offer; the merged item disappears from `active` (no longer `PENDING`) and the next render of `past` includes it via `useDriverRefusedOffers()`; the modal's `onRefused` callback explicitly closes it (`setViewTargetId(null)`), since its target would otherwise resolve to nothing.
6. **Another eligible driver**: traced — `dispatchNextOffer`'s existing exclusion-by-prior-offer logic (unchanged) guarantees the refusing driver is never offered this delivery again; the new driver's own `useDriverPendingOffers()` is a separate, `driverId`-scoped query, so the first driver's refused-history entry is never touched by the second driver's actions.
7. **Expired offer**: traced — the on-card/in-modal buttons disable once the local countdown reaches 0; `acceptDriverOffer`/`refuseDriverOffer` independently re-check `expiresAt` / `status='PENDING'` server-side regardless of the frontend's clock, so a stale click can never succeed even inside the up-to-15-second window before the background worker's own sweep physically flips the row.
8. **Existing assigned delivery**: traced — `offerId` is `undefined` for every `useDeliveries()`-sourced item, so `GO` renders and `hideProducts`/`actions` are both inert; the Products card renders exactly as it did before this task.
9. **Supplier-mode delivery**: traced — `pendingOffers`/`refusedOffers` only ever originate from `deliveryDriverOffers`, which automatic dispatch only ever writes to for `DELIVERY_COMPANY`-mode deliveries (`dispatchNextOffer`'s own `deliveryMode !== 'DELIVERY_COMPANY'` guard, unchanged) — a Supplier-mode assignment never produces a row there, so a Supplier-mode delivery can only ever appear on this page as a normal assigned card, unaffected by any of this task's logic.
10. **Security**: traced — `acceptDriverOffer`/`refuseDriverOffer` (unchanged) both check `offer.driverId` against the session-derived driver id before acting, and the new `getDriverRefusedOffers`/updated `getDriverPendingOffers` are both scoped by `req.driver.id` from `requireDriver` only. Product-leak check: see "How product visibility is enforced" above — traced, not executed.

**None of the above were executed in a real browser or against a real database** — no browser-automation tool and no `DATABASE_URL` are available in this environment (the schema change from the previous task has also still not been applied to any database, so this feature cannot actually run end-to-end yet regardless). Every result above is a code-level trace, not an observed outcome, and is reported as such rather than claimed as tested.

## Remaining limitations

1. No live-database or live-browser verification of any of the 10 scenarios — all are code-reading traces.
2. The underlying schema migration (`deliveryDriverOffers`, `driverProfiles.acceptingNewOffers`) still has not been applied to any database (same limitation carried over from the previous task) — this feature cannot run at all until `npm run db:push` is executed against a real database.
3. No automated test suite exists in this repository.
4. Each pending-offer card/modal runs its own local per-second countdown tick (one in the badge, one in the action buttons) rather than a single shared timer — a minor, side-effect-free duplication (no network calls), not fixed since it doesn't violate any stated requirement and simplifying it further would add complexity for no behavioral difference.
5. "Active delivery card" click-to-open-modal was scoped to the `today`/`upcoming` tabs only, leaving normal (non-refused) `Anciennes` cards exactly as non-clickable as they already were — the task's wording did not ask for that to change, and this was a deliberate, minimal-scope choice rather than an oversight.
