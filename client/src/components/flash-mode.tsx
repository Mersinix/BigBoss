import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Heart, X, ChevronRight, Package, Zap, SlidersHorizontal, Layers, Check, Info,
} from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";
import { useQuickView } from "@/hooks/use-quick-view";
import { usePackQuickView } from "@/hooks/use-pack-quick-view";
import type { ProductWithTaxonomy, PackDetail } from "@shared/schema";

// ── Types ────────────────────────────────────────────────────────────────────

type FlashProduct = ProductWithTaxonomy & {
  bestPrice?: number;
  listingId?: number;
  imageUrls?: string[] | null;
  hasPromo?: boolean;
};

type ContentType = "ALL" | "PRODUCTS" | "PROMOTIONS" | "PACKS";

type FlashItem =
  | { kind: "product"; data: FlashProduct }
  | { kind: "pack"; data: PackDetail };

export interface FlashModeProps {
  open: boolean;
  onClose: () => void;
  products: FlashProduct[];
  packs?: PackDetail[];
  storeName: string;
  supplierId?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getItemImages(item: FlashItem): string[] {
  if (item.kind === "product") {
    const p = item.data;
    const fromArr = (p.imageUrls ?? []).filter(Boolean);
    if (fromArr.length > 0) return fromArr;
    if (p.imageUrl) return [p.imageUrl];
    return [];
  }
  if (item.data.flashImageUrl) return [item.data.flashImageUrl];
  const normalImages = (item.data.imageUrls ?? []).filter(Boolean);
  if (normalImages.length > 0) return normalImages;
  return item.data.imageUrl ? [item.data.imageUrl] : [];
}

function getItemCategoryIds(item: FlashItem): number[] {
  if (item.kind === "product") {
    const id = item.data.categoryLabel?.id;
    return id != null ? [id] : [];
  }
  return item.data.categoryLabels.map((c) => c.id);
}

function getItemCategoryName(item: FlashItem): string | undefined {
  if (item.kind === "product") return item.data.categoryLabel?.name ?? undefined;
  return item.data.categoryLabels[0]?.name ?? undefined;
}

function getItemTaxonomyLabels(item: FlashItem): { name: string; tone: "normal" | "accent" }[] {
  if (item.kind === "product") {
    const p = item.data;
    return [
      p.categoryLabel?.name ? { name: p.categoryLabel.name, tone: "normal" } : null,
      p.subCategoryLabel?.name ? { name: p.subCategoryLabel.name, tone: "normal" } : null,
      p.brandLabel?.name ? { name: p.brandLabel.name, tone: "accent" } : null,
    ].filter((label): label is { name: string; tone: "normal" | "accent" } => !!label);
  }
  return [
    ...item.data.categoryLabels.map(c => ({ name: c.name, tone: "normal" as const })),
    ...item.data.subCategoryLabels.map(c => ({ name: c.name, tone: "normal" as const })),
    ...item.data.brandLabels.map(c => ({ name: c.name, tone: "accent" as const })),
  ];
}

// ── Content type options ──────────────────────────────────────────────────────

const CONTENT_OPTIONS: {
  type: ContentType;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    type: "ALL",
    label: "All",
    description: "Everything",
    icon: <SlidersHorizontal className="w-6 h-6" />,
  },{
    type: "PRODUCTS",
    label: "Products",
    description: "All products",
    icon: <Package className="w-6 h-6" />,
  },
  {
    type: "PROMOTIONS",
    label: "Promotions",
    description: "On sale now",
    icon: <Zap className="w-6 h-6" />,
  },
  {
    type: "PACKS",
    label: "Packs",
    description: "Bundle deals",
    icon: <Layers className="w-6 h-6" />,
  }
];

// ── Main component ────────────────────────────────────────────────────────────

