import { db } from "./db";
import { isNull, isNotNull, or, like, gte, lte } from "drizzle-orm";
import { evaluateCartPromotions as engineEvaluate } from "./promotions-engine";
import type { PromoCartItem } from "./promotions-engine";
import {
  users, products, orders, orderItems, subOrders, supplierProductVariants,
  categories, subCategories, flavors, sizes, brands,
  supplierProductListings, favorites,
  platformServices, supplierProductReviews, supplierReports, type SupplierReport,
  landingConfig, messagingSettings, authProviderSettings, loginSecuritySettings, prospects,
  prospectCustomTypes, PROSPECT_TYPES,
  maintenanceFavorites,
  maintenanceCompetencies, maintenanceZones, maintenanceSubCompetencies, maintenanceReports,
  maintenanceJobPosts, maintenanceJobTargets, maintenanceJobApplications,
  marketingProfiles, marketingProjects, marketingCategoryTaxonomy, marketingSubCategoryTaxonomy, marketingReports, marketingFavorites,
  marketingServices, type MarketingService, type InsertMarketingService, type MarketingServiceCard, type MarketingSubCategory,
  type PrintReport,
  type PrinterProfile, type InsertPrinterProfile, type PrintCompanyCard, type PrintCompanyListCard,
  type HeroService, type HeroActionSettingsMap,
  type ServiceHeroConfig, type ServiceHeroConfigMap,
  type DarkModeAccount, type AccountDarkModeSettingsMap, type AccountThemeMode,
  baristaSkills, baristaMarketplaceProfiles, baristaMarketplaceMissions, baristaMarketplaceFavorites,
  baristaWorkHistory, baristaReports,
  baristaEducationLevels, baristaLanguages,
  baristaJobPosts, baristaJobTargets, baristaJobApplications, baristaJobMeetings,
  promotions,
  conversations,
  notifications,
  deliveries,
  deliveryFinancialLedger, type FinancialLedgerEntry,
  settlements, settlementItems, type Settlement, type SettlementItem, type SettlementStatus,
  payments, type Payment, type PaymentMethod, type PaymentStatus,
  codReconciliations, type CodReconciliation, type CodReconciliationStatus,
  refunds, type Refund, type RefundStatus,
  adjustments, type Adjustment,
  deliveryCompanyProfiles, deliveryCompanyReports,
  type DeliveryCompanyProfile, type InsertDeliveryCompanyProfile, type DeliveryCompanyMarketplaceCard,
  type DeliveryCompanyReport, type InsertDeliveryCompanyReport,
  type DriverProfile, type InsertDriverProfile,
  type Notification, type InsertNotification, type NotificationService,
  type OrderReturn, type InsertOrderReturn,
  type Delivery, type DeliveryStatus, type DeliveryMode, type DeliveryWithDetails, type GeoLocation,
  type Vehicle, type InsertVehicle, type DeliveryVehicleType,
  type DeliveryPricingSettings, type DeliveryOpportunity, type DeliveryOpportunityStatus,
  type LandingConfig, type Prospect, type InsertProspect, type ProspectStats,
  type ConversationSummary, type ConversationMessageRow, type EligibleContact,
  type InsertUser, type User,
  type InsertProduct, type Product, type ProductWithSupplier, type ProductWithTaxonomy,
  type InsertOrder, type Order, type OrderWithDetails,
  type InsertOrderItem, type OrderItem,
  type InsertSubOrder, type SubOrder, type SubOrderWithItems,
  type InsertSupplierProductVariant, type SupplierProductVariant, type SupplierVariantWithLabels,
  type InsertCategory, type Category, type CategoryWithCount,
  type InsertSubCategory, type SubCategory, type SubCategoryWithDetails,
  type InsertFlavor, type Flavor, type FlavorWithCount,
  type InsertSize, type Size, type SizeWithCount,
  type InsertBrand, type Brand, type BrandWithCount,
  type SupplierCategoryMapping,
  type AdminSupplierCategoryOverview,
  type InsertSupplierProductListing, type SupplierProductListing, type SupplierListingWithProduct,
  type MarketplaceProduct, type MarketplaceListing, type MarketplaceVariant,
  type CreateOrderItem, type BillingInfo, type CreateOrderItemInput,
  type ShopFavoriteItem,
  type ServiceKey, type ServiceState, type ServiceStatesMap, type MarketplaceServiceId,
  DEFAULT_SERVICE_ORDER,
  type SupplierStore, type InsertSupplierStore, type StoreCard, type StoreAdminRow, type StoreDetail,
  type SupplierProductReview,
  type Pack, type PackDetail, type PackItemDetail,
  type CreatePackOrderItem, type ResolvedPackOrderItem,
  type InventoryListResult, type InventoryStats, type InventoryFilters, type InventorySort, type InventoryAdjustmentWithVariant,
  type MaintenanceProfile, type InsertMaintenanceProfile, type MaintenanceMarketplaceCard, type OpeningHoursMap,
  type MaintenanceReservation, type InsertMaintenanceReservation,
  type MaintenanceCompetency, type MaintenanceZone, type MaintenanceSubCompetency,
  type MaintenanceJobPost, type InsertMaintenanceJobPost, type MaintenanceJobPostWithStats,
  type MaintenanceJobTarget, type MaintenanceJobApplication, type InsertMaintenanceJobApplication,
  type MaintenanceJobApplicationWithParties,
  type PrintCatalogItem, type InsertPrintCatalogItem, type PrintCatalogCard,
  type PrintOrder, type InsertPrintOrder, type PrintOrderWithParties,
  type PrintCategoryTaxonomy, type PrintSubCategoryTaxonomy,
  type BaristaSkill, type BaristaMarketplaceProfile, type InsertBaristaMarketplaceProfile,
  type BaristaMarketplaceRequest, type BaristaMarketplaceMission,
  type BaristaMarketplaceCard, type BaristaRequestWithParties, type BaristaMissionWithParties,
  type BaristaWorkHistory, type InsertBaristaWorkHistory,
  type BaristaReport, type InsertBaristaReport,
  type BaristaEducationLevel, type BaristaLanguage,
  type BaristaJobPost, type InsertBaristaJobPost, type BaristaJobPostWithStats,
  type BaristaJobTarget, type BaristaJobApplication, type InsertBaristaJobApplication,
  type BaristaJobApplicationWithParties, type BaristaJobMeeting,
  type MaintenanceReport, type InsertMaintenanceReport,
  type MarketingProfile, type InsertMarketingProfile, type MarketingMarketplaceCard, type MarketingCompanyListCard,
  type MarketingProject, type InsertMarketingProject,
  type MarketingReport, type InsertMarketingReport, type MarketingCategory,
  type BaristaRequestStatus, type BaristaMissionStatus,
  type AcademyProfile, type InsertAcademyProfile, type AcademyCourse, type InsertAcademyCourse,
  type AcademyCourseSession, type AcademyRegistration,
  type AcademyCourseCard, type AcademyRegistrationWithParties, type AcademyCourseSessionWithCourse,
  type AcademyRegistrationStatus, type AcademySessionStatus,
  type AcademyReport,
} from "@shared/schema";
import { encodeMaintenanceSubSkillKey } from "@shared/maintenance-sub-skill-key";
import { eq, and, inArray, ne, sql, notInArray, asc, desc } from "drizzle-orm";
import { ProspectingStorage } from "./storage/domains/prospecting.storage";
import { NotificationsStorage } from "./storage/domains/notifications.storage";
import { SupplierStorage } from "./storage/domains/supplier.storage";
import { PromotionsStorage } from "./storage/domains/promotions.storage";
import { PlatformSettingsStorage } from "./storage/domains/platform-settings.storage";
import { DiscountCodesStorage } from "./storage/domains/discount-codes.storage";
import { AuthProviderSettingsStorage } from "./storage/domains/auth-provider-settings.storage";
import { LoginSecuritySettingsStorage } from "./storage/domains/login-security-settings.storage";
import { ReviewsStorage, type DeliveryCompanyDriverReview, type CompanyDriverPerformanceReview } from "./storage/domains/reviews.storage";
import { ShopCatalogStorage } from "./storage/domains/shop-catalog.storage";
import { BaristaStorage } from "./storage/domains/barista.storage";
import { MaintenanceStorage } from "./storage/domains/maintenance.storage";
import { MarketingStorage } from "./storage/domains/marketing.storage";
import { PrintStorage } from "./storage/domains/print.storage";
import { AcademyStorage } from "./storage/domains/academy.storage";
import { MessagesStorage } from "./storage/domains/messages.storage";
import { OrderStorage } from "./storage/domains/order.storage";
import { UserStorage } from "./storage/domains/user.storage";
import { DeliveryStorage } from "./storage/domains/delivery.storage";
import { ProductsStorage } from "./storage/domains/products.storage";
import { InventoryStorage } from "./storage/domains/inventory.storage";
import { PacksStorage } from "./storage/domains/packs.storage";
import { MarketplaceStorage } from "./storage/domains/marketplace.storage";

// Delivery System V2 Phase 5B (hardening) — the shape redactDeliveryCodes actually returns:
// identical to Delivery except cafeOwnerFeeShareCents/supplierFeeShareCents may be null for a
// viewer not authorized to see that share (the DB columns themselves stay .notNull() — this
// is a redaction-time widening only, never a schema change). See redactDeliveryCodes's doc.
export type RedactedDelivery = Omit<Delivery, 'cafeOwnerFeeShareCents' | 'supplierFeeShareCents'> & {
  cafeOwnerFeeShareCents: number | null;
  supplierFeeShareCents: number | null;
};

// IStorage lives in its own file; re-exported so every existing
// `import type { IStorage } from "./storage"` keeps resolving unchanged.
import type { IStorage } from "./storage/types/istorage";
export type { IStorage };

// ── Taxonomy cache helper ─────────────────────────────────────────────────────

export async function buildTaxonomyCache() {
  const [cats, subs, flvs, szs, brds] = await Promise.all([
    db.select().from(categories).where(and(eq(categories.status, 'ACTIVE'), eq(categories.isActive, true))),
    db.select().from(subCategories).where(and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true))),
    db.select().from(flavors).where(and(eq(flavors.status, 'ACTIVE'), eq(flavors.isActive, true))),
    db.select().from(sizes).where(and(eq(sizes.status, 'ACTIVE'), eq(sizes.isActive, true))),
    db.select().from(brands).where(and(eq(brands.status, 'ACTIVE'), eq(brands.isActive, true))),
  ]);
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const subMap = new Map(subs.map((s) => [s.id, s]));
  const flvMap = new Map(flvs.map((f) => [f.id, f]));
  const szMap = new Map(szs.map((s) => [s.id, s]));
  const brdMap = new Map(brds.map((b) => [b.id, b]));
  return { catMap, subMap, flvMap, szMap, brdMap };
}

export function enrichProduct(
  p: Product,
  { catMap, subMap, flvMap, szMap, brdMap }: Awaited<ReturnType<typeof buildTaxonomyCache>>,
  supplierName?: string
): ProductWithTaxonomy {
  return {
    ...p,
    supplier: supplierName !== undefined ? (p.supplierId ? { id: p.supplierId, name: supplierName } : null) : undefined,
    categoryLabel: p.categoryId ? (catMap.get(p.categoryId) ? { id: p.categoryId, name: catMap.get(p.categoryId)!.name } : null) : null,
    subCategoryLabel: p.subCategoryId ? (subMap.get(p.subCategoryId) ? { id: p.subCategoryId, name: subMap.get(p.subCategoryId)!.name } : null) : null,
    flavorLabel: p.flavorId ? (flvMap.get(p.flavorId) ? { id: p.flavorId, name: flvMap.get(p.flavorId)!.name } : null) : null,
    sizeLabel: p.sizeId ? (szMap.get(p.sizeId) ? { id: p.sizeId, name: szMap.get(p.sizeId)!.name } : null) : null,
    brandLabel: p.brandId ? (brdMap.get(p.brandId) ? { id: p.brandId, name: brdMap.get(p.brandId)!.name } : null) : null,
    flavorLabels: (p.flavorIds ?? []).map((id) => flvMap.get(id)).filter(Boolean).map((f) => ({ id: f!.id, name: f!.name })),
    sizeLabels: (p.sizeIds ?? []).map((id) => szMap.get(id)).filter(Boolean).map((s) => ({ id: s!.id, name: s!.name })),
  };
}

// ── Supplier offer eligibility (shared) ─────────────────────────────────────
// Task: "Fix Invalid Supplier Product Mappings and Empty Products in the
// Coffee Owner Marketplace". A `supplierProductListings` row's own `price`/
// `stock` columns are maintained purely as a CACHE of its variants —
// `saveVariants()` recomputes them as min(price)/sum(quantity) on every save
// and explicitly zeroes both the moment a listing's variants become empty.
// Under that invariant, a listing with zero real variant rows can only ever
// have price=0/stock=0 through the app's own write path; a zero-variant
// listing whose cache still shows a positive price/stock is stale/orphaned
// data (e.g. a record from before this cache-sync logic existed), never a
// legitimate "variant-less" product — the app always persists at least one
// variant row (flavorId/sizeId possibly both null) for those. Every
// marketplace/store/eligibility computation must therefore derive a
// listing's real offer from its persisted variants ONLY, never from the
// listing's own price/stock columns — this is the one shared implementation
// for that rule (task section 6).
export function computeListingOffer(variants: { price: number; quantity: number }[]): { eligible: boolean; minPrice: number; totalStock: number } {
  // Preserves the pre-existing rule: a variant must have both a positive
  // price AND positive stock to count as a currently purchasable offer — a
  // zero-stock variant is valid CONFIGURATION (kept, shown to the Coffee
  // Owner as unavailable) but never counted into price/stock aggregates.
  const purchasable = variants.filter((v) => v.price > 0 && v.quantity > 0);
  if (!purchasable.length) return { eligible: false, minPrice: 0, totalStock: 0 };
  return {
    eligible: true,
    minPrice: Math.min(...purchasable.map((v) => v.price)),
    totalStock: purchasable.reduce((s, v) => s + v.quantity, 0),
  };
}

// ── DatabaseStorage ───────────────────────────────────────────────────────────

export class DatabaseStorage implements IStorage {
  // Domain instances. See server/STORAGE_ARCHITECTURE.md for the full
  // per-domain ownership map and extraction history; comments here
  // flag only non-obvious facade dependencies and ownership notes.
  private readonly prospecting = new ProspectingStorage();
  private readonly notificationsDomain = new NotificationsStorage();
  // Supplier (accounts, stores, category mappings, listings, product
  // workflow). Facade dependency: getPromotionsForListings (Promotions),
  // saveVariants (Inventory, deliberately not absorbed into Supplier).
  private readonly supplierDomain = new SupplierStorage(this);
  // Facade dependency: getCurrency (still resident on DatabaseStorage).
  private readonly promotionsDomain = new PromotionsStorage(this);
  // Landing Config + Platform Services + Hero/Dark Mode Settings.
  private readonly platformSettingsDomain = new PlatformSettingsStorage();
  private readonly discountCodesDomain = new DiscountCodesStorage();
  private readonly authProviderSettingsDomain = new AuthProviderSettingsStorage();
  private readonly loginSecuritySettingsDomain = new LoginSecuritySettingsStorage();
  // Catalog taxonomy: Categories/SubCategories/Flavors/Sizes/Brands + Favorites.
  private readonly shopCatalogDomain = new ShopCatalogStorage();
  // Cross-entity Reviews — shared review persistence for every reviewable
  // entity type (Product/Supplier/Driver/DeliveryCompany/Maintenance/
  // Marketing/Print/Barista/Academy/Pack), regardless of which domain
  // owns the entity being reviewed.
  private readonly reviewsDomain = new ReviewsStorage();
  // Facade dependency: syncMessagingRelationship (Messages).
  private readonly baristaDomain = new BaristaStorage(this);
  // Facade dependency: syncMessagingRelationship (Messages).
  private readonly maintenanceDomain = new MaintenanceStorage(this);
  // Facade dependency: syncMessagingRelationship (Messages).
  private readonly marketingDomain = new MarketingStorage(this);
  // Facade dependency: getUser (User).
  private readonly printDomain = new PrintStorage(this);
  // Facade dependency: getUser (User), syncMessagingRelationship (Messages).
  // Confirmed zero table overlap with Barista — kept as a separate domain.
  private readonly academyDomain = new AcademyStorage(this);
  // Facade dependency: getMessagingSettings (Platform Settings), getUser (User).
  private readonly messagesDomain = new MessagesStorage(this);
  // Order lifecycle + Returns. 3 helpers genuinely shared with Delivery
  // (recomputeOrderAggregateStatus, generateDeliveryConfirmationCode,
  // buildPackDetails) stay resident on DatabaseStorage and are reached
  // via the facade below, alongside 5 other Delivery/Inventory targets.
  private readonly orderDomain = new OrderStorage(this);
  // Delivery lifecycle, drivers, vehicles, pricing, payouts + ledger,
  // opportunities. Facade dependency: the 3 shared Order helpers above,
  // calculateDeliverySettlement/createCodReconciliationIfApplicable
  // (Settlement/Finance, intentionally not part of Delivery), and
  // getUserByEmail/createUser (User).
  private readonly deliveryDomain = new DeliveryStorage(this);
  private readonly productsDomain = new ProductsStorage();
  // Facade dependency: deleteSupplierListing (Supplier).
  private readonly inventoryDomain = new InventoryStorage(this);
  private readonly packsDomain = new PacksStorage();
  // Product marketplace discovery (not provider-type marketplace cards,
  // which stay in each provider's own domain).
  private readonly marketplaceDomain = new MarketplaceStorage();
  // Generic User identity/account/profile/authentication persistence.
  private readonly userDomain = new UserStorage();

  async getUser(id: number) {
    return this.userDomain.getUser(id);
  }

  async getUserByEmail(email: string) {
    return this.userDomain.getUserByEmail(email);
  }

  async getUserByPhone(phone: string) {
    return this.userDomain.getUserByPhone(phone);
  }

  async hashPassword(plain: string): Promise<string> {
    return this.userDomain.hashPassword(plain);
  }

  async verifyPassword(userId: number, plain: string, stored: string): Promise<boolean> {
    return this.userDomain.verifyPassword(userId, plain, stored);
  }

  async createUser(user: InsertUser) {
    return this.userDomain.createUser(user);
  }

  async updateUserStatus(id: number, status: 'pending' | 'approved' | 'rejected') {
    return this.userDomain.updateUserStatus(id, status);
  }

  async updateUser(id: number, data: Partial<any>) {
    return this.userDomain.updateUser(id, data);
  }

  async deleteUser(id: number) {
    return this.userDomain.deleteUser(id);
  }

  async updateUserLocation(id: number, loc: { address: string; lat: string; lng: string; placeId: string; details?: import("@shared/schema").AddressDetails }) {
    return this.userDomain.updateUserLocation(id, loc);
  }

  async updateUserProfile(id: number, updates: { name?: string; phone?: string; email?: string; password?: string; isWhatsapp?: boolean; profileImageUrl?: string | null; coverImageUrl?: string | null; flashImageUrl?: string | null; locationDetails?: import("@shared/schema").AddressDetails | null }) {
    return this.userDomain.updateUserProfile(id, updates);
  }

  async createPasswordResetCode(userId: number): Promise<string> {
    return this.userDomain.createPasswordResetCode(userId);
  }

  async canRequestNewPasswordResetCode(userId: number): Promise<boolean> {
    return this.userDomain.canRequestNewPasswordResetCode(userId);
  }

  async verifyPasswordResetCode(userId: number, code: string): Promise<
    { ok: true; resetToken: string } | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" }
  > {
    return this.userDomain.verifyPasswordResetCode(userId, code);
  }

  async resetPasswordWithToken(resetToken: string, newPassword: string): Promise<boolean> {
    return this.userDomain.resetPasswordWithToken(resetToken, newPassword);
  }

  async updateUserBilling(id: number, billing: BillingInfo) {
    return this.userDomain.updateUserBilling(id, billing);
  }

  // ── Admin products ──────────────────────────────────────────────────────────

  async getAdminProducts(filters?: { categoryId?: number; subCategoryId?: number; flavorId?: number; sizeId?: number; brandId?: number; search?: string }) {
    return this.productsDomain.getAdminProducts(filters);
  }

  async getProduct(id: number): Promise<ProductWithTaxonomy | undefined> {
    return this.productsDomain.getProduct(id);
  }

  async createProduct(product: Partial<InsertProduct>) {
    return this.productsDomain.createProduct(product);
  }

  async updateProduct(id: number, updates: Partial<InsertProduct>) {
    return this.productsDomain.updateProduct(id, updates);
  }

  async deleteProduct(id: number) {
    return this.productsDomain.deleteProduct(id);
  }

  // ── Legacy product browsing ─────────────────────────────────────────────────

  async getProducts(filters?: { category?: string; supplierId?: number; search?: string }): Promise<ProductWithSupplier[]> {
    return this.productsDomain.getProducts(filters);
  }

  // ── Orders ──────────────────────────────────────────────────────────────────
  // Delivery methods physically filed in this section (createDeliveryForSubOrder,
  // dispatchDelivery, cancelActiveDeliveryForSubOrder) delegate to Delivery, not Order.
  async getOrders(filters?: { cafeId?: number; supplierId?: number; driverId?: number; deliveryCompanyId?: number; viewerRole?: string }): Promise<OrderWithDetails[]> {
    return this.orderDomain.getOrders(filters);
  }

  async getOrder(id: number): Promise<OrderWithDetails | undefined> {
    return this.orderDomain.getOrder(id);
  }

  async canUserAccessOrder(userId: number, userRole: string, orderId: number): Promise<boolean> {
    return this.orderDomain.canUserAccessOrder(userId, userRole, orderId);
  }

  async resolveOrderItems(items: CreateOrderItemInput[]): Promise<CreateOrderItem[]> {
    return this.orderDomain.resolveOrderItems(items);
  }

  async resolvePackOrderItems(items: CreatePackOrderItem[]): Promise<ResolvedPackOrderItem[]> {
    return this.orderDomain.resolvePackOrderItems(items);
  }

  async updateSubOrderStatus(subOrderId: number, status: string): Promise<SubOrder> {
    return this.orderDomain.updateSubOrderStatus(subOrderId, status);
  }

  async confirmSelfPickup(subOrderId: number, cafeOwnerId: number, code: string): Promise<SubOrder> {
    return this.orderDomain.confirmSelfPickup(subOrderId, cafeOwnerId, code);
  }

  /**
   * Recomputes and writes the parent order's aggregate status from its sub-orders.
   * Aggregation rule (unchanged from the original single-writer implementation):
   *   • If ALL sub-orders are CANCELLED → parent = CANCELLED
   *   • Otherwise use the MINIMUM (least-advanced) status among non-cancelled sub-orders —
   *     the order is only as far along as its slowest active supplier.
   * Shared by updateSubOrderStatus() and updateDeliveryStatus() so both the supplier-driven
   * path (sub-order → order) and the delivery-driven path (delivery → sub-order → order)
   * write through the exact same aggregation logic — this is the fix for the one-way
   * desync identified in SHOP_DELIVERY_SYNCHRONIZATION_ANALYSIS.md §7.2/§19.
   *
   * Public (not private) because it is genuinely shared: Order calls it via the
   * facade, Delivery calls it as a plain same-class method. Keep both working.
   */
  async recomputeOrderAggregateStatus(orderId: number, client: any = db): Promise<string> {
    const STATUS_RANK: Record<string, number> = {
      PENDING: 0, CONFIRMED: 1, PREPARING: 2,
      READY: 3, IN_DELIVERY: 4, DELIVERED: 5,
    };
    const siblings = await client.select().from(subOrders).where(eq(subOrders.orderId, orderId));
    const active = siblings.filter((s: SubOrder) => s.status !== 'CANCELLED');
    let aggregateStatus: string;
    if (active.length === 0) {
      aggregateStatus = 'CANCELLED';
    } else {
      const minRank = active.reduce((min: number, s: SubOrder) => {
        const rank = STATUS_RANK[s.status ?? 'PENDING'] ?? 0;
        return rank < min ? rank : min;
      }, Infinity);
      aggregateStatus = Object.keys(STATUS_RANK).find((k) => STATUS_RANK[k] === minRank) ?? 'PENDING';
    }
    await client.update(orders).set({ status: aggregateStatus as any }).where(eq(orders.id, orderId));
    return aggregateStatus;
  }

  async createDeliveryForSubOrder(subOrderId: number, client: any = db): Promise<Delivery | null> {
    return this.deliveryDomain.createDeliveryForSubOrder(subOrderId, client);
  }

  /** 6-digit numeric confirmation code — short enough to read aloud/type on a phone.
   *  Shared by Order and Delivery; public so both can call it. */
  generateDeliveryConfirmationCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  async dispatchDelivery(deliveryId: number, supplierId: number, mode: DeliveryMode, targetDeliveryCompanyId?: number): Promise<Delivery> {
    return this.deliveryDomain.dispatchDelivery(deliveryId, supplierId, mode, targetDeliveryCompanyId);
  }

  async cancelActiveDeliveryForSubOrder(subOrderId: number, client: any = db): Promise<Delivery | null> {
    return this.deliveryDomain.cancelActiveDeliveryForSubOrder(subOrderId, client);
  }

  async getReturns(filters?: { cafeId?: number; supplierId?: number }): Promise<OrderReturn[]> {
    return this.orderDomain.getReturns(filters);
  }

  async createReturn(data: InsertOrderReturn): Promise<OrderReturn> {
    return this.orderDomain.createReturn(data);
  }

  async updateReturnStatus(id: number, status: string, supplierNotes?: string): Promise<OrderReturn> {
    return this.orderDomain.updateReturnStatus(id, status, supplierNotes);
  }

