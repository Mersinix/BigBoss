import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useThemeStore } from "@/store/theme-store";
import {
  useCreateBaristaJob,
  useUpdateBaristaJob,
  useBaristaEducationLevels,
  useBaristaLanguages,
  type BaristaJobPost,
  type BaristaJobPostWithStats,
  type BaristaJobPostInput,
  type BaristaJobPublicationMode,
  type BaristaJobStatus,
} from "@/hooks/use-barista-marketplace";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, Globe, UserCheck } from "lucide-react";

// Not Admin-managed (unlike Niveau d'étude / Langue) — the backend stores
// employmentTypes as free-form strings, so this fixed chip list lives here.
const EMPLOYMENT_TYPE_OPTIONS = ["CDI", "CDD", "Temps plein", "Temps partiel", "SIVP", "Stage", "Freelance"];

function slug(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ISO timestamp -> "YYYY-MM-DD" in local time, for <input type="date">.
function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "YYYY-MM-DD" -> ISO at end of that local day, so the offer stays open the
// whole expiration day (server compares expiresAt > now).
function dateInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

type FormState = {
  title: string;
  establishment: string;
  locationAddress: string;
  openPositions: string;
  employmentTypes: string[];
  experienceRequired: string;
  educationLevels: string[];
  languages: string[];
  remuneration: string;
  description: string;
  requirements: string;
  expiresAt: string;
  publicationMode: BaristaJobPublicationMode;
};

function initialState(job?: BaristaJobPost | null): FormState {
  return {
    title: job?.title ?? "",
    establishment: job?.establishment ?? "",
    locationAddress: job?.locationAddress ?? "",
    openPositions: String(job?.openPositions ?? 1),
    employmentTypes: job?.employmentTypes ?? [],
    experienceRequired: job?.experienceRequired ?? "",
    educationLevels: job?.educationLevels ?? [],
    languages: job?.languages ?? [],
    remuneration: job?.remuneration ?? "",
    description: job?.description ?? "",
    requirements: job?.requirements ?? "",
    expiresAt: isoToDateInput(job?.expiresAt),
    publicationMode: job?.publicationMode ?? "AUTOMATIC",
  };
}

export function JobPostFormModal({
  open,
  onClose,
  editingJob,
}: {
  open: boolean;
  onClose: () => void;
  editingJob?: BaristaJobPostWithStats | BaristaJobPost | null;
}) {
  const { toast } = useToast();
  const isDark = useThemeStore((s) => s.isDark);
  const t = {
    modalBg: isDark ? "bg-gray-900 border-gray-800" : "bg-white",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
    chipOff: isDark ? "bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100",
    chipOn: "bg-green-600 text-white border-green-600 shadow-sm",
  };

  const createJob = useCreateBaristaJob();
  const updateJob = useUpdateBaristaJob();
  const { data: educationOptions = [] } = useBaristaEducationLevels();
  const { data: languageOptions = [] } = useBaristaLanguages();

  const [form, setForm] = useState<FormState>(() => initialState(editingJob));
  const [titleError, setTitleError] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<BaristaJobStatus | null>(null);

  // Re-seed only when the modal (re)opens or the edited job changes — never on
  // a failed submit, so entered values survive an error toast.
  useEffect(() => {
    if (open) {
      setForm(initialState(editingJob));
      setTitleError(false);
      setPendingStatus(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingJob?.id]);

  const isEditing = !!editingJob;
  const isPending = createJob.isPending || updateJob.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((p) => ({ ...p, [key]: value }));
  const toggleIn = (key: "employmentTypes" | "educationLevels" | "languages", value: string) =>
    setForm((p) => ({ ...p, [key]: p[key].includes(value) ? p[key].filter((v) => v !== value) : [...p[key], value] }));

  const submit = (status: BaristaJobStatus) => {
    if (isPending) return;
    const title = form.title.trim();
    if (!title) {
      setTitleError(true);
      toast({ title: "Champ requis", description: "L'intitulé du poste est obligatoire.", variant: "destructive" });
      return;
    }
    const positions = Math.max(1, Math.floor(Number(form.openPositions) || 1));

    const payload: BaristaJobPostInput = {
      title,
      locationAddress: form.locationAddress.trim(),
      openPositions: positions,
      employmentTypes: form.employmentTypes,
      experienceRequired: form.experienceRequired.trim(),
      educationLevels: form.educationLevels,
      languages: form.languages,
      remuneration: form.remuneration.trim(),
      description: form.description.trim(),
      requirements: form.requirements.trim(),
      expiresAt: dateInputToIso(form.expiresAt),
      publicationMode: form.publicationMode,
      status,
    };
    // Blank establishment on create -> omit so the backend auto-fills it from
    // the account name. On edit, send what's in the field.
    const establishment = form.establishment.trim();
    if (establishment || isEditing) payload.establishment = establishment;

    const handlers = {
      onSuccess: () => {
        toast({
          title: status === "PUBLISHED" ? "Offre publiée" : "Brouillon enregistré",
          description: status === "PUBLISHED"
            ? (form.publicationMode === "MANUAL" ? "Visible uniquement par les profils que vous ciblez via Flash." : "Visible par tous les baristas éligibles.")
            : undefined,
        });
        setPendingStatus(null);
        onClose();
      },
      onError: (err: Error) => {
        setPendingStatus(null);
        toast({ title: "Erreur", description: err.message, variant: "destructive" });
      },
    };

    setPendingStatus(status);
    if (editingJob) updateJob.mutate({ id: editingJob.id, ...payload }, handlers);
    else createJob.mutate(payload, handlers);
  };

  const label = (text: string, required = false) => (
    <label className={`text-xs font-semibold mb-1.5 block ${t.textMuted}`}>
      {text}{required && <span className="text-red-500"> *</span>}
    </label>
  );

  const chip = (key: string, text: string, active: boolean, onClick: () => void, testId: string) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${active ? t.chipOn : t.chipOff}`}
    >
      {active && <Check className="w-3 h-3" />}
      {text}
    </button>
  );

  const modeOption = (mode: BaristaJobPublicationMode, title: string, subtitle: string, Icon: typeof Globe) => {
    const active = form.publicationMode === mode;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => set("publicationMode", mode)}
        data-testid={`radio-job-publication-${mode.toLowerCase()}`}
        className={`flex-1 text-left p-3 rounded-xl border-2 transition-colors ${
          active
            ? (isDark ? "border-green-500 bg-green-900/30" : "border-green-600 bg-green-50")
            : (isDark ? "border-gray-700 bg-gray-800/60 hover:border-gray-600" : "border-gray-200 bg-gray-50 hover:border-gray-300")
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? "border-green-600" : (isDark ? "border-gray-500" : "border-gray-300")}`}>
            {active && <span className="w-2 h-2 rounded-full bg-green-600" />}
          </span>
          <Icon className={`w-4 h-4 shrink-0 ${active ? "text-green-600" : t.textMuted}`} />
          <span className={`text-sm font-semibold ${t.textPrimary}`}>{title}</span>
        </div>
        <p className={`text-xs mt-1 pl-6 ${t.textMuted}`}>{subtitle}</p>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isPending) onClose(); }}>
      <DialogContent
        className={`sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full ${t.modalBg} ${isDark ? "[&>button]:text-gray-400" : ""}`}
      >
        <DialogHeader>
          <DialogTitle className={t.textPrimary}>{isEditing ? "Modifier l'offre d'emploi" : "Publier une offre d'emploi"}</DialogTitle>
        </DialogHeader>

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit("PUBLISHED"); }}>
          <div>
            {label("Intitulé du poste", true)}
            <Input
              value={form.title}
              onChange={(e) => { set("title", e.target.value); if (titleError && e.target.value.trim()) setTitleError(false); }}
              placeholder="ex: Barista confirmé"
              maxLength={200}
              className={`${t.inputBg} ${titleError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              data-testid="input-job-title"
            />
            {titleError && <p className="text-xs text-red-500 mt-1" data-testid="error-job-title">L'intitulé du poste est obligatoire.</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              {label("Établissement")}
              <Input
                value={form.establishment}
                onChange={(e) => set("establishment", e.target.value)}
                placeholder={isEditing ? "Nom de l'établissement" : "Par défaut : le nom de votre compte"}
                maxLength={200}
                className={t.inputBg}
                data-testid="input-job-establishment"
              />
            </div>
            <div>
              {label("Localisation / adresse")}
              <Input
                value={form.locationAddress}
                onChange={(e) => set("locationAddress", e.target.value)}
                placeholder="ex: Les Berges du Lac, Tunis"
                maxLength={300}
                className={t.inputBg}
                data-testid="input-job-location"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              {label("Postes vacants")}
              <Input
                type="number"
                min={1}
                max={999}
                value={form.openPositions}
                onChange={(e) => set("openPositions", e.target.value)}
                onBlur={() => set("openPositions", String(Math.min(999, Math.max(1, Math.floor(Number(form.openPositions) || 1)))))}
                className={t.inputBg}
                data-testid="input-job-open-positions"
              />
            </div>
            <div>
              {label("Expérience requise")}
              <Input
                value={form.experienceRequired}
                onChange={(e) => set("experienceRequired", e.target.value)}
                placeholder="ex: 0 à 1 an"
                maxLength={120}
                className={t.inputBg}
                data-testid="input-job-experience"
              />
            </div>
            <div>
              {label("Date d'expiration")}
              <Input
                type="date"
                value={form.expiresAt}
                onChange={(e) => set("expiresAt", e.target.value)}
                className={`${t.inputBg} ${isDark ? "[color-scheme:dark]" : ""}`}
                data-testid="input-job-expires-at"
              />
            </div>
          </div>

          <div>
            {label("Type d'emploi")}
            <div className="flex flex-wrap gap-1.5">
              {EMPLOYMENT_TYPE_OPTIONS.map((opt) =>
                chip(opt, opt, form.employmentTypes.includes(opt), () => toggleIn("employmentTypes", opt), `chip-job-employment-${slug(opt)}`)
              )}
            </div>
          </div>

          <div>
            {label("Niveau d'étude")}
            {educationOptions.length === 0 ? (
              <p className={`text-xs ${t.textMuted}`}>Aucun niveau d'étude disponible.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {educationOptions.map((opt) =>
                  chip(String(opt.id), opt.name, form.educationLevels.includes(opt.name), () => toggleIn("educationLevels", opt.name), `chip-job-education-${opt.id}`)
                )}
              </div>
            )}
          </div>

          <div>
            {label("Langue")}
            {languageOptions.length === 0 ? (
              <p className={`text-xs ${t.textMuted}`}>Aucune langue disponible.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {languageOptions.map((opt) =>
                  chip(String(opt.id), opt.name, form.languages.includes(opt.name), () => toggleIn("languages", opt.name), `chip-job-language-${opt.id}`)
                )}
              </div>
            )}
          </div>

          <div>
            {label("Rémunération")}
            <Input
              value={form.remuneration}
              onChange={(e) => set("remuneration", e.target.value)}
              placeholder="ex: 1200 DT/mois ou Confidentiel"
              maxLength={200}
              className={t.inputBg}
              data-testid="input-job-remuneration"
            />
          </div>

          <div>
            {label("Description")}
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="Décrivez le poste, les missions, l'ambiance de l'établissement…"
              className={t.inputBg}
              data-testid="input-job-description"
            />
          </div>

          <div>
            {label("Exigences")}
            <Textarea
              value={form.requirements}
              onChange={(e) => set("requirements", e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Compétences, qualifications, disponibilités attendues…"
              className={t.inputBg}
              data-testid="input-job-requirements"
            />
          </div>

          <div>
            {label("Mode de publication")}
            <div role="radiogroup" className="flex flex-col sm:flex-row gap-2">
              {modeOption("AUTOMATIC", "Publication automatique", "Visible par tous les baristas éligibles", Globe)}
              {modeOption("MANUAL", "Publication manuelle — Profils sélectionnés", "Visible uniquement par les profils que vous sélectionnez via Flash", UserCheck)}
            </div>
          </div>

          <div className={`flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-4 border-t ${t.border}`}>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isPending}
              className={t.textPrimary}
              data-testid="button-job-cancel"
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => submit("DRAFT")}
              disabled={isPending}
              className={isDark ? "border-gray-700 text-gray-200 bg-transparent hover:bg-gray-800" : ""}
              data-testid="button-job-submit-draft"
            >
              {isPending && pendingStatus === "DRAFT" ? "Enregistrement…" : "Enregistrer comme brouillon"}
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-job-submit-publish"
            >
              {isPending && pendingStatus === "PUBLISHED" ? "Publication…" : "Publier"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
