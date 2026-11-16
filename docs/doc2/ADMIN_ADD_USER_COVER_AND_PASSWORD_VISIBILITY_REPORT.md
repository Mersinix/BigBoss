# Admin Add User Modal: Cover URL & Password Visibility — Report

## 1. Files inspected
- `client/src/pages/admin/users-page.tsx` — `AddUserModal` (form state, `reset()`, `validate()`, `submit()`, JSX field order, the `Dialog`/`DialogContent` wrapper).
- `client/src/components/settings/password-input-field.tsx` — the existing shared show/hide-eye password component, already used by every "Sécurité" password-change form across 7+ account types.
- `client/src/components/ui/dialog.tsx` — confirmed `DialogContent` has no `forceMount`, so Radix unmounts it from the DOM on close (standard Radix `Presence` behavior) rather than just hiding it with CSS — this is what makes component-local state (like the eye-icon's `visible` state) reset for free on reopen.
- `server/routes/users.routes.ts` — `POST /api/admin/users` (the Add User submission endpoint) and `storage.createUser`'s generic passthrough (confirmed in a previous task in this session).
- `shared/schema.ts` — confirmed `users.coverImageUrl` already exists; no new column needed.

## 2. Files modified
- `client/src/pages/admin/users-page.tsx` — `AddUserModal` only.
- `server/routes/users.routes.ts` — `POST /api/admin/users` only.

No other file was touched — the role selector, role-specific name fields, email/phone/WhatsApp fields, validation rules, `buildName()`, the governorates/categories-removed-from-creation behavior, and every other Admin user-management component are unchanged.

## 3. Cover URL — frontend changes
- Added `coverImageUrl: ""` to `AddUserModal`'s `form` state and to `reset()` (so it's cleared along with every other field whenever the modal closes).
- Added one new field, placed exactly where specified — immediately after "Photo de profil (URL)," before "Mot de passe":
```tsx
<div className="space-y-1.5">
  <Label>Cover (URL)</Label>
  <Input data-testid="input-user-cover" type="url" value={form.coverImageUrl} onChange={sf("coverImageUrl")} placeholder="https://…" />
</div>
```
Same `Input type="url"` convention as "Photo de profil (URL)" immediately above it — no new validation rule, matching the task's "same conventions as the existing profile image URL input."
- Added `coverImageUrl: form.coverImageUrl.trim() || null` to `submit()`'s payload, alongside (not replacing) `profileImageUrl: form.profileImageUrl.trim() || null` — both trimmed and null-on-empty independently; neither one reads from or writes into the other.
- The field lives in the shared, non-role-branching part of the form (next to Email/Téléphone/Photo de profil), so it is sent and persisted identically regardless of the selected "Type de compte" — `CAFE_OWNER`, `SUPPLIER`, or any other `REGISTERABLE_ROLES` value.

## 4. Cover URL — backend changes
`POST /api/admin/users` (`server/routes/users.routes.ts`):
```js
const { name, email, password, role, phone, isWhatsapp, profileImageUrl, coverImageUrl, ... } = req.body;
...
const user = await storage.createUser({
  ...
  profileImageUrl: profileImageUrl?.trim() || null,
  coverImageUrl: coverImageUrl?.trim() || null,
  ...
} as any);
```
`coverImageUrl` is destructured as optional (no `required`-style check was added — only `name`/`email`/`password`/`role` remain required, unchanged), so a request that omits it entirely behaves exactly as before: `coverImageUrl?.trim()` is `undefined`, `undefined || null` is `null`, and the new account is created with a `null` cover, backward-compatible with every existing caller of this endpoint (e.g. the Prospecting "Create Account" flow, which does not send this field). `storage.createUser` is the same generic `db.insert(users).values(...)` passthrough already confirmed in a previous task — no storage-layer change was needed. Role-specific defaults, the password policy check, the duplicate email/phone checks, the `status: 'approved'` default, and the `MAINTENANCE`-only profile pre-creation are all untouched.

