# Academy-Initiated Barista Registration & Admin Approval Workflow — Implementation Report

Built directly on the Supplier Café Registration architecture (`SUPPLIER_CAFE_REGISTRATION_AUDIT.md`, `SUPPLIER_CAFE_REGISTRATION_IMPLEMENTATION_REPORT.md`, `SUPPLIER_CAFE_REGISTRATION_ENHANCEMENTS_REPORT.md`). `npx tsc --noEmit` and `npm run build` both pass with zero errors. No automated test suite exists in this project — none were skipped.

## 1. Initial audit findings

### Supplier reference implementation
Re-read the full café registration stack: `shared/schema.ts` (`supplierCafeRegistrations`), `server/storage.ts` (`createSupplierCafeRegistration`/`approveCafeRegistration`/`rejectCafeRegistration`), `server/routes/cafe-registrations.routes.ts`, `client/src/hooks/use-supplier-cafes.ts`, `client/src/pages/supplier/cafes-page.tsx` (KPI cards, search/status/date filters, pagination), `client/src/pages/admin/supplier-cafe-registrations-tab.tsx`, and the duplicate-validation logic now shared via `server/contact-normalize.ts`. This is the proven, working template reused end-to-end below.

### Academy implementation
- **Business switcher**: `client/src/pages/barista-academy/business.tsx` uses `SubTabSwitcher` (`client/src/components/account/sub-tab-switcher.tsx`) — a generic, deep-linkable (`?tab=`) pill switcher, not the `Tabs`/`TabsList` component the Supplier/Admin pages use. Tabs: Profil/Formations/Inscriptions/Étudiants/Calendrier.
- **Étudiants page** (`students.tsx`): reads `useAcademyRegistrations()` — the **pre-existing, unrelated** `academyRegistrations` table (a Coffee Owner or Barista signing up for one of this Academy's training courses). Confirmed this is a completely different concept from what this task needed; left entirely untouched.
- **Academy visual identity**: indigo accent everywhere (`text-indigo-600 dark:text-indigo-400`, `bg-indigo-500/10` gradients), `DashboardHero`'s optional `gradientClass`/`iconBgClass`/`iconTextClass` props used to override the Supplier/Admin default blue, white/gray-800 `Card` backgrounds with `rounded-2xl` (not the Supplier page's plain `Card` default) — all in `students.tsx`. Reused exactly, not the Supplier page's literal colors.
- **Route protection**: `App.tsx` already wraps the whole `/barista-academy/business` page in `<ProtectedRoute allowedRoles={["BARISTA_ACADEMY"]} requireApproved>` — the new "Barista" tab inherits this automatically; no extra frontend gating was needed.
- **Academy route conventions**: `server/routes/academy.routes.ts` guards every Academy-owner action (courses, sessions, profile) with `requireAuth` + an inline `if (user.role !== "BARISTA_ACADEMY")` check — **no** approval-status gate, and **no** dedicated `requireApprovedAcademy` middleware exists (unlike Supplier's `requireApprovedSupplier`). Matched this exact convention for the new routes rather than introducing a new, differently-shaped middleware.
- **Admin Users page**: already has `Utilisateurs | Supplier utilisateurs` (from the previous task); `AddUserModal`/`UserDetailDialog`/user creation/approval/rejection logic confirmed unchanged and untouched by this task.

### The correct barista role (critical finding)
`shared/schema.ts`'s `userRoleEnum` has **two** barista-adjacent roles: `BARISTA_ACADEMY` (the training-organization account — what the *submitting* Academy itself is) and `BARISTA_MARKETPLACE` (an individual professional listed on the Barista Marketplace). Confirmed via:
- `server/storage/domains/barista.storage.ts` — `getBaristaMarketplaceProfiles` filters `users.role === "BARISTA_MARKETPLACE"` to build the public `/barista` marketplace listing.
- `client/src/pages/landing-page.tsx` — the public registration flow has a dedicated `BaristaMarketplaceForm` (distinct from `BaristaAcademyForm`) for exactly this role.

**`BARISTA_MARKETPLACE` is the correct role to assign on approval** — never `BARISTA_ACADEMY`, which is already the submitting Academy's own role and would be nonsensical to assign to the newly-created account.

### Identity-field decision (resolved from the codebase, not guessed)
The task suggested "Prénom du barista / Nom du contact, according to existing conventions" — ambiguous between a firstName/lastName split and a business/contact-name pair. I found the actual, authoritative existing convention: `landing-page.tsx`'s `BaristaMarketplaceForm` (the real public signup form for this exact role) collects **"Nom / Structure"** (optional business/stage name) + **"Nom du barista"** (the person's own name) — **not** a firstName/lastName split (that pattern exists only for `DELIVERY_COMPANY`). I therefore modeled `academyBaristaRegistrations` with `baristaName` (the barista's own identifying name — what becomes `users.name` verbatim on approval, no concatenation) and `contactName` (who at the Academy can be reached about this specific submission — pure metadata, mirroring the two-required-name-field shape of `supplierCafeRegistrations`, never part of the created account's name). This is documented inline in `shared/schema.ts`.

