---
name: Catalog realtime synchronization
description: The two-sided contract for supplier catalog changes to reach Coffee Owner marketplace screens without refreshes.
---

Supplier catalog realtime updates require both halves of the contract: mutation routes must broadcast a catalog event after successful product/listing/variant changes, and the shared client realtime handler must explicitly invalidate every dependent query family. Invalidating the broad marketplace list alone does not refresh listing-scoped promotion lookups or store/pack consumers.

**Why:** Product cards, product details, packs, stores, Flash, and promotion badges use separate TanStack Query key families, so a single broad invalidation can leave visibly stale data.

**How to apply:** For future supplier catalog mutations, emit the existing product/pack/promotion event only after persistence succeeds, then update the centralized realtime invalidation mapping rather than adding page-specific refresh logic.