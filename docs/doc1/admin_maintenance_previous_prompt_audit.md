# Admin Maintenance — Audit of the Previous Implementation vs. Requirements

Scope: `client/src/pages/admin/maintenance-page.tsx` (the only file with real errors — a fresh
`npx tsc --noEmit` before any fix in this task showed 15 errors, **all in this one file**; every
other file touched by the prior Maintenance work — `server/storage.ts`, `server/routes.ts`,
`cafe/maintenance/maintenance-page.tsx`, `maintenance/profile.tsx`, `maintenance/profil-public.tsx`,
`maintenance/interventions.tsx`, `maintenance/dashboard-overview.tsx`, `maintenance/analytics.tsx`
— type-checks clean and was not touched in this task).

## Root cause

The previous task removed the "Réservations récentes" admin tab's **declarations** (the
`ReservationCard` component, `ReservationDetail` modal component, `RESERVATION_STATUSES` const,
the `selectedReservation` state + its sync effect, and the `reservations`/`reservationsPagination`/
`pageReservations` local variables) but the matching **JSX render block** — the `reservations`
`TabsTrigger`, its `TabsContent`, and the `<ReservationDetail .../>` mount at the bottom of the
component — was never removed. That JSX block still references all of the now-undeclared names,
so the file fails to compile and, in the browser, throws a `ReferenceError` the instant the
`MaintenanceAdminPage` component renders (every `TabsContent` mounts in the DOM regardless of
which tab is active) — this is exactly the "errors in Admin > Maintenance" the user is seeing.

Separately, the Analytics tab's data layer (`jobPostsByMonth`, `applicationsByMonth`,
`acceptanceRate`, `topRatedAccounts` — all correctly computed via `useMemo`) was never wired into
any `TabsContent`: there is no `analytics` `TabsTrigger` and no `analytics` `TabsContent` anywhere
in the file. The Interventions tab's filter **state** (`jobPostSearch`, `jobPostPublicationMode`,
`jobPostCategory`, `jobPostUrgency`, `jobPostLocation`, `jobPostSearchOpen`,
`jobPostSearchInputRef`, `jobPostFilterOptions`) is likewise fully wired into the filtering
`useMemo`, but the actual filter-bar UI (search input, the 4 extra `<Select>`s, the "Effacer"
button) was never added to the `interventions` `TabsContent` — only the pre-existing bare Status
`<Select>` renders today, so Search/Publication mode/Category/Urgency/Location are silently inert.

