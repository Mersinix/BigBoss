import { useState, useMemo } from "react";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  Wrench,
  Search,
  MapPin,
  Star,
  Lock,
  MessageCircle,
  SlidersHorizontal,
  RotateCcw,
  X,
  Heart,
  Clock,
  Calendar,
  Shield,
  Zap,
  Phone,
  Award,
  Users,
  Building2,
  User,
} from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";

// ── Access helper ─────────────────────────────────────────────────────────────

type AccessLevel = "visitor" | "pending" | "approved";

function useAccessLevel(): AccessLevel {
  const { user } = useAuth();
  if (!user) return "visitor";
  if (["SUPER_ADMIN", "ADMIN", "SUPPLIER"].includes(user.role)) return "approved";
  if (user.role === "CAFE_OWNER" && (user as any).status === "approved") return "approved";
  return "pending";
}

// ── Static Data ───────────────────────────────────────────────────────────────

const MAINTENANCE_CATEGORIES = [
  { id: "machines",     icon: "⚙️",  label: "Machines" },
  { id: "infra",        icon: "🔌",  label: "Infrastructure" },
  { id: "digital",      icon: "💻",  label: "Digital & IT" },
  { id: "furniture",    icon: "🪑",  label: "Mobilier & Design" },
  { id: "plumbing",     icon: "🚿",  label: "Plomberie" },
  { id: "electricity",  icon: "⚡",  label: "Électricité" },
  { id: "ac",           icon: "❄️",  label: "Climatisation" },
  { id: "carpentry",    icon: "🪵",  label: "Menuiserie" },
];

const AGENTS = [
  {
    id: 1,
    name: "Mohamed Gharbi",
    initials: "MG",
    jobTitle: "Technicien en machines café",
    type: "Freelance" as const,
    specialty: "Machines",
    categories: ["Machines", "Infrastructure"],
    skills: ["Espresso Machines", "Coffee Grinders", "Refrigerators"],
    rating: 4.9,
    reviewCount: 87,
    location: "Tunis",
    yearsExperience: 8,
    responseTime: "< 2h",
    available: true,
    certifications: ["DeLonghi Certified", "Jura Certified"],
    dailyRateInCents: 20000,
    description: "Spécialiste en réparation et maintenance de machines à café professionnelles. Intervention rapide à Tunis et environs.",
    portfolioImages: [
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&q=80",
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=300&q=80",
    ],
    phone: "+216 71 234 001",
    coverageArea: "Grand Tunis",
    workingHours: "Lun–Sam, 8h–18h",
  },
  {
    id: 2,
    name: "TechPro Services",
    initials: "TP",
    jobTitle: "Agence de maintenance multi-services",
    type: "Agency" as const,
    specialty: "Digital & IT",
    categories: ["Digital & IT", "Infrastructure"],
    skills: ["POS Systems", "Networking", "Security Cameras", "Wi-Fi"],
    rating: 4.8,
    reviewCount: 156,
    location: "Sousse",
    yearsExperience: 12,
    responseTime: "< 4h",
    available: true,
    certifications: ["Cisco Certified", "HP Partner"],
    dailyRateInCents: 35000,
    description: "Agence spécialisée en solutions digitales et infrastructure IT pour cafés et restaurants. Réseau, sécurité, caisse et bien plus.",
    portfolioImages: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&q=80",
      "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=300&q=80",
    ],
    phone: "+216 73 456 002",
    coverageArea: "Sahel (Sousse, Monastir, Mahdia)",
    workingHours: "Lun–Ven, 8h–17h",
  },
  {
    id: 3,
    name: "Karim Ferjani",
    initials: "KF",
    jobTitle: "Électricien & Plombier certifié",
    type: "Freelance" as const,
    specialty: "Infrastructure",
    categories: ["Électricité", "Plomberie", "Infrastructure"],
    skills: ["Electricity", "Plumbing", "Air Conditioning"],
    rating: 4.7,
    reviewCount: 63,
    location: "Sfax",
    yearsExperience: 15,
    responseTime: "< 1h",
    available: true,
    certifications: ["BTP Certified"],
    dailyRateInCents: 15000,
    description: "Électricien et plombier polyvalent avec 15 ans d'expérience dans les établissements de restauration. Disponible 7j/7 pour urgences.",
    portfolioImages: [
      "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=300&q=80",
    ],
    phone: "+216 74 567 003",
    coverageArea: "Sfax et région",
    workingHours: "7j/7, 7h–20h",
  },
  {
    id: 4,
    name: "Design & Wood Studio",
    initials: "DW",
    jobTitle: "Menuiserie & aménagement café",
    type: "Company" as const,
    specialty: "Mobilier & Design",
    categories: ["Mobilier & Design", "Menuiserie"],
    skills: ["Furniture", "Carpentry", "Lighting", "Signage"],
    rating: 4.9,
    reviewCount: 42,
    location: "Tunis",
    yearsExperience: 7,
    responseTime: "< 24h",
    available: false,
    certifications: [],
    dailyRateInCents: 45000,
    description: "Studio spécialisé en aménagement de cafés et restaurants. Conception et réalisation de mobilier sur mesure, éclairage et signalétique.",
    portfolioImages: [
      "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=300&q=80",
      "https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=300&q=80",
    ],
    phone: "+216 71 789 004",
    coverageArea: "Tunis, Ariana, La Marsa",
    workingHours: "Lun–Ven, 9h–18h",
  },
  {
    id: 5,
    name: "Amine Belhadj",
    initials: "AB",
    jobTitle: "Technicien climatisation & ventilation",
    type: "Freelance" as const,
    specialty: "Climatisation",
    categories: ["Climatisation", "Infrastructure"],
    skills: ["Air Conditioning", "Ventilation", "Refrigerators"],
    rating: 4.6,
    reviewCount: 38,
    location: "Monastir",
    yearsExperience: 10,
    responseTime: "< 3h",
    available: true,
    certifications: ["Daikin Certified"],
    dailyRateInCents: 18000,
    description: "Expert en installation et maintenance de systèmes de climatisation et réfrigération pour les établissements professionnels.",
    portfolioImages: [],
    phone: "+216 73 890 005",
    coverageArea: "Monastir, Sousse, Mahdia",
    workingHours: "Lun–Sam, 8h–19h",
  },
  {
    id: 6,
    name: "CleanTech Maintenance",
    initials: "CT",
    jobTitle: "Maintenance globale & nettoyage industriel",
    type: "Company" as const,
    specialty: "Machines",
    categories: ["Machines", "Infrastructure", "Plomberie"],
    skills: ["Dishwashers", "Ovens", "Blenders", "Ice Machines"],
    rating: 4.8,
    reviewCount: 201,
    location: "Tunis",
    yearsExperience: 9,
    responseTime: "< 2h",
    available: true,
    certifications: ["ISO 9001"],
    dailyRateInCents: 28000,
    description: "Société de maintenance multi-services spécialisée dans les équipements de cuisine et café professionnels. Contrats annuels disponibles.",
    portfolioImages: [
      "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=300&q=80",
    ],
    phone: "+216 71 012 006",
    coverageArea: "Grand Tunis et Nord",
    workingHours: "24h/24, 7j/7",
  },
];

