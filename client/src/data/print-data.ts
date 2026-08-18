// ── PRINT Module Static Data ───────────────────────────────────────────────────

export interface PrintCategory {
  id: string;
  name: string;
  icon: string;
}

export interface PrintSubCategory {
  id: string;
  name: string;
  categoryId: string;
}

export interface PrintBrand {
  id: string;
  name: string;
  location: string;
  rating: number;
  deliveryTime: string;
}

export interface PrintProduct {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  subCategoryId: string;
  brandId: string;
  imageUrl: string;
  basePrice: number; // in cents (e.g. 800 = 8.00 DT)
  deliveryTime: string;
  rating: number;
  reviewCount: number;
  materials: string[];
  hasSizes: boolean;
  minQuantity: number;
  priceUnit: string; // "pièce" | "design" | "unité"
}

// ── Categories ────────────────────────────────────────────────────────────────

export const PRINT_CATEGORIES: PrintCategory[] = [
  { id: "pc1", name: "Staff Uniforms & Aprons", icon: "👕" },
  { id: "pc2", name: "Staff Accessories", icon: "🧢" },
  { id: "pc3", name: "Café Branding & Design", icon: "✏️" },
  { id: "pc4", name: "Marketing & Promotions", icon: "📄" },
  { id: "pc5", name: "Cups & Drinkware", icon: "☕" },
  { id: "pc6", name: "Labels & QR Codes", icon: "🏷️" },
  { id: "pc7", name: "Packaging", icon: "📦" },
  { id: "pc8", name: "Menus & POS Materials", icon: "📋" },
];

// ── Sub-categories ────────────────────────────────────────────────────────────

export const PRINT_SUBCATEGORIES: PrintSubCategory[] = [
  { id: "psc1",  name: "Barista Aprons",      categoryId: "pc1" },
  { id: "psc2",  name: "Polo Shirts",         categoryId: "pc1" },
  { id: "psc3",  name: "Staff T-Shirts",      categoryId: "pc1" },
  { id: "psc4",  name: "Hoodies",             categoryId: "pc1" },
  { id: "psc5",  name: "Baseball Caps",       categoryId: "pc2" },
  { id: "psc6",  name: "Barista Caps",        categoryId: "pc2" },
  { id: "psc7",  name: "Winter Beanies",      categoryId: "pc2" },
  { id: "psc8",  name: "Logo Design",         categoryId: "pc3" },
  { id: "psc9",  name: "Brand Identity",      categoryId: "pc3" },
  { id: "psc10", name: "Store Sign Design",   categoryId: "pc3" },
  { id: "psc11", name: "Flyers",              categoryId: "pc4" },
  { id: "psc12", name: "Loyalty Cards",       categoryId: "pc4" },
  { id: "psc13", name: "Posters",             categoryId: "pc4" },
  { id: "psc14", name: "Paper Cups",          categoryId: "pc5" },
  { id: "psc15", name: "Plastic Cups",        categoryId: "pc5" },
  { id: "psc16", name: "Ceramic Mugs",        categoryId: "pc5" },
  { id: "psc17", name: "QR Code Stickers",    categoryId: "pc6" },
  { id: "psc18", name: "Window Stickers",     categoryId: "pc6" },
  { id: "psc19", name: "Product Labels",      categoryId: "pc6" },
  { id: "psc20", name: "Sugar Sachets",       categoryId: "pc7" },
  { id: "psc21", name: "Coffee Bags",         categoryId: "pc7" },
  { id: "psc22", name: "Pastry Boxes",        categoryId: "pc7" },
  { id: "psc23", name: "Printed Menus",       categoryId: "pc8" },
  { id: "psc24", name: "Wooden Table Displays", categoryId: "pc8" },
  { id: "psc25", name: "Counter Displays",    categoryId: "pc8" },
];

// ── Brands (Printing Companies) ───────────────────────────────────────────────