  async deleteOrder(orderId: number): Promise<void> {
    return this.orderDomain.deleteOrder(orderId);
  }

  redactDeliveryCodes(delivery: Delivery, viewerRole?: string): RedactedDelivery {
    return this.deliveryDomain.redactDeliveryCodes(delivery, viewerRole);
  }

  async getDeliveries(userId: number, role: string): Promise<DeliveryWithDetails[]> {
    return this.deliveryDomain.getDeliveries(userId, role);
  }

  async getDelivery(id: number, viewerRole?: string): Promise<DeliveryWithDetails | undefined> {
    return this.deliveryDomain.getDelivery(id, viewerRole);
  }

  async canUserAccessDelivery(userId: number, role: string, deliveryId: number): Promise<boolean> {
    return this.deliveryDomain.canUserAccessDelivery(userId, role, deliveryId);
  }

  async acceptDelivery(deliveryId: number, deliveryCompanyId: number): Promise<Delivery> {
    return this.deliveryDomain.acceptDelivery(deliveryId, deliveryCompanyId);
  }

  async assignDriver(deliveryId: number, actingUser: { id: number; role: string }, driverId: number): Promise<Delivery> {
    return this.deliveryDomain.assignDriver(deliveryId, actingUser, driverId);
  }

  async reassignDriver(deliveryId: number, actingUser: { id: number; role: string }, newDriverId: number): Promise<Delivery> {
    return this.deliveryDomain.reassignDriver(deliveryId, actingUser, newDriverId);
  }

  async updateDeliveryStatus(deliveryId: number, actingUser: { id: number; role: string }, newStatus: DeliveryStatus, code?: string): Promise<Delivery> {
    return this.deliveryDomain.updateDeliveryStatus(deliveryId, actingUser, newStatus, code);
  }

  async recordArrivedAtPickup(deliveryId: number, actingUser: { id: number; role: string }): Promise<Delivery> {
    return this.deliveryDomain.recordArrivedAtPickup(deliveryId, actingUser);
  }

  async getDriversForOwner(ownerType: 'DELIVERY_COMPANY' | 'SUPPLIER', ownerId: number): Promise<User[]> {
    return this.deliveryDomain.getDriversForOwner(ownerType, ownerId);
  }

  async getAssignableDriversForDelivery(deliveryId: number, actingUser: { id: number; role: string }): Promise<{
    delivery: {
      pickupAddress: GeoLocation; destinationAddress: GeoLocation | null;
      distanceKm: string | null; roadDistanceKm: string | null; estimatedDurationMinutes: number | null;
      requiredVehicleType: DeliveryVehicleType | null;
      totalWeightKg: string | null; totalVolumeL: string | null; numberOfPackages: number | null; numberOfItems: number | null;
      isFragile: boolean; specialHandling: string | null;
    };
    drivers: Array<{ id: number; name: string; phone: string | null; vehicleType: DeliveryVehicleType | null; compatible: boolean; reason?: string; expectedPayoutCents: number }>;
  }> {
    return this.deliveryDomain.getAssignableDriversForDelivery(deliveryId, actingUser);
  }

  async createDriverForOwner(ownerType: 'DELIVERY_COMPANY' | 'SUPPLIER', ownerId: number, data: { name: string; email: string; password: string; phone?: string | null; isWhatsapp?: boolean; profileImageUrl?: string | null }): Promise<User> {
    return this.deliveryDomain.createDriverForOwner(ownerType, ownerId, data);
  }

  /** Cafés "associated" with a Supplier (Supplier → Cafes) — the union of every café that
   *  has actually ordered from this supplier (derived from real sub_orders, same technique
   *  as e.g. admin/print-page.tsx's Customers tab) and every café explicitly added through
   *  this supplier's "Add Café" action (users.referredBySupplierId). A café never needs both
   *  to appear; an added-but-not-yet-ordering café still shows up with zero stats. */
  async getSupplierCafes(supplierId: number): Promise<Array<User & { orderCount: number; totalSpent: number; lastOrderAt: Date | null; referred: boolean }>> {
    const rows = await db
      .select({ order: orders, subOrder: subOrders })
      .from(subOrders)
      .innerJoin(orders, eq(subOrders.orderId, orders.id))
      .where(eq(subOrders.supplierId, supplierId));

    const statsByCafe = new Map<number, { orderIds: Set<number>; totalSpent: number; lastOrderAt: Date | null }>();
    for (const { order, subOrder } of rows) {
      let s = statsByCafe.get(order.cafeId);
      if (!s) { s = { orderIds: new Set(), totalSpent: 0, lastOrderAt: null }; statsByCafe.set(order.cafeId, s); }
      s.orderIds.add(order.id);
      if (subOrder.status !== 'CANCELLED') s.totalSpent += subOrder.subtotal;
      const createdAt = order.createdAt as Date | null;
      if (createdAt && (!s.lastOrderAt || createdAt > s.lastOrderAt)) s.lastOrderAt = createdAt;
    }

    const referredRows = await db.select().from(users).where(eq(users.referredBySupplierId, supplierId));
    const referredIds = new Set(referredRows.map((u) => u.id));

    const cafeIds = Array.from(new Set([...Array.from(statsByCafe.keys()), ...Array.from(referredIds)]));
    if (cafeIds.length === 0) return [];
    const cafeUsers = await db.select().from(users).where(inArray(users.id, cafeIds));

    return cafeUsers.map((u) => {
      const s = statsByCafe.get(u.id);
      return {
        ...u,
        orderCount: s ? s.orderIds.size : 0,
        totalSpent: s ? s.totalSpent : 0,
        lastOrderAt: s ? s.lastOrderAt : null,
        referred: referredIds.has(u.id),
      };
    }).sort((a, b) => (b.lastOrderAt?.getTime() ?? 0) - (a.lastOrderAt?.getTime() ?? 0));
  }

  /** Creates a real CAFE_OWNER account, tagged with referredBySupplierId so it appears in
   *  the Supplier's Cafes list immediately — same createUser() pathway Admin's Add User and
   *  createDriverForOwner use, never a separate/isolated café-user system. */
  async createCafeForSupplier(supplierId: number, data: { name: string; email: string; password: string; phone?: string | null; isWhatsapp?: boolean; profileImageUrl?: string | null }): Promise<User> {
    const existing = await this.getUserByEmail(data.email);
    if (existing) throw new Error('Email already exists');
    return this.createUser({
      name: data.name,
      email: data.email,
      password: data.password,
      role: 'CAFE_OWNER',
      status: 'approved', // vetted by the supplier who added it, not the platform admin
      phone: data.phone ?? null,
      isWhatsapp: !!data.isWhatsapp,
      profileImageUrl: data.profileImageUrl?.trim() || null,
      referredBySupplierId: supplierId,
    } as any);
  }

  async getActiveDeliveryForSubOrder(subOrderId: number): Promise<Delivery | undefined> {
    return this.deliveryDomain.getActiveDeliveryForSubOrder(subOrderId);
  }

  async getApprovedDeliveryCompanyIds(): Promise<number[]> {
    return this.deliveryDomain.getApprovedDeliveryCompanyIds();
  }

  // ── Delivery Pricing Engine ─────────────────────────────────────────────────
  async getDeliveryPricingSettings(): Promise<DeliveryPricingSettings> {
    return this.deliveryDomain.getDeliveryPricingSettings();
  }

  async updateDeliveryPricingSettings(updates: Partial<{
    vehiclePricing: Record<DeliveryVehicleType, { pricePerKmCents: number; minFeeCents: number; maxWeightKg?: number; maxVolumeL?: number; maxPackages?: number }>;
    defaultVehicleType: DeliveryVehicleType;
    surgeMultiplierPermille: number;
    surgeLabel: string;
    cafeOwnerSharePercent: number;
    driverPayoutSharePercent: number;
    // Delivery System V2 Phase 4
    activeWeatherCondition: string;
    weatherConditionConfigs: Record<string, { customerMultiplierPermille?: number; driverIncentiveCents?: number; safetyState?: 'ALLOW' | 'ALLOW_WITH_WARNING' | 'RESTRICT' | 'SUSPEND'; restrictedVehicleTypes?: DeliveryVehicleType[] }>;
    peakHourWindows: Array<{ id: string; label: string; daysOfWeek: number[]; startTime: string; endTime: string; customerMultiplierPermille: number; driverIncentiveCents: number; isActive: boolean }>;
    zones: Array<{ id: string; name: string; governorateMatch: string; multiplierPermille?: number; minFeeOverrideCents?: number; isActive: boolean }>;
    waitingFreeMinutes: number;
    waitingPricePerMinuteCents: number;
    waitingDriverCompensationPerMinuteCents: number;
    waitingMaxChargeCents: number | null;
    maxCombinedMultiplierPermille: number;
  }>): Promise<DeliveryPricingSettings> {
    return this.deliveryDomain.updateDeliveryPricingSettings(updates);
  }

