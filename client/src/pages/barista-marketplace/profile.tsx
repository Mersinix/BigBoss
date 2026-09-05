import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import {
  useMyBaristaProfile,
  useUpdateBaristaProfile,
  useUpdateBaristaAvailability,
  useBaristaSkills,
  useCreateBaristaWorkHistory,
  useUpdateBaristaWorkHistory,
  useDeleteBaristaWorkHistory,
  type BaristaLevel,
  type BaristaWorkHistory,
} from "@/hooks/use-barista-marketplace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, UserCheck, Eye, EyeOff, Award, Image as ImageIcon, X, Plus, Briefcase, Pencil, Trash2, Calendar, Zap } from "lucide-react";
import { WEEKLY_DAY_DEFS, buildWeeklyHoursFallback } from "@/lib/weekly-hours";
import { BaristaDetailModal } from "@/components/barista/barista-detail-modal";
import type { OpeningHoursMap } from "@shared/schema";

const LEVEL_LABELS: Record<BaristaLevel, string> = { BEGINNER: "Débutant", ADVANCED: "Avancé", EXPERT: "Expert" };

export default function BaristaProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const { data, isLoading } = useMyBaristaProfile(user?.id ?? null);
  const { data: skillOptions = [] } = useBaristaSkills();
  const updateProfile = useUpdateBaristaProfile();
  const updateAvailability = useUpdateBaristaAvailability();

  const [level, setLevel] = useState<BaristaLevel>("BEGINNER");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [rate, setRate] = useState("");
  const [city, setCity] = useState("");
  const [visible, setVisible] = useState(true);
  const [onVacation, setOnVacation] = useState(false);
  // Per-day schedule (Barista availability update) — legacy availableDays kept
  // (still derived and sent on save for backward compatibility) alongside the
  // new per-day schedule that now actually drives the editor UI.
  const [weeklyHours, setWeeklyHours] = useState<OpeningHoursMap>(buildWeeklyHoursFallback([]));

  // Certifications & expérience (Part 18) — real, Barista-entered values only.
  const [certifications, setCertifications] = useState<string[]>([]);
  const [newCertification, setNewCertification] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [portfolioUrls, setPortfolioUrls] = useState<string[]>([]);
  const [newPortfolioUrl, setNewPortfolioUrl] = useState("");

  const createWorkHistory = useCreateBaristaWorkHistory();
  const updateWorkHistory = useUpdateBaristaWorkHistory();
  const deleteWorkHistory = useDeleteBaristaWorkHistory();
  const [workHistoryForm, setWorkHistoryForm] = useState<Partial<BaristaWorkHistory> | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!data?.profile) return;
    setLevel(data.profile.level);
    setBio(data.profile.bio ?? "");
    setSkills(data.profile.skills ?? []);
    setRate(String((data.profile.dailyRateInCents ?? 0) / 100));
    setCity(data.profile.city ?? "");
    setVisible(data.profile.marketplaceVisible);
    setOnVacation(data.profile.isOnVacation);
    setWeeklyHours(data.profile.weeklyHours ?? buildWeeklyHoursFallback(data.profile.availableDays ?? []));
    setCertifications(data.profile.certifications ?? []);
    setExperienceYears(data.profile.experienceYears != null ? String(data.profile.experienceYears) : "");
    setPortfolioUrls(data.profile.portfolioUrls ?? []);
  }, [data?.profile?.updatedAt]);

  const toggleSkill = (name: string) => {
    setSkills((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
  };
  const updateDayHours = (key: keyof OpeningHoursMap, patch: Partial<OpeningHoursMap[keyof OpeningHoursMap]>) => {
    setWeeklyHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };
  const addCertification = () => {
    const v = newCertification.trim();
    if (!v || certifications.includes(v)) return;
    setCertifications((prev) => [...prev, v]);
    setNewCertification("");
  };
  const addPortfolioUrl = () => {
    const v = newPortfolioUrl.trim();
    if (!v || portfolioUrls.includes(v)) return;
    setPortfolioUrls((prev) => [...prev, v]);
    setNewPortfolioUrl("");
  };

  // Single Save button covering both profile fields and availability (Part 17) —
  // fires both existing mutations together instead of exposing two separate buttons;
  // no business behavior changes, both endpoints are still called exactly as before.
  const saving = updateProfile.isPending || updateAvailability.isPending;
  const saveAll = () => {
    updateProfile.mutate(
      {
        level, bio, skills, dailyRateInCents: Math.round(parseFloat(rate || "0") * 100), city, marketplaceVisible: visible,
        certifications, experienceYears: experienceYears.trim() === "" ? null : Number(experienceYears), portfolioUrls,
      },
      { onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }) }
    );
    // Legacy availableDays derived from the per-day schedule for backward
    // compatibility — weeklyHours is now the real source of truth.
    const derivedAvailableDays = WEEKLY_DAY_DEFS.filter((d) => !weeklyHours[d.key].closed).map((d) => d.short);
    updateAvailability.mutate(
      { availableDays: derivedAvailableDays, isOnVacation: onVacation, isAvailable: !onVacation, weeklyHours },
      {
        onSuccess: () => toast({ title: "Profil enregistré" }),
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  const saveWorkHistory = () => {
    if (!workHistoryForm?.cafeName?.trim()) return;
    const payload = {
      cafeName: workHistoryForm.cafeName.trim(),
      role: workHistoryForm.role ?? "",
      startPeriod: workHistoryForm.startPeriod ?? "",
      endPeriod: workHistoryForm.endPeriod || null,
      description: workHistoryForm.description ?? "",
    };
    const onDone = {
      onSuccess: () => { setWorkHistoryForm(null); toast({ title: "Café précédent enregistré" }); },
      onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
    };
    if (workHistoryForm.id) updateWorkHistory.mutate({ id: workHistoryForm.id, ...payload }, onDone);
    else createWorkHistory.mutate(payload, onDone);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mon profil public</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Ce profil est visible par les cafés sur la marketplace Barista.</p>
        </div>
        {/* Preview — opens the exact same modal a Coffee Owner sees on /barista
            (read-only there: Favorite/Report/Message/Avis/Recruter are inert,
            only Disponibilité stays functional), fed by this same real profile
            data, never a separate/fake preview dataset. */}
        <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setPreviewOpen(true)} data-testid="button-preview-profile">
          <Eye className="w-3.5 h-3.5" /> Aperçu
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-green-600" /> Informations
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {visible ? <Eye className="w-3.5 h-3.5 text-green-600" /> : <EyeOff className="w-3.5 h-3.5" />}
            {visible ? "Visible sur la marketplace" : "Masqué de la marketplace"}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Niveau</label>
              <Select value={level} onValueChange={(v) => setLevel(v as BaristaLevel)}>
                <SelectTrigger data-testid="select-profile-level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["BEGINNER", "ADVANCED", "EXPERT"] as const).map((l) => (
                    <SelectItem key={l} value={l}>{LEVEL_LABELS[l]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Ville</label>
              {user?.locationAddress ? (
                <>
                  <Input value={user.locationAddress} disabled data-testid="input-profile-city" />
                  <p className="text-[11px] text-muted-foreground mt-1">Dérivée de votre adresse (Settings → Localisation).</p>
                </>
              ) : (
                <>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Tunis" data-testid="input-profile-city" />
                  <p className="text-[11px] text-muted-foreground mt-1">Ajoutez une adresse dans Settings pour une localisation précise.</p>
                </>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Tarif journalier</label>
            <Input type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} data-testid="input-profile-rate" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Bio</label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="Présentez votre expérience et votre spécialité..." data-testid="input-profile-bio" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Compétences</label>
            <div className="flex flex-wrap gap-1.5">
              {skillOptions.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => toggleSkill(skill.name)}
                  data-testid={`chip-skill-${skill.id}`}
                >
                  <Badge
                    variant={skills.includes(skill.name) ? "default" : "outline"}
                    className={skills.includes(skill.name) ? "bg-green-600 hover:bg-green-700 cursor-pointer" : "cursor-pointer"}
                  >
                    {skill.name}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div>
              <p className="text-sm font-medium">Visible sur la marketplace</p>
              <p className="text-xs text-muted-foreground">Désactivez pour vous masquer temporairement des recherches.</p>
            </div>
            <Switch checked={visible} onCheckedChange={setVisible} data-testid="switch-profile-visible" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Award className="w-4 h-4 text-green-600" /> Certifications &amp; expérience
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Expérience (ans)</label>
            <Input type="number" min={0} max={80} value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} placeholder="Ex: 5" className="max-w-[160px]" data-testid="input-profile-experience-years" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Certifications</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {certifications.length === 0 && <p className="text-xs text-muted-foreground">Aucune certification ajoutée.</p>}
              {certifications.map((cert) => (
                <Badge key={cert} variant="outline" className="gap-1 pr-1">
                  {cert}
                  <button type="button" onClick={() => setCertifications((prev) => prev.filter((c) => c !== cert))} data-testid={`button-remove-certification-${cert}`}>
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newCertification} onChange={(e) => setNewCertification(e.target.value)} placeholder="Ex: Certification SCA" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCertification())} data-testid="input-new-certification" />
              <Button type="button" variant="outline" size="icon" onClick={addCertification} data-testid="button-add-certification"><Plus className="w-4 h-4" /></Button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" /> Portfolio (images)</label>
            {portfolioUrls.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
                {portfolioUrls.map((url) => (
                  <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border border-border/50 bg-muted">
                    <img src={url} alt="Portfolio" className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")} />
                    <button
                      type="button"
                      onClick={() => setPortfolioUrls((prev) => prev.filter((u) => u !== url))}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-remove-portfolio-${url}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input value={newPortfolioUrl} onChange={(e) => setNewPortfolioUrl(e.target.value)} placeholder="https://…" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPortfolioUrl())} data-testid="input-new-portfolio-url" />
              <Button type="button" variant="outline" size="icon" onClick={addPortfolioUrl} data-testid="button-add-portfolio-url"><Plus className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-green-600" /> Cafés précédents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.card?.workHistory ?? []).length === 0 && !workHistoryForm && (
            <p className="text-xs text-muted-foreground">Aucune expérience précédente enregistrée.</p>
          )}
          {(data?.card?.workHistory ?? []).map((w: BaristaWorkHistory) => (
            <div key={w.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/50">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{w.cafeName}{w.role ? ` — ${w.role}` : ""}</p>
                <p className="text-xs text-muted-foreground">{w.startPeriod || "?"} → {w.endPeriod || "Aujourd'hui"}</p>
                {w.description && <p className="text-xs text-muted-foreground mt-1">{w.description}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWorkHistoryForm(w)} data-testid={`button-edit-work-history-${w.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteWorkHistory.mutate(w.id)} data-testid={`button-delete-work-history-${w.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}

          {workHistoryForm ? (
            <div className="p-3 rounded-lg border border-border/50 space-y-2 bg-muted/30">
              <Input placeholder="Nom du café / établissement" value={workHistoryForm.cafeName ?? ""} onChange={(e) => setWorkHistoryForm((p) => ({ ...p, cafeName: e.target.value }))} data-testid="input-work-history-cafe-name" />
              <Input placeholder="Rôle (ex: Barista senior)" value={workHistoryForm.role ?? ""} onChange={(e) => setWorkHistoryForm((p) => ({ ...p, role: e.target.value }))} data-testid="input-work-history-role" />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Début (ex: 2022)" value={workHistoryForm.startPeriod ?? ""} onChange={(e) => setWorkHistoryForm((p) => ({ ...p, startPeriod: e.target.value }))} data-testid="input-work-history-start" />
                <Input placeholder="Fin (vide = actuel)" value={workHistoryForm.endPeriod ?? ""} onChange={(e) => setWorkHistoryForm((p) => ({ ...p, endPeriod: e.target.value }))} data-testid="input-work-history-end" />
              </div>
              <Textarea placeholder="Description (facultatif)" rows={2} value={workHistoryForm.description ?? ""} onChange={(e) => setWorkHistoryForm((p) => ({ ...p, description: e.target.value }))} data-testid="input-work-history-description" />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" onClick={() => setWorkHistoryForm(null)}>Annuler</Button>
                <Button type="button" onClick={saveWorkHistory} disabled={createWorkHistory.isPending || updateWorkHistory.isPending} className="bg-green-600 hover:bg-green-700 text-white" data-testid="button-save-work-history">
                  Enregistrer
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setWorkHistoryForm({})} className="gap-1.5" data-testid="button-add-work-history">
              <Plus className="w-3.5 h-3.5" /> Ajouter un café précédent
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><Calendar className="w-4 h-4 text-green-600" />Disponibilité</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Per-day schedule — each day configured independently instead of a
              single global toggle, mirroring the same Maintenance update. */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Jours et horaires disponibles</label>
            <div className="space-y-2">
              {WEEKLY_DAY_DEFS.map((d) => {
                const day = weeklyHours[d.key];
                return (
                  <div key={d.key} className="flex items-center gap-3 rounded-xl border border-border/50 p-2.5">
                    <button
                      type="button"
                      onClick={() => updateDayHours(d.key, { closed: !day.closed })}
                      className={`w-16 shrink-0 h-9 rounded-xl text-xs font-semibold transition-all ${
                        !day.closed ? "bg-green-600 text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70"
                      }`}
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

          {/* Dynamic summary — reflects the actual saved per-day schedule. */}
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="font-semibold text-xs mb-2 text-green-700 dark:text-green-400 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Résumé de disponibilité</p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              {WEEKLY_DAY_DEFS.map((d) => {
                const day = weeklyHours[d.key];
                return <p key={d.key}><strong className="text-foreground">{d.label} :</strong> {day.closed ? "Fermé" : `${day.open} – ${day.close}`}</p>;
              })}
              <p className="pt-1"><strong className="text-foreground">Statut :</strong> {onVacation ? "🔴 En congé" : "🟢 Disponible"}</p>
            </div>
          </div>

          {/* Vacation mode — separate concept from the weekly schedule, kept
              exactly as-is (Part 4). */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div>
              <p className="text-sm font-medium">En vacances / indisponible</p>
              <p className="text-xs text-muted-foreground">Vous n'apparaîtrez plus comme disponible aux cafés.</p>
            </div>
            <Switch checked={onVacation} onCheckedChange={setOnVacation} data-testid="switch-profile-vacation" />
          </div>
        </CardContent>
      </Card>

      {/* One main Save button covering profile + availability (Part 17) — replaces
          the two separate "Enregistrer le profil" / "Enregistrer la disponibilité"
          buttons; both underlying mutations still fire, no behavior change. */}
      <div className="flex justify-end sticky bottom-4">
        <Button onClick={saveAll} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white shadow-lg" data-testid="button-save-profile-all">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>

      <BaristaDetailModal
        baristaUserId={user?.id ?? null}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onRecruit={() => {}}
        readOnly
      />
    </div>
  );
}
