# Supplier System Management — Rename Promotion Section & Add Discount Code Visibility Controls

## 1. Initial architecture / settings audit

Before writing any code, the existing Admin → System Management settings architecture was inspected, specifically the already-implemented Promotion configuration (built in a prior task, "Admin Promotion Management — Supplier Promotions Visibility and Type Configuration"):

- A **single auto-seeded settings row** pattern: a dedicated small `pgTable` (e.g. `promotionSettings`) with exactly one row, a `getX()` storage method that seeds the row on first read if missing, and an `updateX(updates)` method that merges `{ ...current, ...updates }` and persists.
- A **public `GET` route** (no auth — the value must be readable by the Supplier's own nav/pages) plus an **`requireAdmin`-gated `PATCH` route** that calls `broadcast(eventName, settings)` over the existing realtime/WebSocket layer.
- A **client hook** (`use-promotion-settings.ts`) wrapping a `useQuery` against the public route, with a safe "all true" default so a transient load failure never hides a feature a Supplier already relies on.
- A **`use-realtime.ts` event handler** that calls `queryClient.invalidateQueries({ queryKey: [...] })` on the broadcast event, so every mounted observer (Admin's settings page, the Supplier's sidebar, the Supplier's feature page) refetches immediately with no polling and no new realtime infrastructure.
- On the backend, Supplier-facing routes for the feature are gated by a small `requireXEnabled` Express middleware chained **after** `requireSupplier`, returning a French 403 message when disabled.

This exact pattern was reused for the new Discount Codes settings rather than inventing a new one, per the task's explicit instruction to prefer the existing architecture.

**Why a new `discountCodeSettings` table instead of reusing `promotionSettings`:** Discount Codes and Promotions are two independent mechanisms in this codebase (confirmed via `shared/schema.ts`'s own documentation comments — Promotions are automatic eligibility rules, Discount Codes are Supplier-defined codes a customer enters at checkout). They only happen to share an Admin "Supplier" switcher group after this task's reorganization. No DB/migration change beyond adding one new table was needed or used; this is additive (`drizzle-kit push`-compatible) and does not touch any existing table, so it's fully backward-compatible.

## 2. Files created / modified

**Created:**
- `client/src/hooks/use-discount-code-settings.ts` — client hook, mirrors `use-promotion-settings.ts`.

**Modified:**
- `shared/schema.ts` — new `discountCodeSettings` table (`id`, `tabVisible` boolean default `true`, `newCodeButtonVisible` boolean default `true`, `updatedAt`).
- `server/storage/domains/platform-settings.storage.ts` — `getDiscountCodeSettings()` / `updateDiscountCodeSettings()`.
- `server/storage.ts` — facade forwarding methods.
- `server/storage/types/istorage.ts` — interface declarations.
- `server/routes/platform-settings.routes.ts` — `GET /api/discount-code-settings` (public) and `PATCH /api/admin/discount-code-settings` (`requireAdmin`, broadcasts `discount_code_settings_updated`).
- `server/routes/shop-catalog.routes.ts` — new `requireDiscountCodesEnabled` middleware; applied to all six Supplier-facing discount-code routes; an additional `newCodeButtonVisible` check inside `POST /api/discount-codes` specifically.
- `client/src/hooks/use-realtime.ts` — `DISCOUNT_CODE_SETTINGS_EVENTS` + invalidation handler.
- `client/src/hooks/use-discount-codes.ts` — `useDiscountCodes`/`useDiscountCodeStats` gained an optional `enabled` parameter (default `true`, every other call site unaffected — there were none besides the page itself) so the Supplier page skips fetching entirely while its tab is hidden.
- `client/src/components/layout/app-sidebar.tsx` — "Discount Codes" nav entry now conditionally spread on `discountCodeSettings.tabVisible`, same pattern as the existing "Promotions" entry.
- `client/src/pages/supplier/discount-codes-page.tsx` — page-level access gate, both "Nouveau code" buttons hidden per `newCodeButtonVisible`, Create-dialog submit blocked if the setting is revoked while open.
- `client/src/pages/admin/system-management-page.tsx` — the rename, the internal Supplier sub-switcher, and the new `DiscountCodeSettingsSection`.

## 3. How the Promotion section was moved without losing configuration

`system-management-page.tsx`'s top-level switcher array entry was changed from `{ id: "promotion", label: "Promotion", icon: Tag }` to `{ id: "supplier", label: "Supplier", icon: Store }` — a pure rename of the tab's id/label/icon, not a new tab. A new `SupplierSubSection` type (`"promotion" | "discount-codes"`) and a `supplierSubSection` state variable (default `"promotion"`) drive a second, inner pill-switcher rendered only when `activeSection === "supplier"`, visually identical to the outer switcher (same `bg-secondary/40 rounded-xl p-1` container, same active/inactive classes).

The existing `PromotionSettingsSection` component — its `Card`/`CardHeader`/`Switch`/`Badge` markup, its `useQuery`/`useMutation` calls against `/api/promotion-settings` and `/api/promotion-type-settings` — was **not opened or edited in any way**. Only its call site changed, from:
```
{activeSection === "promotion" && <PromotionSettingsSection />}
```
to:
```
{activeSection === "supplier" && supplierSubSection === "promotion" && <PromotionSettingsSection />}
```
Since the component owns its own data-fetching and the backend endpoints/table are untouched, every existing Promotion setting value is preserved exactly as before the move — there is no data migration involved, only a conditional-render relocation.

## 4. How the two new settings are stored / enforced

- **Storage:** one `discountCodeSettings` row, auto-seeded to `{ tabVisible: true, newCodeButtonVisible: true }` on first read — these are the task's required safe defaults, matching current (pre-task) behavior exactly.
- **Frontend enforcement:**
  - Admin UI: `DiscountCodeSettingsSection` (new), two independent `Switch` + `Badge` rows ("Onglet Codes promotionnels" / "Bouton Nouveau code"), each `PATCH`ing `/api/admin/discount-code-settings` with only the one field that changed.
  - Supplier nav: `app-sidebar.tsx` hides the "Discount Codes" entry entirely when `tabVisible` is `false`.
  - Supplier page: `discount-codes-page.tsx` shows the same "Cette fonctionnalité est temporairement indisponible." full-page message (identical copy/layout to the Promotions page's own gate) when `tabVisible` is `false`, and independently hides both "Nouveau code" buttons (header action + empty-state) when `newCodeButtonVisible` is `false`, without touching any other part of the page (cards, stats, filters, pagination, edit/delete, modals).
- **Backend enforcement (authoritative):** `requireDiscountCodesEnabled` middleware, chained after `requireSupplier`, applied to `GET /api/discount-codes`, `GET /api/discount-codes/stats`, `GET /api/discount-codes/:id/usage`, `POST /api/discount-codes`, `PUT /api/discount-codes/:id`, `PATCH /api/discount-codes/:id/status`, `DELETE /api/discount-codes/:id` — returns 403 with a French message when `tabVisible` is `false`. `POST /api/discount-codes` additionally checks `newCodeButtonVisible` and returns its own French 403 if that specific setting is off, independent of `tabVisible`. The Coffee-Owner-facing `POST /api/discount-codes/validate` route (checkout redemption) was explicitly left untouched — confirmed by inspection and by grepping the diff for any checkout-related file, none were touched.

This produces exactly the task's required truth table:
| Tab | Button | Result |
|---|---|---|
| Visible | Visible | access + create |
| Visible | Masqué | access + manage existing, no create |
| Masqué | Visible | no access at all (tab gate wins) |
| Masqué | Masqué | no access, no create |

## 5. Realtime sync implementation

`PATCH /api/admin/discount-code-settings` calls `broadcast("discount_code_settings_updated", settings)` over the existing WebSocket broadcast layer (no new infra). `use-realtime.ts` listens for this event and calls `queryClient.invalidateQueries({ queryKey: ["/api/discount-code-settings"] })`, which — per TanStack Query v5's default `exact: false` prefix matching — triggers an active refetch on every currently-mounted observer of that key: the Admin settings page itself, the Supplier sidebar, and an already-open Supplier Discount Codes page, all at once, with no manual refresh and no new polling.

The already-open Create dialog is protected client-side: `creationBlocked = !editingCode && !discountCodeSettings.newCodeButtonVisible` is recomputed on every render as the hook's data changes, disabling the Save button and showing an explanatory message the instant the setting flips — it cannot be used to complete a creation after the setting is revoked while the dialog is open. The backend's own `newCodeButtonVisible` check in `POST /api/discount-codes` remains the authoritative enforcement regardless of this UI state.

## 6. Tests actually executed and their results

- `npx tsc --noEmit -p .` — **executed**, exit clean, zero errors.
- `npm run build` — **executed**, completed successfully (`vite build` + server `tsx` build), produced `dist/public` and `dist/index.cjs` with no build errors (only a pre-existing, unrelated "chunk size > 500kB" advisory warning).
- Static scope-protection grep (`git diff --stat` plus a grep for `print|checkout|promotions-engine|cart-page` across the diff) — **executed**: confirmed only the 11 files listed in §2 were touched; no PRINT, checkout, cart, or promotions-engine file was modified.
- Diff review of `system-management-page.tsx`'s removed lines — **executed**: confirmed the only removals are the lucide-react import line (rewritten to add `Ticket`), the old `"promotion"` type/array entry, and the old render block — `PromotionSettingsSection`'s own body was never opened.

## 7. Tests added but not executed

None — this task did not add an automated test suite; verification here is limited to type-checking, build, and manual diff/code review as listed above.

## 8. Tests requiring a live database/browser that could not be performed

This environment has no `DATABASE_URL` configured and no browser-automation tool, so none of the following could be actually executed, only reasoned about from the code:

- Confirming the rename appears correctly in a running Admin UI, and that the internal Promotion/Codes promotionnels switcher renders and switches visually as expected.
- Confirming existing Promotion settings' live values (whatever an Admin previously configured) are literally unchanged in a real database after this change.
- Confirming both new settings persist correctly across a page reload against a real `discount_code_settings` row (auto-seed insert, then update).
- Confirming the 4 tab/button combination behaviors end-to-end through real HTTP requests with a real Supplier session.
- Confirming existing discount codes remain visible/redeemable (GET/PUT/PATCH/DELETE) while `tabVisible` is off versus actually enforced to fail — this can only be confirmed by running the gated routes against a live DB.
- Confirming realtime propagation between two real, simultaneously open browser sessions (Admin changes a setting; an already-open Supplier sidebar/page updates without refresh).
- Confirming the already-open Create dialog's disabled-submit behavior is visible/functions correctly when toggled live in a real browser.
- Confirming no console errors or failed network requests appear during any of the above in a real browser.
- Confirming responsive behavior of the new internal switcher and the two Discount Code settings rows at various breakpoints in a real viewport.

## 9. Confirmation existing codes/redemptions/orders/promotion calculations preserved

By inspection: the `requireDiscountCodesEnabled` middleware and the `newCodeButtonVisible` check in `POST /api/discount-codes` are the **only** changes made to `shop-catalog.routes.ts`'s Discount Codes (Supplier) section — no existing creation/edit/delete/validation logic, no `storage.*DiscountCode*` method, and no column was modified. The separate Coffee-Owner-facing `POST /api/discount-codes/validate` route (checkout redemption) is untouched. The Promotions engine (`server/promotions-engine.ts`), the Supplier Promotions page, and the Promotion settings' own backend/storage/routes are untouched — confirmed via the `git diff --stat` scope check in §6. No existing table's schema or data was altered; the only schema change is the new, additive `discountCodeSettings` table.

## 10. Remaining limitations / risks

- All of §8's live-DB/live-browser scenarios remain unverified beyond code-level reasoning; a full manual or automated QA pass against a running environment with a real database is recommended before considering this feature production-ready.
- The Create dialog's client-side `creationBlocked` guard is a UX nicety on top of the authoritative backend check — if a request bypasses the UI (direct API call), the backend 403 in `POST /api/discount-codes` is what actually prevents creation; this was verified by code inspection only, not by firing a live request.
- No automated/unit tests were added for the new middleware, storage methods, or settings hook; coverage here is type-checking plus manual review only.
