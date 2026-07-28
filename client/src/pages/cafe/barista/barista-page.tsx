import { useState, useMemo } from "react";
import baristaHeroImg from "@assets/8d80708f-be87-4e8d-8805-f60e3c292914-1000x562.5-rjZKXkudAsN4bH_1780680229193.jpg";
import { Link, useSearch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  Lock,
  Award,
  MessageCircle,
  Search,
  SlidersHorizontal,
  RotateCcw,
  CheckCircle,
  GraduationCap,
  Users,
  CalendarDays,
  Heart,
} from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";

// ── Access helper (mirrors browse-products.tsx pattern) ──────────────────────

type AccessLevel = "visitor" | "pending" | "approved";

function useAccessLevel(): AccessLevel {
  const { user } = useAuth();
  if (!user) return "visitor";
  if (["SUPER_ADMIN", "ADMIN", "SUPPLIER"].includes(user.role)) return "approved";
  if (user.role === "CAFE_OWNER" && (user as any).status === "approved") return "approved";
  return "pending";
}

// ── Static Data ───────────────────────────────────────────────────────────────

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

const BARISTAS = [
  {
    id: 1,
    name: "Youssef Ben Ali",
    initials: "YB",
    level: "Expert",
    skills: ["Espresso", "Latte Art", "Brewing"],
    rating: 4.9,
    reviewCount: 64,
    location: "Tunis",
    dailyRateInCents: 18000,
    available: true,
    availableDays: ["Lun", "Mar", "Mer", "Jeu", "Ven"],
  },
  {
    id: 2,
    name: "Amira Khelifi",
    initials: "AK",
    level: "Advanced",
    skills: ["Latte Art", "Cold Brew", "Customer Service"],
    rating: 4.8,
    reviewCount: 41,
    location: "Sousse",
    dailyRateInCents: 14000,
    available: true,
    availableDays: ["Sam", "Dim"],
  },
  {
    id: 3,
    name: "Mehdi Trabelsi",
    initials: "MT",
    level: "Expert",
    skills: ["Espresso", "Roasting", "Training"],
    rating: 4.9,
    reviewCount: 89,
    location: "Tunis",
    dailyRateInCents: 22000,
    available: false,
    availableDays: [],
  },
  {
    id: 4,
    name: "Sarra Mansouri",
    initials: "SM",
    level: "Beginner",
    skills: ["Espresso", "Customer Service"],
    rating: 4.3,
    reviewCount: 17,
    location: "Sfax",
    dailyRateInCents: 8000,
    available: true,
    availableDays: ["Lun", "Mer", "Ven"],
  },
  {
    id: 5,
    name: "Karim Ouali",
    initials: "KO",
    level: "Advanced",
    skills: ["Latte Art", "Espresso", "Brewing"],
    rating: 4.7,
    reviewCount: 33,
    location: "Monastir",
    dailyRateInCents: 13000,
    available: true,
    availableDays: ["Mar", "Jeu", "Sam"],
  },
  {
    id: 6,
    name: "Ines Bouaziz",
    initials: "IB",
    level: "Expert",
    skills: ["Cold Brew", "Brewing", "Training", "Roasting"],
    rating: 5.0,
    reviewCount: 52,
    location: "Tunis",
    dailyRateInCents: 25000,
    available: false,
    availableDays: [],
  },
];

const LEVEL_COLORS: Record<string, string> = {
  Beginner: "bg-green-100 text-green-700",
  Advanced: "bg-blue-100 text-blue-700",
  Expert: "bg-purple-100 text-purple-700",
};

// ── Shared Price Lock UI ──────────────────────────────────────────────────────

function PriceLocked({ user }: { user: ReturnType<typeof useAuth>["user"] }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 text-[11px] text-blue-700 font-medium">
        <Lock className="w-3 h-3 shrink-0" />
        <span>
          {user ? "En attente d'approbation" : "Disponible pour les cafés approuvés"}
        </span>
      </div>
      {!user && (
        <Link href="/login">
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[11px] w-full border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-400 px-2"
            data-testid="button-login-price"
          >
            Connexion to view prices
          </Button>
        </Link>
      )}
    </div>
  );
}

