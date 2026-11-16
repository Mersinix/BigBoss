# Print services management ↔ Marketing design synchronization audit

Scope: Admin → Print (Imprimeurs/Services management) and Espace Imprimerie →
Business → Services, synchronized against Admin → Marketing → Services Marketing
and Espace Marketing → Business → Services respectively. This is a visual/UX
synchronization pass — Print's data model, Store↔Service relationships,
category/subcategory taxonomy, and business workflow are unchanged.

## 1. Initial Marketing vs Print differences

Two parallel research passes (Admin side, Business→Services side) found the
real gaps were **smaller than the task's initial premise assumed** — both
pages already had more infrastructure in common with Marketing than expected.
Corrections to the premise, confirmed by direct code reads:

- **Admin Print already has a flat, cross-printer "Services" tab** (`data.catalogItems`), not a nested-only view — it was simply missing 3 of Marketing's 6 filter dimensions (provider, availability, rating) and showed a generic icon instead of the real service image/description/subcategory.
- **Pagination (`usePagination`/`DataPagination`) was already identically wired** on all four pages (Admin Marketing Services, Admin Print Services, Espace Marketing Services, Espace Imprimerie Services) — nothing needed there.
- **Neither Business→Services page (Marketing or Print) has a search/filter bar** — this is symmetric, not a Print gap.
- **The preview/Aperçu modals (`MarketingServiceDetailModal` / `PrintServiceDetailModal`) were already visually synchronized** (same close-button/cover/action-icon treatment) from an earlier session pass — confirmed by direct read, no changes needed.
- **Print's service already has a real, required, persistent title field** (`printCatalogItems.name`, `notNull()`, no legacy-fallback needed) — in better shape than Marketing's own `title` (which defaults to `""` and needs a `title?.trim() || category` fallback for legacy rows). No title-retrofit work was needed for Print.
- **Neither Marketing nor Print has per-service admin edit/delete** — only account-level edit/delete and (Print only) a per-item `isActive` toggle exist. Matching Marketing exactly means *not* adding per-service edit/delete to Print's admin card, since Marketing itself has none.
- Print's catalog item schema is already richer than Marketing's service schema (`subCategory`, `unit`, `minQuantity`, `productionTimeDays`, `materials[]` — none of which Marketing has). Marketing's `offerDetails` free-text field has no genuine Print equivalent need (Print's structured fields already cover "what's included" more precisely) — **deliberately not added to Print**, per the explicit instruction not to blindly copy Marketing-specific fields.

## 2. Admin Print changes

`client/src/pages/admin/print-page.tsx` (Services tab) and `server/storage.ts` (`getPrintAdminOverview`):

