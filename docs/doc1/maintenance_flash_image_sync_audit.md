# Maintenance Flash Image Sync — Audit

## 1. Root cause

**Two independent bugs, both confirmed and fixed:**

1. **Backend data gap**: `server/storage.ts`'s `getMaintenanceProfiles()` — the Coffee-Owner-facing list builder behind `GET /api/maintenance/profiles` (which feeds `profiles` in `client/src/pages/cafe/maintenance/maintenance-page.tsx`, in turn passed to `MaintenanceFastSearch`) — mapped `profileImageUrl: user.profileImageUrl ?? null` on every card but **never copied `flashImageUrl`**. `MaintenanceMarketplaceCard.flashImageUrl` is declared optional (`flashImageUrl?: string | null`), so every card from this one endpoint silently had `flashImageUrl: undefined` — invisible to TypeScript, invisible until read live.
2. **Frontend never read it even when present**: `MaintenanceFastSearch`'s hero-image logic (`client/src/components/maintenance/maintenance-fast-search.tsx`) only applied the `getPreferredImageUrl(flashImageUrl, profileImageUrl)` priority **inside `previewMode`** — a deliberate choice from the immediately-preceding task (`docs/maintenance_flash_modal_audit.md`), made specifically to avoid touching Coffee Owner's *normal*-mode behavior. This task's own explicit instruction ("Coffee Owner Maintenance Fast Search… must use the same image selection logic as the professional's own Flash preview… Do not use the profile photo first when a valid Flash image exists") supersedes that earlier, narrower decision for this one component.

Both bugs independently prevented the Coffee Owner's real Fast Search from ever showing a Maintenance provider's Flash image — even for a provider who had correctly configured one. The professional's own self-preview (fed by `getMaintenanceCard`, a **different**, already-correct storage method — see Section 2) was never affected by either bug.

**Confirmed empirically, live, before writing any fix**: provider id 27 (`GOMYCODE@cafe.com`) already has a real, non-empty `flash_image_url` in the database. A direct `GET /api/maintenance/profiles` call against the (still-unpatched) running dev server returned that provider's card **without a `flashImageUrl` key at all** — proving bug #1 precisely, on real data, not a hypothetical.

## 2. Existing data flow from Maintenance settings to the database/API

