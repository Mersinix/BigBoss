import { useState, useMemo } from "react";
import marketingHeroImg from "@assets/image_1780681027926.png";
import { Link, useSearch } from "wouter";
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
  Megaphone,
  Search as SearchIcon,
  MapPin,
  Star,
  Lock,
  MessageCircle,
  SlidersHorizontal,
  RotateCcw,
  CheckCircle,
  ExternalLink,
  X,
  ImageIcon,
  FileText,
  Users,
  Heart,
  Clock,
} from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";

// ── Access helper (mirrors browse-products + barista-page pattern) ────────────

type AccessLevel = "visitor" | "pending" | "approved";

function useAccessLevel(): AccessLevel {
  const { user } = useAuth();
  if (!user) return "visitor";
  if (["SUPER_ADMIN", "ADMIN", "SUPPLIER"].includes(user.role)) return "approved";
  if (user.role === "CAFE_OWNER" && (user as any).status === "approved") return "approved";
  return "pending";
}

// ── Static Data ───────────────────────────────────────────────────────────────

const SERVICE_TYPES = [
  {
    id: "website",
    icon: "🌐",
    title: "Création de site web",
    label: "Website",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=80&q=80",
    desc: "Site vitrine, menu digital et réservation en ligne pour votre café.",
    count: 8,
  },
  {
    id: "seo",
    icon: "🔍",
    title: "Référencement SEO",
    label: "SEO",
    image: "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=80&q=80",
    desc: "Améliorez votre visibilité sur Google et attirez plus de clients locaux.",
    count: 5,
  },
  {
    id: "ads",
    icon: "📢",
    title: "Gestion des publicités",
    label: "Ads",
    image: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=80&q=80",
    desc: "Campagnes Meta Ads et Google Ads ciblées pour booster votre fréquentation.",
    count: 7,
  },
  {
    id: "social",
    icon: "📱",
    title: "Réseaux sociaux",
    label: "Social",
    image: "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?w=80&q=80",
    desc: "Création et planification de contenu pour Instagram, Facebook et TikTok.",
    count: 12,
  },
  {
    id: "video",
    icon: "🎥",
    title: "Production vidéo",
    label: "Vidéo",
    image: "https://images.unsplash.com/photo-1536240478700-b869ad10e128?w=80&q=80",
    desc: "Réels, stories et vidéos promotionnelles pour mettre en valeur votre café.",
    count: 4,
  },
  {
    id: "photo",
    icon: "📸",
    title: "Photographie",
    label: "Photo",
    image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=80&q=80",
    desc: "Photos professionnelles de vos boissons, plats et ambiance.",
    count: 9,
  },
  {
    id: "branding",
    icon: "🎨",
    title: "Identité de marque",
    label: "Branding",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=80&q=80",
    desc: "Logo, charte graphique et storytelling pour votre établissement.",
    count: 6,
  },
];

type ProviderType = "agency" | "freelancer" | "studio";
type ServiceId = typeof SERVICE_TYPES[number]["id"];

interface Provider {
  id: number;
  name: string;
  initials: string;
  type: ProviderType;
  rating: number;
  reviewCount: number;
  location: string;
  services: ServiceId[];
  portfolioImages: string[];
  description: string;
  packages: { name: string; priceInCents: number; features: string[] }[];
  website: string;
}

