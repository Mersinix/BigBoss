# Flash Preview + Unified Image Selection — All Professional Accounts — Audit

## 1. Initial implementation findings

### Baseline: what Barista Marketplace already has
`client/src/pages/barista-marketplace/profile.tsx`'s "Flash" button opens `<BaristaFastSearch previewMode baristas={[data.card]} onOpenDetail={...} />` (built in the immediately-preceding task in this project). `BaristaFastSearch` is a Coffee-Owner-only swipeable discovery component (favorite, info, "associate with a manual job post") that browses `baristas: BaristaMarketplaceCard[]` — i.e., it browses **provider profiles**. Feeding it a one-item array (the barista's own card) works because a barista card *is* exactly the kind of record this component already knows how to render (skills, rating, availability, Flash/photo hero image).

### The six target accounts do not all share that shape — this is the key audit finding
Each of the five other professional-account types that have their own Coffee-Owner-facing "Fast Search" component browses a **different kind of record**, not a provider profile:

| Account | Existing Coffee-Owner Fast Search? | What it browses |
|---|---|---|
| Barista Marketplace | `BaristaFastSearch` | `BaristaMarketplaceCard[]` — **provider profiles** |
| Maintenance | `MaintenanceFastSearch` | `MaintenanceMarketplaceCard[]` — **provider profiles** |
| Barista Academy | `AcademyFastSearch` | `AcademyCourseCard[]` — **individual courses** (an academy can have many) |
| Marketing | `MarketingFastSearch` | `MarketingServiceCard[]` — **individual published services** (an agency can offer several) |
| Imprimerie (Print) | `PrintFastSearch` | `PrintCatalogCard[]` — **individual catalog/product listings** |
| Livraison (Delivery Company) | — none exists — | n/a |
| Chauffeur (Driver) | — none exists — | n/a |

Confirmed by reading each component's props in full (`academy-fast-search.tsx`, `marketing-fast-search.tsx`, `print-fast-search.tsx`) and by grepping the whole `client/src/components` tree for `*-fast-search*` and `client/src/components/{delivery,driver}` for any equivalent — none exists for Delivery or Driver. Further confirmed via `marketplace-layout.tsx`'s own service list (`RESERVATION_SERVICE_TABS`, the Coffee Owner's top-nav service icons): Delivery Company and Driver are **not even present** as a Coffee-Owner-facing service at all — they are Supplier-managed fleet entities (`supplier-driver-fleet-modal.tsx`, `driver-roster-view.tsx`), with their own detail modals used only by the Supplier, by Admin, and by the account itself — never by a Coffee Owner browsing a marketplace. There is no "swipe through other delivery companies/drivers" feature anywhere in this codebase to extend.

**Consequence**: literally feeding `AcademyFastSearch`/`MarketingFastSearch`/`PrintFastSearch` a one-item array containing "my own record" would not demonstrate "my own Flash/photo image" at all — their hero image is a **course image**, a **service listing's own image**, or a **catalog product photo**, never the professional's own Flash(URL)/profile-photo fields. And for Delivery/Driver, there is no existing Fast-Search-shaped component to extend in the first place.

### Resolution, following the task's own escape valve
Section 3 of the task explicitly anticipates this: *"If some account types cannot access the same underlying search data, use the existing permitted data and display a clear empty state where necessary"* and *"Do not introduce different Flash designs for different accounts unless a genuine technical limitation requires it."* Given four of the five existing per-account Fast Search components cannot represent "the professional's own profile" at all, and two accounts have no such component to begin with, extending five different pre-existing components in five different bespoke ways (plus building two more from scratch) would itself be "six separate copies of the same feature" — exactly what the task asks to avoid.

**Decision**: built **one** new, genuinely shared component — `FlashSearchPreviewModal` (Section 6) — reusing `BaristaFastSearch`'s preview-mode visual chrome (Zap header, "Aperçu Flash" label, amber "Mode aperçu" badge, Flash→photo→placeholder hero image) in a generalized form that needs only `name`/`flashImageUrl`/`profileImageUrl`/`typeLabel` — fields every account's own Settings already exposes identically. This is used by all six target accounts. Barista Marketplace's own wiring is **not** touched — it keeps using `BaristaFastSearch` directly, per the task's explicit "do not regress" instruction for that account.

## 2. Files inspected
`client/src/pages/barista-marketplace/profile.tsx`, `business.tsx`, `client/src/pages/cafe/barista/barista-page.tsx`, `barista-fast-search.tsx`, `flash-preview-modal.tsx`, `client/src/lib/avatar.ts` (the shared `getPreferredImageUrl`/`getAvatarUrl`/`normalizeImageUrl` utilities from the prior `flash_image_sync_audit.md` task); `academy-fast-search.tsx`, `maintenance-fast-search.tsx`, `marketing-fast-search.tsx`, `print-fast-search.tsx` (full reads, to establish their data shapes); `marketplace-layout.tsx` (service-list/`RESERVATION_SERVICE_TABS`, to confirm Delivery/Driver have no Coffee-Owner marketplace presence); and all six target accounts' own profile pages (`client/src/pages/driver/profile.tsx`, `delivery/profile.tsx`, `maintenance/profile.tsx`, `marketing/profile.tsx`, `printer/profile.tsx`, `barista-academy/profile.tsx`) — specifically each one's existing `FlashPreviewModal` call site, to capture its exact `name`/`flashImageUrl`/`profileImageUrl`/`typeLabel`/`accentBgClass` expressions. Also `server/routes.ts`'s `GET /api/maintenance/profile/:userId` (read as a representative sample of the six accounts' own self-profile route) to confirm the self/admin branch returns the **raw user row** (`user: target`), which always carries `flashImageUrl`/`profileImageUrl` as plain columns — unlike the earlier-discovered bug in the *public list* builder (`getBaristaMarketplaceProfiles`, fixed in `flash_image_sync_audit.md`), there is no equivalent gap possible on this self-view path for any of the six accounts, since none of them hand-map a reduced object for the self/admin case.

