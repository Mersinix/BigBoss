import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import {
  useDeliveryCompanyProfileDetail,
  useUpdateDeliveryCompanyProfile,
} from "@/hooks/use-delivery-company-marketplace";
import { DeliveryCompanyDetailModal } from "@/components/delivery/delivery-company-detail-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAvatarUrl } from "@/lib/avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building2, Award, MapPin, XCircle, X, Plus, Calendar, Zap, Eye, AlertCircle } from "lucide-react";
import { WEEKLY_DAY_DEFS, buildWeeklyHoursFallback } from "@/lib/weekly-hours";
import type { OpeningHoursMap } from "@shared/schema";

// Business → Profil — the Delivery Company's editable marketplace profile.
// Brand-new page (no pre-existing profile UI to preserve): mirrors the
// Maintenance profile+availability editor exactly (same fields/sections/save
// pattern), adapted to Delivery Company content. Same source of truth
// everywhere it's shown — self-editor here, Eye preview below, and the
// Supplier-facing mapped card/modal all read the same
// /api/delivery-company/profile/:userId query.
export default function DeliveryCompanyProfilePage() {
  const { user } = useAuth();
  const currency = useCurrency();
  const { toast } = useToast();
  const { data, isLoading } = useDeliveryCompanyProfileDetail(user?.id ?? null);
  const updateProfile = useUpdateDeliveryCompanyProfile();
  const [previewOpen, setPreviewOpen] = useState(false);

  const [companyType, setCompanyType] = useState("Entreprise");
  const [description, setDescription] = useState("");
  const [deliveryZones, setDeliveryZones] = useState("");
  const [dailyRate, setDailyRate] = useState("0");
  const [responseTime, setResponseTime] = useState("< 24h");
  const [experienceYears, setExperienceYears] = useState("0");
  const [certifications, setCertifications] = useState<string[]>([]);
  const [certificationDraft, setCertificationDraft] = useState("");
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  const [portfolioDraft, setPortfolioDraft] = useState("");
  const [marketplaceVisible, setMarketplaceVisible] = useState(true);
  const [isOnVacation, setIsOnVacation] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState<OpeningHoursMap>(buildWeeklyHoursFallback([], "08:00", "18:00"));

  useEffect(() => {
    if (!data?.profile) return;
    const p = data.profile;
    setCompanyType(p.companyType);
    setDescription(p.description);
    setDeliveryZones(p.deliveryZones);
    setDailyRate(String((p.dailyRateInCents ?? 0) / 100));
    setResponseTime(p.responseTime);
    setExperienceYears(String(p.experienceYears ?? 0));
    setCertifications(p.certifications ?? []);
    setPortfolioImages(p.portfolioImages ?? []);
    setMarketplaceVisible(p.marketplaceVisible);
    setIsOnVacation(p.isOnVacation);
    setWeeklyHours(p.weeklyHours ?? buildWeeklyHoursFallback([], "08:00", "18:00"));
  }, [data?.profile?.updatedAt]);

  const updateDayHours = (key: keyof OpeningHoursMap, patch: Partial<OpeningHoursMap[keyof OpeningHoursMap]>) => {
    setWeeklyHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };
  const addCertification = () => {
    const v = certificationDraft.trim();
    if (!v || certifications.includes(v)) return;
    setCertifications((prev) => [...prev, v]);
    setCertificationDraft("");
  };
  const addPortfolioUrl = () => {
    const v = portfolioDraft.trim();
    if (!v || portfolioImages.includes(v)) return;
    setPortfolioImages((prev) => [...prev, v]);
    setPortfolioDraft("");
  };

  const saveAll = () => {
    updateProfile.mutate(
      {
        companyType, description, deliveryZones,
        dailyRateInCents: Math.round((parseFloat(dailyRate) || 0) * 100),
        responseTime, experienceYears: Math.max(0, parseInt(experienceYears, 10) || 0),
        certifications, portfolioImages, marketplaceVisible,
        isOnVacation, weeklyHours,
      },
      {
        onSuccess: () => toast({ title: "Profil enregistré" }),
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return <div className="flex flex-col gap-5 p-6"><div className="h-8 w-64 bg-muted rounded animate-pulse" /><div className="h-72 w-full rounded-2xl bg-muted animate-pulse" /></div>;
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Profil de l'entreprise</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Ce profil est visible par les fournisseurs lors du dispatch de leurs livraisons.</p>
        </div>
        {/* Preview — opens the same modal a Supplier sees when dispatching an order
            (read-only here: Avis/Report/sélection are inert, only Disponibilité stays
            functional), fed by this same real profile data. */}
        <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setPreviewOpen(true)} data-testid="button-preview-profile">
          <Eye className="w-3.5 h-3.5" /> Aperçu
        </Button>
      </div>

      <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-teal-500" />Informations de l'entreprise</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={getAvatarUrl(user)} alt={user?.name ?? "Entreprise"} />
              <AvatarFallback className="bg-teal-100 text-teal-700 font-bold text-xl">{(user?.name ?? "E").charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <Label className="text-xs text-gray-500">Type</Label>
              <Select value={companyType} onValueChange={setCompanyType}>
                <SelectTrigger className="h-9 rounded-xl mt-0.5" data-testid="select-company-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Indépendant">Indépendant</SelectItem>
                  <SelectItem value="Entreprise">Entreprise</SelectItem>
                  <SelectItem value="Flotte partenaire">Flotte partenaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500">Tarif par livraison ({currency})</Label>
              <Input value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} type="number" className="h-9 rounded-xl mt-0.5" data-testid="input-daily-rate" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Temps de réponse</Label>
              <Select value={responseTime} onValueChange={setResponseTime}>
                <SelectTrigger className="h-9 rounded-xl mt-0.5" data-testid="select-response-time"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="< 1h">Moins de 1h</SelectItem>
                  <SelectItem value="< 2h">Moins de 2h</SelectItem>
                  <SelectItem value="< 4h">Moins de 4h</SelectItem>
                  <SelectItem value="< 24h">Moins de 24h</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-xl mt-0.5 resize-none" rows={3} data-testid="input-description" />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div>
              <p className="text-sm font-medium">Visible sur la marketplace</p>
              <p className="text-xs text-muted-foreground">Désactivez pour ne plus apparaître dans le dispatch des fournisseurs.</p>
            </div>
            <Switch checked={marketplaceVisible} onCheckedChange={setMarketplaceVisible} data-testid="switch-marketplace-visible" />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Award className="w-4 h-4 text-teal-500" />Certifications & expérience</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-gray-500">Expérience (ans)</Label>
            <Input type="number" min="0" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} className="h-9 rounded-xl mt-1 max-w-[180px]" data-testid="input-experience-years" />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Certifications</Label>
            <div className="flex gap-2 mt-1">
              <Input value={certificationDraft} onChange={(e) => setCertificationDraft(e.target.value)} placeholder="Ex. ISO 9001" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCertification())} className="h-9 rounded-xl" data-testid="input-new-certification" />
              <Button type="button" variant="outline" className="h-9 rounded-xl shrink-0" disabled={!certificationDraft.trim()} onClick={addCertification} data-testid="button-add-certification">Ajouter</Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {certifications.map((c, i) => (
                <span key={`${c}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2.5 py-1 text-xs">
                  {c}
                  <button type="button" aria-label={`Supprimer ${c}`} onClick={() => setCertifications((cur) => cur.filter((_, idx) => idx !== i))}><XCircle className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Portfolio (URL des images)</Label>
            <div className="flex gap-2 mt-1">
              <Input value={portfolioDraft} onChange={(e) => setPortfolioDraft(e.target.value)} placeholder="https://…" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPortfolioUrl())} className="h-9 rounded-xl" data-testid="input-new-portfolio-url" />
              <Button type="button" variant="outline" className="h-9 rounded-xl shrink-0" disabled={!portfolioDraft.trim()} onClick={addPortfolioUrl} data-testid="button-add-portfolio-url"><Plus className="w-4 h-4" /></Button>
            </div>
            {portfolioImages.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {portfolioImages.map((img, i) => (
                  <div key={`${img}-${i}`} className="relative group">
                    <img src={img} alt={`Portfolio ${i + 1}`} className="h-24 w-full rounded-xl object-cover bg-gray-100 dark:bg-gray-800" />
                    <button type="button" onClick={() => setPortfolioImages((cur) => cur.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-teal-500" />Zone d'intervention</CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="text-xs text-gray-500">Villes/zones desservies (séparées par des virgules)</Label>
          <Input value={deliveryZones} onChange={(e) => setDeliveryZones(e.target.value)} placeholder="Ex: Grand Tunis, Sfax, Sousse" className="h-9 rounded-xl mt-1" data-testid="input-delivery-zones" />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-gray-100 dark:border-gray-700/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Calendar className="w-4 h-4 text-teal-500" />Disponibilité</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-gray-500 mb-2 block">Jours et horaires disponibles</Label>
            <div className="space-y-2">
              {WEEKLY_DAY_DEFS.map((d) => {
                const day = weeklyHours[d.key];
                return (
                  <div key={d.key} className="flex items-center gap-3 rounded-xl border border-border/50 p-2.5">
                    <button
                      type="button"
                      onClick={() => updateDayHours(d.key, { closed: !day.closed })}
                      className={`w-16 shrink-0 h-9 rounded-xl text-xs font-semibold transition-all ${!day.closed ? "bg-teal-600 text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                      data-testid={`button-toggle-day-${d.key}`}
                    >
                      {d.short}
                    </button>
                    {day.closed ? (
                      <span className="text-xs font-medium text-muted-foreground flex-1">Fermé</span>
                    ) : (
                      <div className="flex items-center gap-2 flex-1">
                        <Input type="time" value={day.open} onChange={(e) => updateDayHours(d.key, { open: e.target.value })} className="h-9 text-xs" data-testid={`input-day-open-${d.key}`} />
                        <span className="text-muted-foreground text-xs">–</span>
                        <Input type="time" value={day.close} onChange={(e) => updateDayHours(d.key, { close: e.target.value })} className="h-9 text-xs" data-testid={`input-day-close-${d.key}`} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-muted/40 p-3">
            <p className="font-semibold text-xs mb-2 text-teal-700 dark:text-teal-400 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Résumé de disponibilité</p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              {WEEKLY_DAY_DEFS.map((d) => {
                const day = weeklyHours[d.key];
                return <p key={d.key}><strong className="text-foreground">{d.label} :</strong> {day.closed ? "Fermé" : `${day.open} – ${day.close}`}</p>;
              })}
              <p className="pt-1"><strong className="text-foreground">Statut :</strong> {isOnVacation ? "🔴 En congé" : "🟢 Disponible"}</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div>
              <p className="text-sm font-medium">En congé / indisponible</p>
              <p className="text-xs text-muted-foreground">Vous n'apparaîtrez plus comme disponible pour le dispatch.</p>
            </div>
            <Switch checked={isOnVacation} onCheckedChange={setIsOnVacation} data-testid="switch-vacation" />
          </div>
          {isOnVacation && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-3 text-xs text-orange-700 dark:text-orange-300 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Votre entreprise est masquée. Désactivez le mode congé pour réapparaître.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-4">
        <Button onClick={saveAll} disabled={updateProfile.isPending} className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg rounded-2xl py-5 px-6" data-testid="button-save-profile-all">
          {updateProfile.isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>

      <DeliveryCompanyDetailModal
        companyUserId={user?.id ?? null}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        readOnly
      />
    </div>
  );
}
