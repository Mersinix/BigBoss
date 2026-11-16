# Maintenance Flash Modal — Fix Audit

## 1. Root cause

The previous task (`docs/flash_all_accounts_audit.md`) correctly identified that **four** of the five existing per-account "Fast Search" components (Academy, Marketing, Print — plus the nonexistent ones for Delivery/Driver) browse something other than a provider profile (courses, services, catalog products), so none of them could be meaningfully fed "my own single record." It then built **one** generic shared component, `FlashSearchPreviewModal`, and used it uniformly across **all six** target accounts for consistency — including Maintenance.

**This was the mistake for Maintenance specifically.** `MaintenanceFastSearch` (`client/src/components/maintenance/maintenance-fast-search.tsx`) takes `providers: MaintenanceMarketplaceCard[]` — **exactly the same provider-profile shape as `BaristaFastSearch`'s `baristas: BaristaMarketplaceCard[]`**. Unlike Academy/Marketing/Print, there was never a genuine data-shape obstacle for Maintenance; it was grouped with the other four by the previous task's "apply the same component to all six for consistency" decision, when it should have been treated like Barista — a true `previewMode` extension of its own real Fast Search component. Confirmed by reading `maintenance-fast-search.tsx` in full: same filters-over-an-array structure, same `Heart`/favorite, `Info`, hero-image, progress-bar, prev/next chrome as `BaristaFastSearch`, just Maintenance-flavored (orange accent, `categories` instead of `skills`, `jobTitle` instead of nothing-equivalent).

So the generic `FlashSearchPreviewModal` (simple hero image + name + type badge, no skills/rating/favorite icons) is visually **not** what a user familiar with the real Coffee Owner Maintenance Fast Search would recognize — hence "the expected UI change is not visible": the code change was real and live, but it rendered a deliberately-simplified generic preview instead of the actual Fast Search look, which is what this task now corrects.

**A second, independent bug found while reading `maintenance-fast-search.tsx`**: its hero image was `getAvatarUrl(current as any)` only — it never reads `current.flashImageUrl` at all, in either mode. This is unrelated to the previous task's mistake (it predates all of this work) and is fixed here only for `previewMode`, per Section 7's explicit "preserve Coffee Owner Fast Search exactly as before" — normal (non-preview) mode keeps its original `getAvatarUrl(current)` call unchanged, so real Coffee-Owner browsing behavior for other providers is byte-identical to before this task.

## 2. Original modal vs. new modal

| | Opened by | Component |
|---|---|---|
| **Before this task** | Espace Maintenance → Business → Profil → Flash | `FlashSearchPreviewModal` (generic, shared with 5 other accounts) |
| **Before this task** | Coffee Owner → `/maintenance` → Hero → Fast Search | `MaintenanceFastSearch` (`previewMode` did not exist) |
| **After this task** | Espace Maintenance → Business → Profil → Flash | `MaintenanceFastSearch` with `previewMode` — the **same component** Coffee Owner uses, fed by the authenticated professional's own single card |
| **After this task** | Coffee Owner → `/maintenance` → Hero → Fast Search | `MaintenanceFastSearch`, `previewMode` omitted (defaults `false`) — **unchanged** |

