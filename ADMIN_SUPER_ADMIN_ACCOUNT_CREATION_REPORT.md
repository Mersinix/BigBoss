# Admin "Add User": ADMIN & SUPER_ADMIN Account Creation — Report

## 1. Files inspected
- `client/src/pages/admin/users-page.tsx` — `AddUserModal` (`REGISTERABLE_ROLES`, the role-select, the `validate()`/`buildName()` switches, the role-branching JSX for name fields, the shared Email/Téléphone/Photo/Cover/Password fields).
- `server/routes/users.routes.ts` — `POST /api/admin/users` (creation endpoint) and `PATCH /api/admin/users/:id` (confirmed it never reads or updates `role` at all — no existing role-escalation path via that endpoint).
- `server/routes/shared/middleware.ts` — `requireAdmin` (`if (!['SUPER_ADMIN', 'ADMIN'].includes(user.role)) return 403`).
- A repo-wide search for every `SUPER_ADMIN` reference in `server/` — to determine whether any existing rule already treats `SUPER_ADMIN` as more privileged than `ADMIN`.
- `shared/schema.ts` — `userRoleEnum` (confirmed `'ADMIN'` and `'SUPER_ADMIN'` already exist as role values; no new role name was introduced).
- `server/seed.ts` — confirmed the one bootstrap account seeded with role `SUPER_ADMIN`.

## 2. Key finding: no existing SUPER_ADMIN/ADMIN hierarchy
Every single authorization check in this codebase that mentions `SUPER_ADMIN` treats it as **exactly equivalent** to `ADMIN` — `requireAdmin` itself, and every other `['ADMIN','SUPER_ADMIN'].includes(role)` check across `academy.routes.ts`, `barista.routes.ts`, `delivery.routes.ts`, `orders.routes.ts`, `messages.storage.ts`, `delivery.storage.ts`, etc. (dozens of call sites, all treating the two roles identically). There is **no** existing rule anywhere that grants `SUPER_ADMIN` any capability `ADMIN` lacks. Per the task's own instruction for exactly this situation ("If the current application does not have a clearly defined permission rule... document the existing behavior and implement the safest compatible restriction rather than silently granting every ADMIN this capability"), I documented this finding and implemented the safest compatible new rule myself (see §4) — I did not silently let every `ADMIN` create `SUPER_ADMIN` accounts just because nothing already forbade it.

## 3. Files modified
- `client/src/pages/admin/users-page.tsx` — `AddUserModal` only (plus the `REGISTERABLE_ROLES` constant it alone uses).
- `server/routes/users.routes.ts` — `POST /api/admin/users` only.

No other file was touched — `PATCH /api/admin/users/:id`, the mapped user cards, `UserDetailDialog`, search/filters/statistics/pagination, and every other Admin Users feature are unchanged.

