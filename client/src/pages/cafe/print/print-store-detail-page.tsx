import { useState, useMemo, useEffect } from "react";
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
import { printCategoryIcon } from "@/lib/print-category-icons";
import { PrintCompanyAvailabilityModal } from "@/components/print/print-company-detail-modal";
import { PrintServiceDetailModal } from "@/components/print/print-service-detail-modal";
import { ReviewsModal } from "@/components/account/reviews-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Printer, ChevronLeft, Heart, Sun, Moon, Star, MapPin, Package, Clock, Flag, X,
} from "lucide-react";
import type { PrintCatalogCard, PrintOrderWithParties } from "@shared/schema";

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} data-testid={`button-store-star-${n}`}>
          <Star className={`w-5 h-5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
        </button>
      ))}
    </div>
  );
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
  };
}

function StoreServiceCard({ card, onClick, isDark }: { card: PrintCatalogCard; onClick: () => void; isDark: boolean }) {
  const t = useTheme(isDark);
  const fmt = useFormatCurrency();
  const faved = useFavorites((s) => !!s.printProducts[String(card.id)]);
  const togglePrint = useFavorites((s) => s.togglePrintProduct);
  const starRating = card.rating / 10;

  return (
    <div
      data-testid={`card-store-print-${card.id}`}
      className={`group cursor-pointer rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col ${t.cardBg}`}
      onClick={onClick}
    >
      <div className={`relative aspect-[4/3] overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
        {card.imageUrl ? (
          <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Package className={`w-10 h-10 ${t.textSubtle}`} /></div>
        )}
        {card.category && (
          <div className="absolute top-2 left-2">
            <Badge className={`${isDark ? "bg-gray-800/90 text-gray-200" : "bg-white/90 text-gray-700"} backdrop-blur-sm text-[10px] font-semibold shadow-sm border-0 px-2`}>
              {printCategoryIcon(card.category)} {card.category}
            </Badge>
          </div>
        )}
        <button
          className={`absolute top-2 right-2 w-7 h-7 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform ${isDark ? "bg-gray-700/90" : "bg-white/90"}`}
          onClick={(e) => {
            e.stopPropagation();
            togglePrint({
              id: String(card.id), name: card.name, brand: card.printerName, price: card.priceInCents, priceUnit: card.unit,
              image: card.imageUrl ?? "", location: card.printerLocation, distanceKm: card.distanceKm,
              rating: card.rating / 10, reviewCount: card.reviewCount, category: card.category,
            });
          }}
          data-testid={`button-fav-store-print-${card.id}`}
        >
          <Heart className={`w-3.5 h-3.5 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
        </button>
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2">
        <h3 className={`font-bold text-sm leading-tight line-clamp-2 group-hover:text-blue-600 transition-colors ${t.textPrimary}`}>{card.name}</h3>
        <div className="flex items-center gap-1.5">
          {card.reviewCount > 0 ? (
            <>
              <span className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => <span key={s} className={`text-[11px] ${s <= Math.round(starRating) ? "text-amber-400" : "text-gray-200"}`}>★</span>)}
              </span>
              <span className={`text-[11px] ${t.textSubtle}`}>({card.reviewCount})</span>
            </>
          ) : (
            <span className={`text-[11px] ${t.textSubtle}`}>Aucun avis</span>
          )}
        </div>
        <div className={`mt-auto pt-2 border-t ${t.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-[10px] ${t.textSubtle}`}>À partir de</p>
              <p className="font-bold text-sm text-blue-600">{fmt(card.priceInCents)}<span className={`text-[10px] font-normal ${t.textSubtle}`}>/{card.unit}</span></p>
            </div>
            <div className={`flex items-center gap-1 text-[11px] ${t.textSubtle}`}>
              <Clock className="w-3 h-3" />
              <span>{card.productionTimeDays}j</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrintStoreDetailPage() {
  const [, params] = useRoute("/print/stores/:printerId");
  const [, navigate] = useLocation();
  const printerId = params?.printerId ? Number(params.printerId) : null;
  const { user } = useAuth();
  const { toast } = useToast();

  const isDark = useThemeStore((s) => s.isDark);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const t = useTheme(isDark);

  const { data, isLoading } = usePrintCompanyDetail(printerId);
  const card = data?.card;

  const faved = useFavorites((s) => (card ? !!s.printCompanies[card.userId] : false));
  const togglePrintCompany = useFavorites((s) => s.togglePrintCompany);

  const [categoryId, setCategoryId] = useState("");
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
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");

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

  const submitReview = () => {
    if (!card || !activeOrderId) return;
    createReview.mutate(
      { printerId: card.userId, printOrderId: activeOrderId, rating: reviewRating, comment: reviewComment.trim() || undefined },
      {
        onSuccess: () => { toast({ title: "Avis envoyé" }); setReviewComment(""); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
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

  const { data: taxonomy } = useQuery<{ categories: { name: string; icon: string | null }[] }>({
    queryKey: ["/api/print/taxonomy"],
  });
  const categoryIconByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of taxonomy?.categories ?? []) if (row.icon) map.set(row.name, row.icon);
    return map;
  }, [taxonomy?.categories]);

  useEffect(() => { window.scrollTo(0, 0); }, [printerId]);

  const services = card?.services ?? [];
  const categories = useMemo(() => Array.from(new Set(services.map((s) => s.category).filter(Boolean))), [services]);
  const filtered = useMemo(() => (categoryId ? services.filter((s) => s.category === categoryId) : services), [services, categoryId]);

  // A Coffee Owner must not be able to reach a Store that the marketplace
  // itself wouldn't show — same visibility intent as getStoreDetail's
  // requireVisible gate for Supplier Stores (docs/print_store_details_page_audit.md).
  const isVisible = !!card && card.marketplaceVisible;

  if (isLoading) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
        <div className={`h-64 w-full animate-pulse ${t.skeletonBg}`} />
        <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[...Array(10)].map((_, i) => <div key={i} className={`h-56 rounded-2xl animate-pulse ${t.skeletonBg}`} />)}
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

        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <button
            onClick={() => toggleTheme()}
            aria-label="Toggle theme"
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center hover:scale-105 transition-transform"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-white" />}
          </button>
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
          <button
            className="w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
            onClick={() => setReportModalOpen(true)}
            data-testid="button-print-store-report"
            title="Signaler"
          >
            <Flag className="w-4 h-4 text-white/80" />
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
          <div className="relative top-4 min-w-0 flex-1">
            <h1 className={`font-extrabold text-xl leading-tight truncate ${t.textPrimary}`} data-testid="text-print-store-name">{card.name}</h1>
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1 ${isDark ? "text-amber-400" : "text-amber-600"}`}>
              <span className="flex items-center gap-1"><Package className="w-3 h-3" />{services.length} service{services.length !== 1 ? "s" : ""}</span>
              {card.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{card.location}</span>}
            </div>
          </div>
        </div>
        {card.description && <p className={`text-sm mt-6 ml-20 line-clamp-1 break-words ${t.textMuted}`}>{card.description}</p>}
      </div>

      {categories.length > 0 && (
        <div className={`sticky top-14 z-30 border-b mt-4 transition-colors ${t.stripBg}`}>
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-1.5 overflow-x-auto py-3" style={{ scrollbarWidth: "none" }}>
              <div className={`flex rounded-2xl p-1 shrink-0 ${t.switcherBg}`}>
                <button
                  onClick={() => setCategoryId("")}
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
                    onClick={() => setCategoryId(categoryId === cat ? "" : cat)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-[11px] font-semibold ${categoryId === cat ? t.switcherActive : t.switcherInactive}`}
                    data-testid={`button-print-store-cat-${cat}`}
                  >
                    <span className="text-base leading-none">{printCategoryIcon(cat, categoryIconByName.get(cat))}</span>
                    <span className="whitespace-nowrap">{cat}</span>
                  </button>
                </div>
              ))}
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
              <p className={`text-sm mt-1 ${t.textMuted}`}>{categoryId ? "Essayez une autre catégorie." : "Cette imprimerie n'a pas encore de service actif."}</p>
            </div>
            {categoryId && <Button size="sm" variant="outline" onClick={() => setCategoryId("")}>Effacer le filtre</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((service) => (
              <StoreServiceCard key={service.id} card={service} onClick={() => setPreviewServiceId(service.id)} isDark={isDark} />
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

      <ReviewsModal
        open={reviewsModalOpen}
        onClose={() => setReviewsModalOpen(false)}
        professionalName={card.name}
        rating={card.rating / 10}
        reviewCount={card.reviewCount ?? reviews.length}
        reviews={reviews.map((r) => ({ ...r, createdAt: r.createdAt ? String(r.createdAt) : undefined }))}
        isDark={isDark}
        reviewForm={eligibleOrders.length > 0 ? (
          <div className={`mt-3 p-3 rounded-xl border space-y-2 ${t.border}`}>
            <p className={`text-xs font-medium ${t.textPrimary}`}>{existingReview ? "Modifier votre avis" : "Laisser un avis"}</p>
            {eligibleOrders.length > 1 && (
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
            )}
            <StarPicker value={existingReview?.rating ?? reviewRating} onChange={setReviewRating} />
            <Textarea
              placeholder="Commentaire (facultatif)"
              rows={2}
              defaultValue={existingReview?.comment ?? ""}
              onChange={(e) => setReviewComment(e.target.value)}
              className={isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200"}
              data-testid="input-store-review-comment"
            />
            <Button size="sm" onClick={submitReview} disabled={createReview.isPending} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-submit-store-review">
              {createReview.isPending ? "Envoi…" : existingReview ? "Mettre à jour l'avis" : "Envoyer l'avis"}
            </Button>
          </div>
        ) : undefined}
      />

      {/* Signaler — same modal chrome as the Disponibilité modal above
          (rounded-[2rem] container, circular close button), close button on
          the right, standardized across the app this session. */}
      <Dialog open={reportModalOpen} onOpenChange={(v) => { if (!v) { setReportModalOpen(false); setReportReason(""); } }}>
        <DialogContent className={`sm:max-w-md p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden ${isDark ? "bg-gray-900" : "bg-white"}`}>
          <VisuallyHidden><DialogTitle>Signaler {card.name}</DialogTitle></VisuallyHidden>
          <div className="px-5 pt-5 pb-5 space-y-3">
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
              <Button size="sm" variant="ghost" className={t.textPrimary} onClick={() => { setReportModalOpen(false); setReportReason(""); }}>Annuler</Button>
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
      />
    </div>
  );
}
