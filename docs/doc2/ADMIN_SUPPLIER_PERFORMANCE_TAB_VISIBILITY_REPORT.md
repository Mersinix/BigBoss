# Admin Supplier Settings — Supplier Performance Tab Visibility Management

Task: add a "Visibilité de l'onglet Performance" configuration group under Admin → System Management → Supplier → Onglet, letting ADMIN/SUPER_ADMIN independently control Dashboard/Analytics/Earnings visibility within the Supplier's consolidated Performance area, with the Performance parent tab's own visibility always derived from those three.

## 1. Initial architecture audit

Before writing any code, the following was read in full:

- **`client/src/components/layout/app-sidebar.tsx`** — the Supplier's sidebar has a single consolidated **"Performance"** nav entry: `{ title: "Performance", url: "/", icon: Activity, activeUrls: ["/", "/supplier/analytics", "/supplier/earnings"] }`. Unlike every other role in this app (Delivery, Driver, Printer, Marketing, Academy, Barista Marketplace, Maintenance), which each have **one** `/<role>/performance` route rendering Dashboard/Analytics/Earnings as internal tabs of a single page/component, the **Supplier's three Performance sections are three separate top-level client routes**: Dashboard at `/` (root), Analytics at `/supplier/analytics`, Earnings at `/supplier/earnings`.
- **`client/src/App.tsx`** — confirmed the exact routing: `path="/"` → `HomeRoute` → `SmartDashboard` → `<SupplierDashboard />` for role `SUPPLIER` (note: `/` is the shared home route for **every** role, not Supplier-specific); `path="/supplier/analytics"` → `FinanceAnalyticsPage`; `path="/supplier/earnings"` → `SupplierEarningsPage`.
- **`client/src/components/supplier/supplier-performance-switcher.tsx`** — found via a repo-wide search (not assumed from naming) — this is the actual internal switcher component, rendered by all three pages, that lets a Supplier move between Dashboard/Analytics/Earnings. It is **URL-driven** (`<Link>`/`useLocation`, no local state), with a hardcoded 3-entry `TABS` array.
- **`client/src/pages/supplier/dashboard.tsx`**, **`finance-analytics-page.tsx`**, **`earnings-page.tsx`** — all three render `<SupplierPerformanceSwitcher />` and derive their entire content client-side from the exact same two **shared, multi-purpose** queries: `GET /api/orders` (also used by the Orders page, Returns page, etc.) and `GET /api/supplier/listings` (also used by Inventory/Products). **No dedicated backend endpoint exists for Dashboard, Analytics, or Earnings individually** — confirmed via a repository-wide grep for `supplier.*analytics|supplier.*earnings|supplier.*dashboard` in `server/`, which returned no route matches.
- **`server/storage/domains/platform-settings.storage.ts`** / **`shared/schema.ts`** — the existing `supplierTabSettings` table (Returns/Cafés visibility, added in the immediately preceding task) is exactly the "Admin → System Management → Supplier → Onglet" settings row this task's own instructions point to extending, rather than creating a new table.

## 2. Exact Performance routes, components and APIs identified

| Tab | Route | Component | Data source |
|---|---|---|---|
| Dashboard | `/` (shared home route, role-branched via `SmartDashboard`) | `SupplierDashboard` (`pages/supplier/dashboard.tsx`) | `GET /api/orders`, `GET /api/supplier/listings` (shared) |
| Analytics | `/supplier/analytics` | `FinanceAnalyticsPage` (`pages/supplier/finance-analytics-page.tsx`) | `GET /api/orders`, `GET /api/supplier/listings` (shared) |
| Earnings | `/supplier/earnings` | `SupplierEarningsPage` (`pages/supplier/earnings-page.tsx`) | `GET /api/orders` (shared) |
| Internal switcher | n/a | `SupplierPerformanceSwitcher` (`components/supplier/supplier-performance-switcher.tsx`) | n/a (pure nav) |

No replacement pages were created; all three existing pages, their designs, filters, charts and calculations are untouched except for the one guard described in §6.

## 3. Files created, modified, deleted

