import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/use-currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard, EmptyState } from "@/components/dashboard/dashboard-kit";
import { Megaphone, DollarSign, Clock, Image as ImageIcon, X, Globe, Calendar, AlertCircle } from "lucide-react";
import {
  useMyMarketingProfile, useUpdateMarketingProfile, useMarketingTaxonomy, useUpdateMarketingAvailability,
} from "@/hooks/use-marketing";
import { WEEKLY_DAY_DEFS, buildWeeklyHoursFallback } from "@/lib/weekly-hours";
import type { OpeningHoursMap } from "@shared/schema";

const MAX_PORTFOLIO_IMAGES = 10;

// Marketing's "Services" are the taxonomy categories a provider opts into
// (profile.categories) plus the profile-level pricing/description fields —
// same flat-profile model as Maintenance's "Spécialités & Compétences"
// (toggle in/out of a shared admin taxonomy), not a duplicate per-item catalog
// like Print's (a Marketing provider's real offering is closer to Maintenance's
// "book my time for a service" shape than Print's priced-items shape).
export default function MarketingServices() {
  const { user } = useAuth();
  const { toast } = useToast();
  const currency = useCurrency();
  const { data, isLoading } = useMyMarketingProfile(user?.id ?? null);
  const { data: taxonomy = [], isLoading: taxonomyLoading } = useMarketingTaxonomy();
  const updateProfile = useUpdateMarketingProfile();
  const updateAvailability = useUpdateMarketingAvailability();

  const [categories, setCategories] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [startingPrice, setStartingPrice] = useState("0");
  const [responseTime, setResponseTime] = useState("< 24h");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  const [portfolioDraft, setPortfolioDraft] = useState("");
  const [isOnVacation, setIsOnVacation] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState<OpeningHoursMap>(buildWeeklyHoursFallback([], "09:00", "18:00"));

  useEffect(() => {
    if (!data?.profile) return;
    setCategories(data.profile.categories ?? []);
    setDescription(data.profile.description ?? "");
    setStartingPrice(String((data.profile.startingPriceInCents ?? 0) / 100));
    setResponseTime(data.profile.responseTime ?? "< 24h");
    setWebsiteUrl(data.profile.websiteUrl ?? "");
    setPortfolioImages(data.profile.portfolioImages ?? []);
    setIsOnVacation(data.profile.isOnVacation ?? false);
    setWeeklyHours(data.profile.weeklyHours ?? buildWeeklyHoursFallback([], "09:00", "18:00"));
  }, [data?.profile?.updatedAt]);

  const toggleCategory = (name: string) => {
    setCategories((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
  };

  const addPortfolioImage = () => {
    if (!portfolioDraft.trim() || portfolioImages.length >= MAX_PORTFOLIO_IMAGES) return;
    setPortfolioImages((current) => [...current, portfolioDraft.trim()]);
    setPortfolioDraft("");
  };

  const save = () => {
    let url: string | undefined;
    if (websiteUrl.trim()) {
      try { url = new URL(websiteUrl.trim()).toString(); } catch {
        toast({ title: "URL de site web invalide", description: "Utilisez un lien complet, ex. https://votre-site.com", variant: "destructive" });
        return;
      }
    }
    updateProfile.mutate(
      {
        categories,
        description,
        startingPriceInCents: Math.round((parseFloat(startingPrice) || 0) * 100),
        responseTime,
        websiteUrl: url ?? "",
        portfolioImages,
      },
      {
        onSuccess: () => toast({ title: "Services mis à jour" }),
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      },
    );
  };

  const saveAvailability = () => {
    updateAvailability.mutate(
      { isOnVacation, isAvailable: !isOnVacation, weeklyHours },
      {
        onSuccess: () => toast({ title: "Disponibilités sauvegardées" }),
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      },
    );
  };

  const updateDayHours = (key: keyof OpeningHoursMap, patch: Partial<OpeningHoursMap[keyof OpeningHoursMap]>) => {
    setWeeklyHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  if (isLoading || taxonomyLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Services</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Choisissez les services que vous proposez et votre tarification.</p>
      </div>

      <SectionCard title="Services proposés" icon={Megaphone}>
        {taxonomy.length === 0 ? (
          <EmptyState message="Aucune catégorie disponible pour le moment." icon={Megaphone} />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {taxonomy.filter((t) => t.isActive && !t.isFrozen).map((t) => (
              <button
                key={t.id}
                onClick={() => toggleCategory(t.name)}
                data-testid={`button-toggle-service-${t.name}`}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  categories.includes(t.name)
                    ? "bg-fuchsia-600 text-white border-fuchsia-600"
                    : "bg-background text-muted-foreground border-border hover:border-fuchsia-300"
                }`}>
                {t.icon ? `${t.icon} ` : ""}{t.name}
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Tarification & délai de réponse" icon={DollarSign}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Prix de départ ({currency})</Label>
            <Input type="number" min="0" value={startingPrice} onChange={(e) => setStartingPrice(e.target.value)} data-testid="input-starting-price" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Temps de réponse</Label>
            <Input value={responseTime} onChange={(e) => setResponseTime(e.target.value)} placeholder="< 24h" data-testid="input-response-time" />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Description" icon={Megaphone}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Décrivez votre agence, vos spécialités, votre approche…" data-testid="input-description" />
      </SectionCard>

      <SectionCard title="Site web" icon={Globe}>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Lien vers votre site (facultatif)</Label>
          <Input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://votre-site.com"
            data-testid="input-website-url"
          />
        </div>
      </SectionCard>

      <SectionCard title={`Portfolio (${portfolioImages.length}/${MAX_PORTFOLIO_IMAGES})`} icon={ImageIcon}>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Ajouter une image (URL)</Label>
          <div className="flex gap-2">
            <Input
              value={portfolioDraft}
              onChange={(e) => setPortfolioDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPortfolioImage(); } }}
              placeholder="https://…"
              disabled={portfolioImages.length >= MAX_PORTFOLIO_IMAGES}
              data-testid="input-portfolio-image"
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={!portfolioDraft.trim() || portfolioImages.length >= MAX_PORTFOLIO_IMAGES}
              onClick={addPortfolioImage}
              data-testid="button-add-portfolio-image"
            >
              Ajouter
            </Button>
          </div>
          {portfolioImages.length >= MAX_PORTFOLIO_IMAGES && (
            <p className="text-xs text-amber-600">Maximum {MAX_PORTFOLIO_IMAGES} photos atteint. Supprimez-en une pour en ajouter une nouvelle.</p>
          )}
          <p className="text-xs text-muted-foreground">La première image devient la photo principale de votre carte sur le Marketplace.</p>
          {portfolioImages.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
              {portfolioImages.map((image, index) => (
                <div key={`${image}-${index}`} className="relative group">
                  <img src={image} alt={`Portfolio ${index + 1}`} className="h-24 w-full rounded-xl object-cover bg-muted" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")} />
                  {index === 0 && (
                    <span className="absolute bottom-1 left-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-fuchsia-600 text-white">Principale</span>
                  )}
                  <button
                    type="button"
                    aria-label={`Supprimer l'image ${index + 1}`}
                    onClick={() => setPortfolioImages((current) => current.filter((_, i) => i !== index))}
                    className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid={`button-remove-portfolio-${index}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <Button onClick={save} disabled={updateProfile.isPending} className="w-full sm:w-fit bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-2xl" data-testid="button-save-services">
        {updateProfile.isPending ? "Enregistrement…" : "Enregistrer"}
      </Button>

      <SectionCard title="Disponibilité" icon={Calendar}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm text-foreground">Mode Congé / Absence</p>
              <p className="text-xs text-muted-foreground mt-0.5">Masque votre profil et stoppe les nouvelles demandes</p>
            </div>
            <button
              onClick={() => setIsOnVacation((v) => !v)}
              className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${isOnVacation ? "bg-fuchsia-600" : "bg-muted"}`}
              data-testid="button-toggle-vacation"
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isOnVacation ? "left-6" : "left-0.5"}`} />
            </button>
          </div>
          {isOnVacation && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Votre profil est masqué. Désactivez le mode congé pour réapparaître dans les résultats.
            </div>
          )}

          <div className="space-y-2">
            {WEEKLY_DAY_DEFS.map((d) => {
              const day = weeklyHours[d.key];
              return (
                <div key={d.key} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
                  <button
                    onClick={() => updateDayHours(d.key, { closed: !day.closed })}
                    className={`w-16 shrink-0 h-9 rounded-xl text-xs font-semibold transition-all ${
                      !day.closed ? "bg-fuchsia-600 text-white shadow-md" : "bg-muted text-muted-foreground hover:opacity-80"
                    }`}
                    data-testid={`button-toggle-day-${d.key}`}
                  >
                    {d.short}
                  </button>
                  {day.closed ? (
                    <span className="text-xs font-medium text-muted-foreground flex-1">Fermé</span>
                  ) : (
                    <div className="flex items-center gap-2 flex-1">
                      <Input type="time" value={day.open} onChange={(e) => updateDayHours(d.key, { open: e.target.value })} className="h-9 rounded-xl text-xs" data-testid={`input-day-open-${d.key}`} />
                      <span className="text-muted-foreground text-xs">–</span>
                      <Input type="time" value={day.close} onChange={(e) => updateDayHours(d.key, { close: e.target.value })} className="h-9 rounded-xl text-xs" data-testid={`input-day-close-${d.key}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Button onClick={saveAvailability} disabled={updateAvailability.isPending} variant="outline" className="w-full sm:w-fit rounded-2xl" data-testid="button-save-availability">
            {updateAvailability.isPending ? "Enregistrement…" : "Sauvegarder les disponibilités"}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
