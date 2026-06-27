import { useState, useEffect } from "react";
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
import {
  Coffee, Building2, Truck, ArrowRight, Printer, Megaphone,
  GraduationCap, Users, ChevronLeft, MapPin, Phone, CheckCircle
} from "lucide-react";
import { Redirect, useLocation, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import LocationPickerModal, { type PickedLocation } from "@/components/location-picker-modal";

// ── Role config ───────────────────────────────────────────────────────────────

const ROLES = [
  { id: "CAFE_OWNER",          label: "Café",              icon: Coffee,        color: "text-amber-600",  bg: "bg-amber-50 border-amber-200",  activeBg: "bg-amber-500" },
  { id: "SUPPLIER",            label: "Fournisseur",       icon: Building2,     color: "text-blue-600",   bg: "bg-blue-50 border-blue-200",    activeBg: "bg-blue-500" },
  { id: "DELIVERY_COMPANY",    label: "Livraison",         icon: Truck,         color: "text-green-600",  bg: "bg-green-50 border-green-200",  activeBg: "bg-green-500" },
  { id: "PRINTER",             label: "Imprimerie",        icon: Printer,       color: "text-orange-600", bg: "bg-orange-50 border-orange-200",activeBg: "bg-orange-500" },
  { id: "MARKETING",           label: "Marketing",         icon: Megaphone,     color: "text-purple-600", bg: "bg-purple-50 border-purple-200",activeBg: "bg-purple-500" },
  { id: "BARISTA_ACADEMY",     label: "Barista Academy",   icon: GraduationCap, color: "text-emerald-600",bg: "bg-emerald-50 border-emerald-200",activeBg: "bg-emerald-500" },
  { id: "BARISTA_MARKETPLACE", label: "Marketplace Barista",icon: Users,        color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200",activeBg: "bg-indigo-500" },
];

const TUNISIAN_GOVERNORATES = [
  "Ariana","Béja","Ben Arous","Bizerte","Gabès","Gafsa","Jendouba","Kairouan",
  "Kasserine","Kébili","Le Kef","Mahdia","La Manouba","Médenine","Monastir",
  "Nabeul","Sfax","Sidi Bouzid","Siliana","Sousse","Tataouine","Tozeur","Tunis","Zaghouan"
];

const PRINT_CATS = ["Flyers","Menus","Cartes de visite","Affiches","Enseignes","Packaging","Étiquettes","Banderoles","Gobelets","Kakémonos"];
const MARKETING_CATS = ["Réseaux sociaux","Vidéo","Photographie","SEO","Publicité","Branding","Site web","Influence","Email marketing","Événementiel"];
const SUPPLIER_CATS = ["Café & Grains","Lait & Alternatives","Sirops & Arômes","Équipements","Gobelets & Emballages","Sucre & Condiments","Thé & Infusions","Snacks & Pâtisseries"];
const BARISTA_SPECIALTIES = ["Espresso","Latte Art","Cold Brew","Brewing Methods","Formation barista","Sensory Training","Coffee Roasting","Machine Maintenance"];

// ── Schemas ───────────────────────────────────────────────────────────────────

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

// ── Field helpers ─────────────────────────────────────────────────────────────

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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AuthPage() {
  const { user, login, isLoggingIn } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [isRegistering, setIsRegistering] = useState(false);
  // pendingFormData: form data waiting for location pick before we call /register
  const [pendingFormData, setPendingFormData] = useState<any | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  // Read ?role= param from URL
  const roleParam = new URLSearchParams(search).get("role") ?? "CAFE_OWNER";
  const [selectedRole, setSelectedRole] = useState(roleParam);
  const [tab, setTab] = useState<"login" | "register">("login");

  useEffect(() => {
    const r = new URLSearchParams(search).get("role");
    if (r) { setSelectedRole(r); setTab("register"); }
  }, [search]);

  const loginForm = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  if (user) return <Redirect to="/" />;

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

  const handleRegister = async (data: any) => {
    const payload = buildPayload(selectedRole, data);
    if (NEED_LOCATION.includes(selectedRole)) {
      // Collect location BEFORE registering so it's part of the payload
      setPendingFormData(payload);
      setLocationModalOpen(true);
      return;
    }
    // DELIVERY_COMPANY and others: register directly without location
    await submitRegistration(payload);
  };

  const submitRegistration = async (payload: any) => {
    setIsRegistering(true);
    try {
      await apiRequest("POST", "/api/auth/register", payload);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Inscription échouée", description: err?.message ?? "Une erreur s'est produite." });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleLocationConfirm = async (loc: PickedLocation) => {
    setLocationModalOpen(false);
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
    }
  };

  const roleConfig = ROLES.find((r) => r.id === selectedRole) ?? ROLES[0];

  return (
    <>
      <div className="min-h-screen grid lg:grid-cols-2 bg-background">
        {/* Left — Branding */}
        <div className="hidden lg:flex flex-col justify-center relative p-12 overflow-hidden bg-zinc-950">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/0 pointer-events-none" />
          <img
            src="https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=1200&q=80"
            alt="Premium coffee setup"
            className="absolute inset-0 object-cover w-full h-full opacity-30 mix-blend-overlay"
          />
          <div className="relative z-10 max-w-xl">
            <div className="flex items-center gap-3 mb-8">
              <div className="bg-primary p-3 rounded-2xl text-white shadow-lg shadow-primary/30">
                <Coffee className="w-8 h-8" />
              </div>
              <h1 className="font-display font-bold text-3xl text-white">BigBoss Coffee</h1>
            </div>
            <h2 className="font-display text-5xl font-extrabold text-white leading-tight mb-6">
              La marketplace B2B des cafés tunisiens.
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed mb-12">
              Connectez-vous directement avec les meilleurs fournisseurs, gérez les commandes et suivez les livraisons en temps réel.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {ROLES.slice(0, 4).map((r) => (
                <div key={r.id} className="glass-panel-dark rounded-2xl p-4 border-white/10">
                  <r.icon className="w-6 h-6 text-primary mb-2" />
                  <h3 className="text-white font-semibold text-sm mb-1">{r.label}</h3>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right — Forms */}
        <div className="flex items-center justify-center p-6 lg:p-12 overflow-y-auto">
          <div className="w-full max-w-md">
            <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
              <div className="bg-primary p-2 rounded-xl text-white"><Coffee className="w-6 h-6" /></div>
              <h1 className="font-display font-bold text-2xl text-foreground">BigBoss Coffee</h1>
            </div>

            <Card className="border-border/50 shadow-2xl shadow-black/5 rounded-3xl overflow-hidden backdrop-blur-sm bg-card/95">
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle className="font-display text-2xl">Bienvenue</CardTitle>
                <CardDescription className="text-base">Connectez-vous ou créez un compte pour démarrer.</CardDescription>
              </CardHeader>
              <CardContent className="pt-5">
                <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-5 p-1 bg-secondary/50 rounded-xl">
                    <TabsTrigger value="login" className="rounded-lg py-2" data-testid="tab-login">Connexion</TabsTrigger>
                    <TabsTrigger value="register" className="rounded-lg py-2" data-testid="tab-register">Inscription</TabsTrigger>
                  </TabsList>

                  {/* ── Login tab ── */}
                  <TabsContent value="login" className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <form onSubmit={loginForm.handleSubmit((d) => login(d))} className="space-y-4">
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
                      <Button type="submit" data-testid="button-login" disabled={isLoggingIn} className="w-full rounded-xl py-5 text-base shadow-lg shadow-primary/25 mt-2">
                        {isLoggingIn ? "Connexion..." : <span className="flex items-center gap-2">Se connecter <ArrowRight className="w-4 h-4" /></span>}
                      </Button>
                    </form>
                    <p className="text-center text-sm text-muted-foreground pt-2">
                      Pas encore de compte ?{" "}
                      <button className="text-primary font-medium hover:underline" onClick={() => setTab("register")}>S'inscrire</button>
                    </p>
                  </TabsContent>

                  {/* ── Register tab ── */}
                  <TabsContent value="register" className="animate-in fade-in slide-in-from-left-4 duration-300">
                    {/* Role switcher */}
                    <div className="mb-4">
                      <Label className="text-xs text-muted-foreground uppercase tracking-widest mb-2 block">Type de compte</Label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {ROLES.map((r) => {
                          const isActive = selectedRole === r.id;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              data-testid={`role-btn-${r.id}`}
                              onClick={() => setSelectedRole(r.id)}
                              className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-center transition-all ${
                                isActive ? `border-2 border-primary bg-primary/10` : "border-border/40 bg-secondary/20 hover:border-primary/30"
                              }`}
                            >
                              <r.icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                              <span className={`text-[10px] font-semibold leading-tight ${isActive ? "text-primary" : "text-muted-foreground"}`}>{r.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Role badge */}
                    <div className="flex items-center gap-2 mb-4 p-2.5 rounded-xl bg-secondary/30 border border-border/40">
                      <roleConfig.icon className={`w-4 h-4 ${roleConfig.color}`} />
                      <span className="text-sm font-medium">{roleConfig.label}</span>
                      <Badge variant="outline" className="ml-auto text-xs border-amber-200 text-amber-700 bg-amber-50">En attente d'approbation</Badge>
                    </div>

                    {/* Role-specific form */}
                    {selectedRole === "CAFE_OWNER" && <CafeForm onSubmit={handleRegister} isLoading={isRegistering} />}
                    {selectedRole === "SUPPLIER" && <SupplierForm onSubmit={handleRegister} isLoading={isRegistering} />}
                    {selectedRole === "DELIVERY_COMPANY" && <DeliveryForm onSubmit={handleRegister} isLoading={isRegistering} />}
                    {selectedRole === "PRINTER" && <PrinterForm onSubmit={handleRegister} isLoading={isRegistering} />}
                    {selectedRole === "MARKETING" && <MarketingForm onSubmit={handleRegister} isLoading={isRegistering} />}
                    {selectedRole === "BARISTA_ACADEMY" && <BaristaAcademyForm onSubmit={handleRegister} isLoading={isRegistering} />}
                    {selectedRole === "BARISTA_MARKETPLACE" && <BaristaMarketplaceForm onSubmit={handleRegister} isLoading={isRegistering} />}

                    <p className="text-center text-sm text-muted-foreground pt-3">
                      Déjà un compte ?{" "}
                      <button className="text-primary font-medium hover:underline" onClick={() => setTab("login")}>Se connecter</button>
                    </p>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Location Picker modal — triggered before registration for location-required roles */}
      <LocationPickerModal
        open={locationModalOpen}
        mode="account"
        title="Choisissez votre adresse"
        required={true}
        onClose={() => { setPendingFormData(null); setLocationModalOpen(false); }}
        onConfirm={handleLocationConfirm}
      />
    </>
  );
}
