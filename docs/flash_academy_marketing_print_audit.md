# Flash Preview — Barista Academy, Marketing, Imprimerie — Audit (v2: real Fast Search reuse)

> **Supersedes** the previous version of this report, which concluded the generic `FlashSearchPreviewModal` (with a counter/progress-bar added) was sufficient. It was not — that modal's icon color, Dialog chrome details, and overall rendering path were a separate implementation, not the actual `AcademyFastSearch`/`MarketingFastSearch`/`PrintFastSearch` components the Coffee Owner actually sees. This revision replaces that approach: each of the three target accounts now opens **its own real Fast Search component**, extended with a `previewMode` branch, exactly mirroring `MaintenanceFastSearch`/`BaristaFastSearch`.

## 1. Phase 1 — actual component wiring, re-verified from scratch

| Location | Component rendered (before this task) | Component rendered (after this task) |
|---|---|---|
| Coffee Owner → `/marketing` → Hero → Fast Search | `MarketingFastSearch` (`services: MarketingServiceCard[]`) | **Unchanged** — same call site, no `previewMode` passed |
| Espace Marketing → Business → Profil → Flash | `FlashSearchPreviewModal` (generic) | `MarketingFastSearch` with `previewMode` |
| Coffee Owner → `/academy` → Hero → Fast Search | `AcademyFastSearch` (`courses: AcademyCourseCard[]`) | **Unchanged** |
| Espace Barista Academy → Business → Profil → Flash | `FlashSearchPreviewModal` (generic) | `AcademyFastSearch` with `previewMode` |
| Coffee Owner → `/print` → Hero → Fast Search | `PrintFastSearch` (`cards: PrintCatalogCard[]`) | **Unchanged** |
| Espace Imprimerie → Business → Profil → Flash | `FlashSearchPreviewModal` (generic) | `PrintFastSearch` with `previewMode` |