**Created**: none (the Store task's `ADMIN_SUPPLIER_STORE_CONFIGURATION_REPORT.md` and `use-supplier-store-settings.ts` predate this task).

**Modified**
- `shared/schema.ts` — `supplierTabSettings` gains three columns: `dashboardTabVisible`, `analyticsTabVisible`, `earningsTabVisible` (all `boolean().notNull().default(true)`). No new table.
- `server/storage/domains/platform-settings.storage.ts` — `getSupplierTabSettings()`/`updateSupplierTabSettings()` extended to read/write the three new columns and to always return a derived `performanceTabVisible` field (see §5).
- `server/storage.ts`, `server/storage/types/istorage.ts` — facade/interface signatures updated to the new shape.
- `server/routes/platform-settings.routes.ts` — the existing `PATCH /api/admin/supplier-tab-settings` Zod schema gains three optional boolean fields; `.strict()` means `performanceTabVisible` is rejected if a client ever tried to send it.
- `client/src/hooks/use-supplier-tab-settings.ts` — type/default extended with the three new fields + `performanceTabVisible`; added two shared helpers, `firstVisiblePerformanceUrl()` and `performanceRedirectTarget()`, used by the sidebar and all three Performance pages so they agree on one fallback order.
- `client/src/components/supplier/supplier-performance-switcher.tsx` — filters `TABS` by the live settings; renders nothing when ≤1 tab remains (no empty or one-option switcher).
- `client/src/components/layout/app-sidebar.tsx` — the "Performance" nav entry is now conditional on the derived `performanceTabVisible`, and its `url` always points at the first currently-enabled tab (so the nav link never lands on a tab that immediately redirects away).
- `client/src/pages/supplier/dashboard.tsx`, `finance-analytics-page.tsx`, `earnings-page.tsx` — each now reads `useSupplierTabSettings()` and, if its own tab is disabled, renders `<Redirect to={...} />` (wouter) to another enabled Performance tab or `/supplier/orders` as a last resort, instead of its normal content.
- `client/src/pages/admin/system-management-page.tsx` — new "Visibilité de l'onglet Performance" `<Card>` added inside the existing `SupplierTabVisibilitySection` component (alongside the untouched Returns/Cafés card): one read-only "Onglet Performance" status row + three independent Dashboard/Analytics/Earnings toggle rows.

**Deleted**: none.

## 4. How the three visibility settings are stored

Reused the exact existing "Onglet" settings architecture rather than creating a new table, per the task's own instruction — `dashboardTabVisible`, `analyticsTabVisible`, `earningsTabVisible` are three more columns on the same single auto-seeded `supplierTabSettings` row that already holds `returnsTabVisible`/`cafesTabVisible`. `getSupplierTabSettings()`/`updateSupplierTabSettings()` follow the identical read/merge/upsert shape already used for Returns/Cafés (and Store, from the preceding task). `PATCH /api/admin/supplier-tab-settings` accepts any subset of the five editable booleans; `GET /api/supplier-tab-settings` (public) and the PATCH response both return all five plus the derived sixth field below.

## 5. How parent Performance visibility is derived

`performanceTabVisible` is **computed, never stored**: `getSupplierTabSettings()` and `updateSupplierTabSettings()` both return `dashboardTabVisible || analyticsTabVisible || earningsTabVisible` as an extra field on their response, recomputed fresh every single time from whichever three values are currently in the row. It has no column, is not accepted by the PATCH schema (which uses `.strict()`, so sending it would be a 400), and the Admin UI renders it as a read-only Badge with no `Switch` at all — satisfying the task's explicit "do not introduce a separate independently editable parent toggle" requirement by construction (there is nothing to desync, since it is recomputed from the single source of truth on every read).

## 6. Frontend and backend access enforcement

A key finding from the architecture audit (§1) shapes this section: **Dashboard/Analytics/Earnings have no dedicated backend endpoint** — they only ever read the shared `/api/orders` and `/api/supplier/listings`, which must remain universally available to Suppliers for Orders/Returns/Inventory/Products pages regardless of this feature. Gating those shared endpoints was therefore out of scope and would have broken unrelated pages. The enforcement actually implemented:

- **Settings themselves** are fully backend-authoritative: stored server-side, only writable by `requireAdmin`-gated `PATCH /api/admin/supplier-tab-settings`, and the derived `performanceTabVisible` can never be set directly by any client (frontend or otherwise) — the Zod `.strict()` schema would reject it.
- **Sidebar nav**: the "Performance" entry disappears entirely when `performanceTabVisible` is false (all three children disabled); otherwise it always links to the first currently-enabled tab.
- **Internal switcher**: `SupplierPerformanceSwitcher` only renders the tabs whose setting is true, and renders nothing at all when 0 or 1 remain (matching the task's "do not display an empty Performance switcher" / implicit no-op-switcher-for-one-tab precedent already established for the Store task's Images/Vidéo toggle).
- **Page-level guard (the actual "block direct access to the page" mechanism, given there is no server route to 403)**: each of the three pages calls `performanceRedirectTarget(settings, <its own href>)`. If its own setting is disabled, it renders `<Redirect to={target} />` — to another enabled Performance tab if one exists, otherwise to `/supplier/orders` — instead of its normal content. This runs on every render, so it also governs an **already-open** tab that becomes disabled mid-session (§7), and it correctly never fires for any other role, since `/` is shared infrastructure (`SmartDashboard`) and this guard lives only inside `SupplierDashboard`, the Supplier-only branch.
- **Backend authority caveat, stated plainly**: because no dedicated API exists per tab, there is no server-side 403 to test for Dashboard/Analytics/Earnings specifically (unlike Returns/Cafés/Store in the preceding tasks, which do have such endpoints). The settings data itself is backend-authoritative and realtime-synced; the actual page gate is enforced client-side against that live, server-sourced value. This is reported transparently rather than overclaiming a backend block that doesn't exist for these three pages.

## 7. Real-time synchronization

No new transport. The three new columns live on the exact same `supplierTabSettings` row the preceding task already wired to `supplier_tab_settings_updated` (broadcast on every `PATCH /api/admin/supplier-tab-settings`) and `use-realtime.ts`'s existing handler (`qc.invalidateQueries({ queryKey: ["/api/supplier-tab-settings"] })`) — so no changes were needed there at all. Every consumer (sidebar, switcher, all three pages' redirect guards, the Admin card itself) reads the same live `useSupplierTabSettings()` query, so:
- An Admin toggle propagates to every open Admin/Supplier session without a manual refresh.
- A Supplier already sitting on a tab that becomes disabled gets redirected automatically on the next render (the guard re-evaluates every render since it reads the live query).
- Re-enabling a setting makes the nav entry/switcher tab/page reappear immediately, same mechanism in reverse.

