import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ShoppingBag, Printer, Coffee, Megaphone, Search, MapPin,
  ChevronDown, User, Instagram, Facebook, Twitter, Mail,
  Phone, ArrowRight, CheckCircle, Building2, Truck, GraduationCap, Users, X
} from "lucide-react";
import { Link, Redirect } from "wouter";
import type { CategoryWithCount } from "@shared/schema";
import { PRINT_CATEGORIES } from "@/data/print-data";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";

const LS_KEY = "bigboss_location";

function readStoredLocation(): { address: string; lat: string; lng: string; placeId: string } | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function formatLocationLabel(address: string): string {
  const parts = address.split(",");
  return parts[0]?.trim() ?? address;
}

const SERVICES = [
  { id: "shop", label: "SHOP", icon: ShoppingBag, href: "/products", color: "bg-amber-100 text-amber-700", active: true },
  { id: "print", label: "PRINT", icon: Printer, href: "/print", color: "bg-blue-100 text-blue-700", active: true },
  { id: "barista", label: "BARISTA", icon: Coffee, href: "/barista", color: "bg-green-100 text-green-700", active: true },
  { id: "marketing", label: "MARKETING", icon: Megaphone, href: "/marketing", color: "bg-purple-100 text-purple-700", active: true },
];

const MARKETING_SERVICES = [
  { id: "website", icon: "🌐", label: "Création de site web" },
  { id: "seo",     icon: "🔍", label: "Référencement SEO" },
  { id: "ads",     icon: "📢", label: "Publicités" },
  { id: "social",  icon: "📱", label: "Réseaux sociaux" },
  { id: "video",   icon: "🎥", label: "Production vidéo" },
  { id: "photo",   icon: "📸", label: "Photographie" },
  { id: "branding",icon: "🎨", label: "Branding" },
];

// ── Role cards for connexion modal ────────────────────────────────────────────

