# Delivery Company Avis — Missing Coffee-Owner Driver Reviews — Gap Audit (Phase 1)

Audit only. No application code was modified to produce this report.

## 1. Coffee Owner driver-review submission

`POST /api/driver/reviews` (`server/routes/delivery.routes.ts:1261`), requires `role === 'CAFE_OWNER' && status === 'approved'`. Body: `{ driverId, deliveryId, rating, comment? }`. Server validates `delivery.cafeId === user.id`, `delivery.driverId === body.driverId`, and `delivery.status === 'DELIVERED'` before writing. Writes via `storage.upsertDriverReview({ ...body, cafeId: user.id, cafeName: user.name, cafeOwnerName: user.name })` → `reviews.storage.ts:738` → inserts into `supplierProductReviews` with `reviewType: 'DRIVER'`, `driverId`, `deliveryId`, `cafeId` = **the Cafe Owner's own user id** (the genuine, original meaning of this column — not reused for a different role, unlike the `DELIVERY_COMPANY` type), `cafeName`/`cafeOwnerName` both set to the Cafe Owner's name.

## 2. Driver's own retrieval of these reviews

`GET /api/driver/reviews/:driverId` (`delivery.routes.ts:1247`) — **public, no auth**, calls `storage.getDriverReviews(driverId)` → `reviews.storage.ts:703`: `SELECT * FROM supplierProductReviews WHERE driverId = :id AND reviewType = 'DRIVER'`. Consumed by `client/src/pages/driver/reviews.tsx` via `useDriverReviews(user.id)` (`use-delivery-ecosystem.ts:617`), typed as `DriverReview = { id, driverId, deliveryId, cafeId, rating, comment, cafeName, cafeOwnerName, createdAt }`. The page displays `review.cafeName` as the primary name and `review.cafeOwnerName` as a secondary byline (in practice identical strings today, since the submission route sets both to the same value) — confirming `cafeName` is the field to treat as "the reviewer's display name" for consistency with this existing page.

## 3. `supplierProductReviews` — `DRIVER` records, confirmed shape

Re-confirms the earlier audit's table (`DELIVERY_DRIVER_REVIEWS_AUDIT.md §3`): for `reviewType = 'DRIVER'`, `driverId` is the reviewed driver (set directly, no join needed to know who was reviewed), `deliveryId` links to the underlying delivery, and `cafeId`/`cafeName`/`cafeOwnerName` identify the **Cafe Owner** reviewer — a different reviewer entirely from the `DELIVERY_COMPANY` type's Supplier reviewer. This is the root cause: the previous task's endpoint (`getDeliveryCompanyDriverReviews`) deliberately queries only `reviewType = 'DELIVERY_COMPANY'`, by design (per the original audit's explicit recommendation not to conflate the two reviewer audiences) — so every `DRIVER`-type review is, correctly by that design, absent from the Delivery Company's Avis page. The gap is real, but it is not a bug in the existing code; it is a feature genuinely not yet built. This task adds it as its own, clearly separated section rather than changing the previous one.

## 4. `deliveryId`/`driverId` ↔ `deliveries` relationship — re-confirmed

- `supplierProductReviews.deliveryId` → `deliveries.id` (1:1 per review).
- `supplierProductReviews.driverId` (DRIVER type) is written at submission time from `body.driverId`, which the route already validated equals `delivery.driverId` for that same delivery — so for every existing `DRIVER` review, `review.driverId === delivery.driverId` by construction. No cross-check is strictly required to trust it, but the implementation below re-derives `driverId` from the `deliveries` row anyway (not from the review row) for the exact same reason the previous task did for the `DELIVERY_COMPANY` type: the delivery row is the historically-frozen source of truth, and never trusting a value that merely happens to usually agree is the safer habit to keep.
- `deliveries.deliveryCompanyId` is set once, when a Delivery Company accepts the delivery (`deliveryMode = 'DELIVERY_COMPANY'` only), and — re-confirmed again in this audit by re-reading `reassignDriver` (`server/storage/domains/delivery.storage.ts:746`) — both `deliveries.driverId` and `deliveries.deliveryCompanyId` are frozen the moment a delivery leaves `ASSIGNED` status. A review can only be submitted for a `DELIVERED` delivery (enforced server-side on write, both review types). **Therefore `deliveries.deliveryCompanyId` at read time is exactly what it was when the delivery was performed — the correct historical-ownership source, independent of `users.deliveryCompanyId` (the driver's current membership), exactly as the task requires.**

## 5. Current Delivery Company Avis endpoint/frontend

`GET /api/delivery-company/driver-reviews` (`delivery.routes.ts:758`, `requireApprovedDeliveryCompany`) → `getDeliveryCompanyDriverReviews` (`reviews.storage.ts:373`) → reviews where `reviewType = 'DELIVERY_COMPANY' AND deliveryCompanyUserId = :id`, enriched with the performing driver via `deliveries`. Rendered by `client/src/pages/delivery/reviews-page.tsx` as a single dashboard (summary/filters/cards/pagination). **Confirmed: this code path never references `reviewType = 'DRIVER'` anywhere** — the gap reported is real and exactly as described.

## 6. What must be added

A second, independent data path and a second, independent UI section:

1. **New storage method**, scoped the opposite direction from the existing one (to avoid scanning the global `DRIVER` review population instead of just this company's own): first fetch this company's own deliveries (`WHERE deliveries.deliveryCompanyId = :id`), **not** a driver roster lookup (`users.deliveryCompanyId`) — then fetch `DRIVER`-type reviews whose `deliveryId` is among those, so the query is bounded by the company's own delivery volume, never by the platform-wide review table, and never by a driver's *current* company.
2. **New endpoint**, same `requireApprovedDeliveryCompany` gate, same "never accept a client-supplied id" rule as the existing endpoint.
3. **New, separate frontend section** (a tab, per the task's explicit instruction not to merge the two populations into one average) reusing the exact same summary/filter/pagination shapes already built for the company-level section, parametrized rather than duplicated outright, with its own two entity filters (Café / Chauffeur) instead of the company section's one (Fournisseur).

No schema change is needed — every column required already exists and was already used by one of the two existing review flows.

## Recommendation

Implement Phase 2 exactly as scoped above: a new `getDriverReviewsForDeliveryCompany(deliveryCompanyUserId)` storage method and a new `GET /api/delivery-company/driver-performance-reviews` endpoint (distinct path from the existing `driver-reviews` endpoint, which stays untouched), and a two-tab rewrite of `reviews-page.tsx` ("Avis sur l'entreprise" / "Avis sur les chauffeurs") built on one shared, parametrized internal section component so the two tabs don't duplicate ~200 lines of summary/filter/pagination logic twice. The driver's own `GET /api/driver/reviews/:driverId` page and the Coffee Owner's submission flow are not touched.
