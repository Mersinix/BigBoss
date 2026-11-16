# Blacklist Modal Refactor — Audit (Phase 1)

Audit only. No application code was modified to produce this report.

## 1. Current file locations

| Section | File |
|---|---|
| Shop (Supplier stores) | `client/src/components/shop/shop-blacklist-modal.tsx` |
| Academy | `client/src/components/academy/academy-blacklist-modal.tsx` |
| Barista | `client/src/components/barista/barista-blacklist-modal.tsx` |
| Maintenance | `client/src/components/maintenance/maintenance-blacklist-modal.tsx` |
| Marketing | `client/src/components/marketing/marketing-blacklist-modal.tsx` |
| Print | `client/src/components/print/print-blacklist-modal.tsx` |

All six are **already thin wrapper components**, not six independent implementations of modal chrome. The real "blacklist modal" UI (dialog shell, grabber, swipe-to-dismiss, header, pagination, list rendering, loading/error/empty states, light/dark theme) was already extracted in an earlier task into:

- `client/src/components/shared/entity-published-reports-modal.tsx` (`EntityPublishedReportsModal`) — owns the Dialog/DialogContent, `ModalGrabber`, header (now with an opt-in `headerVariant="centered"` for Shop only), `useScrollDismiss`, and delegates list rendering to:
- `client/src/components/published-reports-list.tsx` (`PublishedReportsList`) — owns loading skeletons, error state, empty state, the actual report rows, "Charger plus" pagination button.

The data layer is likewise already consolidated into one generic factory:

- `client/src/hooks/use-entity-reports.ts` (`createEntityReportHooks(service)`) — owns the `GET /api/{service}/reports/published` query, the submit/admin/moderate mutations, and cache invalidation. Each of `use-maintenance-reports.ts`, `use-barista-reports.ts`, `use-marketing-reports.ts`, `use-academy-reports.ts`, `use-print-reports.ts`, `use-supplier-reports.ts` is a **one-line instantiation** of this factory (e.g. `createEntityReportHooks("maintenance")`) — already zero duplication here.

**Conclusion up front**: the six files are not six parallel implementations of the same modal — they are already configuration/glue around two already-shared layers. What's left to audit is whether that remaining glue is itself duplicated enough to be worth consolidating further, and whether it's safe to do so.

## 2. Detailed comparison

### 2.1 Identical across all six (true duplication)