const PROVIDERS: Provider[] = [
  {
    id: 1,
    name: "TunMedia Agency",
    initials: "TM",
    type: "agency",
    rating: 4.9,
    reviewCount: 87,
    location: "Tunis",
    services: ["social", "ads", "video"],
    portfolioImages: [
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&q=80",
      "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&q=80",
      "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&q=80",
    ],
    description:
      "Agence spécialisée dans le marketing digital pour la restauration. Nous aidons les cafés tunisiens à développer leur présence en ligne et attirer plus de clients.",
    packages: [
      { name: "Starter", priceInCents: 49900, features: ["2 posts/sem Instagram", "Reporting mensuel", "Support email"] },
      { name: "Growth", priceInCents: 99900, features: ["5 posts/sem tous réseaux", "1 campagne ads/mois", "Reporting hebdo", "Support prioritaire"] },
      { name: "Premium", priceInCents: 199900, features: ["Posts illimités", "Ads management complet", "Vidéo mensuelle", "Account manager dédié"] },
    ],
    website: "tunmedia.tn",
  },
  {
    id: 2,
    name: "Pixel & Grain Studio",
    initials: "PG",
    type: "studio",
    rating: 4.8,
    reviewCount: 54,
    location: "Sfax",
    services: ["photo", "video", "branding"],
    portfolioImages: [
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&q=80",
      "https://img.magnific.com/premium-vector/coffee-retro-vintage-poster-premium-design-template_501824-42.jpg?w=400&q=80",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTs9E2C8dLeLrFNYos4Hmp6nOkScceCO4TZTniFRfIINOnZb_OST7gSSLU&s=10?w=400&q=80",
    ],
    description:
      "Studio créatif spécialisé dans la photographie culinaire et la production vidéo pour cafés et restaurants. Nos visuels font la différence sur vos réseaux.",
    packages: [
      { name: "Shooting Basic", priceInCents: 29900, features: ["Demi-journée", "20 photos HD", "Retouche incluse"] },
      { name: "Shooting Pro", priceInCents: 59900, features: ["Journée complète", "50 photos HD + vidéo", "Retouche avancée", "Livraison 48h"] },
      { name: "Branding Pack", priceInCents: 149900, features: ["Shooting complet", "Logo + charte graphique", "Kit réseaux sociaux", "Révisions illimitées"] },
    ],
    website: "hook.tn",
  },
  {
    id: 3,
    name: "Karim Digital",
    initials: "KD",
    type: "freelancer",
    rating: 4.7,
    reviewCount: 41,
    location: "Tunis",
    services: ["seo", "website", "ads"],
    portfolioImages: [
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&q=80",
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&q=80",
      "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=400&q=80",
    ],
    description:
      "Consultant SEO et développeur web freelance avec 6 ans d'expérience dans la restauration. Sites rapides, bien référencés et adaptés mobile.",
    packages: [
      { name: "SEO Audit", priceInCents: 19900, features: ["Audit complet", "Rapport détaillé", "Plan d'action 3 mois"] },
      { name: "Site Vitrine", priceInCents: 89900, features: ["Design sur mesure", "Menu digital", "Formulaire réservation", "SEO de base"] },
      { name: "SEO + Site", priceInCents: 149900, features: ["Site complet", "SEO 6 mois", "Google My Business", "Suivi mensuel"] },
    ],
    website: "hook.tn",
  },
  {
    id: 4,
    name: "Visio Marketing",
    initials: "VM",
    type: "agency",
    rating: 4.6,
    reviewCount: 33,
    location: "Sousse",
    services: ["social", "ads", "branding"],
    portfolioImages: [
      "https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=400&q=80",
      "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?w=400&q=80",
      "https://images.unsplash.com/photo-1562577309-4932fdd64cd1?w=400&q=80",
    ],
    description:
      "Agence marketing créative basée à Sousse. Nous construisons des identités de marque fortes et gérons vos campagnes publicitaires pour maximiser votre ROI.",
    packages: [
      { name: "Brand Starter", priceInCents: 39900, features: ["Logo + 2 variantes", "Palette couleurs", "Typography guide"] },
      { name: "Social Pack", priceInCents: 69900, features: ["3 posts/sem", "Stories quotidiennes", "Ads 50 TND/mois inclus"] },
      { name: "Full Marketing", priceInCents: 139900, features: ["Branding complet", "Social media management", "Ads jusqu'à 200 TND", "Reporting BI-mensuel"] },
    ],
    website: "hook.tn",
  },
  {
    id: 5,
    name: "Sara Créations",
    initials: "SC",
    type: "freelancer",
    rating: 4.9,
    reviewCount: 28,
    location: "Tunis",
    services: ["branding", "social", "photo"],
    portfolioImages: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80",
      "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?w=400&q=80",
      "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400&q=80",
    ],
    description:
      "Designer graphique et photographe freelance spécialisée dans l'univers du café. Je crée des identités visuelles chaleureuses qui racontent l'histoire de votre établissement.",
    packages: [
      { name: "Logo Pack", priceInCents: 24900, features: ["Logo + favicon", "3 propositions", "Fichiers HD"] },
      { name: "Visual Identity", priceInCents: 59900, features: ["Logo complet", "Charte graphique", "Templates réseaux", "Carte de visite"] },
      { name: "Full Brand", priceInCents: 99900, features: ["Identité complète", "Shooting photo (1h)", "Kit digital", "Révisions illimitées"] },
    ],
    website: "hook.tn",
  },
  {
    id: 6,
    name: "CaféBoost",
    initials: "CB",
    type: "agency",
    rating: 4.5,
    reviewCount: 19,
    location: "Monastir",
    services: ["ads", "seo", "video", "social"],
    portfolioImages: [
      "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&q=80",
      "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&q=80",
      "https://images.unsplash.com/photo-1498804103079-a6351b050096?w=400&q=80",
    ],
    description:
      "Agence 360° dédiée exclusivement aux cafés et restaurants. Notre équipe combine expertise digitale et connaissance du secteur F&B tunisien.",
    packages: [
      { name: "Boost Starter", priceInCents: 59900, features: ["Audit digital complet", "3 mois réseaux sociaux", "1 vidéo promo"] },
      { name: "Boost Pro", priceInCents: 119900, features: ["Social media 6 mois", "Ads management", "2 vidéos/mois", "SEO local"] },
      { name: "Boost Max", priceInCents: 229900, features: ["Full 360° annuel", "Ads budget géré", "Production vidéo mensuelle", "Account manager"] },
    ],
    website: "hook.tn",
  },
];

