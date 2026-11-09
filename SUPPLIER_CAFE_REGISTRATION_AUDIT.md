# Supplier-Initiated Café Registration & Admin Approval — Audit

Audit only. No application code, schema, migration, or configuration was modified to produce this report.

## 1. Executive Summary

Today, a Supplier's "Ajouter un café" action (`/supplier/cafes`) does not create a *request* at all — it immediately creates a real, `status: 'approved'` `CAFE_OWNER` user, with a password the Supplier chose on the café's behalf, and no admin ever reviews it (`server/storage.ts:609`, `createCafeForSupplier`, its own comment literally says "vetted by the supplier who added it, not the platform admin"). There is no registration-request entity anywhere in the schema, no pending/admin-review step for this flow, and the same Cafés page already conflates two different things behind one list and one `referred` boolean: cafés who have simply **ordered** from the supplier, and cafés the supplier **explicitly added**.

The proposed change introduces a new, dedicated `supplierCafeRegistrations` table (not a repurposing of `users`, not a repurposing of the unrelated `prospects` table, and not an overload of `users.referredBySupplierId`) holding the limited information a Supplier can submit, with its own `PENDING/APPROVED/REJECTED` lifecycle. An Admin completes the missing fields (password, full address, confirmed café/contact details) and, on approval, the system creates a normal `CAFE_OWNER` user through the *existing*, unchanged `createUser`/password-hashing path — so an approved registration becomes indistinguishable from any other café account, visible in the existing Utilisateurs tab via the existing `UserDetailDialog`, with no second account system.

Every piece of existing infrastructure this needs already exists and is directly reusable: the `pending/approved/rejected` status enum, the `createUser` hashing path, the `AddUserModal`'s exact CAFE_OWNER field set, the `UserDetailDialog`'s approve/reject actions, the `LocationPickerModal` for address capture, and the `Tabs`/`TabsList` sub-tab pattern already used on `admin/delivery-page.tsx` for an analogous "two views, one page" need.

## 2. Current Architecture

Relevant existing pieces, all read directly, none assumed:

- **Users**: one `users` table (`shared/schema.ts:46`) for every role, discriminated by `role` + `status` (`pending/approved/rejected`, `userAccountStatusEnum`, line 27). Password hashing is centralized in `UserStorage.hashPassword`/`createUser` (`server/storage/domains/user.storage.ts:69-93`) — bcrypt, the single write path for every account creation route in the app (public registration, Admin's "Add User", Supplier's "Add Café", driver/vehicle roster creation).
- **Supplier→café provenance**: `users.referredBySupplierId` (line 92) — set only when a Supplier used "Add Café"; its own schema comment explicitly states this is provenance-only, never required, and a café that merely ordered from a supplier (no referral) has no such marker. This is the *existing* supplier-customer-vs-supplier-added distinction the new feature must not confuse with a "registration request."
- **Admin approval primitive**: `PATCH /api/admin/users/:id/status` (`server/routes/users.routes.ts:170`) already exists and already drives the exact `pending → approved/rejected` transition for every approvable role, via `storage.updateUserStatus` + a notification. This is the general "approve a user" primitive — distinct from "turn a registration request into a user," which does not exist yet.
- **No existing "registration request" concept anywhere.** Confirmed by a full-schema search: `academyRegistrations` (line 2183) is an unrelated Barista Academy course-enrollment table; `prospects` (line 4437) is an unrelated Admin-side sales-lead table with no Supplier-ownership column and no path to becoming a user account. Neither is reusable here.

## 3. Current Supplier Cafés Implementation