Confirmed by a full, independent re-read of all six files (not trusting the prior audit's conclusions): `client/src/components/academy/academy-fast-search.tsx`, `client/src/components/marketing/marketing-fast-search.tsx`, `client/src/components/print/print-fast-search.tsx` (all three read in full before editing), their Coffee Owner call sites (`client/src/pages/cafe/barista/barista-academy-page.tsx:585`, `client/src/pages/cafe/marketing/marketing-page.tsx:568`, `client/src/pages/cafe/print/print-page.tsx:596` — all three still pass no `previewMode`), and the three professional profile pages' previous `FlashSearchPreviewModal` wiring (`client/src/pages/barista-academy/profile.tsx`, `client/src/pages/marketing/profile.tsx`, `client/src/pages/printer/profile.tsx`).

Also re-inspected: `MaintenanceFastSearch`'s `previewMode` implementation (`docs/maintenance_flash_modal_audit.md`) as the structural reference; `BaristaFastSearch`'s `previewMode` implementation as the original reference; `getPreferredImageUrl`/`getAvatarUrl` (`client/src/lib/avatar.ts`) — confirmed `getPreferredImageUrl` only selects between URL strings (Flash, else photo, else `null`) and does **not** itself retry a broken image — that responsibility is, and remains, the caller's own `onLoadingStatusChange`/`flashFailed` state, exactly as `BaristaFastSearch`/`MaintenanceFastSearch` already implement it; each account's own profile data source (`useMyAcademyProfile`, `useMyMarketingProfile`, `usePrintCompanyDetail` — all three confirmed to return the **raw `user` row** for the self/admin branch, so `flashImageUrl`/`profileImageUrl` are always present, never a hand-mapped object that could omit one).

### Root cause of why the prior fix still didn't look right
`FlashSearchPreviewModal` reproduced the *generic shape* of a Fast Search modal (Dialog sizing, header, amber badge, hero image, counter, progress bar — all added across the last two tasks) but was a **separate implementation**, not the real component. Concretely, every real Fast Search has its **own accent color** baked into its `Zap` icon and active-filter-button states (academy = `indigo-400`/`indigo-500`, marketing = `purple-400`/`purple-500`, print = `blue-400`/`blue-500`, maintenance = `orange-400`/`orange-500`, barista = `green-400`/`green-500`) — `FlashSearchPreviewModal` always rendered green (copied from Barista), so Academy/Marketing/Print's preview never matched their own reference modal's actual color identity, confirming the task's own diagnosis: "a generic Flash modal... is still not equivalent to the actual Fast Search modal."

## 2. Phase 2/3/4 — implementation per account

### A. Marketing
- **Previous modal / root cause**: `FlashSearchPreviewModal`, wrong accent color (`green` instead of `purple`) and not the real component — see Section 1.
- **Reference**: Coffee Owner → `/marketing` → Hero → Fast Search = `MarketingFastSearch`.
- **Implementation**: added `previewMode?: boolean` (+ `previewName`/`previewFlashImageUrl`/`previewProfileImageUrl`/`onOpenOwnDetail`) to `MarketingFastSearchProps`. When `previewMode` is true, the component's header/badge/progress-bar/hero-image/bottom-overlay render through a **dedicated preview branch** inside the same file (same `Dialog`/`DialogContent` wrapper, same `purple-400` Zap icon, same gradient/overlay structure) instead of the normal `services`-array-driven branch — it never iterates, filters, or reads `services` in this mode. Hero image uses `getPreferredImageUrl(previewFlashImageUrl, previewProfileImageUrl)` with the same one-shot `flashFailed`-style retry (named `previewFlashFailed` here to avoid any name clash) falling back to `getAvatarUrl({ profileImageUrl: previewProfileImageUrl })`, then to Radix's own `AvatarFallback` (initials). The bottom overlay shows **only the agency's name** — no category chip, no "Disponible/Indisponible" pill, no rating stars, no starting price — none of those have valid meaning for "my own profile" and are not fabricated. Floating action buttons: only "Info" renders (if `onOpenOwnDetail` is supplied), reusing `button-fastsearch-info`'s exact styling; filter/favorite/"Demander un devis" are omitted entirely (no honest preview-safe equivalent). Prev/next arrows and the filter sheet are hidden in preview mode (there is only ever one card, nothing to swipe to or filter).
- **Actual component rendered by the Flash button**: `MarketingFastSearch` (`previewMode`), confirmed — `client/src/pages/marketing/profile.tsx`'s Flash button (`onClick={() => setFlashPreviewOpen(true)}`) now renders `<MarketingFastSearch open={flashPreviewOpen} ... previewMode previewName={...} ... />`; `FlashSearchPreviewModal` import removed from this file (`grep` confirms zero remaining references in this file).
- **Image selection**: Section 1 confirms the data source (`useMyMarketingProfile`'s raw `user` row) always has both fields; priority logic as described above.
- **Preview-only enforcement**: the preview branch contains zero `useMutation`/`apiRequest`/`useFavorites` calls — `triggerFavorite`, `onRequestQuote`, filter state all belong to the *normal*-mode branch and are structurally unreachable when `previewMode` is true (their trigger buttons don't render, and `current` is `null` since `services=[]]` is passed from the preview caller). "Info" opens `MarketingDetailModal` with its pre-existing `readOnly` prop (unchanged).
- **Files modified**: `client/src/components/marketing/marketing-fast-search.tsx`, `client/src/pages/marketing/profile.tsx`.

### B. Barista Academy
- **Previous modal / root cause**: same as Marketing — `FlashSearchPreviewModal`, wrong accent (`green` instead of `indigo`).
- **Reference**: Coffee Owner → `/academy` → Hero → Fast Search = `AcademyFastSearch`.
- **Implementation**: identical pattern. `previewMode` branch uses the `indigo-400` Zap icon and an `indigo-900`→`violet-950` fallback gradient (matching `AcademyFastSearch`'s own normal-mode gradient choice). Bottom overlay shows only the academy's name — no "Certifié" badge, no rating stars (those describe a *course*, not the academy). "Info" (if `onOpenOwnDetail` supplied) reuses the existing `AcademyProfileModal` (`readOnly`) — the same modal this page's own "Aperçu" button already opens — rather than a new detail view.
- **Actual component rendered by the Flash button**: `AcademyFastSearch` (`previewMode`) — confirmed in `client/src/pages/barista-academy/profile.tsx`; `FlashSearchPreviewModal` import removed.
- **Image selection / preview-only enforcement**: same as Marketing (Section 2.A), verified independently for this file.
- **Files modified**: `client/src/components/academy/academy-fast-search.tsx`, `client/src/pages/barista-academy/profile.tsx`.

### C. Imprimerie
- **Previous modal / root cause**: same pattern — `FlashSearchPreviewModal`, wrong accent (`green` instead of `blue`).
- **Reference**: Coffee Owner → `/print` → Hero → Fast Search = `PrintFastSearch`.
- **Implementation**: identical pattern. `previewMode` branch uses the `blue-400` Zap icon and a `blue-900`→`indigo-950` fallback gradient (matching `PrintFastSearch`'s own normal-mode gradient). Bottom overlay shows only the printing company's name — no category chip, no rating stars, no price (all describe a catalog *item*, not the company). "Info" (if `onOpenOwnDetail` supplied) reuses the existing `PrintCompanyDetailModal` (`readOnly`) — the same modal this page's own "Aperçu" button already opens.
- **Actual component rendered by the Flash button**: `PrintFastSearch` (`previewMode`) — confirmed in `client/src/pages/printer/profile.tsx`; `FlashSearchPreviewModal` import removed.
- **Image selection / preview-only enforcement**: same as Marketing/Academy, verified independently for this file.
- **Files modified**: `client/src/components/print/print-fast-search.tsx`, `client/src/pages/printer/profile.tsx`.

## 3. What was deliberately omitted, and why (Phase 5 self-check against fabrication)
Per account, the omitted elements and the reasoning:

| Omitted element | Why |
|---|---|
| Category / certification / type chip | Describes the course/service/product, not "the professional." No equivalent concept exists for "my own profile" in this preview without fabricating a label. |
| Rating stars | The real cards' rating is a *course/service/product-level* (or, for Marketing, agency-level-but-attached-to-a-service) number sourced from reviews on that specific listing — showing it on a self-preview with no listing selected would be either wrong (misattributed) or require a second, different query not requested by this task. |
| Availability pill ("Disponible"/"Indisponible") | Only Marketing's `MarketingServiceCard.agencyIsAvailable` exists among the three; Academy/Print's own self-profile types were not confirmed to expose an equivalent in this task's time budget. Adding it for one account and not the other two would reintroduce "different Flash designs for different accounts," which this task explicitly warns against — so it was left out uniformly. |
| Price / starting price | Entirely product/service-specific; "my own profile" has no single price. |
| Filter button, prev/next arrows, filter sheet | All operate on the `services`/`courses`/`cards` array, which previewMode never receives real data for (`[]` is passed) — rendering them would either be inert decoration or, worse, imply a working filter over nothing. |
| Favorite / "Demander un devis" / enroll button | No business action can honestly apply to "previewing your own profile" — these are preserved, unmodified, in the **normal**-mode branch only. |

No course count, product count, rating, or availability status was invented anywhere to simulate what the real Fast Search shows for an actual listing — every value rendered in `previewMode` is either the authenticated professional's own real `name`/`flashImageUrl`/`profileImageUrl`, or a structural label ("Aperçu Flash", "Mode aperçu…", "1 / 1") that applies identically regardless of account.

## 4. Confirmation that normal search behavior is preserved
`client/src/pages/cafe/marketing/marketing-page.tsx:568`, `client/src/pages/cafe/barista/barista-academy-page.tsx:585`, `client/src/pages/cafe/print/print-page.tsx:596` — all three Coffee-Owner call sites were re-read after editing their respective components and **confirmed unchanged** (no `previewMode` prop passed, so each defaults to `false` and every new `previewMode ? … : …` branch takes its original, unedited path). `BaristaFastSearch` and `MaintenanceFastSearch` were not touched in this task. `client/src/pages/delivery/profile.tsx` and `client/src/pages/driver/profile.tsx` were not touched — both still use the (unmodified-this-turn) `FlashSearchPreviewModal`.

## 5. Files modified (this task)

| File | Change |
|---|---|
| `client/src/components/academy/academy-fast-search.tsx` | Added `previewMode` branch (Section 2.B). |
| `client/src/components/marketing/marketing-fast-search.tsx` | Added `previewMode` branch (Section 2.A). |
| `client/src/components/print/print-fast-search.tsx` | Added `previewMode` branch (Section 2.C). |
| `client/src/pages/barista-academy/profile.tsx` | Flash button rewired from `FlashSearchPreviewModal` to `AcademyFastSearch` (`previewMode`). |
| `client/src/pages/marketing/profile.tsx` | Flash button rewired from `FlashSearchPreviewModal` to `MarketingFastSearch` (`previewMode`). |
| `client/src/pages/printer/profile.tsx` | Flash button rewired from `FlashSearchPreviewModal` to `PrintFastSearch` (`previewMode`). |
| `docs/flash_academy_marketing_print_audit.md` | This report. |

**Not modified**: `FlashSearchPreviewModal` itself (still correctly used by Delivery/Driver, confirmed via `grep -rl "FlashSearchPreviewModal" client/src` listing only those two profile pages plus its own file and a comment mention in `maintenance-fast-search.tsx`), `BaristaFastSearch`, `MaintenanceFastSearch`, every Coffee-Owner call site of the three edited components, `client/src/pages/delivery/profile.tsx`, `client/src/pages/driver/profile.tsx`.

## 6. TypeScript, build, and test results
- `npx tsc --noEmit` — **clean, exit 0**, run after each of the three component edits and again after each of the three profile-page edits (six checkpoints total).
- `npm run build` — **succeeded** (`✓ built in 1m 1s`; server bundled to `dist/index.cjs`, 2.0mb; same pre-existing >500kB chunk-size warning as every prior build in this project, unrelated).
- No automated test suite exists in this project (confirmed, not assumed — no `test` script in `package.json`).
- `git status`/`git diff --stat` after all edits: exactly the 6 files in Section 5 plus this report show new changes from this turn; `delivery/profile.tsx`, `driver/profile.tsx`, `maintenance/profile.tsx`, and `maintenance-fast-search.tsx` all show diffs **carried over from prior tasks only** — confirmed by checking their diff stats did not grow during this session's edits.

## 7. Whether actual visual comparison was performed
**No browser-automation tool was available in this session.** The claims in Sections 1–4 are based on reading the resulting JSX/class names precisely (each `previewMode` branch reuses the exact `Dialog`/header/badge/gradient classes already present in that file's normal-mode rendering, confirmed line-by-line while editing), not on rendering and visually comparing screenshots. This is explicitly called out rather than claimed as tested.

## 8. Remaining manual verification steps
1. A human (or a future session with browser tooling) should open all three professional accounts' Flash buttons side by side with their Coffee Owner Fast Search references and confirm the accent colors, Dialog proportions, and overlay layout genuinely match now that the real components are reused.
2. Confirm the "Info" button in each preview correctly reopens that account's existing read-only detail modal (`AcademyProfileModal`, `MarketingDetailModal`, `PrintCompanyDetailModal`) without a console error, and that closing it returns to the Flash preview or the profile page cleanly.
3. Confirm on an actual device that a broken Flash URL falls back to the profile photo, and a broken photo falls back to initials, for each of the three accounts (verified by code inspection only — see Section 1).
4. Confirm mobile layout for all three previews (all reuse the same `w-[92vw] max-w-lg h-[90vh]` Dialog sizing already used by the real, previously-mobile-tested Fast Search components, but the previewMode branch itself is new and unverified on an actual small screen).
5. If a reviewer determines that a genuine, non-fabricated availability/rating indicator should be added for one or more of these three accounts' own self-preview after seeing it rendered, that would need its own small follow-up — intentionally not attempted here to avoid inconsistent, partially-fabricated badges across the three accounts (Section 3).
