import { useState, useMemo } from "react";
import { useFormatCurrency } from "@/hooks/use-currency";
import baristaHeroImg from "@assets/8d80708f-be87-4e8d-8805-f60e3c292914-1000x562.5-rjZKXkudAsN4bH_1780680229193.jpg";
import { useAuth } from "@/hooks/use-auth";
import { useThemeStore } from "@/store/theme-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Star,
  Clock,
  Award,
  Search,
  SlidersHorizontal,
  RotateCcw,
  CheckCircle,
  GraduationCap,
  Heart,
  Sun,
  Moon,
} from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";

// Barista Academy — split out of the former combined /barista page into its
// own independent page/service (route /academy). This is a direct relocation
// of what was previously the "academy" tab inside barista-page.tsx: same
// static TRAINING_PROGRAMS data, same TrainingCard, same filters — untouched
// content/functionality, per the task's explicit instruction not to redesign
// or replace this (it was already static/mocked before the split, and stays
// that way here — no fake improvement, no new backend wiring added).

// ── Access helper (mirrors barista-page.tsx's own copy) ──────────────────────

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

// ── Static Data (unchanged from the former barista-page.tsx academy tab) ─────

const TRAINING_PROGRAMS = [
  {
    id: 1,
    title: "Espresso Fundamentals",
    provider: "Tunis Barista Academy",
    rating: 4.8,
    reviewCount: 124,
    duration: "3 jours",
    priceInCents: 24000,
    level: "Beginner" as const,
    hasCertification: true,
    description: "Maîtrisez les bases de l'extraction espresso, le réglage du moulin et la préparation de boissons classiques.",
    imageInitials: "TBA",
  },
  {
    id: 2,
    title: "Latte Art Masterclass",
    provider: "CaféCraft Tunis",
    rating: 4.9,
    reviewCount: 87,
    duration: "2 jours",
    priceInCents: 18000,
    level: "Advanced" as const,
    hasCertification: true,
    description: "Techniques avancées de latte art : tulipe, rosette, cœur et designs libres sur cappuccino et flat white.",
    imageInitials: "CC",
  },
  {
    id: 3,
    title: "Coffee Shop Management",
    provider: "BigBoss Business School",
    rating: 4.7,
    reviewCount: 56,
    duration: "5 jours",
    priceInCents: 55000,
    level: "Expert" as const,
    hasCertification: true,
    description: "Gestion opérationnelle, coût matière, formation d'équipe et optimisation du menu boissons.",
    imageInitials: "BB",
  },
  {
    id: 4,
    title: "Alternative Brewing Methods",
    provider: "Specialty Coffee Tunisia",
    rating: 4.6,
    reviewCount: 43,
    duration: "1 jour",
    priceInCents: 9500,
    level: "Advanced" as const,
    hasCertification: false,
    description: "V60, Chemex, AeroPress, Cold Brew : extraction optimale pour chaque méthode.",
    imageInitials: "SC",
  },
  {
    id: 5,
    title: "Barista Starter Pack",
    provider: "Caffè Pro Academy",
    rating: 4.5,
    reviewCount: 201,
    duration: "1 jour",
    priceInCents: 7500,
    level: "Beginner" as const,
    hasCertification: false,
    description: "Introduction au café, à l'équipement et aux bases du service en café pour les débutants complets.",
    imageInitials: "CP",
  },
  {
    id: 6,
    title: "SCA Certified Barista",
    provider: "SCA Tunisia Chapter",
    rating: 5.0,
    reviewCount: 38,
    duration: "5 jours",
    priceInCents: 75000,
    level: "Expert" as const,
    hasCertification: true,
    description: "Certification officielle SCA : formation intensive reconnue internationalement.",
    imageInitials: "SC",
  },
];

const TRAINING_LEVEL_COLORS: Record<string, string> = {
  Beginner: "bg-green-100 text-green-700",
  Advanced: "bg-blue-100 text-blue-700",
  Expert: "bg-purple-100 text-purple-700",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      <Star className="w-3 h-3 fill-amber-400" />
      <span className="text-[11px] font-semibold text-gray-700">{rating.toFixed(1)}</span>
    </span>
  );
}

