# Print ↔ Marketing design synchronization audit

Scope: Coffee Owner `/print` (marketplace), `/print/stores/:printerId` (Store
Details), and the Print detail modals. Marketing's current, final card/grid/modal
implementation is the visual/UX reference. Print's own terminology, data model,
Store↔Service relationships, categories, taxonomy, and business workflow are
unchanged — this is a visual/UX synchronization pass, not a rewrite of Print's
business logic (builds on the earlier `docs/print_marketing_ui_synchronization_audit.md`
pass from earlier this session, which already fixed nested-modal stacking and the
detail modals' close/cover/action-icon treatment).

## 1. Initial Print vs Marketing differences

| Area | Print (before) | Marketing (reference) |
|---|---|---|
| Imprimerie/Store card | Smaller avatar (`w-10/11 h-10/11`), no type badge, no Avis overlay, small favorite button | Larger avatar, "Agence" type badge top-left, Avis overlay bottom-right, larger favorite button |
| Store/Agency grid | Dual-mode: horizontal-scroll strip (fixed `w-52 sm:w-60` cards) by default, a *different* column grid only when "expanded" | Single grid, same columns always, only item count changes |
| Service card (mapped) | Bespoke `PrintProductCard`/`StoreServiceCard`, category badge top-left on image, no availability dot, no printer-name badge | `MarketingMappedServiceCard`: printer/provider name badge top-left, favorite top-right, availability dot bottom-left, category badge bottom-right |
| Product/Service grid | 5 columns at desktop (`lg:grid-cols-5`) | 4 columns at desktop (`lg:grid-cols-4`) |
| Store Details header | Raw address text (`card.location`) | Distance (e.g. "4.2 km") next to service count |
| Store Details service grid | Separate `StoreServiceCard` component, 5 columns, no availability dot, no printer badge | Same shared mapped-card component as the main marketplace page, 4 columns |
| Detail modals (Service/Company) | Already built in an earlier session pass to Marketing's spec (cover image, circular `bg-black/40` close/action buttons, nested-modal callback pattern) | — |
| `printerIsAvailable` (real, per-record) | Missing from `PrintCatalogCard` | Marketing's agency cards already expose `isAvailable` |
| Store-level `distanceKm` | Missing from `PrintCompanyCard` | Marketing's company card already exposes `distanceKm` |

## 2. Components reviewed

- `client/src/pages/cafe/print/print-page.tsx` (marketplace page: `PrintStoreCardTile`, `PrintStoresSection`, `PrintProductCard`, product/service grids, filters, nested detail-modal wiring)
- `client/src/pages/cafe/print/print-store-detail-page.tsx` (Store Details page: header, category strip, service grid, Disponibilité/Avis/Signaler icons, `StoreServiceCard`)
- `client/src/components/print/print-service-detail-modal.tsx` (`PrintServiceDetailModal`)
- `client/src/components/print/print-company-detail-modal.tsx` (`PrintCompanyDetailModal`, `PrintCompanyAvailabilityModal`)
- `client/src/lib/print-category-icons.ts` (real admin-managed category/subcategory taxonomy + icons — confirmed Print already has a genuine taxonomy, unlike some other modules synchronized earlier this session)
- `server/storage.ts` (`getPrintMarketplaceCards`, `getPrintCatalogItemCard`, `getPrintMarketplaceCard`, `getPrintCompanyCard` — all 4 `PrintCatalogCard`/`PrintCompanyCard` construction sites)
- `server/routes.ts` (`GET /api/print/company/:userId`)
- `shared/schema.ts` (`PrintCatalogCard`, `PrintCompanyCard`)
- Marketing reference files: `marketing-mapped-service-card.tsx`, the Marketing Agency card tile, Marketing's Store Details page, Marketing's detail modals (read in an earlier portion of this same session as the established reference, not re-read line-by-line in this pass since their shape was already captured when building the new shared Print component).

## 3. Components modified

- `shared/schema.ts` — added `printerIsAvailable: boolean` to `PrintCatalogCard`; added `distanceKm?: number | null` to `PrintCompanyCard`.
- `server/storage.ts` — `getPrintMarketplaceCards`, `getPrintCatalogItemCard`, `getPrintMarketplaceCard`, `getPrintCompanyCard` all now populate `printerIsAvailable` (derived from `!profile.isOnVacation`, same convention as every other synchronized module this session); `getPrintCompanyCard` now accepts an optional `viewerLocation` and computes `distanceKm` via the existing `parseLatLng`/`haversineKm` helpers.
- `server/routes.ts` — `GET /api/print/company/:userId` now passes the authenticated viewer's `locationLat`/`locationLng` through to `getPrintCompanyCard`.
- **New file** `client/src/components/print/print-mapped-service-card.tsx` — `PrintMappedServiceCard`, the single shared presentational card for a mapped Print service, used identically by both `/print` and the Store Details page.
- `client/src/pages/cafe/print/print-page.tsx` — `PrintStoreCardTile` redesigned (type badge, Avis overlay, larger avatar/favorite); `PrintStoresSection`'s dual-mode grid unified into one grid; `PrintProductCard` reduced to a thin adapter around `PrintMappedServiceCard`; product/service grids changed 5→4 columns.
- `client/src/pages/cafe/print/print-store-detail-page.tsx` — removed the bespoke `StoreServiceCard`; header now shows distance instead of raw address; service grid now renders `PrintMappedServiceCard` (same component as `/print`); both the loading-skeleton grid and the real grid changed 5→4 columns; added `favedProducts`/`togglePrintProduct` wiring for per-service favorites.

## 4. Imprimerie/Store card changes

`PrintStoreCardTile` (in `print-page.tsx`):
- Fallback icon enlarged `w-10 h-10` → `w-14 h-14`.
- Added an "Imprimerie" type badge, top-left over the image (`bg-black/55 backdrop-blur-sm text-white`), matching Marketing's Agency-badge treatment exactly. Uses the same fixed string (`"Imprimerie"`) already used elsewhere in the same file's favorite-toggle call (`type: "Imprimerie"`) — not a new fabricated value, since Print's printer profiles have no per-record "type" field (same conclusion reached for Academy/Marketing earlier this session).
- Favorite button enlarged `w-7 h-7` → `w-9 h-9`, repositioned `top-2 right-2` → `top-3 right-3`.
- Added an Avis overlay, bottom-right over the image, gated on `company.reviewCount > 0` (real rating/reviewCount, no duplicate review logic — reads the same `card.rating`/`card.reviewCount` already fetched).
- Bottom info section enlarged to match Marketing's proportions: avatar `w-11 h-11` → `w-16 h-16` (`-mt-8` → `-mt-12`), padding `p-3` → `p-4`, name `text-sm` → `text-base`, description `text-xs` → `text-sm`, meta row `text-[11px]` → `text-xs`.
- Availability indicator: unchanged position/logic (already real, already correctly placed before this task).

## 5. Print Service card changes

New shared `PrintMappedServiceCard` (`client/src/components/print/print-mapped-service-card.tsx`), used by both `/print` and the Store Details page:
- Image container: printer-name badge top-left (`bg-black/55`), favorite top-right, availability dot bottom-left (real `printerIsAvailable`), category badge bottom-right (real admin-managed category + `categoryIcon`, only rendered when `category` is non-empty).
- Body: title (`name`, primary, never replaced by category) → description → Print-specific meta row (`productionTimeDays`, `minQuantity`/`unit` — kept, not copied from Marketing's own meta fields) → price+Avis footer row (price left-aligned under "À partir de", star rating + review count right-aligned), mirroring Marketing's final card's exact visual hierarchy while keeping 100% Print terminology/fields.
- `print-page.tsx`'s `PrintProductCard` is now a thin adapter: it reads the real `PrintCatalogCard` fields, computes the real `categoryIcon` via `printCategoryIcon(card.category, categoryIconByName.get(card.category))`, wires the existing `useFavorites().printProducts`/`togglePrintProduct` store, and renders `PrintMappedServiceCard`. No new data source, no duplicate favorite/review logic.
- Store Details page renders `PrintMappedServiceCard` directly (no intermediate adapter needed there), reusing the company-level `card.name`/`card.profileImageUrl` for the printer badge/avatar (since every service on that page belongs to the same store) and each service's own `rating`/`reviewCount`/`printerIsAvailable`.

## 6. Grid changes

- Imprimerie/Store grid (`PrintStoresSection` in `print-page.tsx`): the old ternary (`expanded ? <grid-cols-2 sm:grid-cols-3 lg:grid-cols-4> : <flex overflow-x-auto, fixed-width cards>`) was removed. Now a single `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4` is used for both collapsed and expanded states — only the `visible` item count differs.
- Service/Product grid (`/print` main page): `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5` → `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`, applied to both the loading-skeleton grid and the real results grid.
- Store Details service grid: same 5→4 column change, applied to both its loading-skeleton grid and real grid.
- All three grids now use the exact same breakpoint set, matching Marketing's grid system and satisfying "same effective width as Service cards" (task items #3, #18, #19).

## 7. Distance changes

- `PrintCatalogCard.distanceKm` already existed (used by `PrintMappedServiceCard`'s favorite-toggle payload and available for future card-level display); no change needed there.
- `PrintCompanyCard.distanceKm` (new): computed server-side in `getPrintCompanyCard` from the viewer's `locationLat`/`locationLng` (passed in by the `/api/print/company/:userId` route from the authenticated session) and the printer's own stored location, via the existing `parseLatLng`/`haversineKm` helpers — the exact same computation pattern already used for Marketing/Academy's own single-company `distanceKm`. No new backend infrastructure, no duplicate distance calculation.
- Store Details header now shows `formatDistance(card.distanceKm)` next to the service count (e.g. "8 services · 4.2 km"), replacing the raw address line. The raw address remains available in the Company Detail Modal (`PrintCompanyDetailModal` still shows `card.location` in its info row) and is preserved as a fallback in the header itself if `distanceKm` is ever unavailable (no viewer location on file) — so no functionality is lost, only the header's primary display changed, per task item #8/#9.

## 8. Store Details changes

- Header distance swap (section 7).
- Service grid now uses the shared `PrintMappedServiceCard` instead of the page-local `StoreServiceCard` (removed entirely) — satisfies task item #12 ("must use the SAME visual card system as /print's own Service cards").
- Grid changed to 4 columns (section 6).
- Disponibilité/Avis/Signaler action icons: already matched Marketing's exact treatment (`w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full`, Clock/Star/Flag, same position/spacing) from an earlier session pass — confirmed via direct read, no changes needed.
- Category filter strip: already real (Print's own admin-managed taxonomy + icons), no changes needed.

## 9. Detail modal changes

`PrintServiceDetailModal` and `PrintCompanyDetailModal` were read in full this pass and confirmed to already match Marketing's reference design exactly (built in the earlier `docs/print_marketing_ui_synchronization_audit.md` pass this session):
- Close button: `w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm`, top-right, `X` icon, white.
- Favorite button: same circular treatment, immediately left of the close button.
- Cover/image: full-width banner (`w-full h-56 sm:h-72`, `rounded-t-2xl overflow-hidden`), `object-cover`, with a graceful avatar/icon fallback when no image is set.
- Avis/Signaler action icons: bottom-right of the cover, same circular `bg-black/40` treatment.
- Info hierarchy: real title first, category/subcategory badges, description, rating/review count, location — never a category-as-title substitution.
- No changes were required to either modal file.

## 10. Nested modal behavior

Confirmed structurally sound, no changes needed:
- In `print-page.tsx`, `PrintServiceDetailModal` and `PrintCompanyDetailModal` are mounted as two independent, sibling `<Dialog>` components, each driven by its own `useState<number | null>` (`previewServiceId`, `previewCompanyId`) — not nested inside each other's JSX. Opening the Company modal from inside the Service modal's "Imprimerie" section (via the `onOpenCompany` callback) sets `previewCompanyId` without touching `previewServiceId`, so both can be open simultaneously; the reverse (`onOpenService`) works the same way. This matches the exact fix already documented in `print-page.tsx`'s own code comments from the earlier `docs/print_marketing_ui_synchronization_audit.md` pass.
- `print-store-detail-page.tsx` only mounts `PrintServiceDetailModal` (no `onOpenCompany` wired — clicking "Imprimerie" inside the service modal is a no-op there, since the Store Details page itself already *is* that company's detail view). This is pre-existing behavior, unrelated to this task's scope, and was left unchanged.

## 11. Responsive behavior

- All three grids (Store/Imprimerie, main Service, Store-Details Service) now share the identical breakpoint set (`grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`), matching Marketing's philosophy — no Print-only breakpoints were introduced.
- No fixed pixel widths remain in the Store/Imprimerie card grid (the old `w-52 sm:w-60` horizontal-scroll mode was removed entirely).
- Detail modals use the existing `sm:max-w-2xl` / `max-h-[90vh] overflow-y-auto` responsive container, unchanged.

## 12. Tests executed

- `npx tsc --noEmit` — clean (no errors) after all changes, including the backend type changes across all 4 `PrintCatalogCard` construction sites and the `PrintCompanyCard` site.
- `npm run build` — clean production build (client + server), no errors.
- Live verification via `curl http://localhost:5000/src/pages/cafe/print/print-store-detail-page.tsx` against the user's already-running Vite dev server: confirmed the HMR-updated module source no longer contains `StoreServiceCard`, contains `PrintMappedServiceCard`, contains the new 4-column grid classes on both the skeleton and real grids, and contains the `formatDistance` call in the header.
- Direct file reads (not live browser) of `print-service-detail-modal.tsx` and `print-company-detail-modal.tsx` confirmed the detail modals already match Marketing's close/cover/action-icon spec — no browser/visual verification was performed for these since no browser-automation tool is available in this environment.

## 13. Remaining limitations

- No browser-automation tool is available in this environment; verification of grid layout, card rendering, and hover/dark-mode styling was performed via `npx tsc --noEmit`, `npm run build`, direct source reads, and a live HMR-source `curl` check against the user's running dev server — not actual rendered-pixel/visual/interactive browser testing. This should be confirmed visually by the user (or via a browser-automation pass) before considering the visual sync fully verified end-to-end.
- `print-store-detail-page.tsx`'s `PrintServiceDetailModal` does not wire `onOpenCompany` (pre-existing, out of this task's scope — the page itself is already that company's detail view).
- No new DB column/migration was required for this task — `printerIsAvailable` and the Store-level `distanceKm` are both purely computed from already-existing columns (`printerProfiles.isOnVacation`, `users.locationLat`/`locationLng`).