### Reusable components identified
`DashboardHero` (with Academy's own style props), `SubTabSwitcher`, `usePagination`/`DataPagination`, `DateRangeFilter`/`resolveDateRange`, `LocationPickerModal`, `server/contact-normalize.ts` (already extracted/shared in the previous task), the `isValidRegistrationPassword`/`registrationPasswordMessage` helpers, and the entire café-registration transaction/route/hook/page shape as a structural template.

### Potential conflicts — none found that required a workaround
No existing table, role, or endpoint overlapped with this workflow's purpose. The only real risk — reusing `academyRegistrations` (course signups) by mistake — was identified and explicitly avoided.

## 2. Existing components reused
`DashboardHero`, `SubTabSwitcher` (for the new "Barista" tab), `Tabs`/`TabsList`/`TabsTrigger` (Admin's existing switcher, unchanged structurally — just one more trigger), `usePagination`/`DataPagination`, `DateRangeFilter` + `resolveDateRange`, `LocationPickerModal`, `getAvatarUrl`, `apiRequest`, `useToast`, `server/contact-normalize.ts`'s `normalizeEmailForMatch`/`normalizePhoneForMatch`, `isValidRegistrationPassword`/`registrationPasswordMessage`, `storage.hashPassword`, `storage.getLoginSecuritySettings`.

## 3. Schema changes (`shared/schema.ts`)
- `academyBaristaRegistrationStatusEnum`: `PENDING | APPROVED | REJECTED`.
- `academyBaristaRegistrations` table: `id, academyId, baristaName, contactName, email, address, phone, status, createdAt, processedAt, processedByAdminId, rejectionReason, approvedUserId`, with indexes on `academyId`, `status`, and `createdAt` (per the task's explicit suggestion). No unique constraint on email/phone (duplicates allowed at request time, exactly like the café table); no change whatsoever to `users`, `academyRegistrations`, `baristaMarketplaceProfiles`, or any other existing table; no new role added to `userRoleEnum`.
- Additive only — **not pushed to any database**: this environment has no `DATABASE_URL` configured, so `npm run db:push` was never run, exactly as in every prior task this session.

## 4. API endpoints added (new file `server/routes/academy-barista-registrations.routes.ts`, registered in `server/routes.ts`)
- `GET/POST /api/academy/barista-registrations` — gated by a new `requireBaristaAcademy` helper local to this file (`requireAuth`-equivalent + inline `role === "BARISTA_ACADEMY"` check, matching `academy.routes.ts`'s own convention exactly rather than inventing a new approval-gated middleware). `academyId` is always `req.session.userId` — **never** read from the request body.
- `GET /api/admin/academy-barista-registrations`, `PATCH /api/admin/academy-barista-registrations/:id/approve`, `PATCH /api/admin/academy-barista-registrations/:id/reject` — `requireAdmin`.
No existing endpoint was modified.

## 5. Academy Barista page implementation (`client/src/pages/barista-academy/barista-registrations.tsx`)
Wired into `business.tsx` as a new `{ key: "barista", label: "Barista", icon: Coffee, content: <AcademyBaristaRegistrationsPage /> }` entry, immediately after `students`. Structure, mirrored from the Supplier Cafés → Inscriptions page:
- `DashboardHero` with title "Baristas" and the exact specified subtitle, styled with Academy's indigo accent (not Supplier's default blue).
- Four KPI cards (Total/En attente/Approuvées/Rejetées), computed client-side from the already-fetched `useAcademyBaristaRegistrations()` list (server-scoped to the authenticated Academy — zero extra requests), always from the full unfiltered list.
- "Inscrire un barista" action opening a modal with: Nom du barista, Nom du contact, Adresse e-mail, Adresse (optional), Numéro de téléphone (optional) — **no password field, no role selector, no self-approval control**: the Academy can only ever create a `PENDING` request.
- Duplicate-validation errors render as an inline `AlertCircle` banner inside the modal (same convention as the Café flow), and the modal stays open with every field preserved on failure.
- Search (name/contact/email/phone, whitespace/case-insensitive, phone compared digit-only), status filter (Tous/En attente/Approuvées/Rejetées), `DateRangeFilter`, client-side pagination via `usePagination`/`DataPagination`, and distinct empty states for "no registrations yet" vs. "no match for these filters."

## 6. Admin Academy utilisateurs implementation
- `client/src/pages/admin/users-page.tsx`: added a third `TabsTrigger` ("Academy utilisateurs") after "Supplier utilisateurs." The existing "Utilisateurs" and "Supplier utilisateurs" tab bodies are **untouched** — only the `TabsList` gained one more trigger and the `Tabs` body one more conditional branch.
- New, separate component file `client/src/pages/admin/academy-barista-registrations-tab.tsx` (not added inline to `users-page.tsx`, consistent with the Supplier tab's own separate-file precedent): lists registrations from every Academy, each card showing barista name/contact/status/email/phone/address and `Académie : [Academy Name]` (joined server-side in `getAdminAcademyBaristaRegistrations`). Default filter is "Toutes les demandes actives" (`PENDING ∪ REJECTED`) — **no "Approuvé" option**, exactly mirroring the Supplier tab's own behavior (an approved request's resulting account is only findable afterward in the ordinary "Utilisateurs" tab via the existing, unmodified `UserDetailDialog`). "Compléter et approuver" and "Rejeter" actions on pending rows; rejected rows stay visible with their reason.

## 7. Duplicate validation and normalization
Identical architecture and rules to the Café flow, reusing the same `server/contact-normalize.ts` functions (no third, diverging normalization system):
- `createAcademyBaristaRegistration` checks the submitted email/phone against every `users` row (any role/status) and every other `PENDING` academy-barista registration (any Academy), inside one `db.transaction`.
- Exact French messages as specified (email-only, phone-only, both, and the pending-duplicate variant: `"Une demande d'inscription pour ce barista est déjà en attente de traitement."`).
- An absent/empty phone never participates (same `normalizePhoneForMatch` under-8-digits guard as the Café flow).
- No existing account's identity or details are ever disclosed.
- As with the Café flow, this narrows but does not fully close the request-time race window under Postgres's default `READ COMMITTED` isolation — the real backstop is the atomic approval transaction below, which is fully race-safe. Documented inline, same as the Café flow's own comment.

## 8. Approval transaction and concurrency protection
`approveAcademyBaristaRegistration` (in `server/storage.ts`, directly on `DatabaseStorage` — see the "why not inside `AcademyStorage`" note below) — one `db.transaction`:
1. `tx.select(...).for('update')` locks the registration row and rechecks `status === 'PENDING'` — the second of two concurrently-approving admins blocks until the first's transaction commits or rolls back, then sees the already-updated status and throws.
2. Re-checks `users.email`/`users.phone` uniqueness inside the same transaction.
3. `tx.insert(users)` creates the real account: `role: 'BARISTA_MARKETPLACE'`, `status: 'approved'`, `name: data.baristaName` (verbatim — no concatenation, per §1's identity-field decision).
4. `tx.update(academyBaristaRegistrations)` sets `status: 'APPROVED'`, `approvedUserId`, `processedAt`, `processedByAdminId`.

Password hashing (`this.hashPassword`, pure CPU, no DB access) happens once before the transaction opens. As with the café flow, this deliberately never calls `storage.createUser` — re-confirmed by inspection that `UserStorage.createUser` still writes through the module-level `db` import, not a passed-in transaction executor, so calling it from inside `db.transaction` would not be atomic with the rest of the operation. If anything throws (duplicate email, registration no longer pending), Postgres rolls back everything, including the tentative lock — the registration is left exactly as it was, never an approved-but-accountless or accountless-but-approved state.

**Why these methods live directly on `DatabaseStorage` (`server/storage.ts`) rather than inside `AcademyStorage`** (`server/storage/domains/academy.storage.ts`): that domain class's own header comment explicitly documents its `this.facade` cross-domain escape hatch as scoped to "exactly two legitimate cross-domain calls." Adding a third (for `this.hashPassword`/`db.transaction` access) would widen a deliberately-narrow, already-documented invariant for a cluster that is architecturally closer to the café-registration pattern (small, self-contained, needs transactional user creation) than to Academy's own course/session business logic. This mirrors exactly how the café registration methods were placed directly on `DatabaseStorage` rather than inside `SupplierStorage` in the previous task.

No `baristaMarketplaceProfiles` row is pre-created on approval — confirmed via `server/routes/auth.routes.ts` that the public registration flow only pre-creates a profile for role `MAINTENANCE`; every other professional role, including `BARISTA_MARKETPLACE`, lazy-creates its profile row on first access (`barista.storage.ts`'s `getBaristaMarketplaceProfile`). Matching this existing convention exactly rather than inventing a new one.

## 9. Realtime synchronization implementation
No new realtime infrastructure. `academy-barista-registrations.routes.ts` broadcasts the same pre-existing `admin_user_directory_changed` event (already used by every other account-directory-affecting action) on create/approve/reject. Two lines were added to that event's existing handler in `client/src/hooks/use-realtime.ts`:
```js
qc.invalidateQueries({ queryKey: ["/api/academy/barista-registrations"] });
qc.invalidateQueries({ queryKey: ["/api/admin/academy-barista-registrations"] });
```
Because the Academy page's KPIs, search results, and pagination are all derived from that same one query's data in the same render pass, invalidating it is sufficient to keep every part of the page synchronized — no separate KPI/pagination refresh step was needed. This also keeps the Admin's Academy-utilisateurs tab in sync with actions taken elsewhere (another admin, or the Academy itself submitting a new request), without introducing any new WebSocket messages or polling.

## 10. Tests executed and actual results
- `npx tsc --noEmit -p .` — **passed, zero errors** (run once after the backend/schema changes, once after the full frontend wiring).
- `npm run build` — **passed**, both the Vite client bundle and the esbuild server bundle built successfully (only the pre-existing "chunk larger than 500kB" advisory warning, unrelated to this change).
- No project test script exists — nothing to run, nothing skipped.
- **Not executed**: any live HTTP request, browser interaction, or database query — this environment has no `DATABASE_URL` and no browser-automation tool, exactly as in every prior task this session. Every checkbox in the task's own "Verification and Regression Testing" section describes runtime behavior that cannot be exercised here; I verified the corresponding code paths by reading them end-to-end (route → storage → SQL → response → hook → component) rather than by running them, and I am not claiming otherwise.

## 11. Remaining limitations and manual verification steps
With a real Postgres database configured (`DATABASE_URL` set, `npm run db:push` run):
1. Confirm the "Barista" tab appears between "Étudiants" and "Calendrier" for a logged-in, approved `BARISTA_ACADEMY` account, and that every other tab still works.
2. Submit a registration, confirm it's `PENDING`, visible only to the submitting Academy, and that KPIs/list/pagination update without a manual refresh.
3. Repeat the full duplicate-validation matrix (existing email, existing phone, both, case/formatting differences, an equivalent still-pending request) and confirm each exact French message, that the modal stays open with fields preserved, and that no registration row or user account is created on failure.
4. From Admin → Utilisateurs → "Academy utilisateurs," approve a request: confirm the resulting account has role `BARISTA_MARKETPLACE`, status `approved`, a working hashed password, and appears in the ordinary "Utilisateurs" tab opening the existing `UserDetailDialog`; confirm the Academy's own page now shows `Approuvé` without a manual refresh.
5. Reject a request with and without a reason; confirm it stays visible to the Academy as `Rejeté` with the reason shown when present, and that no account was created.
6. Open the same `PENDING` request's approve modal in two admin sessions and attempt to approve both at nearly the same time — confirm the second attempt fails cleanly ("already approved or rejected") rather than creating a second account.
7. Confirm the pre-existing Étudiants page, training registrations, Academy profile/formations, the public Barista Marketplace, and both the Supplier café registration workflow and its own Admin tab are all still fully functional and unaffected.

None of the above could be executed in this environment; this section exists so they aren't silently skipped.
