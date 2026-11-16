# Coffee Owner — Avis Modal Close-Button Synchronization Audit

## Key finding: one shared component serves all five modules

The "Avis" (Reviews) modal is **not** five separate implementations — it is a single shared
component, `client/src/components/account/reviews-modal.tsx`'s `ReviewsModal`, already reused
verbatim (confirmed by import) by:

- `academy-detail-modal.tsx` / `academy-profile-modal.tsx` (Academy)
- `barista-detail-modal.tsx` (Barista)
- `marketing-detail-modal.tsx` / `marketing-service-detail-modal.tsx` (Marketing)
- `print-company-detail-modal.tsx` / `print-service-detail-modal.tsx` (Print)
- `client/src/pages/cafe/maintenance/maintenance-page.tsx` (Maintenance)
- (also `delivery-company-detail-modal.tsx` / `driver-detail-modal.tsx`, outside this task's scope but incidentally fixed for free since they consume the same shared component)

Each caller only supplies data (professional name, rating, review rows, an opaque `reviewForm`
slot for its own eligibility/submission UI) — the modal shell, including its close button, is
rendered once, in this one file. **This means the fix is a single-file change, not five.**

## Signaler modal close-button reference (already standardized)

The Hero "Signaler" (blacklist/"Professionnels signalés") modal close button, standardized across
all five modules in the immediately prior task:

```tsx
<button
  onClick={onClose}
  aria-label="Close"
  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${
    isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
           : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800"
  }`}
>
  <X className="w-4 h-4" />
</button>
```

- Icon: lucide `X`, `w-4 h-4`.
- Button: `w-8 h-8 rounded-full`, no border, no shadow.
- Light: `bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800`.
- Dark: `bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white`.
- Positioned as the last child of a `flex items-center justify-between` header row (right side).
- The parent `DialogContent` adds `[&>button]:hidden` to suppress Radix's own default top-right close button, since this custom one replaces it.

## Current Avis modal close button — `reviews-modal.tsx` (lines 29-43)

**DOES NOT MATCH**, identically for all five modules (since it's the one shared file):

- `DialogContent` (line 31) has **no** `[&>button]:hidden` and **no custom close button anywhere in the file** — it falls back entirely to Radix's default shadcn close button (`client/src/components/ui/dialog.tsx:51-56`: `absolute right-4 top-4`, `h-4 w-4` `X`, `opacity-70 hover:opacity-100`, no background/border/circle at all).
- Header (lines 32-43, inside `DialogHeader`) is `flex items-center gap-2` — a Star icon + name/rating block, no `justify-between`, no close-button slot.

## Classification

| Module | Status |
|---|---|
| Maintenance | **DOES NOT MATCH** (same shared component) |
| Barista | **DOES NOT MATCH** (same shared component) |
| Academy | **DOES NOT MATCH** (same shared component) |
| Print | **DOES NOT MATCH** (same shared component) |
| Marketing | **DOES NOT MATCH** (same shared component) |

All five are identical because they all render the one shared `ReviewsModal` — fixing that one file fixes all five at once.

## Fix

In `reviews-modal.tsx`: add `[&>button]:hidden` to `DialogContent`'s className (suppressing the default), change the header's `flex items-center gap-2` to `flex items-center justify-between gap-2`, wrap the existing Star+name/rating content in a `min-w-0` div, and add the Signaler-pattern close button as the last element of that row, using the exact classes above (importing `X` from `lucide-react`, already importing `Star`).

## Preserved (not touched)

- Review data/props shape, `reviewForm` slot and every caller's own eligibility/mutation logic, review list rendering, empty state, rating/count header text, scrollbar classes, modal width/height/border-radius/shadow, the Avis **trigger** icon on each Details modal (untouched — only the close button *inside* the opened Avis modal changes).
- The Signaler modal itself — not modified in this task, used only as a read-only visual reference.

## Validation

- `npx tsc --noEmit`: clean, zero errors, after the fix.
- `npm run build`: succeeded (`✓ built in 12.65s`, `dist/index.cjs` 2.0mb). Same pre-existing >500kB chunk-size warning as before; no new warnings/errors.
- No test suite exists in this project (`package.json` has no `test` script) — not applicable.
- Git-diff-confirmed: exactly one file changed, `client/src/components/account/reviews-modal.tsx`.
- **Not performed**: live browser verification across the five flows (opening each Details modal's Avis icon, confirming the new close button's position/style/dark-mode appearance, confirming Escape/click-outside still dismiss, confirming review data still loads for each module).
