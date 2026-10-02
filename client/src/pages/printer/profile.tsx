import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/dashboard/dashboard-kit";
import { Printer, Globe, Eye, Package, Tag, Image as ImageIcon, X, Zap, Rocket } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { usePrintCompanyDetail, useUpdatePrinterProfile } from "@/hooks/use-print-marketplace";
import { PrintCompanyDetailModal } from "@/components/print/print-company-detail-modal";
import { PrintServiceDetailModal } from "@/components/print/print-service-detail-modal";
import { BusinessProfileIdentityCard } from "@/components/settings/business-profile-identity-card";
import { AccountAvailabilityCard } from "@/components/settings/account-availability-card";
import { buildWeeklyHoursFallback } from "@/lib/weekly-hours";
import { FlashPreviewModal } from "@/components/account/flash-preview-modal";
import { PublicationStatusBadge } from "@/components/account/publication-status-badge";
import type { PrintCatalogItem, OpeningHoursMap } from "@shared/schema";

const ACCENT = "bg-blue-600 hover:bg-blue-700 text-white";
const CARD_CLASS = "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl";
const MAX_PORTFOLIO_IMAGES = 4;

// Business → Profil — the printing COMPANY's complete public/business profile
// (identity summary/description/website/categories/services summary/
// visibility/availability), distinct from Business → Services (per-service
// category/price/min-qty/delay/description/image, still managed there —
// editing one must never touch the other, this page only ever writes to
// PATCH /api/print/profile / printerProfiles). Single source of truth for
// this information (Settings/Business-Profil separation task) — Settings no
// longer duplicates any of it. "Services proposés"/"Catégories approuvées"
// below are read-only summaries; manage them from Business → Services/
// Catégories respectively.
export default function PrinterProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = usePrintCompanyDetail(user?.id ?? null);
  const { data: catalog = [] } = useQuery<PrintCatalogItem[]>({ queryKey: ["/api/print/catalog"] });
  const updateProfile = useUpdatePrinterProfile();

  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  const [portfolioDraft, setPortfolioDraft] = useState("");
  const [marketplaceVisible, setMarketplaceVisible] = useState(true);
  const [isOnVacation, setIsOnVacation] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState<OpeningHoursMap>(buildWeeklyHoursFallback([], "08:00", "18:00"));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [flashPreviewOpen, setFlashPreviewOpen] = useState(false);
  const [previewServiceId, setPreviewServiceId] = useState<number | null>(null);

  useEffect(() => {
    if (!data?.profile) return;
    setDescription(data.profile.description ?? "");
    setWebsiteUrl(data.profile.websiteUrl ?? "");
    setPortfolioImages(data.profile.portfolioImages ?? []);
    setMarketplaceVisible(data.profile.marketplaceVisible);
    setIsOnVacation(data.profile.isOnVacation ?? false);
    setWeeklyHours(data.profile.weeklyHours ?? buildWeeklyHoursFallback([], "08:00", "18:00"));
  }, [data?.profile?.updatedAt]);

  // Unified Save (Phase 4) — ONE button persists the whole page. Unlike
  // Maintenance (whose Availability section owns its own state and endpoint,
  // hence its ref + Promise.allSettled), every Printer field — description,
  // website, portfolio, marketplaceVisible, isOnVacation, weeklyHours — already
  // lives in this component's state and is accepted by the SAME
  // PATCH /api/print/profile body, so it's a single atomic request (nothing to
  // partially fail). marketplaceVisible is plain deferred state, only sent here.
  const saveAll = async (): Promise<boolean> => {
    let url: string | undefined;
    if (websiteUrl.trim()) {
      try { url = new URL(websiteUrl.trim()).toString(); } catch {
        toast({ title: "URL de site web invalide", description: "Utilisez un lien complet, ex. https://votre-site.com", variant: "destructive" });
        return false;
      }
    }
    try {
      await updateProfile.mutateAsync({
        description, websiteUrl: url ?? "", marketplaceVisible,
        portfolioImages,
        isOnVacation, weeklyHours,
      });
      toast({ title: "Profil sauvegardé" });
      return true;
    } catch (err) {
      toast({ title: "Erreur", description: (err as Error).message, variant: "destructive" });
      return false;
    }
  };

  const goLive = useMutation({
    mutationFn: () => apiRequest("POST", "/api/print/profile/go-live", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/print/company" });
      toast({ title: "Profil soumis", description: "Un administrateur va examiner votre profil." });
    },
    onError: (error: Error) => toast({ title: "Impossible de soumettre le profil", description: error.message, variant: "destructive" }),
  });
  const handleGoLive = async () => {
    // Save first; only submit for review if the save actually succeeded (Phase 5A).
    const saved = await saveAll();
    if (saved) goLive.mutate();
  };

  const addPortfolioImage = () => {
    const v = portfolioDraft.trim();
    if (!v || portfolioImages.includes(v) || portfolioImages.length >= MAX_PORTFOLIO_IMAGES) return;
    setPortfolioImages((prev) => [...prev, v]);
    setPortfolioDraft("");
  };

  const updateDayHours = (key: keyof OpeningHoursMap, patch: Partial<OpeningHoursMap[keyof OpeningHoursMap]>) => {
    setWeeklyHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };
  const saving = updateProfile.isPending;
  const publicationStatus = (data?.profile?.publicationStatus ?? "DRAFT") as "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";

  if (isLoading) {
    return <div className="flex flex-col gap-4"><Skeleton className="h-40 w-full rounded-2xl" /><Skeleton className="h-40 w-full rounded-2xl" /></div>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Aperçu — opens the same PRINT Company Details Modal a Coffee Owner sees
          (readOnly here: Message/Signaler/Avis stay inert, only real saved data is shown). */}
      <DashboardHero
        title="Profil"
        subtitle="Gérez la présentation publique de votre imprimerie."
        icon={Printer}
        gradientClass="bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/20"
        iconBgClass="bg-blue-500/15"
        iconTextClass="text-blue-600 dark:text-blue-400"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <PublicationStatusBadge status={publicationStatus} />
            <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setPreviewOpen(true)} data-testid="button-preview-company">
              <Eye className="w-3.5 h-3.5" /> Aperçu
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setFlashPreviewOpen(true)} data-testid="button-flash-preview">
              <Zap className="w-3.5 h-3.5" /> Flash
            </Button>
          </div>
        }
      />

      <BusinessProfileIdentityCard title="Informations de l'entreprise" nameLabel="Nom de l'imprimerie" settingsPath="/printer/settings" testIdPrefix="printer" className={CARD_CLASS} />

      <SectionCard title={`Services proposés (${catalog.length})`} icon={Package} className={CARD_CLASS}>
        {catalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun service créé pour le moment — ajoutez-en depuis Business → Services.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {catalog.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPreviewServiceId(s.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${s.isActive ? "bg-blue-600 text-white border-blue-600" : "bg-background text-muted-foreground border-border"}`}
                data-testid={`chip-service-${s.id}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">Créer, modifier ou activer un service se fait depuis Business → Services.</p>
      </SectionCard>

      {user?.printCategories && user.printCategories.length > 0 && (
        <SectionCard title="Catégories approuvées" icon={Tag} className={CARD_CLASS}>
          <div className="flex flex-wrap gap-1.5">
            {user.printCategories.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Gérées depuis Business → Catégories.</p>
        </SectionCard>
      )}

      <SectionCard title="Description de l'imprimerie" icon={Printer} className={CARD_CLASS}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Décrivez votre imprimerie, votre équipement, votre expérience…" data-testid="input-company-description" />
      </SectionCard>

      <SectionCard title="Site web" icon={Globe} className={CARD_CLASS}>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Lien vers votre site (facultatif)</Label>
          <Input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://votre-site.com" data-testid="input-website-url" />
        </div>
      </SectionCard>

      <SectionCard title={`Portfolio (${portfolioImages.length}/${MAX_PORTFOLIO_IMAGES})`} icon={ImageIcon} className={CARD_CLASS}>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground -mt-1">Ajoutez jusqu'à {MAX_PORTFOLIO_IMAGES} photos de votre activité.</p>
          <div className="flex gap-2">
            <Input
              value={portfolioDraft}
              onChange={(e) => setPortfolioDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPortfolioImage())}
              placeholder="https://…"
              disabled={portfolioImages.length >= MAX_PORTFOLIO_IMAGES}
              data-testid="input-new-portfolio-url"
            />
            <Button type="button" variant="outline" className="shrink-0" disabled={!portfolioDraft.trim() || portfolioImages.length >= MAX_PORTFOLIO_IMAGES} onClick={addPortfolioImage} data-testid="button-add-portfolio-url">Ajouter</Button>
          </div>
          {portfolioImages.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {portfolioImages.map((image, index) => (
                <div key={`${image}-${index}`} className="relative group">
                  <img src={image} alt={`Portfolio ${index + 1}`} className="h-24 w-full rounded-xl object-cover bg-muted" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")} />
                  <button type="button" aria-label={`Supprimer l'image ${index + 1}`} onClick={() => setPortfolioImages((cur) => cur.filter((_, i) => i !== index))} className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Visibilité" icon={Eye} className={CARD_CLASS}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Afficher mon imprimerie sur /print</p>
            <p className="text-xs text-muted-foreground mt-0.5">Lorsque désactivé, vos services actifs ne sont plus visibles par les Coffee Owners.</p>
          </div>
          <button
            onClick={() => setMarketplaceVisible((v) => !v)}
            className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${marketplaceVisible ? "bg-blue-600" : "bg-muted"}`}
            data-testid="button-toggle-marketplace-visible"
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${marketplaceVisible ? "left-6" : "left-0.5"}`} />
          </button>
        </div>
      </SectionCard>

      {/* hideSaveButton: availability is persisted by the single unified
          Save button below (same PATCH body), not its own separate button. */}
      <AccountAvailabilityCard
        weeklyHours={weeklyHours}
        onChangeDay={updateDayHours}
        isOnVacation={isOnVacation}
        onChangeVacation={setIsOnVacation}
        hideSaveButton
        vacationDescription="Masque votre imprimerie et stoppe les nouvelles commandes."
        accentClassName={ACCENT}
        testIdPrefix="printer"
        className={CARD_CLASS}
        summaryClassName="border-transparent bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-500/10 dark:to-sky-500/10"
        summaryTextClassName="text-blue-700 dark:text-blue-400"
      />

      {/* Phase 4 — single primary Save button for the whole page (profile
          fields + portfolio + visibility + availability, via saveAll above). */}
      <Button onClick={saveAll} disabled={saving} className={`w-full rounded-2xl py-5 ${ACCENT}`} data-testid="button-save-profile-all">
        {saving ? "Sauvegarde…" : "Sauvegarder le profil"}
      </Button>

      {/* GO Live (Phase 5) — saves first, then submits for admin review.
          Disabled while a request is already pending (Phase 5C). */}
      <Button
        onClick={handleGoLive}
        disabled={saving || goLive.isPending || publicationStatus === "PENDING"}
        variant="outline"
        className="w-full rounded-2xl py-5 border-blue-500/40 text-blue-600 dark:text-blue-400 gap-2"
        data-testid="button-go-live"
      >
        <Rocket className="w-4 h-4" />
        {goLive.isPending ? "Envoi…" : publicationStatus === "PENDING" ? "En attente d'approbation" : "GO Live"}
      </Button>
      {publicationStatus === "REJECTED" && data?.profile?.publicationRejectionReason && (
        <p className="text-xs text-red-600 dark:text-red-400 text-center -mt-2">Motif du refus : {data.profile.publicationRejectionReason}</p>
      )}

      <PrintCompanyDetailModal
        printerUserId={user?.id ?? null}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onOpenService={(serviceId) => setPreviewServiceId(serviceId)}
        readOnly
      />
      <PrintServiceDetailModal
        serviceId={previewServiceId}
        open={previewServiceId != null}
        onClose={() => setPreviewServiceId(null)}
        readOnly
      />

      <FlashPreviewModal
        open={flashPreviewOpen}
        onClose={() => setFlashPreviewOpen(false)}
        name={data?.user?.name ?? data?.card?.name ?? ""}
        typeLabel="Imprimerie"
        flashImageUrl={data?.user?.flashImageUrl ?? data?.card?.flashImageUrl}
        profileImageUrl={data?.user?.profileImageUrl ?? data?.card?.profileImageUrl}
        accentBgClass="bg-blue-600"
        preview
      />
    </div>
  );
}
