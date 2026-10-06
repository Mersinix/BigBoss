# Print Store Mapping — Audit

## 1. How `/products` maps Supplier Stores (reference)

- Page: `client/src/pages/cafe/browse-products.tsx`. `StoreCardTile` (`:337-420`) + `StoresSection` (`:422-507`): cover image (`aspect-[16/9]`, `Store` icon fallback), overlapping logo tile (`w-11 h-11 rounded-xl -mt-8`), name/description, `Package` icon + item count, favorite heart (top-right, `stopPropagation`). Collapsed = horizontal scroll strip (`w-52 sm:w-60` tiles); "Voir plus" expands to a `grid-cols-2 sm:grid-cols-3 md:grid-cols-4` grid.
- Position: inside the `max-w-7xl mx-auto px-4 py-6` main container, **first**, right after the sticky Category-strip+Filter-bar, before the Packs section and the product grid.
- Data: a real, separate `supplierStores` table (`shared/schema.ts:1411-1430`, one row per supplier, its own name/logo/cover/hours — self-contained). `GET /api/stores` (public) → `storage.getVisibleStores()`, gated on `approvalStatus='APPROVED' && visibility='VISIBLE'` and `productCount > 0`.
- Selection: clicking a card **navigates** to `/stores/:storeId` (`StoreDetailPage`), which fetches `GET /api/stores/:id` and owns its own filtered product list — not an in-place filter on `/products` itself.
- Store↔product relationship: `supplierProductListings` (price/stock per supplier×product), not a FK on `products` itself.

## 2. How `/print` currently maps providers/services

- `client/src/pages/cafe/print/print-page.tsx` fetches `GET /api/print/marketplace` → a **flat list** of `PrintCatalogCard` (one row per service/item, `printerId`/`printerName`/`printerImageUrl`/`printerLocation` denormalized onto each row — confirmed `shared/schema.ts:3326-3334`). There is **no cover image or description at this level**.
- The only existing "pick a provider" control is `PrintFilterBar`'s "Société d'impression" `<Select>` (`print-page.tsx`), which already filters the flat grid by `filters.brandId === String(card.printerId)` — i.e. **Print already has a real, working provider→services filter mechanism**, just as a plain dropdown, not a browsable card UI.
- `PrintCompanyDetailModal` (`client/src/components/print/print-company-detail-modal.tsx`) already renders a full "provider card" (identity, description, hours, portfolio, categories, **services list**) via `GET /api/print/company/:userId` → `storage.getPrintCompanyCard()`, which already assembles everything a Store card would need **except it requires an id upfront and is per-provider, not a browsable list of all providers**.

## 3. Where Print provider/store information currently comes from

- `users` table: `name`, `profileImageUrl` (logo), `coverImageUrl` (banner), `phone`, `locationAddress`/lat/lng — edited in Settings → Compte (same pattern as every other professional vertical in this app, not Print-specific).
- `printerProfiles` table (`shared/schema.ts:2622-2646`): `description`, `websiteUrl`, `marketplaceVisible`, `weeklyHours`, `isOnVacation`, `portfolioImages`, `publicationStatus` — edited at **Espace Imprimerie → Business → Profil** (`client/src/pages/printer/profile.tsx`) via `PATCH /api/print/profile`.
- **Confirmed: `printerProfiles` has no `name`/`logoUrl`/`coverImageUrl`/`address`/`phone`/`email` columns of its own** — unlike `supplierStores`, which is self-contained. A Printer's "Store identity" is the union of its `users` row (name/logo/cover/phone/location, edited in Settings, identical to every other vertical) and its `printerProfiles` row (description/hours/vacation/portfolio/visibility, edited at Business → Profil).

## 4. What's missing for a Print Store

