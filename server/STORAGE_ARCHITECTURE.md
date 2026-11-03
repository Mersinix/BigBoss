# Storage Architecture

Canonical reference for `server/storage.ts` and `server/storage/`.
Replaces the former `server/REFACTORING_ANALYSIS.md` and
`server/STORAGES_AUDIT.md`, consolidating both into one current,
accurate document.

---

## A. Purpose and architecture overview

The storage layer is the sole data-access boundary between the Express
route handlers and the database. Every route file imports one
singleton:

```ts
import { storage } from "./storage"; // server/storage.ts, last line: export const storage = new DatabaseStorage();
```

- **`DatabaseStorage`** (`server/storage.ts`) is the **compatibility
  facade** — the one concrete class every route file calls through.
  Its exported type is the concrete class itself, not an interface;
  every `storage.<method>(...)` call site is statically checked
  against this exact class. This is the single most important
  invariant of the whole architecture: nothing may change what
  `storage`'s exported type resolves to (no Proxy, no mixin, no
  interface-only export) without re-verifying every call site in the
  codebase.
- **`IStorage`** (`server/storage/types/istorage.ts`) is a **partial,
  non-authoritative** interface — 365 method signatures, re-exported
  from `server/storage.ts` for backward compatibility. `DatabaseStorage`
  has 599 public methods, so 234 of them exist only on the concrete
  class with no interface declaration. This is long-standing, pre-dates
  the domain-extraction effort, and is not something any batch has
  tried to "fix" by syncing the two — doing so would be its own,
  separately-justified decision, not a side effect of a refactor.
- **Domain storage classes** (`server/storage/domains/*.storage.ts`)
  each own one business domain's persistence and business logic.
  `DatabaseStorage` holds one `private readonly xDomain = new
  XStorage(...)` field per domain and exposes every public method as a
  **thin delegate** (`return this.xDomain.method(...args)`), preserving
  the original name, signature, and behavior exactly.
- **Cross-domain calls** go through one of two patterns, both already
  established and proven safe across every batch:
  1. A domain class holds `constructor(private facade: DatabaseStorage)`
     and calls `this.facade.someMethod(...)` for a genuine dependency on
     another domain's public API (e.g. Barista calling
     `syncMessagingRelationship` on Messages). Only added when a real
     call exists — never speculatively.
  2. A handful of methods that are genuinely shared between two domains
     (e.g. `recomputeOrderAggregateStatus`, used by both Order and
     Delivery) stay resident on `DatabaseStorage` itself; both domains
     reach it — one via the facade, one as a plain same-class call.

---

## B. Current storage architecture

```
server/
  storage.ts                     DatabaseStorage facade — 4,005 lines,
                                  599 public methods (44 real
                                  implementations + 555 delegates),
                                  7 private helpers, the `storage`
                                  singleton export, plus 2 module-level
                                  shared helpers (buildTaxonomyCache,
                                  enrichProduct, computeListingOffer)
  storage/
    types/
      istorage.ts                 IStorage interface (365 signatures)
    domains/                      23 domain storage files (14,373 lines total)
```

All figures above were recomputed directly from the repository at the
time this document was written (via a TypeScript-AST walk of
`DatabaseStorage`/`IStorage`, plus `wc -l`), not copied from any prior
report.

### Domain files and their responsibilities