// ── Star Rating ───────────────────────────────────────────────────────────────

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
  accessLevel,
  user,
}: {
  program: (typeof TRAINING_PROGRAMS)[0];
  accessLevel: AccessLevel;
  user: ReturnType<typeof useAuth>["user"];
}) {
  const hasAccess = accessLevel === "approved";
  const faved = useFavorites((s) => !!s.academy[program.id]);
  const toggleAcademy = useFavorites((s) => s.toggleAcademy);

  return (
    <div
      data-testid={`card-training-${program.id}`}
      className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col"
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
          <Badge className={`text-[10px] shrink-0 border-0 px-1.5 ${LEVEL_COLORS[program.level]}`}>
            {program.level}
          </Badge>
        </div>

        <p className="text-xs text-gray-500 font-medium">{program.provider}</p>
        <p className="text-xs text-gray-400 line-clamp-2">{program.description}</p>

        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <StarRating rating={program.rating} />
          <span>({program.reviewCount})</span>
          <span className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {program.duration}
          </span>
        </div>

        <div className="mt-auto pt-2 border-t border-gray-50">
          {hasAccess ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-400">Prix</p>
                <p className="font-bold text-sm text-green-600">
                  {(program.priceInCents / 100).toFixed(0)} TND
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
          ) : (
            <PriceLocked user={user} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Barista Profile Card ──────────────────────────────────────────────────────

function BaristaCard({
  barista,
  accessLevel,
  user,
}: {
  barista: (typeof BARISTAS)[0];
  accessLevel: AccessLevel;
  user: ReturnType<typeof useAuth>["user"];
}) {
  const hasAccess = accessLevel === "approved";
  const faved = useFavorites((s) => !!s.baristaMarket[barista.id]);
  const toggleBaristaMarket = useFavorites((s) => s.toggleBaristaMarket);

  return (
    <div
      data-testid={`card-barista-${barista.id}`}
      className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col"
    >
      <button
        className="absolute top-2 right-2 z-10 w-6 h-6 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
        onClick={(e) => {
          e.stopPropagation();
          toggleBaristaMarket({
            id: barista.id,
            name: barista.name,
            initials: barista.initials,
            skills: barista.skills,
            location: barista.location,
            rating: barista.rating,
            available: barista.available,
          });
        }}
        data-testid={`button-fav-barista-${barista.id}`}
      >
        <Heart className={`w-3 h-3 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
      </button>
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <Avatar className="w-10 h-10 shrink-0">
            <AvatarFallback className="bg-green-100 text-green-700 font-bold text-sm">
              {barista.initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <h3 className="font-bold text-sm leading-tight truncate group-hover:text-green-600 transition-colors">
                {barista.name}
              </h3>
              <span
                className={`w-2 h-2 rounded-full shrink-0 mr-5 ${barista.available ? "bg-green-500" : "bg-gray-300"}`}
                title={barista.available ? "Disponible" : "Indisponible"}
              />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge
                className={`text-[10px] border-0 px-1.5 ${LEVEL_COLORS[barista.level]}`}
              >
                {barista.level}
              </Badge>
              <span className="flex items-center gap-0.5 text-[11px] text-gray-400">
                <MapPin className="w-2.5 h-2.5" />
                {barista.location}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StarRating rating={barista.rating} />
          <span className="text-[11px] text-gray-400">({barista.reviewCount} avis)</span>
        </div>

        <div className="flex flex-wrap gap-1">
          {barista.skills.map((skill) => (
            <span
              key={skill}
              className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium"
            >
              {skill}
            </span>
          ))}
        </div>

        {barista.availableDays.length > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <CalendarDays className="w-3 h-3 shrink-0" />
            <span>{barista.availableDays.join(" · ")}</span>
          </div>
        )}

        <div className="mt-auto pt-2 border-t border-gray-50">
          {hasAccess ? (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] text-gray-400">Tarif / jour</p>
                <p className="font-bold text-sm text-green-600">
                  {(barista.dailyRateInCents / 100).toFixed(0)} TND
                </p>
              </div>
              <div className="flex gap-1.5">
                <Link href="/cafe/messages">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg px-2"
                    data-testid={`button-chat-barista-${barista.id}`}
                  >
                    <MessageCircle className="w-3 h-3" />
                  </Button>
                </Link>
                <Button
                  size="sm"
                  className="h-7 text-[11px] bg-green-600 hover:bg-green-700 text-white rounded-lg px-3"
                  data-testid={`button-hire-barista-${barista.id}`}
                  disabled={!barista.available}
                >
                  {barista.available ? "Recruter" : "Indisponible"}
                </Button>
              </div>
            </div>
          ) : (
            <PriceLocked user={user} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BaristaPage({ comingSoon = false }: { comingSoon?: boolean }) {
  const { user } = useAuth();
  const accessLevel = useAccessLevel();

  // Active tab — readable from ?tab= URL param
  const searchStr = useSearch();
  const tabParam = new URLSearchParams(searchStr).get("tab");
  const [activeTab, setActiveTab] = useState<"academy" | "marketplace">(
    tabParam === "marketplace" ? "marketplace" : "academy"
  );

  // Training filters
  const [trainingSearch, setTrainingSearch] = useState("");
  const [trainingLevel, setTrainingLevel] = useState("");
  const [trainingCert, setTrainingCert] = useState("");

  // Hiring filters
  const [baristaSearch, setBaristaSearch] = useState("");
  const [baristaLevel, setBaristaLevel] = useState("");
  const [baristaAvailability, setBaristaAvailability] = useState("");
  const [baristaSkill, setBaristaSkill] = useState("");
  const [baristaLocation, setBaristaLocation] = useState("");

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

  const filteredBaristas = useMemo(() => {
    let list = BARISTAS;
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
    baristaSearch,
    baristaLevel,
    baristaAvailability,
    baristaSkill,
    baristaLocation,
  ]);

  const allSkills = useMemo(
    () => Array.from(new Set(BARISTAS.flatMap((b) => b.skills))).sort(),
    []
  );
  const allLocations = useMemo(
    () => Array.from(new Set(BARISTAS.map((b) => b.location))).sort(),
    []
  );

  const hasTrainingFilters = !!(trainingSearch || trainingLevel || trainingCert);
  const hasBaristaFilters = !!(
    baristaSearch ||
    baristaLevel ||
    baristaAvailability ||
    baristaSkill ||
    baristaLocation
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-12 pb-16 px-4 overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${baristaHeroImg})` }}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-green-900/85 via-green-800/80 to-emerald-900/85" />
        {/* Content */}
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
            <Coffee className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
            BigBoss <span className="text-green-200">BARISTA</span>
          </h1>
          <p className="text-green-100 text-lg mb-6 max-w-xl mx-auto">
            Trouvez, réservez et formez des baristas professionnels pour votre établissement
          </p>
          <div className="flex items-center justify-center gap-6 flex-wrap text-green-100 text-sm">
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {BARISTAS.length} baristas disponibles
            </span>
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
      </section>

      {comingSoon ? (
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Clock className="w-8 h-8 text-green-600" />
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
      {/* ── Pending notice ──────────────────────────────────────────────── */}
      {accessLevel === "pending" && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-amber-800 text-sm font-medium">
            <CheckCircle className="w-4 h-4 shrink-0" />
            Votre compte est en attente d'approbation. Vous pourrez accéder aux tarifs et réservations une fois approuvé.
          </div>
        </div>
      )}

      {/* ── Tab Switcher ────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 sticky top-14 z-30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex">
            <button
              onClick={() => setActiveTab("academy")}
              data-testid="tab-academy"
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === "academy" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              <GraduationCap className="w-4 h-4" />
              Barista Academy
            </button>
            <button
              onClick={() => setActiveTab("marketplace")}
              data-testid="tab-marketplace"
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === "marketplace" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              <Users className="w-4 h-4" />
              Marketplace Baristas
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* ── TAB 1: Training ─────────────────────────────────────────────── */}
        {activeTab === "academy" && (
        <section>
          {/* Training Filters */}
          <div className="bg-white border border-gray-100 rounded-2xl p-3 mb-5 shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  value={trainingSearch}
                  onChange={(e) => setTrainingSearch(e.target.value)}
                  placeholder="Rechercher une formation..."
                  className="h-7 text-xs pl-8 border-gray-200 bg-gray-50 rounded-full"
                  data-testid="input-training-search"
                />
              </div>
              <Select
                value={trainingLevel || "__all__"}
                onValueChange={(v) => setTrainingLevel(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[120px]" data-testid="select-training-level">
                  <SelectValue placeholder="Niveau" />
                </SelectTrigger>
                <SelectContent>
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
                <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[130px]" data-testid="select-training-cert">
                  <SelectValue placeholder="Certification" />
                </SelectTrigger>
                <SelectContent>
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
                  accessLevel={accessLevel}
                  user={user}
                />
              ))}
            </div>
          )}
        </section>
        )}

        {/* ── TAB 2: Marketplace Baristas ─────────────────────────────────── */}
        {activeTab === "marketplace" && (
        <section>
          {/* Hiring Filters */}
          <div className="bg-white border border-gray-100 rounded-2xl p-3 mb-5 shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  value={baristaSearch}
                  onChange={(e) => setBaristaSearch(e.target.value)}
                  placeholder="Nom ou compétence..."
                  className="h-7 text-xs pl-8 border-gray-200 bg-gray-50 rounded-full"
                  data-testid="input-barista-search"
                />
              </div>
              <Select
                value={baristaLevel || "__all__"}
                onValueChange={(v) => setBaristaLevel(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[120px]" data-testid="select-barista-level">
                  <SelectValue placeholder="Niveau" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous niveaux</SelectItem>
                  <SelectItem value="Beginner">Débutant</SelectItem>
                  <SelectItem value="Advanced">Avancé</SelectItem>
                  <SelectItem value="Expert">Expert</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={baristaAvailability || "__all__"}
                onValueChange={(v) => setBaristaAvailability(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[130px]" data-testid="select-barista-availability">
                  <SelectValue placeholder="Disponibilité" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Toutes disponibilités</SelectItem>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="unavailable">Indisponible</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={baristaSkill || "__all__"}
                onValueChange={(v) => setBaristaSkill(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[120px]" data-testid="select-barista-skill">
                  <SelectValue placeholder="Compétence" />
                </SelectTrigger>
                <SelectContent>
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
                <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[110px]" data-testid="select-barista-location">
                  <SelectValue placeholder="Ville" />
                </SelectTrigger>
                <SelectContent>
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

          {filteredBaristas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Users className="w-12 h-12 text-gray-200" />
              <p className="font-semibold text-gray-700">Aucun barista trouvé</p>
              <p className="text-sm text-gray-400">Essayez d'ajuster vos filtres.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredBaristas.map((barista) => (
                <BaristaCard
                  key={barista.id}
                  barista={barista}
                  accessLevel={accessLevel}
                  user={user}
                />
              ))}
            </div>
          )}
        </section>
        )}
      </div>
      </>
      )}
    </div>
  );
}
