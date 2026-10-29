import { useState, useMemo, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useThemeStore } from "@/store/theme-store";
import { useFavorites } from "@/hooks/use-favorites";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import {
  usePrintCompanyDetail, usePrintReviews, useCreatePrintReview, useReportPrinter,
} from "@/hooks/use-print-marketplace";
import { printCategoryIcon, printSubCategoryIcon } from "@/lib/print-category-icons";
import { PrintCompanyAvailabilityModal } from "@/components/print/print-company-detail-modal";
import { PrintServiceDetailModal } from "@/components/print/print-service-detail-modal";
import { ReviewModal } from "@/components/review-modal";
import { ModalGrabber } from "@/components/shared/modal-grabber";
import { useScrollDismiss } from "@/hooks/use-scroll-dismiss";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Printer, ChevronLeft, Heart, Star, MapPin, Package, Clock, Flag, X, Search, SlidersHorizontal,
} from "lucide-react";
import type { PrintCatalogCard, PrintOrderWithParties } from "@shared/schema";
import { PrintMappedServiceCard } from "@/components/print/print-mapped-service-card";
import { formatDistance } from "@/lib/distance";
import { usePrintStoreNav } from "@/hooks/use-print-store-nav";
import { useCircularItemNav } from "@/hooks/use-circular-item-nav";
import { ItemNavButtons } from "@/components/shared/item-nav-buttons";

// "Livraisons" — same fixed production-time buckets as /print's own main
// page (print-page.tsx), reproduced here rather than imported since they're
// not exported there (task: "Academy, Print & Marketing Filter Consistency").
// Not a real delivery-method/company field — there isn't one in the schema —
// just a client-side bucketing of each service's own productionTimeDays.
const PRODUCTION_TIME_BUCKETS = [
  { label: "≤ 3 jours", test: (d: number) => d <= 3 },
  { label: "4-7 jours", test: (d: number) => d >= 4 && d <= 7 },
  { label: "8+ jours", test: (d: number) => d >= 8 },
];
function bucketLabelFor(days: number): string {
  return PRODUCTION_TIME_BUCKETS.find((b) => b.test(days))?.label ?? "";
}

// Coffee Owner /print's dedicated Store page — the /print equivalent of
// /stores/:storeId (docs/print_store_details_page_audit.md). Same Store-page
// experience/visual language as the Supplier reference (cover + overlapping
// logo + name/meta, sticky category pills, service grid, Info/hours modal,
// favorite, back navigation), fed entirely by the existing, real
// GET /api/print/company/:userId (via usePrintCompanyDetail — the exact same
// data/cache PrintCompanyDetailModal already uses) — no second data source,
// no new backend. Clicking a service opens the existing PrintServiceDetailModal.

function useTheme(isDark: boolean) {
  return {
    dk: isDark,
    pageBg: isDark ? "bg-gray-900" : "bg-gray-50",
    cardBg: isDark ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    textSubtle: isDark ? "text-gray-500" : "text-gray-400",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    switcherBg: isDark ? "bg-gray-800" : "bg-gray-100",
    switcherActive: isDark ? "bg-gray-700 text-white shadow-sm" : "bg-white text-blue-600 shadow-sm",
    switcherInactive: isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700",
    stripBg: isDark ? "bg-gray-900/95 border-gray-800" : "bg-white border-gray-100",
    skeletonBg: isDark ? "bg-gray-800" : "bg-gray-100",
    emptyIcon: isDark ? "text-gray-700" : "text-gray-200",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
    selectTrigger: isDark ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700" : "border-gray-200 bg-gray-50",
  };
}


