# Maintenance: Daily Tariff Removal, Admin Restructure, Pagination, Performance — Audit

## 1. Where Maintenance daily pricing is stored and retrieved

- **Column**: `maintenanceProfiles.dailyRateInCents` (`shared/schema.ts:2136`, `integer().notNull().default(0)`). Inherited (not redeclared) by `MaintenanceProfile`/`MaintenanceMarketplaceCard` types.
- **Not present** on `maintenanceReservations` or `maintenanceJobPosts`/`maintenanceJobTargets`/`maintenanceJobApplications` — no table anywhere stores a per-booking/per-intervention price.
- **Same field name exists on unrelated tables** (`baristaMarketplaceProfiles.dailyRateInCents`, `deliveryCompanyProfiles.dailyRateInCents`) — entirely separate columns, never touched by this task.
- **Retrieved**: `getMaintenanceProfiles`/`getMaintenanceCard` (`server/storage.ts`) spread it into the card display-only (never filtered/sorted/searched on). `getMaintenanceRevenueSummary` (`server/storage.ts:6064-6108`) reads it as the sole multiplier for the Revenue page (Section 4 below).
- **Writable via**: `PATCH /api/maintenance/profile` (self-service, `routes.ts:807`) and `PATCH /api/admin/maintenance/accounts/:userId` (Admin, `routes.ts:2582`) — both validate `z.number().int().min(0).optional()`.

## 2. Every UI surface currently displaying it

| Surface | File | Removing? |
|---|---|---|
| Coffee Owner marketplace card | `client/src/pages/cafe/maintenance/maintenance-page.tsx` `AgentCard`, "Tarif / jour" tile | **Yes** (Section 1 of the task) |
| Coffee Owner Details modal | same file, `AgentDetailModal`, 3-tile stat grid | **Yes** (Section 2) |
| Maintenance's own profile editor | `client/src/pages/maintenance/profile.tsx`, "Tarif journalier (DT)" field | **Yes** (Section 3) |
| Maintenance's own "Profil Public" self-preview | `client/src/pages/maintenance/profil-public.tsx:45` → `public-profile-preview.tsx` shared tile | **Yes** — kept in sync with what Coffee Owners actually see post-removal (not explicitly named by the task, but leaving it would show the professional a "Tarif" tile real visitors never see — a direct synchronization mismatch the task's own Section 14 principle forbids) |
| Admin account edit form + read view | `client/src/pages/admin/maintenance-page.tsx:285,294,354,374` | **No** — not named anywhere in the task's removal list (Sections 1-3 name only Coffee Owner cards/modal and Maintenance's own profile page); Admin needs continued internal access to this value (see Section 3 below) |
| Revenue computation + subtitle | `server/storage.ts` `getMaintenanceRevenueSummary`, `client/src/pages/maintenance/revenue.tsx` | **No** — see Section 3 |

## 3. Is it used for calculations? Design decision on retention

**Yes — it is the sole multiplier behind every figure on the Maintenance "Revenus" page.** `getMaintenanceRevenueSummary` (`server/storage.ts:6064-6108`) computes `totalEarnedCents = completedReservations.length × profile.dailyRateInCents` (and the same for pending/monthly-history). There is no per-booking stored price anywhere (`maintenanceReservations` has no price column, confirmed by reading the full table def), and no payment/settlement table references Maintenance at all (`settlements.actorRole` is constrained to `'DRIVER'|'DELIVERY_COMPANY'` only). The client code is already self-aware of this and frames every number as an "estimate" (`revenue.tsx:20-27,54`).

**Decision**: keep the column, the backend validation/routes, `getMaintenanceRevenueSummary`, and the Admin's own edit/view capability (`admin/maintenance-page.tsx`) **fully intact**. Only remove the field from the two UI surfaces the task explicitly names (Coffee Owner card/modal, Maintenance's own profile editor) plus the self-preview (Section 2). This is the task's own prescribed path for exactly this situation: *"If backend/database retention is necessary for backward compatibility, keep the data internally but remove it from the Maintenance user-facing workflow"* — "internally" here means Admin-managed rather than self-service, which is a real, defensible, minimal product shape (Admin sets the rate used for the estimate; the Maintenance professional no longer edits it themselves). This is dramatically safer than the alternative (deleting the column), which the task's own research shows would zero out the entire Revenue page with no real replacement data to substitute (no per-intervention price exists anywhere), and the task explicitly forbids "inventing a new financial model." **Consequence: `revenue.tsx` and the one revenue-dependent chart in `analytics.tsx` need zero changes** — the computation remains valid because its one input (`dailyRateInCents`) still exists and is still Admin-settable.

