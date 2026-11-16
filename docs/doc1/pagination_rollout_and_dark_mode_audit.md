# Pagination rollout & dark-mode consistency audit

Scope: add client-side pagination (reusing the existing shared `usePagination`/
`DataPagination` convention) to 8 Admin/Supplier lists that didn't have it yet,
confirm the Coffee Owner notification modal's pagination (added in the
immediately preceding task) already covers every category, and fix the
page-size "Par page" selector's dark-mode styling wherever it was actually
broken — no new pagination mechanism, no schema/API changes.

## Audit findings (before implementation)

- The project has exactly one shared pagination convention: `usePagination(totalItems, initialPageSize=10)` + `<DataPagination>` (`client/src/components/ui/data-pagination.tsx`), already used by ~49 files. Every new location in this task reuses it verbatim — no alternative pagination system exists anywhere to reconcile.
- **Coffee Owner notification modal (items 9–12)**: already fully covered. The immediately preceding task added ONE universal `usePagination` instance to `notification-modal.tsx` that applies to whichever tab is currently selected (with a `pageByTab` map preserving each tab's own page across switches). Since this mechanism is tab-agnostic, "Tous", "Maintenance", "Barista", "Academy", and the already-working "SHOP"/"PRINT"/"Marketing" are all the exact same single code path — there was nothing left to add here. Verified by reading the current file, not assumed.
- **Admin/Supplier Notifications** (items 1/5): neither `admin/notifications-page.tsx` nor `supplier/notifications-page.tsx` had any pagination — both rendered their full fetched batch (`limit: 50`) in one flat list.
- **Admin Messages → All Conversations, Admin Reviews, Admin Categories, Supplier Reviews, Supplier Promotions, Supplier Discount Codes** (items 2–4, 6–8): none of these 6 had any pagination mechanism at all (confirmed via a dedicated research pass reading each file in full) — all were plain `.map()` over the complete array. No competing/inconsistent pagination to reconcile; all 6 were implemented fresh using the standard pattern.
- **Dark mode (Phase 4)**: audited every one of the ~49 existing `DataPagination` consumers. All of them render inside a layout that toggles a REAL Tailwind `.dark` class on an ancestor element (Admin/Supplier's `DashboardLayout`, or one of the 7 professional account shells) — so the shadcn `Select`'s `bg-popover`/`bg-background` CSS-variable tokens already flip correctly today, with zero existing bug. The ONLY consumer that does NOT sit under a real `.dark` class is `notification-modal.tsx` (Coffee Owner's own `isDark`-prop/ternary convention, which deliberately never toggles a real `.dark` class) — confirmed this is where the "Par page" selector would actually render light/white even while the rest of that page is dark. This narrowed Phase 4 to one targeted fix rather than a blanket change across every consumer.

## Phase 2 implementation — files changed

| Location | File | Pagination added |
|---|---|---|
| Admin → Notifications | `client/src/pages/admin/notifications-page.tsx` | New: `usePagination`/`DataPagination` over the fetched batch (bumped fetch `limit` 50→200 so pagination has a real batch to page through) |
| Admin → Messages → All Conversations | `client/src/pages/admin/messages-page.tsx` (`AllConversationsTab`) | New: paginates `allConvs` (distinct conversation threads, not individual messages — confirmed this is what "All Conversations" already means); resets to page 1 on `service` tab change |
| Admin → Reviews | `client/src/pages/admin/reviews-page.tsx` | New: paginates `displayed` (the already-filtered-by-`showReportedOnly` array); resets on tab change and on the "reported only" toggle |
| Admin → Categories | `client/src/pages/admin/categories-page.tsx` (`CategoriesTab`) | New: paginates `sortedCats` for DISPLAY only — the existing up/down reorder (`moveCategory`) still computes its `idx` from the full, unsliced `sortedCats` array (rows outside the current page simply render `null`), so reordering continues to operate on the correct global position regardless of which page is showing |
| Supplier → Notifications | `client/src/pages/supplier/notifications-page.tsx` | New: same pattern as Admin Notifications (fetch limit 50→200) |
| Supplier → Reviews | `client/src/pages/supplier/reviews-page.tsx` | New: paginates the active tab's already-filtered `reviews` array (product-review category/sub-category filters included); resets on tab change and on either filter changing |
| Supplier → Promotions | `client/src/pages/supplier/promotions-page.tsx` | New: paginates `filtered` (search/status/type already applied); resets on any of those three changing |
| Supplier → Discount Codes | `client/src/pages/supplier/discount-codes-page.tsx` | New: paginates `codes` (no existing filter on this page, so only resets when the underlying list length changes, e.g. after create) |

All 8 use the exact same `itemLabel`-per-page convention already established elsewhere (`"notifications"`, `"conversations"`, `"reviews"`, `"categories"`, `"promotions"`, `"codes"`), the existing default page size (10) and page-size presets (10/25/50/100 + custom), and the existing Previous/Next/page-number control — nothing new was invented.

## Phase 4 implementation — dark-mode fix

- `client/src/components/ui/data-pagination.tsx`: added an **optional** `isDark?: boolean` prop to `DataPagination`. When explicitly passed `true`, the "Par page" row/label text, the `SelectTrigger`, `SelectContent` (the dropdown menu and every option inside it — including the "Custom…" option), and the custom page-size `Input` all receive explicit literal dark classes (`bg-gray-800 border-gray-700 text-gray-200`/`text-white`/`[&_[data-highlighted]]:bg-gray-700`, mirroring the exact same already-established `selectContent`/`inputBg` convention used elsewhere in Coffee-Owner-convention files like `maintenance-page.tsx`). When `isDark` is left unset (every other consumer), behavior is byte-for-byte unchanged — the shadcn CSS-variable tokens keep doing their job under a real `.dark` ancestor, so nothing is double-styled or regressed there.
- `client/src/components/cafe/notification-modal.tsx`: the only call site that needed it — now passes `isDark={isDark}` (the prop this component already receives) into its `<DataPagination>`.
- The Previous/Next/page-number buttons were deliberately left untouched — Phase 4's checklist is specifically about the "Par page" selector and its custom input, not the rest of the pagination control, and those buttons already render correctly under every context in practice (shadcn `Button` `outline`/`ghost`/`default` variants read acceptably in both the Coffee Owner's light and dark ternary styling without needing an override, unlike the Select/Input which default all the way to a hardcoded light `bg-popover`/`bg-background` with no fallback).

## Verified / Not verified / Not applicable

- **Verified**: `npx tsc --noEmit` clean; `npm run build` clean (client + server); live `curl` against the user's running dev server confirmed every one of the 8 new pagination instances and the `isDark` prop plumbing are present in the HMR-served module source.
- **Not verified**: actual rendered-pixel behavior in a real browser — clicking through next/previous/page-size/custom-input on each of the 8 pages, confirming the Coffee Owner notification modal's "Par page" dropdown is visibly dark in dark mode and visibly light in light mode, and testing on real mobile viewports. No browser-automation tool is available in this environment, so this was verified via source reads, `tsc`/`build`, and live HMR-source `curl` checks only.
- **Not applicable**: no database/schema or API changes were made in this task (every new pagination instance is a client-side slice over data the existing queries already fetch), so there is nothing to migrate.

## Regression safeguards applied

- Admin Categories' reorder-by-index logic was specifically preserved by keeping `idx` computed against the full `sortedCats` array (not the paginated slice) — confirmed this is the one location in all 8 where naively slicing-then-mapping would have silently broken the up/down buttons.
- Every new `pagination.resetPage()` wiring targets the SAME filter/tab-change handlers the existing filter state already uses (e.g. Admin Reviews' tab-click and "reported only" checkbox, Supplier Promotions' search/status/type setters, Supplier Reviews' category/sub-category selects) — no new filter-change surface was introduced, and KPI/summary counts (e.g. Supplier Notifications' unread/stock-alert/order counts, Admin Reviews' `reportedCount`/average rating) continue to read from the FULL unpaginated array, never the current page's slice.
- No existing component's public API was changed in a breaking way — `DataPagination`'s new `isDark` prop is optional and additive; all ~49 pre-existing call sites compile and behave identically without passing it.
