# Admin Print/Academy/Marketing — Card Sync, Order & Auto Approve Audit

## Scope
Confirm current state (not assumed) of Admin Stores' reference mechanisms vs. Admin Print/Academy/Marketing, before building: (1) visual card sync, (2) persisted drag-and-drop order that also drives Coffee Owner Store-card order, (3) a real functional Auto Approve control per module.

## Reference: Admin Stores (Supplier) — exact mechanism
- `shared/schema.ts` `supplierStores`: `displayOrder integer default 0`, `autoApprove boolean default false`.
- `storage.getAllStoresAdmin()` — no `.orderBy()`; client sorts.
- `storage.getVisibleStores()` (public/Coffee-Owner `/products`) — `.orderBy(asc(displayOrder), asc(id))`. **This is the single link that makes Admin's reorder reach the Coffee Owner.**
- `storage.bulkUpdateStoreOrder(orders)` — `Promise.all` of independent per-row updates.
- `storage.setStoreAutoApprove(id, autoApprove)`.
- `storage.upsertSupplierStore()` — `identityChanged` (name/description/coverUrl/logoUrl) `&& !autoApprove && approvalStatus in (APPROVED, REJECTED)` → resets `approvalStatus = 'PENDING'`. This is the ONLY functional read-site of `autoApprove`.
- Client (`client/src/pages/admin/stores-page.tsx`): `StoreCard` (image cover, overlapping logo circle, border color by `approvalStatus`, visibility dot, drag handle) + parent `orderedIds`/`dragIdRef` state, `bulkOrderMutation`, optimistic reorder on drop. `StoreDetailDialog` has the Auto Approve `Switch` wired to `PATCH /api/admin/stores/:id/auto-approve`.

## Confirmed current state — Print / Academy / Marketing

| Requirement | Print | Academy | Marketing |
|---|---|---|---|
| `displayOrder` column | ❌ absent | ❌ absent | ❌ absent |
| `autoApprove` column | ❌ absent | ❌ absent | ❌ absent |
| Admin list `.orderBy()`/`.sort()` | ❌ none (DB join order) | ❌ none | ❌ none |
| Public card list (`get*CompanyCards`) sort | ❌ none | ❌ none | ❌ none |
| Admin page drag-and-drop UI | ❌ none | ❌ none | ❌ none |
| Admin card visual design | Plain `shadcn Card` + `Avatar` (blue theme), no cover image, no border-by-status | Same pattern (indigo theme) | Same pattern (fuchsia theme) |
| Self-service PATCH → re-review reset on edit | ❌ none at all (no code path ever sets `publicationStatus` from a plain profile edit, independent of auto-approve) | ❌ none | ❌ none |
| `autoApprove` occurrences outside Supplier Store | 0 (confirmed via repo-wide grep) | 0 | 0 |

**Important finding on where to place the gating logic:** Admin's own edit route for each module (`PATCH /api/admin/print/accounts/:userId`, confirmed at `server/routes.ts:2460-2481`, and the Academy/Marketing equivalents) calls the SAME shared `upsertPrinterProfile`/`upsertAcademyProfile`/`upsertMarketingProfile` function used by the provider's own self-service route. Supplier Store's `upsertSupplierStore` has only one caller (the supplier's own `PUT /api/supplier/store`), so embedding the gating check inside the upsert function is safe there. For Print/Academy/Marketing it is **not** safe to copy that exact placement — doing so would make Admin's own edits incorrectly flip the account back to PENDING. The gating check is therefore placed in the **self-service route handlers only** (`PATCH /api/print/profile`, `/api/academy/profile`, `/api/marketing/profile`), computed against the current profile before calling the shared upsert — functionally equivalent to Store's behavior, safely scoped to the caller that should trigger it.

**"Identity" fields per module** (the content a Coffee Owner actually sees, mirroring Store's name/description/cover/logo): `description` (all three) + `websiteUrl` (Print, Marketing — Academy's self-service route has no `websiteUrl` field). Operational-only fields (`marketplaceVisible`, `isOnVacation`, `portfolioImages`, `weeklyHours`) do **not** trigger a reset, matching Store's own exclusion of `isOpen`/`visibility`/media fields.

**Reset condition** (mirrors Store exactly): identity changed `&& !autoApprove && publicationStatus in ('APPROVED','REJECTED')` → `publicationStatus = 'PENDING'`, `publicationSubmittedAt = now`, `publicationRejectionReason = null`. Untouched: the existing `/profile/go-live` endpoints (separate, explicit submit-for-first-review action, not to be confused with this edit-triggered reset).

## Plan (built from scratch per module, modeled on but not sharing code with Supplier Store)
1. **Schema**: add `displayOrder`/`autoApprove` to `printerProfiles`, `academyProfiles`, `marketingProfiles`.
2. **Storage**: add `displayOrder`/`autoApprove` to each admin-overview account row; sort each `get*CompanyCards()` by `displayOrder`; add `bulkUpdate*Order()` and `set*AutoApprove()` per module; add the identity-changed reset check inside each self-service PATCH route handler.
3. **Routes**: `PATCH /api/admin/{print,academy,marketing}/accounts/bulk-order`, `PATCH /api/admin/{print,academy,marketing}/accounts/:userId/auto-approve`.
4. **Client (Admin)**: redesign each module's account card to Store's visual language (cover image from `coverImageUrl`, logo from `profileImageUrl`, border color by `publicationStatus` in the module's own accent color — Print blue, Academy indigo, Marketing fuchsia — availability dot from `marketplaceVisible && !isOnVacation`, drag handle), wire `orderedIds`/`dragIdRef`/`bulkOrderMutation` per page. Add the Auto Approve `Switch` to each account Detail modal with service-specific wording ("this print account" / "this academy" / "this marketing account" — never "supplier").
5. Preserve all existing actions (Approve/Reject/Freeze/Edit/Delete, publication Approve/Reject) untouched.

## Implementation status — DONE
All items in the plan above were implemented: schema columns added and pushed to the DB (verified via `psql`), storage sort/bulk-order/auto-approve functions added for all three modules, 6 new admin routes added, the identity-changed reset gating added to the 3 self-service PATCH routes (scoped to those routes only, not the shared upsert functions), and the 3 Admin pages' account cards were redesigned to Store's visual language (cover image, overlapping logo, border color by `publicationStatus` in each module's own accent — Print blue, Academy indigo, Marketing fuchsia — visibility dot, drag handle) with real persisted drag-and-drop reorder, plus a working Auto Approve `Switch` added to each of the 3 account Detail modals. `npx tsc --noEmit` and `npm run build` both pass clean.

## Non-goals / explicitly preserved
- No change to Admin Stores, `/products`, or the Supplier Store `autoApprove`/`displayOrder` mechanism.
- No change to each module's own two-axis lifecycle (registration `status` + `publicationStatus`) — Auto Approve only gates the identity-edit reset, it does not collapse into Store's single-axis `approvalStatus`.
- Go-Live routes (`/profile/go-live`) remain the only path that submits a DRAFT profile for its first review; unaffected by this change.
