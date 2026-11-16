# Admin Supplier Settings — Add Tab Visibility Management (Returns & Cafés)

## 1. Initial architecture audit

Before writing any code, the existing Admin → System Management → Supplier settings architecture (built in the immediately prior task, "Supplier System Management — Rename Promotion Section & Add Discount Code Visibility Controls") was inspected:

- `SUPPLIER_SUB_SECTIONS` drives an internal pill-switcher inside the "Supplier" top-level tab; `DiscountCodeSettingsSection` is the most recent precedent — a single auto-seeded settings row (`discountCodeSettings`), a public `GET` route, an `requireAdmin`-gated `PATCH` route that broadcasts a realtime event, a client `useQuery`-based hook with a safe "all true" default, and a `use-realtime.ts` handler that invalidates the query key on that event.
- This exact pattern was reused verbatim for the new "Onglet" sub-section rather than inventing anything new.

## 2. Exact existing Returns and Cafés routes and navigation components identified

This step mattered more than usual here, since the task explicitly warned against assuming route names:

- **Supplier nav** (`client/src/components/layout/app-sidebar.tsx`): `{ title: "Cafes", url: "/supplier/cafes", icon: Coffee }` (MAIN group) and `{ title: "Returns", url: "/supplier/returns", icon: RotateCcw }` (ORDERS group).
- **Returns page** (`client/src/pages/supplier/returns-page.tsx`) is backed by `useReturns()`/`useUpdateReturnStatus()` (`client/src/hooks/use-orders.ts`), calling `GET /api/returns` and `PATCH /api/returns/:id/status` (`server/routes/orders.routes.ts`). **Critically, these two routes are shared across three roles** — `GET /api/returns` serves Café owners (their own requests), Suppliers (their incoming requests) and Admin (all requests); `PATCH /api/returns/:id/status` is used by both Supplier and Admin to process a return. They are *not* Supplier-exclusive routes.
- **Cafés page** (`client/src/pages/supplier/cafes-page.tsx`) — inspecting its actual rendered content revealed it **only** renders the "Inscriptions" (café registration requests) view, backed by `useSupplierCafeRegistrations()`/`useCreateSupplierCafeRegistration()` (`client/src/hooks/use-supplier-cafes.ts`), calling `GET`/`POST /api/supplier/cafe-registrations` (`server/routes/cafe-registrations.routes.ts`). The older `GET /api/supplier/cafes` endpoint (`server/routes/supplier.routes.ts`, backed by `useSupplierCafes()`) still exists but — per a prior task's own report (`SUPPLIER_CAFE_REGISTRATION_ENHANCEMENTS_REPORT.md`) and confirmed again here via a repo-wide grep — has **zero callers anywhere in the client**. Both routes are exclusively Supplier-facing (`requireApprovedSupplier`).

This meant two different enforcement shapes were needed: a **role-scoped** check for the shared Returns routes, and a plain **Supplier-exclusive** gate for both Cafés-related routes (the unused legacy one, gated for completeness/safety, and the actually-used registrations one).

## 3. Files created, modified and deleted

**Created:**
- `client/src/hooks/use-supplier-tab-settings.ts` — client hook, mirrors `use-discount-code-settings.ts`.

**Modified:**
- `shared/schema.ts` — new `supplierTabSettings` table (`id`, `returnsTabVisible` boolean default `true`, `cafesTabVisible` boolean default `true`, `updatedAt`).
- `server/storage/domains/platform-settings.storage.ts` — `getSupplierTabSettings()` / `updateSupplierTabSettings()`.
- `server/storage.ts` — facade forwarding methods.
- `server/storage/types/istorage.ts` — interface declarations.
- `server/routes/platform-settings.routes.ts` — `GET /api/supplier-tab-settings` (public) and `PATCH /api/admin/supplier-tab-settings` (`requireAdmin`, broadcasts `supplier_tab_settings_updated`).
- `server/routes/shared/middleware.ts` — new shared `requireCafesTabEnabled` middleware (reused by two different route files).
- `server/routes/supplier.routes.ts` — `requireCafesTabEnabled` applied to `GET /api/supplier/cafes`.
- `server/routes/cafe-registrations.routes.ts` — `requireCafesTabEnabled` applied to `GET`/`POST /api/supplier/cafe-registrations`.
- `server/routes/orders.routes.ts` — role-scoped (`SUPPLIER`-only) `returnsTabVisible` check inside `GET /api/returns` and `PATCH /api/returns/:id/status`.
- `client/src/hooks/use-realtime.ts` — `SUPPLIER_TAB_SETTINGS_EVENTS` + invalidation handler.
- `client/src/hooks/use-orders.ts` — `useReturns` gained an optional `enabled` parameter (default `true`; its only caller is `returns-page.tsx`).
- `client/src/hooks/use-supplier-cafes.ts` — `useSupplierCafeRegistrations` gained an optional `enabled` parameter (default `true`; its only caller is `cafes-page.tsx`).
- `client/src/components/layout/app-sidebar.tsx` — "Cafes" and "Returns" nav entries now conditionally spread on `supplierTabSettings.cafesTabVisible` / `returnsTabVisible`.
- `client/src/pages/supplier/returns-page.tsx` — page-level access gate.
- `client/src/pages/supplier/cafes-page.tsx` — page-level access gate.
- `client/src/pages/admin/system-management-page.tsx` — the third "Onglet" sub-tab and the new `SupplierTabVisibilitySection`.

