# Notification date filters, dark mode & per-tab pagination audit

Scope: fix dark-mode rendering of the notification date filter and pagination
controls across Admin, Supplier, and Coffee Owner; add a 6-preset date-range
picklist next to the existing custom date filter on all three surfaces; and
confirm/complete independent pagination for every Coffee Owner notification
tab. No schema/API changes; all filtering stays client-side over the existing
`GET /api/notifications` query, same as every prior notification task this
session.

## Audit findings (Phase 1)

- **No real calendar-popup component exists in the app for date filtering.** The only "calendar" implementation (`client/src/components/ui/calendar.tsx`, `react-day-picker`-based) is unused by any notification/date-filter surface. What the task describes as "the calendar popup/modal" is actually the **browser's own native popup** that `<input type="date">` opens — a native OS/browser widget that cannot be restyled with ordinary CSS. This is the real root cause of "the calendar icon remains black" / "the popup doesn't follow dark mode": the native picker always renders in the OS/browser's own light theme unless the input is explicitly told otherwise via the standard `color-scheme` CSS property.
- **The fix already exists elsewhere in this exact codebase**: `client/src/components/barista/job-management-modal.tsx`, `job-post-form-modal.tsx`, and `maintenance-job-post-form-modal.tsx` already apply `className={... ${isDark ? "[color-scheme:dark]" : ""}}` to their own `<input type="date">` elements — the established, already-proven convention for this exact problem. Confirmed via direct read before writing any new code, rather than inventing a custom calendar component.
- **Date filtering today, before this task**: the previous task added a single-date `<input type="date">` (no presets) to all three notification surfaces (Admin/Supplier's shared `NotificationBellDropdown`, Coffee Owner's `NotificationModal`). The 7 professional accounts' `ProviderNotificationsPage` already has a full preset+custom `DateRangeFilter` (different component, different default/option set — `all`/`today`/`7d`/`30d`/`month`/`lastMonth`/`year`/`custom`), unaffected by this task's scope (Admin/Supplier/Coffee Owner only).
- **`resolveDateRange`/`DateRangePreset`** (`client/src/lib/marketplace-analytics.ts`) already implements every date-range definition the task requires, in local time, inclusive-through-present: `today` = `startOfDay(now)`→`endOfDay(now)`; `7d`/`30d` = now minus 6/29 days→`endOfDay(now)`; `month` = first-of-month→`endOfDay(now)`; `lastMonth` = first-to-last-moment of the previous calendar month; `year` = Jan 1→`endOfDay(now)`. All constructed via local `Date` arithmetic (`setHours`, `new Date(y, m, d)`), never `Date.UTC`, so there is no UTC/local boundary bug to fix — confirmed by reading the function before deciding to reuse it rather than writing new date logic.
- **Pagination dark-mode gap, before this task**: the `isDark` prop added to `DataPagination` in an earlier task only styled the record-count label, "Par page" label, the page-size `Select`, and the custom page-size `Input`. It did **not** style the Previous/Next buttons, the page-number buttons, the ellipsis, the "OK" button, or the "Page X / Y" indicator — all of which use shadcn `Button`'s `outline`/`ghost`/`default` variants, which read CSS-variable tokens (`--button-outline`, `bg-primary`, inherited text color) that only flip correctly under a real `.dark` ancestor class. Confirmed by reading `client/src/components/ui/button.tsx` directly — this is the actual, verified root cause of "pagination disappearing" in dark mode for the Coffee Owner notification modal (the only consumer using the `isDark` prop at all).
- **Coffee Owner notification tabs, before this task**: all 7 tabs (Tous/SHOP/PRINT/Maintenance/Barista/Academy/Marketing) already shared one `usePagination` instance plus a `pageByTab` map (from the task immediately preceding this one) that correctly isolates each tab's own page number. Confirmed by direct re-read — functionally complete already; nothing to rebuild, only the dark-mode/date-filter pieces around it needed changing.

## Implementation

### Phase 2 — Calendar dark mode (root-caused, not a new component)