- **Settings → save**: `client/src/components/settings/account-identity-card.tsx` (a shared component used by every professional account type's own Paramètres page) saves `flashImageUrl`/`profileImageUrl` via `PATCH /api/auth/me/profile` — a single, generic, already-correct endpoint writing directly to the `users` table (`users.flash_image_url`/`users.profile_image_url` columns). No Maintenance-specific persistence code exists, and none was needed — this part of the flow was already correct and is **not modified** by this task.
- **Read path #1 — the professional's own self-preview** (`client/src/pages/maintenance/profile.tsx` → `usePrintCompanyDetail`-equivalent for Maintenance, i.e. `GET /api/maintenance/profile/:userId`) → `storage.getMaintenanceCard()`, which **already** included `flashImageUrl: row.user.flashImageUrl ?? null` (confirmed by reading it in full) — this is the self/admin branch that returns the raw `user` row, the same established pattern already correct across every other account type audited in this project. **Not modified.**
- **Read path #2 — the Coffee Owner's Fast Search** (`client/src/pages/cafe/maintenance/maintenance-page.tsx` → `GET /api/maintenance/profiles`) → `storage.getMaintenanceProfiles()`, which **omitted** `flashImageUrl` (bug #1, Section 1) — **fixed** in this task.

So the bug was never in persistence (settings save was always correct) and never in the *self*-view read path (already correct) — it was isolated entirely to the *list* read path used by the Coffee Owner's Fast Search, exactly mirroring the original Barista bug fixed earlier in this project (`docs/flash_image_sync_audit.md`).

## 3. How the Flash URL and profile photo URL are retrieved (after the fix)

- `getMaintenanceProfiles()` now additionally maps `flashImageUrl: user.flashImageUrl ?? null` onto every returned card (same `users` row already joined in the existing query — no new join, no new column, no new query).
- `MaintenanceFastSearch` now computes `getPreferredImageUrl(current?.flashImageUrl, current?.profileImageUrl)` **unconditionally** (both normal and preview mode), with the same one-shot `flashFailed` state falling back to `getAvatarUrl(current)` (profile photo, or the app's default avatar if that's also empty) on an actual image-load error (`AvatarImage`'s `onLoadingStatusChange("error")`), and Radix's own `AvatarFallback` (initials) covering a photo that's also broken.

## 4. Files modified and the reason for each change

| File | Change | Reason |
|---|---|---|
| `server/storage.ts` (`getMaintenanceProfiles`) | Added `flashImageUrl: user.flashImageUrl ?? null,` to the mapped card object. | Root-cause fix for bug #1 (Section 1) — the field was already selected via the existing `users` join, just never copied onto the returned card. |
| `client/src/components/maintenance/maintenance-fast-search.tsx` | Removed the `previewMode ? … : …` gate around the image-selection logic; `getPreferredImageUrl`/`flashFailed`/`onLoadingStatusChange` now apply in both modes. | Root-cause fix for bug #2 (Section 1) — this task's explicit requirement that Coffee Owner's real Fast Search also respect Flash priority, superseding the prior task's narrower "preview-mode-only" scope. |
| `docs/maintenance_flash_image_sync_audit.md` | This report. | Required deliverable. |

**Not modified**: the settings save flow (`account-identity-card.tsx`, `PATCH /api/auth/me/profile`) — already correct, no bug found there; `storage.getMaintenanceCard()` — already correct; any other account type's Flash preview or Fast Search; Coffee Owner's maintenance search filters, favorites, availability display, or detail modals — none of that logic was touched, only the one hero-image `src` computation.

## 5. How image-load failure fallback works

Identical priority/fallback chain in both modes now, verified against the task's own table by reading the resulting code path:

| Flash | Photo | Result | Mechanism |
|---|---|---|---|
| Valid | Valid | Flash | `getPreferredImageUrl` returns the trimmed Flash URL first. |
| Missing/empty | Valid | Photo | Flash normalizes to `null` (trim-empty-as-missing, `client/src/lib/avatar.ts`), falls through to the photo. |
| Broken | Valid | Photo | `onLoadingStatusChange("error")` sets `flashFailed` once; `heroImageSrc` re-renders with `getAvatarUrl(current)` (the photo). |
| Valid | Missing | Flash | Photo is never consulted when Flash already resolved. |
| Broken/missing | Missing/broken | Placeholder | `heroImageSrc` falls to `getAvatarUrl(current)`'s own default avatar if `profileImageUrl` is empty; if a non-empty photo URL is *also* broken, Radix's `AvatarFallback` (initials) engages automatically — no further retry, no loop (`flashFailed` only ever flips once per `current?.userId` change). |

## 6. How both interfaces were synchronized

Both interfaces now call the exact same two functions (`getPreferredImageUrl`, `getAvatarUrl`, both from the shared `client/src/lib/avatar.ts` introduced earlier in this project) with the same per-provider `flashImageUrl`/`profileImageUrl` pair — the only previous difference was that one code path (`previewMode`) used them and the other (`!previewMode`) didn't; that branch is now gone. The remaining difference between the professional's own preview and the Coffee Owner's real search is **only** the `providers` array each is fed (the professional's own single card in previewMode vs. every eligible provider in normal mode) and the preview-only restrictions (Favorite disabled) — never the image-selection logic itself, which is now unconditional.

## 7. TypeScript, build, and test results

- `npx tsc --noEmit` — **clean, exit 0**, run after both the backend and the component edit.
- `npm run build` — **succeeded** (`✓ built in 12.28s`; server bundled to `dist/index.cjs`, 2.0mb; same pre-existing >500kB chunk-size warning as every prior build in this project, unrelated).
- No automated test suite exists in this project (confirmed, not assumed — no `test` script in `package.json`).
- **Live, executed verification** (not just code reading) against the running dev server: confirmed via direct DB query that provider 27 has a real `flash_image_url`; confirmed via a direct `GET /api/maintenance/profiles` call that the **currently-running, unpatched** server omits `flashImageUrl` from that provider's card entirely — this is the empirical proof of the root cause, performed before writing the fix. The scratch response file used for this check was deleted immediately after.
- `git status`/`git diff --stat` after all edits: exactly `server/storage.ts` and `client/src/components/maintenance/maintenance-fast-search.tsx` show new changes from this turn (9 and 55 lines respectively); every other file shown as modified in `git status` carries diffs from prior tasks only, unchanged by this turn.

## 8. Remaining manual verification

**Backend-restart-dependent**: the fix to `getMaintenanceProfiles` is a `server/storage.ts` change. The running `npm run dev` process (`tsx`, no `--watch`) predates this edit and will not serve the new `flashImageUrl` field until restarted — same documented limitation as every prior backend change in this project (`Stop-Process` is blocked by the environment's "Interfere With Workloads" sandbox guard, so a restart requires the user). The `MaintenanceFastSearch` component change is client-side and is already live via Vite's dev-time transform, but it has no effect until the backend starts actually returning the field.

**No browser-automation tool was available in this session.** Once the backend is restarted, the following still need an actual rendered check (not performed):
1. Scenario A–D from the task (valid Flash, missing Flash, broken Flash, both unavailable) — the DB already has a real test case for provider 27 (valid Flash + valid photo) ready to use; a broken-URL case would need to be set up manually.
2. Scenario E (multiple providers each showing their own image, never mixed up) — the per-card mapping (`current?.flashImageUrl`/`current?.profileImageUrl`, read from whichever `MaintenanceMarketplaceCard` is currently swiped to) was verified by code reading to be per-provider, not shared/global state, but not visually confirmed with two providers side by side.
3. Scenario F (existing search/filter/favorites/details/availability still work) — none of that code was touched; `tsc`/`build` passing is mechanical confirmation of no syntax/type regression, not a functional click-through.
