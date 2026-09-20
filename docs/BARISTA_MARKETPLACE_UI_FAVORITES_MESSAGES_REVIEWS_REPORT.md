# Barista Marketplace — Account UI, Favorites, Messages & Reviews Synchronization

Follow-up to `BARISTA_MARKETPLACE_IMPLEMENTATION_REPORT.md`. Scope: replace the Barista Marketplace account's sidebar with a top switcher (organizational concept borrowed from Maintenance, not its functionality), persist Barista favorites end-to-end, add a real Messages tab reusing the existing conversations system, and add a real Avis (Reviews) tab. No unrelated module was touched.

## Changed

- **Account layout** — the 6 existing Barista Marketplace routes (`/barista-marketplace`, `/profile`, `/requests`, `/missions`, `/revenue`, `/settings`) no longer render inside `DashboardLayout`/`AppSidebar`. A new `BaristaAccountShell` (`client/src/components/layout/barista-account-shell.tsx`) wraps them instead: a header (icon, "Espace Barista Marketplace", user name, sign-out) plus a sticky, horizontally-scrollable top tab switcher with real routes for all 8 sections. The dead `BARISTA_MARKETPLACE` branch was removed from `app-sidebar.tsx` (it can no longer be reached — the shell replaces it, nothing else referenced it).
- **Two new account pages**: `messages.tsx` and `reviews.tsx`, added to the switcher and to `App.tsx` as real routes (`/barista-marketplace/messages`, `/barista-marketplace/reviews`).
- **`/` root route**: added a `BARISTA_MARKETPLACE` redirect to `/barista-marketplace`, mirroring the existing `CAFE_OWNER → /products` and `MAINTENANCE → <MaintenanceDashboard/>` special cases already in `HomeRoute`.
- **Favorites now persist**: `toggleBaristaMarket`/`removeBaristaMarket` in the Zustand store (`use-favorites.ts`) now call the new favorites API (previously in-memory only), and two new store methods (`hydrateBaristaMarket`, `syncBaristaMarket`) resolve favorited IDs against live profiles — mirroring `toggleMaintenance`/`syncMaintenance` exactly.
- **Coffee Owner Favorites modal** (`FavoritesPanel` in `marketplace-layout.tsx`): added the same favorites-sync-on-open effect the Maintenance tab already had, so the Barista tab shows real, live data instead of whatever was toggled in the current tab only.
- **Public `/barista` page**: added the same favorite-hydration-on-load effect Maintenance's public page has, so hearts reflect true saved state immediately on visiting the page (not only after opening the modal).
- **Admin → System Management → Messages System**: added a "Barista ↔ Coffee Owner" toggle row, using the same component and pattern as the existing Supplier/Maintenance rows.
- **Messaging eligibility gap closed**: `hasEligibleMessagingRelationship`'s `BARISTA` branch was missing the admin on/off check that Shop and Maintenance already had — added. `getEligibleContacts` had no branch at all for the `BARISTA_MARKETPLACE` role (a Barista calling it got an empty contact list) — added, mirroring the existing `MAINTENANCE` branch exactly.

## Reused

- **Messaging**: the existing `conversations`/`messages`/`conversationParticipants` tables, `POST/GET /api/messages/conversations`, `POST .../messages`, `PATCH .../read`, `GET /api/messages/unread-count`. The new Messages page is a direct adaptation of `MaintenanceMessages` (the inline component in `maintenance/dashboard.tsx`), filtered to `service === "BARISTA"` — no new tables, no new endpoints for sending/receiving messages.
- **Reviews**: the existing `supplierProductReviews` table (already extended for Barista in the prior session) and `useBaristaReviews` hook (already built in the prior session). The new Avis page only adds a display, no new data path.
- **Post-closure grace window**: `isConversationMessagingAllowed`'s `relationshipClosedAt` + `gracePeriodMinutes` logic is fully generic across services — it started working for Barista automatically once the eligibility branch existed. No separate Barista-specific timer was built, per instruction.
- **Admin-always-has-access rule**: unchanged — `isConversationMessagingAllowed` still returns `true` immediately for admins before checking `globalVisible`.
- **Realtime**: the existing WebSocket `broadcast()`/`broadcastToUsers()` plumbing and the `BARISTA_EVENTS` list already added in the prior session.

## Database

