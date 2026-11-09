# Supplier-Initiated Café Registration & Admin Approval Workflow — Implementation Report

Implements the plan from `SUPPLIER_CAFE_REGISTRATION_AUDIT.md` plus the 6 Approved Product Decisions and the detailed DB/Backend/Frontend requirements. `npx tsc --noEmit` and `npm run build` both pass with zero errors.

## 1. Database (`shared/schema.ts`)

- New `supplierCafeRegistrationStatusEnum`: `PENDING | APPROVED | REJECTED`.
- New `supplierCafeRegistrations` table: `id, supplierId, cafeName, contactName, email, address, phone, status, createdAt, processedAt, processedByAdminId, rejectionReason, approvedUserId`.
  - No password field — no credentials are ever stored on a request.
  - No unique constraint on `email` — duplicates are allowed at request time by design.
  - `users`'s own unique email constraint is untouched.
- Additive only — no table was reset or truncated. **Not pushed to any database**: this environment has no `DATABASE_URL` configured, so `npm run db:push` was never run. This must be done against a real Postgres instance before the feature is usable.

## 2. Backend

### Retired the instant-approval path
- Confirmed via repo-wide grep that `storage.createCafeForSupplier` had exactly one caller: `POST /api/supplier/cafes` in `server/routes/supplier.routes.ts`.
- Removed that route, its `cafeCreateSchema`, and the `createCafeForSupplier` method (from `server/storage.ts` and the `IStorage` interface).
- `GET /api/supplier/cafes` and `storage.getSupplierCafes` are **byte-for-byte unchanged**.

