# Admin User Details/Edit Modal: Cover (URL) Field — Report

## 1. Files inspected
- `client/src/pages/admin/users-page.tsx` — `UserDetailDialog` (form state, seeding `useEffect`, `updateMutation`/`handleSave`, JSX field layout).
- `server/routes/users.routes.ts` — `PATCH /api/admin/users/:id` (the existing Admin user-update endpoint) and the `GET /api/admin/users` `displayCoverImageUrl` computation from the two previous tasks (Supplier Store fallback, Coffee Owner profile-photo fallback).
- `server/storage/domains/user.storage.ts` — `updateUser(id, data)`, confirmed to be a fully generic `db.update(users).set(data)...` passthrough with no field allowlist, so no storage-layer change was needed.
- `shared/schema.ts` — `users.coverImageUrl`, confirmed already nullable/existing — no new column.

## 2. Files modified
- `client/src/pages/admin/users-page.tsx` — `UserDetailDialog` only: added `coverImageUrl` to the form's `useState`, to its seeding `useEffect`, to `handleSave`'s `updateMutation.mutate(...)` payload, and one new `Input` in the JSX, placed immediately after "Photo de profil (URL)" and before "Adresse."
- `server/routes/users.routes.ts` — `PATCH /api/admin/users/:id`: added `coverImageUrl` to the destructured body and one `if (coverImageUrl !== undefined) updates.coverImageUrl = coverImageUrl?.trim() || null;` line, directly beside the existing, identically-shaped `profileImageUrl` line.

No other file was touched — `AddUserModal`, the mapped card component, the card's `displayCoverImageUrl` fallback logic (Supplier/Coffee Owner), the location/address editing flow, and the administrator actions (status/delete) are all byte-for-byte unchanged.

## 3. UI changes
In `UserDetailDialog`'s editable-fields grid, directly below the existing "Photo de profil (URL)" avatar+input row:
```tsx
<div className="space-y-1.5 col-span-2">
  <Label>Cover (URL)</Label>
  <Input data-testid="input-detail-cover" type="url" value={form.coverImageUrl}
    onChange={e => setForm(f => ({ ...f, coverImageUrl: e.target.value }))} placeholder="https://…" />
</div>
```
Same `Input`/`Label`/`space-y-1.5 col-span-2` conventions as every other field in this modal — no new styling, no layout change beyond inserting this one block. The field is part of the single shared form every role's detail view renders — there is no role branching anywhere in this component, so it is available unconditionally for every role (`SUPPLIER`, `CAFE_OWNER`, `DRIVER`, `ADMIN`, every Academy/other professional account), exactly as required.

## 4. Backend persistence changes
`PATCH /api/admin/users/:id` now accepts an optional `coverImageUrl` in the request body and persists it via the exact same partial-update pattern already used for `profileImageUrl`:
```js
if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl?.trim() || null;
if (coverImageUrl !== undefined) updates.coverImageUrl = coverImageUrl?.trim() || null;
```
Each field is read, trimmed, and written completely independently — setting one never touches the other, and omitting either from the request body leaves its currently-saved value untouched (the `!== undefined` guard, identical to every other field in this handler). Sending an empty string trims to `""`, which `|| null` normalizes to `null` — the same "clear it" convention already used for `profileImageUrl` and for every cover-URL field added in the prior two tasks. This is the existing, single Admin user-update endpoint — no duplicate endpoint was introduced, and the route remains `requireAdmin`-gated, so only an authenticated Admin/Super Admin session can call it (unchanged from before).

## 5. Confirmation: the actual saved cover URL is edited, not the computed fallback
`UserDetailDialog`'s seeding `useEffect` reads `coverImageUrl: u.coverImageUrl ?? ""` — the real column, the same one `PATCH` writes to — **never** `u.displayCoverImageUrl` (the computed, display-only field `GET /api/admin/users` added in the two previous tasks for the mapped card's fallback rendering). Concretely:
- A Supplier with an empty personal `coverImageUrl` whose card shows a Store cover (via `displayCoverImageUrl`) will see an **empty** input here, because the seeding reads `u.coverImageUrl`, not `u.displayCoverImageUrl`.
- A Coffee Owner with an empty `coverImageUrl` whose card falls back to their `profileImageUrl` will likewise see an **empty** input here, for the same reason.
- Saving from this modal always writes to `coverImageUrl` and nothing else — it can never accidentally persist a fallback value (a Store cover or a profile photo) into the real `coverImageUrl` column, because the modal's state is never seeded from, or written back from, `displayCoverImageUrl` at any point.

After a save, the next `GET /api/admin/users` refetch (triggered by `updateMutation`'s own `onSuccess` → `invalidate()`, and again by the existing `admin_user_directory_changed` broadcast → realtime invalidation) recomputes `displayCoverImageUrl` fresh from the newly-saved `coverImageUrl` — so the card's fallback priority (Supplier Store cover / Coffee Owner profile-photo cover / existing default) continues to apply correctly and automatically on top of whatever the Admin just saved, with no special-casing needed here.

## 6. Security and validation behavior
- `requireAdmin` middleware, unchanged — only an authenticated Admin/Super Admin can call `PATCH /api/admin/users/:id` for any user id, including modifying another user's `coverImageUrl`.
- Validated identically to `profileImageUrl`: an HTML `type="url"` input client-side, and server-side the same `?.trim() || null` normalization (no new/different validation rule was introduced — the task explicitly asked for consistency with the existing image-URL field, not stricter validation).
- No additional private user information is read, returned, or exposed by this change — the modal already receives the full `user` object from the Admin Users list it was opened from; this task only added one more editable projection of a field that object already contained.

## 7. Preserved, unmodified
Profile photo editing, full name/email/phone editing, address editing and `LocationPickerModal` location selection, the "Actions administrateur" status buttons (Approuver/Mettre en attente/Rejeter), user deletion, the mapped card design, the Supplier Store cover fallback, the Coffee Owner profile-photo cover fallback, and search/filters/statistics/pagination — none of these were touched.

## 8. Tests executed and their actual results
- `npx tsc --noEmit -p .` — **actually run, passed, zero errors**.
- `npm run build` — **actually run, passed**: Vite client bundle and esbuild server bundle both built successfully (only the pre-existing, unrelated "chunk larger than 500kB" advisory warning).
- No project test script exists — nothing else to run.
- **Not actually run** (verified by reading the code end-to-end, not by executing it): every scenario in the task's own Testing section — opening a real Supplier/Coffee Owner card and observing the input is empty despite a fallback cover showing on the card, saving/clearing a Cover URL and observing persistence, switching between two different user cards and observing the form re-seed correctly, or confirming an unauthorized request is rejected. This environment has no `DATABASE_URL` and no browser-automation tool, consistent with every prior task this session.

## 9. Remaining limitations
None beyond the inability to exercise this in a live browser/database here. The implementation has no open ambiguity: `coverImageUrl` already existed as a plain, independent column on `users`, the update endpoint already had an established per-field partial-update convention to extend, and the modal already had a single, non-role-branching form to add one field to.