- New table `barista_marketplace_favorites` (`id`, `user_id`, `barista_user_id`, `created_at`) — additive, mirrors `maintenance_favorites` field-for-field. This is the "already exists" table referenced in the task; it did not actually exist yet (verified before writing any code — the prior session had explicitly deferred it), so it was created now rather than reused from thin air.
- New column `messaging_settings.barista_messaging_enabled boolean not null default true` — additive, backfilled automatically by Postgres for the existing row.
- Applied via `npx drizzle-kit push --force` (the project's confirmed migration mechanism). No table dropped, no column removed, no data touched.

## API

- `GET /api/barista-favorites`, `POST /api/barista-favorites`, `DELETE /api/barista-favorites/:baristaUserId` — new, mirror the `/api/maintenance-favorites` endpoints (auth-gated, ownership-scoped to `req.session.userId`, duplicate-insert guarded, broadcasts `barista_favorite_updated`).
- `PATCH /api/admin/messages/settings` — Zod schema extended with `baristaMessagingEnabled: z.boolean().optional()`.
- No other endpoints changed. `GET /api/messages/settings` picks up the new field automatically (it returns whatever `getMessagingSettings()` returns).

## Realtime

- `barista_favorite_updated` added to `BARISTA_EVENTS` in `use-realtime.ts`, invalidating `/api/barista-favorites` on receipt — a favorite toggled in one tab/window updates every other open tab's favorites state without a manual refresh.
- Messages: reused the existing `new_message`/`conversation_updated` events and 30s `refetchInterval` polling fallback already present in every other messaging surface (Shop, Maintenance) — the new Barista Messages page uses the identical pattern, so it is exactly as realtime as the rest of the app's messaging, no more, no less.
- Reviews: reused the existing `barista_review_created` broadcast (added in the prior session) — the new Avis page's `useBaristaReviews` query is invalidated by it automatically via the existing `BARISTA_EVENTS` handling block.

## Responsive

- The tab switcher uses the exact CSS technique already proven on Maintenance's own tab bar and the Favorites modal's service switcher: `overflow-x-auto` with `scrollbarWidth: "none"`, so on narrow screens it scrolls horizontally instead of wrapping or overflowing the page.
- Header uses `min-w-0`/`truncate` on the name/title and hides the "Se déconnecter" label text below `sm:` (icon-only button remains tappable), so long names don't push the sign-out button off-screen on small phones.
- Messages page conversation list/thread view and the Avis page cards reuse the existing `Card`/flex-column patterns already used throughout the other account pages (Profile, Requests, etc.), which are already responsive.
- **CANNOT CONFIRM**: actual rendered behavior at each breakpoint — no browser tool is available in this environment. Verified instead that every changed/new file compiles cleanly through Vite's dev transform (200 responses) and that `tsc --noEmit` shows no new errors.

## Preserved

Untouched, verified still loading (200) after all changes: Shop (`/products`), Maintenance (`/maintenance`), Print (`/print`), Marketing (`/marketing`), Barista Academy (`/barista-academy`), Admin System Management (`/admin/system-management`), Admin Messages (`/admin/messages`), Coffee Owner Messages (`/cafe/messages`), Supplier Messages (`/supplier/messages`), Delivery Messages (`/delivery/messages`). The Supplier↔Coffee Owner and Maintenance↔Coffee Owner messaging toggles, broadcasts, and grace-period setting were not modified beyond adding the new Barista row alongside them. Shop/Pack/Store/Academy favorites are unchanged. The Barista backend built in the prior session (profiles, requests, missions, revenue, review submission/eligibility) was not modified.

## Verification

Actually run this session, against the live dev server and real Postgres data (not fabricated):
- `npx tsc --noEmit` — same 3 pre-existing, unrelated errors before and after every change; zero new errors.
- Every new/changed frontend file fetched through Vite's dev transform and returned a valid compiled module (200).
- Favorites: added a favorite, confirmed duplicate POST does not create a second row, confirmed a second Coffee Owner's favorites list is empty (ownership isolation), confirmed DELETE removes it.
- Messaging: created a real Barista request to establish eligibility, created a conversation, sent a message as Coffee Owner, confirmed it appeared in the Barista's conversation list with the correct service tag and unread count, replied as the Barista, confirmed the Coffee Owner's unread count incremented.
- Admin toggle: disabled `baristaMessagingEnabled`, confirmed a fresh eligibility check then correctly fails even with an active request; re-enabled it and confirmed it recovers.
- Server log checked clean (no errors) after the full test pass.
- Regression sweep: `/products`, `/maintenance`, `/barista`, `/print`, `/marketing`, `/barista-academy`, `/admin/system-management`, `/admin/messages`, `/cafe/messages`, `/supplier/messages`, `/delivery/messages` all return 200.

**CANNOT CONFIRM**: clicking through the UI in an actual browser (tab switcher visuals, dark mode, mobile rendering, the Messages/Avis pages' real look) — no browser tool available. All of the above was verified through direct API calls and server-side/compile-time checks.

## Remaining issues

- **Pre-existing timezone discrepancy in message read-state, discovered but not introduced by this task.** While verifying the Messages flow, marking a conversation read and immediately re-checking unread count did not always clear it. Direct inspection of the row showed `conversation_participants.last_read_at` stored roughly 2 hours behind the message's `created_at` at write time. Every `timestamp` column in `shared/schema.ts` uses the same non-timezone-aware Drizzle type (checked — this is not specific to messaging or to Barista), so this is a systemic, app-wide characteristic that already affects Shop and Maintenance messaging identically, not a regression from this task. Fixing it would mean touching a cross-cutting concern used by dozens of tables across every module, which is out of this task's scope ("do not change unrelated functionality"). Flagging it here rather than silently leaving it undocumented.
- **No Coffee-Owner-facing review composer exists.** The backend review-submission endpoint (`POST /api/barista/reviews`) was already built and verified working in the prior session, and the new Avis page correctly displays whatever reviews exist — but there is still no UI surface anywhere for a Coffee Owner to actually submit one (this was true before this task too). This task's instructions (§24–28) describe the Avis page as displaying already-created reviews and don't list a review composer as a required switcher item or validation-matrix row, so building new UI for it was treated as out of scope rather than assumed. The Avis page will legitimately show an empty state until that composer exists somewhere.
- Everything else in the validation matrix (§37) was implemented and verified via the checks listed above, with UI rendering itself marked CANNOT CONFIRM per the note above.
