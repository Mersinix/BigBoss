# Academy, Print & Marketing — Store Cards, Distance, Avis/Signaler, Page Organization, Admin Synchronization — Audit

## 1. Distance instead of address on mapped Store cards

**NOT DONE.** `PrintStoreCardTile`/`MarketingStoreCardTile`/`AcademyStoreCardTile` (built in the prior Store-mapping tasks) all currently render `company.location` as plain address text. None of the three new list endpoints (`getPrintCompanyCards`, `getMarketingCompanyCards`, `getAcademyCompanyCards`) accept or compute a viewer-relative `distanceKm`, unlike their sibling item-level endpoints (`getPrintMarketplaceCards`, `getMarketingProfiles`, `getPublishedAcademyCourses`), which already thread `viewerLocation` through from the logged-in Coffee Owner's own `users.locationLat/Lng` and compute `distanceKm` via the existing `this.parseLatLng`/`this.haversineKm` server-side helpers (confirmed real, already-used infrastructure — not the `/products`-specific client-side `calculateDistance`/`useSearchLocationStore`, which is a different, explicit-search-override mechanism for that one page only).

**Fix**: add `distanceKm` to the 3 list card types, thread `viewerLocation` through the 3 new storage functions and their routes (copying the exact pattern already used by `GET /api/print/marketplace` etc. — read `req.session.userId`'s own location, no new client param needed), and swap the card tiles' address-text line for `formatDistance(distanceKm)` (reusing the existing shared `client/src/lib/distance.ts` formatter — `formatDistance`), omitting the line entirely when distance can't be computed (no fallback text, matching `/products`' own `{distance != null && ...}` convention exactly — never show `undefined`/`NaN`).

## 2-5. Distance format/application — covered by the fix above, applied identically to all three.

## 6-9. Avis + Signaler on Store Detail pages

**NOT DONE** on the 3 new Store Detail pages (`print-store-detail-page.tsx`, `marketing-store-detail-page.tsx`, `academy-store-detail-page.tsx`) — each currently only has a Disponibilité-equivalent "Info" button. **However, the exact reusable pattern already exists** in each module's own company/profile-level modal (`PrintCompanyDetailModal`, `MarketingDetailModal`, `AcademyProfileModal`), which already have a `Signaler | Disponibilité | Avis | Flash` icon row using the real review hooks (`usePrintReviews`/`useReportPrinter`, `useMarketingReviews`/`useReportMarketingProvider`, `useAcademyReviews`/`useReportAcademy`) and the shared `ReviewsModal`. Fix: add the same Avis (Star→`ReviewsModal`) and Signaler (Flag→report Dialog, same Disponibilité-pattern chrome already standardized this session) actions to each Store Detail page, reusing those exact hooks — in the task's explicitly requested order **Disponibilité | Avis | Signaler** (the existing modals use Signaler-first; this task dictates the new pages use this specific order, which is a deliberate, explicit instruction for these new pages, not a retroactive change to the existing modals).

## 10-13. Academy page organization vs. Print

**NOT DONE.** Print's order (confirmed in `print-page.tsx`): sticky Category+Filter bar → **Imprimeries (Store section)** → **"Services d'impression" title** → service grid. Marketing's order (confirmed in `marketing-page.tsx`): sticky Category+Filter bar → **Agences (Store section)** → service grid (already has an implicit section, title not as prominent but order matches). **Academy's current order is backwards**: the `AcademyStoresSection` (added in the prior task) was inserted as the very first child of the main content container, with the "Training Filters" bar rendered AFTER it (inside `<section>`) — the opposite of Print/Marketing. Fix: move the filters bar above `AcademyStoresSection`, and add an explicit "Formations" section title above the course grid (Print/Marketing already effectively have this via their grid header; Academy's grid header already exists too — just needs to render after the now-repositioned filters+stores).

## 14. Marketing page organization vs. Print

**ALREADY DONE** — confirmed Marketing's sticky Category+Filter bar already renders before `MarketingStoresSection`, which renders before the service grid — same order as Print. No change needed.

## 15/33. Marketing category filter icons

**ALREADY DONE** — confirmed `marketing-page.tsx`'s category strip already does `cat.icon || CATEGORY_ICON_FALLBACK[cat.name] || "📢"` (line ~575), where `cat` comes directly from `useMarketingTaxonomy()` (the real Admin-configured taxonomy with a real `icon` column) — the admin-configured icon is already correctly prioritized over the hardcoded fallback. No change needed (this is, structurally, the exact fix Print needed in an earlier task — Marketing already had it correctly wired).

## 16. Store card design preservation

Confirmed — the distance fix (item 1) is the only change to the three Store card tiles; nothing else in their JSX changes.

## 17-26. Admin mapped-card/Details-modal synchronization with Admin Stores

