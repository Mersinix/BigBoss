# Academy Store Mapping & Store Details Page — Audit

Mirrors the Print Store pattern, adapted to Academy's real entities (Academy/Store → Formations/Courses), not copied from Print's data.

## Current `/academy` architecture

- `/academy` maps one card per **course/formation** (`useAcademyCourses`), not per academy — confirmed, `barista-academy-page.tsx:355-361`.
- No separate academy-identity list exists today — the only "organisation" concept is a favorites id list (`GET /api/academy-favorites/organisations`, ids only), with display data derived from fields already embedded on course cards.
- The academy-level detail endpoint `GET /api/academy/profile/:userId` (`server/routes.ts:4193-4210`) → `storage.getAcademyProfileCard()` already returns identity **and** `courses: AcademyCourseCard[]` (filtered to `isPublished`) **and** `upcomingSessions` — already everything a Store page needs, reused as-is by `AcademyProfileModal` today.

## Espace Barista Academy → Business → Profil

`client/src/pages/barista-academy/profile.tsx` already lets the academy edit `description`, `portfolioImages`, `marketplaceVisible`, `isOnVacation`, `weeklyHours` via `PATCH /api/academy/profile`. `academyProfiles` has no `websiteUrl` column (the one real difference from `printerProfiles`/`marketingProfiles`) — the new Store card/page simply omits a website field rather than inventing one. Identity (name/logo/cover/phone/location) is edited in Settings, same as every other vertical. **No new fields needed.**

## Classification

| Area | Status |
|---|---|
| Academy identity + courses (detail endpoint) | READY — `GET /api/academy/profile/:userId` already returns both. |
| A "list all visible academies as Store cards" endpoint | MISSING — added this task: `getAcademyCompanyCards()` / `GET /api/academy/companies`. |
| Courses↔Academy relationship | READY — real FK `academyCourses.academyUserId`. |
| Visibility gate | READY, reused — `isPublished && users.role==='BARISTA_ACADEMY' && status==='approved' && profile.marketplaceVisible!==false && publicationStatus==='APPROVED'` (`storage.ts:9728-9736`), same gate `getPublishedAcademyCourses` already uses. |
| Browsable Store-card UI on `/academy` | MISSING — added this task. |
| Dedicated Academy Store page | MISSING — added this task (`/academy/stores/:academyUserId`), reusing the existing detail endpoint/hook — no new per-academy backend. |
| Reusable modal/detail pieces | READY, reused — `AcademyDetailModal` (course detail) already exported; Academy's own profile-level hours/info presentation reused where applicable. |

## Files that will change

- `shared/schema.ts` — new `AcademyCompanyListCard` type (no `websiteUrl`, unlike Print/Marketing).
- `server/storage.ts` — new `getAcademyCompanyCards()`.
- `server/routes.ts` — new `GET /api/academy/companies`.
- `client/src/pages/cafe/barista/barista-academy-page.tsx` — new Store-card section; Store card click navigates to the new page (existing per-course `AcademyDetailModal` path is untouched).
- `client/src/pages/cafe/barista/academy-store-detail-page.tsx` (new) — the Store page.
- `client/src/App.tsx` — new route `/academy/stores/:academyUserId`.

## Not changed

`/products`, `/stores/:storeId`, Print Store work, Marketing Store work, `AcademyDetailModal`/`AcademyProfileModal` content, Fast Search, Blacklist, Favorites, Avis, Signaler, Maintenance/Barista/Print, Supplier Store configuration.

## Validation

- `npx tsc --noEmit`: clean, zero errors.
- `npm run build`: succeeded (2803 modules, confirming both new pages bundled). No new warnings.
- Gating logic sanity-checked against real data (no credentials touched): the one real Academy ("Formation Tunisie", id 55) is `approved`/`marketplace_visible=true`/`is_frozen=false`/`publication_status='APPROVED'` with 3 published courses — `getAcademyCompanyCards()` would correctly surface it with `courseCount: 3`. Only one real academy exists in this environment, so cross-store isolation could not be empirically proven with two real records the way it was for Print — the query structure (`academyCourses.academyUserId` as the scoping FK, same as `getAcademyProfileCard`'s own per-academy query) is identical in shape to Print's already-verified isolation.
- **Not performed**: live browser verification.
