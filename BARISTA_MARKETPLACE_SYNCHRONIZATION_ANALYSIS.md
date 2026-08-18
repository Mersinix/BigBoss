# Marketplace Barista — Complete Synchronization Audit

**Scope:** Read-only analysis. No code, schema, or configuration was modified while producing this report. Every claim below is backed by an exact file/line citation gathered by reading the actual repository — nothing here is inferred from naming conventions alone.

---

## A. Executive Summary

**The Barista Marketplace does not exist as a system — it exists as a name.** There is no database table, no API route, and no storage method anywhere in the codebase for a Barista profile, a recruitment request, a mission, a Barista-specific review, or Barista revenue. **NOT IMPLEMENTED**, across the board, at the data layer.

What exists is two isolated, self-contained React components:
- `client/src/pages/cafe/barista/barista-page.tsx` (871 lines) — the public `/barista` page, entirely powered by two hardcoded arrays (`BARISTAS`, `TRAINING_PROGRAMS`) defined at the top of the file. **MOCK / HARDCODED**.
- `client/src/pages/barista-marketplace/dashboard.tsx` (97 lines) — the Barista account's only real page. **MOCK / HARDCODED**.

These two components **do not talk to each other**, do not talk to a database, and do not talk to any API. Recruitment ("Recruter") is a `<Button disabled={!barista.available}>` with **no `onClick` handler at all** — clicking it does nothing, not even an error. The five Barista-account sidebar links (Profil public, Demandes, Missions, Revenus, Settings) all resolve to the exact same 97-line dashboard component via a wildcard route (`/barista-marketplace/:rest*`) — four of the five nav items are **dead links that silently render the wrong page** with no indication anything is missing.

What *is* real and reusable: the role system (`BARISTA_ACADEMY`, `BARISTA_MARKETPLACE`), registration/approval flow, the generic `platformServices` visibility toggle, and — critically — a fully-built, structurally analogous reference implementation for a different marketplace vertical: **Maintenance** (`maintenanceProfiles`, `maintenanceReservations`, `maintenanceFavorites`, `maintenanceCompetencies`, `maintenanceZones`, plus real routes/storage). Maintenance is the template this feature should reuse, not reinvent — see §Q.

---

## B. Current Architecture

```
/barista (public)                    /barista-marketplace/* (account)
        │                                       │
        ▼                                       ▼
 barista-page.tsx                      dashboard.tsx (wildcard route target
   BARISTAS = [...]                     for /profile, /requests, /missions,
   TRAINING_PROGRAMS = [...]            /revenue, /settings — all five
   (hardcoded, module scope)            resolve here, identically)
        │                                       │
        ▼                                       ▼
  useMemo() client-side filter          hardcoded KPI numbers,
  over the hardcoded arrays             hardcoded chart data,
                                         hardcoded "recent requests" list
        │                                       │
        ▼                                       ▼
      NO API CALL                            NO API CALL
        │                                       │
        ▼                                       ▼
      NO DATABASE                           NO DATABASE
```

There is no arrow connecting the left column to the right column. A Café Owner clicking "Recruter" on the left produces no event of any kind that the right side could ever observe.

The one piece of real, working cross-cutting infrastructure both sides *could* plug into is the existing generic messaging system (`conversations`/`messages` tables, `/api/messages/*`, WebSocket broadcasts) — see §L.

---

## C. Database Audit

**Searched exhaustively.** `shared/schema.ts` (1,581+ lines, the single source of truth for every table in the project) contains **zero** Barista-specific tables. Every Barista-related symbol in the schema file is one of these four, none of which model a Barista profile, request, mission, or review:

| Symbol | Location | What it actually is |
|---|---|---|
| `userRoleEnum` values `'BARISTA_ACADEMY'`, `'BARISTA_MARKETPLACE'` | `shared/schema.ts:8` | Two role tags on the generic `users` table — nothing else |
| `serviceKeyEnum` value `'BARISTA'`, `MARKETPLACE_SERVICE_IDS` | `shared/schema.ts:24,27` | The generic admin Visible/Hidden/ComingSoon toggle — same mechanism Print/Marketing/Maintenance use |
| `landingConfig.baristaAcademyImage`, `.baristaMarketplaceImage` | `shared/schema.ts:463-464` | Two image-URL columns for the public landing page hero, unrelated to profiles |
| `PROSPECT_TYPES` value `'BARISTA_TRAINER'` | `shared/schema.ts:1593` | An Admin CRM lead-classification tag (Prospecting module), unrelated to the live marketplace |

**No dedicated table exists for**: a Barista profile (bio, level, skills, city, day rate, availability), a recruitment/hiring request, a mission, a Barista-specific review/rating, or Barista revenue/payment. **NOT IMPLEMENTED.**

