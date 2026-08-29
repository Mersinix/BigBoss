import crypto from "crypto";
import { db } from "./db";
import { isNull, isNotNull, or, like, gte, lte } from "drizzle-orm";
import { evaluateCartPromotions as engineEvaluate } from "./promotions-engine";
import type { PromoCartItem } from "./promotions-engine";
import {
  users, products, orders, orderItems, subOrders, supplierProductVariants,
  categories, subCategories, flavors, sizes, brands,
  supplierCategories, supplierSubCategories, supplierProductListings, favorites,
  platformServices, supplierStores, storeFavorites, supplierProductReviews,
  landingConfig, messagingSettings, packs, packItems, packFavorites, inventoryAdjustments, prospects,
  maintenanceProfiles, maintenanceFavorites, maintenanceReservations,
  maintenanceCompetencies, maintenanceZones,
  printCatalogItems, printOrders, printCategoryTaxonomy, printSubCategoryTaxonomy,
  baristaSkills, baristaMarketplaceProfiles, baristaMarketplaceRequests, baristaMarketplaceMissions, baristaMarketplaceFavorites,
  promotions, promotionUsage,
  conversations, conversationParticipants, messages,
  orderReturns,
  deliveries,
  passwordResetCodes,
  type OrderReturn, type InsertOrderReturn,
  type Delivery, type DeliveryStatus, type DeliveryMode, type DeliveryWithDetails, type GeoLocation,
  type LandingConfig, type Prospect, type InsertProspect, type ProspectStats,
  type ConversationSummary, type ConversationDetail, type ConversationMessageRow, type EligibleContact,
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
  type Pack, type PackItem, type PackFavorite, type PackDetail, type PackItemDetail, type TaxonomyLabel,
  type CreatePackOrderItem, type ResolvedPackOrderItem,
  type InventoryItem, type InventoryVariantItem, type InventoryListResult, type InventoryStats, type InventoryFilters, type InventorySort, type InventoryAdjustmentWithVariant,
  type InventoryAdjustment, type StockStatus,
  type MaintenanceProfile, type InsertMaintenanceProfile, type MaintenanceMarketplaceCard,
  type MaintenanceReservation, type InsertMaintenanceReservation,
  type MaintenanceCompetency, type MaintenanceZone,
  type PrintCatalogItem, type InsertPrintCatalogItem, type PrintCatalogCard,
  type PrintOrder, type InsertPrintOrder, type PrintOrderWithParties,
  type PrintCategoryTaxonomy, type PrintSubCategoryTaxonomy,
  type BaristaSkill, type BaristaMarketplaceProfile, type InsertBaristaMarketplaceProfile,
  type BaristaMarketplaceRequest, type BaristaMarketplaceMission,
  type BaristaMarketplaceCard, type BaristaRequestWithParties, type BaristaMissionWithParties,
  type BaristaRequestStatus, type BaristaMissionStatus,
} from "@shared/schema";
import { eq, and, inArray, ne, sql, notInArray, asc, desc } from "drizzle-orm";

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
  redactDeliveryCodes(delivery: Delivery, viewerRole?: string): Delivery;
  getDriversForOwner(ownerType: 'DELIVERY_COMPANY' | 'SUPPLIER', ownerId: number): Promise<User[]>;
  createDriverForOwner(ownerType: 'DELIVERY_COMPANY' | 'SUPPLIER', ownerId: number, data: { name: string; email: string; password: string; phone?: string | null }): Promise<User>;
  getApprovedDeliveryCompanyIds(): Promise<number[]>;
  getActiveDeliveryForSubOrder(subOrderId: number): Promise<Delivery | undefined>;

  // Marketplace (cafe browsing)
  getMarketplaceProducts(filters?: { categoryId?: number; subCategoryId?: number; search?: string; supplierId?: number }): Promise<MarketplaceProduct[]>;
  getMarketplaceProduct(productId: number, supplierId?: number): Promise<MarketplaceProduct | undefined>;

  // Supplier product variants
  getVariantsByListingId(listingId: number): Promise<SupplierVariantWithLabels[]>;
  saveVariants(listingId: number, variants: { flavorId?: number | null; sizeId?: number | null; price: number; quantity: number }[]): Promise<SupplierVariantWithLabels[]>;

  // Categories
  getCategories(opts?: { includeAll?: boolean }): Promise<CategoryWithCount[]>;
  getCategory(id: number): Promise<Category | undefined>;
  createCategory(cat: Partial<InsertCategory>): Promise<Category>;
  updateCategory(id: number, updates: Partial<InsertCategory>): Promise<Category>;
  deleteCategory(id: number): Promise<void>;

  // SubCategories
  getSubCategories(categoryId?: number, opts?: { includeAll?: boolean }): Promise<SubCategoryWithDetails[]>;
  createSubCategory(sub: Partial<InsertSubCategory>): Promise<SubCategory>;
  updateSubCategory(id: number, updates: Partial<InsertSubCategory>): Promise<SubCategory>;
  deleteSubCategory(id: number): Promise<void>;

  // Flavors
  getFlavors(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<FlavorWithCount[]>;
  createFlavor(f: Partial<InsertFlavor>): Promise<Flavor>;
  updateFlavor(id: number, updates: Partial<InsertFlavor>): Promise<Flavor>;
  deleteFlavor(id: number): Promise<void>;

  // Sizes
  getSizes(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<SizeWithCount[]>;
  createSize(s: Partial<InsertSize>): Promise<Size>;
  updateSize(id: number, updates: Partial<InsertSize>): Promise<Size>;
  deleteSize(id: number): Promise<void>;

  // Brands
  getBrands(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<BrandWithCount[]>;
  createBrand(b: Partial<InsertBrand>): Promise<Brand>;
  updateBrand(id: number, updates: Partial<InsertBrand>): Promise<Brand>;
  deleteBrand(id: number): Promise<void>;

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
    broadcastsEnabled: boolean;
    gracePeriodMinutes: number;
  }>;
  updateMessagingSettings(updates: Partial<{
    globalVisible: boolean;
    supplierMessagingEnabled: boolean;
    maintenanceMessagingEnabled: boolean;
    broadcastsEnabled: boolean;
    gracePeriodMinutes: number;
  }>): Promise<{
    globalVisible: boolean;
    supplierMessagingEnabled: boolean;
    maintenanceMessagingEnabled: boolean;
    broadcastsEnabled: boolean;
    gracePeriodMinutes: number;
  }>;
  getCurrency(): Promise<string>;
  setCurrency(symbol: string): Promise<string>;

  // Maintenance marketplace
  getMaintenanceProfiles(filters?: { search?: string; category?: string; profileType?: string; available?: boolean; location?: string }): Promise<MaintenanceMarketplaceCard[]>;
  getMaintenanceCategories(): Promise<string[]>;
  getMaintenanceProfile(userId: number): Promise<MaintenanceProfile>;
  upsertMaintenanceProfile(userId: number, updates: Partial<InsertMaintenanceProfile>): Promise<MaintenanceProfile>;
  getMaintenanceReservationsForProvider(userId: number): Promise<(MaintenanceReservation & { cafeOwner: string; ownerPhone: string | null })[]>;
  getMaintenanceReservationsForOwner(userId: number): Promise<(MaintenanceReservation & { maintenanceName: string })[]>;
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
  createMaintenanceCompetency(name: string): Promise<MaintenanceCompetency>;
  updateMaintenanceCompetency(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<MaintenanceCompetency | undefined>;
  deleteMaintenanceCompetency(id: number): Promise<void>;
  createMaintenanceZone(name: string): Promise<MaintenanceZone>;
  updateMaintenanceZone(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<MaintenanceZone | undefined>;
  deleteMaintenanceZone(id: number): Promise<void>;
  getMaintenanceFavoritesByUser(userId: number): Promise<number[]>;
  addMaintenanceFavorite(userId: number, maintenanceUserId: number): Promise<void>;
  removeMaintenanceFavorite(userId: number, maintenanceUserId: number): Promise<void>;

  // PRINT
  getPrintCatalogForPrinter(printerId: number): Promise<PrintCatalogItem[]>;
  createPrintCatalogItem(printerId: number, data: Partial<InsertPrintCatalogItem>): Promise<PrintCatalogItem>;
  updatePrintCatalogItem(id: number, printerId: number, updates: Partial<InsertPrintCatalogItem>): Promise<PrintCatalogItem | undefined>;
  deletePrintCatalogItem(id: number, printerId: number): Promise<boolean>;
  getPrintMarketplaceCards(filters?: { search?: string; category?: string; printerId?: number }): Promise<PrintCatalogCard[]>;
  getPrintMarketplaceCard(id: number): Promise<PrintCatalogCard | undefined>;
  getPrintCategories(): Promise<string[]>;
  getPrintOrdersForPrinter(printerId: number): Promise<PrintOrderWithParties[]>;
  getPrintOrdersForOwner(ownerId: number): Promise<PrintOrderWithParties[]>;
  createPrintOrder(cafeOwnerId: number, data: { catalogItemId: number; quantity: number; notes?: string; deliveryAddress?: string; contactPhone?: string }): Promise<PrintOrder>;
  updatePrintOrderStatus(id: number, printerId: number, status: string): Promise<PrintOrder | undefined>;
  getPrintRevenueSummary(printerId: number): Promise<{ totalEarnedCents: number; completedOrders: number; currentMonthCents: number; currentMonthOrders: number; history: { month: string; totalCents: number; orders: number }[] }>;
  getPrintCategoryTaxonomy(): Promise<PrintCategoryTaxonomy[]>;
  createPrintCategory(name: string): Promise<PrintCategoryTaxonomy>;
  updatePrintCategory(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<PrintCategoryTaxonomy | undefined>;
  deletePrintCategory(id: number): Promise<void>;
  adminSetPrintCatalogItemActive(id: number, isActive: boolean): Promise<PrintCatalogItem | undefined>;
  getPrintAdminOverview(): Promise<any>;
  getPrintSubCategoryTaxonomy(categoryId?: number): Promise<PrintSubCategoryTaxonomy[]>;
  createPrintSubCategory(categoryId: number, name: string): Promise<PrintSubCategoryTaxonomy>;
  updatePrintSubCategory(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<PrintSubCategoryTaxonomy | undefined>;
  deletePrintSubCategory(id: number): Promise<void>;
  getPrintSubCategories(): Promise<string[]>;
  getPrinterCategoryMapping(printerId: number): Promise<{ categories: string[]; subCategories: string[] }>;
  setPrinterCategoryMapping(printerId: number, mapping: { categories: string[]; subCategories: string[] }): Promise<{ categories: string[]; subCategories: string[]; rejected: { categories: string[]; subCategories: string[] } }>;
  getPrintReviews(printerId: number): Promise<SupplierProductReview[]>;
  getPrintReviewForOrder(orderId: number, cafeId: number): Promise<SupplierProductReview | undefined>;
  upsertPrintReview(data: { printerId: number; printOrderId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string }): Promise<{ review: SupplierProductReview; isUpdate: boolean }>;

  // Barista Marketplace
  getBaristaSkills(activeOnly?: boolean): Promise<BaristaSkill[]>;
  createBaristaSkill(name: string): Promise<BaristaSkill>;
  updateBaristaSkill(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<BaristaSkill | undefined>;
  deleteBaristaSkill(id: number): Promise<void>;
  getBaristaMarketplaceProfile(userId: number): Promise<BaristaMarketplaceProfile>;
  upsertBaristaMarketplaceProfile(userId: number, updates: Partial<InsertBaristaMarketplaceProfile>): Promise<BaristaMarketplaceProfile>;
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
  getProspects(params: { search?: string; status?: string; prospectType?: string; city?: string; assignedTo?: number | null; hasPhone?: boolean; hasWebsite?: boolean; hasEmail?: boolean; page?: number; limit?: number; sortBy?: string; sortOrder?: string }): Promise<{ prospects: Prospect[]; total: number }>;
  getProspect(id: number): Promise<Prospect | null>;
  createProspect(data: Partial<InsertProspect>): Promise<Prospect>;
  updateProspect(id: number, data: Partial<InsertProspect>): Promise<Prospect>;
  softDeleteProspect(id: number): Promise<void>;
  bulkUpdateProspects(ids: number[], data: Partial<Prospect>): Promise<void>;
  bulkSoftDeleteProspects(ids: number[]): Promise<void>;
  getProspectStats(): Promise<ProspectStats>;
  findDuplicateProspect(data: { googlePlaceId?: string; phone?: string }): Promise<Prospect | null>;

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
  // Evaluate cart promotions server-side (wraps the engine)
  evaluateCartPromotions(itemsBySupplier: Map<number, import("./promotions-engine").PromoCartItem[]>, cafeId: number): Promise<import("@shared/schema").CartPromotionEvaluation>;
  // Record usage after an order is created
  recordPromotionUsage(promotionId: number, cafeId: number, orderId: number, discountAmount: number): Promise<void>;
  // Get order count for a cafe from a supplier (for first-order promos)
  getCafeOrderCountForSupplier(cafeId: number, supplierId: number): Promise<number>;
}

// ── Taxonomy cache helper ─────────────────────────────────────────────────────

async function buildTaxonomyCache() {
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

function enrichProduct(
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

// ── DatabaseStorage ───────────────────────────────────────────────────────────

export class DatabaseStorage implements IStorage {
  async getUser(id: number) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPhone(phone: string) {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async createUser(user: InsertUser) {
    const [created] = await db.insert(users).values(user as any).returning();
    // A Maintenance account gets its marketplace profile from the same
    // registration record. The profile remains private until the account is
    // approved, because marketplace queries filter by users.status.
    if (created.role === "MAINTENANCE") {
      await db.insert(maintenanceProfiles).values({
        userId: created.id,
        categories: created.maintenanceCategories ?? [],
      }).onConflictDoNothing({ target: maintenanceProfiles.userId });
    }
    return created;
  }

  async updateUserStatus(id: number, status: 'pending' | 'approved' | 'rejected') {
    const [updated] = await db.update(users).set({ status }).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateUser(id: number, data: Partial<any>) {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: number) {
    await db.delete(users).where(eq(users.id, id));
  }

  async updateUserLocation(id: number, loc: { address: string; lat: string; lng: string; placeId: string; details?: import("@shared/schema").AddressDetails }) {
    const [updated] = await db.update(users).set({
      locationAddress: loc.address,
      locationLat: loc.lat,
      locationLng: loc.lng,
      locationPlaceId: loc.placeId,
      locationDetails: loc.details ?? null,
    }).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateUserProfile(id: number, updates: { name?: string; phone?: string; email?: string; password?: string; isWhatsapp?: boolean; profileImageUrl?: string | null }) {
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return updated;
  }

  // ── Password reset ────────────────────────────────────────────────────────────
  // Two-phase: a 6-digit code is emailed and verified first, then a short-lived opaque
  // token authorizes the actual password change in a separate request (see
  // shared/schema.ts passwordResetCodes for the full rationale). Only hashes are ever
  // persisted; raw values exist only transiently in memory / in the outgoing email.

  private hashResetValue(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
  }

  /**
   * Creates a new reset code for this user, invalidating any still-usable prior codes first
   * (so requesting a new code always makes older ones dead, never leaving two valid codes at
   * once). Returns the RAW 6-digit code — the only caller allowed to see it is the route
   * handler, which passes it straight to sendPasswordResetEmail and never returns it in the
   * HTTP response.
   *
   * All expiry/cooldown timestamps here are computed and later compared using Postgres's own
   * now() (via sql`now() + interval ...`), never app-side `new Date()` arithmetic. These
   * columns are `timestamp without time zone`, and this database's session timezone is not
   * UTC — writing an app-computed Date through the driver and later comparing it against a
   * DB-computed defaultNow() value on the same column type produced a real, verified bug
   * (codeExpiresAt appearing to be over an hour before its own createdAt), which made the
   * resend cooldown permanently block every request. Keeping every write AND every comparison
   * on the database's clock avoids that entire class of mismatch.
   */
  async createPasswordResetCode(userId: number): Promise<string> {
    await db.update(passwordResetCodes)
      .set({ usedAt: sql`now()` })
      .where(and(eq(passwordResetCodes.userId, userId), isNull(passwordResetCodes.usedAt)));

    const code = String(crypto.randomInt(100000, 1000000));
    await db.insert(passwordResetCodes).values({
      userId,
      codeHash: this.hashResetValue(code),
      codeExpiresAt: sql`now() + interval '10 minutes'` as unknown as Date,
    });
    return code;
  }

  /** Most recent still-usable (not consumed) reset-code row for a user, if any — used both
   * to verify a code and to apply a short per-email cooldown on new requests. */
  private async getActivePasswordResetRow(userId: number) {
    const rows = await db.select().from(passwordResetCodes)
      .where(and(eq(passwordResetCodes.userId, userId), isNull(passwordResetCodes.usedAt)))
      .orderBy(desc(passwordResetCodes.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Cooldown check before issuing a new code, so "resend" can't be used to spam a user's
   * inbox or brute-force-probe email addresses at high volume. Computed entirely in SQL
   * (created_at vs now() - interval), never against an app-side Date — see
   * createPasswordResetCode's comment for why. */
  async canRequestNewPasswordResetCode(userId: number): Promise<boolean> {
    const [row] = await db.select({ tooSoon: sql<boolean>`${passwordResetCodes.createdAt} > now() - interval '60 seconds'` })
      .from(passwordResetCodes)
      .where(and(eq(passwordResetCodes.userId, userId), isNull(passwordResetCodes.usedAt)))
      .orderBy(desc(passwordResetCodes.createdAt))
      .limit(1);
    if (!row) return true;
    return !row.tooSoon;
  }

  private static readonly MAX_RESET_CODE_ATTEMPTS = 5;

  /**
   * Verifies a submitted code against this user's latest active reset request. On success,
   * consumes the code (so it can never be verified a second time) and issues a short-lived
   * opaque token (returned raw, stored only as a hash) that the final reset-password step
   * must present — the numeric code itself is never accepted again after this point.
   */
  async verifyPasswordResetCode(userId: number, code: string): Promise<
    { ok: true; resetToken: string } | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" }
  > {
    const row = await this.getActivePasswordResetRow(userId);
    if (!row) return { ok: false, reason: "invalid" };
    const [{ expired }] = await db.select({ expired: sql<boolean>`${passwordResetCodes.codeExpiresAt} < now()` })
      .from(passwordResetCodes).where(eq(passwordResetCodes.id, row.id));
    if (expired) return { ok: false, reason: "expired" };
    if (row.codeAttempts >= DatabaseStorage.MAX_RESET_CODE_ATTEMPTS) {
      // Burn the row so a fresh "forgot password" request is required — caps total guesses
      // per emailed code at MAX_RESET_CODE_ATTEMPTS regardless of how this state was reached.
      await db.update(passwordResetCodes).set({ usedAt: sql`now()` }).where(eq(passwordResetCodes.id, row.id));
      return { ok: false, reason: "too_many_attempts" };
    }
    if (this.hashResetValue(code) !== row.codeHash) {
      await db.update(passwordResetCodes)
        .set({ codeAttempts: sql`${passwordResetCodes.codeAttempts} + 1` })
        .where(eq(passwordResetCodes.id, row.id));
      return { ok: false, reason: "invalid" };
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    await db.update(passwordResetCodes)
      .set({
        verifiedTokenHash: this.hashResetValue(resetToken),
        verifiedTokenExpiresAt: sql`now() + interval '10 minutes'` as unknown as Date,
      })
      .where(eq(passwordResetCodes.id, row.id));
    return { ok: true, resetToken };
  }

  /**
   * Applies the actual password change. Looks the row up strictly by the token's hash (never
   * trusts a client-supplied userId/email for this step) and requires usedAt still null and
   * the token not expired — so a token can authorize exactly one password change, for exactly
   * the account whose code was verified, and never after 10 minutes.
   */
  async resetPasswordWithToken(resetToken: string, newPassword: string): Promise<boolean> {
    const tokenHash = this.hashResetValue(resetToken);
    const [row] = await db.select().from(passwordResetCodes)
      .where(and(
        eq(passwordResetCodes.verifiedTokenHash, tokenHash),
        isNull(passwordResetCodes.usedAt),
        sql`${passwordResetCodes.verifiedTokenExpiresAt} > now()`,
      ));
    if (!row) return false;

    await db.transaction(async (tx) => {
      await tx.update(users).set({ password: newPassword }).where(eq(users.id, row.userId));
      await tx.update(passwordResetCodes).set({ usedAt: sql`now()` }).where(eq(passwordResetCodes.id, row.id));
    });
    return true;
  }

  async updateUserBilling(id: number, billing: BillingInfo) {
    const [updated] = await db.update(users).set({ billingInfo: billing }).where(eq(users.id, id)).returning();
    return updated;
  }

  // ── Admin products ──────────────────────────────────────────────────────────

  async getAdminProducts(filters?: { categoryId?: number; subCategoryId?: number; flavorId?: number; sizeId?: number; brandId?: number; search?: string }) {
    const all = await db.select().from(products).where(eq(products.isAdminProduct, true));
    const tx = await buildTaxonomyCache();
    const supplierIds = Array.from(new Set(all.map((p) => p.supplierId).filter(Boolean))) as number[];
    const supplierRows = supplierIds.length ? await db.select().from(users).where(inArray(users.id, supplierIds)) : [];
    const supplierMap = new Map(supplierRows.map((u) => [u.id, u.name]));
    let enriched = all.map((p) => enrichProduct(p, tx, supplierMap.get(p.supplierId!) ?? ""));
    if (filters?.categoryId) enriched = enriched.filter((p) => p.categoryId === filters.categoryId);
    if (filters?.subCategoryId) enriched = enriched.filter((p) => p.subCategoryId === filters.subCategoryId);
    if (filters?.flavorId) enriched = enriched.filter((p) => p.flavorIds?.includes(filters.flavorId!) || p.flavorId === filters.flavorId);
    if (filters?.sizeId) enriched = enriched.filter((p) => p.sizeIds?.includes(filters.sizeId!) || p.sizeId === filters.sizeId);
    if (filters?.brandId) enriched = enriched.filter((p) => p.brandId === filters.brandId);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      enriched = enriched.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q));
    }
    return enriched;
  }

  async getProduct(id: number): Promise<ProductWithTaxonomy | undefined> {
    const [p] = await db.select().from(products).where(eq(products.id, id));
    if (!p) return undefined;
    const tx = await buildTaxonomyCache();
    return enrichProduct(p, tx);
  }

  async createProduct(product: Partial<InsertProduct>) {
    const [created] = await db.insert(products).values(product as any).returning();
    return created;
  }

  async updateProduct(id: number, updates: Partial<InsertProduct>) {
    const [updated] = await db.update(products).set(updates as any).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteProduct(id: number) {
    const listings = await db.select({ id: supplierProductListings.id }).from(supplierProductListings).where(eq(supplierProductListings.productId, id));
    if (listings.length) {
      const listingIds = listings.map((l) => l.id);
      await db.delete(supplierProductVariants).where(inArray(supplierProductVariants.listingId, listingIds));
      await db.delete(supplierProductListings).where(inArray(supplierProductListings.id, listingIds));
    }
    await db.delete(products).where(eq(products.id, id));
  }

  // ── Legacy product browsing ─────────────────────────────────────────────────

  async getProducts(filters?: { category?: string; supplierId?: number; search?: string }): Promise<ProductWithSupplier[]> {
    const allProducts = await db.select().from(products);
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    let result = allProducts.map((p) => ({
      ...p,
      supplier: p.supplierId ? { id: p.supplierId, name: userMap.get(p.supplierId)?.name ?? "" } : undefined,
    }));
    if (filters?.supplierId) result = result.filter((p) => p.supplierId === filters.supplierId);
    if (filters?.category) result = result.filter((p) => p.category === filters.category);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    return result.filter((p) => p.stock > 0);
  }

  // ── Orders ──────────────────────────────────────────────────────────────────

  async getOrders(filters?: { cafeId?: number; supplierId?: number; driverId?: number; deliveryCompanyId?: number; viewerRole?: string }): Promise<OrderWithDetails[]> {
    const allOrders = await db.select().from(orders);
    const allItems = await db.select().from(orderItems);
    const allProducts = await db.select().from(products);
    const allUsers = await db.select().from(users);
    const allSubOrders = await db.select().from(subOrders);
    const allDeliveries = await db.select().from(deliveries);

    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const productMap = new Map(allProducts.map((p) => [p.id, p]));
    const deliveriesBySubOrder = new Map<number, typeof allDeliveries>();
    for (const d of allDeliveries) {
      if (!deliveriesBySubOrder.has(d.subOrderId)) deliveriesBySubOrder.set(d.subOrderId, []);
      deliveriesBySubOrder.get(d.subOrderId)!.push(d);
    }
    // The single active (non-CANCELLED) delivery for a sub-order, if any — mirrors the DB's
    // partial unique index (deliveries_sub_order_active_unique in shared/schema.ts).
    const activeDeliveryFor = (subOrderId: number) =>
      (deliveriesBySubOrder.get(subOrderId) ?? []).find((d) => d.status !== 'CANCELLED') ?? null;

    let filtered = allOrders;
    if (filters?.cafeId) filtered = filtered.filter((o) => o.cafeId === filters.cafeId);
    if (filters?.supplierId) {
      const supplierSubOrderIds = allSubOrders.filter((so) => so.supplierId === filters.supplierId).map((so) => so.orderId);
      filtered = filtered.filter((o) => supplierSubOrderIds.includes(o.id) || o.supplierId === filters.supplierId);
    }
    // Delivery-role scoping is driven by real deliveries rows (never by order.status alone —
    // see canUserAccessOrder below for why the previous status-based check was unsafe).
    if (filters?.driverId) {
      const driverOrderIds = new Set(allDeliveries.filter((d) => d.driverId === filters.driverId).map((d) => d.orderId));
      filtered = filtered.filter((o) => driverOrderIds.has(o.id));
    }
    if (filters?.deliveryCompanyId) {
      const companyOrderIds = new Set(allDeliveries.filter((d) => d.deliveryCompanyId === filters.deliveryCompanyId).map((d) => d.orderId));
      filtered = filtered.filter((o) => companyOrderIds.has(o.id));
    }

    return filtered.map((order) => {
      const cafe = userMap.get(order.cafeId);
      const supplier = order.supplierId ? userMap.get(order.supplierId) : null;
      // Legacy/unused column — see shared/schema.ts orders.deliveryId comment. Never written
      // by any code path; kept only so existing consumers of OrderWithDetails.delivery don't break.
      const legacyDeliveryUser = order.deliveryId ? userMap.get(order.deliveryId) : null;

      // Build all subOrders for this order, each with its own scoped items + its own delivery
      let orderSubOrders = allSubOrders.filter((so) => so.orderId === order.id).map((so) => {
        const delivery = activeDeliveryFor(so.id);
        const deliveryCompany = delivery?.deliveryCompanyId ? userMap.get(delivery.deliveryCompanyId) : null;
        const driver = delivery?.driverId ? userMap.get(delivery.driverId) : null;
        return {
          ...so,
          items: allItems.filter((i) => i.subOrderId === so.id).map((i) => ({ ...i, product: (i.productId != null ? productMap.get(i.productId) : undefined) ?? {} as Product })),
          delivery: delivery ? {
            id: delivery.id,
            status: delivery.status,
            deliveryCompany: deliveryCompany ? { id: deliveryCompany.id, name: deliveryCompany.name } : null,
            driver: driver ? { id: driver.id, name: driver.name, phone: driver.phone } : null,
            pickedUpAt: delivery.pickedUpAt,
            inTransitAt: delivery.inTransitAt,
            deliveredAt: delivery.deliveredAt,
            // Redacted to the one role that should read each — see storage.redactDeliveryCodes.
            pickupCode: filters?.viewerRole === 'SUPPLIER' || filters?.viewerRole === 'ADMIN' || filters?.viewerRole === 'SUPER_ADMIN' ? delivery.pickupCode : null,
            dropoffCode: filters?.viewerRole === 'CAFE_OWNER' || filters?.viewerRole === 'ADMIN' || filters?.viewerRole === 'SUPER_ADMIN' ? delivery.dropoffCode : null,
          } : null,
        };
      });

      // When filtering by supplierId, restrict subOrders to only that supplier's own.
      // This prevents one supplier from seeing another supplier's items or sub-totals.
      if (filters?.supplierId) {
        orderSubOrders = orderSubOrders.filter((so) => so.supplierId === filters.supplierId);
      }

      // Top-level items: scoped to this supplier's subOrders when supplierId filter is active;
      // full order items for cafe owners and admins.
      const supplierSubOrderIds = filters?.supplierId
        ? new Set(orderSubOrders.map((so) => so.id))
        : null;
      const items = allItems
        .filter((i) => i.orderId === order.id && (supplierSubOrderIds == null || (i.subOrderId != null && supplierSubOrderIds.has(i.subOrderId))))
        .map((i) => ({ ...i, product: (i.productId != null ? productMap.get(i.productId) : undefined) ?? {} as Product }));

      return {
        ...order,
        cafe: { id: order.cafeId, name: cafe?.name ?? "Unknown" },
        supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
        delivery: legacyDeliveryUser ? { id: legacyDeliveryUser.id, name: legacyDeliveryUser.name } : undefined,
        items,
        subOrders: orderSubOrders,
      };
    });
  }

  async getOrder(id: number): Promise<OrderWithDetails | undefined> {
    const all = await this.getOrders();
    return all.find((o) => o.id === id);
  }

  async canUserAccessOrder(userId: number, userRole: string, orderId: number): Promise<boolean> {
    const order = await this.getOrder(orderId);
    if (!order) return false;
    if (['SUPER_ADMIN', 'ADMIN'].includes(userRole)) return true;
    if (userRole === 'CAFE_OWNER') return order.cafeId === userId;
    if (userRole === 'SUPPLIER') {
      return order.supplierId === userId || (order.subOrders ?? []).some((so) => so.supplierId === userId);
    }
    // Delivery Company / Driver: access is based on an actual delivery relationship to this
    // order (a delivery row they own/are assigned to), never on order.status alone. The
    // previous implementation granted access to ANY order in READY/IN_DELIVERY/DELIVERED —
    // a cross-tenant data leak. "Available" (unclaimed) deliveries are visible through
    // GET /api/deliveries instead, which exposes only delivery-scoped fields, not the full
    // order (cafe identity, all items across every supplier).
    if (userRole === 'DRIVER' || userRole === 'DELIVERY_COMPANY') {
      const [row] = await db.select({ id: deliveries.id }).from(deliveries).where(and(
        eq(deliveries.orderId, orderId),
        userRole === 'DRIVER' ? eq(deliveries.driverId, userId) : eq(deliveries.deliveryCompanyId, userId),
      )).limit(1);
      return !!row;
    }
    return false;
  }

  async resolveOrderItems(items: CreateOrderItemInput[]): Promise<CreateOrderItem[]> {
    const resolved: CreateOrderItem[] = [];

    for (const item of items) {
      const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, item.listingId));
      if (!listing) throw new Error(`Listing ${item.listingId} not found`);
      if (listing.supplierId !== item.supplierId) throw new Error('Supplier mismatch for listing');
      if (listing.productId !== item.productId) throw new Error('Product mismatch for listing');

      const [product] = await db.select().from(products).where(eq(products.id, item.productId));
      if (!product?.isAdminProduct) throw new Error('Product is not available in marketplace');
      const [category] = product.categoryId
        ? await db.select().from(categories).where(eq(categories.id, product.categoryId))
        : [];
      const [subCategory] = product.subCategoryId
        ? await db.select().from(subCategories).where(eq(subCategories.id, product.subCategoryId))
        : [];
      const [brand] = product.brandId
        ? await db.select().from(brands).where(eq(brands.id, product.brandId))
        : [];

      const variants = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, item.listingId));
      let unitPrice: number;

      if (variants.length > 0) {
        const variant = variants.find(
          (v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null),
        );
        if (!variant) throw new Error('Selected variant not found');
        if (variant.quantity < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);
        unitPrice = variant.price;
      } else {
        if (listing.stock < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);
        unitPrice = listing.price;
      }

      const [supplier] = await db.select().from(users).where(eq(users.id, listing.supplierId));
      resolved.push({
        listingId: item.listingId,
        productId: item.productId,
        supplierId: item.supplierId,
        supplierName: supplier?.name ?? item.supplierName ?? 'Unknown',
        productName: product.name,
        productImageUrl: product.imageUrl ?? null,
        productCategory: product.category ?? '',
        flavorId: item.flavorId ?? null,
        sizeId: item.sizeId ?? null,
        flavorName: item.flavorId != null
          ? ((await db.select().from(flavors).where(eq(flavors.id, item.flavorId)))[0]?.name ?? item.flavorName ?? null)
          : null,
        sizeName: item.sizeId != null
          ? ((await db.select().from(sizes).where(eq(sizes.id, item.sizeId)))[0]?.name ?? item.sizeName ?? null)
          : null,
        brandName: brand?.name ?? null,
        categoryName: category?.name ?? product.category ?? null,
        subCategoryName: subCategory?.name ?? null,
        quantity: item.quantity,
        unitPrice,
      });
    }

    return resolved;
  }

  /**
   * Maps the Coffee Owner's actual per-order Pack selection (captured as
   * includedProducts — the same data orderItems.snapshot already stores and the order's
   * product display already reads) to the real supplierProductVariants/listing rows it
   * consumes, with the exact quantity against each. This is the single place that decides
   * "which inventory row does this selection refer to" — reused by the order-creation-time
   * stock check (resolvePackOrderItems), the confirmation-time deduction
   * (deductPackComponentStock), and the cancellation-time restoration
   * (restorePackComponentStock), so none of the three can ever disagree about which
   * variant a selection means.
   *
   * A Pack can include the same base product more than once across different size groups
   * (e.g. one component slot sized "Stika", a separate slot sized "1L") — size is what
   * disambiguates which slot a selected flavor belongs to. Falls back to the Pack's own
   * default/representative variant (the pre-existing behavior) whenever a selection can't
   * be matched — e.g. a legacy order placed before this fix, whose stored selection lacks
   * enough detail to match precisely.
   *
   * NOTE: deductPackComponentStock now runs at order CREATION time (not confirmation) so
   * Pack components reserve stock immediately, the same way regular items already do — see
   * createOrder.
   */
  private async resolvePackComponentDeductions(
    packId: number,
    orderQty: number,
    includedProducts: Array<{ productId?: number; flavorName?: string | null; sizeName?: string | null; quantity: number }>,
    client: any = db,
  ): Promise<{ variants: Map<number, number>; listings: Map<number, number>; affectedListingIds: Set<number> }> {
    const variants = new Map<number, number>();
    const listings = new Map<number, number>();
    const affectedListingIds = new Set<number>();

    const components = await client.select().from(packItems).where(eq(packItems.packId, packId));
    if (!components.length) return { variants, listings, affectedListingIds };

    const listingIds: number[] = Array.from(new Set(components.map((c: any) => c.listingId as number)));
    const listingRows = listingIds.length
      ? await client.select().from(supplierProductListings).where(inArray(supplierProductListings.id, listingIds))
      : [];
    const listingProductId = new Map(listingRows.map((l: any) => [l.id, l.productId]));

    const { flvMap, szMap } = await buildTaxonomyCache();
    const flavorIdByName = new Map<string, number>();
    for (const f of Array.from(flvMap.values())) flavorIdByName.set(f.name, f.id);

    for (const comp of components) {
      affectedListingIds.add(comp.listingId);
      const defaultQty = comp.quantity * orderQty;

      if (comp.variantId == null) {
        // No flavor/size distribution exists for this component — quantity is scoped to
        // the listing itself, so the Pack's own defined per-pack quantity is authoritative.
        listings.set(comp.listingId, (listings.get(comp.listingId) ?? 0) + defaultQty);
        continue;
      }

      const [representative] = await client.select().from(supplierProductVariants).where(eq(supplierProductVariants.id, comp.variantId));
      if (!representative) continue;
      const repSizeId = representative.sizeId ?? null;
      const repSizeName = repSizeId != null ? (szMap.get(repSizeId)?.name ?? null) : null;
      const compProductId = listingProductId.get(comp.listingId);

      const matching = includedProducts.filter((s) =>
        (compProductId == null || s.productId == null || s.productId === compProductId) &&
        (s.sizeName ?? null) === repSizeName,
      );

      if (!matching.length) {
        variants.set(representative.id, (variants.get(representative.id) ?? 0) + defaultQty);
        continue;
      }

      const groupVariants = await client.select().from(supplierProductVariants).where(and(
        eq(supplierProductVariants.listingId, comp.listingId),
        repSizeId == null ? isNull(supplierProductVariants.sizeId) : eq(supplierProductVariants.sizeId, repSizeId),
      ));

      for (const sel of matching) {
        let target = representative;
        if (sel.flavorName) {
          const flavorId = flavorIdByName.get(sel.flavorName);
          const variantForFlavor = flavorId != null ? groupVariants.find((v: any) => v.flavorId === flavorId) : undefined;
          if (variantForFlavor) target = variantForFlavor;
        }
        variants.set(target.id, (variants.get(target.id) ?? 0) + sel.quantity);
      }
    }

    return { variants, listings, affectedListingIds };
  }

  async resolvePackOrderItems(items: CreatePackOrderItem[]): Promise<ResolvedPackOrderItem[]> {
    const resolved: ResolvedPackOrderItem[] = [];
    for (const item of items) {
      const [pack] = await db.select().from(packs).where(eq(packs.id, item.packId));
      if (!pack) throw new Error(`Pack ${item.packId} not found`);
      if (pack.supplierId !== item.supplierId) throw new Error('Supplier mismatch for pack');
      const [detail] = await this.buildPackDetails([pack]);
      if (!detail || !detail.isAvailable) throw new Error(`Pack ${pack.name} is not available`);
      if (item.quantity > Math.min(pack.quantityAvailable, detail.maxBuildable)) {
        throw new Error(`Insufficient stock for pack ${pack.name}`);
      }
      // The check above only verifies stock at the flavor-GROUP level (e.g. "enough
      // combined stock across every flavor of this size"). It can pass while the ONE
      // exact flavor/size the Coffee Owner actually selected is low or fully out — verify
      // that specifically before accepting the order.
      if (item.includedProducts?.length) {
        const { variants, listings } = await this.resolvePackComponentDeductions(item.packId, item.quantity, item.includedProducts);
        if (variants.size) {
          const variantIds = Array.from(variants.keys());
          const variantRows = await db.select().from(supplierProductVariants).where(inArray(supplierProductVariants.id, variantIds));
          const variantById = new Map(variantRows.map((v) => [v.id, v]));
          for (const [variantId, needed] of Array.from(variants)) {
            const row = variantById.get(variantId);
            if (!row || row.quantity < needed) {
              throw new Error(`Insufficient stock for pack ${pack.name}`);
            }
          }
        }
        if (listings.size) {
          const listingIds = Array.from(listings.keys());
          const listingRows = await db.select().from(supplierProductListings).where(inArray(supplierProductListings.id, listingIds));
          const listingById = new Map(listingRows.map((l) => [l.id, l]));
          for (const [listingId, needed] of Array.from(listings)) {
            const row = listingById.get(listingId);
            if (!row || row.stock < needed) {
              throw new Error(`Insufficient stock for pack ${pack.name}`);
            }
          }
        }
      }
      const [supplier] = await db.select().from(users).where(eq(users.id, pack.supplierId));
      const includedProducts = item.includedProducts?.length
        ? item.includedProducts.map((included) => ({ ...included }))
        : detail.items.flatMap((included) => [{
            productId: included.productId,
            productName: included.productName,
            productImageUrl: included.productImageUrl,
            brandName: included.brandName ?? null,
            categoryName: included.categoryName ?? null,
            subCategoryName: included.subCategoryName ?? null,
            flavorName: included.flavorName,
            sizeName: included.sizeName,
            quantity: included.quantity,
          }]);
      resolved.push({
        packId: pack.id,
        packName: pack.name,
        supplierId: pack.supplierId,
        supplierName: supplier?.name ?? 'Unknown',
        quantity: item.quantity,
        unitPrice: pack.price,
        packImageUrl: pack.imageUrl ?? null,
        includedProducts,
      });
    }
    return resolved;
  }

  async updateSubOrderStatus(subOrderId: number, status: string): Promise<SubOrder> {
    // Read existing status so we can detect status transitions
    const [existing] = await db.select().from(subOrders).where(eq(subOrders.id, subOrderId));
    if (!existing) throw new Error('SubOrder not found');

    // ── Atomic: sub-order status write + Delivery creation/cancellation + order
    // aggregation. Wrapped in one transaction so "sub-order is READY but no Delivery
    // exists" (or "order aggregate didn't advance") can never be observed by a concurrent
    // reader — see shared/schema.ts "Deliveries" section and the sync spec's transaction
    // requirement.
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(subOrders).set({ status }).where(eq(subOrders.id, subOrderId)).returning();
      if (!row) throw new Error('SubOrder not found');

      // Shop → Delivery hand-off: a sub-order reaching READY creates exactly one Delivery.
      // createDeliveryForSubOrder is idempotent (DB-level ON CONFLICT DO NOTHING against the
      // active-delivery partial unique index), so firing this twice — e.g. a duplicate
      // client retry — can never create a second Delivery for the same sub-order.
      if (existing.status !== 'READY' && status === 'READY') {
        await this.createDeliveryForSubOrder(subOrderId, tx);
      }
      // A supplier rejecting/cancelling a sub-order that already has an active (unclaimed or
      // in-progress-but-not-yet-picked-up) Delivery must not leave that Delivery dangling
      // against a cancelled order (orphan-delivery prevention).
      if (status === 'CANCELLED') {
        await this.cancelActiveDeliveryForSubOrder(subOrderId, tx);
      }

      await this.recomputeOrderAggregateStatus(existing.orderId, tx);
      return row;
    });

    // Stock adjustments intentionally run outside the transaction above — unrelated to
    // Delivery sync. Both regular items AND pack components are now reserved unconditionally
    // at order CREATION time (see createOrder), so confirmation never deducts anything —
    // it only advances status. Restore both whenever this sub-order transitions to CANCELLED
    // for the first time, regardless of whether it ever reached CONFIRMED (the common
    // Supplier "Demandes de commandes" reject-a-still-PENDING-request path).
    if (existing.status !== 'CANCELLED' && status === 'CANCELLED') {
      await this.restoreSubOrderPackStock(subOrderId);
      await this.restockSubOrderRegularItems(subOrderId, existing.orderId);
    }

    return updated;
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
   */
  private async recomputeOrderAggregateStatus(orderId: number, client: any = db): Promise<string> {
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

  /**
   * Idempotently creates the single Delivery for a sub-order once it reaches READY.
   * Returns null (no-op) when: the order is SELF_PICKUP (no courier needed), the sub-order/
   * order can't be found, or a delivery already exists for this sub-order (DB-level
   * ON CONFLICT DO NOTHING against the active-delivery partial unique index — safe against
   * concurrent/duplicate calls without needing an app-level lock).
   */
  async createDeliveryForSubOrder(subOrderId: number, client: any = db): Promise<Delivery | null> {
    const [subOrder] = await client.select().from(subOrders).where(eq(subOrders.id, subOrderId));
    if (!subOrder) return null;
    const [order] = await client.select().from(orders).where(eq(orders.id, subOrder.orderId));
    if (!order) return null;
    if (order.deliveryMethod !== 'DELIVERY_SERVICE') return null;

    const [supplier] = await client.select().from(users).where(eq(users.id, subOrder.supplierId));
    // Snapshot the supplier's current account location as the pickup point — a supplier
    // changing their profile address later must never rewrite an already-created Delivery.
    const pickupAddress: GeoLocation = {
      address: supplier?.locationAddress ?? '',
      lat: supplier?.locationLat ?? '',
      lng: supplier?.locationLng ?? '',
      placeId: supplier?.locationPlaceId ?? '',
      details: (supplier?.locationDetails as GeoLocation['details']) ?? undefined,
    };
    const destinationAddress = (order.deliveryAddress as GeoLocation | null) ?? undefined;

    const [created] = await client.insert(deliveries).values({
      subOrderId,
      orderId: order.id,
      supplierId: subOrder.supplierId,
      cafeId: order.cafeId,
      // Created PENDING — the supplier must dispatch it (choose Delivery Company or its own
      // drivers) before it becomes visible/actionable to anyone else. See dispatchDelivery().
      status: 'PENDING',
      pickupAddress,
      destinationAddress,
      // Snapshot orders.deliveryFee as-is (always 0 today — no fee algorithm exists yet;
      // see SHOP_DELIVERY_SYNCHRONIZATION_ANALYSIS.md §6/§9). Preserves whatever value the
      // order already carries rather than inventing pricing.
      deliveryFee: order.deliveryFee ?? 0,
      // Two-way confirmation codes — generated once, never regenerated. See shared/schema.ts
      // deliveries.pickupCode/dropoffCode comment.
      pickupCode: this.generateDeliveryConfirmationCode(),
      dropoffCode: this.generateDeliveryConfirmationCode(),
    }).onConflictDoNothing().returning();

    return created ?? null;
  }

  /** 6-digit numeric confirmation code — short enough to read aloud/type on a phone. */
  private generateDeliveryConfirmationCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * The supplier's dispatch decision for a PENDING delivery — either publish it to the
   * Delivery Company queue (→ AVAILABLE, existing accept/assign flow unchanged) or operate it
   * directly with the supplier's own drivers (→ ACCEPTED immediately; no company acceptance
   * step, since the supplier IS the operator — see SHOP_DELIVERY_V2 spec §25). Atomic
   * compare-and-swap on (id, supplierId=caller, status=PENDING) — reuses the same Delivery
   * row, never creates a second one.
   */
  async dispatchDelivery(deliveryId: number, supplierId: number, mode: DeliveryMode): Promise<Delivery> {
    const updates: any = { deliveryMode: mode };
    if (mode === 'DELIVERY_COMPANY') {
      updates.status = 'AVAILABLE';
    } else {
      updates.status = 'ACCEPTED';
      updates.acceptedAt = new Date();
    }
    const [updated] = await db.update(deliveries)
      .set(updates)
      .where(and(eq(deliveries.id, deliveryId), eq(deliveries.supplierId, supplierId), eq(deliveries.status, 'PENDING')))
      .returning();
    if (!updated) throw new Error('Delivery is not awaiting dispatch, or does not belong to you');
    return updated;
  }

  /** Cancels the active (non-terminal) delivery for a sub-order, if one exists. Orphan-delivery guard. */
  async cancelActiveDeliveryForSubOrder(subOrderId: number, client: any = db): Promise<Delivery | null> {
    const [cancelled] = await client.update(deliveries)
      .set({ status: 'CANCELLED', cancelledAt: new Date() })
      .where(and(
        eq(deliveries.subOrderId, subOrderId),
        ne(deliveries.status, 'CANCELLED'),
        ne(deliveries.status, 'DELIVERED'),
      ))
      .returning();
    return cancelled ?? null;
  }

  /**
   * Deducts variant/flavor stock for every pack item in a sub-order at order creation.
   * Accepts an optional transaction client (see createOrder, which always passes its own
   * tx) so its guarded decrements participate in the caller's atomic transaction rather than
   * running as separate, non-atomic statements.
   */
  private async deductPackComponentStock(subOrderId: number, client: any = db): Promise<void> {
    const items = await client.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
    const packOrderItems = items.filter((i: any) => i.packId != null);
    if (!packOrderItems.length) return;

    // Accumulate across every Pack line in this sub-order before writing — if the SAME
    // variant is consumed by more than one Pack purchased in the same order (e.g. Pack A
    // and Pack B both include Boga/Citron/Stika), the quantities are summed into one final
    // decrement per variant, never applied as separate partial writes.
    const variantTotals = new Map<number, number>();
    const listingTotals = new Map<number, number>();
    const affectedListingIds = new Set<number>();

    for (const orderItem of packOrderItems) {
      const snapshot = (orderItem.snapshot ?? {}) as any;
      const includedProducts = Array.isArray(snapshot.includedProducts) ? snapshot.includedProducts : [];
      const { variants, listings, affectedListingIds: compListings } =
        await this.resolvePackComponentDeductions(orderItem.packId!, orderItem.quantity, includedProducts, client);
      for (const [variantId, qty] of Array.from(variants)) variantTotals.set(variantId, (variantTotals.get(variantId) ?? 0) + qty);
      for (const [listingId, qty] of Array.from(listings)) listingTotals.set(listingId, (listingTotals.get(listingId) ?? 0) + qty);
      for (const id of Array.from(compListings)) affectedListingIds.add(id);
    }

    // Guarded conditional decrements (WHERE quantity >= needed RETURNING) — same atomicity
    // guarantee as the regular-item decrement in createOrder: if the exact selected
    // flavor/size doesn't have enough stock (e.g. a concurrent order just consumed it), throw
    // and let the caller's transaction roll back, instead of silently clamping to 0 (which
    // would create phantom stock on restoration — the restore always adds back the full
    // nominal quantity, so a clamped/truncated deduction would over-restore later).
    for (const [variantId, qty] of Array.from(variantTotals)) {
      if (qty <= 0) continue;
      const [decremented] = await client.update(supplierProductVariants)
        .set({ quantity: sql`${supplierProductVariants.quantity} - ${qty}` })
        .where(and(eq(supplierProductVariants.id, variantId), gte(supplierProductVariants.quantity, qty)))
        .returning();
      if (!decremented) throw new Error('Insufficient stock for pack');
    }
    for (const [listingId, qty] of Array.from(listingTotals)) {
      if (qty <= 0) continue;
      const [decremented] = await client.update(supplierProductListings)
        .set({ stock: sql`${supplierProductListings.stock} - ${qty}` })
        .where(and(eq(supplierProductListings.id, listingId), gte(supplierProductListings.stock, qty)))
        .returning();
      if (!decremented) throw new Error('Insufficient stock for pack');
    }

    // Refresh aggregate listing stock for every affected listing — read via the same client
    // so it sees the decrements just written above within this transaction.
    for (const listingId of Array.from(affectedListingIds)) {
      const listingVariants = await client.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, listingId));
      const aggStock = listingVariants.reduce((s: number, v: any) => s + v.quantity, 0);
      await client.update(supplierProductListings)
        .set({ stock: aggStock })
        .where(eq(supplierProductListings.id, listingId));
    }
  }

  /**
   * Restores packs.quantityAvailable and component variant/listing stock for all pack
   * items in a sub-order. Called whenever a sub-order is cancelled — both are reserved
   * unconditionally at order creation now, so restoration no longer depends on whether the
   * sub-order ever reached CONFIRMED. Idempotent: each pack item is only restored once.
   */
  private async restoreSubOrderPackStock(subOrderId: number): Promise<void> {
    const items = await db.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
    const packOrderItems = items.filter((i) => i.packId != null);
    if (!packOrderItems.length) return;

    for (const orderItem of packOrderItems) {
      const packId = orderItem.packId!;
      const orderQty = orderItem.quantity;

      // Restore pack-level availability
      await db.update(packs)
        .set({ quantityAvailable: sql`${packs.quantityAvailable} + ${orderQty}` })
        .where(eq(packs.id, packId));

      // Restore component variant/listing stock — using this exact order item's own
      // selected distribution, the same one that was actually deducted at confirmation.
      const snapshot = (orderItem.snapshot ?? {}) as any;
      const includedProducts = Array.isArray(snapshot.includedProducts) ? snapshot.includedProducts : [];
      await this.restorePackComponentStock(packId, orderQty, includedProducts);
    }
  }

  /**
   * Restores variant/flavor stock for every pack item — used on order cancellation.
   * Restores to the SAME exact variant(s) resolvePackComponentDeductions would deduct
   * for this selection, so cancelling never gives stock back to the wrong flavor/size
   * (which would otherwise permanently drift the representative variant's stock up while
   * leaving the actually-sold flavor's stock never replenished).
   */
  private async restorePackComponentStock(
    packId: number,
    orderQty: number,
    includedProducts: Array<{ productId?: number; flavorName?: string | null; sizeName?: string | null; quantity: number }> = [],
  ): Promise<void> {
    const { variants, listings, affectedListingIds } = await this.resolvePackComponentDeductions(packId, orderQty, includedProducts);

    for (const [variantId, qty] of Array.from(variants)) {
      if (qty <= 0) continue;
      await db.update(supplierProductVariants)
        .set({ quantity: sql`${supplierProductVariants.quantity} + ${qty}` })
        .where(eq(supplierProductVariants.id, variantId));
    }
    for (const [listingId, qty] of Array.from(listings)) {
      if (qty <= 0) continue;
      await db.update(supplierProductListings)
        .set({ stock: sql`${supplierProductListings.stock} + ${qty}` })
        .where(eq(supplierProductListings.id, listingId));
    }

    for (const listingId of Array.from(affectedListingIds)) {
      const listingVariants = await this.getVariantsByListingId(listingId);
      const aggStock = listingVariants.reduce((s, v) => s + v.quantity, 0);
      await db.update(supplierProductListings)
        .set({ stock: aggStock })
        .where(eq(supplierProductListings.id, listingId));
    }
  }

  async getReturns(filters?: { cafeId?: number; supplierId?: number }): Promise<OrderReturn[]> {
    const conditions: any[] = [];
    if (filters?.cafeId) conditions.push(eq(orderReturns.cafeId, filters.cafeId));
    if (filters?.supplierId) conditions.push(eq(orderReturns.supplierId, filters.supplierId));
    const query = conditions.length
      ? db.select().from(orderReturns).where(and(...conditions))
      : db.select().from(orderReturns);
    return query.orderBy(desc(orderReturns.requestedAt));
  }

  async createReturn(data: InsertOrderReturn): Promise<OrderReturn> {
    const [created] = await db.insert(orderReturns).values(data).returning();
    return created;
  }

  async updateReturnStatus(id: number, status: string, supplierNotes?: string): Promise<OrderReturn> {
    const updates: Record<string, any> = { status };
    if (status !== 'PENDING_REVIEW') updates.processedAt = new Date();
    if (supplierNotes !== undefined) updates.supplierNotes = supplierNotes;
    const [updated] = await db.update(orderReturns).set(updates).where(eq(orderReturns.id, id)).returning();
    if (!updated) throw new Error('Return not found');
    return updated;
  }

  /**
   * Cascade-delete an order and all dependent records:
   * promotionUsage → orderReturns → deliveries → orderItems → subOrders → orders
   */
  async deleteOrder(orderId: number): Promise<void> {
    await db.delete(promotionUsage).where(eq(promotionUsage.orderId, orderId));
    await db.delete(orderReturns).where(eq(orderReturns.orderId, orderId));
    await db.delete(deliveries).where(eq(deliveries.orderId, orderId)); // orphan-delivery guard
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(subOrders).where(eq(subOrders.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
  }

  // ── Deliveries ────────────────────────────────────────────────────────────────
  // One row per sub_order (see shared/schema.ts). Status transitions are validated against
  // DELIVERY_TRANSITIONS below and are applied with an atomic, ownership-scoped
  // UPDATE ... WHERE (compare-and-swap on the current status + owner id) rather than a
  // read-then-write pair, so two concurrent accept/assign/status calls cannot both succeed.

  // PENDING can resolve either to AVAILABLE (dispatched to the Delivery Company queue) or
  // straight to ACCEPTED (dispatched to the supplier's own drivers — no company acceptance
  // step needed since the supplier is the operator). See dispatchDelivery().
  private readonly DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
    PENDING: ['AVAILABLE', 'ACCEPTED', 'CANCELLED'],
    AVAILABLE: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['ASSIGNED', 'CANCELLED'],
    ASSIGNED: ['PICKED_UP', 'CANCELLED'],
    PICKED_UP: ['IN_TRANSIT'],
    IN_TRANSIT: ['DELIVERED'],
    DELIVERED: [],
    CANCELLED: [],
  };

  /**
   * Strips confirmation codes the given viewer has no business seeing. The supplier reads
   * pickupCode (to hand to the driver at collection); the cafe owner reads dropoffCode (to
   * hand to the driver at drop-off). The driver never sees either value — only submits an
   * attempt via updateDeliveryStatus. Admin/super-admin keep both for support/dispute
   * resolution; every other role (delivery company) sees neither.
   */
  redactDeliveryCodes(delivery: Delivery, viewerRole?: string): Delivery {
    if (viewerRole === 'ADMIN' || viewerRole === 'SUPER_ADMIN') return delivery;
    return {
      ...delivery,
      pickupCode: viewerRole === 'SUPPLIER' ? delivery.pickupCode : null,
      dropoffCode: viewerRole === 'CAFE_OWNER' ? delivery.dropoffCode : null,
    };
  }

  private toDeliveryWithDetails(row: Delivery, users_: User[], orders_: Order[], subOrders_: SubOrder[], orderItems_: OrderItem[], products_: Product[]): DeliveryWithDetails {
    const userMap = new Map(users_.map((u) => [u.id, u]));
    const productMap = new Map(products_.map((p) => [p.id, p]));
    const order = orders_.find((o) => o.id === row.orderId);
    const subOrder = subOrders_.find((s) => s.id === row.subOrderId);
    const cafe = userMap.get(row.cafeId);
    const supplier = userMap.get(row.supplierId);
    const company = row.deliveryCompanyId ? userMap.get(row.deliveryCompanyId) : undefined;
    const driver = row.driverId ? userMap.get(row.driverId) : undefined;
    // Same shape as OrderWithDetails.subOrders[].items (see getOrders) — the exact raw,
    // joined order items, including snapshot/packId/productId — so every delivery-detail
    // surface can reuse the exact same groupOrderItemsByProduct/PackCompositionView
    // rendering the Coffee Owner order-details modal already uses, instead of a second,
    // lossy flattened representation.
    const itemsForThisSubOrder = orderItems_
      .filter((i) => i.subOrderId === row.subOrderId)
      .map((i) => ({ ...i, product: (i.productId != null ? productMap.get(i.productId) : undefined) ?? {} as Product }));
    const allItemsForOrder = orderItems_.filter((i) => i.orderId === row.orderId);
    return {
      ...row,
      order: {
        id: order?.id ?? row.orderId,
        status: order?.status ?? '',
        totalAmount: order?.totalAmount ?? 0,
        createdAt: order?.createdAt ?? null,
        itemCount: allItemsForOrder.length,
        priority: (order?.priority ?? 'NORMAL') as string,
        scheduledAt: order?.scheduledAt ?? null,
      },
      subOrder: { id: subOrder?.id ?? row.subOrderId, status: subOrder?.status ?? '', supplierName: subOrder?.supplierName ?? supplier?.name ?? 'Unknown', subtotal: subOrder?.subtotal ?? 0 },
      cafe: { id: row.cafeId, name: cafe?.name ?? 'Unknown', phone: cafe?.phone ?? null, locationAddress: cafe?.locationAddress ?? null },
      supplier: { id: row.supplierId, name: supplier?.name ?? 'Unknown', phone: supplier?.phone ?? null, locationAddress: supplier?.locationAddress ?? null, locationLat: supplier?.locationLat ?? null, locationLng: supplier?.locationLng ?? null },
      deliveryCompany: company ? { id: company.id, name: company.name } : null,
      driver: driver ? { id: driver.id, name: driver.name, phone: driver.phone, locationLat: driver.locationLat ?? null, locationLng: driver.locationLng ?? null } : null,
      items: itemsForThisSubOrder,
    };
  }

  /**
   * Role-scoped delivery list.
   *   DRIVER            → deliveries assigned to that driver
   *   DELIVERY_COMPANY   → deliveries it owns (accepted/assigned/completed by it) PLUS the
   *                        open AVAILABLE pool it can still accept from (see
   *                        SHOP_DELIVERY_SYNCHRONIZATION_ANALYSIS.md §35 — no zone/territory
   *                        model exists yet, so "eligible" = every approved delivery company;
   *                        this is the documented extension point for future zone dispatch)
   *   SUPPLIER          → its own deliveries (read-only status visibility)
   *   CAFE_OWNER        → deliveries for its own orders (read-only status visibility)
   *   ADMIN/SUPER_ADMIN → all (oversight)
   */
  async getDeliveries(userId: number, role: string): Promise<DeliveryWithDetails[]> {
    let rows: Delivery[];
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      rows = await db.select().from(deliveries);
    } else if (role === 'DRIVER') {
      rows = await db.select().from(deliveries).where(eq(deliveries.driverId, userId));
    } else if (role === 'DELIVERY_COMPANY') {
      rows = await db.select().from(deliveries).where(or(eq(deliveries.deliveryCompanyId, userId), eq(deliveries.status, 'AVAILABLE')));
    } else if (role === 'SUPPLIER') {
      rows = await db.select().from(deliveries).where(eq(deliveries.supplierId, userId));
    } else if (role === 'CAFE_OWNER') {
      rows = await db.select().from(deliveries).where(eq(deliveries.cafeId, userId));
    } else {
      return [];
    }
    if (rows.length === 0) return [];
    const orderIds = Array.from(new Set(rows.map((r) => r.orderId)));
    const subOrderIds = Array.from(new Set(rows.map((r) => r.subOrderId)));
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.cafeId, r.supplierId, r.deliveryCompanyId, r.driverId].filter((x): x is number => x != null))));
    const [ordersRows, subOrdersRows, usersRows, orderItemsRows] = await Promise.all([
      orderIds.length ? db.select().from(orders).where(inArray(orders.id, orderIds)) : Promise.resolve([]),
      subOrderIds.length ? db.select().from(subOrders).where(inArray(subOrders.id, subOrderIds)) : Promise.resolve([]),
      userIds.length ? db.select().from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
      orderIds.length ? db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : Promise.resolve([]),
    ]);
    const productIds = Array.from(new Set(orderItemsRows.map((i) => i.productId).filter((x): x is number => x != null)));
    const productsRows = productIds.length ? await db.select().from(products).where(inArray(products.id, productIds)) : [];
    return rows
      .map((r) => this.toDeliveryWithDetails(this.redactDeliveryCodes(r, role), usersRows, ordersRows, subOrdersRows, orderItemsRows, productsRows))
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }

  async getDelivery(id: number, viewerRole?: string): Promise<DeliveryWithDetails | undefined> {
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, id));
    if (!row) return undefined;
    const [[order], [subOrder], usersRows, orderItemsRows] = await Promise.all([
      db.select().from(orders).where(eq(orders.id, row.orderId)),
      db.select().from(subOrders).where(eq(subOrders.id, row.subOrderId)),
      db.select().from(users).where(inArray(users.id, [row.cafeId, row.supplierId, row.deliveryCompanyId, row.driverId].filter((x): x is number => x != null))),
      db.select().from(orderItems).where(eq(orderItems.orderId, row.orderId)),
    ]);
    const productIds = Array.from(new Set(orderItemsRows.map((i) => i.productId).filter((x): x is number => x != null)));
    const productsRows = productIds.length ? await db.select().from(products).where(inArray(products.id, productIds)) : [];
    return this.toDeliveryWithDetails(this.redactDeliveryCodes(row, viewerRole), usersRows, order ? [order] : [], subOrder ? [subOrder] : [], orderItemsRows, productsRows);
  }

  /**
   * Access control for a single delivery. Never uses order status as a proxy for
   * authorization (that was the IDOR identified in the pre-implementation analysis).
   */
  async canUserAccessDelivery(userId: number, role: string, deliveryId: number): Promise<boolean> {
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    if (!row) return false;
    if (role === 'DRIVER') return row.driverId === userId;
    if (role === 'DELIVERY_COMPANY') return row.deliveryCompanyId === userId || row.status === 'AVAILABLE';
    if (role === 'SUPPLIER') return row.supplierId === userId;
    if (role === 'CAFE_OWNER') return row.cafeId === userId;
    return false;
  }

  /** AVAILABLE → ACCEPTED. Atomic compare-and-swap: fails (0 rows) if another company already accepted it. */
  async acceptDelivery(deliveryId: number, deliveryCompanyId: number): Promise<Delivery> {
    const [updated] = await db.update(deliveries)
      .set({ status: 'ACCEPTED', deliveryCompanyId, acceptedAt: new Date() })
      .where(and(eq(deliveries.id, deliveryId), eq(deliveries.status, 'AVAILABLE')))
      .returning();
    if (!updated) throw new Error('Delivery is no longer available');
    return updated;
  }

  /**
   * ACCEPTED → ASSIGNED. Works for both delivery modes:
   *   deliveryMode = DELIVERY_COMPANY → caller must be the accepting company; driver must
   *     belong to that same company (driver.deliveryCompanyId).
   *   deliveryMode = SUPPLIER → caller must be the owning supplier; driver must belong to
   *     that same supplier (driver.supplierId).
   * Atomic compare-and-swap on (id, status=ACCEPTED, owner-matches-caller) so two concurrent
   * assign calls can't both succeed, and so a caller can never assign a delivery it doesn't
   * own regardless of which mode it's in.
   */
  async assignDriver(deliveryId: number, actingUser: { id: number; role: string }, driverId: number): Promise<Delivery> {
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    if (!delivery) throw new Error('Delivery not found');
    const [driver] = await db.select().from(users).where(eq(users.id, driverId));
    if (!driver || driver.role !== 'DRIVER') throw new Error('Invalid driver');

    let ownerCondition;
    if (delivery.deliveryMode === 'SUPPLIER') {
      if (actingUser.role !== 'SUPPLIER' || delivery.supplierId !== actingUser.id) {
        throw new Error('Only the operating supplier can assign a driver to this delivery');
      }
      if (driver.supplierId !== actingUser.id) {
        throw new Error('Driver does not belong to your supplier account');
      }
      ownerCondition = eq(deliveries.supplierId, actingUser.id);
    } else {
      if (actingUser.role !== 'DELIVERY_COMPANY' || delivery.deliveryCompanyId !== actingUser.id) {
        throw new Error('Only the accepting delivery company can assign a driver to this delivery');
      }
      if (driver.deliveryCompanyId !== actingUser.id) {
        throw new Error('Driver does not belong to your company');
      }
      ownerCondition = eq(deliveries.deliveryCompanyId, actingUser.id);
    }

    const [updated] = await db.update(deliveries)
      .set({ status: 'ASSIGNED', driverId, assignedAt: new Date() })
      .where(and(eq(deliveries.id, deliveryId), eq(deliveries.status, 'ACCEPTED'), ownerCondition))
      .returning();
    if (!updated) throw new Error('Delivery is not assignable (not accepted by you, or already assigned)');
    return updated;
  }

  /**
   * Driver-driven PICKED_UP → IN_TRANSIT → DELIVERED, or a CANCELLED intervention by the
   * owning Delivery Company / Admin. Validates the transition graph, role, and ownership,
   * then applies an atomic compare-and-swap. On DELIVERED, propagates the sub-order to
   * DELIVERED and re-runs the existing order aggregation — the fix for the one-way
   * sub-order→order desync (never the reverse) identified in the pre-implementation
   * analysis. On PICKED_UP/IN_TRANSIT, propagates the sub-order to IN_DELIVERY.
   */
  async updateDeliveryStatus(deliveryId: number, actingUser: { id: number; role: string }, newStatus: DeliveryStatus, code?: string): Promise<Delivery> {
    const [current] = await db.select().from(deliveries).where(eq(deliveries.id, deliveryId));
    if (!current) throw new Error('Delivery not found');

    const allowed = this.DELIVERY_TRANSITIONS[current.status as DeliveryStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Cannot move a delivery from ${current.status} to ${newStatus}`);
    }

    const isDriverStep = ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(newStatus);
    if (isDriverStep) {
      if (actingUser.role !== 'DRIVER' || current.driverId !== actingUser.id) {
        throw new Error('Only the assigned driver can advance this delivery');
      }
    } else if (newStatus === 'CANCELLED') {
      const isOwningCompany = actingUser.role === 'DELIVERY_COMPANY' && current.deliveryCompanyId === actingUser.id;
      const isOwningSupplier = actingUser.role === 'SUPPLIER' && current.supplierId === actingUser.id;
      const isAdmin = actingUser.role === 'ADMIN' || actingUser.role === 'SUPER_ADMIN';
      if (!isOwningCompany && !isOwningSupplier && !isAdmin) {
        throw new Error('Only the operating supplier/delivery company or an admin can cancel this delivery');
      }
    }

    // Two-way confirmation codes gate the two "physical handoff" transitions. Only enforced
    // when the delivery actually has a code — deliveries created before this feature have
    // pickupCode/dropoffCode = null and remain code-exempt (see shared/schema.ts comment),
    // so an in-flight legacy delivery is never blocked by a code it was never given.
    if (newStatus === 'PICKED_UP' && current.pickupCode) {
      if (!code || code.trim() !== current.pickupCode) {
        throw new Error('Invalid confirmation code');
      }
    }
    if (newStatus === 'DELIVERED' && current.dropoffCode) {
      if (!code || code.trim() !== current.dropoffCode) {
        throw new Error('Invalid confirmation code');
      }
    }

    const timestampField: Partial<Record<DeliveryStatus, string>> = {
      PICKED_UP: 'pickedUpAt', IN_TRANSIT: 'inTransitAt', DELIVERED: 'deliveredAt', CANCELLED: 'cancelledAt',
    };
    const updates: any = { status: newStatus };
    const field = timestampField[newStatus];
    if (field) updates[field] = new Date();

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(deliveries)
        .set(updates)
        .where(and(eq(deliveries.id, deliveryId), eq(deliveries.status, current.status)))
        .returning();
      if (!row) throw new Error('Delivery status changed concurrently — please retry');

      // Delivery status drives the customer-facing sub-order/order status — never the
      // other way around, and never by writing orders.status directly (that recreates the
      // exact desync the pre-implementation analysis found).
      if (newStatus === 'PICKED_UP' || newStatus === 'IN_TRANSIT') {
        await tx.update(subOrders).set({ status: 'IN_DELIVERY' }).where(eq(subOrders.id, row.subOrderId));
        await this.recomputeOrderAggregateStatus(row.orderId, tx);
      } else if (newStatus === 'DELIVERED') {
        await tx.update(subOrders).set({ status: 'DELIVERED' }).where(eq(subOrders.id, row.subOrderId));
        await this.recomputeOrderAggregateStatus(row.orderId, tx);
      }
      // CANCELLED intentionally does NOT touch the sub-order — the supplier's own READY
      // sub-order is unaffected by a courier-side cancellation; a new Delivery can be
      // created for it later (the partial unique index allows this).

      return row;
    });

    return updated;
  }

  /**
   * Driver roster for either kind of operator. A DRIVER belongs to exactly one owner
   * (users.deliveryCompanyId XOR users.supplierId, enforced by a DB CHECK constraint — see
   * shared/schema.ts) so this single method serves both the Delivery Company "Drivers" page
   * and the Supplier "Drivers" tab without a second Driver system.
   */
  async getDriversForOwner(ownerType: 'DELIVERY_COMPANY' | 'SUPPLIER', ownerId: number): Promise<User[]> {
    const ownerCondition = ownerType === 'SUPPLIER' ? eq(users.supplierId, ownerId) : eq(users.deliveryCompanyId, ownerId);
    return db.select().from(users).where(and(eq(users.role, 'DRIVER'), ownerCondition));
  }

  async createDriverForOwner(ownerType: 'DELIVERY_COMPANY' | 'SUPPLIER', ownerId: number, data: { name: string; email: string; password: string; phone?: string | null }): Promise<User> {
    const existing = await this.getUserByEmail(data.email);
    if (existing) throw new Error('Email already exists');
    return this.createUser({
      name: data.name,
      email: data.email,
      password: data.password,
      role: 'DRIVER',
      status: 'approved', // vetted by the owning operator, not the platform admin
      phone: data.phone ?? null,
      deliveryCompanyId: ownerType === 'DELIVERY_COMPANY' ? ownerId : null,
      supplierId: ownerType === 'SUPPLIER' ? ownerId : null,
    } as any);
  }

  /** The current active (non-CANCELLED) delivery for a sub-order, if any. Used by route
   * handlers to know whether/what to broadcast right after a status transition. */
  async getActiveDeliveryForSubOrder(subOrderId: number): Promise<Delivery | undefined> {
    const rows = await db.select().from(deliveries).where(eq(deliveries.subOrderId, subOrderId));
    return rows.find((d) => d.status !== 'CANCELLED');
  }

  async getApprovedDeliveryCompanyIds(): Promise<number[]> {
    const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.role, 'DELIVERY_COMPANY'), eq(users.status, 'approved')));
    return rows.map((r) => r.id);
  }

  /**
   * Validate a previous order's items against the current marketplace state.
   * Returns which items can be re-added as-is, which need attention, and resolved pack items.
   */
  async getReorderData(orderId: number, cafeId: number): Promise<{
    items: import("@shared/schema").CreateOrderItem[];
    packItems: import("@shared/schema").CreatePackOrderItem[];
    unavailable: { name: string; reason: string }[];
  }> {
    const order = await this.getOrder(orderId);
    if (!order || order.cafeId !== cafeId) throw new Error('Order not found');

    const items: import("@shared/schema").CreateOrderItem[] = [];
    const packItems: import("@shared/schema").CreatePackOrderItem[] = [];
    const unavailable: { name: string; reason: string }[] = [];

    for (const item of order.items) {
      if (item.packId) {
        const [pack] = await db.select().from(packs).where(eq(packs.id, item.packId));
        if (!pack || pack.isArchived || pack.visibility !== 'VISIBLE') {
          unavailable.push({ name: item.packName ?? `Pack #${item.packId}`, reason: 'Pack no longer available' });
          continue;
        }
        const [detail] = await this.buildPackDetails([pack]);
        const available = Math.min(pack.quantityAvailable, detail?.maxBuildable ?? 0);
        if (available < item.quantity) {
          unavailable.push({ name: pack.name, reason: available === 0 ? 'Out of stock' : `Only ${available} available` });
          continue;
        }
        packItems.push({
          packId: pack.id,
          supplierId: pack.supplierId,
          quantity: item.quantity,
          packName: pack.name,
          packImageUrl: pack.imageUrl ?? null,
          supplierName: detail?.supplierName ?? '',
          includedProducts: (item.snapshot as any)?.kind === "PACK" && Array.isArray((item.snapshot as any).includedProducts)
            // The stored snapshot holds the FINAL distribution for all packs in this
            // historical order. The cart also stores the current total distribution,
            // so restore the snapshot unchanged.
            ? (item.snapshot as any).includedProducts.map((included: any) => ({
                ...included,
                quantity: Math.max(1, included.quantity ?? 1),
              }))
            : (detail?.items ?? []).map((pi: any) => ({
                productId: pi.productId ?? 0,
                productName: pi.productName ?? pi.product?.name ?? '',
                productImageUrl: pi.productImageUrl ?? null,
                brandName: pi.brandName ?? null,
                categoryName: pi.categoryName ?? null,
                subCategoryName: pi.subCategoryName ?? null,
                flavorName: pi.flavorName ?? null,
                sizeName: pi.sizeName ?? null,
                quantity: (pi.quantity ?? 1) * item.quantity,
              })),
          unitPrice: pack.price ?? 0,
        } as any);
        continue;
      }

      if (!item.productId) continue;
      // Find listing: use stored listingId or look up by productId+supplierId from subOrder
      const subOrder = (order.subOrders ?? []).find(so => so.items.some(i => i.id === item.id));
      const supplierId = subOrder?.supplierId;
      let listingId: number | null = (item as any).listingId ?? null;
      if (!listingId && supplierId) {
        const [listing] = await db.select().from(supplierProductListings)
          .where(and(eq(supplierProductListings.productId, item.productId), eq(supplierProductListings.supplierId, supplierId)));
        listingId = listing?.id ?? null;
      }
      if (!listingId) { unavailable.push({ name: item.product?.name ?? `Product #${item.productId}`, reason: 'No longer offered by supplier' }); continue; }

      const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, listingId));
      if (!listing || listing.visibility !== 'VISIBLE') { unavailable.push({ name: item.product?.name ?? '', reason: 'No longer available' }); continue; }

      const [product] = await db.select().from(products).where(eq(products.id, item.productId));
      if (!product?.isAdminProduct || product.status !== 'ACTIVE') { unavailable.push({ name: product?.name ?? '', reason: 'Product no longer available' }); continue; }
      const [category] = product.categoryId ? await db.select().from(categories).where(eq(categories.id, product.categoryId)) : [];
      const [subCategory] = product.subCategoryId ? await db.select().from(subCategories).where(eq(subCategories.id, product.subCategoryId)) : [];
      const [brand] = product.brandId ? await db.select().from(brands).where(eq(brands.id, product.brandId)) : [];
      const snapshot = item.snapshot as any;
      const baseItem = {
        productName: product.name,
        productImageUrl: product.imageUrl ?? null,
        productCategory: product.category ?? '',
        brandName: snapshot?.brandName ?? brand?.name ?? null,
        categoryName: snapshot?.categoryName ?? category?.name ?? product.category ?? null,
        subCategoryName: snapshot?.subCategoryName ?? subCategory?.name ?? null,
        flavorName: snapshot?.flavorName ?? (item as any).flavorName ?? null,
        sizeName: snapshot?.sizeName ?? (item as any).sizeName ?? null,
      };

      const [supplier] = await db.select().from(users).where(eq(users.id, listing.supplierId));
      const variants = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, listingId));

      if (variants.length > 0) {
        const variant = variants.find(v => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null));
        if (!variant) { unavailable.push({ name: product.name, reason: 'Selected variant no longer available' }); continue; }
        if (variant.quantity < item.quantity) {
          if (variant.quantity === 0) { unavailable.push({ name: product.name, reason: 'Out of stock' }); continue; }
          unavailable.push({ name: product.name, reason: `Only ${variant.quantity} available` });
          // Add with reduced quantity
          items.push({ listingId, productId: item.productId, supplierId: listing.supplierId, supplierName: supplier?.name ?? '', flavorId: item.flavorId, sizeId: item.sizeId, ...baseItem, quantity: variant.quantity, unitPrice: variant.price } as any);
          continue;
        }
        items.push({ listingId, productId: item.productId, supplierId: listing.supplierId, supplierName: supplier?.name ?? '', flavorId: item.flavorId, sizeId: item.sizeId, ...baseItem, quantity: item.quantity, unitPrice: variant.price } as any);
      } else {
        if (listing.stock < item.quantity) {
          if (listing.stock === 0) { unavailable.push({ name: product.name, reason: 'Out of stock' }); continue; }
          unavailable.push({ name: product.name, reason: `Only ${listing.stock} available` });
          items.push({ listingId, productId: item.productId, supplierId: listing.supplierId, supplierName: supplier?.name ?? '', flavorId: null, sizeId: null, ...baseItem, quantity: listing.stock, unitPrice: listing.price } as any);
          continue;
        }
        items.push({ listingId, productId: item.productId, supplierId: listing.supplierId, supplierName: supplier?.name ?? '', flavorId: null, sizeId: null, ...baseItem, quantity: item.quantity, unitPrice: listing.price } as any);
      }
    }

    return { items, packItems, unavailable };
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
      priority?: string;
      scheduledAt?: Date;
    },
  ): Promise<Order> {
    const packOrderItems = opts?.packItems ?? [];
    const promoResults = opts?.promotionResults ?? [];
    // Build a discount map by supplierId for fast lookup
    const discountBySupplierId = new Map<number, import("@shared/schema").SupplierPromotionResult>();
    for (const r of promoResults) discountBySupplierId.set(r.supplierId, r);

    const rawTotal = cartItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
      + packOrderItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const totalDiscount = promoResults.reduce((s, r) => s + r.discountAmount, 0);
    const totalAmount = Math.max(0, rawTotal - totalDiscount);
    const supplierIds = Array.from(new Set([...cartItems.map((i) => i.supplierId), ...packOrderItems.map((i) => i.supplierId)]));
    const primarySupplierId = supplierIds.length === 1 ? supplierIds[0] : null;

    // The whole order — including every stock reservation it makes — is one atomic
    // transaction. Each deduction below is a conditional UPDATE ... WHERE quantity >= needed
    // RETURNING; if the row isn't returned, stock was insufficient (possibly because a
    // concurrent order just consumed it) and we throw, which rolls back everything written
    // so far in this order — no partial order, no oversold/negative stock, no phantom
    // reservation. This replaces the previous read-then-write check (racy under concurrent
    // requests — two orders could both read "enough stock" before either wrote its
    // decrement) with a single atomic statement per row.
    const order = await db.transaction(async (tx) => {
      const [order] = await tx.insert(orders).values({
        cafeId,
        supplierId: primarySupplierId,
        status: 'PENDING',
        totalAmount,
        deliveryAddress: opts?.deliveryAddress ?? null,
        deliveryMethod: opts?.deliveryMethod ?? 'DELIVERY_SERVICE',
        deliveryFee: opts?.deliveryFee ?? 0,
        courierInstructions: opts?.courierInstructions?.trim() || null,
        paymentMethod: opts?.paymentMethod ?? 'CASH_ON_DELIVERY',
        paymentStatus: 'PENDING',
        priority: (opts?.priority ?? 'NORMAL') as any,
        scheduledAt: opts?.scheduledAt ?? null,
      }).returning();

      for (const item of cartItems) {
        const variants = await tx.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, item.listingId));
        if (variants.length > 0) {
          const variant = variants.find(
            (v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null),
          );
          if (variant) {
            const [decremented] = await tx.update(supplierProductVariants)
              .set({ quantity: sql`${supplierProductVariants.quantity} - ${item.quantity}` })
              .where(and(eq(supplierProductVariants.id, variant.id), gte(supplierProductVariants.quantity, item.quantity)))
              .returning();
            if (!decremented) throw new Error(`Insufficient stock for ${item.productName ?? 'this item'}`);
          }
        } else {
          const [decremented] = await tx.update(supplierProductListings)
            .set({ stock: sql`${supplierProductListings.stock} - ${item.quantity}` })
            .where(and(eq(supplierProductListings.id, item.listingId), gte(supplierProductListings.stock, item.quantity)))
            .returning();
          if (!decremented) throw new Error(`Insufficient stock for ${item.productName ?? 'this item'}`);
        }

        // Recompute this listing's aggregate stock/price from its own variants — inline via
        // tx (not this.getVariantsByListingId, which reads through a separate connection and
        // would not see the decrement just written above within this same transaction).
        const listingVariants = await tx.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, item.listingId));
        const aggStock = listingVariants.reduce((s, v) => s + v.quantity, 0);
        const aggPrice = listingVariants.length ? Math.min(...listingVariants.map((v) => v.price)) : 0;
        await tx.update(supplierProductListings)
          .set({ stock: aggStock, price: aggPrice })
          .where(eq(supplierProductListings.id, item.listingId));
      }

      for (const item of packOrderItems) {
        const [decremented] = await tx.update(packs)
          .set({ quantityAvailable: sql`${packs.quantityAvailable} - ${item.quantity}` })
          .where(and(eq(packs.id, item.packId), gte(packs.quantityAvailable, item.quantity)))
          .returning();
        if (!decremented) throw new Error(`Insufficient stock for pack ${item.packName ?? ''}`);
      }

      // Always create sub-orders (even for single supplier) to store promotion snapshots
      const allSupplierIds = [...supplierIds]; // already built above
      if (allSupplierIds.length > 0) {
        for (const sid of allSupplierIds) {
          const supplierItems = cartItems.filter((i) => i.supplierId === sid);
          const supplierPackItems = packOrderItems.filter((i) => i.supplierId === sid);
          const rawSubtotal = supplierItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
            + supplierPackItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
          const promoResult = discountBySupplierId.get(sid);
          const discountAmount = promoResult?.discountAmount ?? 0;
          const subtotal = Math.max(0, rawSubtotal - discountAmount);
          const supplierName = supplierItems[0]?.supplierName ?? supplierPackItems[0]?.supplierName ?? 'Unknown';
          const subOrderData: any = {
            orderId: order.id,
            supplierId: sid,
            supplierName,
            subtotal,
            discountAmount,
            freeShipping: promoResult?.freeShipping ?? false,
            giftInfo: promoResult?.giftInfo ?? null,
          };
          if (promoResult?.promotionId) {
            subOrderData.promotionId = promoResult.promotionId;
            subOrderData.promotionName = promoResult.promotionName;
            subOrderData.promotionType = promoResult.promotionType;
            subOrderData.originalSubtotal = rawSubtotal;
          }
          const [so] = await tx.insert(subOrders).values(subOrderData).returning();
          for (const item of supplierItems) {
            await tx.insert(orderItems).values({
              orderId: order.id,
              subOrderId: so.id,
              productId: item.productId,
              listingId: item.listingId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.unitPrice * item.quantity,
              flavorId: item.flavorId ?? null,
              sizeId: item.sizeId ?? null,
              snapshot: {
                kind: "PRODUCT",
                productId: item.productId,
                productName: item.productName,
                productImageUrl: (item as any).productImageUrl ?? null,
                supplierName: item.supplierName,
                brandName: item.brandName ?? null,
                categoryName: item.categoryName ?? null,
                subCategoryName: item.subCategoryName ?? null,
                flavorName: item.flavorName ?? null,
                sizeName: item.sizeName ?? null,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.unitPrice * item.quantity,
              },
            });
          }
          for (const item of supplierPackItems) {
            await tx.insert(orderItems).values({
              orderId: order.id,
              subOrderId: so.id,
              packId: item.packId,
              packName: item.packName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.unitPrice * item.quantity,
              snapshot: {
                kind: "PACK",
                packId: item.packId,
                packName: item.packName,
                packImageUrl: item.packImageUrl,
                supplierName: item.supplierName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.unitPrice * item.quantity,
                includedProducts: item.includedProducts,
              },
            });
          }
          // Reserve Pack component variant/listing stock immediately at order creation —
          // mirrors regular items (deducted above, unconditionally, at creation) rather than
          // waiting for supplier confirmation. Runs after this sub-order's pack order items
          // are inserted so deductPackComponentStock (which reads them back by subOrderId)
          // sees the exact selection just written. Passed this same tx so its guarded
          // decrements participate in the same atomic transaction. See updateSubOrderStatus,
          // which no longer deducts on confirmation to avoid double-deducting the same stock.
          if (supplierPackItems.length > 0) {
            await this.deductPackComponentStock(so.id, tx);
          }
        }
      }
      return order;
    });
    return order;
  }

  async updateOrderStatus(id: number, status: typeof orders.$inferSelect.status, deliveryId?: number) {
    const [existing] = await db.select().from(orders).where(eq(orders.id, id));
    const updates: any = { status };
    if (deliveryId) updates.deliveryId = deliveryId;
    const [updated] = await db.update(orders).set(updates).where(eq(orders.id, id)).returning();

    // Restock inventory when an order is cancelled (covers cancellation and refund flows,
    // since this schema has no separate REFUNDED status — refunds are modeled as cancellations).
    if (existing && existing.status !== 'CANCELLED' && status === 'CANCELLED') {
      await this.restockOrderInventory(id);
    }
    return updated;
  }

  /** Restores stock for every item in an order back to the suppliers' listings/variants. Used on order cancellation. */
  private async restockOrderInventory(orderId: number) {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      if (item.packId) {
        // If the sub-order was already cancelled (supplier rejected), its own cancellation
        // path (updateSubOrderStatus -> restoreSubOrderPackStock) already restored both
        // pack-level and component stock — skip to avoid double-restock.
        if (item.subOrderId) {
          const [so] = await db.select().from(subOrders).where(eq(subOrders.id, item.subOrderId));
          if (so?.status === 'CANCELLED') {
            continue;
          }
        }
        // Pack component stock is reserved unconditionally at order creation (see
        // createOrder), so it must always be restored here too — regardless of whether the
        // sub-order ever reached CONFIRMED.
        await db.update(packs).set({ quantityAvailable: sql`${packs.quantityAvailable} + ${item.quantity}` }).where(eq(packs.id, item.packId));
        const snapshot = (item.snapshot ?? {}) as any;
        const includedProducts = Array.isArray(snapshot.includedProducts) ? snapshot.includedProducts : [];
        await this.restorePackComponentStock(item.packId, item.quantity, includedProducts);
        continue;
      }
      if (!item.productId) continue;

      // Prefer the stored listingId — this is the most accurate source for multi-supplier orders
      // because each item knows exactly which listing it came from.
      let listingId: number | null = item.listingId ?? null;

      if (!listingId) {
        // Fallback: look up by product + suborder supplier
        let supplierId: number | null = null;
        if (item.subOrderId) {
          const [so] = await db.select().from(subOrders).where(eq(subOrders.id, item.subOrderId));
          supplierId = so?.supplierId ?? null;
        }
        if (!supplierId) {
          const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
          supplierId = order?.supplierId ?? null;
        }
        const candidateListings = supplierId
          ? await db.select().from(supplierProductListings).where(and(eq(supplierProductListings.productId, item.productId), eq(supplierProductListings.supplierId, supplierId)))
          : await db.select().from(supplierProductListings).where(eq(supplierProductListings.productId, item.productId));
        listingId = candidateListings[0]?.id ?? null;
      }

      if (!listingId) continue;

      if (item.flavorId != null || item.sizeId != null) {
        const variants = await this.getVariantsByListingId(listingId);
        const variant = variants.find((v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null));
        if (variant) {
          await this.restockVariantFromOrderCancellation(variant.id, item.quantity, `Order #${orderId} cancelled`);
          continue;
        }
      }
      await this.restockFromOrderCancellation(listingId, item.quantity, `Order #${orderId} cancelled`);
    }
  }

  /**
   * Restores stock for every still-ACTIVE regular (non-Pack) item in ONE sub-order — used
   * when a Supplier rejects/cancels that specific sub-order (see updateSubOrderStatus).
   * Regular item stock (like Pack component stock — see deductPackComponentStock) is
   * deducted at order CREATION time, so it must be restored here regardless of whether this
   * sub-order had ever reached CONFIRMED. Skips items
   * already marked CANCELLED (e.g. individually cancelled earlier via
   * cancelSubOrderItems, which already restocked them) so nothing is ever restocked twice.
   * Reuses the exact same restockVariantFromOrderCancellation/restockFromOrderCancellation
   * primitives restockOrderInventory and cancelSubOrderItems already use — one inventory
   * restoration mechanism, not a parallel one.
   */
  private async restockSubOrderRegularItems(subOrderId: number, orderId: number): Promise<void> {
    const items = await db.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
    for (const item of items) {
      if (item.packId) continue; // Pack components are handled separately (see restoreSubOrderPackStock).
      if (item.status === 'CANCELLED') continue;
      if (!item.productId || !item.listingId) continue;

      if (item.flavorId != null || item.sizeId != null) {
        const variants = await this.getVariantsByListingId(item.listingId);
        const variant = variants.find((v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null));
        if (variant) {
          await this.restockVariantFromOrderCancellation(variant.id, item.quantity, `Order #${orderId} sub-order rejected`);
          continue;
        }
      }
      await this.restockFromOrderCancellation(item.listingId, item.quantity, `Order #${orderId} sub-order rejected`);
    }
  }

  /**
   * Coffee-Owner-initiated, per-item cancellation within a single still-PENDING sub-order.
   * Mirrors the whole-order cancel path (updateOrderStatus -> restockOrderInventory) for
   * stock restoration, but scoped to only the selected items, and recomputes the sub-order's
   * subtotal and the parent order's total from the persisted order_items — never trusts a
   * client-supplied total. Reuses recomputeOrderAggregateStatus (the single writer of
   * orders.status) so a sub-order that becomes fully cancelled here stays consistent with
   * every other status-changing path.
   */
  async cancelSubOrderItems(subOrderId: number, cafeOwnerId: number, orderItemIds: number[]): Promise<{ subOrder: SubOrder; order: Order }> {
    const [subOrder] = await db.select().from(subOrders).where(eq(subOrders.id, subOrderId));
    if (!subOrder) throw new Error("Sub-order not found");
    const [order] = await db.select().from(orders).where(eq(orders.id, subOrder.orderId));
    if (!order) throw new Error("Order not found");
    if (order.cafeId !== cafeOwnerId) throw new Error("Forbidden");
    if (subOrder.status !== "PENDING") throw new Error("This supplier order can no longer be cancelled");

    const items = await db.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
    const requestedIds = new Set(orderItemIds);
    const targets = items.filter((item) => requestedIds.has(item.id));
    if (targets.length !== orderItemIds.length) throw new Error("One or more items do not belong to this supplier order");
    if (targets.some((item) => item.status === "CANCELLED")) throw new Error("One or more items are already cancelled");

    // Restock exactly the items being cancelled — same restoration primitives the whole-order
    // cancel path already uses (restockVariantFromOrderCancellation / restockFromOrderCancellation),
    // so a Coffee Owner cancelling one variant here behaves identically to cancelling the whole
    // pending order, just scoped down. Pack items restore both pack-level availability and
    // component variant/listing stock, since both are reserved unconditionally at order
    // creation (see createOrder / deductPackComponentStock).
    for (const item of targets) {
      if (item.packId) {
        await db.update(packs).set({ quantityAvailable: sql`${packs.quantityAvailable} + ${item.quantity}` }).where(eq(packs.id, item.packId));
        const snapshot = (item.snapshot ?? {}) as any;
        const includedProducts = Array.isArray(snapshot.includedProducts) ? snapshot.includedProducts : [];
        await this.restorePackComponentStock(item.packId, item.quantity, includedProducts);
        continue;
      }
      if (!item.productId || !item.listingId) continue;
      if (item.flavorId != null || item.sizeId != null) {
        const variants = await this.getVariantsByListingId(item.listingId);
        const variant = variants.find((v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null));
        if (variant) {
          await this.restockVariantFromOrderCancellation(variant.id, item.quantity, `Order #${order.id} item cancelled`);
          continue;
        }
      }
      await this.restockFromOrderCancellation(item.listingId, item.quantity, `Order #${order.id} item cancelled`);
    }

    const result = await db.transaction(async (tx) => {
      await tx.update(orderItems).set({ status: "CANCELLED" }).where(inArray(orderItems.id, orderItemIds));

      const refreshedItems = await tx.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
      const activeItems = refreshedItems.filter((item) => item.status !== "CANCELLED");
      const activeRawSum = activeItems.reduce((sum, item) => sum + (item.totalPrice ?? item.unitPrice * item.quantity), 0);
      const newSubtotal = Math.max(0, activeRawSum - (subOrder.discountAmount ?? 0));
      const allCancelled = activeItems.length === 0;

      const [updatedSubOrder] = await tx.update(subOrders)
        .set({ subtotal: newSubtotal, status: allCancelled ? "CANCELLED" : subOrder.status })
        .where(eq(subOrders.id, subOrderId))
        .returning();

      // Recompute the parent order's total from every sub-order (not just this one) — the
      // source of truth for orders.totalAmount is always the persisted sub-order subtotals.
      const siblingSubOrders = await tx.select().from(subOrders).where(eq(subOrders.orderId, subOrder.orderId));
      const newOrderTotal = siblingSubOrders.reduce(
        (sum, so) => sum + (so.id === subOrderId ? newSubtotal : so.subtotal),
        0,
      );
      await tx.update(orders).set({ totalAmount: newOrderTotal }).where(eq(orders.id, subOrder.orderId));

      if (allCancelled) {
        await this.recomputeOrderAggregateStatus(subOrder.orderId, tx);
      }
      const [updatedOrder] = await tx.select().from(orders).where(eq(orders.id, subOrder.orderId));
      return { subOrder: updatedSubOrder, order: updatedOrder };
    });

    return result;
  }

  /**
   * Cancels part or all of one order item's quantity. When cancelQty covers the item's
   * entire remaining quantity, the row is simply marked CANCELLED in place (identical to the
   * existing cancelSubOrderItems behavior). When cancelQty is less than the item's quantity,
   * the row is split: the original row keeps the remaining ACTIVE quantity, and a new sibling
   * row (same order/sub-order/product/listing/flavor/size/pack, cloned snapshot) is inserted
   * with exactly the cancelled quantity and status CANCELLED. Every existing consumer that
   * renders order items (groupOrderItemsByProduct, the pack-item maps in the Coffee
   * Owner/Supplier/Admin order modals) already iterates every row in a sub-order and renders
   * cancelled ones with strikethrough — so a split pair renders correctly with zero display
   * changes, exactly like two naturally distinct line items.
   *
   * For a Pack row, the snapshot's includedProducts quantities (the Coffee Owner's actual
   * selected flavor/size distribution — see resolvePackComponentDeductions) are scaled down
   * proportionally between the two halves, so neither the remaining nor the cancelled slice
   * ever loses or duplicates the original exact selection.
   */
  private async splitAndCancelOrderItem(
    tx: any,
    item: typeof orderItems.$inferSelect,
    cancelQty: number,
  ): Promise<{ cancelledItemId: number; cancelledQty: number }> {
    if (cancelQty >= item.quantity) {
      await tx.update(orderItems).set({ status: 'CANCELLED' }).where(eq(orderItems.id, item.id));
      return { cancelledItemId: item.id, cancelledQty: item.quantity };
    }

    const remainingQty = item.quantity - cancelQty;
    const originalSnapshot = (item.snapshot ?? {}) as any;
    const scaleSnapshot = (qty: number) => {
      if (!originalSnapshot || typeof originalSnapshot !== 'object') return originalSnapshot;
      const scaled: any = { ...originalSnapshot, quantity: qty, totalPrice: item.unitPrice * qty };
      if (originalSnapshot.kind === 'PACK' && Array.isArray(originalSnapshot.includedProducts)) {
        scaled.includedProducts = originalSnapshot.includedProducts.map((p: any) => ({
          ...p,
          quantity: Math.round((p.quantity * qty) / item.quantity),
        }));
      }
      return scaled;
    };

    await tx.update(orderItems).set({
      quantity: remainingQty,
      totalPrice: item.unitPrice * remainingQty,
      snapshot: scaleSnapshot(remainingQty),
    }).where(eq(orderItems.id, item.id));

    const [inserted] = await tx.insert(orderItems).values({
      orderId: item.orderId,
      subOrderId: item.subOrderId,
      productId: item.productId,
      listingId: item.listingId,
      packId: item.packId,
      packName: item.packName,
      quantity: cancelQty,
      unitPrice: item.unitPrice,
      totalPrice: item.unitPrice * cancelQty,
      flavorId: item.flavorId,
      sizeId: item.sizeId,
      snapshot: scaleSnapshot(cancelQty),
      status: 'CANCELLED',
    }).returning();

    return { cancelledItemId: inserted.id, cancelledQty: cancelQty };
  }

  /**
   * Supplier-initiated granular cancellation: lets a Supplier cancel exactly the
   * products/variants/Packs/quantities they cannot fulfill from their OWN sub-order, instead
   * of only being able to reject the whole sub-order (see updateSubOrderStatus's CANCELLED
   * transition, which remains unchanged and still available as the "cancel entire order"
   * fast path). Authorized to the sub-order's own supplier only — never another supplier's
   * sub-order within the same multi-supplier order. Allowed while the sub-order is still
   * PENDING, CONFIRMED, or PREPARING — the same boundary the existing status picklist already
   * enforces (SUPPLIER_NEXT_STATUSES never offers CANCELLED past PREPARING, since READY hands
   * the sub-order off to the Delivery lifecycle).
   *
   * Stock is restored for exactly the cancelled quantity via the same restock primitives
   * (restockVariantFromOrderCancellation / restockFromOrderCancellation /
   * restorePackComponentStock) every other cancellation path already uses — never a second
   * inventory mechanism. If every item ends up cancelled, the sub-order itself becomes
   * CANCELLED (mirroring cancelSubOrderItems), otherwise its existing status is preserved.
   */
  async cancelSupplierSubOrderItems(
    subOrderId: number,
    supplierId: number,
    targets: Array<{ orderItemId: number; quantity: number }>,
  ): Promise<{ subOrder: SubOrder; order: Order; cancelledItemIds: number[] }> {
    const [subOrder] = await db.select().from(subOrders).where(eq(subOrders.id, subOrderId));
    if (!subOrder) throw new Error('Sub-order not found');
    if (subOrder.supplierId !== supplierId) throw new Error('Forbidden');
    const CANCELLABLE_STATUSES = new Set(['PENDING', 'CONFIRMED', 'PREPARING']);
    if (!CANCELLABLE_STATUSES.has(subOrder.status ?? '')) {
      throw new Error('This supplier order can no longer be modified');
    }
    const [order] = await db.select().from(orders).where(eq(orders.id, subOrder.orderId));
    if (!order) throw new Error('Order not found');
    if (!targets.length) throw new Error('No items specified');

    const items = await db.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
    const itemMap = new Map(items.map((i) => [i.id, i]));

    // Merge duplicate targets for the same order item (defensive — the client should never
    // send the same id twice, but never silently double-cancel if it does).
    const mergedTargets = new Map<number, number>();
    for (const t of targets) {
      if (!Number.isInteger(t.quantity) || t.quantity <= 0) throw new Error('Invalid cancellation quantity');
      mergedTargets.set(t.orderItemId, (mergedTargets.get(t.orderItemId) ?? 0) + t.quantity);
    }
    for (const [orderItemId, qty] of Array.from(mergedTargets)) {
      const item = itemMap.get(orderItemId);
      if (!item) throw new Error('One or more items do not belong to this supplier order');
      if (item.status === 'CANCELLED') throw new Error('One or more items are already cancelled');
      if (qty > item.quantity) throw new Error('Cannot cancel more than the ordered quantity');
    }

    // Restock exactly the cancelled quantity per item — same primitives every other
    // cancellation path already uses (see cancelSubOrderItems / restockOrderInventory).
    for (const [orderItemId, qty] of Array.from(mergedTargets)) {
      const item = itemMap.get(orderItemId)!;
      if (item.packId) {
        await db.update(packs).set({ quantityAvailable: sql`${packs.quantityAvailable} + ${qty}` }).where(eq(packs.id, item.packId));
        const snapshot = (item.snapshot ?? {}) as any;
        const includedProducts = Array.isArray(snapshot.includedProducts) ? snapshot.includedProducts : [];
        // Scale the actual purchased selection down to exactly the cancelled portion of this
        // line — never restore the full line's components when only part of its quantity was
        // cancelled (see splitAndCancelOrderItem's identical scaling for the stored snapshot).
        const scaledIncluded = includedProducts.map((p: any) => ({
          ...p,
          quantity: Math.round((p.quantity * qty) / item.quantity),
        }));
        await this.restorePackComponentStock(item.packId, qty, scaledIncluded);
        continue;
      }
      if (!item.productId || !item.listingId) continue;
      if (item.flavorId != null || item.sizeId != null) {
        const variants = await this.getVariantsByListingId(item.listingId);
        const variant = variants.find((v) => (v.flavorId ?? null) === (item.flavorId ?? null) && (v.sizeId ?? null) === (item.sizeId ?? null));
        if (variant) {
          await this.restockVariantFromOrderCancellation(variant.id, qty, `Order #${order.id} item cancelled by supplier`);
          continue;
        }
      }
      await this.restockFromOrderCancellation(item.listingId, qty, `Order #${order.id} item cancelled by supplier`);
    }

    const cancelledItemIds: number[] = [];
    const result = await db.transaction(async (tx) => {
      for (const [orderItemId, qty] of Array.from(mergedTargets)) {
        const item = itemMap.get(orderItemId)!;
        const { cancelledItemId } = await this.splitAndCancelOrderItem(tx, item, qty);
        cancelledItemIds.push(cancelledItemId);
      }

      const refreshedItems = await tx.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
      const activeItems = refreshedItems.filter((i: any) => i.status !== 'CANCELLED');
      const activeRawSum = activeItems.reduce((sum: number, i: any) => sum + (i.totalPrice ?? i.unitPrice * i.quantity), 0);
      const newSubtotal = Math.max(0, activeRawSum - (subOrder.discountAmount ?? 0));
      const allCancelled = activeItems.length === 0;

      const [updatedSubOrder] = await tx.update(subOrders)
        .set({ subtotal: newSubtotal, status: allCancelled ? 'CANCELLED' : subOrder.status })
        .where(eq(subOrders.id, subOrderId))
        .returning();

      const siblingSubOrders = await tx.select().from(subOrders).where(eq(subOrders.orderId, subOrder.orderId));
      const newOrderTotal = siblingSubOrders.reduce(
        (sum, so) => sum + (so.id === subOrderId ? newSubtotal : so.subtotal),
        0,
      );
      await tx.update(orders).set({ totalAmount: newOrderTotal }).where(eq(orders.id, subOrder.orderId));

      if (allCancelled) {
        await this.cancelActiveDeliveryForSubOrder(subOrderId, tx);
        await this.recomputeOrderAggregateStatus(subOrder.orderId, tx);
      }
      const [updatedOrder] = await tx.select().from(orders).where(eq(orders.id, subOrder.orderId));
      return { subOrder: updatedSubOrder, order: updatedOrder };
    });

    return { ...result, cancelledItemIds };
  }

  /** Coffee Owner's "Daily" star — a persisted favorite flag on the order, scoped to its owner. */
  async setOrderFavorite(orderId: number, cafeOwnerId: number, isFavorite: boolean): Promise<Order> {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) throw new Error("Order not found");
    if (order.cafeId !== cafeOwnerId) throw new Error("Forbidden");
    const [updated] = await db.update(orders).set({ isFavorite }).where(eq(orders.id, orderId)).returning();
    return updated;
  }

  /**
   * Collects items from a sub-order with all the data needed to restore them to the cafe
   * owner's cart (used when a supplier rejects/cancels their sub-order, in full or in part).
   * Pass itemIds to scope this to only the specific order_items rows that were just
   * cancelled (partial cancellation — see cancelSupplierSubOrderItems); omit it for the
   * existing whole-sub-order-rejected path, which restores every item in the sub-order.
   */
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
    const [subOrder] = await db.select().from(subOrders).where(eq(subOrders.id, subOrderId));
    if (!subOrder) return { regularItems: [], packItems: [] };

    const [supplier] = await db.select().from(users).where(eq(users.id, subOrder.supplierId));
    const supplierName = supplier?.name ?? subOrder.supplierName;

    const allItems = await db.select().from(orderItems).where(eq(orderItems.subOrderId, subOrderId));
    const items = itemIds ? allItems.filter((i) => itemIds.includes(i.id)) : allItems;
    const tx = await buildTaxonomyCache();

    const regularItems: any[] = [];
    const packItemsResult: any[] = [];

    for (const item of items) {
      if (item.packId) {
        const [pack] = await db.select().from(packs).where(eq(packs.id, item.packId));
        if (!pack) continue;
        // Prefer the Coffee Owner's actual captured selection (orderItems.snapshot,
        // written at checkout — see resolvePackOrderItems) over the Pack's current
        // generic default composition. Restoring from the default would silently
        // discard exactly which flavor/size the Coffee Owner had chosen (e.g. Ananas
        // instead of the pack's representative Citron) — the cart must show back what
        // they actually selected, not a re-derived guess. Only a legacy order placed
        // before this snapshot field existed falls back to the live default.
        const snapshot = (item.snapshot ?? {}) as any;
        const snapshotIncluded = snapshot.kind === "PACK" && Array.isArray(snapshot.includedProducts)
          ? snapshot.includedProducts
          : null;
        let includedProducts: Array<{ productId: number; productName: string; productImageUrl: string | null; brandName: string | null; categoryName: string | null; subCategoryName: string | null; flavorName: string | null; sizeName: string | null; quantity: number }>;
        if (snapshotIncluded) {
          includedProducts = snapshotIncluded.map((pi: any) => ({
            productId: pi.productId ?? 0,
            productName: pi.productName ?? "Produit",
            productImageUrl: pi.productImageUrl ?? null,
            brandName: pi.brandName ?? null,
            categoryName: pi.categoryName ?? null,
            subCategoryName: pi.subCategoryName ?? null,
            flavorName: pi.flavorName ?? null,
            sizeName: pi.sizeName ?? null,
            quantity: pi.quantity,
          }));
        } else {
          const [packDetail] = await this.buildPackDetails([pack]);
          includedProducts = (packDetail?.items ?? []).map((pi) => ({
            productId: pi.productId,
            productName: pi.productName,
            productImageUrl: pi.productImageUrl ?? null,
            brandName: pi.brandName ?? null,
            categoryName: pi.categoryName ?? null,
            subCategoryName: pi.subCategoryName ?? null,
            flavorName: pi.flavorName ?? null,
            sizeName: pi.sizeName ?? null,
            quantity: pi.quantity,
          }));
        }
        packItemsResult.push({
          packId: item.packId,
          packName: item.packName ?? pack.name,
          packImageUrl: pack.imageUrl ?? null,
          supplierId: subOrder.supplierId,
          supplierName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          includedProducts,
        });
      } else if (item.productId && item.listingId) {
        const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, item.listingId));
        if (!listing) continue;
        const [product] = await db.select().from(products).where(eq(products.id, item.productId));
        if (!product) continue;
        regularItems.push({
          listingId: item.listingId,
          productId: item.productId,
          productName: product.name,
          productImageUrl: product.imageUrl ?? null,
          productCategory: product.category ?? '',
          supplierId: subOrder.supplierId,
          supplierName,
          flavorId: item.flavorId ?? null,
          sizeId: item.sizeId ?? null,
          flavorName: item.flavorId ? (tx.flvMap.get(item.flavorId)?.name ?? null) : null,
          sizeName: item.sizeId ? (tx.szMap.get(item.sizeId)?.name ?? null) : null,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
        });
      }
    }

    return { regularItems, packItems: packItemsResult };
  }

  /**
   * Returns the composition of a pack (product name, variant, flavor, size, quantity per slot)
   * for display in the Supplier order details modal.
   */
  async getPackComposition(packId: number): Promise<Array<{
    listingId: number;
    variantId: number | null;
    productName: string;
    flavorName: string | null;
    sizeName: string | null;
    quantity: number;
  }>> {
    const [pack] = await db.select().from(packs).where(eq(packs.id, packId));
    if (!pack) return [];
    const [detail] = await this.buildPackDetails([pack]);
    if (!detail) return [];
    return detail.items.map((item) => ({
      listingId: item.listingId,
      variantId: item.variantId ?? null,
      productName: item.productName,
      flavorName: item.flavorName ?? null,
      sizeName: item.sizeName ?? null,
      quantity: item.quantity,
    }));
  }

  // ── Marketplace ─────────────────────────────────────────────────────────────

  async getMarketplaceProducts(filters?: { categoryId?: number; subCategoryId?: number; search?: string; supplierId?: number }): Promise<MarketplaceProduct[]> {
    const allProducts = filters?.supplierId != null
      ? await db.select().from(products)
      : await db.select().from(products).where(eq(products.isAdminProduct, true));
    const allListings = await db.select().from(supplierProductListings);
    const allVariants = await db.select().from(supplierProductVariants);
    const allUsers = await db.select().from(users);
    const frozenMappings = await db.select().from(supplierCategories).where(eq(supplierCategories.isFrozen, true));
    const frozenSet = new Set(frozenMappings.map((f) => `${f.supplierId}:${f.categoryId}`));
    const tx = await buildTaxonomyCache();

    // Build supplier store logo map (supplierId → logoUrl)
    const allStores = await db.select({ supplierId: supplierStores.supplierId, logoUrl: supplierStores.logoUrl }).from(supplierStores);
    const storeLogoMap = new Map(allStores.map((s) => [s.supplierId, s.logoUrl]));

    // Build product review stats map (productId → { sum, count })
    const allProductReviews = await db.select({ productId: supplierProductReviews.productId, rating: supplierProductReviews.rating })
      .from(supplierProductReviews)
      .where(eq(supplierProductReviews.reviewType, 'PRODUCT'));
    const reviewStatsByProduct = new Map<number, { sum: number; count: number }>();
    for (const r of allProductReviews) {
      if (!r.productId) continue;
      if (!reviewStatsByProduct.has(r.productId)) reviewStatsByProduct.set(r.productId, { sum: 0, count: 0 });
      const s = reviewStatsByProduct.get(r.productId)!;
      s.sum += r.rating;
      s.count += 1;
    }

    const supplierMap = new Map(allUsers.map((u) => [u.id, { name: u.name, lat: u.locationLat, lng: u.locationLng }]));
    const productMap = new Map(allProducts.map((p) => [p.id, p]));
    const variantsByListing = new Map<number, typeof allVariants>();
    for (const v of allVariants) {
      if (!variantsByListing.has(v.listingId)) variantsByListing.set(v.listingId, []);
      variantsByListing.get(v.listingId)!.push(v);
    }

    let prods = allProducts.filter((p) => p.status !== 'FREEZE');
    if (filters?.categoryId) prods = prods.filter((p) => p.categoryId === filters.categoryId);
    if (filters?.subCategoryId) prods = prods.filter((p) => p.subCategoryId === filters.subCategoryId);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      prods = prods.filter((p) => p.name.toLowerCase().includes(q));
    }

    const result: MarketplaceProduct[] = [];
    for (const prod of prods) {
       const listings = allListings.filter((l) =>
         l.productId === prod.id && (filters?.supplierId == null || l.supplierId === filters.supplierId)
       );
      if (!listings.length) continue;
      const marketListings: MarketplaceListing[] = listings
         .filter((l) => {
          if (l.onlyForPack) return false;
           if (filters?.supplierId != null && l.visibility !== 'VISIBLE') return false;
          if (prod.categoryId && frozenSet.has(`${l.supplierId}:${prod.categoryId}`)) return false;
          return true;
        })
        .map((l) => {
          const rawVariants = variantsByListing.get(l.id) ?? [];
          const variants = rawVariants
            .filter((v) => v.price > 0 && v.quantity > 0)
            .map((v) => ({
              id: v.id,
              listingId: v.listingId,
              flavorId: v.flavorId,
              sizeId: v.sizeId,
              flavorName: v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null,
              sizeName: v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null,
              price: v.price,
              quantity: v.quantity,
            }));
          const totalStock = variants.length ? variants.reduce((s, v) => s + v.quantity, 0) : (l.stock > 0 && l.price > 0 ? l.stock : 0);
          const minPrice = variants.length ? Math.min(...variants.map((v) => v.price)) : (l.price > 0 ? l.price : 0);
          const sup = supplierMap.get(l.supplierId);
          return { id: l.id, supplierId: l.supplierId, supplierName: sup?.name ?? "", supplierLat: sup?.lat ?? null, supplierLng: sup?.lng ?? null, storeLogoUrl: storeLogoMap.get(l.supplierId) ?? null, variants, totalStock, minPrice };
        })
        .filter((l) => l.totalStock > 0 && l.minPrice > 0);
      if (!marketListings.length) continue;
      const bestPrice = Math.min(...marketListings.map((l) => l.minPrice));
      const totalStock = marketListings.reduce((s, l) => s + l.totalStock, 0);
      const reviewStats = reviewStatsByProduct.get(prod.id);
      const avgRating = reviewStats ? reviewStats.sum / reviewStats.count : 0;
      const reviewCount = reviewStats?.count ?? 0;
      result.push({ ...enrichProduct(prod, tx), listings: marketListings, bestPrice, totalStock, supplierCount: marketListings.length, avgRating, reviewCount });
    }
    return result;
  }

  async getMarketplaceProduct(productId: number, supplierId?: number): Promise<MarketplaceProduct | undefined> {
    const all = await this.getMarketplaceProducts(supplierId == null ? undefined : { supplierId });
    return all.find((p) => p.id === productId);
  }

  // ── Favorites ───────────────────────────────────────────────────────────────

  async getFavoritesByUser(userId: number): Promise<ShopFavoriteItem[]> {
    const rows = await db.select().from(favorites).where(eq(favorites.userId, userId));
    if (!rows.length) return [];
    const productIds = rows.map((r) => r.productId);
    const prods = await db.select().from(products).where(inArray(products.id, productIds));
    const prodMap = new Map(prods.map((p) => [p.id, p]));
    return rows
      .map((r) => prodMap.get(r.productId))
      .filter((p): p is typeof products.$inferSelect => !!p)
      .map((p) => ({
        id: p.id,
        name: p.name,
        supplier: p.category ?? "",
        price: p.price ?? 0,
        image: p.imageUrl ?? "",
      }));
  }

  async addFavorite(userId: number, productId: number): Promise<void> {
    const existing = await db.select().from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)));
    if (existing.length) return;
    await db.insert(favorites).values({ userId, productId });
  }

  async removeFavorite(userId: number, productId: number): Promise<void> {
    await db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)));
  }

  // ── Maintenance marketplace ───────────────────────────────────────────────

  async getMaintenanceProfiles(filters?: {
    search?: string;
    category?: string;
    profileType?: string;
    available?: boolean;
    location?: string;
  }): Promise<MaintenanceMarketplaceCard[]> {
    const rows = await db.select({ profile: maintenanceProfiles, user: users })
      .from(maintenanceProfiles)
      .innerJoin(users, eq(maintenanceProfiles.userId, users.id))
      .where(and(
        eq(users.role, "MAINTENANCE" as any),
        eq(users.status, "approved"),
        eq(maintenanceProfiles.marketplaceVisible, true),
       eq(maintenanceProfiles.isOnVacation, false),
      ));

    const maintenanceUserIds = rows.map(({ profile }) => profile.userId);
    const reviewRows = maintenanceUserIds.length
      ? await db.select({
          maintenanceUserId: supplierProductReviews.maintenanceUserId,
          rating: supplierProductReviews.rating,
        }).from(supplierProductReviews).where(and(
          eq(supplierProductReviews.reviewType, "MAINTENANCE"),
          inArray(supplierProductReviews.maintenanceUserId as any, maintenanceUserIds),
        ))
      : [];
    const reviewStats = new Map<number, { total: number; sum: number }>();
    for (const review of reviewRows) {
      if (!review.maintenanceUserId) continue;
      const current = reviewStats.get(review.maintenanceUserId) ?? { total: 0, sum: 0 };
      current.total += 1;
      current.sum += review.rating;
      reviewStats.set(review.maintenanceUserId, current);
    }

    const cards = rows.map(({ profile, user }) => {
      const available = profile.isAvailable && !profile.isOnVacation;
      const location = user.locationAddress ?? profile.coverageArea ?? "";
      const stats = reviewStats.get(profile.userId);
      const workingHours = profile.workingDays.length
        ? `${profile.workingDays.join(", ")} · ${profile.startTime}–${profile.endTime}`
        : `${profile.startTime}–${profile.endTime}`;
      return {
        ...profile,
        rating: stats ? Math.round((stats.sum / stats.total) * 10) : 0,
        reviewCount: stats?.total ?? 0,
        name: user.name,
        phone: user.phone ?? null,
        profileImageUrl: user.profileImageUrl ?? null,
        location,
        initials: user.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
        available,
        type: profile.profileType,
        specialty: profile.categories[0] ?? "Maintenance",
        workingHours,
      } as MaintenanceMarketplaceCard;
    });

    const query = filters?.search?.trim().toLowerCase();
    return cards.filter((card) => {
      if (query) {
        const haystack = [
          card.name, card.jobTitle, card.description, card.location,
          card.categories.join(" "), card.skills.join(" "), card.coverageArea,
        ].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filters?.category && !card.categories.some((c) => c.toLowerCase() === filters.category!.toLowerCase())) return false;
      if (filters?.profileType && card.profileType !== filters.profileType) return false;
      if (filters?.available !== undefined && card.available !== filters.available) return false;
      if (filters?.location && card.location !== filters.location) return false;
      return true;
    });
  }

  async getMaintenanceCategories(): Promise<string[]> {
    const taxonomy = await this.getMaintenanceTaxonomy();
    const activeTaxonomy = taxonomy.competencies.filter((item) => item.isActive && !item.isFrozen);
    if (activeTaxonomy.length) return activeTaxonomy.map((item) => item.name);
    const rows = await db.select({ categories: maintenanceProfiles.categories })
      .from(maintenanceProfiles)
      .innerJoin(users, eq(maintenanceProfiles.userId, users.id))
      .where(and(
        eq(users.role, "MAINTENANCE" as any),
        eq(users.status, "approved"),
        eq(maintenanceProfiles.marketplaceVisible, true),
      ));
    return Array.from(new Set(rows.flatMap((row) => row.categories))).sort((a, b) => a.localeCompare(b));
  }

  async getMaintenanceProfile(userId: number): Promise<MaintenanceProfile> {
    const [profile] = await db.select().from(maintenanceProfiles)
      .where(eq(maintenanceProfiles.userId, userId));
    if (profile) return profile;
    const [created] = await db.insert(maintenanceProfiles).values({ userId }).returning();
    return created;
  }

  async upsertMaintenanceProfile(userId: number, updates: Partial<InsertMaintenanceProfile>): Promise<MaintenanceProfile> {
    const current = await this.getMaintenanceProfile(userId);
    const [updated] = await db.update(maintenanceProfiles)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(maintenanceProfiles.id, current.id))
      .returning();
    return updated;
  }

  async getMaintenanceReservationsForProvider(userId: number): Promise<(MaintenanceReservation & { cafeOwner: string; ownerPhone: string | null })[]> {
    const rows = await db.select({ reservation: maintenanceReservations, owner: users })
      .from(maintenanceReservations)
      .innerJoin(users, eq(maintenanceReservations.cafeOwnerId, users.id))
      .where(eq(maintenanceReservations.maintenanceUserId, userId))
      .orderBy(asc(maintenanceReservations.date), asc(maintenanceReservations.time));
    return rows.map(({ reservation, owner }) => ({
      ...reservation,
      cafeOwner: owner.name,
      ownerPhone: owner.phone ?? null,
    }));
  }

  async getMaintenanceReservationsForOwner(userId: number): Promise<(MaintenanceReservation & { maintenanceName: string })[]> {
    const rows = await db.select({ reservation: maintenanceReservations, provider: users })
      .from(maintenanceReservations)
      .innerJoin(users, eq(maintenanceReservations.maintenanceUserId, users.id))
      .where(eq(maintenanceReservations.cafeOwnerId, userId))
      .orderBy(asc(maintenanceReservations.date), asc(maintenanceReservations.time));
    return rows.map(({ reservation, provider }) => ({
      ...reservation,
      maintenanceName: provider.name,
    }));
  }

  async createMaintenanceReservation(data: InsertMaintenanceReservation): Promise<MaintenanceReservation> {
    const [created] = await db.insert(maintenanceReservations).values(data as any).returning();
    return created;
  }

  async updateMaintenanceReservationStatus(id: number, providerId: number, status: string, schedule?: { date?: string; time?: string | null }): Promise<MaintenanceReservation | undefined> {
    const [updated] = await db.update(maintenanceReservations)
      .set({ status, ...(schedule ?? {}), updatedAt: new Date() })
      .where(and(
        eq(maintenanceReservations.id, id),
        eq(maintenanceReservations.maintenanceUserId, providerId),
      ))
      .returning();
    return updated;
  }

  async requestMaintenanceReschedule(id: number, providerId: number, proposedDate: string, proposedTime: string | null): Promise<MaintenanceReservation | undefined> {
    const [updated] = await db.update(maintenanceReservations)
      .set({
        status: "RESCHEDULE_PENDING",
        proposedDate,
        proposedTime,
        updatedAt: new Date(),
      })
      .where(and(
        eq(maintenanceReservations.id, id),
        eq(maintenanceReservations.maintenanceUserId, providerId),
      ))
      .returning();
    return updated;
  }

  async respondToMaintenanceReschedule(id: number, ownerId: number, accepted: boolean): Promise<MaintenanceReservation | undefined> {
    const [reservation] = await db.select().from(maintenanceReservations)
      .where(and(
        eq(maintenanceReservations.id, id),
        eq(maintenanceReservations.cafeOwnerId, ownerId),
        eq(maintenanceReservations.status, "RESCHEDULE_PENDING"),
      ));
    if (!reservation) return undefined;

    const [updated] = await db.update(maintenanceReservations)
      .set({
        status: accepted ? "CONFIRMED" : "RESCHEDULE_REJECTED",
        ...(accepted && reservation.proposedDate
          ? { date: reservation.proposedDate, time: reservation.proposedTime }
          : {}),
        proposedDate: null,
        proposedTime: null,
        updatedAt: new Date(),
      })
      .where(eq(maintenanceReservations.id, id))
      .returning();
    return updated;
  }

  async getMaintenanceReviews(maintenanceUserId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.maintenanceUserId as any, maintenanceUserId),
        eq(supplierProductReviews.reviewType, "MAINTENANCE"),
      ))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async deleteMaintenanceReview(reviewId: number): Promise<boolean> {
    const [review] = await db.select({
      id: supplierProductReviews.id,
      maintenanceUserId: supplierProductReviews.maintenanceUserId,
    }).from(supplierProductReviews).where(and(
      eq(supplierProductReviews.id, reviewId),
      eq(supplierProductReviews.reviewType, "MAINTENANCE"),
    ));
    if (!review) return false;
    await db.delete(supplierProductReviews).where(eq(supplierProductReviews.id, reviewId));
    if (review.maintenanceUserId) await this.refreshMaintenanceReviewStats(review.maintenanceUserId);
    return true;
  }

  async getMaintenanceReviewForReservation(reservationId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    const [review] = await db.select().from(supplierProductReviews).where(and(
      eq(supplierProductReviews.reservationId as any, reservationId),
      eq(supplierProductReviews.cafeId, cafeId),
      eq(supplierProductReviews.reviewType, "MAINTENANCE"),
    ));
    return review;
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
    const existing = await this.getMaintenanceReviewForReservation(data.reservationId, data.cafeId);
    if (existing) {
      const [review] = await db.update(supplierProductReviews)
        .set({ rating: data.rating, comment: data.comment ?? null, updatedAt: new Date() } as any)
        .where(eq(supplierProductReviews.id, existing.id))
        .returning();
      await this.refreshMaintenanceReviewStats(data.maintenanceUserId);
      return { review, isUpdate: true };
    }
    const [review] = await db.insert(supplierProductReviews).values({
      reviewType: "MAINTENANCE",
      maintenanceUserId: data.maintenanceUserId,
      reservationId: data.reservationId,
      cafeId: data.cafeId,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      supplierId: null,
      productId: null,
      listingId: null,
      packId: null,
      productName: null,
    } as any).returning();
    await this.refreshMaintenanceReviewStats(data.maintenanceUserId);
    return { review, isUpdate: false };
  }

  private async refreshMaintenanceReviewStats(maintenanceUserId: number): Promise<void> {
    const reviews = await this.getMaintenanceReviews(maintenanceUserId);
    const reviewCount = reviews.length;
    const rating = reviewCount
      ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount) * 10)
      : 0;
    await db.update(maintenanceProfiles)
      .set({ rating, reviewCount, updatedAt: new Date() })
      .where(eq(maintenanceProfiles.userId, maintenanceUserId));
  }

  private async seedMaintenanceTaxonomyIfEmpty(): Promise<void> {
    const [competencyCount] = await db.select({ count: sql<number>`count(*)::int` }).from(maintenanceCompetencies);
    if (!competencyCount || competencyCount.count === 0) {
      const rows = await db.select({ categories: maintenanceProfiles.categories }).from(maintenanceProfiles);
      const names = Array.from(new Set(rows.flatMap((row) => row.categories ?? []).map((name) => name.trim()).filter(Boolean)));
      if (names.length) await db.insert(maintenanceCompetencies).values(names.map((name) => ({ name }))).onConflictDoNothing();
    }
    const [zoneCount] = await db.select({ count: sql<number>`count(*)::int` }).from(maintenanceZones);
    if (!zoneCount || zoneCount.count === 0) {
      const rows = await db.select({ coverageArea: maintenanceProfiles.coverageArea }).from(maintenanceProfiles);
      const names = Array.from(new Set(rows.flatMap((row) => (row.coverageArea ?? "").split(",")).map((name) => name.trim()).filter(Boolean)));
      if (names.length) await db.insert(maintenanceZones).values(names.map((name) => ({ name }))).onConflictDoNothing();
    }
  }

  async getMaintenanceTaxonomy(): Promise<{ competencies: MaintenanceCompetency[]; zones: MaintenanceZone[] }> {
    await this.seedMaintenanceTaxonomyIfEmpty();
    const [competencies, zones] = await Promise.all([
      db.select().from(maintenanceCompetencies).orderBy(asc(maintenanceCompetencies.name)),
      db.select().from(maintenanceZones).orderBy(asc(maintenanceZones.name)),
    ]);
    return { competencies, zones };
  }

  async getAvailableMaintenanceTaxonomy(): Promise<{ competencies: MaintenanceCompetency[]; zones: MaintenanceZone[] }> {
    const taxonomy = await this.getMaintenanceTaxonomy();
    return {
      competencies: taxonomy.competencies.filter((item) => item.isActive && !item.isFrozen),
      zones: taxonomy.zones.filter((item) => item.isActive && !item.isFrozen),
    };
  }

  async createMaintenanceCompetency(name: string): Promise<MaintenanceCompetency> {
    const [created] = await db.insert(maintenanceCompetencies).values({ name: name.trim() }).returning();
    return created;
  }

  async updateMaintenanceCompetency(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<MaintenanceCompetency | undefined> {
    const [updated] = await db.update(maintenanceCompetencies)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), updatedAt: new Date() })
      .where(eq(maintenanceCompetencies.id, id)).returning();
    return updated;
  }

  async deleteMaintenanceCompetency(id: number): Promise<void> {
    await db.delete(maintenanceCompetencies).where(eq(maintenanceCompetencies.id, id));
  }

  async createMaintenanceZone(name: string): Promise<MaintenanceZone> {
    const [created] = await db.insert(maintenanceZones).values({ name: name.trim() }).returning();
    return created;
  }

  async updateMaintenanceZone(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<MaintenanceZone | undefined> {
    const [updated] = await db.update(maintenanceZones)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), updatedAt: new Date() })
      .where(eq(maintenanceZones.id, id)).returning();
    return updated;
  }

  async deleteMaintenanceZone(id: number): Promise<void> {
    await db.delete(maintenanceZones).where(eq(maintenanceZones.id, id));
  }

  async getMaintenanceAdminOverview(): Promise<any> {
    const taxonomy = await this.getMaintenanceTaxonomy();
    const accounts = await db.select({ profile: maintenanceProfiles, user: users })
      .from(maintenanceProfiles)
      .innerJoin(users, eq(maintenanceProfiles.userId, users.id))
      .where(eq(users.role, "MAINTENANCE" as any));
    const reservations = await db.select().from(maintenanceReservations);
    const reviews = await db.select().from(supplierProductReviews)
      .where(eq(supplierProductReviews.reviewType, "MAINTENANCE"));
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((user) => [user.id, user]));
    const categoryCounts = new Map<string, number>();
    for (const row of accounts) for (const category of row.profile.categories) {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    }
    const averageRating = reviews.length ? reviews.reduce((sum, row) => sum + row.rating, 0) / reviews.length : 0;
    return {
      stats: {
        totalAccounts: accounts.length,
        activeAccounts: accounts.filter(({ user }) => user.status === "approved").length,
        availableAccounts: accounts.filter(({ user, profile }) => user.status === "approved" && profile.isAvailable && !profile.isOnVacation).length,
        totalReservations: reservations.length,
        pendingReservations: reservations.filter((row) => row.status === "PENDING").length,
        completedReservations: reservations.filter((row) => row.status === "COMPLETED").length,
        cancelledReservations: reservations.filter((row) => row.status === "CANCELLED").length,
        reviewCount: reviews.length,
        averageRating,
      },
      categories: Array.from(categoryCounts, ([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
      taxonomy,
      accounts: accounts.map(({ profile, user }) => ({
        ...profile,
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImageUrl: user.profileImageUrl,
        status: user.status,
        location: user.locationAddress ?? profile.coverageArea,
        available: profile.isAvailable && !profile.isOnVacation,
        initials: user.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      })),
      reservations: reservations
        .map((reservation) => ({
          ...reservation,
          maintenanceName: userMap.get(reservation.maintenanceUserId)?.name ?? "—",
          cafeOwner: userMap.get(reservation.cafeOwnerId)?.name ?? "—",
          ownerPhone: userMap.get(reservation.cafeOwnerId)?.phone ?? null,
        }))
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)),
      reviews: reviews.map((review) => ({
        ...review,
        maintenanceName: userMap.get(review.maintenanceUserId ?? 0)?.name ?? "—",
        reviewerName: userMap.get(review.cafeId)?.name ?? review.cafeName,
      })),
    };
  }

  async getMaintenanceFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select({ maintenanceUserId: maintenanceFavorites.maintenanceUserId })
      .from(maintenanceFavorites)
      .where(eq(maintenanceFavorites.userId, userId));
    return rows.map((row) => row.maintenanceUserId);
  }

  async addMaintenanceFavorite(userId: number, maintenanceUserId: number): Promise<void> {
    const [existing] = await db.select().from(maintenanceFavorites).where(and(
      eq(maintenanceFavorites.userId, userId),
      eq(maintenanceFavorites.maintenanceUserId, maintenanceUserId),
    ));
    if (!existing) await db.insert(maintenanceFavorites).values({ userId, maintenanceUserId });
  }

  async removeMaintenanceFavorite(userId: number, maintenanceUserId: number): Promise<void> {
    await db.delete(maintenanceFavorites).where(and(
      eq(maintenanceFavorites.userId, userId),
      eq(maintenanceFavorites.maintenanceUserId, maintenanceUserId),
    ));
  }

  // ── PRINT ────────────────────────────────────────────────────────────────────
  // See shared/schema.ts printCatalogItems/printOrders for the architecture note.
  // Every catalog-item and order mutation is scoped in the WHERE clause itself
  // (ownership-in-WHERE pattern, mirroring Maintenance) rather than a separate
  // pre-check, so a Printer can never affect another Printer's rows even if a
  // route bug ever skipped the role/ownership check upstream.

  private async computePrintReviewStats(printerIds: number[]): Promise<Map<number, { rating: number; reviewCount: number }>> {
    const stats = new Map<number, { rating: number; reviewCount: number }>();
    if (printerIds.length === 0) return stats;
    const rows = await db.select({ printerId: supplierProductReviews.printerId, rating: supplierProductReviews.rating })
      .from(supplierProductReviews)
      .where(and(eq(supplierProductReviews.reviewType, "PRINT"), inArray(supplierProductReviews.printerId as any, printerIds)));
    const agg = new Map<number, { sum: number; count: number }>();
    for (const row of rows) {
      if (!row.printerId) continue;
      const cur = agg.get(row.printerId) ?? { sum: 0, count: 0 };
      cur.sum += row.rating; cur.count += 1;
      agg.set(row.printerId, cur);
    }
    for (const [printerId, { sum, count }] of Array.from(agg)) {
      stats.set(printerId, { rating: Math.round((sum / count) * 10), reviewCount: count });
    }
    return stats;
  }

  async getPrintCatalogForPrinter(printerId: number): Promise<PrintCatalogItem[]> {
    return db.select().from(printCatalogItems)
      .where(eq(printCatalogItems.printerId, printerId))
      .orderBy(desc(printCatalogItems.createdAt));
  }

  async createPrintCatalogItem(printerId: number, data: Partial<InsertPrintCatalogItem>): Promise<PrintCatalogItem> {
    const [created] = await db.insert(printCatalogItems).values({ ...data, printerId } as any).returning();
    return created;
  }

  async updatePrintCatalogItem(id: number, printerId: number, updates: Partial<InsertPrintCatalogItem>): Promise<PrintCatalogItem | undefined> {
    const safeUpdates = { ...updates };
    delete (safeUpdates as any).printerId; // ownership is fixed at creation, never client-reassignable
    const [updated] = await db.update(printCatalogItems)
      .set({ ...safeUpdates, updatedAt: new Date() } as any)
      .where(and(eq(printCatalogItems.id, id), eq(printCatalogItems.printerId, printerId)))
      .returning();
    return updated;
  }

  async deletePrintCatalogItem(id: number, printerId: number): Promise<boolean> {
    const deleted = await db.delete(printCatalogItems)
      .where(and(eq(printCatalogItems.id, id), eq(printCatalogItems.printerId, printerId)))
      .returning();
    return deleted.length > 0;
  }

  async getPrintMarketplaceCards(filters?: { search?: string; category?: string; printerId?: number }): Promise<PrintCatalogCard[]> {
    const rows = await db.select({ item: printCatalogItems, printer: users })
      .from(printCatalogItems)
      .innerJoin(users, eq(printCatalogItems.printerId, users.id))
      .where(and(
        eq(printCatalogItems.isActive, true),
        eq(users.role, "PRINTER" as any),
        eq(users.status, "approved"),
        ...(filters?.printerId ? [eq(printCatalogItems.printerId, filters.printerId)] : []),
      ));

    const printerIds = Array.from(new Set(rows.map((r) => r.printer.id)));
    const statsMap = await this.computePrintReviewStats(printerIds);

    const cards = rows.map(({ item, printer }) => {
      const stats = statsMap.get(printer.id);
      return {
        ...item,
        printerName: printer.name,
        printerPhone: printer.phone ?? null,
        printerImageUrl: printer.profileImageUrl ?? null,
        printerLocation: printer.locationAddress ?? "",
        rating: stats?.rating ?? 0,
        reviewCount: stats?.reviewCount ?? 0,
      } as PrintCatalogCard;
    });

    const query = filters?.search?.trim().toLowerCase();
    return cards.filter((card) => {
      if (query) {
        const haystack = [card.name, card.description, card.category, card.subCategory, card.printerName].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filters?.category && card.category.toLowerCase() !== filters.category.toLowerCase()) return false;
      return true;
    });
  }

  /** Single-item detail for the Coffee Owner's PRINT product-detail page. Only
   *  active items from approved printers are visible here — same visibility
   *  rule as getPrintMarketplaceCards, just narrowed to one id. */
  async getPrintMarketplaceCard(id: number): Promise<PrintCatalogCard | undefined> {
    const [row] = await db.select({ item: printCatalogItems, printer: users })
      .from(printCatalogItems)
      .innerJoin(users, eq(printCatalogItems.printerId, users.id))
      .where(and(
        eq(printCatalogItems.id, id),
        eq(printCatalogItems.isActive, true),
        eq(users.role, "PRINTER" as any),
        eq(users.status, "approved"),
      ));
    if (!row) return undefined;
    const stats = (await this.computePrintReviewStats([row.printer.id])).get(row.printer.id);
    return {
      ...row.item,
      printerName: row.printer.name,
      printerPhone: row.printer.phone ?? null,
      printerImageUrl: row.printer.profileImageUrl ?? null,
      printerLocation: row.printer.locationAddress ?? "",
      rating: stats?.rating ?? 0,
      reviewCount: stats?.reviewCount ?? 0,
    };
  }

  /** IMPORTANT DISTINCTION (do not "fix" this back to taxonomy-first — that was
   *  tried and deliberately reverted): Admin taxonomy *availability* is a
   *  different concept from marketplace *visibility*. A category can be active
   *  in printCategoryTaxonomy (so Printers can map/use it) without ever
   *  appearing on /print, if no approved Printer currently has an active
   *  catalog item using it. This must stay a pure derivation from real active
   *  marketplace data — never taxonomy-first — so /print never shows an empty
   *  category. The taxonomy itself is exposed separately via getPrintTaxonomy()
   *  for Admin's and the Printer's own category-mapping UIs. */
  async getPrintCategories(): Promise<string[]> {
    const rows = await db.select({ category: printCatalogItems.category })
      .from(printCatalogItems)
      .innerJoin(users, eq(printCatalogItems.printerId, users.id))
      .where(and(
        eq(printCatalogItems.isActive, true),
        eq(users.role, "PRINTER" as any),
        eq(users.status, "approved"),
      ));
    return Array.from(new Set(rows.map((r) => r.category).filter((c) => c.trim().length > 0))).sort((a, b) => a.localeCompare(b));
  }

  /** Same "derived from actually-used active marketplace data" rule as
   *  getPrintCategories() — see the note above. */
  async getPrintSubCategories(): Promise<string[]> {
    const rows = await db.select({ subCategory: printCatalogItems.subCategory })
      .from(printCatalogItems)
      .innerJoin(users, eq(printCatalogItems.printerId, users.id))
      .where(and(
        eq(printCatalogItems.isActive, true),
        eq(users.role, "PRINTER" as any),
        eq(users.status, "approved"),
      ));
    return Array.from(new Set(rows.map((r) => r.subCategory).filter((c) => c.trim().length > 0))).sort((a, b) => a.localeCompare(b));
  }

  async getPrintOrdersForPrinter(printerId: number): Promise<PrintOrderWithParties[]> {
    const rows = await db.select({ order: printOrders, owner: users })
      .from(printOrders)
      .innerJoin(users, eq(printOrders.cafeOwnerId, users.id))
      .where(eq(printOrders.printerId, printerId))
      .orderBy(desc(printOrders.createdAt));
    return rows.map(({ order, owner }) => ({ ...order, printerName: "", cafeOwnerName: owner.name }));
  }

  async getPrintOrdersForOwner(ownerId: number): Promise<PrintOrderWithParties[]> {
    const rows = await db.select({ order: printOrders, printer: users })
      .from(printOrders)
      .innerJoin(users, eq(printOrders.printerId, users.id))
      .where(eq(printOrders.cafeOwnerId, ownerId))
      .orderBy(desc(printOrders.createdAt));
    return rows.map(({ order, printer }) => ({ ...order, printerName: printer.name, cafeOwnerName: "" }));
  }

  /** Snapshots the catalog item's current name/price onto the order so a later
   *  catalog edit (or deletion) never rewrites an already-placed order's price —
   *  see the architecture note on printOrders in shared/schema.ts. */
  async createPrintOrder(cafeOwnerId: number, data: { catalogItemId: number; quantity: number; notes?: string; deliveryAddress?: string; contactPhone?: string }): Promise<PrintOrder> {
    const [item] = await db.select().from(printCatalogItems).where(eq(printCatalogItems.id, data.catalogItemId));
    if (!item || !item.isActive) throw new Error("This print service is no longer available.");
    const quantity = Math.max(1, Math.floor(data.quantity));
    if (quantity < item.minQuantity) throw new Error(`Minimum quantity for this service is ${item.minQuantity}.`);
    const [created] = await db.insert(printOrders).values({
      printerId: item.printerId,
      cafeOwnerId,
      catalogItemId: item.id,
      itemName: item.name,
      unitPriceInCents: item.priceInCents,
      quantity,
      totalInCents: item.priceInCents * quantity,
      status: "PENDING",
      notes: data.notes ?? "",
      deliveryAddress: data.deliveryAddress ?? null,
      contactPhone: data.contactPhone ?? "",
    } as any).returning();
    return created;
  }

  async updatePrintOrderStatus(id: number, printerId: number, status: string): Promise<PrintOrder | undefined> {
    const [updated] = await db.update(printOrders)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(printOrders.id, id), eq(printOrders.printerId, printerId)))
      .returning();
    return updated;
  }

  async getPrintRevenueSummary(printerId: number): Promise<{
    totalEarnedCents: number; completedOrders: number;
    currentMonthCents: number; currentMonthOrders: number;
    history: { month: string; totalCents: number; orders: number }[];
  }> {
    const completed = await db.select().from(printOrders).where(and(
      eq(printOrders.printerId, printerId),
      eq(printOrders.status, "DELIVERED"),
    ));
    const now = new Date();
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const currentMonthKey = monthKey(now);

    const byMonth = new Map<string, { totalCents: number; orders: number }>();
    let currentMonthCents = 0;
    let currentMonthOrders = 0;
    for (const o of completed) {
      const completedAt = o.updatedAt ?? o.createdAt ?? now;
      const key = monthKey(new Date(completedAt));
      const bucket = byMonth.get(key) ?? { totalCents: 0, orders: 0 };
      bucket.totalCents += o.totalInCents;
      bucket.orders += 1;
      byMonth.set(key, bucket);
      if (key === currentMonthKey) { currentMonthCents += o.totalInCents; currentMonthOrders += 1; }
    }

    const history: { month: string; totalCents: number; orders: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      const bucket = byMonth.get(key);
      history.push({ month: key, totalCents: bucket?.totalCents ?? 0, orders: bucket?.orders ?? 0 });
    }

    return {
      totalEarnedCents: completed.reduce((s, o) => s + o.totalInCents, 0),
      completedOrders: completed.length,
      currentMonthCents,
      currentMonthOrders,
      history,
    };
  }

  // ── PRINT admin ──────────────────────────────────────────────────────────────
  // Mirrors maintenanceCompetencies' taxonomy-management pattern (see above):
  // auto-seeded once from whatever category text already exists on catalog
  // items, then admin-managed independently; hard delete, no referential guard
  // (printCatalogItems.category stays plain text, matching maintenanceProfiles'
  // convention, so a renamed/deleted taxonomy entry never corrupts history).

  private async seedPrintCategoryTaxonomyIfEmpty(): Promise<void> {
    const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(printCategoryTaxonomy);
    if (count && count.count > 0) return;
    const rows = await db.select({ category: printCatalogItems.category }).from(printCatalogItems);
    const names = Array.from(new Set(rows.map((r) => r.category.trim()).filter(Boolean)));
    if (names.length) await db.insert(printCategoryTaxonomy).values(names.map((name) => ({ name }))).onConflictDoNothing();
  }

  async getPrintCategoryTaxonomy(): Promise<PrintCategoryTaxonomy[]> {
    await this.seedPrintCategoryTaxonomyIfEmpty();
    return db.select().from(printCategoryTaxonomy).orderBy(asc(printCategoryTaxonomy.name));
  }

  async createPrintCategory(name: string): Promise<PrintCategoryTaxonomy> {
    const [created] = await db.insert(printCategoryTaxonomy).values({ name: name.trim() }).returning();
    return created;
  }

  async updatePrintCategory(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<PrintCategoryTaxonomy | undefined> {
    const [updated] = await db.update(printCategoryTaxonomy)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), updatedAt: new Date() })
      .where(eq(printCategoryTaxonomy.id, id)).returning();
    return updated;
  }

  async deletePrintCategory(id: number): Promise<void> {
    await db.delete(printCategoryTaxonomy).where(eq(printCategoryTaxonomy.id, id));
  }

  async getPrintSubCategoryTaxonomy(categoryId?: number): Promise<PrintSubCategoryTaxonomy[]> {
    const rows = await db.select().from(printSubCategoryTaxonomy)
      .where(categoryId !== undefined ? eq(printSubCategoryTaxonomy.categoryId, categoryId) : undefined)
      .orderBy(asc(printSubCategoryTaxonomy.name));
    return rows;
  }

  async createPrintSubCategory(categoryId: number, name: string): Promise<PrintSubCategoryTaxonomy> {
    const [created] = await db.insert(printSubCategoryTaxonomy).values({ categoryId, name: name.trim() }).returning();
    return created;
  }

  async updatePrintSubCategory(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<PrintSubCategoryTaxonomy | undefined> {
    const [updated] = await db.update(printSubCategoryTaxonomy)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), updatedAt: new Date() })
      .where(eq(printSubCategoryTaxonomy.id, id)).returning();
    return updated;
  }

  async deletePrintSubCategory(id: number): Promise<void> {
    await db.delete(printSubCategoryTaxonomy).where(eq(printSubCategoryTaxonomy.id, id));
  }

  /** The Printer's own account (users.printCategories/printSubCategories) is
   *  reused as the mapping store — it already existed for an admin-set-approval
   *  purpose (see admin/users-page.tsx), which this doesn't remove; a Printer
   *  self-selecting from the same taxonomy via this method just becomes the
   *  additional, primary way that array gets populated going forward. */
  async getPrinterCategoryMapping(printerId: number): Promise<{ categories: string[]; subCategories: string[] }> {
    const [row] = await db.select({ categories: users.printCategories, subCategories: users.printSubCategories })
      .from(users).where(eq(users.id, printerId));
    return { categories: row?.categories ?? [], subCategories: row?.subCategories ?? [] };
  }

  /** Validates every submitted name against the ACTIVE admin taxonomy (a
   *  Printer can never map an inactive/frozen or nonexistent category), and
   *  every subcategory against both the active taxonomy AND its declared
   *  parent category being one of the categories being mapped in the same
   *  call — silently drops anything invalid rather than erroring, and reports
   *  what was dropped so the route layer can surface it. */
  async setPrinterCategoryMapping(printerId: number, mapping: { categories: string[]; subCategories: string[] }): Promise<{ categories: string[]; subCategories: string[]; rejected: { categories: string[]; subCategories: string[] } }> {
    const [categoryTaxonomy, subCategoryTaxonomy] = await Promise.all([
      this.getPrintCategoryTaxonomy(),
      this.getPrintSubCategoryTaxonomy(),
    ]);
    const activeCategoryNames = new Set(categoryTaxonomy.filter((c) => c.isActive && !c.isFrozen).map((c) => c.name));
    const categoryByName = new Map(categoryTaxonomy.map((c) => [c.name, c] as const));

    const acceptedCategories = mapping.categories.filter((name) => activeCategoryNames.has(name));
    const rejectedCategories = mapping.categories.filter((name) => !activeCategoryNames.has(name));
    const acceptedCategorySet = new Set(acceptedCategories);

    const acceptedSubCategories = mapping.subCategories.filter((name) => {
      const sub = subCategoryTaxonomy.find((s) => s.name === name && s.isActive && !s.isFrozen);
      if (!sub) return false;
      const parent = Array.from(categoryByName.values()).find((c) => c.id === sub.categoryId);
      return !!parent && acceptedCategorySet.has(parent.name);
    });
    const rejectedSubCategories = mapping.subCategories.filter((name) => !acceptedSubCategories.includes(name));

    await db.update(users)
      .set({ printCategories: acceptedCategories, printSubCategories: acceptedSubCategories })
      .where(eq(users.id, printerId));

    return {
      categories: acceptedCategories,
      subCategories: acceptedSubCategories,
      rejected: { categories: rejectedCategories, subCategories: rejectedSubCategories },
    };
  }

  async getPrintReviews(printerId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(eq(supplierProductReviews.reviewType, "PRINT"), eq(supplierProductReviews.printerId as any, printerId)))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async getPrintReviewForOrder(orderId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    const [row] = await db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.reviewType, "PRINT"),
        eq(supplierProductReviews.printOrderId as any, orderId),
        eq(supplierProductReviews.cafeId, cafeId),
      ));
    return row;
  }

  /** Upsert keyed on (printOrderId, cafeId) — mirrors upsertMaintenanceReview
   *  exactly (re-submitting for the same order updates rather than
   *  duplicates). No denormalized rating column to refresh here: PRINT has no
   *  per-printer profile row (unlike maintenanceProfiles) — getPrintMarketplaceCards/
   *  getPrintAdminOverview already compute rating/reviewCount live from this
   *  same table on every read via computePrintReviewStats, so there is nothing
   *  to keep in sync — the live computation IS the source of truth. */
  async upsertPrintReview(data: { printerId: number; printOrderId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    const existing = await this.getPrintReviewForOrder(data.printOrderId, data.cafeId);
    if (existing) {
      const [updated] = await db.update(supplierProductReviews)
        .set({ rating: data.rating, comment: data.comment ?? null, updatedAt: new Date() })
        .where(eq(supplierProductReviews.id, existing.id)).returning();
      return { review: updated, isUpdate: true };
    }
    const [created] = await db.insert(supplierProductReviews).values({
      reviewType: "PRINT",
      cafeId: data.cafeId,
      printerId: data.printerId,
      printOrderId: data.printOrderId,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
    } as any).returning();
    return { review: created, isUpdate: false };
  }

  /** Admin moderation — toggle any printer's catalog item, no ownership check.
   *  Deliberately narrower than the printer's own updatePrintCatalogItem: Admin
   *  moderates visibility, it doesn't edit another business's catalog content. */
  async adminSetPrintCatalogItemActive(id: number, isActive: boolean): Promise<PrintCatalogItem | undefined> {
    const [updated] = await db.update(printCatalogItems)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(printCatalogItems.id, id))
      .returning();
    return updated;
  }

  async getPrintAdminOverview(): Promise<any> {
    const taxonomy = await this.getPrintCategoryTaxonomy();
    const subcategoryTaxonomy = await this.getPrintSubCategoryTaxonomy();
    const printerRows = await db.select().from(users).where(eq(users.role, "PRINTER" as any));
    const catalogRows = await db.select().from(printCatalogItems);
    const orderRows = await db.select().from(printOrders);
    const reviewRows = await db.select().from(supplierProductReviews).where(eq(supplierProductReviews.reviewType, "PRINT"));
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const categoryCounts = new Map<string, number>();
    for (const item of catalogRows) if (item.category.trim()) {
      categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
    }

    const reviewStats = new Map<number, { sum: number; count: number }>();
    for (const r of reviewRows) {
      if (!r.printerId) continue;
      const cur = reviewStats.get(r.printerId) ?? { sum: 0, count: 0 };
      cur.sum += r.rating; cur.count += 1;
      reviewStats.set(r.printerId, cur);
    }

    const printers = printerRows.map((printer) => {
      const items = catalogRows.filter((i) => i.printerId === printer.id);
      const orders = orderRows.filter((o) => o.printerId === printer.id);
      const revenueCents = orders.filter((o) => o.status === "DELIVERED").reduce((s, o) => s + o.totalInCents, 0);
      const stats = reviewStats.get(printer.id);
      return {
        userId: printer.id,
        name: printer.name,
        email: printer.email,
        phone: printer.phone,
        profileImageUrl: printer.profileImageUrl,
        status: printer.status,
        location: printer.locationAddress ?? "",
        createdAt: printer.createdAt,
        activeServiceCount: items.filter((i) => i.isActive).length,
        totalServiceCount: items.length,
        totalOrders: orders.length,
        revenueCents,
        rating: stats ? Math.round((stats.sum / stats.count) * 10) : 0,
        reviewCount: stats?.count ?? 0,
        initials: printer.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
      };
    });

    const orders = orderRows
      .slice()
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .map((o) => ({
        ...o,
        printerName: userMap.get(o.printerId)?.name ?? "—",
        cafeOwnerName: userMap.get(o.cafeOwnerId)?.name ?? "—",
      }));

    const reviews = reviewRows.map((r) => ({
      ...r,
      printerName: r.printerId ? (userMap.get(r.printerId)?.name ?? "—") : "—",
    }));

    const catalogItems = catalogRows
      .slice()
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .map((item) => ({ ...item, printerName: userMap.get(item.printerId)?.name ?? "—" }));

    const deliveredOrders = orderRows.filter((o) => o.status === "DELIVERED");
    const totalRevenueCents = deliveredOrders.reduce((s, o) => s + o.totalInCents, 0);
    const totalReviewRating = reviewRows.reduce((s, r) => s + r.rating, 0);

    return {
      stats: {
        totalPrinters: printerRows.length,
        activePrinters: printerRows.filter((p) => p.status === "approved").length,
        availablePrinters: printers.filter((p) => p.activeServiceCount > 0).length,
        totalServices: catalogRows.length,
        activeServices: catalogRows.filter((i) => i.isActive).length,
        totalOrders: orderRows.length,
        pendingOrders: orderRows.filter((o) => o.status === "PENDING").length,
        inProductionOrders: orderRows.filter((o) => o.status === "PREPARING").length,
        completedOrders: deliveredOrders.length,
        cancelledOrders: orderRows.filter((o) => o.status === "CANCELLED").length,
        totalRevenueCents,
        reviewCount: reviewRows.length,
        averageRating: reviewRows.length ? Math.round((totalReviewRating / reviewRows.length) * 10) / 10 : 0,
      },
      categories: Array.from(categoryCounts, ([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
      taxonomy,
      subcategoryTaxonomy,
      printers,
      catalogItems,
      orders,
      reviews,
    };
  }

  // ── Barista Marketplace ──────────────────────────────────────────────────────
  // Mirrors the Maintenance section above field-for-field: a public profile,
  // request lifecycle, mission derived from an accepted request, and reviews
  // reusing supplierProductReviews (reviewType='BARISTA_MARKETPLACE') exactly
  // like Maintenance did with 'MAINTENANCE'. Rating/reviewCount are always
  // computed live from reviews (never a stored aggregate) — see
  // BARISTA_MARKETPLACE_IMPLEMENTATION_REPORT.md for the reasoning.

  // ── Skills taxonomy ──
  async getBaristaSkills(activeOnly = false): Promise<BaristaSkill[]> {
    const rows = await db.select().from(baristaSkills).orderBy(asc(baristaSkills.name));
    return activeOnly ? rows.filter((s) => s.isActive && !s.isFrozen) : rows;
  }

  async createBaristaSkill(name: string): Promise<BaristaSkill> {
    const [created] = await db.insert(baristaSkills).values({ name: name.trim() }).returning();
    return created;
  }

  async updateBaristaSkill(id: number, data: { name?: string; isActive?: boolean; isFrozen?: boolean }): Promise<BaristaSkill | undefined> {
    const [updated] = await db.update(baristaSkills)
      .set({ ...data, ...(data.name ? { name: data.name.trim() } : {}), updatedAt: new Date() })
      .where(eq(baristaSkills.id, id)).returning();
    return updated;
  }

  async deleteBaristaSkill(id: number): Promise<void> {
    await db.delete(baristaSkills).where(eq(baristaSkills.id, id));
  }

  // ── Profile ──
  async getBaristaMarketplaceProfile(userId: number): Promise<BaristaMarketplaceProfile> {
    const [profile] = await db.select().from(baristaMarketplaceProfiles).where(eq(baristaMarketplaceProfiles.userId, userId));
    if (profile) return profile;
    const [created] = await db.insert(baristaMarketplaceProfiles).values({ userId }).onConflictDoNothing().returning();
    if (created) return created;
    // Lost a create race — re-read.
    const [existing] = await db.select().from(baristaMarketplaceProfiles).where(eq(baristaMarketplaceProfiles.userId, userId));
    return existing!;
  }

  async upsertBaristaMarketplaceProfile(userId: number, updates: Partial<InsertBaristaMarketplaceProfile>): Promise<BaristaMarketplaceProfile> {
    const current = await this.getBaristaMarketplaceProfile(userId);
    const [updated] = await db.update(baristaMarketplaceProfiles)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(baristaMarketplaceProfiles.id, current.id))
      .returning();
    return updated;
  }

  /** Live rating/reviewCount for one Barista — shared by the list builder and single-card reads. */
  private async computeBaristaReviewStats(baristaUserIds: number[]): Promise<Map<number, { rating: number; reviewCount: number }>> {
    if (!baristaUserIds.length) return new Map();
    const reviewRows = await db.select({
      baristaMarketplaceUserId: supplierProductReviews.baristaMarketplaceUserId,
      rating: supplierProductReviews.rating,
    }).from(supplierProductReviews).where(and(
      eq(supplierProductReviews.reviewType, "BARISTA_MARKETPLACE"),
      inArray(supplierProductReviews.baristaMarketplaceUserId as any, baristaUserIds),
    ));
    const sums = new Map<number, { total: number; sum: number }>();
    for (const row of reviewRows) {
      if (!row.baristaMarketplaceUserId) continue;
      const current = sums.get(row.baristaMarketplaceUserId) ?? { total: 0, sum: 0 };
      current.total += 1;
      current.sum += row.rating;
      sums.set(row.baristaMarketplaceUserId, current);
    }
    const result = new Map<number, { rating: number; reviewCount: number }>();
    for (const [userId, stats] of Array.from(sums.entries())) {
      result.set(userId, { rating: Math.round((stats.sum / stats.total) * 10), reviewCount: stats.total });
    }
    return result;
  }

  /** Public marketplace listing — mirrors getMaintenanceProfiles() exactly. */
  async getBaristaMarketplaceProfiles(filters?: {
    search?: string; level?: string; skill?: string; city?: string; available?: boolean;
  }): Promise<BaristaMarketplaceCard[]> {
    const rows = await db.select({ profile: baristaMarketplaceProfiles, user: users })
      .from(baristaMarketplaceProfiles)
      .innerJoin(users, eq(baristaMarketplaceProfiles.userId, users.id))
      .where(and(
        eq(users.role, "BARISTA_MARKETPLACE" as any),
        eq(users.status, "approved"),
        eq(baristaMarketplaceProfiles.marketplaceVisible, true),
      ));

    const userIds = rows.map(({ profile }) => profile.userId);
    const statsMap = await this.computeBaristaReviewStats(userIds);

    // "Available" on the public list means: not manually toggled off, not on vacation,
    // and not mid-mission right now (today falls within an ACTIVE mission's date range).
    // Fine-grained "are you free for MY specific dates" is checked server-side at request
    // creation/acceptance time (see createBaristaRequest/acceptBaristaRequest), not here.
    const todayStr = new Date().toISOString().slice(0, 10);
    const activeMissions = userIds.length
      ? await db.select({ baristaUserId: baristaMarketplaceMissions.baristaUserId, startDate: baristaMarketplaceMissions.startDate, endDate: baristaMarketplaceMissions.endDate })
        .from(baristaMarketplaceMissions)
        .where(and(
          inArray(baristaMarketplaceMissions.baristaUserId, userIds),
          eq(baristaMarketplaceMissions.status, "ACTIVE"),
        ))
      : [];
    const busyToday = new Set(
      activeMissions.filter((m) => m.startDate <= todayStr && (m.endDate ?? m.startDate) >= todayStr).map((m) => m.baristaUserId),
    );

    const cards = rows.map(({ profile, user }) => {
      const stats = statsMap.get(profile.userId);
      const available = profile.isAvailable && !profile.isOnVacation && !busyToday.has(profile.userId);
      return {
        ...profile,
        userId: user.id,
        name: user.name,
        phone: user.phone ?? null,
        profileImageUrl: user.profileImageUrl ?? null,
        initials: user.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
        location: user.locationAddress ?? profile.city ?? "",
        available,
        rating: stats?.rating ?? 0,
        reviewCount: stats?.reviewCount ?? 0,
      } as BaristaMarketplaceCard;
    });

    const query = filters?.search?.trim().toLowerCase();
    return cards.filter((card) => {
      if (query) {
        const haystack = [card.name, card.bio, card.location, card.skills.join(" ")].join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filters?.level && card.level !== filters.level) return false;
      if (filters?.skill && !card.skills.some((s) => s.toLowerCase() === filters.skill!.toLowerCase())) return false;
      if (filters?.city && card.location.toLowerCase() !== filters.city.toLowerCase()) return false;
      if (filters?.available !== undefined && card.available !== filters.available) return false;
      return true;
    });
  }

  async getBaristaMarketplaceCard(userId: number): Promise<BaristaMarketplaceCard | undefined> {
    const [row] = await db.select({ profile: baristaMarketplaceProfiles, user: users })
      .from(baristaMarketplaceProfiles)
      .innerJoin(users, eq(baristaMarketplaceProfiles.userId, users.id))
      .where(eq(baristaMarketplaceProfiles.userId, userId));
    if (!row) return undefined;
    const stats = (await this.computeBaristaReviewStats([userId])).get(userId);
    return {
      ...row.profile,
      userId: row.user.id,
      name: row.user.name,
      phone: row.user.phone ?? null,
      profileImageUrl: row.user.profileImageUrl ?? null,
      initials: row.user.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      location: row.user.locationAddress ?? row.profile.city ?? "",
      available: row.profile.isAvailable && !row.profile.isOnVacation,
      rating: stats?.rating ?? 0,
      reviewCount: stats?.reviewCount ?? 0,
    };
  }

  // ── Requests ──
  private attachRequestParties(rows: BaristaMarketplaceRequest[], userMap: Map<number, User>): BaristaRequestWithParties[] {
    return rows.map((r) => ({
      ...r,
      cafeOwnerName: userMap.get(r.cafeOwnerId)?.name ?? "—",
      cafeOwnerPhone: userMap.get(r.cafeOwnerId)?.phone ?? null,
      baristaName: userMap.get(r.baristaUserId)?.name ?? "—",
      baristaPhone: userMap.get(r.baristaUserId)?.phone ?? null,
    }));
  }

  async getBaristaRequestsForBarista(userId: number): Promise<BaristaRequestWithParties[]> {
    const rows = await db.select().from(baristaMarketplaceRequests)
      .where(eq(baristaMarketplaceRequests.baristaUserId, userId))
      .orderBy(desc(baristaMarketplaceRequests.createdAt));
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.cafeOwnerId, r.baristaUserId])));
    const userMap = new Map((await db.select().from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u]));
    return this.attachRequestParties(rows, userMap);
  }

  async getBaristaRequestsForOwner(userId: number): Promise<BaristaRequestWithParties[]> {
    const rows = await db.select().from(baristaMarketplaceRequests)
      .where(eq(baristaMarketplaceRequests.cafeOwnerId, userId))
      .orderBy(desc(baristaMarketplaceRequests.createdAt));
    const userIds = Array.from(new Set(rows.flatMap((r) => [r.cafeOwnerId, r.baristaUserId])));
    const userMap = new Map((await db.select().from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u]));
    return this.attachRequestParties(rows, userMap);
  }

  async getBaristaRequestById(id: number): Promise<BaristaMarketplaceRequest | undefined> {
    const [row] = await db.select().from(baristaMarketplaceRequests).where(eq(baristaMarketplaceRequests.id, id));
    return row;
  }

  async createBaristaRequest(cafeOwnerId: number, data: {
    baristaUserId: number; missionType: string; message: string;
    proposedRateInCents?: number | null; startDate: string; endDate?: string | null;
  }): Promise<BaristaMarketplaceRequest> {
    const [target] = await db.select().from(users).where(eq(users.id, data.baristaUserId));
    if (!target || target.role !== "BARISTA_MARKETPLACE" || target.status !== "approved") {
      throw new Error("This Barista is not available for recruitment");
    }
    if (target.id === cafeOwnerId) throw new Error("You cannot recruit yourself");
    const profile = await this.getBaristaMarketplaceProfile(data.baristaUserId);
    if (!profile.marketplaceVisible) throw new Error("This Barista is not currently visible on the marketplace");

    // Duplicate-active-request guard: one cafe may not have more than one
    // open (PENDING/DISCUSSION) request against the same Barista at a time.
    const existingActive = await db.select().from(baristaMarketplaceRequests).where(and(
      eq(baristaMarketplaceRequests.cafeOwnerId, cafeOwnerId),
      eq(baristaMarketplaceRequests.baristaUserId, data.baristaUserId),
      inArray(baristaMarketplaceRequests.status, ["PENDING", "DISCUSSION"]),
    ));
    if (existingActive.length > 0) {
      throw new Error("You already have an open request with this Barista");
    }

    const [created] = await db.insert(baristaMarketplaceRequests).values({
      cafeOwnerId,
      baristaUserId: data.baristaUserId,
      missionType: data.missionType,
      message: data.message,
      proposedRateInCents: data.proposedRateInCents ?? profile.dailyRateInCents,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      status: "PENDING",
    }).returning();
    return created;
  }

  /** True if [startA,endA] and [startB,endB] (inclusive, endDate may equal startDate) overlap. */
  private dateRangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
    return startA <= endB && startB <= endA;
  }

  private readonly BARISTA_REQUEST_TRANSITIONS: Record<BaristaRequestStatus, BaristaRequestStatus[]> = {
    PENDING: ["DISCUSSION", "ACCEPTED", "REJECTED", "CANCELLED"],
    DISCUSSION: ["ACCEPTED", "REJECTED", "CANCELLED"],
    ACCEPTED: ["COMPLETED"],
    REJECTED: [],
    CANCELLED: [],
    COMPLETED: [],
  };

  /**
   * Applies a request status transition with full ownership + state-machine enforcement.
   * ACCEPTED atomically creates the mission (transaction) after checking the Barista has
   * no overlapping UPCOMING/ACTIVE mission for the requested dates — this is the
   * server-side overlap guard; the frontend never decides this.
   */
  async updateBaristaRequestStatus(
    requestId: number,
    actingUser: { id: number; role: string },
    newStatus: BaristaRequestStatus,
    extra?: { cancelReason?: string },
  ): Promise<{ request: BaristaMarketplaceRequest; mission: BaristaMarketplaceMission | null }> {
    const [current] = await db.select().from(baristaMarketplaceRequests).where(eq(baristaMarketplaceRequests.id, requestId));
    if (!current) throw new Error("Request not found");

    const allowed = this.BARISTA_REQUEST_TRANSITIONS[current.status as BaristaRequestStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Cannot move a request from ${current.status} to ${newStatus}`);
    }

    const isBaristaStep = ["DISCUSSION", "ACCEPTED", "REJECTED"].includes(newStatus);
    if (isBaristaStep) {
      if (actingUser.role !== "BARISTA_MARKETPLACE" || current.baristaUserId !== actingUser.id) {
        throw new Error("Only the recruited Barista can respond to this request");
      }
    } else if (newStatus === "CANCELLED") {
      if (actingUser.role !== "CAFE_OWNER" || current.cafeOwnerId !== actingUser.id) {
        throw new Error("Only the requesting café can cancel this request");
      }
    }

    if (newStatus === "ACCEPTED") {
      const endDate = current.endDate ?? current.startDate;
      const overlapping = await db.select().from(baristaMarketplaceMissions).where(and(
        eq(baristaMarketplaceMissions.baristaUserId, current.baristaUserId),
        inArray(baristaMarketplaceMissions.status, ["UPCOMING", "ACTIVE"]),
      ));
      const conflict = overlapping.find((m) => this.dateRangesOverlap(current.startDate, endDate, m.startDate, m.endDate ?? m.startDate));
      if (conflict) {
        throw new Error(`You already have a mission booked from ${conflict.startDate} to ${conflict.endDate ?? conflict.startDate}`);
      }
    }

    return db.transaction(async (tx) => {
      const updates: any = { status: newStatus, updatedAt: new Date() };
      if (["ACCEPTED", "REJECTED"].includes(newStatus)) updates.respondedAt = new Date();
      if (newStatus === "CANCELLED" && extra?.cancelReason) updates.cancelReason = extra.cancelReason;

      const [row] = await tx.update(baristaMarketplaceRequests)
        .set(updates)
        .where(and(eq(baristaMarketplaceRequests.id, requestId), eq(baristaMarketplaceRequests.status, current.status)))
        .returning();
      if (!row) throw new Error("Request status changed concurrently — please retry");

      let mission: BaristaMarketplaceMission | null = null;
      if (newStatus === "ACCEPTED") {
        const [createdMission] = await tx.insert(baristaMarketplaceMissions).values({
          requestId: row.id,
          cafeOwnerId: row.cafeOwnerId,
          baristaUserId: row.baristaUserId,
          missionType: row.missionType,
          rateInCents: row.proposedRateInCents ?? 0,
          startDate: row.startDate,
          endDate: row.endDate,
          status: "UPCOMING",
        }).onConflictDoNothing().returning(); // requestId is unique — idempotent against duplicate accept calls
        mission = createdMission ?? null;
      }

      return { request: row, mission };
    });
  }

  // ── Missions ──
  private attachMissionParties(rows: BaristaMarketplaceMission[], userMap: Map<number, User>): BaristaMissionWithParties[] {
    return rows.map((m) => ({
      ...m,
      cafeOwnerName: userMap.get(m.cafeOwnerId)?.name ?? "—",
      baristaName: userMap.get(m.baristaUserId)?.name ?? "—",
    }));
  }

  async getBaristaMissionsForBarista(userId: number): Promise<BaristaMissionWithParties[]> {
    const rows = await db.select().from(baristaMarketplaceMissions)
      .where(eq(baristaMarketplaceMissions.baristaUserId, userId))
      .orderBy(desc(baristaMarketplaceMissions.createdAt));
    const userIds = Array.from(new Set(rows.flatMap((m) => [m.cafeOwnerId, m.baristaUserId])));
    const userMap = new Map((await db.select().from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u]));
    return this.attachMissionParties(rows, userMap);
  }

  async getBaristaMissionsForOwner(userId: number): Promise<BaristaMissionWithParties[]> {
    const rows = await db.select().from(baristaMarketplaceMissions)
      .where(eq(baristaMarketplaceMissions.cafeOwnerId, userId))
      .orderBy(desc(baristaMarketplaceMissions.createdAt));
    const userIds = Array.from(new Set(rows.flatMap((m) => [m.cafeOwnerId, m.baristaUserId])));
    const userMap = new Map((await db.select().from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u]));
    return this.attachMissionParties(rows, userMap);
  }

  async getBaristaMissionById(id: number): Promise<BaristaMarketplaceMission | undefined> {
    const [row] = await db.select().from(baristaMarketplaceMissions).where(eq(baristaMarketplaceMissions.id, id));
    return row;
  }

  private readonly BARISTA_MISSION_TRANSITIONS: Record<BaristaMissionStatus, BaristaMissionStatus[]> = {
    UPCOMING: ["ACTIVE", "CANCELLED"],
    ACTIVE: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };

  async updateBaristaMissionStatus(missionId: number, actingUser: { id: number; role: string }, newStatus: BaristaMissionStatus): Promise<BaristaMarketplaceMission> {
    const [current] = await db.select().from(baristaMarketplaceMissions).where(eq(baristaMarketplaceMissions.id, missionId));
    if (!current) throw new Error("Mission not found");

    const allowed = this.BARISTA_MISSION_TRANSITIONS[current.status as BaristaMissionStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Cannot move a mission from ${current.status} to ${newStatus}`);
    }

    const isBarista = actingUser.role === "BARISTA_MARKETPLACE" && current.baristaUserId === actingUser.id;
    const isOwner = actingUser.role === "CAFE_OWNER" && current.cafeOwnerId === actingUser.id;
    if (newStatus === "CANCELLED") {
      if (!isBarista && !isOwner) throw new Error("Only the Barista or the requesting café can cancel this mission");
      if (isOwner && current.status !== "UPCOMING") throw new Error("The café can only cancel a mission that hasn't started yet");
    } else {
      // ACTIVE / COMPLETED — only the Barista performing the work advances these.
      if (!isBarista) throw new Error("Only the assigned Barista can update this mission's progress");
    }

    const updates: any = { status: newStatus };
    if (newStatus === "COMPLETED") updates.completedAt = new Date();
    if (newStatus === "CANCELLED") updates.cancelledAt = new Date();

    const [updated] = await db.update(baristaMarketplaceMissions)
      .set(updates)
      .where(and(eq(baristaMarketplaceMissions.id, missionId), eq(baristaMarketplaceMissions.status, current.status)))
      .returning();
    if (!updated) throw new Error("Mission status changed concurrently — please retry");

    // Mirror the completion back onto the originating request for historical accuracy —
    // the request row is otherwise terminal at ACCEPTED (see BARISTA_REQUEST_TRANSITIONS).
    if (newStatus === "COMPLETED") {
      await db.update(baristaMarketplaceRequests)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(and(eq(baristaMarketplaceRequests.id, updated.requestId), eq(baristaMarketplaceRequests.status, "ACCEPTED")));
    }

    return updated;
  }

  // ── Reviews (reuses supplierProductReviews, reviewType='BARISTA_MARKETPLACE') ──
  async getBaristaReviews(baristaUserId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.baristaMarketplaceUserId as any, baristaUserId),
        eq(supplierProductReviews.reviewType, "BARISTA_MARKETPLACE"),
      ))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async getBaristaReviewForMission(missionId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    const [review] = await db.select().from(supplierProductReviews).where(and(
      eq(supplierProductReviews.baristaMissionId as any, missionId),
      eq(supplierProductReviews.cafeId, cafeId),
      eq(supplierProductReviews.reviewType, "BARISTA_MARKETPLACE"),
    ));
    return review;
  }

  async upsertBaristaReview(data: {
    baristaUserId: number; missionId: number; cafeId: number; rating: number; comment?: string | null; cafeName: string; cafeOwnerName: string;
  }): Promise<{ review: SupplierProductReview; isUpdate: boolean }> {
    const existing = await this.getBaristaReviewForMission(data.missionId, data.cafeId);
    if (existing) {
      const [review] = await db.update(supplierProductReviews)
        .set({ rating: data.rating, comment: data.comment ?? null, updatedAt: new Date() } as any)
        .where(eq(supplierProductReviews.id, existing.id))
        .returning();
      return { review, isUpdate: true };
    }
    const [review] = await db.insert(supplierProductReviews).values({
      reviewType: "BARISTA_MARKETPLACE",
      baristaMarketplaceUserId: data.baristaUserId,
      baristaMissionId: data.missionId,
      cafeId: data.cafeId,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      supplierId: null, productId: null, listingId: null, packId: null, productName: null,
    } as any).returning();
    return { review, isUpdate: false };
  }

  // ── Revenue (read-only aggregation over completed missions — no payment system exists) ──
  async getBaristaRevenueSummary(baristaUserId: number): Promise<{
    totalEarnedCents: number;
    completedMissions: number;
    currentMonthCents: number;
    currentMonthMissions: number;
    history: { month: string; totalCents: number; missions: number }[];
  }> {
    const completed = await db.select().from(baristaMarketplaceMissions).where(and(
      eq(baristaMarketplaceMissions.baristaUserId, baristaUserId),
      eq(baristaMarketplaceMissions.status, "COMPLETED"),
    ));
    const now = new Date();
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const currentMonthKey = monthKey(now);

    const byMonth = new Map<string, { totalCents: number; missions: number }>();
    let currentMonthCents = 0;
    let currentMonthMissions = 0;
    for (const m of completed) {
      const completedAt = m.completedAt ?? m.createdAt ?? now;
      const key = monthKey(new Date(completedAt));
      const bucket = byMonth.get(key) ?? { totalCents: 0, missions: 0 };
      bucket.totalCents += m.rateInCents;
      bucket.missions += 1;
      byMonth.set(key, bucket);
      if (key === currentMonthKey) { currentMonthCents += m.rateInCents; currentMonthMissions += 1; }
    }

    // Last 6 months, oldest first, zero-filled for months with no completed missions.
    const history: { month: string; totalCents: number; missions: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      const bucket = byMonth.get(key);
      history.push({ month: key, totalCents: bucket?.totalCents ?? 0, missions: bucket?.missions ?? 0 });
    }

    return {
      totalEarnedCents: completed.reduce((s, m) => s + m.rateInCents, 0),
      completedMissions: completed.length,
      currentMonthCents,
      currentMonthMissions,
      history,
    };
  }

  // ── Messaging integration ──
  async refreshBaristaMessagingState(requestId: number): Promise<void> {
    const [request] = await db.select().from(baristaMarketplaceRequests).where(eq(baristaMarketplaceRequests.id, requestId));
    if (request) {
      await this.syncMessagingRelationship(request.cafeOwnerId, request.baristaUserId, "BARISTA");
    }
  }

  // ── Favorites — mirrors the Maintenance favorites methods exactly ──
  async getBaristaFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select({ baristaUserId: baristaMarketplaceFavorites.baristaUserId })
      .from(baristaMarketplaceFavorites)
      .where(eq(baristaMarketplaceFavorites.userId, userId));
    return rows.map((row) => row.baristaUserId);
  }

  async addBaristaFavorite(userId: number, baristaUserId: number): Promise<void> {
    const [existing] = await db.select().from(baristaMarketplaceFavorites).where(and(
      eq(baristaMarketplaceFavorites.userId, userId),
      eq(baristaMarketplaceFavorites.baristaUserId, baristaUserId),
    ));
    if (!existing) await db.insert(baristaMarketplaceFavorites).values({ userId, baristaUserId });
  }

  async removeBaristaFavorite(userId: number, baristaUserId: number): Promise<void> {
    await db.delete(baristaMarketplaceFavorites).where(and(
      eq(baristaMarketplaceFavorites.userId, userId),
      eq(baristaMarketplaceFavorites.baristaUserId, baristaUserId),
    ));
  }

  // ── Admin aggregate overview — same philosophy as getPrintAdminOverview:
  // one endpoint the client tabs/filters over, built entirely from the real
  // Barista Marketplace tables above (no duplicate/derived storage, no mock
  // data). Rating/reviewCount reuse computeBaristaReviewStats — the same live
  // computation the public marketplace and single-card reads already use, so
  // Admin, Coffee Owner and the Barista's own account always agree. ──────────
  async getBaristaAdminOverview(): Promise<any> {
    const skills = await this.getBaristaSkills(false);
    const baristaUsers = await db.select().from(users).where(eq(users.role, "BARISTA_MARKETPLACE" as any));
    const profileRows = await db.select().from(baristaMarketplaceProfiles);
    const profileByUserId = new Map(profileRows.map((p) => [p.userId, p]));
    const requestRows = await db.select().from(baristaMarketplaceRequests).orderBy(desc(baristaMarketplaceRequests.createdAt));
    const missionRows = await db.select().from(baristaMarketplaceMissions).orderBy(desc(baristaMarketplaceMissions.createdAt));
    const reviewRows = await db.select().from(supplierProductReviews).where(eq(supplierProductReviews.reviewType, "BARISTA_MARKETPLACE"));
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const baristaUserIds = baristaUsers.map((u) => u.id);
    const statsMap = await this.computeBaristaReviewStats(baristaUserIds);

    const baristas = baristaUsers.map((u) => {
      const profile = profileByUserId.get(u.id);
      const stats = statsMap.get(u.id);
      const ownMissions = missionRows.filter((m) => m.baristaUserId === u.id);
      const completedOwnMissions = ownMissions.filter((m) => m.status === "COMPLETED");
      const available = !!profile && profile.isAvailable && !profile.isOnVacation && profile.marketplaceVisible;
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone ?? null,
        profileImageUrl: u.profileImageUrl ?? null,
        status: u.status,
        level: profile?.level ?? "BEGINNER",
        city: profile?.city || u.locationAddress || "",
        location: u.locationAddress ?? profile?.city ?? "",
        bio: profile?.bio ?? "",
        skills: profile?.skills ?? [],
        availableDays: profile?.availableDays ?? [],
        isAvailable: profile?.isAvailable ?? false,
        isOnVacation: profile?.isOnVacation ?? false,
        marketplaceVisible: profile?.marketplaceVisible ?? false,
        available,
        dailyRateInCents: profile?.dailyRateInCents ?? 0,
        rating: stats?.rating ?? 0,
        reviewCount: stats?.reviewCount ?? 0,
        requestCount: requestRows.filter((r) => r.baristaUserId === u.id).length,
        missionCount: ownMissions.length,
        completedMissionCount: completedOwnMissions.length,
        revenueCents: completedOwnMissions.reduce((s, m) => s + m.rateInCents, 0),
        createdAt: u.createdAt,
        initials: u.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
      };
    });

    const requests = requestRows.map((r) => ({
      ...r,
      cafeOwnerName: userMap.get(r.cafeOwnerId)?.name ?? "—",
      baristaName: userMap.get(r.baristaUserId)?.name ?? "—",
    }));

    const missions = missionRows.map((m) => ({
      ...m,
      cafeOwnerName: userMap.get(m.cafeOwnerId)?.name ?? "—",
      baristaName: userMap.get(m.baristaUserId)?.name ?? "—",
    }));

    const reviews = reviewRows.map((r) => ({
      ...r,
      baristaName: r.baristaMarketplaceUserId ? (userMap.get(r.baristaMarketplaceUserId)?.name ?? "—") : "—",
    }));

    const completedMissions = missionRows.filter((m) => m.status === "COMPLETED");
    const pendingMissions = missionRows.filter((m) => m.status === "UPCOMING" || m.status === "ACTIVE");
    const totalReviewRating = reviewRows.reduce((s, r) => s + r.rating, 0);

    return {
      stats: {
        totalBaristas: baristaUsers.length,
        activeBaristas: baristaUsers.filter((u) => u.status === "approved").length,
        availableBaristas: baristas.filter((b) => b.available).length,
        totalRequests: requestRows.length,
        pendingRequests: requestRows.filter((r) => r.status === "PENDING" || r.status === "DISCUSSION").length,
        totalMissions: missionRows.length,
        completedMissions: completedMissions.length,
        cancelledMissions: missionRows.filter((m) => m.status === "CANCELLED").length,
        completedMissionValueCents: completedMissions.reduce((s, m) => s + m.rateInCents, 0),
        pendingMissionValueCents: pendingMissions.reduce((s, m) => s + m.rateInCents, 0),
        reviewCount: reviewRows.length,
        averageRating: reviewRows.length ? Math.round((totalReviewRating / reviewRows.length) * 10) / 10 : 0,
      },
      skills,
      baristas,
      requests,
      missions,
      reviews,
    };
  }

  // ── Supplier variants ───────────────────────────────────────────────────────

  async getVariantsByListingId(listingId: number): Promise<SupplierVariantWithLabels[]> {
    const variants = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.listingId, listingId));
    const tx = await buildTaxonomyCache();
    return variants.map((v) => ({
      ...v,
      flavorName: v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null,
      sizeName: v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null,
    }));
  }

  async saveVariants(listingId: number, variants: { flavorId?: number | null; sizeId?: number | null; price: number; quantity: number }[]): Promise<SupplierVariantWithLabels[]> {
    // Variant rows are recreated on every save. Keep Pack references attached to
    // the same flavor/size slot when it still exists, and remove references to
    // slots that were actually removed.
    const previousVariants = await db.select().from(supplierProductVariants)
      .where(eq(supplierProductVariants.listingId, listingId));
    const previousVariantIds = previousVariants.map((v) => v.id);
    const previousPackItems = previousVariantIds.length
      ? await db.select().from(packItems).where(inArray(packItems.variantId, previousVariantIds))
      : [];

    await db.delete(supplierProductVariants).where(eq(supplierProductVariants.listingId, listingId));
    if (!variants.length) {
      if (previousPackItems.length) {
        await db.delete(packItems).where(inArray(packItems.id, previousPackItems.map((item) => item.id)));
      }
      await db.update(supplierProductListings).set({ price: 0, stock: 0 }).where(eq(supplierProductListings.id, listingId));
      return [];
    }
    const inserted = await db.insert(supplierProductVariants).values(variants.map((v) => ({ listingId, flavorId: v.flavorId ?? null, sizeId: v.sizeId ?? null, price: v.price, quantity: v.quantity }))).returning();
    const aggPrice = Math.min(...inserted.map((v) => v.price));
    const aggStock = inserted.reduce((s, v) => s + v.quantity, 0);
    await db.update(supplierProductListings).set({ price: aggPrice, stock: aggStock }).where(eq(supplierProductListings.id, listingId));

    const insertedBySlot = new Map(inserted.map((v) => [`${v.flavorId ?? "null"}:${v.sizeId ?? "null"}`, v]));
    const previousById = new Map(previousVariants.map((v) => [v.id, v]));
    for (const item of previousPackItems) {
      const previous = previousById.get(item.variantId!);
      const replacement = previous
        ? insertedBySlot.get(`${previous.flavorId ?? "null"}:${previous.sizeId ?? "null"}`)
        : undefined;
      if (replacement) {
        await db.update(packItems).set({ variantId: replacement.id }).where(eq(packItems.id, item.id));
      } else {
        await db.delete(packItems).where(eq(packItems.id, item.id));
      }
    }
    // A listing that changes from a non-variant product to a variant product
    // can no longer satisfy an old listing-level Pack component.
    await db.delete(packItems).where(and(
      eq(packItems.listingId, listingId),
      isNull(packItems.variantId),
    ));

    const tx = await buildTaxonomyCache();
    return inserted.map((v) => ({
      ...v,
      flavorName: v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null,
      sizeName: v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null,
    }));
  }

  // ── Categories ──────────────────────────────────────────────────────────────

  async getCategories(opts?: { includeAll?: boolean }): Promise<CategoryWithCount[]> {
    const cats = opts?.includeAll
      // Supplier suggestions become normal taxonomy rows when approved. Keep
      // pending/rejected supplier rows out of Category Management while
      // preserving the existing include-all behavior for admin-managed rows.
      ? await db.select().from(categories).where(or(
          eq(categories.createdBySupplier, false),
          and(eq(categories.status, 'ACTIVE'), eq(categories.isActive, true)),
        )).orderBy(asc(categories.displayOrder), asc(categories.id))
      : await db.select().from(categories).where(and(eq(categories.status, 'ACTIVE'), eq(categories.isActive, true))).orderBy(asc(categories.displayOrder), asc(categories.id));
    const subs = await db.select().from(subCategories).where(and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true)));
    const prods = await db.select().from(products);
    const availableAdminProducts = prods.filter((p) => p.isAdminProduct && p.status === 'ACTIVE');
    return cats.map((c) => ({
      ...c,
      subCategoryCount: subs.filter((s) => s.categoryId === c.id).length,
      productCount: availableAdminProducts.filter((p) => p.categoryId === c.id).length,
    }));
  }

  async getCategory(id: number) {
    const [cat] = await db.select().from(categories).where(eq(categories.id, id));
    return cat;
  }

  async createCategory(cat: Partial<InsertCategory>) {
    const [created] = await db.insert(categories).values(cat as any).returning();
    return created;
  }

  async updateCategory(id: number, updates: Partial<InsertCategory>) {
    const normalized = { ...updates } as Partial<InsertCategory>;
    if (normalized.isActive === false) normalized.status = 'REJECTED';
    if (normalized.isActive === true) normalized.status = 'ACTIVE';
    if (normalized.status === 'ACTIVE') normalized.isActive = true;
    if (normalized.status === 'REJECTED' || normalized.status === 'PENDING') normalized.isActive = false;
    const [updated] = await db.update(categories).set(normalized as any).where(eq(categories.id, id)).returning();
    return updated;
  }

  async deleteCategory(id: number) {
    await db.delete(categories).where(eq(categories.id, id));
  }

  // ── SubCategories ───────────────────────────────────────────────────────────

  async getSubCategories(categoryId?: number, opts?: { includeAll?: boolean }): Promise<SubCategoryWithDetails[]> {
    let subs;
    if (opts?.includeAll) {
      subs = categoryId
        ? await db.select().from(subCategories).where(and(
            eq(subCategories.categoryId, categoryId),
            or(eq(subCategories.createdBySupplier, false), and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true))),
          ))
        : await db.select().from(subCategories).where(or(
            eq(subCategories.createdBySupplier, false),
            and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true)),
          ));
    } else {
      subs = categoryId
        ? await db.select().from(subCategories).where(and(eq(subCategories.categoryId, categoryId), eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true)))
        : await db.select().from(subCategories).where(and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true)));
    }
    const cats = await db.select().from(categories);
    const prods = await db.select().from(products);
    const catMap = new Map(cats.map((c) => [c.id, c.name]));
    return subs.map((s) => ({
      ...s,
      categoryName: catMap.get(s.categoryId) ?? "",
      productCount: prods.filter((p) => p.subCategoryId === s.id).length,
    }));
  }

  async createSubCategory(sub: Partial<InsertSubCategory>) {
    const [created] = await db.insert(subCategories).values(sub as any).returning();
    return created;
  }

  async updateSubCategory(id: number, updates: Partial<InsertSubCategory>) {
    const normalized = { ...updates } as Partial<InsertSubCategory>;
    if (normalized.isActive === false) normalized.status = 'REJECTED';
    if (normalized.isActive === true) normalized.status = 'ACTIVE';
    if (normalized.status === 'ACTIVE') normalized.isActive = true;
    if (normalized.status === 'REJECTED' || normalized.status === 'PENDING') normalized.isActive = false;
    const [updated] = await db.update(subCategories).set(normalized as any).where(eq(subCategories.id, id)).returning();
    return updated;
  }

  async deleteSubCategory(id: number) {
    await db.delete(subCategories).where(eq(subCategories.id, id));
  }

  // ── Flavors ─────────────────────────────────────────────────────────────────

  async getFlavors(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<FlavorWithCount[]> {
    const all = filters?.includeAll
      ? await db.select().from(flavors).where(or(
          eq(flavors.createdBySupplier, false),
          and(eq(flavors.status, 'ACTIVE'), eq(flavors.isActive, true)),
        ))
      : await db.select().from(flavors).where(eq(flavors.status, 'ACTIVE'));
    const prods = await db.select().from(products);
    const subs = await db.select().from(subCategories);
    const subMap = new Map(subs.map((s) => [s.id, s.name]));
    let filtered = all;
    if (filters?.subCategoryId) filtered = filtered.filter((f) => f.subCategoryIds?.includes(filters.subCategoryId!));
    return filtered.map((f) => ({
      ...f,
      productCount: prods.filter((p) => p.flavorId === f.id || p.flavorIds?.includes(f.id)).length,
      subCategoryNames: (f.subCategoryIds ?? []).map((id) => subMap.get(id) ?? "").filter(Boolean),
    }));
  }

  async createFlavor(f: Partial<InsertFlavor>) {
    const [created] = await db.insert(flavors).values(f as any).returning();
    return created;
  }

  async updateFlavor(id: number, updates: Partial<InsertFlavor>) {
    const [updated] = await db.update(flavors).set(updates as any).where(eq(flavors.id, id)).returning();
    return updated;
  }

  async deleteFlavor(id: number) {
    await db.delete(flavors).where(eq(flavors.id, id));
  }

  // ── Sizes ───────────────────────────────────────────────────────────────────

  async getSizes(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<SizeWithCount[]> {
    const all = filters?.includeAll
      ? await db.select().from(sizes).where(or(
          eq(sizes.createdBySupplier, false),
          and(eq(sizes.status, 'ACTIVE'), eq(sizes.isActive, true)),
        ))
      : await db.select().from(sizes).where(eq(sizes.status, 'ACTIVE'));
    const prods = await db.select().from(products);
    const subs = await db.select().from(subCategories);
    const subMap = new Map(subs.map((s) => [s.id, s.name]));
    let filtered = all;
    if (filters?.subCategoryId) filtered = filtered.filter((s) => s.subCategoryIds?.includes(filters.subCategoryId!));
    return filtered.map((s) => ({
      ...s,
      productCount: prods.filter((p) => p.sizeId === s.id || p.sizeIds?.includes(s.id)).length,
      subCategoryNames: (s.subCategoryIds ?? []).map((id) => subMap.get(id) ?? "").filter(Boolean),
    }));
  }

  async createSize(s: Partial<InsertSize>) {
    const [created] = await db.insert(sizes).values(s as any).returning();
    return created;
  }

  async updateSize(id: number, updates: Partial<InsertSize>) {
    const [updated] = await db.update(sizes).set(updates as any).where(eq(sizes.id, id)).returning();
    return updated;
  }

  async deleteSize(id: number) {
    await db.delete(sizes).where(eq(sizes.id, id));
  }

  // ── Brands ──────────────────────────────────────────────────────────────────

  async getBrands(filters?: { categoryId?: number; subCategoryId?: number; includeAll?: boolean }): Promise<BrandWithCount[]> {
    const all = filters?.includeAll
      ? await db.select().from(brands).where(or(
          eq(brands.createdBySupplier, false),
          and(eq(brands.status, 'ACTIVE'), eq(brands.isActive, true)),
        ))
      : await db.select().from(brands).where(eq(brands.status, 'ACTIVE'));
    const prods = await db.select().from(products);
    const subs = await db.select().from(subCategories);
    const subMap = new Map(subs.map((s) => [s.id, s.name]));
    let filtered = all;
    if (filters?.subCategoryId) filtered = filtered.filter((b) => b.subCategoryIds?.includes(filters.subCategoryId!));
    return filtered.map((b) => ({
      ...b,
      productCount: prods.filter((p) => p.brandId === b.id).length,
      subCategoryNames: (b.subCategoryIds ?? []).map((id) => subMap.get(id) ?? "").filter(Boolean),
    }));
  }

  async createBrand(b: Partial<InsertBrand>) {
    const [created] = await db.insert(brands).values(b as any).returning();
    return created;
  }

  async updateBrand(id: number, updates: Partial<InsertBrand>) {
    const [updated] = await db.update(brands).set(updates as any).where(eq(brands.id, id)).returning();
    return updated;
  }

  async deleteBrand(id: number) {
    await db.delete(brands).where(eq(brands.id, id));
  }

  // ── Supplier mappings ───────────────────────────────────────────────────────

  async getSupplierCategoryMappings(supplierId: number, options?: { approvedOnly?: boolean }): Promise<SupplierCategoryMapping[]> {
    const allCats = await db.select().from(categories).where(and(eq(categories.status, 'ACTIVE'), eq(categories.isActive, true)));
    const allSubs = await db.select().from(subCategories).where(and(eq(subCategories.status, 'ACTIVE'), eq(subCategories.isActive, true)));
    const supplierCats = await db.select().from(supplierCategories)
      .where(eq(supplierCategories.supplierId, supplierId))
      .orderBy(asc(supplierCategories.displayOrder), asc(supplierCategories.id));
    const supplierSubs = await db.select().from(supplierSubCategories).where(eq(supplierSubCategories.supplierId, supplierId));
    const catMeta = new Map(supplierCats.map((sc) => [sc.categoryId, sc]));

    const catById = new Map(allCats.map((cat) => [cat.id, cat]));
    return supplierCats
      .map((meta) => ({ meta, cat: catById.get(meta.categoryId) }))
      .filter((entry): entry is { meta: typeof supplierCats[number]; cat: typeof allCats[number] } => !!entry.cat)
      .filter(({ meta }) => {
        if (options?.approvedOnly) {
          return meta.mappingStatus === 'APPROVED' && !meta.isFrozen;
        }
        return true;
      })
      .map(({ meta, cat }) => {
        return {
          category: cat,
          subCategories: allSubs.filter((s) => s.categoryId === cat.id),
          selectedSubCategoryIds: supplierSubs
            .filter((ss) => allSubs.some((s) => s.id === ss.subCategoryId && s.categoryId === cat.id))
            .map((ss) => ss.subCategoryId),
          mappingStatus: (meta.mappingStatus === 'PENDING' ? 'PENDING' : 'APPROVED') as 'APPROVED' | 'PENDING',
          isFrozen: meta.isFrozen ?? false,
        };
      });
  }

  async getAdminSupplierCategoryOverview(supplierId: number): Promise<AdminSupplierCategoryOverview> {
    const allMappings = await this.getSupplierCategoryMappings(supplierId);
    const allCats = await db.select().from(categories).where(and(eq(categories.status, 'ACTIVE'), eq(categories.isActive, true)));
    const mappedIds = new Set(allMappings.map((m) => m.category.id));

    return {
      supplierId,
      approved: allMappings.filter((m) => m.mappingStatus === 'APPROVED'),
      pending: allMappings.filter((m) => m.mappingStatus === 'PENDING'),
      notAdded: allCats.filter((c) => !mappedIds.has(c.id)),
    };
  }

  async addSupplierCategories(supplierId: number, categoryIds: number[], status: 'APPROVED' | 'PENDING' = 'PENDING') {
    const availableCategories = await db.select({ categoryId: products.categoryId })
      .from(products)
      .where(and(eq(products.isAdminProduct, true), eq(products.status, 'ACTIVE')));
    const availableCategoryIds = new Set(availableCategories.map((row) => row.categoryId).filter((id): id is number => id != null));
    if (categoryIds.some((id) => !availableCategoryIds.has(id))) {
      throw new Error("Supplier categories must have an active Admin Product");
    }
    const existing = await db.select().from(supplierCategories).where(eq(supplierCategories.supplierId, supplierId));
    const existingIds = new Set(existing.map((e) => e.categoryId));
    const newIds = categoryIds.filter((id) => !existingIds.has(id));
    if (newIds.length) {
      const nextOrder = existing.reduce((max, row) => Math.max(max, row.displayOrder ?? 0), -1) + 1;
      await db.insert(supplierCategories).values(
        newIds.map((categoryId, index) => ({ supplierId, categoryId, displayOrder: nextOrder + index, mappingStatus: status, isFrozen: false })),
      );
    }
  }

  async reorderSupplierCategories(supplierId: number, categoryIds: number[]) {
    const existing = await db.select().from(supplierCategories)
      .where(eq(supplierCategories.supplierId, supplierId));
    const existingIds = new Set(existing.map((row) => row.categoryId));
    if (categoryIds.length !== existing.length || categoryIds.some((id) => !existingIds.has(id))) {
      throw new Error("Category order must contain exactly the supplier's mapped categories");
    }
    await Promise.all(categoryIds.map((categoryId, index) =>
      db.update(supplierCategories)
        .set({ displayOrder: index })
        .where(and(eq(supplierCategories.supplierId, supplierId), eq(supplierCategories.categoryId, categoryId)))
    ));
  }

  async removeSupplierCategory(supplierId: number, categoryId: number) {
    const allSubs = await db.select().from(subCategories).where(eq(subCategories.categoryId, categoryId));
    const subIds = allSubs.map((s) => s.id);
    await db.delete(supplierCategories).where(
      and(eq(supplierCategories.supplierId, supplierId), eq(supplierCategories.categoryId, categoryId)),
    );
    if (subIds.length) {
      await db.delete(supplierSubCategories).where(
        and(eq(supplierSubCategories.supplierId, supplierId), inArray(supplierSubCategories.subCategoryId, subIds)),
      );
    }
  }

  async setSupplierCategoryFrozen(supplierId: number, categoryId: number, isFrozen: boolean) {
    await db.update(supplierCategories)
      .set({ isFrozen })
      .where(and(eq(supplierCategories.supplierId, supplierId), eq(supplierCategories.categoryId, categoryId)));
  }

  async approveSupplierCategoryMapping(supplierId: number, categoryId: number) {
    await db.update(supplierCategories)
      .set({ mappingStatus: 'APPROVED' })
      .where(and(eq(supplierCategories.supplierId, supplierId), eq(supplierCategories.categoryId, categoryId)));
  }

  async setSupplierCategories(supplierId: number, categoryIds: number[]) {
    const existing = await db.select().from(supplierCategories).where(eq(supplierCategories.supplierId, supplierId));

    // Never drop supplier-initiated PENDING mappings omitted from bulk admin selection
    const pendingPreservedIds = existing
      .filter((e) => e.mappingStatus === 'PENDING' && !categoryIds.includes(e.categoryId))
      .map((e) => e.categoryId);
    const finalCategoryIds = Array.from(new Set([...categoryIds, ...pendingPreservedIds]));

    const allSubs = await db.select().from(subCategories);
    const validSubIds = new Set(allSubs.filter((s) => finalCategoryIds.includes(s.categoryId)).map((s) => s.id));
    const supplierSubs = await db.select().from(supplierSubCategories).where(eq(supplierSubCategories.supplierId, supplierId));
    const orphanSubIds = supplierSubs.filter((ss) => !validSubIds.has(ss.subCategoryId)).map((ss) => ss.subCategoryId);

    if (finalCategoryIds.length === 0) {
      await db.delete(supplierCategories).where(eq(supplierCategories.supplierId, supplierId));
    } else {
      await db.delete(supplierCategories).where(
        and(
          eq(supplierCategories.supplierId, supplierId),
          notInArray(supplierCategories.categoryId, finalCategoryIds),
        ),
      );
    }

    const existingIds = new Set(existing.map((e) => e.categoryId));
    const toInsert = finalCategoryIds.filter((cid) => !existingIds.has(cid));
    if (toInsert.length) {
      await db.insert(supplierCategories).values(
        toInsert.map((cid) => ({
          supplierId,
          categoryId: cid,
          mappingStatus: 'APPROVED' as const,
          isFrozen: false,
        })),
      );
    }
    if (orphanSubIds.length) {
      await db.delete(supplierSubCategories).where(
        and(eq(supplierSubCategories.supplierId, supplierId), inArray(supplierSubCategories.subCategoryId, orphanSubIds)),
      );
    }
  }

  async setSupplierSubCategories(supplierId: number, subCategoryIds: number[]) {
    const supplierCats = await db.select().from(supplierCategories).where(eq(supplierCategories.supplierId, supplierId));
    const selectedCatIds = new Set(supplierCats.map((sc) => sc.categoryId));
    const allSubs = await db.select().from(subCategories);
    const validSubIds = subCategoryIds.filter((sid) => {
      const sub = allSubs.find((s) => s.id === sid);
      return sub && selectedCatIds.has(sub.categoryId);
    });

    await db.delete(supplierSubCategories).where(eq(supplierSubCategories.supplierId, supplierId));
    if (validSubIds.length) {
      await db.insert(supplierSubCategories).values(validSubIds.map((sid) => ({ supplierId, subCategoryId: sid })));
    }
  }

  async isProductAllowedForSupplier(supplierId: number, productId: number): Promise<boolean> {
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product?.isAdminProduct) return false;
    if (!product.categoryId) return false;

    const mappings = await this.getSupplierCategoryMappings(supplierId, { approvedOnly: true });
    if (!mappings.length) return false;

    const mappedCatIds = new Set(mappings.map((m) => m.category.id));
    if (!mappedCatIds.has(product.categoryId)) return false;

    const catMapping = mappings.find((m) => m.category.id === product.categoryId);
    if (catMapping && catMapping.selectedSubCategoryIds.length > 0) {
      if (!product.subCategoryId) return false;
      return catMapping.selectedSubCategoryIds.includes(product.subCategoryId);
    }
    return true;
  }

  // ── Supplier product listings ───────────────────────────────────────────────

  async getSupplierListings(supplierId: number, filters?: { categoryId?: number; subCategoryId?: number; flavorId?: number; sizeId?: number; brandId?: number }): Promise<SupplierListingWithProduct[]> {
    const listings = await db.select().from(supplierProductListings).where(eq(supplierProductListings.supplierId, supplierId));
    const allProducts = await db.select().from(products);
    const allVariants = await db.select().from(supplierProductVariants);
    const tx = await buildTaxonomyCache();
    const productMap = new Map(allProducts.map((p) => [p.id, p]));
    const variantsByListing = new Map<number, typeof allVariants>();
    for (const v of allVariants) {
      if (!variantsByListing.has(v.listingId)) variantsByListing.set(v.listingId, []);
      variantsByListing.get(v.listingId)!.push(v);
    }

    let result = listings.map((l) => {
      const prod = productMap.get(l.productId);
      if (!prod) return null;
      const variants = (variantsByListing.get(l.id) ?? []).map((v) => ({
        ...v,
        flavorName: v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null,
        sizeName: v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null,
      }));
      return { ...l, product: enrichProduct(prod, tx), variants };
    }).filter(Boolean) as SupplierListingWithProduct[];

    if (filters?.categoryId) result = result.filter((l) => l.product.categoryId === filters.categoryId);
    if (filters?.subCategoryId) result = result.filter((l) => l.product.subCategoryId === filters.subCategoryId);
    if (filters?.flavorId) result = result.filter((l) => l.product.flavorId === filters.flavorId || l.product.flavorIds?.includes(filters.flavorId!));
    if (filters?.sizeId) result = result.filter((l) => l.product.sizeId === filters.sizeId || l.product.sizeIds?.includes(filters.sizeId!));
    if (filters?.brandId) result = result.filter((l) => l.product.brandId === filters.brandId);
    return result;
  }

  async createSupplierListing(data: Partial<InsertSupplierProductListing>) {
    const [created] = await db.insert(supplierProductListings).values(data as any).returning();
    return created;
  }

  async updateSupplierListing(id: number, updates: { price?: number; stock?: number; availableFlavorIds?: number[]; availableSizeIds?: number[]; availableBrandIds?: number[] }) {
    const [updated] = await db.update(supplierProductListings).set(updates as any).where(eq(supplierProductListings.id, id)).returning();
    return updated;
  }

  async deleteSupplierListing(id: number) {
    const affectedRows = await db.select({ packId: packItems.packId })
      .from(packItems)
      .innerJoin(packs, eq(packItems.packId, packs.id))
      .where(and(eq(packItems.listingId, id), eq(packs.isArchived, false)));
    const archivedPackIds = Array.from(new Set(affectedRows.map((row) => row.packId)));
    if (archivedPackIds.length > 0) {
      await db.update(packs)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(inArray(packs.id, archivedPackIds));
    }
    await db.delete(supplierProductVariants).where(eq(supplierProductVariants.listingId, id));
    await db.delete(packItems).where(eq(packItems.listingId, id));
    await db.delete(inventoryAdjustments).where(eq(inventoryAdjustments.listingId, id));
    await db.delete(supplierProductListings).where(eq(supplierProductListings.id, id));
    return archivedPackIds;
  }

  async removeSupplierListingFromPacks(id: number): Promise<number[]> {
    const affectedRows = await db.select({ packId: packItems.packId })
      .from(packItems)
      .innerJoin(packs, eq(packItems.packId, packs.id))
      .where(and(eq(packItems.listingId, id), eq(packs.isArchived, false)));
    const archivedPackIds = Array.from(new Set(affectedRows.map((row) => row.packId)));
    if (archivedPackIds.length > 0) {
      await db.update(packs)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(inArray(packs.id, archivedPackIds));
    }
    await db.delete(packItems).where(eq(packItems.listingId, id));
    await db.update(supplierProductListings)
      .set({ onlyForPack: false, onlyForMyProducts: true, updatedAt: new Date() })
      .where(eq(supplierProductListings.id, id));
    return archivedPackIds;
  }

  // ── Inventory ────────────────────────────────────────────────────────────────

  private computeStockStatus(stock: number, minStock: number): StockStatus {
    if (stock <= 0) return 'OUT_OF_STOCK';
    if (stock < minStock) return 'LOW_STOCK';
    return 'IN_STOCK';
  }

  /** Per-variant status: only counts as LOW_STOCK when a minStock has actually been configured for it. */
  private computeVariantStockStatus(stock: number, minStock: number | null): StockStatus {
    if (stock <= 0) return 'OUT_OF_STOCK';
    if (minStock != null && stock <= minStock) return 'LOW_STOCK';
    return 'IN_STOCK';
  }

  /** Rolls up a set of per-variant statuses into one product-level status: Out of Stock > Low Stock > In Stock. */
  private aggregateStockStatus(statuses: StockStatus[]): StockStatus {
    if (statuses.some((s) => s === 'OUT_OF_STOCK')) return 'OUT_OF_STOCK';
    if (statuses.some((s) => s === 'LOW_STOCK')) return 'LOW_STOCK';
    return 'IN_STOCK';
  }

  /** Builds the full enriched inventory row set for a supplier (pre-filter/sort/paginate). */
  private async buildInventoryItems(supplierId: number): Promise<InventoryItem[]> {
    const listings = await db.select().from(supplierProductListings).where(eq(supplierProductListings.supplierId, supplierId));
    if (!listings.length) return [];
    const productIds = Array.from(new Set(listings.map((l) => l.productId)));
    const prods = await db.select().from(products).where(inArray(products.id, productIds));
    const productMap = new Map(prods.map((p) => [p.id, p]));
    const allVariants = await db.select().from(supplierProductVariants).where(inArray(supplierProductVariants.listingId, listings.map((l) => l.id)));
    const variantsByListing = new Map<number, typeof allVariants>();
    for (const v of allVariants) {
      const arr = variantsByListing.get(v.listingId) ?? [];
      arr.push(v);
      variantsByListing.set(v.listingId, arr);
    }
    const packItemRows = await db.select().from(packItems).where(inArray(packItems.listingId, listings.map((l) => l.id)));
    const listingsWithPacks = new Set(packItemRows.map((pi) => pi.listingId));
    const tx = await buildTaxonomyCache();

    const items: InventoryItem[] = [];
    for (const l of listings) {
      const prod = productMap.get(l.productId);
      if (!prod) continue;
      const listingVariants = variantsByListing.get(l.id) ?? [];
      const hasVariants = listingVariants.length > 0;
      const category = prod.categoryId ? tx.catMap.get(prod.categoryId) : undefined;
      const brand = prod.brandId ? tx.brdMap.get(prod.brandId) : undefined;

      const variantItems: InventoryVariantItem[] = listingVariants.map((v) => {
        const flavorName = v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null;
        const sizeName = v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null;
        const variantName = [flavorName, sizeName].filter(Boolean).join(' · ') || `Variant #${v.id}`;
        return {
          variantId: v.id,
          listingId: l.id,
          flavorId: v.flavorId ?? null,
          sizeId: v.sizeId ?? null,
          variantName,
          unit: sizeName ?? l.unit,
          stock: v.quantity,
          minStock: v.minStock ?? null,
          maxStock: v.maxStock ?? null,
          price: v.price,
          stockStatus: this.computeVariantStockStatus(v.quantity, v.minStock ?? null),
        };
      });

      const stockStatus = hasVariants
        ? this.aggregateStockStatus(variantItems.map((v) => v.stockStatus))
        : this.computeStockStatus(l.stock, l.minStock);

      items.push({
        listingId: l.id,
        productId: prod.id,
        supplierId: l.supplierId,
        productName: prod.name,
        imageUrl: prod.imageUrl ?? null,
        sku: l.sku ?? null,
        barcode: l.barcode ?? null,
        categoryId: prod.categoryId ?? null,
        categoryName: category?.name ?? null,
        brandId: prod.brandId ?? null,
        brandName: brand?.name ?? null,
        stock: l.stock,
        minStock: l.minStock,
        maxStock: l.maxStock ?? null,
        unit: l.unit,
        price: l.price,
        inventoryValue: l.stock * l.price,
        stockStatus,
        productStatus: prod.status,
        visibility: l.visibility,
        hasVariants,
        hasPacks: listingsWithPacks.has(l.id),
        onlyForPack: l.onlyForPack,
        onlyForMyProducts: l.onlyForMyProducts,
        variants: variantItems,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      });
    }
    return items;
  }

  private applyInventoryFilters(items: InventoryItem[], filters?: InventoryFilters): InventoryItem[] {
    let result = items;
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter((i) =>
        i.productName.toLowerCase().includes(q) ||
        (i.sku ?? '').toLowerCase().includes(q) ||
        (i.barcode ?? '').toLowerCase().includes(q)
      );
    }
    if (filters?.categoryId) result = result.filter((i) => i.categoryId === filters.categoryId);
    if (filters?.brandId) result = result.filter((i) => i.brandId === filters.brandId);
    if (filters?.status === 'ACTIVE') result = result.filter((i) => i.visibility === 'VISIBLE' && i.productStatus !== 'PENDING');
    if (filters?.status === 'HIDDEN') result = result.filter((i) => i.visibility === 'HIDDEN');
    if (filters?.status === 'DRAFT') result = result.filter((i) => i.productStatus === 'PENDING');
    if (filters?.stockStatus) result = result.filter((i) => i.stockStatus === filters.stockStatus);
    if (filters?.lowStockOnly) result = result.filter((i) => i.stockStatus === 'LOW_STOCK');
    if (filters?.minPrice !== undefined) result = result.filter((i) => i.price >= filters.minPrice!);
    if (filters?.maxPrice !== undefined) result = result.filter((i) => i.price <= filters.maxPrice!);
    if (filters?.hasPacks !== undefined) result = result.filter((i) => i.hasPacks === filters.hasPacks);
    return result;
  }

  private sortInventoryItems(items: InventoryItem[], sort?: InventorySort): InventoryItem[] {
    const arr = [...items];
    switch (sort) {
      case 'name_desc': return arr.sort((a, b) => b.productName.localeCompare(a.productName));
      case 'stock_asc': return arr.sort((a, b) => a.stock - b.stock);
      case 'stock_desc': return arr.sort((a, b) => b.stock - a.stock);
      case 'price_asc': return arr.sort((a, b) => a.price - b.price);
      case 'price_desc': return arr.sort((a, b) => b.price - a.price);
      case 'updated_desc': return arr.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
      case 'created_desc': return arr.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      case 'name_asc':
      default: return arr.sort((a, b) => a.productName.localeCompare(b.productName));
    }
  }

  async getSupplierInventory(supplierId: number, filters?: InventoryFilters, sort?: InventorySort, page = 1, pageSize = 50): Promise<InventoryListResult> {
    const all = await this.buildInventoryItems(supplierId);
    const filtered = this.applyInventoryFilters(all, filters);
    const sorted = this.sortInventoryItems(filtered, sort);
    const total = sorted.length;
    const start = (page - 1) * pageSize;
    const items = sorted.slice(start, start + pageSize);
    return { items, total, page, pageSize };
  }

  async getSupplierInventoryStats(supplierId: number, filters?: InventoryFilters): Promise<InventoryStats> {
    const all = await this.buildInventoryItems(supplierId);
    const items = filters ? this.applyInventoryFilters(all, filters) : all;
    return {
      totalProducts: items.length,
      activeProducts: items.filter((i) => i.visibility === 'VISIBLE' && i.productStatus !== 'PENDING').length,
      hiddenProducts: items.filter((i) => i.visibility === 'HIDDEN').length,
      inStock: items.filter((i) => i.stockStatus === 'IN_STOCK').length,
      lowStock: items.filter((i) => i.stockStatus === 'LOW_STOCK').length,
      outOfStock: items.filter((i) => i.stockStatus === 'OUT_OF_STOCK').length,
      totalUnits: items.reduce((s, i) => s + i.stock, 0),
      inventoryValue: items.reduce((s, i) => s + i.inventoryValue, 0),
    };
  }

  async getListingForSupplier(listingId: number, supplierId: number) {
    const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, listingId));
    if (!listing || listing.supplierId !== supplierId) return undefined;
    return listing;
  }

  /** Adjusts a listing's aggregate stock, records history, and returns the updated listing. Only valid for listings without per-variant stock. */
  async adjustListingStock(listingId: number, supplierId: number, userId: number | null, input: { type: 'INCREASE' | 'DECREASE' | 'SET'; quantity: number; reason: string; notes?: string }) {
    const listing = await this.getListingForSupplier(listingId, supplierId);
    if (!listing) throw new Error('Listing not found');
    const variants = await this.getVariantsByListingId(listingId);
    if (variants.length > 0) throw new Error('This product has variants — adjust stock per variant instead');

    const previousStock = listing.stock;
    let newStock: number;
    if (input.type === 'INCREASE') newStock = previousStock + input.quantity;
    else if (input.type === 'DECREASE') newStock = previousStock - input.quantity;
    else newStock = input.quantity;
    if (newStock < 0) throw new Error('Stock cannot go below zero');

    const [updated] = await db.update(supplierProductListings)
      .set({ stock: newStock, updatedAt: new Date() })
      .where(eq(supplierProductListings.id, listingId))
      .returning();

    const [history] = await db.insert(inventoryAdjustments).values({
      listingId, supplierId, userId,
      adjustmentType: input.type,
      previousStock, newStock,
      difference: newStock - previousStock,
      reason: input.reason,
      notes: input.notes ?? null,
    }).returning();

    return { listing: updated, history };
  }

  async getListingStockHistory(listingId: number, supplierId: number): Promise<InventoryAdjustmentWithVariant[]> {
    const listing = await this.getListingForSupplier(listingId, supplierId);
    if (!listing) throw new Error('Listing not found');
    const rows = await db.select().from(inventoryAdjustments).where(eq(inventoryAdjustments.listingId, listingId)).orderBy(desc(inventoryAdjustments.createdAt));
    if (!rows.length) return [];
    const tx = await buildTaxonomyCache();
    return rows.map((r) => {
      if (r.flavorId == null && r.sizeId == null) return { ...r, variantName: null };
      const flavorName = r.flavorId ? (tx.flvMap.get(r.flavorId)?.name ?? null) : null;
      const sizeName = r.sizeId ? (tx.szMap.get(r.sizeId)?.name ?? null) : null;
      return { ...r, variantName: [flavorName, sizeName].filter(Boolean).join(' · ') || null };
    });
  }

  /** Finds a variant + its listing, verifying the listing belongs to this supplier. */
  private async getVariantForSupplier(variantId: number, supplierId: number) {
    const [variant] = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.id, variantId));
    if (!variant) return undefined;
    const listing = await this.getListingForSupplier(variant.listingId, supplierId);
    if (!listing) return undefined;
    return { variant, listing };
  }

  /** Recomputes and persists a listing's aggregate stock from the sum of its variants. */
  private async recalcListingAggregateStock(listingId: number) {
    const variants = await this.getVariantsByListingId(listingId);
    const aggStock = variants.reduce((s, v) => s + v.quantity, 0);
    await db.update(supplierProductListings).set({ stock: aggStock, updatedAt: new Date() }).where(eq(supplierProductListings.id, listingId));
  }

  /** Adjusts a single variant's stock (increase/decrease/set), enforcing that variant's own maxStock, and records history tagged to that variant. */
  async adjustVariantStock(variantId: number, supplierId: number, userId: number | null, input: { type: 'INCREASE' | 'DECREASE' | 'SET'; quantity: number; reason: string; notes?: string }) {
    const found = await this.getVariantForSupplier(variantId, supplierId);
    if (!found) throw new Error('Variant not found');
    const { variant } = found;

    const previousStock = variant.quantity;
    let newStock: number;
    if (input.type === 'INCREASE') newStock = previousStock + input.quantity;
    else if (input.type === 'DECREASE') newStock = previousStock - input.quantity;
    else newStock = input.quantity;
    if (newStock < 0) throw new Error('Stock cannot go below zero');
    if (variant.maxStock != null && newStock > variant.maxStock) {
      throw new Error(`Stock cannot exceed the maximum stock (${variant.maxStock}) configured for this variant`);
    }

    const [updatedVariant] = await db.update(supplierProductVariants)
      .set({ quantity: newStock })
      .where(eq(supplierProductVariants.id, variantId))
      .returning();

    await this.recalcListingAggregateStock(variant.listingId);

    const [history] = await db.insert(inventoryAdjustments).values({
      listingId: variant.listingId, variantId, flavorId: variant.flavorId ?? null, sizeId: variant.sizeId ?? null,
      supplierId, userId,
      adjustmentType: input.type,
      previousStock, newStock,
      difference: newStock - previousStock,
      reason: input.reason,
      notes: input.notes ?? null,
    }).returning();

    const [updatedListing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, variant.listingId));
    const lowStockTriggered = variant.minStock != null && newStock <= variant.minStock;
    return { variant: updatedVariant, listing: updatedListing, history, lowStockTriggered };
  }

  /** Updates a variant's min/max stock thresholds. Unit of measure is derived from size, not stored/editable here. */
  async updateVariantInventoryFields(variantId: number, supplierId: number, updates: { minStock?: number | null; maxStock?: number | null }) {
    const found = await this.getVariantForSupplier(variantId, supplierId);
    if (!found) throw new Error('Variant not found');
    const [updated] = await db.update(supplierProductVariants)
      .set(updates)
      .where(eq(supplierProductVariants.id, variantId))
      .returning();
    return updated;
  }

  async updateListingInventoryFields(listingId: number, supplierId: number, updates: { sku?: string | null; barcode?: string | null; minStock?: number; maxStock?: number | null; unit?: string; visibility?: 'VISIBLE' | 'HIDDEN' }) {
    const listing = await this.getListingForSupplier(listingId, supplierId);
    if (!listing) throw new Error('Listing not found');
    const [updated] = await db.update(supplierProductListings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(supplierProductListings.id, listingId))
      .returning();
    return updated;
  }

  /** System-driven stock restoration (order cancelled/refunded). No userId — shows as a system entry in history. */
  async restockFromOrderCancellation(listingId: number, quantity: number, reason: string) {
    const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, listingId));
    if (!listing) return;
    const variants = await this.getVariantsByListingId(listingId);
    const previousStock = listing.stock;
    const newStock = previousStock + quantity;
    await db.update(supplierProductListings).set({ stock: newStock, updatedAt: new Date() }).where(eq(supplierProductListings.id, listingId));
    await db.insert(inventoryAdjustments).values({
      listingId, supplierId: listing.supplierId, userId: null,
      adjustmentType: 'INCREASE', previousStock, newStock, difference: newStock - previousStock,
      reason, notes: null,
    });
  }

  async restockVariantFromOrderCancellation(variantId: number, quantity: number, reason: string) {
    const [variant] = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.id, variantId));
    if (!variant) return;
    const previousVariantStock = variant.quantity;
    await db.update(supplierProductVariants).set({ quantity: sql`${supplierProductVariants.quantity} + ${quantity}` }).where(eq(supplierProductVariants.id, variantId));
    const listingVariants = await this.getVariantsByListingId(variant.listingId);
    const aggStock = listingVariants.reduce((s, v) => s + v.quantity, 0);
    const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, variant.listingId));
    if (!listing) return;
    const previousStock = listing.stock;
    await db.update(supplierProductListings).set({ stock: aggStock, updatedAt: new Date() }).where(eq(supplierProductListings.id, variant.listingId));
    await db.insert(inventoryAdjustments).values({
      listingId: variant.listingId, variantId, flavorId: variant.flavorId ?? null, sizeId: variant.sizeId ?? null,
      supplierId: listing.supplierId, userId: null,
      adjustmentType: 'INCREASE', previousStock: previousVariantStock, newStock: previousVariantStock + quantity, difference: quantity,
      reason, notes: null,
    });
  }

  async bulkInventoryAction(supplierId: number, listingIds: number[], action: 'hide' | 'show' | 'delete' | 'setMinStock' | 'stock', payload?: { minStock?: number; type?: 'INCREASE' | 'DECREASE' | 'SET'; quantity?: number; reason?: string; userId?: number | null }) {
    const owned = await db.select().from(supplierProductListings).where(and(inArray(supplierProductListings.id, listingIds), eq(supplierProductListings.supplierId, supplierId)));
    const ids = owned.map((l) => l.id);
    if (!ids.length) return { updated: 0 };

    if (action === 'hide') {
      await db.update(supplierProductListings).set({ visibility: 'HIDDEN', updatedAt: new Date() }).where(inArray(supplierProductListings.id, ids));
    } else if (action === 'show') {
      await db.update(supplierProductListings).set({ visibility: 'VISIBLE', updatedAt: new Date() }).where(inArray(supplierProductListings.id, ids));
    } else if (action === 'delete') {
      // Use the single-listing deletion path so Pack relations are removed
      // and affected Packs keep their existing archive behavior.
      for (const listing of owned) {
        await this.deleteSupplierListing(listing.id);
      }
    } else if (action === 'setMinStock' && payload?.minStock !== undefined) {
      await db.update(supplierProductListings).set({ minStock: payload.minStock, updatedAt: new Date() }).where(inArray(supplierProductListings.id, ids));
    } else if (action === 'stock' && payload?.type && payload?.quantity !== undefined) {
      for (const listing of owned) {
        const variants = await this.getVariantsByListingId(listing.id);
        if (variants.length > 0) continue; // skip variant-tracked listings in bulk stock updates
        const previousStock = listing.stock;
        let newStock: number;
        if (payload.type === 'INCREASE') newStock = previousStock + payload.quantity;
        else if (payload.type === 'DECREASE') newStock = Math.max(0, previousStock - payload.quantity);
        else newStock = payload.quantity;
        await db.update(supplierProductListings).set({ stock: newStock, updatedAt: new Date() }).where(eq(supplierProductListings.id, listing.id));
        await db.insert(inventoryAdjustments).values({
          listingId: listing.id, supplierId, userId: payload.userId ?? null,
          adjustmentType: payload.type, previousStock, newStock, difference: newStock - previousStock,
          reason: payload.reason ?? 'Bulk update', notes: null,
        });
      }
    }
    return { updated: ids.length };
  }

  // ── Packs ────────────────────────────────────────────────────────────────────

  private async buildPackDetails(rows: Pack[]): Promise<PackDetail[]> {
    if (!rows.length) return [];
    const packIds = rows.map((p) => p.id);
    const allItems = await db.select().from(packItems).where(inArray(packItems.packId, packIds));
    const listingIds = Array.from(new Set(allItems.map((i) => i.listingId)));
    const listings = listingIds.length ? await db.select().from(supplierProductListings).where(inArray(supplierProductListings.id, listingIds)) : [];
    const listingMap = new Map(listings.map((l) => [l.id, l]));
    const variants = listingIds.length ? await db.select().from(supplierProductVariants).where(inArray(supplierProductVariants.listingId, listingIds)) : [];
    const variantMap = new Map(variants.map((v) => [v.id, v]));
    // Group variants by listing for flavor-distribution selection
    const variantsByListing = new Map<number, typeof variants>();
    for (const v of variants) {
      if (!variantsByListing.has(v.listingId)) variantsByListing.set(v.listingId, []);
      variantsByListing.get(v.listingId)!.push(v);
    }
    const selectedGroupVariants = (item: typeof allItems[number]) => {
      const representative = item.variantId != null ? variantMap.get(item.variantId) : undefined;
      const group = (variantsByListing.get(item.listingId) ?? []).filter((v) =>
        representative
          ? (v.sizeId ?? null) === (representative.sizeId ?? null)
          : true,
      );
      // NULL is the legacy value and intentionally means all currently
      // available flavors in this size group.
      if (item.flavorIds == null) return group.filter((v) => v.price > 0 && v.quantity > 0);
      const selected = new Set(item.flavorIds);
      return group.filter((v) => v.flavorId != null && selected.has(v.flavorId) && v.price > 0 && v.quantity > 0);
    };
    const productIds = Array.from(new Set(listings.map((l) => l.productId)));
    const prods = productIds.length ? await db.select().from(products).where(inArray(products.id, productIds)) : [];
    const productMap = new Map(prods.map((p) => [p.id, p]));

    // A Pack component is valid only while its listing is visible, its product
    // is active, and its selected inventory slot is currently sellable. A
    // zero-price or out-of-stock variant is no longer an active Pack choice,
    // just like a missing/hidden product. The onlyForMyProducts flag is also
    // the persisted "removed from Packs" state. Prune invalid rows here so
    // every Pack consumer gets the same result and stale rows do not remain
    // in the relation after a read.
    const validItems = allItems.filter((item) => {
      const listing = listingMap.get(item.listingId);
      const product = listing ? productMap.get(listing.productId) : undefined;
      if (!listing || listing.visibility !== 'VISIBLE' || listing.onlyForMyProducts || product?.status !== 'ACTIVE') {
        return false;
      }
      if (item.variantId != null) {
        const variant = variantMap.get(item.variantId);
        if (!variant || variant.listingId !== item.listingId || variant.price <= 0) return false;
        return selectedGroupVariants(item).length > 0;
      }
      return !(variantsByListing.get(item.listingId)?.length) && listing.price > 0 && listing.stock > 0;
    });
    const invalidItemIds = allItems
      .filter((item) => !validItems.some((valid) => valid.id === item.id))
      .map((item) => item.id);
    if (invalidItemIds.length) {
      await db.delete(packItems).where(inArray(packItems.id, invalidItemIds));
    }

    const supplierIds = Array.from(new Set(rows.map((p) => p.supplierId)));
    const suppliers = supplierIds.length ? await db.select().from(users).where(inArray(users.id, supplierIds)) : [];
    const supplierMap = new Map(suppliers.map((u) => [u.id, { name: u.name, lat: u.locationLat ?? null, lng: u.locationLng ?? null }]));
    const tx = await buildTaxonomyCache();
    const itemsByPack = new Map<number, typeof allItems>();
    for (const it of validItems) {
      if (!itemsByPack.has(it.packId)) itemsByPack.set(it.packId, []);
      itemsByPack.get(it.packId)!.push(it);
    }
    // Batch-fetch pack review stats
    const packReviews = packIds.length
      ? await db.select().from(supplierProductReviews)
          .where(and(inArray(supplierProductReviews.packId as any, packIds), eq(supplierProductReviews.reviewType, 'PACK')))
      : [];
    const reviewsByPack = new Map<number, typeof packReviews>();
    for (const r of packReviews) {
      const pid = (r as any).packId as number;
      if (!reviewsByPack.has(pid)) reviewsByPack.set(pid, []);
      reviewsByPack.get(pid)!.push(r);
    }
    // Batch-fetch supplier-level review stats (same source as StoreDetail.avgRating)
    const supplierReviews = supplierIds.length
      ? await db.select().from(supplierProductReviews)
          .where(and(inArray(supplierProductReviews.supplierId, supplierIds), eq(supplierProductReviews.reviewType as any, 'SUPPLIER')))
      : [];
    const supplierRatingMap = new Map<number, { sum: number; count: number }>();
    for (const r of supplierReviews) {
      const sid = r.supplierId!;
      if (!supplierRatingMap.has(sid)) supplierRatingMap.set(sid, { sum: 0, count: 0 });
      supplierRatingMap.get(sid)!.sum += r.rating;
      supplierRatingMap.get(sid)!.count += 1;
    }

    const now = new Date();
    const result: PackDetail[] = [];
    for (const pack of rows) {
      const items = itemsByPack.get(pack.id) ?? [];
      const itemDetails: PackItemDetail[] = [];
      const categoryIds = new Set<number>();
      const subCategoryIds = new Set<number>();
      const brandIds = new Set<number>();
      let maxBuildable = items.length ? Infinity : 0;
      for (const it of items) {
        const listing = listingMap.get(it.listingId);
        const product = listing ? productMap.get(listing.productId) : undefined;
        const variant = it.variantId ? variantMap.get(it.variantId) : undefined;
        const unitPrice = variant ? variant.price : (listing?.price ?? 0);
        const selectedVariants = variant ? selectedGroupVariants(it) : [];
        const availableQuantity = variant
          ? selectedVariants.reduce((sum, v) => sum + v.quantity, 0)
          : (listing?.stock ?? 0);
        if (product?.categoryId) categoryIds.add(product.categoryId);
        if (product?.subCategoryId) subCategoryIds.add(product.subCategoryId);
        if (product?.brandId) brandIds.add(product.brandId);
        const buildable = it.quantity > 0 ? Math.floor(availableQuantity / it.quantity) : 0;
        maxBuildable = Math.min(maxBuildable, buildable);
        // Variants of this listing that share the same size as the selected variant
        // (flavor distribution must stay within the supplier-created size group — never
        // mix flavors across sizes).
        const sameGroupVariants = selectedGroupVariants(it);
        const listingVariants: import('@shared/schema').PackVariantOption[] = sameGroupVariants.map((v) => ({
          variantId: v.id,
          flavorId: v.flavorId ?? null,
          flavorName: v.flavorId ? (tx.flvMap.get(v.flavorId)?.name ?? null) : null,
          sizeId: v.sizeId ?? null,
          sizeName: v.sizeId ? (tx.szMap.get(v.sizeId)?.name ?? null) : null,
          price: v.price,
          availableQuantity: v.quantity,
        }));
        itemDetails.push({
          id: it.id,
          listingId: it.listingId,
          variantId: it.variantId,
          flavorIds: it.flavorIds ?? null,
          quantity: it.quantity,
          packVariantPrice: (it as any).packVariantPrice ?? 0,
          productId: product?.id ?? 0,
          productName: product?.name ?? "Unknown product",
          productImageUrl: product?.imageUrl ?? null,
          categoryId: product?.categoryId ?? null,
          subCategoryId: product?.subCategoryId ?? null,
          brandId: product?.brandId ?? null,
          categoryName: product?.categoryId ? (tx.catMap.get(product.categoryId)?.name ?? null) : null,
          subCategoryName: product?.subCategoryId ? (tx.subMap.get(product.subCategoryId)?.name ?? null) : null,
          brandName: product?.brandId ? (tx.brdMap.get(product.brandId)?.name ?? null) : null,
          flavorId: variant?.flavorId ?? null,
          flavorName: variant?.flavorId ? (tx.flvMap.get(variant.flavorId)?.name ?? null) : null,
          sizeId: variant?.sizeId ?? null,
          sizeName: variant?.sizeId ? (tx.szMap.get(variant.sizeId)?.name ?? null) : null,
          unitPrice,
          availableQuantity,
          listingVariants,
        });
      }
      if (!isFinite(maxBuildable)) maxBuildable = 0;
      const isExpired = !!(pack.expirationDate && new Date(pack.expirationDate) < now);
      const isAvailable = !pack.isArchived && pack.visibility === 'VISIBLE' && !isExpired && maxBuildable > 0;
      const packRevs = reviewsByPack.get(pack.id) ?? [];
      const packReviewCount = packRevs.length;
      const packAvgRating = packReviewCount ? packRevs.reduce((s, r) => s + r.rating, 0) / packReviewCount : 0;
      const supplierInfo = supplierMap.get(pack.supplierId);
      const supRating = supplierRatingMap.get(pack.supplierId);
      result.push({
        ...pack,
        supplierName: supplierInfo?.name ?? "",
        supplierLat: supplierInfo?.lat ?? null,
        supplierLng: supplierInfo?.lng ?? null,
        supplierAvgRating: supRating ? supRating.sum / supRating.count : 0,
        supplierReviewCount: supRating?.count ?? 0,
        items: itemDetails,
        categoryIds: Array.from(categoryIds),
        subCategoryIds: Array.from(subCategoryIds),
        brandIds: Array.from(brandIds),
        categoryLabels: Array.from(categoryIds).map((id) => tx.catMap.get(id)).filter((l): l is NonNullable<typeof l> => !!l).map((l) => ({ id: l.id, name: l.name })),
        subCategoryLabels: Array.from(subCategoryIds).map((id) => tx.subMap.get(id)).filter((l): l is NonNullable<typeof l> => !!l).map((l) => ({ id: l.id, name: l.name })),
        brandLabels: Array.from(brandIds).map((id) => tx.brdMap.get(id)).filter((l): l is NonNullable<typeof l> => !!l).map((l) => ({ id: l.id, name: l.name })),
        maxBuildable,
        isAvailable,
        isExpired,
        packReviewCount,
        packAvgRating,
      });
    }
    return result;
  }

  async getSupplierPacks(supplierId: number): Promise<PackDetail[]> {
    const rows = await db.select().from(packs).where(and(eq(packs.supplierId, supplierId), eq(packs.isArchived, false))).orderBy(desc(packs.createdAt));
    const archived = await db.select().from(packs).where(and(eq(packs.supplierId, supplierId), eq(packs.isArchived, true))).orderBy(desc(packs.createdAt));
    return this.buildPackDetails([...rows, ...archived]);
  }

  async getPackDetail(id: number): Promise<PackDetail | undefined> {
    const [row] = await db.select().from(packs).where(eq(packs.id, id));
    if (!row) return undefined;
    const [detail] = await this.buildPackDetails([row]);
    return detail;
  }

  async validatePackItems(supplierId: number, items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number }[]): Promise<boolean> {
    if (!items.length) return false;
    const listingIds = Array.from(new Set(items.map((item) => item.listingId)));
    const listings = await db.select().from(supplierProductListings).where(inArray(supplierProductListings.id, listingIds));
    const listingMap = new Map(listings.map((listing) => [listing.id, listing]));
    if (listings.length !== listingIds.length || listings.some((listing) => listing.supplierId !== supplierId)) return false;

    const productIds = Array.from(new Set(listings.map((listing) => listing.productId)));
    const productRows = productIds.length ? await db.select().from(products).where(inArray(products.id, productIds)) : [];
    const productMap = new Map(productRows.map((product) => [product.id, product]));

    const allVariants = await db.select().from(supplierProductVariants)
      .where(inArray(supplierProductVariants.listingId, listingIds));
    const variantIds = items.map((item) => item.variantId).filter((id): id is number => id != null);
    const variantRows = variantIds.length
      ? allVariants.filter((variant) => variantIds.includes(variant.id))
      : [];
    const variantMap = new Map(variantRows.map((variant) => [variant.id, variant]));
    const variantsByListing = new Map<number, typeof allVariants>();
    for (const variant of allVariants) {
      if (!variantsByListing.has(variant.listingId)) variantsByListing.set(variant.listingId, []);
      variantsByListing.get(variant.listingId)!.push(variant);
    }

    return items.every((item) => {
      const listing = listingMap.get(item.listingId);
      const product = listing ? productMap.get(listing.productId) : undefined;
      if (!listing || listing.visibility !== 'VISIBLE' || listing.onlyForMyProducts || product?.status !== 'ACTIVE') return false;
      if (item.variantId != null) {
        const variant = variantMap.get(item.variantId);
        if (!variant || variant.listingId !== item.listingId || variant.price <= 0) return false;
        if (item.flavorIds == null) {
          return (variantsByListing.get(item.listingId) ?? []).some(v =>
            (v.sizeId ?? null) === (variant.sizeId ?? null) && v.price > 0 && v.quantity > 0,
          );
        }
        const selectedIds = new Set(item.flavorIds);
        return item.flavorIds.length > 0 && (variantsByListing.get(item.listingId) ?? []).some(v =>
          (v.sizeId ?? null) === (variant.sizeId ?? null) &&
          v.flavorId != null &&
          selectedIds.has(v.flavorId) &&
          v.price > 0 &&
          v.quantity > 0,
        );
      }
      return !variantsByListing.has(item.listingId) && listing.price > 0 && listing.stock > 0;
    });
  }

  async createPack(supplierId: number, data: { name: string; description?: string | null; imageUrl?: string | null; imageUrls?: string[] | null; flashImageUrl?: string | null; price: number; quantityAvailable: number; expirationDate?: Date | null; visibility?: 'VISIBLE' | 'HIDDEN' }, items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number; packVariantPrice?: number }[]): Promise<PackDetail> {
    const [pack] = await db.insert(packs).values({
      supplierId,
      name: data.name,
      description: data.description ?? null,
      imageUrl: data.imageUrl ?? null,
      imageUrls: data.imageUrls ?? null,
      flashImageUrl: data.flashImageUrl ?? null,
      price: data.price,
      quantityAvailable: data.quantityAvailable,
      expirationDate: data.expirationDate ?? null,
      visibility: data.visibility ?? 'VISIBLE',
    }).returning();
    if (items.length) {
      await db.insert(packItems).values(items.map((i) => ({ packId: pack.id, listingId: i.listingId, variantId: i.variantId ?? null, flavorIds: i.flavorIds ?? null, quantity: i.quantity, packVariantPrice: i.packVariantPrice ?? 0 })));
    }
    const [detail] = await this.buildPackDetails([pack]);
    return detail;
  }

  async updatePack(id: number, supplierId: number, data: Partial<{ name: string; description: string | null; imageUrl: string | null; imageUrls: string[] | null; flashImageUrl: string | null; price: number; quantityAvailable: number; expirationDate: Date | null; visibility: 'VISIBLE' | 'HIDDEN'; isArchived: boolean }>, items?: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number; packVariantPrice?: number }[]): Promise<PackDetail | undefined> {
    const [existing] = await db.select().from(packs).where(and(eq(packs.id, id), eq(packs.supplierId, supplierId)));
    if (!existing) return undefined;
    const [updated] = await db.update(packs).set({ ...data, updatedAt: new Date() } as any).where(eq(packs.id, id)).returning();
    if (items !== undefined) {
      await db.delete(packItems).where(eq(packItems.packId, id));
      if (items.length) {
        await db.insert(packItems).values(items.map((i) => ({ packId: id, listingId: i.listingId, variantId: i.variantId ?? null, flavorIds: i.flavorIds ?? null, quantity: i.quantity, packVariantPrice: i.packVariantPrice ?? 0 })));
      }
    }
    const [detail] = await this.buildPackDetails([updated]);
    return detail;
  }

  async duplicatePack(id: number, supplierId: number): Promise<PackDetail | undefined> {
    const [existing] = await db.select().from(packs).where(and(eq(packs.id, id), eq(packs.supplierId, supplierId)));
    if (!existing) return undefined;
    const existingItems = await db.select().from(packItems).where(eq(packItems.packId, id));
    return this.createPack(supplierId, {
      name: `${existing.name} (copy)`,
      description: existing.description,
      imageUrl: existing.imageUrl,
      imageUrls: existing.imageUrls,
      flashImageUrl: existing.flashImageUrl,
      price: existing.price,
      quantityAvailable: existing.quantityAvailable,
      expirationDate: existing.expirationDate,
      visibility: existing.visibility === 'VISIBLE' ? 'HIDDEN' : existing.visibility,
    }, existingItems.map((i) => ({ listingId: i.listingId, variantId: i.variantId, flavorIds: i.flavorIds, quantity: i.quantity, packVariantPrice: (i as any).packVariantPrice ?? 0 })));
  }

  async deletePack(id: number): Promise<void> {
    await db.delete(packFavorites).where(eq(packFavorites.packId, id));
    await db.delete(packItems).where(eq(packItems.packId, id));
    await db.delete(packs).where(eq(packs.id, id));
  }

  async getMarketplacePacks(filters?: { categoryId?: number; subCategoryId?: number; brandId?: number; flavorId?: number; sizeId?: number; supplierId?: number }): Promise<PackDetail[]> {
    let rows = await db.select().from(packs).where(and(eq(packs.visibility, 'VISIBLE'), eq(packs.isArchived, false)));
    if (filters?.supplierId) rows = rows.filter((p) => p.supplierId === filters.supplierId);
    let details = await this.buildPackDetails(rows);
    details = details.filter((p) => p.isAvailable);
    if (filters?.categoryId) details = details.filter((p) => p.categoryIds.includes(filters.categoryId!));
    if (filters?.subCategoryId) details = details.filter((p) => p.subCategoryIds.includes(filters.subCategoryId!));
    if (filters?.brandId) details = details.filter((p) => p.brandIds.includes(filters.brandId!));
    if (filters?.flavorId) details = details.filter((p) => p.items.some((i) => i.flavorId === filters.flavorId || i.listingVariants.some((v) => v.flavorId === filters.flavorId)));
    if (filters?.sizeId) details = details.filter((p) => p.items.some((i) => i.sizeId === filters.sizeId || i.listingVariants.some((v) => v.sizeId === filters.sizeId)));
    return details;
  }

  async getAdminPacks(): Promise<PackDetail[]> {
    const rows = await db.select().from(packs).orderBy(desc(packs.createdAt));
    return this.buildPackDetails(rows);
  }

  async computeAutoPackQuantity(items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number }[]): Promise<number> {
    if (!items.length) return 0;
    let max = Infinity;
    for (const it of items) {
      let availableQty = 0;
      if (it.variantId != null) {
        const [representative] = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.id, it.variantId));
        const group = await db.select().from(supplierProductVariants).where(and(
          eq(supplierProductVariants.listingId, it.listingId),
          representative?.sizeId == null ? isNull(supplierProductVariants.sizeId) : eq(supplierProductVariants.sizeId, representative.sizeId),
        ));
        const selected = it.flavorIds == null ? group : group.filter((v) => v.flavorId != null && it.flavorIds!.includes(v.flavorId));
        availableQty = selected.reduce((sum, v) => sum + (v.price > 0 && v.quantity > 0 ? v.quantity : 0), 0);
      } else {
        const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, it.listingId));
        availableQty = listing?.stock ?? 0;
      }
      const buildable = it.quantity > 0 ? Math.floor(availableQty / it.quantity) : 0;
      max = Math.min(max, buildable);
    }
    return isFinite(max) ? max : 0;
  }

  async computePackItemsTotal(items: { listingId: number; variantId?: number | null; flavorIds?: number[] | null; quantity: number }[]): Promise<number> {
    let total = 0;
    for (const it of items) {
      let unitPrice = 0;
      if (it.variantId != null) {
        const [representative] = await db.select().from(supplierProductVariants).where(eq(supplierProductVariants.id, it.variantId));
        const group = await db.select().from(supplierProductVariants).where(and(
          eq(supplierProductVariants.listingId, it.listingId),
          representative?.sizeId == null ? isNull(supplierProductVariants.sizeId) : eq(supplierProductVariants.sizeId, representative.sizeId),
        ));
        const selected = it.flavorIds == null ? group : group.filter((v) => v.flavorId != null && it.flavorIds!.includes(v.flavorId));
        // A pack may be built from any selected flavor; use the highest
        // selected original price for the discount safety check.
        unitPrice = selected.reduce((maxPrice, v) => Math.max(maxPrice, v.price), 0);
      } else {
        const [listing] = await db.select().from(supplierProductListings).where(eq(supplierProductListings.id, it.listingId));
        unitPrice = listing?.price ?? 0;
      }
      total += unitPrice * it.quantity;
    }
    return total;
  }

  async getPackFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select().from(packFavorites).where(eq(packFavorites.userId, userId));
    return rows.map((r) => r.packId);
  }

  async addPackFavorite(userId: number, packId: number): Promise<void> {
    const existing = await db.select().from(packFavorites).where(and(eq(packFavorites.userId, userId), eq(packFavorites.packId, packId)));
    if (existing.length) return;
    await db.insert(packFavorites).values({ userId, packId });
  }

  async removePackFavorite(userId: number, packId: number): Promise<void> {
    await db.delete(packFavorites).where(and(eq(packFavorites.userId, userId), eq(packFavorites.packId, packId)));
  }

  async getSupplierListingByProductId(supplierId: number, productId: number) {
    const [listing] = await db.select().from(supplierProductListings).where(
      and(eq(supplierProductListings.supplierId, supplierId), eq(supplierProductListings.productId, productId))
    );
    return listing;
  }

  // ── Supplier product workflow ───────────────────────────────────────────────

  async getSupplierCreatedProducts(supplierId: number) {
    const all = await db.select().from(products).where(
      and(eq(products.createdBySupplier, true), eq(products.createdByUserId, supplierId))
    );
    const tx = await buildTaxonomyCache();
    return all.map((p) => enrichProduct(p, tx));
  }

  async createSupplierProduct(data: Partial<InsertProduct>) {
    const [created] = await db.insert(products).values({
      ...data,
      name: (data.name ?? '') as string,
      isAdminProduct: false,
      status: 'PENDING',
      createdBySupplier: true,
      price: 0,
      stock: 0,
    } as any).returning();
    return created;
  }

  async updateSupplierProduct(id: number, supplierId: number, updates: Partial<InsertProduct>) {
    const [p] = await db.select().from(products).where(eq(products.id, id));
    if (!p || p.createdByUserId !== supplierId || p.status !== 'PENDING') return undefined;
    const [updated] = await db.update(products).set(updates as any).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteSupplierProduct(id: number, supplierId: number) {
    const [p] = await db.select().from(products).where(eq(products.id, id));
    if (!p || p.createdByUserId !== supplierId || p.status !== 'PENDING') {
      return { deleted: false, archivedPackIds: [] };
    }
    const listings = await db.select({ id: supplierProductListings.id })
      .from(supplierProductListings)
      .where(and(eq(supplierProductListings.productId, id), eq(supplierProductListings.supplierId, supplierId)));
    const archivedPackIds = new Set<number>();
    if (listings.length) {
      for (const listing of listings) {
        for (const packId of await this.deleteSupplierListing(listing.id)) archivedPackIds.add(packId);
      }
    }
    await db.delete(products).where(eq(products.id, id));
    return { deleted: true, archivedPackIds: Array.from(archivedPackIds) };
  }

  async getAdminSupplierProducts(): Promise<(ProductWithTaxonomy & { creatorName: string })[]> {
    const all = await db.select().from(products).where(
      and(eq(products.createdBySupplier, true), ne(products.status, 'ACTIVE'))
    );
    const tx = await buildTaxonomyCache();
    const supplierIds = Array.from(new Set(all.map((p) => p.createdByUserId).filter(Boolean))) as number[];
    const supplierRows = supplierIds.length ? await db.select().from(users).where(inArray(users.id, supplierIds)) : [];
    const supplierMap = new Map(supplierRows.map((u) => [u.id, u.name]));
    return all.map((p) => ({
      ...enrichProduct(p, tx),
      creatorName: p.createdByUserId ? (supplierMap.get(p.createdByUserId) ?? 'Unknown') : 'Unknown',
    }));
  }

  async approveSupplierProduct(id: number, adminId: number) {
    const [updated] = await db.update(products).set({
      status: 'ACTIVE',
      isAdminProduct: true,
      approvedBy: adminId,
      approvedAt: new Date(),
    } as any).where(eq(products.id, id)).returning();
    return updated;
  }

  async getServiceStates(): Promise<ServiceStatesMap> {
    const ALL_SERVICES: ServiceKey[] = ['PRINTING', 'MARKETING', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE', 'MAINTENANCE'];
    const rows = await db.select().from(platformServices);
    const map: ServiceStatesMap = { PRINTING: 'VISIBLE', MARKETING: 'VISIBLE', BARISTA_ACADEMY: 'VISIBLE', BARISTA_MARKETPLACE: 'VISIBLE', MAINTENANCE: 'VISIBLE' };
    for (const row of rows) {
      map[row.service as ServiceKey] = row.state as ServiceState;
    }
    const missing = ALL_SERVICES.filter((s) => !rows.some((r) => r.service === s));
    if (missing.length) {
      for (const service of missing) {
        await db.insert(platformServices).values({ service, state: 'VISIBLE' }).onConflictDoNothing();
      }
    }
    return map;
  }

  async setServiceState(service: ServiceKey, state: ServiceState): Promise<ServiceStatesMap> {
    const existing = await db.select().from(platformServices).where(eq(platformServices.service, service));
    if (existing.length) {
      await db.update(platformServices).set({ state, updatedAt: new Date() }).where(eq(platformServices.service, service));
    } else {
      await db.insert(platformServices).values({ service, state });
    }
    return this.getServiceStates();
  }

  async getMessagingSettings() {
    const [row] = await db.select().from(messagingSettings).limit(1);
    if (row) {
      return {
        globalVisible: row.globalVisible,
        supplierMessagingEnabled: row.supplierMessagingEnabled,
        maintenanceMessagingEnabled: row.maintenanceMessagingEnabled,
        baristaMessagingEnabled: row.baristaMessagingEnabled,
        broadcastsEnabled: row.broadcastsEnabled,
        gracePeriodMinutes: row.gracePeriodMinutes,
      };
    }
    const [created] = await db.insert(messagingSettings).values({}).returning();
    return {
      globalVisible: created.globalVisible,
      supplierMessagingEnabled: created.supplierMessagingEnabled,
      maintenanceMessagingEnabled: created.maintenanceMessagingEnabled,
      baristaMessagingEnabled: created.baristaMessagingEnabled,
      broadcastsEnabled: created.broadcastsEnabled,
      gracePeriodMinutes: created.gracePeriodMinutes,
    };
  }

  async updateMessagingSettings(updates: Partial<{
    globalVisible: boolean;
    supplierMessagingEnabled: boolean;
    maintenanceMessagingEnabled: boolean;
    baristaMessagingEnabled: boolean;
    broadcastsEnabled: boolean;
    gracePeriodMinutes: number;
  }>) {
    const current = await this.getMessagingSettings();
    const next = {
      ...current,
      ...updates,
      gracePeriodMinutes: Math.max(1, Math.min(240, Math.round(updates.gracePeriodMinutes ?? current.gracePeriodMinutes))),
    };
    const [row] = await db.select({ id: messagingSettings.id }).from(messagingSettings).limit(1);
    if (row) {
      await db.update(messagingSettings).set({ ...next, updatedAt: new Date() }).where(eq(messagingSettings.id, row.id));
    } else {
      await db.insert(messagingSettings).values(next);
    }
    return next;
  }

  async getServiceOrder(): Promise<MarketplaceServiceId[]> {
    const config = await this.getLandingConfig();
    const configured = Array.isArray(config.serviceOrder) ? config.serviceOrder : [];
    const valid = configured.filter((id): id is MarketplaceServiceId =>
      (DEFAULT_SERVICE_ORDER as readonly string[]).includes(id),
    );
    const uniqueValid = Array.from(new Set(valid));
    return [...uniqueValid, ...DEFAULT_SERVICE_ORDER.filter((id) => !uniqueValid.includes(id))];
  }

  async setServiceOrder(order: MarketplaceServiceId[]): Promise<MarketplaceServiceId[]> {
    const valid = order.length === DEFAULT_SERVICE_ORDER.length
      && new Set(order).size === DEFAULT_SERVICE_ORDER.length
      && order.every((id) => (DEFAULT_SERVICE_ORDER as readonly string[]).includes(id));
    if (!valid) throw new Error("Invalid service order");
    await this.updateLandingConfig({ serviceOrder: order });
    return order;
  }

  // ── Supplier stores ─────────────────────────────────────────────────────────

  async getSupplierStore(supplierId: number): Promise<SupplierStore | undefined> {
    const [store] = await db.select().from(supplierStores).where(eq(supplierStores.supplierId, supplierId));
    return store;
  }

  async upsertSupplierStore(supplierId: number, data: Partial<InsertSupplierStore>): Promise<SupplierStore> {
    const existing = await this.getSupplierStore(supplierId);
    if (!existing) {
      const [created] = await db.insert(supplierStores).values({
        supplierId,
        coverUrl: data.coverUrl ?? null,
        logoUrl: data.logoUrl ?? null,
        name: data.name ?? '',
        description: data.description ?? null,
        isOpen: data.isOpen ?? true,
        visibility: data.visibility ?? 'VISIBLE',
        approvalStatus: 'PENDING',
        mediaType: (data as any).mediaType ?? 'IMAGE',
        coverUrls: (data as any).coverUrls ?? [],
        videoUrl: (data as any).videoUrl ?? null,
        musicUrl: (data as any).musicUrl ?? null,
        openingHours: (data as any).openingHours ?? null,
      }).returning();
      return created;
    }
    const identityChanged = (
      (data.name !== undefined && data.name !== existing.name) ||
      (data.description !== undefined && (data.description ?? null) !== (existing.description ?? null)) ||
      (data.coverUrl !== undefined && (data.coverUrl ?? null) !== (existing.coverUrl ?? null)) ||
      (data.logoUrl !== undefined && (data.logoUrl ?? null) !== (existing.logoUrl ?? null))
    );
    let approvalStatus = existing.approvalStatus;
    const storeHasAutoApprove = (existing as any).autoApprove === true;
    if (identityChanged && !storeHasAutoApprove && (existing.approvalStatus === 'APPROVED' || existing.approvalStatus === 'REJECTED')) {
      approvalStatus = 'PENDING';
    }
    const [updated] = await db.update(supplierStores).set({
      ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl } : {}),
      ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.isOpen !== undefined ? { isOpen: data.isOpen } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
      ...((data as any).mediaType !== undefined ? { mediaType: (data as any).mediaType } : {}),
      ...((data as any).coverUrls !== undefined ? { coverUrls: (data as any).coverUrls } : {}),
      ...((data as any).videoUrl !== undefined ? { videoUrl: (data as any).videoUrl } : {}),
      ...((data as any).musicUrl !== undefined ? { musicUrl: (data as any).musicUrl } : {}),
      ...((data as any).openingHours !== undefined ? { openingHours: (data as any).openingHours } : {}),
      approvalStatus,
      updatedAt: new Date(),
    }).where(eq(supplierStores.id, existing.id)).returning();
    return updated;
  }

  private async buildStoreCards(stores: SupplierStore[]): Promise<StoreCard[]> {
    if (!stores.length) return [];
    const supplierIds = stores.map((s) => s.supplierId);
    const [allUsers, allListings, allProducts] = await Promise.all([
      db.select().from(users).where(inArray(users.id, supplierIds)),
      db.select().from(supplierProductListings).where(inArray(supplierProductListings.supplierId, supplierIds)),
      db.select().from(products),
    ]);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const productMap = new Map(allProducts.map((p) => [p.id, p]));
    const listingsBySupplier = new Map<number, typeof allListings>();
    for (const l of allListings) {
      if (!listingsBySupplier.has(l.supplierId)) listingsBySupplier.set(l.supplierId, []);
      listingsBySupplier.get(l.supplierId)!.push(l);
    }
    return stores.map((store) => {
      const supplier = userMap.get(store.supplierId);
       const listings = (listingsBySupplier.get(store.supplierId) ?? []).filter(
         (l) => l.visibility === 'VISIBLE' && !l.onlyForPack && l.stock > 0 && l.price > 0,
       );
      const categoryIds = new Set<number>();
      const subCategoryIds = new Set<number>();
      const brandIds = new Set<number>();
      for (const l of listings) {
        const prod = productMap.get(l.productId);
        if (!prod) continue;
        if (prod.categoryId) categoryIds.add(prod.categoryId);
        if (prod.subCategoryId) subCategoryIds.add(prod.subCategoryId);
        if (prod.brandId) brandIds.add(prod.brandId);
      }
      return {
        id: store.id,
        supplierId: store.supplierId,
        name: store.name,
        description: store.description,
        coverUrl: store.coverUrl,
        logoUrl: store.logoUrl,
        isOpen: store.isOpen,
        visibility: store.visibility,
        approvalStatus: store.approvalStatus,
        supplierLat: supplier?.locationLat ?? null,
        supplierLng: supplier?.locationLng ?? null,
        categoryIds: Array.from(categoryIds),
        subCategoryIds: Array.from(subCategoryIds),
        brandIds: Array.from(brandIds),
        productCount: listings.length,
        displayOrder: (store as any).displayOrder ?? 0,
        mediaType: ((store as any).mediaType ?? 'IMAGE') as 'IMAGE' | 'VIDEO',
        coverUrls: (store as any).coverUrls ?? [],
        videoUrl: (store as any).videoUrl ?? null,
        musicUrl: (store as any).musicUrl ?? null,
        openingHours: (store as any).openingHours ?? null,
      };
    });
  }

  async getAllStoresAdmin(): Promise<StoreAdminRow[]> {
    const stores = await db.select().from(supplierStores);
    const cards = await this.buildStoreCards(stores);
    const supplierIds = stores.map((s) => s.supplierId);
    const allUsers = await db.select().from(users).where(inArray(users.id, supplierIds));
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const storeMap = new Map(stores.map((s) => [s.id, s]));
    return cards.map((card) => {
      const supplier = userMap.get(card.supplierId);
      const store = storeMap.get(card.id)!;
      return {
        ...card,
        supplierName: supplier?.name ?? '',
        supplierEmail: supplier?.email ?? '',
        autoApprove: (store as any).autoApprove ?? false,
        createdAt: store.createdAt,
        updatedAt: store.updatedAt,
      };
    });
  }

  async setStoreApprovalStatus(id: number, status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ON_HOLD'): Promise<SupplierStore | undefined> {
    const [updated] = await db.update(supplierStores).set({ approvalStatus: status, updatedAt: new Date() }).where(eq(supplierStores.id, id)).returning();
    return updated;
  }

  async setStoreAutoApprove(id: number, autoApprove: boolean): Promise<SupplierStore | undefined> {
    const [updated] = await db.update(supplierStores).set({ autoApprove, updatedAt: new Date() } as any).where(eq(supplierStores.id, id)).returning();
    return updated;
  }

  async updateStoreDisplayOrder(id: number, displayOrder: number): Promise<SupplierStore | undefined> {
    const [updated] = await db.update(supplierStores).set({ displayOrder, updatedAt: new Date() }).where(eq(supplierStores.id, id)).returning();
    return updated;
  }

  async bulkUpdateStoreOrder(orders: { id: number; displayOrder: number }[]): Promise<void> {
    await Promise.all(orders.map(({ id, displayOrder }) =>
      db.update(supplierStores).set({ displayOrder, updatedAt: new Date() }).where(eq(supplierStores.id, id))
    ));
  }

  async deleteStore(id: number): Promise<void> {
    await db.delete(storeFavorites).where(eq(storeFavorites.storeId, id));
    await db.delete(supplierStores).where(eq(supplierStores.id, id));
  }

  async getVisibleStores(): Promise<StoreCard[]> {
    const stores = await db.select().from(supplierStores)
      .where(and(eq(supplierStores.approvalStatus, 'APPROVED'), eq(supplierStores.visibility, 'VISIBLE')))
      .orderBy(asc(supplierStores.displayOrder), asc(supplierStores.id));
    const cards = await this.buildStoreCards(stores);
    // Only return stores that have at least one available product
    return cards.filter((c) => c.productCount > 0);
  }

  async getStoreDetail(id: number, opts?: { requireVisible?: boolean }): Promise<StoreDetail | undefined> {
    const [store] = await db.select().from(supplierStores).where(eq(supplierStores.id, id));
    if (!store) return undefined;
    if (opts?.requireVisible && (store.approvalStatus !== 'APPROVED' || store.visibility !== 'VISIBLE')) return undefined;
    const [card] = await this.buildStoreCards([store]);
    const [listings, reviewRows] = await Promise.all([
      db.select().from(supplierProductListings).where(eq(supplierProductListings.supplierId, store.supplierId)),
      db.select().from(supplierProductReviews).where(
        and(eq(supplierProductReviews.supplierId, store.supplierId), eq(supplierProductReviews.reviewType as any, 'SUPPLIER'))
      ),
    ]);
    const activeListings = listings.filter(
      (l) => l.visibility === 'VISIBLE' && !l.onlyForPack && l.stock > 0 && l.price > 0,
    );
    const reviewCount = reviewRows.length;
    const avgRating = reviewCount ? reviewRows.reduce((s, r) => s + r.rating, 0) / reviewCount : 0;
    if (!activeListings.length) return { ...card, products: [], avgRating, reviewCount };
    const productIds = activeListings.map((l) => l.productId);
    const listingIds = activeListings.map((l) => l.id);
    const [prods, productReviewRows, promoListings] = await Promise.all([
      db.select().from(products).where(inArray(products.id, productIds)),
      db.select().from(supplierProductReviews).where(
        and(
          inArray(supplierProductReviews.productId as any, productIds),
          eq(supplierProductReviews.reviewType as any, 'PRODUCT')
        )
      ),
      this.getPromotionsForListings(listingIds, undefined),
    ]);
    const promoListingSet = new Set(promoListings.map((p) => p.listingId));
    const listingByProduct = new Map(activeListings.map((l) => [l.productId, l]));
    const productReviewStats = new Map<number, { sum: number; count: number }>();
    for (const r of productReviewRows) {
      if (!r.productId) continue;
      const s = productReviewStats.get(r.productId) ?? { sum: 0, count: 0 };
      s.sum += r.rating; s.count += 1;
      productReviewStats.set(r.productId, s);
    }
    const tx = await buildTaxonomyCache();
    const enriched = prods.map((p) => {
      const listing = listingByProduct.get(p.id)!;
      const stats = productReviewStats.get(p.id);
      return {
        ...enrichProduct(p, tx),
        price: listing.price, bestPrice: listing.price, totalStock: listing.stock,
        listingId: listing.id,
        hasPromo: promoListingSet.has(listing.id),
         listingPromotions: promoListings.filter((promo) => promo.listingId === listing.id),
        avgRating: stats ? stats.sum / stats.count : 0,
        reviewCount: stats?.count ?? 0,
      } as unknown as ProductWithTaxonomy;
    });
    return { ...card, products: enriched, avgRating, reviewCount };
  }

  // ── Store favorites ─────────────────────────────────────────────────────────

  async getStoreFavoritesByUser(userId: number): Promise<number[]> {
    const rows = await db.select().from(storeFavorites).where(eq(storeFavorites.userId, userId));
    return rows.map((r) => r.storeId);
  }

  async addStoreFavorite(userId: number, storeId: number): Promise<void> {
    const existing = await db.select().from(storeFavorites)
      .where(and(eq(storeFavorites.userId, userId), eq(storeFavorites.storeId, storeId)));
    if (existing.length) return;
    await db.insert(storeFavorites).values({ userId, storeId });
  }

  async removeStoreFavorite(userId: number, storeId: number): Promise<void> {
    await db.delete(storeFavorites).where(and(eq(storeFavorites.userId, userId), eq(storeFavorites.storeId, storeId)));
  }

  // ── Reviews ──────────────────────────────────────────────────────────────────

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
    const [row] = await db.insert(supplierProductReviews).values({
      supplierId: data.supplierId ?? null,
      reviewType: data.reviewType ?? 'SUPPLIER',
      cafeId: data.cafeId,
      productId: data.productId ?? null,
      listingId: data.listingId ?? null,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      productName: data.productName ?? null,
    } as any).returning();
    return row;
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
    // Find existing review for this cafe/product or cafe/supplier
    let existing: SupplierProductReview | undefined;
    if (data.reviewType === 'PRODUCT' && data.productId) {
      const [row] = await db.select().from(supplierProductReviews)
        .where(and(
          eq(supplierProductReviews.productId, data.productId),
          eq(supplierProductReviews.cafeId, data.cafeId),
          eq(supplierProductReviews.reviewType, 'PRODUCT')
        ));
      existing = row;
    } else if (data.reviewType === 'SUPPLIER' && data.supplierId) {
      const [row] = await db.select().from(supplierProductReviews)
        .where(and(
          eq(supplierProductReviews.supplierId, data.supplierId),
          eq(supplierProductReviews.cafeId, data.cafeId),
          eq(supplierProductReviews.reviewType, 'SUPPLIER')
        ));
      existing = row;
    }

    if (existing) {
      const [updated] = await db.update(supplierProductReviews)
        .set({ rating: data.rating, comment: data.comment ?? null, updatedAt: new Date() } as any)
        .where(eq(supplierProductReviews.id, existing.id))
        .returning();
      return { review: updated, isUpdate: true };
    }

    const [row] = await db.insert(supplierProductReviews).values({
      supplierId: data.supplierId ?? null,
      reviewType: data.reviewType,
      cafeId: data.cafeId,
      productId: data.productId ?? null,
      listingId: data.listingId ?? null,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      productName: data.productName ?? null,
    } as any).returning();
    return { review: row, isUpdate: false };
  }

  async getReviewsBySupplier(supplierId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(eq(supplierProductReviews.supplierId, supplierId))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async getProductReviewsBySupplier(supplierId: number): Promise<SupplierProductReview[]> {
    // Product reviews for products this supplier has a listing for
    const listings = await db.select({ productId: supplierProductListings.productId })
      .from(supplierProductListings)
      .where(eq(supplierProductListings.supplierId, supplierId));
    const productIds = listings.map((l) => l.productId);
    if (!productIds.length) return [];
    return db.select().from(supplierProductReviews)
      .where(and(
        inArray(supplierProductReviews.productId, productIds),
        eq(supplierProductReviews.reviewType, 'PRODUCT')
      ))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async getSupplierTypeReviews(supplierId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.supplierId, supplierId),
        eq(supplierProductReviews.reviewType, 'SUPPLIER')
      ))
      .orderBy(desc(supplierProductReviews.createdAt));
  }

  async reportReview(reviewId: number, reason: string): Promise<void> {
    await db.update(supplierProductReviews)
      .set({ reportedAt: new Date(), reportReason: reason } as any)
      .where(eq(supplierProductReviews.id, reviewId));
  }

  async resolveReviewReport(reviewId: number): Promise<void> {
    await db.update(supplierProductReviews)
      .set({ resolvedAt: new Date() } as any)
      .where(eq(supplierProductReviews.id, reviewId));
  }

  async deleteReview(reviewId: number): Promise<void> {
    const [review] = await db.select({
      maintenanceUserId: supplierProductReviews.maintenanceUserId,
      reviewType: supplierProductReviews.reviewType,
    }).from(supplierProductReviews).where(eq(supplierProductReviews.id, reviewId));
    await db.delete(supplierProductReviews).where(eq(supplierProductReviews.id, reviewId));
    if (review?.reviewType === "MAINTENANCE" && review.maintenanceUserId) {
      await this.refreshMaintenanceReviewStats(review.maintenanceUserId);
    }
  }

  async getAllReviews(filters?: { reviewType?: string; reported?: boolean }): Promise<SupplierProductReview[]> {
    const conditions: any[] = [];
    if (filters?.reviewType) conditions.push(eq(supplierProductReviews.reviewType, filters.reviewType));
    if (filters?.reported) conditions.push(sql`${supplierProductReviews.reportedAt} IS NOT NULL`);
    const rows = await db.select().from(supplierProductReviews)
      .where(conditions.length ? (conditions.length === 1 ? conditions[0] : and(...conditions)) : undefined)
      .orderBy(desc(supplierProductReviews.createdAt));

    // Keep the Admin Maintenance Reviews view on the same user-backed source
    // of truth as the Maintenance overview, without changing other review
    // categories or their existing response shape.
    const maintenanceIds = Array.from(new Set(rows
      .filter((review) => review.reviewType === "MAINTENANCE")
      .flatMap((review) => [review.maintenanceUserId, review.cafeId])
      .filter((id): id is number => typeof id === "number")));
    if (maintenanceIds.length === 0) return rows;
    const relatedUsers = await db.select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, maintenanceIds));
    const names = new Map(relatedUsers.map((user) => [user.id, user.name]));
    return rows.map((review) => review.reviewType === "MAINTENANCE"
      ? ({
          ...review,
          maintenanceName: names.get(review.maintenanceUserId ?? 0) ?? review.cafeName,
          reviewerName: names.get(review.cafeId) ?? review.cafeName,
        } as any)
      : review);
  }

  async getExistingProductReview(productId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    const [row] = await db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.productId, productId),
        eq(supplierProductReviews.cafeId, cafeId),
        eq(supplierProductReviews.reviewType, 'PRODUCT')
      ));
    return row;
  }

  async getExistingSupplierReview(supplierId: number, cafeId: number): Promise<SupplierProductReview | undefined> {
    const [row] = await db.select().from(supplierProductReviews)
      .where(and(
        eq(supplierProductReviews.supplierId, supplierId),
        eq(supplierProductReviews.cafeId, cafeId),
        eq(supplierProductReviews.reviewType, 'SUPPLIER')
      ));
    return row;
  }

  async getReviewStatsByProduct(productId: number): Promise<{
    product: { avgRating: number; total: number };
    overall: { avgRating: number; total: number };
    bySupplier: Record<number, { avgRating: number; total: number }>;
  }> {
    const rows = await db.select().from(supplierProductReviews)
      .where(eq(supplierProductReviews.productId, productId));
    if (!rows.length) return { product: { avgRating: 0, total: 0 }, overall: { avgRating: 0, total: 0 }, bySupplier: {} };

    const productReviews = rows.filter(r => (r as any).reviewType === 'PRODUCT' || !r.supplierId);
    const supplierReviews = rows.filter(r => (r as any).reviewType !== 'PRODUCT' && !!r.supplierId);

    const productTotal = productReviews.length;
    const productAvg = productTotal ? productReviews.reduce((s, r) => s + r.rating, 0) / productTotal : 0;

    const bySupplier: Record<number, { sum: number; count: number }> = {};
    for (const r of supplierReviews) {
      if (!r.supplierId) continue;
      if (!bySupplier[r.supplierId]) bySupplier[r.supplierId] = { sum: 0, count: 0 };
      bySupplier[r.supplierId].sum += r.rating;
      bySupplier[r.supplierId].count += 1;
    }

    const total = rows.length;
    const avgRating = total ? rows.reduce((s, r) => s + r.rating, 0) / total : 0;
    return {
      product: { avgRating: productAvg, total: productTotal },
      overall: { avgRating, total },
      bySupplier: Object.fromEntries(
        Object.entries(bySupplier).map(([sid, { sum, count }]) => [
          sid, { avgRating: sum / count, total: count }
        ])
      ) as Record<number, { avgRating: number; total: number }>,
    };
  }
  // ── Pack Reviews ─────────────────────────────────────────────────────────────

  async getPackReviews(packId: number): Promise<SupplierProductReview[]> {
    return db.select().from(supplierProductReviews)
      .where(and(eq(supplierProductReviews.packId as any, packId), eq(supplierProductReviews.reviewType, 'PACK')))
      .orderBy(desc(supplierProductReviews.createdAt));
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
    const [row] = await db.insert(supplierProductReviews).values({
      supplierId: data.supplierId,
      reviewType: 'PACK',
      cafeId: data.cafeId,
      packId: data.packId,
      productId: null,
      listingId: null,
      rating: data.rating,
      comment: data.comment ?? null,
      cafeName: data.cafeName,
      cafeOwnerName: data.cafeOwnerName,
      productName: null,
    } as any).returning();
    return row;
  }

  // ── Landing Config ──────────────────────────────────────────────────────────

  async getLandingConfig(): Promise<LandingConfig> {
    const rows = await db.select().from(landingConfig).limit(1);
    if (rows.length > 0) return rows[0];
    // Auto-create default row
    const [created] = await db.insert(landingConfig).values({}).returning();
    return created;
  }

  async updateLandingConfig(data: Partial<Omit<LandingConfig, "id" | "updatedAt">>): Promise<LandingConfig> {
    const existing = await this.getLandingConfig();
    const [updated] = await db
      .update(landingConfig)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(landingConfig.id, existing.id))
      .returning();
    return updated;
  }

  async getCurrency(): Promise<string> {
    const config = await this.getLandingConfig();
    return config.currency ?? 'DT';
  }

  async setCurrency(symbol: string): Promise<string> {
    await this.updateLandingConfig({ currency: symbol });
    return symbol;
  }

  // ── Prospecting ──────────────────────────────────────────────────────────────

  async getProspects(params: {
    search?: string; status?: string; prospectType?: string; city?: string;
    assignedTo?: number | null; hasPhone?: boolean; hasWebsite?: boolean; hasEmail?: boolean;
    page?: number; limit?: number; sortBy?: string; sortOrder?: string;
  }): Promise<{ prospects: Prospect[]; total: number }> {
    const { search, status, prospectType, city, hasPhone, hasWebsite, hasEmail, page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc' } = params;
    const conds: any[] = [isNull(prospects.deletedAt)];
    if (search?.trim()) {
      const q = `%${search.trim()}%`;
      conds.push(or(like(prospects.businessName, q), like(prospects.phone as any, q), like(prospects.city as any, q), like(prospects.address as any, q)));
    }
    if (status) conds.push(eq(prospects.status, status));
    if (prospectType) conds.push(eq(prospects.prospectType as any, prospectType));
    if (city) conds.push(like(prospects.city as any, `%${city}%`));
    if (hasPhone === true) conds.push(isNotNull(prospects.phone));
    if (hasPhone === false) conds.push(isNull(prospects.phone));
    if (hasWebsite === true) conds.push(isNotNull(prospects.website));
    if (hasWebsite === false) conds.push(isNull(prospects.website));
    if (hasEmail === true) conds.push(isNotNull(prospects.email));
    const where = conds.length === 1 ? conds[0] : and(...conds);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(prospects).where(where);
    const offset = (page - 1) * limit;
    let orderCol: any;
    if (sortBy === 'businessName') orderCol = sortOrder === 'asc' ? asc(prospects.businessName) : desc(prospects.businessName);
    else if (sortBy === 'rating') orderCol = sortOrder === 'asc' ? asc(prospects.rating) : desc(prospects.rating);
    else if (sortBy === 'reviewCount') orderCol = sortOrder === 'asc' ? asc(prospects.reviewCount) : desc(prospects.reviewCount);
    else if (sortBy === 'distanceKm') orderCol = sortOrder === 'asc' ? asc(prospects.distanceKm) : desc(prospects.distanceKm);
    else orderCol = sortOrder === 'asc' ? asc(prospects.createdAt) : desc(prospects.createdAt);
    const rows = await db.select().from(prospects).where(where).orderBy(orderCol).limit(limit).offset(offset);
    return { prospects: rows, total: count };
  }

  async getProspect(id: number): Promise<Prospect | null> {
    const [row] = await db.select().from(prospects).where(and(eq(prospects.id, id), isNull(prospects.deletedAt)));
    return row ?? null;
  }

  async createProspect(data: Partial<InsertProspect>): Promise<Prospect> {
    const [row] = await db.insert(prospects).values({
      ...data,
      notes: (data.notes as any) ?? [],
      timeline: (data.timeline as any) ?? [],
      contacts: (data.contacts as any) ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return row;
  }

  async updateProspect(id: number, data: Partial<InsertProspect>): Promise<Prospect> {
    const [row] = await db.update(prospects).set({ ...data as any, updatedAt: new Date() }).where(eq(prospects.id, id)).returning();
    return row;
  }

  async softDeleteProspect(id: number): Promise<void> {
    await db.update(prospects).set({ deletedAt: new Date(), updatedAt: new Date() } as any).where(eq(prospects.id, id));
  }

  async bulkUpdateProspects(ids: number[], data: Partial<Prospect>): Promise<void> {
    if (!ids.length) return;
    await db.update(prospects).set({ ...data as any, updatedAt: new Date() }).where(inArray(prospects.id, ids));
  }

  async bulkSoftDeleteProspects(ids: number[]): Promise<void> {
    if (!ids.length) return;
    await db.update(prospects).set({ deletedAt: new Date(), updatedAt: new Date() } as any).where(inArray(prospects.id, ids));
  }

  async getProspectStats(): Promise<ProspectStats> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 86400000);
    const all = await db.select().from(prospects).where(isNull(prospects.deletedAt));
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let withPhone = 0, withWebsite = 0, withEmail = 0, ratingSum = 0, ratingCount = 0;
    let followUpsToday = 0, overdueFollowUps = 0, convertedCount = 0, calledToday = 0, interestedCount = 0;
    for (const p of all) {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
      if (p.prospectType) byType[p.prospectType] = (byType[p.prospectType] ?? 0) + 1;
      if (p.phone) withPhone++;
      if (p.website) withWebsite++;
      if (p.email) withEmail++;
      if (p.rating) { const r = parseFloat(p.rating); if (!isNaN(r)) { ratingSum += r; ratingCount++; } }
      if (p.status === 'CONVERTED') convertedCount++;
      if (p.status === 'INTERESTED') interestedCount++;
      if (p.nextFollowUpDate) {
        const fd = new Date(p.nextFollowUpDate);
        if (fd >= todayStart && fd < tomorrowStart) followUpsToday++;
        if (fd < todayStart) overdueFollowUps++;
      }
      if (p.lastContactDate) { const ld = new Date(p.lastContactDate); if (ld >= todayStart) calledToday++; }
    }
    return { total: all.length, byStatus, byType, withPhone, withWebsite, withEmail, avgRating: ratingCount > 0 ? ratingSum / ratingCount : 0, followUpsToday, overdueFollowUps, convertedCount, calledToday, interestedCount };
  }

  async findDuplicateProspect(data: { googlePlaceId?: string; phone?: string }): Promise<Prospect | null> {
    if (data.googlePlaceId) {
      const [row] = await db.select().from(prospects).where(and(eq(prospects.googlePlaceId as any, data.googlePlaceId), isNull(prospects.deletedAt)));
      if (row) return row;
    }
    if (data.phone) {
      const [row] = await db.select().from(prospects).where(and(eq(prospects.phone as any, data.phone), isNull(prospects.deletedAt)));
      if (row) return row;
    }
    return null;
  }

  // ── Promotions ──────────────────────────────────────────────────────────────

  async getPromotions(supplierId: number): Promise<import("@shared/schema").Promotion[]> {
    return db.select().from(promotions)
      .where(eq(promotions.supplierId, supplierId))
      .orderBy(desc(promotions.priority), desc(promotions.createdAt));
  }

  async getPromotion(id: number, supplierId?: number): Promise<import("@shared/schema").Promotion | undefined> {
    const conds = [eq(promotions.id, id)];
    if (supplierId != null) conds.push(eq(promotions.supplierId, supplierId));
    const [row] = await db.select().from(promotions).where(and(...conds));
    return row;
  }

  async createPromotion(data: import("@shared/schema").InsertPromotion): Promise<import("@shared/schema").Promotion> {
    const [row] = await db.insert(promotions).values(data as any).returning();
    return row;
  }

  async updatePromotion(id: number, supplierId: number, updates: Partial<import("@shared/schema").InsertPromotion>): Promise<import("@shared/schema").Promotion | undefined> {
    const [row] = await db.update(promotions)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(and(eq(promotions.id, id), eq(promotions.supplierId, supplierId)))
      .returning();
    return row;
  }

  async deletePromotion(id: number, supplierId: number): Promise<void> {
    await db.delete(promotions).where(and(eq(promotions.id, id), eq(promotions.supplierId, supplierId)));
  }

  async duplicatePromotion(id: number, supplierId: number): Promise<import("@shared/schema").Promotion | undefined> {
    const [orig] = await db.select().from(promotions).where(and(eq(promotions.id, id), eq(promotions.supplierId, supplierId)));
    if (!orig) return undefined;
    const { id: _id, createdAt: _ca, updatedAt: _ua, usageCount: _uc, ...rest } = orig;
    const [dup] = await db.insert(promotions).values({
      ...rest,
      name: `${orig.name} (Copy)`,
      status: 'PAUSED',
      usageCount: 0,
    } as any).returning();
    return dup;
  }

  async getPromotionStats(supplierId: number): Promise<{ active: number; paused: number; scheduled: number; expired: number; totalUses: number; totalRevenue: number; totalDiscount: number }> {
    const all = await db.select().from(promotions).where(eq(promotions.supplierId, supplierId));
    const now = new Date();
    let active = 0, paused = 0, scheduled = 0, expired = 0, totalUses = 0;
    for (const p of all) {
      totalUses += p.usageCount;
      if (p.status === 'PAUSED') { paused++; continue; }
      if (p.endDate && p.endDate < now) { expired++; continue; }
      if (p.startDate && p.startDate > now) { scheduled++; continue; }
      if (p.status === 'ACTIVE') active++;
      else if (p.status === 'SCHEDULED') scheduled++;
      else if (p.status === 'EXPIRED') expired++;
    }
    const usageRows = await db.select().from(promotionUsage).where(
      inArray(promotionUsage.promotionId, all.map(p => p.id).filter(Boolean))
    );
    const totalDiscount = usageRows.reduce((s, r) => s + r.discountAmount, 0);
    // Revenue: sum of order totals that used a promotion from this supplier
    const orderIds = Array.from(new Set(usageRows.map(r => r.orderId)));
    let totalRevenue = 0;
    if (orderIds.length > 0) {
      const orderRows = await db.select().from(orders).where(inArray(orders.id, orderIds));
      totalRevenue = orderRows.reduce((s, o) => s + o.totalAmount, 0);
    }
    return { active, paused, scheduled, expired, totalUses, totalRevenue, totalDiscount };
  }

  async getPromotionUsage(promotionId: number): Promise<import("@shared/schema").PromotionUsage[]> {
    return db.select().from(promotionUsage)
      .where(eq(promotionUsage.promotionId, promotionId))
      .orderBy(desc(promotionUsage.createdAt));
  }

  async getActivePromotionsForSupplier(supplierId: number, cafeId?: number): Promise<import("@shared/schema").Promotion[]> {
    const now = new Date();
    const rows = await db.select().from(promotions).where(and(
      eq(promotions.supplierId, supplierId),
      eq(promotions.status, 'ACTIVE'),
    ));
    return rows.filter(p => {
      if (p.startDate && p.startDate > now) return false;
      if (p.endDate && p.endDate < now) return false;
      if (p.maxUses != null && p.usageCount >= p.maxUses) return false;
      if (cafeId != null && p.eligibleCafeIds && p.eligibleCafeIds.length > 0) {
        return p.eligibleCafeIds.includes(cafeId);
      }
      return true;
    });
  }

  async getPromotionsForListings(listingIds: number[], cafeId?: number): Promise<import("@shared/schema").ListingPromotion[]> {
    if (listingIds.length === 0) return [];
    // Get all supplier IDs for these listings
    const listingRows = await db.select().from(supplierProductListings)
      .where(inArray(supplierProductListings.id, listingIds));
    const supplierIds = Array.from(new Set(listingRows.map(l => l.supplierId)));
    if (supplierIds.length === 0) return [];

    const now = new Date();
    const promoRows = await db.select().from(promotions).where(and(
      inArray(promotions.supplierId, supplierIds),
      eq(promotions.status, 'ACTIVE'),
    ));
    const active = promoRows.filter(p => {
      if (p.startDate && p.startDate > now) return false;
      if (p.endDate && p.endDate < now) return false;
      if (p.maxUses != null && p.usageCount >= p.maxUses) return false;
      if (cafeId != null && p.eligibleCafeIds && p.eligibleCafeIds.length > 0) {
        return p.eligibleCafeIds.includes(cafeId);
      }
      return true;
    });

    const result: import("@shared/schema").ListingPromotion[] = [];
    const supplierListings = new Map<number, number[]>(); // supplierId → listingIds
    for (const l of listingRows) {
      if (!supplierListings.has(l.supplierId)) supplierListings.set(l.supplierId, []);
      supplierListings.get(l.supplierId)!.push(l.id);
    }

    for (const p of active) {
      const supplierListingIds = supplierListings.get(p.supplierId) ?? [];
      let applicableListings: number[] = [];
      if (p.targetType === 'ALL') {
        applicableListings = supplierListingIds.filter(id => listingIds.includes(id));
      } else if (p.targetType === 'PRODUCTS' && p.targetListingIds) {
        applicableListings = p.targetListingIds.filter(id => listingIds.includes(id));
      } else if (p.targetType === 'CATEGORIES' && p.targetCategoryIds) {
        // Resolve by looking at the product's categoryId
        const prods = await db.select().from(products).where(inArray(products.id, listingRows.map(l => l.productId)));
        const catSet = new Set(p.targetCategoryIds);
        // Category Discount promotions are scoped to the supplier that owns
        // the promotion. Only inspect that supplier's requested listings.
        const candidateListings = p.type === 'CATEGORY_DISCOUNT'
          ? listingRows.filter(l => l.supplierId === p.supplierId)
          : listingRows;
        for (const l of candidateListings) {
          const prod = prods.find(pr => pr.id === l.productId);
          if (prod?.categoryId != null && catSet.has(prod.categoryId) && listingIds.includes(l.id)) {
            applicableListings.push(l.id);
          }
        }
      }
      for (const listingId of applicableListings) {
        result.push({
          listingId,
          promotionId: p.id,
          type: p.type,
          label: this._promoLabel(p),
          endDate: p.endDate,
          discountValue: p.discountValue,
        });
      }
    }
    return result;
  }

  private _promoLabel(p: import("@shared/schema").Promotion): string {
    switch (p.type) {
      case 'PERCENTAGE':
      case 'CATEGORY_DISCOUNT': return `${p.discountValue / 100}% OFF`;
      case 'FIXED_AMOUNT':
      case 'MIN_ORDER_AMOUNT': return `${(p.discountValue / 1000).toFixed(3)} DT OFF`;
      case 'BUY_X_GET_Y': return `Buy ${p.buyQuantity} Get ${p.getQuantity}`;
      case 'QUANTITY_TIER': return 'Tier Pricing';
      case 'FREE_SHIPPING': return 'Free Shipping';
      case 'GIFT': return 'Free Gift';
      case 'MIN_QUANTITY': return `${p.discountValue / 100}% on ${p.minimumQuantity}+`;
      case 'FIRST_ORDER': return `${p.discountValue / 100}% First Order`;
      default: return p.name;
    }
  }

  async evaluateCartPromotions(
    itemsBySupplier: Map<number, PromoCartItem[]>,
    cafeId: number,
  ): Promise<import("@shared/schema").CartPromotionEvaluation> {
    // The cart clients do not need to persist taxonomy data. Resolve category
    // IDs from the authoritative listing/product rows before evaluating so a
    // category promotion can never rely on stale or missing client data.
    const allItems = Array.from(itemsBySupplier.values()).flat();
    const listingIds = Array.from(new Set(allItems.map(item => item.listingId)));
    if (listingIds.length > 0) {
      const listingRows = await db.select().from(supplierProductListings)
        .where(inArray(supplierProductListings.id, listingIds));
      const productIds = Array.from(new Set(listingRows.map(listing => listing.productId)));
      const productRows = productIds.length
        ? await db.select().from(products).where(inArray(products.id, productIds))
        : [];
      const listingMap = new Map(listingRows.map(listing => [listing.id, listing]));
      const productMap = new Map(productRows.map(product => [product.id, product]));

      for (const [supplierId, items] of Array.from(itemsBySupplier.entries())) {
        for (const item of items) {
          const listing = listingMap.get(item.listingId);
          const product = listing ? productMap.get(listing.productId) : undefined;
          // Keep the supplied grouping and all other promotion inputs intact;
          // only replace the category with the server-authoritative value.
          item.categoryId = listing && listing.supplierId === supplierId && product
            ? product.categoryId
            : null;
        }
      }
    }

    const supplierIds = Array.from(itemsBySupplier.keys());
    if (supplierIds.length === 0) {
      return { bySupplier: [], totalOriginal: 0, totalDiscount: 0, totalFinal: 0 };
    }

    // Load active promotions for all suppliers
    const promotionsBySupplier = new Map<number, import("@shared/schema").Promotion[]>();
    await Promise.all(supplierIds.map(async (sid) => {
      const promos = await this.getActivePromotionsForSupplier(sid, cafeId);
      promotionsBySupplier.set(sid, promos);
    }));

    // Load per-cafe usage counts for rate-limiting
    const allPromoIds = Array.from(promotionsBySupplier.values()).flat().map((p: import("@shared/schema").Promotion) => p.id);
    const usageByPromo = new Map<number, number>();
    if (allPromoIds.length > 0) {
      const usages = await db.select().from(promotionUsage).where(and(
        inArray(promotionUsage.promotionId, allPromoIds),
        eq(promotionUsage.cafeId, cafeId),
      ));
      for (const u of usages) {
        usageByPromo.set(u.promotionId, (usageByPromo.get(u.promotionId) ?? 0) + 1);
      }
    }

    // Load order counts per supplier for first-order promotions
    const cafeOrderCountBySupplier = new Map<number, number>();
    await Promise.all(supplierIds.map(async (sid) => {
      const count = await this.getCafeOrderCountForSupplier(cafeId, sid);
      cafeOrderCountBySupplier.set(sid, count);
    }));

    return engineEvaluate(itemsBySupplier, promotionsBySupplier, usageByPromo, cafeOrderCountBySupplier, cafeId);
  }

  async recordPromotionUsage(promotionId: number, cafeId: number, orderId: number, discountAmount: number): Promise<void> {
    await db.insert(promotionUsage).values({ promotionId, cafeId, orderId, discountAmount });
    await db.update(promotions)
      .set({ usageCount: sql`${promotions.usageCount} + 1` })
      .where(eq(promotions.id, promotionId));
  }

  async getCafeOrderCountForSupplier(cafeId: number, supplierId: number): Promise<number> {
    // Count sub-orders this cafe has placed with this supplier
    const rows = await db.select().from(subOrders).where(eq(subOrders.supplierId, supplierId));
    // Filter by cafeId via orders join
    const orderIds = rows.map(r => r.orderId);
    if (orderIds.length === 0) return 0;
    const cafeOrders = await db.select().from(orders).where(and(
      inArray(orders.id, orderIds),
      eq(orders.cafeId, cafeId),
    ));
    return cafeOrders.length;
  }

  // ── Messaging ──────────────────────────────────────────────────────────────

  private async hasEligibleMessagingRelationship(userA: number, userB: number, service: string): Promise<boolean> {
    const people = await db.select({ id: users.id, role: users.role })
      .from(users)
      .where(inArray(users.id, [userA, userB]));
    const roles = new Map(people.map(p => [p.id, p.role]));
    const roleA = roles.get(userA);
    const roleB = roles.get(userB);
    const settings = await this.getMessagingSettings();
    const isAdminPair = roleA === "ADMIN" || roleA === "SUPER_ADMIN" || roleB === "ADMIN" || roleB === "SUPER_ADMIN";
    if (!isAdminPair && !settings.globalVisible) return false;

    if (isAdminPair) {
      return true;
    }

    if (service === "SHOP" && ((roleA === "SUPPLIER" && roleB === "CAFE_OWNER") || (roleB === "SUPPLIER" && roleA === "CAFE_OWNER"))) {
      if (!settings.supplierMessagingEnabled) return false;
      const supplierId = roleA === "SUPPLIER" ? userA : userB;
      const cafeId = roleA === "CAFE_OWNER" ? userA : userB;
      const directOrders = await db.select({ status: orders.status })
        .from(orders)
        .where(and(eq(orders.supplierId, supplierId), eq(orders.cafeId, cafeId)));
      const supplierSubOrders = await db.select({ status: subOrders.status })
        .from(subOrders)
        .innerJoin(orders, eq(subOrders.orderId, orders.id))
        .where(and(eq(subOrders.supplierId, supplierId), eq(orders.cafeId, cafeId)));
      const activeStatuses = new Set(["PENDING", "CONFIRMED", "PREPARING", "READY", "IN_DELIVERY"]);
      return [...directOrders, ...supplierSubOrders].some(order => activeStatuses.has(order.status));
    }

    if (service === "MAINTENANCE" && ((roleA === "MAINTENANCE" && roleB === "CAFE_OWNER") || (roleB === "MAINTENANCE" && roleA === "CAFE_OWNER"))) {
      if (!settings.maintenanceMessagingEnabled) return false;
      const maintenanceUserId = roleA === "MAINTENANCE" ? userA : userB;
      const cafeOwnerId = roleA === "CAFE_OWNER" ? userA : userB;
      const reservations = await db.select({ status: maintenanceReservations.status })
        .from(maintenanceReservations)
        .where(and(
          eq(maintenanceReservations.maintenanceUserId, maintenanceUserId),
          eq(maintenanceReservations.cafeOwnerId, cafeOwnerId),
        ));
      const activeStatuses = new Set(["PENDING", "CONFIRMED", "RESCHEDULED", "RESCHEDULE_PENDING"]);
      return reservations.some(reservation => activeStatuses.has(reservation.status));
    }

    if (service === "BARISTA" && ((roleA === "BARISTA_MARKETPLACE" && roleB === "CAFE_OWNER") || (roleB === "BARISTA_MARKETPLACE" && roleA === "CAFE_OWNER"))) {
      if (!settings.baristaMessagingEnabled) return false;
      const baristaUserId = roleA === "BARISTA_MARKETPLACE" ? userA : userB;
      const cafeOwnerId = roleA === "CAFE_OWNER" ? userA : userB;
      const requests = await db.select({ status: baristaMarketplaceRequests.status })
        .from(baristaMarketplaceRequests)
        .where(and(
          eq(baristaMarketplaceRequests.baristaUserId, baristaUserId),
          eq(baristaMarketplaceRequests.cafeOwnerId, cafeOwnerId),
        ));
      const activeStatuses = new Set(["PENDING", "DISCUSSION", "ACCEPTED"]);
      return requests.some(request => activeStatuses.has(request.status));
    }

    return false;
  }

  /** True for admins and active relationship conversations, including the 30-minute grace window. */
  async isConversationMessagingAllowed(conversationId: number, userId: number): Promise<boolean> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
    if (!conversation) return false;
    const participantRows = await db.select({
      userId: conversationParticipants.userId,
      hiddenAt: conversationParticipants.hiddenAt,
    })
      .from(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ));
    const membership = participantRows[0];
    if (!membership) return false;

    const me = await this.getUser(userId);
    if (!me) return false;
    const isAdmin = me.role === "ADMIN" || me.role === "SUPER_ADMIN";
    // Admins retain access to manage and review Messages even when the
    // platform-wide visibility setting is hidden. This also keeps an admin
    // from locking themselves out after hiding a conversation for everyone.
    if (isAdmin) return true;
    if (membership.hiddenAt) return false;

    const settings = await this.getMessagingSettings();
    if (!settings.globalVisible) return false;

    // Broadcast participants are governed by the broadcast setting rather
    // than an order/reservation relationship.
    if (conversation.type !== "DIRECT") {
      return settings.broadcastsEnabled;
    }

    const participantIds = await this.getConversationParticipantIds(conversationId);
    const otherId = participantIds.find(id => id !== userId);
    if (!otherId) return false;
    const other = await this.getUser(otherId);
    if (!other) return false;
    if (other.role === "ADMIN" || other.role === "SUPER_ADMIN") return true;
    const meRole = me.role as string;
    const otherRole = other.role as string;
    if (await this.hasEligibleMessagingRelationship(userId, otherId, conversation.service)) return true;
    return !!conversation.relationshipClosedAt &&
      Date.now() - conversation.relationshipClosedAt.getTime() <= settings.gracePeriodMinutes * 60 * 1000;
  }

  /** Refresh the lifecycle timestamp used by the messaging grace period. */
  async syncMessagingRelationship(userA: number, userB: number, service: string): Promise<void> {
    const participantRows = await db.select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
      .where(and(
        eq(conversations.type, "DIRECT"),
        eq(conversations.service, service),
        inArray(conversationParticipants.userId, [userA, userB]),
      ));
    const counts = new Map<number, number>();
    for (const row of participantRows) counts.set(row.conversationId, (counts.get(row.conversationId) ?? 0) + 1);
    const relationshipActive = await this.hasEligibleMessagingRelationship(userA, userB, service);
    for (const [conversationId, count] of Array.from(counts.entries())) {
      if (count !== 2) continue;
      if (relationshipActive) {
        await db.update(conversations)
          .set({ relationshipClosedAt: null })
          .where(eq(conversations.id, conversationId));
      } else {
        await db.update(conversations)
          .set({ relationshipClosedAt: new Date() })
          .where(and(eq(conversations.id, conversationId), isNull(conversations.relationshipClosedAt)));
      }
    }
  }

  async refreshOrderMessagingState(orderId: number): Promise<void> {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) return;
    const related = await db.select({ supplierId: subOrders.supplierId })
      .from(subOrders)
      .where(eq(subOrders.orderId, orderId));
    const supplierIds = new Set<number>(related.map(row => row.supplierId));
    if (order.supplierId) supplierIds.add(order.supplierId);
    for (const supplierId of Array.from(supplierIds)) {
      await this.syncMessagingRelationship(order.cafeId, supplierId, "SHOP");
    }
  }

  async refreshMaintenanceMessagingState(reservationId: number): Promise<void> {
    const [reservation] = await db.select().from(maintenanceReservations)
      .where(eq(maintenanceReservations.id, reservationId));
    if (reservation) {
      await this.syncMessagingRelationship(reservation.cafeOwnerId, reservation.maintenanceUserId, "MAINTENANCE");
    }
  }

  async deleteConversation(conversationId: number): Promise<number[]> {
    return db.transaction(async (tx) => {
      const participantRows = await tx.select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conversationId));
      const [conversation] = await tx.select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.id, conversationId));
      if (!conversation) return [];

      await tx.delete(messages).where(eq(messages.conversationId, conversationId));
      await tx.delete(conversationParticipants).where(eq(conversationParticipants.conversationId, conversationId));
      await tx.delete(conversations).where(eq(conversations.id, conversationId));
      return participantRows.map(row => row.userId);
    });
  }

  /** Return all non-hidden conversations for a user, ordered by most recent activity. */
  async getConversationsForUser(userId: number, service?: string): Promise<ConversationSummary[]> {
    const participants = await db.select().from(conversationParticipants)
      .where(and(eq(conversationParticipants.userId, userId), isNull(conversationParticipants.hiddenAt)));
    if (participants.length === 0) return [];

    const convIds = participants.map(p => p.conversationId);
    const convRows = await db.select().from(conversations).where(and(
      inArray(conversations.id, convIds),
      ...(service ? [eq(conversations.service, service)] : []),
    ))
      .orderBy(desc(conversations.lastMessageAt));
    const visibleConvRows = [];
    for (const conv of convRows) {
      if (await this.isConversationMessagingAllowed(conv.id, userId)) visibleConvRows.push(conv);
    }
    if (visibleConvRows.length === 0) return [];

    // Fetch all participants for all conversations in one query
    const visibleIds = visibleConvRows.map(c => c.id);
    const allParticipants = await db.select({ cp: conversationParticipants, u: users })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
      .where(inArray(conversationParticipants.conversationId, visibleIds));

    // Fetch last message per conversation
    const lastMsgs = await db.select().from(messages).where(inArray(messages.conversationId, visibleIds))
      .orderBy(desc(messages.createdAt));

    const userMap = new Map<number, { name: string; role: string }>();
    for (const row of allParticipants) userMap.set(row.u.id, { name: row.u.name, role: row.u.role });

    const myParticipantMap = new Map(participants.map(p => [p.conversationId, p]));

    return visibleConvRows.map(conv => {
      const myParticipant = myParticipantMap.get(conv.id)!;
      const others = allParticipants
        .filter(r => r.cp.conversationId === conv.id && r.cp.userId !== userId)
        .map(r => ({ id: r.u.id, name: r.u.name, role: r.u.role, profileImageUrl: r.u.profileImageUrl }));

      // Unread: messages after lastReadAt (or all if never read)
      const myLastRead = myParticipant.lastReadAt;
      const unreadCount = lastMsgs.filter(m => {
        if (m.conversationId !== conv.id) return false;
        if (m.senderId === userId) return false; // own messages never count as unread
        return !myLastRead || m.createdAt! > myLastRead;
      }).length;

      const lastMsg = lastMsgs.find(m => m.conversationId === conv.id);

      return {
        id: conv.id,
        type: conv.type,
        title: conv.title,
        service: conv.service,
        lastMessageAt: (conv.lastMessageAt ?? conv.createdAt)!.toISOString(),
        createdAt: conv.createdAt!.toISOString(),
        messageCount: lastMsgs.filter(m => m.conversationId === conv.id).length,
        lastMessage: lastMsg ? {
          content: lastMsg.content,
          senderId: lastMsg.senderId,
          senderName: userMap.get(lastMsg.senderId)?.name ?? 'Unknown',
          createdAt: lastMsg.createdAt!.toISOString(),
        } : null,
        unreadCount,
        otherParticipants: others,
      } satisfies ConversationSummary;
    });
  }

  /** Find an existing DIRECT conversation between two users, or create one. */
  async findOrCreateDirectConversation(userId1: number, userId2: number, service = 'SHOP'): Promise<{ conversation: typeof conversations.$inferSelect; isNew: boolean }> {
    if (userId1 === userId2 || !(await this.hasEligibleMessagingRelationship(userId1, userId2, service))) {
      throw new Error("These users are not eligible to message each other");
    }

    // Serialize the lookup/insert for this pair and service. Without the
    // transaction-scoped advisory lock, two tabs can both miss the lookup and
    // create duplicate direct conversations.
    const pairKey = `${service}:${Math.min(userId1, userId2)}:${Math.max(userId1, userId2)}`;
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${pairKey}))`);

      const p1 = await tx.select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants).where(eq(conversationParticipants.userId, userId1));
      const p2 = await tx.select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants).where(eq(conversationParticipants.userId, userId2));

      const ids1 = new Set(p1.map(r => r.conversationId));
      const sharedIds = p2.filter(r => ids1.has(r.conversationId)).map(r => r.conversationId);

      if (sharedIds.length > 0) {
        const directConvs = await tx.select().from(conversations)
          .where(and(
            inArray(conversations.id, sharedIds),
            eq(conversations.type, 'DIRECT'),
            eq(conversations.service, service),
          ));
        if (directConvs.length > 0) {
          return { conversation: directConvs[0], isNew: false };
        }
      }

      const [conv] = await tx.insert(conversations).values({
        type: 'DIRECT',
        service,
        createdByUserId: userId1,
      }).returning();

      await tx.insert(conversationParticipants).values([
        { conversationId: conv.id, userId: userId1 },
        { conversationId: conv.id, userId: userId2 },
      ]);

      return { conversation: conv, isNew: true };
    });
  }

  /** Check if userId is a non-hidden participant of conversationId. */
  async isParticipant(conversationId: number, userId: number): Promise<boolean> {
    const [row] = await db.select().from(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
        isNull(conversationParticipants.hiddenAt),
      ));
    return !!row && await this.isConversationMessagingAllowed(conversationId, userId);
  }

  async getConversationParticipantIds(conversationId: number): Promise<number[]> {
    const rows = await db.select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));
    return rows.map(r => r.userId);
  }

  /** Get paginated messages for a conversation. Newest first for pagination, but return in asc order. */
  async getConversationMessages(conversationId: number, page: number, pageSize: number): Promise<{ msgs: ConversationMessageRow[]; total: number }> {
    const total = await db.select({ count: sql<number>`count(*)::int` }).from(messages)
      .where(eq(messages.conversationId, conversationId));

    const rows = await db.select({ m: messages, u: users })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // Return in chronological order
    const msgs: ConversationMessageRow[] = rows.reverse().map(r => ({
      id: r.m.id,
      conversationId: r.m.conversationId,
      senderId: r.m.senderId,
      senderName: r.u.name,
      senderRole: r.u.role,
      content: r.m.content,
      createdAt: r.m.createdAt!.toISOString(),
    }));
    return { msgs, total: total[0]?.count ?? 0 };
  }

  /** Persist a message and update conversation lastMessageAt. Returns the inserted message enriched with sender info. */
  async sendMessage(conversationId: number, senderId: number, content: string): Promise<ConversationMessageRow> {
    if (!(await this.isConversationMessagingAllowed(conversationId, senderId))) {
      throw new Error("Messaging is not available for this conversation");
    }
    const [sender] = await db.select().from(users).where(eq(users.id, senderId));
    const [msg] = await db.insert(messages).values({ conversationId, senderId, content }).returning();
    await db.update(conversations).set({ lastMessageAt: msg.createdAt }).where(eq(conversations.id, conversationId));
    return {
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      senderName: sender?.name ?? 'Unknown',
      senderRole: sender?.role ?? 'CAFE_OWNER',
      content: msg.content,
      createdAt: msg.createdAt!.toISOString(),
    };
  }

  /** Mark all messages in a conversation as read for a user. */
  async markConversationRead(conversationId: number, userId: number): Promise<void> {
    await db.update(conversationParticipants)
      .set({ lastReadAt: new Date() })
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ));
  }

  /** Admin: create a broadcast conversation to multiple users. */
  async createBroadcastConversation(adminId: number, title: string, targetUserIds: number[]): Promise<typeof conversations.$inferSelect> {
    const [conv] = await db.insert(conversations).values({
      title,
      type: 'BROADCAST',
      service: 'SHOP',
      createdByUserId: adminId,
    }).returning();

    const allParticipants = Array.from(new Set([adminId, ...targetUserIds]));
    await db.insert(conversationParticipants).values(
      allParticipants.map(uid => ({ conversationId: conv.id, userId: uid }))
    );

    return conv;
  }

  /** Return users a given user is allowed to start a conversation with based on order relationships. */
  async getEligibleContacts(userId: number, service?: string): Promise<EligibleContact[]> {
    const [me] = await db.select().from(users).where(eq(users.id, userId));
    if (!me) return [];

    const isAdmin = me.role === 'ADMIN' || me.role === 'SUPER_ADMIN';
    const settings = await this.getMessagingSettings();
    if (!isAdmin && !settings.globalVisible) return [];
    const serviceRoles: Record<string, string[]> = {
      SHOP: ['CAFE_OWNER', 'SUPPLIER', 'DELIVERY_COMPANY', 'DRIVER'],
      MAINTENANCE: ['CAFE_OWNER', 'MAINTENANCE'],
      PRINT: ['CAFE_OWNER', 'PRINTER'],
      MARKETING: ['CAFE_OWNER', 'MARKETING'],
      // Marketplace-only: there is no real Coffee-Owner-facing contact/hire flow
      // for BARISTA_ACADEMY providers (the Academy page is static content, see
      // client/src/pages/cafe/barista/barista-academy-page.tsx) — including that
      // role here would make Academy accounts messageable with no real
      // relationship behind it.
      BARISTA: ['CAFE_OWNER', 'BARISTA_MARKETPLACE'],
    };
    const allowedServiceRoles = service ? serviceRoles[service] : undefined;

    if (isAdmin) {
      // Admin can message every real account in the selected service, but
      // service selection is still enforced at the data boundary.
      const adminAllowedRoles = service === "MAINTENANCE"
        ? ["MAINTENANCE"]
        : allowedServiceRoles;
      const all = await db.select().from(users).where(and(
        ne(users.id, userId),
        ...(adminAllowedRoles ? [inArray(users.role, adminAllowedRoles as any)] : []),
      ));
      return all.map(u => ({ id: u.id, name: u.name, role: u.role }));
    }

    const contactUserIds = new Set<number>();

    if (me.role === 'CAFE_OWNER') {
      // Can message suppliers from orders
      const cafeOrders = await db.select().from(orders).where(eq(orders.cafeId, userId));
      for (const o of cafeOrders) {
        if (o.supplierId) contactUserIds.add(o.supplierId);
      }
      // Also add delivery users from orders
      for (const o of cafeOrders) {
        if (o.deliveryId) contactUserIds.add(o.deliveryId);
      }
      // If no order relationships yet, show all approved suppliers
      if (contactUserIds.size === 0) {
        const allSuppliers = await db.select().from(users)
          .where(and(eq(users.role, 'SUPPLIER' as any), eq(users.status, 'approved')));
        for (const s of allSuppliers) contactUserIds.add(s.id);
      }
      // Maintenance professionals are contactable directly from the
      // Maintenance marketplace, before an order exists.
      const maintenance = await db.select({ userId: maintenanceProfiles.userId })
        .from(maintenanceProfiles)
        .innerJoin(users, eq(maintenanceProfiles.userId, users.id))
        .where(and(
          eq(users.role, "MAINTENANCE" as any),
          eq(users.status, "approved"),
          eq(maintenanceProfiles.marketplaceVisible, true),
        ));
      for (const provider of maintenance) contactUserIds.add(provider.userId);
      // Service-specific provider accounts are available before an order
      // exists, just like Maintenance providers.
      if (service && service !== "SHOP" && allowedServiceRoles) {
        const providers = await db.select({ id: users.id }).from(users).where(and(
          inArray(users.role, allowedServiceRoles as any),
          eq(users.status, "approved"),
          ne(users.role, "CAFE_OWNER" as any),
        ));
        for (const provider of providers) contactUserIds.add(provider.id);
      }
    } else if (me.role === 'SUPPLIER') {
      // Can message cafe owners from orders
      const supplierOrders = await db.select().from(orders).where(eq(orders.supplierId, userId));
      for (const o of supplierOrders) contactUserIds.add(o.cafeId);
      // Always show all approved cafe owners (so new suppliers can message without prior orders)
      const allCafes = await db.select().from(users)
        .where(and(eq(users.role, 'CAFE_OWNER' as any), eq(users.status, 'approved')));
      for (const c of allCafes) contactUserIds.add(c.id);
    } else if (me.role === 'DELIVERY_COMPANY' || me.role === 'DRIVER') {
      // Can message cafe owners from deliveries
      const delivOrders = await db.select().from(orders).where(eq(orders.deliveryId, userId));
      for (const o of delivOrders) contactUserIds.add(o.cafeId);
      // Also show all approved cafe owners
      const allCafes = await db.select().from(users)
        .where(and(eq(users.role, 'CAFE_OWNER' as any), eq(users.status, 'approved')));
      for (const c of allCafes) contactUserIds.add(c.id);
    } else if (me.role === 'MAINTENANCE') {
      const allCafes = await db.select().from(users)
        .where(and(eq(users.role, 'CAFE_OWNER' as any), eq(users.status, 'approved')));
      for (const c of allCafes) contactUserIds.add(c.id);
    } else if (me.role === 'BARISTA_MARKETPLACE') {
      const allCafes = await db.select().from(users)
        .where(and(eq(users.role, 'CAFE_OWNER' as any), eq(users.status, 'approved')));
      for (const c of allCafes) contactUserIds.add(c.id);
    }

    // Admin support is available from every messaging service. The service
    // restriction applies to provider/customer pairs, not support access.
    const admins = await db.select().from(users)
      .where(or(eq(users.role, 'ADMIN' as any), eq(users.role, 'SUPER_ADMIN' as any)));
    for (const a of admins) contactUserIds.add(a.id);

    // Supplier/café and Maintenance/café contacts are relationship-scoped.
    // Keep legacy delivery and other service contact behavior unchanged.
    contactUserIds.delete(userId);

    if (contactUserIds.size === 0) return [];
    const candidateUsers = await db.select({ id: users.id, role: users.role })
      .from(users)
      .where(inArray(users.id, Array.from(contactUserIds)));
    const relationshipService = service ?? (me.role === "MAINTENANCE" ? "MAINTENANCE" : "SHOP");
    const eligibleIds = new Set<number>();
    for (const candidate of candidateUsers) {
      const restrictedPair =
        (me.role === "SUPPLIER" && candidate.role === "CAFE_OWNER") ||
        (me.role === "CAFE_OWNER" && candidate.role === "SUPPLIER") ||
        (me.role === "MAINTENANCE" && candidate.role === "CAFE_OWNER") ||
        (me.role === "CAFE_OWNER" && candidate.role === "MAINTENANCE");
      if (!restrictedPair || await this.hasEligibleMessagingRelationship(userId, candidate.id, relationshipService)) {
        eligibleIds.add(candidate.id);
      }
    }
    if (eligibleIds.size === 0) return [];
    const roleCondition = allowedServiceRoles
      ? (!isAdmin && service === "SHOP"
        ? or(
          inArray(users.role, allowedServiceRoles as any),
          eq(users.role, "ADMIN" as any),
          eq(users.role, "SUPER_ADMIN" as any),
        )
        : inArray(users.role, allowedServiceRoles as any))
      : undefined;
    const contacts = await db.select().from(users).where(and(
      inArray(users.id, Array.from(eligibleIds)),
      ...(roleCondition ? [roleCondition] : []),
    ));
    return contacts.map(u => ({ id: u.id, name: u.name, role: u.role, profileImageUrl: u.profileImageUrl }));
  }

  /** Admin: hide or show a conversation for a specific user (or for all current participants if targetUserId is null). */
  async setConversationVisibility(conversationId: number, targetUserId: number | null, hidden: boolean, adminId: number): Promise<void> {
    const condition = targetUserId
      ? and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, targetUserId))
      : eq(conversationParticipants.conversationId, conversationId);

    await db.update(conversationParticipants)
      .set({ hiddenAt: hidden ? new Date() : null, hiddenByUserId: hidden ? adminId : null })
      .where(condition!);
  }

  /** Admin: list all conversations with a summary of participants. */
  async adminGetAllConversations(service?: string): Promise<ConversationSummary[]> {
    const convRows = await db.select().from(conversations)
      .where(service ? eq(conversations.service, service) : undefined)
      .orderBy(desc(conversations.lastMessageAt));
    if (convRows.length === 0) return [];

    const allParticipants = await db.select({ cp: conversationParticipants, u: users })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
      .where(inArray(conversationParticipants.conversationId, convRows.map(c => c.id)));

    const lastMsgs = await db.select().from(messages)
      .where(inArray(messages.conversationId, convRows.map(c => c.id)))
      .orderBy(desc(messages.createdAt));

    const userMap = new Map<number, { name: string; role: string }>();
    for (const row of allParticipants) userMap.set(row.u.id, { name: row.u.name, role: row.u.role });

    return convRows.map(conv => {
      const participants = allParticipants.filter(r => r.cp.conversationId === conv.id)
        .map(r => ({
          id: r.u.id,
          name: r.u.name,
          role: r.u.role,
          profileImageUrl: r.u.profileImageUrl,
          hiddenAt: r.cp.hiddenAt ? r.cp.hiddenAt.toISOString() : null,
        }));
      const lastMsg = lastMsgs.find(m => m.conversationId === conv.id);
      return {
        id: conv.id,
        type: conv.type,
        title: conv.title,
        service: conv.service,
        lastMessageAt: (conv.lastMessageAt ?? conv.createdAt)!.toISOString(),
        createdAt: conv.createdAt!.toISOString(),
        messageCount: lastMsgs.filter(m => m.conversationId === conv.id).length,
        lastMessage: lastMsg ? {
          content: lastMsg.content,
          senderId: lastMsg.senderId,
          senderName: userMap.get(lastMsg.senderId)?.name ?? 'Unknown',
          createdAt: lastMsg.createdAt!.toISOString(),
        } : null,
        unreadCount: 0,
        otherParticipants: participants,
      } satisfies ConversationSummary;
    });
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
    const conditions = [];
    if (filters.service) conditions.push(eq(conversations.service, filters.service));
    if (filters.ids?.length) conditions.push(inArray(conversations.id, filters.ids));
    if (filters.from) conditions.push(gte(conversations.lastMessageAt, filters.from));
    if (filters.to) conditions.push(lte(conversations.lastMessageAt, filters.to));
    const convRows = await db.select().from(conversations)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(conversations.lastMessageAt));
    if (convRows.length === 0) return [];

    const ids = convRows.map(c => c.id);
    const participantRows = await db.select({ cp: conversationParticipants, u: users })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
      .where(inArray(conversationParticipants.conversationId, ids));
    const messageRows = await db.select({ m: messages, u: users })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(inArray(messages.conversationId, ids))
      .orderBy(messages.createdAt);

    return convRows.reduce<Array<{
      conversation: typeof conversations.$inferSelect;
      participants: Array<{ id: number; name: string; role: string }>;
      message: ConversationMessageRow | null;
    }>>((result, conversation) => {
      const participants = participantRows
        .filter(row => row.cp.conversationId === conversation.id)
        .map(row => ({ id: row.u.id, name: row.u.name, role: row.u.role }));
      const rows = messageRows.filter(row => row.m.conversationId === conversation.id);
      if (rows.length === 0) {
        result.push({ conversation, participants, message: null });
      } else {
        result.push(...rows.map(row => ({
          conversation,
          participants,
          message: {
            id: row.m.id,
            conversationId: row.m.conversationId,
            senderId: row.m.senderId,
            senderName: row.u.name,
            senderRole: row.u.role,
            content: row.m.content,
            createdAt: row.m.createdAt!.toISOString(),
          },
        })));
      }
      return result;
    }, []);
  }

  async getUnreadMessageCount(userId: number): Promise<number> {
    const participants = await db.select().from(conversationParticipants)
      .where(and(eq(conversationParticipants.userId, userId), isNull(conversationParticipants.hiddenAt)));
    if (participants.length === 0) return 0;

    const allowedConversationIds: number[] = [];
    for (const participant of participants) {
      if (await this.isConversationMessagingAllowed(participant.conversationId, userId)) {
        allowedConversationIds.push(participant.conversationId);
      }
    }
    if (allowedConversationIds.length === 0) return 0;

    const convIds = allowedConversationIds;
    const allMessages = await db.select().from(messages).where(inArray(messages.conversationId, convIds));

    return allMessages.filter(m => {
      if (m.senderId === userId) return false;
      const myParticipant = participants.find(p => p.conversationId === m.conversationId);
      if (!myParticipant) return false;
      const lastRead = myParticipant.lastReadAt;
      return !lastRead || m.createdAt! > lastRead;
    }).length;
  }
}

export const storage = new DatabaseStorage();
