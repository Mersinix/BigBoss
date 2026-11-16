# Admin Supplier Settings — Store Configuration & Visibility Controls

Task: add a global **Store** configuration section under Admin → System Management → Supplier, letting ADMIN/SUPER_ADMIN control visibility/availability of the existing Supplier Store page's tabs, controls and fields, without ever touching any individual supplier's own store data.

## 1. Initial architecture audit

Before writing any code, the following existing pieces were read in full:

- **Schema**: `shared/schema.ts` — `supplierStores` (one row per supplier: `name`, `description`, `coverUrl`/`coverUrls[]`, `logoUrl`, `isOpen`, `visibility` (`VISIBLE`/`HIDDEN`), `mediaType` (`IMAGE`/`VIDEO`), `videoUrl`, `musicUrl`, `openingHours` jsonb, `approvalStatus`). This is **individual supplier data** and was never modified.
- **Routes**: `server/routes/supplier.routes.ts` — `GET /api/supplier/store` and `PUT /api/supplier/store` are the *only* two endpoints behind the whole Store page; the client sends partial payloads per section (Détails / Médias / Horaires), and `storage.upsertSupplierStore` already merges only the fields present in the payload.
- **Client page**: `client/src/pages/supplier/store-page.tsx` — a single page with an internal 3-way switcher (Détails de la boutique / Médias d'arrière-plan / Horaires d'ouverture), each with its own `useMutation` PUT call, plus a hardcoded 5-image cap and an Images/Vidéo toggle inside the Médias section.
- **Established settings pattern**: `discountCodeSettings` / `supplierTabSettings` (from the two prior tasks in this series) — a single auto-seeded settings row, a public `GET`, an admin-only `PATCH` broadcasting a realtime event, a client hook with an "all enabled" default, and `use-realtime.ts`'s event-array + `invalidateQueries` convention. This task reuses that exact pattern rather than inventing a new one.
- **Admin page**: `client/src/pages/admin/system-management-page.tsx` — the "Supplier" top-level tab already hosts an internal switcher (`SUPPLIER_SUB_SECTIONS`) with Promotion / Codes promotionnels / Onglet sub-sections, each its own component, each following an identical `useQuery` + local-state + `useMutation` + `Switch`/`Badge` row pattern.

## 2. Existing Store routes/components identified

- `GET /api/supplier/store`, `PUT /api/supplier/store` (`server/routes/supplier.routes.ts`) — the only backend surface for the whole Supplier Store page.
- `client/src/pages/supplier/store-page.tsx` — the only page; reused entirely, not replaced.
- `app-sidebar.tsx` — the "Store" nav entry (`/supplier/store`), previously unconditional.
- No separate route exists for Détails/Médias/Horaires individually — they are all sections of one page backed by the same two endpoints, each `saveX` mutation sending only its own slice of fields.

## 3. Files created, modified, deleted

**Created**
- `client/src/hooks/use-supplier-store-settings.ts` — client hook, same shape as `use-supplier-tab-settings.ts`, with an "everything visible, max 5" default.
- `ADMIN_SUPPLIER_STORE_CONFIGURATION_REPORT.md` — this report.

**Modified**
- `shared/schema.ts` — new `supplierStoreSettings` table (see §4).
- `server/storage/domains/platform-settings.storage.ts` — `getSupplierStoreSettings()` / `updateSupplierStoreSettings()`.
- `server/storage.ts`, `server/storage/types/istorage.ts` — facade/interface forwarding.
- `server/routes/platform-settings.routes.ts` — `GET /api/supplier-store-settings` (public), `PATCH /api/admin/supplier-store-settings` (admin-only).
- `server/routes/shared/middleware.ts` — new `requireStoreTabEnabled` middleware.
- `server/routes/supplier.routes.ts` — `requireStoreTabEnabled` on both Store routes, plus per-field enforcement and max-cover-images validation inside `PUT /api/supplier/store` (see §5–6).
- `client/src/hooks/use-realtime.ts` — `supplier_store_settings_updated` event → invalidate `["/api/supplier-store-settings"]`.
- `client/src/components/layout/app-sidebar.tsx` — "Store" nav entry gated by `storeTabVisible`.
- `client/src/pages/supplier/store-page.tsx` — full-page gate, per-control/field gating, dynamic max cover images, graceful media-switcher states (see §5).
- `client/src/pages/admin/system-management-page.tsx` — new "Store" sub-tab + `StoreSettingsSection` component; switcher reordered to **Onglet | Store | Promotion | Codes promotionnels** per the task's explicit "Expected switcher" spec (a pure display-order change — the Promotion and Codes promotionnels components/settings themselves are untouched, byte-for-byte relocated).

