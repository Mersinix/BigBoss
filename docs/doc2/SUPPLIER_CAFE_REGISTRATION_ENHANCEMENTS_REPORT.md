# Supplier Café Registration — Enhancements Report

Duplicate validation, UI simplification, KPIs, filters & pagination on top of the previously implemented registration/approval workflow (`SUPPLIER_CAFE_REGISTRATION_AUDIT.md`, `SUPPLIER_CAFE_REGISTRATION_IMPLEMENTATION_REPORT.md`). `npx tsc --noEmit` and `npm run build` both pass with zero errors. No automated test suite exists in this project (`package.json` has no `test` script) — none were skipped.

## 1. Initial findings

Re-inspected the implementation from the previous task before touching anything:
- `client/src/pages/supplier/cafes-page.tsx` — Inscriptions/Clients tab switcher, `AddRegistrationModal`, `RegistrationsTab`, `ClientsTab` (unchanged café-client list), `CafeDetailModal`.
- `client/src/hooks/use-supplier-cafes.ts` — `useSupplierCafes` (Clients, backed by `GET /api/supplier/cafes`), `useSupplierCafeRegistrations`/`useCreateSupplierCafeRegistration` (Inscriptions, backed by `GET/POST /api/supplier/cafe-registrations`).
- `server/routes/cafe-registrations.routes.ts` — supplier submit/list + admin list/approve/reject endpoints.
- `server/storage.ts` — `createSupplierCafeRegistration`, `getSupplierCafeRegistrations`, `getAdminCafeRegistrations`, `approveCafeRegistration`, `rejectCafeRegistration`.
- `shared/schema.ts` — `supplierCafeRegistrations` table, no unique constraint on `email`/`phone` (by original design — duplicates were deliberately allowed at the request layer, deduped only at approval time).
- Existing conventions reused: `usePagination`/`DataPagination` (client-side pagination over an already-fetched list — the same pattern `admin/users-page.tsx` and the previous Clients tab used, so this is the "most appropriate existing convention" per the task's own fallback instruction — this app has no server-side-paginated list endpoint anywhere), `DashboardHero`/`KpiOverviewButton`/`KpiOverviewModal` (Supplier KPI card pattern), `DateRangeFilter` + `resolveDateRange` (`client/src/components/analytics/date-range-filter.tsx` / `client/src/lib/marketplace-analytics.ts`, already used by `earnings-page.tsx`/`finance-analytics-page.tsx`), the WebSocket realtime hook (`client/src/hooks/use-realtime.ts`, `admin_user_directory_changed` event already invalidates `/api/supplier/cafes` on every create/update), and `ProspectingStorage.normalizePhoneForMatch`/`normalizeEmailForMatch` (`server/storage/domains/prospecting.storage.ts`) — the only existing "does this contact info match an account" normalization logic in the codebase.

No existing implementation conflicted with these requirements in a way that needed a workaround — the previous workflow's admin approval process, storage methods, and routes were left untouched except for the one new duplicate check inside `createSupplierCafeRegistration` and the realtime invalidation addition described below.

## 2. Files inspected

`cafes-page.tsx`, `use-supplier-cafes.ts`, `cafe-registrations.routes.ts`, `storage.ts` (registration methods + `IStorage` interface), `shared/schema.ts`, `admin/users-page.tsx`, `admin/supplier-cafe-registrations-tab.tsx`, `prospecting.storage.ts`, `use-realtime.ts`, `components/analytics/date-range-filter.tsx`, `lib/marketplace-analytics.ts`, `components/ui/data-pagination.tsx`, `components/dashboard/dashboard-kit.tsx`, `components/location-picker-modal.tsx` (for its existing inline-error-banner convention), `routes/shared/helpers.ts`.

## 3. Files modified and why

| File | Why |
|---|---|
| `server/contact-normalize.ts` (new) | Extracted `normalizePhoneForMatch`/`normalizeEmailForMatch` out of `ProspectingStorage` into a shared, exported module — see §5. |
| `server/storage/domains/prospecting.storage.ts` | Its two private normalization methods now delegate to the shared module (`private normalizePhoneForMatch = normalizePhoneForMatch;`), byte-identical behavior, zero call-site changes. |
| `server/storage.ts` | `createSupplierCafeRegistration` now performs the authoritative duplicate check (see §4) before inserting. |
| `server/routes/cafe-registrations.routes.ts` | No change needed — its existing `catch` block already forwards `err.message` as the HTTP 400 body, which is exactly how the new French duplicate messages reach the client. |
| `client/src/hooks/use-supplier-cafes.ts` | No change needed — `useCreateSupplierCafeRegistration` already throws `Error(err.message)` from the server response. |
| `client/src/pages/supplier/cafes-page.tsx` | Rewritten: removed the Clients tab, `ClientsTab`, `CafeDetailModal`, and the tab switcher entirely; added KPI cards, search/status/date filters, pagination, and an inline error banner in `AddRegistrationModal`. |
| `client/src/hooks/use-realtime.ts` | Added two `invalidateQueries` calls (supplier's own registration list + admin's registration list) to the existing `ADMIN_USER_DIRECTORY_EVENTS` handler, since create/approve/reject already broadcast that event. |

**Not modified** (verified still needed / still correct, per the task's explicit preservation requirements):
- `GET /api/supplier/cafes` and `storage.getSupplierCafes` — untouched. `useSupplierCafes`/`SupplierCafe` in the hooks file are also untouched (only `cafes-page.tsx`'s *use* of them was removed, since they have no other callers anywhere in the client — confirmed via repo-wide search — but the task was explicit about not retiring the endpoint itself without a separate audit, and the hook is a thin, harmless wrapper around it).
- `server/storage.ts` `approveCafeRegistration`/`rejectCafeRegistration`, `server/routes/cafe-registrations.routes.ts` admin routes, `admin/users-page.tsx`, `admin/supplier-cafe-registrations-tab.tsx` — none of these needed a change for this task's requirements.

## 4. Duplicate validation implementation

### Frontend (`cafes-page.tsx`, `AddRegistrationModal`)
A client-side required-field check (non-empty café/contact name + email) only gates the submit button, exactly like the previous implementation — this is a UX convenience, not the authoritative check. On submit, any server rejection sets a local `error` string and is rendered as an inline banner inside the dialog (`AlertCircle` icon + red text, the same convention `location-picker-modal.tsx` already uses for its own geolocation error — `<div className="flex items-start gap-2 text-xs text-red-500">...`), rather than only a toast. The mutation's `onError` never calls `reset()`/`onClose()`, so the modal stays open with every field exactly as the supplier left it. `onSuccess` is unchanged (toast + reset + close).

### Backend (`server/storage.ts`, `createSupplierCafeRegistration`) — authoritative
```
async createSupplierCafeRegistration(supplierId, data) {
  const normalizedEmail = normalizeEmailForMatch(data.email);
  const normalizedPhone = normalizePhoneForMatch(data.phone);
  return db.transaction(async (tx) => {
    // 1) check every users row (any role/status)
    // 2) check every PENDING registration (any supplier)
    // 3) insert only if neither matched
  });
}
```
- Email match → `"Cette adresse e-mail est déjà associée à un compte existant. Impossible d'envoyer la demande."`
- Phone match → `"Ce numéro de téléphone est déjà associé à un compte existant. Impossible d'envoyer la demande."`
- Both → `"Cette adresse e-mail et ce numéro de téléphone sont déjà associés à un compte existant. Impossible d'envoyer la demande."`
- Equivalent pending request (same email or phone, any supplier, status `PENDING`) → `"Une demande d'inscription avec cette adresse e-mail ou ce numéro de téléphone est déjà en attente de traitement."`
- An empty/absent phone never participates in matching (`normalizePhoneForMatch` returns `null` for anything under 8 digits, `normalizedPhone != null` guards every comparison) — no false positive on the optional field.
- No existing account's name, role, or any other detail is ever included in these messages.
- These checks never block resubmission after a `REJECTED` outcome — only `PENDING` rows are considered "equivalent pending requests."
- `server/routes/cafe-registrations.routes.ts`'s existing `catch` block (`res.status(400).json({ message: err.message ?? ... })`) needed no change — it already surfaces whatever message `Error` carries, which is exactly these French strings.

## 5. Email and phone normalization approach

Reused rather than reinvented: `ProspectingStorage` already had the only existing "does this contact info match an account" logic in the codebase (`normalizePhoneForMatch`/`normalizeEmailForMatch`, used by its prospect-to-account matching). Since those were `private` methods on that one class, they couldn't be called from `server/storage.ts` directly. I extracted them, unchanged, into a new shared module `server/contact-normalize.ts` (flat, top-level — matching this project's existing convention of flat files directly under `server/`, e.g. `notify.ts`, `ws.ts`, rather than introducing a new `lib/` subfolder), and made `ProspectingStorage`'s two methods thin delegates to it (`private normalizePhoneForMatch = normalizePhoneForMatch;`) so every existing call site (`this.normalizePhoneForMatch(...)`) keeps working byte-for-byte identically. `createSupplierCafeRegistration` imports the same two functions directly.

- **Email**: `email?.trim().toLowerCase()` — whitespace- and case-insensitive.
- **Phone**: strips every non-digit character, then compares the **last 8 digits** — this one rule transparently treats `+216 12 345 678`, `21612345678`, `012345678`, and `12345678` as the same number regardless of international prefix, trunk `0`, spaces, or dashes. Numbers under 8 digits after stripping are treated as "too short to reliably match" and never produce a match (avoids false positives on garbage input), which is also why an empty optional phone is never flagged.

No second, diverging normalization system was introduced.

## 6. Database queries and race-condition protection

`createSupplierCafeRegistration` wraps the duplicate checks and the final `INSERT` in one `db.transaction(async (tx) => {...})`, all reads/writes going through `tx`. This **narrows** the race window (check and insert happen back-to-back inside one transaction, not as two separate round-trips) but, under Postgres's default `READ COMMITTED` isolation, does **not** fully eliminate it: two concurrent submissions for the same email, started at nearly the same instant, could each run their `SELECT` before either `INSERT` commits, and both would pass. I deliberately did not add a `SERIALIZABLE` transaction or a unique partial index to close this gap further, for two reasons documented inline in the code:
1. The previous task's explicit, still-standing decision was "no unique constraint on the request table" — duplicates at the request layer were accepted by design, with the real uniqueness enforcement deferred to admin approval time.
2. `approveCafeRegistration` (unchanged by this task) already performs the authoritative, fully race-safe check — it takes a `SELECT ... FOR UPDATE` row lock and rechecks `users.email`/`users.phone` inside its own transaction before ever creating a real account. So the worst case from this narrow race is two `PENDING` rows with the same contact info, never two real accounts — the second one to reach approval will cleanly fail with "Email already exists" and the admin can reject the stale duplicate.

This is a judgment call under "assess... whether additional constraints... are necessary," not an oversight — flagging it explicitly rather than silently claiming the race is fully closed.

## 7. KPI calculations

All four KPIs (`Total des inscriptions`, `En attente`, `Approuvées`, `Rejetées`) are computed client-side with a plain `.filter(...).length` over the exact same array already returned by `useSupplierCafeRegistrations()` (`GET /api/supplier/cafe-registrations`, which already scopes to `req.session.userId!` server-side — a supplier can never see another supplier's registrations or KPIs). No new endpoint and no extra network request were introduced. The counts are always computed from the **full, unfiltered** list (not the search/status/date-filtered subset) — same convention as `admin/users-page.tsx`'s own stat cards, which also ignore that page's role/status filter — so the KPIs read as a stable overview even while the list below is being filtered. Because they're derived from the same query cache the list renders from, they update in the same render pass as the list, immediately after a successful creation or after a realtime-triggered refetch (see §9) — no separate "refresh KPIs" step was needed.

## 8. Filtering and pagination implementation

- **Status**: a `Select` with `Tous`/`En attente`/`Approuvées`/`Rejetées`, matching against the row's own `status` field (`PENDING`/`APPROVED`/`REJECTED`).
- **Search**: one input matches `cafeName`, `contactName`, `email` (all lower-cased, trimmed, substring match) and `phone` (compared as digits-only substrings, so formatting differences in the query or the stored value don't prevent a match).
- **Date**: the existing `DateRangeFilter` component + `resolveDateRange` helper (`all/today/7d/30d/month/lastMonth/year/custom`), filtering on `createdAt`.
- All three combine with AND semantics via a single `.filter()` chain; a "Réinitialiser" button (shown only when at least one filter is active) clears all three back to defaults.
- **Pagination**: the existing `usePagination`/`DataPagination` client-side pattern — the same one `admin/users-page.tsx` and the old Clients tab used — over the filtered array. A `useEffect` watching `[search, statusFilter, datePreset, dateCustom.from, dateCustom.to]` calls `pagination.resetPage()`, so any filter change returns to page 1. Totals (`totalItems`, `totalPages`) are computed from `filtered.length`, so they always reflect the active filters. The empty state ("Aucune inscription ne correspond à ces filtres.") is distinguished from the true-empty state ("Aucune inscription pour le moment...").

This app has no server-side-paginated list endpoint anywhere (every existing list — Admin Users, the old Clients tab, etc. — fetches the full set and paginates client-side), so per the task's own fallback instruction ("assess the expected data volume and use the most appropriate existing convention"), the same client-side approach was used here rather than introducing a new, inconsistent server-side pagination path for one page.

## 9. Realtime synchronization approach

No new realtime infrastructure was introduced. The existing WebSocket hook (`client/src/hooks/use-realtime.ts`) already handles an `admin_user_directory_changed` event, and `cafe-registrations.routes.ts` already broadcasts exactly that event on **every** create, approve, and reject (written in the previous task, unchanged here). I added two lines to that event's existing handler:
```js
qc.invalidateQueries({ queryKey: ["/api/supplier/cafe-registrations"] });
qc.invalidateQueries({ queryKey: ["/api/admin/cafe-registrations"] });
```
This means:
- A successful creation (by this supplier, in this tab or another) refetches the list — and since KPIs/pagination/filtered results are all derived from that same query's data in the same render, they update together with zero extra plumbing.
- An admin's approve/reject action refetches the supplier's Inscriptions page (status badge, KPI counts) **and** the admin's own Supplier-utilisateurs tab, in any other open tab/session, without a manual refresh — satisfying "the supplier's Inscriptions page must also reflect the updated status."
- This reuses one existing broadcast and one existing subscription loop — no additional WebSocket messages, no polling, and `invalidateQueries` is a no-op (not an extra network request) for any client where the query isn't currently mounted.

## 10. Tests executed and their actual results

- `npx tsc --noEmit -p .` — **passed, zero errors** (run twice: once after the backend/normalization changes, once after the frontend rewrite).
- `npm run build` — **passed**, both the Vite client bundle and the esbuild server bundle (`dist/index.cjs`) built successfully with no errors (only the pre-existing, unrelated "chunk larger than 500kB" advisory warning, present before this task too).
- No project test script exists (`package.json` has no `"test"` entry) — nothing to run, nothing skipped.
- **Not executed**: any live HTTP request, browser interaction, or database query. This environment has no `DATABASE_URL` configured and no browser-automation tool available, exactly as in every prior task this session. Every checkbox in the task's own "Implementation and Verification" section describes *runtime* behavior (submitting the actual modal, watching an actual admin approve a request in another tab, etc.) that cannot be exercised here — I verified the corresponding *code paths* by reading them end-to-end (route → storage method → SQL → response → hook → component), not by running them, and I am not claiming otherwise.

## 11. Remaining limitations / manual verification steps

Before this can be considered verified, with a real Postgres database configured (`DATABASE_URL` set, `npm run db:push` run):
1. Submit a registration with an email matching an existing account of any role/status → confirm the exact French message and that the modal stays open with fields intact.
2. Repeat with a duplicate phone only, then both, then a second submission reusing a still-`PENDING` request's email/phone → confirm all four distinct messages.
3. Submit with differently-capitalized email / differently-formatted phone (e.g. `+216 12 345 678` vs `12345678`) matching an existing account → confirm both are still caught.
4. Confirm a `REJECTED` registration's email/phone can be resubmitted without being treated as a duplicate.
5. Exercise the KPI cards, search (each of the four fields), status filter, date filter, their combination, and "Réinitialiser" against a seeded set of registrations spanning all three statuses and several dates.
6. Open the Supplier's Inscriptions page and the Admin's Supplier-utilisateurs tab in two browser tabs; approve/reject from the admin tab and confirm the supplier tab updates without a manual refresh.
7. Confirm the Clients tab's prior functionality (café order/spend aggregation) is fully gone from the UI but that `GET /api/supplier/cafes` still responds correctly if queried directly (e.g. via `curl`), since the endpoint itself was intentionally left intact.

None of the above could be executed in this environment; this section exists so they aren't silently skipped.
