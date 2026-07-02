---
name: Global service visibility gating
description: Pattern for admin-controlled Visible/Hidden/ComingSoon state per service, enforced across all surfaces
---

When a marketplace has multiple optional service lines (e.g. printing, marketing, barista) that admins can globally toggle between Visible / Hidden / Coming Soon, the state must be enforced independently at every surface that can leak it — a single shared source of truth (one API endpoint backing a query hook) is not enough; each consumer must actually apply the filter:

- Nav/landing/footer link lists — HIDDEN must be removed entirely (no disabled/placeholder state anywhere); COMING_SOON must stay visible/clickable in every nav list (header strip, favorites, chat panel, landing icons), just badged.
- Role-selection lists in signup/register flows — HIDDEN and COMING_SOON must both be excluded (users should never be able to register into a role tied to an unavailable service, not just hidden ones).
- Route-level gating — wrap the actual page component so HIDDEN renders the 404 page. For COMING_SOON, do NOT redirect to a separate full-page coming-soon route — pass a `comingSoon` prop into the real page component so its Hero section still renders as-is, and everything below the Hero is swapped for an inline "coming soon" block within the same layout (matches the requirement that the tab still opens the real page, not a stub).
- Realtime sync — invalidate the shared query on the relevant WebSocket event so all open tabs update immediately when an admin flips a toggle.

**Why:** it's easy to filter the marketing pages but forget the register-role list or direct URL access, leaving a backdoor into a "hidden" service. A separate full-page coming-soon redirect also fails a stricter spec requirement that the real route/hero must still render.

**How to apply:** build one small hook exposing the state map, then thread it through every list/route that mentions the service. Gate routes at the component prop level (`comingSoon` prop hides page content below the hero) rather than at the router level, so HIDDEN vs COMING_SOON get materially different treatment (full removal vs in-place partial content).