// ── Training Card ─────────────────────────────────────────────────────────────

function TrainingCard({
  program,
  isDark,
}: {
  program: (typeof TRAINING_PROGRAMS)[0];
  isDark: boolean;
}) {
  const fmt = useFormatCurrency();
  const t = useTheme(isDark);
  const faved = useFavorites((s) => !!s.academy[program.id]);
  const toggleAcademy = useFavorites((s) => s.toggleAcademy);

  return (
    <div
      data-testid={`card-training-${program.id}`}
      className={`group rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col ${t.cardBg}`}
    >
      <div className="h-16 bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center relative">
        <button
          className="absolute top-2 left-2 w-6 h-6 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform z-10"
          onClick={(e) => {
            e.stopPropagation();
            toggleAcademy({
              id: program.id,
              title: program.title,
              provider: program.provider,
              duration: program.duration,
              rating: program.rating,
              price: program.priceInCents,
            });
          }}
          data-testid={`button-fav-academy-${program.id}`}
        >
          <Heart className={`w-3 h-3 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
        </button>
        <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-white" />
        </div>
        {program.hasCertification && (
          <div className="absolute top-2 right-2">
            <Badge className="bg-amber-400/90 text-amber-900 text-[10px] border-0 px-1.5 py-0 font-semibold">
              <Award className="w-2.5 h-2.5 mr-0.5 inline" />
              Certifié
            </Badge>
          </div>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-1">
          <h3 className="font-bold text-sm leading-tight line-clamp-2 group-hover:text-green-600 transition-colors">
            {program.title}
          </h3>
          <Badge className={`text-[10px] shrink-0 border-0 px-1.5 ${TRAINING_LEVEL_COLORS[program.level]}`}>
            {program.level}
          </Badge>
        </div>

        <p className={`text-xs font-medium ${t.textMuted}`}>{program.provider}</p>
        <p className={`text-xs line-clamp-2 ${t.textSubtle}`}>{program.description}</p>

        <div className={`flex items-center gap-3 text-[11px] ${t.textMuted}`}>
          <StarRating rating={program.rating} />
          <span>({program.reviewCount})</span>
          <span className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {program.duration}
          </span>
        </div>

        <div className={`mt-auto pt-2 border-t ${t.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-[10px] ${t.textSubtle}`}>Prix</p>
              <p className="font-bold text-sm text-green-600">
                {fmt(program.priceInCents)}
              </p>
            </div>
            <Button
              size="sm"
              className="h-7 text-[11px] bg-green-600 hover:bg-green-700 text-white rounded-lg px-3"
              data-testid={`button-enroll-${program.id}`}
            >
              S'inscrire
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BaristaAcademyPage({ comingSoon = false }: { comingSoon?: boolean }) {
  const accessLevel = useAccessLevel();
  const isDark = useThemeStore((s) => s.isDark);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const t = useTheme(isDark);

  const [trainingSearch, setTrainingSearch] = useState("");
  const [trainingLevel, setTrainingLevel] = useState("");
  const [trainingCert, setTrainingCert] = useState("");

  const filteredTraining = useMemo(() => {
    let list = TRAINING_PROGRAMS;
    if (trainingSearch.trim()) {
      const q = trainingSearch.toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.provider.toLowerCase().includes(q)
      );
    }
    if (trainingLevel) list = list.filter((p) => p.level === trainingLevel);
    if (trainingCert === "yes") list = list.filter((p) => p.hasCertification);
    if (trainingCert === "no") list = list.filter((p) => !p.hasCertification);
    return list;
  }, [trainingSearch, trainingLevel, trainingCert]);

  const hasTrainingFilters = !!(trainingSearch || trainingLevel || trainingCert);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.pageBg}`}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-5 pb-12 px-5 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80"
          style={{ backgroundImage: `url(${baristaHeroImg})` }}
        />
        <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-br from-gray-950/95 via-gray-900/95 to-green-950/90" : "bg-gradient-to-br from-green-600/90 via-green-700/85 to-emerald-700/90"}`} />
        <div className="relative">
          <div className="flex justify-end items-center gap-2 mb-9">
            <button onClick={toggleTheme} aria-label="Toggle theme" className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-amber-400" : "bg-white/20 hover:bg-white/30 text-white"}`}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
          <div className="max-w-3xl mx-auto text-center">
          <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-5 backdrop-blur-sm ${isDark ? "bg-gray-800/80 border border-gray-700" : "bg-white/20"}`}>
            <GraduationCap className={`w-8 h-8 ${isDark ? "text-amber-400" : "text-white"}`} />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
            BigBoss <span className={isDark ? "text-amber-400" : "text-amber-200"}>ACADEMY</span>
          </h1>
          <p className={`text-base mb-4 max-w-xl mx-auto ${isDark ? "text-gray-400" : "text-green-100"}`}>
            Formez votre équipe avec des programmes barista professionnels
          </p>
          <div className={`flex items-center justify-center gap-6 flex-wrap text-sm ${isDark ? "text-gray-400" : "text-green-100"}`}>
            <span className="flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4" />
              {TRAINING_PROGRAMS.length} formations
            </span>
            <span className="flex items-center gap-1.5">
              <Award className="w-4 h-4" />
              {TRAINING_PROGRAMS.filter((p) => p.hasCertification).length} certifications
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
      {accessLevel === "pending" && (
        <div className={`${isDark ? "bg-amber-950/40 border-amber-900/60" : "bg-amber-50 border-amber-200"} border-b px-4 py-3`}>
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-amber-800 text-sm font-medium">
            <CheckCircle className="w-4 h-4 shrink-0" />
            Votre compte est en attente d'approbation.
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        <section>
          {/* Training Filters */}
          <div className={`border rounded-2xl p-3 mb-5 shadow-sm ${t.cardBg}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <SlidersHorizontal className={`w-3.5 h-3.5 ${t.textSubtle} shrink-0`} />
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  value={trainingSearch}
                  onChange={(e) => setTrainingSearch(e.target.value)}
                  placeholder="Rechercher une formation..."
                  className={`h-7 text-xs pl-8 rounded-full ${t.inputBg}`}
                  data-testid="input-training-search"
                />
              </div>
              <Select
                value={trainingLevel || "__all__"}
                onValueChange={(v) => setTrainingLevel(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[120px] ${t.inputBg}`} data-testid="select-training-level">
                  <SelectValue placeholder="Niveau" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Tous niveaux</SelectItem>
                  <SelectItem value="Beginner">Débutant</SelectItem>
                  <SelectItem value="Advanced">Avancé</SelectItem>
                  <SelectItem value="Expert">Expert</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={trainingCert || "__all__"}
                onValueChange={(v) => setTrainingCert(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className={`h-7 text-xs rounded-full px-3 w-auto min-w-[130px] ${t.inputBg}`} data-testid="select-training-cert">
                  <SelectValue placeholder="Certification" />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  <SelectItem value="__all__">Toutes formations</SelectItem>
                  <SelectItem value="yes">Avec certification</SelectItem>
                  <SelectItem value="no">Sans certification</SelectItem>
                </SelectContent>
              </Select>
              {hasTrainingFilters && (
                <button
                  onClick={() => {
                    setTrainingSearch("");
                    setTrainingLevel("");
                    setTrainingCert("");
                  }}
                  className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
                  data-testid="button-reset-training-filters"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              )}
            </div>
          </div>

          {filteredTraining.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <GraduationCap className="w-12 h-12 text-gray-200" />
              <p className="font-semibold text-gray-700">Aucune formation trouvée</p>
              <p className="text-sm text-gray-400">Essayez d'ajuster vos filtres.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredTraining.map((program) => (
                <TrainingCard
                  key={program.id}
                  program={program}
                  isDark={isDark}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      </>
      )}
    </div>
  );
}
