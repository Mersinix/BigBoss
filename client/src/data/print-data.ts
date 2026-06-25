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
  { id: "pc1", name: "T-Shirt Printing", icon: "👕" },
  { id: "pc2", name: "Cap Printing", icon: "🧢" },
  { id: "pc3", name: "Logo Design", icon: "✏️" },
  { id: "pc4", name: "Flyers", icon: "📄" },
  { id: "pc5", name: "Glass Printing", icon: "☕" },
  { id: "pc6", name: "Stickers", icon: "🏷️" },
  { id: "pc7", name: "Packaging", icon: "📦" },
  { id: "pc8", name: "Menu Design", icon: "📋" },
];

// ── Sub-categories ────────────────────────────────────────────────────────────

export const PRINT_SUBCATEGORIES: PrintSubCategory[] = [
  { id: "psc1",  name: "Polo",              categoryId: "pc1" },
  { id: "psc2",  name: "Standard T-Shirt",  categoryId: "pc1" },
  { id: "psc3",  name: "Premium T-Shirt",   categoryId: "pc1" },
  { id: "psc4",  name: "Hoodie",            categoryId: "pc1" },
  { id: "psc5",  name: "Baseball Cap",      categoryId: "pc2" },
  { id: "psc6",  name: "Snapback",          categoryId: "pc2" },
  { id: "psc7",  name: "Trucker Cap",       categoryId: "pc2" },
  { id: "psc8",  name: "Basic Logo",        categoryId: "pc3" },
  { id: "psc9",  name: "Premium Logo",      categoryId: "pc3" },
  { id: "psc10", name: "Brand Identity Kit",categoryId: "pc3" },
  { id: "psc11", name: "A5",               categoryId: "pc4" },
  { id: "psc12", name: "A4",               categoryId: "pc4" },
  { id: "psc13", name: "Folded Flyer",     categoryId: "pc4" },
  { id: "psc14", name: "Coffee Cup",       categoryId: "pc5" },
  { id: "psc15", name: "Glass Cup",        categoryId: "pc5" },
  { id: "psc16", name: "Mug",              categoryId: "pc5" },
  { id: "psc17", name: "Die-cut",          categoryId: "pc6" },
  { id: "psc18", name: "Roll",             categoryId: "pc6" },
  { id: "psc19", name: "Sheet",            categoryId: "pc6" },
  { id: "psc20", name: "Coffee Bags",      categoryId: "pc7" },
  { id: "psc21", name: "Boxes",            categoryId: "pc7" },
  { id: "psc22", name: "Labels",           categoryId: "pc7" },
  { id: "psc23", name: "Printed Menu",     categoryId: "pc8" },
  { id: "psc24", name: "Laminated Menu",   categoryId: "pc8" },
  { id: "psc25", name: "Luxury Menu",      categoryId: "pc8" },
];

// ── Brands (Printing Companies) ───────────────────────────────────────────────

export const PRINT_BRANDS: PrintBrand[] = [
  { id: "pb1", name: "PrintMaster Tunisia",      location: "Tunis Centre", rating: 4.9, deliveryTime: "48h" },
  { id: "pb2", name: "Creative Print",           location: "Sfax",         rating: 4.7, deliveryTime: "3-5 jours" },
  { id: "pb3", name: "Coffee Branding Pro",      location: "Sousse",       rating: 4.8, deliveryTime: "24h" },
  { id: "pb4", name: "Tunisia Print Solutions",  location: "Tunis",        rating: 4.6, deliveryTime: "1 semaine" },
];

// ── Products ──────────────────────────────────────────────────────────────────

