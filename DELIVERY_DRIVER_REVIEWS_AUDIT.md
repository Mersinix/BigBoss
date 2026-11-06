# Delivery Company — Driver Reviews & Performance Dashboard — Audit (Phase 1)

Audit only. No application code was modified to produce this report.

## 1. Existing Avis page

`client/src/pages/delivery/reviews-page.tsx` (`DeliveryCompanyReviewsPage`), rendered as the "Avis" sub-tab inside `client/src/pages/delivery/communication.tsx`'s `SubTabSwitcher`, itself routed at `/delivery/communication` (`DeliveryCommunication`, role `DELIVERY_COMPANY`, approved-only).

Current behavior: fetches `useDeliveryCompanyReviews(user.id)` (one network call, no pagination params), computes `average`/`count` client-side over the **full unfiltered** list, applies a single existing date filter (`DateRangeFilter`/`resolveDateRange`) client-side, and paginates the already-filtered array client-side via `usePagination`. Each row shows: reviewer name (`review.cafeName || "Fournisseur"`), star rating, comment (only if present), `Livraison #{deliveryId}` + formatted date. **No driver identity is shown or available anywhere on this page today.**

## 2. Existing supplier review submission flow

`POST /api/delivery-company/reviews` (`server/routes/delivery.routes.ts:753`), gated by `requireApprovedSupplier`. Body: `{ deliveryCompanyUserId, deliveryId, rating, comment? }`. Server validates `delivery.supplierId === session user` and `delivery.deliveryCompanyId === body.deliveryCompanyUserId` and `delivery.status === 'DELIVERED'` before writing — so a Supplier can only review a delivery company that actually handled one of *their own* completed deliveries. Writes via `storage.upsertDeliveryCompanyReview` → `reviews.storage.ts:351`.

## 3. Database structure — review tables

**`supplierProductReviews`** (`shared/schema.ts:1568`) is the single shared review table for every reviewable entity in the app, discriminated by `reviewType`. Two rows of this table are relevant here, and **they are not the same thing**:

