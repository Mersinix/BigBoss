# Service Card Reorder & Detail Modal Visual Consistency — Audit

## Part 1 — Root cause of the 400 "Invalid account data" on bulk-order

**Confirmed by direct code inspection (not assumed) for ALL FIVE services**, not just Maintenance and Print.

Express matches routes in registration order. In `server/routes.ts`, for every one of the five services, the route:

```
PATCH /api/admin/{service}/accounts/:userId
```

was registered **before**:

```
PATCH /api/admin/{service}/accounts/bulk-order
```

Both paths have the exact same shape (`/api/admin/{service}/accounts/<segment>`), so a request to `.../accounts/bulk-order` matches the earlier `:userId` route first, with `req.params.userId === "bulk-order"`. Inside that handler: `Number("bulk-order")` → `NaN`, then `storage.getUser(NaN)` → `db.select().from(users).where(eq(users.id, NaN))` throws (invalid integer binding), which is caught by that route's generic catch block → `res.status(400).json({ message: "Invalid account data" })`. The real `bulk-order` handler (registered later, never reached) was never buggy — it was simply unreachable.

Confirmed registration order (before fix):

| Service | `:userId` edit route line | `bulk-order` route line |
|---|---|---|
| Print | 2501 | 2557 |
| Maintenance | 2657 | 2721 |
| Marketing | 2830 | 2889 |
| Barista | 4146 | 4204 |
| Academy | 4730 | 4785 |

**Fix**: move each `bulk-order` route registration to before its corresponding `:userId` edit route (pure reordering, no logic/behavior change to either handler). The `auto-approve` routes (`/accounts/:userId/auto-approve`, 6 path segments) are NOT affected — they never collided with the 5-segment `:userId` route.

## Part 2 — Coffee Owner order synchronization

Once the bulk-order route is actually reachable, the rest of the chain was already correct from the previous task:
- `storage.bulkUpdate{Printer,Maintenance,Marketing,Barista,Academy}Order()` persists `displayOrder` per account/profile row — confirmed correct, untouched.
- `get{Print,Marketing,Academy}CompanyCards()` / `getMaintenanceProfiles()` / `getBaristaMarketplaceProfiles()` all sort by `displayOrder` — confirmed correct, untouched.
- Each Admin page's `bulkOrderMutation.onSuccess` already invalidates the matching Coffee Owner query key (`/api/print/companies`, `/api/academy/companies`, `/api/marketing/companies`, `/api/maintenance/profiles`, `/api/barista/profiles`) — confirmed correct, untouched.

So the **only** break in the Admin→DB→Coffee-Owner chain was the unreachable route; no other part needed changing.

## Part 3 — Detail modal visual consistency

**Existing Preview Detail modal (source of truth)**: `PrintCompanyDetailModal` (and its siblings `AcademyProfileModal`, `MarketingDetailModal`, `AgentDetailModal`, `BaristaDetailModal`) — the exact modal each Admin page's own "Aperçu marketplace" Eye button already opens in `readOnly` mode. Its header pattern:
- Full-bleed cover: `w-full h-56 sm:h-72 relative shrink-0 rounded-t-2xl overflow-hidden`, image `object-cover`, gradient+icon Avatar fallback when no cover.
- Close + Preview-style action buttons float **on top of the cover**, top-right, as `w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform`, icon `w-4 h-4 text-white`.
- `DialogContent` uses `p-0 [&>button]:hidden` (suppresses the default Radix close button) with content padded in an inner `<div className="p-5 sm:p-6">`.

**Current Admin Detail modals** (`PrinterAccountDetail`, Maintenance `AccountDetail`, Marketing `AccountDetail`, `AcademyDetail`, `BaristaDetail`): all use the **default shadcn Dialog close button** (flat gray X, `absolute right-4 top-4`, no background) and a separate plain `ghost` Eye icon button (`absolute right-12 top-4`) — neither matches the Preview Detail modal's floating black/40-backdrop circular buttons. Each already renders a flat `<img className="w-full h-36 object-cover rounded-xl">` cover strip (added in a prior task) that is NOT a hero container (no relative positioning, no buttons on top, smaller height, not full-bleed/rounded-top-only).

**Fix**: restructure only the header region of all five Admin Detail modals — `DialogContent` → `p-0 [&>button]:hidden`, cover becomes a `h-56 sm:h-72 relative` hero container (gradient+module-icon fallback when no cover image, matching each module's own accent color), with the close and preview buttons moved onto it in the exact Preview Detail style. All existing body content (info rows, edit form, publication/Auto-Approve/Freeze/Delete actions) is wrapped in a padded div immediately below, completely unchanged.

## Part 4 — Auto Approve regression check
Not touched by either fix (route-order fix only reorders unrelated handlers; modal header fix only touches the cover/close/preview JSX, never the Auto Approve `Switch`/mutation block added in the previous task, which stays below the new header, in the same `grid` as before).

## Status after fix
- ✅ All 5 bulk-order routes reachable and functioning.
- ✅ Admin reorder → DB → Coffee Owner sync confirmed intact for all 5 services.
- ✅ All 5 Detail modal headers synchronized to the Preview Detail modal's close/preview/cover visual language.
- ✅ No Store entities introduced for Maintenance/Barista (unchanged from previous task).
- ✅ `npx tsc --noEmit` / `npm run build` clean.
