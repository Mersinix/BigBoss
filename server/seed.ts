/**
 * Database initialization / seeding.
 *
 * Called with `await` during server startup (server/index.ts), BEFORE the
 * HTTP server starts listening.  This guarantees:
 *
 *  - The app never serves requests against an empty database.
 *  - All errors surface immediately and crash the process (visible in logs).
 *  - Re-running is safe: every insert is guarded by an existence check, so
 *    restarting the app multiple times never produces duplicate records.
 */

import { db } from "./db";
import { pool } from "./db";
import { storage } from "./storage";
import {
  users,
  categories,
  products,
  landingConfig,
} from "@shared/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Retry helper — the DB pool may need a moment on a cold start
// ---------------------------------------------------------------------------

async function waitForDb(maxAttempts = 10, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      return; // connected
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.log(
        `[seed] DB not ready yet (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms…`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// ---------------------------------------------------------------------------
// Admin product seeder — called when taxonomy exists but products are missing
// ---------------------------------------------------------------------------

async function seedAdminProducts(catList: { id: number; name: string }[]) {
  const [subsList, flavorsList, sizesList, brandsList] = await Promise.all([
    db.query.subCategories.findMany(),
    db.query.flavors.findMany(),
    db.query.sizes.findMany(),
    db.query.brands.findMany(),
  ]);

  const cat = (name: string) => catList.find((c) => c.name === name)?.id ?? null;
  const sub = (name: string) => subsList.find((s) => s.name === name)?.id ?? null;
  const flav = (name: string) => flavorsList.find((f) => f.name === name)?.id ?? null;
  const sz = (name: string) => sizesList.find((s) => s.name === name)?.id ?? null;
  const br = (name: string) => brandsList.find((b) => b.name === name)?.id ?? null;

  const adminProds = [
    { name: "Lavazza Super Crema Espresso 1kg", description: "Velvety smooth espresso blend with notes of hazelnut and brown sugar", imageUrl: "https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=500&q=80", categoryId: cat("Coffee Beans"), subCategoryId: sub("Arabica Beans"), flavorId: flav("Hazelnut"), sizeId: sz("1kg Bag"), brandId: br("Lavazza"), category: "Coffee Beans" },
    { name: "Lavazza Qualità Rossa Ground 500g", description: "Balanced medium roast, perfect for espresso machines", imageUrl: "https://images.unsplash.com/photo-1507133750040-4a8f57021571?w=500&q=80", categoryId: cat("Coffee Beans"), subCategoryId: sub("Ground Coffee"), flavorId: flav("Caramel"), sizeId: sz("500g Bag"), brandId: br("Lavazza"), category: "Coffee Beans" },
    { name: "Illy Classico Arabica Beans 500g", description: "9 arabica varieties blended for a consistently rich espresso", imageUrl: "https://images.unsplash.com/photo-1611854779393-1b2da9d400fe?w=500&q=80", categoryId: cat("Coffee Beans"), subCategoryId: sub("Arabica Beans"), flavorId: flav("Unflavored"), sizeId: sz("500g Bag"), brandId: br("Illy"), category: "Coffee Beans" },
    { name: "Nespresso Original Capsules x10", description: "Intense espresso with a rich crema — Ristretto blend", imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&q=80", categoryId: cat("Coffee Beans"), subCategoryId: sub("Capsules & Pods"), flavorId: flav("Chocolate"), sizeId: sz("Espresso Shot"), brandId: br("Nespresso"), category: "Coffee Beans" },
    { name: "Cold Brew Coarse Grind Bag 250g", description: "Specially coarse-ground Ethiopian Sidamo for 18hr cold brew", imageUrl: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500&q=80", categoryId: cat("Coffee Beans"), subCategoryId: sub("Cold Brew Bags"), flavorId: flav("Vanilla"), sizeId: sz("250g Bag"), brandId: br("Illy"), category: "Coffee Beans" },
    { name: "Robusta Dark Roast Beans 1kg", description: "High-caffeine Vietnamese robusta, bold and full-bodied", imageUrl: "https://images.unsplash.com/photo-1481833761820-0509d3217039?w=500&q=80", categoryId: cat("Coffee Beans"), subCategoryId: sub("Robusta Beans"), flavorId: flav("Unflavored"), sizeId: sz("1kg Bag"), brandId: br("Lavazza"), category: "Coffee Beans" },
    { name: "Oatly Barista Edition 1L", description: "The original barista oat milk — steams to silky perfection", imageUrl: "https://images.unsplash.com/photo-1600788886242-5c96aabe3757?w=500&q=80", categoryId: cat("Dairy & Alternatives"), subCategoryId: sub("Oat Milk"), flavorId: flav("Unflavored"), sizeId: sz("1L Carton"), brandId: br("Oatly"), category: "Dairy & Alternatives" },
    { name: "Oatly Barista 6x1L Pack", description: "Case of 6 Oatly Barista — perfect for busy cafes", imageUrl: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=500&q=80", categoryId: cat("Dairy & Alternatives"), subCategoryId: sub("Oat Milk"), flavorId: flav("Unflavored"), sizeId: sz("6-Pack"), brandId: br("Oatly"), category: "Dairy & Alternatives" },
    { name: "Alpro Almond Barista 1L", description: "Light nutty almond milk with excellent foam quality", imageUrl: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&q=80", categoryId: cat("Dairy & Alternatives"), subCategoryId: sub("Almond Milk"), flavorId: flav("Almond"), sizeId: sz("1L Carton"), brandId: br("Alpro"), category: "Dairy & Alternatives" },
    { name: "UHT Whole Milk 6x1L", description: "Long-life full-fat milk for consistent café use", imageUrl: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&q=80", categoryId: cat("Dairy & Alternatives"), subCategoryId: sub("Whole Milk"), flavorId: flav("Unflavored"), sizeId: sz("6-Pack"), brandId: br("Alpro"), category: "Dairy & Alternatives" },
    { name: "Monin Vanilla Syrup 700ml", description: "Classic Madagascar bourbon vanilla — the café staple", imageUrl: "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=500&q=80", categoryId: cat("Syrups & Flavors"), subCategoryId: sub("Classic Syrups"), flavorId: flav("Vanilla"), sizeId: sz("Medium"), brandId: br("Monin"), category: "Syrups & Flavors" },
    { name: "Monin Caramel Syrup 700ml", description: "Buttery caramel for lattes and frappés", imageUrl: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&q=80", categoryId: cat("Syrups & Flavors"), subCategoryId: sub("Classic Syrups"), flavorId: flav("Caramel"), sizeId: sz("Medium"), brandId: br("Monin"), category: "Syrups & Flavors" },
    { name: "Monin Hazelnut Sugar-Free 700ml", description: "Zero-sugar hazelnut syrup — guilt-free indulgence", imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500&q=80", categoryId: cat("Syrups & Flavors"), subCategoryId: sub("Sugar-Free Syrups"), flavorId: flav("Hazelnut"), sizeId: sz("Medium"), brandId: br("Monin"), category: "Syrups & Flavors" },
    { name: "Monin Coconut Syrup 700ml", description: "Tropical coconut for iced drinks and smoothies", imageUrl: "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=500&q=80", categoryId: cat("Syrups & Flavors"), subCategoryId: sub("Classic Syrups"), flavorId: flav("Coconut"), sizeId: sz("Medium"), brandId: br("Monin"), category: "Syrups & Flavors" },
    { name: "DeLonghi Dedica Espresso Machine", description: "Slim 15-bar pump espresso machine for specialty cafés", imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500&q=80", categoryId: cat("Equipment & Supplies"), subCategoryId: sub("Espresso Machines"), flavorId: flav("Unflavored"), sizeId: sz("Large"), brandId: br("DeLonghi"), category: "Equipment & Supplies" },
    { name: "Rancilio Silvia Pro Espresso", description: "Dual boiler prosumer machine for high-volume use", imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&q=80", categoryId: cat("Equipment & Supplies"), subCategoryId: sub("Espresso Machines"), flavorId: flav("Unflavored"), sizeId: sz("Large"), brandId: br("Rancilio"), category: "Equipment & Supplies" },
    { name: "80mm Biodegradable Coffee Cups x500", description: "Single-wall compostable cups with lids — café-ready", imageUrl: "https://images.unsplash.com/photo-1506619216599-9d16d0903dfd?w=500&q=80", categoryId: cat("Equipment & Supplies"), subCategoryId: sub("Cups & Packaging"), flavorId: flav("Unflavored"), sizeId: sz("Small"), brandId: br("DeLonghi"), category: "Equipment & Supplies" },
    { name: "English Breakfast Tea Bags x100", description: "Robust black tea blend — classic breakfast companion", imageUrl: "https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=500&q=80", categoryId: cat("Tea & Herbal"), subCategoryId: sub("Black Tea"), flavorId: flav("Unflavored"), sizeId: sz("Large"), brandId: br("Alpro"), category: "Tea & Herbal" },
    { name: "Ceremonial Grade Matcha 100g", description: "Vibrant green ceremonial matcha from Uji, Japan", imageUrl: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500&q=80", categoryId: cat("Tea & Herbal"), subCategoryId: sub("Green Tea"), flavorId: flav("Mint"), sizeId: sz("250g Bag"), brandId: br("Alpro"), category: "Tea & Herbal" },
    { name: "Chamomile Herbal Infusion x50", description: "Calming chamomile flowers — naturally caffeine-free", imageUrl: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&q=80", categoryId: cat("Tea & Herbal"), subCategoryId: sub("Herbal Infusions"), flavorId: flav("Unflavored"), sizeId: sz("Medium"), brandId: br("Alpro"), category: "Tea & Herbal" },
    { name: "Butter Croissants x12", description: "All-butter pre-baked croissants — just thaw and serve", imageUrl: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&q=80", categoryId: cat("Snacks & Food"), subCategoryId: sub("Pastries"), flavorId: flav("Unflavored"), sizeId: sz("Large"), brandId: br("Lavazza"), category: "Snacks & Food" },
    { name: "Cantuccini Biscotti 500g", description: "Crunchy almond biscotti — perfect with espresso", imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&q=80", categoryId: cat("Snacks & Food"), subCategoryId: sub("Biscuits & Cookies"), flavorId: flav("Almond"), sizeId: sz("500g Bag"), brandId: br("Illy"), category: "Snacks & Food" },
  ];

  for (const p of adminProds) {
    await storage.createProduct({
      ...p,
      price: 0,
      stock: 0,
      supplierId: null,
      isAdminProduct: true,
    });
  }
  console.log("✅ [seed] Admin products seeded from existing taxonomy");
}

// ---------------------------------------------------------------------------
// Main seed function — idempotent, safe to call on every startup
// ---------------------------------------------------------------------------

export async function seedDatabase(): Promise<void> {
  console.log("[seed] Checking database…");

  // Wait until the pool can actually reach the DB
  await waitForDb();

  // ── 1. Users ──────────────────────────────────────────────────────────────
  const usersList = await db.select().from(users);
  if (usersList.length === 0) {
    await storage.createUser({
      email: "admin@bigbosscoffee.com",
      password: "password",
      name: "Super Admin",
      role: "SUPER_ADMIN",
    });
    const supplier = await storage.createUser({
      email: "supplier@beans.com",
      password: "password",
      name: "Premium Beans Co",
      role: "SUPPLIER",
    });
    await storage.createUser({
      email: "owner@cafe.com",
      password: "password",
      name: "Central Perk",
      role: "CAFE_OWNER",
    });
    await storage.createUser({
      email: "driver@fast.com",
      password: "password",
      name: "Fast Delivery",
      role: "DRIVER",
    });

    // Legacy supplier-owned products for cafe browsing
    await storage.createProduct({
      supplierId: supplier.id,
      name: "Espresso Roast 1kg",
      description: "Dark espresso blend",
      price: 2500,
      stock: 100,
      category: "Coffee Beans",
      imageUrl:
        "https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=500&q=80",
      isAdminProduct: false,
    });
    await storage.createProduct({
      supplierId: supplier.id,
      name: "Oat Milk 1L x 6",
      description: "Barista standard oat milk",
      price: 1800,
      stock: 50,
      category: "Dairy Alternatives",
      imageUrl:
        "https://images.unsplash.com/photo-1600788886242-5c96aabe3757?w=500&q=80",
      isAdminProduct: false,
    });

    console.log("✅ [seed] Default users and legacy products created");
  }

  // ── 2. Taxonomy + admin products ─────────────────────────────────────────
  const adminProductsList = await db
    .select()
    .from(products)
    .where(eq(products.isAdminProduct, true));
  const catList = await db.select().from(categories);

  // Taxonomy exists but admin products were wiped — re-seed products only
  if (catList.length > 0 && adminProductsList.length === 0) {
    await seedAdminProducts(catList);
    return;
  }

  // Everything needs to be created from scratch
  if (catList.length === 0) {
    const coffeeBeans = await storage.createCategory({ name: "Coffee Beans", icon: "☕", description: "Whole bean and ground coffee blends", createdBy: "System" });
    const dairy       = await storage.createCategory({ name: "Dairy & Alternatives", icon: "🥛", description: "Milk, cream, oat and soy alternatives", createdBy: "System" });
    const equipment   = await storage.createCategory({ name: "Equipment & Supplies", icon: "⚙️", description: "Machines, filters, cups and accessories", createdBy: "System" });
    const syrups      = await storage.createCategory({ name: "Syrups & Flavors", icon: "🍯", description: "Coffee syrups, sweeteners and flavor shots", createdBy: "System" });
    const tea         = await storage.createCategory({ name: "Tea & Herbal", icon: "🍵", description: "Loose leaf, herbal blends and infusions", createdBy: "System" });
    const snacks      = await storage.createCategory({ name: "Snacks & Food", icon: "🥐", description: "Pastries, biscuits and café snacks", createdBy: "System" });

    const arabica    = await storage.createSubCategory({ name: "Arabica Beans", categoryId: coffeeBeans.id, description: "Single-origin and blended arabica", createdBy: "System" });
    const robusta    = await storage.createSubCategory({ name: "Robusta Beans", categoryId: coffeeBeans.id, description: "High-caffeine robust blends", createdBy: "System" });
    const capsules   = await storage.createSubCategory({ name: "Capsules & Pods", categoryId: coffeeBeans.id, description: "Compatible with Nespresso, Dolce Gusto", createdBy: "System" });
    const ground     = await storage.createSubCategory({ name: "Ground Coffee", categoryId: coffeeBeans.id, description: "Pre-ground for espresso and filter", createdBy: "System" });
    const coldBrew   = await storage.createSubCategory({ name: "Cold Brew Bags", categoryId: coffeeBeans.id, description: "Coarse grind cold brew packs", createdBy: "System" });

    const oatMilk    = await storage.createSubCategory({ name: "Oat Milk", categoryId: dairy.id, description: "Barista-grade oat milk", createdBy: "System" });
    const almondMilk = await storage.createSubCategory({ name: "Almond Milk", categoryId: dairy.id, description: "Unsweetened almond milk", createdBy: "System" });
    const wholeMilk  = await storage.createSubCategory({ name: "Whole Milk", categoryId: dairy.id, description: "Fresh and UHT whole milk", createdBy: "System" });

    const machines   = await storage.createSubCategory({ name: "Espresso Machines", categoryId: equipment.id, description: "Commercial and semi-commercial", createdBy: "System" });
    const cups       = await storage.createSubCategory({ name: "Cups & Packaging", categoryId: equipment.id, description: "Paper cups, lids and sleeves", createdBy: "System" });

    const classicSyr = await storage.createSubCategory({ name: "Classic Syrups", categoryId: syrups.id, description: "Vanilla, caramel, hazelnut", createdBy: "System" });
    const sfSyr      = await storage.createSubCategory({ name: "Sugar-Free Syrups", categoryId: syrups.id, description: "Zero-calorie flavoring options", createdBy: "System" });

    const blackTea   = await storage.createSubCategory({ name: "Black Tea", categoryId: tea.id, description: "English breakfast, Earl Grey", createdBy: "System" });
    const greenTea   = await storage.createSubCategory({ name: "Green Tea", categoryId: tea.id, description: "Matcha, sencha, jasmine green", createdBy: "System" });
    const herbal     = await storage.createSubCategory({ name: "Herbal Infusions", categoryId: tea.id, description: "Chamomile, peppermint, hibiscus", createdBy: "System" });

    const pastries   = await storage.createSubCategory({ name: "Pastries", categoryId: snacks.id, description: "Croissants, muffins, danishes", createdBy: "System" });
    const biscuits   = await storage.createSubCategory({ name: "Biscuits & Cookies", categoryId: snacks.id, description: "Biscotti, shortbread, wafers", createdBy: "System" });

    const vanilla    = await storage.createFlavor({ name: "Vanilla", description: "Classic sweet vanilla", createdBy: "System" });
    const caramel    = await storage.createFlavor({ name: "Caramel", description: "Rich buttery caramel", createdBy: "System" });
    const hazelnut   = await storage.createFlavor({ name: "Hazelnut", description: "Roasted hazelnut", createdBy: "System" });
    const chocolate  = await storage.createFlavor({ name: "Chocolate", description: "Dark and milk chocolate", createdBy: "System" });
    const coconut    = await storage.createFlavor({ name: "Coconut", description: "Tropical coconut", createdBy: "System" });
    const almond     = await storage.createFlavor({ name: "Almond", description: "Toasted almond", createdBy: "System" });
    const mint       = await storage.createFlavor({ name: "Mint", description: "Fresh peppermint", createdBy: "System" });
    const unflavored = await storage.createFlavor({ name: "Unflavored", description: "Natural, no added flavor", createdBy: "System" });

    const shot       = await storage.createSize({ name: "Espresso Shot", value: "30ml", createdBy: "System" });
    const small      = await storage.createSize({ name: "Small", value: "250ml", createdBy: "System" });
    const medium     = await storage.createSize({ name: "Medium", value: "350ml", createdBy: "System" });
    const large      = await storage.createSize({ name: "Large", value: "500ml", createdBy: "System" });
    const bag250     = await storage.createSize({ name: "250g Bag", value: "250g", createdBy: "System" });
    const bag500     = await storage.createSize({ name: "500g Bag", value: "500g", createdBy: "System" });
    const bag1kg     = await storage.createSize({ name: "1kg Bag", value: "1kg", createdBy: "System" });
    const liter      = await storage.createSize({ name: "1L Carton", value: "1L", createdBy: "System" });
    const sixPack    = await storage.createSize({ name: "6-Pack", value: "6x1L", createdBy: "System" });

    const lavazza    = await storage.createBrand({ name: "Lavazza", description: "Italian coffee brand", createdBy: "System" });
    const nespresso  = await storage.createBrand({ name: "Nespresso", description: "Premium capsule systems", createdBy: "System" });
    const illy       = await storage.createBrand({ name: "Illy", description: "Specialty Italian coffee", createdBy: "System" });
    const monin      = await storage.createBrand({ name: "Monin", description: "Premium flavoring syrups", createdBy: "System" });
    const oatly      = await storage.createBrand({ name: "Oatly", description: "Leading oat milk brand", createdBy: "System" });
    const alpro      = await storage.createBrand({ name: "Alpro", description: "Plant-based drinks", createdBy: "System" });
    const delonghi   = await storage.createBrand({ name: "DeLonghi", description: "Espresso machines", createdBy: "System" });
    const rancilio   = await storage.createBrand({ name: "Rancilio", description: "Commercial coffee equipment", createdBy: "System" });

    const adminProds = [
      { name: "Lavazza Super Crema Espresso 1kg",    description: "Velvety smooth espresso blend with notes of hazelnut and brown sugar",  imageUrl: "https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=500&q=80",  categoryId: coffeeBeans.id, subCategoryId: arabica.id,   flavorId: hazelnut.id,   sizeId: bag1kg.id,  brandId: lavazza.id,   category: "Coffee Beans" },
      { name: "Lavazza Qualità Rossa Ground 500g",   description: "Balanced medium roast, perfect for espresso machines",                  imageUrl: "https://images.unsplash.com/photo-1507133750040-4a8f57021571?w=500&q=80",  categoryId: coffeeBeans.id, subCategoryId: ground.id,    flavorId: caramel.id,    sizeId: bag500.id,  brandId: lavazza.id,   category: "Coffee Beans" },
      { name: "Illy Classico Arabica Beans 500g",    description: "9 arabica varieties blended for a consistently rich espresso",          imageUrl: "https://images.unsplash.com/photo-1611854779393-1b2da9d400fe?w=500&q=80",  categoryId: coffeeBeans.id, subCategoryId: arabica.id,   flavorId: unflavored.id, sizeId: bag500.id,  brandId: illy.id,      category: "Coffee Beans" },
      { name: "Nespresso Original Capsules x10",     description: "Intense espresso with a rich crema — Ristretto blend",                 imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&q=80",  categoryId: coffeeBeans.id, subCategoryId: capsules.id,  flavorId: chocolate.id,  sizeId: shot.id,    brandId: nespresso.id, category: "Coffee Beans" },
      { name: "Cold Brew Coarse Grind Bag 250g",     description: "Specially coarse-ground Ethiopian Sidamo for 18hr cold brew",          imageUrl: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500&q=80",  categoryId: coffeeBeans.id, subCategoryId: coldBrew.id,  flavorId: vanilla.id,    sizeId: bag250.id,  brandId: illy.id,      category: "Coffee Beans" },
      { name: "Robusta Dark Roast Beans 1kg",        description: "High-caffeine Vietnamese robusta, bold and full-bodied",               imageUrl: "https://images.unsplash.com/photo-1481833761820-0509d3217039?w=500&q=80",  categoryId: coffeeBeans.id, subCategoryId: robusta.id,   flavorId: unflavored.id, sizeId: bag1kg.id,  brandId: lavazza.id,   category: "Coffee Beans" },
      { name: "Oatly Barista Edition 1L",            description: "The original barista oat milk — steams to silky perfection",           imageUrl: "https://images.unsplash.com/photo-1600788886242-5c96aabe3757?w=500&q=80",  categoryId: dairy.id,       subCategoryId: oatMilk.id,   flavorId: unflavored.id, sizeId: liter.id,   brandId: oatly.id,     category: "Dairy & Alternatives" },
      { name: "Oatly Barista 6x1L Pack",             description: "Case of 6 Oatly Barista — perfect for busy cafes",                    imageUrl: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=500&q=80",  categoryId: dairy.id,       subCategoryId: oatMilk.id,   flavorId: unflavored.id, sizeId: sixPack.id, brandId: oatly.id,     category: "Dairy & Alternatives" },
      { name: "Alpro Almond Barista 1L",             description: "Light nutty almond milk with excellent foam quality",                   imageUrl: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&q=80",  categoryId: dairy.id,       subCategoryId: almondMilk.id, flavorId: almond.id,    sizeId: liter.id,   brandId: alpro.id,     category: "Dairy & Alternatives" },
      { name: "UHT Whole Milk 6x1L",                 description: "Long-life full-fat milk for consistent café use",                      imageUrl: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&q=80",  categoryId: dairy.id,       subCategoryId: wholeMilk.id, flavorId: unflavored.id, sizeId: sixPack.id, brandId: alpro.id,     category: "Dairy & Alternatives" },
      { name: "Monin Vanilla Syrup 700ml",           description: "Classic Madagascar bourbon vanilla — the café staple",                 imageUrl: "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=500&q=80",  categoryId: syrups.id,      subCategoryId: classicSyr.id, flavorId: vanilla.id,   sizeId: medium.id,  brandId: monin.id,     category: "Syrups & Flavors" },
      { name: "Monin Caramel Syrup 700ml",           description: "Buttery caramel for lattes and frappés",                              imageUrl: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&q=80",  categoryId: syrups.id,      subCategoryId: classicSyr.id, flavorId: caramel.id,   sizeId: medium.id,  brandId: monin.id,     category: "Syrups & Flavors" },
      { name: "Monin Hazelnut Sugar-Free 700ml",     description: "Zero-sugar hazelnut syrup — guilt-free indulgence",                   imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500&q=80",  categoryId: syrups.id,      subCategoryId: sfSyr.id,      flavorId: hazelnut.id,  sizeId: medium.id,  brandId: monin.id,     category: "Syrups & Flavors" },
      { name: "Monin Coconut Syrup 700ml",           description: "Tropical coconut for iced drinks and smoothies",                      imageUrl: "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=500&q=80",  categoryId: syrups.id,      subCategoryId: classicSyr.id, flavorId: coconut.id,   sizeId: medium.id,  brandId: monin.id,     category: "Syrups & Flavors" },
      { name: "DeLonghi Dedica Espresso Machine",    description: "Slim 15-bar pump espresso machine for specialty cafés",               imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500&q=80",  categoryId: equipment.id,   subCategoryId: machines.id,  flavorId: unflavored.id, sizeId: large.id,   brandId: delonghi.id,  category: "Equipment & Supplies" },
      { name: "Rancilio Silvia Pro Espresso",        description: "Dual boiler prosumer machine for high-volume use",                    imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&q=80",  categoryId: equipment.id,   subCategoryId: machines.id,  flavorId: unflavored.id, sizeId: large.id,   brandId: rancilio.id,  category: "Equipment & Supplies" },
      { name: "80mm Biodegradable Coffee Cups x500", description: "Single-wall compostable cups with lids — café-ready",                 imageUrl: "https://images.unsplash.com/photo-1506619216599-9d16d0903dfd?w=500&q=80",  categoryId: equipment.id,   subCategoryId: cups.id,      flavorId: unflavored.id, sizeId: small.id,   brandId: delonghi.id,  category: "Equipment & Supplies" },
      { name: "English Breakfast Tea Bags x100",     description: "Robust black tea blend — classic breakfast companion",                imageUrl: "https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=500&q=80",  categoryId: tea.id,         subCategoryId: blackTea.id,  flavorId: unflavored.id, sizeId: large.id,   brandId: alpro.id,     category: "Tea & Herbal" },
      { name: "Ceremonial Grade Matcha 100g",        description: "Vibrant green ceremonial matcha from Uji, Japan",                    imageUrl: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500&q=80",  categoryId: tea.id,         subCategoryId: greenTea.id,  flavorId: mint.id,       sizeId: bag250.id,  brandId: alpro.id,     category: "Tea & Herbal" },
      { name: "Chamomile Herbal Infusion x50",       description: "Calming chamomile flowers — naturally caffeine-free",                imageUrl: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500&q=80",  categoryId: tea.id,         subCategoryId: herbal.id,    flavorId: unflavored.id, sizeId: medium.id,  brandId: alpro.id,     category: "Tea & Herbal" },
      { name: "Butter Croissants x12",               description: "All-butter pre-baked croissants — just thaw and serve",              imageUrl: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&q=80",  categoryId: snacks.id,      subCategoryId: pastries.id,  flavorId: unflavored.id, sizeId: large.id,   brandId: lavazza.id,   category: "Snacks & Food" },
      { name: "Cantuccini Biscotti 500g",            description: "Crunchy almond biscotti — perfect with espresso",                    imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&q=80",  categoryId: snacks.id,      subCategoryId: biscuits.id,  flavorId: almond.id,     sizeId: bag500.id,  brandId: illy.id,      category: "Snacks & Food" },
    ];

    for (const p of adminProds) {
      await storage.createProduct({
        ...p,
        price: 0,
        stock: 0,
        supplierId: null,
        isAdminProduct: true,
      });
    }

    console.log("✅ [seed] Database seeded successfully");
    return;
  }

  // ── Landing Config singleton — always ensure one row exists ─────────────
  const lcRows = await db.select().from(landingConfig).limit(1);
  if (lcRows.length === 0) {
    await db.insert(landingConfig).values({}).execute();
    console.log("✅ [seed] Landing config initialized");
  }

  console.log("[seed] Database already populated — skipping seed");
}
