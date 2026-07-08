import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ShoppingBag, Printer, Coffee, Megaphone, MapPin,
  ChevronDown, Instagram, Facebook, Mail,
  Phone, ArrowRight, CheckCircle, Building2, Truck, GraduationCap, Users, ChevronRight,
  ChevronLeft, Clock, Globe, Moon, Sun
} from "lucide-react";
import { Link, Redirect } from "wouter";
import type { CategoryWithCount, LandingConfig, HeroSlide } from "@shared/schema";
import { PRINT_CATEGORIES } from "@/data/print-data";
import { useToast } from "@/hooks/use-toast";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";
import { pickedToGeoLocation } from "@/store/search-location-store";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useServiceStates, ROLE_TO_SERVICE, type ServiceKey } from "@/hooks/use-service-states";

// ── Language system ───────────────────────────────────────────────────────────

type Lang = "fr" | "en" | "tn";

const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  fr: {
    connect: "Connexion",
    dashboard: "Dashboard",
    shopTitle: "Marketplace SHOP",
    shopDesc: "Accédez à des centaines de produits professionnels.",
    shopCta: "Ouvrir un compte Café",
    printTitle: "Catégories PRINT",
    printDesc: "Rejoignez notre réseau de professionnels de l'impression.",
    printCta: "Rejoindre en tant qu'imprimerie",
    marketingTitle: "Services MARKETING",
    marketingDesc: "Proposez vos services marketing aux cafés tunisiens.",
    marketingCta: "Rejoindre en tant qu'agence",
    baristaTitle: "Services BARISTA",
    academyName: "Barista Academy",
    academyDesc: "Découvrez des formations professionnelles pour développer les compétences de votre équipe.",
    academyCta: "Proposer des formations Barista",
    marketplaceName: "Marketplace Baristas",
    marketplaceDesc: "Trouvez et recrutez des baristas qualifiés pour votre établissement.",
    marketplaceCta: "Rejoindre la Marketplace Barista",
    whyTitle: "Pourquoi BigBossCoffee ?",
    whySubtitle: "La plateforme professionnelle pensée pour les cafés tunisiens modernes.",
    feat1Title: "Fournisseurs vérifiés",
    feat1Desc: "Chaque fournisseur est sélectionné et audité par notre équipe.",
    feat2Title: "Multi-fournisseurs",
    feat2Desc: "Commandez chez plusieurs fournisseurs dans un seul panier.",
    feat3Title: "Livraison suivie",
    feat3Desc: "Suivez vos commandes en temps réel jusqu'à votre porte.",
    ctaTitle: "Vous êtes fournisseur ?",
    ctaDesc: "Rejoignez notre réseau et atteignez des centaines de cafés en Tunisie.",
    ctaBtn: "Devenir fournisseur",
    footerServices: "Services",
    footerLinks: "Liens utiles",
    footerContact: "Contact",
    aboutLink: "À propos",
    faq: "FAQ",
    blog: "Blog",
    becomeSupplier: "Devenir fournisseur",
    becomeCafe: "Ouvrir un compte café",
    becomePrinter: "Rejoindre PRINT",
    becomeMarketing: "Rejoindre MARKETING",
    becomeBaristaAcademy: "Rejoindre Barista Academy",
    becomeBaristaMarketplace: "Rejoindre Marketplace Barista",
    shopMarket: "Marketplace SHOP",
    printMarket: "Marketplace PRINT",
    baristaService: "Services BARISTA",
    marketingService: "Services MARKETING",
    footerAbout: "La marketplace B2B dédiée aux professionnels du café en Tunisie.",
  },
  en: {
    connect: "Login",
    dashboard: "Dashboard",
    shopTitle: "SHOP Marketplace",
    shopDesc: "Access hundreds of professional products.",
    shopCta: "Open a Café Account",
    printTitle: "PRINT Categories",
    printDesc: "Join our network of print professionals.",
    printCta: "Join as a Print Provider",
    marketingTitle: "MARKETING Services",
    marketingDesc: "Offer your marketing services to Tunisian cafes.",
    marketingCta: "Join as an Agency",
    baristaTitle: "BARISTA Services",
    academyName: "Barista Academy",
    academyDesc: "Discover professional training programs to develop your team's skills.",
    academyCta: "Offer Barista Training",
    marketplaceName: "Barista Marketplace",
    marketplaceDesc: "Find and hire qualified baristas for your establishment.",
    marketplaceCta: "Join the Barista Marketplace",
    whyTitle: "Why BigBossCoffee?",
    whySubtitle: "The professional platform built for modern Tunisian cafes.",
    feat1Title: "Verified Suppliers",
    feat1Desc: "Every supplier is selected and audited by our team.",
    feat2Title: "Multi-Supplier",
    feat2Desc: "Order from multiple suppliers in a single cart.",
    feat3Title: "Tracked Delivery",
    feat3Desc: "Track your orders in real time to your door.",
    ctaTitle: "Are you a supplier?",
    ctaDesc: "Join our network and reach hundreds of cafes in Tunisia.",
    ctaBtn: "Become a supplier",
    footerServices: "Services",
    footerLinks: "Useful links",
    footerContact: "Contact",
    aboutLink: "About",
    faq: "FAQ",
    blog: "Blog",
    becomeSupplier: "Become a supplier",
    becomeCafe: "Open a café account",
    becomePrinter: "Join PRINT",
    becomeMarketing: "Join MARKETING",
    becomeBaristaAcademy: "Join Barista Academy",
    becomeBaristaMarketplace: "Join Barista Marketplace",
    shopMarket: "SHOP Marketplace",
    printMarket: "PRINT Marketplace",
    baristaService: "BARISTA Services",
    marketingService: "MARKETING Services",
    footerAbout: "The B2B marketplace dedicated to coffee professionals in Tunisia.",
  },
  tn: {
    connect: "دخول",
    dashboard: "لوحة التحكم",
    shopTitle: "سوق SHOP",
    shopDesc: "وصّل لميت منتوج مهني.",
    shopCta: "افتح حساب قهوة",
    printTitle: "فئات الطباعة",
    printDesc: "انضم لشبكة محترفي الطباعة.",
    printCta: "انضم بصفة مطبعة",
    marketingTitle: "خدمات التسويق",
    marketingDesc: "قدّم خدمات التسويق متاعك للقهاوي التونسية.",
    marketingCta: "انضم بصفة وكالة",
    baristaTitle: "خدمات الباريستا",
    academyName: "Barista Academy",
    academyDesc: "اكتشف تكوينات مهنية تطوّر مهارات فريقك.",
    academyCta: "قدّم تكوينات باريستا",
    marketplaceName: "Marketplace Baristas",
    marketplaceDesc: "لقّي وانتدب باريستا مؤهّلين لمحلّك.",
    marketplaceCta: "انضم لسوق الباريستا",
    whyTitle: "علاش BigBossCoffee؟",
    whySubtitle: "المنصة المهنية المصمّمة للقهاوي التونسية الحديثة.",
    feat1Title: "موردين معتمدين",
    feat1Desc: "كل مورد يتم اختياره ومراجعته من قبل فريقنا.",
    feat2Title: "متعدد الموردين",
    feat2Desc: "اعيّط من عند عدة موردين في سلة واحدة.",
    feat3Title: "توصيل مع تتبع",
    feat3Desc: "تابع طلباتك في الوقت الحقيقي حتى باب محلّك.",
    ctaTitle: "عندك شركة توريد؟",
    ctaDesc: "انضم لشبكتنا ووصّل لميت قهوة في تونس.",
    ctaBtn: "صير مورد",
    footerServices: "الخدمات",
    footerLinks: "روابط مفيدة",
    footerContact: "تواصل معنا",
    aboutLink: "علينا",
    faq: "أسئلة شائعة",
    blog: "مدونة",
    becomeSupplier: "صير مورد",
    becomeCafe: "افتح حساب قهوة",
    becomePrinter: "انضم PRINT",
    becomeMarketing: "انضم MARKETING",
    becomeBaristaAcademy: "انضم Barista Academy",
    becomeBaristaMarketplace: "انضم Marketplace Barista",
    shopMarket: "سوق SHOP",
    printMarket: "سوق PRINT",
    baristaService: "خدمات BARISTA",
    marketingService: "خدمات MARKETING",
    footerAbout: "السوق B2B المخصصة لمحترفي القهوة في تونس.",
  },
};