  private haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371;
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  private parseLatLng(loc?: { lat?: string | null; lng?: string | null } | null): { lat: number; lng: number } | null {
    if (!loc?.lat || !loc?.lng) return null;
    const lat = Number(loc.lat);
    const lng = Number(loc.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  }

  // haversineKm/parseLatLng are intentionally duplicated (not shared) across
  // several domain files — each also serves unrelated marketplace-proximity
  // methods, so centralizing them would create an unwanted cross-domain import.

  /** Public marketplace location label ("Municipalité, Gouvernorat" or a
   *  fallback derived from the full address) — shown on provider cards instead
   *  of the full street address. Prefers locationDetails when the account has
   *  filled it in. */
  private formatPublicLocation(user: { locationAddress?: string | null; locationDetails?: unknown }): string {
    const details = (user.locationDetails ?? null) as { municipality?: string; governorate?: string } | null;
    const municipality = details?.municipality?.trim();
    const governorate = details?.governorate?.trim();
    if (municipality && governorate && municipality.toLowerCase() !== governorate.toLowerCase()) {
      return `${municipality}, ${governorate}`;
    }
    if (municipality) return `${municipality}, Tunisie`;
    if (governorate) return `${governorate}, Tunisie`;

    const address = user.locationAddress?.trim();
    if (!address) return "";
    const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return "";
    const last = parts[parts.length - 1];
    const isCountry = /tunisia|tunisie/i.test(last);
    const country = isCountry ? last : "Tunisie";
    const cityPart = isCountry ? parts[parts.length - 2] : parts[parts.length - 1];
    if (!cityPart) return country;
    const city = cityPart.replace(/^\d{3,5}\s+/, "").trim(); // strip a leading postal code, e.g. "3000 Sfax"
    return city ? `${city}, ${country}` : country;
  }

  async getFinancialLedgerEntries(filters?: {
    deliveryId?: number; orderId?: number; subOrderId?: number;
    entryType?: string; actorRole?: string; actorUserId?: number; status?: string;
    fromDate?: Date; toDate?: Date;
    page?: number; limit?: number;
  }): Promise<{ entries: FinancialLedgerEntry[]; total: number; page: number; limit: number }> {
    return this.deliveryDomain.getFinancialLedgerEntries(filters);
  }

  async getActorFinancialHistory(actingUser: { id: number; role: string }, filters?: {
    entryType?: string; status?: string; fromDate?: Date; toDate?: Date; page?: number; limit?: number;
  }): Promise<{ entries: FinancialLedgerEntry[]; total: number; page: number; limit: number }> {
    return this.deliveryDomain.getActorFinancialHistory(actingUser, filters);
  }

  /**
   * Delivery System V2 Phase 5B — role-scoped financial summary for ONE delivery (rule 15/19).
   * Authorization reuses the EXISTING canUserAccessDelivery ownership check (never a
   * duplicated rule) and field-level visibility reuses the EXISTING redactDeliveryCodes
   * chokepoint (never a second redaction system) — this method only SHAPES the already-
   * authorized/redacted data into a summary, exactly the rule 15 instruction: "use the
   * existing role-based redaction mechanism rather than duplicating authorization logic".
   *
   * cafeOwnerFeeShareCents/supplierFeeShareCents/deliveryFee are NOT redacted by
   * redactDeliveryCodes today (a pre-existing characteristic of that method, unchanged by
   * Phase 5B — see docs/bigboss-delivery-financial-visibility.md "known limitations"), so
   * this method applies its OWN, stricter field selection for those three specifically,
   * matching rules 9/11/13 exactly: a Coffee Owner never sees driver/company figures, a
   * Driver never sees the customer-facing fee or Coffee Owner/Supplier contribution.
   */
  async getDeliveryFinancialSummary(deliveryId: number, actingUser: { id: number; role: string }): Promise<{
    deliveryId: number; status: string; payoutStatus: 'PENDING' | 'EARNED' | 'VOID';
    deliveryFee: number | null; cafeOwnerContribution: number | null; supplierContribution: number | null;
    freeDeliveryApplied: boolean | null;
    driverPayout: number | null; companyPayout: number | null;
    weatherIncentive: number | null; peakIncentive: number | null; waitingCompensation: number | null;
    supplierSubsidy: number | null; bigBossSubsidy: number | null; budgetResult: string | null; budgetDeficit: number | null;
  }> {
    const canAccess = await this.deliveryDomain.canUserAccessDelivery(actingUser.id, actingUser.role, deliveryId);
    if (!canAccess) throw new Error('Forbidden');
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    if (!row) throw new Error('Delivery not found');
    const redacted = this.deliveryDomain.redactDeliveryCodes(row, actingUser.role);
    const isAdmin = actingUser.role === 'ADMIN' || actingUser.role === 'SUPER_ADMIN';
    const isCafeOwner = actingUser.role === 'CAFE_OWNER';
    const isOperator = actingUser.role === 'SUPPLIER' || actingUser.role === 'DELIVERY_COMPANY';
    const totalDriverPayout = redacted.driverPayoutCents != null ? redacted.driverPayoutCents + (redacted.waitingDriverCompensationCentsUsed ?? 0) : null;
    return {
      deliveryId: row.id, status: row.status, payoutStatus: this.deliveryDomain.computeDeliveryPayoutStatus(row.status),
      // Coffee Owner sees only their own final charge — never the internal cafe/supplier
      // split's SUPPLIER side, never any payout figure (rule 9).
      deliveryFee: isCafeOwner || isOperator || isAdmin ? row.deliveryFee : null,
      cafeOwnerContribution: isCafeOwner || isOperator || isAdmin ? row.cafeOwnerFeeShareCents : null,
      supplierContribution: isOperator || isAdmin ? row.supplierFeeShareCents : null,
      freeDeliveryApplied: row.freeDeliveryApplied,
      driverPayout: totalDriverPayout,
      companyPayout: redacted.companyPayoutCents,
      weatherIncentive: redacted.weatherIncentiveCentsUsed,
      peakIncentive: redacted.peakIncentiveCentsUsed,
      waitingCompensation: redacted.waitingDriverCompensationCentsUsed,
      supplierSubsidy: redacted.supplierSubsidyCents,
      bigBossSubsidy: isAdmin ? row.bigBossSubsidyCents : null,
      budgetResult: isAdmin ? row.budgetResultUsed : null,
      budgetDeficit: isAdmin ? row.budgetDeficitCentsUsed : null,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Delivery System V2 Phase 5C.1 — Settlement Foundation
  // See docs/bigboss-delivery-settlement-architecture.md (design) and
  // docs/bigboss-delivery-settlement-foundation.md (as-built). FINANCIAL LEDGER → SETTLEMENT
  // only — the SETTLEMENT → PAYMENT step does not exist yet (no payments table, no payment
  // provider, no COD reconciliation — see architecture doc §4/§29). This block never
  // recalculates pricing or payout; it only converts already-AUTHORIZED, already-frozen
  // ledger CREDIT entries into a grouped, approvable settlement obligation.
  // ══════════════════════════════════════════════════════════════════════════════════════

  /**
   * The ONLY function that ever writes to settlements/settlementItems. Deterministic,
   * idempotent, and safe to call more than once for the same delivery (architecture doc §14 —
   * same ON CONFLICT DO NOTHING + read-back-on-conflict pattern as createFinancialLedgerEntry).
   *
   * Consumes ONLY already-AUTHORIZED, CREDIT-direction ledger entries — never CALCULATED
   * (still-voidable, pre-completion) and never DEBIT (funding-side — Coffee Owner/Supplier/
   * BigBoss contributions are never settlement recipients, see rule 13/14 of the Phase 5C.1
   * task: "keep the distinction between funding source and settlement recipient very clear").
   * A ledger entry only ever reaches AUTHORIZED once, at the moment updateDeliveryStatus
   * transitions the delivery to DELIVERED (see updateLedgerEntriesStatus's call site) — and
   * since that transition only promotes whichever entries are CURRENTLY CALCULATED (i.e. the
   * single active assignment's entries; every earlier, superseded assignment's entries are
   * already VOID by then — see the Phase 5B hardening assignmentSequence doc), this function
   * never needs to filter by sourceReference/assignmentSequence itself: "status = AUTHORIZED"
   * already guarantees exactly one assignment's worth of entries per delivery, forever.
   *
   * Groups AUTHORIZED CREDIT entries by (actorRole, actorUserId) — in practice this is at
   * most two groups per delivery: DRIVER (always, if a driver was ever paid) and
   * DELIVERY_COMPANY (only in DELIVERY_COMPANY mode). One settlement per group; a settlement's
   * amountCents is the exact sum of its settlementItems, which is the exact sum of the ledger
   * entries it references — reconcilable by construction (see reconcileSettlement).
   *
   * Called automatically, in the SAME transaction as the DELIVERED status transition and the
   * CALCULATED→AUTHORIZED ledger transition (see updateDeliveryStatus) — never as a
   * standalone Admin-triggered endpoint (rule 25 of the Phase 5C.1 task: "prefer internal/
   * service-level calculation if an external endpoint is not necessary"). This also means a
   * delivery that was ALREADY DELIVERED before this phase shipped will NEVER retroactively
   * get a settlement — no backfill, exactly matching the historical-safety discipline
   * established in Phase 5B hardening.
   */
  // Public so DeliveryStorage's updateDeliveryStatus can reach it via the
  // facade. Settlement/Finance infrastructure — deliberately not part of Delivery.
  async calculateDeliverySettlement(deliveryId: number, client: any = db): Promise<Settlement[]> {
    const [delivery] = await client.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    if (!delivery) throw new Error('Delivery not found');

    const creditEntries: FinancialLedgerEntry[] = await client.select().from(deliveryFinancialLedger)
      .where(and(
        eq(deliveryFinancialLedger.deliveryId, deliveryId),
        eq(deliveryFinancialLedger.status, 'AUTHORIZED'),
        eq(deliveryFinancialLedger.direction, 'CREDIT'),
      ));
    if (creditEntries.length === 0) return [];

    const groups = new Map<string, FinancialLedgerEntry[]>();
    for (const entry of creditEntries) {
      const key = `${entry.actorRole}:${entry.actorUserId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    const results: Settlement[] = [];
    for (const entries of Array.from(groups.values())) {
      const first = entries[0];
      const totalAmountCents = entries.reduce((sum, e) => sum + e.amountCents, 0);
      // Shared by construction — see this function's doc above (one AUTHORIZED assignment
      // per delivery, ever).
      const sourceReference = first.sourceReference;
      const sourceEvent = 'DELIVERY_SETTLEMENT';
      const idempotencyKey = `${sourceEvent}:${sourceReference}:${first.actorRole}:${first.actorUserId}`;

      const [inserted] = await client.insert(settlements).values({
        deliveryId, orderId: delivery.orderId, subOrderId: delivery.subOrderId,
        actorRole: first.actorRole, actorUserId: first.actorUserId,
        counterpartyRole: first.counterpartyRole, counterpartyUserId: first.counterpartyUserId,
        amountCents: totalAmountCents, currency: 'TND', status: 'PENDING',
        budgetResultAtCalculation: delivery.budgetResultUsed, budgetDeficitCentsAtCalculation: delivery.budgetDeficitCentsUsed,
        sourceReference, idempotencyKey, calculatedAt: new Date(),
      }).onConflictDoNothing({ target: settlements.idempotencyKey }).returning();

      let settlement: Settlement;
      if (inserted) {
        settlement = inserted;
        // Global uniqueness on settlementItems.ledgerEntryId (schema-enforced) means a ledger
        // entry can never be claimed by a second settlement, even under a bug/race — defense
        // in depth on top of the settlement-level idempotencyKey above.
        for (const entry of entries) {
          await client.insert(settlementItems).values({
            settlementId: settlement.id, ledgerEntryId: entry.id, amountCents: entry.amountCents, entryType: entry.entryType,
          }).onConflictDoNothing({ target: settlementItems.ledgerEntryId });
        }
      } else {
        // Conflict — this exact (delivery, actor) settlement was already calculated (retry,
        // concurrent call). Idempotent no-op: read back and return the existing row, exactly
        // like createFinancialLedgerEntry's own conflict handling.
        const [existing] = await client.select().from(settlements).where(eq(settlements.idempotencyKey, idempotencyKey));
        settlement = existing;
      }
      results.push(settlement);
    }
    return results;
  }

  /**
   * Financial-integrity verification (rule 33 of the Phase 5C.1 task: "the system must be
   * able to answer WHY does this actor have this settlement amount"). Re-derives the
   * settlement's total from its settlementItems and, transitively, their referenced ledger
   * entries — never trusts the stored amountCents at face value. Returns a structured result
   * rather than throwing, so a caller (Admin tooling, tests) can decide how to react; the
   * settlement-creation path itself (calculateDeliverySettlement) is correct by construction
   * (amountCents is literally computed as the sum of the same entries), so a mismatch here
   * would indicate a bug or tampering, never a normal state.
   */
  async reconcileSettlement(settlementId: number): Promise<{ ok: boolean; settlementAmountCents: number; itemsSumCents: number; ledgerSumCents: number; details: string }> {
    const [settlement] = await db.select().from(settlements).where(eq(settlements.id, settlementId));
    if (!settlement) throw new Error('Settlement not found');
    const items = await db.select().from(settlementItems).where(eq(settlementItems.settlementId, settlementId));
    const itemsSumCents = items.reduce((sum, i) => sum + i.amountCents, 0);
    let ledgerSumCents = 0;
    for (const item of items) {
      const [entry] = await db.select().from(deliveryFinancialLedger).where(eq(deliveryFinancialLedger.id, item.ledgerEntryId));
      if (!entry) return { ok: false, settlementAmountCents: settlement.amountCents, itemsSumCents, ledgerSumCents, details: `settlementItem ${item.id} references missing ledger entry ${item.ledgerEntryId}` };
      if (entry.amountCents !== item.amountCents) return { ok: false, settlementAmountCents: settlement.amountCents, itemsSumCents, ledgerSumCents, details: `settlementItem ${item.id} amountCents (${item.amountCents}) does not match its ledger entry's current amountCents (${entry.amountCents})` };
      ledgerSumCents += entry.amountCents;
    }
    const ok = settlement.amountCents === itemsSumCents && itemsSumCents === ledgerSumCents;
    return { ok, settlementAmountCents: settlement.amountCents, itemsSumCents, ledgerSumCents, details: ok ? 'reconciled' : 'settlement.amountCents does not match its items/ledger sum' };
  }

  /**
   * Role-scoped settlement view for ONE delivery (mirrors getDeliveryFinancialSummary's own
   * authorization discipline exactly — rule 24 of the Phase 5C.1 task: "reuse existing
   * authorization patterns, do not duplicate authorization logic unnecessarily"). Reuses the
   * EXISTING canUserAccessDelivery ownership check for delivery-level access, but then applies
   * a STRICTER, settlement-specific filter: a Coffee Owner (or any other role) who can access
   * the delivery overall must still never see a settlement they are neither the actor nor the
   * counterparty of — otherwise a Coffee Owner could read a Driver's payout via this endpoint,
   * exactly the leak Phase 5B hardening closed for redactDeliveryCodes. ADMIN sees everything.
   */
  async getDeliverySettlements(deliveryId: number, actingUser: { id: number; role: string }): Promise<Settlement[]> {
    const canAccess = await this.deliveryDomain.canUserAccessDelivery(actingUser.id, actingUser.role, deliveryId);
    if (!canAccess) throw new Error('Forbidden');
    const rows = await db.select().from(settlements).where(eq(settlements.deliveryId, deliveryId));
    if (actingUser.role === 'ADMIN' || actingUser.role === 'SUPER_ADMIN') return rows;
    return rows.filter((r) =>
      (r.actorRole === actingUser.role && r.actorUserId === actingUser.id) ||
      (r.counterpartyRole === actingUser.role && r.counterpartyUserId === actingUser.id));
  }

  /**
   * Self-service settlement history — same scoping shape as getActorFinancialHistory (rule 24:
   * reuse, never duplicate). DRIVER sees only settlements where it is the actor (its own
   * payouts). SUPPLIER/DELIVERY_COMPANY see settlements where they are the actor (their own
   * DELIVERY_COMPANY_PAYOUT settlements) OR the counterparty (their own driver's settlements —
   * "what my driver is owed, that I owe"). CAFE_OWNER has no settlement history — a Coffee
   * Owner's contribution is always a funding-side ledger entry, never a settlement (rule 13).
   */
  async getActorSettlementHistory(actingUser: { id: number; role: string }, filters?: {
    status?: string; page?: number; limit?: number;
  }): Promise<{ settlements: Settlement[]; total: number; page: number; limit: number }> {
    const role = actingUser.role;
    if (!['DRIVER', 'SUPPLIER', 'DELIVERY_COMPANY'].includes(role)) {
      throw new Error('This role has no settlement history');
    }
    const scopeCondition = (role === 'SUPPLIER' || role === 'DELIVERY_COMPANY')
      ? or(
          and(eq(settlements.actorRole, role), eq(settlements.actorUserId, actingUser.id)),
          and(eq(settlements.counterpartyRole, role), eq(settlements.counterpartyUserId, actingUser.id)),
        )
      : and(eq(settlements.actorRole, role), eq(settlements.actorUserId, actingUser.id));
    const conditions = [scopeCondition];
    if (filters?.status) conditions.push(eq(settlements.status, filters.status as SettlementStatus));
    const where = and(...conditions);
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(Math.max(1, filters?.limit ?? 25), 100);
    const [rows, [{ count }]] = await Promise.all([
      db.select().from(settlements).where(where).orderBy(desc(settlements.calculatedAt)).limit(limit).offset((page - 1) * limit),
      db.select({ count: sql<number>`count(*)::int` }).from(settlements).where(where),
    ]);
    return { settlements: rows, total: count, page, limit };
  }

  /** Admin-only paginated settlement list — mirrors getFinancialLedgerEntries exactly. */
  async getAllSettlements(filters?: {
    deliveryId?: number; orderId?: number; actorRole?: string; actorUserId?: number; status?: string;
    page?: number; limit?: number;
  }): Promise<{ settlements: Settlement[]; total: number; page: number; limit: number }> {
    const conditions = [];
    if (filters?.deliveryId != null) conditions.push(eq(settlements.deliveryId, filters.deliveryId));
    if (filters?.orderId != null) conditions.push(eq(settlements.orderId, filters.orderId));
    if (filters?.actorRole) conditions.push(eq(settlements.actorRole, filters.actorRole));
    if (filters?.actorUserId != null) conditions.push(eq(settlements.actorUserId, filters.actorUserId));
    if (filters?.status) conditions.push(eq(settlements.status, filters.status as SettlementStatus));
    const where = conditions.length ? and(...conditions) : undefined;
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(Math.max(1, filters?.limit ?? 50), 200);
    const [rows, [{ count }]] = await Promise.all([
      db.select().from(settlements).where(where).orderBy(desc(settlements.calculatedAt)).limit(limit).offset((page - 1) * limit),
      db.select({ count: sql<number>`count(*)::int` }).from(settlements).where(where),
    ]);
    return { settlements: rows, total: count, page, limit };
  }

  /** settlementItems for one settlement — Admin/debug detail view ("why is this the amount"). */
  async getSettlementItems(settlementId: number): Promise<SettlementItem[]> {
    return db.select().from(settlementItems).where(eq(settlementItems.settlementId, settlementId));
  }

  /**
   * Admin-only, PENDING→APPROVED. Compare-and-swap on (id, status=PENDING) so a double-click
   * or concurrent approval attempt can only ever succeed once (rule 21/22 of the Phase 5C.1
   * task). Freezes amountCents implicitly — nothing in this method or anywhere else ever
   * edits amountCents after this point (architecture doc §21: "once APPROVED, totalAmountCents
   * is frozen").
   */
  async approveSettlement(settlementId: number, approvedByUserId: number): Promise<Settlement> {
    const [updated] = await db.update(settlements)
      .set({ status: 'APPROVED', approvedAt: new Date(), approvedByUserId })
      .where(and(eq(settlements.id, settlementId), eq(settlements.status, 'PENDING')))
      .returning();
    if (!updated) throw new Error('Settlement not found or not in PENDING status');
    return updated;
  }

  /**
   * Admin-only, PENDING→VOID. Only a PENDING settlement can be voided — never an APPROVED one
   * (architecture doc §3: "VOID... never after PAID"; extended here to "never after APPROVED",
   * since approval is this phase's own amount-freeze point). Voiding an APPROVED settlement
   * would require a correction mechanism (a future ADJUSTMENT/REFUND phase — see architecture
   * doc §10), which is explicitly out of scope for Phase 5C.1.
   */
  async voidSettlement(settlementId: number): Promise<Settlement> {
    const [updated] = await db.update(settlements)
      .set({ status: 'VOID', voidedAt: new Date() })
      .where(and(eq(settlements.id, settlementId), eq(settlements.status, 'PENDING')))
      .returning();
    if (!updated) throw new Error('Settlement not found or not in PENDING status — only a PENDING settlement can be voided');
    return updated;
  }

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Delivery System V2 Phase 5C.2 — Payment Layer, COD Reconciliation, Refunds, Adjustments
  // See docs/bigboss-delivery-financial-strategy.md. SETTLEMENT → PAYMENT and the
  // COD/REFUND/ADJUSTMENT satellites. No external payment provider — internal record-keeping
  // only. Every write here is Admin-only except the two explicit COD exceptions (driver
  // records their own collection; supplier/company records their own remittance) — see each
  // method's own doc.
  // ══════════════════════════════════════════════════════════════════════════════════════

  /**
   * Recomputes a settlement's own status from its CONFIRMED payments alone — never called
   * directly by a route, only by confirmPayment/reversePayment. Purely a derived read of
   * "how much of this settlement's frozen amountCents has CONFIRMED payment coverage right
   * now" — moves the settlement between APPROVED/PARTIALLY_PAID/PAID only (never touches
   * PENDING/VOID, since a payment can only ever be created against an already-APPROVED+
   * settlement — see createPayment's guard). A reversed payment correctly moves a settlement
   * back down (e.g. PAID → PARTIALLY_PAID) — this is a normal derived-status recomputation,
   * not a rewrite of any historical fact: amountCents itself never changes, only the status
   * reflecting current payment coverage.
   */
  private async recomputeSettlementPaymentStatus(settlementId: number, client: any = db): Promise<void> {
    const [settlement] = await client.select().from(settlements).where(eq(settlements.id, settlementId));
    if (!settlement || !['APPROVED', 'PARTIALLY_PAID', 'PAID'].includes(settlement.status)) return;
    const confirmed: Payment[] = await client.select().from(payments)
      .where(and(eq(payments.settlementId, settlementId), eq(payments.status, 'CONFIRMED')));
    const confirmedSum = confirmed.reduce((sum, p) => sum + p.amountCents, 0);
    const newStatus: SettlementStatus = confirmedSum <= 0 ? 'APPROVED' : confirmedSum >= settlement.amountCents ? 'PAID' : 'PARTIALLY_PAID';
    if (newStatus !== settlement.status) {
      await client.update(settlements).set({ status: newStatus }).where(eq(settlements.id, settlementId));
    }
  }

  /**
   * Records a NEW payment intent (status=INITIATED) against an already-APPROVED (or
   * already-PARTIALLY_PAID) settlement. Never recalculates the settlement, never touches the
   * ledger. Idempotent: ON CONFLICT DO NOTHING + read-back on idempotencyKey, exactly the
   * createFinancialLedgerEntry pattern — an Admin double-click submitting the same request
   * twice produces exactly one row. providerReference (when given) is independently
   * unique-constrained at the DB level.
   */
  async createPayment(settlementId: number, params: {
    amountCents: number; method: PaymentMethod; provider?: string | null; providerReference?: string | null; idempotencyKey: string;
  }, createdByUserId: number): Promise<Payment> {
    if (params.amountCents <= 0) throw new Error('Payment amountCents must be positive');
    // Idempotent retry short-circuit — checked BEFORE the settlement-status guard below, so a
    // retry of a payment that itself just caused the settlement to reach PAID/PARTIALLY_PAID
    // still succeeds (it's the SAME fact being re-confirmed, not a new payment attempt against
    // an already-settled obligation). Only a genuinely NEW idempotencyKey is subject to the
    // status guard.
    const [existingByKey] = await db.select().from(payments).where(eq(payments.idempotencyKey, params.idempotencyKey));
    if (existingByKey) return existingByKey;
    const [settlement] = await db.select().from(settlements).where(eq(settlements.id, settlementId));
    if (!settlement) throw new Error('Settlement not found');
    if (!['APPROVED', 'PARTIALLY_PAID'].includes(settlement.status)) {
      throw new Error(`Cannot record a payment against a settlement in ${settlement.status} status — it must be APPROVED (or already PARTIALLY_PAID) first`);
    }
    const [inserted] = await db.insert(payments).values({
      settlementId, amountCents: params.amountCents, currency: settlement.currency,
      method: params.method, provider: params.provider ?? null, providerReference: params.providerReference ?? null,
      status: 'INITIATED', initiatedAt: new Date(), createdByUserId, idempotencyKey: params.idempotencyKey,
    }).onConflictDoNothing({ target: payments.idempotencyKey }).returning();
    if (inserted) return inserted;
    const [existing] = await db.select().from(payments).where(eq(payments.idempotencyKey, params.idempotencyKey));
    return existing;
  }

  /**
   * INITIATED/PENDING → CONFIRMED. Compare-and-swap so a double-click can only ever confirm
   * once. Rejects overpayment: the sum of every OTHER already-CONFIRMED payment for this
   * settlement plus this one must not exceed the settlement's frozen amountCents (architecture
   * doc §9 — "prefer rejecting overpayment" over inventing an adjustment automatically).
   * Immutable afterward: nothing in this codebase ever edits a CONFIRMED payment's amountCents/
   * method/provider — only reversePayment may move it further, to REVERSED.
   *
   * Delivery System V2 Phase 5C.2 hardening — the overpayment check and the confirming UPDATE
   * now run inside one transaction that first takes a row lock on the settlement (`FOR UPDATE`).
   * Without this, two DIFFERENT payments against the SAME settlement being confirmed at nearly
   * the same instant could each read the confirmed-sum BEFORE the other's write lands, each
   * independently pass the overpayment check, and together exceed the settlement's amount — a
   * single-row compare-and-swap on the payment itself cannot protect an aggregate SUM
   * constraint spanning multiple payment rows. The lock serializes concurrent confirmations
   * against the same settlement; every other settlement confirms independently, unaffected.
   */
  async confirmPayment(paymentId: number, _actingAdminUserId: number): Promise<Payment> {
    return db.transaction(async (tx) => {
      const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId));
      if (!payment) throw new Error('Payment not found');
      if (!['INITIATED', 'PENDING'].includes(payment.status)) throw new Error(`Cannot confirm a payment in ${payment.status} status`);
      const [settlement] = await tx.select().from(settlements).where(eq(settlements.id, payment.settlementId)).for('update');
      const otherConfirmed: Payment[] = await tx.select().from(payments)
        .where(and(eq(payments.settlementId, payment.settlementId), eq(payments.status, 'CONFIRMED')));
      const otherSum = otherConfirmed.filter((p) => p.id !== paymentId).reduce((sum, p) => sum + p.amountCents, 0);
      if (otherSum + payment.amountCents > settlement.amountCents) {
        throw new Error(`Confirming this payment (${payment.amountCents} cents) would exceed the settlement's amount (${settlement.amountCents} cents, already ${otherSum} cents confirmed) — overpayment rejected`);
      }
      const [updated] = await tx.update(payments)
        .set({ status: 'CONFIRMED', completedAt: new Date() })
        .where(and(eq(payments.id, paymentId), inArray(payments.status, ['INITIATED', 'PENDING'])))
        .returning();
      if (!updated) throw new Error('Payment status changed concurrently — please retry');
      await this.recomputeSettlementPaymentStatus(payment.settlementId, tx);
      return updated;
    });
  }

  /** INITIATED/PENDING → FAILED. Never affects the settlement's paid-status (it was never counted). */
  async failPayment(paymentId: number, _actingAdminUserId: number): Promise<Payment> {
    const [updated] = await db.update(payments)
      .set({ status: 'FAILED', failedAt: new Date() })
      .where(and(eq(payments.id, paymentId), inArray(payments.status, ['INITIATED', 'PENDING'])))
      .returning();
    if (!updated) throw new Error('Payment not found or not in INITIATED/PENDING status');
    return updated;
  }

  /**
   * CONFIRMED → REVERSED. Status-only transition — amountCents/method/provider are never
   * touched, preserving the payment's own historical content exactly like every other
   * status-only progression in this codebase (ledger entries, settlements). Recomputes the
   * settlement's paid-status afterward (see recomputeSettlementPaymentStatus) since this
   * money is no longer considered received.
   */
  async reversePayment(paymentId: number, _actingAdminUserId: number): Promise<Payment> {
    const [current] = await db.select().from(payments).where(eq(payments.id, paymentId));
    if (!current) throw new Error('Payment not found');
    const [updated] = await db.update(payments)
      .set({ status: 'REVERSED' })
      .where(and(eq(payments.id, paymentId), eq(payments.status, 'CONFIRMED')))
      .returning();
    if (!updated) throw new Error('Only a CONFIRMED payment can be reversed');
    await this.recomputeSettlementPaymentStatus(current.settlementId);
    return updated;
  }

  async getPaymentsForSettlement(settlementId: number): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.settlementId, settlementId)).orderBy(desc(payments.createdAt));
  }

  /** Admin-only paginated payment list. */
  async getAllPayments(filters?: { settlementId?: number; status?: string; method?: string; page?: number; limit?: number }): Promise<{ payments: Payment[]; total: number; page: number; limit: number }> {
    const conditions = [];
    if (filters?.settlementId != null) conditions.push(eq(payments.settlementId, filters.settlementId));
    if (filters?.status) conditions.push(eq(payments.status, filters.status as PaymentStatus));
    if (filters?.method) conditions.push(eq(payments.method, filters.method as PaymentMethod));
    const where = conditions.length ? and(...conditions) : undefined;
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(Math.max(1, filters?.limit ?? 50), 200);
    const [rows, [{ count }]] = await Promise.all([
      db.select().from(payments).where(where).orderBy(desc(payments.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ count: sql<number>`count(*)::int` }).from(payments).where(where),
    ]);
    return { payments: rows, total: count, page, limit };
  }

  // ── COD Reconciliation ──────────────────────────────────────────────────────────────────

  /**
   * Called automatically from the SAME transaction as the DELIVERED status transition (see
   * updateDeliveryStatus), mirroring calculateDeliverySettlement's own trigger exactly. Only
   * creates a row when the order actually used Cash On Delivery — never assumes it (rule:
   * "do not assume DELIVERED means cash was collected", and this doesn't even assume cash is
   * EXPECTED for a non-COD order). expectedAmountCents = subOrder.subtotal + delivery's own
   * frozen deliveryFee — the real, already-existing amount owed for this specific delivery's
   * sub-order, never an invented figure. Idempotent (ON CONFLICT DO NOTHING on the
   * deliveryId unique index) — safe if ever called twice for the same delivery.
   */
  // Public so DeliveryStorage's updateDeliveryStatus can reach it via the
  // facade. COD Reconciliation/Finance infrastructure — not part of Delivery.
  async createCodReconciliationIfApplicable(delivery: Delivery, client: any = db): Promise<void> {
    const [order] = await client.select().from(orders).where(eq(orders.id, delivery.orderId));
    if (!order || order.paymentMethod !== 'CASH_ON_DELIVERY') return;
    const [subOrder] = await client.select().from(subOrders).where(eq(subOrders.id, delivery.subOrderId));
    if (!subOrder) return;
    const expectedAmountCents = (subOrder.subtotal ?? 0) + (delivery.deliveryFee ?? 0);
    await client.insert(codReconciliations).values({
      deliveryId: delivery.id, orderId: delivery.orderId, expectedAmountCents, status: 'EXPECTED',
    }).onConflictDoNothing({ target: codReconciliations.deliveryId });
  }

  /**
   * Driver records their OWN collection for a delivery they were assigned to — the "cash was
   * physically collected" event, distinct from and never inferred from DELIVERED status.
   * EXPECTED → COLLECTED only (compare-and-swap). Authorization: reuses canUserAccessDelivery
   * (never a duplicated ownership rule) — a driver who was never assigned to this delivery is
   * rejected exactly like every other delivery-scoped action in this codebase.
   */
  async recordCashCollected(deliveryId: number, actingUser: { id: number; role: string }, collectedAmountCents: number): Promise<CodReconciliation> {
    if (actingUser.role !== 'DRIVER') throw new Error('Only the assigned driver can record cash collection');
    const canAccess = await this.deliveryDomain.canUserAccessDelivery(actingUser.id, actingUser.role, deliveryId);
    if (!canAccess) throw new Error('Forbidden');
    const [updated] = await db.update(codReconciliations)
      .set({ status: 'COLLECTED', collectedAmountCents, collectedAt: new Date(), collectedByUserId: actingUser.id, updatedAt: new Date() })
      .where(and(eq(codReconciliations.deliveryId, deliveryId), eq(codReconciliations.status, 'EXPECTED')))
      .returning();
    if (!updated) throw new Error('No EXPECTED COD reconciliation found for this delivery (either not a COD order, already collected, or delivery not yet DELIVERED)');
    return updated;
  }

  /**
   * Supplier (SUPPLIER-mode delivery) or Delivery Company (DELIVERY_COMPANY-mode) records
   * having received the cash from their own driver — a separate, later event from
   * collection. COLLECTED → REMITTED only. Authorization: reuses canUserAccessDelivery.
   */
  async recordCashRemitted(deliveryId: number, actingUser: { id: number; role: string }, remittedAmountCents: number): Promise<CodReconciliation> {
    if (!['SUPPLIER', 'DELIVERY_COMPANY'].includes(actingUser.role)) throw new Error('Only the operating Supplier or Delivery Company can record cash remittance');
    const canAccess = await this.deliveryDomain.canUserAccessDelivery(actingUser.id, actingUser.role, deliveryId);
    if (!canAccess) throw new Error('Forbidden');
    const [updated] = await db.update(codReconciliations)
      .set({ status: 'REMITTED', remittedAmountCents, remittedAt: new Date(), remittedByUserId: actingUser.id, updatedAt: new Date() })
      .where(and(eq(codReconciliations.deliveryId, deliveryId), eq(codReconciliations.status, 'COLLECTED')))
      .returning();
    if (!updated) throw new Error('No COLLECTED COD reconciliation found for this delivery (cash must be recorded as collected before it can be remitted)');
    return updated;
  }

  /**
   * Admin-only. REMITTED → RECONCILED (exact match) or REMITTED → DISCREPANCY (mismatch,
   * exposed explicitly — rule: "never silently absorb discrepancies"). discrepancyCents =
   * remittedAmountCents − expectedAmountCents; Finance sees the number either way, the status
   * alone signals whether it requires follow-up.
   */
  async reconcileCod(deliveryId: number, actingAdminUserId: number, notes?: string): Promise<CodReconciliation> {
    const [current] = await db.select().from(codReconciliations).where(eq(codReconciliations.deliveryId, deliveryId));
    if (!current) throw new Error('No COD reconciliation found for this delivery');
    if (current.status !== 'REMITTED') throw new Error(`Cannot reconcile from ${current.status} status — cash must be collected and remitted first`);
    const discrepancyCents = (current.remittedAmountCents ?? 0) - current.expectedAmountCents;
    const [updated] = await db.update(codReconciliations)
      .set({
        status: discrepancyCents === 0 ? 'RECONCILED' : 'DISCREPANCY',
        discrepancyCents, reconciledAt: new Date(), reconciledByUserId: actingAdminUserId,
        notes: notes ?? current.notes, updatedAt: new Date(),
      })
      .where(and(eq(codReconciliations.deliveryId, deliveryId), eq(codReconciliations.status, 'REMITTED')))
      .returning();
    if (!updated) throw new Error('COD reconciliation state changed concurrently — please retry');
    return updated;
  }

  /** Role-scoped read for one delivery — reuses canUserAccessDelivery, never a duplicated rule. */
  async getCodReconciliation(deliveryId: number, actingUser: { id: number; role: string }): Promise<CodReconciliation | undefined> {
    const canAccess = await this.deliveryDomain.canUserAccessDelivery(actingUser.id, actingUser.role, deliveryId);
    if (!canAccess) throw new Error('Forbidden');
    const [row] = await db.select().from(codReconciliations).where(eq(codReconciliations.deliveryId, deliveryId));
    return row;
  }

  /** Admin-only paginated list. */
  async getAllCodReconciliations(filters?: { status?: string; deliveryId?: number; page?: number; limit?: number }): Promise<{ reconciliations: CodReconciliation[]; total: number; page: number; limit: number }> {
    const conditions = [];
    if (filters?.status) conditions.push(eq(codReconciliations.status, filters.status as CodReconciliationStatus));
    if (filters?.deliveryId != null) conditions.push(eq(codReconciliations.deliveryId, filters.deliveryId));
    const where = conditions.length ? and(...conditions) : undefined;
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(Math.max(1, filters?.limit ?? 50), 200);
    const [rows, [{ count }]] = await Promise.all([
      db.select().from(codReconciliations).where(where).orderBy(desc(codReconciliations.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ count: sql<number>`count(*)::int` }).from(codReconciliations).where(where),
    ]);
    return { reconciliations: rows, total: count, page, limit };
  }

  // ── Refunds ──────────────────────────────────────────────────────────────────────────────

  /**
   * Admin-only. Creates a REQUESTED refund fact — never edits the original payment/settlement.
   * Validates the refund doesn't exceed the refundable CONFIRMED amount (sum of CONFIRMED
   * payments for the target, minus already-CONFIRMED refunds against it) at request time; the
   * same check runs again at confirmRefund (defense against a race between two concurrent
   * requests).
   */
  async requestRefund(params: {
    paymentId?: number | null; settlementId?: number | null; amountCents: number; reason: string;
  }, initiatedByUserId: number): Promise<Refund> {
    if (params.amountCents <= 0) throw new Error('Refund amountCents must be positive');
    if (!params.paymentId && !params.settlementId) throw new Error('A refund must reference a paymentId or a settlementId');
    await this.assertRefundWithinRefundableAmount(params.paymentId ?? null, params.settlementId ?? null, params.amountCents);
    const [inserted] = await db.insert(refunds).values({
      paymentId: params.paymentId ?? null, settlementId: params.settlementId ?? null,
      amountCents: params.amountCents, reason: params.reason, status: 'REQUESTED',
      initiatedByUserId, initiatedAt: new Date(),
    }).returning();
    return inserted;
  }

  private async assertRefundWithinRefundableAmount(paymentId: number | null, settlementId: number | null, requestedCents: number, client: any = db): Promise<void> {
    let confirmedCents = 0;
    if (paymentId) {
      const [payment] = await client.select().from(payments).where(eq(payments.id, paymentId));
      if (!payment) throw new Error('Payment not found');
      confirmedCents = payment.status === 'CONFIRMED' ? payment.amountCents : 0;
    } else if (settlementId) {
      const confirmedPayments: Payment[] = await client.select().from(payments).where(and(eq(payments.settlementId, settlementId), eq(payments.status, 'CONFIRMED')));
      confirmedCents = confirmedPayments.reduce((sum: number, p: Payment) => sum + p.amountCents, 0);
    }
    const existingRefunds: Refund[] = await client.select().from(refunds).where(and(
      paymentId ? eq(refunds.paymentId, paymentId) : eq(refunds.settlementId, settlementId!),
      eq(refunds.status, 'CONFIRMED'),
    ));
    const alreadyRefundedCents = existingRefunds.reduce((sum, r) => sum + r.amountCents, 0);
    const refundableCents = confirmedCents - alreadyRefundedCents;
    if (requestedCents > refundableCents) {
      throw new Error(`Refund amount (${requestedCents} cents) exceeds the refundable confirmed amount (${refundableCents} cents)`);
    }
  }

  /**
   * Admin-only. REQUESTED → CONFIRMED, re-validating the refundable cap (race-safety).
   *
   * Delivery System V2 Phase 5C.2 hardening — same class of fix as confirmPayment: the cap
   * check and the confirming UPDATE now run inside one transaction that first locks the
   * referenced payment row (`FOR UPDATE`) — or, for a settlement-only refund, the settlement
   * row. Without this, two concurrent confirmRefund calls for two DIFFERENT REQUESTED refunds
   * against the same payment could each read a stale already-refunded sum and together exceed
   * the refundable amount.
   */
  async confirmRefund(refundId: number, _actingAdminUserId: number): Promise<Refund> {
    return db.transaction(async (tx) => {
      const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId));
      if (!refund) throw new Error('Refund not found');
      if (refund.status !== 'REQUESTED') throw new Error(`Cannot confirm a refund in ${refund.status} status`);
      if (refund.paymentId) {
        await tx.select().from(payments).where(eq(payments.id, refund.paymentId)).for('update');
      } else if (refund.settlementId) {
        await tx.select().from(settlements).where(eq(settlements.id, refund.settlementId)).for('update');
      }
      await this.assertRefundWithinRefundableAmount(refund.paymentId, refund.settlementId, refund.amountCents, tx);
      const [updated] = await tx.update(refunds)
        .set({ status: 'CONFIRMED', completedAt: new Date() })
        .where(and(eq(refunds.id, refundId), eq(refunds.status, 'REQUESTED')))
        .returning();
      if (!updated) throw new Error('Refund status changed concurrently — please retry');
      return updated;
    });
  }

  async failRefund(refundId: number, _actingAdminUserId: number): Promise<Refund> {
    const [updated] = await db.update(refunds).set({ status: 'FAILED' }).where(and(eq(refunds.id, refundId), eq(refunds.status, 'REQUESTED'))).returning();
    if (!updated) throw new Error('Refund not found or not in REQUESTED status');
    return updated;
  }

  async cancelRefund(refundId: number, _actingAdminUserId: number): Promise<Refund> {
    const [updated] = await db.update(refunds).set({ status: 'CANCELLED' }).where(and(eq(refunds.id, refundId), eq(refunds.status, 'REQUESTED'))).returning();
    if (!updated) throw new Error('Refund not found or not in REQUESTED status');
    return updated;
  }

  async getAllRefunds(filters?: { paymentId?: number; settlementId?: number; status?: string; page?: number; limit?: number }): Promise<{ refunds: Refund[]; total: number; page: number; limit: number }> {
    const conditions = [];
    if (filters?.paymentId != null) conditions.push(eq(refunds.paymentId, filters.paymentId));
    if (filters?.settlementId != null) conditions.push(eq(refunds.settlementId, filters.settlementId));
    if (filters?.status) conditions.push(eq(refunds.status, filters.status as RefundStatus));
    const where = conditions.length ? and(...conditions) : undefined;
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(Math.max(1, filters?.limit ?? 50), 200);
    const [rows, [{ count }]] = await Promise.all([
      db.select().from(refunds).where(where).orderBy(desc(refunds.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ count: sql<number>`count(*)::int` }).from(refunds).where(where),
    ]);
    return { refunds: rows, total: count, page, limit };
  }

  // ── Adjustments ──────────────────────────────────────────────────────────────────────────

  /**
   * Admin-only, single-step (no lifecycle — the act of creating this row IS the correction).
   * Never modifies the ledgerEntryId/settlementId it references. amountCents is always
   * positive; direction carries the sign, exactly the deliveryFinancialLedger convention.
   */
  async createAdjustment(params: {
    ledgerEntryId?: number | null; settlementId?: number | null; amountCents: number; direction: 'CREDIT' | 'DEBIT'; reason: string;
  }, createdByUserId: number): Promise<Adjustment> {
    if (params.amountCents <= 0) throw new Error('Adjustment amountCents must be positive — direction carries the sign/meaning');
    if (!params.ledgerEntryId && !params.settlementId) throw new Error('An adjustment must reference a ledgerEntryId or a settlementId');
    const [inserted] = await db.insert(adjustments).values({
      ledgerEntryId: params.ledgerEntryId ?? null, settlementId: params.settlementId ?? null,
      amountCents: params.amountCents, direction: params.direction, reason: params.reason, createdByUserId,
    }).returning();
    return inserted;
  }

  async getAllAdjustments(filters?: { ledgerEntryId?: number; settlementId?: number; page?: number; limit?: number }): Promise<{ adjustments: Adjustment[]; total: number; page: number; limit: number }> {
    const conditions = [];
    if (filters?.ledgerEntryId != null) conditions.push(eq(adjustments.ledgerEntryId, filters.ledgerEntryId));
    if (filters?.settlementId != null) conditions.push(eq(adjustments.settlementId, filters.settlementId));
    const where = conditions.length ? and(...conditions) : undefined;
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(Math.max(1, filters?.limit ?? 50), 200);
    const [rows, [{ count }]] = await Promise.all([
      db.select().from(adjustments).where(where).orderBy(desc(adjustments.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ count: sql<number>`count(*)::int` }).from(adjustments).where(where),
    ]);
    return { adjustments: rows, total: count, page, limit };
  }

  // ── Admin Financial Summary (rule 6/2 — clearly labeled per category, never blended) ─────

  /**
   * Aggregate totals across every layer, clearly separated (ECONOMIC/SETTLEMENT/PAYMENT/COD/
   * REFUNDS/ADJUSTMENTS — never combined into one "profit" figure). Optional date range
   * filters on the natural per-layer timestamp (deliveries.feeFinalizedAt, settlements.
   * calculatedAt, payments.createdAt, codReconciliations.createdAt). Optional actor filter
   * (actorUserId) narrows SETTLEMENT/PAYMENT to one driver/company — the §2 "per driver/
   * company and date range" requirement — without any new batching/grouping schema.
   */
  async getAdminFinancialSummary(filters?: { fromDate?: Date; toDate?: Date; actorUserId?: number }): Promise<{
    economic: { totalDeliveryFeeCents: number; totalDriverPayoutCents: number; totalCompanyPayoutCents: number; totalSupplierContributionCents: number; totalSupplierSubsidyCents: number; totalDeficitCents: number; deliveryCount: number };
    settlement: Record<string, { count: number; amountCents: number }>;
    payment: Record<string, { count: number; amountCents: number }>;
    cod: Record<string, { count: number; expectedCents: number }>;
    refunds: { confirmedCount: number; confirmedAmountCents: number };
    adjustments: { creditAmountCents: number; debitAmountCents: number; count: number };
  }> {
    const dConditions = [isNotNull(deliveries.feeFinalizedAt)];
    if (filters?.fromDate) dConditions.push(gte(deliveries.feeFinalizedAt, filters.fromDate));
    if (filters?.toDate) dConditions.push(lte(deliveries.feeFinalizedAt, filters.toDate));
    const econRows = await db.select({
      deliveryFee: deliveries.deliveryFee, driverPayoutCents: deliveries.driverPayoutCents, companyPayoutCents: deliveries.companyPayoutCents,
      supplierFeeShareCents: deliveries.supplierFeeShareCents, supplierSubsidyCents: deliveries.supplierSubsidyCents, budgetDeficitCentsUsed: deliveries.budgetDeficitCentsUsed,
    }).from(deliveries).where(and(...dConditions));
    const economic = econRows.reduce((acc, r) => {
      acc.totalDeliveryFeeCents += r.deliveryFee ?? 0;
      acc.totalDriverPayoutCents += r.driverPayoutCents ?? 0;
      acc.totalCompanyPayoutCents += r.companyPayoutCents ?? 0;
      acc.totalSupplierContributionCents += r.supplierFeeShareCents ?? 0;
      acc.totalSupplierSubsidyCents += r.supplierSubsidyCents ?? 0;
      acc.totalDeficitCents += r.budgetDeficitCentsUsed ?? 0;
      acc.deliveryCount += 1;
      return acc;
    }, { totalDeliveryFeeCents: 0, totalDriverPayoutCents: 0, totalCompanyPayoutCents: 0, totalSupplierContributionCents: 0, totalSupplierSubsidyCents: 0, totalDeficitCents: 0, deliveryCount: 0 });

    const sConditions = [];
    if (filters?.fromDate) sConditions.push(gte(settlements.calculatedAt, filters.fromDate));
    if (filters?.toDate) sConditions.push(lte(settlements.calculatedAt, filters.toDate));
    if (filters?.actorUserId != null) sConditions.push(eq(settlements.actorUserId, filters.actorUserId));
    const sWhere = sConditions.length ? and(...sConditions) : undefined;
    const settlementRows = await db.select({ status: settlements.status, count: sql<number>`count(*)::int`, amountCents: sql<number>`coalesce(sum(${settlements.amountCents}),0)::int` })
      .from(settlements).where(sWhere).groupBy(settlements.status);
    const settlement: Record<string, { count: number; amountCents: number }> = {};
    for (const r of settlementRows) settlement[r.status] = { count: r.count, amountCents: r.amountCents };

    const pConditions = [];
    if (filters?.fromDate) pConditions.push(gte(payments.createdAt, filters.fromDate));
    if (filters?.toDate) pConditions.push(lte(payments.createdAt, filters.toDate));
    const pWhere = filters?.actorUserId != null
      ? and(inArray(payments.settlementId, db.select({ id: settlements.id }).from(settlements).where(eq(settlements.actorUserId, filters.actorUserId))), ...pConditions)
      : (pConditions.length ? and(...pConditions) : undefined);
    const paymentRows = await db.select({ status: payments.status, count: sql<number>`count(*)::int`, amountCents: sql<number>`coalesce(sum(${payments.amountCents}),0)::int` })
      .from(payments).where(pWhere).groupBy(payments.status);
    const payment: Record<string, { count: number; amountCents: number }> = {};
    for (const r of paymentRows) payment[r.status] = { count: r.count, amountCents: r.amountCents };

    const cConditions = [];
    if (filters?.fromDate) cConditions.push(gte(codReconciliations.createdAt, filters.fromDate));
    if (filters?.toDate) cConditions.push(lte(codReconciliations.createdAt, filters.toDate));
    const cWhere = cConditions.length ? and(...cConditions) : undefined;
    const codRows = await db.select({ status: codReconciliations.status, count: sql<number>`count(*)::int`, expectedCents: sql<number>`coalesce(sum(${codReconciliations.expectedAmountCents}),0)::int` })
      .from(codReconciliations).where(cWhere).groupBy(codReconciliations.status);
    const cod: Record<string, { count: number; expectedCents: number }> = {};
    for (const r of codRows) cod[r.status] = { count: r.count, expectedCents: r.expectedCents };

    const [refundRow] = await db.select({ count: sql<number>`count(*)::int`, amountCents: sql<number>`coalesce(sum(${refunds.amountCents}),0)::int` })
      .from(refunds).where(eq(refunds.status, 'CONFIRMED'));

    const adjustmentRows = await db.select({ direction: adjustments.direction, count: sql<number>`count(*)::int`, amountCents: sql<number>`coalesce(sum(${adjustments.amountCents}),0)::int` })
      .from(adjustments).groupBy(adjustments.direction);
    const creditRow = adjustmentRows.find((r) => r.direction === 'CREDIT');
    const debitRow = adjustmentRows.find((r) => r.direction === 'DEBIT');

    return {
      economic,
      settlement,
      payment,
      cod,
      refunds: { confirmedCount: refundRow?.count ?? 0, confirmedAmountCents: refundRow?.amountCents ?? 0 },
      adjustments: {
        creditAmountCents: creditRow?.amountCents ?? 0, debitAmountCents: debitRow?.amountCents ?? 0,
        count: (creditRow?.count ?? 0) + (debitRow?.count ?? 0),
      },
    };
  }

  /**
   * Self-service equivalent of getAdminFinancialSummary, scoped to ONE actor (Driver or
   * Delivery Company) — "Owed/Approved/Paid/Outstanding" for the Phase 5C.2 §7 driver/
   * supplier/company visibility completion. Reuses the exact same settlement/payment scoping
   * discipline as getActorSettlementHistory (never a duplicated authorization rule).
   */
  async getActorFinancialSummary(actingUser: { id: number; role: string }): Promise<{
    owedCents: number; approvedCents: number; paidCents: number; outstandingCents: number;
  }> {
    if (!['DRIVER', 'SUPPLIER', 'DELIVERY_COMPANY'].includes(actingUser.role)) {
      throw new Error('This role has no settlement-based financial summary');
    }
    const role = actingUser.role;
    const scopeCondition = (role === 'SUPPLIER' || role === 'DELIVERY_COMPANY')
      ? or(
          and(eq(settlements.actorRole, role), eq(settlements.actorUserId, actingUser.id)),
          and(eq(settlements.counterpartyRole, role), eq(settlements.counterpartyUserId, actingUser.id)),
        )
      : and(eq(settlements.actorRole, role), eq(settlements.actorUserId, actingUser.id));
    const rows: Settlement[] = await db.select().from(settlements).where(scopeCondition);
    let owedCents = 0, approvedCents = 0, paidCents = 0;
    for (const s of rows) {
      if (s.status === 'VOID') continue;
      owedCents += s.amountCents;
      if (s.status === 'APPROVED' || s.status === 'PARTIALLY_PAID' || s.status === 'PAID') approvedCents += s.amountCents;
      if (s.status === 'PAID') paidCents += s.amountCents;
      else if (s.status === 'PARTIALLY_PAID') {
        const confirmed: Payment[] = await db.select().from(payments).where(and(eq(payments.settlementId, s.id), eq(payments.status, 'CONFIRMED')));
        paidCents += confirmed.reduce((sum, p) => sum + p.amountCents, 0);
      }
    }
    return { owedCents, approvedCents, paidCents, outstandingCents: owedCents - paidCents };
  }

  async estimateDeliveryFee(params: {
    supplierId: number;
    subtotalCents: number;
    cafeLocation: { lat?: string | null; lng?: string | null; details?: { governorate?: string } | null } | null;
  }): Promise<{ estimatedFeeCents: number; estimatedCafeOwnerCents: number; vehicleType: DeliveryVehicleType; distanceKm: number; freeDeliveryApplied: boolean }> {
    return this.deliveryDomain.estimateDeliveryFee(params);
  }

  async updateSubOrderTransportRequirements(subOrderId: number, supplierId: number, updates: {
    requiredVehicleType?: DeliveryVehicleType | null;
    totalWeightKg?: string | null;
    totalVolumeL?: string | null;
    numberOfPackages?: number | null;
    numberOfItems?: number | null;
    isFragile?: boolean;
    specialHandling?: string | null;
  }): Promise<SubOrder> {
    return this.deliveryDomain.updateSubOrderTransportRequirements(subOrderId, supplierId, updates);
  }

  async suggestRequiredVehicleType(requirements: { totalWeightKg?: string | null; totalVolumeL?: string | null; numberOfPackages?: number | null }): Promise<DeliveryVehicleType | null> {
    return this.deliveryDomain.suggestRequiredVehicleType(requirements);
  }

  // ── Vehicles ──────────────────────────────────────────────────────────────────
  async getVehiclesForOwner(ownerType: DeliveryMode, ownerId: number): Promise<Vehicle[]> {
    return this.deliveryDomain.getVehiclesForOwner(ownerType, ownerId);
  }

  async getVehicleForDriver(driverId: number): Promise<Vehicle | undefined> {
    return this.deliveryDomain.getVehicleForDriver(driverId);
  }

  async getDriverProfile(userId: number): Promise<DriverProfile> {
    return this.deliveryDomain.getDriverProfile(userId);
  }

  async upsertDriverProfile(userId: number, updates: Partial<InsertDriverProfile>): Promise<DriverProfile> {
    return this.deliveryDomain.upsertDriverProfile(userId, updates);
  }

  async createVehicle(ownerType: DeliveryMode, ownerId: number, data: Partial<InsertVehicle>): Promise<Vehicle> {
    return this.deliveryDomain.createVehicle(ownerType, ownerId, data);
  }

  async updateVehicle(id: number, ownerType: DeliveryMode, ownerId: number, data: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    return this.deliveryDomain.updateVehicle(id, ownerType, ownerId, data);
  }

  async deleteVehicle(id: number, ownerType: DeliveryMode, ownerId: number): Promise<void> {
    return this.deliveryDomain.deleteVehicle(id, ownerType, ownerId);
  }

  async assignVehicleToDriver(vehicleId: number, ownerType: DeliveryMode, ownerId: number, driverId: number | null): Promise<Vehicle> {
    return this.deliveryDomain.assignVehicleToDriver(vehicleId, ownerType, ownerId, driverId);
  }

  // ── Driver Reviews (reuses supplierProductReviews, reviewType='DRIVER') ──────────
  async getDriverReviews(driverId: number): Promise<SupplierProductReview[]> {
    return this.reviewsDomain.getDriverReviews(driverId);
  }

  async getDriverReviewForDelivery(deliveryId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    return this.reviewsDomain.getDriverReviewForDelivery(deliveryId, cafeId);
  }

  async upsertDriverReview(data: { driverId: number; deliveryId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string; cafeOwnerName: string }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    return this.reviewsDomain.upsertDriverReview(data);
  }

  // ── Delivery Opportunities (Delivery Company publishes, eligible Drivers apply) ──────
  async getOpportunitiesForCompany(deliveryCompanyId: number): Promise<DeliveryOpportunity[]> {
    return this.deliveryDomain.getOpportunitiesForCompany(deliveryCompanyId);
  }

  async getOpportunitiesForDriver(driverId: number): Promise<DeliveryOpportunity[]> {
    return this.deliveryDomain.getOpportunitiesForDriver(driverId);
  }

  async createOpportunity(deliveryCompanyId: number, data: { title: string; description?: string; area?: string; vehicleTypeRequired?: DeliveryVehicleType | null; startAt?: Date | null; durationHours?: number | null; compensationCents?: number | null }): Promise<DeliveryOpportunity> {
    return this.deliveryDomain.createOpportunity(deliveryCompanyId, data);
  }

  async closeOpportunity(id: number, deliveryCompanyId: number, status: 'CLOSED' | 'CANCELLED'): Promise<DeliveryOpportunity> {
    return this.deliveryDomain.closeOpportunity(id, deliveryCompanyId, status);
  }

  async acceptOpportunity(id: number, driverId: number): Promise<DeliveryOpportunity> {
    return this.deliveryDomain.acceptOpportunity(id, driverId);
  }

  async getReorderData(orderId: number, cafeId: number): Promise<{
    items: import("@shared/schema").CreateOrderItem[];
    packItems: import("@shared/schema").CreatePackOrderItem[];
    unavailable: { name: string; reason: string }[];
  }> {
    return this.orderDomain.getReorderData(orderId, cafeId);
  }

  async createOrder(
    cafeId: number,
    cartItems: CreateOrderItem[],
    opts?: {
      deliveryAddress?: import("@shared/schema").GeoLocation;
      deliveryMethod?: 'SELF_PICKUP' | 'DELIVERY_SERVICE';
      deliveryFee?: number;
      paymentMethod?: string;
      courierInstructions?: string;
      packItems?: ResolvedPackOrderItem[];
      promotionResults?: import("@shared/schema").SupplierPromotionResult[];
      discountCodeResult?: import("@shared/schema").DiscountCodeValidationResult & { supplierId: number };
      priority?: string;
      scheduledAt?: Date;
    },
  ): Promise<Order> {
    return this.orderDomain.createOrder(cafeId, cartItems, opts);
  }

  async updateOrderStatus(id: number, status: typeof orders.$inferSelect.status, deliveryId?: number) {
    return this.orderDomain.updateOrderStatus(id, status, deliveryId);
  }

  async cancelSubOrderItems(subOrderId: number, cafeOwnerId: number, orderItemIds: number[]): Promise<{ subOrder: SubOrder; order: Order }> {
    return this.orderDomain.cancelSubOrderItems(subOrderId, cafeOwnerId, orderItemIds);
  }

  async cancelSupplierSubOrderItems(
    subOrderId: number,
    supplierId: number,
    targets: Array<{ orderItemId: number; quantity: number }>,
  ): Promise<{ subOrder: SubOrder; order: Order; cancelledItemIds: number[] }> {
    return this.orderDomain.cancelSupplierSubOrderItems(subOrderId, supplierId, targets);
  }

  async setOrderFavorite(orderId: number, cafeOwnerId: number, isFavorite: boolean): Promise<Order> {
    return this.orderDomain.setOrderFavorite(orderId, cafeOwnerId, isFavorite);
  }

  async getSubOrderItemsForCartRestore(subOrderId: number, itemIds?: number[]): Promise<{
    regularItems: Array<{
      listingId: number;
      productId: number;
      productName: string;
      productImageUrl: string | null;
      productCategory: string;
      supplierId: number;
      supplierName: string;
      flavorId: number | null;
      sizeId: number | null;
      flavorName: string | null;
      sizeName: string | null;
      unitPrice: number;
      quantity: number;
    }>;
    packItems: Array<{
      packId: number;
      packName: string;
      packImageUrl: string | null;
      supplierId: number;
      supplierName: string;
      unitPrice: number;
      quantity: number;
      includedProducts: Array<{
        productId: number;
        productName: string;
        productImageUrl: string | null;
        brandName: string | null;
        categoryName: string | null;
        subCategoryName: string | null;
        flavorName: string | null;
        sizeName: string | null;
        quantity: number;
      }>;
    }>;
  }> {
    return this.orderDomain.getSubOrderItemsForCartRestore(subOrderId, itemIds);
  }

  // Delegates to Packs, despite being physically filed here apart from the rest of that cluster.
  async getPackComposition(packId: number): Promise<Array<{
    listingId: number;
    variantId: number | null;
    productName: string;
    flavorName: string | null;
    sizeName: string | null;
    quantity: number;
  }>> {
    return this.packsDomain.getPackComposition(packId);
  }

  // ── Marketplace ─────────────────────────────────────────────────────────────
  async getMarketplaceProducts(filters?: { categoryId?: number; subCategoryId?: number; search?: string; supplierId?: number }): Promise<MarketplaceProduct[]> {
    return this.marketplaceDomain.getMarketplaceProducts(filters);
  }

  async getMarketplaceProduct(productId: number, supplierId?: number): Promise<MarketplaceProduct | undefined> {
    return this.marketplaceDomain.getMarketplaceProduct(productId, supplierId);
  }

  async getProductImageData(ids: number[]): Promise<Array<{ id: number; imageUrl: string | null; imageUrls: string[] | null; imageAdjustments: Record<string, number> }>> {
    return this.marketplaceDomain.getProductImageData(ids);
  }

  // Product favorites — delegates to the Catalog Taxonomy domain (ShopCatalogStorage).
  async getFavoritesByUser(userId: number): Promise<ShopFavoriteItem[]> {
    return this.shopCatalogDomain.getFavoritesByUser(userId);
  }

  async addFavorite(userId: number, productId: number): Promise<void> {
    return this.shopCatalogDomain.addFavorite(userId, productId);
  }

  async removeFavorite(userId: number, productId: number): Promise<void> {
    return this.shopCatalogDomain.removeFavorite(userId, productId);
  }

  // ── Maintenance ──────────────────────────────────────────────────────────────
  async getMaintenanceProfiles(filters?: {
    search?: string;
    category?: string;
    profileType?: string;
    available?: boolean;
    location?: string;
    viewerLocation?: { lat?: string | null; lng?: string | null } | null;
  }): Promise<MaintenanceMarketplaceCard[]> {
    return this.maintenanceDomain.getMaintenanceProfiles(filters);
  }

  async getMaintenanceCategories(): Promise<string[]> {
    return this.maintenanceDomain.getMaintenanceCategories();
  }

  async getMaintenanceProfile(userId: number): Promise<MaintenanceProfile> {
    return this.maintenanceDomain.getMaintenanceProfile(userId);
  }

  async getMaintenanceCard(userId: number, viewerLocation?: { lat?: string | null; lng?: string | null } | null): Promise<MaintenanceMarketplaceCard | undefined> {
    return this.maintenanceDomain.getMaintenanceCard(userId, viewerLocation);
  }

  async upsertMaintenanceProfile(userId: number, updates: Partial<InsertMaintenanceProfile>): Promise<MaintenanceProfile> {
    return this.maintenanceDomain.upsertMaintenanceProfile(userId, updates);
  }

  async bulkUpdateMaintenanceOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    return this.maintenanceDomain.bulkUpdateMaintenanceOrder(orders);
  }

  async setMaintenanceAutoApprove(userId: number, autoApprove: boolean): Promise<MaintenanceProfile> {
    return this.maintenanceDomain.setMaintenanceAutoApprove(userId, autoApprove);
  }

  async getMaintenanceReservationsForProvider(userId: number): Promise<(MaintenanceReservation & { cafeOwner: string; ownerPhone: string | null })[]> {
    return this.maintenanceDomain.getMaintenanceReservationsForProvider(userId);
  }

  async getMaintenanceReservationsForOwner(userId: number): Promise<(MaintenanceReservation & { maintenanceName: string })[]> {
    return this.maintenanceDomain.getMaintenanceReservationsForOwner(userId);
  }

  async getMaintenanceRevenueSummary(maintenanceUserId: number): Promise<{
    totalEarnedCents: number; completedReservations: number; currentMonthCents: number; currentMonthReservations: number;
    pendingCents: number; pendingReservations: number; dailyRateInCents: number;
    history: { month: string; totalCents: number; reservations: number }[];
  }> {
    return this.maintenanceDomain.getMaintenanceRevenueSummary(maintenanceUserId);
  }

  async createMaintenanceReservation(data: InsertMaintenanceReservation): Promise<MaintenanceReservation> {
    return this.maintenanceDomain.createMaintenanceReservation(data);
  }

  async cancelMaintenanceReservationByOwner(id: number, cafeOwnerId: number): Promise<MaintenanceReservation | undefined> {
    return this.maintenanceDomain.cancelMaintenanceReservationByOwner(id, cafeOwnerId);
  }

  async adminUpdateMaintenanceReservation(id: number, data: Partial<{
    service: string; date: string; time: string | null; location: string; description: string;
    category: string; urgency: string; contactPhone: string; status: string;
  }>): Promise<MaintenanceReservation | undefined> {
    return this.maintenanceDomain.adminUpdateMaintenanceReservation(id, data);
  }

  async setMaintenanceReservationFrozen(id: number, isFrozen: boolean): Promise<MaintenanceReservation | undefined> {
    return this.maintenanceDomain.setMaintenanceReservationFrozen(id, isFrozen);
  }

  async deleteMaintenanceReservation(id: number): Promise<void> {
    return this.maintenanceDomain.deleteMaintenanceReservation(id);
  }

  async getMaintenanceReservationById(id: number): Promise<MaintenanceReservation | undefined> {
    return this.maintenanceDomain.getMaintenanceReservationById(id);
  }

  async updateMaintenanceReservationStatus(id: number, providerId: number, status: string, schedule?: { date?: string; time?: string | null }): Promise<MaintenanceReservation | undefined> {
    return this.maintenanceDomain.updateMaintenanceReservationStatus(id, providerId, status, schedule);
  }

  async requestMaintenanceReschedule(id: number, providerId: number, proposedDate: string, proposedTime: string | null): Promise<MaintenanceReservation | undefined> {
    return this.maintenanceDomain.requestMaintenanceReschedule(id, providerId, proposedDate, proposedTime);
  }

  async respondToMaintenanceReschedule(id: number, ownerId: number, accepted: boolean): Promise<MaintenanceReservation | undefined> {
    return this.maintenanceDomain.respondToMaintenanceReschedule(id, ownerId, accepted);
  }

  async getMaintenanceReviews(maintenanceUserId: number): Promise<SupplierProductReview[]> {
    return this.reviewsDomain.getMaintenanceReviews(maintenanceUserId);
  }

  async deleteMaintenanceReview(reviewId: number): Promise<boolean> {
    return this.reviewsDomain.deleteMaintenanceReview(reviewId);
  }

  async getMaintenanceReviewForReservation(reservationId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    return this.reviewsDomain.getMaintenanceReviewForReservation(reservationId, cafeId);
  }

  async upsertMaintenanceReview(data: {
    maintenanceUserId: number;
    reservationId: number;
    cafeId: number;
    rating: number;
    comment?: string | null;
    cafeName: string;
    cafeOwnerName: string;
  }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    return this.reviewsDomain.upsertMaintenanceReview(data);
  }

  async getMaintenanceTaxonomy(): Promise<{ competencies: MaintenanceCompetency[]; zones: MaintenanceZone[]; subCompetencies: MaintenanceSubCompetency[] }> {
    return this.maintenanceDomain.getMaintenanceTaxonomy();
  }

  async getAvailableMaintenanceTaxonomy(): Promise<{ competencies: MaintenanceCompetency[]; zones: MaintenanceZone[]; subCompetencies: MaintenanceSubCompetency[] }> {
    return this.maintenanceDomain.getAvailableMaintenanceTaxonomy();
  }

  async getMaintenanceSubCompetencies(competencyId?: number): Promise<MaintenanceSubCompetency[]> {
    return this.maintenanceDomain.getMaintenanceSubCompetencies(competencyId);
  }

  async createMaintenanceSubCompetency(competencyId: number, name: string, icon?: string | null): Promise<MaintenanceSubCompetency> {
    return this.maintenanceDomain.createMaintenanceSubCompetency(competencyId, name, icon);
  }

  async updateMaintenanceSubCompetency(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<MaintenanceSubCompetency | undefined> {
    return this.maintenanceDomain.updateMaintenanceSubCompetency(id, data);
  }

  async deleteMaintenanceSubCompetency(id: number): Promise<void> {
    return this.maintenanceDomain.deleteMaintenanceSubCompetency(id);
  }

  async createMaintenanceCompetency(name: string, icon?: string | null): Promise<MaintenanceCompetency> {
    return this.maintenanceDomain.createMaintenanceCompetency(name, icon);
  }

  async updateMaintenanceCompetency(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<MaintenanceCompetency | undefined> {
    return this.maintenanceDomain.updateMaintenanceCompetency(id, data);
  }

  async deleteMaintenanceCompetency(id: number): Promise<void> {
    return this.maintenanceDomain.deleteMaintenanceCompetency(id);
  }

  async createMaintenanceZone(name: string): Promise<MaintenanceZone> {
    return this.maintenanceDomain.createMaintenanceZone(name);
  }

  async updateMaintenanceZone(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<MaintenanceZone | undefined> {
    return this.maintenanceDomain.updateMaintenanceZone(id, data);
  }

  async deleteMaintenanceZone(id: number): Promise<void> {
    return this.maintenanceDomain.deleteMaintenanceZone(id);
  }

  async getMaintenanceAdminOverview(): Promise<any> {
    return this.maintenanceDomain.getMaintenanceAdminOverview();
  }

  async getMaintenanceFavoritesByUser(userId: number): Promise<number[]> {
    return this.maintenanceDomain.getMaintenanceFavoritesByUser(userId);
  }

  async addMaintenanceFavorite(userId: number, maintenanceUserId: number): Promise<void> {
    return this.maintenanceDomain.addMaintenanceFavorite(userId, maintenanceUserId);
  }

  async removeMaintenanceFavorite(userId: number, maintenanceUserId: number): Promise<void> {
    return this.maintenanceDomain.removeMaintenanceFavorite(userId, maintenanceUserId);
  }

  async isMaintenanceProviderEligible(userId: number): Promise<boolean> {
    return this.maintenanceDomain.isMaintenanceProviderEligible(userId);
  }

  async isMaintenanceProviderSkillMatch(userId: number, job: { categories: string[]; subCategories: string[] }): Promise<boolean> {
    return this.maintenanceDomain.isMaintenanceProviderSkillMatch(userId, job);
  }

  async createMaintenanceJobPost(cafeOwnerId: number, data: Partial<InsertMaintenanceJobPost>): Promise<MaintenanceJobPost> {
    return this.maintenanceDomain.createMaintenanceJobPost(cafeOwnerId, data);
  }

  async updateMaintenanceJobPost(id: number, cafeOwnerId: number, data: Partial<InsertMaintenanceJobPost>): Promise<MaintenanceJobPost | undefined> {
    return this.maintenanceDomain.updateMaintenanceJobPost(id, cafeOwnerId, data);
  }

  async getMaintenanceJobPostById(id: number): Promise<MaintenanceJobPost | undefined> {
    return this.maintenanceDomain.getMaintenanceJobPostById(id);
  }

  async getMaintenanceJobPostsForOwner(cafeOwnerId: number): Promise<MaintenanceJobPostWithStats[]> {
    return this.maintenanceDomain.getMaintenanceJobPostsForOwner(cafeOwnerId);
  }

  async getMaintenanceJobPostWithStats(id: number): Promise<MaintenanceJobPostWithStats | undefined> {
    return this.maintenanceDomain.getMaintenanceJobPostWithStats(id);
  }

  async getDiscoverableMaintenanceJobPosts(maintenanceUserId: number): Promise<(MaintenanceJobPost & { isTargeted: boolean })[]> {
    return this.maintenanceDomain.getDiscoverableMaintenanceJobPosts(maintenanceUserId);
  }

  async addMaintenanceJobTarget(jobPostId: number, maintenanceUserId: number): Promise<MaintenanceJobTarget> {
    return this.maintenanceDomain.addMaintenanceJobTarget(jobPostId, maintenanceUserId);
  }

  async getMaintenanceJobTargets(jobPostId: number): Promise<(MaintenanceJobTarget & { maintenanceName: string; maintenanceProfileImageUrl: string | null })[]> {
    return this.maintenanceDomain.getMaintenanceJobTargets(jobPostId);
  }

  async isMaintenanceJobTargeted(jobPostId: number, maintenanceUserId: number): Promise<boolean> {
    return this.maintenanceDomain.isMaintenanceJobTargeted(jobPostId, maintenanceUserId);
  }

  async createMaintenanceJobApplication(jobPostId: number, maintenanceUserId: number, message?: string | null): Promise<MaintenanceJobApplication> {
    return this.maintenanceDomain.createMaintenanceJobApplication(jobPostId, maintenanceUserId, message);
  }

  async getMaintenanceJobApplicationById(id: number): Promise<MaintenanceJobApplication | undefined> {
    return this.maintenanceDomain.getMaintenanceJobApplicationById(id);
  }

  async hasMaintenanceAppliedToJob(jobPostId: number, maintenanceUserId: number): Promise<boolean> {
    return this.maintenanceDomain.hasMaintenanceAppliedToJob(jobPostId, maintenanceUserId);
  }

  async getMaintenanceJobApplicationsForJob(jobPostId: number): Promise<MaintenanceJobApplicationWithParties[]> {
    return this.maintenanceDomain.getMaintenanceJobApplicationsForJob(jobPostId);
  }

  async getMaintenanceJobApplicationsForProvider(maintenanceUserId: number): Promise<MaintenanceJobApplicationWithParties[]> {
    return this.maintenanceDomain.getMaintenanceJobApplicationsForProvider(maintenanceUserId);
  }

  async rejectMaintenanceJobApplication(id: number): Promise<MaintenanceJobApplication | undefined> {
    return this.maintenanceDomain.rejectMaintenanceJobApplication(id);
  }

  async acceptMaintenanceJobApplication(id: number): Promise<{ application: MaintenanceJobApplication; reservation: MaintenanceReservation } | undefined> {
    return this.maintenanceDomain.acceptMaintenanceJobApplication(id);
  }

  // ── Messaging integration ──
  async refreshMaintenanceMessagingState(reservationId: number): Promise<void> {
    return this.maintenanceDomain.refreshMaintenanceMessagingState(reservationId);
  }

  async createMaintenanceReport(cafeOwnerId: number, maintenanceUserId: number, reason: string, rating?: number): Promise<MaintenanceReport> {
    return this.maintenanceDomain.createMaintenanceReport(cafeOwnerId, maintenanceUserId, reason, rating);
  }

  async getMaintenanceReports(status?: "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED"): Promise<(MaintenanceReport & { cafeOwnerName: string; maintenanceName: string })[]> {
    return this.maintenanceDomain.getMaintenanceReports(status);
  }

  async getMaintenanceReportById(id: number): Promise<MaintenanceReport | undefined> {
    return this.maintenanceDomain.getMaintenanceReportById(id);
  }

  async getMaintenanceReportsByOwner(cafeOwnerId: number): Promise<(MaintenanceReport & {
    maintenanceName: string; maintenanceProfileImageUrl: string | null; maintenanceLocation: string | null;
  })[]> {
    return this.maintenanceDomain.getMaintenanceReportsByOwner(cafeOwnerId);
  }

  async getPublishedMaintenanceReports(page = 1, limit = 10): Promise<{ reports: (Pick<MaintenanceReport, "id" | "maintenanceUserId" | "reason" | "rating" | "createdAt" | "resolvedAt"> & { maintenanceName: string; maintenanceProfileImageUrl: string | null })[]; total: number; page: number; limit: number }> {
    return this.maintenanceDomain.getPublishedMaintenanceReports(page, limit);
  }

  async resolveMaintenanceReport(id: number, status: "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED", resolutionNote?: string, moderatedByAdminId?: number): Promise<MaintenanceReport | undefined> {
    return this.maintenanceDomain.resolveMaintenanceReport(id, status, resolutionNote, moderatedByAdminId);
  }

  // ── DELIVERY COMPANY ─────────────────────────────────────────────────────────
  // Mirrors the Maintenance storage section above exactly (one profile per
  // owner, ownership-in-WHERE mutations, reviews on the shared
  // supplierProductReviews table) — the difference is drivers/vehicles are
  // NEVER stored here: getDeliveryCompanyCard/-Profiles call the existing
  // getDriversForOwner/getVehiclesForOwner methods (already used by Espace
  // Livraison's own Chauffeurs/Véhicules pages) and sanitize down to safe
  // public fields, so there is exactly one real driver/vehicle list, not a
  // second copy for the marketplace card.

  async getDeliveryCompanyProfile(userId: number): Promise<DeliveryCompanyProfile> {
    const [profile] = await db.select().from(deliveryCompanyProfiles)
      .where(eq(deliveryCompanyProfiles.userId, userId));
    if (profile) return profile;
    const [created] = await db.insert(deliveryCompanyProfiles).values({ userId }).returning();
    return created;
  }

  async upsertDeliveryCompanyProfile(userId: number, updates: Partial<InsertDeliveryCompanyProfile>): Promise<DeliveryCompanyProfile> {
    const current = await this.getDeliveryCompanyProfile(userId);
    const [updated] = await db.update(deliveryCompanyProfiles)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(deliveryCompanyProfiles.id, current.id))
      .returning();
    return updated;
  }

  /** Sanitized driver list for a public card/modal — never the raw User row
   *  (password hash, email, etc.). "busy" is derived from real active
   *  deliveries (ASSIGNED/PICKED_UP/IN_TRANSIT), never an invented status. */
  private async getDeliveryCompanyDriverCards(companyId: number): Promise<{ id: number; name: string; profileImageUrl: string | null; busy: boolean }[]> {
    const drivers = await this.deliveryDomain.getDriversForOwner('DELIVERY_COMPANY', companyId);
    if (drivers.length === 0) return [];
    const driverIds = drivers.map((d) => d.id);
    const activeDeliveries = await db.select({ driverId: deliveries.driverId }).from(deliveries)
      .where(and(inArray(deliveries.driverId, driverIds), inArray(deliveries.status, ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'])));
    const busyIds = new Set(activeDeliveries.map((d) => d.driverId));
    return drivers.map((d) => ({ id: d.id, name: d.name, profileImageUrl: d.profileImageUrl ?? null, busy: busyIds.has(d.id) }));
  }

  private async getDeliveryCompanyVehicleCards(companyId: number): Promise<Vehicle[]> {
    return this.getVehiclesForOwner('DELIVERY_COMPANY', companyId);
  }

  async getDeliveryCompanyProfiles(filters?: {
    search?: string;
    available?: boolean;
    location?: string;
    viewerLocation?: { lat?: string | null; lng?: string | null } | null;
  }): Promise<DeliveryCompanyMarketplaceCard[]> {
    const rows = await db.select({ profile: deliveryCompanyProfiles, user: users })
      .from(deliveryCompanyProfiles)
      .innerJoin(users, eq(deliveryCompanyProfiles.userId, users.id))
      .where(and(
        eq(users.role, "DELIVERY_COMPANY" as any),
        eq(users.status, "approved"),
        eq(deliveryCompanyProfiles.marketplaceVisible, true),
        eq(deliveryCompanyProfiles.isOnVacation, false),
        // GO Live (Phase 5E) — one more AND-gate, never a replacement.
        eq(deliveryCompanyProfiles.publicationStatus, "APPROVED"),
      ));

    const companyIds = rows.map(({ profile }) => profile.userId);
    const reviewRows = companyIds.length
      ? await db.select({
          deliveryCompanyUserId: supplierProductReviews.deliveryCompanyUserId,
          rating: supplierProductReviews.rating,
        }).from(supplierProductReviews).where(and(
          eq(supplierProductReviews.reviewType, "DELIVERY_COMPANY"),
          inArray(supplierProductReviews.deliveryCompanyUserId as any, companyIds),
        ))
      : [];
    const reviewStats = new Map<number, { total: number; sum: number }>();
    for (const review of reviewRows) {
      if (!review.deliveryCompanyUserId) continue;
      const current = reviewStats.get(review.deliveryCompanyUserId) ?? { total: 0, sum: 0 };
      current.total += 1;
      current.sum += review.rating;
      reviewStats.set(review.deliveryCompanyUserId, current);
    }

    const viewerPos = filters?.viewerLocation ? this.parseLatLng(filters.viewerLocation) : null;

    const cards = await Promise.all(rows.map(async ({ profile, user }) => {
      const stats = reviewStats.get(profile.userId);
      const providerPos = this.parseLatLng({ lat: user.locationLat, lng: user.locationLng });
      const distanceKm = viewerPos && providerPos ? Math.round(this.haversineKm(viewerPos, providerPos) * 10) / 10 : null;
      const [drivers, vehicleList] = await Promise.all([
        this.getDeliveryCompanyDriverCards(profile.userId),
        this.getDeliveryCompanyVehicleCards(profile.userId),
      ]);
      return {
        ...profile,
        rating: stats ? Math.round((stats.sum / stats.total) * 10) : 0,
        reviewCount: stats?.total ?? 0,
        name: user.name,
        phone: user.phone ?? null,
        profileImageUrl: user.profileImageUrl ?? null,
        location: user.locationAddress ?? profile.deliveryZones ?? "",
        initials: user.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
        available: !profile.isOnVacation,
        driverCount: drivers.length,
        vehicleCount: vehicleList.length,
        distanceKm,
      } as DeliveryCompanyMarketplaceCard;
    }));

    const query = filters?.search?.trim().toLowerCase();
    return cards.filter((card) => {
      if (query) {
        const haystack = [card.name, card.description, card.location, card.deliveryZones].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filters?.available !== undefined && card.available !== filters.available) return false;
      if (filters?.location && card.location !== filters.location) return false;
      return true;
    });
  }

  // Single-company public card — sanitized shape used for the Supplier-facing
  // Details modal and the Delivery Company's own Eye preview, mirroring
  // getMaintenanceCard exactly.
  async getDeliveryCompanyCard(userId: number, viewerLocation?: { lat?: string | null; lng?: string | null } | null): Promise<DeliveryCompanyMarketplaceCard | undefined> {
    const [row] = await db.select({ profile: deliveryCompanyProfiles, user: users })
      .from(deliveryCompanyProfiles)
      .innerJoin(users, eq(deliveryCompanyProfiles.userId, users.id))
      .where(eq(deliveryCompanyProfiles.userId, userId));
    if (!row) return undefined;
    const reviews = await db.select({ rating: supplierProductReviews.rating }).from(supplierProductReviews)
      .where(and(eq(supplierProductReviews.reviewType, "DELIVERY_COMPANY"), eq(supplierProductReviews.deliveryCompanyUserId as any, userId)));
    const rating = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) : 0;
    const viewerPos = viewerLocation ? this.parseLatLng(viewerLocation) : null;
    const providerPos = this.parseLatLng({ lat: row.user.locationLat, lng: row.user.locationLng });
    const distanceKm = viewerPos && providerPos ? Math.round(this.haversineKm(viewerPos, providerPos) * 10) / 10 : null;
    const [drivers, vehicleList] = await Promise.all([
      this.getDeliveryCompanyDriverCards(userId),
      this.getDeliveryCompanyVehicleCards(userId),
    ]);
    return {
      ...row.profile,
      userId: row.user.id,
      name: row.user.name,
      phone: row.user.phone ?? null,
      profileImageUrl: row.user.profileImageUrl ?? null,
      coverImageUrl: row.user.coverImageUrl ?? null,
      flashImageUrl: row.user.flashImageUrl ?? null,
      location: row.user.locationAddress ?? row.profile.deliveryZones ?? "",
      initials: row.user.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
      available: !row.profile.isOnVacation,
      driverCount: drivers.length,
      vehicleCount: vehicleList.length,
      distanceKm,
      rating,
      reviewCount: reviews.length,
    };
  }

  /** The real driver/vehicle sections shown inside the details modal — never a
   *  second data source, always the same rosters Business → Chauffeurs/Véhicules use. */
  async getDeliveryCompanyDrivers(userId: number) { return this.getDeliveryCompanyDriverCards(userId); }
  async getDeliveryCompanyVehicles(userId: number) { return this.getDeliveryCompanyVehicleCards(userId); }

  async getDeliveryCompanyReviews(deliveryCompanyUserId: number): Promise<SupplierProductReview[]> {
    return this.reviewsDomain.getDeliveryCompanyReviews(deliveryCompanyUserId);
  }

  // Driver Reviews & Performance Dashboard (task: "Delivery Company — Driver Reviews &
  // Performance Dashboard") — see reviews.storage.ts for the enrichment logic.
  async getDeliveryCompanyDriverReviews(deliveryCompanyUserId: number): Promise<DeliveryCompanyDriverReview[]> {
    return this.reviewsDomain.getDeliveryCompanyDriverReviews(deliveryCompanyUserId);
  }

  // Fix Delivery Company Avis — Include Coffee Owner Reviews of Its Drivers — see
  // reviews.storage.ts for the scoping/enrichment logic. Deliberately separate from
  // getDeliveryCompanyDriverReviews above (different reviewer/target population).
  async getDriverReviewsForDeliveryCompany(deliveryCompanyUserId: number): Promise<CompanyDriverPerformanceReview[]> {
    return this.reviewsDomain.getDriverReviewsForDeliveryCompany(deliveryCompanyUserId);
  }

  async getDeliveryCompanyReviewForDelivery(deliveryId: number, supplierId: number): Promise<SupplierProductReview | undefined> {
    return this.reviewsDomain.getDeliveryCompanyReviewForDelivery(deliveryId, supplierId);
  }

  async upsertDeliveryCompanyReview(data: {
    deliveryCompanyUserId: number;
    deliveryId: number;
    supplierId: number;
    rating: number;
    comment?: string | null;
    supplierName: string;
  }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    return this.reviewsDomain.upsertDeliveryCompanyReview(data);
  }

  async createDeliveryCompanyReport(supplierId: number, deliveryCompanyUserId: number, reason: string): Promise<DeliveryCompanyReport> {
    const [created] = await db.insert(deliveryCompanyReports).values({ supplierId, deliveryCompanyUserId, reason }).returning();
    return created;
  }

  async getDeliveryCompanyReports(status?: "PENDING" | "RESOLVED" | "DISMISSED"): Promise<(DeliveryCompanyReport & { supplierName: string; companyName: string })[]> {
    const rows = await db.select().from(deliveryCompanyReports)
      .where(status ? eq(deliveryCompanyReports.status, status) : undefined)
      .orderBy(desc(deliveryCompanyReports.createdAt));
    if (rows.length === 0) return [];
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.supplierId, r.deliveryCompanyUserId])));
    const userMap = new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u.name]));
    return rows.map((r) => ({ ...r, supplierName: userMap.get(r.supplierId) ?? "—", companyName: userMap.get(r.deliveryCompanyUserId) ?? "—" }));
  }

  async getDeliveryCompanyReportsBySupplier(supplierId: number): Promise<(DeliveryCompanyReport & { companyName: string })[]> {
    const rows = await db.select().from(deliveryCompanyReports)
      .where(eq(deliveryCompanyReports.supplierId, supplierId))
      .orderBy(desc(deliveryCompanyReports.createdAt));
    if (rows.length === 0) return [];
    const companyIds = Array.from(new Set(rows.map((r) => r.deliveryCompanyUserId)));
    const rowsUsers = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, companyIds));
    const map = new Map(rowsUsers.map((u) => [u.id, u.name]));
    return rows.map((r) => ({ ...r, companyName: map.get(r.deliveryCompanyUserId) ?? "—" }));
  }

  async resolveDeliveryCompanyReport(id: number, status: "RESOLVED" | "DISMISSED", resolutionNote?: string): Promise<DeliveryCompanyReport | undefined> {
    const [updated] = await db.update(deliveryCompanyReports)
      .set({ status, resolvedAt: new Date(), resolutionNote: resolutionNote ?? null })
      .where(eq(deliveryCompanyReports.id, id))
      .returning();
    return updated;
  }

  // ── Marketing ────────────────────────────────────────────────────────────────
  async getMarketingProfiles(filters?: {
    search?: string;
    category?: string;
    profileType?: string;
    location?: string;
    viewerLocation?: { lat?: string | null; lng?: string | null } | null;
  }): Promise<MarketingMarketplaceCard[]> {
    return this.marketingDomain.getMarketingProfiles(filters);
  }

  async getMarketingCategories(): Promise<string[]> {
    return this.marketingDomain.getMarketingCategories();
  }

  async getMarketingProfile(userId: number): Promise<MarketingProfile> {
    return this.marketingDomain.getMarketingProfile(userId);
  }

  async getMarketingCard(userId: number, viewerLocation?: { lat?: string | null; lng?: string | null } | null): Promise<MarketingMarketplaceCard | undefined> {
    return this.marketingDomain.getMarketingCard(userId, viewerLocation);
  }

  async getMarketingCompanyCards(viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<MarketingCompanyListCard[]> {
    return this.marketingDomain.getMarketingCompanyCards(viewerLocation);
  }

  async upsertMarketingProfile(userId: number, updates: Partial<InsertMarketingProfile>): Promise<MarketingProfile> {
    return this.marketingDomain.upsertMarketingProfile(userId, updates);
  }

  async bulkUpdateMarketingOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    return this.marketingDomain.bulkUpdateMarketingOrder(orders);
  }

  async setMarketingAutoApprove(userId: number, autoApprove: boolean): Promise<MarketingProfile> {
    return this.marketingDomain.setMarketingAutoApprove(userId, autoApprove);
  }

  async getMarketingServicesForProvider(marketingUserId: number): Promise<MarketingService[]> {
    return this.marketingDomain.getMarketingServicesForProvider(marketingUserId);
  }

  async getMarketingServiceById(id: number): Promise<MarketingService | undefined> {
    return this.marketingDomain.getMarketingServiceById(id);
  }

  async createMarketingService(marketingUserId: number, data: Partial<InsertMarketingService>): Promise<MarketingService> {
    return this.marketingDomain.createMarketingService(marketingUserId, data);
  }

  async updateMarketingService(id: number, marketingUserId: number, data: Partial<InsertMarketingService>): Promise<MarketingService | undefined> {
    return this.marketingDomain.updateMarketingService(id, marketingUserId, data);
  }

  async deleteMarketingService(id: number, marketingUserId: number): Promise<void> {
    return this.marketingDomain.deleteMarketingService(id, marketingUserId);
  }

  async getPublishedMarketingServices(filters?: {
    search?: string; category?: string; profileType?: string; location?: string;
    viewerLocation?: { lat?: string | null; lng?: string | null } | null;
  }): Promise<MarketingServiceCard[]> {
    return this.marketingDomain.getPublishedMarketingServices(filters);
  }

  async getMarketingServiceCard(id: number): Promise<MarketingServiceCard | undefined> {
    return this.marketingDomain.getMarketingServiceCard(id);
  }

  async getMarketingFavoritesByUser(userId: number): Promise<number[]> {
    return this.marketingDomain.getMarketingFavoritesByUser(userId);
  }

  async addMarketingFavorite(userId: number, marketingUserId: number): Promise<void> {
    return this.marketingDomain.addMarketingFavorite(userId, marketingUserId);
  }

  async removeMarketingFavorite(userId: number, marketingUserId: number): Promise<void> {
    return this.marketingDomain.removeMarketingFavorite(userId, marketingUserId);
  }

  async getMarketingServiceFavoritesByUser(userId: number): Promise<number[]> {
    return this.marketingDomain.getMarketingServiceFavoritesByUser(userId);
  }

  async addMarketingServiceFavorite(userId: number, marketingUserId: number, serviceId: number): Promise<void> {
    return this.marketingDomain.addMarketingServiceFavorite(userId, marketingUserId, serviceId);
  }

  async removeMarketingServiceFavorite(userId: number, serviceId: number): Promise<void> {
    return this.marketingDomain.removeMarketingServiceFavorite(userId, serviceId);
  }

  async getMarketingProjectsForProvider(userId: number): Promise<(MarketingProject & { cafeOwner: string; ownerPhone: string | null })[]> {
    return this.marketingDomain.getMarketingProjectsForProvider(userId);
  }

  async getMarketingProjectsForOwner(userId: number): Promise<(MarketingProject & { marketingName: string })[]> {
    return this.marketingDomain.getMarketingProjectsForOwner(userId);
  }

  async createMarketingProject(data: InsertMarketingProject): Promise<MarketingProject> {
    return this.marketingDomain.createMarketingProject(data);
  }

  async getMarketingProjectById(id: number): Promise<MarketingProject | undefined> {
    return this.marketingDomain.getMarketingProjectById(id);
  }

  async updateMarketingProjectStatus(id: number, providerId: number, updates: {
    status?: string; quoteAmountInCents?: number; finalAmountInCents?: number; progress?: number;
    startDate?: string; deadline?: string;
  }): Promise<MarketingProject | undefined> {
    return this.marketingDomain.updateMarketingProjectStatus(id, providerId, updates);
  }

  async respondToMarketingQuote(id: number, ownerId: number, accepted: boolean): Promise<MarketingProject | undefined> {
    return this.marketingDomain.respondToMarketingQuote(id, ownerId, accepted);
  }

  async cancelMarketingProjectByOwner(id: number, cafeOwnerId: number): Promise<MarketingProject | undefined> {
    return this.marketingDomain.cancelMarketingProjectByOwner(id, cafeOwnerId);
  }

  async adminUpdateMarketingProject(id: number, data: Partial<{
    service: string; title: string; description: string; status: string;
    quoteAmountInCents: number; finalAmountInCents: number; progress: number; startDate: string; deadline: string;
  }>): Promise<MarketingProject | undefined> {
    return this.marketingDomain.adminUpdateMarketingProject(id, data);
  }

  async setMarketingProjectFrozen(id: number, isFrozen: boolean): Promise<MarketingProject | undefined> {
    return this.marketingDomain.setMarketingProjectFrozen(id, isFrozen);
  }

  async deleteMarketingProject(id: number): Promise<void> {
    return this.marketingDomain.deleteMarketingProject(id);
  }

  async getMarketingReviews(marketingUserId: number): Promise<SupplierProductReview[]> {
    return this.reviewsDomain.getMarketingReviews(marketingUserId);
  }

  async getMarketingReviewForProject(projectId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    return this.reviewsDomain.getMarketingReviewForProject(projectId, cafeId);
  }

  async upsertMarketingReview(data: {
    marketingUserId: number; projectId: number; cafeId: number; rating: number; comment?: string | null;
    cafeName: string; cafeOwnerName: string;
  }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    return this.reviewsDomain.upsertMarketingReview(data);
  }

  async deleteMarketingReview(reviewId: number): Promise<boolean> {
    return this.reviewsDomain.deleteMarketingReview(reviewId);
  }

  async getMarketingRevenueSummary(userId: number): Promise<{
    totalEarnedCents: number; completedProjects: number; currentMonthCents: number; currentMonthProjects: number;
    history: { month: string; totalCents: number; projects: number }[];
  }> {
    return this.marketingDomain.getMarketingRevenueSummary(userId);
  }

  async getMarketingTaxonomy(): Promise<MarketingCategory[]> {
    return this.marketingDomain.getMarketingTaxonomy();
  }

  async getAvailableMarketingTaxonomy(): Promise<MarketingCategory[]> {
    return this.marketingDomain.getAvailableMarketingTaxonomy();
  }

  async createMarketingCategory(name: string, icon?: string | null): Promise<MarketingCategory> {
    return this.marketingDomain.createMarketingCategory(name, icon);
  }

  async updateMarketingCategory(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<MarketingCategory | undefined> {
    return this.marketingDomain.updateMarketingCategory(id, data);
  }

  async deleteMarketingCategory(id: number): Promise<void> {
    return this.marketingDomain.deleteMarketingCategory(id);
  }

  async getMarketingSubCategoryTaxonomy(categoryId?: number): Promise<MarketingSubCategory[]> {
    return this.marketingDomain.getMarketingSubCategoryTaxonomy(categoryId);
  }

  async createMarketingSubCategory(categoryId: number, name: string, icon?: string | null): Promise<MarketingSubCategory> {
    return this.marketingDomain.createMarketingSubCategory(categoryId, name, icon);
  }

  async updateMarketingSubCategory(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<MarketingSubCategory | undefined> {
    return this.marketingDomain.updateMarketingSubCategory(id, data);
  }

  async deleteMarketingSubCategory(id: number): Promise<void> {
    return this.marketingDomain.deleteMarketingSubCategory(id);
  }

  async getAvailableMarketingSubCategoryTaxonomy(categoryId?: number): Promise<MarketingSubCategory[]> {
    return this.marketingDomain.getAvailableMarketingSubCategoryTaxonomy(categoryId);
  }

  async getMarketingCategoryMapping(marketingUserId: number): Promise<{ categories: string[]; subCategories: string[] }> {
    return this.marketingDomain.getMarketingCategoryMapping(marketingUserId);
  }

  async setMarketingCategoryMapping(marketingUserId: number, mapping: { categories: string[]; subCategories: string[] }): Promise<{ categories: string[]; subCategories: string[]; rejected: { categories: string[]; subCategories: string[] } }> {
    return this.marketingDomain.setMarketingCategoryMapping(marketingUserId, mapping);
  }

  async getMarketingAdminOverview(): Promise<any> {
    return this.marketingDomain.getMarketingAdminOverview();
  }

  async createMarketingReport(cafeOwnerId: number, marketingUserId: number, reason: string, rating?: number): Promise<MarketingReport> {
    return this.marketingDomain.createMarketingReport(cafeOwnerId, marketingUserId, reason, rating);
  }

  async getMarketingReportById(id: number): Promise<MarketingReport | undefined> {
    return this.marketingDomain.getMarketingReportById(id);
  }

  async getMarketingReports(status?: "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED"): Promise<(MarketingReport & { cafeOwnerName: string; marketingName: string })[]> {
    return this.marketingDomain.getMarketingReports(status);
  }

  async getMarketingReportsByOwner(cafeOwnerId: number): Promise<(MarketingReport & {
    marketingName: string; marketingProfileImageUrl: string | null; marketingLocation: string | null;
  })[]> {
    return this.marketingDomain.getMarketingReportsByOwner(cafeOwnerId);
  }

  async getPublishedMarketingReports(page = 1, limit = 10): Promise<{ reports: (Pick<MarketingReport, "id" | "marketingUserId" | "reason" | "rating" | "createdAt" | "resolvedAt"> & { marketingName: string; marketingProfileImageUrl: string | null })[]; total: number; page: number; limit: number }> {
    return this.marketingDomain.getPublishedMarketingReports(page, limit);
  }

  async resolveMarketingReport(id: number, status: "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED", resolutionNote?: string, moderatedByAdminId?: number): Promise<MarketingReport | undefined> {
    return this.marketingDomain.resolveMarketingReport(id, status, resolutionNote, moderatedByAdminId);
  }

  async refreshMarketingMessagingState(projectId: number): Promise<void> {
    return this.marketingDomain.refreshMarketingMessagingState(projectId);
  }

  // ── Print ────────────────────────────────────────────────────────────────────
  async getPrintCatalogForPrinter(printerId: number): Promise<PrintCatalogItem[]> {
    return this.printDomain.getPrintCatalogForPrinter(printerId);
  }

  async createPrintCatalogItem(printerId: number, data: Partial<InsertPrintCatalogItem>): Promise<PrintCatalogItem> {
    return this.printDomain.createPrintCatalogItem(printerId, data);
  }

  async updatePrintCatalogItem(id: number, printerId: number, updates: Partial<InsertPrintCatalogItem>): Promise<PrintCatalogItem | undefined> {
    return this.printDomain.updatePrintCatalogItem(id, printerId, updates);
  }

  async deletePrintCatalogItem(id: number, printerId: number): Promise<boolean> {
    return this.printDomain.deletePrintCatalogItem(id, printerId);
  }

  async getPrintMarketplaceCards(filters?: { search?: string; category?: string; printerId?: number; viewerLocation?: { lat: string | null; lng: string | null } | null }): Promise<PrintCatalogCard[]> {
    return this.printDomain.getPrintMarketplaceCards(filters);
  }

  async getPrintMarketplaceCard(id: number, viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<PrintCatalogCard | undefined> {
    return this.printDomain.getPrintMarketplaceCard(id, viewerLocation);
  }

  async getPrintCatalogItemCard(id: number): Promise<PrintCatalogCard | undefined> {
    return this.printDomain.getPrintCatalogItemCard(id);
  }

  async getPrintCategories(): Promise<string[]> {
    return this.printDomain.getPrintCategories();
  }

  async getPrintSubCategories(): Promise<string[]> {
    return this.printDomain.getPrintSubCategories();
  }

  async getPrintOrdersForPrinter(printerId: number): Promise<PrintOrderWithParties[]> {
    return this.printDomain.getPrintOrdersForPrinter(printerId);
  }

  async getPrintOrdersForOwner(ownerId: number): Promise<PrintOrderWithParties[]> {
    return this.printDomain.getPrintOrdersForOwner(ownerId);
  }

  async createPrintOrder(cafeOwnerId: number, data: { catalogItemId: number; quantity: number; notes?: string; deliveryAddress?: string; contactPhone?: string }): Promise<PrintOrder> {
    return this.printDomain.createPrintOrder(cafeOwnerId, data);
  }

  async updatePrintOrderStatus(id: number, printerId: number, status: string): Promise<PrintOrder | undefined> {
    return this.printDomain.updatePrintOrderStatus(id, printerId, status);
  }

  async getPrintRevenueSummary(printerId: number): Promise<{
    totalEarnedCents: number; completedOrders: number;
    currentMonthCents: number; currentMonthOrders: number;
    history: { month: string; totalCents: number; orders: number }[];
  }> {
    return this.printDomain.getPrintRevenueSummary(printerId);
  }

  // ── PRINT admin ──────────────────────────────────────────────────────────────
  async getPrintCategoryTaxonomy(): Promise<PrintCategoryTaxonomy[]> {
    return this.printDomain.getPrintCategoryTaxonomy();
  }

  async createPrintCategory(name: string, icon?: string | null): Promise<PrintCategoryTaxonomy> {
    return this.printDomain.createPrintCategory(name, icon);
  }

  async updatePrintCategory(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<PrintCategoryTaxonomy | undefined> {
    return this.printDomain.updatePrintCategory(id, data);
  }

  async deletePrintCategory(id: number): Promise<void> {
    return this.printDomain.deletePrintCategory(id);
  }

  async getPrintSubCategoryTaxonomy(categoryId?: number): Promise<PrintSubCategoryTaxonomy[]> {
    return this.printDomain.getPrintSubCategoryTaxonomy(categoryId);
  }

  async createPrintSubCategory(categoryId: number, name: string, icon?: string | null): Promise<PrintSubCategoryTaxonomy> {
    return this.printDomain.createPrintSubCategory(categoryId, name, icon);
  }

  async updatePrintSubCategory(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<PrintSubCategoryTaxonomy | undefined> {
    return this.printDomain.updatePrintSubCategory(id, data);
  }

  async deletePrintSubCategory(id: number): Promise<void> {
    return this.printDomain.deletePrintSubCategory(id);
  }

  async getPrintFavoritesByUser(userId: number): Promise<number[]> {
    return this.printDomain.getPrintFavoritesByUser(userId);
  }

  async addPrintFavorite(userId: number, printItemId: number): Promise<void> {
    return this.printDomain.addPrintFavorite(userId, printItemId);
  }

  async removePrintFavorite(userId: number, printItemId: number): Promise<void> {
    return this.printDomain.removePrintFavorite(userId, printItemId);
  }

  async getPrintCompanyFavoritesByUser(userId: number): Promise<number[]> {
    return this.printDomain.getPrintCompanyFavoritesByUser(userId);
  }

  async addPrintCompanyFavorite(userId: number, printerId: number): Promise<void> {
    return this.printDomain.addPrintCompanyFavorite(userId, printerId);
  }

  async removePrintCompanyFavorite(userId: number, printerId: number): Promise<void> {
    return this.printDomain.removePrintCompanyFavorite(userId, printerId);
  }

  // Entity-level Print reports ("Blacklist") — delegate, see print.storage.ts.
  async createPrintReport(cafeOwnerId: number, printerId: number, reason: string, rating?: number): Promise<PrintReport> {
    return this.printDomain.createPrintReport(cafeOwnerId, printerId, reason, rating);
  }

  async getPrintReportById(id: number): Promise<PrintReport | undefined> {
    return this.printDomain.getPrintReportById(id);
  }

  async getPrintReports(status?: "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED"): Promise<(PrintReport & { cafeOwnerName: string; printerName: string })[]> {
    return this.printDomain.getPrintReports(status);
  }

  async getPrintReportsByOwner(cafeOwnerId: number): Promise<(PrintReport & {
    printerName: string; printerProfileImageUrl: string | null; printerLocation: string | null;
  })[]> {
    return this.printDomain.getPrintReportsByOwner(cafeOwnerId);
  }

  async getPublishedPrintReports(page = 1, limit = 10): Promise<{ reports: (Pick<PrintReport, "id" | "printerId" | "reason" | "rating" | "createdAt" | "resolvedAt"> & { printerName: string; printerProfileImageUrl: string | null })[]; total: number; page: number; limit: number }> {
    return this.printDomain.getPublishedPrintReports(page, limit);
  }

  async resolvePrintReport(id: number, status: "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED", resolutionNote?: string, moderatedByAdminId?: number): Promise<PrintReport | undefined> {
    return this.printDomain.resolvePrintReport(id, status, resolutionNote, moderatedByAdminId);
  }

  // ── Hero Settings / Dark Mode Settings ──────────────────────────────────────
  // Global across all service accounts — not Print-specific despite the physical placement here.
  async getHeroActionSettings(): Promise<HeroActionSettingsMap> {
    return this.platformSettingsDomain.getHeroActionSettings();
  }

  async setHeroActionSettings(service: HeroService, updates: Partial<{ fastSearchEnabled: boolean; reportEnabled: boolean }>): Promise<HeroActionSettingsMap> {
    return this.platformSettingsDomain.setHeroActionSettings(service, updates);
  }

  async getServiceHeroConfigs(): Promise<ServiceHeroConfigMap> {
    return this.platformSettingsDomain.getServiceHeroConfigs();
  }

  async setServiceHeroConfig(service: HeroService, updates: Partial<ServiceHeroConfig>): Promise<ServiceHeroConfigMap> {
    return this.platformSettingsDomain.setServiceHeroConfig(service, updates);
  }

  async getAccountDarkModeSettings(): Promise<AccountDarkModeSettingsMap> {
    return this.platformSettingsDomain.getAccountDarkModeSettings();
  }

  async setAccountDarkModeSetting(account: DarkModeAccount, mode: AccountThemeMode): Promise<AccountDarkModeSettingsMap> {
    return this.platformSettingsDomain.setAccountDarkModeSetting(account, mode);
  }

  async getPrinterCategoryMapping(printerId: number): Promise<{ categories: string[]; subCategories: string[] }> {
    return this.printDomain.getPrinterCategoryMapping(printerId);
  }

  async setPrinterCategoryMapping(printerId: number, mapping: { categories: string[]; subCategories: string[] }): Promise<{ categories: string[]; subCategories: string[]; rejected: { categories: string[]; subCategories: string[] } }> {
    return this.printDomain.setPrinterCategoryMapping(printerId, mapping);
  }

  async getPrintReviews(printerId: number): Promise<SupplierProductReview[]> {
    return this.reviewsDomain.getPrintReviews(printerId);
  }

  async getPrintReviewForOrder(orderId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    return this.reviewsDomain.getPrintReviewForOrder(orderId, cafeId);
  }

  async upsertPrintReview(data: { printerId: number; printOrderId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    return this.reviewsDomain.upsertPrintReview(data);
  }

  // ── Printer (company-level) profile ─────────────────────────────────────────
  async getPrinterProfile(userId: number): Promise<PrinterProfile> {
    return this.printDomain.getPrinterProfile(userId);
  }

  async upsertPrinterProfile(userId: number, updates: Partial<InsertPrinterProfile>): Promise<PrinterProfile> {
    return this.printDomain.upsertPrinterProfile(userId, updates);
  }

  async bulkUpdatePrinterOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    return this.printDomain.bulkUpdatePrinterOrder(orders);
  }

  async setPrinterAutoApprove(userId: number, autoApprove: boolean): Promise<PrinterProfile> {
    return this.printDomain.setPrinterAutoApprove(userId, autoApprove);
  }

  async getPrintCompanyCard(userId: number, viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<PrintCompanyCard | undefined> {
    return this.printDomain.getPrintCompanyCard(userId, viewerLocation);
  }

  async getPrintCompanyCards(viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<PrintCompanyListCard[]> {
    return this.printDomain.getPrintCompanyCards(viewerLocation);
  }

  async adminSetPrintCatalogItemActive(id: number, isActive: boolean): Promise<PrintCatalogItem | undefined> {
    return this.printDomain.adminSetPrintCatalogItemActive(id, isActive);
  }

  async getPrintAdminOverview(): Promise<any> {
    return this.printDomain.getPrintAdminOverview();
  }

  // ── Barista ──────────────────────────────────────────────────────────────────
  async getBaristaSkills(activeOnly = false): Promise<BaristaSkill[]> {
    return this.baristaDomain.getBaristaSkills(activeOnly);
  }

  async createBaristaSkill(name: string, icon?: string | null): Promise<BaristaSkill> {
    return this.baristaDomain.createBaristaSkill(name, icon);
  }

  async updateBaristaSkill(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<BaristaSkill | undefined> {
    return this.baristaDomain.updateBaristaSkill(id, data);
  }

  async deleteBaristaSkill(id: number): Promise<void> {
    return this.baristaDomain.deleteBaristaSkill(id);
  }

  async getBaristaEducationLevels(activeOnly = false): Promise<BaristaEducationLevel[]> {
    return this.baristaDomain.getBaristaEducationLevels(activeOnly);
  }
  async createBaristaEducationLevel(name: string): Promise<BaristaEducationLevel> {
    return this.baristaDomain.createBaristaEducationLevel(name);
  }
  async updateBaristaEducationLevel(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<BaristaEducationLevel | undefined> {
    return this.baristaDomain.updateBaristaEducationLevel(id, data);
  }
  async deleteBaristaEducationLevel(id: number): Promise<void> {
    return this.baristaDomain.deleteBaristaEducationLevel(id);
  }

  async getBaristaLanguages(activeOnly = false): Promise<BaristaLanguage[]> {
    return this.baristaDomain.getBaristaLanguages(activeOnly);
  }
  async createBaristaLanguage(name: string): Promise<BaristaLanguage> {
    return this.baristaDomain.createBaristaLanguage(name);
  }
  async updateBaristaLanguage(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<BaristaLanguage | undefined> {
    return this.baristaDomain.updateBaristaLanguage(id, data);
  }
  async deleteBaristaLanguage(id: number): Promise<void> {
    return this.baristaDomain.deleteBaristaLanguage(id);
  }

  async getBaristaMarketplaceProfile(userId: number): Promise<BaristaMarketplaceProfile> {
    return this.baristaDomain.getBaristaMarketplaceProfile(userId);
  }

  async upsertBaristaMarketplaceProfile(userId: number, updates: Partial<InsertBaristaMarketplaceProfile>): Promise<BaristaMarketplaceProfile> {
    return this.baristaDomain.upsertBaristaMarketplaceProfile(userId, updates);
  }

  async bulkUpdateBaristaOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    return this.baristaDomain.bulkUpdateBaristaOrder(orders);
  }

  async setBaristaAutoApprove(userId: number, autoApprove: boolean): Promise<BaristaMarketplaceProfile> {
    return this.baristaDomain.setBaristaAutoApprove(userId, autoApprove);
  }

  async getBaristaWorkHistory(baristaUserId: number): Promise<BaristaWorkHistory[]> {
    return this.baristaDomain.getBaristaWorkHistory(baristaUserId);
  }

  async createBaristaWorkHistory(baristaUserId: number, data: Partial<InsertBaristaWorkHistory>): Promise<BaristaWorkHistory> {
    return this.baristaDomain.createBaristaWorkHistory(baristaUserId, data);
  }

  async updateBaristaWorkHistory(id: number, baristaUserId: number, data: Partial<InsertBaristaWorkHistory>): Promise<BaristaWorkHistory | undefined> {
    return this.baristaDomain.updateBaristaWorkHistory(id, baristaUserId, data);
  }

  async deleteBaristaWorkHistory(id: number, baristaUserId: number): Promise<void> {
    return this.baristaDomain.deleteBaristaWorkHistory(id, baristaUserId);
  }

  async createBaristaReport(cafeOwnerId: number, baristaUserId: number, reason: string, rating?: number): Promise<BaristaReport> {
    return this.baristaDomain.createBaristaReport(cafeOwnerId, baristaUserId, reason, rating);
  }

  async getBaristaReportById(id: number): Promise<BaristaReport | undefined> {
    return this.baristaDomain.getBaristaReportById(id);
  }

  async getBaristaReports(status?: "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED"): Promise<(BaristaReport & { cafeOwnerName: string; baristaName: string })[]> {
    return this.baristaDomain.getBaristaReports(status);
  }

  async getPublishedBaristaReports(page = 1, limit = 10): Promise<{ reports: (Pick<BaristaReport, "id" | "baristaUserId" | "reason" | "rating" | "createdAt" | "resolvedAt"> & { baristaName: string; baristaProfileImageUrl: string | null })[]; total: number; page: number; limit: number }> {
    return this.baristaDomain.getPublishedBaristaReports(page, limit);
  }

  async getBaristaReportsByOwner(cafeOwnerId: number): Promise<(BaristaReport & {
    baristaName: string; baristaProfileImageUrl: string | null; baristaLocation: string | null;
  })[]> {
    return this.baristaDomain.getBaristaReportsByOwner(cafeOwnerId);
  }

  async resolveBaristaReport(id: number, status: "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED", resolutionNote?: string, moderatedByAdminId?: number): Promise<BaristaReport | undefined> {
    return this.baristaDomain.resolveBaristaReport(id, status, resolutionNote, moderatedByAdminId);
  }

  async getBaristaMarketplaceProfiles(filters?: {
    search?: string; level?: string; skill?: string; city?: string; available?: boolean;
    viewerLocation?: { lat?: string | null; lng?: string | null } | null;
  }): Promise<BaristaMarketplaceCard[]> {
    return this.baristaDomain.getBaristaMarketplaceProfiles(filters);
  }

  async getBaristaMarketplaceCard(userId: number, viewerLocation?: { lat?: string | null; lng?: string | null } | null): Promise<BaristaMarketplaceCard | undefined> {
    return this.baristaDomain.getBaristaMarketplaceCard(userId, viewerLocation);
  }

  async createBaristaJobPost(cafeOwnerId: number, data: Partial<InsertBaristaJobPost>): Promise<BaristaJobPost> {
    return this.baristaDomain.createBaristaJobPost(cafeOwnerId, data);
  }

  async updateBaristaJobPost(id: number, cafeOwnerId: number, data: Partial<InsertBaristaJobPost>): Promise<BaristaJobPost | undefined> {
    return this.baristaDomain.updateBaristaJobPost(id, cafeOwnerId, data);
  }

  async getBaristaJobPostById(id: number): Promise<BaristaJobPost | undefined> {
    return this.baristaDomain.getBaristaJobPostById(id);
  }

  async getBaristaJobPostsForOwner(cafeOwnerId: number, recordType?: "OFFER" | "MISSION"): Promise<BaristaJobPostWithStats[]> {
    return this.baristaDomain.getBaristaJobPostsForOwner(cafeOwnerId, recordType);
  }

  async getBaristaJobPostWithStats(id: number): Promise<BaristaJobPostWithStats | undefined> {
    return this.baristaDomain.getBaristaJobPostWithStats(id);
  }

  async getDiscoverableBaristaJobPosts(baristaUserId: number, recordType?: "OFFER" | "MISSION"): Promise<(BaristaJobPost & { isTargeted: boolean })[]> {
    return this.baristaDomain.getDiscoverableBaristaJobPosts(baristaUserId, recordType);
  }

  async addBaristaJobTarget(jobPostId: number, baristaUserId: number): Promise<BaristaJobTarget> {
    return this.baristaDomain.addBaristaJobTarget(jobPostId, baristaUserId);
  }

  async getBaristaJobTargets(jobPostId: number): Promise<(BaristaJobTarget & { baristaName: string; baristaProfileImageUrl: string | null })[]> {
    return this.baristaDomain.getBaristaJobTargets(jobPostId);
  }

  async isBaristaJobTargeted(jobPostId: number, baristaUserId: number): Promise<boolean> {
    return this.baristaDomain.isBaristaJobTargeted(jobPostId, baristaUserId);
  }

  async createBaristaJobApplication(jobPostId: number, baristaUserId: number, message?: string | null): Promise<BaristaJobApplication> {
    return this.baristaDomain.createBaristaJobApplication(jobPostId, baristaUserId, message);
  }

  async getBaristaJobApplicationById(id: number): Promise<BaristaJobApplication | undefined> {
    return this.baristaDomain.getBaristaJobApplicationById(id);
  }

  async hasBaristaAppliedToJob(jobPostId: number, baristaUserId: number): Promise<boolean> {
    return this.baristaDomain.hasBaristaAppliedToJob(jobPostId, baristaUserId);
  }

  async getBaristaJobApplicationsForJob(jobPostId: number): Promise<BaristaJobApplicationWithParties[]> {
    return this.baristaDomain.getBaristaJobApplicationsForJob(jobPostId);
  }

  async getBaristaJobApplicationsForBarista(baristaUserId: number): Promise<BaristaJobApplicationWithParties[]> {
    return this.baristaDomain.getBaristaJobApplicationsForBarista(baristaUserId);
  }

  async updateBaristaJobApplicationStatus(id: number, status: string): Promise<BaristaJobApplication | undefined> {
    return this.baristaDomain.updateBaristaJobApplicationStatus(id, status);
  }

  async upsertBaristaJobMeeting(applicationId: number, data: { scheduledAt: Date; notes?: string | null }): Promise<BaristaJobMeeting> {
    return this.baristaDomain.upsertBaristaJobMeeting(applicationId, data);
  }

  async updateBaristaJobMeetingStatus(id: number, status: string): Promise<BaristaJobMeeting | undefined> {
    return this.baristaDomain.updateBaristaJobMeetingStatus(id, status);
  }

  async getBaristaJobMeetingByApplication(applicationId: number): Promise<BaristaJobMeeting | undefined> {
    return this.baristaDomain.getBaristaJobMeetingByApplication(applicationId);
  }

  async getBaristaRequestsForBarista(userId: number): Promise<BaristaRequestWithParties[]> {
    return this.baristaDomain.getBaristaRequestsForBarista(userId);
  }

  async getBaristaRequestsForOwner(userId: number): Promise<BaristaRequestWithParties[]> {
    return this.baristaDomain.getBaristaRequestsForOwner(userId);
  }

  async getBaristaRequestById(id: number): Promise<BaristaMarketplaceRequest | undefined> {
    return this.baristaDomain.getBaristaRequestById(id);
  }

  async createBaristaRequest(cafeOwnerId: number, data: {
    baristaUserId: number; missionType: string; message: string;
    proposedRateInCents?: number | null; startDate: string; endDate?: string | null;
  }): Promise<BaristaMarketplaceRequest> {
    return this.baristaDomain.createBaristaRequest(cafeOwnerId, data);
  }

  async updateBaristaRequestStatus(
    requestId: number,
    actingUser: { id: number; role: string },
    newStatus: BaristaRequestStatus,
    extra?: { cancelReason?: string },
  ): Promise<{ request: BaristaMarketplaceRequest; mission: BaristaMarketplaceMission | null }> {
    return this.baristaDomain.updateBaristaRequestStatus(requestId, actingUser, newStatus, extra);
  }

  async getBaristaMissionsForBarista(userId: number): Promise<BaristaMissionWithParties[]> {
    return this.baristaDomain.getBaristaMissionsForBarista(userId);
  }

  async getBaristaMissionsForOwner(userId: number): Promise<BaristaMissionWithParties[]> {
    return this.baristaDomain.getBaristaMissionsForOwner(userId);
  }

  async getBaristaMissionById(id: number): Promise<BaristaMarketplaceMission | undefined> {
    return this.baristaDomain.getBaristaMissionById(id);
  }

  async updateBaristaMissionStatus(missionId: number, actingUser: { id: number; role: string }, newStatus: BaristaMissionStatus): Promise<BaristaMarketplaceMission> {
    return this.baristaDomain.updateBaristaMissionStatus(missionId, actingUser, newStatus);
  }

  async getBaristaReviews(baristaUserId: number): Promise<SupplierProductReview[]> {
    return this.reviewsDomain.getBaristaReviews(baristaUserId);
  }

  async getBaristaReviewForMission(missionId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    return this.reviewsDomain.getBaristaReviewForMission(missionId, cafeId);
  }

  async upsertBaristaReview(data: {
    baristaUserId: number; missionId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string; cafeOwnerName: string;
  }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    return this.reviewsDomain.upsertBaristaReview(data);
  }

  async getBaristaRevenueSummary(baristaUserId: number): Promise<{
    totalEarnedCents: number;
    completedMissions: number;
    currentMonthCents: number;
    currentMonthMissions: number;
    history: { month: string; totalCents: number; missions: number }[];
  }> {
    return this.baristaDomain.getBaristaRevenueSummary(baristaUserId);
  }

  async refreshBaristaMessagingState(requestId: number): Promise<void> {
    return this.baristaDomain.refreshBaristaMessagingState(requestId);
  }

  async getBaristaFavoritesByUser(userId: number): Promise<number[]> {
    return this.baristaDomain.getBaristaFavoritesByUser(userId);
  }

  async addBaristaFavorite(userId: number, baristaUserId: number): Promise<void> {
    return this.baristaDomain.addBaristaFavorite(userId, baristaUserId);
  }

  async removeBaristaFavorite(userId: number, baristaUserId: number): Promise<void> {
    return this.baristaDomain.removeBaristaFavorite(userId, baristaUserId);
  }

  async getBaristaAdminOverview(): Promise<any> {
    return this.baristaDomain.getBaristaAdminOverview();
  }

  // ── Barista Academy ──────────────────────────────────────────────────────────
  async getAcademyProfile(userId: number): Promise<AcademyProfile> {
    return this.academyDomain.getAcademyProfile(userId);
  }

  async upsertAcademyProfile(userId: number, updates: Partial<InsertAcademyProfile>): Promise<AcademyProfile> {
    return this.academyDomain.upsertAcademyProfile(userId, updates);
  }

  async bulkUpdateAcademyOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    return this.academyDomain.bulkUpdateAcademyOrder(orders);
  }

  async setAcademyAutoApprove(userId: number, autoApprove: boolean): Promise<AcademyProfile> {
    return this.academyDomain.setAcademyAutoApprove(userId, autoApprove);
  }

  // ── Courses ("Formations") ──
  async getAcademyCoursesForAcademy(academyUserId: number): Promise<AcademyCourse[]> {
    return this.academyDomain.getAcademyCoursesForAcademy(academyUserId);
  }

  async getAcademyCourseById(id: number): Promise<AcademyCourse | undefined> {
    return this.academyDomain.getAcademyCourseById(id);
  }

  async createAcademyCourse(academyUserId: number, data: Partial<InsertAcademyCourse>): Promise<AcademyCourse> {
    return this.academyDomain.createAcademyCourse(academyUserId, data);
  }

  async updateAcademyCourse(id: number, academyUserId: number, data: Partial<InsertAcademyCourse>): Promise<AcademyCourse | undefined> {
    return this.academyDomain.updateAcademyCourse(id, academyUserId, data);
  }

  async deleteAcademyCourse(id: number, academyUserId: number): Promise<void> {
    return this.academyDomain.deleteAcademyCourse(id, academyUserId);
  }

  async getPublishedAcademyCourses(filters?: { search?: string; level?: string; certification?: boolean; viewerLocation?: { lat: string | null; lng: string | null } | null }): Promise<AcademyCourseCard[]> {
    return this.academyDomain.getPublishedAcademyCourses(filters);
  }

  async getAcademyCourseCard(id: number, viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<AcademyCourseCard | undefined> {
    return this.academyDomain.getAcademyCourseCard(id, viewerLocation);
  }

  // Academy favorites — course (item) rows have courseId set; organisation
  // (academyUserId) favorites have courseId NULL and academyUserId set instead
  // (docs/coffee_owner_favorites_marketplace_audit.md, Section 4).
  async getAcademyFavoritesByUser(userId: number): Promise<number[]> {
    return this.academyDomain.getAcademyFavoritesByUser(userId);
  }

  async addAcademyFavorite(userId: number, courseId: number): Promise<void> {
    return this.academyDomain.addAcademyFavorite(userId, courseId);
  }

  async removeAcademyFavorite(userId: number, courseId: number): Promise<void> {
    return this.academyDomain.removeAcademyFavorite(userId, courseId);
  }

  async getAcademyOrganisationFavoritesByUser(userId: number): Promise<number[]> {
    return this.academyDomain.getAcademyOrganisationFavoritesByUser(userId);
  }

  async addAcademyOrganisationFavorite(userId: number, academyUserId: number): Promise<void> {
    return this.academyDomain.addAcademyOrganisationFavorite(userId, academyUserId);
  }

  async removeAcademyOrganisationFavorite(userId: number, academyUserId: number): Promise<void> {
    return this.academyDomain.removeAcademyOrganisationFavorite(userId, academyUserId);
  }

  // Entity-level Academy reports ("Blacklist") — delegate, see academy.storage.ts.
  async createAcademyReport(cafeOwnerId: number, academyUserId: number, reason: string, rating?: number): Promise<AcademyReport> {
    return this.academyDomain.createAcademyReport(cafeOwnerId, academyUserId, reason, rating);
  }

  async getAcademyReportById(id: number): Promise<AcademyReport | undefined> {
    return this.academyDomain.getAcademyReportById(id);
  }

  async getAcademyReports(status?: "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED"): Promise<(AcademyReport & { cafeOwnerName: string; academyName: string })[]> {
    return this.academyDomain.getAcademyReports(status);
  }

  async getAcademyReportsByOwner(cafeOwnerId: number): Promise<(AcademyReport & {
    academyName: string; academyProfileImageUrl: string | null; academyLocation: string | null;
  })[]> {
    return this.academyDomain.getAcademyReportsByOwner(cafeOwnerId);
  }

  async getPublishedAcademyReports(page = 1, limit = 10): Promise<{ reports: (Pick<AcademyReport, "id" | "academyUserId" | "reason" | "rating" | "createdAt" | "resolvedAt"> & { academyName: string; academyProfileImageUrl: string | null })[]; total: number; page: number; limit: number }> {
    return this.academyDomain.getPublishedAcademyReports(page, limit);
  }

  async resolveAcademyReport(id: number, status: "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED", resolutionNote?: string, moderatedByAdminId?: number): Promise<AcademyReport | undefined> {
    return this.academyDomain.resolveAcademyReport(id, status, resolutionNote, moderatedByAdminId);
  }

  // ── Sessions ("Calendrier") ──
  async getAcademySessionsForCourse(courseId: number): Promise<AcademyCourseSession[]> {
    return this.academyDomain.getAcademySessionsForCourse(courseId);
  }

  async getAcademySessionsForAcademy(academyUserId: number): Promise<AcademyCourseSessionWithCourse[]> {
    return this.academyDomain.getAcademySessionsForAcademy(academyUserId);
  }

  async getAcademyProfileCard(userId: number, viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<{
    userId: number; name: string; profileImageUrl: string | null; coverImageUrl: string | null; flashImageUrl: string | null; location: string; phone: string | null;
    description: string; marketplaceVisible: boolean; weeklyHours: OpeningHoursMap | null; isOnVacation: boolean;
    rating: number; reviewCount: number; portfolioImages: string[]; distanceKm?: number | null;
    courses: AcademyCourseCard[]; upcomingSessions: AcademyCourseSessionWithCourse[];
  } | undefined> {
    return this.academyDomain.getAcademyProfileCard(userId, viewerLocation);
  }

  async getAcademyCompanyCards(viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<{
    userId: number; name: string; profileImageUrl: string | null; coverImageUrl: string | null; flashImageUrl: string | null;
    location: string; phone: string | null; description: string; marketplaceVisible: boolean;
    weeklyHours: OpeningHoursMap | null; isOnVacation: boolean; rating: number; reviewCount: number;
    portfolioImages: string[]; courseCount: number; distanceKm?: number | null;
  }[]> {
    return this.academyDomain.getAcademyCompanyCards(viewerLocation);
  }

  async createAcademySession(academyUserId: number, data: { courseId: number; startDate: string; endDate?: string | null; capacity?: number | null }): Promise<AcademyCourseSession> {
    return this.academyDomain.createAcademySession(academyUserId, data);
  }

  async updateAcademySession(id: number, academyUserId: number, data: Partial<{ startDate: string; endDate: string | null; capacity: number | null; status: AcademySessionStatus }>): Promise<AcademyCourseSession | undefined> {
    return this.academyDomain.updateAcademySession(id, academyUserId, data);
  }

  async deleteAcademySession(id: number, academyUserId: number): Promise<void> {
    return this.academyDomain.deleteAcademySession(id, academyUserId);
  }

  // ── Registrations ("Inscriptions") ──
  async getAcademyRegistrationsForAcademy(academyUserId: number): Promise<AcademyRegistrationWithParties[]> {
    return this.academyDomain.getAcademyRegistrationsForAcademy(academyUserId);
  }

  async getAcademyRegistrationsForOwner(cafeOwnerId: number): Promise<AcademyRegistrationWithParties[]> {
    return this.academyDomain.getAcademyRegistrationsForOwner(cafeOwnerId);
  }

  /** Same underlying column/query as getAcademyRegistrationsForOwner — cafeOwnerId
   *  holds the registrant's user id regardless of participantType (see the note
   *  on academyRegistrations in shared/schema.ts). A separate method only for
   *  call-site clarity in the Barista Marketplace → Academy routes. */
  async getAcademyRegistrationsForBarista(baristaUserId: number): Promise<AcademyRegistrationWithParties[]> {
    return this.academyDomain.getAcademyRegistrationsForBarista(baristaUserId);
  }

  async getAcademyRegistrationById(id: number): Promise<AcademyRegistration | undefined> {
    return this.academyDomain.getAcademyRegistrationById(id);
  }

  async createAcademyRegistration(registrantId: number, data: { courseId: number; sessionId?: number | null; participantCount?: number; participants?: string[]; notes?: string; participantType?: 'CAFE_OWNER' | 'BARISTA_MARKETPLACE' }): Promise<AcademyRegistration> {
    return this.academyDomain.createAcademyRegistration(registrantId, data);
  }

  async updateAcademyRegistrationStatus(id: number, actingUser: { id: number; role: string }, newStatus: AcademyRegistrationStatus): Promise<AcademyRegistration> {
    return this.academyDomain.updateAcademyRegistrationStatus(id, actingUser, newStatus);
  }

  // ── Reviews (reuses supplierProductReviews, reviewType='ACADEMY') ──
  async getAcademyReviews(academyUserId: number): Promise<SupplierProductReview[]> {
    return this.reviewsDomain.getAcademyReviews(academyUserId);
  }

  async getAcademyReviewForRegistration(registrationId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    return this.reviewsDomain.getAcademyReviewForRegistration(registrationId, cafeId);
  }

  async upsertAcademyReview(data: { academyUserId: number; registrationId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string; cafeOwnerName: string }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    return this.reviewsDomain.upsertAcademyReview(data);
  }

  // ── Revenue — distinguishes "booked" (CONFIRMED, not yet delivered) from
  // "earned" (COMPLETED, training actually delivered) since no payment
  // processor exists — mirrors getBaristaRevenueSummary's own note exactly. ──
  async getAcademyRevenueSummary(academyUserId: number): Promise<{
    totalEarnedCents: number; completedRegistrations: number; currentMonthCents: number; currentMonthRegistrations: number;
    pendingCents: number; pendingRegistrations: number;
    history: { month: string; totalCents: number; registrations: number }[];
  }> {
    return this.academyDomain.getAcademyRevenueSummary(academyUserId);
  }

  // ── Messaging integration ──
  async refreshAcademyMessagingState(registrationId: number): Promise<void> {
    return this.academyDomain.refreshAcademyMessagingState(registrationId);
  }

  // ── Admin aggregate overview — same philosophy as getBaristaAdminOverview/getPrintAdminOverview. ──
  async getAcademyAdminOverview(): Promise<any> {
    return this.academyDomain.getAcademyAdminOverview();
  }

  // ── Supplier variants ───────────────────────────────────────────────────────
  // Delegates to Inventory — genuine variant stock persistence, not Supplier listing lifecycle.
  async getVariantsByListingId(listingId: number): Promise<SupplierVariantWithLabels[]> {
    return this.inventoryDomain.getVariantsByListingId(listingId);
  }

  async saveVariants(listingId: number, variants: { flavorId?: number | null; sizeId?: number | null; price: number; quantity: number }[], client: any = db): Promise<SupplierVariantWithLabels[]> {
    return this.inventoryDomain.saveVariants(listingId, variants, client);
  }

  // ── Categories ──────────────────────────────────────────────────────────────
  // Categories/SubCategories/Flavors/Sizes/Brands/Taxonomy bulk-order (through
  // bulkUpdateBrandOrder below) all delegate to the Catalog Taxonomy domain
  // (ShopCatalogStorage); the per-section markers are kept for readability only.
  async getCategories(opts?: { includeAll?: boolean }): Promise<CategoryWithCount[]> {
    return this.shopCatalogDomain.getCategories(opts);
  }

  async getCategory(id: number) {
    return this.shopCatalogDomain.getCategory(id);
  }

  async createCategory(cat: Partial<InsertCategory>) {
    return this.shopCatalogDomain.createCategory(cat);
  }

  async updateCategory(id: number, updates: Partial<InsertCategory>) {
    return this.shopCatalogDomain.updateCategory(id, updates);
  }

  async deleteCategory(id: number) {
    return this.shopCatalogDomain.deleteCategory(id);
  }

  // ── SubCategories ───────────────────────────────────────────────────────────

  async getSubCategories(categoryId?: number, opts?: { includeAll?: boolean }): Promise<SubCategoryWithDetails[]> {
    return this.shopCatalogDomain.getSubCategories(categoryId, opts);
  }

  async createSubCategory(sub: Partial<InsertSubCategory>) {
    return this.shopCatalogDomain.createSubCategory(sub);
  }

  async updateSubCategory(id: number, updates: Partial<InsertSubCategory>) {
    return this.shopCatalogDomain.updateSubCategory(id, updates);
  }

  async deleteSubCategory(id: number) {
    return this.shopCatalogDomain.deleteSubCategory(id);
  }

  // ── Flavors ─────────────────────────────────────────────────────────────────

  async getFlavors(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<FlavorWithCount[]> {
    return this.shopCatalogDomain.getFlavors(filters);
  }

  async createFlavor(f: Partial<InsertFlavor>) {
    return this.shopCatalogDomain.createFlavor(f);
  }

  async updateFlavor(id: number, updates: Partial<InsertFlavor>) {
    return this.shopCatalogDomain.updateFlavor(id, updates);
  }

  async deleteFlavor(id: number) {
    return this.shopCatalogDomain.deleteFlavor(id);
  }

  // ── Sizes ───────────────────────────────────────────────────────────────────

  async getSizes(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<SizeWithCount[]> {
    return this.shopCatalogDomain.getSizes(filters);
  }

  async createSize(s: Partial<InsertSize>) {
    return this.shopCatalogDomain.createSize(s);
  }

  async updateSize(id: number, updates: Partial<InsertSize>) {
    return this.shopCatalogDomain.updateSize(id, updates);
  }

  async deleteSize(id: number) {
    return this.shopCatalogDomain.deleteSize(id);
  }

  // ── Brands ──────────────────────────────────────────────────────────────────

  async getBrands(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<BrandWithCount[]> {
    return this.shopCatalogDomain.getBrands(filters);
  }

  async createBrand(b: Partial<InsertBrand>) {
    return this.shopCatalogDomain.createBrand(b);
  }

  async updateBrand(id: number, updates: Partial<InsertBrand>) {
    return this.shopCatalogDomain.updateBrand(id, updates);
  }

  async deleteBrand(id: number) {
    return this.shopCatalogDomain.deleteBrand(id);
  }

  // ── Taxonomy bulk-order ──────────────────────────────────────────────────────

  async bulkUpdateCategoryOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    return this.shopCatalogDomain.bulkUpdateCategoryOrder(orders);
  }

  async bulkUpdateSubCategoryOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    return this.shopCatalogDomain.bulkUpdateSubCategoryOrder(orders);
  }

  async bulkUpdateFlavorOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    return this.shopCatalogDomain.bulkUpdateFlavorOrder(orders);
  }

  async bulkUpdateSizeOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    return this.shopCatalogDomain.bulkUpdateSizeOrder(orders);
  }

  async bulkUpdateBrandOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    return this.shopCatalogDomain.bulkUpdateBrandOrder(orders);
  }

  // ── Supplier mappings ───────────────────────────────────────────────────────
  async getSupplierCategoryMappings(supplierId: number, options?: { approvedOnly?: boolean }): Promise<SupplierCategoryMapping[]> {
    return this.supplierDomain.getSupplierCategoryMappings(supplierId, options);
  }

  async getAdminSupplierCategoryOverview(supplierId: number): Promise<AdminSupplierCategoryOverview> {
    return this.supplierDomain.getAdminSupplierCategoryOverview(supplierId);
  }

  async addSupplierCategories(supplierId: number, categoryIds: number[], status: 'APPROVED' | 'PENDING' = 'PENDING') {
    return this.supplierDomain.addSupplierCategories(supplierId, categoryIds, status);
  }

  async reorderSupplierCategories(supplierId: number, categoryIds: number[]) {
    return this.supplierDomain.reorderSupplierCategories(supplierId, categoryIds);
  }

  async removeSupplierCategory(supplierId: number, categoryId: number) {
    return this.supplierDomain.removeSupplierCategory(supplierId, categoryId);
  }

  async setSupplierCategoryFrozen(supplierId: number, categoryId: number, isFrozen: boolean) {
    return this.supplierDomain.setSupplierCategoryFrozen(supplierId, categoryId, isFrozen);
  }

  async approveSupplierCategoryMapping(supplierId: number, categoryId: number) {
    return this.supplierDomain.approveSupplierCategoryMapping(supplierId, categoryId);
  }

  async setSupplierCategories(supplierId: number, categoryIds: number[]) {
    return this.supplierDomain.setSupplierCategories(supplierId, categoryIds);
  }

  async setSupplierSubCategories(supplierId: number, subCategoryIds: number[]) {
    return this.supplierDomain.setSupplierSubCategories(supplierId, subCategoryIds);
  }

  async isProductAllowedForSupplier(supplierId: number, productId: number): Promise<boolean> {
    return this.supplierDomain.isProductAllowedForSupplier(supplierId, productId);
  }

  // ── Supplier product listings ───────────────────────────────────────────────
  async getSupplierListings(supplierId: number, filters?: { categoryId?: number; subCategoryId?: number; flavorId?: number; sizeId?: number; brandId?: number }): Promise<SupplierListingWithProduct[]> {
    return this.supplierDomain.getSupplierListings(supplierId, filters);
  }

  async createSupplierListing(data: Partial<InsertSupplierProductListing>, client: any = db) {
    return this.supplierDomain.createSupplierListing(data, client);
  }

  async createSupplierListingWithVariants(
    data: Partial<InsertSupplierProductListing>,
    variants: { flavorId?: number | null; sizeId?: number | null; price: number; quantity: number }[],
  ) {
    return this.supplierDomain.createSupplierListingWithVariants(data, variants);
  }

  async updateSupplierListing(id: number, updates: { price?: number; stock?: number; availableFlavorIds?: number[]; availableSizeIds?: number[]; availableBrandIds?: number[] }) {
    return this.supplierDomain.updateSupplierListing(id, updates);
  }

  async deleteSupplierListing(id: number) {
    return this.supplierDomain.deleteSupplierListing(id);
  }

  async removeSupplierListingFromPacks(id: number): Promise<number[]> {
    return this.supplierDomain.removeSupplierListingFromPacks(id);
  }

  // ── Inventory ────────────────────────────────────────────────────────────────
  async getSupplierInventory(supplierId: number, filters?: InventoryFilters, sort?: InventorySort, page = 1, pageSize = 50): Promise<InventoryListResult> {
    return this.inventoryDomain.getSupplierInventory(supplierId, filters, sort, page, pageSize);
  }

  async getSupplierInventoryStats(supplierId: number, filters?: InventoryFilters): Promise<InventoryStats> {
    return this.inventoryDomain.getSupplierInventoryStats(supplierId, filters);
  }

  async getListingForSupplier(listingId: number, supplierId: number) {
    return this.inventoryDomain.getListingForSupplier(listingId, supplierId);
  }

  async adjustListingStock(listingId: number, supplierId: number, userId: number | null, input: { type: 'INCREASE' | 'DECREASE' | 'SET'; quantity: number; reason: string; notes?: string }) {
    return this.inventoryDomain.adjustListingStock(listingId, supplierId, userId, input);
  }

  async getListingStockHistory(listingId: number, supplierId: number): Promise<InventoryAdjustmentWithVariant[]> {
    return this.inventoryDomain.getListingStockHistory(listingId, supplierId);
  }

  async adjustVariantStock(variantId: number, supplierId: number, userId: number | null, input: { type: 'INCREASE' | 'DECREASE' | 'SET'; quantity: number; reason: string; notes?: string }) {
    return this.inventoryDomain.adjustVariantStock(variantId, supplierId, userId, input);
  }

  async updateVariantInventoryFields(variantId: number, supplierId: number, updates: { minStock?: number | null; maxStock?: number | null }) {
    return this.inventoryDomain.updateVariantInventoryFields(variantId, supplierId, updates);
  }

  async updateListingInventoryFields(listingId: number, supplierId: number, updates: { sku?: string | null; barcode?: string | null; minStock?: number; maxStock?: number | null; unit?: string; visibility?: 'VISIBLE' | 'HIDDEN' }) {
    return this.inventoryDomain.updateListingInventoryFields(listingId, supplierId, updates);
  }

  async restockFromOrderCancellation(listingId: number, quantity: number, reason: string) {
    return this.inventoryDomain.restockFromOrderCancellation(listingId, quantity, reason);
  }

  async restockVariantFromOrderCancellation(variantId: number, quantity: number, reason: string) {
    return this.inventoryDomain.restockVariantFromOrderCancellation(variantId, quantity, reason);
  }

  async bulkInventoryAction(supplierId: number, listingIds: number[], action: 'hide' | 'show' | 'delete' | 'setMinStock' | 'stock', payload?: { minStock?: number; type?: 'INCREASE' | 'DECREASE' | 'SET'; quantity?: number; reason?: string; userId?: number | null }) {
    return this.inventoryDomain.bulkInventoryAction(supplierId, listingIds, action, payload);
  }

  // ── Packs ────────────────────────────────────────────────────────────────────
  async buildPackDetails(rows: Pack[]): Promise<PackDetail[]> {
    return this.packsDomain.buildPackDetails(rows);
  }

  async getSupplierPacks(supplierId: number): Promise<PackDetail[]> {
    return this.packsDomain.getSupplierPacks(supplierId);
  }

  async getPackDetail(id: number): Promise<PackDetail | undefined> {
    return this.packsDomain.getPackDetail(id);
  }

  async validatePackItems(supplierId: number, items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number }[]): Promise<boolean> {
    return this.packsDomain.validatePackItems(supplierId, items);
  }

  async createPack(supplierId: number, data: { name: string; description?: string | null; imageUrl?: string | null; imageUrls?: string[] | null; flashImageUrl?: string | null; price: number; quantityAvailable: number; expirationDate?: Date | null; visibility?: 'VISIBLE' | 'HIDDEN' }, items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number; packVariantPrice?: number }[]): Promise<PackDetail> {
    return this.packsDomain.createPack(supplierId, data, items);
  }

  async updatePack(id: number, supplierId: number, data: Partial<{ name: string; description: string | null; imageUrl: string | null; imageUrls: string[] | null; flashImageUrl: string | null; price: number; quantityAvailable: number; expirationDate: Date | null; visibility: 'VISIBLE' | 'HIDDEN'; isArchived: boolean }>, items?: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number; packVariantPrice?: number }[]): Promise<PackDetail | undefined> {
    return this.packsDomain.updatePack(id, supplierId, data, items);
  }

  async duplicatePack(id: number, supplierId: number): Promise<PackDetail | undefined> {
    return this.packsDomain.duplicatePack(id, supplierId);
  }

  async deletePack(id: number): Promise<void> {
    return this.packsDomain.deletePack(id);
  }

  async getMarketplacePacks(filters?: { categoryId?: number; subCategoryId?: number; brandId?: number; flavorId?: number; sizeId?: number; supplierId?: number }): Promise<PackDetail[]> {
    return this.packsDomain.getMarketplacePacks(filters);
  }

  async getAdminPacks(): Promise<PackDetail[]> {
    return this.packsDomain.getAdminPacks();
  }

  async computeAutoPackQuantity(items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number }[]): Promise<number> {
    return this.packsDomain.computeAutoPackQuantity(items);
  }

  async computePackItemsTotal(items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number }[]): Promise<number> {
    return this.packsDomain.computePackItemsTotal(items);
  }

  async getPackFavoritesByUser(userId: number): Promise<number[]> {
    return this.packsDomain.getPackFavoritesByUser(userId);
  }

  async addPackFavorite(userId: number, packId: number): Promise<void> {
    return this.packsDomain.addPackFavorite(userId, packId);
  }

  async removePackFavorite(userId: number, packId: number): Promise<void> {
    return this.packsDomain.removePackFavorite(userId, packId);
  }

  // Delegates to Supplier, despite being physically displaced here at the tail of Packs.
  async getSupplierListingByProductId(supplierId: number, productId: number) {
    return this.supplierDomain.getSupplierListingByProductId(supplierId, productId);
  }

  // ── Supplier product workflow ───────────────────────────────────────────────
  async getSupplierCreatedProducts(supplierId: number) {
    return this.supplierDomain.getSupplierCreatedProducts(supplierId);
  }

  async createSupplierProduct(data: Partial<InsertProduct>) {
    return this.supplierDomain.createSupplierProduct(data);
  }

  async updateSupplierProduct(id: number, supplierId: number, updates: Partial<InsertProduct>) {
    return this.supplierDomain.updateSupplierProduct(id, supplierId, updates);
  }

  async deleteSupplierProduct(id: number, supplierId: number) {
    return this.supplierDomain.deleteSupplierProduct(id, supplierId);
  }

  async getAdminSupplierProducts(): Promise<(ProductWithTaxonomy & { creatorName: string })[]> {
    return this.supplierDomain.getAdminSupplierProducts();
  }

  async approveSupplierProduct(id: number, adminId: number) {
    return this.supplierDomain.approveSupplierProduct(id, adminId);
  }

  // Platform Services (service visibility + messaging settings; service-order half further below).
  async getServiceStates(): Promise<ServiceStatesMap> {
    return this.platformSettingsDomain.getServiceStates();
  }

  async setServiceState(service: ServiceKey, state: ServiceState): Promise<ServiceStatesMap> {
    return this.platformSettingsDomain.setServiceState(service, state);
  }

  async getMessagingSettings() {
    return this.platformSettingsDomain.getMessagingSettings();
  }

  async updateMessagingSettings(updates: Partial<{
    globalVisible: boolean;
    supplierMessagingEnabled: boolean;
    maintenanceMessagingEnabled: boolean;
    baristaMessagingEnabled: boolean;
    academyMessagingEnabled: boolean;
    broadcastsEnabled: boolean;
    gracePeriodMinutes: number;
  }>) {
    return this.platformSettingsDomain.updateMessagingSettings(updates);
  }

  async getAuthProviderSettings() {
    return this.authProviderSettingsDomain.getAuthProviderSettings();
  }

  async updateAuthProviderSettings(updates: Partial<{ googleEnabled: boolean; facebookEnabled: boolean }>) {
    return this.authProviderSettingsDomain.updateAuthProviderSettings(updates);
  }

  async getLoginSecuritySettings() {
    return this.loginSecuritySettingsDomain.getLoginSecuritySettings();
  }

  async updateLoginSecuritySettings(updates: Partial<{
    lockoutEnabled: boolean; maxFailedAttempts: number; cooldownSeconds: number;
    rateLimitEnabled: boolean; rateLimitMaxRequests: number; rateLimitWindowSeconds: number;
    passwordMinLength: number; sessionInactivityTimeoutSeconds: number | null;
  }>) {
    return this.loginSecuritySettingsDomain.updateLoginSecuritySettings(updates);
  }

  // Platform Services (service order half).
  async getServiceOrder(): Promise<MarketplaceServiceId[]> {
    return this.platformSettingsDomain.getServiceOrder();
  }

  async setServiceOrder(order: MarketplaceServiceId[]): Promise<MarketplaceServiceId[]> {
    return this.platformSettingsDomain.setServiceOrder(order);
  }

  // ── Supplier stores ─────────────────────────────────────────────────────────
  async getSupplierStore(supplierId: number): Promise<SupplierStore | undefined> {
    return this.supplierDomain.getSupplierStore(supplierId);
  }

  async upsertSupplierStore(supplierId: number, data: Partial<InsertSupplierStore>): Promise<SupplierStore> {
    return this.supplierDomain.upsertSupplierStore(supplierId, data);
  }

  async getAllStoresAdmin(): Promise<StoreAdminRow[]> {
    return this.supplierDomain.getAllStoresAdmin();
  }

  async setStoreApprovalStatus(id: number, status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ON_HOLD'): Promise<SupplierStore | undefined> {
    return this.supplierDomain.setStoreApprovalStatus(id, status);
  }

  async setStoreAutoApprove(id: number, autoApprove: boolean): Promise<SupplierStore | undefined> {
    return this.supplierDomain.setStoreAutoApprove(id, autoApprove);
  }

  async updateStoreDisplayOrder(id: number, displayOrder: number): Promise<SupplierStore | undefined> {
    return this.supplierDomain.updateStoreDisplayOrder(id, displayOrder);
  }

  async bulkUpdateStoreOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    return this.supplierDomain.bulkUpdateStoreOrder(orders);
  }

  async deleteStore(id: number): Promise<void> {
    return this.supplierDomain.deleteStore(id);
  }

  async getVisibleStores(): Promise<StoreCard[]> {
    return this.supplierDomain.getVisibleStores();
  }

  async createSupplierReport(cafeOwnerId: number, supplierId: number, reason: string, rating?: number): Promise<SupplierReport> {
    return this.supplierDomain.createSupplierReport(cafeOwnerId, supplierId, reason, rating);
  }

  async getSupplierReportById(id: number): Promise<SupplierReport | undefined> {
    return this.supplierDomain.getSupplierReportById(id);
  }

  async getSupplierReports(status?: "PENDING" | "PUBLISHED" | "REJECTED"): Promise<(SupplierReport & { cafeOwnerName: string; supplierName: string })[]> {
    return this.supplierDomain.getSupplierReports(status);
  }

  async getPublishedSupplierReports(page = 1, limit = 10): Promise<{ reports: (Pick<SupplierReport, "id" | "supplierId" | "reason" | "rating" | "createdAt" | "resolvedAt"> & { supplierName: string; supplierProfileImageUrl: string | null })[]; total: number; page: number; limit: number }> {
    return this.supplierDomain.getPublishedSupplierReports(page, limit);
  }

  async resolveSupplierReport(id: number, status: "PUBLISHED" | "REJECTED", resolutionNote?: string, moderatedByAdminId?: number): Promise<SupplierReport | undefined> {
    return this.supplierDomain.resolveSupplierReport(id, status, resolutionNote, moderatedByAdminId);
  }

  async getStoreDetail(id: number, opts?: { requireVisible?: boolean }): Promise<StoreDetail | undefined> {
    return this.supplierDomain.getStoreDetail(id, opts);
  }

  async getStoreFavoritesByUser(userId: number): Promise<number[]> {
    return this.supplierDomain.getStoreFavoritesByUser(userId);
  }

  async addStoreFavorite(userId: number, storeId: number): Promise<void> {
    return this.supplierDomain.addStoreFavorite(userId, storeId);
  }

  async removeStoreFavorite(userId: number, storeId: number): Promise<void> {
    return this.supplierDomain.removeStoreFavorite(userId, storeId);
  }

  // ── Reviews ──────────────────────────────────────────────────────────────────
  // Cross-entity Reviews domain — shared review persistence regardless of
  // which domain owns the entity being reviewed (see ReviewsStorage).
  async createReview(data: {
    supplierId?: number | null;
    reviewType?: string | null;
    cafeId: number;
    productId?: number | null;
    listingId?: number | null;
    rating: number;
    comment?: string | null;
    cafeName: string;
    cafeOwnerName: string;
    productName?: string | null;
  }): Promise<SupplierProductReview> {
    return this.reviewsDomain.createReview(data);
  }

  async upsertReview(data: {
    supplierId?: number | null;
    reviewType: string;
    cafeId: number;
    productId?: number | null;
    listingId?: number | null;
    rating: number;
    comment?: string | null;
    cafeName: string;
    cafeOwnerName: string;
    productName?: string | null;
  }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    return this.reviewsDomain.upsertReview(data);
  }

  async getReviewsBySupplier(supplierId: number): Promise<SupplierProductReview[]> {
    return this.reviewsDomain.getReviewsBySupplier(supplierId);
  }

  async getProductReviewsBySupplier(supplierId: number): Promise<SupplierProductReview[]> {
    return this.reviewsDomain.getProductReviewsBySupplier(supplierId);
  }

  async getSupplierTypeReviews(supplierId: number): Promise<SupplierProductReview[]> {
    return this.reviewsDomain.getSupplierTypeReviews(supplierId);
  }

  async reportReview(reviewId: number, reason: string): Promise<void> {
    return this.reviewsDomain.reportReview(reviewId, reason);
  }

  async resolveReviewReport(reviewId: number): Promise<void> {
    return this.reviewsDomain.resolveReviewReport(reviewId);
  }

  async deleteReview(reviewId: number): Promise<void> {
    return this.reviewsDomain.deleteReview(reviewId);
  }

  async getAllReviews(filters?: { reviewType?: string; reported?: boolean }): Promise<SupplierProductReview[]> {
    return this.reviewsDomain.getAllReviews(filters);
  }

  async getExistingProductReview(productId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    return this.reviewsDomain.getExistingProductReview(productId, cafeId);
  }

  async getExistingSupplierReview(supplierId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    return this.reviewsDomain.getExistingSupplierReview(supplierId, cafeId);
  }

  async getReviewStatsByProduct(productId: number): Promise<{
    product: { avgRating: number; total: number };
    overall: { avgRating: number; total: number };
    bySupplier: Record<number, { avgRating: number; total: number }>;
  }> {
    return this.reviewsDomain.getReviewStatsByProduct(productId);
  }

  async getPackReviews(packId: number): Promise<SupplierProductReview[]> {
    return this.reviewsDomain.getPackReviews(packId);
  }

  async createPackReview(data: {
    packId: number;
    supplierId: number;
    cafeId: number;
    rating: number;
    comment?: string | null;
    cafeName: string;
    cafeOwnerName: string;
  }): Promise<SupplierProductReview> {
    return this.reviewsDomain.createPackReview(data);
  }

  // Landing Config — part of PlatformSettingsStorage, merged with Platform Services.
  async getLandingConfig(): Promise<LandingConfig> {
    return this.platformSettingsDomain.getLandingConfig();
  }

  async updateLandingConfig(data: Partial<Omit<LandingConfig, "id" | "updatedAt">>): Promise<LandingConfig> {
    return this.platformSettingsDomain.updateLandingConfig(data);
  }

  async getCurrency(): Promise<string> {
    return this.platformSettingsDomain.getCurrency();
  }

  async setCurrency(symbol: string): Promise<string> {
    return this.platformSettingsDomain.setCurrency(symbol);
  }

  // ── Prospecting ──────────────────────────────────────────────────────────────
  async matchProspectsToAccounts(
    prospectList: { id: number; email: string | null; phone: string | null }[]
  ): Promise<Map<number, { status: 'MATCHED' | 'AMBIGUOUS' | 'NONE'; accounts: { id: number; name: string; email: string; role: string }[] }>> {
    return this.prospecting.matchProspectsToAccounts(prospectList);
  }

  async getProspects(params: {
    search?: string; status?: string; prospectType?: string; city?: string;
    assignedTo?: number | null; hasPhone?: boolean; hasWebsite?: boolean; hasEmail?: boolean;
    minRating?: number; page?: number; limit?: number; sortBy?: string; sortOrder?: string;
  }): Promise<{ prospects: Prospect[]; total: number }> {
    return this.prospecting.getProspects(params);
  }

  async getProspect(id: number): Promise<Prospect | null> {
    return this.prospecting.getProspect(id);
  }

  async createProspect(data: Partial<InsertProspect>): Promise<Prospect> {
    return this.prospecting.createProspect(data);
  }

  async updateProspect(id: number, data: Partial<InsertProspect>): Promise<Prospect> {
    return this.prospecting.updateProspect(id, data);
  }

  async softDeleteProspect(id: number): Promise<void> {
    return this.prospecting.softDeleteProspect(id);
  }

  async bulkUpdateProspects(ids: number[], data: Partial<Prospect>): Promise<void> {
    return this.prospecting.bulkUpdateProspects(ids, data);
  }

  async bulkSoftDeleteProspects(ids: number[]): Promise<void> {
    return this.prospecting.bulkSoftDeleteProspects(ids);
  }

  async getProspectStats(): Promise<ProspectStats> {
    return this.prospecting.getProspectStats();
  }

  async getAllProspectTypes(): Promise<{ key: string; label: string; builtin: boolean }[]> {
    return this.prospecting.getAllProspectTypes();
  }

  async createProspectCustomType(label: string): Promise<{ key: string; label: string; builtin: boolean }> {
    return this.prospecting.createProspectCustomType(label);
  }

  async findDuplicateProspect(data: { googlePlaceId?: string; phone?: string }): Promise<Prospect | null> {
    return this.prospecting.findDuplicateProspect(data);
  }

  async getPromotions(supplierId: number): Promise<import("@shared/schema").Promotion[]> {
    return this.promotionsDomain.getPromotions(supplierId);
  }

  async getPromotion(id: number, supplierId?: number): Promise<import("@shared/schema").Promotion | undefined> {
    return this.promotionsDomain.getPromotion(id, supplierId);
  }

  async createPromotion(data: import("@shared/schema").InsertPromotion): Promise<import("@shared/schema").Promotion> {
    return this.promotionsDomain.createPromotion(data);
  }

  async updatePromotion(id: number, supplierId: number, updates: Partial<import("@shared/schema").InsertPromotion>): Promise<import("@shared/schema").Promotion | undefined> {
    return this.promotionsDomain.updatePromotion(id, supplierId, updates);
  }

  async deletePromotion(id: number, supplierId: number): Promise<void> {
    return this.promotionsDomain.deletePromotion(id, supplierId);
  }

  async duplicatePromotion(id: number, supplierId: number): Promise<import("@shared/schema").Promotion | undefined> {
    return this.promotionsDomain.duplicatePromotion(id, supplierId);
  }

  async getPromotionStats(supplierId: number): Promise<{ active: number; paused: number; scheduled: number; expired: number; totalUses: number; totalRevenue: number; totalDiscount: number }> {
    return this.promotionsDomain.getPromotionStats(supplierId);
  }

  async getPromotionUsage(promotionId: number): Promise<import("@shared/schema").PromotionUsage[]> {
    return this.promotionsDomain.getPromotionUsage(promotionId);
  }

  // ── Discount Codes ───────────────────────────────────────────────────────────
  async getDiscountCodes(supplierId: number): Promise<import("@shared/schema").DiscountCode[]> {
    return this.discountCodesDomain.getDiscountCodes(supplierId);
  }

  async removeDiscountCode(id: number, supplierId: number): Promise<import("@shared/schema").DiscountCode | undefined> {
    return this.discountCodesDomain.removeDiscountCode(id, supplierId);
  }

  async getDiscountCode(id: number, supplierId?: number): Promise<import("@shared/schema").DiscountCode | undefined> {
    return this.discountCodesDomain.getDiscountCode(id, supplierId);
  }

  async getDiscountCodeByCode(code: string): Promise<import("@shared/schema").DiscountCode | undefined> {
    return this.discountCodesDomain.getDiscountCodeByCode(code);
  }

  async createDiscountCode(data: import("@shared/schema").InsertDiscountCode): Promise<import("@shared/schema").DiscountCode> {
    return this.discountCodesDomain.createDiscountCode(data);
  }

  async updateDiscountCode(id: number, supplierId: number, updates: Partial<import("@shared/schema").InsertDiscountCode>): Promise<import("@shared/schema").DiscountCode | undefined> {
    return this.discountCodesDomain.updateDiscountCode(id, supplierId, updates);
  }

  async getDiscountCodeStats(supplierId: number): Promise<{ active: number; inactive: number; expired: number; usageLimitReached: number; totalRedemptions: number; totalDiscount: number }> {
    return this.discountCodesDomain.getDiscountCodeStats(supplierId);
  }

  async getDiscountCodeUsageHistory(discountCodeId: number): Promise<import("@shared/schema").DiscountCodeUsage[]> {
    return this.discountCodesDomain.getDiscountCodeUsageHistory(discountCodeId);
  }

  async validateDiscountCode(code: string, supplierId: number, subtotal: number): Promise<import("@shared/schema").DiscountCodeValidationResult> {
    return this.discountCodesDomain.validateDiscountCode(code, supplierId, subtotal);
  }

  async recordDiscountCodeUsage(discountCodeId: number, cafeId: number, orderId: number, subOrderId: number, discountAmount: number): Promise<void> {
    return this.discountCodesDomain.recordDiscountCodeUsage(discountCodeId, cafeId, orderId, subOrderId, discountAmount);
  }

  async getActivePromotionsForSupplier(supplierId: number, cafeId?: number): Promise<import("@shared/schema").Promotion[]> {
    return this.promotionsDomain.getActivePromotionsForSupplier(supplierId, cafeId);
  }

  async getPromotionsForListings(listingIds: number[], cafeId?: number): Promise<import("@shared/schema").ListingPromotion[]> {
    return this.promotionsDomain.getPromotionsForListings(listingIds, cafeId);
  }

  async evaluateCartPromotions(
    itemsBySupplier: Map<number, PromoCartItem[]>,
    cafeId: number,
  ): Promise<import("@shared/schema").CartPromotionEvaluation> {
    return this.promotionsDomain.evaluateCartPromotions(itemsBySupplier, cafeId);
  }

  async recordPromotionUsage(promotionId: number, cafeId: number, orderId: number, discountAmount: number): Promise<void> {
    return this.promotionsDomain.recordPromotionUsage(promotionId, cafeId, orderId, discountAmount);
  }

  async getCafeOrderCountForSupplier(cafeId: number, supplierId: number): Promise<number> {
    return this.promotionsDomain.getCafeOrderCountForSupplier(cafeId, supplierId);
  }

  // ── Messaging ──────────────────────────────────────────────────────────────
  async isConversationMessagingAllowed(conversationId: number, userId: number): Promise<boolean> {
    return this.messagesDomain.isConversationMessagingAllowed(conversationId, userId);
  }

  /** Refresh the lifecycle timestamp used by the messaging grace period. */
  async syncMessagingRelationship(userA: number, userB: number, service: string): Promise<void> {
    return this.messagesDomain.syncMessagingRelationship(userA, userB, service);
  }

  async refreshOrderMessagingState(orderId: number): Promise<void> {
    return this.messagesDomain.refreshOrderMessagingState(orderId);
  }

  // refreshMaintenanceMessagingState is NOT here — it's Maintenance-specific;
  // see the delegate near the rest of the Maintenance domain above.

  async deleteConversation(conversationId: number): Promise<number[]> {
    return this.messagesDomain.deleteConversation(conversationId);
  }

  /** Return all non-hidden conversations for a user, ordered by most recent activity. */
  async getConversationsForUser(userId: number, service?: string): Promise<ConversationSummary[]> {
    return this.messagesDomain.getConversationsForUser(userId, service);
  }

  /** Find an existing DIRECT conversation between two users, or create one. */
  async findOrCreateDirectConversation(userId1: number, userId2: number, service = 'SHOP'): Promise<{ conversation: typeof conversations.$inferSelect; isNew: boolean }> {
    return this.messagesDomain.findOrCreateDirectConversation(userId1, userId2, service);
  }

  /** Check if userId is a non-hidden participant of conversationId. */
  async isParticipant(conversationId: number, userId: number): Promise<boolean> {
    return this.messagesDomain.isParticipant(conversationId, userId);
  }

  async getConversationParticipantIds(conversationId: number): Promise<number[]> {
    return this.messagesDomain.getConversationParticipantIds(conversationId);
  }

  /** Get paginated messages for a conversation. Newest first for pagination, but return in asc order. */
  async getConversationMessages(conversationId: number, page: number, pageSize: number): Promise<{ msgs: ConversationMessageRow[]; total: number }> {
    return this.messagesDomain.getConversationMessages(conversationId, page, pageSize);
  }

  /** Persist a message and update conversation lastMessageAt. Returns the inserted message enriched with sender info. */
  async sendMessage(conversationId: number, senderId: number, content: string): Promise<ConversationMessageRow> {
    return this.messagesDomain.sendMessage(conversationId, senderId, content);
  }

  async getConversationService(conversationId: number): Promise<string | undefined> {
    return this.messagesDomain.getConversationService(conversationId);
  }

  /** Mark all messages in a conversation as read for a user. */
  async markConversationRead(conversationId: number, userId: number): Promise<void> {
    return this.messagesDomain.markConversationRead(conversationId, userId);
  }

  /** Admin: create a broadcast conversation to multiple users. */
  async createBroadcastConversation(adminId: number, title: string, targetUserIds: number[]): Promise<typeof conversations.$inferSelect> {
    return this.messagesDomain.createBroadcastConversation(adminId, title, targetUserIds);
  }

  /** Return users a given user is allowed to start a conversation with based on order relationships. */
  async getEligibleContacts(userId: number, service?: string): Promise<EligibleContact[]> {
    return this.messagesDomain.getEligibleContacts(userId, service);
  }

  /** Admin: hide or show a conversation for a specific user (or for all current participants if targetUserId is null). */
  async setConversationVisibility(conversationId: number, targetUserId: number | null, hidden: boolean, adminId: number): Promise<void> {
    return this.messagesDomain.setConversationVisibility(conversationId, targetUserId, hidden, adminId);
  }

  /** Admin: list all conversations with a summary of participants. */
  async adminGetAllConversations(service?: string): Promise<ConversationSummary[]> {
    return this.messagesDomain.adminGetAllConversations(service);
  }

  async getAdminConversationExport(filters: {
    service?: string;
    ids?: number[];
    from?: Date;
    to?: Date;
  }): Promise<Array<{
    conversation: typeof conversations.$inferSelect;
    participants: Array<{ id: number; name: string; role: string }>;
    message: ConversationMessageRow | null;
  }>> {
    return this.messagesDomain.getAdminConversationExport(filters);
  }

  async getUnreadMessageCount(userId: number): Promise<number> {
    return this.messagesDomain.getUnreadMessageCount(userId);
  }

  /** All Admin/Super Admin user ids — used to fan platform-level notifications out to every admin. */
  async getAdminUserIds(): Promise<number[]> {
    return this.messagesDomain.getAdminUserIds();
  }

  async getNotificationPreferences(userId: number): Promise<Record<string, boolean> | null> {
    return this.notificationsDomain.getNotificationPreferences(userId);
  }

  async updateNotificationPreferences(userId: number, patch: Record<string, boolean>): Promise<Record<string, boolean>> {
    return this.notificationsDomain.updateNotificationPreferences(userId, patch);
  }

  async filterUsersWithPreferenceEnabled(userIds: number[], prefKey: string): Promise<number[]> {
    return this.notificationsDomain.filterUsersWithPreferenceEnabled(userIds, prefKey);
  }

  async createNotification(data: InsertNotification): Promise<Notification | undefined> {
    return this.notificationsDomain.createNotification(data);
  }

  async createNotificationsForUsers(
    userIds: number[],
    data: Omit<InsertNotification, "userId" | "dedupeKey">,
    dedupeKeyPrefix: string,
  ): Promise<Notification[]> {
    return this.notificationsDomain.createNotificationsForUsers(userIds, data, dedupeKeyPrefix);
  }

  async getNotificationsForUser(userId: number, opts: { service?: NotificationService; unreadOnly?: boolean; limit?: number } = {}): Promise<Notification[]> {
    return this.notificationsDomain.getNotificationsForUser(userId, opts);
  }

  async getUnreadNotificationCount(userId: number, service?: NotificationService): Promise<number> {
    return this.notificationsDomain.getUnreadNotificationCount(userId, service);
  }

  async markNotificationRead(id: number, userId: number): Promise<void> {
    return this.notificationsDomain.markNotificationRead(id, userId);
  }

  async markAllNotificationsRead(userId: number, service?: NotificationService): Promise<void> {
    return this.notificationsDomain.markAllNotificationsRead(userId, service);
  }
}

export const storage = new DatabaseStorage();
