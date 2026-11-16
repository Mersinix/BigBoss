# Admin → Users → Coffee Owner Cards: Profile-Photo Cover Fallback — Report

## 1. Files inspected
- `server/routes/users.routes.ts` — `GET /api/admin/users`, specifically the `displayCoverImageUrl` computation added in the previous task (Supplier Store cover fallback).
- `client/src/pages/admin/users-page.tsx` — the mapped card component, to confirm it already reads a role-agnostic `displayCoverImageUrl` field and that the avatar (`getAvatarUrl(u as any)`) is a fully separate code path reading `profileImageUrl` directly.
- `shared/schema.ts` — `users.coverImageUrl` / `users.profileImageUrl`, to confirm no new column was needed.
- `client/src/lib/avatar.ts` — `getAvatarUrl`'s signature/behavior, confirmed untouched and independent of the cover computation.

## 2. Files modified
Only `server/routes/users.routes.ts` — the `GET /api/admin/users` handler. **No frontend file was changed**: `client/src/pages/admin/users-page.tsx` already reads `(u as any).displayCoverImageUrl` for the card cover (wired in the Supplier task) and `getAvatarUrl(u as any)` for the avatar — both generic, role-agnostic reads that needed no further changes once the server started returning the right value for `CAFE_OWNER` too.

## 3. Exact fallback priority implemented
Inside the same `allUsers.map(...)` block that already computed `displayCoverImageUrl` for `SUPPLIER`:
```js
if (u.role === 'SUPPLIER') {
  displayCoverImageUrl = personalCover ?? storeCoverBySupplierId.get(u.id) ?? null;   // unchanged
} else if (u.role === 'CAFE_OWNER') {
  const personalPhoto = u.profileImageUrl && u.profileImageUrl.trim() ? u.profileImageUrl : null;
  displayCoverImageUrl = personalCover ?? personalPhoto ?? null;                       // new
} else {
  displayCoverImageUrl = u.coverImageUrl ?? null;                                       // unchanged
}
```
Where `personalCover` (shared by every branch) is already `u.coverImageUrl && u.coverImageUrl.trim() ? u.coverImageUrl : null`.

| Coffee Owner `coverImageUrl` | `profileImageUrl` | `displayCoverImageUrl` |
|---|---|---|
| Valid | Valid | `coverImageUrl` |
| Empty/null | Valid | `profileImageUrl` |
| Empty/null | Empty/null | `null` → the card's existing centered-icon fallback |

This reuses the exact same "non-empty-after-trim" test already used for the Supplier branch and for `personalCover` itself — no second, divergent "is this URL valid" rule was introduced. Only a role check (`CAFE_OWNER`) and a field read (`profileImageUrl`, already present on every `users` row, already fetched by the existing `db.select().from(users)` at the top of the handler) were added — **zero new database queries, zero new columns, zero new API calls**.

## 4. How the profile avatar remains independent
The card's avatar (`<AvatarImage src={getAvatarUrl(u as any)} ...>`) was not touched and never reads `displayCoverImageUrl` — it calls `getAvatarUrl`, which reads `profileImageUrl` directly and independently. Nothing in this change writes `profileImageUrl` into `coverImageUrl` or vice versa; `displayCoverImageUrl` is a *third*, purely computed, response-only field — the two underlying columns are read but never cross-assigned or persisted. Concretely, for a Coffee Owner like "GALATA" with an empty `coverImageUrl` and a set `profileImageUrl`: the card's cover block renders `profileImageUrl`'s image, and the avatar renders the exact same `profileImageUrl` via its own, separate `getAvatarUrl` call — the same URL appears in two places because both independently resolved to it, not because one was copied into the other. If GALATA later saves a real Cover URL, `personalCover` becomes non-null on the next `GET /api/admin/users`, the card's cover switches to it immediately, and the avatar is completely unaffected either way.

## 5. Confirmation that the Supplier fallback is unchanged
The `SUPPLIER` branch, the batched `supplierStores` query above it, and all of its surrounding comments are untouched — verified by diffing the edit: the only lines added are the new `else if (u.role === 'CAFE_OWNER')` branch and the `let displayCoverImageUrl: string | null;` declaration that replaced the previous single-expression ternary (needed to add a third branch) — functionally identical for `SUPPLIER` and for every other role.

## 6. Preserved, unmodified
Search/filters, role/status filtering, approval/rejection actions, pagination/page-size, "Add User," statistics, every other role's card cover (`else` branch is still the original `u.coverImageUrl ?? null` passthrough), and the card's layout/design (cover strip, avatar overlap, badges, actions) — none of these were touched in this task.

## 7. Tests executed and their actual results (code-level only — see limitations)
- `npx tsc --noEmit -p .` — **actually run, passed, zero errors**.
- `npm run build` — **actually run, passed**: Vite client bundle and esbuild server bundle both built successfully (only the pre-existing, unrelated "chunk larger than 500kB" advisory warning).
- No project test script exists — nothing else to run.
- **Not actually run** (code-level verification only, read end-to-end rather than executed): any of the 9 runtime scenarios in the task's own Testing section — entering/saving a GALATA-style account and watching its card in a live browser, confirming the exact network request count in dev tools, or confirming database state before/after. This environment has no `DATABASE_URL` and no browser-automation tool, consistent with every prior task this session. The priority logic in §3 and the "zero extra queries" claim in §3 were verified by reading the code (the `CAFE_OWNER` branch reads only already-fetched row fields, no new `db.select`/`fetch` call exists anywhere in the diff), not by observing a running request.

## 8. Remaining limitations
None beyond the inherent inability to exercise this in a live browser/database in this environment (see §7). The logic itself has no open ambiguity: Coffee Owner identity/photo fields live directly on `users`, with no related-entity lookup needed (unlike the Supplier case), so there was no relationship question to resolve.
