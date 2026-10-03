# Resume Audit — Job Offers & Missions Unification

## 0. Important correction to the resume framing

This is **not** a cold resume of a different, lost session — it is the same Claude Code
session continuing. No work was lost or needs reconstruction from Git archaeology; the
implementation below was built in this same conversation, immediately before this audit
was requested, by a combination of direct edits and three parallel sub-agents whose
output was individually code-reviewed by hand after they finished. The only genuinely
open item when this audit started was **live, in-browser verification**, because the dev
server was not running (process list showed zero `node.exe` processes; `curl
localhost:5000` returned connection-refused). Everything below is evidence-based: schema
confirmed directly against the live database, every file's diff read in full, and
`npx tsc --noEmit` run clean project-wide immediately before writing this report.

## A. Initial state (immediately before this audit)

All of Sections A–H's code was already implemented and type-clean:

- `shared/schema.ts`: `baristaJobPosts` extended with `recordType` ('OFFER'|'MISSION'),
  `missionStartDate`, `missionEndDate`. Pushed to the live DB and confirmed via direct
  `information_schema.columns` query (see below).
- `server/storage.ts` / `server/routes.ts`: list/discover methods and the job-post
  create/update routes accept and validate the new fields; `getBaristaAdminOverview`
  extended with job/mission stats + a `jobPosts` read-only list.
- Five client files built/extended: `job-post-form-modal.tsx`, `job-management-modal.tsx`,
  `barista-job-target-button.tsx`, `jobs.tsx` (+ new `missions-hub.tsx`), `business.tsx`,
  plus minor additive `hideHero` props on `requests.tsx`/`missions.tsx`, plus the Recruter
  removal in `barista-detail-modal.tsx`, plus the new Admin tab in `admin/barista-page.tsx`.

What was **not yet done**: the dev server was down, so none of this had been clicked
through in an actual browser this session. `npx tsc --noEmit` was clean, and every diff
had been read, but "type-checks" and "verified end-to-end" are different claims — this
audit's job is to close that gap honestly.

One stray row was found and removed during this audit: `barista_job_posts.id = 4`
("Barista confirme QA"), owned by a throwaway QA account (`qa-owner2-...`) that had
already been deleted via its own admin-delete flow earlier in this session. The job row
itself was never actually deleted at the time because no `DELETE /api/barista/jobs/:id`
route exists — an earlier `curl -X DELETE` against that path silently hit Vite's SPA
fallback (200 OK, HTML body) instead of a real endpoint, so the row survived as an orphan.
It has now been removed directly (`DELETE FROM barista_job_posts WHERE id = 4`), verified
safe because its owning user no longer exists. **Real data was not touched**: rows
`id = 1, 2, 3` ("Barista Confirmer", "Contoiriste", "tesst"), owned by the real account
`mersinix@cafe.com`, were left exactly as found.

## B. Work completed during this audit session

| File | Change | Reason |
|---|---|---|
| (DB, direct) | Deleted orphaned `barista_job_posts` row `id=4` | Leftover from an earlier test cleanup that silently failed (no DELETE route exists); owner account already gone |
| (process) | Started the dev server (`npm run dev`) | It was fully stopped, not just stale — required for any live verification |
| (DB, throwaway) | Created + fully deleted 3 QA accounts and every job/application/target/meeting row they produced | End-to-end live verification (Section D) |
| `resume_audit.md` | Created, then updated with verified live-testing results | This report |

No implementation *source* files were changed during this audit pass — the prior
implementation (summarized in Section A) already covered the full checklist below, and
live verification (Section D) found zero defects requiring a fix.

## C. Requirements checklist (A–H)

### A. Coffee Owner — Job Offer Creation — **DONE**
- `client/src/components/barista/job-post-form-modal.tsx`: `initialState()` prefills
  `establishment`/`locationAddress` from `useAuth()`'s `user.name`/`user.locationAddress`
  **only when creating** (`job ? job.establishment : defaultEstablishment` — an edit never
  has its saved values overwritten). The field stays a normal editable `Input`; nothing is
  force-reapplied after the user types.
- Experience: `EXPERIENCE_PRESETS = ["Aucune","+1 an","+2 ans","+3 ans"]` + a
  `Select`, with a `EXPERIENCE_CUSTOM` branch showing a numeric input and a literal "ans"
  suffix. `deriveExperienceState()` parses a saved value back into preset vs. custom on
  edit (regex `^(\d+)\s*ans?$`); unrecognized legacy text falls back to custom with an
  empty number rather than crashing. On submit, custom years are clamped
  (`Math.max(0, Math.floor(...) || 0)`) — negative/empty/non-numeric can't reach the
  server. Server-side `experienceRequired` stays the same free-text column — no schema
  change needed, only the client's picklist changed.
