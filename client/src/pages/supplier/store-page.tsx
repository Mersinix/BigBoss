import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Store, Image as ImageIcon, RefreshCw, Save, Heart, Package,
  Video, Music, Clock, Plus, Trash2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { SupplierStore, OpeningHoursMap, OpeningDayHours } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

type DayKey = keyof OpeningHoursMap;
const DAYS: { key: DayKey; label: string }[] = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

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
  if (status === "PENDING") return <Badge className="bg-amber-400 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-0 text-xs">Pending Review</Badge>;
  if (status === "APPROVED") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-0 text-xs">Approved</Badge>;
  if (status === "REJECTED") return <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-0 text-xs">Rejected</Badge>;
  if (status === "ON_HOLD") return <Badge className="bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-0 text-xs">On Hold</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

// ── Slideshow preview ─────────────────────────────────────────────────────────

function SlideshowPreview({ urls, name }: { urls: string[]; name: string }) {
  const [idx, setIdx] = useState(0);
  const active = urls.filter(Boolean);
  useEffect(() => {
    if (active.length <= 1) return;
    const timer = setInterval(() => setIdx((i) => (i + 1) % active.length), 3000);
    return () => clearInterval(timer);
  }, [active.length]);
  if (!active.length) {
    return <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-10 h-10 text-gray-300" /></div>;
  }
  return (
    <div className="relative w-full h-full">
      <img src={active[idx]} alt={name} className="w-full h-full object-cover transition-all duration-500" />
      {active.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {active.map((_, i) => (
            <button
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? "bg-white scale-125" : "bg-white/50"}`}
              onClick={() => setIdx(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StorePage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: store, isLoading } = useQuery<SupplierStore | null>({
    queryKey: ["/api/supplier/store"],
  });

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

  useEffect(() => {
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
  }, [store]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cleanUrls = form.coverUrls.filter(Boolean);
      const payload = {
        ...form,
        coverUrl: cleanUrls[0] ?? form.coverUrl,
        coverUrls: cleanUrls,
      };
      const res = await apiRequest("PUT", "/api/supplier/store", payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/supplier/store"] });
      toast({ title: "Store profile saved", description: "Your store details have been updated." });
    },
    onError: () => {
      toast({ title: "Failed to save store", variant: "destructive" });
    },
  });

  const update = <K extends keyof typeof form>(key: K, value: typeof form[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const updateDay = (day: DayKey, field: keyof OpeningDayHours, value: any) => {
    setForm((p) => ({
      ...p,
      openingHours: {
        ...p.openingHours,
        [day]: { ...p.openingHours[day], [field]: value },
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
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  // Effective cover images for preview
  const previewImages = form.mediaType === "IMAGE"
    ? form.coverUrls.filter(Boolean)
    : [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Store className="w-6 h-6 text-primary" />My Store</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure how your store appears to Coffee Owners in the marketplace.</p>
        </div>
        <ApprovalBadge status={store?.approvalStatus} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left column: form ── */}
        <div className="space-y-4">

          {/* Store Details */}
          <Card>
            <CardHeader><CardTitle className="text-base">Store Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="store-name">Store Name</Label>
                <Input id="store-name" data-testid="input-store-name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Sunrise Coffee Roasters" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-description">Description</Label>
                <Textarea id="store-description" data-testid="input-store-description" value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Tell coffee owners about your store…" rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-logo">Logo URL</Label>
                <Input id="store-logo" data-testid="input-store-logo" value={form.logoUrl} onChange={(e) => update("logoUrl", e.target.value)} placeholder="https://…" />
              </div>
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">Store Open</p>
                  <p className="text-xs text-muted-foreground">Show your store as currently open for orders.</p>
                </div>
                <Switch checked={form.isOpen} onCheckedChange={(v) => update("isOpen", v)} data-testid="switch-store-open" />
              </div>
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">Visible in Marketplace</p>
                  <p className="text-xs text-muted-foreground">Hide your store card without affecting your products.</p>
                </div>
                <Switch checked={form.visibility === "VISIBLE"} onCheckedChange={(v) => update("visibility", v ? "VISIBLE" : "HIDDEN")} data-testid="switch-store-visibility" />
              </div>
            </CardContent>
          </Card>

          {/* Background Media */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ImageIcon className="w-4 h-4" />Background Media</CardTitle></CardHeader>
            <CardContent className="space-y-4">
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
                  <Video className="w-4 h-4" />Video
                </button>
              </div>

              {form.mediaType === "IMAGE" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Cover Images <span className="text-xs text-muted-foreground">({form.coverUrls.length}/5)</span></Label>
                    {form.coverUrls.length < 5 && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addCoverUrl} data-testid="btn-add-image">
                        <Plus className="w-3 h-3 mr-1" />Add Image
                      </Button>
                    )}
                  </div>
                  {form.coverUrls.map((url, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={url}
                        onChange={(e) => setCoverUrl(i, e.target.value)}
                        placeholder={`Image ${i + 1} URL — https://…`}
                        className="flex-1"
                        data-testid={`input-cover-url-${i}`}
                      />
                      {form.coverUrls.length > 1 && (
                        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-destructive hover:text-destructive" onClick={() => removeCoverUrl(i)} data-testid={`btn-remove-image-${i}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Add up to 5 images. They rotate automatically as a slideshow.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="video-url">Video URL</Label>
                  <Input
                    id="video-url"
                    value={form.videoUrl}
                    onChange={(e) => update("videoUrl", e.target.value)}
                    placeholder="https://… (mp4, YouTube embed, etc.)"
                    data-testid="input-video-url"
                  />
                  <p className="text-xs text-muted-foreground">Paste a direct video URL. The video will play as your store cover.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Background Music */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Music className="w-4 h-4" />Background Music</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="music-url">Store Music URL <span className="text-xs text-muted-foreground font-normal">(YouTube)</span></Label>
              <Input
                id="music-url"
                value={form.musicUrl}
                onChange={(e) => update("musicUrl", e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                data-testid="input-music-url"
              />
              <p className="text-xs text-muted-foreground">Music plays automatically when Coffee Owners visit your store page. It only affects your store.</p>
            </CardContent>
          </Card>

          {/* Opening Hours */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" />Opening Hours</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {DAYS.map(({ key, label }) => {
                const day = form.openingHours[key] ?? DEFAULT_HOURS;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-24 shrink-0">
                      <p className="text-sm font-medium">{label}</p>
                    </div>
                    <Switch
                      checked={!day.closed}
                      onCheckedChange={(v) => updateDay(key, "closed", !v)}
                      data-testid={`switch-${key}`}
                    />
                    {!day.closed ? (
                      <>
                        <Input
                          type="time"
                          value={day.open}
                          onChange={(e) => updateDay(key, "open", e.target.value)}
                          className="h-8 text-xs w-28"
                          data-testid={`input-${key}-open`}
                        />
                        <span className="text-xs text-muted-foreground shrink-0">to</span>
                        <Input
                          type="time"
                          value={day.close}
                          onChange={(e) => updateDay(key, "close", e.target.value)}
                          className="h-8 text-xs w-28"
                          data-testid={`input-${key}-close`}
                        />
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Closed</span>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Save */}
          <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-store">
            {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
            Save Store Profile
          </Button>
          {store?.approvalStatus === "REJECTED" && (
            <p className="text-xs text-red-600">Your store was rejected. Editing and saving will resubmit it for review.</p>
          )}
          {store?.approvalStatus === "ON_HOLD" && (
            <p className="text-xs text-muted-foreground">Your store is on hold by the admin team.</p>
          )}
        </div>

        {/* ── Right column: Live Preview ── */}
        <div className="space-y-4">
          <p className="text-sm font-medium text-muted-foreground">Live Preview — how Coffee Owners see your store</p>

          {/* Store card preview */}
          <div className="bg-white dark:bg-card rounded-2xl border shadow-sm overflow-hidden max-w-sm mx-auto lg:mx-0" data-testid="preview-store-card">
            <div className="relative aspect-[16/9] bg-gray-100 dark:bg-muted overflow-hidden">
              {form.mediaType === "VIDEO" && form.videoUrl ? (
                <video src={form.videoUrl} className="w-full h-full object-cover" muted autoPlay loop playsInline />
              ) : (
                <SlideshowPreview urls={previewImages.length > 0 ? previewImages : [form.coverUrl].filter(Boolean)} name={form.name} />
              )}
              <button className="absolute top-2 right-2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm">
                <Heart className="w-3.5 h-3.5 text-gray-400" />
              </button>
              {!form.isOpen && (
                <div className="absolute top-2 left-2">
                  <Badge className="bg-gray-900/80 text-white border-0 text-[10px]">Closed</Badge>
                </div>
              )}
              {form.musicUrl && (
                <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/50 text-white rounded-full px-2 py-0.5">
                  <Music className="w-3 h-3 animate-pulse" />
                  <span className="text-[10px]">Music</span>
                </div>
              )}
            </div>
            <div className="p-3 flex gap-3 relative z-20">
              <div className="w-12 h-12 rounded-full border-2 border-white dark:border-card -mt-8 bg-white dark:bg-card shadow-sm overflow-hidden shrink-0 flex items-center justify-center">
                {form.logoUrl ? (
                  <img src={form.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <Store className="w-5 h-5 text-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0 mt-0.5">
                <h3 className="font-bold text-sm leading-tight truncate">{form.name || "Your Store Name"}</h3>
                <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{form.description || "Your store description will appear here."}</p>
                <div className="flex items-center gap-1 text-[11px] text-amber-600 mt-1.5">
                  <Package className="w-3 h-3" /><span>Distance shown to nearby cafe owners</span>
                </div>
              </div>
            </div>
          </div>

          {/* Opening hours preview */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-3.5 h-3.5" />Opening Hours Preview</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                {DAYS.map(({ key, label }) => {
                  const day = form.openingHours[key] ?? DEFAULT_HOURS;
                  return (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground w-24">{label}</span>
                      {day.closed ? (
                        <span className="text-red-500 font-medium">Closed</span>
                      ) : (
                        <span className="font-medium">{day.open} – {day.close}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {form.visibility === "HIDDEN" && (
            <p className="text-xs text-muted-foreground text-center">This store card is hidden from the marketplace. Your products still appear normally.</p>
          )}
        </div>
      </div>
    </div>
  );
}