**Deleted**: none.

## 4. New settings and persistence mechanism

One new table, following the exact same single-auto-seeded-row pattern as `discountCodeSettings`/`supplierTabSettings` (a new table was used, not a new architecture — it is the established pattern applied to a new, independent group of settings; no migration risk since Drizzle's `db push` creates it additively and the get-method auto-seeds the row on first read):

```ts
export const supplierStoreSettings = pgTable("supplier_store_settings", {
  id: serial("id").primaryKey(),
  storeTabVisible: boolean("store_tab_visible").notNull().default(true),
  openControlVisible: boolean("open_control_visible").notNull().default(true),
  marketplaceVisibilityControlVisible: boolean("marketplace_visibility_control_visible").notNull().default(true),
  imagesTabVisible: boolean("images_tab_visible").notNull().default(true),
  videoTabVisible: boolean("video_tab_visible").notNull().default(true),
  maxCoverImages: integer("max_cover_images").notNull().default(5),
  musicVisible: boolean("music_visible").notNull().default(true),
  videoUrlFieldVisible: boolean("video_url_field_visible").notNull().default(true),
  hoursTabVisible: boolean("hours_tab_visible").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

`storage.getSupplierStoreSettings()` reads (or auto-inserts) the single row; `updateSupplierStoreSettings(updates)` merges `{...current, ...updates}` and upserts — identical shape to the Returns/Cafés tab settings added in the previous task. This table stores **only global configuration**; it has no foreign key to any supplier and never reads/writes `supplierStores`.

## 5. Frontend/backend enforcement per setting

| Setting | Frontend | Backend |
|---|---|---|
| **Onglet Store** (`storeTabVisible`) | Hides "Store" from the Supplier sidebar (`app-sidebar.tsx`); `store-page.tsx` renders a full-page "indisponible" gate (same Lock-icon pattern as Returns/Cafés) instead of the page, and its `useQuery` is `enabled: storeTabVisible` so it never fetches while hidden. | `requireStoreTabEnabled` middleware on both `GET` and `PUT /api/supplier/store` → 403 if hidden. |
| **Boutique ouverte control** (`openControlVisible`) | The "Boutique ouverte" row is only rendered when visible; `saveDetails` only includes `isOpen` in its PUT payload when visible (critical — see §6). | `PUT` rejects (403) if `isOpen` is present in the body while hidden. |
| **Visible sur la marketplace control** (`marketplaceVisibilityControlVisible`) | Same pattern for the "Visible sur la marketplace" row/`visibility` field. | `PUT` rejects (403) if `visibility` is present while hidden. |
| **Onglet Images** (`imagesTabVisible`) | The Images toggle button and panel are hidden; `coverUrls`/`coverUrl` are omitted from `saveMedia`'s payload when hidden. | `PUT` rejects if `mediaType === 'IMAGE'` or `coverUrls` is present while hidden. |
| **Onglet Vidéo** (`videoTabVisible`) | Same for the Vidéo toggle/panel; `videoUrl` omitted from `saveMedia` unless both `videoTabVisible` and `videoUrlFieldVisible` are true. | `PUT` rejects if `mediaType === 'VIDEO'` while hidden. |
| **Both Images and Vidéo hidden** | The whole Médias card shows a graceful centered message ("Aucune option de média n'est disponible…") instead of an empty/broken toggle. | n/a (no fields sent). |
| **Only one of Images/Vidéo visible** | The two-button toggle is not rendered at all; that single mode's panel is shown directly. An effect forces `form.mediaType` back to the only available mode if the currently-selected one becomes unavailable while the page is open. | n/a — enforced by the per-mode checks above regardless. |
| **Nombre maximum d'images de couverture** (`maxCoverImages`, 1–5) | "(X/max)" label and "Ajouter une image" button use the live configured max instead of a hardcoded 5; a French message explains the limit once reached. | `PUT` fetches the supplier's *existing* `coverUrls` count and only rejects (400) when the **incoming count is both higher than what's already saved AND higher than the configured max** — so lowering the max from 5 to 3 never deletes/blocks a supplier's existing 5 images on unrelated saves, it only blocks *adding* a 6th/4th beyond the limit. |
| **Musique d'ambiance** (`musicVisible`) | The whole "Musique d'ambiance" block (shared between both media modes) is hidden; `musicUrl` omitted from `saveMedia`'s payload when hidden. | `PUT` rejects if `musicUrl` is present while hidden. |
| **URL de la vidéo** (`videoUrlFieldVisible`) | Independent of the Vidéo tab itself — when the tab is visible but this field is hidden, the Vidéo panel shows "Cette fonctionnalité est temporairement indisponible." instead of the input. | `PUT` rejects `videoUrl` unless **both** `videoTabVisible` and `videoUrlFieldVisible` are true. |
| **Onglet Horaires d'ouverture** (`hoursTabVisible`) | The "Horaires d'ouverture" switcher tab is not rendered at all; an effect falls back to "Détails" if the page is left on that section when it becomes hidden. | `PUT` rejects if `openingHours` is present while hidden. |

## 6. A key correctness detail: per-field 403s vs. whole-section saves

The client's three save mutations (`saveDetails`, `saveMedia`, `saveHours`) each always sent their *entire* section's fields in one PUT (e.g. `saveDetails` always sent `isOpen` and `visibility` alongside `name`/`description`/`logoUrl`). Since the backend rejects a PUT **as soon as any one hidden field is present**, leaving those mutations unchanged would have caused hiding e.g. "Boutique ouverte" to also block saving the store's **name** — directly violating the task's "do not hide the entire Détails de la boutique section when only one of these controls is hidden" requirement.

Fix: each mutation now builds its payload conditionally, including a field **only when its governing setting is currently visible** (`saveDetails` for `isOpen`/`visibility`; `saveMedia` for `mediaType`/`coverUrl`/`coverUrls`/`videoUrl`/`musicUrl`). This was verified by reading the mutation code, not assumed.

## 7. Realtime synchronization

Reuses the existing WebSocket broadcast + React Query invalidation pipeline, no new transport:

- `PATCH /api/admin/supplier-store-settings` → `broadcast("supplier_store_settings_updated", settings)`.
- `use-realtime.ts` → `SUPPLIER_STORE_SETTINGS_EVENTS = ["supplier_store_settings_updated"]` → `qc.invalidateQueries({ queryKey: ["/api/supplier-store-settings"] })`.
- Every consumer (`app-sidebar.tsx`'s nav gate, `store-page.tsx`'s full-page gate and all per-control/field conditionals, the media-mode effect) reads the same live `useSupplierStoreSettings()` query, so a change propagates to every open Admin/Supplier session without a manual refresh — identical mechanism already verified working for Returns/Cafés in the prior task.
- An in-flight edit on a field whose permission is revoked mid-session cannot bypass the change: the row disappears from the UI on the next render (no way left to trigger that mutation), and if a request is somehow already in flight, the backend still re-reads `getSupplierStoreSettings()` fresh on every `PUT` and rejects it.

## 8. Default values and backward compatibility

All nine settings default to the pre-existing behavior exactly as specified: `storeTabVisible`, `openControlVisible`, `marketplaceVisibilityControlVisible`, `imagesTabVisible`, `videoTabVisible`, `musicVisible`, `videoUrlFieldVisible`, `hoursTabVisible` all default `true`; `maxCoverImages` defaults `5` (the previous hardcoded limit). An installation with no saved row gets these defaults the first time `getSupplierStoreSettings()` is called (auto-insert), so the Store page behaves identically to before until an admin changes something.

## 9. Confirmation: supplier-specific Store data preserved

- `supplierStores` (schema), `upsertSupplierStore` (storage), and the request/response shape of `GET`/`PUT /api/supplier/store` are **byte-for-byte unchanged** — verified via `git diff` on `shared/schema.ts` (only an addition after the existing tables) and `server/storage/domains/supplier.storage.ts` (zero diff — not in this task's changed-files list at all).
- No code path in this task ever writes to `supplierStores`; the new `supplierStoreSettings` table is entirely separate.
- Hiding a control never resets its value: every gated field is simply *omitted* from the client payload and *rejected* if present server-side — the stored value in `supplierStores` is left exactly as-is.
- The max-cover-images enforcement explicitly never deletes images (see §5/§6) — confirmed by code inspection of the new validation block, which only ever blocks an *increase* beyond the limit.

## 10. Tests actually executed and results

- `npx tsc --noEmit -p .` — **passed**, zero errors.
- `npm run build` — **passed** (client + server bundles built successfully).
- `git status --porcelain` + targeted `git diff --stat` / `git diff <file>` review — **passed**: confirmed every file outside this task's scope (`use-orders.ts`, `use-supplier-cafes.ts`, `cafes-page.tsx`, `returns-page.tsx`, `orders.routes.ts`, `cafe-registrations.routes.ts`) carries only the *prior* task's uncommitted diff, untouched by this one; `supplier.routes.ts`'s diff for this task is purely additive (new middleware import + two gate insertions + one new validation block inside the existing `PUT` handler body — no existing line removed or altered besides the two route-registration lines gaining a middleware).
- Manual code-path trace (static read-through, not executed): confirmed `saveDetails`/`saveMedia` only ever send a gated field when its setting is visible, confirmed the max-cover-images check compares against the supplier's existing saved count (not just the new count) before rejecting.

## 11. Tests added but not executed

None — no new automated test files were added in this task (consistent with every prior task in this series; no test runner/framework is configured in this repository beyond `tsc`/`vite build`).

## 12. Tests requiring a live database or browser — not performed

This environment has no `DATABASE_URL` configured and no browser-automation tool, so the following from the task's 33-point test list could **not** be executed and remain unverified end-to-end:

- Store switcher showing all 4 options in a real rendered Admin UI; actually toggling each switch and observing the badge/Switch state.
- `GET`/`PATCH /api/supplier-store-settings` against a real Postgres instance (row auto-seeding, persistence across restarts).
- Logging in as a real Supplier, confirming the Store nav entry/page disappear live when Admin flips `storeTabVisible`, and that a direct browser navigation to `/supplier/store` shows the gate.
- Actually PUTting `isOpen`/`visibility`/`coverUrls`/`videoUrl`/`musicUrl`/`openingHours` while each respective setting is hidden, and confirming the live HTTP 403/400 responses and status codes.
- Creating 5 cover images as a Supplier, having Admin reduce the max to 3, confirming via the real UI that all 5 remain visible and only the 6th addition is blocked, then increasing the max back and confirming a 4th/5th can be added again.
- Two simultaneous browser sessions (one Admin, one Supplier) confirming the realtime WebSocket push actually updates the Supplier's open tab without a refresh.
- Confirming no browser console errors/failed requests/unintended DB writes during any of the above.

## 13. Remaining limitations and risks

- The new `supplierStoreSettings` table requires a schema migration/`db push` to exist in any environment before these endpoints are first called; until then `getSupplierStoreSettings()` would throw on a real database (this mirrors the exact same situation as the prior `supplierTabSettings`/`discountCodeSettings` additions, and is expected to be handled the same way the project already handles schema migrations — no migration tooling was run here since there is no reachable database in this environment).
- All claims above about runtime behavior (realtime propagation, exact 403 bodies, graceful empty-media-state rendering) are based on static code review and the same pattern having been verified to work for the Returns/Cafés tab-visibility feature in the immediately preceding task — they have not been independently re-verified against a running server/browser in this task, per the explicit instruction not to claim a test passed unless actually executed.
- The Supplier sub-switcher's display order was changed (Onglet | Store | Promotion | Codes promotionnels) per the task's explicit "Expected switcher" line; this is a pure visual reordering and does not alter any Promotion/Codes promotionnels setting, value, or component.