- **`client/src/pages/supplier/cafes-page.tsx`** (271 lines) — the whole page. `AddCafeModal` (lines 19-69): collects `name`, `email`, `password` (min 6 chars), `phone`/WhatsApp, `profileImageUrl` — **exactly the two fields the task wants removed** (`Mot de passe`, `Photo de profil — URL`), and **no address field at all** today. `CafeDetailModal` (71-121): read-only, shows name/email/phone/address/order stats, a `referred` badge ("Ajouté par vous") distinguishing a directly-added café from an ordering one. The main list (`CafesPage`, 123-271) mixes both kinds in one grid with search/pagination; its own empty-state copy ("Les cafés qui commandent chez vous apparaîtront ici, ou ajoutez-en un directement") is itself evidence the two concepts are already conflated in the current UI.
- **`client/src/hooks/use-supplier-cafes.ts`** — `useSupplierCafes()` (`GET /api/supplier/cafes`) and `useCreateSupplierCafe()` (`POST /api/supplier/cafes`), typed `SupplierCafe = User & { orderCount, totalSpent, lastOrderAt, referred }`.
- **`server/routes/supplier.routes.ts:122-149`** — `cafeCreateSchema` (zod: name/email/password min 6/phone/isWhatsapp/profileImageUrl), `GET /api/supplier/cafes` → `storage.getSupplierCafes`, `POST /api/supplier/cafes` → `storage.createCafeForSupplier`, both `requireApprovedSupplier`-gated (session-derived supplier id only — `req.session.userId!`, never a client-supplied id).
- **`server/storage.ts:570-623`** — `getSupplierCafes(supplierId)`: joins `subOrders`/`orders` for real order stats, unions in every `users` row with `referredBySupplierId = supplierId`, returns the combined, de-duplicated list with a `referred` flag. `createCafeForSupplier(supplierId, data)`: checks email uniqueness (`getUserByEmail`), then `createUser({..., role: 'CAFE_OWNER', status: 'approved', referredBySupplierId: supplierId})` — **immediate, unreviewed approval**, exactly the behavior the new workflow must replace for this one entry point only (every *other* caller of `createUser`/`status:'approved'` is unaffected and out of scope).

## 4. Current Admin Users Implementation

- **`client/src/pages/admin/users-page.tsx`** (920 lines), single flat list, no tabs today.
  - `UserDetailDialog` (118-422) — the existing, reusable detail/edit modal: editable name/email/phone/WhatsApp/`profileImageUrl`/`locationAddress` (+ `LocationPickerModal` for the precise pin, "Modifier la localisation"), read-only detailed-address block (`ADDRESS_DETAIL_FIELDS`), a status bar + **Approuver/Mettre en attente/Rejeter** actions (`canApprove = APPROVABLE_ROLES.includes(user.role)`, which already includes `CAFE_OWNER`) via `PATCH /api/admin/users/:id/status`, and a delete action. **This is "the existing user detail modal" the task wants reused once a registration becomes a real user — it already does everything needed, unmodified.**
  - `AddUserModal` (423-618) — **already has almost the exact field set the task's §2 "Admin completes" list wants**: `Type de compte` (role select, `REGISTERABLE_ROLES`, defaults effectively to the branch shown), for `CAFE_OWNER` specifically: `Nom du café` + `Prénom du gérant`, then the shared `Email`/`Téléphone`/`Photo de profil (URL)`/`Mot de passe` fields, submitted to `POST /api/admin/users`. **The one gap: it never collects an address** — confirmed by reading its full `payload` object (name/email/phone/isWhatsapp/profileImageUrl/password only).
  - `UsersPage` (622-920) — `GET /api/admin/users` (no params, full table, client-side `usePagination`/filtered by role+status), stat cards (total/active/pending/admin counts), `statusMutation`/`deleteMutation`, a role+status filter bar.
- **`server/routes/users.routes.ts`** — `GET /api/admin/users` (59, full unfiltered `db.select().from(users)`), `POST /api/admin/users` (66, validates email/phone uniqueness + password policy via `isValidRegistrationPassword`/`registrationPasswordMessage`, then `storage.createUser({..., status:'approved'})`), `PATCH /api/admin/users/:id` (115, generic profile-field update incl. location), `DELETE /api/admin/users/:id` (146), `PATCH /api/admin/users/:id/status` + the `/approve`/`/reject` aliases (170-199, all → `storage.updateUserStatus` + `notifyAccountStatusChange`), `PATCH /api/admin/users/:id/categories` (201). All `requireAdmin`-gated.
- **Existing tabbed-admin-page precedent**: `client/src/pages/admin/delivery-page.tsx:887-913` already uses `Tabs`/`TabsList`/`TabsTrigger` (shadcn, `@/components/ui/tabs`) to switch between "Livraisons" / "Entreprises + Chauffeurs" / "Chauffeurs fournisseurs" on one page — the exact "two views, one page, don't touch the first view" shape `admin/users-page.tsx` needs for "Utilisateurs" vs "Supplier utilisateurs," already proven elsewhere in this codebase.

## 5. Database Schema and Relationships