const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  agency: "Agence",
  freelancer: "Freelancer",
  studio: "Studio",
};

const PROVIDER_TYPE_COLORS: Record<ProviderType, string> = {
  agency: "bg-blue-100 text-blue-700",
  freelancer: "bg-orange-100 text-orange-700",
  studio: "bg-violet-100 text-violet-700",
};

// ── Shared Price Lock UI (mirrors barista-page pattern) ───────────────────────

function PriceLocked({ user }: { user: ReturnType<typeof useAuth>["user"] }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 text-[11px] text-blue-700 font-medium">
        <Lock className="w-3 h-3 shrink-0" />
        <span>
          {user
            ? "En attente d'approbation"
            : "Disponible pour les cafés approuvés"}
        </span>
      </div>
      {!user && (
        <Link href="/login">
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[11px] w-full border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-400 px-2"
            data-testid="button-login-marketing-price"
          >
            Connexion to view pricing
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
      <span className="text-[11px] font-semibold text-gray-700">
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

// ── Provider Card ─────────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  accessLevel,
  user,
  onViewProfile,
}: {
  provider: Provider;
  accessLevel: AccessLevel;
  user: ReturnType<typeof useAuth>["user"];
  onViewProfile: (p: Provider) => void;
}) {
  const hasAccess = accessLevel === "approved";
  const lowestPrice = Math.min(...provider.packages.map((p) => p.priceInCents));
  const faved = useFavorites((s) => !!s.marketing[provider.id]);
  const toggleMarketing = useFavorites((s) => s.toggleMarketing);

  return (
    <div
      data-testid={`card-provider-${provider.id}`}
      className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col"
    >
      {/* Portfolio preview strip */}
      <div className="h-20 grid grid-cols-3 gap-0.5 overflow-hidden">
        {provider.portfolioImages.slice(0, 3).map((img, i) => (
          <div key={i} className="relative overflow-hidden bg-gray-100">
            <img
              src={img}
              alt=""
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        ))}
      </div>

      <div className="p-3 flex-1 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarFallback className="bg-purple-100 text-purple-700 font-bold text-xs">
              {provider.initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm leading-tight truncate group-hover:text-purple-600 transition-colors">
              {provider.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <Badge
                className={`text-[10px] border-0 px-1.5 ${PROVIDER_TYPE_COLORS[provider.type]}`}
              >
                {PROVIDER_TYPE_LABELS[provider.type]}
              </Badge>
              <span className="flex items-center gap-0.5 text-[11px] text-gray-400">
                <MapPin className="w-2.5 h-2.5" />
                {provider.location}
              </span>
            </div>
          </div>
          <button
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-rose-50 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              toggleMarketing({
                id: provider.id,
                name: provider.name,
                initials: provider.initials,
                type: PROVIDER_TYPE_LABELS[provider.type],
                rating: provider.rating,
                portfolioImages: provider.portfolioImages,
              });
            }}
            data-testid={`button-fav-marketing-${provider.id}`}
          >
            <Heart className={`w-3.5 h-3.5 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <StarRating rating={provider.rating} />
          <span className="text-[11px] text-gray-400">({provider.reviewCount})</span>
        </div>

        <div className="flex flex-wrap gap-1">
          {provider.services.map((sId) => {
            const s = SERVICE_TYPES.find((st) => st.id === sId);
            return s ? (
              <span
                key={sId}
                className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-medium"
              >
                {s.title.split(" ")[0]}
              </span>
            ) : null;
          })}
        </div>

        <div className="mt-auto pt-2 border-t border-gray-50">
          {hasAccess ? (
            <div className="space-y-2">
              <div>
                <p className="text-[10px] text-gray-400">À partir de</p>
                <p className="font-bold text-sm text-purple-600">
                  {(lowestPrice / 100).toFixed(0)} TND/mois
                </p>
              </div>
              <div className="flex gap-1.5">
                <Link href="/cafe/messages">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg px-2"
                    data-testid={`button-contact-provider-${provider.id}`}
                  >
                    <MessageCircle className="w-3 h-3" />
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] border-purple-200 text-purple-600 hover:bg-purple-50 rounded-lg px-2 flex-1"
                  onClick={() => onViewProfile(provider)}
                  data-testid={`button-view-profile-${provider.id}`}
                >
                  Voir profil
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-[11px] bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-2 flex-1"
                  data-testid={`button-quote-provider-${provider.id}`}
                >
                  Devis
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] w-full border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg"
                onClick={() => onViewProfile(provider)}
                data-testid={`button-view-profile-locked-${provider.id}`}
              >
                Voir profil
              </Button>
              <PriceLocked user={user} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Provider Detail Dialog ────────────────────────────────────────────────────

function ProviderDetailDialog({
  provider,
  onClose,
  accessLevel,
  user,
}: {
  provider: Provider | null;
  onClose: () => void;
  accessLevel: AccessLevel;
  user: ReturnType<typeof useAuth>["user"];
}) {
  if (!provider) return null;
  const hasAccess = accessLevel === "approved";

  return (
    <Dialog open={!!provider} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl">
        <VisuallyHidden><DialogTitle>{provider.name}</DialogTitle></VisuallyHidden>
        {/* Portfolio gallery */}
        <div className="h-48 grid grid-cols-3 gap-1 overflow-hidden rounded-t-2xl">
          {provider.portfolioImages.map((img, i) => (
            <div key={i} className="relative overflow-hidden bg-gray-100">
              <img src={img} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Avatar className="w-12 h-12 shrink-0">
                <AvatarFallback className="bg-purple-100 text-purple-700 font-bold text-sm">
                  {provider.initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-bold text-lg text-gray-900">{provider.name}</h2>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <Badge className={`text-xs border-0 px-2 ${PROVIDER_TYPE_COLORS[provider.type]}`}>
                    {PROVIDER_TYPE_LABELS[provider.type]}
                  </Badge>
                  <span className="flex items-center gap-1 text-sm text-gray-500">
                    <MapPin className="w-3 h-3" /> {provider.location}
                  </span>
                  <StarRating rating={provider.rating} />
                  <span className="text-xs text-gray-400">({provider.reviewCount} avis)</span>
                </div>
              </div>
            </div>
            <a
              href={`https://${provider.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-purple-600 flex items-center gap-1 hover:underline shrink-0"
              data-testid={`link-website-${provider.id}`}
            >
              <ExternalLink className="w-3 h-3" /> {provider.website}
            </a>
          </div>

          {/* Description */}
          <div>
            <h3 className="font-semibold text-sm text-gray-700 mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-purple-500" /> À propos
            </h3>
            <p className="text-sm text-gray-500">{provider.description}</p>
          </div>

          {/* Services */}
          <div>
            <h3 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-purple-500" /> Services proposés
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {provider.services.map((sId) => {
                const s = SERVICE_TYPES.find((st) => st.id === sId);
                return s ? (
                  <span
                    key={sId}
                    className="text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full font-medium"
                  >
                    {s.title}
                  </span>
                ) : null;
              })}
            </div>
          </div>

          {/* Pricing packages */}
          <div>
            <h3 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-purple-500" /> Forfaits &amp; tarifs
            </h3>
            {hasAccess ? (
              <div className="grid sm:grid-cols-3 gap-3">
                {provider.packages.map((pkg, i) => (
                  <div
                    key={pkg.name}
                    className={`rounded-xl border p-3 flex flex-col gap-2 ${i === 1 ? "border-purple-400 ring-1 ring-purple-200 bg-purple-50/50" : "border-gray-100 bg-white"}`}
                    data-testid={`package-${provider.id}-${i}`}
                  >
                    {i === 1 && (
                      <Badge className="bg-purple-600 text-white border-0 text-[10px] w-fit">
                        Populaire
                      </Badge>
                    )}
                    <p className="font-bold text-sm text-gray-900">{pkg.name}</p>
                    <p className="font-bold text-lg text-purple-600">
                      {(pkg.priceInCents / 100).toFixed(0)}{" "}
                      <span className="text-xs font-normal text-gray-400">TND</span>
                    </p>
                    <ul className="space-y-1">
                      {pkg.features.map((f) => (
                        <li key={f} className="flex items-start gap-1 text-xs text-gray-500">
                          <CheckCircle className="w-3 h-3 text-purple-500 shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button
                      size="sm"
                      className={`h-7 text-xs mt-auto rounded-lg ${i === 1 ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}
                      data-testid={`button-select-package-${provider.id}-${i}`}
                    >
                      Choisir ce forfait
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
                <Lock className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Tarifs réservés aux cafés approuvés
                </p>
                <p className="text-xs text-gray-400 mb-3">
                  {user
                    ? "Votre compte est en attente d'approbation."
                    : "Connectez-vous et obtenez l'approbation pour accéder aux tarifs."}
                </p>
                {!user && (
                  <Link href="/login">
                    <Button
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg"
                      data-testid="button-login-packages"
                    >
                      Connexion to view pricing
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          {hasAccess && (
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <Link href="/cafe/messages" className="flex-1">
                <Button
                  variant="outline"
                  className="w-full border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl"
                  data-testid={`button-contact-detail-${provider.id}`}
                >
                  <MessageCircle className="w-4 h-4 mr-1.5" /> Contacter
                </Button>
              </Link>
              <Button
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-xl"
                data-testid={`button-quote-detail-${provider.id}`}
              >
                Demander un devis
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MarketingPage({ comingSoon = false }: { comingSoon?: boolean }) {
  const { user } = useAuth();
  const accessLevel = useAccessLevel();

  const searchStr = useSearch();
  const initialService = new URLSearchParams(searchStr).get("service") ?? "";
  const [selectedService, setSelectedService] = useState<string>(initialService);
  const [search, setSearch] = useState("");
  const [filterRating, setFilterRating] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterType, setFilterType] = useState("");
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);

  const allLocations = useMemo(
    () => Array.from(new Set(PROVIDERS.map((p) => p.location))).sort(),
    []
  );

  const filteredProviders = useMemo(() => {
    let list = PROVIDERS;
    if (selectedService) list = list.filter((p) => p.services.includes(selectedService as ServiceId));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q)
      );
    }
    if (filterRating) {
      const min = parseFloat(filterRating);
      list = list.filter((p) => p.rating >= min);
    }
    if (filterLocation) list = list.filter((p) => p.location === filterLocation);
    if (filterType) list = list.filter((p) => p.type === filterType);
    return list;
  }, [selectedService, search, filterRating, filterLocation, filterType]);

  const hasFilters = !!(selectedService || search || filterRating || filterLocation || filterType);

  const resetFilters = () => {
    setSelectedService("");
    setSearch("");
    setFilterRating("");
    setFilterLocation("");
    setFilterType("");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-12 pb-16 px-4 overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${marketingHeroImg})` }}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/85 via-purple-800/80 to-violet-900/85" />
        {/* Content */}
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
            <Megaphone className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
            BigBoss <span className="text-purple-200">MARKETING</span>
          </h1>
          <p className="text-purple-100 text-lg mb-6 max-w-xl mx-auto">
            Boostez la visibilité de votre café avec des experts marketing dédiés à la restauration
          </p>
          <div className="flex items-center justify-center gap-6 flex-wrap text-purple-100 text-sm">
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {PROVIDERS.length} prestataires
            </span>
            <span className="flex items-center gap-1.5">
              <Megaphone className="w-4 h-4" />
              {SERVICE_TYPES.length} types de services
            </span>
            <span className="flex items-center gap-1.5">
              <Star className="w-4 h-4 fill-purple-200" />
              Note moyenne 4.7/5
            </span>
          </div>
        </div>
      </section>

      {comingSoon ? (
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Clock className="w-8 h-8 text-purple-600" />
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
            Votre compte est en attente d'approbation. Vous pourrez accéder aux tarifs et demander des devis une fois approuvé.
          </div>
        </div>
      )}

      {/* ── Service strip + filters — sticky block ─────────────────── */}
      <div className="bg-white sticky top-14 z-30 shadow-sm">
        <div className="border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-1 overflow-x-auto py-3" style={{ scrollbarWidth: "none" }}>
              {/* All */}
              <button
                onClick={() => setSelectedService("")}
                data-testid="button-service-all"
                className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl shrink-0 transition-all text-center min-w-[64px] ${selectedService === "" ? "bg-blue-600 text-white shadow-sm" : "hover:bg-gray-100 text-gray-600"}`}
              >
                <span className="text-lg">📢</span>
                <span className="text-[11px] font-semibold leading-tight">All</span>
              </button>
              {SERVICE_TYPES.map((service) => (
                <button
                  key={service.id}
                  onClick={() => setSelectedService(selectedService === service.id ? "" : service.id)}
                  data-testid={`button-service-cat-${service.id}`}
                  className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl shrink-0 transition-all text-center min-w-[64px] ${selectedService === service.id ? "bg-blue-600 text-white shadow-sm" : "hover:bg-gray-100 text-gray-600"}`}
                >
                  <span className="text-lg">{service.icon}</span>
                  <span className="text-[11px] font-semibold leading-tight line-clamp-1 max-w-[60px]">
                    {service.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* Filter bar */}
        <div className="border-b border-gray-100 py-2 px-4">
          <div className="max-w-7xl mx-auto flex items-center gap-2 flex-wrap">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un prestataire..."
                className="h-7 text-xs pl-8 border-gray-200 bg-gray-50 rounded-full"
                data-testid="input-provider-search"
              />
            </div>
            <Select
              value={filterType || "__all__"}
              onValueChange={(v) => setFilterType(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[130px]" data-testid="select-provider-type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous types</SelectItem>
                <SelectItem value="agency">Agence</SelectItem>
                <SelectItem value="freelancer">Freelancer</SelectItem>
                <SelectItem value="studio">Studio</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filterRating || "__all__"}
              onValueChange={(v) => setFilterRating(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[120px]" data-testid="select-provider-rating">
                <SelectValue placeholder="Note min." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toutes notes</SelectItem>
                <SelectItem value="4.5">4.5+</SelectItem>
                <SelectItem value="4.7">4.7+</SelectItem>
                <SelectItem value="4.9">4.9+</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filterLocation || "__all__"}
              onValueChange={(v) => setFilterLocation(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="h-7 text-xs border-gray-200 bg-gray-50 rounded-full px-3 w-auto min-w-[110px]" data-testid="select-provider-location">
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
                onClick={resetFilters}
                className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
                data-testid="button-reset-marketing-filters"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* ── Providers ────────────────────────────────────────────────────── */}
        <section>
          {/* Active service filter pill */}
          {selectedService && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-gray-500">Service filtré :</span>
              <button
                className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full font-medium hover:bg-purple-200 transition-colors"
                onClick={() => setSelectedService("")}
                data-testid="button-clear-service-filter"
              >
                {SERVICE_TYPES.find((s) => s.id === selectedService)?.title}
                <X className="w-3 h-3 ml-0.5" />
              </button>
            </div>
          )}

          {filteredProviders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Users className="w-12 h-12 text-gray-200" />
              <p className="font-semibold text-gray-700">Aucun prestataire trouvé</p>
              <p className="text-sm text-gray-400">Essayez d'ajuster vos filtres.</p>
              <Button size="sm" variant="outline" onClick={resetFilters} data-testid="button-reset-empty">
                Réinitialiser les filtres
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredProviders.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  accessLevel={accessLevel}
                  user={user}
                  onViewProfile={setActiveProvider}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      </>
      )}

      {/* ── Provider Detail Dialog ─────────────────────────────────────── */}
      <ProviderDetailDialog
        provider={activeProvider}
        onClose={() => setActiveProvider(null)}
        accessLevel={accessLevel}
        user={user}
      />
    </div>
  );
}