export default function PrintStoreDetailPage() {
  const [, params] = useRoute("/print/stores/:printerId");
  const [, navigate] = useLocation();
  const printerId = params?.printerId ? Number(params.printerId) : null;
  const { user } = useAuth();
  const { toast } = useToast();

  // Previous/Next Store navigation — browses /print's own currently
  // filtered Imprimeries list (navIds), kept live-synced by print-page.tsx
  // (task: "Extend Store Navigation to Marketing, Academy, and Print").
  // Null when this page was opened directly, not from /print — both
  // buttons simply stay hidden rather than guessing, same convention as
  // the Coffee Owner Store Page's own Previous/Next Store buttons.
  const printStoreNavIds = usePrintStoreNav((s) => s.navIds);
  const { prevId: prevPrinterId, nextId: nextPrinterId, hasNav: hasPrinterNav } = useCircularItemNav(
    printerId,
    printStoreNavIds ?? [],
  );

  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);

  const { data, isLoading } = usePrintCompanyDetail(printerId);
  const card = data?.card;

  const faved = useFavorites((s) => (card ? !!s.printCompanies[card.userId] : false));
  const togglePrintCompany = useFavorites((s) => s.togglePrintCompany);
  const favedProducts = useFavorites((s) => s.printProducts);
  const togglePrintProduct = useFavorites((s) => s.togglePrintProduct);

  const [categoryId, setCategoryId] = useState("");
  // Search + subcategory + sort (task: "Complete Store Page Filters") — print
  // services have no brand/flavor/size columns (only category/subCategory/
  // priceInCents exist, see schema.ts's printCatalogItems), so only the
  // facets genuinely backed by real data are added here.
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [subCategoryId, setSubCategoryId] = useState("");
  // Sociétés/Matières/Livraisons (task: "Academy, Print & Marketing Filter
  // Consistency") — same facets as /print's own main page, added here for
  // full parity even though "Sociétés" only ever resolves to this one
  // printer at store-page scope (real data, just low-cardinality here).
  const [brandId, setBrandId] = useState("");
  const [material, setMaterial] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [previewServiceId, setPreviewServiceId] = useState<number | null>(null);

  // Avis + Signaler — same real data/hooks already used by PrintCompanyDetailModal's
  // own identical icon row (docs/academy_print_marketing_store_synchronization_audit.md
  // Section 6-9), just added here next to Disponibilité.
  const { data: reviews = [] } = usePrintReviews(printerId);
  const { data: myOrders = [] } = useQuery<PrintOrderWithParties[]>({
    queryKey: ["/api/print/orders"],
    enabled: user?.role === "CAFE_OWNER",
  });
  const createReview = useCreatePrintReview();
  const reportPrinter = useReportPrinter();
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [reviewOrderId, setReviewOrderId] = useState<number | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");

  // Swipe-to-dismiss on the Signaler dialog's own grabber (task: "Standardize
  // Grabber Design and Swipe-to-Dismiss Across Store Information and Service
  // Modals") — same shared hook/parameters as the established reference.
  const {
    onBodyWheel: reportOnBodyWheel, onBodyTouchStart: reportOnBodyTouchStart,
    onBodyTouchMove: reportOnBodyTouchMove, onBodyTouchEnd: reportOnBodyTouchEnd,
    dismissContentStyle: reportDismissContentStyle, dismissOverlayStyle: reportDismissOverlayStyle,
  } = useScrollDismiss(reportModalOpen, () => { setReportModalOpen(false); setReportReason(""); }, undefined, true);

  const eligibleOrders = useMemo(
    () => myOrders.filter((o) => card && o.printerId === card.userId && o.status === "DELIVERED"),
    [myOrders, card]
  );
  const myReviewByOrder = useMemo(() => {
    const map = new Map<number, (typeof reviews)[number]>();
    for (const r of reviews) if (r.cafeId === user?.id && r.printOrderId != null) map.set(r.printOrderId, r);
    return map;
  }, [reviews, user?.id]);
  const activeOrderId = reviewOrderId ?? eligibleOrders.find((o) => !myReviewByOrder.has(o.id))?.id ?? eligibleOrders[0]?.id ?? null;
  const existingReview = activeOrderId ? myReviewByOrder.get(activeOrderId) : undefined;

  const submitReview = async (rating: number, comment: string) => {
    if (!card || !activeOrderId) throw new Error("Aucune commande livrée à évaluer");
    await createReview.mutateAsync({ printerId: card.userId, printOrderId: activeOrderId, rating, comment: comment.trim() || undefined });
  };

  const submitReport = () => {
    if (!card || !reportReason.trim()) return;
    reportPrinter.mutate(
      { printerId: card.userId, reason: reportReason.trim() },
      {
        onSuccess: () => { toast({ title: "Signalement envoyé", description: "L'équipe Admin va l'examiner." }); setReportModalOpen(false); setReportReason(""); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  const { data: taxonomy } = useQuery<{ categories: { name: string; icon: string | null }[]; subcategories: { name: string; icon: string | null }[] }>({
    queryKey: ["/api/print/taxonomy"],
  });
  const categoryIconByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of taxonomy?.categories ?? []) if (row.icon) map.set(row.name, row.icon);
    return map;
  }, [taxonomy?.categories]);
  // Same source/shape as /print's own subcategoryIconByName (print-page.tsx)
  // — admin-configured icons, matched by name, falling back to
  // printSubCategoryIcon's static map when no DB icon is configured.
  const subcategoryIconByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of taxonomy?.subcategories ?? []) if (row.icon && !map.has(row.name)) map.set(row.name, row.icon);
    return map;
  }, [taxonomy?.subcategories]);

  useEffect(() => { window.scrollTo(0, 0); }, [printerId]);

  const services = card?.services ?? [];
  const categories = useMemo(() => Array.from(new Set(services.map((s) => s.category).filter(Boolean))), [services]);
  const categoryFiltered = useMemo(() => (categoryId ? services.filter((s) => s.category === categoryId) : services), [services, categoryId]);
  const subCategories = useMemo(() => Array.from(new Set(categoryFiltered.map((s) => s.subCategory).filter(Boolean))), [categoryFiltered]);
  // Sociétés — single-valued at store-page scope (every service here already
  // belongs to this one printer), but still real data, not fabricated.
  const printers = useMemo(() => (card ? [{ id: String(card.userId), name: card.name }] : []), [card]);
  const materials = useMemo(() => {
    const set = new Set<string>();
    categoryFiltered.forEach((s) => (s.materials ?? []).forEach((m) => { if (m) set.add(m); }));
    return Array.from(set);
  }, [categoryFiltered]);
  const deliveryBuckets = useMemo(() => {
    const present = new Set(categoryFiltered.map((s) => bucketLabelFor(s.productionTimeDays)));
    return PRODUCTION_TIME_BUCKETS.map((b) => b.label).filter((label) => present.has(label));
  }, [categoryFiltered]);
  const filtered = useMemo(() => {
    let list = categoryFiltered;
    if (subCategoryId) list = list.filter((s) => s.subCategory === subCategoryId);
    if (brandId) list = list.filter(() => brandId === String(card?.userId));
    if (material) list = list.filter((s) => (s.materials ?? []).includes(material));
    if (deliveryTime) list = list.filter((s) => bucketLabelFor(s.productionTimeDays) === deliveryTime);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q));
    }
    if (sortBy === "price_asc") list = [...list].sort((a, b) => a.priceInCents - b.priceInCents);
    if (sortBy === "price_desc") list = [...list].sort((a, b) => b.priceInCents - a.priceInCents);
    return list;
  }, [categoryFiltered, subCategoryId, brandId, material, deliveryTime, search, sortBy, card?.userId]);
  const hasActiveFilters = !!categoryId || !!subCategoryId || !!brandId || !!material || !!deliveryTime || !!search.trim() || !!sortBy;

  // Previous/Next Service navigation (task: "Extend Detail Modal
  // Navigation to Marketing, Academy, and Print") — browses `filtered`,
  // this store's own currently-filtered mapped services, so navigation
  // never crosses into another printer's services and always respects
  // the active filters/search/sort, exactly like the main /print listing
  // page's own navigation.
  const storeServiceNavIds = useMemo(() => filtered.map((s) => s.id), [filtered]);
  const { prevId: prevStoreServiceId, nextId: nextStoreServiceId, hasNav: hasStoreServiceNav } = useCircularItemNav(previewServiceId, storeServiceNavIds);
  const resetFilters = () => { setCategoryId(""); setSubCategoryId(""); setBrandId(""); setMaterial(""); setDeliveryTime(""); setSearch(""); setSortBy(""); };

  // A Coffee Owner must not be able to reach a Store that the marketplace
  // itself wouldn't show — same visibility intent as getStoreDetail's
  // requireVisible gate for Supplier Stores (docs/print_store_details_page_audit.md).
  const isVisible = !!card && card.marketplaceVisible;

  if (isLoading) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
        <div className={`h-64 w-full animate-pulse ${t.skeletonBg}`} />
        <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className={`h-56 rounded-2xl animate-pulse ${t.skeletonBg}`} />)}
        </div>
      </div>
    );
  }

  if (!card || !isVisible) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${t.pageBg} flex flex-col items-center justify-center py-24 gap-4 text-center`}>
        <Printer className={`w-14 h-14 ${t.emptyIcon}`} />
        <div>
          <p className={`font-semibold ${t.textPrimary}`}>Imprimerie introuvable</p>
          <p className={`text-sm mt-1 ${t.textMuted}`}>Cette imprimerie n'est plus disponible.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("/print")}>Retour à la marketplace</Button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
      <div className="relative h-64 sm:h-72 lg:h-80 overflow-hidden bg-gray-900">
        {card.coverImageUrl ? (
          <img src={card.coverImageUrl} alt={card.name} className="w-full h-full object-cover object-center" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Printer className="w-14 h-14 text-gray-500" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

        <button
          className="absolute top-4 left-4 w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform z-10"
          onClick={() => navigate("/print")}
          data-testid="button-back-print-marketplace"
        >
          <ChevronLeft className="w-4.5 h-4.5 text-white" />
        </button>

        {/* Task: "Hero Theme Toggle Cleanup" — the redundant Dark/Light toggle that
            used to be here was removed; the navbar's own toggle, calling the same
            useThemeStore, remains the single theme control for this page. */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => togglePrintCompany({
              id: card.userId, name: card.name, initials: card.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
              type: "Imprimerie", rating: card.rating / 10, portfolioImages: card.portfolioImages, location: card.location,
              available: !card.isOnVacation, profileImageUrl: card.profileImageUrl,
            })}
            data-testid="button-fav-print-store"
          >
            <Heart className={`w-4 h-4 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-white/80"}`} />
          </button>
        </div>

        <div className="absolute bottom-4 right-4 flex items-center gap-2 z-10">
          {card.reviewCount > 0 && (
            <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1 shadow-sm">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="text-xs font-bold text-white">{(card.rating / 10).toFixed(1)}</span>
              <span className="text-[10px] text-white/70">({card.reviewCount})</span>
            </div>
          )}
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => setReportModalOpen(true)}
            data-testid="button-print-store-report"
            title="Signaler"
          >
            <Flag className="w-4 h-4 text-white/80" />
          </button>
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => setInfoOpen(true)}
            data-testid="button-print-store-availability"
            title="Disponibilité"
          >
            <Clock className="w-4 h-4 text-white/80" />
          </button>
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => setReviewsModalOpen(true)}
            data-testid="button-print-store-reviews"
            title="Avis"
          >
            <Star className="w-4 h-4 text-white/80" />
          </button>
          
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          {card.isOnVacation && <Badge className="bg-gray-900/80 text-white border-0 text-xs font-semibold shadow-sm">Indisponible</Badge>}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 relative z-20">
        <div className="flex items-end gap-4 -mt-8">
          <div className={`w-16 h-16 rounded-2xl border-4 shadow-lg overflow-hidden shrink-0 flex items-center justify-center transition-colors ${isDark ? "border-gray-900 bg-gray-800" : "border-gray-50 bg-white"}`}>
            {card.profileImageUrl ? (
              <img src={card.profileImageUrl} alt={card.name} className="w-full h-full object-cover" />
            ) : (
              <Printer className={`w-7 h-7 ${t.textMuted}`} />
            )}
          </div>
          <div className="relative top-4 min-w-0 flex-1 mt-2">
            <div className="flex items-start justify-between gap-x-3 gap-y-1 mt-4">
              <h1 className={`font-extrabold text-xl leading-tight break-words min-w-0 ${t.textPrimary}`} data-testid="text-print-store-name">{card.name}</h1>
              {hasPrinterNav && (
                <ItemNavButtons
                  isDark={isDark}
                  canPrev={prevPrinterId != null}
                  canNext={nextPrinterId != null}
                  onPrev={() => prevPrinterId != null && navigate(`/print/stores/${prevPrinterId}`)}
                  onNext={() => nextPrinterId != null && navigate(`/print/stores/${nextPrinterId}`)}
                  prevLabel="Imprimerie précédente"
                  nextLabel="Imprimerie suivante"
                  prevTestId="button-print-store-nav-prev"
                  nextTestId="button-print-store-nav-next"
                />
              )}
            </div>
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1 ${isDark ? "text-amber-400" : "text-amber-600"}`}>
              <span className="flex items-center gap-1"><Package className="w-3 h-3" />{services.length} service{services.length !== 1 ? "s" : ""}</span>
              {card.distanceKm != null ? (
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{formatDistance(card.distanceKm)}</span>
              ) : card.location ? (
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{card.location}</span>
              ) : null}
            </div>
          </div>
        </div>
        {card.description && <p className={`text-sm mt-6 ml-20 line-clamp-1 break-words ${t.textMuted}`}>{card.description}</p>}
      </div>

      {/* Sticky strip rendered whenever there's at least one service to search/
          sort, even if this printer happens to have no category taxonomy at
          all — same widened gating as store-detail-page.tsx's own search row
          (task: "Add Product and Pack Search to Individual Store Pages"). */}
      {(categories.length > 0 || services.length > 0) && (
        <div className={`sticky top-14 z-30 border-b mt-4 transition-colors ${t.stripBg}`}>
          <div className="max-w-7xl mx-auto px-4">
            {categories.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto py-3" style={{ scrollbarWidth: "none" }}>
              <div className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                <button
                  onClick={() => { setCategoryId(""); setSubCategoryId(""); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0 transition-all text-[11px] font-semibold ${categoryId === "" ? t.switcherActive : t.switcherInactive}`}
                  data-testid="button-print-store-cat-all"
                >
                  <span className="text-base leading-none"><Printer className="w-4 h-4" /></span>
                  <span>Tout</span>
                </button>
              </div>
              {categories.map((cat) => (
                <div key={cat} className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                  <button
                    onClick={() => { setCategoryId(categoryId === cat ? "" : cat); setSubCategoryId(""); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-[11px] font-semibold ${categoryId === cat ? t.switcherActive : t.switcherInactive}`}
                    data-testid={`button-print-store-cat-${cat}`}
                  >
                    <span className="text-base leading-none">{printCategoryIcon(cat, categoryIconByName.get(cat))}</span>
                    <span className="whitespace-nowrap">{cat}</span>
                  </button>
                </div>
              ))}
            </div>
            )}

            {/* Search + Sous-catégories + Sociétés + Matières + Livraisons +
                Recommandé (task: "Academy, Print & Marketing Filter
                Consistency") — same filter set/order/labels/icons as
                /print's own main page, for full parity. */}
            {/* Task: "Standardize Store Page Filter Scrolling Behavior" — same
                responsive scroll/wrap pattern as /products' own FilterBar:
                horizontal scroll with a hidden scrollbar on mobile
                (flex-nowrap overflow-x-auto), wraps to multiple lines with no
                scroll on sm:+ (sm:flex-wrap sm:overflow-x-visible). */}
            <div
              className="flex items-center gap-2 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-x-visible [&::-webkit-scrollbar]:hidden py-2"
              style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
            >
              <SlidersHorizontal className={`w-3.5 h-3.5 shrink-0 ${t.textMuted}`} />
              <div className="relative shrink-0 sm:flex-1 sm:min-w-[180px] sm:max-w-xs">
                {!searchOpen && (
                  <button
                    type="button"
                    className={`sm:hidden h-7 w-7 rounded-full border flex items-center justify-center shrink-0 ${t.inputBg}`}
                    onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 0); }}
                    aria-label="Rechercher"
                    data-testid="button-open-print-store-search"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className={`${searchOpen ? "flex" : "hidden"} sm:flex items-center relative w-44 sm:w-full`}>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    ref={searchInputRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={() => { if (!search) setSearchOpen(false); }}
                    placeholder="Rechercher un service..."
                    className={`h-7 text-xs pl-8 rounded-full ${t.inputBg}`}
                    data-testid="input-print-store-search"
                  />
                </div>
              </div>
              {subCategories.length > 0 && (
                <Select value={subCategoryId || "__all__"} onValueChange={(v) => setSubCategoryId(v === "__all__" ? "" : v)}>
                  <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[130px] shrink-0 ${t.selectTrigger}`}>
                    <SelectValue placeholder="Sous-catégorie" />
                  </SelectTrigger>
                  <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
                    <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Sous-catégories</SelectItem>
                    {subCategories.map((sc) => {
                      const icon = printSubCategoryIcon(sc, subcategoryIconByName.get(sc));
                      return <SelectItem key={sc} value={sc} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{icon ? `${icon} ${sc}` : sc}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              )}
              {printers.length > 0 && (
                <Select value={brandId || "__all__"} onValueChange={(v) => setBrandId(v === "__all__" ? "" : v)}>
                  <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.selectTrigger}`}>
                    <SelectValue placeholder="Société d'impression" />
                  </SelectTrigger>
                  <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
                    <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Sociétés</SelectItem>
                    {printers.map((p) => <SelectItem key={p.id} value={p.id} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {materials.length > 0 && (
                <Select value={material || "__all__"} onValueChange={(v) => setMaterial(v === "__all__" ? "" : v)}>
                  <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[110px] shrink-0 ${t.selectTrigger}`}>
                    <SelectValue placeholder="Matière" />
                  </SelectTrigger>
                  <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
                    <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Matières</SelectItem>
                    {materials.map((m) => <SelectItem key={m} value={m} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {deliveryBuckets.length > 0 && (
                <Select value={deliveryTime || "__all__"} onValueChange={(v) => setDeliveryTime(v === "__all__" ? "" : v)}>
                  <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[110px] shrink-0 ${t.selectTrigger}`}>
                    <SelectValue placeholder="Livraison" />
                  </SelectTrigger>
                  <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
                    <SelectItem value="__all__" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Livraisons</SelectItem>
                    {deliveryBuckets.map((d) => <SelectItem key={d} value={d} className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Select value={sortBy || "recommended"} onValueChange={(v) => setSortBy(v === "recommended" ? "" : v)}>
                <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] shrink-0 ${t.selectTrigger}`}>
                  <SelectValue placeholder="Trier par" />
                </SelectTrigger>
                <SelectContent className={t.dk ? "bg-gray-800 border-gray-700/60 shadow-2xl" : ""}>
                  <SelectItem value="recommended" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Recommandé</SelectItem>
                  <SelectItem value="price_asc" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Prix croissant</SelectItem>
                  <SelectItem value="price_desc" className={t.dk ? "text-gray-200 focus:bg-gray-700 focus:text-white" : ""}>Prix décroissant</SelectItem>
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className={`flex items-center gap-1 text-xs transition-colors ml-1 ${t.dk ? "text-red-400 hover:text-red-300" : "text-destructive hover:text-destructive/80"}`}
                  data-testid="button-reset-print-store-filters"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-4">
          <h2 className={`font-bold text-lg ${t.textPrimary}`}>Services d'impression</h2>
          <p className={`text-sm mt-0.5 ${t.textMuted}`}>{filtered.length} service{filtered.length !== 1 ? "s" : ""} disponible{filtered.length !== 1 ? "s" : ""}</p>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <Package className={`w-14 h-14 ${t.emptyIcon}`} />
            <div>
              <p className={`font-semibold ${t.textPrimary}`}>Aucun service trouvé</p>
              <p className={`text-sm mt-1 ${t.textMuted}`}>{hasActiveFilters ? "Essayez d'ajuster vos filtres." : "Cette imprimerie n'a pas encore de service actif."}</p>
            </div>
            {hasActiveFilters && <Button size="sm" variant="outline" onClick={resetFilters}>Effacer tous les filtres</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((service) => (
              <PrintMappedServiceCard
                key={service.id}
                id={service.id}
                name={service.name}
                category={service.category}
                description={service.description}
                imageUrl={service.imageUrl}
                priceInCents={service.priceInCents}
                unit={service.unit}
                minQuantity={service.minQuantity}
                productionTimeDays={service.productionTimeDays}
                printerName={card.name}
                printerImageUrl={card.profileImageUrl}
                printerIsAvailable={service.printerIsAvailable}
                rating={service.rating}
                reviewCount={service.reviewCount}
                categoryIcon={printCategoryIcon(service.category, categoryIconByName.get(service.category))}
                isFavorited={!!favedProducts[String(service.id)]}
                onToggleFavorite={() => togglePrintProduct({
                  id: String(service.id), name: service.name, brand: card.name, price: service.priceInCents, priceUnit: service.unit,
                  image: service.imageUrl ?? "", location: card.location, distanceKm: card.distanceKm,
                  rating: service.rating / 10, reviewCount: service.reviewCount, category: service.category,
                })}
                onClick={() => setPreviewServiceId(service.id)}
                isDark={isDark}
              />
            ))}
          </div>
        )}
      </div>

      <PrintCompanyAvailabilityModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        companyName={card.name}
        weeklyHours={card.weeklyHours}
        isDark={isDark}
      />

      <ReviewModal
        open={reviewsModalOpen}
        onClose={() => setReviewsModalOpen(false)}
        targetName={card.name}
        reviewTypeLabel="Avis sur l'imprimerie"
        existingReviews={reviews.map((r) => ({ ...r, createdAt: r.createdAt ? String(r.createdAt) : undefined }))}
        myReview={existingReview ? { rating: existingReview.rating, comment: existingReview.comment } : null}
        defaultRating={5}
        canReview={eligibleOrders.length > 0}
        onSubmit={submitReview}
        isSubmitting={createReview.isPending}
        extraFormContent={eligibleOrders.length > 1 ? (
          <select
            className={`w-full text-xs rounded-lg border px-2 py-1.5 ${isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-200"}`}
            value={activeOrderId ?? ""}
            onChange={(e) => setReviewOrderId(Number(e.target.value))}
            data-testid="select-store-review-order"
          >
            {eligibleOrders.map((o) => (
              <option key={o.id} value={o.id}>Commande #{o.id} {myReviewByOrder.has(o.id) ? "(déjà notée)" : ""}</option>
            ))}
          </select>
        ) : undefined}
      />

      {/* Signaler — same modal chrome as the Disponibilité modal above
          (rounded-[2rem] container, circular close button), close button on
          the right, standardized across the app this session. */}
      <Dialog open={reportModalOpen} onOpenChange={(v) => { if (!v) { setReportModalOpen(false); setReportReason(""); } }}>
        <DialogContent
          className={`sm:max-w-md p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden ${isDark ? "bg-gray-900" : "bg-white"}`}
          style={reportDismissContentStyle}
          overlayStyle={reportDismissOverlayStyle}
        >
          <VisuallyHidden><DialogTitle>Signaler {card.name}</DialogTitle></VisuallyHidden>
          <div
            className="px-5 pt-1 pb-5 space-y-3"
            onWheel={reportOnBodyWheel}
            onTouchStart={reportOnBodyTouchStart}
            onTouchMove={reportOnBodyTouchMove}
            onTouchEnd={reportOnBodyTouchEnd}
          >
            <ModalGrabber isDark={isDark} />
            <div className="flex items-center justify-between">
              <div className="w-8 h-8" />
              <span className={`text-[13px] font-semibold tracking-tight leading-tight ${isDark ? "text-red-400" : "text-red-700"}`}>Signaler {card.name}</span>
              <button onClick={() => { setReportModalOpen(false); setReportReason(""); }} aria-label="Close" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800"}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <Textarea
              placeholder="Décrivez le problème…"
              rows={3}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className={isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200"}
              data-testid="input-store-report-reason"
            />
            <div className="flex gap-2 justify-end pt-1">
              <Button size="sm" variant="outline" className={t.textPrimary} onClick={() => { setReportModalOpen(false); setReportReason(""); }}>Annuler</Button>
              <Button size="sm" variant="destructive" onClick={submitReport} disabled={!reportReason.trim() || reportPrinter.isPending} data-testid="button-submit-store-report">
                {reportPrinter.isPending ? "Envoi…" : "Envoyer le signalement"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PrintServiceDetailModal
        serviceId={previewServiceId}
        open={previewServiceId != null}
        onClose={() => setPreviewServiceId(null)}
        hasItemNav={hasStoreServiceNav}
        canNavPrev={prevStoreServiceId != null}
        canNavNext={nextStoreServiceId != null}
        onNavPrev={() => prevStoreServiceId != null && setPreviewServiceId(prevStoreServiceId)}
        onNavNext={() => nextStoreServiceId != null && setPreviewServiceId(nextStoreServiceId)}
      />
    </div>
  );
}