| Table | Relevant columns | Notes |
|---|---|---|
| `users` | `id, email (unique), password, name, role, status (pending/approved/rejected), phone, isWhatsapp, profileImageUrl, locationAddress, locationLat, locationLng, locationPlaceId, locationDetails, referredBySupplierId, createdAt` | Single source of truth for every account, every role. |
| *(none)* | — | No existing table represents a pending, not-yet-a-user registration request. |

Password hashing: `UserStorage.hashPassword` (bcrypt, `bcrypt.hash(plain, 10)`) — the single existing write path, called from `createUser` only. Email uniqueness: `users.email` has a DB-level `.unique()` constraint *and* is pre-checked via `getUserByEmail` in every existing creation route (`createCafeForSupplier`, `POST /api/admin/users`, public registration) — both layers already exist and are directly reusable, not something to reinvent.

## 6. Current API Endpoints (relevant)

| Endpoint | Guard | Purpose |
|---|---|---|
| `GET /api/supplier/cafes` | `requireApprovedSupplier` | This supplier's combined customer+added café list. |
| `POST /api/supplier/cafes` | `requireApprovedSupplier` | Immediately creates an approved `CAFE_OWNER` with a supplier-chosen password. |
| `GET /api/admin/users` | `requireAdmin` | Full, unfiltered user table. |
| `POST /api/admin/users` | `requireAdmin` | Creates any role, `status:'approved'` always. |
| `PATCH /api/admin/users/:id` | `requireAdmin` | Generic profile-field update. |
| `PATCH /api/admin/users/:id/status` (+ `/approve`, `/reject`) | `requireAdmin` | The existing approve/pending/reject primitive. |
| `DELETE /api/admin/users/:id` | `requireAdmin` | Delete a user. |

No endpoint today reads or writes anything resembling a registration request.

## 7. Proposed Database Architecture

**A dedicated new table is the safest approach — not a repurposing of `users`, not an overload of `referredBySupplierId`, not the unrelated `prospects` table.** Reasoning: a registration request is not a user (no login, no password at submission, no role-gated access anywhere in the app), has its own independent lifecycle (`PENDING/APPROVED/REJECTED`) that is *not* `userAccountStatusEnum` (a registration can be rejected and *stay* a request forever — it is never itself a `users` row with `status:'rejected'`), and must retain Supplier ownership + Admin processing metadata that `users` has no columns for. This mirrors the exact reasoning already used twice elsewhere in this codebase for an analogous "looks similar but is a different concept" decision (`deliveryOpportunities` vs. the Smart Dispatch offers table; `academyRegistrations`/`prospects` vs. this).

Proposed table (naming illustrative, not final — `supplierCafeRegistrations`):

```
id                  serial PK
supplierId          int NOT NULL          -- references users.id (role SUPPLIER) — ownership boundary
cafeName            text NOT NULL         -- submitted at creation
contactName         text NOT NULL         -- submitted at creation ("Nom du contact", new field)
email               text NOT NULL         -- submitted at creation
address             text                  -- submitted at creation ("Adresse", new field) — plain text,
                                           -- NOT yet a verified/geocoded location (see §11)
phone               text                  -- optional, mirrors the existing AddCafeModal's optional phone
status              enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING'
createdAt           timestamp DEFAULT now()
processedAt          timestamp NULL       -- when an admin approved/rejected it
processedByAdminId   int NULL             -- which admin
rejectionReason      text NULL            -- optional, for traceability (task §4.7: "rejected requests must remain traceable")
approvedUserId       int NULL             -- the real users.id this became, once APPROVED — the link
                                           -- the task's own §2 "appear in the existing Utilisateurs tab" needs
```

Indexes, mirroring this codebase's own established partial-index conventions (e.g. `deliveryDriverOffers`'s one-PENDING-per-delivery index from the Smart Dispatch feature): an index on `supplierId` (a supplier's own request list — the §4.1/§4.13 isolation boundary), an index on `status` (the Admin tab's own filtering), and no uniqueness constraint on `email` at this table's level (see §12 — duplicates are a review-time signal, not a hard block, since two different suppliers could legitimately submit the same real café).

No column is denormalized or duplicated from `users` — `approvedUserId` is the only cross-reference, written once, at approval time, never read-modify-written afterward.

## 8. Proposed API Changes

**New, none modifying existing behavior:**

