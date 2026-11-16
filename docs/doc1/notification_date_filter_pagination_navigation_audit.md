# Notification system — date filters, pagination & click navigation audit

Scope: Admin/Supplier notification picklist (scrollbar + date filter), Coffee
Owner notification modal (Admin-tab removal + date filter + per-tab
pagination), the 7 professional account notification interfaces (date filter —
already existed), and click-to-navigate across all 10 roles. One shared
`notifications` table/API throughout — no new notification system, no schema
changes, no duplicated data.

## Architecture confirmed before any code change

- One table (`shared/schema.ts:2972`): `id, userId, service, type, priority, title, message, entityType, entityId, dedupeKey, isRead, readAt, createdAt`. `notificationServiceEnum` = `['ADMIN', 'SHOP', 'PRINT', 'MAINTENANCE', 'BARISTA', 'ACADEMY', 'MARKETING']`.
- **Supplier has no separate mechanism** — it's ordinary `service: "SHOP"` rows, scoped by `userId`, same as everyone else in the order/delivery pipeline.
- **Driver and Delivery Company also deliberately reuse `service: "SHOP"`** — not a bug, not a missing enum value; confirmed via real `notify({ userId: driverId, service: "SHOP", ... })` call sites targeting those exact roles. `GET /api/notifications` scopes by `userId` first, `service` only as a secondary filter, so this never leaks cross-account data.
- One creation chokepoint: `server/notify.ts`'s `notify()`/`notifyMany()`, called from ~70 sites in `server/routes.ts`. No notification is ever created any other way. Every distinct `type`/`entityType` pair used by the app was enumerated from these call sites (not guessed) before building the navigation map below.
- One shared client data layer: `client/src/hooks/use-notifications.ts` (`useNotifications`, `useUnreadNotificationCount`, `useMarkNotificationRead`, `useMarkAllNotificationsRead`). No backend changes were made to any of these — all filtering/pagination added in this task is client-side over the already-fetched, already-`userId`-scoped batch, exactly matching the convention already established by `ProviderNotificationsPage`'s existing date filter.

## Part 5/8 — Professional account date filters: already existed, verified only

