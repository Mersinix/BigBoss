---
name: Partial favorites DB persistence
description: How to add DB-backed persistence for one favorites category (e.g. shop) while leaving other categories (print/academy/barista/marketing) as local-only zustand state.
---

When only one category of a multi-category favorites feature needs DB persistence, keep the zustand store's shape unchanged for other categories and add persistence surgically to just the target category's actions:

- Add a dedicated `hydrateX(items)` action to bulk-set that category's slice from server data (used on mount via a `useQuery` + `useEffect`, gated on `enabled: !!user && <access check>`).
- Make the toggle/remove actions for that category optimistically update local state first, then fire-and-forget an `apiRequest` call (`.catch(() => {})`) so a failed network call doesn't block the UI.
- Leave other categories' toggle/remove actions as pure local `set()` calls — do not touch their logic.

**Why:** Avoids a bigger refactor (e.g. migrating the whole store to server state) when only one category's requirements changed, and keeps the blast radius of the change limited to the target category.

**How to apply:** When a task says "only category X needs DB persistence, don't break Y/Z/W", mirror this split — new hydrate/mutate wiring for X only, everything else stays as-is.