- `POST /api/supplier/cafe-registrations` (`requireApprovedSupplier`) — creates a `PENDING` row, `supplierId = req.session.userId` (never client-supplied), body: `cafeName, contactName, email, address, phone?`. **Never calls `createUser`, never touches `users` at all.**
- `GET /api/supplier/cafe-registrations` (`requireApprovedSupplier`) — this supplier's own requests only (`WHERE supplierId = req.session.userId`), satisfying §4.1/§4.13.
- `GET /api/admin/cafe-registrations` (`requireAdmin`) — all requests, satisfying §4.14.
- `PATCH /api/admin/cafe-registrations/:id/approve` (`requireAdmin`) — body supplies the Admin-completed fields (role is implicitly `CAFE_OWNER`; name/café-name/email/phone/profileImageUrl/password/address). Must, in one transaction (§4.12): re-check the request is still `PENDING` (reject a double-approval race), re-check email uniqueness (reusing the existing `getUserByEmail` check), call the **existing, unmodified** `createUser({..., role:'CAFE_OWNER', status:'approved'})`, then mark the request `APPROVED` with `approvedUserId`/`processedAt`/`processedByAdminId` set. See §10/§11 for whether this also sets `referredBySupplierId`.
- `PATCH /api/admin/cafe-registrations/:id/reject` (`requireAdmin`) — body: optional `rejectionReason`; sets `status:'REJECTED'` + `processedAt`/`processedByAdminId`. Never touches `users`.

**Explicitly NOT proposed**: any change to `POST /api/supplier/cafes` or `GET /api/supplier/cafes`'s existing behavior for the current customer-list use (see §13 on whether that route is retired or kept — flagged as an open question, not decided here), any change to `POST/PATCH/GET/DELETE /api/admin/users*`, any change to `createCafeForSupplier`/`createUser`/`getSupplierCafes` themselves.

## 9. Proposed Frontend Changes