// ── Default assets ────────────────────────────────────────────────────────────

const DEFAULT_SLIDES: HeroSlide[] = [
  {
    imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200&q=80",
    title: "La marketplace B2B des cafés tunisiens",
    description: "Commandez vos produits professionnels directement auprès de fournisseurs vérifiés.",
  },
  {
    imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&q=80",
    title: "Des fournisseurs vérifiés, partout en Tunisie",
    description: "Accédez à des centaines de produits et services pour votre café.",
  },
  {
    imageUrl: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200&q=80",
    title: "Gérez vos commandes en un clic",
    description: "Livraison suivie, paiement sécurisé, réseau professionnel.",
  },
];

const DEFAULT_SHOP_IMG = "https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=800&q=80";
const DEFAULT_PRINT_IMG = "https://images.unsplash.com/photo-1588681664899-f142ff2dc9b1?w=800&q=80";
const DEFAULT_MARKETING_IMG = "https://images.unsplash.com/photo-1611926653458-09294b3142bf?w=800&q=80";
const DEFAULT_ACADEMY_IMG = "https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=600&q=80";
const DEFAULT_MARKETPLACE_IMG = "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=600&q=80";

// ── Services ──────────────────────────────────────────────────────────────────

const SERVICES = [
  { id: "shop",      label: "SHOP",      icon: ShoppingBag, href: "/products" },
  { id: "print",     label: "PRINT",     icon: Printer,     href: "/print",      service: "PRINTING"  as ServiceKey },
  { id: "barista",   label: "BARISTA",   icon: Coffee,      href: "/barista",    service: "BARISTA"   as ServiceKey },
  { id: "marketing", label: "MARKETING", icon: Megaphone,   href: "/marketing",  service: "MARKETING" as ServiceKey },
];

const MARKETING_SERVICES = [
  { id: "website",  icon: "🌐", label: "Création de site web" },
  { id: "seo",      icon: "🔍", label: "Référencement SEO" },
  { id: "ads",      icon: "📢", label: "Publicités" },
  { id: "social",   icon: "📱", label: "Réseaux sociaux" },
  { id: "video",    icon: "🎥", label: "Production vidéo" },
  { id: "photo",    icon: "📸", label: "Photographie" },
];

// ── Role config ───────────────────────────────────────────────────────────────

