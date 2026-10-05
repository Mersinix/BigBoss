# Maintenance Intervention/Reservation Cleanup — Audit

## 1. Where Maintenance Reservations currently exist

- **Table**: `maintenanceReservations` (`shared/schema.ts`) — single-provider-only (`maintenanceUserId` always one specific provider), `status` plain text (`PENDING/CONFIRMED/COMPLETED/CANCELLED/RESCHEDULED/RESCHEDULE_PENDING`).
- **Creation entry point**: the `Réserver` button inside `AgentDetailModal` (`client/src/pages/cafe/maintenance/maintenance-page.tsx`, exported component, lines ~283-566) — a "Demander une intervention" sibling `Dialog` (booking form: date/time/category/urgency/location/contactPhone/description) that calls the `onReserve` prop → `POST /api/maintenance/reservations`.
- **`AgentDetailModal` is reused in 3 places**, all currently passing `onReserve` + their own `reserve`/`reserveMaintenance` mutation: `client/src/pages/cafe/maintenance/maintenance-page.tsx` (its own `/maintenance` grid), `client/src/components/cafe/marketplace-layout.tsx` (the Favorites "My Favorites" modal's Maintenance detail view), `client/src/components/maintenance/maintenance-blacklist-modal.tsx` (clicking a reported provider from the Blacklist modal).
- **Coffee-Owner-facing history**: `client/src/components/cafe/marketplace-layout.tsx`'s My Account → Réservations panel, Maintenance tab (`reservationsService === "maintenance"`) — reads `GET /api/maintenance/reservations`, renders a reschedule-response/cancel UI, plus a separate reservation detail `Dialog` (`detailMaintenanceReservation` state). A `maintenanceReservationTab` ("reservations"/"interventions") pill was added in the prior task to let the Coffee Owner switch between this and the new Interventions list.
- **Provider-facing lifecycle**: `client/src/pages/maintenance/planning.tsx` (unaffected by this task — provider confirms/completes/cancels/reschedules a reservation here, whether it came from the old Réserver flow or a newly-accepted Intervention response).
- **Admin**: `client/src/pages/admin/maintenance-page.tsx` — a dedicated KPI set (`totalReservations/pendingReservations/completedReservations/cancelledReservations`) computed by `storage.getMaintenanceAdminOverview()` from a flat, unfiltered `maintenanceReservations` select, plus a "Réservations récentes" tab listing every reservation across every Coffee Owner, with its own Admin-only `ReservationDetail` modal (edit/freeze/delete) — entirely separate from the Coffee-Owner-facing `AgentDetailModal`.
- **Review eligibility** (must NOT be touched): `AgentDetailModal`'s "Avis" flow checks `GET /api/maintenance/reservations` for a `COMPLETED` reservation with no review yet, to decide whether the Coffee Owner can leave a review. This is independent of the `Réserver` button being removed — a completed reservation (whether created via the old flow or via an accepted Intervention response) still makes a review possible.

## 2. Where Maintenance Interventions currently exist (built in the prior task)

- **Tables**: `maintenanceJobPosts`, `maintenanceJobTargets`, `maintenanceJobApplications` (`shared/schema.ts`).
- **Backend**: `/api/maintenance/jobs` (POST/GET mine), `/api/maintenance/jobs/discover`, `/api/maintenance/jobs/:id` (GET — already branches to full-stats+targets for the owner **or an Admin**, and to a visibility-checked read-only view for an eligible/targeted provider; PATCH), `/api/maintenance/jobs/:id/targets` (POST/GET), `/api/maintenance/jobs/:id/apply`, `/api/maintenance/jobs/:id/applications`, `/api/maintenance/applications/mine`, `/api/maintenance/applications/:id/status` (PATCH, ACCEPTED/REJECTED — accepting creates a real linked `maintenanceReservations` row via `storage.acceptMaintenanceJobApplication`, recorded on `maintenanceJobApplications.reservationId`).
- **Frontend**: `client/src/hooks/use-maintenance-jobs.ts`; `client/src/components/maintenance/maintenance-job-management-modal.tsx` (Coffee-Owner-facing list+detail, opened from the `/maintenance` hero "Intervention" button and from My Account); `maintenance-job-post-form-modal.tsx` (creation form); `maintenance-job-target-button.tsx` (manual targeting, mounted in both `MaintenanceFastSearch`'s action rail and `AgentDetailModal`'s corner icon row — this is already the "Intervention" action inside the Details modal, see Section 4); `client/src/components/cafe/maintenance-interventions-list.tsx` (My Account read list); `client/src/pages/maintenance/interventions.tsx` (provider-side discover/apply page, currently a flat two-tab `Tabs` — "Interventions disponibles" / "Mes réponses" — with **no status switcher yet**).

## 3. Components shared between Reservations and Interventions

- **`AgentDetailModal`**: the one place both flows currently coexist — it has the new `MaintenanceJobTargetButton` ("Intervention", corner icon, already working) **and** the old `Réserver` footer button + booking Dialog (to be removed, Section 4).
- **`maintenanceReservations` table**: shared as the *target* of both flows — the old flow creates a row directly from a client-filled form; the new flow creates the exact same kind of row automatically when an Intervention response is accepted. Both produce real, identical-shape reservation records, which is why Planning/review/Admin-reservations-tab all keep working unchanged regardless of which flow produced a given row.
- **Review eligibility logic** (Section 1) reads `maintenanceReservations` regardless of origin — untouched by this task.

## 4. API endpoints in play

Reservations (old flow, being removed from the 3 UI entry points but NOT deleted from the backend): `POST /api/maintenance/reservations`, `GET /api/maintenance/reservations`, `PATCH .../status`, `PATCH .../reschedule-response`, `PATCH .../cancel`, Admin's `PATCH/DELETE /api/admin/maintenance/reservations/:id(/freeze)`.

Interventions (new flow, being extended): all 9 routes listed in Section 2, plus (new, this task) folding `jobPosts`/`jobApplications` into the existing `GET /api/admin/maintenance` aggregate (mirrors how `GET /api/admin/barista` already folds in `baristaJobPosts`/`baristaJobApplications` — see Section 9).

## 5. Database entities/relations

`maintenanceReservations` (untouched schema) ← linked from `maintenanceJobApplications.reservationId` (nullable FK-by-convention, no DB-level foreign key, same loose-coupling style as the rest of this schema). No new tables needed for this task; one new **type-level** field is needed: `MaintenanceJobApplicationWithParties.reservation` (the linked reservation's `id/status/date/time`), needed so the provider-side status switcher (Section 9/10) can correctly bucket an accepted response by its real execution state instead of guessing from the application's own `PENDING/ACCEPTED/REJECTED` status alone.

## 6. UI components displaying reservation records

`AgentDetailModal`'s Réserver button/booking dialog (being removed); `marketplace-layout.tsx`'s My Account → Réservations → Maintenance tab (being removed, Section 5); `client/src/pages/maintenance/planning.tsx` (provider-side, untouched); `client/src/pages/admin/maintenance-page.tsx`'s "Réservations récentes" tab + `ReservationDetail` modal (untouched — Section 17 of the task explicitly says preserve unless necessary for synchronization, and these are genuinely historical/operational records, not duplicated by Interventions).

## 7. UI components displaying intervention records

`MaintenanceJobManagementModal` (Coffee Owner); `maintenance-interventions-list.tsx` (My Account); `client/src/pages/maintenance/interventions.tsx` (provider); **none yet in Admin** (Section 9).

## 8. Coffee Owner / Maintenance / Admin synchronization today

All three already read the *same* underlying rows (no duplicated intervention records): the owner's `GET /api/maintenance/jobs/mine` + `GET /api/maintenance/jobs/:id/applications`, the provider's `GET /api/maintenance/jobs/discover` + `GET /api/maintenance/applications/mine`, and — once this task lands — Admin's folded-in `jobPosts`/`jobApplications` arrays, all ultimately select from the same 3 tables. Accepting an application is the one state transition that reaches into a 4th table (`maintenanceReservations`) by design (Section 3) — every reader of that table (Planning, Admin's Réservations tab, review eligibility) sees it immediately, with no separate sync step required.

## 9. How Barista Missions implements the status switcher (the reference)

Confirmed by reading `client/src/pages/barista-marketplace/jobs.tsx:391-510` in full. `JobStatusFilter = "all"|"upcoming"|"ongoing"|"done"|"cancelled"`, labels `Toutes/À venir/En cours/Terminées/Annulées`. Two independent bucketing functions:
- **Discover list** (`jobMatchesFilter`): `all`→true; `cancelled`→always false (closed/expired listings never reach discover); `done`→`hasApplied===true`; `upcoming`/`ongoing`→not yet applied AND not expired, split by `missionStartDate` vs. today (no start date set → shown under both, i.e. true for either).
- **Applications list** (`applicationBucket`): `ACCEPTED`/`REJECTED`→`done` (a decided application is closed); else, if it has a `meeting`: `CANCELLED` meeting→`cancelled`; `PROPOSED`/`CONFIRMED` meeting in the future→`upcoming`; `CONFIRMED` meeting in the past→`done` (interview happened, awaiting decision); otherwise→`ongoing` (still pending/no meeting yet, or a lapsed unconfirmed proposal).

Counts are computed once per bucket and shown as `Label (N)`, via a shared `StatusFilterTabs` component built on the existing shadcn `Tabs`/`TabsList`/`TabsTrigger`. Admin's own Barista job-posting tab (`barista-page.tsx`) does **not** reuse this switcher — it's a provider-side-only UX pattern; Admin just shows a flat filterable list with a plain status `<Select>`, which is the simpler pattern this task's Admin section (14-17) actually asks for (no "Toutes/À venir/…" switcher requested for Admin, only "clicking a card opens the detail modal").

## 10. Correct Maintenance status mapping (audited, not name-guessed)

Maintenance's application lifecycle is deliberately **simpler** than Barista's (no PRESELECTED/INTERVIEW_SCHEDULED/meeting sub-system — see the prior task's audit) but, once `ACCEPTED`, it is linked to a *real* `maintenanceReservations` row whose own status machine (`PENDING→CONFIRMED→COMPLETED`, or `→CANCELLED`, or `→RESCHEDULE_PENDING→RESCHEDULED`) is more granular and more semantically correct for "À venir/En cours/Terminée/Annulée" than Barista's meeting-based proxy. Adopted mapping (implemented in `interventions.tsx`):

**`Mes réponses`** (`applicationBucket`, evaluated per `MaintenanceJobApplicationWithParties`):
1. `REJECTED` → **Terminées** (a decided-and-declined response is closed, mirrors Barista's "ACCEPTED or REJECTED → done").
2. `ACCEPTED` with no linked reservation data yet (shouldn't normally happen, defensive) → **En cours**.
3. `ACCEPTED`, linked reservation `status === "COMPLETED"` → **Terminées**.
4. `ACCEPTED`, linked reservation `status === "CANCELLED"` → **Annulées**.
5. `ACCEPTED`, linked reservation `status` is `CONFIRMED`/`RESCHEDULED`/`RESCHEDULE_PENDING` **and** its `date` is strictly after today → **À venir**.
6. `ACCEPTED`, linked reservation `status === "PENDING"` (provider hasn't confirmed it yet in Planning) → **En cours** (an action is needed now, it is not yet a confirmed future booking).
7. `ACCEPTED`, linked reservation confirmed/rescheduled with `date` today-or-earlier → **En cours** (the appointment window has arrived/passed but isn't marked complete yet).
8. `PENDING` (response not yet decided by the owner) → **En cours**.

**`Interventions disponibles`** (`jobMatchesFilter`, evaluated per discoverable job post): identical shape to Barista's, substituting `scheduledDate` for `missionStartDate`: `cancelled`→always empty (closed/expired posts never reach discover); `done`→`hasApplied`; `upcoming`/`ongoing`→not applied, not expired, split by `scheduledDate` vs. today (no date set → counted under both).

No historical data or underlying status model is changed — this is a pure client-side read-time classification, exactly like Barista's.

## 11. What must be changed

1. `AgentDetailModal` (`client/src/pages/cafe/maintenance/maintenance-page.tsx`): remove the `Réserver` button, the "Demander une intervention" booking `Dialog`, its `LocationPickerModal` instance, and all booking-only state (`booking, sendingReservation, date, time, location, description, category, urgency, contactPhone, locationPickerOpen`); remove the `onReserve` prop from its type signature; remove the now-dead `export type MaintenanceReservationData` and the top-level `reserve` mutation in the same file.
2. The 2 other `AgentDetailModal` call sites (`marketplace-layout.tsx`, `maintenance-blacklist-modal.tsx`): drop the `onReserve` prop and their now-dead `reserve`/`reserveMaintenance` mutations + the now-unused `MaintenanceReservationData` import.
3. `marketplace-layout.tsx`'s My Account → Maintenance area: remove the `maintenanceReservationTab` pill, the entire "Réservations" render block (`reservationsService === "maintenance" && maintenanceReservationTab === "reservations"` branch), its detail `Dialog`, and the now-unused `maintenanceReservations` query / `reservationStatus` map / `respondToReschedule` / `cancelMaintenanceReservation` mutations / `detailMaintenanceReservation` state (confirmed via grep: used nowhere else in this file). Render `MaintenanceInterventionsList` unconditionally for `reservationsService === "maintenance"` (no switcher needed once there is only one option).
4. `shared/schema.ts`: add `reservation: { id: number; status: string; date: string; time: string | null } | null` to `MaintenanceJobApplicationWithParties`.
5. `server/storage.ts`: `attachMaintenanceApplicationParties` fetches and attaches the linked reservation's `id/status/date/time` whenever `reservationId` is set (mirrors how Barista's equivalent attaches `meeting`).
6. `client/src/pages/maintenance/interventions.tsx`: add the `Toutes/À venir/En cours/Terminées/Annulées` status switcher (Section 10's mapping) to both tabs, with counts.
7. `server/storage.ts`'s `getMaintenanceAdminOverview()`: fold in `jobPosts` (every `maintenanceJobPosts` column + `cafeOwnerName` + `totalApplications`) and `jobApplications` (lightweight rows) plus job-related `stats.*` counters — mirrors `getBaristaAdminOverview()` exactly (Section 9 of the research: `storage.ts:9355-9361`/`9441-9456`/`9472-9492`).
8. `client/src/pages/admin/maintenance-page.tsx`: add a 4th tab "Interventions" with a card-row list (title, publicationMode badge, status badge, establishment · cafeOwnerName, applicationCount pill) and a new read-only `MaintenanceJobPostDetail` modal mirroring Barista's `JobPostDetail` exactly (same layout, same "no mutation path" read-only rule), reusing the Coffee-Owner-facing label/color constants already defined in `maintenance-job-management-modal.tsx`.

## 12. What must explicitly remain untouched

- `maintenanceReservations` table/rows — no deletion, no migration, no schema change.
- Admin's existing KPIs (`totalReservations/pendingReservations/completedReservations/cancelledReservations` etc.), "Réservations récentes" tab, and `ReservationDetail` modal — still reservation-specific and still meaningful for historical/operational data; not replaced, only **added to** (a new 4th tab, new KPI cards alongside the existing 8, none removed).
- Admin's "Compétences & zones" tab, `AccountDetail` modal (profile CRUD/publication moderation), and the marketplace-preview `AgentDetailModal` opened from there (now also missing Réserver, consistently, since it's the same shared component — but this preview was always `readOnly` and never had a working reservation flow to begin with per the prior audit's Section 9 note on `readOnly` disabling mutations).
- `client/src/pages/maintenance/planning.tsx`, Flash image fallback logic, the nested Fast-Search→Details modal behavior, `MaintenanceFastSearch`, Favorites, Barista Missions (reference-only, never modified), Academy/Print/Marketing, Delivery/Driver.
- The existing Intervention creation/targeting/automatic-publication/manual-publication machinery built in the prior task — only extended (Admin visibility, status switcher, reservation-linking on applications), never rewritten.

## 13. Database/API changes and migration details

No `db:push`/migration needed — Section 11's item 4 is a TypeScript-only type addition (the underlying `maintenanceJobApplications.reservationId` column and `maintenanceReservations` table already exist from the prior task and from the original schema respectively); the storage-layer change in item 5 is a new `SELECT` join at read time, not a schema change.

## 14. Automatic vs. manual publication synchronization

Unchanged from the prior task's implementation (already verified end-to-end then) — this task adds Admin visibility and a client-side status filter on top, neither of which touches the eligibility/targeting logic itself (`isMaintenanceProviderEligible`, `getDiscoverableMaintenanceJobPosts`, `isMaintenanceJobTargeted`). Re-verified live as part of this task's own testing (Section "Verification" below).

## 15. TypeScript, build, and test results

- `npx tsc --noEmit` — clean, exit 0, re-run after every batch of changes (backend admin fold-in, reservation-linking, 5 `AgentDetailModal` call sites, My Account cleanup, provider status switcher).
- `npm run build` — succeeded (`✓ built in 35.60s`; server bundled to `dist/index.cjs`, 2.0mb; same pre-existing >500kB chunk-size warning as every prior build in this project, unrelated).
- No automated test suite exists in this project (confirmed — no `test` script in `package.json`), consistent with every prior task in this session.
- No `db:push` was needed — every backend change in this task is a new `SELECT`/fold-in at read time or a TypeScript-only type addition, never a schema change.

Live verification performed against the running dev server (restarted mid-task), logged in as a real seeded `CAFE_OWNER` account and a real seeded `MAINTENANCE` provider account via `curl`, with results cross-checked against raw SQL:

1. **Regression — full Intervention workflow still works end-to-end after the route changes**: created a fresh `AUTOMATIC`/`PUBLISHED` intervention, had the provider apply, confirmed `GET /api/maintenance/jobs/:id/applications` (now `requireAuth`+`isOwnerOrAdmin` instead of the narrower `requireApprovedCafeOwner`-with-ownership-check) still correctly returns the owner's own applications — no regression from loosening this route to also admit Admin.
2. **Reservation-linking surfaces correctly for the status switcher**: before acceptance, the application's `reservation` field was `null`; the owner accepted it (`PATCH /api/maintenance/applications/:id/status {status:"ACCEPTED"}`), and the provider's own `GET /api/maintenance/applications/mine` immediately returned `reservation: {id, status:"PENDING", date, time}` — exactly the shape `applicationBucket()` expects, confirming it would classify this response as **En cours** (PENDING reservation, not yet confirmed by the provider) per Section 10's mapping.
3. **Admin visibility — verified via direct SQL replication of the storage computation** (not via an authenticated Admin HTTP call — this project's only `SUPER_ADMIN` account belongs to the actual project owner and no credentials for it were available or guessed; logging in as them was deliberately not attempted). Replicating `getMaintenanceAdminOverview()`'s `jobPosts` computation directly against `maintenance_job_posts`/`maintenance_job_applications`/`maintenance_job_targets` confirmed the per-row stats (`totalApplications/pendingApplications/acceptedApplications/rejectedApplications/targetCount`) compute correctly against real, pre-existing production data: one genuine intervention record (id 3, title "intervention", `MANUAL`/`PUBLISHED`, created by the real account on 2026-10-04, found with 1 target and 1 accepted application) that already exists in this environment from real use of the feature since the prior task — confirmed present and **completely untouched** both before and after this task's changes.
4. **Data preservation**: all test rows created during this verification (1 job post, 1 application, 1 reservation) were identified by exact id and deleted via direct SQL afterward; the one genuine pre-existing intervention record (id 3) and every pre-existing `maintenance_reservations` row were confirmed unaffected.
5. **Not verified live**: the Admin UI's new "Interventions" tab/detail modal rendering itself (no browser tool available, and no Admin credentials available to drive it via API either) — code-reviewed only (Section 16).

## 16. Remaining limitations / manual verification

**No browser-automation tool was available in this session, and this environment's only Admin account's credentials were not available/guessed** — the following were not performed and still need an actual check by someone with Admin access:
1. Visual confirmation of the Admin "Interventions" tab (stat cards, status filter, card-row list) and the new `MaintenanceJobPostDetail` modal (badges, field grid, Profils ciblés, Réponses) rendering correctly, including dark/light mode.
2. Confirming an Admin click on an intervention card actually opens `MaintenanceJobPostDetail` and not any reservation-related modal (code-reviewed as correct — wired to `setSelectedJobPost`, entirely separate from `selectedReservation`/`ReservationDetail` — but not rendered in a browser).
3. Visual confirmation of the Coffee Owner Details modal (`AgentDetailModal`) no longer showing "Réserver" and the Intervention action still rendering correctly in its place, across all 3 real call sites (`/maintenance` grid, My Account's Favorites-style Maintenance preview, the Blacklist modal's reported-provider preview) and the 2 read-only self-preview call sites (Admin's "Aperçu marketplace", the Maintenance account's own "Aperçu").
4. Visual confirmation of My Account → Maintenance now showing only the Interventions list (no Réservations pill), in both themes and at mobile width.
5. Visual confirmation of the provider's own Business → Interventions page's new status switcher (`Toutes/À venir/En cours/Terminées/Annulées`, with counts) on both "Interventions disponibles" and "Mes réponses", including the empty states per filter.
6. Confirming existing Barista Missions, Maintenance Flash image fallback, the Maintenance/Print nested-modal behavior, Favorites, and Academy/Print/Marketing workflows are visually unchanged — confirmed via `git status`/`git diff` that none of those files were touched by this task, but not independently re-verified by rendering.