**What a Barista account's "profile" actually is, today:** a row in the generic `users` table, with:
- `name` — used as-is (no separate "public display name" vs "contact name")
- `categories: text[]` — reused, generic, shared verbatim with `BARISTA_ACADEMY` (no separate `baristaCategories` column exists the way `printCategories`/`marketingCategories`/`maintenanceCategories` each got their own dedicated array column — see `shared/schema.ts:41-44` for the ones that *do* exist, and note `categories` at line 41 is the one Barista falls back to). Populated from a **hardcoded** 8-item list `BARISTA_SPECIALTIES` in `client/src/pages/landing-page.tsx:267` and again independently in `client/src/pages/admin/users-page.tsx:29` (two separate hardcoded copies of the same taxonomy, not shared from one source).
- `locationAddress`/`locationLat`/`locationLng`/`locationPlaceId`/`locationDetails` — the generic per-user geolocation fields (same ones Suppliers/Cafe Owners use)
- `phone`, `email`, `status` (pending/approved/rejected) — generic account fields

**Fields the public `/barista` page displays that have no column anywhere**: `level` (Beginner/Advanced/Expert), `rating`, `reviewCount`, `dailyRateInCents`, `available` (boolean), `availableDays` (weekly recurring), `initials`. **NOT IMPLEMENTED** — these seven fields exist only inside the hardcoded `BARISTAS` array literal (`client/src/pages/cafe/barista/barista-page.tsx:152-231`).