## 4. Used by interventions? Used by reservations/legacy flows?

Not used by `maintenanceJobPosts`/`maintenanceJobTargets`/`maintenanceJobApplications` at all (confirmed — no price field anywhere in that system). Used by the legacy/active `maintenanceReservations` only via the Revenue estimate above (Section 3), which is being preserved as internal/Admin-managed data, not removed.

## 5. Maintenance profile APIs / Admin Maintenance APIs

- `PATCH /api/maintenance/profile` (`routes.ts:796-816`) — self-service; `dailyRateInCents` validator removed from this route's accepted body only (Section 3's self-service UI is being removed, so the self-service write path for this one field is removed too — the Maintenance professional can no longer set it even via a raw API call once the UI input is gone, since nothing else in the save payload would populate it; the validator itself can safely stay optional/no-op or be dropped — dropped, since leaving a dead validator around is needless clutter directly tied to this removal).
- `PATCH /api/admin/maintenance/accounts/:userId` (`routes.ts:2565-2599`) — **untouched**, Admin retains full edit capability.
- `GET /api/admin/maintenance` (`routes.ts:2461-2464` → `storage.getMaintenanceAdminOverview()`) — extended with new stats (Section 7) and `jobApplications`/`jobPosts` already present from the prior consolidation task, reused for the new Analytics tab (no new queries needed — same already-fetched arrays).

## 6. Maintenance Performance data / existing Analytics

- **`Tableau de bord`** (`client/src/pages/maintenance/dashboard-overview.tsx`) — 100% `maintenanceReservations`-driven (5 StatTiles, next-intervention block, recent-activity list), zero `dailyRateInCents` dependency, zero `maintenanceJobPosts`/`Applications` dependency today. Since reservations are now **exclusively** created via the Intervention-acceptance flow (the old `Réserver` entry point was removed in the prior task), this data is already correctly "the current Intervention-based model" — it doesn't need replacing, only **augmenting** with response-level metrics the task explicitly asks for ("interventions received", "interventions responded to") that reservations alone can't show.
- **`Analyses`** (`client/src/pages/maintenance/analytics.tsx`) — same reservation/review dependency, plus one chart ("Revenu estimé par mois") pulling `/api/maintenance/revenue` — preserved per Section 3. Also augmented with response-level metrics, additively.
- **`Revenus`** (`client/src/pages/maintenance/revenue.tsx`) — preserved unmodified (Section 3).
- **No existing Admin Analytics-tab precedent for Maintenance** — but `client/src/pages/admin/barista-page.tsx`'s `analytics` tab (lines ~710-722 switcher, ~944-1017 body) is a complete, directly-mirrorable precedent: recharts `BarChart`s over client-side month-bucketed arrays, KPI `Card`s pulled straight from the admin overview's own `stats`, a "ranked by rating, not revenue" `RankRow` panel (explicitly the precedent for ranking Maintenance providers without inventing a revenue ranking). The backend groundwork (`totalInterventions`/`publishedInterventions`/`draftInterventions`/`closedInterventions`/`totalInterventionApplications`/`pendingInterventionApplications`/`acceptedInterventionApplications`/`rejectedInterventionApplications`, plus the lightweight `jobPosts`/`jobApplications` arrays) already exists in `getMaintenanceAdminOverview()` from the prior consolidation task — only the `analytics` `TabsContent` UI is missing.

## 7. Existing pagination patterns

`client/src/components/ui/data-pagination.tsx` — purely client-side: `usePagination(totalItems)` returns `{page, pageSize, totalPages, start, end, setPage, setPageSize, resetPage}`; the caller slices an already-fetched array (`arr.slice(start, end)`) and renders `<DataPagination ...>`. No server-side page/pageSize param support exists anywhere in this app — this is the established, exclusive pattern (used identically in `admin/maintenance-page.tsx`'s accounts/interventions tabs and `admin/barista-page.tsx`'s job-posts tab). `client/src/pages/maintenance/interventions.tsx` does not use it today (both lists are rendered in full) — this task adds it there, following the exact same call shape, with `resetPage()` wired to the existing status-filter `useEffect`.

## 8. Existing Admin tab/switcher pattern