const ROLES = [
  { id: "CAFE_OWNER",          label: "Café",               icon: Coffee,        color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200",   iconBg: "bg-amber-500",   hover: "hover:border-amber-400",   desc: "Commandez vos produits auprès de fournisseurs vérifiés." },
  { id: "SUPPLIER",            label: "Fournisseur",        icon: Building2,     color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200",    iconBg: "bg-blue-500",    hover: "hover:border-blue-400",    desc: "Proposez vos produits à des centaines de cafés." },
  { id: "DELIVERY_COMPANY",    label: "Livraison",          icon: Truck,         color: "text-green-600",   bg: "bg-green-50",   border: "border-green-200",   iconBg: "bg-green-500",   hover: "hover:border-green-400",   desc: "Gérez vos routes et vos livraisons facilement." },
  { id: "PRINTER",             label: "Imprimerie",         icon: Printer,       color: "text-orange-600",  bg: "bg-orange-50",  border: "border-orange-200",  iconBg: "bg-orange-500",  hover: "hover:border-orange-400",  desc: "Offrez vos services d'impression aux cafés." },
  { id: "MARKETING",           label: "Marketing",          icon: Megaphone,     color: "text-purple-600",  bg: "bg-purple-50",  border: "border-purple-200",  iconBg: "bg-purple-500",  hover: "hover:border-purple-400",  desc: "Proposez vos services marketing aux professionnels." },
  { id: "BARISTA_ACADEMY",     label: "Barista Academy",    icon: GraduationCap, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", iconBg: "bg-emerald-500", hover: "hover:border-emerald-400", desc: "Proposez des formations barista professionnelles." },
  { id: "BARISTA_MARKETPLACE", label: "Marketplace Barista",icon: Users,         color: "text-indigo-600",  bg: "bg-indigo-50",  border: "border-indigo-200",  iconBg: "bg-indigo-500",  hover: "hover:border-indigo-400",  desc: "Mettez en valeur vos services de barista." },
];

// ── Registration constants ────────────────────────────────────────────────────

const TUNISIAN_GOVERNORATES = [
  "Ariana","Béja","Ben Arous","Bizerte","Gabès","Gafsa","Jendouba","Kairouan",
  "Kasserine","Kébili","Le Kef","Mahdia","La Manouba","Médenine","Monastir",
  "Nabeul","Sfax","Sidi Bouzid","Siliana","Sousse","Tataouine","Tozeur","Tunis","Zaghouan"
];
const PRINT_CATS = ["Flyers","Menus","Cartes de visite","Affiches","Enseignes","Packaging","Étiquettes","Banderoles","Gobelets","Kakémonos"];
const MARKETING_CATS = ["Réseaux sociaux","Vidéo","Photographie","SEO","Publicité","Branding","Site web","Influence","Email marketing","Événementiel"];
const BARISTA_SPECIALTIES = ["Espresso","Latte Art","Cold Brew","Brewing Methods","Formation barista","Sensory Training","Coffee Roasting","Machine Maintenance"];

// ── Validation schemas ────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().min(1, "Email ou téléphone requis"),
  password: z.string().min(6, "Mot de passe requis (min. 6 caractères)"),
});
const baseFields = {
  email: z.string().email("Email invalide"),
  phone: z.string().min(8, "Numéro invalide"),
  password: z.string().min(6, "Min. 6 caractères"),
  confirmPassword: z.string().min(6, "Min. 6 caractères"),
};
const pw = (d: any) => d.password === d.confirmPassword;
const pwErrMsg = { message: "Les mots de passe ne correspondent pas", path: ["confirmPassword"] };
const cafeSchema = z.object({ ...baseFields, cafeName: z.string().min(2), firstName: z.string().min(2) }).refine(pw, pwErrMsg);
const supplierSchema = z.object({ ...baseFields, companyName: z.string().min(2), contactName: z.string().min(2) }).refine(pw, pwErrMsg);
const deliverySchema = z.object({ ...baseFields, firstName: z.string().min(2), lastName: z.string().min(2), governorates: z.array(z.string()).min(1) }).refine(pw, pwErrMsg);
const printerSchema = z.object({ ...baseFields, companyName: z.string().min(2), contactName: z.string().min(2) }).refine(pw, pwErrMsg);
const marketingSchema = z.object({ ...baseFields, companyName: z.string().min(2), contactName: z.string().min(2) }).refine(pw, pwErrMsg);
const baristaSchema = z.object({ ...baseFields, companyName: z.string().min(2), contactName: z.string().min(2) }).refine(pw, pwErrMsg);

// ── Reusable form components ──────────────────────────────────────────────────

function FormField({ id, label, type = "text", placeholder, register, error }: { id: string; label: string; type?: string; placeholder?: string; register: any; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} placeholder={placeholder} data-testid={`input-${id}`} className="rounded-xl px-4 py-5 bg-secondary/30 border-border/50" {...register} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function MultiSelect({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => {
    if (selected.includes(opt)) onChange(selected.filter((s) => s !== opt));
    else onChange([...selected, opt]);
  };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5 p-3 rounded-xl border border-border/50 bg-secondary/20 max-h-32 overflow-y-auto">
        {options.map((opt) => (
          <button key={opt} type="button" onClick={() => toggle(opt)} data-testid={`chip-${opt.replace(/\s/g, "-")}`}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${selected.includes(opt) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border/50 hover:border-primary/50"}`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Role-specific forms ───────────────────────────────────────────────────────

function CafeForm({ onSubmit, isLoading }: { onSubmit: (data: any) => void; isLoading: boolean }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(cafeSchema), defaultValues: { cafeName: "", firstName: "", email: "", phone: "", password: "", confirmPassword: "" } });
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField id="cafeName" label="Nom du café" placeholder="Ex: Café des Arts" register={register("cafeName")} error={errors.cafeName?.message} />
        <FormField id="firstName" label="Prénom" placeholder="Votre prénom" register={register("firstName")} error={errors.firstName?.message} />
      </div>
      <FormField id="reg-email" label="Email" type="email" placeholder="cafe@example.com" register={register("email")} error={errors.email?.message} />
      <FormField id="reg-phone" label="Téléphone" placeholder="+216 XX XXX XXX" register={register("phone")} error={errors.phone?.message} />
      <div className="grid grid-cols-2 gap-3">
        <FormField id="reg-password" label="Mot de passe" type="password" placeholder="••••••••" register={register("password")} error={errors.password?.message} />
        <FormField id="reg-confirm" label="Confirmer" type="password" placeholder="••••••••" register={register("confirmPassword")} error={errors.confirmPassword?.message} />
      </div>
      <p className="text-xs text-amber-600 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> La localisation sera demandée à l'étape suivante.</p>
      <Button type="submit" disabled={isLoading} data-testid="button-register" className="w-full rounded-xl py-5 text-base mt-2 shadow-lg shadow-primary/20">{isLoading ? "Création..." : "Créer le compte"}</Button>
    </form>
  );
}

function SupplierForm({ onSubmit, isLoading }: { onSubmit: (data: any) => void; isLoading: boolean }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(supplierSchema), defaultValues: { companyName: "", contactName: "", email: "", phone: "", password: "", confirmPassword: "" } });
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField id="companyName" label="Nom de l'entreprise" placeholder="Ex: TunRoast SARL" register={register("companyName")} error={errors.companyName?.message} />
        <FormField id="contactName" label="Nom du contact" placeholder="Votre nom" register={register("contactName")} error={errors.contactName?.message} />
      </div>
      <FormField id="reg-email" label="Email" type="email" placeholder="info@company.com" register={register("email")} error={errors.email?.message} />
      <FormField id="reg-phone" label="Téléphone" placeholder="+216 XX XXX XXX" register={register("phone")} error={errors.phone?.message} />
      <div className="grid grid-cols-2 gap-3">
        <FormField id="reg-password" label="Mot de passe" type="password" placeholder="••••••••" register={register("password")} error={errors.password?.message} />
        <FormField id="reg-confirm" label="Confirmer" type="password" placeholder="••••••••" register={register("confirmPassword")} error={errors.confirmPassword?.message} />
      </div>
      <p className="text-xs text-amber-600 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> La localisation GPS sera requise à l'étape suivante.</p>
      <Button type="submit" disabled={isLoading} data-testid="button-register" className="w-full rounded-xl py-5 text-base mt-2 shadow-lg shadow-primary/20">{isLoading ? "Création..." : "Créer le compte"}</Button>
    </form>
  );
}

function DeliveryForm({ onSubmit, isLoading }: { onSubmit: (data: any) => void; isLoading: boolean }) {
  const { register, handleSubmit, formState: { errors }, setValue } = useForm({ resolver: zodResolver(deliverySchema), defaultValues: { firstName: "", lastName: "", email: "", phone: "", password: "", confirmPassword: "", governorates: [] as string[] } });
  const [govs, setGovs] = useState<string[]>([]);
  const updateGovs = (v: string[]) => { setGovs(v); setValue("governorates", v); };
  const doSubmit = (d: any) => onSubmit({ ...d, governorates: govs });
  return (
    <form onSubmit={handleSubmit(doSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField id="firstName" label="Prénom" placeholder="Votre prénom" register={register("firstName")} error={errors.firstName?.message} />
        <FormField id="lastName" label="Nom" placeholder="Votre nom" register={register("lastName")} error={errors.lastName?.message} />
      </div>
      <FormField id="reg-email" label="Email" type="email" placeholder="delivery@example.com" register={register("email")} error={errors.email?.message} />
      <FormField id="reg-phone" label="Téléphone" placeholder="+216 XX XXX XXX" register={register("phone")} error={errors.phone?.message} />
      <div className="grid grid-cols-2 gap-3">
        <FormField id="reg-password" label="Mot de passe" type="password" placeholder="••••••••" register={register("password")} error={errors.password?.message} />
        <FormField id="reg-confirm" label="Confirmer" type="password" placeholder="••••••••" register={register("confirmPassword")} error={errors.confirmPassword?.message} />
      </div>
      <MultiSelect label="Gouvernorats couverts" options={TUNISIAN_GOVERNORATES} selected={govs} onChange={updateGovs} />
      {errors.governorates && <p className="text-xs text-destructive">{errors.governorates.message as string}</p>}
      <Button type="submit" disabled={isLoading} data-testid="button-register" className="w-full rounded-xl py-5 text-base mt-2 shadow-lg shadow-primary/20">{isLoading ? "Création..." : "Créer le compte"}</Button>
    </form>
  );
}

function PrinterForm({ onSubmit, isLoading }: { onSubmit: (data: any) => void; isLoading: boolean }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(printerSchema), defaultValues: { companyName: "", contactName: "", email: "", phone: "", password: "", confirmPassword: "" } });
  const [cats, setCats] = useState<string[]>([]);
  const doSubmit = (d: any) => onSubmit({ ...d, printCategories: cats });
  return (
    <form onSubmit={handleSubmit(doSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField id="companyName" label="Nom de l'imprimerie" placeholder="Ex: ImprimTunis" register={register("companyName")} error={errors.companyName?.message} />
        <FormField id="contactName" label="Contact" placeholder="Votre nom" register={register("contactName")} error={errors.contactName?.message} />
      </div>
      <FormField id="reg-email" label="Email" type="email" placeholder="info@imprimerie.com" register={register("email")} error={errors.email?.message} />
      <FormField id="reg-phone" label="Téléphone" placeholder="+216 XX XXX XXX" register={register("phone")} error={errors.phone?.message} />
      <div className="grid grid-cols-2 gap-3">
        <FormField id="reg-password" label="Mot de passe" type="password" placeholder="••••••••" register={register("password")} error={errors.password?.message} />
        <FormField id="reg-confirm" label="Confirmer" type="password" placeholder="••••••••" register={register("confirmPassword")} error={errors.confirmPassword?.message} />
      </div>
      <MultiSelect label="Catégories d'impression" options={PRINT_CATS} selected={cats} onChange={setCats} />
      <p className="text-xs text-amber-600 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> La localisation sera requise à l'étape suivante.</p>
      <Button type="submit" disabled={isLoading} data-testid="button-register" className="w-full rounded-xl py-5 text-base mt-2 shadow-lg shadow-primary/20">{isLoading ? "Création..." : "Créer le compte"}</Button>
    </form>
  );
}

function MarketingForm({ onSubmit, isLoading }: { onSubmit: (data: any) => void; isLoading: boolean }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(marketingSchema), defaultValues: { companyName: "", contactName: "", email: "", phone: "", password: "", confirmPassword: "" } });
  const [cats, setCats] = useState<string[]>([]);
  const doSubmit = (d: any) => onSubmit({ ...d, marketingCategories: cats });
  return (
    <form onSubmit={handleSubmit(doSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField id="companyName" label="Nom de l'agence" placeholder="Ex: TunMedia" register={register("companyName")} error={errors.companyName?.message} />
        <FormField id="contactName" label="Contact" placeholder="Votre nom" register={register("contactName")} error={errors.contactName?.message} />
      </div>
      <FormField id="reg-email" label="Email" type="email" placeholder="info@agence.com" register={register("email")} error={errors.email?.message} />
      <FormField id="reg-phone" label="Téléphone" placeholder="+216 XX XXX XXX" register={register("phone")} error={errors.phone?.message} />
      <div className="grid grid-cols-2 gap-3">
        <FormField id="reg-password" label="Mot de passe" type="password" placeholder="••••••••" register={register("password")} error={errors.password?.message} />
        <FormField id="reg-confirm" label="Confirmer" type="password" placeholder="••••••••" register={register("confirmPassword")} error={errors.confirmPassword?.message} />
      </div>
      <MultiSelect label="Services proposés" options={MARKETING_CATS} selected={cats} onChange={setCats} />
      <p className="text-xs text-amber-600 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> La localisation sera requise à l'étape suivante.</p>
      <Button type="submit" disabled={isLoading} data-testid="button-register" className="w-full rounded-xl py-5 text-base mt-2 shadow-lg shadow-primary/20">{isLoading ? "Création..." : "Créer le compte"}</Button>
    </form>
  );
}

function BaristaAcademyForm({ onSubmit, isLoading }: { onSubmit: (data: any) => void; isLoading: boolean }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(baristaSchema), defaultValues: { companyName: "", contactName: "", email: "", phone: "", password: "", confirmPassword: "" } });
  const [specialties, setSpecialties] = useState<string[]>([]);
  const doSubmit = (d: any) => onSubmit({ ...d, categories: specialties });
  return (
    <form onSubmit={handleSubmit(doSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField id="companyName" label="Nom de l'académie" placeholder="Ex: Tunis Barista Academy" register={register("companyName")} error={errors.companyName?.message} />
        <FormField id="contactName" label="Contact" placeholder="Votre nom" register={register("contactName")} error={errors.contactName?.message} />
      </div>
      <FormField id="reg-email" label="Email" type="email" placeholder="info@academy.com" register={register("email")} error={errors.email?.message} />
      <FormField id="reg-phone" label="Téléphone" placeholder="+216 XX XXX XXX" register={register("phone")} error={errors.phone?.message} />
      <div className="grid grid-cols-2 gap-3">
        <FormField id="reg-password" label="Mot de passe" type="password" placeholder="••••••••" register={register("password")} error={errors.password?.message} />
        <FormField id="reg-confirm" label="Confirmer" type="password" placeholder="••••••••" register={register("confirmPassword")} error={errors.confirmPassword?.message} />
      </div>
      <MultiSelect label="Spécialités enseignées" options={BARISTA_SPECIALTIES} selected={specialties} onChange={setSpecialties} />
      <p className="text-xs text-amber-600 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> La localisation sera requise à l'étape suivante.</p>
      <Button type="submit" disabled={isLoading} data-testid="button-register" className="w-full rounded-xl py-5 text-base mt-2 shadow-lg shadow-primary/20">{isLoading ? "Création..." : "Créer le compte"}</Button>
    </form>
  );
}

function BaristaMarketplaceForm({ onSubmit, isLoading }: { onSubmit: (data: any) => void; isLoading: boolean }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(baristaSchema), defaultValues: { companyName: "", contactName: "", email: "", phone: "", password: "", confirmPassword: "" } });
  const [specialties, setSpecialties] = useState<string[]>([]);
  const doSubmit = (d: any) => onSubmit({ ...d, categories: specialties });
  return (
    <form onSubmit={handleSubmit(doSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField id="companyName" label="Nom / Structure" placeholder="Ex: Barista Pro TN" register={register("companyName")} error={errors.companyName?.message} />
        <FormField id="contactName" label="Nom du barista" placeholder="Votre nom" register={register("contactName")} error={errors.contactName?.message} />
      </div>
      <FormField id="reg-email" label="Email" type="email" placeholder="barista@example.com" register={register("email")} error={errors.email?.message} />
      <FormField id="reg-phone" label="Téléphone" placeholder="+216 XX XXX XXX" register={register("phone")} error={errors.phone?.message} />
      <div className="grid grid-cols-2 gap-3">
        <FormField id="reg-password" label="Mot de passe" type="password" placeholder="••••••••" register={register("password")} error={errors.password?.message} />
        <FormField id="reg-confirm" label="Confirmer" type="password" placeholder="••••••••" register={register("confirmPassword")} error={errors.confirmPassword?.message} />
      </div>
      <MultiSelect label="Compétences / spécialités" options={BARISTA_SPECIALTIES} selected={specialties} onChange={setSpecialties} />
      <p className="text-xs text-amber-600 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> La localisation sera requise à l'étape suivante.</p>
      <Button type="submit" disabled={isLoading} data-testid="button-register" className="w-full rounded-xl py-5 text-base mt-2 shadow-lg shadow-primary/20">{isLoading ? "Création..." : "Créer le compte"}</Button>
    </form>
  );
}

// ── Main Landing Page ─────────────────────────────────────────────────────────

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Language & dark mode
  const [lang, setLang] = useState<Lang>("fr");
  const [isDark, setIsDark] = useState(false);
  const t = TRANSLATIONS[lang];
  const isRtl = lang === "tn";

  // Hero carousel
  const [slideIndex, setSlideIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auth modal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [selectedRole, setSelectedRole] = useState("CAFE_OWNER");
  const [roleSubModalOpen, setRoleSubModalOpen] = useState(false);

  // Registration state
  const [isRegistering, setIsRegistering] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<any | null>(null);
  const [authLocationModalOpen, setAuthLocationModalOpen] = useState(false);
  const [registrationDone, setRegistrationDone] = useState(false);
  const [loginPendingState, setLoginPendingState] = useState(false);
  const [isDoingLogin, setIsDoingLogin] = useState(false);
  const [authModalPreLocationClose, setAuthModalPreLocationClose] = useState(false);

  const loginForm = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const { states: serviceStates } = useServiceStates();

  const { data: categories = [] } = useQuery<CategoryWithCount[]>({ queryKey: ["/api/categories"] });
  const { data: landingCfg } = useQuery<LandingConfig>({ queryKey: ["/api/landing-config"] });

  // Carousel slides — use admin config or defaults
  const slides: HeroSlide[] = (landingCfg?.heroSlides && landingCfg.heroSlides.length > 0)
    ? landingCfg.heroSlides
    : DEFAULT_SLIDES;

  // Auto-advance carousel
  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setSlideIndex((i) => (i + 1) % slides.length);
    }, 5000);
  };
  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [slides.length]);

  const goToSlide = (idx: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSlideIndex(idx);
    startTimer();
  };

  const openAuth = (tab: "login" | "register" = "login", role?: string) => {
    if (role) setSelectedRole(role);
    setAuthTab(tab);
    setRegistrationDone(false);
    setLoginPendingState(false);
    setAuthModalOpen(true);
  };

  const handleModalLogin = async (d: { email: string; password: string }) => {
    setIsDoingLogin(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d), credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "Connexion échouée", description: (err as any).message ?? "Email ou mot de passe incorrect." });
        return;
      }
      const userData = await res.json();
      queryClient.setQueryData(["/api/auth/me"], userData);
      const PROVIDER_ROLES_CHECK = ["SUPPLIER", "PRINTER", "MARKETING", "BARISTA_ACADEMY", "BARISTA_MARKETPLACE", "DELIVERY_COMPANY"];
      if (PROVIDER_ROLES_CHECK.includes(userData.role) && userData.status !== "approved") {
        setLoginPendingState(true);
        return;
      }
      setAuthModalOpen(false);
      if (userData.role === "CAFE_OWNER") navigate("/products");
      else navigate("/");
    } catch {
      toast({ variant: "destructive", title: "Connexion échouée", description: "Une erreur s'est produite." });
    } finally {
      setIsDoingLogin(false);
    }
  };

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

  const buildPayload = (role: string, data: any) => {
    const base: any = { role, email: data.email, phone: data.phone, password: data.password };
    switch (role) {
      case "CAFE_OWNER": base.name = `${data.firstName} — ${data.cafeName}`; break;
      case "SUPPLIER": case "PRINTER": case "MARKETING": case "BARISTA_ACADEMY": case "BARISTA_MARKETPLACE":
        base.name = data.companyName; base.categories = data.categories; base.printCategories = data.printCategories; base.marketingCategories = data.marketingCategories; break;
      case "DELIVERY_COMPANY": base.name = `${data.firstName} ${data.lastName}`; base.governorates = data.governorates; break;
    }
    return base;
  };

  const NEED_LOCATION = ["CAFE_OWNER", "SUPPLIER", "PRINTER", "MARKETING", "BARISTA_ACADEMY", "BARISTA_MARKETPLACE"];

  const submitRegistration = async (payload: any) => {
    setIsRegistering(true);
    try {
      await apiRequest("POST", "/api/auth/register", payload);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setRegistrationDone(true);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Inscription échouée", description: err?.message ?? "Une erreur s'est produite." });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleRegister = async (data: any) => {
    const payload = buildPayload(selectedRole, data);
    if (NEED_LOCATION.includes(selectedRole)) {
      setPendingFormData(payload);
      setAuthModalOpen(false);
      setAuthModalPreLocationClose(true);
      setAuthLocationModalOpen(true);
      return;
    }
    await submitRegistration(payload);
  };

  const handleAuthLocationConfirm = async (loc: PickedLocation) => {
    setAuthLocationModalOpen(false);
    setAuthModalPreLocationClose(false);
    if (pendingFormData) {
      const payload = { ...pendingFormData, locationAddress: loc.address, locationLat: parseFloat(loc.lat), locationLng: parseFloat(loc.lng), locationPlaceId: loc.placeId, locationDetails: loc.details ?? null };
      setPendingFormData(null);
      await submitRegistration(payload);
      setAuthModalOpen(true);
    }
  };

  const handleAuthLocationClose = () => {
    setPendingFormData(null);
    setAuthLocationModalOpen(false);
    if (authModalPreLocationClose) { setAuthModalPreLocationClose(false); setAuthModalOpen(true); }
  };

  const roleConfig = ROLES.find((r) => r.id === selectedRole) ?? ROLES[0];
  const activeCategories = categories.filter((c) => (c.productCount ?? 0) > 0);
  const filteredRoles = ROLES.filter((role) => {
    const service = ROLE_TO_SERVICE[role.id];
    if (!service) return true;
    return serviceStates[service] === "VISIBLE";
  });

  const visibleServices = SERVICES.filter((svc) => !svc.service || serviceStates[svc.service] !== "HIDDEN");
  const isPrintVisible = serviceStates.PRINTING !== "HIDDEN";
  const isMarketingVisible = serviceStates.MARKETING !== "HIDDEN";
  const isBaristaVisible = serviceStates.BARISTA !== "HIDDEN";
  const isPrintComingSoon = serviceStates.PRINTING === "COMING_SOON";
  const isMarketingComingSoon = serviceStates.MARKETING === "COMING_SOON";
  const isBaristaComingSoon = serviceStates.BARISTA === "COMING_SOON";

  // Clicking a service icon: open auth modal if not logged in
  const handleServiceClick = (href: string) => {
    if (!user) { openAuth("login"); return; }
    navigate(href);
  };

  // Section images (admin-configured or defaults)
  const shopImg = landingCfg?.shopImage || DEFAULT_SHOP_IMG;
  const printImg = landingCfg?.printImage || DEFAULT_PRINT_IMG;
  const marketingImg = landingCfg?.marketingImage || DEFAULT_MARKETING_IMG;
  const academyImg = landingCfg?.baristaAcademyImage || DEFAULT_ACADEMY_IMG;
  const marketplaceImg = landingCfg?.baristaMarketplaceImage || DEFAULT_MARKETPLACE_IMG;

  // Footer data (admin-configured or defaults)
  const footerEmail = landingCfg?.footerEmail || "contact@bigbosscoffee.tn";
  const footerPhone = landingCfg?.footerPhone || "+216 71 000 000";
  const footerDesc = landingCfg?.footerDescription || t.footerAbout;
  const footerFacebook = landingCfg?.footerFacebook;
  const footerInstagram = landingCfg?.footerInstagram;
  const footerTiktok = landingCfg?.footerTiktok;

  // Dark-mode conditional class helper
  const dk = (light: string, dark: string) => isDark ? dark : light;

  const currentSlide = slides[slideIndex];

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-gray-950 text-white" : "bg-white text-gray-900"}`} dir={isRtl ? "rtl" : "ltr"}>

      {/* ── Navbar ── */}
      <nav className={`sticky top-0 z-50 border-b shadow-sm ${dk("bg-white border-gray-100", "bg-gray-900 border-gray-800")}`}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center">
              <Coffee className="w-5 h-5 text-white" />
            </div>
            <span className={`font-bold text-lg hidden sm:block ${dk("text-gray-900", "text-white")}`}>
              BigBoss<span className="text-amber-500">Coffee</span>
            </span>
          </Link>

          {/* Right controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Dark mode toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dk("hover:bg-gray-100 text-gray-600", "hover:bg-gray-700 text-gray-300")}`}
              aria-label="Toggle dark mode"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Language selector */}
            <div className="relative group">
              <button className={`flex items-center gap-1.5 text-xs font-medium border rounded-full px-3 py-1.5 transition-colors ${dk("text-gray-700 border-gray-200 hover:border-amber-300", "text-gray-200 border-gray-700 hover:border-amber-400")}`}>
                <Globe className="w-3.5 h-3.5 text-amber-500" />
                <span>{lang === "fr" ? "FR" : lang === "en" ? "EN" : "عربي"}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              <div className={`absolute ${isRtl ? "left-0" : "right-0"} top-full mt-1 w-32 rounded-xl border shadow-lg overflow-hidden z-50 hidden group-hover:block ${dk("bg-white border-gray-200", "bg-gray-800 border-gray-700")}`}>
                {(["fr", "en", "tn"] as Lang[]).map((l) => (
                  <button key={l} onClick={() => setLang(l)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${lang === l ? "bg-amber-500 text-white" : dk("hover:bg-gray-50 text-gray-700", "hover:bg-gray-700 text-gray-200")}`}>
                    {l === "fr" ? "🇫🇷 Français" : l === "en" ? "🇬🇧 English" : "🇹🇳 عربي تونسي"}
                  </button>
                ))}
              </div>
            </div>

            {/* Auth / Dashboard */}
            {user ? (
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium hidden sm:block ${dk("text-gray-700", "text-gray-200")}`}>{user.name}</span>
                <Link href="/">
                  <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white rounded-full">
                    {t.dashboard}
                  </Button>
                </Link>
              </div>
            ) : (
              <Button size="sm" data-testid="button-connexion" onClick={() => openAuth("login")}
                className="bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-sm px-5">
                {t.connect}
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero Carousel ── */}
      <section className="relative overflow-hidden" style={{ minHeight: "380px" }}>
        {/* Slide background */}
        {currentSlide.imageUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center transition-all duration-700"
            style={{ backgroundImage: `url('${currentSlide.imageUrl}')` }}
          />
        )}
        {/* Amber overlay — preserves design language */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/90 via-amber-500/85 to-amber-600/90" />

        {/* Content */}
        <div className="relative max-w-4xl mx-auto text-center px-4 pt-10 pb-16">
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2 transition-all duration-500">
            {currentSlide.title}
          </h1>
          <p className="text-amber-100 text-base md:text-lg mb-10 transition-all duration-500">
            {currentSlide.description}
          </p>

          {/* Service icons */}
          <div className="flex justify-center gap-4 md:gap-8 mb-8">
            {visibleServices.map((svc) => {
              const comingSoon = svc.service ? serviceStates[svc.service] === "COMING_SOON" : false;
              return (
                <button key={svc.id} data-testid={`button-service-${svc.id}`}
                  onClick={() => handleServiceClick(svc.href)}
                  className="relative flex flex-col items-center gap-2 group transition-transform hover:-translate-y-1 cursor-pointer">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white shadow-lg flex items-center justify-center group-hover:shadow-xl transition-shadow">
                    <svc.icon className="w-7 h-7 md:w-9 md:h-9 text-amber-600" />
                  </div>
                  <span className="text-white text-xs md:text-sm font-semibold tracking-wide">{svc.label}</span>
                  {comingSoon && (
                    <Badge className="absolute -top-1 -right-1 bg-amber-900/80 text-white text-[9px] px-1.5 py-0 border-0">Bientôt</Badge>
                  )}
                </button>
              );
            })}
          </div>

          {/* Carousel dots */}
          {slides.length > 1 && (
            <div className="flex justify-center gap-2">
              {slides.map((_, i) => (
                <button key={i} onClick={() => goToSlide(i)}
                  className={`transition-all rounded-full ${i === slideIndex ? "w-6 h-2 bg-white" : "w-2 h-2 bg-white/50 hover:bg-white/80"}`}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── SHOP Section ── */}
      {activeCategories.length > 0 && (
        <section className={`py-14 px-4 ${dk("bg-gray-50", "bg-gray-900")}`}>
          <div className="max-w-7xl mx-auto">
            <h2 className={`text-2xl font-bold mb-3 text-center ${dk("text-gray-900", "text-white")}`}>
              {t.shopTitle}
            </h2>
            <p className={`text-center mb-8 ${dk("text-gray-500", "text-gray-400")}`}>{t.shopDesc}</p>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              {/* Left: image */}
              <div className="order-2 md:order-1">
                <img
                  src={shopImg}
                  alt="Shop"
                  className="w-full h-72 object-cover rounded-2xl shadow-md"
                  loading="lazy"
                />
              </div>

              {/* Right: categories (no click) */}
              <div className="order-1 md:order-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                  {activeCategories.slice(0, 6).map((cat) => (
                    <div key={cat.id}
                      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${dk("bg-white border-gray-100 shadow-sm", "bg-gray-800 border-gray-700")}`}>
                      <span className="text-2xl">{cat.icon || "📦"}</span>
                      <span className={`text-xs font-semibold text-center leading-tight ${dk("text-gray-700", "text-gray-200")}`}>{cat.name}</span>
                      {(cat.productCount ?? 0) > 0 && (
                        <span className={`text-[11px] ${dk("text-gray-400", "text-gray-500")}`}>{cat.productCount} produit{cat.productCount !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  ))}
                </div>
                <Button onClick={() => openAuth("register", "CAFE_OWNER")}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl py-5 shadow-lg shadow-amber-200/50" data-testid="button-shop-cta">
                  {t.shopCta} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── PRINT Section ── */}
      {isPrintVisible && (
        <section className={`py-14 px-4 ${dk("bg-white", "bg-gray-950")}`}>
          <div className="max-w-7xl mx-auto">
            <h2 className={`text-2xl font-bold mb-3 text-center flex items-center justify-center gap-2 ${dk("text-gray-900", "text-white")}`}>
              {t.printTitle}
              {isPrintComingSoon && <Badge variant="outline" className="border-blue-200 text-blue-600 bg-blue-50 text-xs">Bientôt</Badge>}
            </h2>
            <p className={`text-center mb-8 ${dk("text-gray-500", "text-gray-400")}`}>{t.printDesc}</p>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              {/* Left: categories (no click) */}
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                  {PRINT_CATEGORIES.slice(0, 6).map((cat) => (
                    <div key={cat.id}
                      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${dk("bg-white border-gray-100 shadow-sm", "bg-gray-800 border-gray-700")}`}>
                      <span className="text-2xl">{cat.icon}</span>
                      <span className={`text-xs font-semibold text-center leading-tight ${dk("text-gray-700", "text-gray-200")}`}>{cat.name}</span>
                    </div>
                  ))}
                </div>
                <Button onClick={() => openAuth("register", "PRINTER")}
                  variant="outline" className={`w-full rounded-xl py-5 border-2 border-blue-300 text-blue-600 hover:bg-blue-50 ${isDark ? "hover:bg-blue-950 border-blue-700 text-blue-400" : ""}`}
                  data-testid="button-print-cta">
                  {t.printCta} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>

              {/* Right: image */}
              <div>
                <img src={printImg} alt="Print" className="w-full h-72 object-cover rounded-2xl shadow-md" loading="lazy" />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── MARKETING Section ── */}
      {isMarketingVisible && (
        <section className={`py-14 px-4 ${dk("bg-gray-50", "bg-gray-900")}`}>
          <div className="max-w-7xl mx-auto">
            <h2 className={`text-2xl font-bold mb-3 text-center flex items-center justify-center gap-2 ${dk("text-gray-900", "text-white")}`}>
              {t.marketingTitle}
              {isMarketingComingSoon && <Badge variant="outline" className="border-purple-200 text-purple-600 bg-purple-50 text-xs">Bientôt</Badge>}
            </h2>
            <p className={`text-center mb-8 ${dk("text-gray-500", "text-gray-400")}`}>{t.marketingDesc}</p>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              {/* Left: image */}
              <div className="order-2 md:order-1">
                <img src={marketingImg} alt="Marketing" className="w-full h-72 object-cover rounded-2xl shadow-md" loading="lazy" />
              </div>

              {/* Right: categories (no click) */}
              <div className="order-1 md:order-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                  {MARKETING_SERVICES.slice(0, 6).map((svc) => (
                    <div key={svc.id}
                      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${dk("bg-white border-gray-100 shadow-sm", "bg-gray-800 border-gray-700")}`}>
                      <span className="text-2xl">{svc.icon}</span>
                      <span className={`text-xs font-semibold text-center leading-tight ${dk("text-gray-700", "text-gray-200")}`}>{svc.label}</span>
                    </div>
                  ))}
                </div>
                <Button onClick={() => openAuth("register", "MARKETING")}
                  variant="outline" className={`w-full rounded-xl py-5 border-2 border-purple-300 text-purple-600 hover:bg-purple-50 ${isDark ? "hover:bg-purple-950 border-purple-700 text-purple-400" : ""}`}
                  data-testid="button-marketing-cta">
                  {t.marketingCta} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── BARISTA Section ── */}
      {isBaristaVisible && (
        <section className={`py-14 px-4 ${dk("bg-white", "bg-gray-950")}`}>
          <div className="max-w-7xl mx-auto">
            <h2 className={`text-2xl font-bold mb-3 text-center flex items-center justify-center gap-2 ${dk("text-gray-900", "text-white")}`}>
              {t.baristaTitle}
              {isBaristaComingSoon && <Badge variant="outline" className="border-green-200 text-green-600 bg-green-50 text-xs">Bientôt</Badge>}
            </h2>

            <div className="grid md:grid-cols-2 gap-6 mt-8">
              {/* Barista Academy card */}
              <div className={`flex flex-col sm:flex-row gap-4 p-6 rounded-2xl border shadow-sm ${dk("bg-gradient-to-br from-green-50 to-emerald-50 border-green-100", "bg-green-950/30 border-green-900")}`}>
                <div className="flex-1">
                  <div className="w-12 h-12 bg-green-500/15 rounded-2xl flex items-center justify-center mb-3">
                    <Coffee className="w-6 h-6 text-green-600" />
                  </div>
                  <h3 className={`text-lg font-bold mb-2 ${dk("text-gray-900", "text-white")}`}>{t.academyName}</h3>
                  <p className={`text-sm leading-relaxed mb-4 ${dk("text-gray-500", "text-gray-400")}`}>{t.academyDesc}</p>
                  <Button onClick={() => openAuth("register", "BARISTA_ACADEMY")}
                    variant="outline" className="border-green-300 text-green-700 hover:bg-green-50 rounded-xl w-full" data-testid="button-barista-academy-cta">
                    {t.academyCta} <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
                {/* Contextual image — right on desktop, below on mobile */}
                <div className="sm:w-36 sm:shrink-0">
                  <img src={academyImg} alt="Barista Academy" className="w-full h-32 sm:h-full object-cover rounded-xl" loading="lazy" />
                </div>
              </div>

              {/* Marketplace Baristas card */}
              <div className={`flex flex-col sm:flex-row gap-4 p-6 rounded-2xl border shadow-sm ${dk("bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100", "bg-blue-950/30 border-blue-900")}`}>
                <div className="flex-1">
                  <div className="w-12 h-12 bg-blue-500/15 rounded-2xl flex items-center justify-center mb-3">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className={`text-lg font-bold mb-2 ${dk("text-gray-900", "text-white")}`}>{t.marketplaceName}</h3>
                  <p className={`text-sm leading-relaxed mb-4 ${dk("text-gray-500", "text-gray-400")}`}>{t.marketplaceDesc}</p>
                  <Button onClick={() => openAuth("register", "BARISTA_MARKETPLACE")}
                    variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50 rounded-xl w-full" data-testid="button-barista-marketplace-cta">
                    {t.marketplaceCta} <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
                {/* Contextual image */}
                <div className="sm:w-36 sm:shrink-0">
                  <img src={marketplaceImg} alt="Barista Marketplace" className="w-full h-32 sm:h-full object-cover rounded-xl" loading="lazy" />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Why BigBossCoffee ── */}
      <section className={`py-14 px-4 ${dk("bg-white", "bg-gray-900")}`}>
        <div className="max-w-5xl mx-auto text-center">
          <h2 className={`text-2xl font-bold mb-3 ${dk("text-gray-900", "text-white")}`}>{t.whyTitle}</h2>
          <p className={`mb-10 max-w-xl mx-auto ${dk("text-gray-500", "text-gray-400")}`}>{t.whySubtitle}</p>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { icon: CheckCircle, title: t.feat1Title, desc: t.feat1Desc },
              { icon: ShoppingBag,  title: t.feat2Title, desc: t.feat2Desc },
              { icon: ArrowRight,   title: t.feat3Title, desc: t.feat3Desc },
            ].map((item) => (
              <div key={item.title} className={`flex flex-col items-center gap-3 p-6 rounded-2xl border ${dk("bg-amber-50 border-amber-100", "bg-amber-950/20 border-amber-900")}`}>
                <div className="w-12 h-12 bg-amber-500/15 rounded-xl flex items-center justify-center">
                  <item.icon className="w-6 h-6 text-amber-600" />
                </div>
                <h3 className={`font-bold ${dk("text-gray-900", "text-white")}`}>{item.title}</h3>
                <p className={`text-sm ${dk("text-gray-500", "text-gray-400")}`}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-14 px-4 bg-amber-500">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-3">{t.ctaTitle}</h2>
          <p className="text-amber-100 mb-6">{t.ctaDesc}</p>
          <Button onClick={() => openAuth("register", "SUPPLIER")}
            className="bg-white text-amber-600 hover:bg-amber-50 font-bold rounded-xl shadow-lg px-8" data-testid="button-become-supplier">
            {t.ctaBtn}
          </Button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-900 text-gray-300 pt-12 pb-6 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                  <Coffee className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-white">BigBoss<span className="text-amber-500">Coffee</span></span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">{footerDesc}</p>
              <div className="flex gap-3 mt-4">
                {footerInstagram && (
                  <a href={footerInstagram} target="_blank" rel="noopener noreferrer" className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-amber-500 transition-colors"><Instagram className="w-4 h-4" /></a>
                )}
                {footerFacebook && (
                  <a href={footerFacebook} target="_blank" rel="noopener noreferrer" className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-amber-500 transition-colors"><Facebook className="w-4 h-4" /></a>
                )}
                {footerTiktok && (
                  <a href={footerTiktok} target="_blank" rel="noopener noreferrer" className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-amber-500 transition-colors">
                    <span className="text-xs font-bold">TK</span>
                  </a>
                )}
                {/* Show placeholder icons if no links configured */}
                {!footerInstagram && !footerFacebook && !footerTiktok && (
                  <>
                    <a href="#" className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-amber-500 transition-colors"><Instagram className="w-4 h-4" /></a>
                    <a href="#" className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-amber-500 transition-colors"><Facebook className="w-4 h-4" /></a>
                    <a href="#" className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-amber-500 transition-colors"><span className="text-xs font-bold">TK</span></a>
                  </>
                )}
              </div>
            </div>

            {/* Services */}
            <div>
              <h4 className="font-semibold text-white mb-4">{t.footerServices}</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={() => handleServiceClick("/products")} className="hover:text-amber-400 transition-colors">{t.shopMarket}</button></li>
                {isPrintVisible && <li><button onClick={() => handleServiceClick("/print")} className="hover:text-amber-400 transition-colors">{t.printMarket}</button></li>}
                {isBaristaVisible && <li><button onClick={() => handleServiceClick("/barista")} className="hover:text-amber-400 transition-colors">{t.baristaService}</button></li>}
                {isMarketingVisible && <li><button onClick={() => handleServiceClick("/marketing")} className="hover:text-amber-400 transition-colors">{t.marketingService}</button></li>}
              </ul>
            </div>

            {/* Liens utiles — registration links for all services */}
            <div>
              <h4 className="font-semibold text-white mb-4">{t.footerLinks}</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-amber-400 transition-colors">{t.aboutLink}</a></li>
                <li><button onClick={() => openAuth("register", "CAFE_OWNER")} className="hover:text-amber-400 transition-colors">{t.becomeCafe}</button></li>
                <li><button onClick={() => openAuth("register", "SUPPLIER")} className="hover:text-amber-400 transition-colors">{t.becomeSupplier}</button></li>
                {isPrintVisible && <li><button onClick={() => openAuth("register", "PRINTER")} className="hover:text-amber-400 transition-colors">{t.becomePrinter}</button></li>}
                {isMarketingVisible && <li><button onClick={() => openAuth("register", "MARKETING")} className="hover:text-amber-400 transition-colors">{t.becomeMarketing}</button></li>}
                {isBaristaVisible && <li><button onClick={() => openAuth("register", "BARISTA_ACADEMY")} className="hover:text-amber-400 transition-colors">{t.becomeBaristaAcademy}</button></li>}
                {isBaristaVisible && <li><button onClick={() => openAuth("register", "BARISTA_MARKETPLACE")} className="hover:text-amber-400 transition-colors">{t.becomeBaristaMarketplace}</button></li>}
                <li><a href="#" className="hover:text-amber-400 transition-colors">{t.faq}</a></li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold text-white mb-4">{t.footerContact}</h4>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2"><Mail className="w-4 h-4 text-amber-500 shrink-0" />{footerEmail}</li>
                <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-amber-500 shrink-0" />{footerPhone}</li>
                <li className="flex items-center gap-2"><MapPin className="w-4 h-4 text-amber-500 shrink-0" />Tunis, Tunisie</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 text-center text-xs text-gray-500">
            © 2026 BigBossCoffee. Tous droits réservés. · <a href="#" className="hover:text-gray-300">Confidentialité</a> · <a href="#" className="hover:text-gray-300">CGU</a>
          </div>
        </div>
      </footer>

      {/* ── Registration location picker ── */}
      <LocationPickerModal open={authLocationModalOpen} mode="account" title="Choisissez votre adresse" required={true}
        onClose={handleAuthLocationClose} onConfirm={handleAuthLocationConfirm} />

      {/* ── Auth modal ── */}
      <Dialog open={authModalOpen} onOpenChange={(open) => { if (!open) { setRegistrationDone(false); setLoginPendingState(false); } setAuthModalOpen(open); }}>
        <DialogContent className="sm:max-w-md w-full rounded-3xl p-0 overflow-hidden max-h-[95vh] flex flex-col">
          <div className="overflow-y-auto flex-1">
            <div className="p-6 sm:p-8">
              {registrationDone ? (
                <div className="flex flex-col items-center text-center gap-5 py-4">
                  <div className="w-16 h-16 rounded-full bg-amber-400 flex items-center justify-center"><Clock className="w-8 h-8 text-amber-500" /></div>
                  <div className="space-y-2">
                    <h2 className="font-bold text-xl text-foreground">Compte créé avec succès !</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">Votre compte est en <strong>attente d'approbation</strong> par un administrateur. L'accès sera disponible dès validation.</p>
                  </div>
                  <Button className="w-full rounded-xl py-5 text-base" data-testid="button-registration-done-close"
                    onClick={() => { setRegistrationDone(false); setAuthModalOpen(false); }}>Compris</Button>
                </div>
              ) : loginPendingState ? (
                <div className="flex flex-col items-center text-center gap-5 py-4">
                  <div className="w-16 h-16 rounded-full bg-amber-400 flex items-center justify-center"><Clock className="w-8 h-8 text-amber-500" /></div>
                  <div className="space-y-2">
                    <h2 className="font-bold text-xl text-foreground">Compte en attente</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">Votre compte est en <strong>attente d'approbation</strong>. Vous serez notifié dès validation.</p>
                  </div>
                  <Button className="w-full rounded-xl py-5 text-base" data-testid="button-login-pending-close"
                    onClick={() => { setLoginPendingState(false); setAuthModalOpen(false); fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then(() => { queryClient.setQueryData(["/api/auth/me"], null); }); }}>
                    Compris
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="bg-primary p-2 rounded-xl text-white shrink-0"><Coffee className="w-5 h-5" /></div>
                    <div>
                      <h2 className="font-bold text-xl text-foreground leading-tight">Bienvenue</h2>
                      <p className="text-sm text-muted-foreground">Connectez-vous ou créez un compte pour démarrer.</p>
                    </div>
                  </div>
                  <Tabs value={authTab} onValueChange={(v) => setAuthTab(v as "login" | "register")} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-5 p-1 bg-secondary/50 rounded-xl">
                      <TabsTrigger value="login" className="rounded-lg py-2" data-testid="tab-login">Connexion</TabsTrigger>
                      <TabsTrigger value="register" className="rounded-lg py-2" data-testid="tab-register">Inscription</TabsTrigger>
                    </TabsList>
                    <TabsContent value="login" className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                      <form onSubmit={loginForm.handleSubmit(handleModalLogin)} className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="login-email">Email ou téléphone</Label>
                          <Input id="login-email" placeholder="email@exemple.com ou +216…" data-testid="input-login-email" className="rounded-xl px-4 py-5 bg-secondary/30 border-border/50" {...loginForm.register("email")} />
                          {loginForm.formState.errors.email && <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="login-password">Mot de passe</Label>
                          <Input id="login-password" type="password" placeholder="••••••••" data-testid="input-login-password" className="rounded-xl px-4 py-5 bg-secondary/30 border-border/50" {...loginForm.register("password")} />
                          {loginForm.formState.errors.password && <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>}
                        </div>
                        <Button type="submit" data-testid="button-login" disabled={isDoingLogin} className="w-full rounded-xl py-5 text-base shadow-lg shadow-primary/25 mt-2">
                          {isDoingLogin ? "Connexion..." : <span className="flex items-center gap-2">Se connecter <ArrowRight className="w-4 h-4" /></span>}
                        </Button>
                      </form>
                      <p className="text-center text-sm text-muted-foreground pt-2">Pas encore de compte ?{" "}
                        <button className="text-primary font-medium hover:underline" onClick={() => setAuthTab("register")}>S'inscrire</button>
                      </p>
                      <div className="flex justify-center pt-1">
                        <button type="button" data-testid="button-back-from-login" onClick={() => setAuthModalOpen(false)}
                          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                          <ChevronLeft className="w-4 h-4" /> Retour
                        </button>
                      </div>
                    </TabsContent>
                    <TabsContent value="register" className="animate-in fade-in slide-in-from-left-4 duration-300">
                      <button type="button" data-testid="button-back-from-register" onClick={() => setAuthTab("login")}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
                        <ChevronLeft className="w-4 h-4" /> Retour à la connexion
                      </button>
                      <div className="mb-4">
                        <Label className="text-xs text-muted-foreground uppercase tracking-widest mb-2 block">Type de compte</Label>
                        <button type="button" data-testid="button-select-role" onClick={() => setRoleSubModalOpen(true)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${roleConfig.bg} ${roleConfig.border} hover:shadow-sm`}>
                          <div className={`w-9 h-9 ${roleConfig.iconBg} rounded-lg flex items-center justify-center shrink-0`}>
                            <roleConfig.icon className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gray-900">{roleConfig.label}</p>
                            <p className="text-xs text-gray-500 truncate">{roleConfig.desc}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                        </button>
                        <Badge variant="outline" className="mt-2 text-xs border-amber-200 text-amber-700 bg-amber-50">En attente d'approbation</Badge>
                      </div>
                      {selectedRole === "CAFE_OWNER"          && <CafeForm onSubmit={handleRegister} isLoading={isRegistering} />}
                      {selectedRole === "SUPPLIER"            && <SupplierForm onSubmit={handleRegister} isLoading={isRegistering} />}
                      {selectedRole === "DELIVERY_COMPANY"    && <DeliveryForm onSubmit={handleRegister} isLoading={isRegistering} />}
                      {selectedRole === "PRINTER"             && <PrinterForm onSubmit={handleRegister} isLoading={isRegistering} />}
                      {selectedRole === "MARKETING"           && <MarketingForm onSubmit={handleRegister} isLoading={isRegistering} />}
                      {selectedRole === "BARISTA_ACADEMY"     && <BaristaAcademyForm onSubmit={handleRegister} isLoading={isRegistering} />}
                      {selectedRole === "BARISTA_MARKETPLACE" && <BaristaMarketplaceForm onSubmit={handleRegister} isLoading={isRegistering} />}
                      <p className="text-center text-sm text-muted-foreground pt-3">Déjà un compte ?{" "}
                        <button className="text-primary font-medium hover:underline" onClick={() => setAuthTab("login")}>Se connecter</button>
                      </p>
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Role selection sub-modal ── */}
      <Dialog open={roleSubModalOpen} onOpenChange={setRoleSubModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-5 text-white">
            <div className="flex items-center gap-3">
              <button type="button" data-testid="button-back-role-modal" onClick={() => setRoleSubModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors shrink-0">
                <ChevronLeft className="w-4 h-4 text-white" />
              </button>
              <div>
                <DialogTitle className="text-lg font-bold text-white leading-tight">Choisissez votre type de compte</DialogTitle>
                <p className="text-amber-100 text-sm mt-0.5">Sélectionnez le profil qui correspond à votre activité.</p>
              </div>
            </div>
          </div>
          <div className="p-5 overflow-y-auto flex-1">
            <div className="flex flex-col gap-3">
              {filteredRoles.map((role) => (
                <button key={role.id} data-testid={`role-card-${role.id}`}
                  onClick={() => { setSelectedRole(role.id); setRoleSubModalOpen(false); }}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 ${role.bg} ${role.border} ${role.hover} transition-all hover:shadow-md text-left w-full group ${selectedRole === role.id ? "ring-2 ring-primary ring-offset-1" : ""}`}>
                  <div className={`w-11 h-11 ${role.iconBg} rounded-xl flex items-center justify-center shrink-0`}>
                    <role.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{role.label}</p>
                    <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{role.desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 group-hover:text-primary transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
