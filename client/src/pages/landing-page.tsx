import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ShoppingBag, Printer, Coffee, Megaphone, Search, MapPin,
  ChevronDown, User, Instagram, Facebook, Twitter, Mail,
  Phone, ArrowRight, CheckCircle, Building2, Truck, GraduationCap, Users, ChevronRight,
  ChevronLeft, Clock
} from "lucide-react";
import { Link, Redirect } from "wouter";
import type { CategoryWithCount } from "@shared/schema";
import { PRINT_CATEGORIES } from "@/data/print-data";
import { useToast } from "@/hooks/use-toast";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";
import { useSearchLocationStore, formatLocationLabel, pickedToGeoLocation } from "@/store/search-location-store";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useServiceStates, ROLE_TO_SERVICE, type ServiceKey } from "@/hooks/use-service-states";

// ── Services & marketing data ─────────────────────────────────────────────────

const SERVICES = [
  { id: "shop", label: "SHOP", icon: ShoppingBag, href: "/products", active: true },
  { id: "print", label: "PRINT", icon: Printer, href: "/print", active: true, service: "PRINTING" as ServiceKey },
  { id: "barista", label: "BARISTA", icon: Coffee, href: "/barista", active: true, service: "BARISTA" as ServiceKey },
  { id: "marketing", label: "MARKETING", icon: Megaphone, href: "/marketing", active: true, service: "MARKETING" as ServiceKey },
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

// ── Role config (shared by sub-modal + registration form) ─────────────────────

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

const cafeSchema = z.object({ ...baseFields, cafeName: z.string().min(2, "Nom requis"), firstName: z.string().min(2, "Prénom requis") }).refine(pw, pwErrMsg);
const supplierSchema = z.object({ ...baseFields, companyName: z.string().min(2, "Nom requis"), contactName: z.string().min(2, "Nom requis") }).refine(pw, pwErrMsg);
const deliverySchema = z.object({ ...baseFields, firstName: z.string().min(2, "Prénom requis"), lastName: z.string().min(2, "Nom requis"), governorates: z.array(z.string()).min(1, "Sélectionnez au moins un gouvernorat") }).refine(pw, pwErrMsg);
const printerSchema = z.object({ ...baseFields, companyName: z.string().min(2, "Nom requis"), contactName: z.string().min(2, "Nom requis") }).refine(pw, pwErrMsg);
const marketingSchema = z.object({ ...baseFields, companyName: z.string().min(2, "Nom requis"), contactName: z.string().min(2, "Nom requis") }).refine(pw, pwErrMsg);
const baristaSchema = z.object({ ...baseFields, companyName: z.string().min(2, "Nom requis"), contactName: z.string().min(2, "Nom requis") }).refine(pw, pwErrMsg);

// ── Reusable form field components ────────────────────────────────────────────

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
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            data-testid={`chip-${opt.replace(/\s/g, "-")}`}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              selected.includes(opt) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border/50 hover:border-primary/50"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Role-specific registration forms ─────────────────────────────────────────

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
      <Button type="submit" disabled={isLoading} data-testid="button-register" className="w-full rounded-xl py-5 text-base mt-2 shadow-lg shadow-primary/20">
        {isLoading ? "Création..." : "Créer le compte"}
      </Button>
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
      <Button type="submit" disabled={isLoading} data-testid="button-register" className="w-full rounded-xl py-5 text-base mt-2 shadow-lg shadow-primary/20">
        {isLoading ? "Création..." : "Créer le compte"}
      </Button>
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
      <Button type="submit" disabled={isLoading} data-testid="button-register" className="w-full rounded-xl py-5 text-base mt-2 shadow-lg shadow-primary/20">
        {isLoading ? "Création..." : "Créer le compte"}
      </Button>
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
      <Button type="submit" disabled={isLoading} data-testid="button-register" className="w-full rounded-xl py-5 text-base mt-2 shadow-lg shadow-primary/20">
        {isLoading ? "Création..." : "Créer le compte"}
      </Button>
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
      <Button type="submit" disabled={isLoading} data-testid="button-register" className="w-full rounded-xl py-5 text-base mt-2 shadow-lg shadow-primary/20">
        {isLoading ? "Création..." : "Créer le compte"}
      </Button>
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
      <Button type="submit" disabled={isLoading} data-testid="button-register" className="w-full rounded-xl py-5 text-base mt-2 shadow-lg shadow-primary/20">
        {isLoading ? "Création..." : "Créer le compte"}
      </Button>
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
      <Button type="submit" disabled={isLoading} data-testid="button-register" className="w-full rounded-xl py-5 text-base mt-2 shadow-lg shadow-primary/20">
        {isLoading ? "Création..." : "Créer le compte"}
      </Button>
    </form>
  );
}

