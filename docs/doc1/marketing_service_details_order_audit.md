# Marketing Service Details — section order audit

Scope: `client/src/components/marketing/marketing-service-detail-modal.tsx`
(`MarketingServiceDetailModal`), opened from Coffee Owner `/marketing`'s mapped
Services Marketing cards and from the Marketing Store Details page. Visual/order
change only — no content, data, or functionality changed.

## Current section order (before this task)

Inside the modal body (`<div className="p-5 sm:p-6 space-y-5">`):
1. Service identity (title, category/provider-type badges, description, rating/location/distance row)
2. **Détails de l'offre** (conditional on `service.offerDetails?.trim()`)
3. **Prix de départ / Temps de réponse** (2-col grid)
4. **Agence** (clickable section, opens `MarketingDetailModal` via `onOpenAgency`)

## Desired section order

1. Service identity (unchanged)
2. **Agence** (moved up)
3. **Prix de départ / Temps de réponse** (unchanged position relative to Agence, now after it)
4. **Détails de l'offre** (moved to last)

## Components involved

- `MarketingServiceDetailModal` — the only component whose JSX order changed.
- Data: `useMarketingServiceDetail(serviceId)` → `MarketingServiceCard` (fields: `title`, `category`, `agencyProfileType`, `description`, `rating`, `reviewCount`, `agencyLocation`, `distanceKm`, `offerDetails`, `startingPriceInCents`, `responseTime`, `agencyName`, `agencyProfileImageUrl`, `agencyLocation`, `agencyDescription`, `marketingUserId`) — no field changes, purely a render-order change.
- `onOpenAgency` callback — unchanged, still opens `MarketingDetailModal` (agency details) as a sibling modal via the parent page's own state, preserving the existing nested-modal pattern.

## Existing Offer Details storage

`marketingServices.offerDetails` (`shared/schema.ts`), `text`, `notNull().default("")` — unchanged. Rendered only when `service.offerDetails?.trim()` is non-empty (unchanged guard).

## Risks identified and mitigated

- Reordering is pure JSX movement within the same `<div className="space-y-5">` — no state, hooks, or callbacks were touched, so Avis/Signaler/Message/Demander un devis/Favorite/nested Agency-modal behavior are structurally unaffected (confirmed by reading the full diff: only the three blocks — Agence button, Prix/Temps-de-réponse grid, Offer Details block — changed position, nothing inside them changed).
- No change to `MarketingDetailModal`, the public marketplace page, the Store Details page, or any other consumer of this modal.

## Files changed

- `client/src/components/marketing/marketing-service-detail-modal.tsx` (reorder only).

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- Live `curl` against the running dev server confirmed the HMR-updated module renders `button-open-marketing-agency` before `Prix de départ`, which appears before `Détails de l'offre`, matching the desired order.

See `docs/service_details_offer_details_and_desktop_navbar_audit.md` for the full cross-module audit (Academy/Print/Maintenance Détails sections + desktop navbar reorder) this Marketing change was implemented alongside.
