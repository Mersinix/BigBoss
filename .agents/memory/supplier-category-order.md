---
name: Supplier category ordering
description: Supplier category cards and mapped Store categories share one persisted ordering.
---

Supplier category order is stored with the supplier mapping and returned in that order by the shared mapping query; the Supplier Categories page and Store must not maintain separate order state.

**Why:** Suppliers need drag-and-drop ordering to persist across refresh and login while remaining synchronized with their Store.

**How to apply:** Reuse the supplier mapping order for any future category navigation or Store category presentation; preserve the order when adding mappings by appending new categories.