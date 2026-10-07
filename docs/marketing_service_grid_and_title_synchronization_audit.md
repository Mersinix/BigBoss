# Marketing Service Grid & Title Synchronization — Audit

## A. Existing implementation (audited before any change)

- **Marketing service storage/model**: `marketingServices` table (`shared/schema.ts`) — `id`, `marketingUserId`, `category` (from the admin-managed taxonomy), `startingPriceInCents`, `responseTime`, `description`, `imageUrl`, `isPublished`. **No title field existed.**
- **Create/update routes**: `POST /api/marketing/services`, `PATCH /api/marketing/services/:id` (`server/routes.ts`) — both validated by one shared `marketingServiceInputSchema` zod object, then passed through `storage.createMarketingService`/`updateMarketingService` (`server/storage.ts`), both of which do a generic `{...safeData}` spread into the DB row — no per-field allowlist to update when adding a new field.
- **Nouveau service / Modifier le service**: one shared `ServiceFormDialog` in `client/src/pages/marketing/services.tsx` (the Marketing professional's own "Business → Services" page) — form had Catégorie, Prix de départ, Temps de réponse, Description, Image URL. No Title field.
- **Card/title representations found across the codebase** (all previously showed `category` as the primary heading):
  1. `client/src/pages/marketing/services.tsx` — the professional's own service-card list (`<h3>{service.category}</h3>`).
  2. `client/src/pages/cafe/marketing/marketing-page.tsx` — Coffee Owner `/marketing` mapped service cards (via the shared `MarketingMappedServiceCard`, built in the previous task, whose `category` prop doubled as both the H3 title and the category badge).
  3. `client/src/pages/cafe/marketing/marketing-store-detail-page.tsx` — same shared card, same double-use of `category`.
  4. `client/src/components/marketing/marketing-service-detail-modal.tsx` — the click-through Service Details modal (`<h2>{service.category}</h2>`), opened from every mapped card on both pages plus the agency's own "Aperçu".
  5. `client/src/components/marketing/marketing-fast-search.tsx` — Fast Search swipe card (`<h2>{current.category}</h2>`).
- **Grid columns**: `/marketing`'s service grid was `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (3 columns at `lg`); `/marketing/stores/:storeId`'s was already `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4` (4 columns at `lg`, set in the previous task). Both use the exact same `MarketingMappedServiceCard` component — the only difference was the grid's own column classes.

## B. Grid change
`/marketing`'s service grid (both the loading skeleton and the real grid) changed from `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` to `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4` — now byte-for-byte the same breakpoint set as `/marketing/stores/:storeId`. `/marketing/stores/:storeId` itself was not touched (already correct, used as the reference). Mobile still renders 1 column, tablet 2-3, only desktop (`lg:`) reaches 4 — no column count was forced onto small screens.

## C. Title field — where it was added
- **Schema**: `marketingServices.title` — `text("title").notNull().default("")` (`shared/schema.ts`). Additive column, safe default, no destructive migration; pushed via `drizzle-kit push` and verified with `psql` that all 4 existing rows received `''` (empty string), not a fabricated value.
- **API validation**: `title: z.string().max(160).optional()` added to the one shared `marketingServiceInputSchema` used by both create and update routes.
- **Storage**: no change needed — `createMarketingService`/`updateMarketingService` already spread `data` generically into the insert/update, so `title` flows through automatically once present in the request body.
- **Client type**: `MarketingService` (`client/src/hooks/use-marketing.ts`) gained `title: string` (and `MarketingServiceCard`, which extends it, inherits it automatically).
- **Form**: `ServiceFormDialog` (`client/src/pages/marketing/services.tsx`) gained a "Titre" input, placed above "Catégorie" — loaded on edit (`service.title ?? ""`), required on save (new `"Titre requis"` validation, mirroring the existing `"Catégorie requise"` pattern exactly), included in the create/update payload.

## D. Persistence — Create → Database → API → Marketplace → Store Details
`Nouveau service` (title entered) → `POST /api/marketing/services` (zod-validated) → `storage.createMarketingService` (generic spread, real DB insert) → `marketingServices.title` column → every read path (`getMarketingServicesForProvider`, `getPublishedMarketingServices`, `getMarketingServiceCard`) spreads the raw row, so `title` reaches: the professional's own service list, Coffee Owner `/marketing`, `/marketing/stores/:storeId`, the Service Details modal, and Fast Search — identically, with no second/duplicated representation anywhere.

## E. Card display — Title / Description / Category now independent
- **Title** = `service.title?.trim() || service.category` (fallback only for services created before this change, which have `title === ""`) — now the card's H3/H2 heading everywhere it previously showed `category`.
- **Description** = `service.description` — untouched.
- **Category** = `service.category` (real, from the admin taxonomy) — untouched as a concept, and **kept visible** everywhere it used to be the (only) heading, by adding a small explicit category badge/text alongside the new title in each of the 5 locations identified in Section A, so no location lost category visibility:
  - Professional's own list: new `Badge` next to responseTime.
  - Coffee Owner `/marketing` + Store Details mapped cards: unchanged — the bottom-right image badge (added in the previous task) already showed category independently of the H3, so simply repointing the H3 to `title` was sufficient there.
  - Service Details modal: new small `Badge` next to the existing agency-profile-type badge.
  - Fast Search: new small pill next to the availability/rating pills.
- **Category icon** = unchanged, still resolved via the one shared `resolveMarketingCategoryIcon()` (`client/src/lib/marketing-category-icon.ts`) added in the previous task.
- **Category filters/navigation/statistics** (the `Tout/Ads/Branding/Photo` strip on both `/marketing` and Store Details) were not touched — they still filter by the real `category` field exactly as before.

## F. Backward compatibility
No existing service was deleted, migrated destructively, or had its id/category/price/description/images/favorites/reviews/availability touched. Services created before this change simply have `title = ""`; every display site falls back to the existing `category` value in that case, so they render exactly as they did before this change (no blank title, no fabricated text).

## G. Validation
- `npx tsc --noEmit`: clean.
- `npm run build`: clean (client + server).
- SQL sanity check (`psql`): confirmed `marketing_services.title` column exists, is `NOT NULL DEFAULT ''`, and all 4 existing rows have `title = ''` with their original `category` intact.
- Runtime/browser (create service / edit service / marketplace sync / responsive / light-dark): **not performed** — no running dev/admin session available in this environment, consistent with every prior task this session.

## H. Files changed
- `shared/schema.ts`
- `server/routes.ts`
- `client/src/hooks/use-marketing.ts`
- `client/src/pages/marketing/services.tsx`
- `client/src/pages/cafe/marketing/marketing-page.tsx`
- `client/src/pages/cafe/marketing/marketing-store-detail-page.tsx`
- `client/src/components/marketing/marketing-mapped-service-card.tsx`
- `client/src/components/marketing/marketing-service-detail-modal.tsx`
- `client/src/components/marketing/marketing-fast-search.tsx`
- `docs/marketing_service_grid_and_title_synchronization_audit.md` (this file)

## I. Regression check
- No other marketplace module (Print, Academy, Maintenance, Barista, Supplier Stores) was touched.
- `storage.createMarketingService`/`updateMarketingService`'s generic spread meant zero logic changes were needed in `server/storage.ts` itself.
- Category filtering, category icon resolution, Avis/Signaler/Disponibilité modals, the agency Details-modal path, and favorites logic were not modified — only the heading each component already rendered was repointed, with category re-added alongside it where it would otherwise have disappeared.