Plain shadcn `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `value`/`onValueChange` on local `section` state, pill-style `TabsList` with horizontal-scroll-on-mobile wrapper — identical across every Admin page in this app. Reordering/removing/adding a `TabsTrigger` + its paired `TabsContent` is a self-contained, low-risk change (confirmed by reading the full `admin/maintenance-page.tsx` tab block from the prior task).

## 9. Existing Barista Performance/Missions implementation (reference)

Barista's own Dashboard/Analytics (`barista-marketplace/dashboard.tsx`/`analytics.tsx`) were already fully rebuilt onto the job-posting system (`useMyBaristaJobApplications()`), **because** Barista's legacy 1:1 request/mission system was genuinely retired. Maintenance's situation differs: `maintenanceReservations` is **not** retired — it is the live, real execution record every accepted Intervention response produces. Copying Barista's "replace entirely" pattern would be copying the wrong lesson; the right lesson (per the task's own "do not blindly copy Barista logic") is: reservations stay as the real completion/cancellation source of truth, and the new job-application data is **added** alongside it to cover what reservations alone can't show (response volume/rate). Barista's Revenue page (`barista-marketplace/revenue.tsx`) is instructive for the opposite reason: it kept a real (if decaying) per-mission ledger rather than inventing a new number once rates disappeared from new records — the same "don't fabricate, preserve what's real" instinct this audit applies to Maintenance's Revenue page in Section 3.

## 10. Files changed / not changed

**Changed**:
- `client/src/pages/cafe/maintenance/maintenance-page.tsx` — remove tariff tile from `AgentCard` and `AgentDetailModal`.
- `client/src/pages/maintenance/profile.tsx` — remove "Tarif journalier" field/state/save-payload entry.
- `client/src/pages/maintenance/profil-public.tsx` — stop passing `pricingLabel`.
- `server/routes.ts` — drop `dailyRateInCents` from the self-service `PATCH /api/maintenance/profile` validator only.
- `server/storage.ts` — extend `getMaintenanceAdminOverview()` with new intervention-lifecycle stats (bucketed from already-fetched `jobApplicationRows`+`reservations`, no new queries).
- `client/src/pages/admin/maintenance-page.tsx` — new KPI cards, remove "Réservations récentes" tab, reorder switcher, add filters to Interventions tab, add new Analytics tab.
- `client/src/pages/maintenance/interventions.tsx` — add pagination to both lists.
- `client/src/pages/maintenance/dashboard-overview.tsx`, `client/src/pages/maintenance/analytics.tsx` — additive intervention/response metrics alongside existing reservation-based content.

**Not changed** (verified safe to leave alone):
- `shared/schema.ts` (no schema change — `dailyRateInCents` column stays as-is).
- `server/storage.ts`'s `getMaintenanceRevenueSummary`, `PATCH /api/admin/maintenance/accounts/:userId` and its route.
- `client/src/pages/maintenance/revenue.tsx` (Section 3).
- `client/src/components/account/public-profile-preview.tsx` (shared component, untouched — only its Maintenance caller stops passing `pricingLabel`).
- Barista/Academy/Print/Marketing/Delivery/Driver — confirmed via the daily-tariff grep that every other "Tarif"/`dailyRateInCents` hit belongs to a different table/module (Barista, Delivery Company) and is untouched.
- `maintenanceReservations` table/rows, `maintenanceJobPosts`/`Targets`/`Applications` tables, the Intervention creation/targeting/publication/response workflow, Maintenance Fast Search, Flash/profile image sync, nested-modal behavior, Favorites, Admin account management, Barista Missions/Performance.

## 11. Admin statistics — status mapping (Section 4 of the task)

Old KPIs: Comptes Maintenance, Actifs/approuvés, Disponibles, **Réservations** (`totalReservations`), **En attente** (reservation `PENDING`), **Terminées** (reservation `COMPLETED`), **Annulées** (reservation `CANCELLED`), Note moyenne.

New KPIs (same 9-card layout, same visual style): Comptes Maintenance, Actifs/approuvés, Disponibles, **Interventions** (`totalInterventions` — total job posts ever created, replaces the "Réservations" volume metric with the new workflow's own entry-point count), **En attente** (`pendingInterventionApplications` — responses awaiting the owner's decision, already computed), **En cours**, **Terminées**, **Annulées**, Note moyenne.

"En cours"/"Terminées"/"Annulées" are **not** simply application statuses (Maintenance's application lifecycle is only `PENDING/ACCEPTED/REJECTED` — there is no "en cours" at that level) — per the prior consolidation task's own audited mapping (`docs/maintenance_intervention_reservation_cleanup_audit.md` Section 10), an `ACCEPTED` application's real-world state lives on its **linked reservation**. So, computed server-side from the same `jobApplicationRows`/`reservations` arrays `getMaintenanceAdminOverview()` already fetches (no new queries):
- **En cours** = `ACCEPTED` applications whose linked reservation's status is `PENDING`/`CONFIRMED`/`RESCHEDULED`/`RESCHEDULE_PENDING` (not yet finished).
- **Terminées** = `ACCEPTED` applications whose linked reservation's status is `COMPLETED`.
- **Annulées** = `ACCEPTED` applications whose linked reservation's status is `CANCELLED`.

`REJECTED` applications are intentionally not folded into any of these 4 (they never became a reservation) — they remain available as the existing, separate `rejectedInterventionApplications` stat, consistent with the old KPI row never having a "rejected" tile either. This satisfies Section 14's synchronization rule exactly: these counts are computed from the *same* rows (`maintenanceJobApplications` + `maintenanceReservations`) every other role-specific view already reads — not a separate hardcoded counter.

## 12. Admin Interventions filters — scoping decision (Section 9 of the task)

Implemented, all backed by real, already-present data with zero extra queries: **Search** (title/establishment/cafeOwnerName), **Status** (existing), **Publication mode** (AUTOMATIC/MANUAL), **Category** (distinct values from `categories[]`), **Urgency** (LOW/NORMAL/HIGH/URGENT), **Location** (distinct values from `locationAddress`, same comma-split-dropdown convention as the existing Comptes Maintenance tab).

Not implemented: **Date**, **Provider/profile targeted**, **Response status** as dedicated filters — the flat `jobPosts` list (one row per intervention) doesn't carry per-target or per-response rows, and fetching those per-row to build a filter would mean N+1 queries or a second heavy data source, which is a scope expansion the task's own "only expose filters that correspond to actual data" / smallest-necessary-change instructions don't justify. Target/response detail remains fully visible inside the existing per-intervention `MaintenanceJobPostDetail` modal.

## 13. Verification

- **`npx tsc --noEmit`** — clean, zero errors, after the full set of changes (daily-tariff removal across 4 client files + 1 backend route, `getMaintenanceAdminOverview()` stats extension, the full Admin Maintenance page restructure, pagination added to `interventions.tsx`, and the additive Dashboard/Analytics metrics).
- **`npm run build`** — succeeded (`✓ built in 13.04s`, `dist/index.cjs` 2.0mb). Same pre-existing >500kB chunk-size warning as before this task; no new build errors or warnings introduced.
- **Admin KPI bucket-mapping logic — verified against real production data via direct SQL** (not through the live app, since the only `SUPER_ADMIN` account's credentials are unknown and were not guessed — see project history). Replicated `getMaintenanceAdminOverview()`'s new "En cours/Terminées/Annulées" bucketing by hand against the real `maintenance_job_applications`/`maintenance_reservations` tables: the one real `ACCEPTED` application in the database (the genuine, non-seed intervention referenced earlier in this project's history) has a linked reservation with status `COMPLETED`, and the replicated query buckets it into "Terminées" (1), with 0 "En cours"/"Annulées" — matching the intended logic exactly. Total job posts = 2, total Maintenance accounts = 4 — sane, real counts for the "Interventions"/"Comptes Maintenance" KPI tiles.
- **Not performed**: live browser verification of the Admin Maintenance page (new KPI row, switcher order, Interventions filters, Analytics tab) — this requires the real `SUPER_ADMIN` account's password, which is unknown and was not guessed, consistent with this project's established constraint. The backend changes in this task (`server/routes.ts`, `server/storage.ts`) also require a dev-server restart to take effect (the dev server runs via `tsx` without `--watch`, so it does not hot-reload backend code), which was not performed this session.
- **Not performed**: live browser verification of the Coffee Owner marketplace card/modal, the Maintenance profile editor, and the Maintenance Interventions pagination/Dashboard/Analytics pages. These are frontend-only changes served by Vite's dev HMR (no backend restart needed), but no browser session was opened to visually confirm them in this task.
- Grep-confirmed zero remaining references to the removed `ReservationCard`/`ReservationDetail`/`RESERVATION_STATUSES`/`selectedReservation`/`pageReservations`/`reservationsPagination` identifiers in `admin/maintenance-page.tsx`, and zero remaining `dailyRateInCents`/`useFormatCurrency`/`useCurrency` references in the 3 edited Maintenance/Coffee-Owner-facing files (Section 2), beyond what Section 10 lists as intentionally unchanged.