export function FlashMode({
  open,
  onClose,
  products,
  packs = [],
  storeName,
  supplierId,
}: FlashModeProps) {
  // ── Navigation state ────────────────────────────────────────────────────────
  const [itemIdx, setItemIdx] = useState(0);
  const [imgIdx, setImgIdx] = useState(0);
  const [heartAnim, setHeartAnim] = useState(false);
  const lastTapRef = useRef<number>(0);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterStep, setFilterStep] = useState<1 | 2>(1);

  // "pending" = what the user is configuring inside the filter panel
  const [pendingContent, setPendingContent] = useState<ContentType>("ALL");
  const [pendingCats, setPendingCats] = useState<number[]>([]);

  // "active" = what is actually applied to the Flash list
  const [activeContent, setActiveContent] = useState<ContentType>("ALL");
  const [activeCats, setActiveCats] = useState<number[]>([]);

  // ── Build unified item list ──────────────────────────────────────────────────
  const allItems = useMemo((): FlashItem[] => {
    const productItems: FlashItem[] = products.map((p) => ({
      kind: "product",
      data: p,
    }));
    const packItems: FlashItem[] = packs.map((p) => ({
      kind: "pack",
      data: p,
    }));
    // Natural order: products first, then packs (for ALL)
    return [...productItems, ...packItems];
  }, [products, packs]);

  // ── Content availability flags ───────────────────────────────────────────────
  const hasPromotions = useMemo(
    () => allItems.some((i) => i.kind === "product" && !!(i.data as FlashProduct).hasPromo),
    [allItems],
  );
  const hasPacks = useMemo(() => allItems.some((i) => i.kind === "pack"), [allItems]);
  const hasStandaloneProducts = useMemo(
    () => allItems.some((i) => i.kind === "product" && !(i.data as FlashProduct).hasPromo),
    [allItems],
  );
  // When there are neither packs nor promotions, skip step 1 entirely
  const skipContentTypeStep = !hasPacks && !hasPromotions;

  // Visible content-type options in the filter panel (step 1)
  const visibleContentOptions = useMemo(() => {
    if (skipContentTypeStep) return [];
    return CONTENT_OPTIONS.filter((opt) => {
      if (opt.type === "PROMOTIONS") return hasPromotions;
      if (opt.type === "PACKS") return hasPacks;
      if (opt.type === "PRODUCTS") return hasStandaloneProducts;
      return true; // "ALL" always shown when step 1 is not skipped
    });
  }, [skipContentTypeStep, hasPromotions, hasPacks, hasStandaloneProducts]);

  // ── Apply content type filter ────────────────────────────────────────────────
  const contentFiltered = useMemo((): FlashItem[] => {
    switch (activeContent) {
      case "PRODUCTS":
        return allItems.filter((i) => i.kind === "product");
      case "PROMOTIONS":
        return allItems.filter(
          (i) => i.kind === "product" && !!(i.data as FlashProduct).hasPromo,
        );
      case "PACKS":
        return allItems.filter((i) => i.kind === "pack");
      case "ALL":
      default:
        return allItems;
    }
  }, [allItems, activeContent]);

  // ── Derive categories available for content-filtered list ────────────────────
  const availableCategories = useMemo(() => {
    const map = new Map<number, string>();
    contentFiltered.forEach((item) => {
      const ids = getItemCategoryIds(item);
      const name = getItemCategoryName(item);
      if (name) ids.forEach((id) => map.set(id, name));
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [contentFiltered]);

  // ── Apply category filter ────────────────────────────────────────────────────
  const filteredItems = useMemo((): FlashItem[] => {
    if (activeCats.length === 0) return contentFiltered;
    return contentFiltered.filter((item) => {
      const catIds = getItemCategoryIds(item);
      return catIds.some((id) => activeCats.includes(id));
    });
  }, [contentFiltered, activeCats]);

  // ── Reset navigation when filtered list changes ──────────────────────────────
  useEffect(() => {
    setItemIdx(0);
    setImgIdx(0);
    setHeartAnim(false);
  }, [filteredItems]);

  // ── Current item ─────────────────────────────────────────────────────────────
  const current = filteredItems[itemIdx] ?? null;
  const currentImages = current ? getItemImages(current) : [];
  const currentImg = currentImages[imgIdx] ?? null;
  const currentIsPack = current?.kind === "pack";
  const hasPromo =
    current?.kind === "product" && !!(current.data as FlashProduct).hasPromo;

  // ── Favorites ────────────────────────────────────────────────────────────────
  const faved = useFavorites((s) => {
    if (!current || current.kind !== "product") return false;
    return !!s.shop[(current.data as FlashProduct).id];
  });
  const favedPack = useFavorites((s) => {
    if (!current || current.kind !== "pack") return false;
    return !!s.pack[current.data.id];
  });
  const favedCurrent = current?.kind === "product" ? faved : favedPack;
  const toggleShop = useFavorites((s) => s.toggleShop);
  const togglePack = useFavorites((s) => s.togglePack);

  const triggerFavorite = useCallback(() => {
    if (!current) return;
    if (current.kind === "product") {
      const p = current.data as FlashProduct;
      toggleShop({
        id: p.id,
        name: p.name,
        supplier: p.categoryLabel?.name ?? (p as any).category ?? "",
        price: p.bestPrice ?? 0,
        image: p.imageUrl ?? "",
      });
    } else if (current.kind === "pack") {
      togglePack(current.data.id);
    }
    setHeartAnim(true);
    setTimeout(() => setHeartAnim(false), 800);
  }, [current, toggleShop, togglePack]);

  // ── Navigation ────────────────────────────────────────────────────────────────
  const goNextItem = useCallback(() => {
    setItemIdx((i) => (i + 1) % Math.max(filteredItems.length, 1));
    setImgIdx(0);
    setHeartAnim(false);
  }, [filteredItems.length]);

  const goPrevItem = useCallback(() => {
    setItemIdx((i) =>
      i === 0 ? Math.max(filteredItems.length - 1, 0) : i - 1,
    );
    setImgIdx(0);
    setHeartAnim(false);
  }, [filteredItems.length]);

  // ── Image area click: double-tap = favorite (single-tap no longer navigates) ──
  const handleImageClick = useCallback(() => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;
    if (delta < 350) {
      // Double-tap → favorite
      triggerFavorite();
    }
    // Single tap intentionally does nothing — use Next/Prev buttons to navigate
  }, [triggerFavorite]);

  // ── Quick-view detail openers ─────────────────────────────────────────────────
  const openQuickView = useQuickView((s) => s.open);
  const openPackQuickView = usePackQuickView((s) => s.open);
  const handleOpenDetails = useCallback(() => {
    if (!current) return;
    if (current.kind === "product") {
      openQuickView((current.data as FlashProduct).id, supplierId);
    } else if (current.kind === "pack") {
      openPackQuickView(current.data.id);
    }
  }, [current, openQuickView, openPackQuickView, supplierId]);

  // ── Filter panel helpers ──────────────────────────────────────────────────────
  const openFilter = useCallback(() => {
    setPendingContent(activeContent);
    setPendingCats(activeCats);
    // Skip content-type step when there are only plain products (no packs/promotions)
    setFilterStep(skipContentTypeStep ? 2 : 1);
    setFilterOpen(true);
  }, [activeContent, activeCats, skipContentTypeStep]);

  const selectPendingContent = (ct: ContentType) => {
    setPendingContent(ct);
    setPendingCats([]); // reset categories when content type changes
  };

  const togglePendingCat = (id: number) => {
    setPendingCats((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const applyFilters = useCallback(() => {
    setActiveContent(pendingContent);
    setActiveCats(pendingCats);
    setFilterOpen(false);
  }, [pendingContent, pendingCats]);

  // Categories available for step 2 based on pending content type
  const step2Categories = useMemo(() => {
    let base: FlashItem[];
    switch (pendingContent) {
      case "PRODUCTS":
        base = allItems.filter((i) => i.kind === "product");
        break;
      case "PROMOTIONS":
        base = allItems.filter(
          (i) => i.kind === "product" && !!(i.data as FlashProduct).hasPromo,
        );
        break;
      case "PACKS":
        base = allItems.filter((i) => i.kind === "pack");
        break;
      default:
        base = allItems;
    }
    const map = new Map<number, string>();
    base.forEach((item) => {
      const ids = getItemCategoryIds(item);
      const name = getItemCategoryName(item);
      if (name) ids.forEach((id) => map.set(id, name));
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allItems, pendingContent]);

  const hasActiveFilter =
    activeContent !== "ALL" || activeCats.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="
          p-0 border-0
          w-[92vw] max-w-lg
          h-[90vh]
          rounded-3xl
          bg-black
          overflow-hidden
        "
      >
        <div className="relative w-full h-full flex flex-col select-none overflow-hidden">

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 pt-4 pb-3 bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span className="text-white font-bold text-sm">{storeName}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-white/60 text-xs">
                {filteredItems.length > 0
                  ? `${itemIdx + 1} / ${filteredItems.length}`
                  : "0 / 0"}
              </span>
              <button
                className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center"
                onClick={onClose}
                data-testid="button-flash-close"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* ── Progress bar (item-level) ────────────────────────────────────── */}
          <div
            className="absolute top-0 left-0 right-0 z-30 flex gap-1 px-4"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 60px)" }}
          >
            {filteredItems.map((_, i) => (
              <div
                key={i}
                className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden"
              >
                <div
                  className={`h-full bg-white transition-all duration-300 ${
                    i <= itemIdx ? "w-full" : "w-0"
                  }`}
                />
              </div>
            ))}
          </div>

          {/* ── Image area ──────────────────────────────────────────────────── */}
          {filteredItems.length === 0 ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <Package className="w-16 h-16 text-gray-600" />
              <p className="text-white font-semibold">
                No items match this filter
              </p>
              <button
                onClick={openFilter}
                className="px-5 py-2.5 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-semibold"
              >
                Change filter
              </button>
            </div>
          ) : (
            <div
              className="relative flex-1 bg-gray-900 overflow-hidden cursor-pointer"
              onClick={handleImageClick}
              data-testid="flash-product-image-area"
            >
              {/* Product / Pack image */}
              {currentImg ? (
                <img
                  key={`${itemIdx}-${imgIdx}`}
                  src={currentImg}
                  alt={current!.kind === "product" ? current!.data.name : current!.data.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {currentIsPack ? (
                    <Layers className="w-20 h-20 text-gray-600" />
                  ) : (
                    <Package className="w-20 h-20 text-gray-600" />
                  )}
                </div>
              )}

              {/* Multi-image dots */}
              {currentImages.length > 1 && (
                <div className="absolute top-[4.5rem] left-1/2 -translate-x-1/2 flex gap-1 z-20 pointer-events-none">
                  {currentImages.map((_, i) => (
                    <div
                      key={i}
                      className={`rounded-full transition-all ${
                        i === imgIdx
                          ? "w-3 h-1.5 bg-white"
                          : "w-1.5 h-1.5 bg-white/40"
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Dark gradient overlay */}
              <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

              {/* Product / Pack info */}
              <div className="absolute inset-x-0 bottom-0 px-5 pb-6 pointer-events-none">
                {/* Badges row */}
                <div className="flex items-center gap-2 mb-1.5">
                  {currentIsPack && (
                    <span className="bg-amber-500/80 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      Pack
                    </span>
                  )}
                  {hasPromo && (
                    <span className="bg-rose-500/80 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      On Sale
                    </span>
                  )}
                </div>

                {/* Name */}
                <h2
                  className="text-white font-bold text-xl leading-tight mb-1 line-clamp-2"
                  data-testid="flash-product-name"
                >
                  {current!.kind === "product"
                    ? current!.data.name
                    : current!.data.name}
                </h2>

                {/* Taxonomy pills */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {getItemTaxonomyLabels(current!).map((label, index) => (
                    <span
                      key={`${label.name}-${index}`}
                      className={`${label.tone === "accent" ? "bg-amber-500/80" : "bg-white/20"} backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full`}
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Double-tap heart animation */}
              {heartAnim && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Heart className="w-24 h-24 fill-rose-500 text-rose-500 animate-ping opacity-80" />
                </div>
              )}
            </div>
          )}

          {/* ── Floating action buttons (right side) ────────────────────────── */}
          <div className="absolute right-4 bottom-24 flex flex-col gap-4 z-20">
            {/* Filter button */}
            <button
              className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${
                hasActiveFilter
                  ? "bg-amber-500"
                  : "bg-white/20 backdrop-blur-sm"
              }`}
              onClick={openFilter}
              data-testid="button-flash-filter"
              title="Filter Flash content"
            >
              <SlidersHorizontal className="w-5 h-5 text-white" />
            </button>

            {/* Details button — opens full Product or Pack detail modal */}
            {current && (
              <button
                className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg transition-all active:scale-90"
                onClick={handleOpenDetails}
                data-testid="button-flash-details"
                title="View full details"
              >
                <Info className="w-5 h-5 text-white" />
              </button>
            )}

            {/* Favorite button — products and packs */}
            {current && (
              <button
                className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${
                  favedCurrent ? "bg-rose-500" : "bg-white/20 backdrop-blur-sm"
                }`}
                onClick={triggerFavorite}
                data-testid="button-flash-favorite"
              >
                <Heart
                  className={`w-5 h-5 transition-colors ${
                    favedCurrent ? "fill-white text-white" : "text-white"
                  }`}
                />
              </button>
            )}
          </div>

          {/* ── Prev / Next navigation ────────────────────────────────────── */}
          <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-4 z-30 pointer-events-none">
            <button
              onClick={goPrevItem}
              className="pointer-events-auto w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center active:scale-95 transition"
              data-testid="button-flash-prev"
            >
              <ChevronRight className="w-6 h-6 text-white rotate-180" />
            </button>
            <button
              onClick={goNextItem}
              className="pointer-events-auto w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center active:scale-95 transition"
              data-testid="button-flash-next"
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* ── Filter panel backdrop — click outside to close ───────────── */}
          {filterOpen && (
            <div
              className="absolute inset-0 z-[55]"
              onClick={() => setFilterOpen(false)}
            />
          )}

          {/* ── Filter panel — slides from top ────────────────────────────── */}
          <div
            className={`absolute inset-x-0 top-0 z-[60] transition-transform duration-300 ease-in-out ${
              filterOpen ? "translate-y-0" : "-translate-y-full"
            }`}
          >
            <div className="bg-gray-900/95 backdrop-blur-xl rounded-b-3xl shadow-2xl">
              {/* Panel header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <div>
                  <h3 className="text-white font-bold text-base">
                    {filterStep === 1 ? "What to browse?" : "Select categories"}
                  </h3>
                  {filterStep === 2 && (
                    <p className="text-gray-400 text-xs mt-0.5">
                      Pick one or more — or leave All selected
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setFilterOpen(false)}
                  className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>

              {filterStep === 1 ? (
                /* ── Step 1: Content type (only visible options) ───────────── */
                <div className="px-5 pb-5">
                  <div className="grid grid-cols-2 gap-3">
                    {visibleContentOptions.map((opt) => {
                      const active = pendingContent === opt.type;
                      return (
                        <button
                          key={opt.type}
                          onClick={() => selectPendingContent(opt.type)}
                          className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                            active
                              ? "border-amber-400 bg-amber-400/10"
                              : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                          }`}
                        >
                          <div
                            className={
                              active ? "text-amber-400" : "text-gray-400"
                            }
                          >
                            {opt.icon}
                          </div>
                          <div className="text-center">
                            <p
                              className={`font-semibold text-sm ${
                                active ? "text-amber-400" : "text-gray-200"
                              }`}
                            >
                              {opt.label}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {opt.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setFilterStep(2)}
                    className="w-full mt-4 py-3 bg-amber-500 hover:bg-amber-400 text-white font-semibold rounded-2xl transition-colors active:scale-[.98]"
                  >
                    Next: Categories
                  </button>
                </div>
              ) : (
                /* ── Step 2: Category selection ────────────────────────────── */
                <div className="px-5 pb-5">
                  <div className="flex flex-wrap gap-2 mb-4 max-h-48 overflow-y-auto">
                    {/* ALL pill */}
                    <button
                      onClick={() => setPendingCats([])}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                        pendingCats.length === 0
                          ? "bg-amber-500 text-white"
                          : "bg-white/10 text-gray-300 hover:bg-white/15"
                      }`}
                    >
                      {pendingCats.length === 0 && (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      All
                    </button>

                    {step2Categories.map((cat) => {
                      const selected = pendingCats.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          onClick={() => togglePendingCat(cat.id)}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                            selected
                              ? "bg-amber-500 text-white"
                              : "bg-white/10 text-gray-300 hover:bg-white/15"
                          }`}
                        >
                          {selected && <Check className="w-3.5 h-3.5" />}
                          {cat.name}
                        </button>
                      );
                    })}

                    {step2Categories.length === 0 && (
                      <p className="text-gray-500 text-sm py-2">
                        No categories for this selection
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {/* Back button is hidden when step 1 is skipped */}
                    {!skipContentTypeStep && (
                      <button
                        onClick={() => setFilterStep(1)}
                        className="flex-1 py-3 bg-white/10 text-white font-semibold rounded-2xl transition-colors hover:bg-white/15"
                      >
                        Back
                      </button>
                    )}
                    <button
                      onClick={applyFilters}
                      className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-white font-semibold rounded-2xl transition-colors active:scale-[.98]"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