const TYPE_COLORS: Record<string, string> = {
  Freelance: "bg-blue-100 text-blue-700",
  Company:   "bg-purple-100 text-purple-700",
  Agency:    "bg-orange-100 text-orange-700",
};

const TYPE_ICONS: Record<string, any> = {
  Freelance: User,
  Company:   Building2,
  Agency:    Users,
};



// ── Star Rating ───────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      <Star className="w-3 h-3 fill-amber-400" />
      <span className="text-[11px] font-semibold text-gray-700">{rating.toFixed(1)}</span>
    </span>
  );
}

// ── Agent Card ────────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  accessLevel,
  user,
  onOpenDetail,
}: {
  agent: (typeof AGENTS)[0];
  accessLevel: AccessLevel;
  user: ReturnType<typeof useAuth>["user"];
  onOpenDetail: (agent: (typeof AGENTS)[0]) => void;
}) {
  const fmt = useFormatCurrency();
  const faved = useFavorites((s) => !!s.maintenance[agent.id]);
  const toggleMaintenance = useFavorites((s) => s.toggleMaintenance);
  const TypeIcon = TYPE_ICONS[agent.type] ?? User;

  return (
    <div
      data-testid={`card-maintenance-${agent.id}`}
      className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col cursor-pointer"
      onClick={() => onOpenDetail(agent)}
    >
      {/* Favorite button */}
      <button
        className="absolute top-2 right-2 z-10 w-6 h-6 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
        onClick={(e) => {
          e.stopPropagation();
          toggleMaintenance({
            id: agent.id,
            name: agent.name,
            initials: agent.initials,
            specialty: agent.specialty,
            categories: agent.categories,
            location: agent.location,
            rating: agent.rating,
            available: agent.available,
          });
        }}
        data-testid={`button-fav-maintenance-${agent.id}`}
      >
        <Heart className={`w-3 h-3 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
      </button>

      {/* Top gradient bar */}
      <div className="h-2 bg-gradient-to-r from-orange-500 to-amber-500" />

      <div className="p-3 flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Avatar className="w-10 h-10 shrink-0">
            <AvatarFallback className="bg-orange-100 text-orange-700 font-bold text-sm">
              {agent.initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center justify-between gap-1">
              <h3 className="font-bold text-sm leading-tight truncate group-hover:text-orange-600 transition-colors">
                {agent.name}
              </h3>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${agent.available ? "bg-green-500" : "bg-gray-300"}`}
                title={agent.available ? "Disponible" : "Indisponible"}
              />
            </div>
            <p className="text-[11px] text-gray-500 truncate">{agent.jobTitle}</p>
          </div>
        </div>

        {/* Type + Location */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`text-[10px] border-0 px-1.5 flex items-center gap-0.5 ${TYPE_COLORS[agent.type]}`}>
            <TypeIcon className="w-2.5 h-2.5" />
            {agent.type}
          </Badge>
          <span className="flex items-center gap-0.5 text-[11px] text-gray-400">
            <MapPin className="w-2.5 h-2.5" />
            {agent.location}
          </span>
          <span className="flex items-center gap-0.5 text-[11px] text-gray-400">
            <Zap className="w-2.5 h-2.5" />
            {agent.responseTime}
          </span>
        </div>

        {/* Rating + Experience */}
        <div className="flex items-center gap-2">
          <StarRating rating={agent.rating} />
          <span className="text-[11px] text-gray-400">({agent.reviewCount} avis)</span>
          <span className="text-[11px] text-gray-400">· {agent.yearsExperience} ans exp.</span>
        </div>

        {/* Skills */}
        <div className="flex flex-wrap gap-1">
          {agent.skills.slice(0, 3).map((skill) => (
            <span key={skill} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">
              {skill}
            </span>
          ))}
        </div>

        {/* Certifications */}
        {agent.certifications.length > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-amber-600">
            <Award className="w-2.5 h-2.5" />
            {agent.certifications[0]}{agent.certifications.length > 1 ? ` +${agent.certifications.length - 1}` : ""}
          </div>
        )}

        {/* CTA */}
        <div className="mt-auto pt-2 border-t border-gray-50">
          
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] text-gray-400">Tarif / jour</p>
                <p className="font-bold text-sm text-orange-600">
                  {fmt(agent.dailyRateInCents)}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Link href="/cafe/messages">
                  <Button size="sm" variant="outline"
                    className="h-7 text-[11px] border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg px-2"
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`button-chat-maintenance-${agent.id}`}>
                    <MessageCircle className="w-3 h-3" />
                  </Button>
                </Link>
                <Button size="sm"
                  className="h-7 text-[11px] bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-3"
                  data-testid={`button-book-maintenance-${agent.id}`}
                  disabled={!agent.available}
                  onClick={(e) => { e.stopPropagation(); onOpenDetail(agent); }}>
                  {agent.available ? "Réserver" : "Indisponible"}
                </Button>
              </div>
            </div>
         
        </div>
      </div>
    </div>
  );
}

