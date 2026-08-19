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
import { Printer, Megaphone, Coffee, Wrench, ShoppingBag, GripVertical, Eye, EyeOff, Clock, Sliders, LayoutTemplate, Image, FootprintsIcon, Plus, Trash2, ChevronDown, ChevronUp, CircleDollarSign, MessageSquare } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ServiceKey, ServiceState, ServiceStatesMap } from "@/hooks/use-service-states";
import { useServiceOrder, type MarketplaceServiceId } from "@/hooks/use-service-order";
import type { LandingConfig, HeroSlide } from "@shared/schema";

// ── Service visibility ────────────────────────────────────────────────────────

const SERVICES: { key: ServiceKey; label: string; description: string; icon: any }[] = [
  { key: "PRINTING",    label: "Printing",     description: "Marketplace PRINT — services d'impression pour les cafés.", icon: Printer },
  { key: "MARKETING",   label: "Marketing",    description: "Services MARKETING — agences et prestataires marketing.",   icon: Megaphone },
  { key: "BARISTA",     label: "Barista",      description: "Barista Academy & Marketplace Baristas.",                  icon: Coffee },
  { key: "MAINTENANCE", label: "Maintenance",  description: "Services MAINTENANCE — techniciens pour équipements café.", icon: Wrench },
];

const SERVICE_ORDER_CARDS: { id: MarketplaceServiceId; key?: ServiceKey; label: string; description: string; icon: any }[] = [
  { id: "SHOP", key: undefined, label: "Shop", description: "Marketplace SHOP — produits professionnels pour les cafés.", icon: ShoppingBag },
  ...SERVICES.map((service) => ({ id: service.key === "PRINTING" ? "PRINT" : service.key, key: service.key, label: service.label, description: service.description, icon: service.icon })) as any,
];

const STATE_OPTIONS: { value: ServiceState; label: string; icon: any; badgeClass: string }[] = [
  { value: "VISIBLE",     label: "Visible",      icon: Eye,    badgeClass: "bg-green-100 text-green-700 border-green-200" },
  { value: "COMING_SOON", label: "Coming Soon",  icon: Clock,  badgeClass: "bg-amber-400 text-amber-700 border-amber-200" },
  { value: "HIDDEN",      label: "Hidden",       icon: EyeOff, badgeClass: "bg-gray-100 text-gray-600 border-gray-200" },
];

type MessagingSettings = {
  globalVisible: boolean;
  supplierMessagingEnabled: boolean;
  maintenanceMessagingEnabled: boolean;
  baristaMessagingEnabled: boolean;
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
      <div className="flex items-center gap-3">
        <div className="bg-amber-500/10 rounded-xl p-3">
          <Sliders className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">System Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Control the global visibility of each marketplace service and configure the Landing Page.</p>
        </div>
      </div>

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

      {/* ── Landing Page Config ── */}
      <LandingConfigSection />
    </div>
  );
}