| File | Class | Public | Private | Facade dep? | Responsibility |
|---|---|---:|---:|---|---|
| `user.storage.ts` | `UserStorage` | 16 | 3 | no | Generic user identity/account/profile, password hashing + reset flow |
| `supplier.storage.ts` | `SupplierStorage` | 41 | 1 | yes | Supplier accounts, stores, category mappings, product listings, product workflow |
| `order.storage.ts` | `OrderStorage` | 18 | 7 | yes | Order lifecycle, returns |
| `delivery.storage.ts` | `DeliveryStorage` | 45 | 12 | yes | Delivery lifecycle, drivers, vehicles, pricing, payouts + financial ledger, opportunities |
| `inventory.storage.ts` | `InventoryStorage` | 13 | 8 | yes | Variant/listing stock, stock adjustments + history, restocking |
| `packs.storage.ts` | `PacksStorage` | 16 | 0 | no | Pack lifecycle, composition, pricing, discovery, favorites |
| `products.storage.ts` | `ProductsStorage` | 6 | 0 | no | Admin product CRUD, legacy product browsing |
| `marketplace.storage.ts` | `MarketplaceStorage` | 3 | 0 | no | Product marketplace discovery (not provider-type cards) |
| `shop-catalog.storage.ts` | `ShopCatalogStorage` | 29 | 0 | no | Categories/SubCategories/Flavors/Sizes/Brands taxonomy + Favorites |
| `reviews.storage.ts` | `ReviewsStorage` | 37 | 4 | no | Cross-entity review persistence (every reviewable entity type) |
| `promotions.storage.ts` | `PromotionsStorage` | 13 | 1 | yes | Promotions, cart evaluation engine |
| `discount-codes.storage.ts` | `DiscountCodesStorage` | 10 | 0 | no | Discount codes |
| `academy.storage.ts` | `AcademyStorage` | 39 | 5 | yes | Barista Academy: profile, courses, sessions, registrations |
| `barista.storage.ts` | `BaristaStorage` | 61 | 10 | yes | Barista Marketplace: taxonomy, jobs, missions, requests |
| `maintenance.storage.ts` | `MaintenanceStorage` | 60 | 7 | yes | Maintenance Marketplace: taxonomy, job workflow, reservations |
| `marketing.storage.ts` | `MarketingStorage` | 52 | 8 | yes | Marketing Marketplace: profile, projects, category mapping |
| `print.storage.ts` | `PrintStorage` | 44 | 5 | yes | Print Marketplace: catalog, orders, printer profile |
| `messages.storage.ts` | `MessagesStorage` | 19 | 2 | yes | Conversations, messages, messaging-relationship eligibility |
| `notifications.storage.ts` | `NotificationsStorage` | 9 | 0 | no | Notifications + preferences |
| `platform-settings.storage.ts` | `PlatformSettingsStorage` | 16 | 1 | no | Landing Config, Platform Services, Hero/Dark Mode settings |
| `auth-provider-settings.storage.ts` | `AuthProviderSettingsStorage` | 2 | 0 | no | Google/Facebook sign-in toggles |
| `login-security-settings.storage.ts` | `LoginSecuritySettingsStorage` | 2 | 1 | no | Lockout/rate-limit/session-timeout admin config |
| `prospecting.storage.ts` | `ProspectingStorage` | 12 | 2 | no | Sales prospecting CRM |

**Naming note**: `prospecting.storage.ts`'s field on `DatabaseStorage`
is `private readonly prospecting` (not `prospectingDomain`, unlike
every other domain). Purely cosmetic, zero behavioral effect — flagged
here so any future automated tooling accounts for it.

### What remains directly on `DatabaseStorage` (not yet extracted)

- **Finance/Settlement cluster**: Settlement Foundation, COD
  Reconciliation, Refunds, Adjustments, Admin Financial Summary,
  Payments (`calculateDeliverySettlement`, `getDeliverySettlements`,
  `approveSettlement`, `confirmPayment`, `recordCashCollected`,
  `reconcileCod`, `confirmRefund`, `getAdminFinancialSummary`, and
  siblings) — a genuinely independent domain from Delivery, explicitly
  kept separate across Batches 41/43/44's own audits.
  `calculateDeliverySettlement`/`createCodReconciliationIfApplicable`
  are public specifically so `DeliveryStorage` can reach them via the
  facade.
- **Delivery Company marketplace profile**: `getDeliveryCompanyProfile`,
  `getDeliveryCompanyCard`, reports, and related methods —
  architecturally parallel to Maintenance/Marketing/Print/Barista/
  Academy's own marketplace-provider domains (none of which this effort
  has merged into their operational domain either). A candidate for its
  own future `delivery-company.storage.ts`, not yet actioned.
  `getDeliveryCompanyReviews` and siblings are already in
  `ReviewsStorage` (cross-entity Reviews), not here.
  `getDriversForOwner`/`createDriverForOwner`/etc. already moved to
  `DeliveryStorage`.
- **Reports (complaint/moderation) cluster**: `createMaintenanceReport`,
  `createMarketingReport`, `createBaristaReport`, `createAcademyReport`,
  `createDeliveryCompanyReport`, `createSupplierReport`, and their
  `getPublishedXReports` siblings — structurally distinct from Reviews
  (each uses its own dedicated per-entity table, never the shared
  `supplierProductReviews` table). Spans every provider type uniformly;
  not yet extracted into its own domain.