### New storage methods (`server/storage.ts` / `server/storage/types/istorage.ts`)
- `createSupplierCafeRegistration`, `getSupplierCafeRegistrations`, `getAdminCafeRegistrations` (joins the submitting supplier's name/email).
- `approveCafeRegistration` — the atomic approval transaction (see below).
- `rejectCafeRegistration` — conditional `UPDATE ... WHERE status = 'PENDING'`, preserves the row (never deletes), stores an optional reason.

### Approval transaction — verified transaction-safe
Before writing this, I re-inspected `UserStorage.createUser` (`server/storage/domains/user.storage.ts`) and confirmed it writes through the **module-level `db` import**, not a passed-in transaction executor — calling it inside `db.transaction(...)` would **not** make that insert part of the transaction. So `approveCafeRegistration` never calls `createUser`. Instead, inside a single `db.transaction(async (tx) => {...})`:
1. `tx.select(...).for('update')` locks the registration row and rechecks `status === 'PENDING'` (serializes two admins racing on the same request — this `.for('update')` idiom already exists elsewhere in `storage.ts`, e.g. the settlement/refund locking code).
2. Email (and phone, if provided) uniqueness checked via `tx.select()` against `users`.
3. `tx.insert(users)` creates the real `CAFE_OWNER` account (`status: 'approved'`, `referredBySupplierId` set from the registration).
4. `tx.update(supplierCafeRegistrations)` sets `status: 'APPROVED'`, `approvedUserId`, `processedAt`, `processedByAdminId`.

Password hashing (`this.hashPassword`, pure CPU work, no DB access) happens once **before** the transaction opens, so the lock isn't held across a slow bcrypt call. If any step throws (e.g. duplicate email), Postgres rolls back everything, including the row lock's implicit state — the registration is left exactly as it was (`PENDING`), never stuck half-approved, and the supplier can be told to correct the email and the admin can retry.

### Routes (new file `server/routes/cafe-registrations.routes.ts`, registered in `server/routes.ts`)
- `GET/POST /api/supplier/cafe-registrations` (`requireApprovedSupplier`, supplier id taken only from `req.session.userId`, never from the request body).
- `GET /api/admin/cafe-registrations`, `PATCH /api/admin/cafe-registrations/:id/approve`, `PATCH /api/admin/cafe-registrations/:id/reject` (`requireAdmin`).
- The approve route reuses the existing shared password policy (`storage.getLoginSecuritySettings` + `isValidRegistrationPassword`/`registrationPasswordMessage`, the same helper `POST /api/admin/users` already uses).
- Both approve/reject notify the submitting supplier (`notify(...)`, `service: "ADMIN"` — same convention as `notifyAccountStatusChange` for account status) and broadcast `admin_user_directory_changed`.

## 3. Frontend — Supplier (`client/src/pages/supplier/cafes-page.tsx`)

- `useSupplierCafes`/`useCreateSupplierCafe` hook file (`use-supplier-cafes.ts`) updated: `useCreateSupplierCafe` replaced with `useSupplierCafeRegistrations` + `useCreateSupplierCafeRegistration` (new endpoint); `useSupplierCafes` is untouched.
- Page now has two tabs (same `Tabs`/`TabsList`/`TabsTrigger` pattern as `admin/delivery-page.tsx`):
  - **Inscriptions** (default) — the supplier's own registration requests with a status badge (En attente/Approuvé/Rejeté) and the rejection reason when rejected. "Inscrire un café" opens a modal collecting **Nom du café, Nom du contact, Email, Adresse (optional), Téléphone (optional)** — password and profile-picture fields were removed, since no account is created at this step.
  - **Clients** — the previous page's entire content (KPI cards, search, paginated grid, café detail modal) moved here unchanged, still backed by the untouched `GET /api/supplier/cafes`.

## 4. Frontend — Admin (`client/src/pages/admin/users-page.tsx` + new `supplier-cafe-registrations-tab.tsx`)

- `users-page.tsx` now wraps its entire existing body (stats, filter bar, user cards grid, pagination, `UserDetailDialog`, delete dialog, `AddUserModal`) in a `tab === "users"` branch — **not one line of that existing JSX was altered**, it was only wrapped in a conditional fragment.
- A new tab, "Supplier utilisateurs", renders a **separate component** (`SupplierCafeRegistrationsTab`, its own file, not added inline to the already-920-line `users-page.tsx`), which:
  - Lists registrations from `GET /api/admin/cafe-registrations`, each card showing the café name, contact, email, phone, address, and the submitting supplier's name.
  - "Compléter et approuver" opens a modal prepopulated from the supplier's submission (contact name, email, phone, address) where the Admin fills in the required password and optionally WhatsApp/profile picture, and can refine the exact address pin via the same `LocationPickerModal` used by `UserDetailDialog`. Submits to the approve endpoint.
  - "Rejeter" opens a small modal for an optional reason and submits to the reject endpoint.
  - A filter select: **"Toutes les demandes actives"** (default), **"En attente"**, **"Rejeté"**.

### Explicit inference flagged (truncated instruction)
The task's text was cut off mid-sentence right after listing the Supplier utilisateurs filter options ("...Provide filters for: - All active requests. - En attente. - Rejeté." — no "Approuvé" option was listed, and no further text followed). Combined with the task's own earlier, complete requirement that "Approved records must not appear in the active Supplier utilisateurs list," I implemented this tab to **never show `APPROVED` registrations**, in any filter: "Toutes les demandes actives" resolves to `PENDING ∪ REJECTED` only, and there is no "Approuvé" filter option at all. An approved registration's resulting account is only findable afterward as a normal user in the existing "Utilisateurs" tab. `GET /api/admin/cafe-registrations` itself still returns every status (including `APPROVED`) for completeness/future use — the restriction is enforced only in this frontend component. **This was inferred, not confirmed by you — flagging it explicitly in case the intended behavior differs** (e.g. if you did want an "Approuvé" filter for historical auditing within this same tab).

## 5. Not verified live
This environment has no `DATABASE_URL` and no browser-automation tool, so:
- The schema was never pushed to a real database (`npm run db:push` not run).
- No end-to-end request was actually executed (no login, no form submission, no network calls).
Verification here is limited to `tsc --noEmit` (0 errors) and `npm run build` (succeeds, both client and server bundles). Before this is usable, a real Postgres database needs to be configured and `npm run db:push` run, then the flow should be exercised manually: Supplier submits a registration → Admin sees it under "Supplier utilisateurs" → approve creates a working `CAFE_OWNER` login → reject preserves the row with a reason → duplicate email at approval time is rejected with a clear error and the registration stays `PENDING`.
