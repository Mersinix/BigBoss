---
name: Global service visibility gating
description: Pattern for admin-controlled Visible/Hidden/ComingSoon state per service, enforced across all surfaces
---

When a marketplace has multiple optional service lines (e.g. printing, marketing, barista) that admins can globally toggle between Visible / Hidden / Coming Soon, the state must be enforced independently at every surface that can leak it — a single shared source of truth (one API endpoint backing a query hook) is not enough; each consumer must actually apply the filter:

- Nav/landing/footer link lists — filter out HIDDEN, badge COMING_SOON.
- Role-selection lists in signup/register flows — HIDDEN and COMING_SOON must both be excluded (users should never be able to register into a role tied to an unavailable service, not just hidden ones).
- Route-level gating — wrap the actual page component so HIDDEN renders the 404 page and COMING_SOON renders a dedicated coming-soon page, rather than relying on the frontend links alone (a user can type the URL directly).
- Realtime sync — invalidate the shared query on the relevant WebSocket event so all open tabs update immediately when an admin flips a toggle.

**Why:** it's easy to filter the marketing pages but forget the register-role list or direct URL access, leaving a backdoor into a "hidden" service.

**How to apply:** build one small hook exposing the state map, then thread it through every list/route that mentions the service — don't assume hiding the link is sufficient without also gating the route.
