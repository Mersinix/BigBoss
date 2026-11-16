# Additional pagination rollout — Categories, Orders, Reservations & Notifications

Scope: complete the pagination rollout to the remaining Admin Categories lists,
Supplier Categories lists, and all 9 sections inside the Coffee Owner "My
Account" panel's Orders and Reservations tabs. The Coffee Owner Notifications
modal was already fully covered by an earlier task and required no new code —
verified, not re-implemented. All 13 new pagination instances reuse the same
shared `usePagination`/`DataPagination` convention as every other list in the
app. No schema/API changes.

## Audit findings (before implementation)

- **Admin Categories tab naming gotcha, resolved**: the UI tab labeled **"Category Requests"** is implemented by the component `CategoryRequestsSection` (`client/src/pages/admin/categories-page.tsx`), which actually renders the supplier/professional-account approval list (users + their category mappings) — NOT `CatalogSuggestion` records. The UI tab labeled **"Supplier Categories"** is implemented by `SupplierCategoriesSection`, which actually renders the `CatalogSuggestion` list (new category/subcategory/brand/flavor/size proposals). The task's own two phase headings ("A. Category Requests", "B. Supplier Categories") match the UI tab labels exactly, so both were paginated exactly as the UI presents them to the Admin, regardless of the internal component-name/label mismatch.
- **Supplier Categories** ("My Categories" + "Category Requests") live as two tabs in one file, `client/src/pages/supplier/categories-page.tsx` (`MyCategoriesSection`, `CategoryRequestsSection`). Both confirmed scoped to the current supplier's own `userId` server-side (`GET /api/supplier/categories`, `GET /api/supplier/catalog-suggestions`) — no cross-supplier exposure, unaffected by adding pagination.
- **Coffee Owner Account Panel**: the "My Account" modal is `AccountPanel`, defined inline in `client/src/components/cafe/marketplace-layout.tsx`. Confirmed exact classification rules for the 4 Orders sections (`lib/order-date.ts`'s `getPrimaryOrderCategory`: Today = same-calendar-day effective date, Planifiées = future `scheduledAt`, Anciennes = everything else; Daily = a favorite/star flag layered orthogonally on top, not a date bucket) and the 5 Reservations sections' real data sources (Maintenance/Barista now read each module's own job-posting system — `useMyMaintenanceJobs`/`useMyBaristaJobs` — not a `*_reservations` table, per an earlier cleanup; PRINT/Marketing/Academy read `/api/print/orders`, `useMarketingProjects()`, `useAcademyRegistrations()` respectively, each already owner-scoped). None of these 9 sections had any pagination before this task.
- **Coffee Owner Notifications modal** (Phase 6): already fully implemented in an earlier task — one `usePagination` instance with a `pageByTab` map applies uniformly to whichever of the 7 tabs (Tous/SHOP/PRINT/Maintenance/Barista/Academy/Marketing) is active, so Maintenance/Barista/Academy already had working, independent pagination; nothing was missing. Verified by reading the current file and confirming all 7 tab labels plus the pagination wiring are present — no changes made.
- **Dark mode convention**: Admin/Supplier Categories pages render inside `DashboardLayout` (real `.dark`-class context) — no special prop needed. The Coffee Owner `AccountPanel` uses the `isDark`-prop/ternary convention (same family as `notification-modal.tsx`) — every new `<DataPagination>` added there passes `isDark={dk}`.

## Implementation — files changed

### Admin Categories (`client/src/pages/admin/categories-page.tsx`)
- `CategoryRequestsSection` (UI tab "Category Requests"): paginates `filtered` (the search/role-filtered user+mapping list). `resetPage()` wired into `search`/`roleFilter` changes and into `approveMutation`/`rejectMutation`'s `onSuccess` (approving/rejecting the last pending row on a page could otherwise strand pagination on an emptied page).
- `SupplierCategoriesSection` (UI tab "Supplier Categories"): paginates `filtered` (the type/status-filtered `CatalogSuggestion` list). `resetPage()` wired into `typeFilter`/`statusFilter` changes and into `approve`/`remove`'s `onSuccess`.

### Supplier Categories (`client/src/pages/supplier/categories-page.tsx`)
- `MyCategoriesSection` ("My Categories"): paginates `filteredMappings` for display only — the existing drag-and-drop reorder (`onDrop`) already resolves positions via `findIndex` against the full `orderedMappings` array by `category.id`, not by rendered index, so pagination doesn't interfere with it. `resetPage()` wired into `removeCategory`'s `onSuccess`.
- `CategoryRequestsSection` ("Category Requests"): paginates `filtered` (the `activeType`-filtered suggestion list). `resetPage()` wired into `activeType` tab changes and `remove`'s `onSuccess`.

### Coffee Owner Account Panel (`client/src/components/cafe/marketplace-layout.tsx`, plus 2 sub-components)
- **Orders tab** (Today/Planifiées/Daily/Anciennes): one `usePagination` instance + a `pageByTab`-style map (mirroring the notification modal's own pattern), lifted to the top level of `AccountPanel` since React hooks cannot be called inside the conditionally-invoked `activeTab === "orders"` render closure. Resets per-tab page on `ordersSubTab` change (restoring each tab's own remembered page) and resets all tabs to page 1 when the status filter changes.
- **Reservations → PRINT / Marketing / Academy**: three separate `usePagination` instances, likewise lifted to `AccountPanel`'s top level (same hooks-rules reason — these render as plain conditional JSX, not a function a hook could be called inside). Each sorts its array once at the top level (matching the exact sort already used for display) and slices that sorted array for both the count and the rendered page.
- **Reservations → Maintenance** (`client/src/components/cafe/maintenance-interventions-list.tsx`) and **→ Barista** (`client/src/components/cafe/barista-offres-list.tsx`): these are separate, dedicated components, so their `usePagination` call lives directly inside each component's own top level — no lifting needed. Barista's Missions/Offres sub-switch reuses the SAME component instance with a different `recordType` prop (no `key`), so its pagination explicitly resets on `recordType` change to avoid carrying a stale page number from the other list.
- All 6 new `<DataPagination>` instances in this file/its two sub-components pass `isDark={dk}` (or the equivalent `dk` prop already threaded into the two sub-components), since none of them sit under a real `.dark` ancestor class.

### Coffee Owner Notifications modal
No changes — already complete from an earlier task, confirmed by direct re-read.

## Independent pagination state — confirmed

- Admin/Supplier Categories: each of the 4 lists (2 Admin + 2 Supplier) has its own `usePagination` instance in its own component scope — no shared state between them.
- Orders tab: one shared hook instance with a `pageByTab` map keyed by sub-tab id, so switching between Today/Planifiées/Daily/Anciennes restores each tab's own last-viewed page rather than carrying over another tab's page number (changing the status filter resets all four at once, since it changes every tab's underlying result set simultaneously).
- Reservations tab: 5 fully independent `usePagination` instances (Maintenance, Barista, PRINT, Marketing, Academy) — switching the Reservations sub-switcher never touches another section's page state, since each lives in its own component or its own top-level variable.

## Dark-mode compatibility — confirmed

- Admin/Supplier Categories' 4 new `<DataPagination>` calls: no `isDark` prop needed or passed, matching the ~57-file convention for pages under a real `.dark` ancestor (`DashboardLayout`).
- Coffee Owner Account Panel's 6 new `<DataPagination>` calls (Orders + PRINT + Marketing + Academy + Maintenance + Barista): all pass `isDark`/`dk`, activating the same explicit dark-class override added to `DataPagination` in the immediately preceding task — confirmed this is the only context in this task's scope that needed it, since every other new instance already renders under a real `.dark` class.

## Tests executed

- `npx tsc --noEmit` — clean after every incremental change (checked after Admin Categories, after Supplier Categories, and again after the full Coffee Owner Account Panel pass).
- `npm run build` — clean production build (client + server).
- Live verification via `curl` against the user's running Vite dev server confirmed all 13 new pagination instances are present in the HMR-served module source, and separately confirmed the Coffee Owner Notifications modal's 7 tabs and pagination wiring are unchanged/intact.

## Verified / Not verified / Not applicable

- **Verified**: TypeScript compiles; production build succeeds; every new pagination instance is confirmed present in the live HMR-served source; the drag-and-drop reorder in Supplier "My Categories" and the up/down reorder in Admin's earlier `CategoriesTab` work were confirmed index-safe against pagination (both resolve position by id/global-index, not rendered-row-index); account isolation for Supplier's two lists was confirmed via the existing `userId`-scoped server routes (unchanged by this task).
- **Not verified**: actual rendered-pixel/interactive browser behavior — clicking through next/previous/page-size changes on each of the 13 new lists, visually confirming independent page state when switching Orders sub-tabs or the Reservations sub-switcher, and confirming the Coffee Owner Account Panel's dark-mode "Par page" selector renders correctly at real desktop/mobile widths. No browser-automation tool is available in this environment, so this was verified via source reads, `tsc`/`build`, and live HMR-source `curl` checks only.
- **Not applicable**: no database/schema or API changes were made in this task.

## Remaining limitations

- No browser-automation tool is available in this environment; a real pass through each of the 13 new pagination instances (and the 7 already-complete notification tabs) in an actual browser — light/dark mode, desktop/mobile — is recommended before considering this fully verified end-to-end.
- Approving/rejecting/removing a record while viewing a later page now calls `pagination.resetPage()` explicitly in every mutation's `onSuccess` where this was flagged as a risk during the audit (Admin's two Categories lists, Supplier's two Categories lists) — this was not explicitly requested for the Coffee Owner Account Panel's Orders/Reservations actions (cancel order, accept/reject quote, etc.), since `usePagination`'s own internal `safePage = Math.min(page, totalPages)` clamp already prevents landing on a page past the end of a shrunk list; no hard regression is possible there, just a silent snap-back to the last valid page, which was judged acceptable without further explicit wiring given the task's "do not perform unrelated refactoring" constraint.
