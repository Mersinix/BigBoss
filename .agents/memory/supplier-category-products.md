---
name: Supplier category-products coupling
description: How My Categories drives product visibility in the Products page — single-selection (Zustand) for My Products, multi-mapping (DB state) for Admin Products.
---

## Two distinct selection models (do not conflate them)

### Admin Products tab — multi-mapping model
- Source of truth: DB-persisted supplier mappings from `/api/supplier/categories`.
- Each mapping: `{ category, subCategories[], selectedSubCategoryIds[] }`.
- Admin Products tab receives the full `mappings` array as a prop, not `selectedCategoryId/selectedSubCategoryId`.
- Query key: stable hash of all checked subIds → `["/api/supplier/admin-products", "1,3,4,7,9"]`.
- Server: `/api/supplier/admin-products` does NOT accept `categoryId`/`subCategoryId` query params. It filters by ALL the supplier's `selectedSubCategoryIds` across ALL categories via the mapping filter.
- Banner: multi-badge → "Showing products from: ☕ Coffee Beans → Arabica, Robusta | 🥛 Dairy → Oat Milk".

### My Products tab — single-selection model (unchanged)
- Source of truth: Zustand store `useSupplierCategoryStore` with `selectedCategoryId`/`selectedSubCategoryId`.
- Persisted via `persist` middleware → localStorage key `"supplier-category-selection"`.
- `ManageProducts` still reads from Zustand and passes to `MyProductsTab`.
- Safety-net `useEffect` in `ManageProducts` auto-initializes the store from the first available mapped category+subcategory when both are null.

## Server filter logic (admin-products route)
```
allCheckedSubIds = new Set(supplierMappings.flatMap(m => m.selectedSubCategoryIds))
filtered = adminProds.filter(p => {
  if (!p.categoryId) return true       // uncategorized → show all
  if (!mappedCatIds.has(p.categoryId)) return false  // wrong category → hide
  const catMapping = find by p.categoryId
  if (catMapping.selectedSubCategoryIds.length > 0 && p.subCategoryId)
    return allCheckedSubIds.has(p.subCategoryId)   // subcategory gate
  return true  // no checked subs for this category → show all
})
```

## Why two models
- Admin Products: supplier wants to browse ALL products across all their configured categories at once.
- My Products: supplier wants to drill down into ONE specific category/subcategory to manage their listings.

## Previous bug history (all fixed)
1. Zustand not persisted → added `persist` middleware.
2. Chevron expand didn't call `onSelect()` → fixed.
3. Subcategory checkbox didn't update Zustand → fixed.
4. Server double-filter (query param + mapping filter conflicting) → fixed by removing param-based category filtering for admin-products.
5. Single-selection model couldn't show products from multiple checked subcategories → fixed by switching AdminProductsTab to multi-mapping model.

## Real-time auto-refresh
When the supplier checks/unchecks a subcategory in My Categories, the `/api/supplier/categories` query invalidates via WebSocket. `ManageProducts` reads new `mappings`, passes them to `AdminProductsTab`, the `allCheckedSubIds` key changes, and TanStack Query automatically re-fetches admin products — no page refresh needed.
