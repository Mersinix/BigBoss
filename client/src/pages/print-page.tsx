import { useState, useMemo, useEffect } from "react";
import printBannerImg from "@assets/1000_F_446608261_m4mqK7D6A8O68SkqWo4ea4VQgrGVbRHY_(1)_1780853922496.jpg";
import { useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Package, Star, Clock, SlidersHorizontal, RotateCcw, Printer, Users, Heart
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useFavorites } from "@/hooks/use-favorites";
import {
  PRINT_CATEGORIES, PRINT_SUBCATEGORIES, PRINT_BRANDS, PRINT_PRODUCTS,
  getPrintBrand, getPrintCategory, getPrintSubCategory,
  type PrintProduct,
} from "@/data/print-data";

// ── Category Strip ────────────────────────────────────────────────────────────

function PrintCategoryStrip({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-1 overflow-x-auto py-3" style={{ scrollbarWidth: "none" }}>
          <button
            onClick={() => onSelect("")}
            className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl shrink-0 transition-all text-center min-w-[64px] ${selected === "" ? "bg-blue-600 text-white shadow-sm" : "hover:bg-gray-100 text-gray-600"}`}
            data-testid="button-print-cat-all"
          >
            <span className="text-lg"><Printer className="w-5 h-5" /></span>
            <span className="text-[11px] font-semibold leading-tight">Tout</span>
          </button>
          {PRINT_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onSelect(selected === cat.id ? "" : cat.id)}
              className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl shrink-0 transition-all text-center min-w-[64px] ${selected === cat.id ? "bg-blue-600 text-white shadow-sm" : "hover:bg-gray-100 text-gray-600"}`}
              data-testid={`button-print-cat-${cat.id}`}
            >
              <span className="text-lg">{cat.icon}</span>
              <span className="text-[11px] font-semibold leading-tight line-clamp-2 max-w-[64px]">{cat.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Rating Stars ──────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map((s) => (
        <span key={s} className={`text-[11px] ${s <= Math.round(rating) ? "text-amber-400" : "text-gray-200"}`}>★</span>
      ))}
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────

function PrintProductCard({ product, onClick }: { product: PrintProduct; onClick: () => void }) {
  const brand = getPrintBrand(product.brandId);
  const category = getPrintCategory(product.categoryId);
  const faved = useFavorites((s) => !!s.print[product.id]);
  const togglePrint = useFavorites((s) => s.togglePrint);

  return (
    <div
      data-testid={`card-print-${product.id}`}
      className="group cursor-pointer bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col"
      onClick={onClick}
    >
      <div className="relative aspect-[4/3] bg-gray-50 overflow-hidden">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Package className="w-10 h-10 text-gray-200" /></div>
        )}
        {category && (
          <div className="absolute top-2 left-2">
            <Badge className="bg-white/90 text-gray-700 backdrop-blur-sm text-[10px] font-semibold shadow-sm border-0 px-2">
              {category.icon} {category.name}
            </Badge>
          </div>
        )}
        <button
          className="absolute top-2 right-2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            togglePrint({
              id: product.id,
              name: product.name,
              brand: brand?.name ?? "",
              price: product.basePrice,
              priceUnit: product.priceUnit,
              image: product.imageUrl ?? "",
            });
          }}
          data-testid={`button-fav-print-${product.id}`}
        >
          <Heart className={`w-3.5 h-3.5 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
        </button>
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2">
        <h3 className="font-bold text-sm leading-tight line-clamp-2 group-hover:text-blue-600 transition-colors">{product.name}</h3>
        {brand && <p className="text-xs text-gray-500 font-medium">{brand.name}</p>}
        <div className="flex items-center gap-1.5">
          <StarRating rating={product.rating} />
          <span className="text-[11px] text-gray-400">({product.reviewCount})</span>
        </div>
        <div className="mt-auto pt-2 border-t border-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-400">À partir de</p>
              <p className="font-bold text-sm text-blue-600">{formatCurrency(product.basePrice)}<span className="text-[10px] text-gray-400 font-normal">/{product.priceUnit}</span></p>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-gray-400">
              <Clock className="w-3 h-3" />
              <span>{product.deliveryTime}</span>
            </div>
          </div>
          {product.minQuantity > 1 && (
            <p className="text-[10px] text-gray-400 mt-1">Min. {product.minQuantity} {product.priceUnit}s</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Filter Bar ────────────────────────────────────────────────────────────────

interface PrintFilters {
  subCategoryId: string;
  brandId: string;
  material: string;
  deliveryTime: string;
}

const DELIVERY_OPTIONS = ["24h", "48h", "3-5 jours", "1 semaine"];

function PrintFilterBar({ products, filters, onChange, onReset, categoryId }: {
  products: PrintProduct[];
  filters: PrintFilters;
  onChange: (key: keyof PrintFilters, val: string) => void;
  onReset: () => void;
  categoryId: string;
}) {
  const hasActive = Object.values(filters).some(Boolean);

  const subCategories = useMemo(() => {
    const catId = categoryId || null;
    return PRINT_SUBCATEGORIES.filter((sc) =>
      (!catId || sc.categoryId === catId) &&
      products.some((p) => p.subCategoryId === sc.id)
    );
  }, [products, categoryId]);

  const brands = useMemo(() => {
    const ids = new Set(products.map((p) => p.brandId));
    return PRINT_BRANDS.filter((b) => ids.has(b.id));
  }, [products]);

  const materials = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.materials.forEach((m) => set.add(m)));
    return Array.from(set);
  }, [products]);

  const deliveryTimes = useMemo(() => {
    const set = new Set(products.map((p) => p.deliveryTime));
    return DELIVERY_OPTIONS.filter((d) => set.has(d));
  }, [products]);

  if (!subCategories.length && !brands.length && !materials.length) return null;

  return (
    <div className="bg-white border-b border-gray-100 py-2 px-4">
      <div className="max-w-7xl mx-auto flex items-center gap-2 flex-wrap">
        <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        {subCategories.length > 0 && (
          <Select value={filters.subCategoryId || "__all__"} onValueChange={(v) => onChange("subCategoryId", v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[130px]"><SelectValue placeholder="Sous-catégorie" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Toutes sous-catégories</SelectItem>
              {subCategories.map((sc) => <SelectItem key={sc.id} value={sc.id}>{sc.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {brands.length > 0 && (
          <Select value={filters.brandId || "__all__"} onValueChange={(v) => onChange("brandId", v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[120px]"><SelectValue placeholder="Société d'impression" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Toutes sociétés</SelectItem>
              {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {materials.length > 0 && (
          <Select value={filters.material || "__all__"} onValueChange={(v) => onChange("material", v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[110px]"><SelectValue placeholder="Matière" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Toutes matières</SelectItem>
              {materials.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {deliveryTimes.length > 0 && (
          <Select value={filters.deliveryTime || "__all__"} onValueChange={(v) => onChange("deliveryTime", v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[110px]"><SelectValue placeholder="Livraison" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Toutes livraisons</SelectItem>
              {deliveryTimes.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {hasActive && (
          <button onClick={onReset} className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors ml-1">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PrintPage({ comingSoon = false }: { comingSoon?: boolean }) {
  const [, navigate] = useLocation();
  const searchStr = useSearch();

  const urlParams = useMemo(() => new URLSearchParams(searchStr), [searchStr]);
  const initialSearch = urlParams.get("q") ?? "";
  const initialCategory = urlParams.get("categoryId") ?? "";

  const [categoryId, setCategoryId] = useState(initialCategory);
  const [filters, setFilters] = useState<PrintFilters>({ subCategoryId: "", brandId: "", material: "", deliveryTime: "" });

  useEffect(() => {
    setCategoryId(urlParams.get("categoryId") ?? "");
  }, [searchStr]);

  const searchQuery = initialSearch.toLowerCase();

  const filtered = useMemo(() => {
    let list = PRINT_PRODUCTS;

    if (searchQuery) {
      list = list.filter((p) => {
        const brand = getPrintBrand(p.brandId);
        const cat = getPrintCategory(p.categoryId);
        const subcat = getPrintSubCategory(p.subCategoryId);
        return (
          p.name.toLowerCase().includes(searchQuery) ||
          p.description.toLowerCase().includes(searchQuery) ||
          cat?.name.toLowerCase().includes(searchQuery) ||
          subcat?.name.toLowerCase().includes(searchQuery) ||
          brand?.name.toLowerCase().includes(searchQuery)
        );
      });
    }
    if (categoryId) list = list.filter((p) => p.categoryId === categoryId);
    if (filters.subCategoryId) list = list.filter((p) => p.subCategoryId === filters.subCategoryId);
    if (filters.brandId) list = list.filter((p) => p.brandId === filters.brandId);
    if (filters.material) list = list.filter((p) => p.materials.includes(filters.material));
    if (filters.deliveryTime) list = list.filter((p) => p.deliveryTime === filters.deliveryTime);

    return list;
  }, [searchQuery, categoryId, filters]);

  const updateFilter = (key: keyof PrintFilters, val: string) => setFilters((p) => ({ ...p, [key]: val }));
  const resetFilters = () => setFilters({ subCategoryId: "", brandId: "", material: "", deliveryTime: "" });

  const selectedCategory = PRINT_CATEGORIES.find((c) => c.id === categoryId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-12 pb-16 px-4 overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url('${printBannerImg}')` }}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/85 via-blue-800/80 to-indigo-900/85" />
        {/* Content */}
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
            <Printer className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
            BigBoss <span className="text-blue-200">PRINT</span>
          </h1>
          <p className="text-blue-100 text-lg mb-2 max-w-xl mx-auto">
            Commandez vos supports imprimés professionnels directement depuis la plateforme.
          </p>
          <div className="flex items-center justify-center gap-6 flex-wrap text-blue-100 text-sm mt-6">
            <span className="flex items-center gap-1.5">
              <Package className="w-4 h-4" />
              {PRINT_PRODUCTS.length} produits disponibles
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {PRINT_BRANDS.length} sociétés d'impression
            </span>
            <span className="flex items-center gap-1.5">
              <Star className="w-4 h-4 fill-blue-200" />
              {PRINT_CATEGORIES.length} catégories
            </span>
          </div>
        </div>
      </section>

      {comingSoon ? (
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Clock className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2" data-testid="text-coming-soon-title">
            Bientôt disponible
          </h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Ce service est en cours de préparation. Revenez bientôt pour le découvrir.
          </p>
        </div>
      ) : (
      <>
      <div className="sticky top-14 z-30">
        <PrintCategoryStrip
          selected={categoryId}
          onSelect={(id) => {
            setCategoryId(id);
            resetFilters();
            const params = new URLSearchParams();
            if (searchQuery) params.set("q", searchQuery);
            if (id) params.set("categoryId", id);
            navigate(`/print${params.toString() ? "?" + params.toString() : ""}`);
          }}
        />

        <PrintFilterBar
          products={PRINT_PRODUCTS}
          filters={filters}
          onChange={updateFilter}
          onReset={resetFilters}
          categoryId={categoryId}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="font-bold text-lg text-gray-900">
            {selectedCategory ? `${selectedCategory.icon} ${selectedCategory.name}` : "Services d'impression"}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{filtered.length} service{filtered.length !== 1 ? "s" : ""} disponible{filtered.length !== 1 ? "s" : ""}</p>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <Printer className="w-14 h-14 text-gray-200" />
            <div>
              <p className="font-semibold text-gray-700">Aucun service trouvé</p>
              <p className="text-sm text-gray-400 mt-1">Essayez d'ajuster vos filtres.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => { resetFilters(); setCategoryId(""); navigate("/print"); }}>
              Effacer les filtres
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((product) => (
              <PrintProductCard
                key={product.id}
                product={product}
                onClick={() => navigate(`/print/${product.id}`)}
              />
            ))}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