const ROLE_CARDS = [
  {
    id: "CAFE_OWNER",
    label: "Café",
    desc: "Commandez vos produits auprès de fournisseurs vérifiés.",
    icon: Coffee,
    bg: "bg-amber-50",
    border: "border-amber-200",
    iconBg: "bg-amber-500",
    hover: "hover:border-amber-400",
  },
  {
    id: "SUPPLIER",
    label: "Fournisseur",
    desc: "Proposez vos produits à des centaines de cafés.",
    icon: Building2,
    bg: "bg-blue-50",
    border: "border-blue-200",
    iconBg: "bg-blue-500",
    hover: "hover:border-blue-400",
  },
  {
    id: "DELIVERY_COMPANY",
    label: "Livraison",
    desc: "Gérez vos routes et vos livraisons facilement.",
    icon: Truck,
    bg: "bg-green-50",
    border: "border-green-200",
    iconBg: "bg-green-500",
    hover: "hover:border-green-400",
  },
  {
    id: "PRINTER",
    label: "Imprimerie",
    desc: "Offrez vos services d'impression aux cafés.",
    icon: Printer,
    bg: "bg-orange-50",
    border: "border-orange-200",
    iconBg: "bg-orange-500",
    hover: "hover:border-orange-400",
  },
  {
    id: "MARKETING",
    label: "Marketing",
    desc: "Proposez vos services marketing aux professionnels.",
    icon: Megaphone,
    bg: "bg-purple-50",
    border: "border-purple-200",
    iconBg: "bg-purple-500",
    hover: "hover:border-purple-400",
  },
  {
    id: "BARISTA_ACADEMY",
    label: "Barista Academy",
    desc: "Proposez des formations barista professionnelles.",
    icon: GraduationCap,
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    iconBg: "bg-emerald-500",
    hover: "hover:border-emerald-400",
  },
  {
    id: "BARISTA_MARKETPLACE",
    label: "Marketplace Barista",
    desc: "Mettez en valeur vos services de barista.",
    icon: Users,
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    iconBg: "bg-indigo-500",
    hover: "hover:border-indigo-400",
  },
];

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [storedLocation, setStoredLocation] = useState(readStoredLocation);
  const [search, setSearch] = useState("");
  const [roleModalOpen, setRoleModalOpen] = useState(false);

  const locationLabel = storedLocation?.address
    ? formatLocationLabel(storedLocation.address)
    : "Tunis";

  const { data: categories = [] } = useQuery<CategoryWithCount[]>({
    queryKey: ["/api/categories"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user && (user.role === "ADMIN" || user.role === "SUPER_ADMIN" || user.role === "SUPPLIER")) {
    return <Redirect to="/dashboard" />;
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) navigate(`/products?q=${encodeURIComponent(search.trim())}`);
    else navigate("/products");
  };

  const handleLocationConfirm = async (loc: PickedLocation) => {
    const entry = { address: loc.address, lat: loc.lat, lng: loc.lng, placeId: loc.placeId };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(entry));
    } catch {}
    setStoredLocation(entry);
    setLocationPickerOpen(false);
    if (user) {
      try {
        await apiRequest("PATCH", "/api/auth/me/location", entry);
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      } catch {}
    }
    toast({ title: "📍 Adresse enregistrée", description: formatLocationLabel(loc.address) });
  };

  const activeCategories = categories.filter((c) => (c.productCount ?? 0) > 0);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center">
              <Coffee className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-gray-900 hidden sm:block">BigBoss<span className="text-amber-500">Coffee</span></span>
          </Link>

          <button
            onClick={() => setLocationPickerOpen(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-amber-600 transition-colors border border-gray-200 rounded-full px-3 py-1.5 max-w-[160px]"
            data-testid="button-location"
          >
            <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">{locationLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 hidden sm:block">{user.name}</span>
                <Link href="/">
                  <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white rounded-full">Dashboard</Button>
                </Link>
              </div>
            ) : (
              <Button
                size="sm"
                data-testid="button-connexion"
                onClick={() => setRoleModalOpen(true)}
                className="bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-sm px-5"
              >
                Connexion
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 pt-10 pb-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">
            La marketplace B2B des cafés tunisiens
          </h1>
          <p className="text-amber-100 text-base md:text-lg mb-10">
            Commandez vos produits professionnels directement auprès de fournisseurs vérifiés.
          </p>

          <div className="flex justify-center gap-4 md:gap-8 mb-10">
            {SERVICES.map((svc) => (
              <button
                key={svc.id}
                data-testid={`button-service-${svc.id}`}
                onClick={() => navigate(svc.href)}
                className="flex flex-col items-center gap-2 group transition-transform hover:-translate-y-1 cursor-pointer"
              >
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white shadow-lg flex items-center justify-center group-hover:shadow-xl transition-shadow">
                  <svc.icon className="w-7 h-7 md:w-9 md:h-9 text-amber-600" />
                </div>
                <span className="text-white text-xs md:text-sm font-semibold tracking-wide">{svc.label}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleSearch} className="max-w-xl mx-auto">
            <div className="flex gap-2 bg-white rounded-2xl p-2 shadow-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  className="pl-9 border-0 bg-transparent focus-visible:ring-0 text-gray-800"
                  placeholder="Que peut-on vous livrer ?"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-hero-search"
                />
              </div>
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-6 shrink-0">
                Rechercher
              </Button>
            </div>
          </form>
        </div>
      </section>

      {/* ── Categories ── */}
      {activeCategories.length > 0 && (
        <section className="py-14 px-4 bg-gray-50">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
              Meilleures catégories à {locationLabel}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {activeCategories.slice(0, 12).map((cat) => (
                <button
                  key={cat.id}
                  data-testid={`button-category-${cat.id}`}
                  onClick={() => navigate(`/products?categoryId=${cat.id}`)}
                  className="flex flex-col items-center gap-3 p-5 bg-white rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all border border-gray-100 group"
                >
                  <span className="text-3xl">{cat.icon || "📦"}</span>
                  <span className="text-sm font-semibold text-gray-700 text-center leading-tight group-hover:text-amber-600 transition-colors">{cat.name}</span>
                  {cat.productCount != null && cat.productCount > 0 && (
                    <span className="text-xs text-gray-400">{cat.productCount} produit{cat.productCount !== 1 ? "s" : ""}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── PRINT Categories ── */}
      <section className="py-14 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Catégories <span className="text-blue-600">PRINT</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {PRINT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                data-testid={`button-print-category-${cat.id}`}
                onClick={() => navigate(`/print?categoryId=${cat.id}`)}
                className="flex flex-col items-center gap-3 p-5 bg-white rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all border border-gray-100 group"
              >
                <span className="text-3xl">{cat.icon}</span>
                <span className="text-sm font-semibold text-gray-700 text-center leading-tight group-hover:text-blue-600 transition-colors">{cat.name}</span>
              </button>
            ))}
          </div>
          <div className="text-center mt-8">
            <Button onClick={() => navigate("/print")} variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50 rounded-xl" data-testid="button-see-all-print">
              Voir tous les services PRINT <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── MARKETING Services ── */}
      <section className="py-14 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Services <span className="text-purple-600">MARKETING</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {MARKETING_SERVICES.map((svc) => (
              <button
                key={svc.id}
                data-testid={`button-marketing-service-${svc.id}`}
                onClick={() => navigate(`/marketing?service=${svc.id}`)}
                className="flex flex-col items-center gap-3 p-5 bg-white rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all border border-gray-100 group"
              >
                <span className="text-3xl">{svc.icon}</span>
                <span className="text-sm font-semibold text-gray-700 text-center leading-tight group-hover:text-purple-600 transition-colors">{svc.label}</span>
              </button>
            ))}
          </div>
          <div className="text-center mt-8">
            <Button onClick={() => navigate("/marketing")} variant="outline" className="border-purple-200 text-purple-600 hover:bg-purple-50 rounded-xl" data-testid="button-see-all-marketing">
              Voir tous les prestataires <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── BARISTA ── */}
      <section className="py-14 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Services <span className="text-green-600">BARISTA</span>
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <button
              data-testid="button-barista-academy"
              onClick={() => navigate("/barista?tab=academy")}
              className="flex flex-col items-start gap-4 p-8 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left group"
            >
              <div className="w-14 h-14 bg-green-500/15 rounded-2xl flex items-center justify-center">
                <Coffee className="w-7 h-7 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-green-700 transition-colors">Barista Academy</h3>
                <p className="text-gray-500 text-sm leading-relaxed">Découvrez des formations professionnelles pour développer les compétences de votre équipe.</p>
              </div>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-green-600 group-hover:gap-3 transition-all">
                Explorer les formations <ArrowRight className="w-4 h-4" />
              </span>
            </button>

            <button
              data-testid="button-barista-marketplace"
              onClick={() => navigate("/barista?tab=marketplace")}
              className="flex flex-col items-start gap-4 p-8 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-left group"
            >
              <div className="w-14 h-14 bg-blue-500/15 rounded-2xl flex items-center justify-center">
                <User className="w-7 h-7 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-700 transition-colors">Marketplace Baristas</h3>
                <p className="text-gray-500 text-sm leading-relaxed">Trouvez et recrutez des baristas qualifiés pour votre établissement.</p>
              </div>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 group-hover:gap-3 transition-all">
                Trouver un barista <ArrowRight className="w-4 h-4" />
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ── Why BigBossCoffee ── */}
      <section className="py-14 px-4 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Pourquoi BigBossCoffee ?</h2>
          <p className="text-gray-500 mb-10 max-w-xl mx-auto">La plateforme professionnelle pensée pour les cafés tunisiens modernes.</p>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { icon: CheckCircle, title: "Fournisseurs vérifiés", desc: "Chaque fournisseur est sélectionné et audité par notre équipe." },
              { icon: ShoppingBag, title: "Multi-fournisseurs", desc: "Commandez chez plusieurs fournisseurs dans un seul panier." },
              { icon: ArrowRight, title: "Livraison suivie", desc: "Suivez vos commandes en temps réel jusqu'à votre porte." },
            ].map((item) => (
              <div key={item.title} className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-amber-50 border border-amber-100">
                <div className="w-12 h-12 bg-amber-500/15 rounded-xl flex items-center justify-center">
                  <item.icon className="w-6 h-6 text-amber-600" />
                </div>
                <h3 className="font-bold text-gray-900">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-14 px-4 bg-amber-500">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Vous êtes fournisseur ?</h2>
          <p className="text-amber-100 mb-6">Rejoignez notre réseau et atteignez des centaines de cafés en Tunisie.</p>
          <Button onClick={() => { setRoleModalOpen(true); }} className="bg-white text-amber-600 hover:bg-amber-50 font-bold rounded-xl shadow-lg px-8">
            Devenir fournisseur
          </Button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 text-gray-300 pt-12 pb-6 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                  <Coffee className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-white">BigBoss<span className="text-amber-500">Coffee</span></span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">La marketplace B2B dédiée aux professionnels du café en Tunisie.</p>
              <div className="flex gap-3 mt-4">
                <a href="#" className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-amber-500 transition-colors"><Instagram className="w-4 h-4" /></a>
                <a href="#" className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-amber-500 transition-colors"><Facebook className="w-4 h-4" /></a>
                <a href="#" className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-amber-500 transition-colors"><Twitter className="w-4 h-4" /></a>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Services</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={() => navigate("/products")} className="hover:text-amber-400 transition-colors">Marketplace SHOP</button></li>
                <li><button onClick={() => navigate("/print")} className="hover:text-amber-400 transition-colors">Marketplace PRINT</button></li>
                <li><button onClick={() => navigate("/barista")} className="hover:text-amber-400 transition-colors">Services BARISTA</button></li>
                <li><button onClick={() => navigate("/marketing")} className="hover:text-amber-400 transition-colors">Services MARKETING</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Liens utiles</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-amber-400 transition-colors">À propos</a></li>
                <li><button onClick={() => setRoleModalOpen(true)} className="hover:text-amber-400 transition-colors">Devenir fournisseur</button></li>
                <li><a href="#" className="hover:text-amber-400 transition-colors">FAQ</a></li>
                <li><a href="#" className="hover:text-amber-400 transition-colors">Blog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Contact</h4>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2"><Mail className="w-4 h-4 text-amber-500" /> contact@bigbosscoffee.tn</li>
                <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-amber-500" /> +216 71 000 000</li>
                <li className="flex items-center gap-2"><MapPin className="w-4 h-4 text-amber-500" /> Tunis, Tunisie</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 text-center text-xs text-gray-500">
            © 2026 BigBossCoffee. Tous droits réservés. · <a href="#" className="hover:text-gray-300">Confidentialité</a> · <a href="#" className="hover:text-gray-300">CGU</a>
          </div>
        </div>
      </footer>

      <LocationPickerModal
        open={locationPickerOpen}
        title="Où livrer votre commande ?"
        onClose={() => setLocationPickerOpen(false)}
        onConfirm={handleLocationConfirm}
        initialAddress={storedLocation?.address}
      />

      {/* ── Connexion / Role-selection modal ── */}
      <Dialog open={roleModalOpen} onOpenChange={setRoleModalOpen}>
        <DialogContent className="sm:max-w-2xl rounded-3xl p-0 overflow-hidden">
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-6 text-white">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white">Rejoindre BigBossCoffee</DialogTitle>
              <p className="text-amber-100 text-sm mt-1">Choisissez votre type de compte pour commencer.</p>
            </DialogHeader>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ROLE_CARDS.map((role) => (
                <button
                  key={role.id}
                  data-testid={`role-card-${role.id}`}
                  onClick={() => {
                    setRoleModalOpen(false);
                    navigate(`/auth?role=${role.id}`);
                  }}
                  className={`flex flex-col items-start gap-3 p-4 rounded-2xl border-2 ${role.bg} ${role.border} ${role.hover} transition-all hover:-translate-y-0.5 hover:shadow-md text-left group`}
                >
                  <div className={`w-10 h-10 ${role.iconBg} rounded-xl flex items-center justify-center`}>
                    <role.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{role.label}</p>
                    <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{role.desc}</p>
                  </div>
                  <span className="text-xs font-semibold text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
                    S'inscrire <ArrowRight className="w-3 h-3" />
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t border-gray-100 mt-5 pt-4 text-center">
              <p className="text-sm text-gray-500">
                Déjà un compte ?{" "}
                <button
                  className="text-amber-600 font-semibold hover:underline"
                  onClick={() => { setRoleModalOpen(false); navigate("/auth"); }}
                >
                  Se connecter
                </button>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
