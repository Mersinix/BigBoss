---
name: Global quick-view modal pattern
description: How product/detail quick-view modals are wired app-wide when multiple unrelated components need to trigger the same modal
---

When a "quick view" or similar modal must be openable from many unrelated places (product cards on different pages, favorites panel, etc.), use a tiny global zustand store (`{ id, open(id), close() }`) instead of prop-drilling or per-page local state.

Render exactly one instance of the modal at the shared layout level (e.g. the layout wrapping all routes that need it), reading state from the store directly. Any child component anywhere under that layout can trigger it by calling the store's `open()` — no props needed.

**Why:** Product Details was originally a standalone routed page. Migrating to a "Quick View" modal required opening it from the marketplace grid, supplier store pages, and the favorites panel (which lives in the shared layout, not a page). A single global store + single modal instance avoided duplicating modal state/markup per page and kept the old route as a simple redirect for backward compatibility.

**How to apply:** Reuse this pattern (store file like `use-quick-view.ts` + single modal mounted in the shared layout) any time a modal needs multi-entry-point triggering across sibling pages/components that don't share a natural parent close to the trigger.
