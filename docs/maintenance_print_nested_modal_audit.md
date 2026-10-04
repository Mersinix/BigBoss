# Maintenance & Print — Nested Fast Search / Details Modal — Audit

## 1. Root cause — Maintenance

`client/src/pages/cafe/maintenance/maintenance-page.tsx`'s `<MaintenanceFastSearch>` call wired its `onOpenDetail` as:

```tsx
onOpenDetail={(agent) => { setFastSearchOpen(false); openDetail(agent); }}
```

**This explicitly set `fastSearchOpen` to `false` the instant "Info/Détails" was clicked** — not a case of closing Details also closing Fast Search; Fast Search was already closed the moment Details opened. Closing Details afterward had nothing to reopen. Confirmed by tracing every `open`/`onClose`/`onOpenChange` in the file: the two dialogs (`MaintenanceFastSearch`, `AgentDetailModal`) use entirely independent state (`fastSearchOpen` vs. `detailOpen`/`selectedAgent`) — there was no shared state variable and no parent `onOpenChange` coupling them; the bug was this one explicit extra `setFastSearchOpen(false)` call, nothing more subtle.

A secondary, latent issue (not yet triggered, since Fast Search was always closed before Details could open): `AgentDetailModal` was rendered **before** `MaintenanceFastSearch` in the JSX (line 848 vs. 853). Since this project's shared `Dialog`/`DialogContent` (`client/src/components/ui/dialog.tsx`) uses a fixed `z-50` on every instance (not an escalating per-dialog z-index), two simultaneously-open dialogs stack by DOM/mount order, not z-index — so simply removing the premature close without also fixing the mount order risked the *opposite* bug (Fast Search drawing over Details). Confirmed this exact "render Fast Search first so the later-mounted detail dialog stacks above it" pattern is already established and documented in this codebase for Barista's own Coffee Owner page (`client/src/pages/cafe/barista/barista-page.tsx`), so the fix follows that same existing convention rather than inventing a new one.

## 2. Root cause — Print

`client/src/pages/cafe/print/print-page.tsx`'s `<PrintFastSearch>` call had the identical bug:

```tsx
onOpenDetail={(card) => { setFastSearchOpen(false); setPreviewServiceId(card.id); }}
```

Same diagnosis: Fast Search was explicitly closed on Details open, independent state otherwise (`fastSearchOpen` vs. `previewServiceId`/`previewCompanyId`), no shared variable, no `onOpenChange` coupling. Unlike Maintenance, the JSX mount order here was **already correct** — `<PrintFastSearch>` (line 596) already renders before `<PrintServiceDetailModal>`/`<PrintCompanyDetailModal>` (lines 608/614) — so only the premature `setFastSearchOpen(false)` call needed removing; no reordering was necessary.

## 3. Files modified and the reason for each

| File | Change | Reason |
|---|---|---|
| `client/src/pages/cafe/maintenance/maintenance-page.tsx` | (a) Removed `setFastSearchOpen(false)` from `MaintenanceFastSearch`'s `onOpenDetail` callback — now just `onOpenDetail={(agent) => openDetail(agent)}`. (b) Moved the `<MaintenanceFastSearch>` element to the very top of the component's JSX (before the hero `<section>`), so it always mounts before `<AgentDetailModal>` regardless of the `comingSoon` branch. | (a) is the actual bug fix (Section 1). (b) prevents the dialog-stacking regression that removing (a) alone would introduce, matching the existing Barista-page convention. |
| `client/src/pages/cafe/print/print-page.tsx` | Removed `setFastSearchOpen(false)` from `PrintFastSearch`'s `onOpenDetail` callback — now `onOpenDetail={(card) => setPreviewServiceId(card.id)}`. Added a comment noting the existing (already-correct) mount order. | Bug fix (Section 2); no reordering needed since the JSX order was already correct. |
| `docs/maintenance_print_nested_modal_audit.md` | This report. | Required deliverable. |