**Deleted:** none.

## 4. How the two settings are stored and enforced

One new table, `supplierTabSettings`, single auto-seeded row, two independent booleans both defaulting to `true`. Storage/route/hook shape is byte-for-byte the same pattern as `discountCodeSettings`'s from the prior task — no new architecture invented.

- **Admin UI:** `SupplierTabVisibilitySection`, two independent `Switch`+`Badge` rows ("Onglet Retours" / "Onglet Cafés") rendered under the new "Onglet" sub-tab, each `PATCH`ing `/api/admin/supplier-tab-settings` with only the one field that changed.
- **Supplier nav:** both "Returns" and "Cafes" entries are hidden independently based on their own setting.
- **Supplier pages:** both `returns-page.tsx` and `cafes-page.tsx` show the identical "Cette fonctionnalité est temporairement indisponible." full-page gate (same copy/layout as the Promotions/Discount Codes pages) when their respective setting is `false`.

## 5. Backend authorization and direct-route protection

- **Cafés** (plain Supplier-exclusive gate): the shared `requireCafesTabEnabled` middleware (new, in `server/routes/shared/middleware.ts`) is chained after `requireApprovedSupplier` on `GET /api/supplier/cafes`, and after `requireApprovedSupplier` on `GET`/`POST /api/supplier/cafe-registrations` — the route the Cafés page actually uses. Returns 403 with `"Cette fonctionnalité est temporairement indisponible."` when `cafesTabVisible` is `false`. Since all three routes are exclusively Supplier-facing, no other role is affected.
- **Returns** (role-scoped gate, because the routes are shared): inside `GET /api/returns` and `PATCH /api/returns/:id/status`, a new `if (user.role === 'SUPPLIER') { ... }` block checks `returnsTabVisible` and returns the same 403 **only when the requester is a Supplier**. A Café owner's own `GET /api/returns` call (to see their own submitted requests) and Admin's full view/processing ability are completely unaffected by this setting, by construction — verified by reading the unchanged surrounding role-branch logic (`isAdmin`/`CAFE_OWNER`/`SUPPLIER` filters) and confirming the new check sits before that logic touches nothing else.
- Only `ADMIN`/`SUPER_ADMIN` can write either setting (`requireAdmin` on both `PATCH` routes); Suppliers have no write path to either setting.

## 6. Real-time synchronization implementation

