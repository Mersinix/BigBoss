# Print Store Details Page — Audit

## 1. How `/products → Store card → /stores/:storeId` works (reference)

- Route: `client/src/App.tsx:339-345`, `<Route path="/stores/:storeId">` → `StoreDetailPage` (`client/src/pages/cafe/store-detail-page.tsx`), wrapped in `MarketplaceLayout` + `RequireAuth`.
- Data: `GET /api/stores/:id` → `storage.getStoreDetail(id, { requireVisible: true })` — 404s if the store isn't `approvalStatus='APPROVED' && visibility='VISIBLE'`. A second call, `GET /api/stores/:id/packs`, fetches related Packs.
- Page structure (top to bottom): full-bleed cover (slideshow/video) → back button (top-left, → `/products`) → theme-toggle/favorite/Flash cluster (top-right) → reviews badge + Info (opening-hours modal) button (bottom-right) → "Closed" badge → logo card overlapping the cover + name/meta (product count, distance, music toggle) + description → sticky category-pill + sub-category/brand filter bar (scoped to *that store's own* products) → Packs section → product grid (its own `StoreProductCard`, not the main marketplace's card) → `InfoModal` (hours) + `FlashMode` modals mounted at the end.
- Loading: full-page skeleton (cover block + 10 pulsing tiles). Not-found: centered `Store` icon + "Store not found" + "Back to Marketplace" button.
- Product→Store relationship: `getStoreDetail` joins `supplierProductListings` (by `supplierId`) to `products`, so only that supplier's own listed/visible products ever appear — no cross-store leakage possible structurally.

## 2. Current Print Store implementation (previous task)

- `/print` now renders a `PrintStoresSection`/`PrintStoreCardTile` (mirroring `StoreCardTile`/`StoresSection` visually), fed by a new `GET /api/print/companies` (`storage.getPrintCompanyCards()`), itself gated by the same visibility rule as the marketplace (`approved PRINTER role`, `marketplaceVisible && publicationStatus==='APPROVED'`, ≥1 active service).
- **Previously**, clicking a Store card set the existing `filters.brandId` state (in-place filter on `/print` itself) rather than navigating — a deliberate smallest-safe-change decision at the time, reasoning that `PrintCompanyDetailModal` already covered "view this provider + their services."
- **This task's explicit instruction overrides that decision**: the Coffee Owner must get the same navigate-to-a-dedicated-page experience as `/products`. This audit/implementation changes the click behavior to navigate, per Section 3 below.

## 3. Gap classification

| Area | Status |
|---|---|
| Print provider "Store" identity data (`GET /api/print/company/:userId` via `usePrintCompanyDetail`) | READY — already returns name/logo/cover/location/phone/description/weeklyHours/isOnVacation/rating/reviewCount/portfolioImages/categories **and `services: PrintCatalogCard[]`** (every active service belonging to that one printer) — no backend change needed for the detail page itself. |
| Print Store→Services relationship | READY — `services` on the company card is already scoped server-side to exactly that `printerId` (`getPrintCompanyCard`'s own `getPrintCatalogForPrinter(userId)` call), structurally impossible to leak another printer's services. |
| A dedicated Print Store **page** (route) | MISSING (added this task) — only a modal (`PrintCompanyDetailModal`) existed. |
| Store-card click behavior | INCONSISTENT with this task's requirement (in-place filter, not navigation) — **changed this task** to navigate to the new page. |
| Visibility gate on direct URL access | PARTIALLY READY — `getPrintCompanyCard` itself has no visibility gate (by design — it's also used for self/Admin preview of hidden profiles), so the new page performs the gate client-side (treats `marketplaceVisible === false` as "not found"), mirroring `getStoreDetail`'s `requireVisible` 404 behavior without touching the shared backend function other self/Admin callers rely on. |
| Opening-hours "Info" modal | READY, reused — `PrintCompanyAvailabilityModal` already existed in `print-company-detail-modal.tsx` (not exported); exported with a one-line change and reused directly rather than duplicated. |
| Service detail on click | READY, reused — the existing `PrintServiceDetailModal` is reused as-is. |

## 4. What changed / what didn't

**Changed:**
- `client/src/pages/cafe/print/print-store-detail-page.tsx` (new) — the Print Store page, mirroring `StoreDetailPage`'s structure/visual language (cover → back/theme/favorite cluster → reviews+info cluster → logo+name+meta+description → sticky category pills scoped to this store's own services → service grid → Info modal), using Print's own existing theme tokens/colors (blue accent, matching `/print` itself) rather than the Supplier page's amber, and dropping Supplier-only concepts that don't exist for Print (Packs, cover slideshow/video, background music, Flash Mode, promotions) per the task's own "do not invent equivalent information" instruction.
- `client/src/App.tsx` — new route `/print/stores/:printerId` (registered before `/print/:productId`, same reasoning as the existing `/print/orders` route comment, so wouter doesn't swallow "stores" as a product id).
- `client/src/components/print/print-company-detail-modal.tsx` — `PrintCompanyAvailabilityModal` given `export` (one-line change) so the new page can reuse it instead of duplicating ~60 lines of hours-modal JSX.
- `client/src/pages/cafe/print/print-page.tsx` — Store card click now `navigate(`/print/stores/${printerId}`)` instead of setting `filters.brandId`; removed the now-unused `selected`/ring-highlight state, since there's no persistent "selected store" concept on `/print` itself anymore (selection now lives on the dedicated page via the URL).

**Not changed:** `/products`, `/stores/:storeId`, `supplierStores`/Supplier Store configuration, `GET /api/print/company/:userId`/`getPrintCompanyCard` (no backend change — the new page is a pure new consumer of existing data), `PrintCompanyDetailModal` (still used from the Service modal's "Imprimerie" section and the hero blacklist modal — untouched), the "Société d'impression" dropdown filter on `/print` itself (still present and still works independently), every other Coffee Owner module.

## 5. Synchronization

`Imprimerie Profile (Business→Profil) + Settings` → `getPrintCompanyCard` (same rows every Print surface already reads) → `usePrintCompanyDetail` → the new Store page's header + service grid. One data path, no duplication — the new page is a new *view* over already-existing, already-synchronized data.

## Validation

- `npx tsc --noEmit`: clean, zero errors.
- `npm run build`: succeeded (`✓ built in 12.13s`, 2801 modules — one more than before, confirming the new page file was included; `dist/index.cjs` 2.0mb). Same pre-existing >500kB chunk-size warning; no new errors.
- No test suite exists in this project.
- **Not performed**: live browser verification (clicking a Store card, confirming navigation, switching between two real Stores and confirming each shows only its own services, dark mode, mobile layout, back-navigation/browser-Back). No live session was opened this task.
