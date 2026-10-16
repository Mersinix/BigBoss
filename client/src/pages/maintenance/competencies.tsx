import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, DashboardHero } from "@/components/dashboard/dashboard-kit";
import { Wrench, Check, Layers, MousePointerClick, Save } from "lucide-react";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { encodeMaintenanceSubSkillKey, decodeMaintenanceSubSkillKey } from "@shared/maintenance-sub-skill-key";

// Moved out of profile.tsx's "Spécialités & Compétences" card into its own Business
// tab (see business.tsx). Source of truth: GET /api/maintenance/taxonomy (Admin-managed
// competencies/sub-competencies) and this account's own GET/PATCH /api/maintenance/profile
// (profile.skills/profile.subSkills — the ONE authoritative pair; `categories` is a
// deprecated duplicate of `skills` that this page no longer writes at all, see
// maintenanceProfiles.categories's own schema comment — "Remove Legacy Categories from
// Maintenance and Use Only Compétences" task). PATCH /api/maintenance/profile is a
// partial update (storage.upsertMaintenanceProfile does a plain Drizzle .set() with only
// the keys present in the body — see server/routes.ts), so saving only
// {skills, subSkills} here can never reset jobTitle/bio/availability/etc.
//
// Visual presentation AND selection behavior mirror Espace Imprimerie → Business →
// Catégories (pages/printer/categories.tsx): a Maintenance account selects real
// sub-competencies, not just parent competencies.
//
// IMPORTANT (bug fix — "Fix Maintenance Sub-Skill Isolation" task): selectedSubSkills
// stores PARENT-QUALIFIED keys ("<competency>::<subSkill>", see
// shared/maintenance-sub-skill-key.ts), never bare sub-skill names. The same sub-skill
// label (e.g. "Entretien", "Installation", "Réparation") legitimately exists under
// several different parent competencies in the admin taxonomy — storing/checking by
// bare name made selecting it under ONE parent appear selected under EVERY parent that
// has a sub-skill of that same name. Every read/write of selectedSubSkills below goes
// through encode/decode so each selection stays independently tied to its own parent.
export default function MaintenanceCompetenciesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: profileData, isLoading: profileLoading } = useQuery<{ profile: any }>({
    queryKey: ["/api/maintenance/profile", user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/maintenance/profile/${user!.id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load profile");
      return response.json();
    },
    enabled: !!user?.id,
  });
  const { data: taxonomy, isLoading: taxonomyLoading } = useQuery<{
    competencies: { id: number; name: string; icon: string | null }[];
    subCompetencies: { id: number; competencyId: number; name: string; icon: string | null }[];
  }>({ queryKey: ["/api/maintenance/taxonomy"] });

  const competencies = taxonomy?.competencies ?? [];
  const subCompetencies = taxonomy?.subCompetencies ?? [];

  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [selectedSubSkills, setSelectedSubSkills] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);

  // Re-seed from the server only while not mid-edit, so a realtime refresh (e.g. an
  // Admin renaming a competency elsewhere) never clobbers an unsaved selection — same
  // convention as printer/categories.tsx.
  useEffect(() => {
    if (!profileData || dirty) return;
    setSelectedSpecialties(profileData.profile.skills ?? []);
    setSelectedSubSkills(profileData.profile.subSkills ?? []);
  }, [profileData, dirty]);

  const toggleSpecialty = (name: string) => {
    setDirty(true);
    setSelectedSpecialties((prev) => {
      const next = prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name];
      return next;
    });
    if (selectedSpecialties.includes(name)) {
      // Unselecting a competency also drops any of ITS OWN sub-competency selections —
      // matched by the parent-qualified key's own `competency` field (never by bare
      // sub-skill name, which could wrongly match a same-named sub-skill under a
      // DIFFERENT still-selected parent) — same rule as Imprimerie's toggleCategory,
      // and matching the server-side guard in PATCH /api/maintenance/profile.
      setSelectedSubSkills((prev) => prev.filter((key) => decodeMaintenanceSubSkillKey(key)?.competency !== name));
    }
  };

  const toggleSubSkill = (competencyName: string, subSkillName: string) => {
    setDirty(true);
    const key = encodeMaintenanceSubSkillKey(competencyName, subSkillName);
    setSelectedSubSkills((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/maintenance/profile", {
      skills: selectedSpecialties, subSkills: selectedSubSkills,
    }),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["/api/maintenance/profile", user?.id] });
      qc.invalidateQueries({ queryKey: ["/api/maintenance/profiles"] });
      toast({ title: "Compétences mises à jour" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible d'enregistrer.", variant: "destructive" }),
  });

  const isLoading = profileLoading || taxonomyLoading;

  const pagination = usePagination(competencies.length);
  useEffect(() => { pagination.resetPage(); }, [competencies.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageCompetencies = competencies.slice(pagination.start, pagination.end);

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Compétences"
        subtitle="Sélectionnez les compétences gérées par l'administrateur qui correspondent à votre activité."
        icon={Wrench}
        gradientClass="bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent border-orange-500/20"
        iconBgClass="bg-orange-500/15"
        iconTextClass="text-orange-600 dark:text-orange-400"
        action={
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} data-testid="button-save-maintenance-competencies">
            <Save className="w-4 h-4 mr-1.5" />{save.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-orange-50 dark:bg-orange-950/30"><Wrench className="w-4 h-4 text-orange-600" /></div>
            <div><p className="text-xl font-bold leading-none">{selectedSpecialties.length}</p><p className="text-xs text-muted-foreground mt-0.5">Compétences sélectionnées</p></div>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-purple-50 dark:bg-purple-950/30"><Check className="w-4 h-4 text-purple-600" /></div>
            <div><p className="text-xl font-bold leading-none">{selectedSubSkills.length}</p><p className="text-xs text-muted-foreground mt-0.5">Sous-compétences actives</p></div>
          </CardContent>
        </Card>
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/30"><Layers className="w-4 h-4 text-amber-600" /></div>
            <div><p className="text-xl font-bold leading-none">{competencies.length}</p><p className="text-xs text-muted-foreground mt-0.5">Disponibles</p></div>
          </CardContent>
        </Card>
      </div>

      {competencies.length > 0 && (
        <div className="rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 px-4 py-2.5 text-sm text-orange-700 dark:text-orange-300 flex items-center gap-2">
          <MousePointerClick className="w-4 h-4 flex-shrink-0" />
          Cochez une compétence pour afficher ses sous-compétences, puis cliquez sur "Enregistrer" pour confirmer votre sélection.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : competencies.length === 0 ? (
        <EmptyState message="Aucune compétence Maintenance n'a encore été créée par l'administrateur." icon={Wrench} />
      ) : (
        <div className="space-y-4">
          {pageCompetencies.map((competency) => {
            const checked = selectedSpecialties.includes(competency.name);
            const subs = subCompetencies.filter((s) => s.competencyId === competency.id);
            const selectedSubCount = subs.filter((s) => selectedSubSkills.includes(encodeMaintenanceSubSkillKey(competency.name, s.name))).length;
            return (
              <Card
                key={competency.id}
                className={`overflow-hidden transition-all ${checked ? "ring-1 ring-primary shadow-sm border-primary/40" : "hover:border-primary/30"}`}
                data-testid={`card-maintenance-competency-${competency.id}`}
              >
                <div className="p-4 pb-0">
                  <label className="flex items-center gap-3 cursor-pointer select-none" data-testid={`row-maintenance-competency-${competency.id}`}>
                    <Checkbox checked={checked} onCheckedChange={() => toggleSpecialty(competency.name)} data-testid={`checkbox-competency-${competency.id}`} />
                    <span className="text-2xl">{competency.icon || "🛠️"}</span>
                    <div>
                      <p className="font-semibold text-base">{competency.name}</p>
                      {subs.length > 0 && <p className="text-xs text-muted-foreground mt-0.5">{selectedSubCount} sur {subs.length} sous-compétences sélectionnées</p>}
                    </div>
                  </label>
                </div>
                {checked && (
                  <CardContent className="pt-4">
                    {subs.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Aucune sous-compétence définie pour le moment.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {subs.map((sub) => {
                          const subChecked = selectedSubSkills.includes(encodeMaintenanceSubSkillKey(competency.name, sub.name));
                          return (
                            <div
                              key={sub.id}
                              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${subChecked ? "border-primary/40 bg-primary/5" : "border-border"}`}
                              data-testid={`subcompetency-item-${sub.id}`}
                            >
                              <Checkbox
                                checked={subChecked}
                                onCheckedChange={() => toggleSubSkill(competency.name, sub.name)}
                                data-testid={`checkbox-subcompetency-${sub.id}`}
                              />
                              <button
                                type="button"
                                className="flex-1 min-w-0 text-left cursor-pointer"
                                onClick={() => toggleSubSkill(competency.name, sub.name)}
                                data-testid={`button-select-subcompetency-${sub.id}`}
                              >
                                <p className="text-sm font-medium truncate">{sub.icon ? `${sub.icon} ` : ""}{sub.name}</p>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
          <DataPagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={competencies.length}
            totalPages={pagination.totalPages}
            start={pagination.start}
            end={pagination.end}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            itemLabel="compétences"
          />
        </div>
      )}

      <Card className="rounded-2xl bg-orange-500/5 border-orange-500/20">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-1.5">Sélectionné par mon compte Maintenance</p>
          {selectedSpecialties.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune compétence sélectionnée — ajoutez-en au moins une pour apparaître dans les recherches des cafés.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {selectedSpecialties.join(", ")}
              {selectedSubSkills.length > 0 && ` · ${selectedSubSkills.map((key) => decodeMaintenanceSubSkillKey(key)?.subSkill).filter(Boolean).join(", ")}`}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
