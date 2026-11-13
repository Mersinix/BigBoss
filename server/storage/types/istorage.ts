// Stage 2 — Batch 34: the IStorage interface, relocated verbatim out of
// server/storage.ts per the Storage Architecture Audit
// (server/STORAGE_ARCHITECTURE.md). Purely structural — every method
// signature, parameter type, return type, optional parameter, and
// comment below is byte-for-byte identical to the original declaration.
// server/storage.ts re-exports this type under the same name
// (`import type { IStorage } from "./storage/types/istorage"; export
// type { IStorage };`), so every existing
// `import type { IStorage } from "./storage"` call site anywhere in the
// repository continues to resolve unchanged.
//
// RedactedDelivery (used only by redactDeliveryCodes's return type) is
// still declared in server/storage.ts itself, since DatabaseStorage's
// own implementation also needs it — it was given an 'export' keyword
// (zero behavior change) so it can be imported back here, the same
// type-only circular-import pattern already used safely by 8 domain
// files referencing 'import type { DatabaseStorage }' (see Batch 24+).
import type {
  AcademyCourse, AcademyCourseCard, AcademyCourseSession, AcademyCourseSessionWithCourse,
  AcademyProfile, AcademyRegistration, AcademyRegistrationStatus,
  AcademyRegistrationWithParties, AcademyReport, AcademySessionStatus,
  AdminSupplierCategoryOverview, BaristaEducationLevel, BaristaJobApplication,
  BaristaJobApplicationWithParties, BaristaJobMeeting, BaristaJobPost,
  BaristaJobPostWithStats, BaristaJobTarget, BaristaLanguage, BaristaMarketplaceCard,
  BaristaMarketplaceMission, BaristaMarketplaceProfile, BaristaMarketplaceRequest,
  BaristaMissionStatus, BaristaMissionWithParties, BaristaRequestStatus,
  BaristaRequestWithParties, BaristaSkill, BillingInfo, Brand, BrandWithCount, Category,
  CategoryWithCount, CreateOrderItem, CreateOrderItemInput, CreatePackOrderItem,
  Delivery, DeliveryMode, DeliveryStatus, DeliveryWithDetails, Flavor, FlavorWithCount,
  InsertAcademyCourse, InsertAcademyProfile, InsertBaristaJobPost,
  InsertBaristaMarketplaceProfile, InsertBrand, InsertCategory, InsertFlavor,
  InsertMaintenanceJobPost, InsertMaintenanceProfile, InsertMaintenanceReservation,
  InsertOrderReturn, InsertPrintCatalogItem, InsertPrinterProfile, InsertProduct,
  InsertProspect, InsertSize, InsertSubCategory, InsertSupplierProductListing,
  InsertSupplierStore, InsertUser, InventoryAdjustment, InventoryAdjustmentWithVariant,
  InventoryFilters, InventoryListResult, InventorySort, InventoryStats, LandingConfig,
  MaintenanceCompetency, MaintenanceJobApplication, MaintenanceJobApplicationWithParties,
  MaintenanceJobPost, MaintenanceJobPostWithStats, MaintenanceJobTarget,
  MaintenanceMarketplaceCard, MaintenanceProfile, MaintenanceReservation,
  MaintenanceZone, MarketplaceProduct, MarketplaceServiceId, Order, OrderReturn,
  OrderWithDetails, PackDetail, PrintCatalogCard, PrintCatalogItem,
  PrintCategoryTaxonomy, PrintCompanyCard, PrintCompanyListCard, PrintOrder,
  PrintOrderWithParties, PrintSubCategoryTaxonomy, PrinterProfile, Product,
  ProductWithSupplier, ProductWithTaxonomy, Prospect, ProspectStats,
  ResolvedPackOrderItem, ServiceKey, ServiceState, ServiceStatesMap, ShopFavoriteItem,
  Size, SizeWithCount, StoreAdminRow, StoreCard, StoreDetail, SubCategory,
  AcademyBaristaRegistration,
  SubCategoryWithDetails, SubOrder, SupplierCafeRegistration, SupplierCategoryMapping, SupplierListingWithProduct,
  SupplierProductListing, SupplierProductReview, SupplierProductVariant, SupplierStore,
  SupplierVariantWithLabels, User, orders,
} from "@shared/schema";
import type { RedactedDelivery } from "../../storage";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserStatus(id: number, status: 'pending' | 'approved' | 'rejected'): Promise<User>;
  updateUser(id: number, data: Partial<any>): Promise<User>;
  deleteUser(id: number): Promise<void>;
  updateUserLocation(id: number, loc: { address: string; lat: string; lng: string; placeId: string; details?: import("@shared/schema").AddressDetails }): Promise<User>;
  updateUserProfile(id: number, updates: { name?: string; phone?: string; email?: string }): Promise<User>;
  updateUserBilling(id: number, billing: BillingInfo): Promise<User>;

  // Admin product catalog
  getAdminProducts(filters?: { categoryId?: number; subCategoryId?: number; flavorId?: number; sizeId?: number; brandId?: number; search?: string }): Promise<ProductWithTaxonomy[]>;
  getProduct(id: number): Promise<ProductWithTaxonomy | undefined>;
  createProduct(product: Partial<InsertProduct>): Promise<Product>;
  updateProduct(id: number, updates: Partial<InsertProduct>): Promise<Product>;
  deleteProduct(id: number): Promise<void>;

  // Legacy cafe browsing (stock > 0 only)
  getProducts(filters?: { category?: string; supplierId?: number; search?: string }): Promise<ProductWithSupplier[]>;

  // Orders
  getOrders(filters?: { cafeId?: number; supplierId?: number; driverId?: number; deliveryCompanyId?: number; viewerRole?: string }): Promise<OrderWithDetails[]>;
  getOrder(id: number): Promise<OrderWithDetails | undefined>;
  resolveOrderItems(items: CreateOrderItemInput[]): Promise<CreateOrderItem[]>;
  resolvePackOrderItems(items: CreatePackOrderItem[]): Promise<ResolvedPackOrderItem[]>;
  createOrder(cafeId: number, cartItems: CreateOrderItem[], opts?: {
    deliveryAddress?: import("@shared/schema").GeoLocation;
    deliveryMethod?: 'SELF_PICKUP' | 'DELIVERY_SERVICE';
    deliveryFee?: number;
    paymentMethod?: string;
    courierInstructions?: string;
    packItems?: ResolvedPackOrderItem[];
    promotionResults?: import("@shared/schema").SupplierPromotionResult[];
    priority?: string;
    scheduledAt?: Date;
  }): Promise<Order>;
  canUserAccessOrder(userId: number, userRole: string, orderId: number): Promise<boolean>;
  updateOrderStatus(id: number, status: typeof orders.$inferSelect.status, deliveryId?: number): Promise<Order>;
  cancelSubOrderItems(subOrderId: number, cafeOwnerId: number, orderItemIds: number[]): Promise<{ subOrder: SubOrder; order: Order }>;
  setOrderFavorite(orderId: number, cafeOwnerId: number, isFavorite: boolean): Promise<Order>;
  getReturns(filters?: { cafeId?: number; supplierId?: number }): Promise<OrderReturn[]>;
  createReturn(data: InsertOrderReturn): Promise<OrderReturn>;
  updateReturnStatus(id: number, status: string, supplierNotes?: string): Promise<OrderReturn>;

  // Deliveries — one per sub_order. See shared/schema.ts "Deliveries" section.
  createDeliveryForSubOrder(subOrderId: number): Promise<Delivery | null>;
  dispatchDelivery(deliveryId: number, supplierId: number, mode: DeliveryMode): Promise<Delivery>;
  cancelActiveDeliveryForSubOrder(subOrderId: number): Promise<Delivery | null>;
  getDeliveries(userId: number, role: string): Promise<DeliveryWithDetails[]>;
  getDelivery(id: number, viewerRole?: string): Promise<DeliveryWithDetails | undefined>;
  canUserAccessDelivery(userId: number, role: string, deliveryId: number): Promise<boolean>;
  acceptDelivery(deliveryId: number, deliveryCompanyId: number): Promise<Delivery>;
  assignDriver(deliveryId: number, actingUser: { id: number; role: string }, driverId: number): Promise<Delivery>;
  updateDeliveryStatus(deliveryId: number, actingUser: { id: number; role: string }, newStatus: DeliveryStatus, code?: string): Promise<Delivery>;
  /** Strips confirmation codes the given viewer role has no business seeing — see storage.ts comment. */
  redactDeliveryCodes(delivery: Delivery, viewerRole?: string): RedactedDelivery;
  getDriversForOwner(ownerType: 'DELIVERY_COMPANY' | 'SUPPLIER', ownerId: number): Promise<User[]>;
  createDriverForOwner(ownerType: 'DELIVERY_COMPANY' | 'SUPPLIER', ownerId: number, data: { name: string; email: string; password: string; phone?: string | null }): Promise<User>;
  getSupplierCafes(supplierId: number): Promise<Array<User & { orderCount: number; totalSpent: number; lastOrderAt: Date | null; referred: boolean }>>;
  // Supplier-initiated café registration requests — see shared/schema.ts
  // supplierCafeRegistrations for why this is a separate table from `users`.
  // Replaces the old createCafeForSupplier instant-approval path.
  createSupplierCafeRegistration(supplierId: number, data: { cafeName: string; contactName: string; email: string; address?: string | null; phone?: string | null }): Promise<SupplierCafeRegistration>;
  getSupplierCafeRegistrations(supplierId: number): Promise<SupplierCafeRegistration[]>;
  getAdminCafeRegistrations(): Promise<Array<SupplierCafeRegistration & { supplierName: string; supplierEmail: string }>>;
  approveCafeRegistration(registrationId: number, adminId: number, data: { contactName: string; email: string; phone?: string | null; isWhatsapp?: boolean; profileImageUrl?: string | null; password: string; address?: string | null; locationLat?: string | null; locationLng?: string | null; locationPlaceId?: string | null; locationDetails?: Record<string, any> | null }): Promise<{ registration: SupplierCafeRegistration; user: User }>;
  rejectCafeRegistration(registrationId: number, adminId: number, reason?: string | null): Promise<SupplierCafeRegistration>;
  // Academy-initiated barista registration requests — see shared/schema.ts
  // academyBaristaRegistrations for why this is separate from both `users` and the
  // unrelated academyRegistrations (course signup) table.
  createAcademyBaristaRegistration(academyId: number, data: { baristaName: string; contactName: string; email: string; address?: string | null; phone?: string | null }): Promise<AcademyBaristaRegistration>;
  getAcademyBaristaRegistrationsForAcademy(academyId: number): Promise<AcademyBaristaRegistration[]>;
  getAdminAcademyBaristaRegistrations(): Promise<Array<AcademyBaristaRegistration & { academyName: string; academyEmail: string }>>;
  approveAcademyBaristaRegistration(registrationId: number, adminId: number, data: { baristaName: string; email: string; phone?: string | null; isWhatsapp?: boolean; profileImageUrl?: string | null; password: string; address?: string | null; locationLat?: string | null; locationLng?: string | null; locationPlaceId?: string | null; locationDetails?: Record<string, any> | null }): Promise<{ registration: AcademyBaristaRegistration; user: User }>;
  rejectAcademyBaristaRegistration(registrationId: number, adminId: number, reason?: string | null): Promise<AcademyBaristaRegistration>;
  getApprovedDeliveryCompanyIds(): Promise<number[]>;
  getActiveDeliveryForSubOrder(subOrderId: number): Promise<Delivery | undefined>;

  // Marketplace (cafe browsing)
  getMarketplaceProducts(filters?: { categoryId?: number; subCategoryId?: number; search?: string; supplierId?: number }): Promise<MarketplaceProduct[]>;
  getMarketplaceProduct(productId: number, supplierId?: number): Promise<MarketplaceProduct | undefined>;
  // Lightweight, batched image+crop lookup (task: "Synchronize Updated
  // Product and Pack Images in Coffee Owner Cart") — never price/stock,
  // just enough for a cart/display row to re-resolve a fresh image.
  getProductImageData(ids: number[]): Promise<Array<{ id: number; imageUrl: string | null; imageUrls: string[] | null; imageAdjustments: Record<string, number> }>>;

  // Supplier product variants
  getVariantsByListingId(listingId: number): Promise<SupplierVariantWithLabels[]>;
  saveVariants(listingId: number, variants: { flavorId?: number | null; sizeId?: number | null; price: number; quantity: number }[]): Promise<SupplierVariantWithLabels[]>;

  // Categories
  getCategories(opts?: { includeAll?: boolean }): Promise<CategoryWithCount[]>;
  getCategory(id: number): Promise<Category | undefined>;
  createCategory(cat: Partial<InsertCategory>): Promise<Category>;
  updateCategory(id: number, updates: Partial<InsertCategory>): Promise<Category>;
  deleteCategory(id: number): Promise<void>;
  bulkUpdateCategoryOrder(orders: { id: number; displayOrder: number }[]): Promise<void>;

  // SubCategories
  getSubCategories(categoryId?: number, opts?: { includeAll?: boolean }): Promise<SubCategoryWithDetails[]>;
  createSubCategory(sub: Partial<InsertSubCategory>): Promise<SubCategory>;
  updateSubCategory(id: number, updates: Partial<InsertSubCategory>): Promise<SubCategory>;
  deleteSubCategory(id: number): Promise<void>;
  bulkUpdateSubCategoryOrder(orders: { id: number; displayOrder: number }[]): Promise<void>;

  // Flavors
  getFlavors(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<FlavorWithCount[]>;
  createFlavor(f: Partial<InsertFlavor>): Promise<Flavor>;
  updateFlavor(id: number, updates: Partial<InsertFlavor>): Promise<Flavor>;
  deleteFlavor(id: number): Promise<void>;
  bulkUpdateFlavorOrder(orders: { id: number; displayOrder: number }[]): Promise<void>;

  // Sizes
  getSizes(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<SizeWithCount[]>;
  createSize(s: Partial<InsertSize>): Promise<Size>;
  updateSize(id: number, updates: Partial<InsertSize>): Promise<Size>;
  deleteSize(id: number): Promise<void>;
  bulkUpdateSizeOrder(orders: { id: number; displayOrder: number }[]): Promise<void>;

  // Brands
  getBrands(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<BrandWithCount[]>;
  createBrand(b: Partial<InsertBrand>): Promise<Brand>;
  updateBrand(id: number, updates: Partial<InsertBrand>): Promise<Brand>;
  deleteBrand(id: number): Promise<void>;
  bulkUpdateBrandOrder(orders: { id: number; displayOrder: number }[]): Promise<void>;

  // Favorites (shop/product favorites, persisted per-user)
  getFavoritesByUser(userId: number): Promise<ShopFavoriteItem[]>;
  addFavorite(userId: number, productId: number): Promise<void>;
  removeFavorite(userId: number, productId: number): Promise<void>;

  // Packs
  getSupplierPacks(supplierId: number): Promise<PackDetail[]>;
  getPackDetail(id: number): Promise<PackDetail | undefined>;
  computeAutoPackQuantity(items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number }[]): Promise<number>;
  computePackItemsTotal(items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number }[]): Promise<number>;
  createPack(supplierId: number, data: { name: string; description?: string | null; imageUrl?: string | null; imageUrls?: string[] | null; flashImageUrl?: string | null; price: number; quantityAvailable: number; expirationDate?: Date | null; visibility?: 'VISIBLE' | 'HIDDEN' }, items: { listingId: number; variantId?: number | null; quantity: number; packVariantPrice?: number }[]): Promise<PackDetail>;
  createPack(supplierId: number, data: { name: string; description?: string | null; imageUrl?: string | null; imageUrls?: string[] | null; flashImageUrl?: string | null; price: number; quantityAvailable: number; expirationDate?: Date | null; visibility?: 'VISIBLE' | 'HIDDEN' }, items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number; packVariantPrice?: number }[]): Promise<PackDetail>;
  updatePack(id: number, supplierId: number, data: Partial<{ name: string; description: string | null; imageUrl: string | null; imageUrls: string[] | null; flashImageUrl: string | null; price: number; quantityAvailable: number; expirationDate: Date | null; visibility: 'VISIBLE' | 'HIDDEN'; isArchived: boolean }>, items?: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number; packVariantPrice?: number }[]): Promise<PackDetail | undefined>;
  validatePackItems(supplierId: number, items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number }[]): Promise<boolean>;
  duplicatePack(id: number, supplierId: number): Promise<PackDetail | undefined>;
  deletePack(id: number): Promise<void>;
  getMarketplacePacks(filters?: { categoryId?: number; subCategoryId?: number; brandId?: number; flavorId?: number; sizeId?: number; supplierId?: number }): Promise<PackDetail[]>;
  getAdminPacks(): Promise<PackDetail[]>;
  getPackFavoritesByUser(userId: number): Promise<number[]>;
  addPackFavorite(userId: number, packId: number): Promise<void>;
  removePackFavorite(userId: number, packId: number): Promise<void>;

  // Supplier stores
  getSupplierStore(supplierId: number): Promise<SupplierStore | undefined>;
  upsertSupplierStore(supplierId: number, data: Partial<InsertSupplierStore>): Promise<SupplierStore>;
  getAllStoresAdmin(): Promise<StoreAdminRow[]>;
  setStoreApprovalStatus(id: number, status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ON_HOLD'): Promise<SupplierStore | undefined>;
  setStoreAutoApprove(id: number, autoApprove: boolean): Promise<SupplierStore | undefined>;
  updateStoreDisplayOrder(id: number, displayOrder: number): Promise<SupplierStore | undefined>;
  bulkUpdateStoreOrder(orders: { id: number; displayOrder: number }[]): Promise<void>;
  deleteStore(id: number): Promise<void>;
  getVisibleStores(): Promise<StoreCard[]>;
  getStoreDetail(id: number, opts?: { requireVisible?: boolean }): Promise<StoreDetail | undefined>;

  // Store favorites
  getStoreFavoritesByUser(userId: number): Promise<number[]>;
  addStoreFavorite(userId: number, storeId: number): Promise<void>;
  removeStoreFavorite(userId: number, storeId: number): Promise<void>;

  // Supplier mappings
  getSupplierCategoryMappings(supplierId: number, options?: { approvedOnly?: boolean }): Promise<SupplierCategoryMapping[]>;
  getAdminSupplierCategoryOverview(supplierId: number): Promise<AdminSupplierCategoryOverview>;
  setSupplierCategories(supplierId: number, categoryIds: number[]): Promise<void>;
  addSupplierCategories(supplierId: number, categoryIds: number[], status?: 'APPROVED' | 'PENDING'): Promise<void>;
  reorderSupplierCategories(supplierId: number, categoryIds: number[]): Promise<void>;
  removeSupplierCategory(supplierId: number, categoryId: number): Promise<void>;
  setSupplierCategoryFrozen(supplierId: number, categoryId: number, isFrozen: boolean): Promise<void>;
  approveSupplierCategoryMapping(supplierId: number, categoryId: number): Promise<void>;
  setSupplierSubCategories(supplierId: number, subCategoryIds: number[]): Promise<void>;
  isProductAllowedForSupplier(supplierId: number, productId: number): Promise<boolean>;

  // Supplier product listings
  getSupplierListings(supplierId: number, filters?: { categoryId?: number; subCategoryId?: number; flavorId?: number; sizeId?: number; brandId?: number }): Promise<SupplierListingWithProduct[]>;
  createSupplierListing(data: Partial<InsertSupplierProductListing>): Promise<SupplierProductListing>;
  updateSupplierListing(id: number, updates: { price?: number; stock?: number; availableFlavorIds?: number[]; availableSizeIds?: number[]; availableBrandIds?: number[] }): Promise<SupplierProductListing>;
  deleteSupplierListing(id: number): Promise<number[]>;
  removeSupplierListingFromPacks(id: number): Promise<number[]>;
  getSupplierListingByProductId(supplierId: number, productId: number): Promise<SupplierProductListing | undefined>;

  // Supplier product workflow
  getSupplierCreatedProducts(supplierId: number): Promise<ProductWithTaxonomy[]>;
  createSupplierProduct(data: Partial<InsertProduct>): Promise<Product>;
  updateSupplierProduct(id: number, supplierId: number, updates: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteSupplierProduct(id: number, supplierId: number): Promise<{ deleted: boolean; archivedPackIds: number[] }>;
  getAdminSupplierProducts(): Promise<(ProductWithTaxonomy & { creatorName: string })[]>;
  approveSupplierProduct(id: number, adminId: number): Promise<Product>;

  // Platform services (System Management)
  getServiceStates(): Promise<ServiceStatesMap>;
  getServiceOrder(): Promise<MarketplaceServiceId[]>;
  setServiceOrder(order: MarketplaceServiceId[]): Promise<MarketplaceServiceId[]>;
  getLandingConfig(): Promise<LandingConfig>;
  updateLandingConfig(data: Partial<Omit<LandingConfig, "id" | "updatedAt">>): Promise<LandingConfig>;
  setServiceState(service: ServiceKey, state: ServiceState): Promise<ServiceStatesMap>;
  getMessagingSettings(): Promise<{
    globalVisible: boolean;
    supplierMessagingEnabled: boolean;
    maintenanceMessagingEnabled: boolean;
    baristaMessagingEnabled: boolean;
    academyMessagingEnabled: boolean;
    broadcastsEnabled: boolean;
    gracePeriodMinutes: number;
  }>;
  updateMessagingSettings(updates: Partial<{
    globalVisible: boolean;
    supplierMessagingEnabled: boolean;
    maintenanceMessagingEnabled: boolean;
    baristaMessagingEnabled: boolean;
    academyMessagingEnabled: boolean;
    broadcastsEnabled: boolean;
    gracePeriodMinutes: number;
  }>): Promise<{
    globalVisible: boolean;
    supplierMessagingEnabled: boolean;
    maintenanceMessagingEnabled: boolean;
    baristaMessagingEnabled: boolean;
    academyMessagingEnabled: boolean;
    broadcastsEnabled: boolean;
    gracePeriodMinutes: number;
  }>;
  getCurrency(): Promise<string>;
  setCurrency(symbol: string): Promise<string>;

  // Admin → System Management → Promotion — Supplier Promotions feature availability
  // (separate from promotion eligibility/pricing).
  getPromotionSettings(): Promise<{ globalVisible: boolean }>;
  updatePromotionSettings(updates: Partial<{ globalVisible: boolean }>): Promise<{ globalVisible: boolean }>;
  getPromotionTypeSettings(): Promise<import("@shared/schema").PromotionTypeSettingsMap>;
  setPromotionTypeEnabled(type: import("@shared/schema").PromotionType, enabled: boolean): Promise<import("@shared/schema").PromotionTypeSettingsMap>;
  getDiscountCodeSettings(): Promise<{ tabVisible: boolean; newCodeButtonVisible: boolean }>;
  updateDiscountCodeSettings(updates: Partial<{ tabVisible: boolean; newCodeButtonVisible: boolean }>): Promise<{ tabVisible: boolean; newCodeButtonVisible: boolean }>;

  // Google/Facebook sign-in — admin on/off toggle only (never credentials, see
  // server/oauth.ts for the env-var-driven "configured" check).
  getAuthProviderSettings(): Promise<{ googleEnabled: boolean; facebookEnabled: boolean }>;
  updateAuthProviderSettings(updates: Partial<{ googleEnabled: boolean; facebookEnabled: boolean }>): Promise<{ googleEnabled: boolean; facebookEnabled: boolean }>;

  // Authentication & Security Settings (task: "Expand Global Authentication &
  // Security Settings") — the per-account failed-login counters/cooldown
  // timestamps themselves stay in-memory (server/login-attempts.ts); this is
  // the configured policy, read fresh on every login/registration/rate-limit
  // check.
  getLoginSecuritySettings(): Promise<{
    lockoutEnabled: boolean;
    maxFailedAttempts: number;
    cooldownSeconds: number;
    rateLimitEnabled: boolean;
    rateLimitMaxRequests: number;
    rateLimitWindowSeconds: number;
    passwordMinLength: number;
    sessionInactivityTimeoutSeconds: number | null;
  }>;
  updateLoginSecuritySettings(updates: Partial<{
    lockoutEnabled: boolean;
    maxFailedAttempts: number;
    cooldownSeconds: number;
    rateLimitEnabled: boolean;
    rateLimitMaxRequests: number;
    rateLimitWindowSeconds: number;
    passwordMinLength: number;
    sessionInactivityTimeoutSeconds: number | null;
  }>): Promise<{
    lockoutEnabled: boolean;
    maxFailedAttempts: number;
    cooldownSeconds: number;
    rateLimitEnabled: boolean;
    rateLimitMaxRequests: number;
    rateLimitWindowSeconds: number;
    passwordMinLength: number;
    sessionInactivityTimeoutSeconds: number | null;
  }>;

  // Maintenance marketplace
  getMaintenanceProfiles(filters?: { search?: string; category?: string; profileType?: string; available?: boolean; location?: string }): Promise<MaintenanceMarketplaceCard[]>;
  getMaintenanceCategories(): Promise<string[]>;
  getMaintenanceProfile(userId: number): Promise<MaintenanceProfile>;
  upsertMaintenanceProfile(userId: number, updates: Partial<InsertMaintenanceProfile>): Promise<MaintenanceProfile>;
  bulkUpdateMaintenanceOrder(orders: { id: number; displayOrder: number }[]): Promise<void>;
  setMaintenanceAutoApprove(userId: number, autoApprove: boolean): Promise<MaintenanceProfile>;
  getMaintenanceReservationsForProvider(userId: number): Promise<(MaintenanceReservation & { cafeOwner: string; ownerPhone: string | null })[]>;
  getMaintenanceReservationsForOwner(userId: number): Promise<(MaintenanceReservation & { maintenanceName: string })[]>;
  getMaintenanceRevenueSummary(maintenanceUserId: number): Promise<{
    totalEarnedCents: number; completedReservations: number; currentMonthCents: number; currentMonthReservations: number;
    pendingCents: number; pendingReservations: number; dailyRateInCents: number;
    history: { month: string; totalCents: number; reservations: number }[];
  }>;
  createMaintenanceReservation(data: InsertMaintenanceReservation): Promise<MaintenanceReservation>;
  updateMaintenanceReservationStatus(id: number, providerId: number, status: string, schedule?: { date?: string; time?: string | null }): Promise<MaintenanceReservation | undefined>;
  requestMaintenanceReschedule(id: number, providerId: number, proposedDate: string, proposedTime: string | null): Promise<MaintenanceReservation | undefined>;
  respondToMaintenanceReschedule(id: number, ownerId: number, accepted: boolean): Promise<MaintenanceReservation | undefined>;
  getMaintenanceReviews(maintenanceUserId: number): Promise<SupplierProductReview[]>;
  getMaintenanceReviewForReservation(reservationId: number, cafeId: number): Promise<SupplierProductReview | undefined>;
  upsertMaintenanceReview(data: { maintenanceUserId: number; reservationId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string; cafeOwnerName: string }): Promise<{ review: SupplierProductReview; isUpdate: boolean }>;
  deleteMaintenanceReview(reviewId: number): Promise<boolean>;
  getMaintenanceAdminOverview(): Promise<any>;
  getMaintenanceTaxonomy(): Promise<{ competencies: MaintenanceCompetency[]; zones: MaintenanceZone[] }>;
  createMaintenanceCompetency(name: string, icon?: string | null): Promise<MaintenanceCompetency>;
  updateMaintenanceCompetency(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<MaintenanceCompetency | undefined>;
  deleteMaintenanceCompetency(id: number): Promise<void>;
  createMaintenanceZone(name: string): Promise<MaintenanceZone>;
  updateMaintenanceZone(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<MaintenanceZone | undefined>;
  deleteMaintenanceZone(id: number): Promise<void>;
  getMaintenanceFavoritesByUser(userId: number): Promise<number[]>;
  addMaintenanceFavorite(userId: number, maintenanceUserId: number): Promise<void>;
  removeMaintenanceFavorite(userId: number, maintenanceUserId: number): Promise<void>;

  // Maintenance — Job posting system ("Interventions")
  isMaintenanceProviderEligible(userId: number): Promise<boolean>;
  createMaintenanceJobPost(cafeOwnerId: number, data: Partial<InsertMaintenanceJobPost>): Promise<MaintenanceJobPost>;
  updateMaintenanceJobPost(id: number, cafeOwnerId: number, data: Partial<InsertMaintenanceJobPost>): Promise<MaintenanceJobPost | undefined>;
  getMaintenanceJobPostById(id: number): Promise<MaintenanceJobPost | undefined>;
  getMaintenanceJobPostsForOwner(cafeOwnerId: number): Promise<MaintenanceJobPostWithStats[]>;
  getMaintenanceJobPostWithStats(id: number): Promise<MaintenanceJobPostWithStats | undefined>;
  getDiscoverableMaintenanceJobPosts(maintenanceUserId: number): Promise<(MaintenanceJobPost & { isTargeted: boolean })[]>;
  addMaintenanceJobTarget(jobPostId: number, maintenanceUserId: number): Promise<MaintenanceJobTarget>;
  getMaintenanceJobTargets(jobPostId: number): Promise<(MaintenanceJobTarget & { maintenanceName: string; maintenanceProfileImageUrl: string | null })[]>;
  isMaintenanceJobTargeted(jobPostId: number, maintenanceUserId: number): Promise<boolean>;
  createMaintenanceJobApplication(jobPostId: number, maintenanceUserId: number, message?: string | null): Promise<MaintenanceJobApplication>;
  getMaintenanceJobApplicationById(id: number): Promise<MaintenanceJobApplication | undefined>;
  hasMaintenanceAppliedToJob(jobPostId: number, maintenanceUserId: number): Promise<boolean>;
  getMaintenanceJobApplicationsForJob(jobPostId: number): Promise<MaintenanceJobApplicationWithParties[]>;
  getMaintenanceJobApplicationsForProvider(maintenanceUserId: number): Promise<MaintenanceJobApplicationWithParties[]>;
  rejectMaintenanceJobApplication(id: number): Promise<MaintenanceJobApplication | undefined>;
  acceptMaintenanceJobApplication(id: number): Promise<{ application: MaintenanceJobApplication; reservation: MaintenanceReservation } | undefined>;

  // PRINT
  getPrintCatalogForPrinter(printerId: number): Promise<PrintCatalogItem[]>;
  createPrintCatalogItem(printerId: number, data: Partial<InsertPrintCatalogItem>): Promise<PrintCatalogItem>;
  updatePrintCatalogItem(id: number, printerId: number, updates: Partial<InsertPrintCatalogItem>): Promise<PrintCatalogItem | undefined>;
  deletePrintCatalogItem(id: number, printerId: number): Promise<boolean>;
  getPrintMarketplaceCards(filters?: { search?: string; category?: string; printerId?: number; viewerLocation?: { lat: string | null; lng: string | null } | null }): Promise<PrintCatalogCard[]>;
  getPrintMarketplaceCard(id: number, viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<PrintCatalogCard | undefined>;
  getPrintCatalogItemCard(id: number): Promise<PrintCatalogCard | undefined>;
  getPrintCategories(): Promise<string[]>;
  getPrintOrdersForPrinter(printerId: number): Promise<PrintOrderWithParties[]>;
  getPrintOrdersForOwner(ownerId: number): Promise<PrintOrderWithParties[]>;
  createPrintOrder(cafeOwnerId: number, data: { catalogItemId: number; quantity: number; notes?: string; deliveryAddress?: string; contactPhone?: string }): Promise<PrintOrder>;
  updatePrintOrderStatus(id: number, printerId: number, status: string): Promise<PrintOrder | undefined>;
  getPrintRevenueSummary(printerId: number): Promise<{ totalEarnedCents: number; completedOrders: number; currentMonthCents: number; currentMonthOrders: number; history: { month: string; totalCents: number; orders: number }[] }>;
  getPrintCategoryTaxonomy(): Promise<PrintCategoryTaxonomy[]>;
  createPrintCategory(name: string, icon?: string | null): Promise<PrintCategoryTaxonomy>;
  updatePrintCategory(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<PrintCategoryTaxonomy | undefined>;
  deletePrintCategory(id: number): Promise<void>;
  adminSetPrintCatalogItemActive(id: number, isActive: boolean): Promise<PrintCatalogItem | undefined>;
  getPrintAdminOverview(): Promise<any>;
  getPrintSubCategoryTaxonomy(categoryId?: number): Promise<PrintSubCategoryTaxonomy[]>;
  createPrintSubCategory(categoryId: number, name: string, icon?: string | null): Promise<PrintSubCategoryTaxonomy>;
  updatePrintSubCategory(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<PrintSubCategoryTaxonomy | undefined>;
  deletePrintSubCategory(id: number): Promise<void>;
  getPrintSubCategories(): Promise<string[]>;
  getPrinterCategoryMapping(printerId: number): Promise<{ categories: string[]; subCategories: string[] }>;
  setPrinterCategoryMapping(printerId: number, mapping: { categories: string[]; subCategories: string[] }): Promise<{ categories: string[]; subCategories: string[]; rejected: { categories: string[]; subCategories: string[] } }>;
  getPrintReviews(printerId: number): Promise<SupplierProductReview[]>;
  getPrintReviewForOrder(orderId: number, cafeId: number): Promise<SupplierProductReview | undefined>;
  upsertPrintReview(data: { printerId: number; printOrderId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string }): Promise<{ review: SupplierProductReview; isUpdate: boolean }>;
  getPrinterProfile(userId: number): Promise<PrinterProfile>;
  upsertPrinterProfile(userId: number, updates: Partial<InsertPrinterProfile>): Promise<PrinterProfile>;
  bulkUpdatePrinterOrder(orders: { id: number; displayOrder: number }[]): Promise<void>;
  setPrinterAutoApprove(userId: number, autoApprove: boolean): Promise<PrinterProfile>;
  getPrintCompanyCard(userId: number): Promise<PrintCompanyCard | undefined>;
  getPrintCompanyCards(viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<PrintCompanyListCard[]>;
  getPrintFavoritesByUser(userId: number): Promise<number[]>;
  addPrintFavorite(userId: number, printItemId: number): Promise<void>;
  removePrintFavorite(userId: number, printItemId: number): Promise<void>;
  getPrintCompanyFavoritesByUser(userId: number): Promise<number[]>;
  addPrintCompanyFavorite(userId: number, printerId: number): Promise<void>;
  removePrintCompanyFavorite(userId: number, printerId: number): Promise<void>;

  // Barista Marketplace
  getBaristaSkills(activeOnly?: boolean): Promise<BaristaSkill[]>;
  createBaristaSkill(name: string, icon?: string | null): Promise<BaristaSkill>;
  updateBaristaSkill(id: number, data: { name?: string; icon?: string | null; isActive?: boolean; isFrozen?: boolean }): Promise<BaristaSkill | undefined>;
  deleteBaristaSkill(id: number): Promise<void>;
  getBaristaMarketplaceProfile(userId: number): Promise<BaristaMarketplaceProfile>;
  upsertBaristaMarketplaceProfile(userId: number, updates: Partial<InsertBaristaMarketplaceProfile>): Promise<BaristaMarketplaceProfile>;
  bulkUpdateBaristaOrder(orders: { id: number; displayOrder: number }[]): Promise<void>;
  setBaristaAutoApprove(userId: number, autoApprove: boolean): Promise<BaristaMarketplaceProfile>;
  getBaristaMarketplaceProfiles(filters?: { search?: string; level?: string; skill?: string; city?: string; available?: boolean }): Promise<BaristaMarketplaceCard[]>;
  getBaristaMarketplaceCard(userId: number): Promise<BaristaMarketplaceCard | undefined>;
  getBaristaRequestsForBarista(userId: number): Promise<BaristaRequestWithParties[]>;
  getBaristaRequestsForOwner(userId: number): Promise<BaristaRequestWithParties[]>;
  getBaristaRequestById(id: number): Promise<BaristaMarketplaceRequest | undefined>;
  createBaristaRequest(cafeOwnerId: number, data: { baristaUserId: number; missionType: string; message: string; proposedRateInCents?: number | null; startDate: string; endDate?: string | null }): Promise<BaristaMarketplaceRequest>;
  updateBaristaRequestStatus(requestId: number, actingUser: { id: number; role: string }, newStatus: BaristaRequestStatus, extra?: { cancelReason?: string }): Promise<{ request: BaristaMarketplaceRequest; mission: BaristaMarketplaceMission | null }>;
  getBaristaMissionsForBarista(userId: number): Promise<BaristaMissionWithParties[]>;
  getBaristaMissionsForOwner(userId: number): Promise<BaristaMissionWithParties[]>;
  getBaristaMissionById(id: number): Promise<BaristaMarketplaceMission | undefined>;
  updateBaristaMissionStatus(missionId: number, actingUser: { id: number; role: string }, newStatus: BaristaMissionStatus): Promise<BaristaMarketplaceMission>;
  getBaristaReviews(baristaUserId: number): Promise<SupplierProductReview[]>;
  getBaristaReviewForMission(missionId: number, cafeId: number): Promise<SupplierProductReview | undefined>;
  upsertBaristaReview(data: { baristaUserId: number; missionId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string; cafeOwnerName: string }): Promise<{ review: SupplierProductReview; isUpdate: boolean }>;
  getBaristaRevenueSummary(baristaUserId: number): Promise<{ totalEarnedCents: number; completedMissions: number; currentMonthCents: number; currentMonthMissions: number; history: { month: string; totalCents: number; missions: number }[] }>;
  refreshBaristaMessagingState(requestId: number): Promise<void>;
  getBaristaFavoritesByUser(userId: number): Promise<number[]>;
  addBaristaFavorite(userId: number, baristaUserId: number): Promise<void>;
  removeBaristaFavorite(userId: number, baristaUserId: number): Promise<void>;
  getBaristaAdminOverview(): Promise<any>;
  getBaristaEducationLevels(activeOnly?: boolean): Promise<BaristaEducationLevel[]>;
  createBaristaEducationLevel(name: string): Promise<BaristaEducationLevel>;
  updateBaristaEducationLevel(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<BaristaEducationLevel | undefined>;
  deleteBaristaEducationLevel(id: number): Promise<void>;
  getBaristaLanguages(activeOnly?: boolean): Promise<BaristaLanguage[]>;
  createBaristaLanguage(name: string): Promise<BaristaLanguage>;
  updateBaristaLanguage(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<BaristaLanguage | undefined>;
  deleteBaristaLanguage(id: number): Promise<void>;
  createBaristaJobPost(cafeOwnerId: number, data: Partial<InsertBaristaJobPost>): Promise<BaristaJobPost>;
  updateBaristaJobPost(id: number, cafeOwnerId: number, data: Partial<InsertBaristaJobPost>): Promise<BaristaJobPost | undefined>;
  getBaristaJobPostById(id: number): Promise<BaristaJobPost | undefined>;
  getBaristaJobPostsForOwner(cafeOwnerId: number, recordType?: "OFFER" | "MISSION"): Promise<BaristaJobPostWithStats[]>;
  getBaristaJobPostWithStats(id: number): Promise<BaristaJobPostWithStats | undefined>;
  getDiscoverableBaristaJobPosts(baristaUserId: number, recordType?: "OFFER" | "MISSION"): Promise<(BaristaJobPost & { establishment: string; isTargeted: boolean })[]>;
  addBaristaJobTarget(jobPostId: number, baristaUserId: number): Promise<BaristaJobTarget>;
  getBaristaJobTargets(jobPostId: number): Promise<(BaristaJobTarget & { baristaName: string; baristaProfileImageUrl: string | null })[]>;
  isBaristaJobTargeted(jobPostId: number, baristaUserId: number): Promise<boolean>;
  createBaristaJobApplication(jobPostId: number, baristaUserId: number, message?: string | null): Promise<BaristaJobApplication>;
  getBaristaJobApplicationById(id: number): Promise<BaristaJobApplication | undefined>;
  getBaristaJobApplicationsForJob(jobPostId: number): Promise<BaristaJobApplicationWithParties[]>;
  getBaristaJobApplicationsForBarista(baristaUserId: number): Promise<BaristaJobApplicationWithParties[]>;
  updateBaristaJobApplicationStatus(id: number, status: string): Promise<BaristaJobApplication | undefined>;
  hasBaristaAppliedToJob(jobPostId: number, baristaUserId: number): Promise<boolean>;
  upsertBaristaJobMeeting(applicationId: number, data: { scheduledAt: Date; notes?: string | null }): Promise<BaristaJobMeeting>;
  updateBaristaJobMeetingStatus(id: number, status: string): Promise<BaristaJobMeeting | undefined>;
  getBaristaJobMeetingByApplication(applicationId: number): Promise<BaristaJobMeeting | undefined>;

  // Barista Academy
  getAcademyProfile(userId: number): Promise<AcademyProfile>;
  upsertAcademyProfile(userId: number, updates: Partial<InsertAcademyProfile>): Promise<AcademyProfile>;
  bulkUpdateAcademyOrder(orders: { id: number; displayOrder: number }[]): Promise<void>;
  setAcademyAutoApprove(userId: number, autoApprove: boolean): Promise<AcademyProfile>;
  getAcademyCoursesForAcademy(academyUserId: number): Promise<AcademyCourse[]>;
  getAcademyCourseById(id: number): Promise<AcademyCourse | undefined>;
  createAcademyCourse(academyUserId: number, data: Partial<InsertAcademyCourse>): Promise<AcademyCourse>;
  updateAcademyCourse(id: number, academyUserId: number, data: Partial<InsertAcademyCourse>): Promise<AcademyCourse | undefined>;
  deleteAcademyCourse(id: number, academyUserId: number): Promise<void>;
  getPublishedAcademyCourses(filters?: { search?: string; level?: string; certification?: boolean; viewerLocation?: { lat: string | null; lng: string | null } | null }): Promise<AcademyCourseCard[]>;
  getAcademyCourseCard(id: number, viewerLocation?: { lat: string | null; lng: string | null } | null): Promise<AcademyCourseCard | undefined>;
  getAcademyFavoritesByUser(userId: number): Promise<number[]>;
  addAcademyFavorite(userId: number, courseId: number): Promise<void>;
  removeAcademyFavorite(userId: number, courseId: number): Promise<void>;
  getAcademyOrganisationFavoritesByUser(userId: number): Promise<number[]>;
  addAcademyOrganisationFavorite(userId: number, academyUserId: number): Promise<void>;
  removeAcademyOrganisationFavorite(userId: number, academyUserId: number): Promise<void>;
  createAcademyReport(cafeOwnerId: number, academyUserId: number, reason: string, rating?: number): Promise<AcademyReport>;
  getAcademyReportById(id: number): Promise<AcademyReport | undefined>;
  getAcademyReports(status?: "PENDING" | "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED"): Promise<(AcademyReport & { cafeOwnerName: string; academyName: string })[]>;
  getAcademyReportsByOwner(cafeOwnerId: number): Promise<(AcademyReport & { academyName: string; academyProfileImageUrl: string | null; academyLocation: string | null })[]>;
  getPublishedAcademyReports(page?: number, limit?: number): Promise<{ reports: any[]; total: number; page: number; limit: number }>;
  resolveAcademyReport(id: number, status: "RESOLVED" | "DISMISSED" | "PUBLISHED" | "REJECTED", resolutionNote?: string, moderatedByAdminId?: number): Promise<AcademyReport | undefined>;
  getAcademySessionsForCourse(courseId: number): Promise<AcademyCourseSession[]>;
  getAcademySessionsForAcademy(academyUserId: number): Promise<AcademyCourseSessionWithCourse[]>;
  createAcademySession(academyUserId: number, data: { courseId: number; startDate: string; endDate?: string | null; capacity?: number | null }): Promise<AcademyCourseSession>;
  updateAcademySession(id: number, academyUserId: number, data: Partial<{ startDate: string; endDate: string | null; capacity: number | null; status: AcademySessionStatus }>): Promise<AcademyCourseSession | undefined>;
  deleteAcademySession(id: number, academyUserId: number): Promise<void>;
  getAcademyRegistrationsForAcademy(academyUserId: number): Promise<AcademyRegistrationWithParties[]>;
  getAcademyRegistrationsForOwner(cafeOwnerId: number): Promise<AcademyRegistrationWithParties[]>;
  getAcademyRegistrationsForBarista(baristaUserId: number): Promise<AcademyRegistrationWithParties[]>;
  getAcademyRegistrationById(id: number): Promise<AcademyRegistration | undefined>;
  createAcademyRegistration(registrantId: number, data: { courseId: number; sessionId?: number | null; participantCount?: number; participants?: string[]; notes?: string; participantType?: 'CAFE_OWNER' | 'BARISTA_MARKETPLACE' }): Promise<AcademyRegistration>;
  updateAcademyRegistrationStatus(id: number, actingUser: { id: number; role: string }, newStatus: AcademyRegistrationStatus): Promise<AcademyRegistration>;
  getAcademyReviews(academyUserId: number): Promise<SupplierProductReview[]>;
  getAcademyReviewForRegistration(registrationId: number, cafeId: number): Promise<SupplierProductReview | undefined>;
  upsertAcademyReview(data: { academyUserId: number; registrationId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string; cafeOwnerName: string }): Promise<{ review: SupplierProductReview; isUpdate: boolean }>;
  getAcademyRevenueSummary(academyUserId: number): Promise<{
    totalEarnedCents: number; completedRegistrations: number; currentMonthCents: number; currentMonthRegistrations: number;
    pendingCents: number; pendingRegistrations: number;
    history: { month: string; totalCents: number; registrations: number }[];
  }>;
  refreshAcademyMessagingState(registrationId: number): Promise<void>;
  getAcademyAdminOverview(): Promise<any>;

  // Inventory
  getSupplierInventory(supplierId: number, filters?: InventoryFilters, sort?: InventorySort, page?: number, pageSize?: number): Promise<InventoryListResult>;
  getSupplierInventoryStats(supplierId: number, filters?: InventoryFilters): Promise<InventoryStats>;
  getListingForSupplier(listingId: number, supplierId: number): Promise<SupplierProductListing | undefined>;
  adjustListingStock(listingId: number, supplierId: number, userId: number | null, input: { type: 'INCREASE' | 'DECREASE' | 'SET'; quantity: number; reason: string; notes?: string }): Promise<{ listing: SupplierProductListing; history: InventoryAdjustment }>;
  getListingStockHistory(listingId: number, supplierId: number): Promise<InventoryAdjustmentWithVariant[]>;
  updateListingInventoryFields(listingId: number, supplierId: number, updates: { sku?: string | null; barcode?: string | null; minStock?: number; maxStock?: number | null; unit?: string; visibility?: 'VISIBLE' | 'HIDDEN' }): Promise<SupplierProductListing>;
  adjustVariantStock(variantId: number, supplierId: number, userId: number | null, input: { type: 'INCREASE' | 'DECREASE' | 'SET'; quantity: number; reason: string; notes?: string }): Promise<{ variant: SupplierProductVariant; listing: SupplierProductListing; history: InventoryAdjustment; lowStockTriggered: boolean }>;
  updateVariantInventoryFields(variantId: number, supplierId: number, updates: { minStock?: number | null; maxStock?: number | null }): Promise<SupplierProductVariant>;
  bulkInventoryAction(supplierId: number, listingIds: number[], action: 'hide' | 'show' | 'delete' | 'setMinStock' | 'stock', payload?: { minStock?: number; type?: 'INCREASE' | 'DECREASE' | 'SET'; quantity?: number; reason?: string; userId?: number | null }): Promise<{ updated: number }>;

  // Prospecting
  getProspects(params: { search?: string; status?: string; prospectType?: string; city?: string; assignedTo?: number | null; hasPhone?: boolean; hasWebsite?: boolean; hasEmail?: boolean; minRating?: number; page?: number; limit?: number; sortBy?: string; sortOrder?: string }): Promise<{ prospects: Prospect[]; total: number }>;
  getProspect(id: number): Promise<Prospect | null>;
  createProspect(data: Partial<InsertProspect>): Promise<Prospect>;
  updateProspect(id: number, data: Partial<InsertProspect>): Promise<Prospect>;
  softDeleteProspect(id: number): Promise<void>;
  bulkUpdateProspects(ids: number[], data: Partial<Prospect>): Promise<void>;
  bulkSoftDeleteProspects(ids: number[]): Promise<void>;
  getProspectStats(): Promise<ProspectStats>;
  findDuplicateProspect(data: { googlePlaceId?: string; phone?: string }): Promise<Prospect | null>;
  getAllProspectTypes(): Promise<{ key: string; label: string; builtin: boolean }[]>;
  createProspectCustomType(label: string): Promise<{ key: string; label: string; builtin: boolean }>;
  matchProspectsToAccounts(prospectList: { id: number; email: string | null; phone: string | null }[]): Promise<Map<number, { status: 'MATCHED' | 'AMBIGUOUS' | 'NONE'; accounts: { id: number; name: string; email: string; role: string }[] }>>;

  // Promotions
  getPromotions(supplierId: number): Promise<import("@shared/schema").Promotion[]>;
  getPromotion(id: number, supplierId?: number): Promise<import("@shared/schema").Promotion | undefined>;
  createPromotion(data: import("@shared/schema").InsertPromotion): Promise<import("@shared/schema").Promotion>;
  updatePromotion(id: number, supplierId: number, updates: Partial<import("@shared/schema").InsertPromotion>): Promise<import("@shared/schema").Promotion | undefined>;
  deletePromotion(id: number, supplierId: number): Promise<void>;
  duplicatePromotion(id: number, supplierId: number): Promise<import("@shared/schema").Promotion | undefined>;
  getPromotionStats(supplierId: number): Promise<{ active: number; paused: number; scheduled: number; expired: number; totalUses: number; totalRevenue: number; totalDiscount: number }>;
  getPromotionUsage(promotionId: number): Promise<import("@shared/schema").PromotionUsage[]>;
  // Active promotions for a supplier visible to a specific cafe (or all if null)
  getActivePromotionsForSupplier(supplierId: number, cafeId?: number): Promise<import("@shared/schema").Promotion[]>;
  // All active promotions across all suppliers for listed listing IDs (for marketplace badges)
  getPromotionsForListings(listingIds: number[], cafeId?: number): Promise<import("@shared/schema").ListingPromotion[]>;
  getPromotionDetailForListing(promotionId: number, listingId: number, variant: { flavorId: number | null; sizeId: number | null }, cafeId?: number): Promise<import("@shared/schema").CustomerPromotionDetail | undefined>;
  // Evaluate cart promotions server-side (wraps the engine)
  evaluateCartPromotions(itemsBySupplier: Map<number, import("../../promotions-engine").PromoCartItem[]>, cafeId: number): Promise<import("@shared/schema").CartPromotionEvaluation>;
  // Record usage after an order is created
  recordPromotionUsage(promotionId: number, cafeId: number, orderId: number, discountAmount: number): Promise<void>;

  // Discount Codes — separate mechanism from Promotions (see shared/schema.ts note)
  getDiscountCodes(supplierId: number): Promise<import("@shared/schema").DiscountCode[]>;
  getDiscountCode(id: number, supplierId?: number): Promise<import("@shared/schema").DiscountCode | undefined>;
  getDiscountCodeByCode(code: string): Promise<import("@shared/schema").DiscountCode | undefined>;
  createDiscountCode(data: import("@shared/schema").InsertDiscountCode): Promise<import("@shared/schema").DiscountCode>;
  updateDiscountCode(id: number, supplierId: number, updates: Partial<import("@shared/schema").InsertDiscountCode>): Promise<import("@shared/schema").DiscountCode | undefined>;
  getDiscountCodeStats(supplierId: number): Promise<{ active: number; inactive: number; expired: number; usageLimitReached: number; totalRedemptions: number; totalDiscount: number }>;
  getDiscountCodeUsageHistory(discountCodeId: number): Promise<import("@shared/schema").DiscountCodeUsage[]>;
  validateDiscountCode(code: string, supplierId: number, subtotal: number): Promise<import("@shared/schema").DiscountCodeValidationResult>;
  recordDiscountCodeUsage(discountCodeId: number, cafeId: number, orderId: number, subOrderId: number, discountAmount: number): Promise<void>;
  // Get order count for a cafe from a supplier (for first-order promos)
  getCafeOrderCountForSupplier(cafeId: number, supplierId: number): Promise<number>;
}
