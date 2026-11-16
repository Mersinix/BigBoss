# Flash Image Selection Unification — Audit

## 1. Root cause

The two modals' **client-side selection logic was already correct and already in agreement** — both implemented Flash-first-then-photo priority with graceful broken-image fallback. The actual, concrete bug was a **data gap on the server**: the public barista list endpoint never sent `flashImageUrl` to the client at all.

- `client/src/components/barista/barista-fast-search.tsx` (Coffee Owner's Fast Search) is fed by the `baristas` prop, which `client/src/pages/cafe/barista/barista-page.tsx:383` populates via `useBaristaProfiles()` → `GET /api/barista/profiles` → `server/storage.ts`'s `getBaristaMarketplaceProfiles()`.
- That function's `cards.map(...)` builder (`server/storage.ts:8386-8400`, before this fix) copied `profileImageUrl` from the user row but **never copied `flashImageUrl`** — even though the `BaristaMarketplaceCard` type declares the field and the database column (`users.flash_image_url`) exists and is populated via Settings. Every card the Coffee Owner's Fast Search ever received therefore had `flashImageUrl: undefined`.
- `BaristaFastSearch`'s own logic (`const flashUrl = current?.flashImageUrl?.trim() || null;`) was correct — but with `flashImageUrl` always `undefined`, `flashUrl` was always `null`, so the component always silently fell through to the profile photo, **regardless of what Flash URL the barista had actually configured**.
- By contrast, `client/src/pages/barista-marketplace/profile.tsx`'s own "Aperçu Flash" preview (built in the immediately-preceding task) is fed by `useMyBaristaProfile(user.id)` → `GET /api/barista/profile/:userId` → `storage.getBaristaMarketplaceCard()` (the **singular**, self/admin/cafe-owner detail builder, `server/storage.ts:8416-8443`) — which **already** included `flashImageUrl: row.user.flashImageUrl ?? null`. This is why the Barista's own preview correctly showed the Flash image while the Coffee Owner's real Fast Search never did: two different server-side card builders, one complete, one missing a field.

**Confirmed empirically** (not just by reading code): set a real `flash_image_url` on a seeded test account, then called both endpoints directly against the (unmodified) running server — `GET /api/barista/profiles` (list) returned the card **without** a `flashImageUrl` key at all; `GET /api/barista/profile/:userId` (detail) returned it correctly. Reverted the test value immediately after.

A secondary, much smaller finding: the two modals' *broken-image retry* logic, while already behaviorally correct and consistent, was independently re-implemented (trim/null-coalescing duplicated in both files) rather than shared — addressed per the task's explicit ask to avoid duplicating the selection logic, see Section 4.

## 2. Files inspected

- `client/src/components/barista/barista-fast-search.tsx` (Coffee Owner's Fast Search, its image logic, its `previewMode` added in the prior task).
- `client/src/components/account/flash-preview-modal.tsx` (every account type's "Flash" preview modal).
- `client/src/pages/barista-marketplace/profile.tsx` (Barista Marketplace's own Flash button / `previewMode` integration).
- `client/src/pages/cafe/barista/barista-page.tsx` (Coffee Owner's Fast Search call site and its `profiles` data source).
- `client/src/lib/avatar.ts` (existing `getAvatarUrl`/`DEFAULT_AVATAR_URL` — the app's one existing shared image-fallback utility).
- `client/src/hooks/use-barista-marketplace.ts` (`BaristaMarketplaceCard` type, confirming `flashImageUrl`/`profileImageUrl` are both declared optional fields).
- `server/routes.ts` (`GET /api/barista/profiles`, `GET /api/barista/profile/:userId`).
- `server/storage.ts` (`getBaristaMarketplaceProfiles` — the list builder with the gap; `getBaristaMarketplaceCard` — the correct single-profile builder used as the reference).
- Settings page where Flash (URL) / Photo de profil (URL) are configured — confirmed (not modified) these save to `users.flash_image_url`/`users.profile_image_url` via the existing account-identity update path; out of scope to touch per the task.

## 3. Files modified

| File | Change |
|---|---|
| `server/storage.ts` (`getBaristaMarketplaceProfiles`) | Added `flashImageUrl: user.flashImageUrl ?? null,` to the mapped card object — the root-cause fix. No schema change, no new query, no new endpoint; the column was already selected as part of `user` via the existing join. |
| `client/src/lib/avatar.ts` | Added two small, pure, exported functions: `normalizeImageUrl` (trim-or-null) and `getPreferredImageUrl` (Flash-then-photo priority) — extending the app's existing single shared image-fallback utility file rather than creating a new one. |
| `client/src/components/barista/barista-fast-search.tsx` | Replaced its own inline `flashUrl = current?.flashImageUrl?.trim() || null` with `getPreferredImageUrl(current?.flashImageUrl, current?.profileImageUrl)`; renamed the resulting variable to `preferredImageUrl` for clarity. No other logic changed — the existing `flashFailed` state/`useEffect` reset/`onLoadingStatusChange` guard are untouched. |
| `client/src/components/account/flash-preview-modal.tsx` | Replaced its own inline `primary = flashImageUrl?.trim() || null` / `fallback = profileImageUrl?.trim() || null` with `normalizeImageUrl(...)` calls, and its initial-state/reset-effect `primary || fallback` expressions with `getPreferredImageUrl(flashImageUrl, profileImageUrl)`. The `onError` retry step (which needs the two values named separately) is untouched. |
| `docs/flash_image_sync_audit.md` | This report (placed under `docs/`, matching this repo's existing convention for long-form audit/analysis reports). |

No database migration, no new API endpoint, no settings-page change, no change to how Flash/profile-photo URLs are saved, no change to preview-mode restrictions, no change to any unrelated account type's modal.

## 4. Shared image-selection implementation

```ts
// client/src/lib/avatar.ts
export function normalizeImageUrl(url?: string | null): string | null {
  const trimmed = url?.trim();
  return trimmed ? trimmed : null;
}

export function getPreferredImageUrl(
  flashImageUrl?: string | null,
  profileImageUrl?: string | null,
): string | null {
  return normalizeImageUrl(flashImageUrl) ?? normalizeImageUrl(profileImageUrl);
}
```

Both `BaristaFastSearch` and `FlashPreviewModal` now call `getPreferredImageUrl` to compute their candidate image URL — one single, shared place decides "Flash if present, else photo if present, else null," so the two surfaces cannot silently drift apart again. Each component keeps its own, appropriately different, broken-image *retry* mechanism (Radix `Avatar`/`AvatarFallback` + a boolean flag in one; a raw `<img>` + a two-step `imgSrc`/`triedFallback` state machine in the other) — these were already correct and are presentation-specific, not "selection logic," so unifying them further would have meant a much larger, unrequested rewrite of two already-working, differently-shaped UIs.

## 5. Fallback behavior for missing and broken URLs

Verified against the task's own table, by reading the resulting code paths (not assumed):

| Flash | Photo | Result | How |
|---|---|---|---|
| Valid | Valid | Flash shown | `getPreferredImageUrl` returns the normalized Flash URL first. |
| Empty | Valid | Photo shown | Flash normalizes to `null`, falls through to photo. |
| Missing | Valid | Photo shown | Same as above (`undefined` normalizes identically to empty). |
| Broken | Valid | Falls back to photo | `BaristaFastSearch`: `AvatarImage`'s `onLoadingStatusChange("error")` sets `flashFailed`, re-renders with `getAvatarUrl(current)` (the photo). `FlashPreviewModal`: `<img onError>` switches `imgSrc` to `fallback` (the photo), guarded by `triedFallback` so it only ever retries once. |
| Valid | Empty | Flash shown | `getPreferredImageUrl` returns Flash; photo is never consulted. |
| Empty | Empty | Existing placeholder | `BaristaFastSearch`: `heroImageSrc` becomes `getAvatarUrl(current)` → `DEFAULT_AVATAR_URL` (its own existing generic-avatar fallback, unchanged). `FlashPreviewModal`: `imgSrc` is `null` from the first render → its own existing Zap-icon placeholder box (unchanged), no network request even attempted. |
| Broken | Broken | Existing placeholder, no loop | `BaristaFastSearch`: photo also fails to load → Radix's own `AvatarFallback` (initials) engages automatically; `flashFailed` only ever flips once, so no re-render loop. `FlashPreviewModal`: `onError` fires once more, `triedFallback` is already `true`, so it falls to `imgSrc = null` (placeholder) instead of retrying — guaranteed single retry, no loop. |

No new "is this URL well-formed" validation was added — the task's own test table is about *presence* (empty/missing) and *load-time* failure, both of which the existing code (now sharing the presence-check) already handles; adding a stricter format validator wasn't requested and risks rejecting otherwise-working URLs the current code already renders fine.

## 6. TypeScript and build results

- `npx tsc --noEmit` — **clean, exit 0** (run after the backend change and again after both component changes).
- `npm run build` — **succeeded** (`✓ built in 12.37s`; server bundled to `dist/index.cjs`, 2.0mb; same pre-existing >500kB chunk-size warning as every prior build this session, unrelated).

## 7. Tests actually executed

- No automated test suite exists in this project (confirmed, not assumed — no `test` script in `package.json`).
- **Root-cause confirmation (live, pre-fix)**: called `GET /api/barista/profiles` directly against the still-running (unpatched) dev server after setting a real `flash_image_url` on a seeded test account (`samir@barista.com`) — confirmed the returned card had **no** `flashImageUrl` key at all, proving the Coffee Owner's Fast Search could never have shown it. Called `GET /api/barista/profile/39` (the detail endpoint) at the same moment — confirmed it **did** correctly return the same account's `flashImageUrl`, proving the asymmetry existed exactly where diagnosed. The test value was reverted to `null` immediately after (restoring the account to its prior state) and the scratch cookie/response files were deleted.
- **Backend-restart-dependent**: the fix to `getBaristaMarketplaceProfiles` is a `server/storage.ts` change; the running `npm run dev` process (`tsx`, no `--watch`) predates this edit and won't serve it until restarted — same documented limitation as every prior backend change this session (`Stop-Process` is blocked by the environment's "Interfere With Workloads" sandbox guard). The client-side changes (`avatar.ts`, both components) are live immediately via Vite's dev-time transform and need no restart.
- **No browser-automation tool was available** in this session — the following were verified by reading the resulting code paths precisely (matched line-by-line against the task's required table in Section 5), not by actually rendering and clicking through either modal:
  - Visually confirming the Flash image now appears first in the Coffee Owner's real Fast Search for a barista with both URLs set.
  - Visually confirming a deliberately-broken Flash URL falls back to the photo on-screen (versus just in the code path).
  - Confirming no console errors/infinite network retries occur in an actual browser session.

## 8. Remaining manual verification steps

1. **Restart the backend** (`npm run dev` or redeploy production) so `getBaristaMarketplaceProfiles`'s `flashImageUrl` fix takes effect — required before the Coffee Owner's Fast Search will actually show Flash images in practice. Until then it will keep showing profile photos (the same pre-fix behavior, not a regression, just not-yet-live).
2. After restarting, a human (or a future session with browser tooling) should: open Coffee Owner → Fast Search, find a barista with a Flash (URL) set, confirm it renders instead of the profile photo; then clear/break that barista's Flash URL in Settings and confirm the Fast Search card falls back to the photo on next load; then also clear the photo and confirm the existing default-avatar placeholder appears.
3. Re-verify the Barista Marketplace's own "Aperçu Flash" preview (from the immediately-preceding task) still works identically — it was not logically changed here (still fed by the already-correct detail endpoint), but it does now go through the same shared `getPreferredImageUrl` function, so a quick visual confirmation is worthwhile.
