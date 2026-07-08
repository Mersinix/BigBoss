import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Printer, Megaphone, Coffee, Eye, EyeOff, Clock, Sliders, LayoutTemplate, Image, FootprintsIcon, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ServiceKey, ServiceState, ServiceStatesMap } from "@/hooks/use-service-states";
import type { LandingConfig, HeroSlide } from "@shared/schema";

// ── Service visibility ────────────────────────────────────────────────────────

const SERVICES: { key: ServiceKey; label: string; description: string; icon: any }[] = [
  { key: "PRINTING",  label: "Printing",  description: "Marketplace PRINT — services d'impression pour les cafés.", icon: Printer },
  { key: "MARKETING", label: "Marketing", description: "Services MARKETING — agences et prestataires marketing.",   icon: Megaphone },
  { key: "BARISTA",   label: "Barista",   description: "Barista Academy & Marketplace Baristas.",                  icon: Coffee },
];

const STATE_OPTIONS: { value: ServiceState; label: string; icon: any; badgeClass: string }[] = [
  { value: "VISIBLE",     label: "Visible",      icon: Eye,    badgeClass: "bg-green-100 text-green-700 border-green-200" },
  { value: "COMING_SOON", label: "Coming Soon",  icon: Clock,  badgeClass: "bg-amber-400 text-amber-700 border-amber-200" },
  { value: "HIDDEN",      label: "Hidden",       icon: EyeOff, badgeClass: "bg-gray-100 text-gray-600 border-gray-200" },
];

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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SystemManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: states, isLoading } = useQuery<ServiceStatesMap>({ queryKey: ["/api/system-services"] });

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
          ? Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}><CardContent className="p-6"><Skeleton className="h-6 w-32 mb-3" /><Skeleton className="h-4 w-full mb-1" /><Skeleton className="h-4 w-2/3 mb-4" /><Skeleton className="h-9 w-full" /></CardContent></Card>
            ))
          : SERVICES.map((svc) => {
              const currentState: ServiceState = states?.[svc.key] ?? "VISIBLE";
              const currentOption = STATE_OPTIONS.find((o) => o.value === currentState)!;
              const isPending = updateState.isPending && updateState.variables?.service === svc.key;
              return (
                <Card key={svc.key} data-testid={`card-service-${svc.key.toLowerCase()}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-muted rounded-lg p-2.5"><svc.icon className="w-5 h-5 text-foreground/70" /></div>
                        <CardTitle className="text-base">{svc.label}</CardTitle>
                      </div>
                      <Badge variant="outline" className={`text-xs ${currentOption.badgeClass}`} data-testid={`badge-status-${svc.key.toLowerCase()}`}>
                        {currentOption.label}
                      </Badge>
                    </div>
                    <CardDescription className="pt-2 text-sm">{svc.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-col gap-2">
                      {STATE_OPTIONS.map((opt) => (
                        <Button key={opt.value} type="button" size="sm" variant={currentState === opt.value ? "default" : "outline"}
                          disabled={isPending} onClick={() => updateState.mutate({ service: svc.key, state: opt.value })}
                          className={`justify-start gap-2 w-full ${currentState === opt.value ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`}
                          data-testid={`button-set-${svc.key.toLowerCase()}-${opt.value.toLowerCase()}`}>
                          <opt.icon className="w-4 h-4" />{opt.label}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {/* ── Landing Page Config ── */}
      <LandingConfigSection />
    </div>
  );
}