- **Shared helpers**: `buildTaxonomyCache`, `enrichProduct`,
  `computeListingOffer` (module-level exports, used by multiple domain
  files via `import { ... } from "../../storage"`) and 2 small private
  geo helpers (`haversineKm`, `parseLatLng`) still used by ~30
  not-yet-extracted provider-marketplace proximity methods — these are
  **intentionally duplicated**, not centralized, into 6 domain files
  that also need them (see §C).

---

## C. Architecture and development rules

1. **One coherent principal storage file per business domain.** Do not
   fragment a single domain into multiple small files
   (`product-reviews.storage.ts`, `inventory-movements.storage.ts`,
   etc.). Every extraction batch to date has followed this rule.
2. **Check for an existing domain file before creating a new one.**
   Several batches (38, 42) found and consolidated into an
   already-existing, partially-fragmented domain file rather than
   creating a duplicate.
3. **Keep independent business domains independent.** A method's
   ownership is determined by the business responsibility it
   implements — never by its name, its table references alone, the
   presence of a foreign key like `productId`/`orderId`, which domain
   calls it, or whether it participates in a larger workflow. When
   ownership is ambiguous, document the decision and the reasoning,
   not just the outcome.
4. **Preserve `DatabaseStorage` as the compatibility facade.** Every
   extracted method keeps its exact public name, signature, and
   delegate shape (`return this.xDomain.method(...args)`).
5. **Preserve `IStorage` as-is.** Do not add missing declarations or
   remove existing ones as a side effect of an unrelated change.
6. **Use `import type` for facade references** in every domain file
   that takes a `facade: DatabaseStorage` constructor argument — this
   is type-only and erased at runtime, which is what keeps the
   dependency graph free of real circular imports.
7. **Preserve transaction boundaries and transaction-client
   propagation exactly.** A transaction that opens in one domain and
   calls into another must keep passing the same live client through;
   never introduce a nested transaction, never split one atomic
   operation into two.
8. **Route cross-domain interactions through the existing facade
   pattern** — either a `facade.method()` call or a documented shared
   method, never a new access pattern, Proxy, or generated dispatch.
9. **Avoid introducing circular dependencies.** The dependency graph
   between domain files has remained an acyclic graph throughout every
   batch; verify this holds before adding any new cross-domain call.