## 3. Files inspected
`client/src/pages/maintenance/profile.tsx` (Flash button, `flashPreviewOpen` state, `FlashSearchPreviewModal` call, `profileData` query shape, the existing `previewOpen`/`AgentDetailModal readOnly` self-preview pattern), `client/src/components/maintenance/maintenance-fast-search.tsx` (full read — props, filters, favorite/info/hero-image logic, Dialog sizing), `client/src/pages/cafe/maintenance/maintenance-page.tsx` (confirmed its `<MaintenanceFastSearch open={fastSearchOpen} providers={profiles} onOpenDetail={...} />` call site passes no `previewMode`), `client/src/components/barista/barista-fast-search.tsx` (the reference `previewMode` implementation — header label swap, amber badge, disabled-favorite, omitted job-target button), `client/src/lib/avatar.ts` (`getPreferredImageUrl`/`getAvatarUrl`, confirmed `getPreferredImageUrl` already handles both missing-URL and is paired by callers with their own load-failure retry — it does not itself retry on a broken image; that responsibility stays with the caller's `onLoadingStatusChange`/`onError`, exactly as `BaristaFastSearch` already does), `server/routes.ts` (`POST /api/maintenance-favorites`, confirmed `CAFE_OWNER`-only, matching the Barista-favorites gate already relied on as defense-in-depth in the prior task).

## 4. The proposed minimal fix (implemented)
1. Add `previewMode?: boolean` (default `false`) to `MaintenanceFastSearchProps` — mirroring `BaristaFastSearch`'s own prop exactly, so the Coffee Owner's existing call site (`maintenance-page.tsx`, which passes none) is byte-for-byte unaffected.
2. Header label, amber "Mode aperçu — Aperçu Flash" badge, disabled Favorite button when `previewMode` — same three changes `BaristaFastSearch` already made.
3. Hero image: `previewMode` branch uses `getPreferredImageUrl(current.flashImageUrl, current.profileImageUrl)` with the same one-shot `flashFailed` retry-then-`getAvatarUrl` fallback `BaristaFastSearch` uses; normal mode keeps the original `getAvatarUrl(current)` call, untouched.
4. `client/src/pages/maintenance/profile.tsx`: Flash button now opens `MaintenanceFastSearch` (`previewMode`, `providers={profileData?.card ? [profileData.card] : []}`) instead of `FlashSearchPreviewModal`; "Info" closes the Fast-Search preview and reopens the page's existing `previewOpen`/`AgentDetailModal readOnly` (same reuse pattern Barista already established — no second detail view built).
5. `FlashSearchPreviewModal` itself is **not modified or removed** — it is still correctly used by the other five accounts (Barista Academy, Delivery, Driver, Marketing, Printer), none of which this task touches.

## 5. Files modified
- `client/src/components/maintenance/maintenance-fast-search.tsx` — added `previewMode` support (see Section 4).
- `client/src/pages/maintenance/profile.tsx` — Flash button rewired to `MaintenanceFastSearch` with `previewMode`; `FlashSearchPreviewModal` import/usage removed from this one file.
- `docs/maintenance_flash_modal_audit.md` — this report.

No other file touched. `client/src/pages/cafe/maintenance/maintenance-page.tsx` (Coffee Owner's real Fast Search call site) was read but not edited — confirmed it needs no change since `previewMode` defaults to `false`.

## 6. How preview-only behavior is enforced
- **Favorite**: `triggerFavorite()` returns immediately when `previewMode` is true (client-side no-op), in addition to the server's pre-existing `POST /api/maintenance-favorites` → `CAFE_OWNER`-only 403 gate (confirmed in Section 3) — the same two-layer guard `BaristaFastSearch` uses.
- **Info/"Détails"**: calls the host's `onOpenDetail` callback, which in the preview context (wired from `profile.tsx`) closes the Fast-Search preview and opens the page's own pre-existing **read-only** `AgentDetailModal` (`readOnly` prop already guards its own favorite/contact/reserve actions, established before this task) — no new mutation surface.
- **Filter / prev / next**: pure client-side array operations over the one-item `providers` array passed in preview mode; no network request, nothing to guard.
- No other mutation-capable code path exists inside `MaintenanceFastSearch`.

## 7. Flash → profile photo → placeholder priority
`getPreferredImageUrl(flashImageUrl, profileImageUrl)` (from `client/src/lib/avatar.ts`, introduced in `flash_image_sync_audit.md`) returns the trimmed Flash URL if non-empty, else the trimmed profile-photo URL, else `null`. In `previewMode`, `MaintenanceFastSearch` uses this as its hero-image candidate; on an actual image-load failure (`AvatarImage`'s `onLoadingStatusChange("error")`), it falls back exactly once to `getAvatarUrl({ profileImageUrl: current.profileImageUrl })` (profile photo, or the app's default avatar if that's also empty) — the same one-shot `flashFailed` boolean guard `BaristaFastSearch` already uses, so a doubly-broken image falls through to Radix's own `AvatarFallback` (initials) rather than looping.

## 8. Confirmation that Coffee Owner Fast Search remains in normal mode
`client/src/pages/cafe/maintenance/maintenance-page.tsx`'s `<MaintenanceFastSearch open={fastSearchOpen} onClose={...} providers={profiles} onOpenDetail={...} />` call was read and is **not modified** — it passes no `previewMode` prop, which defaults to `false`, so every new `previewMode ? … : …` branch inside the component takes its original, unchanged path for this caller: "Fast Search" header text (not "Aperçu Flash"), no amber badge, real Favorite behavior, and the original `getAvatarUrl(current)` hero image — byte-identical to before this task.

## 9. TypeScript and build results
- `npx tsc --noEmit` — **clean, exit 0**, run after the `maintenance-fast-search.tsx` change and again after the `maintenance/profile.tsx` change.
- `npm run build` — **succeeded** (`✓ built in 54.98s`; server bundled to `dist/index.cjs`, 2.0mb; same pre-existing >500kB chunk-size warning as every prior build in this project, unrelated).
- `git status` after all edits shows exactly `client/src/components/maintenance/maintenance-fast-search.tsx` and `client/src/pages/maintenance/profile.tsx` changed for this task (plus this report) — the other five accounts' profile pages remain exactly as the previous task left them, confirmed by inspecting `git status`/`git diff --stat` directly, not assumed. `client/src/pages/cafe/maintenance/maintenance-page.tsx` (Coffee Owner's real Fast Search call site) was read but shows no diff — confirmed its `<MaintenanceFastSearch open={fastSearchOpen} onClose={...} providers={profiles} onOpenDetail={...} />` call still passes no `previewMode`.

## 10. Browser verification
**No browser-automation tool was available in this session.** Visual verification — actually opening Espace Maintenance → Business → Profil → Flash and comparing it side-by-side with Coffee Owner → `/maintenance` → Hero → Fast Search — was **not performed** and remains a manual follow-up. The claims in this report are based on code inspection: the preview now renders through the identical JSX/component `MaintenanceFastSearch` already uses for its real Fast Search (same header, badge-position, hero image, bottom overlay, categories chips, Dialog sizing `w-[92vw] max-w-lg h-[90vh] rounded-3xl bg-black`), parameterized only by `previewMode` and a one-item `providers` array — not a visual guess.

## 11. Remaining manual testing steps
1. Log in as a seeded Maintenance account, open Business → Profil, click Flash, and visually confirm the "Aperçu Flash" label + amber badge render, that the hero image matches the account's actual configured Flash/photo URL, and that the categories chips/availability badge show that account's own real data.
2. Confirm the Favorite heart renders disabled with a tooltip and does not fire a network request on click.
3. Confirm "Info" closes the Fast-Search preview and opens the existing read-only profile preview without any console error.
4. As a Coffee Owner, open `/maintenance` → Hero → Fast Search and confirm it is visually and functionally unchanged (real Favorite works, Info opens the real detail/reserve modal).
5. Check both at a mobile viewport width.
