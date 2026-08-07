---
name: Global service visibility and ordering
description: Marketplace service visibility and display order are shared platform settings consumed by every selector and landing surface.
---

The platform service state and service order must have one server-backed source of truth. Every landing section, service switcher, favorites view, messages view, and route gate should consume the shared settings rather than maintaining local ordering or visibility rules.

**Why:** Admin changes need to persist, survive restarts, and reach connected clients consistently without causing one surface to diverge from another.

**How to apply:** Add new marketplace services to the shared service key/order types, server persistence, realtime invalidation, and all existing consumers together. Treat `HIDDEN` as unavailable and preserve existing `COMING_SOON` behavior for visible-but-not-yet-available services.