- Backend: `POST`/`PATCH /api/barista/jobs` already auto-fill `establishment` from
  `user.name` server-side too if the client sends it blank (defense in depth, pre-existing
  from the prior task, left intact).

### B. Barista Marketplace — Job Offers Page status filter — **DONE**
- `client/src/pages/barista-marketplace/jobs.tsx`: `StatusFilterTabs` (Toutes/À
  venir/En cours/Terminées/Annulées) added to both `JobDiscoverList` and
  `JobApplicationsList`. Mapping is documented in-file (lines ~391–421) and uses real
  saved data: application `status` + `meeting.status`/`scheduledAt` for "Mes
  candidatures" (each application lands in exactly one bucket); `hasApplied` +
  `expiresAt` + `missionStartDate` for "Offres/Missions disponibles". Filtering is
  pure client-side over already-fetched data — no mutation, no write path.
- Existing "Offres disponibles"/"Mes candidatures" switcher, pagination, and counts all
  preserved and recalculated against the filtered set (`usePagination` reset on filter
  change, same pattern the tab switch already used).

### C. Consolidate Demandes and Missions — **DONE**
- New `client/src/pages/barista-marketplace/missions-hub.tsx`: "Missions
  disponibles" (new `JobDiscoverList recordType="MISSION"`) / "Mes Missions" (three
  stacked, clearly-labeled sections: the **existing, unmodified-in-substance**
  `BaristaMarketplaceRequestsPage`/`BaristaMarketplaceMissionsPage` components — each
  given an additive, default-`false` `hideHero` prop only — plus the new
  `JobApplicationsList recordType="MISSION"`).
- `business.tsx`: tabs are now `profile` / `missions` (→ the new hub) / `jobs` (→
  unchanged Offres page). The old `requests` tab key is gone but legacy
  `?tab=requests` deep links are caught and redirected to `?tab=missions&view=mine`
  so no old link silently lands on the wrong tab.
- No Demande/Mission records were touched, renamed, or reinterpreted — same tables
  (`baristaMarketplaceRequests`/`-Missions`), same statuses, same accept/reject/discuss
  mutations, same ownership checks, all untouched.

### D. Coffee Owner "Mes offres d'emploi" modal — Offres/Missions split — **DONE**
- `client/src/components/barista/job-management-modal.tsx`: a `RecordTypeSwitcher`
  (Offres/Missions pill toggle) now drives `useMyBaristaJobs(section)`. Deep-linking via
  `initialJobId` resolves the job's own `recordType` (via a secondary unfiltered query)
  and auto-selects the correct section so a Mission link never lands on an empty Offres
  list. Candidate management, targets, and meeting proposals are unchanged — they were
  already generic over `jobPostId`.
- Ownership: every mutation route (`PATCH /api/barista/jobs/:id`,
  `/applications/:id/status`, `/applications/:id/meeting`) checks
  `existing.cafeOwnerId === req.session.userId` (or the equivalent application→job→owner
  chain) server-side before writing — confirmed by reading `server/routes.ts` directly,
  not just trusting client-side gating.

### E. Coffee Owner — Publish a Mission — **DONE**
- `JobPostFormModal` accepts `recordType` (default `"OFFER"`); `JobManagementModal`'s
  "+ Publier une offre"/"+ Publier une mission" button passes the active section.
- Date de début / Date de fin: new `missionStartDate`/`missionEndDate` text fields,
  shown only when `isMission`. Date d'expiration is a **separate**, pre-existing field
  (`expiresAt`, a real timestamp) — never conflated with the mission period (confirmed
  by reading both the form and the schema comment distinguishing the two).
