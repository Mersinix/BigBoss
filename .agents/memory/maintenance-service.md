---
name: Maintenance Service Integration
description: How the MAINTENANCE service was added and all its synchronization points — use when making changes to the service or adding future services.
---

## Pattern
Added as the 4th marketplace service (SHOP/PRINT/BARISTA/MARKETING → +MAINTENANCE). Every new service requires changes to ~10 files.

## Key synchronization points (all updated for MAINTENANCE)
- `shared/schema.ts` — `serviceKeyEnum`, `userRoleEnum`, `users.maintenanceCategories` column
- `server/storage.ts` — `ALL_SERVICES` array and default map in `getServiceStates()`
- `server/routes.ts` — registration schema enum, `PENDING_ROLES`, `LOCATION_REQUIRED_ROLES`, `userData.maintenanceCategories`, admin POST/PATCH routes, categories PATCH route
- `server/seed.ts` — test account at `maintenance@techpro.com` / `password` (role: MAINTENANCE, status: approved)
- `client/src/hooks/use-service-states.ts` — `ServiceKey` type, `DEFAULT_STATES`, `ROLE_TO_SERVICE`
- `client/src/hooks/use-favorites.ts` — `MaintenanceFavItem` type, `maintenance` slice, `toggleMaintenance`, `removeMaintenance`, `selectTotalFavCount`
- `client/src/App.tsx` — route `/maintenance` (GatedServiceRoute), route `/maintenance-panel/:rest*` (ProtectedRoute), `PROVIDER_ROLES`, `SmartDashboard`
- `client/src/components/cafe/marketplace-layout.tsx` — service switcher strip, `FavService` type, `FAV_SERVICES`, `FAV_SERVICE_TO_KEY`, favorites panel MAINTENANCE section, `ServiceId` type, `SERVICES_LIST`, `SERVICE_ID_TO_KEY`, `SERVICE_BADGE`, `fakeThreads`
- `client/src/pages/landing-page.tsx` — TRANSLATIONS (fr/en/tn), `SERVICES` array, `MAINTENANCE_CATS`, `maintenanceSchema`, `MaintenanceForm`, `ROLES` array, visibility vars, MAINTENANCE section, footer links, `buildPayload`, `NEED_LOCATION`, `PROVIDER_ROLES_CHECK`
- `client/src/pages/admin/system-management-page.tsx` — `SERVICES` array
- `client/src/pages/admin/users-page.tsx` — `MAINTENANCE_CATS`, `roleColors`, `ALL_ROLES`, `REGISTERABLE_ROLES`, `APPROVABLE_ROLES`, form state in both dialogs, payload builder, multi-select in both AddUserModal and UserDetailDialog, handleSave

## New files
- `client/src/pages/maintenance-page.tsx` — Cafe Owner marketplace (6 fake agents, filters, agent cards, detail modal)
- `client/src/pages/maintenance/dashboard.tsx` — Agent dashboard (Planning/Profile/Availability tabs)

## DB migration
Maintenance enum/column/service-row provisioning is kept in numbered migrations rather than only direct SQL. PostgreSQL enum additions are isolated from the service-row seed because a newly-added enum value cannot be used until the adding transaction commits.

**Why:** PostgreSQL enums must be altered with DDL before Drizzle can use the new value — cannot just add to schema.ts. Existing Replit databases may also have drifted dark-mode columns.

**How to apply:** If `account_dark_mode_settings.mode` is the legacy boolean, preserve `true` as `DARK_ONLY` and `false` as `LIGHT_ONLY`, then set the enum default to `BOTH`; never reset existing rows.

## Color scheme
Orange/amber: `text-orange-600`, `bg-orange-500`, `bg-orange-100 text-orange-700`. Distinguishes from green (Barista), purple (Marketing), blue/orange (Print).

## Dark mode note
Inner marketplace pages (marketing, barista, maintenance) do not implement `isDark` — dark mode only applies to the marketplace layout shell (header, service switcher, panels). This is consistent across all services.
