# Admin Promotion Management — Supplier Promotions Visibility and Type Configuration — Report

## 1. Existing promotion architecture audited

Before writing any code, the following were read in full:

- `client/src/pages/admin/system-management-page.tsx` — the System Management horizontal switcher (`SYSTEM_MANAGEMENT_SECTIONS`, a plain array of `{ id, label, icon }` rendered as pill buttons, with each section's content conditionally rendered by `activeSection === id`), and `MessagesSystemSection`/`AuthProviderSection`'s exact local-state + `useMutation` + `queryClient.setQueryData` pattern — the template this task's new section reuses verbatim.
- `server/storage/domains/platform-settings.storage.ts` — the `PlatformSettingsStorage` class already holding `getMessagingSettings`/`updateMessagingSettings` (a single auto-seeded settings row) and `getHeroActionSettings`/`setHeroActionSettings`, `getAccountDarkModeSettings`/`setAccountDarkModeSetting` (one row per enum key, auto-seeded for any missing key) — two distinct, already-proven shapes, one for each of this task's two settings (a single global flag, and a per-type map).
- `shared/schema.ts` — the table definitions for `messagingSettings`, `heroActionSettings`, `accountDarkModeSettings` (for the shape to mirror), and — critically — `promotionTypeEnum` and the `promotions` table itself, to retrieve the **actual** existing promotion types rather than inventing any.
- `server/routes/platform-settings.routes.ts` and `server/routes/communication.routes.ts` — the exact REST conventions already in use: public, unauthenticated `GET` for this kind of non-sensitive boolean configuration (`/api/hero-actions`, `/api/account-dark-mode-settings`, `/api/system-services`), `requireAdmin`-gated `PATCH` for writes, and a `broadcast(eventName, payload)` call on every successful write.
- `client/src/hooks/use-messaging-settings.ts`, `use-account-dark-mode.ts` — the client-side `useQuery` + safe-default pattern every settings hook in this app already follows.
- `client/src/hooks/use-realtime.ts` — the WebSocket event-name arrays and their `qc.invalidateQueries(...)` handlers (e.g. `ACCOUNT_DARK_MODE_EVENTS`, `HERO_ACTIONS_EVENTS`, `MESSAGING_EVENTS`) — the realtime mechanism this task reuses, not a new one.
- `server/routes/shop-catalog.routes.ts` — the full "── Promotions (Supplier) ──" route block (`requireSupplier` middleware, every `GET`/`POST`/`PUT`/`PATCH`/`DELETE` on `/api/promotions*`) and the separate, clearly-delineated "── Promotions (Cafe / Marketplace) ──" block (`POST /api/promotions/evaluate`) a few lines below it — confirming exactly which endpoints are Supplier-management-only (safe to gate) versus Coffee-Owner-facing pricing/eligibility (must never be gated).
- `client/src/pages/supplier/promotions-page.tsx` — the full Supplier Promotions page: `TYPE_LABELS` (the actual French labels already shown in the Type picklist), `PromotionForm`, `EMPTY_FORM`/`formToPayload`/`promoToForm`, `openCreate`/`openEdit`, and the Create/Edit `Dialog`.
- `client/src/components/layout/app-sidebar.tsx` — the Supplier sidebar's `MARKETING` nav group (`Communication`/`Promotions`/`Discount Codes`), and the already-existing (but, on inspection, narrowly-scoped) use of `useMessagingSettings().globalVisible` there — confirmed it currently only gates an unread-count query, not any nav item's visibility, so this task is the first to actually hide a whole nav entry based on a settings flag in this file.
- `client/src/pages/supplier/messages-page.tsx` and `SupplierCommunicationSwitcher` — confirmed that hiding Messages today only removes its *tab* inside the Communication page, and does **not** independently gate `/supplier/messages`'s page content or its backend routes against direct access — i.e. Messages is *not* a stricter precedent to copy for Promotions; this task's own explicit "prevent direct URL access" / "protect the relevant endpoints" requirements for Promotions go further than what Messages currently does, and were implemented accordingly from scratch for this feature.
- `server/promotions-engine.ts`, `server/storage/domains/order.storage.ts` — re-confirmed (no changes) that promotion eligibility/pricing is entirely independent of anything this task touches.

## 2. Existing promotion types discovered

Retrieved directly from `shared/schema.ts`'s `promotionTypeEnum` (never invented), with the French labels already established and shown today on the Supplier's own Type picklist (`promotions-page.tsx`'s `TYPE_LABELS`, reused verbatim):

| Stored value | Existing French label | Existing functionality (from the enum's own inline comment) |
|---|---|---|
| `PERCENTAGE` | Réduction en % | % off total or specific products/categories |
| `FIXED_AMOUNT` | Montant fixe | fixed DT off |
| `BUY_X_GET_Y` | Achetez X, obtenez Y | buy X get Y free |
| `QUANTITY_TIER` | Tarification par palier | tier pricing (price per unit drops at volume) |
| `CATEGORY_DISCOUNT` | Réduction par catégorie | % or fixed off specific categories |
| `FREE_SHIPPING` | Livraison gratuite | free shipping above optional min amount |
| `GIFT` | Cadeau gratuit | free gift item after min order |
| `MIN_ORDER_AMOUNT` | Montant minimum de commande | spend X get Y off |
| `MIN_QUANTITY` | Quantité minimum | buy X+ items get discount |
| `FIRST_ORDER` | Première commande | discount on first order from this supplier |

No type was added, removed, renamed, or had its stored value changed. The Admin page's short description for each (§4) is a direct French translation of the enum's own comment above, nothing invented.

## 3. New Admin System Management switcher item

`SYSTEM_MANAGEMENT_SECTIONS` (`system-management-page.tsx`) gained one entry, positioned last (after Global Settings, per the task):

```ts
type SystemManagementSection = "landing" | "delivery" | "services" | "messages" | "global" | "promotion";
const SYSTEM_MANAGEMENT_SECTIONS = [
  { id: "landing",  label: "Landing Page",    icon: LayoutTemplate },
  { id: "delivery", label: "Delivery",        icon: Truck },
  { id: "services", label: "Services",        icon: Zap },
  { id: "messages", label: "Messages System", icon: MessageSquare },
  { id: "global",   label: "Global Settings", icon: Sliders },
  { id: "promotion", label: "Promotion",      icon: Tag },
];
```

`Tag` was chosen because it is the exact icon already used for the Supplier's own "Promotions" sidebar entry and several promotion-type icons on the Supplier page — consistent, not a new visual language. Every existing switcher item, its behavior, and its content are untouched; the switcher itself is the same horizontal-scroll pill component every other section already uses (no new component).

## 4. Admin Promotion management UI

A new `PromotionSettingsSection` component (`system-management-page.tsx`), rendered when `activeSection === "promotion"`, with the two cards the task specified:

1. **"Disponibilité des promotions"** card — description "Contrôlez l'accès à la fonctionnalité Promotions dans l'espace fournisseur.", containing one row: **"Onglet Promotions"**, a status `Badge` ("Visible"/"Masqué"), and a `Switch`. A footer note states hiding it never deletes/modifies existing supplier promotions.
2. **"Types de promotions disponibles"** card — description "Activez ou désactivez les types de promotions que les fournisseurs peuvent utiliser lors de la création ou de la modification de leurs promotions.", containing one row per existing type (§2), each with its icon, French label, short French description, a status `Badge` ("Disponible"/"Masqué"), and a `Switch`. A footer note states hiding a type never modifies/disables promotions that already use it.

Both cards use the exact `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`Badge`/`Switch` components and Tailwind classes already used by every other System Management section (e.g. the same green/gray status-badge color pair already used for `STATE_OPTIONS`), so the page's visual language is unchanged. The whole section is a vertically-stacked flex layout identical in structure to `MessagesSystemSection`/the Services grid, which already render correctly at every breakpoint on this page — no new responsive CSS was introduced, and no other section's layout was touched. All text is French.

## 5. Global visibility implementation

- **Schema**: `promotionSettings` table (`shared/schema.ts`) — `{ id, globalVisible: boolean default true, updatedAt }`, directly mirroring `messagingSettings`'s shape.
- **Storage**: `PlatformSettingsStorage.getPromotionSettings()`/`updatePromotionSettings()` (`platform-settings.storage.ts`) — single auto-seeded row, identical get/update pattern to `getMessagingSettings`/`updateMessagingSettings`.
- **Routes**: `GET /api/promotion-settings` (public) and `PATCH /api/admin/promotion-settings` (`requireAdmin`, `broadcast("promotion_settings_updated", settings)`) in `platform-settings.routes.ts`.
- **Client hook**: `client/src/hooks/use-promotion-settings.ts` — `usePromotionSettings()`, default `{ globalVisible: true }` (today's behavior) if the query hasn't resolved yet, mirroring `useMessagingSettings`.
- **Enforcement** — see §8/§9 below for the Supplier-side nav/page/backend gating that reads this setting.

## 6. Individual type visibility implementation

- **Schema**: `promotionTypeSettings` table — `{ id, type: promotionTypeEnum unique, enabled: boolean default true, updatedAt }`, directly mirroring `heroActionSettings`/`accountDarkModeSettings`'s one-row-per-key shape, reusing the existing `promotionTypeEnum` (no new enum).
- **Storage**: `getPromotionTypeSettings()` (auto-seeds any of the 10 types missing a row, default `enabled: true`) / `setPromotionTypeEnabled(type, enabled)`, identical pattern to `getHeroActionSettings`/`setHeroActionSettings`.
- **Routes**: `GET /api/promotion-type-settings` (public) and `PATCH /api/admin/promotion-type-settings/:type` (`requireAdmin`, validates `:type` against the 10 real values, `broadcast("promotion_type_settings_updated", settings)`).
- **Client hook**: `client/src/hooks/use-promotion-type-settings.ts` — `usePromotionTypeSettings()`, default "every type enabled" if unresolved.

## 7. Database/settings changes

Two new tables, no change to any existing table/column (including `promotions`/`promotionUsage` themselves — neither was touched). `migrations/0011_promotion_settings.sql` was written (idempotent `CREATE TABLE IF NOT EXISTS`, reusing the existing `"public"."promotion_type"` enum), following this project's own established convention of checking in a hand-written SQL file alongside a Drizzle schema change (see `migrations/0008_maintenance_service.sql` for the same pattern). As with every schema change in this project, the authoritative way to apply it is `drizzle-kit push` (confirmed by this repo's `migrations/meta/_journal.json` only tracking entries 0000–0001, meaning every later schema change — including the pre-existing `promotion_type` enum itself — was applied via `push`, not a tracked `migrate` run); the checked-in SQL file is the same manual-fallback documentation this project already keeps for that case. **Neither could be executed in this environment** — no `DATABASE_URL`/database connection, the same constraint noted in every database-touching task this session.

Default values (`globalVisible: true`, every type `enabled: true`) exactly preserve today's behavior: before an Admin ever opens this new page, Supplier Promotions behaves identically to before this task.

## 8. Backend authorization and validation

- `requirePromotionsEnabled` middleware (`shop-catalog.routes.ts`), always chained after the existing `requireSupplier`, applied to **every** Supplier-facing promotion endpoint: `GET /api/promotions`, `GET /api/promotions/stats`, `GET /api/promotions/my-listings`, `GET /api/promotions/my-categories`, `GET /api/promotions/:id`, `GET /api/promotions/:id/usage`, `POST /api/promotions`, `PATCH /api/promotions/:id/targets`, `PUT /api/promotions/:id`, `PATCH /api/promotions/:id/status`, `POST /api/promotions/:id/duplicate`, `DELETE /api/promotions/:id`. Returns `403 { message: "Cette fonctionnalité est temporairement indisponible." }` when `globalVisible` is false. It never runs before `requireSupplier` has already confirmed `role === 'SUPPLIER'` — Admin/SUPER_ADMIN already cannot reach these routes at all (pre-existing behavior, `requireSupplier` rejects any non-SUPPLIER role), so this new check cannot block an Admin interface that never existed on these routes.
- **Explicitly left ungated**, confirmed by reading the file's own section boundary: `POST /api/promotions/evaluate` (Coffee-Owner cart/checkout pricing) and every `/api/marketplace/promotions*` route (badges, Promotion Details modal) — hiding the Supplier tab must never affect an existing promotion's eligibility or a Coffee Owner's checkout, and it doesn't.
- **Type enforcement**:
  - `POST /api/promotions` (create): if `body.type` is one of the 10 types and `getPromotionTypeSettings()` says it's disabled, returns `400 { message: "Ce type de promotion n'est pas disponible actuellement." }` before `storage.createPromotion` is ever called.
  - `PUT /api/promotions/:id` (update): fetches the existing promotion first; the type check only runs **if the submitted type differs from the existing one** — changing to a different, disabled type is rejected the same way creation is; leaving the type unchanged is always allowed regardless of that type's current availability (the task's explicit "preserve without changing its type" exception). Every other field update proceeds normally either way.
  - `POST /api/promotions/:id/duplicate`: fetches the original promotion first and rejects with the same message if its type is currently disabled — closing the one bypass route a supplier could otherwise use to effectively "create" a new promotion of a hidden type without going through the Type dropdown at all.
  - `PATCH /api/promotions/:id/targets`/`PATCH /api/promotions/:id/status`/`DELETE`: never touch `type`, so no type check applies — only the global `requirePromotionsEnabled` gate.
- `PATCH /api/admin/promotion-settings` and `PATCH /api/admin/promotion-type-settings/:type` are both `requireAdmin`-gated — the existing Admin/SUPER_ADMIN middleware, not a new permission system. Request bodies are validated with `zod` (`.strict()` on the global settings body, an explicit type/`enabled` boolean check on the per-type route) — a malformed or extra field is rejected, never silently accepted.
- Ordinary suppliers cannot change these settings (no supplier-facing route ever calls `updatePromotionSettings`/`setPromotionTypeEnabled`), cannot enable a hidden type (the only mutation of `promotionTypeSettings` is behind `requireAdmin`), and cannot bypass type availability via a direct, manipulated `POST`/`PUT` request (server-side check, not a frontend-only restriction) — satisfying "do not rely exclusively on frontend role checks."

## 9. Supplier navigation and route behavior

- `client/src/components/layout/app-sidebar.tsx`: the Supplier sidebar's "Promotions" nav item is now conditionally included in the `MARKETING` group's `items` array (`...(promotionSettings.globalVisible ? [{ title: "Promotions", ... }] : [])`), driven by the same `usePromotionSettings()` hook used everywhere else. When disabled, the entry disappears from the sidebar entirely; "Communication" and "Discount Codes" are untouched.
- `client/src/pages/supplier/promotions-page.tsx`: the page itself independently checks `usePromotionSettings().globalVisible` (defense in depth — a supplier typing the URL directly bypasses the sidebar entirely) and, when disabled, renders the page's own `DashboardHero` (so the title still reads "Promotions") followed by a centered French message: **"Cette fonctionnalité est temporairement indisponible."** / "Contactez votre administrateur pour plus d'informations." — instead of the real list/stats/create button. The page's own `GET /api/promotions`/`GET /api/promotions/stats` queries are also given `enabled: promotionSettings.globalVisible`, so no pointless request (which the backend would 403 anyway) is even attempted while hidden.
- Both the sidebar and the page re-render automatically the instant an Admin toggles the setting, because `usePromotionSettings()` is a plain `useQuery` kept in sync by `use-realtime.ts`'s new `PROMOTION_SETTINGS_EVENTS` handler (§11) — no manual refresh, no polling.

## 10. Dynamic promotion picklist behavior

- `PromotionForm` (`promotions-page.tsx`) now takes two new props: `enabledTypes: Set<PromotionType>` and `originalType: PromotionType | null`. Its Type `<Select>` only lists `TYPE_LABELS` entries where `enabledTypes.has(type) || type === originalType` — i.e. every currently-enabled type, **plus** the promotion-being-edited's own type even if it has since been disabled (labelled with a small "(masqué)" suffix so the supplier understands why it's the only disabled-looking option present). This is computed in the parent `PromotionsPage` from `usePromotionTypeSettings()` and passed down — no duplicated settings-reading logic.
- `openCreate()` no longer always seeds a new promotion's form with `type: "PERCENTAGE"` — it now defaults to the **first currently-enabled** type (falling back to `"PERCENTAGE"` only if the settings query hasn't resolved yet), so a brand-new promotion can never silently start on a type the supplier could not actually save, even in the edge case where `PERCENTAGE` itself is disabled.
- Editing: `openEdit(p)` is unchanged (`promoToForm(p)` as before) — the existing promotion's type is loaded exactly as stored, and the form's Select (per the point above) always includes it as a selectable/displayed option, so opening an existing promotion of a hidden type never shows a broken or empty Select.
- Empty state: when creating a **new** promotion (`!editingPromo`) and `enabledTypes.size === 0`, the dialog shows a centered message instead of the form: **"Aucun type de promotion n'est actuellement disponible. Veuillez contacter l'administrateur."** — exactly the task's suggested text. Editing an existing promotion is never blocked by this (the form still renders, with the existing type preserved) — only the *create* path can hit this empty state.
- The list's own **"Type"** filter dropdown (used to filter the existing promotions table, not to create one) was intentionally left showing all 10 types regardless of admin availability — filtering by a now-hidden type must still work so a supplier can find and manage an existing promotion of that type; this is a deliberate, narrow scope decision, not an oversight.
- The backend enforces the identical rule independently (§8) — the frontend list is a UX convenience, not the only protection, per the task's explicit "Hiding an option in the frontend alone is insufficient."

## 11. Realtime synchronization implementation

No new realtime infrastructure. `client/src/hooks/use-realtime.ts` gained one event-name array, `PROMOTION_SETTINGS_EVENTS = ["promotion_settings_updated", "promotion_type_settings_updated"]`, and one handler block invalidating both `["/api/promotion-settings"]` and `["/api/promotion-type-settings"]` whenever either event arrives over the existing WebSocket connection — the same `broadcast()`/listen/`invalidateQueries` mechanism every other admin setting in this app already uses (`ACCOUNT_DARK_MODE_EVENTS`, `HERO_ACTIONS_EVENTS`, `MESSAGING_EVENTS`, etc.), reused verbatim. The two `PATCH` routes (§5/§6) call `broadcast(...)` on every successful save, exactly like `PATCH /api/admin/account-dark-mode-settings/:account` already does. This single mechanism covers all three of the task's realtime scenarios without any scenario-specific code:
- **Scenario A** (hide the whole tab): `promotion_settings_updated` → `usePromotionSettings()` refetches everywhere it's used (sidebar, the Promotions page's own gate) → the nav entry disappears and an already-open page shows the unavailable message, all from the one hook/one invalidation.
- **Scenario B** (hide one type): `promotion_type_settings_updated` → `usePromotionTypeSettings()` refetches → the Create/Edit form's Type options recompute on the next render; the backend's own independent check (§8) rejects any request already in flight with that type regardless of what the frontend had cached.
- **Scenario C** (re-enable a type): same mechanism, same result in the opposite direction — no special-casing needed since the picklist is always derived fresh from the current settings on every render.

## 12. Confirmation that existing promotions were preserved

No code in this task ever writes to the `promotions` or `promotionUsage` tables, nor reads a promotion for any purpose other than: (a) displaying it (unchanged), or (b) the two new type-preservation checks in `PUT`/`duplicate` (§8), which only ever **read** `existing.type` to decide whether to allow a *change*, never to rewrite or clear it. Hiding the global tab or a type does not call `updatePromotion`, `deletePromotion`, or any status-changing method anywhere. A promotion already using a type that is later hidden keeps that exact `type` value, its discount percentage/amount, start/end dates, usage counts/limits, priority, cumulability, description, and internal notes completely untouched — confirmed by reading every new code path added this task and finding no write to any promotion field other than the ones the supplier explicitly submits through the already-existing `PUT`/`PATCH` routes (whose own update logic is unchanged).

## 13. Confirmation that existing promotion calculations remain unchanged

`server/promotions-engine.ts` (the single evaluation engine used by both the client-side cart preview and `POST /api/orders`'s authoritative order creation) was not opened or modified in this task. `POST /api/promotions/evaluate` and `POST /api/orders` were not touched. The double-discount fix, the minimum-order-eligibility gate, the Promotion Details modal, and the Récapitulatif de commande realtime-recalculation fix from the prior three tasks this session are all unaffected — none of their files (`product-detail-content.tsx`'s pricing logic, `promotion-details-modal.tsx`, `order-confirmation-modal.tsx`'s totals computation) were edited here. Hiding the entire Supplier Promotions tab or any individual type changes nothing about which promotions are eligible or how a discount is calculated for an order — only whether the Supplier's own management UI/API can create or change promotion *records*.

## 14. Files created and modified

**New files**:
- `client/src/hooks/use-promotion-settings.ts`
- `client/src/hooks/use-promotion-type-settings.ts`
- `migrations/0011_promotion_settings.sql`

**Modified**:
- `shared/schema.ts` — `promotionSettings`/`promotionTypeSettings` tables + their inferred types.
- `server/storage/domains/platform-settings.storage.ts` — the four new storage methods.
- `server/storage.ts`, `server/storage/types/istorage.ts` — facade/interface forwarding.
- `server/routes/platform-settings.routes.ts` — the four new routes.
- `server/routes/shop-catalog.routes.ts` — `requirePromotionsEnabled` middleware, applied to every Supplier promotion route; type-enforcement in create/update/duplicate.
- `client/src/hooks/use-realtime.ts` — `PROMOTION_SETTINGS_EVENTS` + its invalidation handler.
- `client/src/pages/admin/system-management-page.tsx` — new switcher item, `PromotionSettingsSection`, new icon imports.
- `client/src/components/layout/app-sidebar.tsx` — conditional "Promotions" nav entry.
- `client/src/pages/supplier/promotions-page.tsx` — page-level gate, dynamic Type picklist (`PromotionForm`'s new props, `openCreate`'s default type, the empty state), disabled queries while hidden.

No other file was touched. In particular, no PRINT route, storage method, or page was opened or modified — confirmed by this exact file list containing nothing PRINT-related.

## 15. Regression test results

**Actually executed and passed**:
- `npx tsc --noEmit -p .` — run after every meaningful edit (schema, storage, routes, each client file) — zero errors every time.
- `npm run build` — run at the same points — Vite client + esbuild server both built successfully every time (only the pre-existing, unrelated "chunk larger than 500 kB" advisory).
- `git status` after all edits — confirmed the touched-file set (§14) contains no PRINT file and no unrelated file.
- Grep-based confirmation that `PromotionForm` has exactly one call site (updated) and that the new type-settings fields/hooks aren't referenced anywhere they weren't intended to be.

**Automated tests added but not executed**: none — this project has no test runner configured (confirmed in prior tasks this session), so no automated suite was written for Tests A–J; this report does not claim any of them "passed" as an executed run.

**Code-level verification only** (traced through the actual code, not executed against a live system):
- **Test A** (defaults preserve current behavior): `DEFAULT_PROMOTION_SETTINGS`/`DEFAULT_PROMOTION_TYPE_SETTINGS` and the storage layer's auto-seed both default to "everything visible/enabled" — traced that a fresh install or an unresolved query never restricts anything that worked before this task.
- **Test B** (hide the whole tab): traced `requirePromotionsEnabled` rejecting every listed Supplier route with a 403 and French message, the sidebar/page both reading the same `usePromotionSettings()` hook, and that no code path in this change ever calls a promotion-deleting/deactivating method.
- **Test C** (restore the tab): since nothing was ever deleted/altered (Test B), re-enabling is simply the inverse of the same boolean flip — traced that `getPromotions`/`getPromotion` (unchanged) would return the exact same rows as before, since none were touched while hidden.
- **Test D/E** (hide/re-enable one type): traced the `PUT`/`POST`/`duplicate` checks (§8) and the client picklist filtering (§10) for both directions.
- **Test F** (edit an existing promotion of a hidden type): traced the `PUT` route's "only check type if it changed" logic and `PromotionForm`'s `originalType` inclusion — the existing promotion's data, other fields, and type are all preserved; switching to a *different* hidden type is rejected both client-side (not offered) and server-side (rejected even if forced via a direct request).
- **Test H** (authorization): traced that both `PATCH` routes require `requireAdmin`, and that no Supplier-facing route can reach `updatePromotionSettings`/`setPromotionTypeEnabled`.
- **Test I** (promotion/order regression): traced that `promotions-engine.ts`, `/api/promotions/evaluate`, and `/api/orders` were not opened in this task (§13).
- **Test J** (responsive): traced that the new section reuses the exact same `Card`/row layout classes as `MessagesSystemSection`/the Services grid, both of which already render correctly across breakpoints on this page; no new custom CSS was written.

**Tests that require a live database or multiple browser sessions — not executed, could not be executed in this environment** (no `DATABASE_URL`, no browser-automation tool, the same constraint noted in every task this session):
- Actually running `migrations/0011_promotion_settings.sql` (or `drizzle-kit push`) against a real database to materialize the two new tables.
- Test B/C's live verification that the Supplier nav entry disappears/reappears and that a direct `GET /api/promotions` request actually returns 403/200 at the right times.
- Test D/E's live verification that the Type dropdown actually updates in a running browser.
- Test G (realtime across one Admin session and two Supplier sessions) — requires multiple live, concurrently-open browser sessions.
- Test H's live attempt to call the admin PATCH routes as a non-admin user.
- Test I's live placement of a real order to confirm the saved order/UI still agree.
- Test J's actual visual inspection at desktop/tablet/mobile widths in a real browser.