| | `reviewType = 'DELIVERY_COMPANY'` | `reviewType = 'DRIVER'` |
|---|---|---|
| Reviewed entity | The delivery company, via `deliveryCompanyUserId` | An individual driver, via `driverId` |
| **Reviewer** | **The Supplier** who dispatched the order (`cafeId`/`cafeName` columns are *reused* to hold the Supplier's identity — see the schema's own comment at line 1586) | **The Cafe Owner** (end customer) who received the order (`cafeId` genuinely means "the Cafe Owner" here, the column's original meaning) |
| Link to delivery | `deliveryId` | `deliveryId` |
| Submission route | `POST /api/delivery-company/reviews`, `requireApprovedSupplier` | `POST /api/driver/reviews`, requires `role === 'CAFE_OWNER'` (`server/routes/delivery.routes.ts:1261`) |
| Current read route | `GET /api/delivery-company/reviews/:userId` — **public, no auth** | `GET /api/driver/reviews/:driverId` — **public, no auth** |
| Shown today on the Avis page | Yes (this is the existing feed) | No |

**This is the single most important audit finding.** The task's own framing — "reviews submitted by suppliers concerning deliveries performed by drivers" — describes the `DELIVERY_COMPANY` review type's reviewer (a Supplier) combined with the `DRIVER` review type's subject (an individual driver). No single existing row type already has both "reviewer = Supplier" and "subject = one specific driver." There are exactly two ways to satisfy the request, and they are not interchangeable:

- **(A) Enrich the existing `DELIVERY_COMPANY` reviews** (same reviewer = Supplier, same dataset already on this page) **with the driver who performed the underlying delivery**, resolved via `deliveryId → deliveries.driverId`. This preserves "reviewer = Supplier" exactly as the page's own subtitle already states ("Avis laissés par les fournisseurs") and as the task's own wording says, and requires no new review-submission flow.
- **(B) Also pull in the separate `DRIVER` reviews**, whose reviewer is the **Cafe Owner**, not a Supplier — contradicting the task's explicit "submitted by suppliers" framing, and mixing two different reviewer audiences into one feed without any UI distinction would be misleading.

**Recommendation: build on (A) only.** Do not merge in `DRIVER`-type reviews — they are a legitimate, separate feature (Cafe Owner rating the driver who delivered their order) that already has its own read route and does not belong in a feed titled "Avis laissés par les fournisseurs." If the delivery company should *also* eventually see Cafe-Owner-submitted driver reviews, that is a distinct, separate feature decision requiring explicit confirmation — it is not assumed here.

## 4. Relationships — Supplier / Delivery / Delivery Company / Driver / Review

`deliveries` (`shared/schema.ts:366`) is the join point for everything:

- `deliveries.supplierId` — the dispatching Supplier (denormalized from the order at creation).
- `deliveries.deliveryCompanyId` — **set once, when a Delivery Company accepts the delivery** (`deliveryMode = 'DELIVERY_COMPANY'` only; stays `NULL` for `SUPPLIER`-mode deliveries).
- `deliveries.driverId` — the driver assigned to perform it.
- `deliveries.status` — lifecycle; a review can only exist for a delivery that reached `'DELIVERED'` (enforced server-side on write, both review types).

A `DELIVERY_COMPANY`-type review's `deliveryId` points at exactly one `deliveries` row, which already carries both `deliveryCompanyId` (confirming which company this review is actually about — matches `review.deliveryCompanyUserId`) and `driverId` (who performed it). **No new column or table is needed** — the join `supplierProductReviews.deliveryId = deliveries.id` gives the driver directly.

## 5. How a driver is assigned to a delivery company — and why history is safe here

Current membership: `users.deliveryCompanyId` (role `DRIVER`) — a driver belongs to exactly one owner, enforced by a DB CHECK constraint (`users.deliveryCompanyId` XOR `users.supplierId`), read via `storage.getDriversForOwner('DELIVERY_COMPANY', ownerId)` (`server/storage/domains/delivery.storage.ts:1089`).

The audit explicitly warns not to assume current membership reflects historical truth. It doesn't need to, because of a separate, stronger guarantee already enforced elsewhere in the codebase: **`reassignDriver`** (`delivery.storage.ts:746`) only permits changing `deliveries.driverId` while `delivery.status === 'ASSIGNED'` — it explicitly rejects reassignment once a delivery "has already been collected" (`PICKED_UP`/`IN_TRANSIT`/`DELIVERED`). Since a review can only be created for a `DELIVERED` delivery, **`deliveries.driverId` (and `deliveries.deliveryCompanyId`) are permanently frozen for every delivery that can ever have a review.** Reading them directly off the `deliveries` row, rather than off the driver's current `users.deliveryCompanyId`, is therefore both simpler and the only historically-correct approach — exactly the "safest solution compatible with the existing schema" the task asks for, requiring no new assignment-history table.

One residual edge case: if a driver's account is later deleted entirely (not just reassigned to another company), `deliveries.driverId` would point at a row that no longer exists. This must be handled gracefully (e.g. "Chauffeur indisponible") rather than breaking the page — noted under Limitations.

## 6. Existing API endpoints

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/delivery-company/reviews/:userId` | **None** | Public by design — this same data powers the public marketplace card rating (`deliveryCompanyProfiles.rating`/`reviewCount`, refreshed by `refreshDeliveryCompanyReviewStats`). Trusts the URL param entirely. **Must not be reused for the new dashboard's security model**, and must not be modified (other callers/the public marketplace depend on its current public behavior). |
| `POST /api/delivery-company/reviews` | `requireApprovedSupplier` | Unaffected by this task — review submission stays exactly as is. |
| `GET /api/delivery-company/profile/:userId` | mixed (self vs. public) | Not relevant to reviews. |
| `GET /api/driver/reviews/:driverId` | None | The separate, out-of-scope `DRIVER` review type (§3). Not reused. |

**No existing authenticated, company-scoped "my drivers' reviews" endpoint exists.** One must be created.

`requireApprovedDeliveryCompany` (`server/routes/shared/middleware.ts:54`) already exists and is exactly the right primitive: it resolves the session's user server-side, checks `role === 'DELIVERY_COMPANY' && status === 'approved'`, and attaches `req.deliveryCompany = user` — **never trusting any client-supplied id**. It is already used by several other Delivery Company routes (drivers roster, profile, opportunities) and should gate the new endpoint identically.

## 7. Existing frontend components to reuse

- `client/src/lib/marketplace-analytics.ts` — `DateRangePreset`/`resolveDateRange`: already has `all/today/7d/30d/month/lastMonth/year/custom`, an exact match for the task's required date-filter options.
- `client/src/components/analytics/date-range-filter.tsx` — `DateRangeFilter`: already renders this exact preset list as a shadcn `Select`, already imported and used on this very page for its current (lone) date filter.
- `client/src/components/ui/data-pagination.tsx` — `DataPagination`/`usePagination`: already used on this page.
- `client/src/components/ui/select.tsx` — shadcn `Select`/`SelectTrigger`/`SelectContent`/`SelectItem`: the app-wide picklist convention (already used inside `DateRangeFilter` itself), to be reused for the Supplier/Driver/Rating filters.
- `client/src/components/dashboard/dashboard-kit.tsx` — `DashboardHero`/`EmptyState`: already used for this page's header and empty state.
- `server/storage/domains/delivery.storage.ts` — `getDriversForOwner('DELIVERY_COMPANY', id)`: the exact, already-authorized roster query — useful for building the "Chauffeur" filter's option list without a second driver-lookup implementation (though, see §9, the filter's options should be restricted to drivers who actually have an eligible review, not the full roster).

## 8. Current limitations

1. No endpoint returns `DELIVERY_COMPANY` reviews enriched with the driver who performed them — driver attribution requires a new join (§4), not a schema change.
2. The existing review-reading endpoint is intentionally public — unsuitable, as-is, for anything the task wants kept company-scoped and authenticated.
3. No existing UI component renders a star-distribution bar/bucket breakdown; a small new presentational piece is needed (trivial — a 5-row loop over rating counts), not a new data layer.
4. No per-driver detail page/route exists today in the Delivery Company's own app area (`/delivery/drivers` is a roster list with no per-driver detail route or modal found), so "driver profile link, if already supported" resolves to: **not supported — name/image shown inline, no deep link**, per the task's own "if already supported" qualifier.
5. A driver's account could theoretically be deleted after a review references it (`deliveries.driverId` would then dangle) — must be handled as a graceful fallback label, never a crash.

## 9. Required backend changes

1. **New storage method** (e.g. `getDeliveryCompanyDriverReviews(deliveryCompanyUserId: number)`) in the Delivery Company's review domain: selects `supplierProductReviews` where `reviewType = 'DELIVERY_COMPANY' AND deliveryCompanyUserId = :id`, joined to `deliveries` (on `deliveryId`) for `driverId`, then a single batched lookup of `users` for every distinct `driverId` in the result set (avoids N+1 — one extra query total, not one per review) to attach `driverName`/`driverImageUrl`. The Supplier's own name/image is already on the review row (`cafeName`) or resolvable the same batched way via `cafeId` if an image is wanted too.
2. **New route**, e.g. `GET /api/delivery-company/driver-reviews`, gated by `requireApprovedDeliveryCompany`, reading `req.deliveryCompany.id` — **no id parameter accepted from the client at all** for this endpoint, closing the exact gap the task's security section is concerned about. Existing `GET /api/delivery-company/reviews/:userId` stays untouched for its existing (public, marketplace-card) purpose.
3. No new database migration, column, or index — every value needed already exists on `supplierProductReviews`, `deliveries`, and `users`.

## 10. Required frontend changes

1. New hook, e.g. `useDeliveryCompanyDriverReviews()` (no parameter — the server resolves identity), replacing `useDeliveryCompanyReviews(user?.id)` on this page only; the existing hook stays for any other current caller (confirmed: `reviews-page.tsx` is its only consumer today, but the underlying public route itself is not being removed or changed regardless).
2. Rewrite `reviews-page.tsx` to add: the summary block (average/total/star distribution, computed from the full eligible set before any filter is applied — exactly the pattern the page's own code comment already establishes for the current date filter, "stays computed over the FULL unfiltered review list," now generalized to all four filters), four `Select` filters (Fournisseur/Chauffeur/Période/Note) with a "Réinitialiser les filtres" action, and an enriched review card showing both the Supplier (existing fields) and the driver (new fields) with graceful fallbacks.
3. Filter option lists (Supplier dropdown, Driver dropdown) must be derived from the review dataset's actual distinct values (and the correct id, not just the display name, per the task's own instruction), not from an unrelated full roster query — a Supplier or driver with zero reviews should not appear as a selectable, guaranteed-empty filter option.

## 11. Security and data-isolation considerations

- The new endpoint must resolve `req.deliveryCompany.id` via `requireApprovedDeliveryCompany` and use it as the **only** source of the company identity in the query — never a route/query-string parameter.
- The query's `WHERE deliveryCompanyUserId = :id` clause is the entire isolation boundary and is identical in shape to what the existing (public) endpoint already does — the only change is *where the id comes from* (session vs. URL).
- Driver names/images exposed are limited to drivers who performed a delivery that generated a review for *this* company — never another company's roster.
- No change to Supplier review submission permissions or to the public marketplace-rating read path.

## 12. Proposed implementation architecture

**Data fetching**: one authenticated request per page load (`GET /api/delivery-company/driver-reviews`), returning the company's full eligible, driver-enriched review set — no server-side pagination. **Rationale**: this mirrors the page's own existing pattern (and the same pattern used by the structurally identical `printer/reviews.tsx`/`marketing/reviews.tsx` pages the file's own header comment references) of fetching once and filtering/paginating client-side; the eligible dataset is scoped to one delivery company's own drivers, not a global table, so realistic volume stays well within what a single client-side `Array.filter`/`slice` handles efficiently. This also makes the four filters trivially composable (simple `&&`-chained predicates) and keeps the summary-vs-filtered-view distinction (§Phase 2 item 4) easy to implement correctly, since both are computed from the one in-memory array already held by the page.

**Tradeoff flagged explicitly** (per the task's own "avoid fetching the entire review history unnecessarily" instruction): if a single delivery company could realistically accumulate tens of thousands of reviews, this approach would eventually need to move to server-side filtering/pagination (the same shape already used by `createEntityReportHooks`'s `usePublishedReports(page, limit)` elsewhere in the app). Nothing in the audited data suggests that scale today (review volume is bounded by completed deliveries per company), so the client-side approach is recommended as the "best existing architecture" fit unless the user specifically wants to design for that future scale now.

**Summary vs. filtered view**: computed as two independent values from the same fetched array — `allEligibleReviews` (full set, always) for the top summary, and `filteredReviews` (after the four filters) for the list/pagination — with a small UI label clarifying which one the summary represents when filters are active, per the task's explicit "do not mix filtered and unfiltered values without clear labeling" instruction.

## Validation and testing plan (for Phase 2/3)

1. `npx tsc --noEmit`.
2. `npm run build`.
3. Manual/scripted check that `GET /api/delivery-company/driver-reviews` called as Company A never returns a row whose underlying delivery's `deliveryCompanyId` ≠ Company A's id (confirms the join can't leak).
4. Confirm the existing `POST /api/delivery-company/reviews` and `GET /api/delivery-company/reviews/:userId` behave identically before/after (unchanged).
5. No automated test suite exists in this repository (confirmed in a prior session) — cannot run "existing tests."
6. Live browser testing: **not available in this environment** (no browser-automation tool). Any Phase 3 report must state this explicitly rather than imply two delivery companies/drivers were exercised in a real browser.

## Recommendation

Proceed with architecture (A) from §3: enrich the existing, already-public `DELIVERY_COMPANY`-type Supplier reviews with driver attribution resolved through `deliveries.driverId`/`deliveryCompanyId` (both frozen post-`ASSIGNED`, confirmed safe for historical use), served through a **new**, `requireApprovedDeliveryCompany`-gated endpoint that never accepts a client-supplied company id, and rendered via a rewritten `reviews-page.tsx` that adds the summary/star-distribution block and four client-side-composable filters on top of the exact same reusable `DateRangeFilter`/`DataPagination`/shadcn `Select` components already used elsewhere in this codebase. Do not pull in the separate, Cafe-Owner-authored `DRIVER` review type — it is a different feature with a different reviewer audience, and merging it in would contradict both the page's own existing subtitle and the task's own "submitted by suppliers" wording. No database migration is required.
