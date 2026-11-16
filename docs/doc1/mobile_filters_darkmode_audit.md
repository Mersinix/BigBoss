# Mobile Filter Bar + Collapsible Search + Dark-Mode Picklist — Audit

## 1. Initial findings and root causes

### Six sections, two different filter-bar shapes
All six pages (`client/src/pages/cafe/barista/barista-page.tsx` — BARISTA, `.../barista/barista-academy-page.tsx` — ACADEMY, `.../browse-products.tsx` — SHOP, `.../maintenance/maintenance-page.tsx` — MAINTENANCE, `.../print/print-page.tsx` — PRINT, `.../marketing/marketing-page.tsx` — MARKETING) independently implement their own filter bar with the **same hand-written structure**: a `SlidersHorizontal` icon + a row of `Select`/`SelectTrigger`/`SelectContent` pills, wrapped in `className="... flex items-center gap-2 flex-wrap"`. There is **no shared `<FilterBar>` component** — each page owns its own JSX copy (confirmed by reading all six; they're structurally identical but not componentized). On mobile, `flex-wrap` was the only behavior: once the row couldn't fit, controls wrapped onto additional lines rather than scrolling horizontally, and the plain `flex-1` search input (where one exists) would shrink awkwardly alongside everything else.

### Search input: only 4 of the 6 pages actually have one
This is the audit's key finding, confirmed by reading every page's JSX (not assumed from the task's listing):

| Section | Local search input? | State |
|---|---|---|
| BARISTA (`barista-page.tsx`) | **Yes** | `baristaSearch`/`setBaristaSearch`, live `onChange` |
| MAINTENANCE (`maintenance-page.tsx`) | **Yes** | `search`/`setSearch`, live `onChange` |
| ACADEMY (`barista-academy-page.tsx`) | **Yes** | `trainingSearch`/`setTrainingSearch`, live `onChange` |
| MARKETING (`marketing-page.tsx`) | **Yes** | `search`/`setSearch`, live `onChange` |
| SHOP (`browse-products.tsx`) | **No** | `search`/`setSearch` exists but is only ever set once from the URL's `?q=` param (`client/src/components/cafe/marketplace-layout.tsx`'s **global top-navbar** search box, shared across the whole Coffee Owner shell) and once on a "reset" click — grepped `value={search}` and found zero `<Input>` bound to it anywhere in the page. |
| PRINT (`print-page.tsx`) | **No** | Same pattern — `searchQuery` is derived once from `?q=` (same global navbar box, `marketplace-layout.tsx:2985`); grepped for `<Input` in the whole file and found **zero** matches. |

Both SHOP and PRINT's "search" is the **global header search bar** (present on every Coffee Owner page, not specific to these two sections), which already has its own distinct desktop-only presentation and is explicitly out of this task's scope (the task lists per-section filter bars, not the global nav). There is nothing in SHOP's or PRINT's own filter bar to "collapse into an icon" because no local search input exists there to begin with — inventing one would be a new feature, not a responsive-presentation fix, and the task explicitly forbids "introducing new... architectural changes" and a "broad refactor." **Requirement B is therefore implemented for the 4 pages that actually have a local search input (BARISTA, MAINTENANCE, ACADEMY, MARKETING); Requirement A (horizontal scroll) is implemented for all 6**, since all six do have a real filter bar with Select controls.

### "Expérience requise" dark-mode root cause
`client/src/components/barista/job-post-form-modal.tsx`'s "Publier une offre d'emploi" form has exactly one native shadcn `<Select>`/`<SelectContent>` pair in the whole file (confirmed by grep — every other themed field in this form is a plain `<Input>`/chip-button, not a `Select`). Its `<SelectTrigger className={t.inputBg}>` **was** theme-aware, but its `<SelectContent>` had **no className at all**, so it rendered with shadcn's default `bg-popover`/`text-popover-foreground` tokens. Those tokens are driven by a global `.dark` class on an ancestor element — but this app's Coffee Owner shell (confirmed from prior sessions' work on `barista-job-target-button.tsx` in this same codebase) never toggles that class; dark mode here is applied per-component via explicit `isDark`-branched Tailwind classes instead. The result: the dropdown popup always rendered with light-mode colors regardless of the app's actual theme. The sibling pages in this exact task (`barista-page.tsx`, `maintenance-page.tsx`, `marketing-page.tsx`) already solve this correctly via their own `t.selectContent` theme entry; `job-post-form-modal.tsx`'s `t` object simply never had one.

## 2. Files inspected
`barista-page.tsx`, `barista-academy-page.tsx`, `browse-products.tsx`, `maintenance-page.tsx`, `print-page.tsx`, `marketing-page.tsx` (full filter-bar sections of each), `job-post-form-modal.tsx` (full form), `marketplace-layout.tsx` (to trace the global search box / `?q=` origin), `client/src/components/ui/input.tsx` (shadcn `Input`'s base classes, confirming its built-in `w-full`), and the already-established collapsible-search pattern in `client/src/pages/admin/barista-page.tsx` (used as the reference convention, built in an earlier session of this same project).

## 3. Files modified

| File | Change |
|---|---|
| `client/src/pages/cafe/barista/barista-page.tsx` | Filter-bar wrapper → horizontal scroll on mobile; search input → collapsible icon on mobile; `shrink-0` added to every filter control so none get squeezed. |
| `client/src/pages/cafe/barista/barista-academy-page.tsx` | Same, for the Training filter bar. |
| `client/src/pages/cafe/maintenance/maintenance-page.tsx` | Same. |
| `client/src/pages/cafe/marketing/marketing-page.tsx` | Same. |
| `client/src/pages/cafe/browse-products.tsx` | Filter-bar wrapper → horizontal scroll on mobile only (no local search input exists here — see Section 1). |
| `client/src/pages/cafe/print/print-page.tsx` | Same (no local search input here either). |
| `client/src/components/barista/job-post-form-modal.tsx` | Added `selectContent` to the page's existing `t` theme object (same convention as the other pages above); applied it to the "Expérience requise" `SelectContent`. |
| `docs/mobile_filters_darkmode_audit.md` | This report. |

No other file was touched. No filtering logic, state shape, query parameter, API call, experience option, default value, or validation rule changed anywhere.

## 4. Implementation — mobile filter bars (Requirement A)

Applied identically to all six filter-bar wrappers:

```tsx
<div
  className="... flex items-center gap-2 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-x-visible [&::-webkit-scrollbar]:hidden"
  style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
>
```

- Below the `sm:` breakpoint (640px): `flex-nowrap overflow-x-auto` — one horizontally scrollable row, with `WebkitOverflowScrolling: "touch"` for native momentum on iOS, and the scrollbar hidden both in Firefox (`scrollbarWidth: "none"`) and Chrome/Safari (`[&::-webkit-scrollbar]:hidden`) — the same two-part hiding convention already used in this app's Admin pages, combined here for a more complete result than either page's own pre-existing partial convention.
- At `sm:` and above: `sm:flex-wrap sm:overflow-x-visible` — reverts to the **original** wrapping behavior, byte-identical to before this change.
- Every individual control (`SelectTrigger`, the language `DropdownMenuTrigger` button, the Reset button, the search wrapper) got `shrink-0` (and the Reset button also `whitespace-nowrap`) so the row overflows/scrolls instead of squeezing any control below a usable width — satisfying "do not force every filter to shrink to an unusable width" and "avoid wrapping filter labels." The leading `SlidersHorizontal` icon already had `shrink-0` in every page.
- No filter's options, selected value, state variable, or onValueChange handler was touched — confirmed by diffing each edit: only `className` strings changed (plus the new search-related JSX in Section 5, which reuses the existing state).

## 5. Implementation — collapsible mobile search (Requirement B)

Applied identically to the four pages with a real local search input (BARISTA, MAINTENANCE, ACADEMY, MARKETING), mirroring the existing collapsible-search convention already established in `admin/barista-page.tsx` from an earlier session, adapted to each page's own compact pill styling (`h-7 text-xs rounded-full`, theme object `t`) instead of copying that convention's bigger default-Input dimensions verbatim:

```tsx
<div className="relative shrink-0 sm:flex-1 sm:min-w-[180px] sm:max-w-xs">
  {!searchOpen && (
    <button type="button" className={`sm:hidden h-7 w-7 rounded-full border flex items-center justify-center shrink-0 ${t.inputBg}`}
      onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 0); }}
      aria-label="Rechercher" data-testid="button-open-...-search">
      <Search className="w-3.5 h-3.5" />
    </button>
  )}
  <div className={`${searchOpen ? "flex" : "hidden"} sm:flex items-center relative w-44 sm:w-full`}>
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ..." />
    <Input ref={searchInputRef} value={search} onChange={(e) => setSearch(e.target.value)}
      onBlur={() => { if (!search) setSearchOpen(false); }}
      placeholder="..." className={`h-7 text-xs pl-8 rounded-full ${t.inputBg}`} data-testid="input-...-search" />
  </div>
</div>
```

Key properties, each matching a specific task requirement:
- **One single `<Input>` element** (same ref, same `value`/`onChange`, same `data-testid` as before) — not a second parallel implementation; it's just wrapped in conditional display classes (`hidden`/`flex`), so "the same search logic as before" is literally the same code path, not a re-implementation. This directly satisfies "if they share a component... otherwise apply consistent targeted changes" by making the one existing Input itself responsive rather than duplicating it.
- `sm:flex` on the inner wrapper and `sm:hidden` on the icon button mean **desktop behavior is completely unchanged** — above 640px, the input is always rendered exactly as it was before (same classes, same dimensions, same `t.inputBg` styling), and the toggle button never renders at all.
- **Preserves text on collapse**: `onBlur` only auto-collapses the input back to the icon when `search` is empty. If the user has typed something and taps elsewhere, the input stays expanded rather than discarding their query — satisfying "do not silently discard that text" and "prefer keeping the input expanded while it contains a search query."
- **No new API calls**: opening/closing the input is pure local UI state (`searchOpen`); the existing `search`/`onChange`-driven filtering (client-side `useMemo` filters, or query-param-driven `useQuery` in Academy's case) is completely untouched.
- **Accessible label**: the icon button has `aria-label="Rechercher"`.
- **Auto-focus**: `setTimeout(() => ref.current?.focus(), 0)` focuses the input on the same tick it becomes visible (deferred one tick so it isn't still `display: none` when focus is attempted).
- **Enter-key submission**: none of the four pages currently submit search via Enter (all filter live via the `onChange`-bound state) — there was nothing to preserve here, confirmed by reading each page's filtering `useMemo`/`useQuery`.

## 6. Dark-mode fix for "Expérience requise"

```tsx
// job-post-form-modal.tsx's `t` object — added, matching barista-page.tsx's own entry exactly:
selectContent: isDark
  ? "bg-gray-800 border-gray-700 text-gray-100 [&_[data-highlighted]]:bg-gray-700 [&_[data-highlighted]]:text-white"
  : "bg-white border-gray-200 text-gray-900",
```
```tsx
<SelectContent className={t.selectContent}>
  {EXPERIENCE_PRESETS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
  <SelectItem value={EXPERIENCE_CUSTOM}>Personnaliser</SelectItem>
</SelectContent>
```
- Dark mode: dropdown background `bg-gray-800`, border `border-gray-700`, text `text-gray-100` (readable contrast), and keyboard/hover-highlighted items get `bg-gray-700`/`text-white` via the `[&_[data-highlighted]]` arbitrary selector — same values already proven correct on three sibling pages in this exact task.
- Light mode: `bg-white border-gray-200 text-gray-900` — the standard light popover look, unchanged from what shadcn's default would have rendered (so light mode is visually identical to before).
- **Nothing else changed**: `EXPERIENCE_PRESETS`, `EXPERIENCE_CUSTOM`, the `experiencePreset`/`experienceCustomYears` state, the `deriveExperienceState`/submit mapping to `experienceRequired`, and the `SelectTrigger`'s own (already-correct) `t.inputBg` styling are all untouched. Only the popup `SelectContent`'s className was added.
- No other `Select` in this file needed the fix — confirmed by grep, this was the only native shadcn `Select`/`SelectContent` pair in the whole form (Type d'emploi/Niveau d'étude/Langue are chip-button multi-selects using `t.chipOff`/`t.chipOn`, not a `Select` component, and were already correctly themed).

## 7. Responsive and theme verification results

**No browser-automation tool was available in this session** — the following is what was verified by reading the resulting code/CSS precisely, and what still needs an actual rendered check:

- **Verified by code inspection** (high confidence, since these are direct, mechanical consequences of the Tailwind classes applied):
  - Below `sm:` (640px): every filter bar is `flex-nowrap overflow-x-auto` with every child `shrink-0` — the row cannot wrap or compress; it can only scroll. This holds at 375×667, 390×844, 430×932 alike, since the behavior is governed by the `sm:` breakpoint, not a specific pixel width.
  - At `sm:` (640px) and above (768×1024, 1366×768): every filter bar reverts to `flex-wrap` and every search input reverts to its original always-visible state — the exact same JSX/classes as before this change for those breakpoints.
  - No horizontal page overflow is introduced: the scrolling is contained to the filter-bar `<div>` itself (`overflow-x-auto`), not the page body.
  - Filter selections, values, and result counts are untouched — zero logic/state changes, confirmed by diffing every edit (only `className` additions and the search markup restructure, which keeps the same `value`/`onChange`).
- **Not yet verified by an actual rendered browser** (manual follow-up needed): the five specific viewport sizes requested in the task (375×667, 390×844, 430×932, 768×1024, 1366×768), the Search icon's visual appearance/tap-target comfort on a real touch device, the dark-mode "Expérience requise" popup's actual on-screen contrast, and a real toggle of the theme switch mid-session to confirm no flash-of-wrong-theme.

## 8. TypeScript, build, and test results

- `npx tsc --noEmit` — **clean, exit 0**, run after each page's edits and again at the end.
- `npm run build` — **succeeded** (`✓ built in 12.95s`; server bundled to `dist/index.cjs`, 2.0mb; same pre-existing >500kB chunk-size warning as every prior build this session, unrelated to this change).
- No automated test suite exists in this project (confirmed, not assumed — no `test` script in `package.json`).
- `git status` after all edits shows exactly the 7 files listed in Section 3 as modified, plus this report — no unintended file was touched, confirmed directly rather than assumed.

## 9. Remaining limitations / manual verification steps

1. **No browser-automation tool was available** — a human (or a future session with browser tooling) should load each of the six pages at the five requested viewport sizes, confirm the filter bar scrolls smoothly with visible momentum and no visible scrollbar, confirm the last filter in each row is reachable, and confirm desktop (≥768px) looks unchanged.
2. For the four pages with collapsible search (BARISTA, MAINTENANCE, ACADEMY, MARKETING): manually confirm the icon → expanded-input transition on a real mobile viewport/touch device, that focus actually lands in the input, and that typing text then tapping elsewhere keeps the input open (does not snap back to the icon while text is present).
3. For "Expérience requise": manually toggle dark/light mode with the modal open and visually confirm the popup's background/text/highlight colors, since only the resulting CSS classes were verified by reading code, not by rendering them.
4. SHOP and PRINT have no local search input to collapse (Section 1) — if a local, section-specific search box is later added to either page, it should follow the same collapsible pattern documented in Section 5 for consistency.