- **Backend**: `catalogItems` (built in `getPrintAdminOverview`) now attaches, per item, `printerRating`, `printerReviewCount`, `printerIsAvailable`, `printerMarketplaceVisible` — computed from the same `reviewStats`/`profileMap` the function already builds for the `printers` list (no new queries, no new tables; mirrors Admin Marketing's Services tab, which attaches `agencyRating`/`agencyIsAvailable`/`agencyMarketplaceVisible` per service from already-fetched account data).
- **Filters**: added `servicePrinter` (provider/Imprimerie Select), `serviceAvailability` (Imprimerie disponible/indisponible), `serviceRating` (4.5+/4.7+/4.9+/avec avis) — bringing Print's filter dimensions from 2 (search, category, status) to 6, matching Marketing's Services tab exactly. All options are derived from real data (`serviceFilterOptions.printers` from the live `catalogItems` list), never hardcoded.
- Added `data-testid`s to the category/status `Select`s (previously untagged) and a `hasServiceFilters`/`resetServiceFilters` pair mirroring Marketing's exact "Effacer" clear-button pattern.
- **Empty state**: now distinguishes "Aucun service PRINT pour le moment." (no catalog items at all) vs "Aucun service ne correspond à ces filtres." (filtered to zero) — matching Marketing's two-message pattern instead of Print's previous single generic message.
- **Card**: now shows the real `imageUrl` (previously always a generic `Package` icon box, despite the field already existing on the schema), a `line-clamp-2` description (previously absent), a `subCategory` badge (field existed, was unused visually), and an "Imprimerie indisponible" badge when `!printerIsAvailable` (mirroring Marketing's "Agence indisponible"). The status indicator moved from a text badge to a dot-on-image (bottom-right, overlay) + an outline badge in the badge row, matching Marketing's card exactly.
- **Preserved, not removed**: the per-item `isActive` Switch directly on the card — this is an extra capability Print already had that Marketing's Services tab does not (Marketing has no per-service admin toggle at all), kept per the explicit "do not remove an existing Print action simply because Marketing does not have an equivalent" instruction.
- **Not added**: per-service admin edit/delete — Marketing's own Services tab has neither (only account-level edit/delete exist for both marketplaces), so adding them to Print would go *beyond* Marketing's reference UX rather than synchronizing to it.
- Grid layout (`grid md:grid-cols-2 xl:grid-cols-3 gap-4`) and pagination wiring were already identical to Marketing's — untouched.

## 3. Espace Imprimerie Service changes

`client/src/pages/printer/services.tsx`:

- **Card restyled** to Marketing's overlay-based design: image container changed from `aspect-[16/9]` (no overlays, category/status shown as plain text below the image) to `aspect-[4/3]` with a bottom-left status dot (green/gray, `isActive`) and a bottom-right category pill (`bg-black/55 backdrop-blur-sm`, icon + category name) directly over the image — pixel-for-pixel the same treatment as `MarketingMappedServiceCard`/Marketing's own service management card.
- Added a `line-clamp-2` description line below the title (previously the card showed no description at all).
- Status badge next to the title changed from a plain `outline` Actif/Inactif badge to Marketing's `Eye`/`EyeOff` + solid green-600/gray-400 badge treatment.
- `subCategory` moved to its own line under the title (with its real icon via `printSubCategoryIcon`), since the category itself now lives on the image overlay — category+subcategory are still both visible, just split between image overlay (category) and text (subcategory), matching Marketing's information hierarchy (title separate from category/subcategory, never a substitute for it).
- Price + `isActive` Switch footer row, and the Aperçu/Modifier/Supprimer action row, are unchanged (already matched Marketing's icon/label/placement conventions before this task).
- **Form**: added a live image preview (`<img>`, 96px tall, `onError` hides it gracefully) under the "Image (URL)" field in `ServiceFormDialog`, matching Marketing's "Nouveau service" form — previously Print's form had the URL input but no preview.
- **Deliberately left unchanged** (confirmed via direct comparison, not oversights):
  - Pagination — already identically wired to Marketing's (`usePagination`/`DataPagination`).
  - The preview modal (`PrintServiceDetailModal`, `readOnly`) — already visually synchronized with Marketing's own service detail modal.
  - The delete confirmation (`Dialog`-based) — Print's own pattern is arguably better than Marketing's `window.confirm()`; kept as-is per "do not remove an existing Print action."
  - No `offerDetails`-equivalent field was added — Print's existing structured fields (`unit`, `minQuantity`, `productionTimeDays`, `materials[]`) already serve the same "what's included" purpose more precisely than a free-text blob would, and the task explicitly warned against blindly copying Marketing-specific fields.
  - The empty state (shared `EmptyState` component) was left as-is rather than reverted to Marketing's bespoke inline block — Print's approach already reuses a shared, cross-app component, which is the more consistent choice, not a regression.
  - The "Ajouter un service" button label (vs Marketing's "Nouveau service") was kept — this is Print's own terminology, not a design-system property.

## 4. Card design synchronization

Both the Admin Print service card and the Espace Imprimerie service management card now share Marketing's exact visual grammar: real image with `aspect-[4/3]`/thumbnail treatment, status dot, category badge, description preview, and a consistent badge row — while every field shown remains Print's own real data (no Marketing terminology, no fabricated fields).

## 5. Filters/search

Admin Print's Services tab now has 6 real filter dimensions (search, category, provider/Imprimerie, status, availability, rating), matching Admin Marketing's Services tab exactly, all backed by live data (`serviceFilterOptions` derived from the fetched `catalogItems`, never a hardcoded array). The Business→Services pages (Marketing and Print) remain without a search/filter bar on both sides — this was confirmed symmetric, not a Print-specific gap, so no filter bar was added to either.

## 6. Pagination

No changes needed — `usePagination`/`DataPagination` were already identically wired (same page-size presets, same reset-on-filter-change `useEffect` pattern) across all four pages before this task.

## 7. Forms

`ServiceFormDialog` (Print's "Nouveau service"/"Modifier le service", same component handles both modes exactly like Marketing's) gained a live image preview under the Image (URL) field, matching Marketing's form. All other sections (category/subcategory selects constrained to the printer's own real taxonomy mapping, pricing, Matériaux tag input, Actif toggle, validation, save/cancel) were already in good shape and preserved unchanged — no Marketing-specific fields (e.g. `offerDetails`) were introduced.

## 8. Title handling

Confirmed `printCatalogItems.name` is already a real, required, persistent title, used consistently everywhere (management card, form, preview modal, Admin Print, Coffee Owner `/print`, Print Store Details) — no retrofit needed, unlike the category-as-title issue found in other modules earlier this session.

## 9. Category/subcategory handling

Print's existing real two-level taxonomy (`printCategoryTaxonomy`/`printSubCategoryTaxonomy`, `printCategoryIcon`/`printSubCategoryIcon` helpers, the printer's own category/subcategory mapping) is unchanged and continues to drive every category/subcategory display and selection — no Marketing categories were introduced, nothing was hardcoded.

## 10. Availability/publication

Print's `isActive` toggle workflow is unchanged in both Admin (the existing `catalogModeration` mutation, `PATCH /api/admin/print/catalog/:id`) and Espace Imprimerie (`toggleActiveMutation`). No new approval workflow was introduced. The new Admin-side `printerIsAvailable` field only powers the new read-only availability *filter* and badge — it does not touch the publication/moderation workflow itself.

## 11. Preview/detail modal synchronization

No changes were needed — `MarketingServiceDetailModal` and `PrintServiceDetailModal` were already structurally synchronized (confirmed via direct side-by-side read: identical dialog chrome, cover-image treatment, close-button markup, action-icon placement, dark-mode token pattern) from an earlier session pass.

## 12. Admin ↔ Imprimerie ↔ Coffee Owner synchronization

No new data sources or duplicate representations were introduced. The Admin Services tab's new `printerRating`/`printerIsAvailable`/`printerMarketplaceVisible` fields are computed server-side from the same `printerProfiles`/review data every other surface (Coffee Owner `/print`, Print Store Details) already reads from — not a separate, driftable copy. Title/description/category/price/availability edited by the printer in Espace Imprimerie continue to flow through the existing single `printCatalogItems` source of truth to Admin, Coffee Owner `/print`, and Print Store Details, unchanged by this task.

## 13. Responsive behavior

No breakpoint changes were made to either page's grid (`grid md:grid-cols-2 xl:grid-cols-3 gap-4` on Admin Print's Services tab, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4` on Espace Imprimerie's Services page) — both already matched their Marketing counterparts before this task. The new filter Selects on Admin Print reuse the same horizontal-scroll-on-mobile wrapper already used by Admin Marketing's filter bar.

## 14. Tests executed

- `npx tsc --noEmit` — clean after both the backend (`storage.ts`) and frontend (`print-page.tsx`, `printer/services.tsx`) changes.
- `npm run build` — clean production build (client + server).
- Live verification via `curl` against the user's already-running Vite dev server confirmed the HMR-updated `printer/services.tsx` module contains the new `aspect-[4/3]` card, `EyeOff` badge treatment, and image-preview markup, and the HMR-updated `admin/print-page.tsx` module contains the new `select-service-filter-printer`/`-availability`/`-rating` test ids and `printerIsAvailable` reference.

## 15. Remaining limitations

- The backend change to `getPrintAdminOverview` (the new `printerRating`/`printerReviewCount`/`printerIsAvailable`/`printerMarketplaceVisible` fields on each `catalogItems` row) requires a restart of the user's long-running dev server to take effect at runtime — it was not applied automatically, since Vite HMR only reflects frontend-only changes and the server process was not restarted without being asked. Until restarted, the new availability/rating filters on Admin Print's Services tab will see `undefined` for these fields (meaning the availability filter would treat every item as "available" and the rating filter would see 0 for every item) rather than the real computed values.
- No browser-automation tool is available in this environment; the card/filter/form visual changes were verified via `npx tsc --noEmit`, `npm run build`, direct source reads, and a live HMR-source `curl` check — not actual rendered-pixel/interactive browser testing. This should be confirmed visually by the user before considering the sync fully verified end-to-end.
- No DB migration was needed — all new fields are computed from already-existing columns (`printerProfiles.isOnVacation`/`marketplaceVisible`, `supplierProductReviews` ratings).
