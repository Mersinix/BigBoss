---
name: Variant aggregate-stock restock bug
description: A double-counting bug hit when restoring per-variant stock after a raw SQL increment — the fix and the general pattern to avoid it.
---

When restocking a `supplier_product_variants.quantity` via a raw SQL increment (`sql\`${col} + ${qty}\``) and then re-aggregating the listing's total stock from all variants, re-read the variant rows fresh from the DB and sum `v.quantity` directly.

**Why:** the first implementation added `quantity` a second time on top of the just-updated row (`v.id === variantId ? v.quantity + quantity : v.quantity`), because it forgot the SQL update had already applied the increment before the re-read. This silently doubled every restock (e.g. cancelling an order for 8 units restored 16).

**How to apply:** after any SQL-level increment/decrement, treat the next `SELECT` as already reflecting the change — do not reapply the delta in application code. Only recompute `previousStock` from a value fetched *before* the SQL update ran.
