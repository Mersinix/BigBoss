# Blacklist Modal Refactor — Final Report (Phase 2–4)

Implements the architecture approved from `BLACKLIST_MODAL_REFACTOR_AUDIT.md`.

## Final architecture

- **Group A (Shop, Academy, Print)** — no row click-through. Each is now a ~10-20 line wrapper that calls the new generic `SimpleBlacklistModal`, passing only its `sectionId` + its own `usePublishedReports` hook + its own `isDark` handling (prop for Shop/Print, internal `useThemeStore` read for Academy — unchanged external contracts). `SimpleBlacklistModal` looks up title/subtitle/accent colors/field names from the new `BLACKLIST_SECTIONS` config table, builds the icon from the new `ReportedEntityBadge`, and builds `mapRow` from the new `mapPublishedReportRow` helper — then renders the existing `EntityPublishedReportsModal` exactly as before.
- **Group B (Barista, Maintenance, Marketing)** — kept as their own dedicated wrapper files, unchanged in integration shape (`onRecruit`, `onContact`, `onRequestQuote`, Maintenance's extra `/api/maintenance/profiles` fetch). Each was shortened by pulling its title/subtitle/accent/field-names from the same `BLACKLIST_SECTIONS` config and its icon from `ReportedEntityBadge`/row-mapping from `mapPublishedReportRow`, instead of duplicating them inline.
- **Untouched**: `EntityPublishedReportsModal` (modal shell/grabber/pagination/theming), `PublishedReportsList` (list rendering/loading/error/empty states — only gained the new exported helper, nothing existing in it changed), `createEntityReportHooks` and all six `use-*-reports.ts` instantiations (data layer), every backend route, and all six page-level import/render call sites.
- **Update (task: "Unify the Design of All Six Blacklist Modals")**: all six wrappers now explicitly pass `headerVariant="centered"` into their `EntityPublishedReportsModal`/`SimpleBlacklistModal` call — the same header variant Shop already used. This was the entire visual gap between Shop and the other five: every other visual element (dialog max-width/positioning, grabber, row layout, rating/report presentation, pagination button, loading skeleton, empty/error states, light/dark theming, responsive behavior, scroll-dismiss) was already rendered by the same shared `EntityPublishedReportsModal`/`PublishedReportsList` code for all six sections before this change, since all six already used that shared shell. No change was made to the shared shell itself — only the existing `headerVariant` prop, already built generically in the prior task, is now threaded through the five remaining call sites.

## Files created

- `client/src/components/shared/blacklist-sections.ts` — `BLACKLIST_SECTIONS` config table (title/subtitle/accent colors/raw field-name keys per section) + `resolveAccentClassName` helper.
- `client/src/components/shared/reported-entity-badge.tsx` — `ReportedEntityBadge`, the one byte-identical icon block.
- `client/src/components/shared/simple-blacklist-modal.tsx` — `SimpleBlacklistModal`, the generic wrapper for Shop/Academy/Print.

## Files modified

- `client/src/components/published-reports-list.tsx` — added `PublishedReportRowKeys` type + exported `mapPublishedReportRow` helper next to the existing `PublishedReportRow` type it already owned. Nothing existing in this file (list rendering, loading/error/empty states, pagination button) was changed.
- `client/src/components/shared/entity-published-reports-modal.tsx` — exported the previously-local `PublishedReportsPage` interface so `SimpleBlacklistModal` can reuse it instead of redeclaring it. No other change (this file's modal shell/header logic is the same one already in production from the prior `headerVariant` task).
- `client/src/components/shop/shop-blacklist-modal.tsx`, `academy/academy-blacklist-modal.tsx`, `print/print-blacklist-modal.tsx` — rewritten to call `SimpleBlacklistModal`. Exported component name and external prop signature unchanged for all three.
- `client/src/components/barista/barista-blacklist-modal.tsx`, `maintenance/maintenance-blacklist-modal.tsx`, `marketing/marketing-blacklist-modal.tsx` — shortened to reuse `ReportedEntityBadge`/`mapPublishedReportRow`/`BLACKLIST_SECTIONS`; click-through state, detail-modal JSX, and prop contracts (`onRecruit`/`onContact`/`onRequestQuote`) byte-for-byte unchanged.

## Files deleted

None. Per the audit's recommendation (§8), every one of the six original files stays at its original path and keeps its original exported component name — this was a deliberate choice to avoid touching any of the six page-level importers.

## Updated imports and references

None of the six page files (`browse-products.tsx`, `barista-academy-page.tsx`, `barista-page.tsx`, `maintenance-page.tsx`, `marketing-page.tsx`, `print-page.tsx`) needed any import or usage change — verified by re-grepping for all six filenames after the refactor: the only remaining matches are the six wrapper files' own imports (now pointing partly at the new shared files) and one pre-existing unrelated comment mention in `pack-quick-view-modal.tsx`.

## Configuration differences preserved

All six sections' titles, subtitles, accent colors (light/dark), and raw API field names (`supplierId`/`academyUserId`/`baristaUserId`/`maintenanceUserId`/`marketingUserId`/`printerId` and their name/image counterparts) are reproduced verbatim in `BLACKLIST_SECTIONS` — copied directly from each section's previous inline `mapRow`/`accentClassName`/title/subtitle, not re-derived.

## Shared utilities extracted

1. The byte-identical red `Ban` icon badge → `ReportedEntityBadge`.
2. The identical `{id, professionalId, professionalName, professionalImageUrl, rating, comment, createdAt, publishedAt}` row-mapping shape → `mapPublishedReportRow`.
3. The per-section labels/colors/field-names → `BLACKLIST_SECTIONS`.

No change was made to `EntityPublishedReportsModal`, `PublishedReportsList`'s existing behavior, or `createEntityReportHooks` — all three were reused as-is, per the task's explicit instruction not to recreate already-centralized functionality.

## Section-specific behavior preserved

- Barista: `BaristaDetailModal` + `RecruitDialog` click-through, `onRecruit` callback — unchanged.
- Maintenance: `/api/maintenance/profiles` query to resolve a report row's `professionalId` into a full `MaintenanceMarketplaceCard`, `contact` mutation (`POST /api/messages/conversations`), `AgentDetailModal` + `onContact` — unchanged.
- Marketing: `MarketingDetailModal` click-through, required `onRequestQuote` prop bubbled to its parent page — unchanged.
- Shop: `headerVariant="centered"` (from the prior task) — still Shop-only, now passed as an explicit prop to `SimpleBlacklistModal` rather than hardcoded inside the old `ShopBlacklistModal`'s own JSX.
- `isDark` prop-vs-internal-store split across the six sections — unchanged per section.

## TypeScript results

`npx tsc --noEmit` — clean, no errors.

## Build results

`npm run build` — succeeded (client: 2856 modules transformed; server: `dist/index.cjs` built). Same pre-existing chunk-size warning as before this task (unrelated, not introduced by this refactor).

## Browser test results

**Not performed.** No browser-automation tool is available in this session. All verification above is static: TypeScript compilation, production build, and direct code/diff inspection (confirming each of the six page files' imports are untouched, confirming `onRecruit`/`onContact`/`onRequestQuote`/Maintenance's extra fetch are textually present and unchanged in the new files). No section was opened or clicked through in an actual browser.

## Visual Consistency Validation

Shop (`shop-blacklist-modal.tsx`) is the approved visual reference and was **not** modified — it already used `headerVariant="centered"` from the prior "Redesign ShopBlacklistModal Header" task. The gap analysis and fix:

| Visual element | Shared by all six before this task? | Change made |
|---|---|---|
| Dialog max-width/positioning/rounding/shadow | Yes — same `DialogContent` className in `EntityPublishedReportsModal` | None needed |
| Grabber | Yes — same `ModalGrabber` call | None needed |
| Header layout/spacing, title/subtitle centering, close button position/size | **No** — Shop used `headerVariant="centered"`, the other five used the default (icon+title left-aligned, no divider) | **Fixed**: all five now pass `headerVariant="centered"` |
| Icon badge design/positioning | Yes, already identical — and now literally the same component (`ReportedEntityBadge`) in all six, in both header variants | None needed beyond the earlier consolidation |
| Reported-row layout, entity image/info positioning, rating/report presentation | Yes — same `PublishedReportsList` for all six, unaffected by header variant | None needed |
| Action buttons, pagination button, loading skeleton, empty/error states | Yes — same `PublishedReportsList` | None needed |
| Light/dark theme | Yes — same `isDark`-driven classes throughout `EntityPublishedReportsModal`/`PublishedReportsList`, and the centered-header branch uses the identical dark/light token pattern as Shop's | None needed |
| Responsive behavior | Yes — same `DialogContent`/Tailwind classes, no per-section override existed | None needed |
| Scrolling / swipe-to-dismiss | Yes — same `useScrollDismiss` call, same `max-h-[85vh] overflow-y-auto` | None needed |

**Conclusion**: `headerVariant` was the only axis of visual divergence between Shop and the other five sections. Setting it to `"centered"` everywhere makes all six modals render through the identical code path for every element in the checklist above — there is no remaining visual difference between any of the six beyond genuine content (title/subtitle text, accent color, which rows are clickable).

**Intentional differences that remain** (content, not visual structure — explicitly allowed to persist):
- Title/subtitle text per section.
- Accent color per section (`accentClassName`, used inside row rating display).
- Click-through affordance: Barista/Maintenance/Marketing rows open a detail modal on click; Shop/Academy/Print rows do not (`onSelectProfessional` omitted) — this is existing, approved section-specific behavior, not a visual inconsistency.

## Remaining limitations / unverified behavior

- Live rendering (modal opening, pagination "Charger plus", light/dark toggle, swipe-to-dismiss, repeated open/close, actual click-through navigation, and the now-unified header's actual on-screen appearance) was not exercised in a real browser — no browser-automation tool is available in this session. Everything in "Visual Consistency Validation" above was verified by reading the shared component's source and confirming all six callers now pass the same `headerVariant` value through the same code path, not by visually comparing rendered screenshots.
- No automated test suite exists in this repository, so none could be run.
- The `"default"` header branch inside `EntityPublishedReportsModal` now has no remaining callers (all six sections pass `"centered"`). It was left in place rather than removed, since deleting it was not required to satisfy this task and exceeds "smallest safe change necessary" — flagging it here as an optional future cleanup, not done unprompted.
- The pre-existing, unrelated deleted files under `attached_assets/*.png` (noted in the prior task's report) remain in that state — not touched by, and not part of, this refactor.