**Not modified**: `AgentDetailModal`, `PrintServiceDetailModal`, `PrintCompanyDetailModal`, `MaintenanceFastSearch`/`PrintFastSearch` themselves (no component-internal change needed — the bug was entirely in the parent page's wiring), `MaintenanceBlacklistModal`/`PrintBlacklistModal` (untouched, unrelated), any Flash-preview-mode logic from prior tasks, Academy/Marketing Fast Search, Delivery/Driver, and no backend/API/schema file.

## 4. How parent and child dialog state is managed after the fix

- `fastSearchOpen` (Maintenance) / `fastSearchOpen` (Print) is now **only** ever set to `false` by Fast Search's own `onClose` (its own close button, Escape, or outside-click via Radix's `onOpenChange`) — never as a side effect of opening a detail modal.
- `detailOpen`/`selectedAgent` (Maintenance) and `previewServiceId`/`previewCompanyId` (Print) are entirely separate state, changed only by `openDetail(agent)` / `setPreviewServiceId(card.id)` and their own `onClose` handlers — unaffected by Fast Search's open state in either direction.
- Opening Details while Fast Search is open now leaves `fastSearchOpen` at `true` the whole time; closing Details (via its own close control) only clears the details-specific state (`setDetailOpen(false)` / `setPreviewServiceId(null)`), after which Fast Search — never having been touched — is still `open` and renders exactly as it was.
- Explicitly closing Fast Search (its own close button/Escape/outside-click) still calls `setFastSearchOpen(false)` as before, unaffected by this change — it does not clear `selectedAgent`/`previewServiceId`, matching the task's instruction that only the *parent's own* explicit close should be allowed to affect both, and even then only Fast Search's own state actually changes (closing Fast Search does not force-close an already-open Details modal, nor does it need to — Details is a separate dialog the user closes independently).
- Reopening Details for a different provider/item after closing it continues to work unchanged — `openDetail`/`setPreviewServiceId` always set fresh state on each call, with no stale reference risk introduced by this fix (confirmed by reading both call sites — neither was touched beyond the one line removed).

## 5. How search state is preserved

No search/filter/scroll state in either `MaintenanceFastSearch` or `PrintFastSearch` was ever reset by this bug or by this fix — both components manage their own `idx`/`activeCategory`/`activeLocation`/filter-panel state internally via `useState`, which persists for the lifetime of the component instance. Since the fix's entire effect is "stop telling Fast Search to close/unmount when Details opens," Fast Search's component instance (and therefore all of its internal state) now simply **never unmounts** during this interaction — there is nothing further to "preserve" because nothing is destroyed. This is a direct, structural consequence of the fix, not a separate feature that needed building.

## 6. Tests executed and their actual results

No automated test suite exists in this project (confirmed, not assumed — no `test` script in `package.json`).

## 7. TypeScript and build results

- `npx tsc --noEmit` — **clean, exit 0**, run after the Maintenance edit and again after the Print edit.
- `npm run build` — **succeeded** (`✓ built in 24.62s`; server bundled to `dist/index.cjs`, 2.0mb; same pre-existing >500kB chunk-size warning as every prior build in this project, unrelated).
- `git status`/`git diff --stat` after all edits: exactly `client/src/pages/cafe/maintenance/maintenance-page.tsx` (+13/−4 lines) and `client/src/pages/cafe/print/print-page.tsx` (+7/−1 lines) show new changes from this turn; every other file listed by `git status` carries diffs from prior tasks only, confirmed unchanged by this turn.

## 8. Remaining manual browser verification

**No browser-automation tool was available in this session.** The fix is a client-side JSX/callback change with no backend dependency, so it is already live via Vite's dev-time transform — but the following still need an actual rendered check (not performed):
1. Scenario A (open Fast Search → open Details → close Details with its close button → confirm Fast Search is still visible) for both Maintenance and Print.
2. Scenario B (search query/filters/scroll preserved across the round trip) — expected to hold per Section 5's structural reasoning, not independently re-verified by rendering.
3. Scenario C (repeated open/close across different providers/items) — expected to hold since neither `openDetail`/`setPreviewServiceId` nor their `onClose` handlers were changed, not independently re-verified by rendering.
4. Scenario D (explicitly closing Fast Search while Details is open, if that interaction is reachable in the UI) and Scenario E (Escape closes only the topmost dialog, no stuck overlays) — these depend on Radix Dialog's own built-in stacking/escape behavior, which was not modified, but the specific two-dialogs-open-at-once case is new behavior as of this fix and has not been visually confirmed.
5. Scenario F (Academy/Marketing/other account experiences unchanged) — confirmed by `git status` that none of those files were touched in this task.