// ── Main Landing Page ─────────────────────────────────────────────────────────

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Search location state
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const searchLocation = useSearchLocationStore((s) => s.searchLocation);
  const setSearchLocation = useSearchLocationStore((s) => s.setSearchLocation);
  const [search, setSearch] = useState("");

  // Auth modal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [selectedRole, setSelectedRole] = useState("CAFE_OWNER");
  const [roleSubModalOpen, setRoleSubModalOpen] = useState(false);

  // Registration state
  const [isRegistering, setIsRegistering] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<any | null>(null);
  const [authLocationModalOpen, setAuthLocationModalOpen] = useState(false);

  // Post-auth states
  const [registrationDone, setRegistrationDone] = useState(false);
  const [loginPendingState, setLoginPendingState] = useState(false);
  const [isDoingLogin, setIsDoingLogin] = useState(false);
  const [authModalPreLocationClose, setAuthModalPreLocationClose] = useState(false);

  const loginForm = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const { states: serviceStates } = useServiceStates();

  const locationLabel = searchLocation?.address
    ? formatLocationLabel(searchLocation.address)
    : "Tunis";

  const { data: categories = [] } = useQuery<CategoryWithCount[]>({
    queryKey: ["/api/categories"],
  });

  // Open auth modal with optional tab and pre-selected role
  const openAuth = (tab: "login" | "register" = "login", role?: string) => {
    if (role) setSelectedRole(role);
    setAuthTab(tab);
    setRegistrationDone(false);
    setLoginPendingState(false);
    setAuthModalOpen(true);
  };

  // Custom login handler — intercepts pending accounts before navigating away
  const handleModalLogin = async (d: { email: string; password: string }) => {
    setIsDoingLogin(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
        credentials: "include",
      });
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

  // Search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) navigate(`/products?q=${encodeURIComponent(search.trim())}`);
    else navigate("/products");
  };

  // Search location
  const handleLocationConfirm = (loc: PickedLocation) => {
    setSearchLocation(pickedToGeoLocation(loc));
    setLocationPickerOpen(false);
    toast({ title: "📍 Zone de recherche mise à jour", description: formatLocationLabel(loc.address) });
  };

  // Registration logic (mirrored from auth-page.tsx)
  const buildPayload = (role: string, data: any) => {
    const base: any = { role, email: data.email, phone: data.phone, password: data.password };
    switch (role) {
      case "CAFE_OWNER":
        base.name = `${data.firstName} — ${data.cafeName}`;
        break;
      case "SUPPLIER":
      case "PRINTER":
      case "MARKETING":
      case "BARISTA_ACADEMY":
      case "BARISTA_MARKETPLACE":
        base.name = data.companyName;
        base.categories = data.categories;
        base.printCategories = data.printCategories;
        base.marketingCategories = data.marketingCategories;
        break;
      case "DELIVERY_COMPANY":
        base.name = `${data.firstName} ${data.lastName}`;
        base.governorates = data.governorates;
        break;
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
      // Close auth modal first to prevent overlapping Dialog overlays
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
      const payload = {
        ...pendingFormData,
        locationAddress: loc.address,
        locationLat: parseFloat(loc.lat),
        locationLng: parseFloat(loc.lng),
        locationPlaceId: loc.placeId,
        locationDetails: loc.details ?? null,
      };
      setPendingFormData(null);
      await submitRegistration(payload);
      setAuthModalOpen(true);
    }
  };

  const handleAuthLocationClose = () => {
    setPendingFormData(null);
    setAuthLocationModalOpen(false);
    if (authModalPreLocationClose) {
      setAuthModalPreLocationClose(false);
      setAuthModalOpen(true);
    }
  };

  const roleConfig = ROLES.find((r) => r.id === selectedRole) ?? ROLES[0];
  const activeCategories = categories.filter((c) => (c.productCount ?? 0) > 0);

  // Filter roles: hidden AND coming-soon services must not appear in register flow
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

  const goToServiceOrComingSoon = (href: string, _comingSoon: boolean) => {
    navigate(href);
  };

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
                onClick={() => openAuth("login")}
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
            {visibleServices.map((svc) => {
              const comingSoon = svc.service ? serviceStates[svc.service] === "COMING_SOON" : false;
              return (
                <button
                  key={svc.id}
                  data-testid={`button-service-${svc.id}`}
                  onClick={() => goToServiceOrComingSoon(svc.href, comingSoon)}
                  className="relative flex flex-col items-center gap-2 group transition-transform hover:-translate-y-1 cursor-pointer"
                >
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white shadow-lg flex items-center justify-center group-hover:shadow-xl transition-shadow">
                    <svc.icon className="w-7 h-7 md:w-9 md:h-9 text-amber-600" />
                  </div>
                  <span className="text-white text-xs md:text-sm font-semibold tracking-wide">{svc.label}</span>
                  {comingSoon && (
                    <Badge className="absolute -top-1 -right-1 bg-amber-900/80 text-white text-[9px] px-1.5 py-0 border-0">
                      Bientôt
                    </Badge>
                  )}
                </button>
              );
            })}
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
      {isPrintVisible && (
      <section className="py-14 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center flex items-center justify-center gap-2">
            Catégories <span className="text-blue-600">PRINT</span>
            {isPrintComingSoon && <Badge variant="outline" className="border-blue-200 text-blue-600 bg-blue-50 text-xs">Bientôt disponible</Badge>}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {PRINT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                data-testid={`button-print-category-${cat.id}`}
                onClick={() => goToServiceOrComingSoon(`/print?categoryId=${cat.id}`, isPrintComingSoon)}
                className="flex flex-col items-center gap-3 p-5 bg-white rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all border border-gray-100 group"
              >
                <span className="text-3xl">{cat.icon}</span>
                <span className="text-sm font-semibold text-gray-700 text-center leading-tight group-hover:text-blue-600 transition-colors">{cat.name}</span>
              </button>
            ))}
          </div>
          <div className="text-center mt-8">
            <Button onClick={() => goToServiceOrComingSoon("/print", isPrintComingSoon)} variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50 rounded-xl" data-testid="button-see-all-print">
              Voir tous les services PRINT <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>
      )}

      {/* ── MARKETING Services ── */}
      {isMarketingVisible && (
      <section className="py-14 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center flex items-center justify-center gap-2">
            Services <span className="text-purple-600">MARKETING</span>
            {isMarketingComingSoon && <Badge variant="outline" className="border-purple-200 text-purple-600 bg-purple-50 text-xs">Bientôt disponible</Badge>}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {MARKETING_SERVICES.map((svc) => (
              <button
                key={svc.id}
                data-testid={`button-marketing-service-${svc.id}`}
                onClick={() => goToServiceOrComingSoon(`/marketing?service=${svc.id}`, isMarketingComingSoon)}
                className="flex flex-col items-center gap-3 p-5 bg-white rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all border border-gray-100 group"
              >
                <span className="text-3xl">{svc.icon}</span>
                <span className="text-sm font-semibold text-gray-700 text-center leading-tight group-hover:text-purple-600 transition-colors">{svc.label}</span>
              </button>
            ))}
          </div>
          <div className="text-center mt-8">
            <Button onClick={() => goToServiceOrComingSoon("/marketing", isMarketingComingSoon)} variant="outline" className="border-purple-200 text-purple-600 hover:bg-purple-50 rounded-xl" data-testid="button-see-all-marketing">
              Voir tous les prestataires <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>
      )}

      {/* ── BARISTA ── */}
      {isBaristaVisible && (
      <section className="py-14 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center flex items-center justify-center gap-2">
            Services <span className="text-green-600">BARISTA</span>
            {isBaristaComingSoon && <Badge variant="outline" className="border-green-200 text-green-600 bg-green-50 text-xs">Bientôt disponible</Badge>}
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <button
              data-testid="button-barista-academy"
              onClick={() => goToServiceOrComingSoon("/barista?tab=academy", isBaristaComingSoon)}
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
              onClick={() => goToServiceOrComingSoon("/barista?tab=marketplace", isBaristaComingSoon)}
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
      )}

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
          <Button
            onClick={() => openAuth("register", "SUPPLIER")}
            className="bg-white text-amber-600 hover:bg-amber-50 font-bold rounded-xl shadow-lg px-8"
            data-testid="button-become-supplier"
          >
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
                {isPrintVisible && <li><button onClick={() => goToServiceOrComingSoon("/print", isPrintComingSoon)} className="hover:text-amber-400 transition-colors">Marketplace PRINT</button></li>}
                {isBaristaVisible && <li><button onClick={() => goToServiceOrComingSoon("/barista", isBaristaComingSoon)} className="hover:text-amber-400 transition-colors">Services BARISTA</button></li>}
                {isMarketingVisible && <li><button onClick={() => goToServiceOrComingSoon("/marketing", isMarketingComingSoon)} className="hover:text-amber-400 transition-colors">Services MARKETING</button></li>}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Liens utiles</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-amber-400 transition-colors">À propos</a></li>
                <li><button onClick={() => openAuth("register", "SUPPLIER")} className="hover:text-amber-400 transition-colors">Devenir fournisseur</button></li>
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

      {/* ── Search location picker ── */}
      <LocationPickerModal
        open={locationPickerOpen}
        mode="search"
        title="Où voulez-vous rechercher ?"
        onClose={() => setLocationPickerOpen(false)}
        onConfirm={handleLocationConfirm}
        initialAddress={searchLocation?.address}
      />

      {/* ── Registration location picker ── */}
      <LocationPickerModal
        open={authLocationModalOpen}
        mode="account"
        title="Choisissez votre adresse"
        required={true}
        onClose={handleAuthLocationClose}
        onConfirm={handleAuthLocationConfirm}
      />

      {/* ── Auth modal ── */}
      <Dialog open={authModalOpen} onOpenChange={(open) => {
        if (!open) { setRegistrationDone(false); setLoginPendingState(false); }
        setAuthModalOpen(open);
      }}>
        <DialogContent className="sm:max-w-md w-full rounded-3xl p-0 overflow-hidden max-h-[95vh] flex flex-col">
          <div className="overflow-y-auto flex-1">
            <div className="p-6 sm:p-8">

              {/* ── Post-registration pending view ── */}
              {registrationDone ? (
                <div className="flex flex-col items-center text-center gap-5 py-4">
                  <div className="w-16 h-16 rounded-full bg-amber-400 flex items-center justify-center">
                    <Clock className="w-8 h-8 text-amber-500" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="font-bold text-xl text-foreground">Compte créé avec succès !</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                      Votre compte est en <strong>attente d'approbation</strong> par un administrateur.<br />
                      L'accès à la plateforme sera disponible dès que votre compte sera validé.<br />
                      Vous recevrez une notification par email ou téléphone.
                    </p>
                  </div>
                  <Button
                    className="w-full rounded-xl py-5 text-base"
                    data-testid="button-registration-done-close"
                    onClick={() => { setRegistrationDone(false); setAuthModalOpen(false); }}
                  >
                    Compris
                  </Button>
                </div>

              ) : loginPendingState ? (
                /* ── Post-login pending view ── */
                <div className="flex flex-col items-center text-center gap-5 py-4">
                  <div className="w-16 h-16 rounded-full bg-amber-400 flex items-center justify-center">
                    <Clock className="w-8 h-8 text-amber-500" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="font-bold text-xl text-foreground">Compte en attente</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                      Votre compte est en <strong>attente d'approbation</strong> par l'administrateur.<br />
                      Vous ne pouvez pas accéder à l'application pour l'instant.<br />
                      Vous serez notifié dès que votre compte sera approuvé.
                    </p>
                  </div>
                  <Button
                    className="w-full rounded-xl py-5 text-base"
                    data-testid="button-login-pending-close"
                    onClick={() => {
                      setLoginPendingState(false);
                      setAuthModalOpen(false);
                      fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then(() => {
                        queryClient.setQueryData(["/api/auth/me"], null);
                      });
                    }}
                  >
                    Compris
                  </Button>
                </div>

              ) : (
                /* ── Normal login / register view ── */
                <>
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-6">
                    <div className="bg-primary p-2 rounded-xl text-white shrink-0">
                      <Coffee className="w-5 h-5" />
                    </div>
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

                    {/* ── Login tab ── */}
                    <TabsContent value="login" className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                      <form onSubmit={loginForm.handleSubmit(handleModalLogin)} className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="login-email">Email ou téléphone</Label>
                          <Input
                            id="login-email"
                            placeholder="email@exemple.com ou +216…"
                            data-testid="input-login-email"
                            className="rounded-xl px-4 py-5 bg-secondary/30 border-border/50"
                            {...loginForm.register("email")}
                          />
                          {loginForm.formState.errors.email && (
                            <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="login-password">Mot de passe</Label>
                          <Input
                            id="login-password"
                            type="password"
                            placeholder="••••••••"
                            data-testid="input-login-password"
                            className="rounded-xl px-4 py-5 bg-secondary/30 border-border/50"
                            {...loginForm.register("password")}
                          />
                          {loginForm.formState.errors.password && (
                            <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>
                          )}
                        </div>
                        <Button
                          type="submit"
                          data-testid="button-login"
                          disabled={isDoingLogin}
                          className="w-full rounded-xl py-5 text-base shadow-lg shadow-primary/25 mt-2"
                        >
                          {isDoingLogin ? "Connexion..." : <span className="flex items-center gap-2">Se connecter <ArrowRight className="w-4 h-4" /></span>}
                        </Button>
                      </form>
                      <p className="text-center text-sm text-muted-foreground pt-2">
                        Pas encore de compte ?{" "}
                        <button className="text-primary font-medium hover:underline" onClick={() => setAuthTab("register")}>
                          S'inscrire
                        </button>
                      </p>
                      <div className="flex justify-center pt-1">
                        <button
                          type="button"
                          data-testid="button-back-from-login"
                          onClick={() => setAuthModalOpen(false)}
                          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Retour
                        </button>
                      </div>
                    </TabsContent>

                    {/* ── Register tab ── */}
                    <TabsContent value="register" className="animate-in fade-in slide-in-from-left-4 duration-300">
                      <button
                        type="button"
                        data-testid="button-back-from-register"
                        onClick={() => setAuthTab("login")}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Retour à la connexion
                      </button>

                      {/* Type de compte selector */}
                      <div className="mb-4">
                        <Label className="text-xs text-muted-foreground uppercase tracking-widest mb-2 block">
                          Type de compte
                        </Label>
                        <button
                          type="button"
                          data-testid="button-select-role"
                          onClick={() => setRoleSubModalOpen(true)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${roleConfig.bg} ${roleConfig.border} hover:shadow-sm`}
                        >
                          <div className={`w-9 h-9 ${roleConfig.iconBg} rounded-lg flex items-center justify-center shrink-0`}>
                            <roleConfig.icon className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gray-900">{roleConfig.label}</p>
                            <p className="text-xs text-gray-500 truncate">{roleConfig.desc}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                        </button>
                        <Badge variant="outline" className="mt-2 text-xs border-amber-200 text-amber-700 bg-amber-50">
                          En attente d'approbation
                        </Badge>
                      </div>

                      {/* Role-specific form */}
                      {selectedRole === "CAFE_OWNER"          && <CafeForm onSubmit={handleRegister} isLoading={isRegistering} />}
                      {selectedRole === "SUPPLIER"            && <SupplierForm onSubmit={handleRegister} isLoading={isRegistering} />}
                      {selectedRole === "DELIVERY_COMPANY"    && <DeliveryForm onSubmit={handleRegister} isLoading={isRegistering} />}
                      {selectedRole === "PRINTER"             && <PrinterForm onSubmit={handleRegister} isLoading={isRegistering} />}
                      {selectedRole === "MARKETING"           && <MarketingForm onSubmit={handleRegister} isLoading={isRegistering} />}
                      {selectedRole === "BARISTA_ACADEMY"     && <BaristaAcademyForm onSubmit={handleRegister} isLoading={isRegistering} />}
                      {selectedRole === "BARISTA_MARKETPLACE" && <BaristaMarketplaceForm onSubmit={handleRegister} isLoading={isRegistering} />}

                      <p className="text-center text-sm text-muted-foreground pt-3">
                        Déjà un compte ?{" "}
                        <button className="text-primary font-medium hover:underline" onClick={() => setAuthTab("login")}>
                          Se connecter
                        </button>
                      </p>
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Role selection sub-modal (opened from Inscription tab) ── */}
      <Dialog open={roleSubModalOpen} onOpenChange={setRoleSubModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-5 text-white">
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-testid="button-back-role-modal"
                onClick={() => setRoleSubModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors shrink-0"
              >
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
                <button
                  key={role.id}
                  data-testid={`role-card-${role.id}`}
                  onClick={() => {
                    setSelectedRole(role.id);
                    setRoleSubModalOpen(false);
                  }}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 ${role.bg} ${role.border} ${role.hover} transition-all hover:shadow-md text-left w-full group ${selectedRole === role.id ? "ring-2 ring-primary ring-offset-1" : ""}`}
                >
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