// ── Agent Detail Modal ────────────────────────────────────────────────────────

function AgentDetailModal({
  agent,
  open,
  onClose,
  accessLevel,
  user,
}: {
  agent: (typeof AGENTS)[0] | null;
  open: boolean;
  onClose: () => void;
  accessLevel: AccessLevel;
  user: ReturnType<typeof useAuth>["user"];
}) {
  const hasAccess = accessLevel === "approved";
  const fmt = useFormatCurrency();
  const faved = useFavorites((s) => agent ? !!s.maintenance[agent.id] : false);
  const toggleMaintenance = useFavorites((s) => s.toggleMaintenance);

  if (!agent) return null;
  const TypeIcon = TYPE_ICONS[agent.type] ?? User;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-2xl border-0 shadow-2xl [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Profil Technicien Maintenance</DialogTitle></VisuallyHidden>
        <div className="bg-white">
          {/* Hero bar */}
          <div className="h-3 bg-gradient-to-r from-orange-500 to-amber-500" />
          <div className="p-5">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <Avatar className="w-14 h-14 shrink-0">
                  <AvatarFallback className="bg-orange-100 text-orange-700 font-bold text-lg">
                    {agent.initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="font-bold text-lg leading-tight">{agent.name}</h2>
                  <p className="text-sm text-gray-500">{agent.jobTitle}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={`text-[10px] border-0 px-1.5 flex items-center gap-0.5 ${TYPE_COLORS[agent.type]}`}>
                      <TypeIcon className="w-2.5 h-2.5" />{agent.type}
                    </Badge>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${agent.available ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {agent.available ? "✓ Disponible" : "Indisponible"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleMaintenance({
                    id: agent.id, name: agent.name, initials: agent.initials,
                    specialty: agent.specialty, categories: agent.categories,
                    location: agent.location, rating: agent.rating, available: agent.available,
                  })}
                  className="w-9 h-9 rounded-full bg-gray-100 hover:bg-rose-50 flex items-center justify-center transition-colors">
                  <Heart className={`w-4 h-4 ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
                </button>
                <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { icon: Star, val: agent.rating.toFixed(1), label: `${agent.reviewCount} avis`, color: "text-amber-500" },
                { icon: Shield, val: `${agent.yearsExperience} ans`, label: "Expérience", color: "text-blue-500" },
                { icon: Zap, val: agent.responseTime, label: "Réponse", color: "text-green-500" },
              ].map((stat) => (
                <div key={stat.label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <stat.icon className={`w-4 h-4 mx-auto mb-1 ${stat.color}`} />
                  <p className="font-bold text-sm">{stat.val}</p>
                  <p className="text-[10px] text-gray-400">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Description */}
            <div className="mb-4">
              <h3 className="font-semibold text-sm mb-1.5">À propos</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{agent.description}</p>
            </div>

            {/* Categories & Skills */}
            <div className="mb-4">
              <h3 className="font-semibold text-sm mb-1.5">Catégories & Compétences</h3>
              <div className="flex flex-wrap gap-1.5">
                {agent.categories.map((cat) => (
                  <span key={cat} className="text-[11px] bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">{cat}</span>
                ))}
                {agent.skills.map((skill) => (
                  <span key={skill} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{skill}</span>
                ))}
              </div>
            </div>

            {/* Certifications */}
            {agent.certifications.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-sm mb-1.5 flex items-center gap-1"><Award className="w-3.5 h-3.5 text-amber-500" /> Certifications</h3>
                <div className="flex flex-wrap gap-1.5">
                  {agent.certifications.map((cert) => (
                    <span key={cert} className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">{cert}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Infos pratiques */}
            <div className="mb-4 bg-gray-50 rounded-xl p-3 space-y-2">
              <h3 className="font-semibold text-sm mb-2">Infos pratiques</h3>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                <span>Zone d'intervention : {agent.coverageArea}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                <span>Horaires : {agent.workingHours}</span>
              </div>
              {hasAccess && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  <span>{agent.phone}</span>
                </div>
              )}
            </div>

            {/* Portfolio images */}
            {agent.portfolioImages.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-sm mb-1.5">Portfolio</h3>
                <div className="grid grid-cols-2 gap-2">
                  {agent.portfolioImages.map((img, i) => (
                    <img key={i} src={img} alt={`Portfolio ${i + 1}`} className="w-full h-28 object-cover rounded-xl" />
                  ))}
                </div>
              </div>
            )}

            {/* Pricing & CTA */}
            <div className="border-t border-gray-100 pt-4">
             
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-400">Tarif journalier</p>
                    <p className="font-bold text-xl text-orange-600">
                      {fmt(agent.dailyRateInCents)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link href="/cafe/messages">
                      <Button variant="outline" className="border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl px-4">
                        <MessageCircle className="w-4 h-4 mr-1.5" /> Contacter
                      </Button>
                    </Link>
                    <Button
                      className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl px-5"
                      disabled={!agent.available}
                      data-testid={`button-book-detail-${agent.id}`}>
                      <Calendar className="w-4 h-4 mr-1.5" />
                      {agent.available ? "Réserver" : "Indisponible"}
                    </Button>
                  </div>
                </div>
             
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MaintenancePage({ comingSoon = false }: { comingSoon?: boolean }) {
  const { user } = useAuth();
  const accessLevel = useAccessLevel();

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterAvailability, setFilterAvailability] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<(typeof AGENTS)[0] | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const allLocations = useMemo(() => Array.from(new Set(AGENTS.map((a) => a.location))).sort(), []);

  const filtered = useMemo(() => {
    let list = AGENTS;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.jobTitle.toLowerCase().includes(q) ||
          a.skills.some((s) => s.toLowerCase().includes(q)) ||
          a.categories.some((c) => c.toLowerCase().includes(q))
      );
    }
    if (filterCategory) list = list.filter((a) => a.categories.some((c) => c.toLowerCase().includes(filterCategory.toLowerCase())));
    if (filterType) list = list.filter((a) => a.type === filterType);
    if (filterAvailability === "available") list = list.filter((a) => a.available);
    if (filterAvailability === "unavailable") list = list.filter((a) => !a.available);
    if (filterLocation) list = list.filter((a) => a.location === filterLocation);
    return list;
  }, [search, filterCategory, filterType, filterAvailability, filterLocation]);

  const hasFilters = !!(search || filterCategory || filterType || filterAvailability || filterLocation);

  const handleOpenDetail = (agent: (typeof AGENTS)[0]) => {
    setSelectedAgent(agent);
    setDetailOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Hero ── */}
      <section className="relative pt-12 pb-16 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-900/90 via-orange-800/85 to-amber-900/90" />
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
            <Wrench className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
            BigBoss <span className="text-orange-200">MAINTENANCE</span>
          </h1>
          <p className="text-orange-100 text-lg mb-6 max-w-xl mx-auto">
            Trouvez des techniciens certifiés pour la maintenance et réparation de vos équipements de café
          </p>
          <div className="flex items-center justify-center gap-6 flex-wrap text-orange-100 text-sm">
            <span className="flex items-center gap-1.5"><Users className="w-4 h-4" />{AGENTS.length} techniciens disponibles</span>
            <span className="flex items-center gap-1.5"><Shield className="w-4 h-4" />{AGENTS.filter(a => a.certifications.length > 0).length} certifiés</span>
            <span className="flex items-center gap-1.5"><Zap className="w-4 h-4" />Intervention rapide</span>
          </div>
        </div>
      </section>

      {comingSoon ? (
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Clock className="w-8 h-8 text-orange-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2" data-testid="text-coming-soon-title">Bientôt disponible</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">Ce service est en cours de préparation. Revenez bientôt pour le découvrir.</p>
        </div>
      ) : (
        <>

          {/* Category quick-filter row */}
          <div className="bg-white border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 py-3">
              <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                <button
                  onClick={() => setFilterCategory("")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all border ${
                    !filterCategory
                      ? "bg-orange-600 text-white border-orange-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-orange-300"
                  }`}>
                  Tous
                </button>
                {MAINTENANCE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setFilterCategory(filterCategory === cat.label ? "" : cat.label)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all border ${
                      filterCategory === cat.label
                        ? "bg-orange-600 text-white border-orange-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-orange-300"
                    }`}>
                    <span>{cat.icon}</span>{cat.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Filter bar */}
            <div className="bg-white border border-gray-100 rounded-2xl p-3 mb-5 shadow-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nom, compétence, service..."
                    className="h-7 text-xs pl-8 border-gray-200 bg-gray-50 rounded-full"
                    data-testid="input-maintenance-search"
                  />
                </div>
                <Select value={filterType || "__all__"} onValueChange={(v) => setFilterType(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[120px]" data-testid="select-maintenance-type">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tous types</SelectItem>
                    <SelectItem value="Freelance">Freelance</SelectItem>
                    <SelectItem value="Company">Entreprise</SelectItem>
                    <SelectItem value="Agency">Agence</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterAvailability || "__all__"} onValueChange={(v) => setFilterAvailability(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[130px]" data-testid="select-maintenance-availability">
                    <SelectValue placeholder="Disponibilité" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Toutes disponibilités</SelectItem>
                    <SelectItem value="available">Disponible</SelectItem>
                    <SelectItem value="unavailable">Indisponible</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterLocation || "__all__"} onValueChange={(v) => setFilterLocation(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[110px]" data-testid="select-maintenance-location">
                    <SelectValue placeholder="Ville" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Toutes villes</SelectItem>
                    {allLocations.map((loc) => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasFilters && (
                  <button
                    onClick={() => { setSearch(""); setFilterCategory(""); setFilterType(""); setFilterAvailability(""); setFilterLocation(""); }}
                    className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
                    data-testid="button-reset-maintenance-filters">
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                )}
              </div>
            </div>

            {/* Results */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Wrench className="w-12 h-12 text-gray-200" />
                <p className="font-semibold text-gray-700">Aucun technicien trouvé</p>
                <p className="text-sm text-gray-400">Essayez d'ajuster vos filtres.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filtered.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    accessLevel={accessLevel}
                    user={user}
                    onOpenDetail={handleOpenDetail}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Agent Detail Modal */}
          <AgentDetailModal
            agent={selectedAgent}
            open={detailOpen}
            onClose={() => setDetailOpen(false)}
            accessLevel={accessLevel}
            user={user}
          />
        </>
      )}
    </div>
  );
}
