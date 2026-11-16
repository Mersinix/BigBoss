# Admin Maintenance & Barista — Professional Card Sync, Order & Auto Approve Audit

## Scope
Apply the same visual/behavioral improvements already built for Admin Print/Academy/Marketing (see `docs/admin_service_store_cards_order_autapprove_audit.md`) to **Admin → Maintenance → Comptes Maintenance** and **Admin → Barista → Baristas** — but Maintenance and Barista have NO Store entity. The order and Auto Approve must be anchored directly to the **professional account/profile** (`maintenanceProfiles` / `baristaMarketplaceProfiles`), never to a Store.

## Reference: Admin Stores' mechanism (already built, untouched)
`displayOrder`/`autoApprove` columns on `supplierStores`, client-side drag-and-drop with `orderedIds`/`dragIdRef`, `bulkUpdateStoreOrder`, `setStoreAutoApprove`, and the `identityChanged && !autoApprove && approvalStatus in (APPROVED,REJECTED) → PENDING` reset inside `upsertSupplierStore`.

## Confirmed current state — Maintenance / Barista

| Requirement | Maintenance | Barista |
|---|---|---|
| `displayOrder` column on profile table | ❌ absent (`maintenanceProfiles`) | ❌ absent (`baristaMarketplaceProfiles`) |
| `autoApprove` column on profile table | ❌ absent | ❌ absent |
| Coffee Owner list sort (`getMaintenanceProfiles` / `getBaristaMarketplaceProfiles`) | ❌ none — pure DB join order | ❌ none |
| Admin page drag-and-drop UI | ❌ none | ❌ none |
| Admin card visual design | Plain `shadcn Card` + `Avatar` (orange theme), no cover image, no border-by-status | Same pattern (indigo theme) |
| Self-service PATCH → re-review reset on edit | ❌ none at all | ❌ none |
| `autoApprove` occurrences for these two modules | 0 | 0 |

**Architectural confirmation (no Store layer exists or will be created):** `/api/maintenance/profiles` (→ `storage.getMaintenanceProfiles`) and `/api/barista/profiles` (→ `storage.getBaristaMarketplaceProfiles`) are the sole Coffee Owner list endpoints for `/maintenance` and `/barista`; both read directly from `maintenanceProfiles`/`baristaMarketplaceProfiles` joined to `users`, with zero reference to `supplierStores` or any Store table. The order/Auto Approve mechanisms built here attach to these same two profile tables directly — no Store ID, no Store relationship, no Store ordering field of any kind is introduced.

**Same shared-caller finding as the previous task:** Admin's own account-edit routes (`PATCH /api/admin/maintenance/accounts/:userId`, `PATCH /api/admin/barista/accounts/:userId`) call the identical `upsertMaintenanceProfile`/`upsertBaristaMarketplaceProfile` functions used by each professional's own self-service route. The identity-changed reset therefore lives in the **self-service route handlers only** (`PATCH /api/maintenance/profile`, `PATCH /api/barista/profile`), computed before calling the shared upsert — never inside the upsert functions themselves, so Admin's own edits never trigger their own re-review.

**"Identity" field per module** (the one substantive content field exposed through each self-service route, mirroring Store's name/description/cover/logo spirit): `description` (Maintenance), `bio` (Barista). Operational-only fields (`marketplaceVisible`, `isOnVacation`, `skills`, `portfolioImages`, working hours, `dailyRateInCents` which is Admin-managed only for Maintenance) do not trigger a reset.

**Reset condition** (mirrors Store/Print/Academy/Marketing exactly): identity changed `&& !autoApprove && publicationStatus in ('APPROVED','REJECTED')` → `publicationStatus = 'PENDING'`, `publicationSubmittedAt = now`, `publicationRejectionReason = null`. The existing `/profile/go-live` routes (separate, explicit first-submission action) are untouched.

## Plan (built from scratch per module, modeled on but not sharing code with Supplier Store; no Store entities)
1. **Schema**: add `displayOrder`/`autoApprove` to `maintenanceProfiles`, `baristaMarketplaceProfiles`.
2. **Storage**: sort `getMaintenanceProfiles()`/`getBaristaMarketplaceProfiles()` output by `displayOrder` (this is the exact list the Coffee Owner `/maintenance`/`/barista` pages render — the single source of truth, no second ordering system); add `coverImageUrl`/`displayOrder`/`autoApprove` to each admin-overview account row; add `bulkUpdateMaintenanceOrder()`/`bulkUpdateBaristaOrder()` and `setMaintenanceAutoApprove()`/`setBaristaAutoApprove()`; add the identity-changed reset check inside the two self-service PATCH routes.
3. **Routes**: `PATCH /api/admin/{maintenance,barista}/accounts/bulk-order`, `PATCH /api/admin/{maintenance,barista}/accounts/:userId/auto-approve`.
4. **Client (Admin)**: redesign each module's account card to Store's visual language (cover image from `coverImageUrl`, logo/avatar from `profileImageUrl`, border color by `publicationStatus` in the module's own existing accent — Maintenance orange, Barista indigo — availability dot from `available`, drag handle), wire `orderedIds`/`dragIdRef`/`bulkOrderMutation` per page. Add the Auto Approve `Switch` to each account Detail modal with service-specific wording ("this maintenance professional" / "this barista" — never "supplier" or "store").
5. Preserve all existing actions (Approve/Reject registration status, Freeze, Edit, Delete, publication Approve/Reject, Interventions/Offres & Missions tabs, Favorites/Avis/Signaler) untouched.

## Non-goals / explicitly preserved
- No Maintenance Store or Barista Store table, column, or relationship of any kind.
- No change to Admin Stores, Print/Academy/Marketing's own order/auto-approve work, `/products`, or any other module.
- No change to each module's own registration-status + publication-status two-axis lifecycle.
- Go-Live routes remain the only path that submits a DRAFT profile for its first review.
- No reintroduction of the removed Maintenance Reservation model/daily-tariff UI/obsolete KPIs.

## Implementation status — DONE
All items above were implemented: schema columns added and pushed to the DB, storage sort/bulk-order/auto-approve functions added for both modules, 4 new admin routes added, identity-changed reset gating added to the 2 self-service PATCH routes (scoped to those routes only), and both Admin pages' account cards were redesigned to Store's visual language with persisted drag-and-drop reorder, plus a working Auto Approve `Switch` added to both account Detail modals. `npx tsc --noEmit` and `npm run build` both pass clean.
