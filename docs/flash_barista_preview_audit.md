# Flash → BaristaFastSearch Preview Integration — Audit

## 1. Current Flash behavior

`client/src/pages/barista-marketplace/profile.tsx:214-216` renders a "Flash" button (`Zap` icon, `data-testid="button-flash-preview"`) in the profile page's `DashboardHero` action row, alongside "Publié" (`PublicationStatusBadge`) and "Aperçu" (opens `BaristaDetailModal` read-only, `data-testid="button-preview-profile"`). Today it opens `FlashPreviewModal` (`client/src/components/account/flash-preview-modal.tsx`) — a full-bleed, story-style card showing the account's `flashImageUrl` (Settings → Compte's "Flash (URL)"), falling back to the profile photo, then a placeholder. This exact same component/button/testid pattern is used identically by **all 7** professional account types' own `Business → Profil` page (`driver`, `barista-academy`, `marketing`, `printer`, `delivery`, `maintenance`, `barista-marketplace`), and by the Coffee Owner's Barista/Maintenance/etc. details modals' own Flash icon — confirmed via `grep -rl "FlashPreviewModal"`.

This task supersedes the prior decision (documented in `barista_performance_flash_audit.md`) to leave this button's behavior untouched. That prior audit is still the correct record of *why* a naive swap is risky; this task's explicit, narrower scope (preview-only, Barista Marketplace only, with hard mutation guards) resolves those risks, so the integration proceeds here.

## 2. `BaristaFastSearch` dependencies and requirements

`client/src/components/barista/barista-fast-search.tsx`, sole existing call site `client/src/pages/cafe/barista/barista-page.tsx:753` (Coffee Owner's own Fast Search):

```tsx
<BaristaFastSearch
  open={fastSearchOpen}
  onClose={() => setFastSearchOpen(false)}
  baristas={profiles}
  onOpenDetail={(b) => setDetailBaristaId(b.userId)}
/>
```

- **Data**: `baristas: BaristaMarketplaceCard[]` — a plain prop, no internal fetching. The Coffee Owner feeds it `profiles` from `useBaristaProfiles()` → `GET /api/barista/profiles` (confirmed **public, no auth** — the same list a logged-out visitor sees on `/barista`). No role requirement on the data itself.
- **Mutations reachable from inside the component**:
  1. `triggerFavorite()` → `useFavorites().toggleBaristaMarket(item)` → `POST/DELETE /api/barista-favorites`. Server-side, `POST /api/barista-favorites` (`server/routes.ts:2713-2721`) already requires `user.role === "CAFE_OWNER"` (403 otherwise) — so a Barista account could never actually create a favorite row today, even without any change here. Still a real mutation attempt to guard against client-side per the task's "audit every mutation" instruction.
  2. `<BaristaJobTargetButton>` (floating action icon) → its own `useMyBaristaJobs("OFFER"|"MISSION")` (`GET /api/barista/jobs/mine`, gated `requireApprovedCafeOwner`) and `useAddBaristaJobTarget()` (`POST /api/barista/jobs/:id/targets`, same gate). Both 403 for a non-Coffee-Owner session already — but mounting this component for a Barista account would fire two guaranteed-failing GET requests on every open and surface console/query errors.
  3. `onOpenDetail(current)` ("Info" button) — read-only, just a callback the host wires up; no mutation inside `BaristaFastSearch` itself.
  4. Local-only (no network): `setFilterOpen`, `goNext`/`goPrev`, `setActiveSkill`/`setActiveLocation` — pure client-side array filtering over whatever `baristas` prop was passed in.
- **No internal navigation** — it's a self-contained `Dialog`, closes via its own `X` button or `onOpenChange`.
- **No existing configurable mode** — confirmed by full read of the file: no `previewMode`/`readOnly`-style prop exists yet. The sibling read-only pattern already established elsewhere in this exact file area is `BaristaDetailModal`'s `readOnly` prop (guards its own favorite-toggle/report/review actions) — the precedent this task's `previewMode` prop will mirror.

## 3. Proposed integration point

- **`client/src/components/barista/barista-fast-search.tsx`**: add an optional `previewMode?: boolean` prop (default `false`, so the Coffee Owner's existing call site is untouched and behaves identically). When `true`:
  - Header label swaps "Fast Search" → "Aperçu Flash", plus an amber "Mode aperçu" pill (same visual convention `FlashPreviewModal` already uses for its own `preview` flag — reused, not reinvented).
  - `triggerFavorite` becomes a no-op (client-side guard, in addition to the server's existing role check).
  - The Favorite button renders `disabled`, dimmed, with `title="Indisponible en mode aperçu"`.
  - `<BaristaJobTargetButton>` is **not mounted** at all in preview mode (avoiding the two guaranteed-403 fetches) — replaced with a visually identical but inert/disabled icon carrying the same explanatory title.
  - The "Info" button and filter panel stay fully functional (read-only / client-side-only).
- **`client/src/pages/barista-marketplace/profile.tsx`**: the existing Flash button's `onClick` changes from `setFlashPreviewOpen(true)` to opening `BaristaFastSearch` with `previewMode` and `baristas={data?.card ? [data.card] : []}` — i.e., **the barista's own real card only**, not the full public roster. This satisfies "preview… from their own account" literally, avoids showing any other real user's data inside this new surface (even though `/api/barista/profiles` is technically public), and needs zero new data fetching since `useMyBaristaProfile(user.id)` is already loaded at the top of this page for the rest of the form. `onOpenDetail` is wired to close the Fast Search preview and reopen the page's **existing** `previewOpen`/`BaristaDetailModal` (`readOnly`) preview — the same modal the "Aperçu" button already opens, so "Info" reuses an already-safe, already-existing read-only view rather than introducing a new one. The now-unused `flashPreviewOpen` state and `<FlashPreviewModal>` mount are removed from this one file; the `FlashPreviewModal` component itself, and every other account type's own call site, are untouched.
- No other file needs to change. `business.tsx` is a route/tab switcher only and does not reference Flash.

## 4. Authorization, data isolation, and regression risks

| Risk | Mitigation |
|---|---|
| Barista account triggers a real favorite/recruit mutation while "just browsing" a preview. | `previewMode` no-ops `triggerFavorite` client-side; server already 403s `POST /api/barista-favorites`/`POST /api/barista/jobs/:id/targets` for non-Coffee-Owner/non-approved-Coffee-Owner sessions regardless — defense in depth, not reliance on the UI alone. |
| Preview silently fires failing Coffee-Owner-only API calls (console/query errors, wasted requests). | `BaristaJobTargetButton` (which owns those calls internally) is not mounted in preview mode. |
| Preview exposes other real baristas' profiles inside a new surface. | Feed only the current user's own `card` (`[data.card]`), not the public roster — zero other users' data reachable from this preview. |
| Regression to the Coffee Owner's real Fast Search. | `previewMode` defaults to `false`; `barista-page.tsx:753` passes no such prop, so its behavior is byte-identical to before (verified: no prop it relies on changed shape or default). |
| Regression to the other 6 account types' Flash button. | Only `barista-marketplace/profile.tsx` is touched; `flash-preview-modal.tsx` itself and every other Profil page's import/usage are untouched. |
| Losing the ability to see how the configured Flash (URL) image actually renders. | `BaristaFastSearch`'s hero image already prioritizes `flashImageUrl` with the identical profile-photo/placeholder fallback chain `FlashPreviewModal` uses — so the barista still sees their real Flash image rendered, now inside the actual search-card chrome rather than a standalone story card. |
| Opening/closing the preview resets unrelated profile form state. | New state is one additional `useState(false)` boolean; no existing state read/written by the open/close handlers. |

Implementation proceeds directly after this audit, per the task's instructions.

## 5. Final report

### 5.1 Files inspected
`client/src/pages/barista-marketplace/profile.tsx`, `business.tsx`, `client/src/pages/cafe/barista/barista-page.tsx`, `client/src/components/barista/barista-fast-search.tsx`, `client/src/components/barista/barista-job-target-button.tsx`, `client/src/components/barista/barista-detail-modal.tsx`, `client/src/components/account/flash-preview-modal.tsx`, `client/src/hooks/use-favorites.ts`, `client/src/hooks/use-barista-marketplace.ts` (`useMyBaristaProfile`, `useBaristaProfiles`), `server/routes.ts` (`/api/barista/profiles`, `/api/barista/profile/:userId`, `/api/barista-favorites`, `/api/barista/jobs/mine`, `/api/barista/jobs/:id/targets`), `server/storage.ts` (`getBaristaMarketplaceCard`). Every other professional account's own `profile.tsx` was grep-confirmed (not fully read) to still import `FlashPreviewModal` unchanged.

### 5.2 Files modified
- `client/src/components/barista/barista-fast-search.tsx` — added the `previewMode?: boolean` prop (default `false`) and its guards (see 5.3).
- `client/src/pages/barista-marketplace/profile.tsx` — Flash button now opens `BaristaFastSearch` (`previewMode`, fed by `[data.card]` only) instead of `FlashPreviewModal`; removed the now-unreachable `flashPreviewOpen` state and `FlashPreviewModal` import/mount.
- `docs/flash_barista_preview_audit.md` — this report (moved to `docs/` to match this repo's existing convention for long-form audit/analysis reports, confirmed by inspecting `docs/` after this session's earlier `mission_workflow_cleanup_audit.md` and `barista_performance_flash_audit.md` reports were both relocated there between turns).

No other file was touched for this task.

### 5.3 Exact implementation details
`BaristaFastSearch`:
- New prop `previewMode?: boolean` (default `false`) — the Coffee Owner's call site (`barista-page.tsx:753`) passes no such prop, so it is unaffected.
- Header label: `{previewMode ? "Aperçu Flash" : "Fast Search"}`.
- A new amber "Mode aperçu — Aperçu Flash" pill badge (identical visual convention to `FlashPreviewModal`'s own `preview` badge: `bg-amber-500/90`, `Eye` icon, same position style) renders only when `previewMode`.
- `triggerFavorite()` now returns immediately when `previewMode` is true, before calling `toggleBaristaMarket` (client-side no-op, in addition to the server's pre-existing `CAFE_OWNER`-only check on `POST /api/barista-favorites`).
- The Favorite button renders `disabled`, dimmed (`opacity-40`), with `title="Indisponible en mode aperçu"` when `previewMode`.
- The real `<BaristaJobTargetButton>` (which internally calls `requireApprovedCafeOwner`-gated endpoints) is not mounted at all when `previewMode`; a visually identical but `disabled` icon with an explanatory `title` renders in its place.
- The "Info" button, filter panel, and prev/next navigation are unchanged in preview mode (all read-only / client-side-only).

`profile.tsx`:
- Flash button `onClick` → `setFastSearchPreviewOpen(true)` (was `setFlashPreviewOpen(true)`).
- `<BaristaFastSearch open={fastSearchPreviewOpen} onClose={...} baristas={data?.card ? [data.card] : []} onOpenDetail={() => { setFastSearchPreviewOpen(false); setPreviewOpen(true); }} previewMode />` — fed by this account's own already-loaded `useMyBaristaProfile(user.id)` card, confirmed via a live API call (`GET /api/barista/profile/:userId`) to carry every field `BaristaMarketplaceCard` needs, including `flashImageUrl`. No new data fetch, no new endpoint.
- "Info" closes the Fast Search preview and opens the page's pre-existing `previewOpen`/`BaristaDetailModal` (`readOnly`) — the same modal the "Aperçu" button already uses; no second detail view was built.
- `flashPreviewOpen` state and `<FlashPreviewModal>` mount removed (dead after the button's rewiring); the `FlashPreviewModal` import was removed from this file only.

### 5.4 How preview mode prevents persistent mutations
1. **Favorite** — `previewMode` short-circuits `triggerFavorite()` before `useFavorites().toggleBaristaMarket()` is ever called, so no `POST`/`DELETE /api/barista-favorites` request is made from this surface. (Server-side, `POST /api/barista-favorites` already 403s any non-`CAFE_OWNER` session regardless — confirmed by reading `server/routes.ts:2713-2721` — so this is defense in depth, not the only safeguard.)
2. **Associer à une offre/mission (job targeting)** — the real `BaristaJobTargetButton` component (which owns the `useMyBaristaJobs`/`useAddBaristaJobTarget` calls) is never mounted in preview mode, so neither `GET /api/barista/jobs/mine` nor `POST /api/barista/jobs/:id/targets` is ever invoked from this surface. Both are additionally `requireApprovedCafeOwner`-gated server-side.
3. **No messages, notifications, payments, or other mutations** are reachable from `BaristaFastSearch` at all (confirmed by a full read of the component) — the only two mutating code paths in the entire component are the two above.
4. **Data isolation** — the preview is fed `[data.card]`, i.e. only the authenticated barista's own already-authorized profile card, never the public roster (`useBaristaProfiles()`/`GET /api/barista/profiles`) or any other account's data.
5. **Authorization is not UI-only** — every guard above is paired with a pre-existing, independent server-side role check (`CAFE_OWNER` for favorites, `requireApprovedCafeOwner` for job targeting/mine) that was not weakened, removed, or bypassed by this change.

### 5.5 Confirmation of existing Coffee Owner behavior
`client/src/pages/cafe/barista/barista-page.tsx:753-757` was not modified. Its `<BaristaFastSearch open={fastSearchOpen} onClose={...} baristas={profiles} onOpenDetail={...} />` call passes no `previewMode` prop, which defaults to `false` — every new conditional in the component (`previewMode ? … : …`) takes the original, unchanged branch for this caller. `npx tsc --noEmit` and the production build both passed with this file untouched, confirming no type or behavioral drift.

### 5.6 Confirmation of unchanged Flash behavior for other account types
`grep -rl "FlashPreviewModal" client/src` still lists all of `driver/profile.tsx`, `barista-academy/profile.tsx`, `printer/profile.tsx`, `marketing/profile.tsx`, `delivery/profile.tsx`, `maintenance/profile.tsx`, plus every "…detail-modal.tsx" that uses it from the Coffee-Owner-facing side, and `flash-preview-modal.tsx` itself — none of these files were edited in this task. Only `barista-marketplace/profile.tsx`'s own Flash button was rewired.

### 5.7 TypeScript and build results
- `npx tsc --noEmit` — **clean, exit 0** (run after the component change and again after the profile.tsx change).
- `npm run build` — **succeeded** (`✓ built in 22.81s`; server bundled to `dist/index.cjs`, 2.0mb; same pre-existing >500kB chunk-size warning as every prior build this session, unrelated to this change).

### 5.8 Tests executed and actual results
- No automated test suite exists in this project (`package.json` has no `test` script) — confirmed, not assumed.
- **Live API check**: logged into a real, pre-existing seeded Barista Marketplace account (`samir@barista.com`) against the currently-running dev server and called `GET /api/barista/profile/39` directly — confirmed `200 OK`, confirmed the response's `card` object carries every field `BaristaMarketplaceCard`/`BaristaFastSearch` require (including `flashImageUrl`, currently `null` for this seeded account, which exercises the component's own photo-fallback path rather than a broken state). Scratch cookie/response files were deleted immediately after.
- **No browser-automation tool was available in this session** — the following were verified by code inspection only, not by actually clicking through a rendered page, and still need a manual (or future browser-tooling) pass:
  - Visually opening the preview from the Flash button and confirming the "Aperçu Flash" label/badge render correctly.
  - Confirming the Favorite/job-target icons visually appear disabled and that their tooltips show on hover/long-press.
  - Confirming "Info" correctly closes the Fast Search dialog and opens the `BaristaDetailModal` preview without a visual glitch.
  - Mobile-width layout of the new badge (desktop-only CSS reasoning was checked by reading the Tailwind classes, which are the same responsive classes the rest of the dialog already uses — `w-[92vw] max-w-lg h-[90vh]` — but not rendered and measured in an actual mobile viewport).
  - Browser console / server log inspection during an actual click-through (not available without a browser tool).

### 5.9 Remaining limitations / manual verification steps
1. A human (or a future session with browser tooling) should click through the exact flow once: open `Business → Profil`, click Flash, confirm the "Aperçu Flash" badge, try the (disabled) Favorite and job-target icons, click "Info", close, and confirm the page's form state (unsaved edits, scroll position) is untouched.
2. Confirm on an actual mobile viewport that the new preview badge doesn't overlap the progress-bar dots at very small widths (both reuse existing, previously-mobile-tested classes, but the specific combination is new).
3. No backend route or schema was touched in this task, so there is no backend-restart dependency this time (unlike the two prior tasks in this project) — the entire change is live immediately via Vite's dev-time transform.