**Admin Stores reference** (`client/src/pages/admin/stores-page.tsx`): a dedicated page, `StoreCard` grid (cover, overlapping logo, name, supplier name, approval badge, product count, auto-approve badge, drag-reorder) + `StoreDetailDialog` (cover image if present → logo+name+"supplierName · supplierEmail" → status/visibility/count badges → description → Auto-Approve toggle → Approve/Reject/Hold/Delete button row, each conditionally hidden if already in that state). Notably, **the Store reference dialog does NOT render the supplier's product list at all** — it fetches full product data but never displays it; only a count.

**Current Admin Print/Academy/Marketing account modals** (`PrinterAccountDetail`, `AcademyDetail`, `AccountDetail`): confirmed **structurally identical to each other already** (header+badges+view/edit fields+PENDING-publication approve/reject panel+Edit/Freeze/Delete action bar+nested Eye-icon marketplace-preview modal), but differ from the Store reference in:
- **No cover image rendered** in any of the 3 admin modals (Print/Academy's `coverImageUrl` and the logo-overlapping-cover treatment only appear in their Eye-icon preview modal, one click away).
- Action buttons are Edit/Freeze/Delete + a separate publication approve/reject panel, not the Store's unified Approve/Reject/Hold/Delete row — this reflects a **genuinely different, already-more-granular lifecycle** (registration status + publication status are two distinct admin decisions in Print/Academy/Marketing, vs. Store's single `approvalStatus` enum) — collapsing them to match Store's exact button set would remove real distinctions these 3 modules already correctly model, which Section 19's own instruction ("same Store-card experience, not same business entity... do not make Academy/Marketing/Print use Supplier business logic") explicitly warns against.
- Marketing's `AccountDetail` already shows its services list inline (category/isPublished/price/responseTime) — richer than the Store reference's own dialog (which shows no products at all). Print's/Academy's equivalents show only a count, deferring the full list to the Eye-icon preview — also already consistent with "service-tab information exists, just one click further."

**Decision (documented, not deferred silently)**: given the Store reference dialog is actually *simpler* than all three existing admin modals in every dimension except cover-image presentation, and given this task's own repeated instructions ("do not remove existing information," "do not make X use Y's business logic," "make the smallest safe change," "if something doesn't need to change, leave it unchanged"), the synchronization implemented this task is: **add the one genuine, purely additive gap — a cover-image header, shown only when a cover image exists, exactly mirroring the Store reference's own conditional rendering — to the top of `PrinterAccountDetail`, `AcademyDetail`, and `AccountDetail`.** This is additive, reversible, zero-risk to existing content/actions, and directly closes the one real visual gap identified. A full merge of the three modals' action-button sets into Store's simpler Approve/Reject/Hold/Delete pattern is **NOT implemented** — doing so would require collapsing each module's already-correct, more granular two-axis (registration-status + publication-status) lifecycle into Store's single-axis one, which is a business-logic change the task's own Section 19 explicitly prohibits, not a visual-consistency one. This is flagged as a deliberate scope decision, not an oversight.

## 27-30. Responsive / regression / scope boundaries

No responsive-specific code changes are needed — all new UI reuses existing responsive conventions (flex-wrap icon rows, existing grid breakpoints). `/products`, Supplier Stores, Maintenance, Barista are not touched.

## 31-32. Data relationship / distance synchronization

Confirmed no hardcoded IDs anywhere in the new code; distance is computed server-side from real `users.locationLat/Lng` on both the viewer and the provider, the same mechanism already powering the existing item-level marketplace endpoints — no new coordinate data invented.

## Files that will change

- `shared/schema.ts` — add `distanceKm` to `PrintCompanyListCard`/`MarketingCompanyListCard`.
- `client/src/hooks/use-barista-academy.ts` — add `distanceKm` to the local `AcademyCompanyListCard` type.
- `server/storage.ts` — `getPrintCompanyCards`/`getMarketingCompanyCards`/`getAcademyCompanyCards` accept `viewerLocation` and compute `distanceKm`.
- `server/routes.ts` — the 3 `GET .../companies` routes thread the session's viewer location through, same pattern as the existing item-list routes.
- `client/src/pages/cafe/print/print-page.tsx`, `marketing-page.tsx`, `barista-academy-page.tsx` — Store card tiles show distance instead of address.
- `client/src/pages/cafe/print/print-store-detail-page.tsx`, `marketing-store-detail-page.tsx`, `academy-store-detail-page.tsx` — add Avis + Signaler next to Disponibilité.
- `client/src/pages/cafe/barista/barista-academy-page.tsx` — move filters above the Store section; confirm/add the "Formations" section title.
- `client/src/pages/admin/print-page.tsx`, `academy-page.tsx`, `marketing-page.tsx` — add a conditional cover-image header to each account detail component.

## Not changed

`/products`, Supplier Stores (`stores-page.tsx` itself untouched — read-only reference), Maintenance, Barista, Marketing's page organization (already correct), Marketing's category icons (already correct), any admin approve/reject/freeze/delete business logic, any existing modal's content beyond the additive cover-image header.

## Validation

Results in the final report.