## 4. New picklist options & exact authorization rules implemented
`REGISTERABLE_ROLES` now includes `"ADMIN"` and `"SUPER_ADMIN"` (the exact existing enum values from `shared/schema.ts`'s `userRoleEnum` — no new role name was introduced), so they appear in the "Type de compte" `Select` exactly like every other role.

Server-side, in `POST /api/admin/users` (before any account is created):
```js
if (role === 'SUPER_ADMIN') {
  const actingUser = await storage.getUser(req.session.userId!);
  if (!actingUser || actingUser.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ message: "Seul un compte Super Admin peut créer un autre compte Super Admin." });
  }
}
```
- **Creating `role: "ADMIN"`**: gated exactly like every other role — only by the existing `requireAdmin` middleware (an authenticated `ADMIN` or `SUPER_ADMIN` session). This is "the appropriate authorization rule" already in force for this endpoint; no additional restriction was added since the task did not ask for one beyond what `requireAdmin` already enforces, and the codebase has no concept of a tier above that which could further restrict it.
- **Creating `role: "SUPER_ADMIN"`**: requires the *acting* session's own role to be `SUPER_ADMIN` — a brand-new, explicit, server-side-only check. A regular `ADMIN` sending `role: "SUPER_ADMIN"` (whether through the UI or a hand-crafted direct API request) is rejected with a `403` and a clear French message, **before** any validation, hashing, or database write happens.
- This check reads the request's own session-derived role (`req.session.userId` → `storage.getUser(...)`), never anything the client sends about its own privilege — so it cannot be bypassed by a direct API call that merely omits or spoofs some other field. It is also independent of, and in addition to, the frontend dropdown — removing or disabling the frontend option would change nothing about this server-side check.
- Self-role-modification / escalation via this endpoint is structurally impossible regardless: `POST /api/admin/users` only ever creates a **new** user row (duplicate emails are already rejected by the pre-existing `getUserByEmail` check), it never modifies the acting admin's own account; and `PATCH /api/admin/users/:id` — confirmed by re-reading it — never reads or writes `role` at all, so there is no existing path for any account (admin or otherwise) to change its own or anyone else's role after creation.

## 5. Role-specific form behavior
Added `"ADMIN"` and `"SUPER_ADMIN"` to the exact same case list `"DELIVERY_COMPANY"` already uses, in both `validate()` and `buildName()`, and in the JSX field-branching condition — reusing that existing individual-person field pair rather than inventing a new one:
- Shows **"Prénom \*"** / **"Nom \*"** (not "Nom du café," not "Nom de l'entreprise"/"Nom du contact" — those remain scoped to `CAFE_OWNER` and to every other business-style role respectively, via the existing `!["CAFE_OWNER","DELIVERY_COMPANY","ADMIN","SUPER_ADMIN"].includes(role)` guard around the company/contact fields).
- `buildName()` → `${firstName} ${lastName}`, the same individual-person name convention `DELIVERY_COMPANY` already uses, appropriate for an administrative staff account (not a business name).
- The shared fields below the role-specific block — **Email \***, **Téléphone \***, **Photo de profil (URL)**, **Cover (URL)**, **Mot de passe \*** — were not touched; they already render identically for every role, including these two new ones. No new field was invented and no database structure was changed — `profileImageUrl`/`coverImageUrl` already exist on `users` and are already persisted independently (confirmed from prior tasks this session).

## 6. Backend account-creation flow for ADMIN/SUPER_ADMIN
Once past the new authorization check, `ADMIN`/`SUPER_ADMIN` creation flows through the **exact same, unmodified** path every other role already uses — no separate mechanism was introduced:
- The existing shared password-policy check (`storage.getLoginSecuritySettings` + `isValidRegistrationPassword`).
- The existing duplicate email/phone checks.
- `storage.createUser({ name, email, password, role, status: 'approved', ... })` → the same `UserStorage.createUser`/bcrypt `hashPassword` call every role uses — passwords are hashed identically, never stored in plain text, regardless of role.
- `profileImageUrl`/`coverImageUrl` are both passed through independently (`profileImageUrl?.trim() || null`, `coverImageUrl?.trim() || null`), exactly as for every other role — persisted separately, neither one overwriting the other.
- `status: 'approved'` — the same default every Admin-created account of any role already receives (consistent with the existing "an Admin-created account is vetted by the platform, created already active" convention — no new approval/activation behavior was introduced for these two roles specifically).

## 7. Database changes
None. `ADMIN` and `SUPER_ADMIN` were already valid `userRoleEnum` values before this task (used by `requireAdmin` and dozens of other checks, and by the one seeded bootstrap account) — no schema change, no migration, no `npm run db:push` needed.

## 8. Tests actually executed and their results
- `npx tsc --noEmit -p .` — **actually run, passed, zero errors**.
- `npm run build` — **actually run, passed**: Vite client bundle and esbuild server bundle both built successfully (only the pre-existing, unrelated "chunk larger than 500kB" advisory warning).
- No project test script exists — nothing else to run.
- **Not actually run** (verified by reading the authorization/validation/creation code paths end-to-end, not by executing them against a live server): creating a real `ADMIN` or `SUPER_ADMIN` account through the UI; a hand-crafted direct `POST /api/admin/users` request with `role: "SUPER_ADMIN"` from a regular `ADMIN` session to confirm the `403`; confirming the new account's hashed password and persisted `profileImageUrl`/`coverImageUrl` in a real database; or confirming `CAFE_OWNER`/`SUPPLIER` creation still works end-to-end in a live run. This environment has no `DATABASE_URL` and no browser-automation tool, consistent with every prior task this session. The regression claims in §9 are based on reading the diff (the `CAFE_OWNER`/`DELIVERY_COMPANY`/default branches of every switch/condition were extended with new cases alongside the existing ones, never altered), not on running those flows.

## 9. Compatibility confirmed by reading the diff (not executed)
- `CAFE_OWNER` and `DELIVERY_COMPANY` branches in `validate()`, `buildName()`, and the JSX conditions are untouched — `ADMIN`/`SUPER_ADMIN` were added as **additional** `case`s/array entries, nothing existing was removed or reordered.
- The `default` (company/contact) branch still covers every other existing role exactly as before — it now additionally excludes `ADMIN`/`SUPER_ADMIN` from matching it, via the same style of array-exclusion check already used to exclude `CAFE_OWNER`/`DELIVERY_COMPANY`.
- Cover (URL) and the `PasswordInputField` show/hide toggle (added in the two immediately preceding tasks) are untouched — the password field is still the same `PasswordInputField` instance, still starts empty/hidden on every modal open via the same `reset()`/Dialog-unmount mechanism described in the previous report.
- `PATCH /api/admin/users/:id`, the mapped cards, `UserDetailDialog`, and every filter/search/pagination/statistic were not modified in this task.

## 10. Remaining limitations / manual verification required
With a real database and a browser available, the task's own 10-point test list should be run directly: in particular (4) a regular `ADMIN` session attempting `role: "SUPER_ADMIN"` via a raw HTTP request (e.g. `curl`/Postman) to confirm the `403` is enforced independently of the UI, and (3) an actual `SUPER_ADMIN` session successfully creating another `SUPER_ADMIN` account end-to-end. Nothing about the implementation itself is ambiguous or incomplete — the one genuinely undefined area (whether any hierarchy between `ADMIN` and `SUPER_ADMIN` was supposed to exist) was resolved explicitly per §2/§4 rather than left unresolved.