10. **Keep database access and ownership boundaries clear.** A domain
    reading another domain's table directly (not via a method call) is
    an accepted, pre-existing pattern for narrow, read-only,
    side-effect-free lookups (e.g. a card-display method reading
    another domain's table for a name/rating) — never for writes, and
    never as a substitute for a real cross-domain call when one
    already exists.
11. **Duplicate small, pure, shared helpers rather than centralizing
    them**, when centralizing would force an unrelated cross-domain
    import. `haversineKm`/`parseLatLng`/`formatPublicLocation` are each
    duplicated into 6 domain files for exactly this reason — a
    deliberate, settled decision, not a gap to fix.
12. **Recalculate baselines from the actual repository at the start of
    every batch.** Every prior batch's "historical reference" figures
    have drifted at least slightly from the next batch's fresh count;
    never trust a number without re-deriving it.

---

## D. Domain ownership — ambiguous boundaries worth knowing

- **Reviews vs. the entity being reviewed**: review persistence
  (create/read/update/delete, moderation, statistics) belongs to
  `ReviewsStorage` **regardless of which entity type is reviewed**
  (Product, Supplier, Driver, Delivery Company, Maintenance, Marketing,
  Print, Barista, Academy, Pack). A provider's own *display-time*
  rating computation (`computeMarketingReviewStats` and siblings,
  used only by that provider's own card/overview methods) stays in the
  provider's domain — it is a read-time aggregation, not review
  persistence.
- **Reports vs. Reviews**: structurally different. Reports use a
  dedicated per-entity table; Reviews share one table
  (`supplierProductReviews`) across every entity type. Do not conflate
  the two when auditing either.
- **Inventory vs. Supplier**: a listing's stock quantity is
  Inventory-owned; the listing's lifecycle (create/update/delete,
  category mapping, approval workflow) is Supplier-owned.
  `deleteSupplierListing` directly deletes variant/inventory-adjustment
  rows as part of its own lifecycle cleanup — a pre-existing, accepted
  cross-table write, not something Inventory should intercept.
- **Packs vs. Products/Inventory**: Pack composition-building
  (`buildPackDetails` and the methods that call it) reads Product and
  Inventory data read-only for display/pricing — this does not make
  Packs the owner of either.
  `getVariantsByListingId`/`saveVariants` are Inventory-owned despite
  having been physically filed next to Supplier listing methods in the
  original monolith.
- **Order vs. Delivery**: Order owns the order/sub-order lifecycle;
  Delivery owns delivery assignment, tracking, and pricing.
  `recomputeOrderAggregateStatus`, `generateDeliveryConfirmationCode`,
  and `buildPackDetails` are genuinely shared and stay resident on
  `DatabaseStorage`/the owning domain rather than being duplicated.
- **Delivery vs. Finance/Settlement**: Delivery owns the driver-payout
  *calculation* and the financial *ledger* (the single source of
  truth for delivery-specific economic events). Settlement, COD
  Reconciliation, Refunds, and Adjustments — which read that ledger
  but represent a broader, cross-domain Finance concern — are
  deliberately excluded from Delivery.
- **User vs. role-specific profiles**: generic identity/auth/password
  belongs to `UserStorage`. A role-specific profile (Driver, Maintenance,
  Barista, etc.) belongs to that role's own domain, even though it
  references a `userId`.

---

## E. Verification and testing policy

Every extraction/consolidation batch has followed the same validation
sequence, and future batches should continue to:

1. **AST comparison** — compare the original method body against the
   final one (via the TypeScript Compiler API, not a visual diff)
   before deleting anything from the monolith, accounting for any
   necessary and documented substitution (e.g. a facade-reference
   rewrite).
2. **Facade audit** — a repository-local script that verifies every
   domain-field mapping, every delegate's target, and flags duplicate
   or missing delegates.
3. **`npx tsc --noEmit`** — must be clean after every edit.
4. **`npm run build`** — must succeed (client + server bundles).
5. **Safe runtime read tests** — executed directly against the live
   database via the `storage` singleton (not through HTTP), covering
   real existing records and explicit not-found/empty-result cases.
   Never used to justify a claim about write-path correctness.
6. **HTTP route checks**, when relevant — on an isolated port, only
   after reading the actual route definition and its middleware
   (never assuming a route is public from the absence of visible
   middleware; some routes gate access with an inline session check
   instead of a middleware wrapper).

**Read-path vs. write-path, explicitly**: every batch's read-path
checks (above) are real, executed verifications. **Write-path
operations (create/update/delete/adjust/restock and similar) have not
been verified in most batches** — no disposable PostgreSQL database has
been available, and the shared database must never receive a
destructive test write. Treat any write-path method as **unverified
by this refactor** unless a specific batch's report says otherwise.

---

## F. Important limitations and outstanding work

- **`IStorage` is not authoritative** (§A) — 234 of 599 public methods
  have no interface declaration. This is long-standing and not a
  regression from any batch.
- **Write-path verification gap** (§E) — applies to essentially every
  domain with mutating methods (Inventory, Packs, Delivery, Orders,
  Supplier, Reviews, User, and others). No disposable test database has
  been available throughout this entire effort.
- **Delivery Company marketplace profile** and the **Reports
  (complaint/moderation) cluster** (§B) remain unextracted — candidates
  for future, separately-scoped batches, not urgent.
- **`formatPublicLocation`** (private, on `DatabaseStorage`) has zero
  remaining callers — every former caller was duplicated into its own
  domain-file copy by earlier batches. Left in place; removing it is
  out of scope for a comment/structure-only batch (code deletion
  requires its own explicit batch and justification).
- **The `prospecting` field naming inconsistency** (§B) — cosmetic,
  flagged for any future automated tooling, not urgent.

---

## G. Refactoring history — concise summary

### Why this was refactored

The original `server/storage.ts` was a single **14,773-line** file: one
`IStorage` interface plus one `DatabaseStorage` class implementing
every persistence operation for every business domain inline. `server/routes.ts`
(the HTTP layer) was a parallel **10,947-line** monolith, refactored
first and separately (Stage 1) into ~17 per-domain route files with no
equivalent facade constraint (routes have no statically-typed public
contract the way storage does — see the original audit's routes.ts
analogy section for why that pattern could not simply be copied onto
storage).

### How it was refactored

Every batch followed the same discipline: recalculate the actual
baseline from the repository (never trust a prior report's numbers),
audit real ownership by reading method bodies and call graphs (never
assume from a name or a keyword match), extract or consolidate into
one coherent domain file, verify via AST diff + `tsc` + build + facade
audit + safe runtime reads, document the batch, and stop for review
before continuing.

### Major milestones

- **Early batches (1–18)**: first single-domain extractions
  (Prospecting, Notifications, Favorites, Store Favorites, Promotions,
  Landing Config, Platform Services, Discount Codes, Auth Provider
  Settings, Login Security Settings, Pack Reviews, Categories,
  Driver Reviews, SubCategories, Flavors, Sizes, Brands), establishing
  the extract-and-verify methodology.
- **Batch 19**: first business-domain **consolidation** — Categories/
  SubCategories/Flavors/Sizes/Brands/Taxonomy bulk-order/Favorites
  merged into one `ShopCatalogStorage`, establishing the consolidation
  methodology alongside extraction.
- **Batches 20–23**: Platform Settings consolidation (Landing Config +
  Platform Services); audits of Promotions/Discount Codes finding no
  further safe extraction at that time.
- **Batch 24–27**: Delivery Pricing Engine, Vehicles + Driver Profile,
  Driver Payout Engine + Financial Ledger, and a 4-domain batch
  (Delivery Opportunities, Products, Marketplace, Supplier Stores).
- **Permanent rule adopted (after Batch 27)**: one business domain = one
  principal storage file — see §C, rule 1.
- **Batches 28–33**: complete per-provider consolidations — Barista,
  Maintenance, Marketing, Print, Academy, Messages — each absorbing a
  provider's full marketplace implementation (profile, taxonomy, job/
  course workflows, reports) into one file.
- **Architecture audit** (after Batch 33, formerly `STORAGES_AUDIT.md`):
  independently recomputed every metric, proposed and partially
  validated a progressive-modularization plan.
- **Batch 34**: `IStorage` moved to its own file, re-exported for
  compatibility.
- **Batch 35**: scratch-file cleanup (non-architectural).
- **Batch 36**: Hero/Dark Mode settings consolidated into Platform
  Settings (an adjacency trap — these are global, not Print-specific,
  despite being physically filed next to Print in the monolith).
- **Batch 37**: Order domain extracted, including a second,
  undocumented block of Order methods discovered physically displaced
  inside an unrelated Delivery section.
- **Batch 38**: Supplier domain extracted and consolidated (merging the
  pre-existing `supplier-stores.storage.ts`).
- **Batch 39**: User/Auth domain extracted (first-time extraction, no
  consolidation candidate existed).
- **Batch 40**: Product domain audited — found already fully and
  correctly isolated since Batch 27; zero changes made.
- **Batch 41**: Delivery domain extracted and consolidated (merging 4
  previously-separate specialized files: pricing, vehicles, payout,
  opportunities) — the largest single-batch line reduction. A
  mid-batch splicing bug (stale line numbers after an earlier edit
  shifted content) was caught by `tsc` and fully repaired before
  verification — a reminder that exact-text matching, not line-number
  splicing, is the safer mechanical approach for large edits.
- **Batch 42**: Reviews domain extracted and consolidated — notably
  reversing part of the earlier "one domain = one file" grouping by
  pulling review CRUD out of 5 provider files (Maintenance, Marketing,
  Print, Barista, Academy) into one cross-entity `ReviewsStorage`,
  per this batch's explicit instruction that review ownership does not
  follow the reviewed entity.
- **Batch 43**: Inventory domain extracted (first-time extraction),
  including methods physically misfiled under an unrelated "Supplier
  variants" header.
- **Batch 44**: Packs domain extracted (first-time extraction),
  including `getPackComposition`, found displaced ~1,800 lines from the
  rest of the Pack cluster.
- **Batch 45 (this batch)**: comment cleanup in `server/storage.ts`
  (removed ~414 lines of historical batch-by-batch narrative that
  belonged in documentation, not beside the code) and consolidation of
  `REFACTORING_ANALYSIS.md` + `STORAGES_AUDIT.md` into this document.

### Unresolved verification gaps (carried forward)

- Write-path methods across most domains remain unverified against a
  real database (no disposable test instance has been available) — see §E/§F.
- The Delivery Company marketplace profile and the Reports cluster
  remain unextracted — see §F.
