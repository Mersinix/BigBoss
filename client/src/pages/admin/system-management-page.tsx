import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Printer, Megaphone, Wrench, ShoppingBag, GripVertical, Eye, EyeOff, Clock, Sliders, LayoutTemplate, Image, FootprintsIcon, Plus, Trash2, ChevronDown, ChevronUp, CircleDollarSign, MessageSquare, GraduationCap, Users, Truck, Zap, Search, Flag, Moon, Sun, SunMoon, Car, Store, ShieldCheck } from "lucide-react";
import { useDeliveryPricingSettings, useUpdateDeliveryPricingSettings, VEHICLE_TYPE_LABELS, type DeliveryVehicleType, type DeliveryPricingSettings, useFinancialLedgerEntries, type FinancialLedgerFilters, useAdminSettlements, useApproveSettlement, useVoidSettlement, type SettlementFilters, useSettlementPayments, useCreatePayment, useConfirmPayment, useFailPayment, useReversePayment, type PaymentMethod, useAdminCodReconciliations, useReconcileCod, useAdminRefunds, useRequestRefund, useConfirmRefund, useFailRefund, useCancelRefund, useAdminAdjustments, useCreateAdjustment, useAdminFinancialSummary } from "@/hooks/use-delivery-ecosystem";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useFormatCurrency } from "@/hooks/use-currency";
import { formatDate } from "@/lib/format";
import { usePagination, DataPagination } from "@/components/ui/data-pagination";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ServiceKey, ServiceState, ServiceStatesMap } from "@/hooks/use-service-states";
import { useServiceOrder, type MarketplaceServiceId } from "@/hooks/use-service-order";
import { useHeroActionSettings, type HeroService, type HeroActionSettingsMap } from "@/hooks/use-hero-actions";
import { useAccountDarkModeSettings, type DarkModeAccount, type AccountDarkModeSettingsMap, type AccountThemeMode } from "@/hooks/use-account-dark-mode";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import type { LandingConfig, HeroSlide } from "@shared/schema";

// ── Service visibility ────────────────────────────────────────────────────────

// The old combined "Barista" service/card is retired — Barista Marketplace and
// Barista Academy are now two fully independent services, each with its own
// discovery page (/barista, /academy) AND its own tab in the Coffee Owner's
// "My Account → Reservations" switcher, both controlled by the single card
// below (one source of truth for both surfaces — no "(réservations)"-only card).
const SERVICES: { key: ServiceKey; label: string; description: string; icon: any }[] = [
  { key: "PRINTING",            label: "Printing",             description: "Marketplace PRINT — services d'impression pour les cafés.", icon: Printer },
  { key: "BARISTA_MARKETPLACE", label: "Marketplace Baristas", description: "Page /barista — recrutement de baristas indépendants.", icon: Users },
  { key: "BARISTA_ACADEMY",     label: "Barista Academy",      description: "Page /academy — formations et cours barista.", icon: GraduationCap },
  { key: "MARKETING",           label: "Marketing",            description: "Services MARKETING — agences et prestataires marketing.",   icon: Megaphone },
  { key: "MAINTENANCE",         label: "Maintenance",          description: "Services MAINTENANCE — techniciens pour équipements café.", icon: Wrench },
];

const SERVICE_ORDER_CARDS: { id: MarketplaceServiceId; key?: ServiceKey; label: string; description: string; icon: any }[] = [
  { id: "SHOP", key: undefined, label: "Shop", description: "Marketplace SHOP — produits professionnels pour les cafés.", icon: ShoppingBag },
  ...SERVICES.map((service) => ({ id: service.key === "PRINTING" ? "PRINT" : service.key, key: service.key, label: service.label, description: service.description, icon: service.icon })) as any,
];

