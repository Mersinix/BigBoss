# Coffee Owner — Hero Signaler Modal Design Synchronization Audit

Scope: the "Professionnels/Académies/Imprimeurs/Prestataires signalés" ("Blacklist") modal opened
from each Coffee Owner page's hero "Signaler" (Ban icon) button — NOT the per-entity Signaler
report dialogs inside the individual details modals (those were already standardized in a prior
task and are untouched here).

## Reference implementation — `client/src/components/maintenance/maintenance-blacklist-modal.tsx`

This is the single source of visual truth (already correct from a prior task, not modified here):

- **`DialogContent`**: `sm:max-w-xl rounded-2xl border-0 shadow-2xl max-h-[85vh] overflow-y-auto [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${modalBg}` — default shadcn close button explicitly hidden via `[&>button]:hidden`.
- **Header row**: `flex items-center justify-between gap-2 mb-1`, split into a left group (`flex items-center gap-2 min-w-0`: red icon badge `w-9 h-9 rounded-xl` + `Ban` icon, then `h2` title `font-bold text-base` + `p` subtitle `text-xs` muted) and a right group (`flex items-center gap-2 shrink-0`: any existing header actions, then the close button).
- **Close button**: custom `<button>`, `w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0`, light `bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800`, dark `bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white`, `<X className="w-4 h-4" />`, positioned last in the right-side flex group (i.e. right side of the modal).
- List rows, empty state, loading skeleton, status badge colors: unchanged by this task (these are reporting-content presentation, already consistent in spirit across modules and not named in the task's checklist as needing a rewrite beyond the container/header/close-button/scrollbar).

## Classification

| Module | File | Status | Gaps found |
|---|---|---|---|
| Maintenance | `maintenance-blacklist-modal.tsx` | **MATCHES MAINTENANCE** (is the reference) | — |
| Barista | `barista-blacklist-modal.tsx` | **PARTIALLY MATCHES** | `DialogContent` already has the identical thin-scrollbar classes (same 5 webkit rules, just listed in a different order — functionally identical) and the same container shape (`sm:max-w-xl rounded-2xl border-0 shadow-2xl max-h-[85vh] overflow-y-auto`). Missing: `[&>button]:hidden`, the `justify-between` header split, and the custom circular close button (currently falls back to the default shadcn top-right X). |
| Academy | `academy-blacklist-modal.tsx` | **DOES NOT MATCH** | Header is `flex items-center gap-2 mb-1` (no `justify-between`, no close button at all in the row). `DialogContent` has no scrollbar classes (falls back to the browser default scrollbar) and no `[&>button]:hidden`. |
| Print | `print-blacklist-modal.tsx` | **DOES NOT MATCH** | Header already uses `justify-between` (to make room for its own existing "Signaler" `Button`, added in a prior task), but has no close button in that row (falls back to default shadcn X) and no `[&>button]:hidden`. No scrollbar classes. The existing inline "Signaler" trigger + collapsible report form (Print-specific — Print has no shared per-entity detail modal, so this is where its report submission lives) must be **preserved exactly as-is**, just visually grouped with the new close button the way Maintenance groups its own header actions with its close button. |
| Marketing | `marketing-blacklist-modal.tsx` | **DOES NOT MATCH** | Identical gaps to Academy: header `flex items-center gap-2 mb-1`, no close button, no scrollbar classes, no `[&>button]:hidden`. |

## Duplicate-implementation check (Section 14 of the task)

No shared `BlacklistModal`/`ReportedListModal` component exists — all five are independent files, each with its own `useMyXReports()` hook, its own status-color/label consts (byte-identical `STATUS_LABELS`/`statusColors()` duplicated in every file), and its own row-rendering JSX. This task makes the **smallest safe change** (editing the container/header/close-button/scrollbar classes in each of the 4 non-reference files) rather than extracting a shared component — a full extraction would touch 5 files' prop surfaces (some take extra props like `onRequestQuote`/no-op click-through-to-detail-modal) and risks exactly the "large refactor" the task explicitly forbids (Section 11).

## Business logic / data preserved (confirmed, unchanged by this task)

- Each module's own query hook (`useMyAcademyReports`, `useMyBaristaReports`, `useMyMarketingReports`, Maintenance's inline `useQuery`, Print's `useMyPrintReports`) — untouched.
- Each module's own report data fields (`academyName`/`baristaName`/`marketingName`/`maintenanceName`/`printerName`, location, date, reason, resolution note) — untouched.
- Click-through to each module's own shared Details modal (Academy has none — read-only by design, per its own comment; Barista/Marketing/Maintenance open their respective Details modal; Print has no shared entity modal) — untouched.
- Print's own inline Signaler form (Select provider + Textarea + submit via `useReportPrinter()`) and Maintenance's own inline Signaler form (added in the prior task) — untouched, only repositioned visually alongside the new close button.

## Files that will change

- `client/src/components/academy/academy-blacklist-modal.tsx`
- `client/src/components/barista/barista-blacklist-modal.tsx`
- `client/src/components/marketing/marketing-blacklist-modal.tsx`
- `client/src/components/print/print-blacklist-modal.tsx`

`maintenance-blacklist-modal.tsx` is not modified (already the reference).

## Validation

- `npx tsc --noEmit`: clean, zero errors, after the full set of changes.
- `npm run build`: succeeded (`✓ built in 24.15s`, `dist/index.cjs` 2.0mb). Same pre-existing >500kB chunk-size warning as before; no new warnings/errors.
- No test suite exists in this project (`package.json` has no `test` script) — not applicable.
- Git-diff-confirmed: exactly the 4 files listed above changed this task (`academy-blacklist-modal.tsx`, `barista-blacklist-modal.tsx`, `marketing-blacklist-modal.tsx`, `print-blacklist-modal.tsx`) — `maintenance-blacklist-modal.tsx` untouched, matching this audit's planned scope.
- **Not performed**: live browser verification (opening each hero Signaler modal in light/dark mode, confirming the close button/Escape/outside-click still dismiss correctly, confirming Print's existing Signaler form still submits, confirming each module's reported-list data still loads).
