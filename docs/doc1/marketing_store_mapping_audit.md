# Marketing Store Mapping & Store Details Page — Audit

Mirrors the Print Store pattern (`docs/print_store_mapping_audit.md`, `docs/print_store_details_page_audit.md`), adapted to Marketing's real entities (Agency/Store → Marketing Services), not copied from Print's data.

## Current `/marketing` architecture

- `/marketing` maps one card per published **service** (`useMarketingServices`), not per agency — confirmed, `marketing-page.tsx:302-307`.
- `useMarketingProfiles()` (`GET /api/marketing/profiles`) already fetches the agency list, but only for Fast Search/Blacklist and favorites hydration (`marketing-page.tsx:308-321`) — never rendered as a browsable "Store card" UI.
- The agency-level detail endpoint `GET /api/marketing/profile/:userId` (`server/routes.ts:1451-1470`) already merges identity (`storage.getMarketingCard`) **and** `services: MarketingService[]` filtered to `isPublished` (assembled at the route level, `routes.ts:1465`) — already everything a Store page needs, reused as-is by `MarketingDetailModal`/`MarketingServiceDetailModal`'s own "Agence" sections today.

## Espace Marketing → Business → Profil

`client/src/pages/marketing/profile.tsx` already lets the agency edit `description`, `websiteUrl`, `portfolioImages`, `marketplaceVisible`, `isOnVacation`, `weeklyHours` — all via `PATCH /api/marketing/profile`/`PATCH /api/marketing/availability`. Identity (name/logo/cover/phone/location) is edited in Settings, same as every other vertical. **No new fields needed.**

## Classification

| Area | Status |
|---|---|
| Agency identity + services (detail endpoint) | READY — `GET /api/marketing/profile/:userId` already returns both. |
| A "list all visible agencies as Store cards" endpoint | MISSING — `getMarketingProfiles`/`GET /api/marketing/profiles` has no `coverImageUrl`/`flashImageUrl` and no service count, and isn't gated on "has ≥1 published service." Added this task: `getMarketingCompanyCards()` / `GET /api/marketing/companies`. |
| Marketing Services↔Agency relationship | READY — real FK `marketingServices.marketingUserId` (`shared/schema.ts:2498`). |
| Visibility gate | READY, reused verbatim — `users.role==='MARKETING' && status==='approved' && marketplaceVisible && !isFrozen && publicationStatus==='APPROVED'` (`storage.ts:7055-7062`), same gate `getPublishedMarketingServices` already uses. |
| Browsable Store-card UI on `/marketing` | MISSING — added this task. |
| Dedicated Marketing Store page | MISSING — added this task (`/marketing/stores/:agencyId`), reusing the existing detail endpoint/hook — no new per-agency backend. |
| Disponibilité modal for reuse on the Store page | READY, reused — `MarketingAvailabilityModal` (`marketing-detail-modal.tsx`), exported with a one-line change. |
| Service detail modal for reuse | READY, reused — `MarketingServiceDetailModal`, already exported. |

## Files that will change

- `shared/schema.ts` — new `MarketingCompanyListCard` type.
- `server/storage.ts` — new `getMarketingCompanyCards()`.
- `server/routes.ts` — new `GET /api/marketing/companies`.
- `client/src/pages/cafe/marketing/marketing-page.tsx` — new Store-card section; Store card click navigates to the new page (existing "Agence" details-modal path from a Service card is untouched).
- `client/src/pages/cafe/marketing/marketing-store-detail-page.tsx` (new) — the Store page.
- `client/src/components/marketing/marketing-detail-modal.tsx` — `MarketingAvailabilityModal` exported (one line).
- `client/src/App.tsx` — new route `/marketing/stores/:agencyId`.

## Not changed

`/products`, `/stores/:storeId`, Print Store work, `MarketingDetailModal`/`MarketingServiceDetailModal` content, Fast Search, Blacklist, Favorites, Avis, Signaler, Maintenance/Barista/Academy, Supplier Store configuration.

## Validation

- `npx tsc --noEmit`: clean, zero errors.
- `npm run build`: succeeded (2803 modules, confirming both new pages bundled). No new warnings.
- Gating logic sanity-checked against real data (no credentials touched): the one real Marketing agency ("HOOK", id 19) is `approved`/`marketplace_visible=true`/`is_frozen=false`/`publication_status='APPROVED'` with 3 published services — `getMarketingCompanyCards()` would correctly surface it with `serviceCount: 3`. Only one real agency exists in this environment, so cross-store isolation (two different agencies never leaking services into each other) could not be empirically proven with real data the way it was for Print (two real printers) — the query structure (`marketingServices.marketingUserId` as the scoping FK, same as `getMarketingCard`'s own per-agency query) is identical in shape to Print's already-verified isolation.
- **Not performed**: live browser verification.