**In short: the data/logic layer was finished; a chunk of the JSX render layer was not. The
backend (`server/storage.ts`'s `getMaintenanceAdminOverview()`) is complete and correct — this is
a frontend-only repair.**

## Classification against the previous requirements

| Requirement | Status | Detail |
|---|---|---|
| Admin stats: Comptes Maintenance / Actifs / Disponibles / Interventions / En attente / En cours / Terminées / Annulées | **PARTIALLY DONE → FIXED** | Backend (`getMaintenanceAdminOverview`) correctly computes all 9 values including `averageRating`. The frontend `kpis` array (line 652) only rendered 8 tiles — **"Note moyenne" was missing entirely** from the KPI row despite being computed and available on `stats`. |
| Remove "Réservations récentes" from switcher | **BROKEN (regression)** | Component declarations were removed but the `TabsTrigger`/`TabsContent`/modal-mount JSX referencing them were not — this is the crash. Historical `maintenanceReservations` data and backend routes are untouched (confirmed — `storage.ts` still returns `data.reservations`, `PATCH/DELETE /api/admin/maintenance/reservations/:id(/freeze)` untouched). |
| Switcher order: Comptes Maintenance → Interventions → Compétences & zones → Analytics | **NOT DONE** | Current order is `taxonomy, accounts, reservations, interventions` — neither the requested order nor missing-reservations-fixed order. No `analytics` trigger exists. |
| Comptes Maintenance — search/filter/pagination/actions preserved, no daily pricing | **DONE** | Verified: search, 6 filters (status/visibility/availability/type/category/zone/rating), pagination, Edit/Freeze/Delete/GO-Live actions all intact and functional. No "Tarif/jour" tile on the account card (only the Admin edit form's own "Tarif journalier (DT)" field remains — correctly preserved per the prior task's own design decision to keep Admin-managed pricing). |
| Interventions — central admin workflow, same Intervention model, details modal | **DONE** | `MaintenanceJobPostDetail` correctly reads the same `maintenanceJobPosts`/`maintenanceJobTargets`/`maintenanceJobApplications` rows via the shared hooks (`useMaintenanceJobTargets`, `useMaintenanceJobApplicationsForJob`) the Coffee-Owner-facing modal uses. No second/parallel intervention model. |
| Intervention filters (Search/Status/Publication mode/Category/Urgency/Location) | **PARTIALLY DONE → FIXED** | State + filtering logic fully correct and tested against real data shape; only the Status `<Select>` was actually rendered. Search/Publication mode/Category/Urgency/Location existed in the filter predicate but had no UI control — a filter with no control is not usable, classified as not done for those 5. |
| Analytics tab (real, data-driven) | **NOT DONE** | Fully computed (`jobPostsByMonth`, `applicationsByMonth`, `acceptanceRate`, `topRatedAccounts`) but never rendered — dead code, no tab exists in the UI at all. |
| Admin Intervention Details must not open old Reservation/Booking modal | **DONE** | `MaintenanceJobPostDetail` is the only modal wired to `selectedJobPost`; the stray `<ReservationDetail>` mount was wired to the separate, now-undeclared `selectedReservation` state (part of the same regression) and is removed in this fix. |
| Daily tariff regression check (Admin) | **DONE (no regression)** | Grepped `Tarif / jour|Tarif journalier|dailyRate|daily_rate|tarifJournalier` across the file — the only hits are the Admin account edit form's own "Tarif journalier (DT)" field and the read-only "Tarif journalier" `Info` row in `AccountDetail`, both intentionally preserved (Admin-managed pricing, per `docs/maintenance_pricing_admin_performance_audit.md` Section 3). No Coffee-Owner-facing or Maintenance-self-service daily-rate display leaked back in. |
| Navigation/routing (`/admin/maintenance` etc.) | **NOT APPLICABLE** | Admin Maintenance is a single-route page with client-side tab state (`section`), not separate routes — refresh always lands on the default tab (`accounts`), consistent with every other Admin page in this app (no per-tab deep links anywhere in Admin). No routing regression found. |
| Pagination (Comptes Maintenance / Interventions) | **DONE** | Both use the standard `usePagination`/`DataPagination` pattern correctly, with `resetPage()` wired to their respective filter dependency arrays. (Reservations tab's pagination was part of the removed/broken block — moot once that tab is deleted.) |
| Data synchronization across roles (same Intervention lifecycle) | **DONE** | `interventionsOngoing/Completed/Cancelled` bucketing in `storage.ts` reads the same `jobApplicationRows`/`reservations` rows every other role-specific view reads — no separate hardcoded counters anywhere. |

## Fix applied in this task

1. Removed the orphaned `reservations` `TabsTrigger` and its `TabsContent` block, and the dangling `<ReservationDetail>` modal mount — the three places still referencing the deleted declarations.
2. Reordered the switcher to the required `Comptes Maintenance → Interventions → Compétences & zones → Analytics`.
3. Added the missing Interventions filter bar (Search input + Status/Publication mode/Category/Urgency/Location `<Select>`s + conditional "Effacer" button), reusing the exact same pattern already proven on the Comptes Maintenance tab, wired to the filter state that was already correctly computing `jobPosts`.
4. Added the missing `analytics` `TabsContent` using the already-computed `jobPostsByMonth`/`applicationsByMonth`/`acceptanceRate`/`topRatedAccounts`, following the same `SectionCard`/`RankRow`/`EmptyState`/`recharts` `BarChart` convention already used in `maintenance/analytics.tsx` and mirrored from `admin/barista-page.tsx`'s own Analytics tab.
5. Added the missing "Note moyenne" tile to the `kpis` array (now 9 tiles, matching the requirement).

No backend changes were needed — `server/storage.ts`/`server/routes.ts` were already correct and complete for this page. No unrelated modules, no schema changes, no data deletion.

## Preserved (explicitly not touched)

- `server/storage.ts`'s `getMaintenanceAdminOverview()`, all Maintenance reservation backend routes, the `maintenanceReservations` table and its rows.
- Comptes Maintenance tab (search/filters/pagination/account actions/GO-Live review) — read and verified working, zero changes.
- Compétences & zones tab (`TaxonomyList`) — zero changes.
- `MaintenanceJobPostDetail` (Intervention details modal) — zero changes, already correct.
- Admin's own "Tarif journalier (DT)" edit field and read-only display — intentionally preserved (Admin-managed pricing model).
- Every other module (Barista/Academy/Print/Marketing/Delivery/Chauffeur) — not touched; the bug was isolated to one file.

## Validation

- `npx tsc --noEmit` **before fix**: 15 errors, all `TS2304: Cannot find name` in `admin/maintenance-page.tsx` (lines 750–817) — see Root cause above.
- `npx tsc --noEmit` **after fix**: clean, zero errors across the whole project.
- `npm run build` **after fix**: succeeded (`✓ built in 25.09s`, `dist/index.cjs` 2.0mb). Same pre-existing >500kB chunk-size warning as before; no new warnings/errors.
- Grep-confirmed zero remaining references to `ReservationCard|ReservationDetail|RESERVATION_STATUSES|selectedReservation|pageReservations|reservationsPagination` anywhere in the file.
- No test suite exists in this project (`package.json` has no `test` script) — not applicable.
- **Not performed**: live browser verification — this fix is 100% frontend-only (`admin/maintenance-page.tsx`, no backend changes), so the dev server's Vite HMR would already be serving it, but the real `SUPER_ADMIN` account's password is unknown and was not guessed (consistent with this project's established constraint), so no login-and-click-through pass was done. The `tsc`/build results above are the only validation performed.
