import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatCurrency } from "@/hooks/use-currency";
import baristaHeroImg from "@assets/8d80708f-be87-4e8d-8805-f60e3c292914-1000x562.5-rjZKXkudAsN4bH_1780680229193.jpg";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useThemeStore } from "@/store/theme-store";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Coffee,
  Star,
  Clock,
  MapPin,
  MessageCircle,
  Search,
  SlidersHorizontal,
  RotateCcw,
  CheckCircle,
  Users,
  CalendarDays,
  Heart,
  Send,
  Zap,
  Ban,
} from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";
import { useHeroActionSettings } from "@/hooks/use-hero-actions";
import {
  useBaristaProfiles,
  useBaristaSkills,
  useCreateBaristaRequest,
  type BaristaMarketplaceCard,
} from "@/hooks/use-barista-marketplace";
import { BaristaDetailModal } from "@/components/barista/barista-detail-modal";
import { BaristaFastSearch } from "@/components/barista/barista-fast-search";
import { BaristaBlacklistModal } from "@/components/barista/barista-blacklist-modal";

// This page is now Marketplace Baristas ONLY — Barista Academy was split out
// into its own independent page/service, client/src/pages/cafe/barista/barista-academy-page.tsx
// (route /academy). Nothing about the Marketplace functionality below changed
// as part of that split — filters, cards, recruitment, favorites, messaging,
// realtime are all exactly as they were.

// ── Access helper (mirrors browse-products.tsx pattern) ──────────────────────

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

const BARISTA_LEVEL_COLORS: Record<string, string> = {
  BEGINNER: "bg-green-100 text-green-700",
  ADVANCED: "bg-blue-100 text-blue-700",
  EXPERT: "bg-purple-100 text-purple-700",
};

const BARISTA_LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Débutant",
  ADVANCED: "Avancé",
  EXPERT: "Expert",
};

// ── Star Rating ───────────────────────────────────────────────────────────────

function StarRating({ rating, isDark = false }: { rating: number; isDark?: boolean }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      <Star className="w-3 h-3 fill-amber-400" />
      <span className={`text-[11px] font-semibold ${isDark ? "text-gray-200" : "text-gray-700"}`}>{rating.toFixed(1)}</span>
    </span>
  );
}

// ── Recruit Dialog ─────────────────────────────────────────────────────────────