- The icon badge JSX is **byte-identical** in every file:
  ```tsx
  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-red-900/40" : "bg-red-100"}`}>
    <Ban className={`w-4 h-4 ${isDark ? "text-red-400" : "text-red-600"}`} />
  </div>
  ```
  (Always red/Ban, regardless of section — the per-section color only shows up in `accentClassName`, used inside `PublishedReportsList`.)
- The `mapRow` function shape is identical in structure (same 4 fixed fields every time: `rating: r.rating, comment: r.reason, createdAt: r.createdAt, publishedAt: r.resolvedAt`), differing only in **which three field names** supply `id`/`professionalId`/`professionalName`/`professionalImageUrl`.
- All six call `EntityPublishedReportsModal` with the same prop shape and nothing else.
- All six data hooks are already generated from the same factory (§1) — zero further work possible there.
- All six backend routes (`GET /api/{service}/reports/published`) are gated identically: `requireAuth` only, no section-specific role restriction (verified by reading all 6 route files: `academy.routes.ts:187`, `supplier.routes.ts:1137`, `barista.routes.ts:609`, `marketing.routes.ts:582`, `maintenance.routes.ts:1115`, `print.routes.ts:238`).

### 2.2 Similar but configuration-only differences

| Field | Shop | Academy | Barista | Maintenance | Marketing | Print |
|---|---|---|---|---|---|---|
| Title | "Fournisseurs signalés" | "Académies signalées" | "Baristas signalés" | "Professionnels signalés" | "Prestataires signalés" | "Imprimeurs signalés" |
| `mapRow` user-id field | `supplierId` | `academyUserId` | `baristaUserId` | `maintenanceUserId` | `marketingUserId` | `printerId` |
| `mapRow` name field | `supplierName` | `academyName` | `baristaName` | `maintenanceName` | `marketingName` | `printerName` |
| `mapRow` image field | `supplierProfileImageUrl` | `academyProfileImageUrl` | `baristaProfileImageUrl` | `maintenanceProfileImageUrl` | `marketingProfileImageUrl` | `printerProfileImageUrl` |
| `accentClassName` | amber | indigo | emerald/green | amber/orange | purple | blue |
| `usePublishedReports` hook | `useSupplierPublishedReports` | `useAcademyPublishedReports` | `useBaristaPublishedReports` | `useMaintenancePublishedReports` | `useMarketingPublishedReports` | `usePrintPublishedReports` |
| `headerVariant` | `"centered"` (just added) | default | default | default | default | default |

These are genuinely just data, not behavior — safe to hoist into one declarative config table.

### 2.3 Genuinely section-specific (not configuration — different code paths)

| Aspect | Shop | Academy | Barista | Maintenance | Marketing | Print |
|---|---|---|---|---|---|---|
| `isDark` | **prop** (parent passes it) | **internal** `useThemeStore` | **internal** `useThemeStore` | **prop** | **internal** `useThemeStore` | **prop** |
| Extra data fetch | none | none | none | `useQuery(["/api/maintenance/profiles"])` to resolve a provider object for click-through | none | none |
| Click-through on row click | **none** | **none** | `BaristaDetailModal` + `RecruitDialog` (2 extra sibling modals, 2 extra `useState`s: `detailBaristaId`, `recruitTarget`) | `AgentDetailModal` + a `contact` mutation (`POST /api/messages/conversations`) (1 extra `useState`: `detailAgent`) | `MarketingDetailModal`, with the resulting "request quote" action **bubbled up to the parent page** via an `onRequestQuote` prop the component itself takes | **none** |
| Extra props beyond `{open, onClose, isDark?}` | none | none | none | none | **`onRequestQuote: (provider) => void`** (required) | none |

These three (Barista, Maintenance, Marketing) are not "the same component with different config" — they each compose a *different* per-service detail-modal component with a *different* prop contract (`onRecruit` vs `onContact` vs `onRequestQuote`), and Maintenance additionally needs its own extra list query to resolve a report row's `professionalId` back into a full marketplace-card object before it can open its detail modal. Forcing these three into one fully generic component would require either type-erasing the detail-modal prop to `any` (unsafe) or hard-coding a switch over all three detail-modal types inside the "shared" component (exactly the "unnecessarily complex generic framework" the task warns against).

## 3. Shared functionality (already consolidated, confirmed, do not touch)

- Modal shell, grabber, swipe-to-dismiss, pagination, loading/error/empty states, light/dark theme, accessibility (`VisuallyHidden` `DialogTitle`) — `EntityPublishedReportsModal` + `PublishedReportsList`.
- Data fetching, submit/admin/moderate mutations, cache invalidation — `createEntityReportHooks`.
- Real-time invalidation on publish — `use-realtime.ts` (one `invalidateQueries` call per service, already parallel/consistent).

## 4. Section-specific differences (must be preserved)

- `isDark` prop-vs-internal split (table §2.3).
- Barista's and Marketing's and Maintenance's click-through wiring and their distinct detail-modal prop contracts.
- Maintenance's extra `/api/maintenance/profiles` fetch + `contact` mutation.
- Marketing's `onRequestQuote` prop, which its parent page (`marketing-page.tsx:994-998`) relies on to open its own quote dialog.

## 5. Dependency and import map

Exactly one import site per file, no dynamic/lazy imports, no barrel re-exports (verified via repo-wide `grep -rl "blacklist-modal"`, excluding one unrelated comment mention in `pack-quick-view-modal.tsx` that is not an import):

| Component | Imported by | Render site |
|---|---|---|
| `ShopBlacklistModal` | `client/src/pages/cafe/browse-products.tsx:19` | line 1535 |
| `AcademyBlacklistModal` | `client/src/pages/cafe/barista/barista-academy-page.tsx:45` | line 609 |
| `BaristaBlacklistModal` | `client/src/pages/cafe/barista/barista-page.tsx:62` | line 951 |
| `MaintenanceBlacklistModal` | `client/src/pages/cafe/maintenance/maintenance-page.tsx:13` | line 1205 |
| `MarketingBlacklistModal` | `client/src/pages/cafe/marketing/marketing-page.tsx:59` | line 994 |
| `PrintBlacklistModal` | `client/src/pages/cafe/print/print-page.tsx:28` | line 960 |

## 6. Proposed shared component architecture

A **tiered** consolidation, sized to what's actually duplicated (not a single do-everything component):

1. **New shared icon**: a tiny `ReportedEntityBadge({ isDark })` (or an exported constant-returning function) in `client/src/components/shared/` holding the one byte-identical icon block. Removes 6× duplication, zero behavior change.
2. **New shared row-mapper**: `mapPublishedReportRow(raw, { idKey, nameKey, imageKey })` — a ~10-line helper (next to `PublishedReportRow`'s definition in `published-reports-list.tsx`, or its own `shared/published-report-row.ts`) that does the identical `{ id, professionalId: raw[idKey], professionalName: raw[nameKey], ..., rating: raw.rating, comment: raw.reason, createdAt: raw.createdAt, publishedAt: raw.resolvedAt }` mapping every `mapRow` already does by hand.
3. **New shared section config table**: one object/array (e.g. `BLACKLIST_SECTIONS` in `client/src/components/shared/blacklist-sections.ts`) keyed by section id (`SHOP | ACADEMY | BARISTA | MAINTENANCE | MARKETING | PRINT`), holding `{ title, subtitle, accentClassName, idKey, nameKey, imageKey }` from §2.2's table. Pure data, no behavior.
4. **New generic simple wrapper**: `SimpleBlacklistModal({ sectionId, open, onClose, isDark, usePublishedReports })` for the three sections with **no** click-through (Shop, Academy, Print) — looks up its config from step 3, builds its `mapRow` via step 2, renders its icon via step 1, and passes everything into the unchanged `EntityPublishedReportsModal`. Shop keeps passing `headerVariant="centered"` as an explicit prop (not baked into the config, since it's a one-off, not a section property).
5. **Barista/Maintenance/Marketing stay as dedicated wrapper files** (they are not "the same component," per §2.3) but are shortened by consuming the same config table + icon + mapper helpers from steps 1–3, keeping only their genuinely different click-through state/JSX.

This satisfies "use configuration for genuine differences" without forcing the three click-through sections into a shape they don't fit, and without inventing new API endpoints, payloads, or permission logic.

## 7. Proposed final file locations

- `client/src/components/shared/blacklist-sections.ts` — new, config table (step 3).
- `client/src/components/shared/reported-entity-badge.tsx` — new, shared icon (step 1).
- `client/src/components/shared/simple-blacklist-modal.tsx` — new, generic wrapper for Shop/Academy/Print (step 4).
- `client/src/components/published-reports-list.tsx` — add the `mapPublishedReportRow` helper (step 2) next to the existing `PublishedReportRow` type it already owns; no structural move.
- `client/src/components/shop/shop-blacklist-modal.tsx`, `academy/academy-blacklist-modal.tsx`, `print/print-blacklist-modal.tsx` — rewritten to a few lines each, calling `SimpleBlacklistModal` (kept at their current paths — each page already imports them by exact path, and keeping the per-service file as a one-line re-export avoids touching the 6 page files at all).
- `client/src/components/barista/barista-blacklist-modal.tsx`, `maintenance/maintenance-blacklist-modal.tsx`, `marketing/marketing-blacklist-modal.tsx` — kept, shortened internally (steps 1–3 reused), click-through logic untouched.

## 8. Files that can safely be deleted

**None**, under the recommended tiered architecture — every one of the six files stays in place (as either a direct `SimpleBlacklistModal` instantiation or a shortened dedicated wrapper), so none of the six page files (`browse-products.tsx`, `barista-academy-page.tsx`, `barista-page.tsx`, `maintenance-page.tsx`, `marketing-page.tsx`, `print-page.tsx`) need their imports touched at all. This is a deliberate choice to minimize risk and avoid the "migrate every usage" churn the task warns to do carefully — the six importers never need to change.

If a more aggressive consolidation is preferred instead — fully merging Shop/Academy/Print's wrapper files out of existence and having the three page files import `SimpleBlacklistModal` directly with a `sectionId` prop — that is possible too, but it means editing 3 page files' imports and render call-sites in addition to creating the new files. I recommend against this only because it adds migration risk for zero functional benefit; happy to do it instead if preferred.

## 9. Potential risks and compatibility requirements

- **Low risk**: icon extraction, mapRow helper, config table — pure data/no-op refactors, verified identical by direct byte comparison of the current six files.
- **Medium risk**: `isDark` is prop-based for 3 services and store-based for the other 3. `SimpleBlacklistModal` must accept `isDark` as a required prop (matching Shop/Print's existing contract) and Academy's wrapper (which currently reads `useThemeStore` itself) must keep doing so internally and pass the result down — i.e. **do not** change Academy's/Barista's/Marketing's external prop signature, since nothing else in this task requires it and changing it would be scope creep.
- **Medium risk**: Marketing's `onRequestQuote` prop is load-bearing for `marketing-page.tsx` — must be preserved exactly; it has no equivalent in the other two click-through services, confirming Marketing cannot be folded into a generic shape without that prop.
- **No risk to backend**: no server route, schema, or payload is touched by this refactor; `requireAuth`-only gating is unchanged.
- **Regression surface to watch**: `headerVariant="centered"` is Shop-only today — must remain Shop-only after refactor (verified not referenced by any other section).

## 10. Validation and testing plan (for Phase 2/3)

1. `npx tsc --noEmit`.
2. `npm run build`.
3. `grep -rl` for each of the six original filenames and for `BlacklistModal` component names — confirm every surviving reference is intentional (either the shortened file itself, or the unrelated comment mentions in `barista-detail-modal.tsx` / `print-company-detail-modal.tsx` that just name-drop the modal in prose, not as an import).
4. Confirm each of the six page files still renders successfully (same props passed, same component names importable) via `tsc` + build — no renames of exported component names, so no caller edits needed under the recommended (non-aggressive) architecture.
5. No automated test suite exists in this repo (confirmed in a prior session) — cannot run "existing tests."
6. Live browser testing: **not available in this environment** (no browser-automation tool). Any Phase 3 report must say so explicitly rather than imply the six sections were opened and clicked through in a real browser.

## Recommendation

Proceed with the **tiered** architecture in §6/§7: extract the one truly-identical icon block and the identical row-mapping logic into two small shared files, hoist the per-section labels/colors/field-names into one config table, and introduce `SimpleBlacklistModal` only for the three sections (Shop, Academy, Print) that have no click-through behavior. Leave Barista, Maintenance, and Marketing as their own dedicated wrapper files — shortened by reusing the three new shared pieces, but not force-merged into a single generic component, since their click-through logic genuinely differs in type (different detail-modal components, different prop contracts, Maintenance's extra data fetch, Marketing's parent-bubbled callback). This removes the only real byte-for-byte duplication (icon badge, row-mapping shape) without inventing a generic framework, without touching any API contract, permission check, or page-level import, and without forcing three structurally different components to pretend they're identical.