const STATE_OPTIONS: { value: ServiceState; label: string; icon: any; badgeClass: string }[] = [
  { value: "VISIBLE",     label: "Visible",      icon: Eye,    badgeClass: "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30" },
  { value: "COMING_SOON", label: "Coming Soon",  icon: Clock,  badgeClass: "bg-amber-400 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30" },
  { value: "HIDDEN",      label: "Hidden",       icon: EyeOff, badgeClass: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-500/15 dark:text-gray-400 dark:border-gray-500/30" },
];

type MessagingSettings = {
  globalVisible: boolean;
  supplierMessagingEnabled: boolean;
  maintenanceMessagingEnabled: boolean;
  baristaMessagingEnabled: boolean;
  academyMessagingEnabled: boolean;
  broadcastsEnabled: boolean;
  gracePeriodMinutes: number;
};

function MessagesSystemSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<MessagingSettings>({ queryKey: ["/api/messages/settings"] });
  const [local, setLocal] = useState<MessagingSettings | null>(null);

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<MessagingSettings>) =>
      apiRequest("PATCH", "/api/admin/messages/settings", updates),
    onSuccess: async (response) => {
      const saved = await response.json();
      setLocal(saved);
      queryClient.setQueryData(["/api/messages/settings"], saved);
      toast({ title: "Messages System updated" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Failed to update Messages System", description: error?.message }),
  });

  const value = local ?? settings;
  const update = (field: keyof MessagingSettings, next: boolean | number) => {
    if (!value) return;
    setLocal({ ...value, [field]: next });
    saveMutation.mutate({ [field]: next });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/10 rounded-xl p-3"><MessageSquare className="w-5 h-5 text-blue-600" /></div>
          <div>
            <CardTitle className="text-base">Messages System</CardTitle>
            <CardDescription className="pt-1">Control messaging availability without deleting conversations or messages.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!value ? <Skeleton className="h-20 w-full" /> : (
          <>
            {([
              ["globalVisible", "Messages visibility", "Allow affected users to access Messages."],
              ["supplierMessagingEnabled", "Supplier ↔ Coffee Owner", "Allow conversations for eligible active Shop orders."],
              ["maintenanceMessagingEnabled", "Maintenance ↔ Coffee Owner", "Allow conversations for eligible active reservations."],
              ["baristaMessagingEnabled", "Barista ↔ Coffee Owner", "Allow conversations for eligible active Barista Marketplace requests."],
              ["academyMessagingEnabled", "Academy ↔ Coffee Owner", "Allow conversations for eligible active Academy registrations."],
              ["broadcastsEnabled", "Admin broadcasts", "Allow new broadcasts; existing broadcast data is preserved."],
            ] as const).map(([field, label, description]) => (
              <div key={field} className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </div>
                <Switch
                  checked={value[field] as boolean}
                  onCheckedChange={(checked) => update(field, checked)}
                  disabled={saveMutation.isPending}
                  aria-label={label}
                />
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-3">
              <div>
                <p className="text-sm font-medium">Post-closure conversation window</p>
                <p className="text-xs text-muted-foreground mt-0.5">Minutes users may continue messaging after an order or reservation closes.</p>
              </div>
              <Input
                type="number"
                min={1}
                max={240}
                className="w-24"
                value={value.gracePeriodMinutes}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isInteger(next) && next >= 1 && next <= 240) update("gracePeriodMinutes", next);
                }}
                disabled={saveMutation.isPending}
                aria-label="Post-closure conversation window in minutes"
              />
            </div>
            <p className="text-xs text-muted-foreground">Admins always retain access to manage Messages, including when visibility is hidden.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Hero Actions (Fast Search / Report icons, per service) ────────────────────

// Independent of SERVICES/STATE_OPTIONS above (whole-service visibility) — this
// only shows/hides the two hero icons (Fast Search, Report) that already exist
// on a service's Coffee Owner page, one switch per icon per service, reusing the
// same card/switch language as MessagesSystemSection. SHOP has no Fast
// Search/Report icons yet (it uses its own separate Flash Mode feature), but its
// switches stay here for forward-consistency with the six-service naming used
// elsewhere — flipping them today has no visible effect on /shop until such
// icons exist there.
const HERO_SERVICES: { key: HeroService; label: string; icon: any }[] = [
  { key: "SHOP",        label: "Shop",                  icon: ShoppingBag },
  { key: "BARISTA",     label: "Marketplace Baristas",  icon: Users },
  { key: "ACADEMY",     label: "Barista Academy",       icon: GraduationCap },
  { key: "MAINTENANCE", label: "Maintenance",           icon: Wrench },
  { key: "PRINT",       label: "Printing",              icon: Printer },
  { key: "MARKETING",   label: "Marketing",             icon: Megaphone },
];

function HeroActionsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useHeroActionSettings();
  const [local, setLocal] = useState<HeroActionSettingsMap | null>(null);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: ({ service, updates }: { service: HeroService; updates: Partial<{ fastSearchEnabled: boolean; reportEnabled: boolean }> }) =>
      apiRequest("PATCH", `/api/admin/hero-actions/${service}`, updates),
    onSuccess: async (response) => {
      const saved = await response.json();
      setLocal(saved);
      queryClient.setQueryData(["/api/hero-actions"], saved);
      toast({ title: "Actions Hero Services mises à jour" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: error?.message }),
  });

  const value = local ?? settings;
  const update = (service: HeroService, field: "fastSearchEnabled" | "reportEnabled", next: boolean) => {
    setLocal({ ...value, [service]: { ...value[service], [field]: next } });
    updateMutation.mutate({ service, updates: { [field]: next } });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500/10 rounded-xl p-3"><Zap className="w-5 h-5 text-amber-600" /></div>
          <div>
            <CardTitle className="text-base">Actions Hero Services</CardTitle>
            <CardDescription className="pt-1">Activer ou désactiver la Recherche rapide et Signaler sur le hero de chaque service, indépendamment.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {HERO_SERVICES.map(({ key, label, icon: Icon }) => (
          <div key={key} className="rounded-xl border border-border/50 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium">{label}</p>
            </div>
            <div className="flex items-center justify-between gap-4 pl-6">
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Recherche rapide</p>
              </div>
              <Switch
                checked={value[key]?.fastSearchEnabled ?? true}
                onCheckedChange={(checked) => update(key, "fastSearchEnabled", checked)}
                disabled={updateMutation.isPending}
                aria-label={`Recherche rapide — ${label}`}
                data-testid={`switch-hero-fastsearch-${key.toLowerCase()}`}
              />
            </div>
            <div className="flex items-center justify-between gap-4 pl-6">
              <div className="flex items-center gap-2">
                <Flag className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Signaler</p>
              </div>
              <Switch
                checked={value[key]?.reportEnabled ?? true}
                onCheckedChange={(checked) => update(key, "reportEnabled", checked)}
                disabled={updateMutation.isPending}
                aria-label={`Signaler — ${label}`}
                data-testid={`switch-hero-report-${key.toLowerCase()}`}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Dark Mode (per service account navbar toggle visibility) ──────────────────

// Independent of both SERVICES (marketplace visibility) and HERO_SERVICES
// (Coffee Owner hero icons) above — this controls whether the dark/light
// toggle appears in each account's own navbar: the original 7 non-Coffee-
// Owner service accounts, plus Supplier and Admin (added once Dark Mode
// support existed for those two areas too — same mechanism, same table,
// see dashboard-layout.tsx). Deliberately does NOT include Coffee Owner
// (its dark mode already exists independently of this control, per the
// original task's own instruction not to touch it).
const DARK_MODE_ACCOUNTS: { key: DarkModeAccount; label: string; icon: any }[] = [
  { key: "BARISTA_ACADEMY",     label: "Barista Academy",     icon: GraduationCap },
  { key: "BARISTA_MARKETPLACE", label: "Barista Marketplace", icon: Users },
  { key: "DELIVERY_COMPANY",    label: "Livraison",           icon: Truck },
  { key: "DRIVER",              label: "Chauffeur",           icon: Car },
  { key: "PRINTER",             label: "Imprimerie",          icon: Printer },
  { key: "MAINTENANCE",         label: "Maintenance",         icon: Wrench },
  { key: "MARKETING",           label: "Marketing",           icon: Megaphone },
  { key: "SUPPLIER",            label: "Supplier",            icon: Store },
  { key: "ADMIN",               label: "Admin",                icon: ShieldCheck },
];

const THEME_MODE_OPTIONS: { value: AccountThemeMode; label: string; icon: any }[] = [
  { value: "BOTH",       label: "Sombre + Clair",     icon: SunMoon },
  { value: "DARK_ONLY",  label: "Sombre uniquement",  icon: Moon },
  { value: "LIGHT_ONLY", label: "Clair uniquement",   icon: Sun },
];

function AccountDarkModeSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useAccountDarkModeSettings();
  const [local, setLocal] = useState<AccountDarkModeSettingsMap | null>(null);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: ({ account, mode }: { account: DarkModeAccount; mode: AccountThemeMode }) =>
      apiRequest("PATCH", `/api/admin/account-dark-mode-settings/${account}`, { mode }),
    onSuccess: async (response) => {
      const saved = await response.json();
      setLocal(saved);
      queryClient.setQueryData(["/api/account-dark-mode-settings"], saved);
      toast({ title: "Mode sombre mis à jour" });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: error?.message }),
  });

  const value = local ?? settings;
  const update = (account: DarkModeAccount, mode: AccountThemeMode) => {
    setLocal({ ...value, [account]: mode });
    updateMutation.mutate({ account, mode });
  };

  return (
    <Card data-testid="card-account-dark-mode">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-slate-500/10 rounded-xl p-3"><Moon className="w-5 h-5 text-slate-600" /></div>
          <div>
            <CardTitle className="text-base">Mode sombre</CardTitle>
            <CardDescription className="pt-1">Choisir le(s) mode(s) de thème autorisé(s) dans la navbar de chaque compte de service — les deux, sombre uniquement, ou clair uniquement. Quand les deux sont autorisés, le compte s'ouvre en mode sombre par défaut.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {DARK_MODE_ACCOUNTS.map(({ key, label, icon: Icon }) => {
          const currentMode = value[key] ?? "BOTH";
          const isPending = updateMutation.isPending && updateMutation.variables?.account === key;
          return (
            <div key={key} className="rounded-xl border border-border/50 p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">{label}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-1.5">
                {THEME_MODE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={currentMode === opt.value ? "default" : "outline"}
                    disabled={isPending}
                    onClick={() => update(key, opt.value)}
                    className={`justify-start gap-1.5 flex-1 text-xs ${currentMode === opt.value ? "bg-slate-700 hover:bg-slate-800 text-white" : ""}`}
                    data-testid={`button-theme-mode-${key.toLowerCase()}-${opt.value.toLowerCase()}`}
                  >
                    <opt.icon className="w-3.5 h-3.5" />{opt.label}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Landing Page Config ───────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">{children}</Label>;
}

function ImageInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <SectionLabel>{label}</SectionLabel>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "https://..."} className="rounded-xl text-sm" />
      {value && (
        <img src={value} alt={label} className="h-20 w-full object-cover rounded-xl mt-1 border border-border/30" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      )}
    </div>
  );
}

function HeroSlidesEditor({ slides, onChange }: { slides: HeroSlide[]; onChange: (s: HeroSlide[]) => void }) {
  const addSlide = () => onChange([...slides, { imageUrl: "", title: "", description: "" }]);
  const removeSlide = (i: number) => onChange(slides.filter((_, idx) => idx !== i));
  const updateSlide = (i: number, field: keyof HeroSlide, val: string) => {
    const next = slides.map((s, idx) => idx === i ? { ...s, [field]: val } : s);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Hero Slides ({slides.length})</SectionLabel>
        <Button size="sm" variant="outline" onClick={addSlide} className="h-7 text-xs gap-1">
          <Plus className="w-3 h-3" /> Ajouter
        </Button>
      </div>
      {slides.map((slide, i) => (
        <div key={i} className="border border-border/50 rounded-xl p-4 space-y-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Slide {i + 1}</span>
            <button onClick={() => removeSlide(i)} className="text-destructive hover:text-destructive/80 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            <SectionLabel>Titre</SectionLabel>
            <Input value={slide.title} onChange={(e) => updateSlide(i, "title", e.target.value)} placeholder="Titre du slide" className="rounded-xl text-sm" />
          </div>
          <div className="space-y-1.5">
            <SectionLabel>Description</SectionLabel>
            <Input value={slide.description} onChange={(e) => updateSlide(i, "description", e.target.value)} placeholder="Description du slide" className="rounded-xl text-sm" />
          </div>
          <ImageInput label="Image de fond (URL)" value={slide.imageUrl} onChange={(v) => updateSlide(i, "imageUrl", v)} />
        </div>
      ))}
      {slides.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border/50 rounded-xl">
          Aucun slide configuré — les slides par défaut seront utilisés.
        </p>
      )}
    </div>
  );
}

function LandingConfigSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: cfg, isLoading } = useQuery<LandingConfig>({ queryKey: ["/api/landing-config"] });

  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [shopImage, setShopImage] = useState("");
  const [printImage, setPrintImage] = useState("");
  const [marketingImage, setMarketingImage] = useState("");
  const [baristaAcademyImage, setBaristaAcademyImage] = useState("");
  const [baristaMarketplaceImage, setBaristaMarketplaceImage] = useState("");
  const [maintenanceImage, setMaintenanceImage] = useState("");
  const [footerDescription, setFooterDescription] = useState("");
  const [footerEmail, setFooterEmail] = useState("");
  const [footerPhone, setFooterPhone] = useState("");
  const [footerFacebook, setFooterFacebook] = useState("");
  const [footerInstagram, setFooterInstagram] = useState("");
  const [footerTiktok, setFooterTiktok] = useState("");

  // Initialise local state from fetched config
  const [initialized, setInitialized] = useState(false);
  if (cfg && !initialized) {
    setSlides(cfg.heroSlides ?? []);
    setShopImage(cfg.shopImage ?? "");
    setPrintImage(cfg.printImage ?? "");
    setMarketingImage(cfg.marketingImage ?? "");
    setBaristaAcademyImage(cfg.baristaAcademyImage ?? "");
    setBaristaMarketplaceImage(cfg.baristaMarketplaceImage ?? "");
    setMaintenanceImage(cfg.maintenanceImage ?? "");
    setFooterDescription(cfg.footerDescription ?? "");
    setFooterEmail(cfg.footerEmail ?? "");
    setFooterPhone(cfg.footerPhone ?? "");
    setFooterFacebook(cfg.footerFacebook ?? "");
    setFooterInstagram(cfg.footerInstagram ?? "");
    setFooterTiktok(cfg.footerTiktok ?? "");
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/admin/landing-config", {
        heroSlides: slides,
        shopImage, printImage, marketingImage,
        baristaAcademyImage, baristaMarketplaceImage,
        maintenanceImage,
        footerDescription, footerEmail, footerPhone,
        footerFacebook, footerInstagram, footerTiktok,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/landing-config"] });
      toast({ title: "✅ Configuration de la Landing Page sauvegardée" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de sauvegarder la configuration." });
    },
  });

  return (
    <Card data-testid="card-landing-config">
      <CardHeader className="pb-3">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-3">
            <div className="bg-muted rounded-lg p-2.5">
              <LayoutTemplate className="w-5 h-5 text-foreground/70" />
            </div>
            <div>
              <CardTitle className="text-base">Landing Page</CardTitle>
              <CardDescription className="pt-1 text-sm">
                Hero, sections, images et contenu du pied de page.
              </CardDescription>
            </div>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="pt-0 space-y-8">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <>
              {/* ── Hero Slides ── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Image className="w-4 h-4 text-amber-500" />
                  <h3 className="font-semibold text-sm">Carousel Hero</h3>
                </div>
                <HeroSlidesEditor slides={slides} onChange={setSlides} />
              </section>

              {/* ── Section Images ── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Image className="w-4 h-4 text-blue-500" />
                  <h3 className="font-semibold text-sm">Images des sections</h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <ImageInput label="Image — Section SHOP" value={shopImage} onChange={setShopImage} />
                  <ImageInput label="Image — Section PRINT" value={printImage} onChange={setPrintImage} />
                  <ImageInput label="Image — Section MARKETING" value={marketingImage} onChange={setMarketingImage} />
                  <ImageInput label="Image — Barista Academy" value={baristaAcademyImage} onChange={setBaristaAcademyImage} />
                  <ImageInput label="Image — Marketplace Barista" value={baristaMarketplaceImage} onChange={setBaristaMarketplaceImage} />
                  <ImageInput label="Image — Maintenance" value={maintenanceImage} onChange={setMaintenanceImage} />
                </div>
              </section>

              {/* ── Footer ── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm">🦶</span>
                  <h3 className="font-semibold text-sm">Pied de page (Footer)</h3>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <SectionLabel>Description</SectionLabel>
                    <Textarea value={footerDescription} onChange={(e) => setFooterDescription(e.target.value)}
                      placeholder="La marketplace B2B dédiée aux professionnels du café en Tunisie."
                      className="rounded-xl text-sm resize-none" rows={2} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <SectionLabel>Email de contact</SectionLabel>
                      <Input value={footerEmail} onChange={(e) => setFooterEmail(e.target.value)} placeholder="contact@bigbosscoffee.tn" className="rounded-xl text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <SectionLabel>Téléphone</SectionLabel>
                      <Input value={footerPhone} onChange={(e) => setFooterPhone(e.target.value)} placeholder="+216 71 000 000" className="rounded-xl text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <SectionLabel>Facebook (URL)</SectionLabel>
                      <Input value={footerFacebook} onChange={(e) => setFooterFacebook(e.target.value)} placeholder="https://facebook.com/bigbosscoffee" className="rounded-xl text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <SectionLabel>Instagram (URL)</SectionLabel>
                      <Input value={footerInstagram} onChange={(e) => setFooterInstagram(e.target.value)} placeholder="https://instagram.com/bigbosscoffee" className="rounded-xl text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <SectionLabel>TikTok (URL)</SectionLabel>
                      <Input value={footerTiktok} onChange={(e) => setFooterTiktok(e.target.value)} placeholder="https://tiktok.com/@bigbosscoffee" className="rounded-xl text-sm" />
                    </div>
                  </div>
                </div>
              </section>

              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl" data-testid="button-save-landing-config">
                {saveMutation.isPending ? "Sauvegarde..." : "Sauvegarder la configuration"}
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Global Currency ───────────────────────────────────────────────────────────

const CURRENCY_OPTIONS: { symbol: string; label: string }[] = [
  { symbol: "DT",   label: "DT — Tunisian Dinar" },
  { symbol: "د.ت",  label: "د.ت — Dinar Tunisien (arabe)" },
  { symbol: "$",    label: "$ — US Dollar" },
  { symbol: "€",    label: "€ — Euro" },
  { symbol: "£",    label: "£ — British Pound" },
  { symbol: "AED",  label: "AED — UAE Dirham" },
  { symbol: "SAR",  label: "SAR — Saudi Riyal" },
  { symbol: "MAD",  label: "MAD — Moroccan Dirham" },
  { symbol: "DZD",  label: "DZD — Algerian Dinar" },
  { symbol: "¥",    label: "¥ — Japanese Yen" },
  { symbol: "₹",    label: "₹ — Indian Rupee" },
  { symbol: "CHF",  label: "CHF — Swiss Franc" },
  { symbol: "CAD",  label: "CAD — Canadian Dollar" },
  { symbol: "AUD",  label: "AUD — Australian Dollar" },
];

function GlobalCurrencySection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ symbol: string }>({ queryKey: ["/api/system-currency"] });

  const saveMutation = useMutation({
    mutationFn: (symbol: string) => apiRequest("PATCH", "/api/admin/system-currency", { symbol }),
    onSuccess: (_data, symbol) => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-currency"] });
      toast({ title: `✅ Currency updated to ${symbol}` });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to update currency", description: "Please try again." });
    },
  });

  const currentSymbol = data?.symbol ?? "DT";

  return (
    <Card data-testid="card-global-currency">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-muted rounded-lg p-2.5">
            <CircleDollarSign className="w-5 h-5 text-foreground/70" />
          </div>
          <div>
            <CardTitle className="text-base">Global Currency</CardTitle>
            <CardDescription className="pt-1 text-sm">
              Currency symbol displayed across the entire platform for all users.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="space-y-3">
            <SectionLabel>Active currency</SectionLabel>
            <Select
              value={currentSymbol}
              onValueChange={(symbol) => saveMutation.mutate(symbol)}
              disabled={saveMutation.isPending}
            >
              <SelectTrigger className="rounded-xl" data-testid="select-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.symbol} value={opt.symbol} data-testid={`option-currency-${opt.symbol}`}>
                    <span className="font-mono font-semibold mr-2">{opt.symbol}</span>
                    <span className="text-muted-foreground text-sm">{opt.label.split("—")[1]?.trim()}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {saveMutation.isPending && (
              <p className="text-xs text-muted-foreground">Saving…</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Delivery Pricing configuration ───────────────────────────────────────────
// One centralized section per task requirement ("Do not scatter configuration
// across unrelated Admin pages") — everything the fee engine in
// server/storage.ts computeDeliveryFee() reads lives here. Vehicle price/km +
// minimum fee, the active surge multiplier, and the default Coffee Owner/
// Supplier fee split. See shared/schema.ts deliveryPricingSettings.

const VEHICLE_TYPES: DeliveryVehicleType[] = ["BICYCLE", "MOTO", "CAR", "VAN", "TRUCK", "OTHER"];

function DeliveryPricingSection() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useDeliveryPricingSettings();
  const update = useUpdateDeliveryPricingSettings();
  const [local, setLocal] = useState<typeof settings | null>(null);

  useEffect(() => { if (settings) setLocal(settings); }, [settings]);

  const value = local ?? settings;
  if (isLoading || !value) {
    return <Card><CardContent className="pt-6"><Skeleton className="h-40 w-full" /></CardContent></Card>;
  }

  const saveVehicle = (type: DeliveryVehicleType, field: "pricePerKmCents" | "minFeeCents", dt: string) => {
    const cents = Math.max(0, Math.round(parseFloat(dt || "0") * 100));
    const nextPricing = { ...value.vehiclePricing, [type]: { ...value.vehiclePricing[type], [field]: cents } };
    setLocal({ ...value, vehiclePricing: nextPricing });
    update.mutate({ vehiclePricing: nextPricing }, {
      onSuccess: () => toast({ title: "Tarification mise à jour" }),
      onError: (e: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: e?.message }),
    });
  };

  // Delivery System V2 Phase 2 — optional per-vehicle capacity. Empty input = unset (no
  // capacity constraint enforced for that dimension); never defaults to 0, which would
  // silently block every assignment instead of leaving the dimension unconstrained.
  const saveVehicleCapacity = (type: DeliveryVehicleType, field: "maxWeightKg" | "maxVolumeL" | "maxPackages", raw: string) => {
    const current = { ...value.vehiclePricing[type] };
    if (raw.trim() === "") { delete (current as any)[field]; }
    else { (current as any)[field] = field === "maxPackages" ? Math.max(0, Math.round(parseFloat(raw))) : Math.max(0, parseFloat(raw)); }
    const nextPricing = { ...value.vehiclePricing, [type]: current };
    setLocal({ ...value, vehiclePricing: nextPricing });
    update.mutate({ vehiclePricing: nextPricing }, {
      onSuccess: () => toast({ title: "Capacité mise à jour" }),
      onError: (e: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: e?.message }),
    });
  };

  const saveField = (field: "defaultVehicleType" | "surgeMultiplierPermille" | "surgeLabel" | "cafeOwnerSharePercent" | "driverPayoutSharePercent"
    | "activeWeatherCondition" | "waitingFreeMinutes" | "waitingPricePerMinuteCents" | "waitingDriverCompensationPerMinuteCents" | "waitingMaxChargeCents" | "maxCombinedMultiplierPermille", val: any) => {
    setLocal({ ...value, [field]: val });
    update.mutate({ [field]: val } as any, {
      onSuccess: () => toast({ title: "Configuration mise à jour" }),
      onError: (e: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: e?.message }),
    });
  };

  // Delivery System V2 Phase 4 — WeatherPricingEngine + DeliverySafetyEngine per-condition
  // config. 'NORMAL' is never configurable (always hardcoded-neutral server-side).
  const saveWeatherConfig = (condition: string, field: "customerMultiplierPermille" | "driverIncentiveCents" | "safetyState" | "restrictedVehicleTypes", val: any) => {
    const current = { ...(value.weatherConditionConfigs?.[condition] ?? {}) };
    (current as any)[field] = val;
    const next = { ...value.weatherConditionConfigs, [condition]: current };
    setLocal({ ...value, weatherConditionConfigs: next });
    update.mutate({ weatherConditionConfigs: next } as any, {
      onSuccess: () => toast({ title: "Configuration météo mise à jour" }),
      onError: (e: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: e?.message }),
    });
  };

  // PeakHourEngine — Admin-defined windows, no hard-coded hours. Whole-array save (same
  // pattern as vehiclePricing/weatherConditionConfigs — the settings row is the single
  // source of truth, one PATCH per change).
  const savePeakHourWindows = (next: DeliveryPricingSettings["peakHourWindows"]) => {
    setLocal({ ...value, peakHourWindows: next });
    update.mutate({ peakHourWindows: next } as any, {
      onSuccess: () => toast({ title: "Heures de pointe mises à jour" }),
      onError: (e: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: e?.message }),
    });
  };
  const addPeakHourWindow = () => savePeakHourWindows([...(value.peakHourWindows ?? []), {
    id: Math.random().toString(36).slice(2), label: "", daysOfWeek: [1, 2, 3, 4, 5],
    startTime: "12:00", endTime: "14:00", customerMultiplierPermille: 1000, driverIncentiveCents: 0, isActive: true,
  }]);
  const updatePeakHourWindow = (id: string, patch: Partial<DeliveryPricingSettings["peakHourWindows"][number]>) =>
    savePeakHourWindows((value.peakHourWindows ?? []).map((w) => w.id === id ? { ...w, ...patch } : w));
  const removePeakHourWindow = (id: string) => savePeakHourWindows((value.peakHourWindows ?? []).filter((w) => w.id !== id));

  // ZonePricingEngine — governorate-match v1 (see server/storage.ts resolveZonePricing doc).
  const saveZones = (next: DeliveryPricingSettings["zones"]) => {
    setLocal({ ...value, zones: next });
    update.mutate({ zones: next } as any, {
      onSuccess: () => toast({ title: "Zones mises à jour" }),
      onError: (e: any) => toast({ variant: "destructive", title: "Échec de la mise à jour", description: e?.message }),
    });
  };
  const addZone = () => saveZones([...(value.zones ?? []), {
    id: Math.random().toString(36).slice(2), name: "", governorateMatch: "", isActive: true,
  }]);
  const updateZone = (id: string, patch: Partial<DeliveryPricingSettings["zones"][number]>) =>
    saveZones((value.zones ?? []).map((z) => z.id === id ? { ...z, ...patch } : z));
  const removeZone = (id: string) => saveZones((value.zones ?? []).filter((z) => z.id !== id));

  const WEATHER_CONDITIONS: { value: string; label: string }[] = [
    { value: "NORMAL", label: "Normal" }, { value: "RAIN", label: "Pluie" },
    { value: "HEAVY_RAIN", label: "Forte pluie" }, { value: "STORM", label: "Orage" }, { value: "EXTREME", label: "Extrême" },
  ];
  const SAFETY_STATES: { value: string; label: string }[] = [
    { value: "ALLOW", label: "Autorisé" }, { value: "ALLOW_WITH_WARNING", label: "Autorisé (avertissement)" },
    { value: "RESTRICT", label: "Restreint (véhicules choisis)" }, { value: "SUSPEND", label: "Suspendu (aucune livraison)" },
  ];
  const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  return (
    <Card data-testid="card-delivery-pricing">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500/10 rounded-lg p-2.5"><Truck className="w-5 h-5 text-indigo-600" /></div>
          <div>
            <CardTitle className="text-base">Tarification des livraisons</CardTitle>
            <CardDescription className="pt-1 text-sm">
              Prix/km et frais minimum par type de véhicule, multiplicateur actif, et répartition par défaut du frais de livraison.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-5">
        <div>
          <SectionLabel>Tarification par véhicule</SectionLabel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="border-b text-left text-muted-foreground text-xs">
                  <th className="p-2">Véhicule</th>
                  <th className="p-2">Prix / km</th>
                  <th className="p-2">Frais minimum</th>
                  <th className="p-2">Poids max (kg)</th>
                  <th className="p-2">Volume max (L)</th>
                  <th className="p-2">Colis max</th>
                </tr>
              </thead>
              <tbody>
                {VEHICLE_TYPES.map((type) => (
                  <tr key={type} className="border-b last:border-0" data-testid={`row-vehicle-pricing-${type}`}>
                    <td className="p-2 font-medium">{VEHICLE_TYPE_LABELS[type]}</td>
                    <td className="p-2">
                      <Input
                        type="number" min={0} step="0.1" className="w-28 h-8"
                        defaultValue={(value.vehiclePricing[type]?.pricePerKmCents ?? 0) / 100}
                        onBlur={(e) => saveVehicle(type, "pricePerKmCents", e.target.value)}
                        data-testid={`input-price-per-km-${type}`}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" min={0} step="0.1" className="w-28 h-8"
                        defaultValue={(value.vehiclePricing[type]?.minFeeCents ?? 0) / 100}
                        onBlur={(e) => saveVehicle(type, "minFeeCents", e.target.value)}
                        data-testid={`input-min-fee-${type}`}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" min={0} step="0.1" className="w-24 h-8" placeholder="—"
                        defaultValue={value.vehiclePricing[type]?.maxWeightKg ?? ""}
                        onBlur={(e) => saveVehicleCapacity(type, "maxWeightKg", e.target.value)}
                        data-testid={`input-max-weight-${type}`}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" min={0} step="0.1" className="w-24 h-8" placeholder="—"
                        defaultValue={value.vehiclePricing[type]?.maxVolumeL ?? ""}
                        onBlur={(e) => saveVehicleCapacity(type, "maxVolumeL", e.target.value)}
                        data-testid={`input-max-volume-${type}`}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" min={0} step="1" className="w-24 h-8" placeholder="—"
                        defaultValue={value.vehiclePricing[type]?.maxPackages ?? ""}
                        onBlur={(e) => saveVehicleCapacity(type, "maxPackages", e.target.value)}
                        data-testid={`input-max-packages-${type}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Montants en DT. Enregistrement automatique en quittant le champ. Capacité (poids/volume/colis) optionnelle — laissez vide pour ne pas contraindre ce véhicule.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border/50">
          <div>
            <SectionLabel>Véhicule par défaut (avant assignation d'un chauffeur)</SectionLabel>
            <Select value={value.defaultVehicleType} onValueChange={(v) => saveField("defaultVehicleType", v)}>
              <SelectTrigger className="mt-1.5" data-testid="select-default-vehicle"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VEHICLE_TYPES.map((t) => <SelectItem key={t} value={t}>{VEHICLE_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <SectionLabel>Répartition Coffee Owner (%) — le reste est à la charge du fournisseur</SectionLabel>
            <Input
              type="number" min={0} max={100} className="mt-1.5"
              defaultValue={value.cafeOwnerSharePercent}
              onBlur={(e) => saveField("cafeOwnerSharePercent", Math.max(0, Math.min(100, Math.round(parseFloat(e.target.value || "0")))))}
              data-testid="input-cafe-owner-share"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border/50">
          <div>
            <SectionLabel><span className="inline-flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Multiplicateur actif (×)</span></SectionLabel>
            <Input
              type="number" min={0} step="0.1" className="mt-1.5"
              defaultValue={value.surgeMultiplierPermille / 1000}
              onBlur={(e) => saveField("surgeMultiplierPermille", Math.max(0, Math.round(parseFloat(e.target.value || "1") * 1000)))}
              data-testid="input-surge-multiplier"
            />
          </div>
          <div>
            <SectionLabel>Motif / étiquette (optionnel)</SectionLabel>
            <Input
              className="mt-1.5" placeholder="ex : Pluie forte, forte chaleur…"
              defaultValue={value.surgeLabel}
              onBlur={(e) => saveField("surgeLabel", e.target.value)}
              data-testid="input-surge-label"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border/50">
          <div>
            <SectionLabel>Part chauffeur / opérateur (%) — reproduit le comportement actuel par défaut (100%)</SectionLabel>
            <Input
              type="number" min={0} max={100} className="mt-1.5"
              defaultValue={value.driverPayoutSharePercent ?? 100}
              onBlur={(e) => saveField("driverPayoutSharePercent", Math.max(0, Math.min(100, Math.round(parseFloat(e.target.value || "100")))))}
              data-testid="input-driver-payout-share"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Part du frais de livraison versée au chauffeur/opérateur assigné. Le reste constitue la marge de l'entreprise de livraison (0 en mode chauffeurs du fournisseur).
            </p>
          </div>
        </div>

        {/* Delivery System V2 Phase 4 — WeatherPricingEngine + DeliverySafetyEngine */}
        <div className="pt-3 border-t border-border/50">
          <SectionLabel><span className="inline-flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Météo — condition active et impact</span></SectionLabel>
          <div className="mt-1.5">
            <Select value={value.activeWeatherCondition ?? "NORMAL"} onValueChange={(v) => saveField("activeWeatherCondition", v)}>
              <SelectTrigger className="w-56" data-testid="select-weather-condition"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEATHER_CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground text-xs">
                  <th className="p-2">Condition</th>
                  <th className="p-2">Multiplicateur client (×)</th>
                  <th className="p-2">Prime chauffeur (DT)</th>
                  <th className="p-2">Sécurité</th>
                  <th className="p-2">Véhicules restreints</th>
                </tr>
              </thead>
              <tbody>
                {WEATHER_CONDITIONS.filter((c) => c.value !== "NORMAL").map((c) => {
                  const cfg = value.weatherConditionConfigs?.[c.value] ?? {};
                  return (
                    <tr key={c.value} className="border-b last:border-0" data-testid={`row-weather-${c.value}`}>
                      <td className="p-2 font-medium">{c.label}</td>
                      <td className="p-2">
                        <Input type="number" min={0} step="0.1" className="w-24 h-8"
                          defaultValue={(cfg.customerMultiplierPermille ?? 1000) / 1000}
                          onBlur={(e) => saveWeatherConfig(c.value, "customerMultiplierPermille", Math.max(0, Math.round(parseFloat(e.target.value || "1") * 1000)))}
                          data-testid={`input-weather-multiplier-${c.value}`} />
                      </td>
                      <td className="p-2">
                        <Input type="number" min={0} step="0.1" className="w-24 h-8"
                          defaultValue={(cfg.driverIncentiveCents ?? 0) / 100}
                          onBlur={(e) => saveWeatherConfig(c.value, "driverIncentiveCents", Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)))}
                          data-testid={`input-weather-incentive-${c.value}`} />
                      </td>
                      <td className="p-2">
                        <Select value={cfg.safetyState ?? "ALLOW"} onValueChange={(v) => saveWeatherConfig(c.value, "safetyState", v)}>
                          <SelectTrigger className="w-44 h-8" data-testid={`select-weather-safety-${c.value}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SAFETY_STATES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {VEHICLE_TYPES.map((t) => {
                            const restricted = (cfg.restrictedVehicleTypes ?? []).includes(t);
                            return (
                              <button key={t} type="button"
                                className={`text-[10px] px-1.5 py-0.5 rounded border ${restricted ? "bg-red-500/10 border-red-400 text-red-600" : "border-border text-muted-foreground"}`}
                                onClick={() => {
                                  const list = cfg.restrictedVehicleTypes ?? [];
                                  const next = restricted ? list.filter((x) => x !== t) : [...list, t];
                                  saveWeatherConfig(c.value, "restrictedVehicleTypes", next);
                                }}
                                data-testid={`toggle-restrict-${c.value}-${t}`}
                              >{VEHICLE_TYPE_LABELS[t]}</button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Aucune API météo n'est intégrée — la condition active est déclarée manuellement ici. "Restreint" bloque l'assignation des véhicules sélectionnés ; "Suspendu" bloque toute nouvelle assignation.
          </p>
        </div>

        {/* Delivery System V2 Phase 4 — PeakHourEngine */}
        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center justify-between">
            <SectionLabel>Heures de pointe</SectionLabel>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addPeakHourWindow} data-testid="button-add-peak-window">
              <Plus className="w-3 h-3 mr-1" />Ajouter
            </Button>
          </div>
          <div className="space-y-2 mt-2">
            {(value.peakHourWindows ?? []).length === 0 && <p className="text-xs text-muted-foreground">Aucune période configurée — le multiplicateur actif ci-dessus reste le seul en vigueur.</p>}
            {(value.peakHourWindows ?? []).map((w) => (
              <div key={w.id} className="border border-border/50 rounded-lg p-2.5 space-y-2" data-testid={`row-peak-window-${w.id}`}>
                <div className="flex items-center gap-2">
                  <Input className="h-8 flex-1" placeholder="Nom (ex: Déjeuner)" defaultValue={w.label} onBlur={(e) => updatePeakHourWindow(w.id, { label: e.target.value })} />
                  <Switch checked={w.isActive} onCheckedChange={(v) => updatePeakHourWindow(w.id, { isActive: v })} />
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => removePeakHourWindow(w.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex gap-1">
                    {DAY_LABELS.map((d, i) => {
                      const on = w.daysOfWeek.includes(i);
                      return (
                        <button key={i} type="button"
                          className={`text-[10px] w-8 h-6 rounded border ${on ? "bg-indigo-500/10 border-indigo-400 text-indigo-600" : "border-border text-muted-foreground"}`}
                          onClick={() => updatePeakHourWindow(w.id, { daysOfWeek: on ? w.daysOfWeek.filter((x) => x !== i) : [...w.daysOfWeek, i] })}
                        >{d}</button>
                      );
                    })}
                  </div>
                  <Input type="time" className="h-8 w-28" defaultValue={w.startTime} onBlur={(e) => updatePeakHourWindow(w.id, { startTime: e.target.value })} />
                  <span className="text-xs text-muted-foreground">→</span>
                  <Input type="time" className="h-8 w-28" defaultValue={w.endTime} onBlur={(e) => updatePeakHourWindow(w.id, { endTime: e.target.value })} />
                  <Input type="number" min={0} step="0.1" className="h-8 w-24" title="Multiplicateur client (×)"
                    defaultValue={w.customerMultiplierPermille / 1000}
                    onBlur={(e) => updatePeakHourWindow(w.id, { customerMultiplierPermille: Math.max(0, Math.round(parseFloat(e.target.value || "1") * 1000)) })} />
                  <Input type="number" min={0} step="0.1" className="h-8 w-24" title="Prime chauffeur (DT)"
                    defaultValue={w.driverIncentiveCents / 100}
                    onBlur={(e) => updatePeakHourWindow(w.id, { driverIncentiveCents: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)) })} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Si plusieurs périodes actives se chevauchent, le multiplicateur le plus élevé s'applique (jamais cumulés).</p>
        </div>

        {/* Delivery System V2 Phase 4 — ZonePricingEngine */}
        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center justify-between">
            <SectionLabel>Zones de livraison</SectionLabel>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addZone} data-testid="button-add-zone">
              <Plus className="w-3 h-3 mr-1" />Ajouter
            </Button>
          </div>
          <div className="space-y-2 mt-2">
            {(value.zones ?? []).length === 0 && <p className="text-xs text-muted-foreground">Aucune zone configurée — aucun ajustement de zone n'est appliqué.</p>}
            {(value.zones ?? []).map((z) => (
              <div key={z.id} className="flex flex-wrap items-center gap-2 border border-border/50 rounded-lg p-2.5" data-testid={`row-zone-${z.id}`}>
                <Input className="h-8 w-40" placeholder="Nom (ex: Zone Nord)" defaultValue={z.name} onBlur={(e) => updateZone(z.id, { name: e.target.value })} />
                <Input className="h-8 w-40" placeholder="Gouvernorat (ex: Ariana)" defaultValue={z.governorateMatch} onBlur={(e) => updateZone(z.id, { governorateMatch: e.target.value })} />
                <Input type="number" min={0} step="0.1" className="h-8 w-24" title="Multiplicateur (×)"
                  defaultValue={z.multiplierPermille != null ? z.multiplierPermille / 1000 : ""} placeholder="×1.0"
                  onBlur={(e) => updateZone(z.id, { multiplierPermille: e.target.value.trim() === "" ? undefined : Math.max(0, Math.round(parseFloat(e.target.value) * 1000)) })} />
                <Input type="number" min={0} step="0.1" className="h-8 w-28" title="Frais minimum (DT)"
                  defaultValue={z.minFeeOverrideCents != null ? z.minFeeOverrideCents / 100 : ""} placeholder="Frais min"
                  onBlur={(e) => updateZone(z.id, { minFeeOverrideCents: e.target.value.trim() === "" ? undefined : Math.max(0, Math.round(parseFloat(e.target.value) * 100)) })} />
                <Switch checked={z.isActive} onCheckedChange={(v) => updateZone(z.id, { isActive: v })} />
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => removeZone(z.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            La zone correspond au gouvernorat de destination (adresse de livraison du café). Le frais minimum de zone ne peut que relever le minimum du véhicule, jamais l'abaisser.
          </p>
        </div>

        {/* Delivery System V2 Phase 4 — WaitingTimePricingEngine */}
        <div className="pt-3 border-t border-border/50">
          <SectionLabel>Temps d'attente (chauffeur chez le fournisseur)</SectionLabel>
          <div className="grid sm:grid-cols-4 gap-3 mt-1.5">
            <div>
              <Label className="text-xs text-muted-foreground">Minutes gratuites</Label>
              <Input type="number" min={0} className="mt-1 h-8" defaultValue={value.waitingFreeMinutes ?? 0}
                onBlur={(e) => saveField("waitingFreeMinutes", Math.max(0, Math.round(parseFloat(e.target.value || "0"))))} data-testid="input-waiting-free-minutes" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Prix/min client (DT)</Label>
              <Input type="number" min={0} step="0.01" className="mt-1 h-8" defaultValue={(value.waitingPricePerMinuteCents ?? 0) / 100}
                onBlur={(e) => saveField("waitingPricePerMinuteCents", Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)))} data-testid="input-waiting-price" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Compensation/min chauffeur (DT)</Label>
              <Input type="number" min={0} step="0.01" className="mt-1 h-8" defaultValue={(value.waitingDriverCompensationPerMinuteCents ?? 0) / 100}
                onBlur={(e) => saveField("waitingDriverCompensationPerMinuteCents", Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)))} data-testid="input-waiting-compensation" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Plafond (DT, optionnel)</Label>
              <Input type="number" min={0} step="0.1" className="mt-1 h-8" placeholder="—" defaultValue={value.waitingMaxChargeCents != null ? value.waitingMaxChargeCents / 100 : ""}
                onBlur={(e) => saveField("waitingMaxChargeCents", e.target.value.trim() === "" ? null : Math.max(0, Math.round(parseFloat(e.target.value) * 100)))} data-testid="input-waiting-max" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Facturé uniquement si le chauffeur a signalé son arrivée chez le fournisseur avant la collecte. Tant que le prix/min est à 0, l'attente n'est jamais facturée.
          </p>
        </div>

        {/* Multiplier Safety (rule 8) */}
        <div className="pt-3 border-t border-border/50">
          <SectionLabel>Plafond de sécurité — multiplicateur combiné maximum (×)</SectionLabel>
          <Input type="number" min={1} step="0.1" className="mt-1.5 w-40"
            defaultValue={(value.maxCombinedMultiplierPermille ?? 100000) / 1000}
            onBlur={(e) => saveField("maxCombinedMultiplierPermille", Math.max(1000, Math.round(parseFloat(e.target.value || "100") * 1000)))}
            data-testid="input-max-combined-multiplier" />
          <p className="text-xs text-muted-foreground mt-1">
            Borne le produit météo × pointe × zone combinés (jamais chaque facteur individuellement, déjà plafonné à sa propre source). Valeur très élevée par défaut = aucune limite réelle tant qu'elle n'est pas ajustée.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Formule appliquée à chaque livraison : distance (chauffeur→fournisseur + fournisseur→café) × prix/km du véhicule × multiplicateur, avec un plancher au frais minimum du véhicule. Les livraisons déjà terminées conservent leur montant historique — un changement ici n'affecte que les nouvelles livraisons et les assignations à venir.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Delivery System V2 Phase 5A — Financial Ledger (Admin-only auditability) ───────────────
// A read-only inspector, not a dashboard (Phase 5B) — see
// docs/bigboss-delivery-financial-ledger.md. Every row is a CALCULATED economic fact, never
// evidence that money physically moved (no settlement/payment system exists yet).

const LEDGER_ENTRY_TYPES = [
  "DELIVERY_CHARGE", "SUPPLIER_CONTRIBUTION", "DRIVER_PAYOUT", "DELIVERY_COMPANY_PAYOUT",
  "BIGBOSS_SUBSIDY", "WEATHER_INCENTIVE", "PEAK_INCENTIVE", "WAITING_COMPENSATION",
  "CANCELLATION_COMPENSATION", "REFUND", "ADJUSTMENT",
];
const LEDGER_STATUSES = ["CALCULATED", "AUTHORIZED", "OWED", "PAID", "REFUNDED", "VOID", "DISPUTED"];
const LEDGER_ACTOR_ROLES = ["CAFE_OWNER", "SUPPLIER", "DRIVER", "DELIVERY_COMPANY", "BIGBOSS"];

function DeliveryFinancialLedgerSection() {
  const [baseFilters, setBaseFilters] = useState<Omit<FinancialLedgerFilters, "page" | "limit">>({});
  // Delivery System V2 Phase 5B — server-side pagination (rule 22: never load the whole
  // ledger). lastTotal tracks the most recently known total across refetches so the shared
  // DataPagination control (built for client-side slicing elsewhere in this app) can still
  // render correct page counts here, where the SERVER does the actual slicing instead.
  const [lastTotal, setLastTotal] = useState(0);
  const pagination = usePagination(lastTotal, 50);
  const { data, isLoading } = useFinancialLedgerEntries({ ...baseFilters, page: pagination.page, limit: pagination.pageSize });
  useEffect(() => { if (data?.total !== undefined) setLastTotal(data.total); }, [data?.total]);
  const entries = data?.entries ?? [];
  const fmt = useFormatCurrency();
  const setFilters = (updater: (f: Omit<FinancialLedgerFilters, "page" | "limit">) => Omit<FinancialLedgerFilters, "page" | "limit">) => {
    setBaseFilters(updater);
    pagination.resetPage();
  };

  return (
    <Card data-testid="card-delivery-financial-ledger">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 rounded-lg p-2.5"><CircleDollarSign className="w-5 h-5 text-emerald-600" /></div>
          <div>
            <CardTitle className="text-base">Grand livre financier des livraisons</CardTitle>
            <CardDescription className="pt-1 text-sm">
              Faits économiques calculés (Phase 5A) — n'indique pas qu'un paiement réel a eu lieu. Voir la documentation pour le modèle complet.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="grid sm:grid-cols-5 gap-2">
          <Input type="number" placeholder="ID livraison" className="h-8 text-sm"
            onBlur={(e) => setFilters((f) => ({ ...f, deliveryId: e.target.value ? Number(e.target.value) : undefined }))}
            data-testid="input-ledger-filter-delivery" />
          <Select value={baseFilters.entryType ?? "ALL"} onValueChange={(v) => setFilters((f) => ({ ...f, entryType: v === "ALL" ? undefined : v }))}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-ledger-filter-type"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les types</SelectItem>
              {LEDGER_ENTRY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={baseFilters.status ?? "ALL"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "ALL" ? undefined : v }))}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-ledger-filter-status"><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              {LEDGER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={baseFilters.actorRole ?? "ALL"} onValueChange={(v) => setFilters((f) => ({ ...f, actorRole: v === "ALL" ? undefined : v }))}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-ledger-filter-actor"><SelectValue placeholder="Acteur" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les acteurs</SelectItem>
              {LEDGER_ACTOR_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" placeholder="ID acteur (fournisseur/chauffeur/entreprise)" className="h-8 text-sm"
            onBlur={(e) => setFilters((f) => ({ ...f, actorUserId: e.target.value ? Number(e.target.value) : undefined }))}
            data-testid="input-ledger-filter-actor-id" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-1.5">Date</th>
                <th className="p-1.5">Commande</th>
                <th className="p-1.5">Livraison</th>
                <th className="p-1.5">Type</th>
                <th className="p-1.5">Acteur</th>
                <th className="p-1.5">Contrepartie</th>
                <th className="p-1.5">Montant</th>
                <th className="p-1.5">Sens</th>
                <th className="p-1.5">Statut</th>
                <th className="p-1.5">Événement source</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={10} className="p-3 text-center text-muted-foreground">Chargement…</td></tr>}
              {!isLoading && (entries ?? []).length === 0 && <tr><td colSpan={10} className="p-3 text-center text-muted-foreground">Aucune entrée</td></tr>}
              {(entries ?? []).map((e) => (
                <tr key={e.id} className="border-b last:border-0" data-testid={`row-ledger-entry-${e.id}`}>
                  <td className="p-1.5 whitespace-nowrap">{formatDate(e.effectiveAt as any)}</td>
                  <td className="p-1.5">#{e.orderId}</td>
                  <td className="p-1.5">#{e.deliveryId}</td>
                  <td className="p-1.5 font-medium">{e.entryType}</td>
                  <td className="p-1.5">{e.actorRole}{e.actorUserId != null ? ` (#${e.actorUserId})` : ""}</td>
                  <td className="p-1.5">{e.counterpartyRole ? `${e.counterpartyRole}${e.counterpartyUserId != null ? ` (#${e.counterpartyUserId})` : ""}` : "—"}</td>
                  <td className="p-1.5">{fmt(e.amountCents)}</td>
                  <td className="p-1.5">{e.direction}</td>
                  <td className="p-1.5">{e.status}</td>
                  <td className="p-1.5 text-muted-foreground">{e.sourceEvent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DataPagination
          page={pagination.page} pageSize={pagination.pageSize} totalItems={lastTotal} totalPages={pagination.totalPages}
          start={pagination.start} end={pagination.end}
          onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize}
          itemLabel="entrées"
        />
      </CardContent>
    </Card>
  );
}

// Delivery System V2 Phase 5C.1 — Settlement Foundation admin inspection (rule 26: a minimal
// inspection view, NOT a payment dashboard/reconciliation UI). Settlements are calculated
// automatically server-side (on DELIVERED) — this section only lets Admin inspect them and
// perform the two allowed mutations (approve/void a still-PENDING settlement).
const SETTLEMENT_ACTOR_ROLES = ["DRIVER", "DELIVERY_COMPANY"];
const SETTLEMENT_STATUSES = ["PENDING", "APPROVED", "PARTIALLY_PAID", "PAID", "VOID"];

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "CARD", "WALLET", "OTHER"];

function SettlementPaymentsDialog({ settlementId, settlementAmountCents, settlementStatus, open, onClose }: { settlementId: number | null; settlementAmountCents: number; settlementStatus: string; open: boolean; onClose: () => void }) {
  const { data: paymentRows, isLoading } = useSettlementPayments(settlementId);
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const create = useCreatePayment();
  const confirm = useConfirmPayment();
  const fail = useFailPayment();
  const reverse = useReversePayment();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [providerReference, setProviderReference] = useState("");
  const canRecord = settlementStatus === "APPROVED" || settlementStatus === "PARTIALLY_PAID";

  const onError = (e: any) => toast({ variant: "destructive", title: "Échec", description: e.message });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* Thin scrollbar treatment — matches the existing Admin Order Details modal's own
          scroll container exactly, same thumb/track/hover classes, not a new scrollbar style. */}
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
        <DialogHeader><DialogTitle>Paiements — Règlement #{settlementId}</DialogTitle></DialogHeader>
        <div className="text-sm text-muted-foreground">Montant du règlement (figé) : {fmt(settlementAmountCents)}</div>
        {canRecord && (
          <div className="grid sm:grid-cols-4 gap-2 items-end border-b pb-3">
            <div>
              <Label className="text-xs">Montant (centimes)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 text-sm" data-testid="input-payment-amount" />
            </div>
            <div>
              <Label className="text-xs">Méthode</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-payment-method"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Référence (optionnel)</Label>
              <Input value={providerReference} onChange={(e) => setProviderReference(e.target.value)} className="h-8 text-sm" data-testid="input-payment-reference" />
            </div>
            <Button size="sm" disabled={!amount || create.isPending} data-testid="button-record-payment"
              onClick={() => {
                if (settlementId == null) return;
                create.mutate({
                  settlementId, amountCents: Number(amount), method, providerReference: providerReference || null,
                  idempotencyKey: `admin-payment-${settlementId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                }, {
                  onSuccess: () => { setAmount(""); setProviderReference(""); },
                  onError,
                });
              }}>
              Enregistrer
            </Button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-1.5">Créé le</th><th className="p-1.5">Montant</th><th className="p-1.5">Méthode</th>
                <th className="p-1.5">Référence</th><th className="p-1.5">Statut</th><th className="p-1.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">Chargement…</td></tr>}
              {!isLoading && (paymentRows ?? []).length === 0 && <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">Aucun paiement</td></tr>}
              {(paymentRows ?? []).map((p) => (
                <tr key={p.id} className="border-b last:border-0" data-testid={`row-payment-${p.id}`}>
                  <td className="p-1.5 whitespace-nowrap">{formatDate(p.createdAt as any)}</td>
                  <td className="p-1.5">{fmt(p.amountCents)}</td>
                  <td className="p-1.5">{p.method}</td>
                  <td className="p-1.5">{p.providerReference ?? "—"}</td>
                  <td className="p-1.5">
                    <Badge variant="outline" className={p.status === "CONFIRMED" ? "text-emerald-600 border-emerald-300" : p.status === "FAILED" || p.status === "REVERSED" ? "text-red-600 border-red-300" : "text-amber-600 border-amber-300"}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="p-1.5">
                    {["INITIATED", "PENDING"].includes(p.status) && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" data-testid={`button-confirm-payment-${p.id}`}
                          disabled={confirm.isPending} onClick={() => confirm.mutate(p.id, { onError })}>Confirmer</Button>
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-destructive" data-testid={`button-fail-payment-${p.id}`}
                          disabled={fail.isPending} onClick={() => fail.mutate(p.id, { onError })}>Échec</Button>
                      </div>
                    )}
                    {p.status === "CONFIRMED" && (
                      <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-destructive" data-testid={`button-reverse-payment-${p.id}`}
                        disabled={reverse.isPending} onClick={() => reverse.mutate(p.id, { onError })}>Annuler (reverse)</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeliverySettlementsSection() {
  const [baseFilters, setBaseFilters] = useState<Omit<SettlementFilters, "page" | "limit">>({});
  const [lastTotal, setLastTotal] = useState(0);
  const pagination = usePagination(lastTotal, 50);
  const { data, isLoading } = useAdminSettlements({ ...baseFilters, page: pagination.page, limit: pagination.pageSize });
  useEffect(() => { if (data?.total !== undefined) setLastTotal(data.total); }, [data?.total]);
  const rows = data?.settlements ?? [];
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const approve = useApproveSettlement();
  const voidMutation = useVoidSettlement();
  const [paymentsFor, setPaymentsFor] = useState<{ id: number; amountCents: number; status: string } | null>(null);
  const setFilters = (updater: (f: Omit<SettlementFilters, "page" | "limit">) => Omit<SettlementFilters, "page" | "limit">) => {
    setBaseFilters(updater);
    pagination.resetPage();
  };

  return (
    <Card data-testid="card-delivery-settlements">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/10 rounded-lg p-2.5"><CircleDollarSign className="w-5 h-5 text-blue-600" /></div>
          <div>
            <CardTitle className="text-base">Règlements de livraison (Phase 5C.1 + 5C.2)</CardTitle>
            <CardDescription className="pt-1 text-sm">
              Obligations de règlement calculées automatiquement à la livraison. Statut de paiement dérivé des paiements confirmés — voir "Paiements" par ligne.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="grid sm:grid-cols-4 gap-2">
          <Input type="number" placeholder="ID livraison" className="h-8 text-sm"
            onBlur={(e) => setFilters((f) => ({ ...f, deliveryId: e.target.value ? Number(e.target.value) : undefined }))}
            data-testid="input-settlement-filter-delivery" />
          <Select value={baseFilters.actorRole ?? "ALL"} onValueChange={(v) => setFilters((f) => ({ ...f, actorRole: v === "ALL" ? undefined : v }))}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-settlement-filter-actor"><SelectValue placeholder="Bénéficiaire" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les bénéficiaires</SelectItem>
              {SETTLEMENT_ACTOR_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={baseFilters.status ?? "ALL"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "ALL" ? undefined : v }))}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-settlement-filter-status"><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              {SETTLEMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" placeholder="ID bénéficiaire" className="h-8 text-sm"
            onBlur={(e) => setFilters((f) => ({ ...f, actorUserId: e.target.value ? Number(e.target.value) : undefined }))}
            data-testid="input-settlement-filter-actor-id" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-1.5">Calculé le</th>
                <th className="p-1.5">Livraison</th>
                <th className="p-1.5">Bénéficiaire</th>
                <th className="p-1.5">Doit être payé par</th>
                <th className="p-1.5">Montant</th>
                <th className="p-1.5">Statut</th>
                <th className="p-1.5">Budget</th>
                <th className="p-1.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="p-3 text-center text-muted-foreground">Chargement…</td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={8} className="p-3 text-center text-muted-foreground">Aucun règlement</td></tr>}
              {rows.map((s) => (
                <tr key={s.id} className="border-b last:border-0" data-testid={`row-settlement-${s.id}`}>
                  <td className="p-1.5 whitespace-nowrap">{formatDate(s.calculatedAt as any)}</td>
                  <td className="p-1.5">#{s.deliveryId}</td>
                  <td className="p-1.5 font-medium">{s.actorRole} (#{s.actorUserId})</td>
                  <td className="p-1.5">{s.counterpartyRole ? `${s.counterpartyRole} (#${s.counterpartyUserId})` : "—"}</td>
                  <td className="p-1.5">{fmt(s.amountCents)}</td>
                  <td className="p-1.5">
                    <Badge variant="outline" className={
                      s.status === "PAID" ? "text-emerald-600 border-emerald-300"
                      : s.status === "PARTIALLY_PAID" ? "text-blue-600 border-blue-300"
                      : s.status === "APPROVED" ? "text-amber-600 border-amber-300"
                      : s.status === "VOID" ? "text-muted-foreground" : "text-amber-600 border-amber-300"
                    }>
                      {s.status}
                    </Badge>
                  </td>
                  <td className="p-1.5">{s.budgetResultAtCalculation === "DEFICIT" ? <span className="text-red-600">DEFICIT</span> : (s.budgetResultAtCalculation ?? "—")}</td>
                  <td className="p-1.5">
                    <div className="flex gap-1 flex-wrap">
                      {s.status === "PENDING" && (
                        <>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" data-testid={`button-approve-settlement-${s.id}`}
                            disabled={approve.isPending}
                            onClick={() => approve.mutate(s.id, { onError: (e: any) => toast({ variant: "destructive", title: "Échec", description: e.message }) })}>
                            Approuver
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-destructive" data-testid={`button-void-settlement-${s.id}`}
                            disabled={voidMutation.isPending}
                            onClick={() => voidMutation.mutate(s.id, { onError: (e: any) => toast({ variant: "destructive", title: "Échec", description: e.message }) })}>
                            Annuler
                          </Button>
                        </>
                      )}
                      {s.status !== "PENDING" && s.status !== "VOID" && (
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" data-testid={`button-payments-settlement-${s.id}`}
                          onClick={() => setPaymentsFor({ id: s.id, amountCents: s.amountCents, status: s.status })}>
                          Paiements
                        </Button>
                      )}
                      {(s.status === "PENDING" || s.status === "VOID") && "—"}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DataPagination
          page={pagination.page} pageSize={pagination.pageSize} totalItems={lastTotal} totalPages={pagination.totalPages}
          start={pagination.start} end={pagination.end}
          onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize}
          itemLabel="règlements"
        />
      </CardContent>
      <SettlementPaymentsDialog
        settlementId={paymentsFor?.id ?? null} settlementAmountCents={paymentsFor?.amountCents ?? 0} settlementStatus={paymentsFor?.status ?? ""}
        open={paymentsFor != null} onClose={() => setPaymentsFor(null)}
      />
    </Card>
  );
}

// Delivery System V2 Phase 5C.2 — Admin Financial Summary. Every category stays strictly
// separate and clearly labeled (rule 6: "Do NOT combine these into one misleading 'profit'
// number") — ECONOMIC (what the pricing/ledger says is owed), SETTLEMENT (grouped/approved
// obligations), PAYMENT (what actually moved), COD (cash collection chain), REFUNDS,
// ADJUSTMENTS.
function AdminFinancialSummarySection() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const { data, isLoading } = useAdminFinancialSummary({ fromDate: fromDate || undefined, toDate: toDate || undefined });
  const fmt = useFormatCurrency();

  const StatRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span>
    </div>
  );

  return (
    <Card data-testid="card-admin-financial-summary">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-purple-500/10 rounded-lg p-2.5"><CircleDollarSign className="w-5 h-5 text-purple-600" /></div>
          <div>
            <CardTitle className="text-base">Résumé financier (Phase 5C.2)</CardTitle>
            <CardDescription className="pt-1 text-sm">Vue d'ensemble par catégorie — jamais combinée en un seul chiffre de "profit".</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="grid sm:grid-cols-2 gap-2">
          <div><Label className="text-xs">Du</Label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 text-sm" data-testid="input-summary-from" /></div>
          <div><Label className="text-xs">Au</Label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 text-sm" data-testid="input-summary-to" /></div>
        </div>
        {isLoading && <div className="text-center text-muted-foreground text-sm py-4">Chargement…</div>}
        {data && (
          <div className="grid md:grid-cols-3 gap-4">
            <div className="border rounded-lg p-3">
              <div className="font-semibold text-sm mb-1">ÉCONOMIQUE (livraisons: {data.economic.deliveryCount})</div>
              <StatRow label="Frais de livraison" value={fmt(data.economic.totalDeliveryFeeCents)} />
              <StatRow label="Payouts chauffeurs" value={fmt(data.economic.totalDriverPayoutCents)} />
              <StatRow label="Payouts entreprises" value={fmt(data.economic.totalCompanyPayoutCents)} />
              <StatRow label="Contributions fournisseurs" value={fmt(data.economic.totalSupplierContributionCents)} />
              <StatRow label="Subventions fournisseurs" value={fmt(data.economic.totalSupplierSubsidyCents)} />
              <StatRow label="Déficits" value={<span className={data.economic.totalDeficitCents > 0 ? "text-red-600" : ""}>{fmt(data.economic.totalDeficitCents)}</span>} />
            </div>
            <div className="border rounded-lg p-3">
              <div className="font-semibold text-sm mb-1">RÈGLEMENT</div>
              {["PENDING", "APPROVED", "PARTIALLY_PAID", "PAID", "VOID"].map((st) => (
                <StatRow key={st} label={st} value={`${data.settlement[st]?.count ?? 0} — ${fmt(data.settlement[st]?.amountCents ?? 0)}`} />
              ))}
              <div className="font-semibold text-sm mt-2 mb-1">PAIEMENT</div>
              {["INITIATED", "PENDING", "CONFIRMED", "FAILED", "REVERSED"].map((st) => (
                <StatRow key={st} label={st} value={`${data.payment[st]?.count ?? 0} — ${fmt(data.payment[st]?.amountCents ?? 0)}`} />
              ))}
            </div>
            <div className="border rounded-lg p-3">
              <div className="font-semibold text-sm mb-1">COD (cash à la livraison)</div>
              {["EXPECTED", "COLLECTED", "REMITTED", "RECONCILED", "DISCREPANCY", "CANCELLED"].map((st) => (
                <StatRow key={st} label={st} value={`${data.cod[st]?.count ?? 0} — ${fmt(data.cod[st]?.expectedCents ?? 0)}`} />
              ))}
              <div className="font-semibold text-sm mt-2 mb-1">REMBOURSEMENTS</div>
              <StatRow label="Confirmés" value={`${data.refunds.confirmedCount} — ${fmt(data.refunds.confirmedAmountCents)}`} />
              <div className="font-semibold text-sm mt-2 mb-1">AJUSTEMENTS</div>
              <StatRow label="Crédit (+)" value={fmt(data.adjustments.creditAmountCents)} />
              <StatRow label="Débit (-)" value={fmt(data.adjustments.debitAmountCents)} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const COD_STATUSES = ["EXPECTED", "COLLECTED", "REMITTED", "RECONCILED", "DISCREPANCY", "CANCELLED"];

function AdminCodReconciliationsSection() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [lastTotal, setLastTotal] = useState(0);
  const pagination = usePagination(lastTotal, 50);
  const { data, isLoading } = useAdminCodReconciliations({ status, page: pagination.page, limit: pagination.pageSize });
  useEffect(() => { if (data?.total !== undefined) setLastTotal(data.total); }, [data?.total]);
  const rows = data?.reconciliations ?? [];
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const reconcile = useReconcileCod();

  return (
    <Card data-testid="card-admin-cod">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-orange-500/10 rounded-lg p-2.5"><CircleDollarSign className="w-5 h-5 text-orange-600" /></div>
          <div>
            <CardTitle className="text-base">Réconciliation Cash à la livraison (COD)</CardTitle>
            <CardDescription className="pt-1 text-sm">DELIVERED ne veut pas dire cash collecté — chaque étape est un fait distinct et explicite.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <Select value={status ?? "ALL"} onValueChange={(v) => { setStatus(v === "ALL" ? undefined : v); pagination.resetPage(); }}>
          <SelectTrigger className="h-8 text-sm w-48" data-testid="select-cod-filter-status"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les statuts</SelectItem>
            {COD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-1.5">Livraison</th><th className="p-1.5">Attendu</th><th className="p-1.5">Collecté</th>
                <th className="p-1.5">Remis</th><th className="p-1.5">Écart</th><th className="p-1.5">Statut</th><th className="p-1.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">Chargement…</td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">Aucune réconciliation COD</td></tr>}
              {rows.map((c) => (
                <tr key={c.id} className="border-b last:border-0" data-testid={`row-cod-${c.id}`}>
                  <td className="p-1.5">#{c.deliveryId}</td>
                  <td className="p-1.5">{fmt(c.expectedAmountCents)}</td>
                  <td className="p-1.5">{c.collectedAmountCents != null ? fmt(c.collectedAmountCents) : "—"}</td>
                  <td className="p-1.5">{c.remittedAmountCents != null ? fmt(c.remittedAmountCents) : "—"}</td>
                  <td className="p-1.5">{c.discrepancyCents != null ? <span className={c.discrepancyCents !== 0 ? "text-red-600 font-medium" : ""}>{fmt(c.discrepancyCents)}</span> : "—"}</td>
                  <td className="p-1.5">
                    <Badge variant="outline" className={c.status === "RECONCILED" ? "text-emerald-600 border-emerald-300" : c.status === "DISCREPANCY" ? "text-red-600 border-red-300" : "text-amber-600 border-amber-300"}>
                      {c.status}
                    </Badge>
                  </td>
                  <td className="p-1.5">
                    {c.status === "REMITTED" ? (
                      <Button size="sm" variant="outline" className="h-6 px-2 text-xs" data-testid={`button-reconcile-cod-${c.deliveryId}`}
                        disabled={reconcile.isPending}
                        onClick={() => reconcile.mutate({ deliveryId: c.deliveryId }, { onError: (e: any) => toast({ variant: "destructive", title: "Échec", description: e.message }) })}>
                        Réconcilier
                      </Button>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DataPagination
          page={pagination.page} pageSize={pagination.pageSize} totalItems={lastTotal} totalPages={pagination.totalPages}
          start={pagination.start} end={pagination.end}
          onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize}
          itemLabel="réconciliations"
        />
      </CardContent>
    </Card>
  );
}

function AdminRefundsAdjustmentsSection() {
  const [lastTotalRefunds, setLastTotalRefunds] = useState(0);
  const refundsPagination = usePagination(lastTotalRefunds, 25);
  const { data: refundData, isLoading: refundsLoading } = useAdminRefunds({ page: refundsPagination.page, limit: refundsPagination.pageSize });
  useEffect(() => { if (refundData?.total !== undefined) setLastTotalRefunds(refundData.total); }, [refundData?.total]);
  const refundRows = refundData?.refunds ?? [];
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const onError = (e: any) => toast({ variant: "destructive", title: "Échec", description: e.message });
  const confirmRefund = useConfirmRefund();
  const failRefund = useFailRefund();
  const cancelRefund = useCancelRefund();

  const [lastTotalAdj, setLastTotalAdj] = useState(0);
  const adjPagination = usePagination(lastTotalAdj, 25);
  const { data: adjData, isLoading: adjLoading } = useAdminAdjustments({ page: adjPagination.page, limit: adjPagination.pageSize });
  useEffect(() => { if (adjData?.total !== undefined) setLastTotalAdj(adjData.total); }, [adjData?.total]);
  const adjRows = adjData?.adjustments ?? [];
  const createAdjustment = useCreateAdjustment();
  const [adjSettlementId, setAdjSettlementId] = useState("");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjDirection, setAdjDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [adjReason, setAdjReason] = useState("");

  return (
    <Card data-testid="card-admin-refunds-adjustments">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-rose-500/10 rounded-lg p-2.5"><CircleDollarSign className="w-5 h-5 text-rose-600" /></div>
          <div>
            <CardTitle className="text-base">Remboursements &amp; Ajustements</CardTitle>
            <CardDescription className="pt-1 text-sm">Toujours des faits additifs — jamais une modification d'un enregistrement existant.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-5">
        <div>
          <div className="font-semibold text-sm mb-2">Remboursements</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-1.5">Créé le</th><th className="p-1.5">Paiement</th><th className="p-1.5">Règlement</th>
                  <th className="p-1.5">Montant</th><th className="p-1.5">Raison</th><th className="p-1.5">Statut</th><th className="p-1.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {refundsLoading && <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">Chargement…</td></tr>}
                {!refundsLoading && refundRows.length === 0 && <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">Aucun remboursement</td></tr>}
                {refundRows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0" data-testid={`row-refund-${r.id}`}>
                    <td className="p-1.5 whitespace-nowrap">{formatDate(r.createdAt as any)}</td>
                    <td className="p-1.5">{r.paymentId ? `#${r.paymentId}` : "—"}</td>
                    <td className="p-1.5">{r.settlementId ? `#${r.settlementId}` : "—"}</td>
                    <td className="p-1.5">{fmt(r.amountCents)}</td>
                    <td className="p-1.5">{r.reason}</td>
                    <td className="p-1.5">
                      <Badge variant="outline" className={r.status === "CONFIRMED" ? "text-emerald-600 border-emerald-300" : r.status === "FAILED" || r.status === "CANCELLED" ? "text-red-600 border-red-300" : "text-amber-600 border-amber-300"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="p-1.5">
                      {r.status === "REQUESTED" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={confirmRefund.isPending} data-testid={`button-confirm-refund-${r.id}`}
                            onClick={() => confirmRefund.mutate(r.id, { onError })}>Confirmer</Button>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-destructive" disabled={failRefund.isPending} data-testid={`button-fail-refund-${r.id}`}
                            onClick={() => failRefund.mutate(r.id, { onError })}>Échec</Button>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={cancelRefund.isPending} data-testid={`button-cancel-refund-${r.id}`}
                            onClick={() => cancelRefund.mutate(r.id, { onError })}>Annuler</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DataPagination
            page={refundsPagination.page} pageSize={refundsPagination.pageSize} totalItems={lastTotalRefunds} totalPages={refundsPagination.totalPages}
            start={refundsPagination.start} end={refundsPagination.end}
            onPageChange={refundsPagination.setPage} onPageSizeChange={refundsPagination.setPageSize}
            itemLabel="remboursements"
          />
          <p className="text-xs text-muted-foreground pt-1">Pour demander un remboursement, utilisez la boîte de dialogue "Paiements" d'un règlement (référence le paiement concerné).</p>
        </div>

        <div className="border-t pt-4">
          <div className="font-semibold text-sm mb-2">Ajustements</div>
          <div className="grid sm:grid-cols-5 gap-2 items-end pb-3">
            <div><Label className="text-xs">ID Règlement</Label><Input type="number" value={adjSettlementId} onChange={(e) => setAdjSettlementId(e.target.value)} className="h-8 text-sm" data-testid="input-adjustment-settlement" /></div>
            <div><Label className="text-xs">Montant (centimes)</Label><Input type="number" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} className="h-8 text-sm" data-testid="input-adjustment-amount" /></div>
            <div>
              <Label className="text-xs">Sens</Label>
              <Select value={adjDirection} onValueChange={(v) => setAdjDirection(v as "CREDIT" | "DEBIT")}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-adjustment-direction"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="CREDIT">CREDIT (+)</SelectItem><SelectItem value="DEBIT">DEBIT (-)</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Raison</Label><Input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} className="h-8 text-sm" data-testid="input-adjustment-reason" /></div>
            <Button size="sm" disabled={!adjSettlementId || !adjAmount || !adjReason || createAdjustment.isPending} data-testid="button-create-adjustment"
              onClick={() => createAdjustment.mutate({
                settlementId: Number(adjSettlementId), amountCents: Number(adjAmount), direction: adjDirection, reason: adjReason,
              }, { onSuccess: () => { setAdjSettlementId(""); setAdjAmount(""); setAdjReason(""); }, onError })}>
              Créer
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-1.5">Créé le</th><th className="p-1.5">Entrée ledger</th><th className="p-1.5">Règlement</th>
                  <th className="p-1.5">Montant</th><th className="p-1.5">Sens</th><th className="p-1.5">Raison</th>
                </tr>
              </thead>
              <tbody>
                {adjLoading && <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">Chargement…</td></tr>}
                {!adjLoading && adjRows.length === 0 && <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">Aucun ajustement</td></tr>}
                {adjRows.map((a) => (
                  <tr key={a.id} className="border-b last:border-0" data-testid={`row-adjustment-${a.id}`}>
                    <td className="p-1.5 whitespace-nowrap">{formatDate(a.createdAt as any)}</td>
                    <td className="p-1.5">{a.ledgerEntryId ? `#${a.ledgerEntryId}` : "—"}</td>
                    <td className="p-1.5">{a.settlementId ? `#${a.settlementId}` : "—"}</td>
                    <td className="p-1.5">{fmt(a.amountCents)}</td>
                    <td className="p-1.5">
                      <Badge variant="outline" className={a.direction === "CREDIT" ? "text-emerald-600 border-emerald-300" : "text-red-600 border-red-300"}>{a.direction}</Badge>
                    </td>
                    <td className="p-1.5">{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DataPagination
            page={adjPagination.page} pageSize={adjPagination.pageSize} totalItems={lastTotalAdj} totalPages={adjPagination.totalPages}
            start={adjPagination.start} end={adjPagination.end}
            onPageChange={adjPagination.setPage} onPageSizeChange={adjPagination.setPageSize}
            itemLabel="ajustements"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SystemManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: states, isLoading } = useQuery<ServiceStatesMap>({ queryKey: ["/api/system-services"] });
  const { order: savedOrder } = useServiceOrder();
  const [serviceOrder, setServiceOrder] = useState<MarketplaceServiceId[]>(savedOrder);
  const [draggedService, setDraggedService] = useState<MarketplaceServiceId | null>(null);

  useEffect(() => setServiceOrder(savedOrder), [savedOrder.join("|")]);

  const updateState = useMutation({
    mutationFn: ({ service, state }: { service: ServiceKey; state: ServiceState }) =>
      apiRequest("PATCH", `/api/admin/system-services/${service}`, { state }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-services"] });
      toast({ title: "Service visibility updated" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to update service", description: "Please try again." });
    },
  });

  const updateOrder = useMutation({
    mutationFn: (order: MarketplaceServiceId[]) =>
      apiRequest("PATCH", "/api/admin/system-service-order", { order }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-service-order"] });
      toast({ title: "Service order updated" });
    },
    onError: () => toast({ variant: "destructive", title: "Failed to update service order" }),
  });

  const orderedCards = serviceOrder.map((id) => SERVICE_ORDER_CARDS.find((card) => card.id === id)).filter(Boolean) as typeof SERVICE_ORDER_CARDS;
  const moveService = (target: MarketplaceServiceId) => {
    if (!draggedService || draggedService === target) return;
    const next = [...serviceOrder];
    const from = next.indexOf(draggedService);
    const to = next.indexOf(target);
    next.splice(from, 1);
    next.splice(to, 0, draggedService);
    setServiceOrder(next);
    updateOrder.mutate(next);
    setDraggedService(null);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <DashboardHero
        title={<span className="flex items-center gap-2" data-testid="text-page-title"><Sliders className="w-6 h-6 text-amber-600" />System Management</span>}
        subtitle="Control the global visibility of each marketplace service and configure the Landing Page."
        gradientClass="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20"
      />

      {/* ── Service visibility ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: SERVICE_ORDER_CARDS.length }).map((_, i) => (
              <Card key={i}><CardContent className="p-6"><Skeleton className="h-6 w-32 mb-3" /><Skeleton className="h-4 w-full mb-1" /><Skeleton className="h-4 w-2/3 mb-4" /><Skeleton className="h-9 w-full" /></CardContent></Card>
            ))
          : orderedCards.map((svc) => {
              const serviceKey = svc.key;
              const currentState: ServiceState = serviceKey ? (states?.[serviceKey] ?? "VISIBLE") : "VISIBLE";
              const currentOption = STATE_OPTIONS.find((o) => o.value === currentState)!;
              const isPending = !!serviceKey && updateState.isPending && updateState.variables?.service === serviceKey;
              return (
                <Card key={svc.id} draggable onDragStart={() => setDraggedService(svc.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => moveService(svc.id)} data-testid={`card-service-${svc.id.toLowerCase()}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" aria-label="Drag to reorder" />
                        <div className="bg-muted rounded-lg p-2.5"><svc.icon className="w-5 h-5 text-foreground/70" /></div>
                        <CardTitle className="text-base">{svc.label}</CardTitle>
                      </div>
                      <Badge variant="outline" className={`text-xs ${currentOption.badgeClass}`} data-testid={`badge-status-${(serviceKey ?? svc.id).toLowerCase()}`}>
                        {currentOption.label}
                      </Badge>
                    </div>
                    <CardDescription className="pt-2 text-sm">{svc.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-col gap-2">
                      {serviceKey && STATE_OPTIONS.map((opt) => (
                        <Button key={opt.value} type="button" size="sm" variant={currentState === opt.value ? "default" : "outline"}
                          disabled={isPending} onClick={() => updateState.mutate({ service: serviceKey, state: opt.value })}
                          className={`justify-start gap-2 w-full ${currentState === opt.value ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`}
                          data-testid={`button-set-${serviceKey.toLowerCase()}-${opt.value.toLowerCase()}`}>
                          <opt.icon className="w-4 h-4" />{opt.label}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* ── Global Currency ── */}
      <GlobalCurrencySection />

      {/* ── Messages System ── */}
      <MessagesSystemSection />

      {/* ── Hero Actions (Fast Search / Report per service) ── */}
      <HeroActionsSection />

      {/* ── Dark Mode (per service account) ── */}
      <AccountDarkModeSection />

      {/* ── Delivery Pricing ── */}
      <DeliveryPricingSection />

      {/* ── Delivery Financial Ledger (Phase 5A) ── */}
      <DeliveryFinancialLedgerSection />

      {/* ── Delivery Settlements (Phase 5C.1) ── */}
      <DeliverySettlementsSection />

      {/* ── Financial Summary (Phase 5C.2) ── */}
      <AdminFinancialSummarySection />

      {/* ── COD Reconciliation (Phase 5C.2) ── */}
      <AdminCodReconciliationsSection />

      {/* ── Refunds & Adjustments (Phase 5C.2) ── */}
      <AdminRefundsAdjustmentsSection />

      {/* ── Landing Page Config ── */}
      <LandingConfigSection />
    </div>
  );
}