## 3. Root cause of the difference between accounts
Not a bug — a genuine architectural difference. Barista Marketplace and Maintenance are "provider discovery" marketplaces (Coffee Owner browses individual professionals). Academy, Marketing, and Print are "listing discovery" marketplaces (Coffee Owner browses courses/services/products, which may belong to a provider but are not the provider's profile itself). Delivery and Driver are not Coffee-Owner marketplaces at all. Each account's own Fast Search component was correctly built for what it actually browses — there was never a shared "provider card" abstraction to generalize from in the first place for four of the six target accounts.

## 4. Files modified

| File | Change |
|---|---|
| `client/src/components/account/flash-search-preview-modal.tsx` | **New.** The one shared "Aperçu Flash" preview component used by all six target accounts (Section 6). |
| `client/src/pages/driver/profile.tsx` | Flash button now opens `FlashSearchPreviewModal` instead of `FlashPreviewModal`, same data (`user?.name`, `data?.flashImageUrl ?? user?.flashImageUrl`, `user?.profileImageUrl`, `typeLabel="Chauffeur"`, `accentBgClass="bg-blue-600"`). |
| `client/src/pages/delivery/profile.tsx` | Same, `typeLabel="Livraison"`, `accentBgClass="bg-teal-600"`, data from `data?.user?.*`. |
| `client/src/pages/maintenance/profile.tsx` | Same, `typeLabel="Maintenance"`, `accentBgClass="bg-orange-500"`, data from `profileData?.user?.*`. |
| `client/src/pages/marketing/profile.tsx` | Same, `typeLabel="Marketing"`, `accentBgClass="bg-purple-600"`, data from `data?.user?.*`. |
| `client/src/pages/printer/profile.tsx` | Same, `typeLabel="Imprimerie"`, `accentBgClass="bg-blue-600"`, data from `data?.user?.* ?? data?.card?.*`. |
| `client/src/pages/barista-academy/profile.tsx` | Same, `typeLabel="Académie"`, `accentBgClass="bg-indigo-600"`, data from `data?.user?.*`. |
| `docs/flash_all_accounts_audit.md` | This report. |

**Not modified** (deliberately): `client/src/pages/barista-marketplace/profile.tsx`, `barista-fast-search.tsx`, `client/src/pages/cafe/barista/barista-page.tsx` (Coffee Owner's real Fast Search), every `*-fast-search.tsx` for the other five account types, every `*-detail-modal.tsx` (the Coffee-Owner-facing "view this provider's Flash image" destination, which is a different, already-correct use of the original `FlashPreviewModal` with `preview` unset — e.g. `maintenance-page.tsx:647`'s own `<FlashPreviewModal ... />` call, confirmed still present and untouched), and `flash-preview-modal.tsx` itself (still used by all of the above, and still the correct component for those contexts).

## 5. Implementation details per account
All six follow the identical pattern — only the per-account `name`/`flashImageUrl`/`profileImageUrl`/`typeLabel`/`accentBgClass` expressions differ (each copied verbatim from that account's own pre-existing `FlashPreviewModal` call, so the *data source* is unchanged — only the *component rendering it* changed):

```tsx
// before
<FlashPreviewModal open={flashPreviewOpen} onClose={...} name={...} typeLabel="..." flashImageUrl={...} profileImageUrl={...} accentBgClass="..." preview />

// after
<FlashSearchPreviewModal open={flashPreviewOpen} onClose={...} name={...} typeLabel="..." flashImageUrl={...} profileImageUrl={...} accentBgClass="..." />
```

No account's Flash button, its `flashPreviewOpen` state, its onClick handler, or its data-fetching query was touched — only the modal component it renders.

## 6. Shared preview-mode component and image-selection logic

`FlashSearchPreviewModal` (new, `client/src/components/account/flash-search-preview-modal.tsx`):
- Visual structure copied from `BaristaFastSearch`'s own `previewMode` branch: `Dialog`/`DialogContent` sized `w-[92vw] max-w-lg h-[90vh] rounded-3xl bg-black` (same as Barista's), a header with the `Zap` icon + **"Aperçu Flash"** text (literal, matching the task's requested label) and a close button, and the same amber **"Mode aperçu — Aperçu Flash"** pill badge (`Eye` icon) directly below it.
- Hero image: `getPreferredImageUrl(flashImageUrl, profileImageUrl)` — the exact shared function from `client/src/lib/avatar.ts` introduced in `flash_image_sync_audit.md`, already used by `BaristaFastSearch` and `FlashPreviewModal`. On load failure (`AvatarImage`'s `onLoadingStatusChange`), falls back to `getAvatarUrl({ profileImageUrl })` exactly once (`flashFailed` boolean, reset whenever `flashImageUrl`/`profileImageUrl` change) — same one-retry-then-stop pattern as `BaristaFastSearch`, no loop possible. Below that, Radix's own `AvatarFallback` (initials) covers a photo that's also broken — the same three-tier chain (Flash → photo → initials) as Barista's.
- Bottom overlay: the account's `name` and (if provided) a `typeLabel` pill in the account's own `accentBgClass` — e.g. "Maintenance", "Livraison", "Chauffeur" — matching each account's existing `FlashPreviewModal` labels exactly, so nothing about *what* is displayed changed, only the surrounding chrome.
- **No favorite/info/job-target controls, no filter, no prev/next** — unlike `BaristaFastSearch`'s preview mode, there is nothing here that could ever apply to "your own single record," so there is nothing to disable: the component has zero interactive elements besides its own close button, and makes zero network requests of its own (all data arrives via props, already fetched by the host page's existing query).

## 7. How persistent mutations are prevented in preview mode
Trivially, by construction: `FlashSearchPreviewModal` contains no mutation-capable code path at all — no `useMutation`, no `fetch`/`apiRequest` call, no reference to `useFavorites` or any job/application/booking hook. It renders `name`/image props and a close button. There is nothing to "disable," because nothing exists to perform a persistent operation in the first place — a stronger guarantee than a `previewMode`-gated disable, since there's no code path to gate. This satisfies every bullet in Section 3 ("Preview-only restrictions") by the component having no capability to violate any of them.

## 8. Confirmation that Coffee Owner / Barista Marketplace behavior is preserved
- `client/src/pages/cafe/barista/barista-page.tsx` (Coffee Owner's real Fast Search) — **not in this diff at all** (confirmed via `git status`).
- `client/src/pages/barista-marketplace/profile.tsx` — **not in this diff at all**; its Flash button still opens `BaristaFastSearch` with `previewMode` exactly as the prior task left it.
- The other five accounts' own Coffee-Owner-facing Fast Search components (`AcademyFastSearch`, `MaintenanceFastSearch`, `MarketingFastSearch`, `PrintFastSearch`) and every `*-detail-modal.tsx`'s own `FlashPreviewModal` destination — **not in this diff**; confirmed by `grep -rl "FlashPreviewModal"` still listing all of them unchanged.
- `npx tsc --noEmit` passing with these files untouched is additional, mechanical confirmation that nothing about their types/exports was perturbed by the new component or the six edited files.

## 9. TypeScript, build, and test results
- `npx tsc --noEmit` — **clean, exit 0**, run after creating the new component and again after all six page edits.
- `npm run build` — **succeeded** (`✓ built in 25.34s`; server bundled to `dist/index.cjs`, 2.0mb; same pre-existing >500kB chunk-size warning as every prior build in this project, unrelated).
- No automated test suite exists in this project (confirmed, not assumed — no `test` script in `package.json`).
- **Code-inspection verification** (not a live browser round-trip — see Section 10): read `GET /api/maintenance/profile/:userId` as a representative sample of the six accounts' self-profile routes and confirmed the self/admin branch returns the raw `user` row (always carrying `flashImageUrl`/`profileImageUrl` as plain columns, never a hand-mapped object that could omit one) — so Feature B's "use the authenticated user's own Flash/photo" requirement is satisfied by the existing data layer for all six accounts without any backend change, consistent with the task's "do not add database fields/endpoints unless strictly necessary."
- `git status` after all edits shows exactly the 6 profile pages + 1 new component file changed — no unintended file touched, confirmed directly.

## 10. Remaining limitations / manual verification steps
1. **No browser-automation tool was available in this session.** The following need an actual rendered check: opening each of the six accounts' Flash button and confirming the "Aperçu Flash" label/badge render, that the hero image matches whichever of Flash/photo is actually configured for that seeded test account, and that closing the modal returns cleanly to the profile page with no state loss.
2. **Broken-image fallback** (Flash URL points to a 404/unreachable image → falls back to profile photo → if that's also broken, falls to initials) was verified by reading the code path (identical to `BaristaFastSearch`'s already-reasoned-through behavior), not by actually breaking a URL and watching it render.
3. **Desktop vs. mobile sizing**: the component reuses `BaristaFastSearch`'s exact Dialog classes (`w-[92vw] max-w-lg h-[90vh]`), which that component already renders correctly at both sizes (established in an earlier task) — not independently re-measured here.
4. If a future task gives Delivery Company or Driver an actual Coffee-Owner-facing discovery feature, that new feature's own "browse other providers" Fast Search (if built) would be a *different* component from this self-preview one, following the same reasoning as Maintenance/Barista today — this audit's scope was the self-preview only, since no such discovery feature exists for these two accounts today.