- Validation: client-side (`form.missionEndDate < form.missionStartDate` blocks submit
  with a toast + inline error) **and** server-side
  (`validateMissionDates()` in `server/routes.ts`, applied on both POST and PATCH,
  using the existing saved value for whichever date the PATCH didn't just change) —
  so this can't be bypassed by calling the API directly.
- Publication mode (Automatic/Manual) and Flash targeting reuse the exact same
  `publicationMode` column and `BaristaJobTargetButton`/`addBaristaJobTarget` mechanism
  as Offers — no second targeting system.

### F. Associate a Mission or Job Offer with a Barista — **DONE**
- `client/src/components/barista/barista-job-target-button.tsx` (the ONE shared
  component used by both Fast Search and the Barista details modal) now has an
  Offres/Missions switcher inside the dropdown, each fetching
  `useMyBaristaJobs("OFFER"|"MISSION")` filtered to `MANUAL + PUBLISHED`. Picking a
  record calls the same `useAddBaristaJobTarget()` mutation regardless of type.
- Persistence: `POST /api/barista/jobs/:id/targets` writes to `baristaJobTargets`
  (real table, `onConflictDoNothing` on the `(jobPostId, baristaUserId)` unique index —
  confirmed in schema — so re-picking the same job is a safe no-op, not a duplicate row
  or an error). This is a real DB write, not frontend-only state — it survives refresh
  by construction (it's the only source the targets list reads from). Ownership is
  checked server-side (`job.cafeOwnerId !== req.session.userId` → 404) before any target
  is created.

### G. Barista Details Modal — Remove Recruter only — **DONE**
- `client/src/components/barista/barista-detail-modal.tsx`: the Recruter `<Button>`
  JSX is removed; `onRecruit` was made optional (not deleted from the type) specifically
  **because** Fast Search still uses the same handler for its own, separate, untouched
  Recruter button — verified by grepping all 5 callers of `BaristaDetailModal` before
  making the prop optional rather than required, so no caller needed to change.
  Message, Avis, and the new job/mission Associer action are all still present and wired.

### H. Admin — Barista Synchronization — **DONE**
- `server/storage.ts`'s `getBaristaAdminOverview()` now also reads `baristaJobPosts` +
  `baristaJobApplications` (read-only, same rows, no parallel admin table) and returns
  `stats.totalJobOffers/publishedJobOffers/totalJobMissions/publishedJobMissions/
  totalJobApplications` + a `jobPosts` list (title, recordType, status, publicationMode,
  owner name, application count).
- `client/src/pages/admin/barista-page.tsx`: new tab **"Offres & Missions (emploi)"**,
  deliberately named and placed separately from the pre-existing "Demandes"/"Missions"
  tabs (the older 1:1 recruitment system) so the two data models are never visually
  conflated. Read-only cards + stat tiles, no second mutation path.

## D. Verification results

**TypeScript**: `npx tsc --noEmit` — clean, zero errors, run fresh immediately before
writing this report (not relying on an earlier run).

**Database**: confirmed directly via `information_schema.columns` that
`barista_job_posts.record_type` (enum), `.mission_start_date` (text),
`.mission_end_date` (text) exist on the live database the app actually uses, and that
the table currently holds exactly the 3 real rows from `mersinix@cafe.com` after the
orphan cleanup above (verified by direct `SELECT` and row-by-row owner lookup).

**Live/browser verification**: **performed, after starting the dev server**
(`npm run dev`, started directly since no process was running — confirmed up via
`curl localhost:5000` → 200). Three throwaway accounts (Admin/Barista/Coffee Owner,
`qa-*-<timestamp>@example.test`, deleted afterward along with every job/application/
target/meeting row they created) were used to exercise the real HTTP API and the real
UI end-to-end, never touching `mersinix@cafe.com`'s real records:

- `POST /api/barista/jobs` with `recordType:"MISSION"` → **establishment/locationAddress
  correctly auto-filled** from the account's own saved name/address (confirmed in the
  JSON response and separately in the "Publier une mission" form's pre-filled inputs,
  screenshotted).
- `POST /api/barista/jobs` with `missionEndDate < missionStartDate` → **400, rejected
  server-side** with the exact French message, independent of any client-side check.
- `GET /api/barista/jobs/mine?recordType=MISSION` / `?recordType=OFFER` and
  `GET /api/barista/jobs/discover?recordType=...` → **correctly filtered**; the barista's
  discover call for `OFFER` returned exactly `mersinix@cafe.com`'s real, pre-existing
  "Contoiriste" offer (proving old data survived the migration with `recordType` correctly
  defaulted), while `MISSION` returned only the new test mission.
- Full application lifecycle: apply → owner views it → `PRESELECTED` → meeting proposed
  (`POST .../meeting`) → visible on the barista's own `GET .../applications/mine` with the
  embedded meeting — all via real HTTP calls, each response checked.
- Manual targeting: `POST .../targets` → re-posting the identical target is **idempotent**
  (same row `id` returned both times, confirmed via the DB-level unique index, not just the
  HTTP response) → `GET .../targets` shows exactly one row → the targeted barista's
  `discover` call shows `isTargeted:true` for that mission and `isTargeted:false` for the
  unrelated automatic one.
- Authorization: the barista account attempting `PATCH /api/barista/jobs/:id` on the
  owner's job → **403**, confirming ownership is enforced server-side, not just hidden in
  the UI.
- `GET /api/admin/barista` → **new stats present and accurate**
  (`totalJobOffers:3` = the 3 real pre-existing offers, `totalJobMissions:2` = the 2 test
  missions just created, `totalJobApplications` counted correctly).
- **Browser (Playwright, real login session, dark mode — the account's actual theme)**:
  - `JobManagementModal` → Offres/Missions switcher works; mission cards show the
    correct stats pills (candidatures/en attente/présélectionné/etc.) *and* the
    "Mission du 01 nov. 2026 au 15 nov. 2026" date range, Manuelle/Automatique and
    Publiée badges all correct.
  - "Publier une mission" form → title says "Publier une mission" (not "...une offre"),
    Établissement/Localisation pre-filled with the real account values, Expérience
    requise shows the "Aucune" preset selected, **Date de début / Date de fin render as
    two separate fields distinct from Date d'expiration** (screenshotted side by side —
    confirms they were never conflated), Niveau d'étude/Langue chips populated from the
    real Admin-managed taxonomies.
  - `BaristaJobTargetButton` (Fast Search) → dropdown shows "Associer à une Mission"
    with an "Offres (0) / Missions (1)" switcher reflecting the real eligible counts, and
    lists the correct manually-published mission by name and establishment.
  - Barista's consolidated "Missions" tab (`missions-hub.tsx`) → "Missions disponibles
    (2)" shows both test missions with the 5-way status filter showing accurate counts
    (Toutes 2 / À venir 1 / En cours 1 / Terminées 1 / Annulées 0), "Opportunité ciblée"
    vs. "Mission publique" badges correct, "Déjà postulé" correctly disabled on the one
    already applied to; "Mes Missions" shows the **unmodified** existing Demandes
    ("Aucune demande pour le moment" — correct empty state for a fresh account) and
    Suivi des missions sections stacked above the new Candidatures section.
  - Legacy `?tab=requests` deep link → confirmed redirecting to
    `?tab=missions&view=mine`, landing on "Mes Missions" exactly as designed, not a
    blank/wrong tab.

No failures were found in any of the above. The two gaps noted in a prior draft of this
report (server down; new fields untested) are now closed.

**Code-review verification** (performed, not skipped): every one of the five changed/new
client files and the three backend files was read in full (not just diffed) after the
parallel sub-agents that built four of them finished, specifically checking for: ownership
checks on every mutation, no duplicate-association logic gaps, no accidental conflation of
`expiresAt` vs. mission dates, and that `hideHero`-style additive props didn't change any
existing caller's default behavior.

## E. Remaining risks

1. **Orphaned-row risk pattern**: there is no `DELETE /api/barista/jobs/:id` route (by
   design — jobs are closed, not deleted, matching the existing Offer lifecycle). This is
   correct for real usage; it only became a visible issue earlier this session because a
   `curl -X DELETE` test call silently no-op'd against the SPA fallback instead of failing
   loudly. Not a product bug — noted here only because it's why the one orphan row
   (cleaned up in Section A) existed. No other orphans were found after this round's
   cleanup (verified by direct row listing before and after).
2. **`useMyJobApplicationsByType`'s documented limitation** (confirmed on reading
   `jobs.tsx`): an application whose job post has since expired or closed can't be
   classified as OFFER vs. MISSION via the discover-list cross-reference (closed/expired
   posts don't appear in discovery), so such an application falls back into the Offres
   "Mes candidatures" list rather than the Missions one. Applications are never hidden —
   worst case is a MISSION application showing under the wrong tab after its mission
   closes. Low-impact, documented in-code; not exercised by this round's live test since
   it requires a mission to actually expire/close mid-test.
3. **Admin's new "Offres & Missions (emploi)" tab is read-only** — Admin can see offers/
   missions/applications/status/mode but has no moderation action (approve/reject/freeze)
   on them, unlike the publication-approval workflows other professional account types
   have. This was a deliberate scope decision (the original requirement only asked for
   *visibility/synchronization*, not a new moderation workflow — "Do not create a
   parallel administrative mission system"), not an oversight — flagged here in case the
   user wants a follow-up for admin moderation specifically.

## F. Final Git summary

All changes remain uncommitted in the working tree (no commits made, per standing
instructions to only commit when explicitly asked). `git status --porcelain` at the
start of this audit showed exactly the files listed in Section A/B above, all modified
or newly added — no user changes were discarded, reset, or overwritten. This audit's own
footprint was entirely reversible test data (3 throwaway accounts + their job/application/
target/meeting rows, created and then fully deleted) plus one real cleanup (the pre-existing
orphan row) and zero net source-file changes — the implementation audited here was already
complete and correct.