## 8. Default values and backward compatibility

`dashboardTabVisible`, `analyticsTabVisible`, `earningsTabVisible` all default to `true` (both at the schema column level and in the client's `DEFAULT_SUPPLIER_TAB_SETTINGS` fallback), so `performanceTabVisible` defaults to `true` too. An installation with no saved row gets these on the first `getSupplierTabSettings()` call via the existing auto-insert-on-first-read behavior — identical to how Returns/Cafés/Store defaults already work. Existing Supplier functionality is therefore unchanged until an Admin explicitly changes something.

## 9. Tests actually executed and their results

- `npx tsc --noEmit -p .` — **passed**, zero errors (run twice: once after the backend-only changes, once after the full client+server diff).
- `npm run build` — **passed** (client + server bundles built successfully).
- `git status --porcelain` + `git diff --stat` / targeted `git diff shared/schema.ts` — **passed**: confirmed every file this task did not touch (`supplier.routes.ts`, `shared/middleware.ts`, `orders.routes.ts`, `cafe-registrations.routes.ts`, `store-page.tsx`, `cafes-page.tsx`, `returns-page.tsx`, `use-orders.ts`, `use-supplier-cafes.ts`, `use-supplier-store-settings.ts`, `use-realtime.ts`) carries only prior tasks' diffs, and that `shared/schema.ts`'s diff for this task is a pure, additive extension of `supplierTabSettings` (three new columns + comments), nothing else in the file touched.
- Manual code-path trace (static read-through, not executed): confirmed `SmartDashboard`'s role-branching is untouched and the new redirect guard only exists inside `SupplierDashboard`'s own branch; confirmed `performanceRedirectTarget`/`firstVisiblePerformanceUrl` agree on the same fallback order used by the sidebar, the switcher, and all three pages.

## 10. Tests added but not executed

None — no new automated test files were added (no test runner is configured in this repository beyond `tsc`/`vite build`, consistent with every prior task this session).

## 11. Tests requiring a live database or browser — not performed

This environment has no `DATABASE_URL` and no browser-automation tool, so the following from the task's 19-point list could **not** be executed and remain unverified end-to-end:

- Logging in as a real Supplier/Admin and visually confirming the new Performance card renders correctly in the Admin UI, and that each Switch/Badge updates live.
- Confirming `GET`/`PATCH /api/supplier-tab-settings` against a real Postgres instance (the new columns' auto-seeding, persistence, and that existing Returns/Cafés rows are unaffected by the migration).
- Actually disabling Dashboard/Analytics/Earnings in combination (all 7 non-trivial combinations from the task's table) in a running app and confirming the sidebar entry, switcher tabs, and each page's redirect behave exactly as specified — including watching an **already-open** browser tab on a Performance page receive a live WebSocket update and redirect without a manual refresh.
- Confirming direct URL navigation to a disabled tab actually redirects in a real browser (versus the static code trace performed here).
- Confirming no console errors/failed requests/unintended DB writes during any of the above.
- Confirming the existing Dashboard/Analytics/Earnings calculations (revenue series, top products/customers, commission/net earnings math) are pixel-for-pixel unchanged when visible — verified only by code diff (no changes were made inside any of their calculation logic), not by rendering them.

## 12. Confirmation: existing Returns, Cafés, Dashboard, Analytics and Earnings functionality preserved

- `SupplierTabVisibilitySection`'s existing Returns/Cafés `<Card>` and its `Switch`/`Badge` rows are untouched — only wrapped in a fragment with a new sibling `<Card>` added after it (verified via diff).
- No change was made to any Dashboard/Analytics/Earnings calculation, chart, filter, or data-fetching logic in `dashboard.tsx`, `finance-analytics-page.tsx`, or `earnings-page.tsx` — each received exactly one new hook call and one new early-return guard, placed after all existing hooks/memoized values and before the existing `return (...)`/JSX.
- `/api/orders` and `/api/supplier/listings` (and every other route) are completely unmodified — confirmed no other route file was touched this task (`git diff --stat` shows zero changes to `supplier.routes.ts`, `orders.routes.ts`, etc. beyond prior tasks' already-uncommitted diffs).
- The existing Returns/Cafés rows in `supplierTabSettings` are preserved by construction: `updateSupplierTabSettings` still merges `{...current, ...updates}` before writing, so a PATCH touching only the three new Performance fields can never alter `returnsTabVisible`/`cafesTabVisible`, and vice versa.

## 13. Remaining limitations and risks

- As stated plainly in §6, there is no dedicated backend endpoint to 403 for Dashboard/Analytics/Earnings individually, because none exists in this app's architecture — the shared `/api/orders`/`/api/supplier/listings` endpoints must and do remain universally reachable for Orders/Inventory/other Supplier features. Enforcement for these three specific tabs is therefore a live, server-settings-driven client-side route guard rather than a server-side request rejection, which is an architectural fact of this codebase, not a shortcut taken in this task.
- The new `supplierTabSettings` columns require a schema migration/`db push` to exist in any real environment before `getSupplierTabSettings()` is first called against a live database — identical situation to every other settings table added in this session's prior tasks, and not performed here since no reachable database exists in this environment.
- All claims about live realtime propagation and redirect behavior are based on static code review plus the same mechanism having been verified to work for Returns/Cafés/Store in the immediately preceding tasks; they were not independently re-verified against a running server/browser in this task, per the explicit instruction not to claim a test passed unless it was actually executed.