**Existing generic models that should be reused instead of duplicated** (see §Q for the concrete mapping):
- `conversations`/`conversationParticipants`/`messages` (`shared/schema.ts:620-647`) — already messaging-eligible for `BARISTA_ACADEMY`/`BARISTA_MARKETPLACE`↔`CAFE_OWNER` pairs (`server/storage.ts:5034`).
- `supplierProductReviews` (`shared/schema.ts:394-415`) — already generic enough to carry a review for a non-product entity: it has `reviewType: text` (currently `'PRODUCT' | 'SUPPLIER' | 'PACK'`, plus a Maintenance-specific extension `maintenanceUserId`/`reservationId` already bolted on, `shared/schema.ts:402-403`), `rating`, `comment`, `cafeId`, `cafeName`, timestamps, and a reporting/moderation sub-flow (`reportedAt`/`reportReason`/`resolvedAt`). This table was clearly *designed* to be extended per-vertical (Maintenance already did it) rather than duplicated.
- `maintenanceProfiles`/`maintenanceReservations`/`maintenanceFavorites`/`maintenanceCompetencies`/`maintenanceZones` (`shared/schema.ts:472-544`) — not reusable directly (FK'd to Maintenance-specific semantics), but structurally the exact template a `baristaMarketplaceProfiles`/`baristaMarketplaceRequests` pair should follow field-for-field. See §Q for the direct mapping.
- `users.categories` array + admin taxonomy pattern — reusable, but currently overloaded between two roles (see above) with two independently-hardcoded copies of the same list.

---

## D. API Audit

**Searched exhaustively** across `server/routes.ts` (3,852+ lines) and `server/storage.ts` (4,830+ lines) for every Barista-related keyword. Result: **zero dedicated endpoints.**

| METHOD/ROUTE | Status |
|---|---|
| *(anything under `/api/barista*`)* | **NOT IMPLEMENTED** — no such route exists |
| *(any storage method for a Barista profile/request/mission/review)* | **NOT IMPLEMENTED** |

The only backend code that is Barista-*aware* at all:

```text
Endpoint/function: storage.getEligibleContacts() — server/storage.ts:5022-5089
Auth: YES (requireAuth, via the calling route)
Role: any (branches internally)
Effect: Lets an approved CAFE_OWNER open a message thread with any approved
        BARISTA_ACADEMY/BARISTA_MARKETPLACE account with no prior relationship
        required (server/storage.ts:5029-5034, 5080-5089) — same generic
        mechanism used for Maintenance.
DB: reads `users` filtered by role+status only
Owner check: N/A (this is a contact-discovery list, not a data-access endpoint)
Status: WORKING, but generic — carries zero Barista-specific business data
  (no request, no skill match, no rate, nothing beyond "you may message this
  account")
```

```text
Endpoint: GET /api/system-services, PATCH /api/admin/system-services/:service
File: server/routes.ts:207,216 (generic, service="BARISTA" is one of five values)
Auth: PATCH requires requireAdmin; GET is public
Effect: Admin-controlled Visible/Hidden/ComingSoon flag for the whole /barista
        page (client/src/App.tsx:362, GatedServiceRoute)
Status: WORKING — but this only shows/hides the mock page, it doesn't
        source any of its content.
```

No endpoint exists for: creating/reading/updating a Barista profile; creating a recruitment request; listing a Barista's requests; accepting/rejecting a request; creating/listing/updating a mission; submitting/reading a Barista review; reading Barista revenue. **NOT IMPLEMENTED**, every one.

---

## E. Public Marketplace Audit — `/barista`

File: `client/src/pages/cafe/barista/barista-page.tsx`.

- **Data source**: two `const` arrays at module scope — `TRAINING_PROGRAMS` (6 items, lines 71-150) and `BARISTAS` (6 items, lines 152-231). **MOCK / HARDCODED.** No `useQuery`, no `fetch`, no import from an API client anywhere in the file.
- **Filtering**: `useMemo` over the in-memory arrays (`filteredTraining` lines 512-526, `filteredBaristas` lines 528-558). 100% client-side, operating on data that was never server-side to begin with. There is no server-side filtering to compare it to — the question "is filtering client-side or server-side" only has one honest answer here: **client-side over static data**, which is a different thing from "client-side over API data" (as e.g. `shared/orders-page.tsx` legitimately does).
- **Filter option sources**: "Compétence" (skill) and "Ville" (city) dropdowns are `Array.from(new Set(BARISTAS.flatMap(...)))` (lines 560-567) — derived from the same 6-item mock array, so they're internally consistent with the mock data but tell you nothing about a real taxonomy. **MOCK / HARDCODED.**
- **Rating (`4.9`, `64 avis`, etc.)**: literal numbers in the `BARISTAS` array (e.g. `rating: 4.9, reviewCount: 64` at line 159-160). **MOCK / HARDCODED** — confirmed no rating-aggregation code exists anywhere that touches Barista data (see §I).
- **Availability (`available: true/false`, `availableDays: [...]`)**: literal booleans/arrays per mock entry (lines 163-164, etc.). **MOCK / HARDCODED** — there is no mission/booking data anywhere that could compute this.
- **Daily price (`dailyRateInCents`)**: literal integer per mock entry. **MOCK / HARDCODED.**
- **City (`location`)**: literal string per mock entry. **MOCK / HARDCODED.**
- **"Recruter" button** (line 467-474): `<Button disabled={!barista.available} data-testid="button-hire-barista-...">{barista.available ? "Recruter" : "Indisponible"}</Button>` — **no `onClick` prop at all.** This is not a broken API call or a silently-failing request; it is a button wired to nothing. **NOT IMPLEMENTED.**
- **"S'inscrire" button** (Training tab, line 337-343): same pattern — no `onClick`. **NOT IMPLEMENTED.**
- **"Chat" button** next to Recruter (line 456-466): a real `<Link href="/cafe/messages">` — navigates to the generic messages page, but does not pre-select a conversation with that specific Barista or pass any context. **PARTIALLY IMPLEMENTED** (navigates somewhere real, but not to a Barista-specific thread).
- **Favorites (heart icon)**: calls `useFavorites().toggleBaristaMarket(...)` (line 379-388) — a real Zustand state update, but that store slice has **no `persist` middleware and no DB hydration** (`client/src/hooks/use-favorites.ts` — `academy`/`baristaMarket` keys have no `hydrate*` method, unlike `shop`/`pack`/`maintenance` which do, e.g. `hydrateMaintenance`/`syncMaintenance` at lines 89-90). **PARTIALLY IMPLEMENTED** — works within a session, silently lost on page refresh.
- **Access gating**: `useAccessLevel()` (lines 44-50) correctly distinguishes visitor/pending/approved and shows an approval-pending banner (lines 639-646) — this part mirrors the working pattern from `browse-products.tsx` and is genuinely functional, it's just gating access to content that's mock either way.

---

## F. Barista Account Audit — `/barista-marketplace/*`

Routing: `client/src/App.tsx:328-330`:
```tsx
<Route path="/barista-marketplace/:rest*">
  {() => (<DashboardLayout><ProtectedRoute component={BaristaMarketplaceDashboard} allowedRoles={["BARISTA_MARKETPLACE"]} requireApproved /></DashboardLayout>)}
</Route>
```
A wildcard catches **every** sub-path and renders the same `BaristaMarketplaceDashboard` component regardless of which one it is.

Sidebar (`client/src/components/layout/app-sidebar.tsx:374-402`) presents five distinct destinations:

| Nav label | URL | Actual component rendered | Reality |
|---|---|---|---|
| Dashboard | `/` | `BaristaMarketplaceDashboard` | Renders the dashboard — correct |
| Profil public | `/barista-marketplace/profile` | `BaristaMarketplaceDashboard` (same) | **NOT IMPLEMENTED** — no profile editor exists |
| Demandes | `/barista-marketplace/requests` | `BaristaMarketplaceDashboard` (same) | **NOT IMPLEMENTED** — no requests list exists |
| Missions | `/barista-marketplace/missions` | `BaristaMarketplaceDashboard` (same) | **NOT IMPLEMENTED** — no missions view exists |
| Revenus | `/barista-marketplace/revenue` | `BaristaMarketplaceDashboard` (same) | **NOT IMPLEMENTED** — no revenue view exists |
| Settings | `/barista-marketplace/settings` | `BaristaMarketplaceDashboard` (same) | **NOT IMPLEMENTED** — no settings view exists |

The dashboard itself (`client/src/pages/barista-marketplace/dashboard.tsx`):
- KPI tiles "Demandes ce mois" (11), "Missions actives" (2), "En attente" (4), "Note" (4.7) — literal strings in a `.map()` over an inline array (lines 28-33). **MOCK / HARDCODED**, and these are the *exact* numbers the user quoted in their brief, confirming they came straight from this file, not from any live state.
- 6-month chart — `requestData` array (lines 7-10), fed straight into `recharts`. **MOCK / HARDCODED.**
- "Demandes récentes" list — `recentRequests` array (lines 12-16), three literal café names/statuses. **MOCK / HARDCODED.**

No loading state, no error state, no empty state exist in this file because there is no data-fetch to have states for.

`barista-academy/dashboard.tsx` (a **separate role**, `BARISTA_ACADEMY`, out of the user's stated "Marketplace" scope but worth noting for completeness) has the exact same shape: `salesData`/`recentEnrollments` hardcoded arrays, same wildcard-route pattern at `App.tsx:323-325`. Whatever fix is designed for Marketplace should anticipate this sibling needing the identical treatment later, without assuming it's in scope now.

---

## G. Recruitment Lifecycle

Traced the literal click-through:

```text
Café Owner clicks "Recruter"
    ↓
onClick prop: DOES NOT EXIST (barista-page.tsx:467-474)
    ↓
Nothing happens. No network request. No console error. No state change.
```

**This is the honest, complete trace.** Every question in the user's brief about this flow resolves the same way:

- Can only `CAFE_OWNER` recruit? **CANNOT CONFIRM** — no authorization code exists to check, because no recruit action exists.
- Can an unauthorized user create requests? **N/A** — no request can be created by anyone, authorized or not.
- Can a Barista recruit another Barista / recruit themselves? **N/A** — same reason.
- Can duplicate requests be created? What prevents them? **N/A** — no request-creation path exists at all, so there is nothing to duplicate and nothing preventing it.
- Is the target Barista validated? Is the café validated? Is the request persisted, including its status? **N/A** for all — there is no request object anywhere in the system, transient or persisted.

---

## H. Mission Lifecycle

**NOT IMPLEMENTED**, in full. No `missions` table, no mission-creation code path (automatic or manual), no status field, no linkage to a request/Barista/café/dates/price, no start/complete/cancel action, no overlap check, no availability recalculation. The `/barista-marketplace/missions` nav entry renders the generic dashboard (§F) — there is no mission list to audit for bugs because there is no mission list.

---

## I. Reviews & Ratings

- **Real, working review infrastructure exists** in this codebase — `supplierProductReviews` (`shared/schema.ts:394-415`), with a full CRUD surface (`POST /api/reviews`, `GET /api/reviews/supplier/:id`, admin moderation, report/resolve flow — confirmed present in `server/routes.ts`'s reviews section) and a proven extension pattern (Maintenance added `maintenanceUserId`/`reservationId`/`reviewType='MAINTENANCE'` on top of the same table rather than creating a new one).
- **None of this touches Barista.** `reviewType` has no `'BARISTA_MARKETPLACE'` value; there is no `baristaMarketplaceUserId` column; nothing in `server/routes.ts`'s review endpoints references any Barista role or table.
- The `4.9` / `64 avis` shown on `/barista` are literal fields in the mock array (§E) — **MOCK / HARDCODED**, not an aggregation of anything, real or fake, in the database. There is no rating-aggregation function for Barista to audit for correctness, because none exists.
- **Fake-review risk**: currently zero, only because the entire submission path doesn't exist. Once built, the same eligibility rule already enforced for product/Maintenance reviews (only a café that actually transacted may review) is the correct precedent to reuse — see §Q.

---

## J. Revenue

**NOT IMPLEMENTED.** No table, no endpoint, no calculation. `/barista-marketplace/revenue` renders the generic mock dashboard (§F), which has no revenue figures on it at all — the "Revenus" nav item doesn't even lead to mock revenue numbers, just the same KPI tiles as every other tab.

No commission model, no gross/net distinction, no transaction/payment status field exists anywhere in `shared/schema.ts` for *any* provider role, Barista included — this project has no payment-processing layer at all (confirmed earlier in this engagement: Shop orders are cash-on-delivery only, `server/routes.ts` rejects any other `paymentMethod`). **Do not invent one** — this matches the user's explicit instruction. If a revenue view is built, it can only ever be "sum of {something} from completed missions," and only once missions and a rate/fee model exist.

---

## K. Availability

**NOT IMPLEMENTED** at the data layer. The public page's `available: boolean` and `availableDays: string[]` (§E) are static per mock entry — there is no distinction in the codebase between:
- regular/weekly-recurring availability,
- specific-date availability,
- dates already committed to a mission,
- explicitly-blocked dates,

because none of these concepts has a column, table, or computation anywhere. The one real precedent worth reusing: Maintenance already solved a version of this exact problem — `maintenanceProfiles.isAvailable`/`isOnVacation` (manual toggle, `shared/schema.ts:491-492`) combined with `maintenanceReservations` status tracking for date-specific commitments. Barista's "already booked because of a mission" case maps directly onto the same pattern Maintenance uses for reservations. See §Q.

---

## L. Realtime

The project's existing realtime mechanism (confirmed in a prior engagement on this same codebase, re-verified here): a single raw `ws` WebSocketServer at `/ws` (`server/ws.ts`), authenticated from the session cookie, with `broadcast()` (all connected clients) and `broadcastToUsers(userIds, event, data)` (targeted). Client-side, one hook (`client/src/hooks/use-realtime.ts`) owns a big switch-on-event-name that invalidates the relevant TanStack Query cache keys.

**This mechanism has zero Barista-specific events.** Grepping `use-realtime.ts`'s event-name lists (`ORDER_EVENTS`, `MAINTENANCE_EVENTS`, `DELIVERY_EVENTS`, etc. — all confirmed present from this session's own work) finds nothing barista-shaped, because there is nothing to broadcast — no request/mission ever gets created server-side to broadcast about.

**This is not a gap that needs new technology.** The exact pattern to reuse is already proven twice over in this codebase (Maintenance's `maintenance_reservation_updated` event, and this engagement's own Delivery work's `delivery_created`/`delivery_status_changed` events): create the row server-side → `broadcastToUsers()` the directly-involved accounts with a minimal payload → the client's existing `use-realtime.ts` switch gains one more case → `queryClient.invalidateQueries()`. No SSE, no polling, no new library needed.

---

## M. Responsive UI

`/barista` (`barista-page.tsx`) already uses the same responsive grid conventions as the rest of the marketplace (`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5`, lines 740/852) and the same `MarketplaceLayout` shell as Shop/Print/Marketing/Maintenance — no Barista-specific responsive issues were found; it inherits whatever the shell already provides. **CANNOT CONFIRM** actual rendered behavior on a live device/viewport without a browser tool (none was available in this session) — this is a static-code read, not a visual QA pass.

`/barista-marketplace/*` uses the standard `DashboardLayout`/`Card`/`recharts` `ResponsiveContainer` combination identical to every other role dashboard in this app (Printer, Marketing, Maintenance, Delivery) — no divergent, Barista-specific layout code exists to be a unique risk. Same "cannot visually confirm" caveat applies.

No responsive-specific bugs were found in the code itself; any issues here would be inherited from (or shared with) the rest of the marketplace shell, not introduced by the Barista pages specifically.

---

## N. Hardcoded / Mock Data — Full Inventory

| File | Lines | What's hardcoded | Real DB source that should replace it |
|---|---|---|---|
| `client/src/pages/cafe/barista/barista-page.tsx` | 71-150 | `TRAINING_PROGRAMS` — 6 fake training courses (title, provider, rating, price, level, cert) | A future `baristaAcademyPrograms`-style table, or (if Academy stays out of scope) left as-is and explicitly labeled |
| `client/src/pages/cafe/barista/barista-page.tsx` | 152-231 | `BARISTAS` — 6 fake profiles (name, level, skills, rating, reviewCount, location, dailyRateInCents, available, availableDays) | New `baristaMarketplaceProfiles` table (see §Q) joined to `users` |
| `client/src/pages/cafe/barista/barista-page.tsx` | 560-567 | `allSkills`/`allLocations` filter options, derived from the mock array | Distinct skill values from the new profile table (or a shared skills taxonomy, see §Q) |
| `client/src/pages/barista-marketplace/dashboard.tsx` | 7-10 | `requestData` — 6-month chart | `COUNT(*) GROUP BY month` over a future requests table, scoped to the logged-in Barista |
| `client/src/pages/barista-marketplace/dashboard.tsx` | 12-16 | `recentRequests` — 3 fake requests with café names/status | Real requests table, most-recent-first, scoped to the logged-in Barista |
| `client/src/pages/barista-marketplace/dashboard.tsx` | 28-33 | 4 KPI tiles (11 / 2 / 4 / 4.7) | Aggregate queries over the future requests/missions/reviews tables |
| `client/src/pages/landing-page.tsx` | 267 | `BARISTA_SPECIALTIES` — 8-item skills list (registration form) | Should become the single source of truth for skills, referenced by both registration and `/barista`'s skill filter |
| `client/src/pages/admin/users-page.tsx` | 29 | A **second, independently-hardcoded copy** of the same 8-item `BARISTA_SPECIALTIES` list | Same taxonomy as above — currently two lists that could silently drift apart |
| `client/src/components/cafe/marketplace-layout.tsx` | 112-121 | `fakeThreads` incl. 2 Barista-tagged fake conversations | **Dead code** per its own comment (line 110-111: "Legacy placeholder threads retained only as a fallback... all service tabs now use the real conversation API") — not live, but should be deleted during cleanup rather than left as a red herring |
| `client/src/pages/barista-academy/dashboard.tsx` | 7-16, 28-33 | `salesData`/`recentEnrollments`/KPI tiles — same pattern, different role | Out of stated scope, flagged for parity |

No hardcoded revenue or hardcoded charts were found beyond the ones listed — there is no separate "fake revenue" array to report because the Revenue nav item doesn't render any revenue content at all (§J).

---

## O. Security Audit

Because no Barista-specific endpoint exists, most of the requested checks (IDOR on requests, cross-Barista data access, unauthorized mission updates, revenue access) have no attack surface **yet** — **N/A, not because it's safe, but because there's nothing to attack.** The risk is entirely prospective: whatever gets built needs the checks from day one.

What *does* exist and was checked:
- **Route protection**: `/barista-marketplace/*` correctly requires `allowedRoles={["BARISTA_MARKETPLACE"]}` + `requireApproved` (`App.tsx:329`) — a non-Barista or unapproved account cannot reach the dashboard shell. **WORKING.**
- **`/barista` public page**: correctly open to visitors with a graduated access level (visitor/pending/approved) via `useAccessLevel()` (lines 44-50) — consistent with how `browse-products.tsx` gates commercial data elsewhere in the app. **WORKING**, though there's currently no "commercial data" being protected since it's all mock/public-safe.
- **Messaging eligibility** (`getEligibleContacts`, §C): correctly scoped by role/status, no cross-tenant leak found in the Barista branch specifically. **WORKING.**
- **`users.categories` write path** (admin editing a Barista's specialties, `admin/users-page.tsx`): goes through `requireAdmin`-protected endpoints (`PATCH /api/admin/users/:id`) — an admin-only action, correctly gated, not something a Barista or Café Owner can forge for another account. **WORKING**, not a vulnerability, but also not something a Barista can self-service today (no "edit my own profile" endpoint exists at all — see §C, "no profile editor exists").

**Prospective, not current, risk**: once a profile/request/mission/revenue API is built, it must reuse the ownership-check pattern already proven correct elsewhere in this codebase this session (e.g. `storage.canUserAccessDelivery` / `canUserAccessOrder`'s real-relationship-based checks, *not* the status-based shortcut that was found and fixed as a critical IDOR in the Delivery module during this same engagement). That prior, real bug is the concrete cautionary example: don't let "is this Barista's status one that implies visibility" substitute for "is this actually assigned to this Barista."

---

## P. Synchronization Matrix

| Feature | Public `/barista` | Barista Account | Database | API | Realtime | Status |
|---|---|---|---|---|---|---|
| Profile (name, level, skills, city, rate) | Hardcoded array | No editor exists | None | None | None | **NOT IMPLEMENTED** |
| Availability | Hardcoded array | No editor exists | None | None | None | **NOT IMPLEMENTED** |
| Skills | Hardcoded array (own copy) | Admin-only, hardcoded (separate copy) | `users.categories` (generic, reused) | Generic user-update endpoint only | None | **PARTIALLY IMPLEMENTED** (storable, not self-service, not synced to public page) |
| Rating | Hardcoded number | Not shown anywhere in account UI | None | None | None | **MOCK / HARDCODED** |
| Recruitment ("Recruter") | Dead button | — | None | None | None | **NOT IMPLEMENTED** |
| Requests | — | Dashboard shows 3 fake rows; dedicated page doesn't exist | None | None | None | **NOT IMPLEMENTED** |
| Missions | — | Dedicated page doesn't exist | None | None | None | **NOT IMPLEMENTED** |
| Reviews | Hardcoded count | — | Generic table exists, unused by Barista | Generic endpoints exist, unused by Barista | None | **NOT IMPLEMENTED** (for Barista specifically) |
| Revenue | — | Dedicated page doesn't exist (renders generic dashboard) | None | None | None | **NOT IMPLEMENTED** |
| Messaging (contact discovery only) | "Chat" button → generic inbox | N/A | `conversations`/`messages` (generic) | `/api/messages/*` (generic) | WebSocket, generic | **IMPLEMENTED** (generic, not Barista-specific business data) |
| Account visibility (admin show/hide `/barista`) | Gated by `GatedServiceRoute` | N/A | `platformServices` (generic) | `/api/admin/system-services/*` (generic) | `system_services_updated` event (generic) | **IMPLEMENTED** (generic) |
| Registration/approval | N/A | Real signup form → real `users` row, admin-approvable | `users` table | `/api/auth/register`, `/api/admin/users/:id/approve` | None needed | **IMPLEMENTED** |

---

## Q. Recommended Target Architecture (description only — nothing here was built)

The single most important finding for planning purposes: **this codebase already contains a complete, working blueprint for exactly this kind of marketplace vertical — Maintenance.** The safest architecture is a field-for-field, pattern-for-pattern adaptation of it, not a new design.

```text
                              maintenanceProfiles                 (existing, reference)
                                       │  1:1 with a MAINTENANCE user
   proposed  ───────────────►  baristaMarketplaceProfiles         (new — same shape:
                                  userId, jobTitle→level, skills[],  isAvailable, rating,
                                  reviewCount, dailyRateInCents, coverageArea→city,
                                  marketplaceVisible)

                              maintenanceReservations              (existing, reference)
   proposed  ───────────────►  baristaRequests / baristaMissions   (new — same shape:
                                  requester(cafeOwnerId), provider(baristaUserId),
                                  status, date/time, reschedule fields, description)

                              supplierProductReviews               (existing, ALREADY
                                (reviewType='MAINTENANCE',            generic — extend,
                                 maintenanceUserId, reservationId)     don't duplicate)
   proposed  ───────────────►  reviewType='BARISTA_MARKETPLACE' +
                                  baristaMarketplaceUserId, requestId columns

                              maintenanceCompetencies/Zones         (existing, reference
                                (admin-managed taxonomy tables)        for replacing the
   proposed  ───────────────►  a real skills taxonomy table,          two hardcoded
                                  replacing the two independently       BARISTA_SPECIALTIES
                                  hardcoded BARISTA_SPECIALTIES lists   copies)

                              getEligibleContacts() BARISTA branch  (existing, already
                                — reuse as-is, already correct         wired, no change
                                                                        needed)

                              server/ws.ts broadcast/broadcastToUsers (existing, reuse
                                — add baristaRequest_created,           as-is per §L)
                                  baristaRequest_status_changed,
                                  baristaMission_* events
```

Every arrow above points from something already built and proven in this codebase to something proposed. Nothing proposes new infrastructure (no new realtime tech, no new payment system, no new messaging system) — only new tables and routes following patterns already validated by Maintenance's working implementation, plus (from this same engagement) the Delivery domain's dispatch/ownership/realtime patterns as a second, even more recent proof point for the request→acceptance→completion shape.

**Availability**, specifically, should follow the same composite model Maintenance already uses: a manual `isAvailable`/`isOnVacation`-style toggle on the profile, *narrowed* by actual accepted mission date ranges — never a single freeform boolean the Barista sets and forgets, which is what today's mock data effectively simulates.

---

## R. Implementation Plan (phased — description only, not started)

### Phase 1 — Database / models
Add (mirroring Maintenance's exact structure): a `baristaMarketplaceProfiles` table (1:1 with `users`, role-checked at write time); a `baristaSkills`/taxonomy table (admin-managed, replacing the two hardcoded `BARISTA_SPECIALTIES` copies) with a join table if skills become many-to-many rather than an array; a `baristaRequests` table (café → Barista, status lifecycle, date/description fields); a `baristaMissions` table (created on request acceptance, FK to the request); extend `supplierProductReviews` with a `'BARISTA_MARKETPLACE'` `reviewType` + `baristaMarketplaceUserId`/`requestId` columns (no new review table). *Files: `shared/schema.ts`, a new `migrations/*.sql`.* *Risk: none to existing modules — fully additive, same pattern already used twice this engagement (Maintenance historically, Delivery this session).*

### Phase 2 — Backend / API
New `IStorage` methods + `server/routes.ts` endpoints for profile CRUD (self-service, `requireApprovedBaristaMarketplace`-style middleware mirroring `requireApprovedSupplier`), request create/list/status-transition (ownership-checked exactly like the Delivery work's `canUserAccessDelivery`, never status-based), mission derive-on-acceptance, review create (eligibility = "had an accepted/completed mission with this Barista," mirroring the Maintenance review-eligibility rule). *Files: `server/storage.ts`, `server/routes.ts`, `shared/routes.ts` (typed contract, following the `api.deliveries.*` pattern already established this session).* *Risk: none — new route namespace, doesn't touch SHOP/DELIVERY/MAINTENANCE/etc. route handlers.*

### Phase 3 — Public Marketplace
Replace `BARISTAS`/`TRAINING_PROGRAMS` hardcoded arrays in `barista-page.tsx` with `useQuery` against the new profile-list endpoint; move filter option derivation server-side or keep client-side over real data (consistent with how `browse-products.tsx` already does it); wire "Recruter" to an actual request-creation call; keep the existing `MarketplaceLayout`/`GatedServiceRoute`/`useAccessLevel` shell untouched. *Files: `client/src/pages/cafe/barista/barista-page.tsx` only.* *Risk: must preserve the existing Academy tab's UI even if Academy's own backend stays out of scope for this pass — don't let a partial fix leave the page in a worse state than today's consistently-mock one.*

### Phase 4 — Barista Account
Split the wildcard `/barista-marketplace/:rest*` catch-all into real routed pages (profile editor, mirroring `supplier/store-page.tsx`'s self-service editing pattern), replacing the dead nav links identified in §F. *Files: `client/src/App.tsx` (new explicit routes, following exactly the pattern this session already used to add `/delivery/available` etc.), new page files under `client/src/pages/barista-marketplace/`.* *Risk: must not remove the working `/` dashboard route or its `allowedRoles` guard.*

### Phase 5 — Requests
Requests list page (Barista side) + request-detail/accept/reject actions; Café-Owner-facing "my sent requests" view (new, since none exists today — check whether it belongs under the existing Coffee Owner account shell or a new page). *Files: new `client/src/pages/barista-marketplace/requests-page.tsx`, corresponding hooks in a new `use-barista-marketplace.ts` (mirroring `use-deliveries.ts`'s structure from this session).* *Risk: must enforce the ownership/ IDOR lessons from §O — ownership checks server-side, never trust a client-supplied Barista/café id.*

### Phase 6 — Missions
Mission list/detail, status transitions, overlap prevention against the Barista's own accepted missions. *Files: new `client/src/pages/barista-marketplace/missions-page.tsx`.* *Risk: availability calculation (Phase 1's model) must be correct before this phase's overlap check can be meaningful — sequence matters.*

### Phase 7 — Reviews / Ratings
Review submission (café-side, eligibility-gated), rating aggregation query, surfaced back on both the public profile card and the Barista's own dashboard. *Files: extend the existing generic reviews endpoints (`server/routes.ts`'s reviews section) rather than adding new ones; `barista-page.tsx` reads the real aggregate instead of the mock `rating`/`reviewCount` fields.*

### Phase 8 — Revenue
Only after missions carry a real, persisted rate — do not build this earlier, and do not invent a payment/commission model that doesn't exist elsewhere in the app (§J). If built, it is a read-only aggregation view over completed missions' stored rate, nothing more, matching the project's existing cash-settlement (no payment gateway) reality.

### Phase 9 — Realtime
Add `baristaRequest_created`/`baristaRequest_status_changed`/`baristaMission_status_changed` events using the existing `broadcastToUsers()` (§L), and extend `client/src/hooks/use-realtime.ts`'s existing switch with the corresponding cache-invalidation cases — the exact mechanical addition already performed twice this session for Delivery.

### Phase 10 — Responsive / UX
Once real (variable-length, potentially empty/loading/error) data replaces the fixed 6-item mock arrays, re-verify grid/card behavior under real conditions (empty state, single result, 50+ results) — today's responsive behavior was never truly tested against anything but exactly six hardcoded cards.

### Phase 11 — Security / testing
Live-test (as done for Delivery this session): a second Barista cannot see/modify the first's requests/missions/profile; a Café Owner cannot forge a request in another café's name; a review can only be submitted by a café with a genuine completed mission; the public endpoint never leaks a field that should be account-private (e.g. raw phone/email) versus what's meant to be public-profile-safe.

---

## Cross-Module Dependencies

**CROSS-MODULE DEPENDENCY**: extending `supplierProductReviews` (Phase 1/7) touches a table also used by SHOP (product/supplier reviews) and MAINTENANCE (maintenance reviews). The change itself (one more `reviewType` value + two new nullable FK columns) is additive and mirrors exactly how Maintenance was added previously — low risk, but any migration touching this table must be reviewed against those two existing consumers before applying.

**CROSS-MODULE DEPENDENCY**: `users.categories` (Phase 1) is currently shared between `BARISTA_ACADEMY` and `BARISTA_MARKETPLACE`. If Barista Marketplace gets its own dedicated skills column/table, `BARISTA_ACADEMY`'s registration/admin-edit code paths (`landing-page.tsx`, `admin/users-page.tsx`) must be updated in the same change or left correctly using the old generic field — don't leave Academy silently broken by a partial migration.

No other cross-module dependency was found. Nothing in this analysis touches SHOP, DELIVERY, PRINT, MARKETING, ADMIN's other tabs, SUPPLIER, or the Coffee-Owner core account beyond the messaging eligibility map (already correct, no change needed) and the two `categories`-sharing points called out above.

---

*End of analysis. No files, schema, or configuration were changed in the course of producing this report. No implementation will begin until explicit instruction is given, per the request.*
