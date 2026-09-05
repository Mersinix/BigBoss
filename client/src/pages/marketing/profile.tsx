import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/dashboard/dashboard-kit";
import { Megaphone, Image as ImageIcon, X, Globe, Calendar, AlertCircle, Eye } from "lucide-react";
import {
  useMyMarketingProfile, useUpdateMarketingProfile, useUpdateMarketingAvailability, useMyMarketingServices,
} from "@/hooks/use-marketing";
import { MarketingDetailModal } from "@/components/marketing/marketing-detail-modal";
import { MarketingServiceDetailModal } from "@/components/marketing/marketing-service-detail-modal";
import { WEEKLY_DAY_DEFS, buildWeeklyHoursFallback } from "@/lib/weekly-hours";
import type { OpeningHoursMap } from "@shared/schema";

const MAX_PORTFOLIO_IMAGES = 10;

// Business → Profil — Agency → Multiple Services split: this page now owns ONLY
// agency-level information (description/website/portfolio/availability/visibility).
// Category/price/response-time/service-description/service-image moved to their own
// Business → Services page (see services.tsx) — editing a service here would have
// been exactly the "agency-level field reused as a service-level field" bug this task
// asked to fix. "Services proposés" below is a read-only summary of the agency's real
// services (same useMyMarketingServices query Business → Services uses) — manage them
// there, not here.
export default function MarketingProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, isLoading } = useMyMarketingProfile(user?.id ?? null);
  const { data: services = [] } = useMyMarketingServices();
  const updateProfile = useUpdateMarketingProfile();
  const updateAvailability = useUpdateMarketingAvailability();

  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  const [portfolioDraft, setPortfolioDraft] = useState("");
  const [isOnVacation, setIsOnVacation] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState<OpeningHoursMap>(buildWeeklyHoursFallback([], "09:00", "18:00"));
  const [marketplaceVisible, setMarketplaceVisible] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewServiceId, setPreviewServiceId] = useState<number | null>(null);

  useEffect(() => {
    if (!data?.profile) return;
    setDescription(data.profile.description ?? "");
    setWebsiteUrl(data.profile.websiteUrl ?? "");
    setPortfolioImages(data.profile.portfolioImages ?? []);
    setIsOnVacation(data.profile.isOnVacation ?? false);
    setWeeklyHours(data.profile.weeklyHours ?? buildWeeklyHoursFallback([], "09:00", "18:00"));
    setMarketplaceVisible(data.profile.marketplaceVisible);
  }, [data?.profile?.updatedAt]);

  const addPortfolioImage = () => {
    if (!portfolioDraft.trim() || portfolioImages.length >= MAX_PORTFOLIO_IMAGES) return;
    setPortfolioImages((current) => [...current, portfolioDraft.trim()]);
    setPortfolioDraft("");
  };

  const saveProfile = () => {
    let url: string | undefined;
    if (websiteUrl.trim()) {
      try { url = new URL(websiteUrl.trim()).toString(); } catch {
        toast({ title: "URL de site web invalide", description: "Utilisez un lien complet, ex. https://votre-site.com", variant: "destructive" });
        return;
      }
    }
    updateProfile.mutate(
      { description, websiteUrl: url ?? "", portfolioImages, marketplaceVisible },
      {
        onSuccess: () => toast({ title: "Profil mis à jour" }),
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

  if (isLoading) {
    return <div className="flex flex-col gap-4"><Skeleton className="h-40 w-full rounded-2xl" /><Skeleton className="h-40 w-full rounded-2xl" /></div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Profil</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gérez la présentation publique de votre agence.</p>
        </div>
        {/* Preview — opens the same modal a Coffee Owner sees on /marketing (read-only here:
            Favorite/Report/Message/Avis/Devis are inert, only Disponibilité, the Portfolio
            album and browsing real services stay functional). */}
        <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setPreviewOpen(true)} data-testid="button-preview-agency">
          <Eye className="w-3.5 h-3.5" /> Aperçu
        </Button>
      </div>

      <SectionCard title={`Services proposés (${services.length})`} icon={Megaphone}>
        {services.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun service créé pour le moment — ajoutez-en depuis Business → Services.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPreviewServiceId(s.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${s.isPublished ? "bg-fuchsia-600 text-white border-fuchsia-600" : "bg-background text-muted-foreground border-border"}`}
                data-testid={`chip-service-${s.id}`}
              >
                {s.category}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">Créer, modifier ou publier un service se fait depuis Business → Services.</p>
      </SectionCard>

      <SectionCard title="Description de l'agence" icon={Megaphone}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Décrivez votre agence, votre expérience, votre approche…" data-testid="input-agency-description" />
      </SectionCard>

      <SectionCard title="Site web" icon={Globe}>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Lien vers votre site (facultatif)</Label>
          <Input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://votre-site.com" data-testid="input-website-url" />
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
            <Button type="button" variant="outline" className="shrink-0" disabled={!portfolioDraft.trim() || portfolioImages.length >= MAX_PORTFOLIO_IMAGES} onClick={addPortfolioImage} data-testid="button-add-portfolio-image">
              Ajouter
            </Button>
          </div>
          {portfolioImages.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
              {portfolioImages.map((image, index) => (
                <div key={`${image}-${index}`} className="relative group">
                  <img src={image} alt={`Portfolio ${index + 1}`} className="h-24 w-full rounded-xl object-cover bg-muted" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")} />
                  <button type="button" aria-label={`Supprimer l'image ${index + 1}`} onClick={() => setPortfolioImages((current) => current.filter((_, i) => i !== index))} className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`button-remove-portfolio-${index}`}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Visibilité" icon={Eye}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Afficher mon agence sur /marketing</p>
            <p className="text-xs text-muted-foreground mt-0.5">Lorsque désactivé, vos services publiés ne sont plus visibles par les Coffee Owners.</p>
          </div>
          <button
            onClick={() => setMarketplaceVisible((v) => !v)}
            className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${marketplaceVisible ? "bg-fuchsia-600" : "bg-muted"}`}
            data-testid="button-toggle-marketplace-visible"
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${marketplaceVisible ? "left-6" : "left-0.5"}`} />
          </button>
        </div>
      </SectionCard>

      <Button onClick={saveProfile} disabled={updateProfile.isPending} className="w-full sm:w-fit bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-2xl" data-testid="button-save-profile">
        {updateProfile.isPending ? "Enregistrement…" : "Enregistrer"}
      </Button>

      <SectionCard title="Disponibilité" icon={Calendar}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm text-foreground">Mode Congé / Absence</p>
              <p className="text-xs text-muted-foreground mt-0.5">Masque votre agence et stoppe les nouvelles demandes</p>
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
                    className={`w-16 shrink-0 h-9 rounded-xl text-xs font-semibold transition-all ${!day.closed ? "bg-fuchsia-600 text-white shadow-md" : "bg-muted text-muted-foreground hover:opacity-80"}`}
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

      <MarketingDetailModal
        marketingUserId={user?.id ?? null}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onRequestQuote={() => {}}
        onOpenService={(serviceId) => setPreviewServiceId(serviceId)}
        readOnly
      />
      <MarketingServiceDetailModal
        serviceId={previewServiceId}
        open={previewServiceId != null}
        onClose={() => setPreviewServiceId(null)}
        readOnly
      />
    </div>
  );
}