**Supplier side** — `client/src/pages/supplier/cafes-page.tsx`:
- `AddCafeModal` → remove `Mot de passe`/`Photo de profil — URL` fields and the `password.length < 6` validation; add `Nom du contact` and `Adresse` (plain text input, consistent with the task's wording — no indication a full `LocationPickerModal` flow is wanted at submission time, only a free-text address a Supplier can type quickly, which the Admin later formalizes). Submits to the new `POST /api/supplier/cafe-registrations`, not `/api/supplier/cafes`.
- The page's own list/grid must switch from `useSupplierCafes()` (customers + referred) to a new `useSupplierCafeRegistrations()` hook reading `GET /api/supplier/cafe-registrations`, rendering `cafeName/contactName/email/address/createdAt/status` with the three French status labels (§5 of the task) — reusing the exact same `statusConfig`-style badge pattern already in `admin/users-page.tsx` (`En attente/Approuvé/Rejeté` → `pending/approved/rejected` already has this exact label set, directly reusable rather than inventing new copy).
- `CafeDetailModal`, the KPI cards (orders/revenue), and the order-stats concept do not apply to a registration request (it has no orders) — a new, much simpler read-only detail view (or none at all, if the card already shows everything) replaces it for this page's new purpose.

**Admin side** — `client/src/pages/admin/users-page.tsx`:
- Wrap the page's *existing* content (hero, stat cards, filter bar, table, `UserDetailDialog`, `AddUserModal`, delete dialog — all unchanged) as the "Utilisateurs" tab's content, using the exact `Tabs`/`TabsList`/`TabsTrigger` pattern already proven on `admin/delivery-page.tsx:887-913`.
- New "Supplier utilisateurs" tab: a new component (e.g. `SupplierCafeRegistrationsTab`) listing `GET /api/admin/cafe-registrations` with its own status/supplier filters and pagination (client-side `usePagination`, matching the existing page's own convention — no server-side pagination exists anywhere in this admin area to deviate from).
- A new "Compléter et approuver" modal/dialog, built by **extending `AddUserModal`'s existing CAFE_OWNER field layout** (Nom du café, Prénom du gérant, Email, Téléphone, Photo de profil, Mot de passe — all already there) with one addition: an address field (reusing `LocationPickerModal`, the exact component `UserDetailDialog` already uses for "Modifier la localisation" — not a new address-picking UI). Submits to `PATCH /api/admin/cafe-registrations/:id/approve`. A separate, much smaller "Rejeter" action (optional reason field) calls the reject endpoint.
- Once approved, the request disappears from "Supplier utilisateurs" (or shows as `Approuvé`, read-only — an open question, §18) and the newly-created account appears in "Utilisateurs" exactly like any other user, opened via the same, completely unmodified `UserDetailDialog`.

## 10. Registration and Approval Lifecycle

```
Supplier submits (café name, contact name, email, address[, phone])
        │  POST /api/supplier/cafe-registrations
        ▼
   PENDING  ── never a users row, never authenticated, no password exists yet ──
        │
        │  Admin opens it in "Supplier utilisateurs", completes the missing
        │  fields (password, confirmed address, optional profile photo)
        ▼
  ┌─────────────┐                       ┌──────────────┐
  │  APPROVE    │                       │   REJECT      │
  │ → createUser│                       │ → status =    │
  │   (existing,│                       │   REJECTED,   │
  │   unchanged)│                       │   reason kept │
  │ → status =  │                       │   (traceable, │
  │   APPROVED, │                       │   §4.7)       │
  │   approvedUserId set                │   never becomes│
  └─────────────┘                       │   a user       │
        │                                └──────────────┘
        ▼
  Real CAFE_OWNER user, status:'approved', visible in Utilisateurs
```

A `PENDING` request is never visible anywhere a normal approved user is (§4.5) because it simply isn't a `users` row at all — there is no redaction/filtering logic to get right here, unlike a feature that reuses `users.status`.

## 11. Security Considerations

- **§4.1/§4.13 (Supplier isolation)**: `GET/POST /api/supplier/cafe-registrations` both resolve the supplier id from `req.session.userId` only (`requireApprovedSupplier`), exactly like the existing `/api/supplier/cafes` routes already do — never a client-supplied id.
- **§4.2 (Suppliers cannot approve their own)**: the approve/reject endpoints are `requireAdmin`-only; no supplier-facing route ever writes `status` on this table to anything but the initial `PENDING`.
- **§4.3/§4.4 (No credentials, never auto-becomes a user)**: the submission schema has no `password` field at all, and the creation path never calls `createUser` — satisfied structurally, not by a runtime check that could be bypassed.
- **§4.9 (Existing supplier-café relationships/order history intact)**: nothing proposed touches `orders`/`subOrders`/`getSupplierCafes`'s existing join logic.
- **§4.10/§12 (Duplicate emails)**: the real, authoritative check is the existing one — `getUserByEmail` + the DB's own `users.email` unique constraint — applied at **approval** time (when a real account would actually be created), not at submission time. Two different suppliers submitting the same café's email is allowed to exist as two `PENDING` rows; the second one to reach approval fails the existing uniqueness check and the admin is told so (reusing the exact existing error message path `POST /api/admin/users` already has), not a new failure mode.
- **§4.11 (Password hashing)**: the admin-approval endpoint must pass the admin-entered password straight into the existing `createUser`, never hash it itself or store it on the registration table even transiently.
- **§4.12 (Transactional approval)**: the create-user-then-mark-request-approved sequence must not leave a request `PENDING` with an orphan user, nor an `APPROVED` request with no user — needs a single DB transaction (this codebase already has an established pattern for exactly this shape, e.g. `assignDriver`'s `db.transaction` wrapping a row update + a dependent write — see `server/storage/domains/delivery.storage.ts`). A second admin clicking "Approve" on an already-approved request must be rejected by a status re-check inside that same transaction (`WHERE status = 'PENDING'`), the same compare-and-swap idiom already used throughout this codebase's delivery-status transitions.
- **§4.8 (Existing customers never become registration requests)**: nothing in the proposed design ever reads from `users`/`orders` to backfill this table — it is populated exclusively by the new Supplier submission endpoint, so an existing ordering-customer café can never appear here unless a supplier explicitly re-submits them (a supplier choice, not an automatic conversion).
- **Private-information exposure**: the registration-request row (café name, contact name, email, address, phone) is visible to the owning supplier and to any admin — no more sensitive than what `AddCafeModal` already asked a supplier to type into a request they could see anyway; no new PII surface is introduced beyond what the Supplier already submits today.
- **Existing API consumers**: `GET/POST /api/supplier/cafes`, `GET/POST/PATCH/DELETE /api/admin/users*` are all untouched by this proposal — any other code reading them is unaffected.

## 12. Duplicate Registration Handling

Recommended: **allow duplicates at the request layer, resolve at approval time.** No unique constraint on `(email)` or `(supplierId, email)` on the new table — a supplier might legitimately resubmit a correction, or two suppliers might both deal with the same multi-location café. The Admin UI should surface a non-blocking warning when `GET /api/admin/cafe-registrations` reveals two `PENDING` rows with the same email (a client-side computation over the already-fetched list, no new endpoint needed), but the hard, authoritative rejection of a true duplicate happens exactly once, at the existing `getUserByEmail` check inside the approval transaction — reusing the exact mechanism `POST /api/admin/users` already has, not a new one.

## 13. Existing Functionality and Regression Risks

- **No risk to `users`, `orders`, `subOrders`, or any existing marketplace query** — the new table is fully additive; nothing existing reads or joins against it.
- **Open risk to flag, not silently resolve**: should `POST /api/supplier/cafes` (today's immediate-approval "Add Café") be *retired* once registration requests exist, or kept as a second, parallel way to add a café? The task's §1 only asks to change the *modal's fields* and says "the supplier must be able to create a registration request without creating an authenticated user" — read literally, this could mean the *same* button now creates a request instead of a user (replacing the old behavior), or that a *new, second* flow is added alongside the old one. This materially changes whether `createCafeForSupplier`/`POST /api/supplier/cafes` are modified, retired, or left alone — flagged in §18, not assumed here.
- **Regression risk if the Cafés page is simply swapped**: today's page also serves actual *ordering customers* (the non-`referred` majority of its list, per `getSupplierCafes`'s join against `orders`). The task's §5 explicitly says the redesigned page "must exclusively display supplier-created registration requests" — meaning the supplier would **lose visibility into their ordering customers on this page** unless that view is relocated elsewhere first. This is a real product-scope question (not an audit assumption) that should be confirmed before implementation removes the customer view outright.
- **No risk to Delivery/Driver/Smart-Dispatch features** (built in the immediately preceding tasks in this session) — entirely unrelated subsystem, no shared code paths.

## 14. Exact Files to Modify

| File | Change |
|---|---|
| `client/src/pages/supplier/cafes-page.tsx` | `AddCafeModal` field set; page's data source and card layout (pending §13's open question on scope). |
| `client/src/hooks/use-supplier-cafes.ts` | Either extended with new hooks or left alone if a new hooks file is preferred (see §15). |
| `client/src/pages/admin/users-page.tsx` | Wrap existing content in a "Utilisateurs" tab; add the "Supplier utilisateurs" tab alongside it (`Tabs`/`TabsList`, matching `admin/delivery-page.tsx`'s own pattern). |
| `server/routes/supplier.routes.ts` | New registration-request routes added near the existing `/api/supplier/cafes` block (not modifying it, unless §13's retirement question is answered yes). |
| `server/routes/users.routes.ts` or a new admin route file | New admin registration-request routes. |
| `shared/schema.ts` | New `supplierCafeRegistrations` table + status enum (additive only). |
| `server/storage.ts` or a new storage domain | New storage methods for the registration-request CRUD/approval transaction. |

## 15. Exact Files to Create

| File | Responsibility |
|---|---|
| `client/src/hooks/use-cafe-registrations.ts` (name illustrative) | `useSupplierCafeRegistrations`, `useCreateCafeRegistration` (Supplier side); `useAdminCafeRegistrations`, `useApproveCafeRegistration`, `useRejectCafeRegistration` (Admin side) — or split into two files by audience, matching this codebase's existing one-hook-file-per-feature convention. |
| A new Admin component for the "Supplier utilisateurs" tab content (e.g. `client/src/components/admin/supplier-cafe-registrations-tab.tsx`) | The request list, filters, pagination, and the "Compléter et approuver" modal — kept out of the already-920-line `users-page.tsx` rather than growing it further, consistent with this codebase's general preference for extracting a sub-tab's content into its own file when a page gains a second tab (e.g. `academy-blacklist-modal.tsx`-style extraction precedent from a much earlier task in this session). |

No new server storage *domain file* is strictly required — the existing convention (per `server/STORAGE_ARCHITECTURE.md`) would equally accept these new methods living directly on `DatabaseStorage` in `server/storage.ts`, next to the existing `getSupplierCafes`/`createCafeForSupplier`, since this is a small, cohesive, Supplier/Admin-specific cluster rather than a large standalone domain — a judgment call for implementation, not an audit finding.

## 16. Implementation Plan — Step by Step

1. Schema: add `supplierCafeRegistrations` + its status enum (additive, `npm run db:push` required afterward — no DB connection is available in this environment to verify that step).
2. Backend: Supplier submission + Supplier's-own-list endpoints; confirm `requireApprovedSupplier` session-only identity.
3. Backend: Admin list/approve/reject endpoints; the approval transaction (re-check `PENDING`, re-check email uniqueness, call unmodified `createUser`, write back `APPROVED`/`approvedUserId`).
4. Frontend: Supplier's `AddCafeModal` field swap + new submission hook; confirm the page's existing customer-list need is resolved (§13) before removing it.
5. Frontend: Admin's new tab, list component, and "Compléter et approuver" modal (extending `AddUserModal`'s existing CAFE_OWNER layout + `LocationPickerModal`).
6. Verification (per §17).

## 17. Testing and Verification Plan

- `npx tsc --noEmit`, `npm run build` after each step (this codebase's established discipline throughout this session's prior tasks).
- Manual/code-level trace (no automated test suite exists in this repository, confirmed repeatedly in prior tasks this session) of: a supplier can only list/create their own requests; an admin-only route rejects a supplier session; approving twice in quick succession only ever creates one user (transaction + status re-check); rejecting never touches `users`; an approved request's user shows correctly in the existing `UserDetailDialog` with no code change to that component.
- No database connection is available in this environment (confirmed in prior tasks this session — no `DATABASE_URL`) and no browser-automation tool is available — any future implementation task must state plainly that live database/browser verification was not performed, rather than claim it, exactly as every prior implementation report in this session has done.

## 18. Open Questions / Architectural Decisions

1. **Does `POST /api/supplier/cafes` (today's instant-approval "Add Café") get retired, or kept as a second, separate action alongside the new registration-request flow?** The task's wording is compatible with either reading. This single decision determines whether `createCafeForSupplier`/`getSupplierCafes` are touched at all.
2. **Does the redesigned Supplier Cafés page still need to show ordering customers somewhere?** If yes, that view needs a new home (a second tab on the same page, or elsewhere) before the existing combined list is replaced outright — not addressed by the task's own wording, flagged rather than assumed.
3. **Does an approved registration also set `users.referredBySupplierId` on the new account?** The task explicitly asks this to be investigated rather than assumed. Recommendation: yes — it is the exact existing field for "this café's account exists because this supplier added it," already understood by `getSupplierCafes`'s own join logic, and setting it costs nothing extra in the same `createUser` call. Not setting it would mean an approved registration's resulting café never shows up anywhere the existing provenance marker is already read.
4. **Does a `PENDING`/`REJECTED` registration remain visible to the submitting supplier indefinitely, or only for some window?** The task's §5 status list (`En attente/Approuvé/Rejeté`) implies all three stay visible; not explicitly time-bounded.
5. **Exact storage-layer home for the new methods** (directly on `DatabaseStorage` vs. a new small domain file) — a judgment call, not a correctness question (§15).
6. **Should a rejected request be resubmittable**, or does the supplier have to start a brand-new request? Not addressed by the task; the proposed schema supports either (a new row either way) without needing a decision now.

## Summary of findings

Only `SUPPLIER_CAFE_REGISTRATION_AUDIT.md` was created. No other file in the repository was modified, no migration was run, and no application behavior was changed. The audit found: (1) today's Supplier "Add Café" already creates a real, unreviewed `CAFE_OWNER` account — the new workflow is a genuine, needed change, not a refinement of an existing review step; (2) a dedicated new table is the correct, safest architecture, distinct from `users`, `referredBySupplierId`, and the unrelated `prospects`/`academyRegistrations` tables; (3) the Admin side needs almost no new UI building blocks — `AddUserModal`'s CAFE_OWNER fields, `UserDetailDialog`'s approve/reject actions, `LocationPickerModal`, and the `Tabs` pattern already proven on `admin/delivery-page.tsx` cover nearly everything; (4) the two biggest open product decisions (whether the old instant-approval "Add Café" path is retired, and whether/where the Supplier's ordering-customer list survives) are genuinely ambiguous in the task's own wording and are flagged in §18 rather than decided unilaterally.