export function RecruitDialog({
  barista,
  open,
  onClose,
  isDark,
}: {
  barista: BaristaMarketplaceCard | null;
  open: boolean;
  onClose: () => void;
  isDark: boolean;
}) {
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const createRequest = useCreateBaristaRequest();
  const [missionType, setMissionType] = useState("");
  const [message, setMessage] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [proposedRate, setProposedRate] = useState("");

  useEffect(() => {
    if (open && barista) {
      setMissionType("");
      setMessage("");
      setStartDate("");
      setEndDate("");
      setProposedRate(String(barista.dailyRateInCents / 100));
    }
  }, [open, barista?.userId]);

  if (!barista) return null;

  const submit = () => {
    createRequest.mutate(
      {
        baristaUserId: barista.userId,
        missionType: missionType.trim(),
        message: message.trim() || undefined,
        proposedRateInCents: proposedRate ? Math.round(parseFloat(proposedRate) * 100) : null,
        startDate,
        endDate: endDate || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Demande envoyée", description: `${barista.name} pourra maintenant l'accepter ou en discuter.` });
          onClose();
        },
        onError: (error: Error) => {
          toast({ title: "Impossible d'envoyer la demande", description: error.message, variant: "destructive" });
        },
      }
    );
  };

  // Theme fix: this app's dark mode is NOT Tailwind's `dark:` class strategy —
  // nothing ever adds a `.dark` class to the DOM (see useTheme() above), so
  // `bg-background`/`text-foreground`/the Input/Textarea base components' own
  // CSS-var tokens never actually change with the navbar toggle. Reusing the
  // same `useTheme(isDark)` ternary-class helper this page already relies on
  // everywhere else that IS correctly dark-mode-aware.
  const t = useTheme(isDark);
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className={`sm:max-w-md rounded-2xl border-0 shadow-2xl ${t.pageBg}`}>
        <VisuallyHidden><DialogTitle>Recruter {barista.name}</DialogTitle></VisuallyHidden>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={getAvatarUrl(barista as any)} alt={barista.name} />
              <AvatarFallback className={`font-bold text-sm ${isDark ? "bg-green-900/50 text-green-300" : "bg-green-100 text-green-700"}`}>{barista.initials}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className={`font-bold text-base leading-tight ${t.textPrimary}`}>{barista.name}</h2>
              <p className={`text-xs ${t.textMuted}`}>Tarif indicatif : {fmt(barista.dailyRateInCents)} / jour</p>
            </div>
          </div>
          <Input
            placeholder="Type de mission (ex: renfort événement, service quotidien...)"
            value={missionType}
            onChange={(e) => setMissionType(e.target.value)}
            className={t.inputBg}
            data-testid="input-recruit-mission-type"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={t.inputBg} data-testid="input-recruit-start-date" />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={t.inputBg} data-testid="input-recruit-end-date" placeholder="Fin (optionnel)" />
          </div>
          <Input
            type="number"
            min={0}
            placeholder="Tarif proposé (optionnel)"
            value={proposedRate}
            onChange={(e) => setProposedRate(e.target.value)}
            className={t.inputBg}
            data-testid="input-recruit-rate"
          />
          <Textarea
            placeholder="Message pour le barista (optionnel)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className={t.inputBg}
            data-testid="input-recruit-message"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" className={`${t.textPrimary} ${isDark ? "border-gray-700" : ""}`} onClick={onClose}>Annuler</Button>
            <Button
              disabled={!missionType.trim() || !startDate || createRequest.isPending}
              onClick={submit}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-submit-recruit"
            >
              <Send className="w-4 h-4 mr-1.5" />
              {createRequest.isPending ? "Envoi…" : "Envoyer la demande"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Barista Profile Card ──────────────────────────────────────────────────────

function BaristaCard({
  barista,
  canAct,
  onChat,
  onOpenDetail,
  isDark,
}: {
  barista: BaristaMarketplaceCard;
  canAct: boolean;
  onChat: (barista: BaristaMarketplaceCard) => void;
  onOpenDetail: (barista: BaristaMarketplaceCard) => void;
  isDark: boolean;
}) {
  const fmt = useFormatCurrency();
  const t = useTheme(isDark);
  const faved = useFavorites((s) => !!s.baristaMarket[barista.userId]);
  const toggleBaristaMarket = useFavorites((s) => s.toggleBaristaMarket);

  // Wide card (Part 23): left half = photo, right half = information. Same
  // visual language (colors/badges/icons) as before, just laid out horizontally
  // instead of the previous small-avatar-on-top layout.
  return (
    <div
      data-testid={`card-barista-${barista.userId}`}
      onClick={() => onOpenDetail(barista)}
      className={`group relative rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex cursor-pointer ${t.cardBg}`}
    >
      <button
        className="absolute top-2 right-2 z-10 w-6 h-6 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
        onClick={(e) => {
          e.stopPropagation();
          toggleBaristaMarket({
            id: barista.userId,
            name: barista.name,
            initials: barista.initials,
            skills: barista.skills,
            location: barista.location,
            rating: barista.rating / 10,
            available: barista.available,
            profileImageUrl: barista.profileImageUrl,
          });
        }}
        data-testid={`button-fav-barista-${barista.userId}`}
      >
        <Heart className={`w-3 h-3 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
      </button>

      {/* Left half — photo, real profile picture with existing avatar fallback */}
      <div className="w-2/5 shrink-0 relative">
        <Avatar className="w-full h-full rounded-none">
          <AvatarImage src={getAvatarUrl(barista as any)} alt={barista.name} className="object-cover" />
          <AvatarFallback className="rounded-none bg-green-100 text-green-700 font-bold text-2xl">
            {barista.initials}
          </AvatarFallback>
        </Avatar>
        <span
          className={`absolute bottom-2 left-2 w-2.5 h-2.5 rounded-full border-2 border-white ${barista.available ? "bg-green-500" : "bg-gray-300"}`}
          title={barista.available ? "Disponible" : "Indisponible"}
        />
      </div>

      {/* Right half — information */}
      <div className="flex-1 min-w-0 p-3 flex flex-col gap-1.5">
        <h3 className={`font-bold text-sm leading-tight truncate group-hover:text-green-600 transition-colors pr-5 ${t.textPrimary}`}>
          {barista.name}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`text-[10px] border-0 px-1.5 ${BARISTA_LEVEL_COLORS[barista.level]}`}>
            {BARISTA_LEVEL_LABELS[barista.level]}
          </Badge>
          {barista.location && (
            <span className="flex items-center gap-0.5 text-[11px] text-gray-400">
              <MapPin className="w-2.5 h-2.5" />
              {barista.location}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <StarRating rating={barista.rating / 10} isDark={isDark} />
          <span className="text-[11px] text-gray-400">({barista.reviewCount} avis)</span>
        </div>

        {barista.skills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {barista.skills.slice(0, 4).map((skill) => (
              <span
                key={skill}
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${t.mutedBg} ${t.textMuted}`}
              >
                {skill}
              </span>
            ))}
          </div>
        )}

        {barista.availableDays.length > 0 && (
          <div className={`flex items-center gap-1 text-[11px] ${t.textMuted}`}>
            <CalendarDays className="w-3 h-3 shrink-0" />
            <span className="truncate">{barista.availableDays.join(" · ")}</span>
          </div>
        )}

        {/* Recruter moved into the details modal (Part 6/8) — the card itself
            is now the primary click target for it; the quick Message shortcut
            stays here since only Recruter was asked to move. */}
        <div className={`mt-auto pt-2 border-t ${t.border}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className={`text-[10px] ${t.textSubtle}`}>Tarif / jour</p>
              <p className="font-bold text-sm text-green-600">
                {fmt(barista.dailyRateInCents)}
              </p>
            </div>
            <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg px-2"
                data-testid={`button-chat-barista-${barista.userId}`}
                disabled={!canAct}
                onClick={() => onChat(barista)}
              >
                <MessageCircle className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BaristaPage({ comingSoon = false }: { comingSoon?: boolean }) {
  const { user } = useAuth();
  const accessLevel = useAccessLevel();
  const isDark = useThemeStore((s) => s.isDark);
  const t = useTheme(isDark);
  const { settings: heroActions } = useHeroActionSettings();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Hiring filters
  const [baristaSearch, setBaristaSearch] = useState("");
  const [baristaLevel, setBaristaLevel] = useState("");
  const [baristaAvailability, setBaristaAvailability] = useState("");
  const [baristaSkill, setBaristaSkill] = useState("");
  const [baristaLocation, setBaristaLocation] = useState("");

  const [recruitTarget, setRecruitTarget] = useState<BaristaMarketplaceCard | null>(null);
  const [detailBaristaId, setDetailBaristaId] = useState<number | null>(null);
  const [fastSearchOpen, setFastSearchOpen] = useState(false);
  const [blacklistOpen, setBlacklistOpen] = useState(false);

  const { data: profiles = [], isLoading: profilesLoading, isError: profilesError } = useBaristaProfiles();
  const { data: skillOptions = [] } = useBaristaSkills();

  // Hydrate favorite hearts from the database, mirroring maintenance-page.tsx's pattern.
  const { data: favoriteIds = [] } = useQuery<number[]>({
    queryKey: ["/api/barista-favorites"],
    enabled: !!user && accessLevel === "approved",
  });
  const syncBaristaMarket = useFavorites((s) => s.syncBaristaMarket);
  useEffect(() => {
    if (profilesLoading) return;
    syncBaristaMarket(favoriteIds, profiles);
  }, [favoriteIds, profiles, profilesLoading, syncBaristaMarket]);

  const filteredBaristas = useMemo(() => {
    let list = profiles;
    if (baristaSearch.trim()) {
      const q = baristaSearch.toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.skills.some((s) => s.toLowerCase().includes(q))
      );
    }
    if (baristaLevel) list = list.filter((b) => b.level === baristaLevel);
    if (baristaAvailability === "available")
      list = list.filter((b) => b.available);
    if (baristaAvailability === "unavailable")
      list = list.filter((b) => !b.available);
    if (baristaSkill)
      list = list.filter((b) =>
        b.skills.some((s) => s.toLowerCase() === baristaSkill.toLowerCase())
      );
    if (baristaLocation)
      list = list.filter(
        (b) => b.location.toLowerCase() === baristaLocation.toLowerCase()
      );
    return list;
  }, [
    profiles,
    baristaSearch,
    baristaLevel,
    baristaAvailability,
    baristaSkill,
    baristaLocation,
  ]);

  const allSkills = useMemo(
    () => (skillOptions.length > 0 ? skillOptions.map((s) => s.name) : Array.from(new Set(profiles.flatMap((b) => b.skills)))).sort(),
    [skillOptions, profiles]
  );
  const allLocations = useMemo(
    () => Array.from(new Set(profiles.map((b) => b.location).filter(Boolean))).sort(),
    [profiles]
  );

  const hasBaristaFilters = !!(
    baristaSearch ||
    baristaLevel ||
    baristaAvailability ||
    baristaSkill ||
    baristaLocation
  );

  const canAct = !!user && user.role === "CAFE_OWNER" && accessLevel === "approved";

  const handleChat = async (barista: BaristaMarketplaceCard) => {
    if (!canAct) {
      if (!user) { navigate("/login"); return; }
      toast({ title: "Action réservée aux cafés approuvés", variant: "destructive" });
      return;
    }
    try {
      const response = await apiRequest("POST", "/api/messages/conversations", {
        targetUserId: barista.userId,
        service: "BARISTA",
      });
      const data = await response.json() as { conversation: { id: number } };
      navigate(`/cafe/messages?service=BARISTA&conversationId=${data.conversation.id}`);
    } catch (error) {
      toast({ title: "Contact impossible", description: error instanceof Error ? error.message : "Veuillez réessayer.", variant: "destructive" });
    }
  };

  const handleRecruit = (barista: BaristaMarketplaceCard) => {
    if (!canAct) {
      if (!user) { navigate("/login"); return; }
      toast({ title: "Action réservée aux cafés approuvés", variant: "destructive" });
      return;
    }
    setRecruitTarget(barista);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-5 pb-12 px-5 overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80"
          style={{ backgroundImage: `url(${baristaHeroImg})` }}
        />
        {/* Dark overlay */}
        <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-br from-gray-950/95 via-gray-900/95 to-green-950/90" : "bg-gradient-to-br from-green-600/90 via-green-700/85 to-emerald-700/90"}`} />
        {/* Content */}
        <div className="relative">
          {/* The global navbar theme control is the single Dark/Light toggle
              now, so the duplicated hero one is gone; Fast Search/Report stay
              Admin-toggleable per service (see /api/hero-actions). */}
          <div className="flex justify-end items-center gap-2 mb-9">
            {canAct && heroActions.BARISTA.reportEnabled && (
              <button
                onClick={() => setBlacklistOpen(true)}
                aria-label="Baristas signalés"
                title="Baristas signalés"
                data-testid="button-open-blacklist"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-red-400" : "bg-white/20 hover:bg-white/30 text-white"}`}
              >
                <Ban className="w-4 h-4" />
              </button>
            )}
            {canAct && heroActions.BARISTA.fastSearchEnabled && (
              <button
                onClick={() => setFastSearchOpen(true)}
                aria-label="Fast Search"
                title="Fast Search — parcourir les baristas"
                data-testid="button-open-fast-search"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-green-400" : "bg-white/20 hover:bg-white/30 text-white"}`}
              >
                <Zap className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="max-w-3xl mx-auto text-center">
          <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-5 backdrop-blur-sm ${isDark ? "bg-gray-800/80 border border-gray-700" : "bg-white/20"}`}>
            <Coffee className={`w-8 h-8 ${isDark ? "text-amber-400" : "text-white"}`} />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
            BigBoss <span className={isDark ? "text-amber-400" : "text-amber-200"}>BARISTA</span>
          </h1>
          <p className={`text-base mb-4 max-w-xl mx-auto ${isDark ? "text-gray-400" : "text-green-100"}`}>
            Trouvez et recrutez des baristas professionnels pour votre établissement
          </p>
          <div className={`flex items-center justify-center gap-6 flex-wrap text-sm ${isDark ? "text-gray-400" : "text-green-100"}`}>
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {profiles.length} baristas disponibles
            </span>
          </div>
          </div>
        </div>
      </section>

      {comingSoon ? (
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${t.mutedBg}`}>
            <Clock className="w-8 h-8 text-green-600" />
          </div>
          <h2 className={`text-xl font-bold mb-2 ${t.textPrimary}`} data-testid="text-coming-soon-title">
            Bientôt disponible
          </h2>
          <p className={`text-sm max-w-md mx-auto ${t.textMuted}`}>
            Ce service est en cours de préparation. Revenez bientôt pour le découvrir.
          </p>
        </div>
      ) : (
      <>
      {/* ── Pending notice ──────────────────────────────────────────────── */}
      {accessLevel === "pending" && (
        <div className={`${isDark ? "bg-amber-950/40 border-amber-900/60" : "bg-amber-50 border-amber-200"} border-b px-4 py-3`}>
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-amber-800 text-sm font-medium">
            <CheckCircle className="w-4 h-4 shrink-0" />
            Votre compte est en attente d'approbation. Vous pourrez accéder aux tarifs et réservations une fois approuvé.
          </div>
        </div>
      )}

       <div className="max-w-7xl mx-auto px-4 py-8">
        <section>
          {/* Hiring Filters */}
           <div className={`border rounded-2xl p-3 mb-5 shadow-sm ${t.cardBg}`}>
            <div className="flex items-center gap-2 flex-wrap">
               <SlidersHorizontal className={`w-3.5 h-3.5 ${t.textSubtle} shrink-0`} />
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  value={baristaSearch}
                  onChange={(e) => setBaristaSearch(e.target.value)}
                  placeholder="Nom ou compétence..."
                   className={`h-7 text-xs pl-8 rounded-full ${t.inputBg}`}
                  data-testid="input-barista-search"
                />
              </div>
              <Select
                value={baristaLevel || "__all__"}
                onValueChange={(v) => setBaristaLevel(v === "__all__" ? "" : v)}
              >
                 <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] ${t.inputBg}`} data-testid="select-barista-level">
                  <SelectValue placeholder="Niveau" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Tous niveaux</SelectItem>
                  <SelectItem value="BEGINNER">Débutant</SelectItem>
                  <SelectItem value="ADVANCED">Avancé</SelectItem>
                  <SelectItem value="EXPERT">Expert</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={baristaAvailability || "__all__"}
                onValueChange={(v) => setBaristaAvailability(v === "__all__" ? "" : v)}
              >
                 <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[130px] ${t.inputBg}`} data-testid="select-barista-availability">
                  <SelectValue placeholder="Disponibilité" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Toutes disponibilités</SelectItem>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="unavailable">Indisponible</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={baristaSkill || "__all__"}
                onValueChange={(v) => setBaristaSkill(v === "__all__" ? "" : v)}
              >
                 <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] ${t.inputBg}`} data-testid="select-barista-skill">
                  <SelectValue placeholder="Compétence" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Toutes compétences</SelectItem>
                  {allSkills.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={baristaLocation || "__all__"}
                onValueChange={(v) => setBaristaLocation(v === "__all__" ? "" : v)}
              >
                 <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[110px] ${t.inputBg}`} data-testid="select-barista-location">
                  <SelectValue placeholder="Ville" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Toutes villes</SelectItem>
                  {allLocations.map((loc) => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasBaristaFilters && (
                <button
                  onClick={() => {
                    setBaristaSearch("");
                    setBaristaLevel("");
                    setBaristaAvailability("");
                    setBaristaSkill("");
                    setBaristaLocation("");
                  }}
                  className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
                  data-testid="button-reset-barista-filters"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>
          </div>

          {profilesLoading ? (
            // ~2x the previous card width (Part 23-24): fewer columns per breakpoint,
            // 1 per row on mobile.
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : profilesError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Users className="w-12 h-12 text-gray-200" />
              <p className="font-semibold text-gray-700">Impossible de charger les baristas</p>
              <p className="text-sm text-gray-400">Veuillez réessayer plus tard.</p>
            </div>
          ) : filteredBaristas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Users className="w-12 h-12 text-gray-200" />
              <p className="font-semibold text-gray-700">Aucun barista trouvé</p>
              <p className="text-sm text-gray-400">Essayez d'ajuster vos filtres.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredBaristas.map((barista) => (
                 <BaristaCard
                  key={barista.userId}
                  barista={barista}
                  canAct={canAct}
                  onChat={handleChat}
                  onOpenDetail={(b) => setDetailBaristaId(b.userId)}
                  isDark={isDark}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      </>
      )}

      {/* Fast Search (Parts 30-32) — same `profiles` list as the grid above,
          same visibility/availability rules, no separate data copy. Rendered
          BEFORE Details/Recruit below so — when both are open at once — the
          Details/Recruit dialog mounts later in the DOM and stacks visually
          above Fast Search, which stays open underneath instead of closing. */}
      <BaristaFastSearch
        open={fastSearchOpen}
        onClose={() => setFastSearchOpen(false)}
        baristas={profiles}
        onRecruit={(b) => handleRecruit(b)}
        onOpenDetail={(b) => setDetailBaristaId(b.userId)}
      />

      <RecruitDialog
        barista={recruitTarget}
        open={!!recruitTarget}
        onClose={() => setRecruitTarget(null)}
        isDark={isDark}
      />

      <BaristaDetailModal
        baristaUserId={detailBaristaId}
        open={detailBaristaId != null}
        onClose={() => setDetailBaristaId(null)}
        onRecruit={(b) => { setDetailBaristaId(null); handleRecruit(b); }}
      />

      <BaristaBlacklistModal open={blacklistOpen} onClose={() => setBlacklistOpen(false)} />
    </div>
  );
}