## 5. Password visibility — implementation
Replaced the plain
```tsx
<Input type="password" value={form.password} onChange={sf("password")} .../>
```
with the project's existing shared component:
```tsx
<PasswordInputField
  value={form.password}
  onChange={(v) => setForm(f => ({ ...f, password: v }))}
  autoComplete="new-password"
  testId="input-user-password"
  toggleTestId="button-toggle-user-password"
  ariaLabel="mot de passe du nouvel utilisateur"
/>
```
`PasswordInputField` (unmodified) already provides exactly the requested behavior: an absolutely-positioned toggle `<button type="button">` inside the input (`pr-10` padding reserved on the `Input` so the icon never overlaps typed text, no dimension change needed), `Eye`/`EyeOff` from `lucide-react` (the project's existing icon library), `type={visible ? "text" : "password"}` switching, and an `aria-label`/`title` describing the action (`"Afficher : mot de passe du nouvel utilisateur"` / `"Masquer : ..."`). The button's `type="button"` means clicking it can never trigger a form submission (and `AddUserModal`'s fields aren't inside a native `<form>` to begin with — submission only happens via the explicit "Créer l'utilisateur" button's own `onClick`). Password validation (`errors.password`, the 8-char/uppercase/digit/symbol regex check in `validate()`) and the server-side password-hashing/policy check are completely untouched — only the input's presentation changed.

## 6. Autofill prevention approach
- `autoComplete="new-password"` is passed explicitly — this is the standard browser signal that a field is for *setting* a new credential (for someone else, in this case) rather than a login field eligible for saved-password autofill suggestions.
- The password value is never seeded from anything: `form.password` starts at `""` in the initial `useState`, and `reset()` — called on every modal close (`onOpenChange={v => { setOpen(v); if (!v) reset(); }}`, the "Annuler" button, and the "×" close button all call it) — sets it back to `""` again. There is no code path anywhere in `AddUserModal` that reads a previously-submitted or any other user's password into this field.
- The eye-icon's own show/hide state lives inside `PasswordInputField`'s private `useState(false)`. Because `DialogContent` has no `forceMount` (confirmed in `dialog.tsx`), Radix's `Presence` mechanism un-mounts the dialog's entire content — including `PasswordInputField` — when the dialog closes, and re-mounts a fresh instance (fresh `visible = false`) the next time it opens. So both "password text resets to empty" and "eye icon resets to hidden" happen for the same underlying reason: a full remount on every open, not two separately-coded reset steps.

## 7. Confirmation: password is reset on modal close/reopen
Verified by reading the code path, not by running it: `reset()` unconditionally sets `password: ""` and is invoked from every close path (`onOpenChange(false)`, "Annuler," the "×" button), and a successful `submit()` also calls `reset()` before closing. Combined with the Dialog's unmount-on-close behavior resetting `PasswordInputField`'s internal visibility state, every reopen starts from `value=""`, `type="password"` (hidden), exactly as required.

## 8. Preserved, unmodified
Role selection and `REGISTERABLE_ROLES`, every role-specific required field and its validation message, `buildName()`, the email/phone/WhatsApp fields, `profileImageUrl` handling, the password policy regex, password hashing (`storage.createUser` → `UserStorage.hashPassword`, untouched), the `status: 'approved'` default and approval workflow, and every other Admin user-management component (`UserDetailDialog`, the mapped cards, filters/search/pagination/statistics, the Supplier Store and Coffee Owner profile-photo cover fallbacks) — none of these were touched.

## 9. Tests executed and their actual results
- `npx tsc --noEmit -p .` — **actually run, passed, zero errors**.
- `npm run build` — **actually run, passed**: Vite client bundle and esbuild server bundle both built successfully (only the pre-existing, unrelated "chunk larger than 500kB" advisory warning).
- No project test script exists — nothing else to run.
- **Not actually run** (verified by reading the code end-to-end — component structure, state wiring, Radix's documented unmount-on-close default — rather than by executing it in a browser): opening the real modal and watching the password field start empty/hidden, clicking the eye icon and observing the text toggle, closing and reopening to confirm the reset, creating a real `CAFE_OWNER`/`SUPPLIER` account with a Cover URL and confirming persistence via the Details modal, or confirming the browser does not offer a saved-password autofill suggestion (that last one is inherently a live-browser-only observation). This environment has no `DATABASE_URL` and no browser-automation tool, consistent with every prior task this session.

## 10. Remaining limitations
None beyond the inability to exercise this in a live browser/database here. Both enhancements reused existing, already-proven building blocks end-to-end (`coverImageUrl`'s existing column/partial-update convention from the three previous tasks; `PasswordInputField`, already battle-tested across 7+ Settings pages) rather than introducing anything new, so there was no design ambiguity to resolve.