export const PRINT_BRANDS: PrintBrand[] = [
  { id: "pb1", name: "Coffee Print Studio",        location: "Tunis Centre", rating: 4.9, deliveryTime: "48h" },
  { id: "pb2", name: "Café Branding Tunisia",      location: "Sfax",         rating: 4.7, deliveryTime: "3-5 jours" },
  { id: "pb3", name: "Barista Print Solutions",    location: "Sousse",       rating: 4.8, deliveryTime: "24h" },
  { id: "pb4", name: "Espresso Creative Print",    location: "Tunis",        rating: 4.6, deliveryTime: "1 semaine" },
];

// ── Products ──────────────────────────────────────────────────────────────────

export const PRINT_PRODUCTS: PrintProduct[] = [
  // ── Staff Uniforms & Aprons ──
  {
    id: "pp1",
    name: "Premium Embroidered Barista Apron",
    description: "Professional barista apron with custom logo embroidery, adjustable straps and deep pockets. Perfect for cafés and coffee shops.",
    categoryId: "pc1", subCategoryId: "psc1", brandId: "pb1",
    imageUrl: "https://images.unsplash.com/photo-1770494347810-5aa9e689f13e?w=500&q=80",
    basePrice: 800, deliveryTime: "48h", rating: 4.8, reviewCount: 34,
    materials: ["Cotton", "Canvas", "Polyester"],
    hasSizes: true, minQuantity: 5, priceUnit: "pièce",
  },
  {
    id: "pp2",
    name: "Coffee Shop Polo Shirt",
    description: "Breathable polo shirt with custom logo printing or embroidery. Ideal for front-of-house café and restaurant staff.",
    categoryId: "pc1", subCategoryId: "psc2", brandId: "pb2",
    imageUrl: "https://images.unsplash.com/photo-1627322308203-175395b058e9?w=500&q=80",
    basePrice: 500, deliveryTime: "3-5 jours", rating: 4.6, reviewCount: 52,
    materials: ["Cotton", "Polyester"],
    hasSizes: true, minQuantity: 10, priceUnit: "pièce",
  },
  {
    id: "pp3",
    name: "Premium Staff T-Shirt",
    description: "High-quality combed cotton t-shirt with vivid, durable logo printing. Suitable for daily café service.",
    categoryId: "pc1", subCategoryId: "psc3", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=500&q=80",
    basePrice: 700, deliveryTime: "24h", rating: 4.9, reviewCount: 41,
    materials: ["Premium Cotton", "Polyester"],
    hasSizes: true, minQuantity: 5, priceUnit: "pièce",
  },
  {
    id: "pp4",
    name: "Barista Hoodie",
    description: "Comfortable fleece hoodie with kangaroo pocket, custom front or back logo printing. Ideal for baristas working long shifts.",
    categoryId: "pc1", subCategoryId: "psc4", brandId: "pb1",
    imageUrl: "https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=500&q=80",
    basePrice: 1800, deliveryTime: "48h", rating: 4.7, reviewCount: 19,
    materials: ["Cotton", "Premium Cotton", "Polyester"],
    hasSizes: true, minQuantity: 3, priceUnit: "pièce",
  },
  // ── Staff Accessories ──
  {
    id: "pp5",
    name: "Coffee Shop Baseball Cap",
    description: "6-panel baseball cap with 3D embroidered logo and adjustable strap. Great café merchandise or staff wear.",
    categoryId: "pc2", subCategoryId: "psc5", brandId: "pb1",
    imageUrl: "https://images.unsplash.com/photo-1691256676359-20e5c6d4bc92?w=500&q=80",
    basePrice: 600, deliveryTime: "48h", rating: 4.7, reviewCount: 28,
    materials: ["Polyester", "Cotton"],
    hasSizes: false, minQuantity: 10, priceUnit: "pièce",
  },
  {
    id: "pp6",
    name: "Barista Cap",
    description: "Trendy structured cap with flat or curved brim, embroidered or woven patch logo. Designed for coffee branding.",
    categoryId: "pc2", subCategoryId: "psc6", brandId: "pb2",
    imageUrl: "https://images.unsplash.com/photo-1720534490358-bc2ad29d51d5?w=500&q=80",
    basePrice: 700, deliveryTime: "3-5 jours", rating: 4.5, reviewCount: 16,
    materials: ["Polyester", "Cotton"],
    hasSizes: false, minQuantity: 10, priceUnit: "pièce",
  },
  {
    id: "pp7",
    name: "Winter Beanie",
    description: "Warm knitted beanie with embroidered logo patch, perfect seasonal merchandise for cafés and coffee shops.",
    categoryId: "pc2", subCategoryId: "psc7", brandId: "pb4",
    imageUrl: "https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?w=500&q=80",
    basePrice: 650, deliveryTime: "1 semaine", rating: 4.4, reviewCount: 11,
    materials: ["Acrylic", "Polyester"],
    hasSizes: false, minQuantity: 10, priceUnit: "pièce",
  },
  // ── Café Branding & Design ──
  {
    id: "pp8",
    name: "Coffee Shop Logo Design",
    description: "Professional logo design with 3 concepts and 2 revisions. Deliverables in PNG, SVG and PDF, ideal for a new café brand.",
    categoryId: "pc3", subCategoryId: "psc8", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1626785774573-4b799315345d?w=500&q=80",
    basePrice: 15000, deliveryTime: "3-5 jours", rating: 4.8, reviewCount: 67,
    materials: [],
    hasSizes: false, minQuantity: 1, priceUnit: "design",
  },
  {
    id: "pp9",
    name: "Premium Coffee Brand Identity",
    description: "Premium logo plus full brand identity: colors, typography and variations. 5 concepts, designed for coffee branding.",
    categoryId: "pc3", subCategoryId: "psc9", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1634942537034-2531766767d1?w=500&q=80",
    basePrice: 35000, deliveryTime: "1 semaine", rating: 4.9, reviewCount: 43,
    materials: [],
    hasSizes: false, minQuantity: 1, priceUnit: "design",
  },
  {
    id: "pp10",
    name: "Complete Café Branding Kit",
    description: "Complete kit: logo, brand guidelines, business cards, menu template, packaging, store sign design and social media assets.",
    categoryId: "pc3", subCategoryId: "psc10", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1561070791-2526d30994b5?w=500&q=80",
    basePrice: 50000, deliveryTime: "1 semaine", rating: 5.0, reviewCount: 22,
    materials: [],
    hasSizes: false, minQuantity: 1, priceUnit: "design",
  },
  // ── Marketing & Promotions ──
  {
    id: "pp11",
    name: "Happy Hour Flyers",
    description: "A5 flyers, single or double-sided, 135g/m² paper. Perfect for cafés and coffee shops running happy hour promotions.",
    categoryId: "pc4", subCategoryId: "psc11", brandId: "pb4",
    imageUrl: "https://images.unsplash.com/photo-1622817245531-a07976979cf5?w=500&q=80",
    basePrice: 20, deliveryTime: "24h", rating: 4.5, reviewCount: 89,
    materials: ["Paper"],
    hasSizes: false, minQuantity: 100, priceUnit: "unité",
  },
  {
    id: "pp12",
    name: "Coffee Loyalty Cards",
    description: "Durable loyalty cards with stamp or punch grid, custom café branding. Ideal for building repeat coffee shop customers.",
    categoryId: "pc4", subCategoryId: "psc12", brandId: "pb1",
    imageUrl: "https://images.unsplash.com/photo-1718670013921-2f144aba173a?w=500&q=80",
    basePrice: 35, deliveryTime: "48h", rating: 4.6, reviewCount: 54,
    materials: ["PVC", "Glossy Laminated"],
    hasSizes: false, minQuantity: 50, priceUnit: "unité",
  },
  {
    id: "pp13",
    name: "Seasonal Promotion Posters",
    description: "High-quality posters for seasonal drinks, new menu launches and in-store promotions. Suitable for restaurant and café windows.",
    categoryId: "pc4", subCategoryId: "psc13", brandId: "pb2",
    imageUrl: "https://images.unsplash.com/photo-1572700433449-72c797656fe5?w=500&q=80",
    basePrice: 60, deliveryTime: "3-5 jours", rating: 4.4, reviewCount: 31,
    materials: ["Matte Laminated", "Glossy Laminated"],
    hasSizes: false, minQuantity: 50, priceUnit: "unité",
  },
  // ── Cups & Drinkware ──
  {
    id: "pp14",
    name: "Printed Paper Coffee Cups",
    description: "Custom-printed paper coffee cups with your café logo, food-safe lining. Suitable for takeaway drinks.",
    categoryId: "pc5", subCategoryId: "psc14", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1598908314732-07113901949e?w=500&q=80",
    basePrice: 400, deliveryTime: "48h", rating: 4.8, reviewCount: 77,
    materials: ["Paper", "Kraft"],
    hasSizes: false, minQuantity: 12, priceUnit: "pièce",
  },
  {
    id: "pp15",
    name: "Printed Plastic Cups",
    description: "Clear or colored plastic cups with custom printing, ideal for iced coffee and cold drinks. Suitable for takeaway service.",
    categoryId: "pc5", subCategoryId: "psc15", brandId: "pb1",
    imageUrl: "https://images.unsplash.com/photo-1578314675325-450f4ea07f4e?w=500&q=80",
    basePrice: 450, deliveryTime: "48h", rating: 4.6, reviewCount: 38,
    materials: ["Plastic", "PVC"],
    hasSizes: false, minQuantity: 12, priceUnit: "pièce",
  },
  {
    id: "pp16",
    name: "Premium Ceramic Coffee Mug",
    description: "350ml ceramic mug with 360° sublimation printing, vivid and permanent colors. Perfect for cafés and coffee shop merchandise.",
    categoryId: "pc5", subCategoryId: "psc16", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1571019613531-ca6f4a2f92f4?w=500&q=80",
    basePrice: 550, deliveryTime: "24h", rating: 4.9, reviewCount: 91,
    materials: ["Ceramic"],
    hasSizes: false, minQuantity: 6, priceUnit: "pièce",
  },
  // ── Labels & QR Codes ──
  {
    id: "pp17",
    name: "QR Code Stickers",
    description: "Waterproof vinyl QR code stickers linking to your menu, Wi-Fi or reviews. Durable for daily café service.",
    categoryId: "pc6", subCategoryId: "psc17", brandId: "pb4",
    imageUrl: "https://images.unsplash.com/photo-1766072972117-f3b61a0ccd54?w=500&q=80",
    basePrice: 15, deliveryTime: "24h", rating: 4.7, reviewCount: 144,
    materials: ["Vinyl", "PVC"],
    hasSizes: false, minQuantity: 100, priceUnit: "unité",
  },
  {
    id: "pp18",
    name: "Google Review QR Stickers",
    description: "Window or counter QR stickers directing customers straight to your Google review page. Ideal for baristas encouraging feedback.",
    categoryId: "pc6", subCategoryId: "psc18", brandId: "pb2",
    imageUrl: "https://images.unsplash.com/photo-1783436328881-3ce93b84a141?w=500&q=80",
    basePrice: 12, deliveryTime: "3-5 jours", rating: 4.5, reviewCount: 62,
    materials: ["Vinyl", "PVC"],
    hasSizes: false, minQuantity: 200, priceUnit: "unité",
  },
  // ── Packaging ──
  {
    id: "pp19",
    name: "Printed Sugar Sachets",
    description: "Custom-printed sugar sachets with your café logo, individually wrapped for hygiene. Suitable for restaurant and coffee shop tables.",
    categoryId: "pc7", subCategoryId: "psc20", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1565428442362-847c68dd6537?w=500&q=80",
    basePrice: 80, deliveryTime: "3-5 jours", rating: 4.7, reviewCount: 55,
    materials: ["Paper", "Kraft"],
    hasSizes: false, minQuantity: 50, priceUnit: "unité",
  },
  {
    id: "pp20",
    name: "Coffee Bean Bags",
    description: "Kraft coffee bags with valve, custom printing for beans or ground coffee. Premium packaging for coffee beans.",
    categoryId: "pc7", subCategoryId: "psc21", brandId: "pb1",
    imageUrl: "https://images.unsplash.com/photo-1524350876685-274059332603?w=500&q=80",
    basePrice: 120, deliveryTime: "1 semaine", rating: 4.6, reviewCount: 29,
    materials: ["Kraft", "Premium Kraft"],
    hasSizes: false, minQuantity: 25, priceUnit: "unité",
  },
  {
    id: "pp21",
    name: "Pastry Packaging Boxes",
    description: "Custom kraft boxes for pastries, cakes and gift sets. Sturdy packaging designed for daily bakery and café service.",
    categoryId: "pc7", subCategoryId: "psc22", brandId: "pb4",
    imageUrl: "https://images.unsplash.com/photo-1557952138-7ed256c23bc5?w=500&q=80",
    basePrice: 8, deliveryTime: "24h", rating: 4.5, reviewCount: 118,
    materials: ["Kraft", "Premium Kraft"],
    hasSizes: false, minQuantity: 200, priceUnit: "unité",
  },
  // ── Menus & POS Materials ──
  {
    id: "pp22",
    name: "Printed Café Menu",
    description: "A4/A5 double-sided printed menu, optional lamination. Ideal for cafés and restaurants updating seasonal offerings.",
    categoryId: "pc8", subCategoryId: "psc23", brandId: "pb4",
    imageUrl: "https://images.unsplash.com/photo-1534665482403-a909d0d97c67?w=500&q=80",
    basePrice: 250, deliveryTime: "48h", rating: 4.4, reviewCount: 43,
    materials: ["Paper", "Matte Laminated", "Glossy Laminated"],
    hasSizes: false, minQuantity: 10, priceUnit: "unité",
  },
  {
    id: "pp23",
    name: "Wooden Table Menu Holder",
    description: "Solid wood table stand for menus, QR codes or table numbers. Durable, reusable design for daily café service.",
    categoryId: "pc8", subCategoryId: "psc24", brandId: "pb2",
    imageUrl: "https://images.unsplash.com/photo-1777968305631-5c45cc32f796?w=500&q=80",
    basePrice: 400, deliveryTime: "3-5 jours", rating: 4.7, reviewCount: 61,
    materials: ["Wood", "Acrylic"],
    hasSizes: false, minQuantity: 5, priceUnit: "unité",
  },
  {
    id: "pp24",
    name: "Counter Display Stand",
    description: "Freestanding acrylic and wood counter display for pastries, merchandise or promotional cards. Ideal for cafés and coffee shops.",
    categoryId: "pc8", subCategoryId: "psc25", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1771332871561-d38ad0299e96?w=500&q=80",
    basePrice: 800, deliveryTime: "1 semaine", rating: 4.9, reviewCount: 17,
    materials: ["Acrylic", "Wood", "PVC"],
    hasSizes: false, minQuantity: 3, priceUnit: "unité",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getPrintCategory(id: string) {
  return PRINT_CATEGORIES.find((c) => c.id === id);
}

export function getPrintSubCategory(id: string) {
  return PRINT_SUBCATEGORIES.find((s) => s.id === id);
}

export function getPrintBrand(id: string) {
  return PRINT_BRANDS.find((b) => b.id === id);
}

export function getPrintProduct(id: string) {
  return PRINT_PRODUCTS.find((p) => p.id === id);
}

export const COLOR_SWATCHES = [
  { name: "Noir",     value: "#1A1A1A" },
  { name: "Blanc",    value: "#FFFFFF" },
  { name: "Marine",   value: "#1B2D6B" },
  { name: "Rouge",    value: "#E53935" },
  { name: "Bleu",     value: "#1565C0" },
  { name: "Vert",     value: "#2E7D32" },
  { name: "Jaune",    value: "#F9A825" },
  { name: "Orange",   value: "#E64A19" },
  { name: "Violet",   value: "#6A1B9A" },
  { name: "Rose",     value: "#AD1457" },
  { name: "Marron",   value: "#5D4037" },
  { name: "Gris",     value: "#546E7A" },
];

export const SIZE_OPTIONS = ["S", "M", "L", "XL", "XXL"];
