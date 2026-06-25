---
name: Three-tier marketplace access
description: How commercial data (prices/suppliers) is gated in the BigBoss marketplace.
---

## The Rule
`userAccountStatusEnum` enum: `pending | approved | rejected`. CAFE_OWNER users register as `pending`; admin must approve to grant commercial access.

## Server-side (`hasCommercialAccess` in routes.ts)
```ts
if (['SUPER_ADMIN', 'ADMIN', 'SUPPLIER'].includes(u.role)) return true;
return u.role === 'CAFE_OWNER' && u.status === 'approved';
```
`stripCommercialData()` removes `listings`, `bestPrice`, sets `supplierCount: 0` for public responses.

## Client-side (`computeAccess` in marketplace-layout.tsx)
```ts
function computeAccess(user) {
  if (!user) return { isVisitor: true, isPending: false, hasCommercial: false };
  if (['SUPER_ADMIN', 'ADMIN', 'SUPPLIER'].includes(user.role)) return { hasCommercial: true, ... };
  const approved = user.role === 'CAFE_OWNER' && user.status === 'approved';
  return { isPending: !approved, hasCommercial: approved };
}
```

**Why:** New cafe owners must be vetted before seeing supplier pricing to protect commercial confidentiality.

**How to apply:** Any new page showing prices/suppliers must check `hasCommercial` before rendering. Cart checkout also requires `CAFE_OWNER` role via `ProtectedRoute`.

## DB migration
Schema has `userAccountStatusEnum` pgEnum in `shared/schema.ts`; users table has `status` column (default `'approved'` so existing users aren't broken). New CAFE_OWNER registrations set `status: 'pending'` explicitly in the register route.
