// Client-side fallback icons for PRINT categories/subcategories — mirrors the
// same convention already used for Marketing categories (marketing-page.tsx's
// CATEGORY_ICON_FALLBACK): the DB's own printCategoryTaxonomy.icon /
// printSubCategoryTaxonomy.icon column (Admin-editable) is always the source
// of truth; this map only fills in a sensible default for the moment a
// category/subcategory has no icon set yet, so every real PRINT-category
// display surface (Admin categories list, Printer category picker, Coffee
// Owner PRINT marketplace) renders something meaningful without hardcoding
// the category list itself — the actual names still come from the taxonomy.
export const PRINT_CATEGORY_ICON_FALLBACK: Record<string, string> = {
  CARTON: "📦",
  Flyers: "📄",
  Gobelets: "🥤",
  Numerique: "🖥️",
  Numérique: "🖥️",
  Packaging: "🎁",
  Papier: "📃",
  Papiers: "📃",
  "Serie-Graphy": "🖨️",
  "Sérigraphie": "🖨️",
  Tableau: "🪧",
  Tableaus: "🪧",
  Tableaux: "🪧",
  Textile: "👕",
  Textiles: "👕",
  Uniformes: "👔",
};

export const PRINT_SUBCATEGORY_ICON_FALLBACK: Record<string, string> = {
  "T-shirt": "👕",
  Tablier: "🧵",
  A4: "📄",
  A5: "📃",
  A3: "📃",
  Coffee: "☕",
  Sugar: "🧂",
  Goblet: "🥤",
  "papier carton": "📦",
  Plastique: "♻️",
  Bois: "🪵",
  Verre: "🪟",
};

export const PRINT_CATEGORY_GENERIC_ICON = "🖨️";

export function printCategoryIcon(name: string, icon?: string | null): string {
  return icon || PRINT_CATEGORY_ICON_FALLBACK[name] || PRINT_CATEGORY_GENERIC_ICON;
}

export function printSubCategoryIcon(name: string, icon?: string | null): string {
  return icon || PRINT_SUBCATEGORY_ICON_FALLBACK[name] || PRINT_CATEGORY_GENERIC_ICON;
}