- **Nothing on the data/edit side.** `GET /api/print/company/:userId` already returns every field a Store card needs (name, logo, cover, location, phone, description, website, hours, vacation, portfolio, rating, reviewCount, categories, services) — assembled from data already fully editable at Business → Profil (+ Settings for identity, same as Academy/Marketing/Maintenance/Barista's own "Profil" pages, none of which let the professional edit name/logo/phone there either). **No new field, no schema change, no edit-page change is needed.**
- **One real gap**: there is no endpoint that lists *all* visible Printer companies as lightweight cards (the way `GET /api/stores` lists all visible Supplier stores) — `GET /api/print/company/:userId` needs an id upfront, and the flat marketplace list has no cover/description. This is the one minimal, additive backend piece needed: `GET /api/print/companies`.
- **One real UI gap**: `/print` has no browsable Store-card section at all — only a dropdown.

## 5/6. What must change / must not change

**Change:**
- Add `storage.getPrintCompanyCards()` (new, read-only, reuses `getPrintMarketplaceCards`'s exact visibility gate — approved PRINTER role, active catalog items, `marketplaceVisible && publicationStatus==='APPROVED'`, plus drop printers with zero active services, mirroring `getVisibleStores`'s `productCount > 0` rule) + `GET /api/print/companies` (public, mirrors `GET /api/print/marketplace`/`GET /api/stores`'s own no-auth convention).
- Add a new `PrintStoresSection`/`PrintStoreCardTile` UI on `/print`, visually mirroring `StoreCardTile`/`StoresSection` exactly, positioned identically (first thing after the sticky Category+Filter bar, before the product grid).
- Clicking a Print Store card sets the **existing** `filters.brandId` state to that printer's id — reusing the exact filter predicate that already correctly scopes the grid to one printer's services, rather than introducing a second filtering mechanism or a new route/page. This is a deliberate, documented deviation from `/products`' "navigate to a dedicated page" pattern (see Section 7 below) and is the smallest-safe-change path, since Print already has a correct, real, working provider→services filter — the only missing piece was a browsable card UI to drive it.

**Must NOT change:** `supplierStores`/`/products`/`/stores/:id` (untouched), `printerProfiles` schema, Business → Profil page, `PATCH /api/print/profile`, `PrintCompanyDetailModal`, existing categories/subcategories/icons/Fast Search/Signaler/Avis/Favorites/nested-modal work from prior tasks, existing "Société d'impression" dropdown (left in place — it's now redundant with the new card UI for the same filter, but removing a working, independently-useful control is out of scope and risks an unrelated regression for no benefit).

## 7. Why navigation-to-a-page was not chosen

`/products`' Store→Detail-page pattern exists because a Supplier Store's own page needs its *own* independent filter state (sub-category/brand/flavor/size) distinct from the main marketplace's filters. Print's existing `PrintCompanyDetailModal` already provides the equivalent "view this provider, see their services, click a service to open its detail" experience as a modal (used from the Service modal's "Imprimerie" section) — building a second, parallel `/print/stores/:id` page would be exactly the "second unrelated Store experience" / "duplicate an existing store component" the task explicitly forbids (Sections 3, 18). Using the existing `brandId` filter instead reuses 100% real, already-correct logic with zero duplication.

## 8. Synchronization risk check

`Imprimerie Profile (description/hours/vacation/portfolio, Business→Profil) + Settings (name/logo/cover/phone/location)` → `getPrintCompanyCard`/`getPrintCompanyCards` (same underlying `printerProfiles`+`users` rows, same visibility gate as the existing marketplace) → `GET /api/print/companies` → `/print`'s new Store cards → clicking sets `filters.brandId` → the existing, already-correct `cards.filter(c => String(c.printerId) === filters.brandId)` → product grid. No duplicated/independent data path is introduced; the new endpoint is a pure read derived from the same rows every other Print surface already reads.

## Classification

| Area | Status |
|---|---|
| `/products` Store card UI/behavior (reference) | READY |
| Print provider identity + profile data (name/logo/cover/description/hours/portfolio) | READY (no changes needed) |
| Print provider→services relationship | READY (existing `printerId` on catalog items, already used by the existing brand filter) |
| A "list all visible print companies" endpoint | MISSING (added this task) |
| A browsable Store-card UI on `/print` | MISSING (added this task) |
| Print provider favoriting (for the new Store card's heart) | READY (`useFavorites.togglePrintCompany`/`printCompanies`, already used by `PrintCompanyDetailModal`) |

## Validation

- `npx tsc --noEmit`: clean, zero errors, after the full set of changes.
- `npm run build`: succeeded (`✓ built in 1m 4s`, `dist/index.cjs` 2.0mb). Same pre-existing >500kB chunk-size warning as before; no new warnings/errors.
- No test suite exists in this project (`package.json` has no `test` script) — not applicable.
- `getPrintCompanyCards()`'s gating logic replicated via direct SQL against real data (no credentials touched): both real `PRINTER` accounts (`baha print`, `Coffee Print Studio`) are `approved`, `marketplace_visible=true`, `publication_status='APPROVED'`, with 4 active catalog items each — confirming the logic would correctly surface both with `serviceCount: 4`.
- **Not performed**: a live HTTP call to the new `GET /api/print/companies` route — the running dev server (`tsx` without `--watch`) doesn't hot-reload backend code, so it still serves the pre-change backend; a restart is needed before this (or any backend change) can be exercised live, consistent with this project's established constraint. Frontend `/print` browser verification (Store cards rendering, dark mode, selecting a store, responsive behavior) was also not performed — no live session was opened.