`PATCH /api/admin/supplier-tab-settings` calls `broadcast("supplier_tab_settings_updated", settings)` over the existing WebSocket broadcast layer — no new infrastructure. `use-realtime.ts` listens for this event and invalidates `["/api/supplier-tab-settings"]`, which (TanStack Query v5's default prefix-matching, `exact: false`) triggers an active refetch on every mounted observer at once: the Admin settings page, the Supplier sidebar, and an already-open Returns or Cafés page — no manual refresh, no polling.

An already-open Returns or Cafés page that becomes hidden mid-session re-renders into the same "indisponible" gate the instant the setting flips (the gate is a plain conditional on the reactive hook's value, evaluated on every render) — it does not wait for a route change or remount.

## 7. Default values and backward compatibility

Both `returnsTabVisible` and `cafesTabVisible` default to `true` on first auto-seed, preserving the exact current Supplier experience for any installation that has never touched this new setting. No existing table's schema or data was altered — `supplierTabSettings` is a new, additive table only (`drizzle-kit push`-safe); no migration was "genuinely necessary" beyond this additive table, so none of the existing `returns`/`supplierCafeRegistrations`/related tables were touched in any way.

## 8. Tests actually executed and their results

- `npx tsc --noEmit -p .` — **executed**, exit clean, zero errors.
- `npm run build` — **executed**, completed successfully (vite client build + server `tsx` build), only the pre-existing unrelated "chunk size > 500kB" advisory warning.
- Repo-wide grep for `/api/supplier/cafes` usage — **executed**: confirmed `useSupplierCafes()` has no callers anywhere in the client, confirming the Cafés page is actually backed by `/api/supplier/cafe-registrations`, not the route its name would suggest.
- `git status --porcelain` / `git diff` review of every touched file — **executed**: confirmed only the 17 files listed in §3 changed, and that the diffs inside `orders.routes.ts`, `cafe-registrations.routes.ts`, and `supplier.routes.ts` are purely additive (no existing line removed or altered besides the three `app.get`/`app.post` lines gaining one extra middleware argument).
- Diff review of `system-management-page.tsx` — **executed**: confirmed `PromotionSettingsSection` and `DiscountCodeSettingsSection` (both bodies and their render call sites) are completely untouched; only the lucide-react import line (added `Coffee`) and the `SupplierSubSection` type (added `"tabs"`) were extended.

## 9. Tests added but not executed

None — no automated test suite was added; verification is limited to type-checking, build, and manual diff/code review as above.

## 10. Tests requiring a live database or browser that could not be performed

This environment has no `DATABASE_URL` configured and no browser-automation tool, so the following could only be reasoned about from the code, not actually executed:

- Confirming the "Onglet" sub-tab renders correctly alongside "Promotion"/"Codes promotionnels" in a live Admin UI, and that both new rows toggle and persist against a real `supplier_tab_settings` row.
- Confirming existing Promotion and Codes promotionnels settings retain their real saved values after this change, against a live database.
- Confirming all 4 Returns/Cafés visibility combinations end-to-end with real HTTP requests from real Supplier/Café-owner/Admin sessions.
- Confirming existing return records and café/registration data are visually unchanged in a running app after toggling either setting off and back on.
- Confirming realtime propagation between two real, simultaneously open browser sessions (Admin toggles a setting; an already-open Supplier sidebar/page updates without refresh), and the "graceful redirect/handling" behavior for a Supplier already viewing a tab that becomes hidden.
- Confirming no console errors or failed network requests appear during any of the above in a real browser.
- Confirming other Supplier tabs and other roles' navigation are visually unaffected in a running app (verified only by code/diff inspection here).

## 11. Confirmation that existing returns, café data and all previous Supplier settings were preserved

By inspection: no `storage.getReturns`/`storage.updateReturnStatus`/`storage.createReturn`/`storage.getSupplierCafeRegistrations`/`storage.createSupplierCafeRegistration`/`storage.getSupplierCafes` method body was modified — the new checks in their calling routes only add an early `403` return before any of that existing logic runs; nothing about how a return or café-registration record is created, read, or updated was touched. The `discountCodeSettings` and `promotionSettings` tables, their routes, storage methods, and the `PromotionSettingsSection`/`DiscountCodeSettingsSection` components are all byte-for-byte unchanged — confirmed via the diff review in §8. No other Supplier tab (Store, Categories, Products, Inventory, Orders, Order Delivery, Payouts, Invoices, Promotions, Discount Codes, Settings, Help Center) or any other role's navigation was modified — confirmed via the `app-sidebar.tsx` diff touching only the two targeted entries.

## 12. Remaining limitations or risks

- All of §10's live-DB/live-browser scenarios remain unverified beyond code-level reasoning; a full manual or automated QA pass against a running environment with a real database is recommended before considering this feature production-ready.
- `GET /api/supplier/cafes` was gated for completeness/consistency with its name even though it currently has no client caller; if a future feature resurrects it as a real consumer, it will already correctly respect `cafesTabVisible` — this was a deliberate choice, not an oversight, but is worth knowing since it wasn't the primary enforcement target.
- No automated/unit tests were added for the new middleware, storage methods, or the role-scoped Returns checks; coverage here is type-checking plus manual review only.