export const PRINT_PRODUCTS: PrintProduct[] = [
  // ── T-Shirt Printing ──
  {
    id: "pp1",
    name: "Polo Café Brodé",
    description: "Polo professionnel personnalisé avec broderie logo. Idéal pour l'équipe de salle.",
    categoryId: "pc1", subCategoryId: "psc1", brandId: "pb1",
    imageUrl: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=500&q=80",
    basePrice: 800, deliveryTime: "48h", rating: 4.8, reviewCount: 34,
    materials: ["Cotton", "Premium Cotton", "Polyester"],
    hasSizes: true, minQuantity: 5, priceUnit: "pièce",
  },
  {
    id: "pp2",
    name: "T-Shirt Standard Logo",
    description: "T-shirt 100% coton avec impression sérigraphie ou DTF de votre logo.",
    categoryId: "pc1", subCategoryId: "psc2", brandId: "pb2",
    imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500&q=80",
    basePrice: 500, deliveryTime: "3-5 jours", rating: 4.6, reviewCount: 52,
    materials: ["Cotton", "Polyester"],
    hasSizes: true, minQuantity: 10, priceUnit: "pièce",
  },
  {
    id: "pp3",
    name: "T-Shirt Premium Sérigraphie",
    description: "T-shirt premium peigné avec impression haute résolution, couleurs vives garanties.",
    categoryId: "pc1", subCategoryId: "psc3", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=500&q=80",
    basePrice: 700, deliveryTime: "24h", rating: 4.9, reviewCount: 41,
    materials: ["Premium Cotton", "Polyester"],
    hasSizes: true, minQuantity: 5, priceUnit: "pièce",
  },
  {
    id: "pp4",
    name: "Hoodie Staff Personnalisé",
    description: "Hoodie molleton avec poche kangourou, sérigraphie ou broderie recto-verso.",
    categoryId: "pc1", subCategoryId: "psc4", brandId: "pb1",
    imageUrl: "https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=500&q=80",
    basePrice: 1800, deliveryTime: "48h", rating: 4.7, reviewCount: 19,
    materials: ["Cotton", "Premium Cotton", "Polyester"],
    hasSizes: true, minQuantity: 3, priceUnit: "pièce",
  },
  // ── Cap Printing ──
  {
    id: "pp5",
    name: "Casquette Baseball Logo",
    description: "Casquette baseball 6 panneaux avec broderie logo 3D, boucle ajustable.",
    categoryId: "pc2", subCategoryId: "psc5", brandId: "pb1",
    imageUrl: "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=500&q=80",
    basePrice: 600, deliveryTime: "48h", rating: 4.7, reviewCount: 28,
    materials: ["Polyester", "Cotton Twill", "Mesh"],
    hasSizes: false, minQuantity: 10, priceUnit: "pièce",
  },
  {
    id: "pp6",
    name: "Snapback Flat Brim",
    description: "Snapback tendance avec broderie plate ou patch tissé, ajustement parfait.",
    categoryId: "pc2", subCategoryId: "psc6", brandId: "pb2",
    imageUrl: "https://images.unsplash.com/photo-1556306535-38febf6782e7?w=500&q=80",
    basePrice: 700, deliveryTime: "3-5 jours", rating: 4.5, reviewCount: 16,
    materials: ["Polyester", "Cotton Twill"],
    hasSizes: false, minQuantity: 10, priceUnit: "pièce",
  },
  {
    id: "pp7",
    name: "Trucker Cap Filet",
    description: "Trucker cap vintage dos filet, idéale pour promotions et événements café.",
    categoryId: "pc2", subCategoryId: "psc7", brandId: "pb4",
    imageUrl: "https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?w=500&q=80",
    basePrice: 650, deliveryTime: "1 semaine", rating: 4.4, reviewCount: 11,
    materials: ["Polyester", "Mesh"],
    hasSizes: false, minQuantity: 10, priceUnit: "pièce",
  },
  // ── Logo Design ──
  {
    id: "pp8",
    name: "Design Logo Basique",
    description: "Création logo professionnel avec 3 concepts + 2 révisions. Livrables PNG, SVG, PDF.",
    categoryId: "pc3", subCategoryId: "psc8", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1626785774573-4b799315345d?w=500&q=80",
    basePrice: 15000, deliveryTime: "3-5 jours", rating: 4.8, reviewCount: 67,
    materials: [],
    hasSizes: false, minQuantity: 1, priceUnit: "design",
  },
  {
    id: "pp9",
    name: "Logo Premium Identité",
    description: "Logo premium + charte graphique (couleurs, typographies, déclinaisons). 5 concepts.",
    categoryId: "pc3", subCategoryId: "psc9", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1634942537034-2531766767d1?w=500&q=80",
    basePrice: 35000, deliveryTime: "1 semaine", rating: 4.9, reviewCount: 43,
    materials: [],
    hasSizes: false, minQuantity: 1, priceUnit: "design",
  },
  {
    id: "pp10",
    name: "Brand Identity Kit Complet",
    description: "Kit complet : logo, charte, carte de visite, menu template, packaging, réseaux sociaux.",
    categoryId: "pc3", subCategoryId: "psc10", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1561070791-2526d30994b5?w=500&q=80",
    basePrice: 50000, deliveryTime: "1 semaine", rating: 5.0, reviewCount: 22,
    materials: [],
    hasSizes: false, minQuantity: 1, priceUnit: "design",
  },
  // ── Flyers ──
  {
    id: "pp11",
    name: "Flyers A5 Promo",
    description: "Flyers A5 recto ou recto-verso, papier 135g/m². Idéal pour promotions café.",
    categoryId: "pc4", subCategoryId: "psc11", brandId: "pb4",
    imageUrl: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=500&q=80",
    basePrice: 20, deliveryTime: "24h", rating: 4.5, reviewCount: 89,
    materials: ["Matte", "Glossy"],
    hasSizes: false, minQuantity: 100, priceUnit: "unité",
  },
  {
    id: "pp12",
    name: "Flyers A4 Menu",
    description: "Flyers A4 impression haute qualité, parfait pour menus saisonniers et événements.",
    categoryId: "pc4", subCategoryId: "psc12", brandId: "pb1",
    imageUrl: "https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=500&q=80",
    basePrice: 35, deliveryTime: "48h", rating: 4.6, reviewCount: 54,
    materials: ["Matte", "Glossy"],
    hasSizes: false, minQuantity: 50, priceUnit: "unité",
  },
  {
    id: "pp13",
    name: "Flyer Plié DL",
    description: "Flyer plié en 3 volets, format DL (99x210mm). Idéal pour brochures et offres.",
    categoryId: "pc4", subCategoryId: "psc13", brandId: "pb2",
    imageUrl: "https://images.unsplash.com/photo-1601933513793-5f81fc44c13b?w=500&q=80",
    basePrice: 60, deliveryTime: "3-5 jours", rating: 4.4, reviewCount: 31,
    materials: ["Matte", "Glossy"],
    hasSizes: false, minQuantity: 50, priceUnit: "unité",
  },
  // ── Glass Printing ──
  {
    id: "pp14",
    name: "Coffee Cup Personnalisé",
    description: "Mug café en céramique avec impression sublimation logo ou design complet.",
    categoryId: "pc5", subCategoryId: "psc14", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=500&q=80",
    basePrice: 400, deliveryTime: "48h", rating: 4.8, reviewCount: 77,
    materials: ["Ceramic", "Plastic"],
    hasSizes: false, minQuantity: 12, priceUnit: "pièce",
  },
  {
    id: "pp15",
    name: "Glass Cup Logo",
    description: "Verre café en verre trempé, gravure laser ou impression UV de votre logo.",
    categoryId: "pc5", subCategoryId: "psc15", brandId: "pb1",
    imageUrl: "https://images.unsplash.com/photo-1572635148818-ef6fd45eb394?w=500&q=80",
    basePrice: 450, deliveryTime: "48h", rating: 4.6, reviewCount: 38,
    materials: ["Glass", "Ceramic"],
    hasSizes: false, minQuantity: 12, priceUnit: "pièce",
  },
  {
    id: "pp16",
    name: "Mug Premium Sublimation",
    description: "Mug premium 350ml, impression sublimation 360° avec couleurs brillantes permanentes.",
    categoryId: "pc5", subCategoryId: "psc16", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1571019613531-ca6f4a2f92f4?w=500&q=80",
    basePrice: 550, deliveryTime: "24h", rating: 4.9, reviewCount: 91,
    materials: ["Ceramic"],
    hasSizes: false, minQuantity: 6, priceUnit: "pièce",
  },
  // ── Stickers ──
  {
    id: "pp17",
    name: "Stickers Die-cut Logo",
    description: "Stickers découpe selon forme du logo, vinyle waterproof UV, parfait pour emballages.",
    categoryId: "pc6", subCategoryId: "psc17", brandId: "pb4",
    imageUrl: "https://images.unsplash.com/photo-1604404586985-bc698c8d3f18?w=500&q=80",
    basePrice: 15, deliveryTime: "24h", rating: 4.7, reviewCount: 144,
    materials: ["Vinyl", "Holographic"],
    hasSizes: false, minQuantity: 100, priceUnit: "unité",
  },
  {
    id: "pp18",
    name: "Stickers Roll Continu",
    description: "Stickers en rouleau pour étiqueteuses, idéal pour packaging café et produits maison.",
    categoryId: "pc6", subCategoryId: "psc18", brandId: "pb2",
    imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&q=80",
    basePrice: 12, deliveryTime: "3-5 jours", rating: 4.5, reviewCount: 62,
    materials: ["Vinyl", "Paper"],
    hasSizes: false, minQuantity: 200, priceUnit: "unité",
  },
  // ── Packaging ──
  {
    id: "pp19",
    name: "Sacs Café Personnalisés",
    description: "Sacs kraft pour café moulu ou en grains, impression flexo ou numérique.",
    categoryId: "pc7", subCategoryId: "psc20", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=500&q=80",
    basePrice: 80, deliveryTime: "3-5 jours", rating: 4.7, reviewCount: 55,
    materials: ["Kraft", "Premium Kraft", "White Cardboard"],
    hasSizes: false, minQuantity: 50, priceUnit: "unité",
  },
  {
    id: "pp20",
    name: "Boîtes Packaging Premium",
    description: "Boîtes cartonnées personnalisées pour gâteaux, coffrets ou cadeaux café.",
    categoryId: "pc7", subCategoryId: "psc21", brandId: "pb1",
    imageUrl: "https://images.unsplash.com/photo-1614350292382-c448d0110dfa?w=500&q=80",
    basePrice: 120, deliveryTime: "1 semaine", rating: 4.6, reviewCount: 29,
    materials: ["Kraft", "White Cardboard"],
    hasSizes: false, minQuantity: 25, priceUnit: "unité",
  },
  {
    id: "pp21",
    name: "Étiquettes Produit",
    description: "Étiquettes papier ou vinyle pour vos produits maison, thés, confitures, cafés.",
    categoryId: "pc7", subCategoryId: "psc22", brandId: "pb4",
    imageUrl: "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500&q=80",
    basePrice: 8, deliveryTime: "24h", rating: 4.5, reviewCount: 118,
    materials: ["Paper", "Vinyl"],
    hasSizes: false, minQuantity: 200, priceUnit: "unité",
  },
  // ── Menu Design ──
  {
    id: "pp22",
    name: "Menu Imprimé Standard",
    description: "Menu format A4/A5 imprimé recto-verso, plastification optionnelle.",
    categoryId: "pc8", subCategoryId: "psc23", brandId: "pb4",
    imageUrl: "https://images.unsplash.com/photo-1534665482403-a909d0d97c67?w=500&q=80",
    basePrice: 250, deliveryTime: "48h", rating: 4.4, reviewCount: 43,
    materials: ["Matte Laminated", "Glossy Laminated"],
    hasSizes: false, minQuantity: 10, priceUnit: "unité",
  },
  {
    id: "pp23",
    name: "Menu Plastifié Pro",
    description: "Menu plastifié épais 400 microns, résistant à l'eau et aux taches. Longue durée.",
    categoryId: "pc8", subCategoryId: "psc24", brandId: "pb2",
    imageUrl: "https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?w=500&q=80",
    basePrice: 400, deliveryTime: "3-5 jours", rating: 4.7, reviewCount: 61,
    materials: ["Matte Laminated", "Glossy Laminated", "Soft Touch"],
    hasSizes: false, minQuantity: 5, priceUnit: "unité",
  },
  {
    id: "pp24",
    name: "Menu Luxe Cuir Synthétique",
    description: "Menu de prestige couverture cuir synthétique, pages intérieures haute qualité.",
    categoryId: "pc8", subCategoryId: "psc25", brandId: "pb3",
    imageUrl: "https://images.unsplash.com/photo-1582584650571-c18d2ba0d485?w=500&q=80",
    basePrice: 800, deliveryTime: "1 semaine", rating: 4.9, reviewCount: 17,
    materials: ["Soft Touch", "Matte Laminated"],
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
