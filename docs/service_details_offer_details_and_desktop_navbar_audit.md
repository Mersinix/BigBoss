# Service Details ordering, Offer Details expansion & desktop navbar icon order — audit

Three independent, targeted changes: (1) reorder Marketing's Service Details
modal sections, (2) add a module-appropriate "Détails de..." section to
Academy/Print/Maintenance (mirroring Marketing's existing `offerDetails`
pattern) with real create/edit/display wiring, and (3) reorder the desktop-only
account navbar icons across 7 professional account spaces. All additive —
no existing field, action, or API was removed or renamed.

## Marketing

- Current component: `MarketingServiceDetailModal` (`client/src/components/marketing/marketing-service-detail-modal.tsx`).
- Current order (before): Service → Offer Details → Prix/Temps de réponse → Agence.
- Existing Offer Details source: `marketingServices.offerDetails` (already existed, unchanged).
- See `docs/marketing_service_details_order_audit.md` for the full dedicated audit of this change.
- **Change made**: reordered to Service → Agence → Prix/Temps de réponse → Offer Details. Pure JSX reorder, zero data/logic changes.

## Academy

- Course model: `academyCourses` (`shared/schema.ts`) — 13 real fields (title, description, level, priceInCents, duration, hasCertification, category, location, trainingMode, capacity, imageUrl, isPublished) before this task. **No existing field represented "formation details" distinct from the short `description`** — confirmed via full schema read, this is a genuinely new need, not a duplicate.
- Create/edit form: `CourseFormDialog` in `client/src/pages/barista-academy/courses.tsx` ("Nouveau"/"Modifier" — same dialog, `course === "new"` discriminates).
- Details modal: `AcademyDetailModal` (`client/src/components/academy/academy-detail-modal.tsx`), also reused read-only by the Academy's own course preview and by `academy-store-detail-page.tsx` (the Coffee-Owner-facing per-academy Store page) — so no separate wiring was needed there, it inherits the change automatically.
- **Change made**:
  - `shared/schema.ts`: added `formationDetails: text("formation_details").notNull().default("")` to `academyCourses` — additive, backward-compatible (existing rows default to `""`).
  - `server/routes.ts`: added `formationDetails: z.string().max(4000).optional()` to `academyCourseInput` (used by both the POST create and PATCH update routes — the update route applies `.partial()` to the same schema, so no separate edit was needed there).
  - `client/src/hooks/use-barista-academy.ts`: added `formationDetails` to both the hand-written `AcademyCourse` type and the `AcademyCourseInput` type (this file maintains its own parallel types rather than importing `shared/schema.ts`'s — the same two-type-definitions pattern found for Barista earlier this session; both were updated).
  - `client/src/pages/barista-academy/courses.tsx`: added `formationDetails` to `CourseFormState`/`EMPTY_FORM`, the `useEffect` hydration, the `save()` payload, and a new "Détails de la formation" `Textarea` placed right after "Description".
  - `client/src/components/academy/academy-detail-modal.tsx`: reordered Académie before the Prix/Catégorie grid (matching Marketing's new order), and added a conditionally-rendered "Détails de la formation" block (guarded on `course.formationDetails?.trim()`, `ListChecks` icon, same `t.sectionBg` card styling as Marketing's Offer Details block) as the last section.
  - `server/storage.ts`: no changes needed — `getAcademyCoursesForAcademy`/`createAcademyCourse`/`updateAcademyCourse`/`getPublishedAcademyCourses`/`getAcademyCourseCard` all use `...course`/`...safeData` spreads rather than naming columns individually, so the new field flows through automatically.

## Print

- Catalog item model: `printCatalogItems` (`shared/schema.ts`) — had no Offer-Details-equivalent field (confirmed and deliberately NOT added in an earlier task this session, since Print's structured fields — unit/minQuantity/productionTimeDays/materials — already covered similar ground). This task explicitly asked for it, so it was added now.
- Create/edit form: `ServiceFormDialog` in `client/src/pages/printer/services.tsx` ("Nouveau service"/"Modifier").
- Details modal: `PrintServiceDetailModal` (`client/src/components/print/print-service-detail-modal.tsx`), also reused read-only by the Printer's own preview and by Admin Print.
- **Change made**:
  - `shared/schema.ts`: added `offerDetails: text("offer_details").notNull().default("")` to `printCatalogItems`.
  - `server/routes.ts`: added `offerDetails: z.string().max(4000).default("")` (create) / `.optional()` (update) to the two inline zod schemas on `POST`/`PATCH /api/print/catalog`.
  - `client/src/pages/printer/services.tsx`: added `offerDetails` to `FormState`/`EMPTY_FORM`/`toFormState`/`buildPayload`, and a new "Détails de l'offre" `Textarea` right after "Description".
  - `client/src/components/print/print-service-detail-modal.tsx`: reordered Imprimerie before the Prix/Délai grid (matching Marketing's new order), added a conditionally-rendered "Détails de l'offre" block (same `ListChecks`/`sectionBg` treatment) as the last section.
  - `server/storage.ts`: no changes needed — `getPrintMarketplaceCards`/`getPrintMarketplaceCard`/`getPrintCatalogItemCard`/`getPrintCompanyCard`/`createPrintCatalogItem`/`updatePrintCatalogItem` all spread `...item`/`...data`, so the new field flows through automatically (confirmed by reading all 4 `PrintCatalogCard`-construction sites, the same 4 sites touched by an earlier task this session for `printerIsAvailable`).

## Maintenance

- Professional model: `maintenanceProfiles` (`shared/schema.ts`) — confirmed via full schema read: no existing field represents "service details" beyond the short `description`. (A `requirements` field exists, but on the entirely separate `maintenanceJobPosts` table — the Coffee-Owner-created "Intervention" job-posting system — not touched, and deliberately not reused/confused with this profile-level field.)
- **Maintenance has no Store/Service split** — one professional account = one card/profile, so there is no separate "create/edit a service" form; the professional's own profile IS the service. The correct edit surface is `client/src/pages/maintenance/profile.tsx`.
- Details modal: `AgentDetailModal`, exported from `client/src/pages/cafe/maintenance/maintenance-page.tsx` (same file as the mapped card, not a separate file).
- **Change made**:
  - `shared/schema.ts`: added `serviceDetails: text("service_details").notNull().default("")` to `maintenanceProfiles`.
  - `server/routes.ts` (`PATCH /api/maintenance/profile`): added `serviceDetails: z.string().max(4000).optional()` to the self-service body schema; also included it in the existing `identityChanged` re-review gate alongside `description` (a content change visible to Coffee Owners should re-trigger the same Admin review as a description change — consistent with the existing rule, not a new workflow).
  - `client/src/pages/maintenance/profile.tsx`: added `serviceDetails` state, hydration from `profileData`, inclusion in `saveProfileMutation`'s payload, and a new "Détails de Service" `Textarea` in the "Détails professionnels" card, right after "Biographie".
  - `client/src/pages/cafe/maintenance/maintenance-page.tsx` (`AgentDetailModal`): inserted a conditionally-rendered "Détails de Service" block (guarded on `agent.serviceDetails?.trim()`, `ListChecks` icon, matching the existing plain-text section style already used by "À propos"/"Catégories & Compétences" in this specific modal — not Marketing's boxed-card style, to stay internally consistent with Maintenance's own established modal convention) immediately after "À propos" and before "Catégories & Compétences".
  - **Confirmed NOT reintroduced**: `dailyRateInCents`/"Tarif journalier" remains fully removed from both the card and the modal, per the earlier `docs/maintenance_pricing_admin_performance_audit.md` decision — this task did not touch that.
  - **Confirmed NOT touched**: `maintenanceJobPosts`/`maintenanceJobTargets`/`maintenanceJobApplications` (the separate Intervention architecture) — entirely untouched.
  - `server/storage.ts`: no changes needed — `upsertMaintenanceProfile` is a generic `Partial<InsertMaintenanceProfile>` passthrough, and `getMaintenanceCard` spreads `...row.profile` into the card — both already propagate the new column automatically.

## Shared design treatment

All four "Détails de..." blocks use the identical visual pattern: a `p-3 rounded-xl` card (Marketing/Print/Academy — Maintenance's modal uses its own existing plain-text section style instead, to stay consistent with that specific modal's pre-existing convention, not Marketing's), a `ListChecks`-icon section header, `whitespace-pre-wrap` body text, and are **only rendered when the underlying field is non-empty** (`?.trim()` guard) — no module ever shows a fabricated or placeholder "Détails" section.

## Database safety

Three new columns, all additive/backward-compatible (`text(...).notNull().default("")`): `print_catalog_items.offer_details`, `academy_courses.formation_details`, `maintenance_profiles.service_details`. Pushed via `npx drizzle-kit push --force`; verified via `psql` that every existing row in all three tables received the safe `''` default (8/8 `print_catalog_items`, 3/3 `academy_courses`, 5/5 `maintenance_profiles` — no row left null, no row dropped).

## Desktop account navbar icon order

- Shared component: `client/src/components/layout/professional-account-shell.tsx` (`ProfessionalAccountShell`) — the ONE implementation used by all 7 account spaces (Espace Barista Academy, Espace Barista Marketplace, Espace Livraison, Espace Chauffeur, Espace Maintenance, Espace Marketing, Espace Imprimerie) via 7 thin wrapper files that each only pass title/color/tabs props and contain no icon JSX of their own. One edit here applies to all 7.
- Helper components: `AccountHeaderActions` (`client/src/components/account/account-header-actions.tsx`, renders Message/Avis/Settings cells in a caller-supplied `order`) and `NotificationBellPopover` (`client/src/components/account/notification-bell-popover.tsx`, the Bell/Notification cell).
- **Before this task, desktop and mobile shared the exact same single JSX block** (`grid grid-cols-3 sm:grid-cols-6`) — reordering it would have changed BOTH, violating "mobile must stay unchanged." No desktop-only/mobile-only split existed at all.
- **Change made**: split the one shared block into two responsive-gated blocks:
  - Mobile (`className="grid grid-cols-3 gap-1 shrink-0 sm:hidden"`) — kept byte-for-byte identical to the original order/content/testids (Paramètres, Mode clair, Déconnexion, Message, Notification, Avis).
  - Desktop (`className="hidden sm:grid sm:grid-cols-6 gap-1 shrink-0"`, new) — Message → Notification → Avis → Mode clair → Paramètres → Déconnexion, Déconnexion rightmost, exactly as required.
  - Since both blocks render simultaneously in the DOM (one is merely CSS-hidden, not unmounted), added an optional `testIdSuffix` prop to `AccountHeaderActions` and `NotificationBellPopover` (default `""`, so the mobile block's testids are untouched) and passed `testIdSuffix="-desktop"` on the new desktop block's calls, plus distinct `-desktop`-suffixed testids on the Mode-clair/Déconnexion buttons' own desktop copies — this prevents duplicate `data-testid` values from existing in the live DOM at the same time, which would otherwise break any `getByTestId`-style query expecting exactly one match.
- No icon was replaced, removed, resized, or recolored — only JSX position and (for the new desktop copies only) `data-testid` suffixes changed.

## Tests executed

- `npx tsc --noEmit` — clean after all changes. (One iteration was needed: `AcademyCourse`/`AcademyCourseCard` in `client/src/hooks/use-barista-academy.ts` are hand-written types, not imports from `shared/schema.ts` — the same two-separate-type-definitions gotcha found for Barista earlier this session. Fixed by adding `formationDetails` to the hand-written `AcademyCourse` type there too.)
- `npm run build` — clean production build (client + server).
- `npx drizzle-kit push --force` — applied the 3 new columns; verified via `psql` (non-sensitive columns only) that all existing rows in `print_catalog_items`, `academy_courses`, and `maintenance_profiles` safely received the `''` default.
- Live verification via `curl` against the user's already-running Vite dev server confirmed the HMR-updated frontend modules reflect: the Marketing/Print/Academy section reorders, the new "Détails de..." blocks and form fields in all three modules, the Maintenance modal/form additions, and the navbar's desktop/mobile split.

## Verified / Not verified / Not applicable

- **Verified**: TypeScript compiles; production build succeeds; all 3 new DB columns exist with safe defaults and no data loss; every frontend change is confirmed present in the live HMR-served module source.
- **Not verified**: the backend route changes (`server/routes.ts` — the new `offerDetails`/`formationDetails`/`serviceDetails` zod fields on the Print/Academy/Maintenance create/update endpoints) require a restart of the user's long-running `tsx` (no `--watch`) dev server to take effect at runtime — frontend-only changes reflect live via Vite HMR, but backend route changes do not. The server was not restarted, since that affects the user's running process and wasn't explicitly requested. Until restarted, submitting a new "Détails de..." value from any of the three forms will be silently stripped by the still-old zod schema on the server (the field simply won't be saved) even though the frontend UI is already live. Real rendered-pixel/interactive browser verification (clicking through Create → Save → Display → Edit on each module, and visually confirming the navbar order at actual desktop/mobile widths) was not performed — no browser-automation tool is available in this environment.
- **Not applicable**: Admin Maintenance/Admin Barista/Espace Chauffeur-specific business logic, Marketing business logic, Delivery/Marketplace/authentication — none were touched, nothing to verify there.

## Remaining limitations

- **Action needed from the user (or explicit instruction to proceed)**: restart the dev server to activate the 3 new backend validation fields before testing Create/Edit → Save → Coffee Owner display end-to-end for Print/Academy/Maintenance. The Marketing reorder and the navbar reorder are both frontend-only and are already live.
- No browser-automation tool is available in this environment; the navbar's actual rendered appearance at desktop vs. mobile breakpoints, and the "Détails de..." sections' dark-mode contrast, should be confirmed by the user in a real browser.
- Maintenance's "Détails de Service" block intentionally uses a plain-text style (matching that specific modal's existing "À propos"/"Catégories" sections) rather than the boxed-card style used in Marketing/Print/Academy's modals — a deliberate choice to stay internally consistent with Maintenance's own modal, not an oversight.
