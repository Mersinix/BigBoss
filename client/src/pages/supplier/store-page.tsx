import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Store, Image as ImageIcon, RefreshCw, Save, Heart, Package,
  Video, Music, Clock, Plus, Trash2, ChevronLeft, Zap, Star, MapPin, Info,
} from "lucide-react";
import { CoverSlideshow } from "@/pages/cafe/store-detail-page";
import { AvailabilityModal } from "@/components/shared/availability-modal";
import { useThemeStore } from "@/store/theme-store";
import { WEEKLY_DAY_DEFS } from "@/lib/weekly-hours";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { SupplierStore, OpeningHoursMap, OpeningDayHours } from "@shared/schema";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

// ── Types ─────────────────────────────────────────────────────────────────────

type DayKey = keyof OpeningHoursMap;

const DEFAULT_HOURS: OpeningDayHours = { open: "09:00", close: "18:00", closed: false };

const DEFAULT_OPENING_HOURS: OpeningHoursMap = {
  monday: { ...DEFAULT_HOURS },
  tuesday: { ...DEFAULT_HOURS },
  wednesday: { ...DEFAULT_HOURS },
  thursday: { ...DEFAULT_HOURS },
  friday: { ...DEFAULT_HOURS },
  saturday: { open: "09:00", close: "14:00", closed: false },
  sunday: { open: "09:00", close: "14:00", closed: true },
};

// ── Approval badge ────────────────────────────────────────────────────────────

