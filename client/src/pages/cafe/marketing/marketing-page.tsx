import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import marketingHeroImg from "@assets/image_1780681027926.png";
import { useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useThemeStore } from "@/store/theme-store";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Megaphone,
  Search as SearchIcon,
  MapPin,
  Star,
  SlidersHorizontal,
  RotateCcw,
  CheckCircle,
  X,
  Users,
  Heart,
  Clock,
  Zap,
  Ban,
} from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";
import { useHeroActionSettings } from "@/hooks/use-hero-actions";
import {
  useMarketingProfiles,
  useMarketingTaxonomy,
  useCreateMarketingProject,
  type MarketingMarketplaceCard,
} from "@/hooks/use-marketing";
import { MarketingDetailModal } from "@/components/marketing/marketing-detail-modal";
import { MarketingFastSearch } from "@/components/marketing/marketing-fast-search";
import { MarketingBlacklistModal } from "@/components/marketing/marketing-blacklist-modal";

// ── Access helper (mirrors browse-products + barista-page pattern) ────────────

type AccessLevel = "visitor" | "pending" | "approved";

function useAccessLevel(): AccessLevel {
  const { user } = useAuth();
  if (!user) return "visitor";
  if (["SUPER_ADMIN", "ADMIN", "SUPPLIER"].includes(user.role)) return "approved";
  if (user.role === "CAFE_OWNER" && (user as any).status === "approved") return "approved";
  return "pending";
}

function useTheme(isDark: boolean) {
  return {
    dk: isDark,
    pageBg: isDark ? "bg-gray-900" : "bg-gray-50",
    cardBg: isDark ? "bg-gray-800 border-gray-700/60" : "bg-white border-gray-100",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    textSubtle: isDark ? "text-gray-500" : "text-gray-400",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    mutedBg: isDark ? "bg-gray-800" : "bg-gray-100",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
    selectContent: isDark
      ? "bg-gray-800 border-gray-700 text-gray-100 [&_[data-highlighted]]:bg-gray-700 [&_[data-highlighted]]:text-white"
      : "bg-white border-gray-200 text-gray-900",
  };
}

// Emoji icon per known default category — falls back to the taxonomy's own
// `icon` field (admin-set) or a generic 📢 for anything else, so a new
// Admin-added category never breaks the strip.
const CATEGORY_ICON_FALLBACK: Record<string, string> = {
  Website: "🌐", SEO: "🔍", Ads: "📢", Social: "📱", "Vidéo": "🎥", Photo: "📸", Branding: "🎨",
};

const PROVIDER_TYPE_LABELS: Record<string, string> = {
  Agency: "Agence", Freelancer: "Freelancer", Studio: "Studio",
};
const PROVIDER_TYPE_COLORS: Record<string, string> = {
  Agency: "bg-blue-100 text-blue-700", Freelancer: "bg-orange-100 text-orange-700", Studio: "bg-violet-100 text-violet-700",
};
function providerTypeLabel(type: string) { return PROVIDER_TYPE_LABELS[type] ?? type; }
function providerTypeColor(type: string) { return PROVIDER_TYPE_COLORS[type] ?? "bg-gray-100 text-gray-700"; }

// ── Star Rating ───────────────────────────────────────────────────────────────

function StarRating({ rating, isDark = false }: { rating: number; isDark?: boolean }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      <Star className="w-3 h-3 fill-amber-400" />
      <span className={`text-[11px] font-semibold ${isDark ? "text-gray-200" : "text-gray-700"}`}>{rating.toFixed(1)}</span>
    </span>
  );
}

// ── Quote request modal — real POST /api/marketing/projects, not a dead button ──