Applied the standards-based `color-scheme: dark` fix (the same one already used by 3 other files in this codebase) to every native `<input type="date">` involved:
- New shared `NotificationDateFilter` component's custom-date input: `dark:[color-scheme:dark]` (activates under a real `.dark` ancestor — Admin/Supplier) plus an explicit `isDark ? "...[color-scheme:dark]" : ""` ternary (activates under the Coffee Owner's `isDark`-prop convention) — both conventions covered by the one component.
- The pre-existing shared `DateRangeFilter` (`client/src/components/analytics/date-range-filter.tsx`) used by Admin/Supplier Invoices/Payments and `ProviderNotificationsPage`: added `dark:[color-scheme:dark]` to its two custom-range date inputs — a purely additive, zero-behavior-change fix to the same root cause, applied once at the shared-component level rather than duplicated per page.

This single CSS property makes the browser render the ENTIRE native widget — icon, popup background, header/navigation, weekday labels, date cells, today/selected/hover/disabled states — in its native dark theme, satisfying every item in the Phase 2 checklist with no custom calendar UI to build or maintain, and switches instantly with the rest of the theme since it's driven by the same `isDark`/`.dark` signal already in place.

### Phase 3 — Date-range preset picklist

New component `client/src/components/notifications/notification-date-filter.tsx`:
- `NOTIFICATION_DATE_PRESETS`: exactly `Aujourd'hui, 7 derniers jours, 30 derniers jours, Ce mois, Mois précédent, Cette année`, in that order — a dedicated label/order set scoped to notification surfaces only, so the pre-existing `DateRangeFilter`'s own 8-option set (used by Invoices/Payments/`ProviderNotificationsPage`) was left completely untouched, avoiding "forcing unrelated pages to adopt new behavior."
- `filterNotificationsByDate(notifications, preset, customDate)`: the one filtering rule, reusing `resolveDateRange` for preset mode and the existing exact-local-day match for custom mode — defined once, imported by all three consumers (Admin/Supplier dropdown, Coffee Owner modal) so the rule can never drift between them.
- Mutual exclusivity: each consumer's `onPresetChange` clears `customDate`, and `onCustomDateChange` clears the preset — so the preset `Select` never shows a stale "active" value once a distinct custom date is chosen (shows its "Personnalisé" placeholder instead), and picking a preset after a custom date replaces it, exactly as required.
- Default: `useState<DateRangePreset | "">("today")` in all three consumers — "Aujourd'hui" filters the dataset immediately on mount (not merely a visual default), since `filtered` is derived from this same state.

### Phase 4 — Pagination dark-mode visibility (all consumers audited first)

Extended `DataPagination`'s existing `isDark` prop to additionally cover: the Previous/Next icon buttons (explicit dark background/border/text + disabled-state opacity), every page-number button (ghost variant gets explicit dark text; the active page keeps a clearly visible solid color), the ellipsis character, the custom-page-size "OK" button, and the "Page X / Y" indicator. Checked all ~50+ existing `DataPagination` consumers before changing it: every one of them either doesn't pass `isDark` at all (Admin/Supplier pages, the 7 professional shells — all under a real `.dark` ancestor, completely unaffected by this change since the new classes are gated behind `isDark &&`) or is the Coffee Owner notification modal (the one place that needs the fix). No regression risk to any other page.

### Phase 5 — Coffee Owner notification tabs

Confirmed (not rebuilt) that all 7 tabs already share the correct, independently-isolated pagination mechanism from the prior task. The only changes to this file in this task were swapping the single-date input for `NotificationDateFilter` and updating the filtering/empty-state text accordingly (see Phase 3). `usePagination`'s own `pageByTab`-driven restore/persist effects, and its `resetPage()` call on date-filter change, are unchanged and already correct.

## Files changed

- `client/src/components/notifications/notification-date-filter.tsx` (new) — shared preset+custom date filter UI and the `filterNotificationsByDate` rule.
- `client/src/components/ui/data-pagination.tsx` — extended `isDark` coverage to Previous/Next, page-number buttons, ellipsis, custom-size "OK" button, and the "Page X / Y" indicator.
- `client/src/components/analytics/date-range-filter.tsx` — added `dark:[color-scheme:dark]` to its two custom-range native date inputs (unrelated pages using this component get the same fix for free, with zero behavior change).
- `client/src/components/notifications/notification-bell-dropdown.tsx` (Admin + Supplier) — replaced the single-date input with `NotificationDateFilter`; default preset "today"; fetch limit simplified to a flat 200 (was conditionally 8/200) so every preset has a real batch to filter.
- `client/src/components/cafe/notification-modal.tsx` (Coffee Owner) — replaced the single-date input with `NotificationDateFilter` (passing `isDark`); fetch limit bumped 100→200 for the same reason; filtering/empty-state text updated to use the shared `filterNotificationsByDate` rule.