function ApprovalBadge({ status }: { status?: string }) {
  if (!status) return null;
  if (status === "PENDING") return <Badge className="bg-amber-400 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-0 text-xs">En attente de validation</Badge>;
  if (status === "APPROVED") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-0 text-xs">Approuvée</Badge>;
  if (status === "REJECTED") return <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-0 text-xs">Rejetée</Badge>;
  if (status === "ON_HOLD") return <Badge className="bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-0 text-xs">En pause</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

// ── Section header — title + "Enregistrer" button, same row on desktop ───────

function SectionHeader({ title, onSave, saving, testId }: { title: string; onSave: () => void; saving: boolean; testId: string }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <Button size="sm" onClick={onSave} disabled={saving} data-testid={testId}>
        {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
        Enregistrer
      </Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Section = "details" | "media" | "hours";

export default function StorePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isDark = useThemeStore((s) => s.isDark);

  const { data: store, isLoading } = useQuery<SupplierStore | null>({
    queryKey: ["/api/supplier/store"],
  });

  const [infoOpen, setInfoOpen] = useState(false);
  const [section, setSection] = useState<Section>("details");

  const [form, setForm] = useState({
    name: "",
    description: "",
    coverUrl: "",
    logoUrl: "",
    isOpen: true,
    visibility: "VISIBLE" as "VISIBLE" | "HIDDEN",
    mediaType: "IMAGE" as "IMAGE" | "VIDEO",
    coverUrls: [""] as string[],
    videoUrl: "",
    musicUrl: "",
    openingHours: DEFAULT_OPENING_HOURS as OpeningHoursMap,
  });

  // Seeded once per page load only — a section's own save (and the
  // admin_user_directory/store_updated-triggered refetch it causes) must never re-seed the
  // WHOLE form afterward, or saving one section would silently discard unsaved edits still
  // sitting in the other two sections (task: switching/saving one section must not reset
  // another's unsaved values). Re-seeding again only happens if the page itself remounts.
  const seededRef = useRef(false);
  useEffect(() => {
    if (isLoading || seededRef.current) return;
    seededRef.current = true;
    if (store) {
      const s = store as any;
      const existingCoverUrls: string[] = Array.isArray(s.coverUrls) && s.coverUrls.length > 0
        ? s.coverUrls
        : s.coverUrl ? [s.coverUrl] : [""];
      setForm({
        name: s.name ?? "",
        description: s.description ?? "",
        coverUrl: s.coverUrl ?? "",
        logoUrl: s.logoUrl ?? "",
        isOpen: s.isOpen ?? true,
        visibility: s.visibility ?? "VISIBLE",
        mediaType: s.mediaType ?? "IMAGE",
        coverUrls: existingCoverUrls,
        videoUrl: s.videoUrl ?? "",
        musicUrl: s.musicUrl ?? "",
        openingHours: s.openingHours ?? DEFAULT_OPENING_HOURS,
      });
    }
  }, [isLoading, store]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/supplier/store"] });

  // Three independent saves — one per section, each PUTting only its own fields to the
  // existing PUT /api/supplier/store endpoint (unchanged contract: storage.upsertSupplierStore
  // already only updates fields present in the payload — see server/storage/domains/
  // supplier.storage.ts — so sending just this section's slice can never clobber the other
  // two sections' already-saved values).
  const saveDetails = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/supplier/store", {
        name: form.name, description: form.description, logoUrl: form.logoUrl,
        isOpen: form.isOpen, visibility: form.visibility,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Détails enregistrés", description: "Les informations de votre boutique ont été mises à jour." });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible d'enregistrer les détails de la boutique.", variant: "destructive" }),
  });

  const saveMedia = useMutation({
    mutationFn: async () => {
      const cleanUrls = form.coverUrls.filter(Boolean);
      const res = await apiRequest("PUT", "/api/supplier/store", {
        mediaType: form.mediaType,
        coverUrl: cleanUrls[0] ?? form.coverUrl,
        coverUrls: cleanUrls,
        videoUrl: form.videoUrl,
        musicUrl: form.musicUrl,
      });
      return res.json();
    },
    onSuccess: (updated: any) => {
      // Reflect the server's own cleanup (empty URLs filtered out) locally, without a full
      // form re-seed that could discard unsaved Details/Horaires edits sitting alongside it.
      setForm((f) => ({
        ...f,
        coverUrl: updated?.coverUrl ?? f.coverUrl,
        coverUrls: Array.isArray(updated?.coverUrls) && updated.coverUrls.length > 0 ? updated.coverUrls : [""],
      }));
      invalidate();
      toast({ title: "Médias enregistrés", description: "Les médias d'arrière-plan de votre boutique ont été mis à jour." });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible d'enregistrer les médias d'arrière-plan.", variant: "destructive" }),
  });

  const saveHours = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/supplier/store", { openingHours: form.openingHours });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Horaires enregistrés", description: "Vos horaires d'ouverture ont été mis à jour." });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible d'enregistrer les horaires d'ouverture.", variant: "destructive" }),
  });

  const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const updateDay = (day: DayKey, patch: Partial<OpeningDayHours>) => {
    setForm((p) => ({
      ...p,
      openingHours: {
        ...p.openingHours,
        [day]: { ...p.openingHours[day], ...patch },
      },
    }));
  };

  const addCoverUrl = () => {
    if (form.coverUrls.length >= 5) return;
    setForm((p) => ({ ...p, coverUrls: [...p.coverUrls, ""] }));
  };

  const removeCoverUrl = (i: number) => {
    setForm((p) => ({ ...p, coverUrls: p.coverUrls.filter((_, idx) => idx !== i) }));
  };

  const setCoverUrl = (i: number, val: string) => {
    setForm((p) => {
      const urls = [...p.coverUrls];
      urls[i] = val;
      return { ...p, coverUrls: urls };
    });
  };

  if (isLoading) {
    return (
      <div className="py-6 px-3 -mx-6 sm:px-6 sm:mx-auto space-y-4 max-w-6xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-60 rounded-2xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  // Effective cover images for preview
  const previewImages = form.mediaType === "IMAGE"
    ? form.coverUrls.filter(Boolean)
    : [];

  return (
    <div className="py-6 px-3 -mx-6 sm:px-6 sm:mx-auto max-w-6xl space-y-6">
      <DashboardHero
        title={<span className="flex items-center gap-2"><Store className="w-6 h-6 text-primary" />Ma boutique</span>}
        subtitle="Configurez l'apparence de votre boutique pour les Coffee Owners sur la marketplace."
        action={<ApprovalBadge status={store?.approvalStatus} />}
      />

      {/* Store immersive preview — matches Coffee Owner view, always visible regardless of
          the active configuration section below, and kept live (no page refresh) since it
          reads directly from `form`, the exact same state every section's inputs write to. */}
      <div
        className="rounded-2xl overflow-hidden shadow-lg bg-gray-900 max-w-6xl mx-auto lg:mx-0"
        data-testid="preview-store-card"
      >
        {/* Cover media */}
        <div className="relative h-52 overflow-hidden bg-gray-800">
          {form.mediaType === "VIDEO" && form.videoUrl ? (
            <video src={form.videoUrl} className="w-full h-full object-cover" muted autoPlay loop playsInline />
          ) : (
            <CoverSlideshow
              urls={previewImages.length > 0 ? previewImages : [form.coverUrl].filter(Boolean)}
              name={form.name}
            />
          )}

          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 pointer-events-none" />

          {/* Back button — top left */}
          <div className="absolute top-3 left-3 w-8 h-8 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center">
            <ChevronLeft className="w-4 h-4 text-white" />
          </div>

          {/* Top-right action cluster */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5">
            <div className="w-8 h-8 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center">
              <Heart className="w-3.5 h-3.5 text-white/80" />
            </div>
            <div className="w-8 h-8 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            </div>
          </div>

          {/* Bottom-right: rating + info */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
            <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className="text-[11px] font-bold text-white">4.8</span>
            </div>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="w-8 h-8 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center"
              data-testid="button-store-preview-info"
            >
              <Info className="w-3.5 h-3.5 text-white/80" />
            </button>
          </div>

          {/* Closed badge */}
          {!form.isOpen && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-gray-900/80 text-white border-0 text-[10px] font-semibold">Fermée</Badge>
            </div>
          )}

          {/* Music indicator */}
          {form.musicUrl && (
            <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-black/50 text-white rounded-full px-2 py-0.5">
              <Music className="w-3 h-3 animate-pulse" />
              <span className="text-[10px]">Musique</span>
            </div>
          )}
        </div>

        {/* Store info section — dark style */}
        <div className="px-4 pt-1 pb-4 bg-gray-900">
          {/* Logo overlapping cover */}
          <div className="flex items-end gap-3 -mt-7 mb-3">
            <div className="w-14 h-14 rounded-2xl border-4 border-gray-900 bg-gray-800 shadow-lg overflow-hidden shrink-0 flex items-center justify-center">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Logo" className="w-full h-full object-cover z-20" />
              ) : (
                <Store className="w-6 h-6 text-gray-500" />
              )}
            </div>
          </div>

          {/* Name */}
          <h3 className="font-extrabold text-lg text-white leading-tight truncate">
            {form.name || "Nom de votre boutique"}
          </h3>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 mt-1">
            <span className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              {store ? (store as any).productCount ?? 0 : 0} produits
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              Distance affichée aux cafés à proximité
            </span>
          </div>

          {/* Description */}
          {form.description && (
            <p className="text-xs text-gray-400 mt-2 line-clamp-2">{form.description}</p>
          )}
        </div>
      </div>

      {/* Three-section switcher — same Tabs/TabsList/TabsTrigger pattern already used
          throughout the Admin interface (e.g. admin/delivery-page.tsx, admin/users-page.tsx),
          wrapped in a horizontally-scrollable, scrollbar-hidden container so all three
          options stay reachable on narrow screens without breaking the layout. */}
      <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
        <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          <TabsList className="flex items-center justify-start gap-1 bg-secondary/40 rounded-xl p-1 h-auto w-max min-w-full sm:w-fit">
            <TabsTrigger value="details" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground" data-testid="tab-store-details">
              <Store className="w-3.5 h-3.5 mr-1.5" />Détails de la boutique
            </TabsTrigger>
            <TabsTrigger value="media" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground" data-testid="tab-store-media">
              <ImageIcon className="w-3.5 h-3.5 mr-1.5" />Médias d'arrière-plan
            </TabsTrigger>
            <TabsTrigger value="hours" className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium hover:text-foreground" data-testid="tab-store-hours">
              <Clock className="w-3.5 h-3.5 mr-1.5" />Horaires d'ouverture
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {/* ── Section 1 — Détails de la boutique ── */}
      {section === "details" && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <SectionHeader title="Détails de la boutique" onSave={() => saveDetails.mutate()} saving={saveDetails.isPending} testId="button-save-store-details" />
            <div className="space-y-1.5">
              <Label htmlFor="store-name">Nom de la boutique</Label>
              <Input id="store-name" data-testid="input-store-name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="ex. Torréfacteurs du Levant" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="store-description">Description</Label>
              <Textarea id="store-description" data-testid="input-store-description" value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Présentez votre boutique aux Coffee Owners…" rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="store-logo">URL du logo</Label>
              <Input id="store-logo" data-testid="input-store-logo" value={form.logoUrl} onChange={(e) => update("logoUrl", e.target.value)} placeholder="https://…" />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Boutique ouverte</p>
                <p className="text-xs text-muted-foreground">Indiquez si votre boutique accepte actuellement les commandes.</p>
              </div>
              <Switch checked={form.isOpen} onCheckedChange={(v) => update("isOpen", v)} data-testid="switch-store-open" />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Visible sur la marketplace</p>
                <p className="text-xs text-muted-foreground">Masquez votre boutique sans affecter vos produits.</p>
              </div>
              <Switch checked={form.visibility === "VISIBLE"} onCheckedChange={(v) => update("visibility", v ? "VISIBLE" : "HIDDEN")} data-testid="switch-store-visibility" />
            </div>
            {form.visibility === "HIDDEN" && (
              <p className="text-xs text-muted-foreground">Cette fiche boutique est masquée sur la marketplace. Vos produits restent affichés normalement.</p>
            )}
            {store?.approvalStatus === "REJECTED" && (
              <p className="text-xs text-red-600">Votre boutique a été rejetée. Modifier et enregistrer la soumettra à nouveau pour validation.</p>
            )}
            {store?.approvalStatus === "ON_HOLD" && (
              <p className="text-xs text-muted-foreground">Votre boutique est actuellement en pause par l'équipe d'administration.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Section 2 — Médias d'arrière-plan ── */}
      {section === "media" && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <SectionHeader title="Médias d'arrière-plan" onSave={() => saveMedia.mutate()} saving={saveMedia.isPending} testId="button-save-store-media" />

            {/* Media type toggle */}
            <div className="inline-flex rounded-lg border p-1 bg-muted/40 w-full">
              <button
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-md transition-colors ${form.mediaType === "IMAGE" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                onClick={() => update("mediaType", "IMAGE")}
                data-testid="btn-media-image"
              >
                <ImageIcon className="w-4 h-4" />Images
              </button>
              <button
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-md transition-colors ${form.mediaType === "VIDEO" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                onClick={() => update("mediaType", "VIDEO")}
                data-testid="btn-media-video"
              >
                <Video className="w-4 h-4" />Vidéo
              </button>
            </div>

            {form.mediaType === "IMAGE" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Images de couverture <span className="text-xs text-muted-foreground">({form.coverUrls.filter(Boolean).length}/5)</span></Label>
                  {form.coverUrls.length < 5 && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addCoverUrl} data-testid="btn-add-image">
                      <Plus className="w-3 h-3 mr-1" />Ajouter une image
                    </Button>
                  )}
                </div>
                {form.coverUrls.map((url, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={url}
                      onChange={(e) => setCoverUrl(i, e.target.value)}
                      placeholder={`URL de l'image ${i + 1} — https://…`}
                      className="flex-1"
                      data-testid={`input-cover-url-${i}`}
                    />
                    {form.coverUrls.length > 1 && (
                      <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 text-destructive hover:text-destructive" onClick={() => removeCoverUrl(i)} data-testid={`btn-remove-image-${i}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Ajoutez jusqu'à 5 images. Elles défilent automatiquement sous forme de diaporama.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="video-url">URL de la vidéo</Label>
                <Input
                  id="video-url"
                  value={form.videoUrl}
                  onChange={(e) => update("videoUrl", e.target.value)}
                  placeholder="https://… (mp4, intégration YouTube, etc.)"
                  data-testid="input-video-url"
                />
                <p className="text-xs text-muted-foreground">Collez une URL de vidéo directe. La vidéo sera lue en arrière-plan de votre boutique.</p>
              </div>
            )}

            <div className="pt-2 border-t space-y-2">
              <Label htmlFor="music-url" className="flex items-center gap-2"><Music className="w-3.5 h-3.5" />Musique d'ambiance</Label>
              <Input
                id="music-url"
                value={form.musicUrl}
                onChange={(e) => update("musicUrl", e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                data-testid="input-music-url"
              />
              <p className="text-[11px] text-muted-foreground">URL de la musique (YouTube)</p>
              <p className="text-xs text-muted-foreground">La musique est diffusée automatiquement lorsque les propriétaires de cafés visitent votre boutique. Elle concerne uniquement votre boutique.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Section 3 — Horaires d'ouverture ── Same visual patterns (pill day-toggle,
          time inputs, "Fermé" state, separated summary card) as Espace Livraison → Business →
          Profil → Disponibilité (client/src/components/settings/account-availability-card.tsx),
          reproduced directly here rather than reusing that component as-is: it also bakes in a
          Driver/Delivery Company "Mode Congé" vacation toggle, which has no equivalent in — and
          must not be added to — the Supplier Store module (task's own explicit constraint). */}
      {section === "hours" && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <SectionHeader title="Horaires d'ouverture" onSave={() => saveHours.mutate()} saving={saveHours.isPending} testId="button-save-store-hours" />

            <div className="space-y-2">
              {WEEKLY_DAY_DEFS.map((d) => {
                const day = form.openingHours[d.key] ?? DEFAULT_HOURS;
                return (
                  <div key={d.key} className="flex items-center gap-3 rounded-xl border border-border/50 p-2.5">
                    <button
                      type="button"
                      onClick={() => updateDay(d.key, { closed: !day.closed })}
                      className={`w-16 shrink-0 h-9 rounded-xl text-xs font-semibold transition-all ${!day.closed ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                      data-testid={`button-toggle-day-${d.key}`}
                    >
                      {d.short}
                    </button>
                    {day.closed ? (
                      <span className="text-xs font-medium text-muted-foreground flex-1">Fermé</span>
                    ) : (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Input type="time" value={day.open} onChange={(e) => updateDay(d.key, { open: e.target.value })} className="h-9 text-xs" data-testid={`input-${d.key}-open`} />
                        <span className="text-muted-foreground text-xs shrink-0">–</span>
                        <Input type="time" value={day.close} onChange={(e) => updateDay(d.key, { close: e.target.value })} className="h-9 text-xs" data-testid={`input-${d.key}-close`} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Résumé des horaires — own separated Card, same visual separation as the
                Disponibilité reference's own summary card, updates immediately as the
                schedule above changes since it reads the exact same `form.openingHours`. */}
            <Card className="rounded-2xl shadow-sm bg-muted/40 border-transparent">
              <CardContent className="pt-4">
                <p className="font-semibold text-xs mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Résumé des horaires</p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {WEEKLY_DAY_DEFS.map((d) => {
                    const day = form.openingHours[d.key] ?? DEFAULT_HOURS;
                    return <p key={d.key}><strong className="text-foreground">{d.label} :</strong> {day.closed ? "Fermé" : `${day.open} – ${day.close}`}</p>;
                  })}
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      )}

      {/* Info icon on the live preview above opens this — the shared Disponibilité modal
          (client/src/components/shared/availability-modal.tsx), called directly here with its
          own French defaults rather than through store-detail-page.tsx's `InfoModal` wrapper,
          which hardcodes English labels for the Coffee-Owner-facing page it belongs to — this
          avoids touching that other, unrelated page just to localize this one. Reads
          form.openingHours directly, the exact same state Section 3 above edits (single
          source of truth). */}
      <AvailabilityModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        targetName={form.name || "Nom de votre boutique"}
        weeklyHours={form.openingHours}
        isDark={isDark}
        subtitleLabel="Horaires d'ouverture"
        noScheduleHint="Cette boutique n'a pas encore défini ses disponibilités."
      />
    </div>
  );
}