export function QuoteRequestDialog({ provider, onClose }: { provider: MarketingMarketplaceCard | null; onClose: () => void }) {
  const { toast } = useToast();
  const createProject = useCreateMarketingProject();
  const [service, setService] = useState("");
  const [description, setDescription] = useState("");

  const categories = provider?.categories ?? [];
  const selectedService = service || categories[0] || "";

  const submit = () => {
    if (!provider || !selectedService) return;
    createProject.mutate(
      { marketingUserId: provider.userId, service: selectedService, description },
      {
        onSuccess: () => {
          toast({ title: "Demande envoyée", description: `${provider.name} a été notifié de votre demande.` });
          setService(""); setDescription(""); onClose();
        },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={!!provider} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Demander un devis</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Décrivez votre besoin à {provider?.name}. Vous recevrez une réponse et un devis directement dans vos notifications.
        </p>
        {categories.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Service concerné</label>
            <Select value={selectedService} onValueChange={setService}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Détails de votre demande</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Décrivez votre projet, vos objectifs, votre budget approximatif…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={!selectedService || createProject.isPending} onClick={submit} className="bg-purple-600 hover:bg-purple-700 text-white">
            {createProject.isPending ? "Envoi…" : "Envoyer la demande"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Provider Card ─────────────────────────────────────────────────────────────
// Barista marketplace card as the visual/UX reference (Part 3/27): left =
// image, right = info, whole card is the click target. Unlike Barista's own
// card, action buttons are intentionally removed (Part 4) — Message/Voir
// profil/Devis all moved into MarketingDetailModal, opened by the card click.

function ProviderCard({
  provider,
  onOpenDetail,
  isDark,
}: {
  provider: MarketingMarketplaceCard;
  onOpenDetail: (p: MarketingMarketplaceCard) => void;
  isDark: boolean;
}) {
  const fmt = useFormatCurrency();
  const t = useTheme(isDark);
  const faved = useFavorites((s) => !!s.marketing[provider.userId]);
  const toggleMarketing = useFavorites((s) => s.toggleMarketing);

  // First portfolio image is the card's main image (Part 2) — existing avatar
  // fallback (real profile picture or initials) when the provider has none yet.
  const coverImage = provider.portfolioImages[0];

  return (
    <div
      data-testid={`card-provider-${provider.userId}`}
      onClick={() => onOpenDetail(provider)}
      className={`group relative rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex cursor-pointer ${t.cardBg}`}
    >
      <button
        className="absolute top-2 right-2 z-10 w-6 h-6 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
        onClick={(e) => {
          e.stopPropagation();
          toggleMarketing({
            id: provider.userId, name: provider.name, initials: provider.initials,
            type: providerTypeLabel(provider.profileType), rating: provider.rating / 10,
            portfolioImages: provider.portfolioImages, location: provider.location,
            available: provider.isAvailable, profileImageUrl: provider.profileImageUrl,
          });
        }}
        data-testid={`button-fav-marketing-${provider.userId}`}
      >
        <Heart className={`w-3 h-3 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
      </button>

      {/* Left — photo (first portfolio image, existing avatar fallback) */}
      <div className="w-2/5 shrink-0 relative">
        {coverImage ? (
          <img src={coverImage} alt={provider.name} className="w-full h-full object-cover" />
        ) : (
          <Avatar className="w-full h-full rounded-none">
            <AvatarImage src={provider.profileImageUrl ?? undefined} alt={provider.name} className="object-cover" />
            <AvatarFallback className="rounded-none bg-purple-100 text-purple-700 font-bold text-2xl">
              {provider.initials}
            </AvatarFallback>
          </Avatar>
        )}
        <span
          className={`absolute bottom-2 left-2 w-2.5 h-2.5 rounded-full border-2 border-white ${provider.isAvailable ? "bg-green-500" : "bg-gray-300"}`}
          title={provider.isAvailable ? "Disponible" : "Indisponible"}
        />
      </div>

      {/* Right — information */}
      <div className="flex-1 min-w-0 p-3 flex flex-col gap-1.5">
        <h3 className={`font-bold text-sm leading-tight truncate group-hover:text-purple-600 transition-colors pr-5 ${t.textPrimary}`}>
          {provider.name}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`text-[10px] border-0 px-1.5 ${providerTypeColor(provider.profileType)}`}>{providerTypeLabel(provider.profileType)}</Badge>
          {provider.location && (
            <span className="flex items-center gap-0.5 text-[11px] text-gray-400">
              <MapPin className="w-2.5 h-2.5" />{provider.location}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <StarRating rating={provider.rating / 10} isDark={isDark} />
          <span className="text-[11px] text-gray-400">({provider.reviewCount} avis)</span>
        </div>

        {provider.categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {provider.categories.slice(0, 4).map((cat) => (
              <span key={cat} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${t.mutedBg} ${t.textMuted}`}>
                {cat}
              </span>
            ))}
          </div>
        )}

        <div className={`mt-auto pt-2 border-t ${t.border}`}>
          <p className={`text-[10px] ${t.textSubtle}`}>À partir de</p>
          <p className="font-bold text-sm text-purple-600">{fmt(provider.startingPriceInCents)}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MarketingPage({ comingSoon = false }: { comingSoon?: boolean }) {
  const { user } = useAuth();
  const accessLevel = useAccessLevel();
  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);
  const { settings: heroActions } = useHeroActionSettings();

  const searchStr = useSearch();
  const initialService = new URLSearchParams(searchStr).get("service") ?? "";
  const [selectedService, setSelectedService] = useState<string>(initialService);
  const [search, setSearch] = useState("");
  const [filterRating, setFilterRating] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterType, setFilterType] = useState("");
  const [detailProviderId, setDetailProviderId] = useState<number | null>(null);
  const [quoteProvider, setQuoteProvider] = useState<MarketingMarketplaceCard | null>(null);
  const [fastSearchOpen, setFastSearchOpen] = useState(false);
  const [blacklistOpen, setBlacklistOpen] = useState(false);

  const { data: taxonomy = [] } = useMarketingTaxonomy();
  const { data: providers = [], isLoading } = useMarketingProfiles({
    search: search.trim() || undefined,
    category: selectedService || undefined,
    profileType: filterType || undefined,
    location: filterLocation || undefined,
  });

  // Hydrate favorite hearts from the database, mirroring barista-page.tsx's pattern —
  // without this the Marketing favorites never survived a page reload.
  const { data: favoriteIds = [] } = useQuery<number[]>({
    queryKey: ["/api/marketing-favorites"],
    enabled: !!user && accessLevel === "approved",
  });
  const syncMarketing = useFavorites((s) => s.syncMarketing);
  useEffect(() => {
    if (isLoading) return;
    syncMarketing(favoriteIds, providers);
  }, [favoriteIds, providers, isLoading, syncMarketing]);

  const allLocations = useMemo(() => Array.from(new Set(providers.map((p) => p.location).filter(Boolean))).sort(), [providers]);

  const filteredProviders = useMemo(() => {
    if (!filterRating) return providers;
    const min = parseFloat(filterRating) * 10;
    return providers.filter((p) => p.rating >= min);
  }, [providers, filterRating]);

  const hasFilters = !!(selectedService || search || filterRating || filterLocation || filterType);

  const resetFilters = () => {
    setSelectedService(""); setSearch(""); setFilterRating(""); setFilterLocation(""); setFilterType("");
  };

  const averageRating = providers.length > 0 ? providers.reduce((s, p) => s + p.rating, 0) / providers.length / 10 : 0;
  const canAct = accessLevel === "approved";

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-5 pb-12 px-5 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80" style={{ backgroundImage: `url(${marketingHeroImg})` }} />
        <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-br from-gray-950/95 via-gray-900/95 to-purple-950/90" : "bg-gradient-to-br from-purple-600/90 via-purple-700/85 to-violet-700/90"}`} />
        <div className="relative">
          {/* The global navbar theme control is the single Dark/Light toggle
              now, so the duplicated hero one is gone; Fast Search/Report stay
              Admin-toggleable per service (see /api/hero-actions). */}
          <div className="flex justify-end items-center gap-2 mb-9">
            {canAct && heroActions.MARKETING.reportEnabled && (
              <button
                onClick={() => setBlacklistOpen(true)}
                aria-label="Prestataires signalés"
                title="Prestataires signalés"
                data-testid="button-open-blacklist"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-red-400" : "bg-white/20 hover:bg-white/30 text-white"}`}
              >
                <Ban className="w-4 h-4" />
              </button>
            )}
            {canAct && heroActions.MARKETING.fastSearchEnabled && (
              <button
                onClick={() => setFastSearchOpen(true)}
                aria-label="Fast Search"
                title="Fast Search — parcourir les prestataires"
                data-testid="button-open-fast-search"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-purple-400" : "bg-white/20 hover:bg-white/30 text-white"}`}
              >
                <Zap className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="max-w-3xl mx-auto text-center">
            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-5 backdrop-blur-sm ${isDark ? "bg-gray-800/80 border border-gray-700" : "bg-white/20"}`}>
              <Megaphone className={`w-8 h-8 ${isDark ? "text-amber-400" : "text-white"}`} />
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
              BigBoss <span className={isDark ? "text-amber-400" : "text-amber-200"}>MARKETING</span>
            </h1>
            <p className={`text-base mb-4 max-w-xl mx-auto ${isDark ? "text-gray-400" : "text-purple-100"}`}>
              Boostez la visibilité de votre café avec des experts marketing dédiés à la restauration
            </p>
            <div className={`flex items-center justify-center gap-6 flex-wrap text-sm ${isDark ? "text-gray-400" : "text-purple-100"}`}>
              <span className="flex items-center gap-1.5"><Users className="w-4 h-4" />{providers.length} prestataires</span>
              <span className="flex items-center gap-1.5"><Megaphone className="w-4 h-4" />{taxonomy.length} types de services</span>
              {averageRating > 0 && (
                <span className="flex items-center gap-1.5"><Star className="w-4 h-4 fill-purple-200" />Note moyenne {averageRating.toFixed(1)}/5</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {comingSoon ? (
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${t.mutedBg}`}>
            <Clock className="w-8 h-8 text-purple-600" />
          </div>
          <h2 className={`text-xl font-bold mb-2 ${t.textPrimary}`} data-testid="text-coming-soon-title">Bientôt disponible</h2>
          <p className={`text-sm max-w-md mx-auto ${t.textMuted}`}>Ce service est en cours de préparation. Revenez bientôt pour le découvrir.</p>
        </div>
      ) : (
      <>
      {accessLevel === "pending" && (
        <div className={`${isDark ? "bg-amber-950/40 border-amber-900/60" : "bg-amber-50 border-amber-200"} border-b px-4 py-3`}>
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-amber-800 text-sm font-medium">
            <CheckCircle className="w-4 h-4 shrink-0" />
            Votre compte est en attente d'approbation. Vous pourrez accéder aux tarifs et demander des devis une fois approuvé.
          </div>
        </div>
      )}

      {/* ── Service strip + filters — sticky block ─────────────────── */}
      <div className={`${t.cardBg} sticky top-14 z-30 shadow-sm`}>
        <div className="border-b">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-1 overflow-x-auto py-3" style={{ scrollbarWidth: "none" }}>
              <button
                onClick={() => setSelectedService("")}
                data-testid="button-service-all"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl shrink-0 transition-all text-center min-w-[64px] ${selectedService === "" ? "bg-blue-600 text-white shadow-sm" : `${t.mutedBg} ${t.textMuted} hover:opacity-80`}`}
              >
                <span className="text-lg">📢</span>
                <span className="text-[11px] font-semibold leading-tight">All</span>
              </button>
              {taxonomy.filter((c) => c.isActive && !c.isFrozen).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedService(selectedService === cat.name ? "" : cat.name)}
                  data-testid={`button-service-cat-${cat.name}`}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl shrink-0 transition-all text-center min-w-[64px] ${selectedService === cat.name ? "bg-blue-600 text-white shadow-sm" : `${t.mutedBg} ${t.textMuted} hover:opacity-80`}`}
                >
                  <span className="text-lg">{cat.icon || CATEGORY_ICON_FALLBACK[cat.name] || "📢"}</span>
                  <span className="text-[11px] font-semibold leading-tight line-clamp-1 max-w-[60px]">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="border-b py-2 px-4">
          <div className="max-w-7xl mx-auto flex items-center gap-2 flex-wrap">
            <SlidersHorizontal className={`w-3.5 h-3.5 ${t.textSubtle} shrink-0`} />
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un prestataire..." className={`h-7 text-xs pl-8 rounded-full ${t.inputBg}`} data-testid="input-provider-search" />
            </div>
            <Select value={filterType || "__all__"} onValueChange={(v) => setFilterType(v === "__all__" ? "" : v)}>
              <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[130px] ${t.inputBg}`} data-testid="select-provider-type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className={t.selectContent}>
                <SelectItem value="__all__">Tous types</SelectItem>
                <SelectItem value="Agency">Agence</SelectItem>
                <SelectItem value="Freelancer">Freelancer</SelectItem>
                <SelectItem value="Studio">Studio</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterRating || "__all__"} onValueChange={(v) => setFilterRating(v === "__all__" ? "" : v)}>
              <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] ${t.inputBg}`} data-testid="select-provider-rating">
                <SelectValue placeholder="Note min." />
              </SelectTrigger>
              <SelectContent className={t.selectContent}>
                <SelectItem value="__all__">Toutes notes</SelectItem>
                <SelectItem value="4.5">4.5+</SelectItem>
                <SelectItem value="4.7">4.7+</SelectItem>
                <SelectItem value="4.9">4.9+</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterLocation || "__all__"} onValueChange={(v) => setFilterLocation(v === "__all__" ? "" : v)}>
              <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[110px] ${t.inputBg}`} data-testid="select-provider-location">
                <SelectValue placeholder="Ville" />
              </SelectTrigger>
              <SelectContent className={t.selectContent}>
                <SelectItem value="__all__">Toutes villes</SelectItem>
                {allLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasFilters && (
              <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors" data-testid="button-reset-marketing-filters">
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <section>
          {selectedService && (
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-xs ${t.textMuted}`}>Service filtré :</span>
              <button
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${isDark ? "bg-purple-950/60 text-purple-300 hover:bg-purple-900/70" : "bg-purple-100 text-purple-700 hover:bg-purple-200"}`}
                onClick={() => setSelectedService("")}
                data-testid="button-clear-service-filter"
              >
                {selectedService}
                <X className="w-3 h-3 ml-0.5" />
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(8)].map((_, i) => <div key={i} className={`h-36 rounded-2xl animate-pulse ${t.mutedBg}`} />)}
            </div>
          ) : filteredProviders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Users className={`w-12 h-12 ${t.textSubtle}`} />
              <p className={`font-semibold ${t.textPrimary}`}>Aucun prestataire trouvé</p>
              <p className={`text-sm ${t.textMuted}`}>Essayez d'ajuster vos filtres.</p>
              <Button size="sm" variant="outline" onClick={resetFilters} data-testid="button-reset-empty">Réinitialiser les filtres</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredProviders.map((provider) => (
                <ProviderCard
                  key={provider.userId}
                  provider={provider}
                  onOpenDetail={(p) => setDetailProviderId(p.userId)}
                  isDark={isDark}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      </>
      )}

      {/* Fast Search — same `providers` list as the grid above, rendered before
          the Details modal so it stays open underneath when both are mounted. */}
      <MarketingFastSearch
        open={fastSearchOpen}
        onClose={() => setFastSearchOpen(false)}
        providers={providers}
        onRequestQuote={(p) => setQuoteProvider(p)}
        onOpenDetail={(p) => setDetailProviderId(p.userId)}
      />

      <MarketingDetailModal
        marketingUserId={detailProviderId}
        open={detailProviderId != null}
        onClose={() => setDetailProviderId(null)}
        onRequestQuote={(p) => { setDetailProviderId(null); setQuoteProvider(p); }}
      />

      <MarketingBlacklistModal
        open={blacklistOpen}
        onClose={() => setBlacklistOpen(false)}
        onRequestQuote={(p) => setQuoteProvider(p)}
      />

      <QuoteRequestDialog provider={quoteProvider} onClose={() => setQuoteProvider(null)} />
    </div>
  );
}