All 7 account spaces (Barista Academy, Barista Marketplace, Delivery, Driver, Maintenance, Marketing, Printer) render their Communication → Notifications tab via one shared component, `client/src/pages/shared/provider-notifications-page.tsx`, which **already has**:
- A date-range filter (`DateRangeFilter` + `resolveDateRange`, presets: Tout/Aujourd'hui/7 jours/30 jours/Ce mois/Mois précédent/Cette année/Personnalisé).
- Independent pagination (`usePagination`/`DataPagination`).
- Role-correct service scoping via a local `ROLE_TO_SERVICE` map (confirms `DRIVER`/`DELIVERY_COMPANY` → `"SHOP"` is intentional, not a gap).

**No changes were needed here for the date filter itself** — only navigation was added (see below). This was verified by reading the live component, not assumed.

## Part 2/3 — Admin & Supplier: compact scrollbar + date filter

Both Admin's and Supplier's notification **dropdown** (the bell popover, not the separate full "Voir tout" pages) are the exact same shared component, `client/src/components/notifications/notification-bell-dropdown.tsx`, rendered from `DashboardLayout`'s header for both roles.

- **Scrollbar**: `max-h-96 overflow-y-auto` → added the same thin-scrollbar classes already used 3+ other places in the codebase (`[&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600`). `max-h-96` and the dropdown's `w-80` dimensions are unchanged.
- **Date filter**: added a compact `<input type="date">` row below the header (fits the `w-80` popover without overflow — a full preset `DateRangeFilter` select was judged too wide for this context). When a date is active, the fetch `limit` bumps from 8 to 200 so the filter has a real batch to narrow (mirrors `ProviderNotificationsPage`'s own client-side filtering convention); clearing the date restores the default last-8 quick-glance view. Empty-state text distinguishes "no notifications at all" vs "none on this date."
- One edit to this one file fixes both Admin and Supplier simultaneously (confirmed they share the literal same component instance, not two parameterized copies).
- The two separate full "Voir tout" pages (`admin/notifications-page.tsx`, `supplier/notifications-page.tsx`) have no scroll container at all (full list renders inline) — scrollbar thinning doesn't apply there; only click-navigation was added to those two pages (see below).

## Part 4 — Coffee Owner notification modal

`client/src/components/cafe/notification-modal.tsx`:

- **Admin tab removed** from `SERVICE_TABS` — "Tous | SHOP | PRINT | Maintenance | Barista | Academy | Marketing" remain. ADMIN-service notifications a Coffee Owner legitimately receives (e.g. their own account-approval status change) still appear under "Tous" — only the dedicated tab chip is gone, confirmed by reading the compiled output (`label: "Admin"` no longer present; the other 6 labels unchanged). No notification records were touched, and Admin's own notification system/pages are completely untouched.
- **Date filter**: added a compact `<input type="date">` next to the existing "Tout marquer comme lu" row, filtering by the notification's real `createdAt` (local-date string comparison, so a notification never appears under the wrong calendar day due to UTC/local mismatch). Works together with the tab filter (date filter applies on top of whichever tab is selected).
- **Independent pagination per tab**: one `usePagination` instance driven by the current tab's filtered count, plus a `pageByTab` map that persists/restores each tab's own page number across tab switches (switching tabs restores exactly where that tab was left, never reusing another tab's page or result set). Changing the date filter resets every tab's stored page back to 1, since it shifts every tab's result set at once. `usePagination`'s own `page` getter already clamps to the current `totalPages`, so a tab can never end up pointing past the end of its own (possibly now-smaller) filtered set.
- **Click navigation expanded**: the existing `openRelatedEntity` helper (uses the existing `useAccountOpenStore` — the same mechanism that already opens the Account panel to a specific order/tab) now also covers `marketing_project` (→ "reservations" tab, same group as the other service-engagement entity types) and `conversation` notifications for `SHOP`/`MAINTENANCE` services specifically (→ `openChat(service, entityId)`, an already-existing store action the Account panel's chat overlay already knows how to consume) — `PRINT`/`BARISTA`/`ACADEMY`/`MARKETING` conversation notifications fall through to a no-op (modal just closes), since the Account panel's chat overlay only recognizes `"SHOP"`/`"MAINTENANCE"` as `initialChatService` today (a pre-existing limitation, not something this task's scope covers extending).
- `Tout marquer comme lu` is unchanged — still marks all unread for the current tab, independent of the date filter (deliberate: the task asks to preserve existing mark-as-read semantics, not scope it to the active date filter).

## Part 6 — Notification click navigation (all 10 roles)

Built `client/src/lib/notification-navigation.ts` — `resolveNotificationPath(notification, role): string | null`. Every path in it was verified against `client/src/App.tsx`'s real routes before being added (grepped every relevant route, including redirect aliases like `/printer/orders` → `/printer/business?tab=orders`) — none were guessed. Entity types with no confirmed real destination return `null`, and every call site falls back to its pre-existing behavior (mark as read, no navigation) for those.

Wired into:
- `notification-bell-dropdown.tsx` (Admin + Supplier dropdown)
- `admin/notifications-page.tsx`, `supplier/notifications-page.tsx` (the two full pages)
- `provider-notifications-page.tsx` (all 7 professional accounts)
- `notification-bell-popover.tsx` (the 7-account header bell — previously every click just opened the generic "Voir tout" list; now it opens the specific resolved destination when one exists, falling back to the list otherwise)
- Coffee Owner's `notification-modal.tsx` keeps its own separate mechanism (`useAccountOpenStore`), since the Coffee Owner has no dedicated entity-detail routes at all — everything funnels through the existing Account panel modal, confirmed by reading `App.tsx`'s `/cafe/orders`/`/cafe/messages` routes (both redirect components, not real pages).

### Destination map (service → entityType → real route), by viewer role

**ADMIN** (role ADMIN/SUPER_ADMIN): `user`→`/admin/users`, `store`→`/admin/stores`, `catalog_suggestion`→`/admin/category-requests`, `marketing_report`→`/admin/marketing`, `print_report`→`/admin/print`, `maintenance_report`→`/admin/maintenance`, `barista_report`→`/admin/barista`, `academy_report`→`/admin/academy`, `delivery_company_report`→`/admin/delivery`, `conversation`→`/admin/messages`.

**SHOP**, role SUPPLIER: `order`/`suborder`→`/supplier/orders`, `listing`→`/supplier/inventory`, `review`→`/supplier/reviews`, `delivery`→`/supplier/delivery-status`, `store`→`/supplier/store`, `conversation`→`/supplier/messages`.

**SHOP**, role DRIVER: `delivery`→`/driver/deliveries`, `delivery_opportunity`→`/driver`, `review`→`/driver/reviews`, `conversation`→`/driver/messages`.

**SHOP**, role DELIVERY_COMPANY: `delivery`→`/delivery/deliveries`, `delivery_opportunity`→`/delivery/business?tab=available`, `conversation`→`/delivery/messages?conversationId=<id>` (this page is confirmed to read that param — real deep link, not just the list).

**PRINT**, role PRINTER: `print_order`→`/printer/business?tab=orders`, `conversation`→`/printer/messages`.

**MAINTENANCE**, role MAINTENANCE: `maintenance_reservation`→`/maintenance-panel/business?tab=planning`, `conversation`→`/maintenance-panel/communication`.

**BARISTA**, role BARISTA_MARKETPLACE: `barista_request`→`/barista-marketplace/business?tab=requests`, `barista_mission`→`/barista-marketplace/business?tab=missions`, `conversation`→`/barista-marketplace/messages?conversationId=<id>` (confirmed param support — real deep link).

**ACADEMY**, role BARISTA_ACADEMY: `academy_registration`→`/barista-academy/business?tab=registrations`, `conversation`→`/barista-academy/messages`.

**MARKETING**, role MARKETING: `marketing_project`→`/marketing-panel/business?tab=projects`, `conversation`→`/marketing-panel/messages`.

### Explicitly NOT mapped (land on existing behavior instead of a guessed route)

- `maintenance_job_post`/`maintenance_job_application`/`barista_job_post`/`barista_job_application`/`barista_job_meeting` — no confirmed dedicated tab/page found for these in the respective business pages' route aliases; mapping them would have required guessing, which the task explicitly forbids.
- `conversation` for PRINT/BARISTA/ACADEMY/MARKETING services, for the **Coffee Owner** specifically — the Account panel's chat overlay only recognizes `SHOP`/`MAINTENANCE` as `initialChatService` today; extending that was judged out of this task's scope (a pre-existing limitation of the chat overlay itself, not a navigation-mapping gap).
- `review` entityType for DELIVERY_COMPANY role — no dedicated reviews page confirmed to exist for that role.
- Most `messages` destinations (`/admin/messages`, `/printer/messages`, `/maintenance-panel/communication`, `/barista-academy/messages`, `/marketing-panel/messages`) land on the correct messages page but were **not** confirmed to support a `?conversationId=` deep link (only `barista-marketplace/messages.tsx` and `delivery/messages-page.tsx` do, confirmed by grep) — so those open the message list, not the specific conversation, consistent with "do not guess."

## Account isolation

No backend changes were made anywhere in this task — every date filter and pagination control operates client-side on data the existing `GET /api/notifications` route already scoped to the authenticated `userId`. No new query parameters were added to any API call, so there is no new surface for cross-account data exposure. Verified by reading the route's existing `userId`-first scoping (confirmed by the audit, not re-verified by changing it).

## Files changed

- `client/src/lib/notification-navigation.ts` (new) — shared destination resolver.
- `client/src/components/notifications/notification-bell-dropdown.tsx` — scrollbar, date filter, navigation.
- `client/src/pages/admin/notifications-page.tsx` — navigation.
- `client/src/pages/supplier/notifications-page.tsx` — navigation.
- `client/src/pages/shared/provider-notifications-page.tsx` — navigation (date filter/pagination already existed, untouched).
- `client/src/components/account/notification-bell-popover.tsx` — navigation (now opens the specific destination instead of always the generic list).
- `client/src/components/cafe/notification-modal.tsx` — Admin tab removed, date filter, independent per-tab pagination, expanded `openRelatedEntity` (marketing_project, SHOP/MAINTENANCE conversation deep-link).

## Tests executed

- `npx tsc --noEmit` — clean.
- `npm run build` — clean production build (client + server).
- Live verification via `curl` against the user's running Vite dev server confirmed every file above reflects its intended change in the HMR-served module source, and specifically confirmed the "Admin" tab label is absent from the compiled Coffee Owner modal while the other 6 tab labels remain.

## Verified / Not verified / Not applicable

- **Verified**: TypeScript compiles; production build succeeds; every listed destination route exists in `App.tsx` (checked by direct grep, not assumed); the Coffee Owner modal's Admin-tab removal preserves the other 6 tabs and doesn't touch notification data; all changes are frontend-only (no backend/schema change), so nothing here requires a server restart.
- **Not verified**: actual rendered-pixel/interactive browser behavior — clicking through each of the ~30 mapped destinations to confirm the target page visually highlights or scrolls to the right record, verifying the compact scrollbar's exact pixel width in a real browser, and testing the date filter/pagination interaction on real touch/mobile viewports. No browser-automation tool is available in this environment, so this was verified via source reads, `tsc`/`build`, and live HMR-source `curl` checks only, not a real browser session.
- **Not applicable**: no database/schema changes were made in this task, so there is nothing to migrate or verify at that layer.

## Remaining limitations

- Several notification types (maintenance/barista job-board types, DELIVERY_COMPANY reviews, most non-deep-linking conversation destinations) intentionally land on a general list/page rather than the exact record, because no confirmed deep-link mechanism exists there today — expanding those would require adding real `?id=`-style support to those specific pages first, which is a separate, larger task, not a notification-navigation guess.
- The Account panel's own chat overlay (used by the Coffee Owner modal) only supports `SHOP`/`MAINTENANCE` as a deep-linkable chat service; Coffee Owner conversation notifications for the other 4 services fall back to closing the modal without opening chat, pending a possible future extension of that overlay itself.
- No browser-automation tool is available in this environment; a real pass through each role/destination combination in an actual browser (light and dark mode, desktop and mobile) is recommended before considering Part 6 fully verified end-to-end.