## Date-range definitions & timezone approach

Reused verbatim from `resolveDateRange` (`client/src/lib/marketplace-analytics.ts`) — no new date logic was written. All boundaries are computed with local-time `Date` arithmetic (`setHours(0,0,0,0)`/`setHours(23,59,59,999)`, `new Date(year, month, day)`), never `Date.UTC`, so a notification created near local midnight is never attributed to the wrong calendar day. `today`/`7d`/`30d`/`month`/`year` all end at `endOfDay(now)` (inclusive through the present moment, since nothing can be timestamped after "now" anyway); `lastMonth` spans the previous month's first moment through its exact final millisecond.

## Pagination status — all 7 Coffee Owner notification tabs

| Tab | Pagination | Notes |
|---|---|---|
| Tous | Working, independent | Shares the one `usePagination` + `pageByTab` mechanism; own page restored on tab switch |
| SHOP | Working, independent | Same mechanism |
| PRINT | Working, independent | Same mechanism |
| Maintenance | Working, independent | Same mechanism — confirmed not missing, as the task flagged for audit |
| Barista | Working, independent | Same mechanism — confirmed not missing |
| Academy | Working, independent | Same mechanism — confirmed not missing |
| Marketing | Working, independent | Same mechanism |

Switching tabs restores exactly where that tab was left; changing the date preset/custom date resets every tab to page 1 (since it changes every tab's underlying result set at once); totals and the visible-record range are always computed from the actual tab+date-filtered array, never hardcoded.

## Calendar and pagination dark-mode behavior — confirmed

- Calendar: the native date-picker icon and popup now follow dark mode via `color-scheme`, on all three surfaces (Admin/Supplier dropdown, Coffee Owner modal) plus the pre-existing shared `DateRangeFilter`.
- Pagination: every element listed in Phase 4's checklist now has an explicit dark-mode class, gated behind the same `isDark` prop that was already safely scoped to only the Coffee Owner modal.

## Tests executed

- `npx tsc --noEmit` — clean, after each incremental change (new component, `DataPagination` extension, each of the two consumer rewrites).
- `npm run build` — clean production build (client + server).
- Live verification via `curl` against the user's running Vite dev server confirmed: the new `NotificationDateFilter` component, its `color-scheme` classes, and `filterNotificationsByDate` are present; both the Admin/Supplier dropdown and the Coffee Owner modal are wired to the new component; `DataPagination`'s `isDark` prop now appears in all the newly-covered button/text locations; `DateRangeFilter`'s two custom inputs carry the new `color-scheme` class.

## Verified / Not verified / Not applicable

- **Verified**: TypeScript compiles; production build succeeds; every change is present in the live HMR-served module source; `resolveDateRange`'s existing boundary logic was read and confirmed correct for all 6 presets rather than assumed; all ~50+ existing `DataPagination` consumers were checked to confirm none of them pass `isDark` (so the Phase 4 change is additive-only and cannot regress them).
- **Not verified**: actual rendered-pixel behavior — opening each native date picker in a real dark-mode browser session to visually confirm the OS/browser renders it in dark colors (this depends on browser/OS support for `color-scheme`, which is universal in current Chrome/Firefox/Safari/Edge but was not launched and visually inspected here), clicking through each of the 6 presets on all three surfaces, and confirming the pagination controls' contrast at real desktop/mobile widths. No browser-automation tool is available in this environment, so this was verified via source reads, `tsc`/`build`, and live HMR-source `curl` checks only.
- **Not applicable**: no database/schema or API changes were made; no new backend date-filter parameters were introduced (filtering stays entirely client-side over the already `userId`-scoped `GET /api/notifications` response, so authorization/account isolation is unaffected).

## Remaining limitations

- The `color-scheme: dark` fix depends on browser support for that CSS property (universal in current major browsers, but a very old browser would silently fall back to its default native rendering — not a regression, just not improved there).
- No browser-automation tool is available in this environment; a real pass through the calendar popups and pagination controls in an actual browser (light/dark mode, desktop/mobile) is recommended before considering Phases 2 and 4 fully verified end-to-end.
- The 7 professional accounts' own `ProviderNotificationsPage` date filter (`DateRangeFilter`'s default "Tout" preset, full 8-option set) was intentionally left as-is — it was not in this task's scope (Admin/Supplier/Coffee Owner only) and already had working pagination and a working (if differently-labeled) preset filter before this task.
