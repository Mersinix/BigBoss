import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useThemeStore } from "@/store/theme-store";
import { useAuth } from "@/hooks/use-auth";
import {
  useCreateMaintenanceJob,
  useUpdateMaintenanceJob,
  type MaintenanceJobPost,
  type MaintenanceJobPostWithStats,
  type MaintenanceJobPostInput,
  type MaintenanceJobPublicationMode,
  type MaintenanceJobStatus,
} from "@/hooks/use-maintenance-jobs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Globe, UserCheck } from "lucide-react";

const URGENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "LOW", label: "Faible" },
  { value: "NORMAL", label: "Normale" },
  { value: "HIGH", label: "Élevée" },
  { value: "URGENT", label: "Urgente" },
];

// ISO timestamp -> "YYYY-MM-DD" in local time, for <input type="date">.
function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "YYYY-MM-DD" -> ISO at end of that local day, so the intervention stays
// open the whole expiration day (server compares expiresAt > now).
function dateInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

type FormState = {
  title: string;
  establishment: string;
  locationAddress: string;
  categories: string[];
  urgency: string;
  scheduledDate: string;
  scheduledTime: string;
  contactPhone: string;
  description: string;
  requirements: string;
  expiresAt: string;
  publicationMode: MaintenanceJobPublicationMode;
};

// `defaultEstablishment`/`defaultLocationAddress`/`defaultContactPhone` — the
// Coffee Owner's own saved name/address/phone, used ONLY to prefill a
// brand-new record; never applied over an existing intervention's own saved
// values on edit (mirrors job-post-form-modal.tsx exactly).
function initialState(
  job: MaintenanceJobPost | null | undefined,
  defaultEstablishment: string,
  defaultLocationAddress: string,
  defaultContactPhone: string,
): FormState {
  return {
    title: job?.title ?? "",
    establishment: job ? job.establishment : defaultEstablishment,
    locationAddress: job ? job.locationAddress : defaultLocationAddress,
    categories: job?.categories ?? [],
    urgency: job?.urgency ?? "NORMAL",
    scheduledDate: job?.scheduledDate ?? "",
    scheduledTime: job?.scheduledTime ?? "",
    contactPhone: job ? job.contactPhone : defaultContactPhone,
    description: job?.description ?? "",
    requirements: job?.requirements ?? "",
    expiresAt: isoToDateInput(job?.expiresAt as any),
    publicationMode: job?.publicationMode ?? "AUTOMATIC",
  };
}

export function MaintenanceJobPostFormModal({
  open, onClose, editingJob,
}: {
  open: boolean;
  onClose: () => void;
  editingJob?: MaintenanceJobPostWithStats | MaintenanceJobPost | null;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isDark = useThemeStore((s) => s.isDark);
  const t = {
    modalBg: isDark ? "bg-gray-900 border-gray-800" : "bg-white",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
    chipOff: isDark ? "bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100",
    chipOn: "bg-orange-600 text-white border-orange-600 shadow-sm",
    selectContent: isDark
      ? "bg-gray-800 border-gray-700 text-gray-100 [&_[data-highlighted]]:bg-gray-700 [&_[data-highlighted]]:text-white"
      : "bg-white border-gray-200 text-gray-900",
  };

  const createJob = useCreateMaintenanceJob();
  const updateJob = useUpdateMaintenanceJob();
  const { data: categoryOptions = [] } = useQuery<string[]>({ queryKey: ["/api/maintenance/categories"] });

  const [form, setForm] = useState<FormState>(() => initialState(editingJob, user?.name ?? "", user?.locationAddress ?? "", user?.phone ?? ""));
  const [titleError, setTitleError] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<MaintenanceJobStatus | null>(null);

  // Re-seed only when the modal (re)opens or the edited job changes — never
  // on a failed submit, so entered values survive an error toast.
  useEffect(() => {
    if (open) {
      setForm(initialState(editingJob, user?.name ?? "", user?.locationAddress ?? "", user?.phone ?? ""));
      setTitleError(false);
      setDateError(false);
      setPendingStatus(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingJob?.id]);

  const isEditing = !!editingJob;
  const isPending = createJob.isPending || updateJob.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((p) => ({ ...p, [key]: value }));
  const toggleCategory = (value: string) =>
    setForm((p) => ({ ...p, categories: p.categories.includes(value) ? p.categories.filter((v) => v !== value) : [...p.categories, value] }));

  const submit = (status: MaintenanceJobStatus) => {
    if (isPending) return;
    const title = form.title.trim();
    if (!title) {
      setTitleError(true);
      toast({ title: "Champ requis", description: "L'intitulé de l'intervention est obligatoire.", variant: "destructive" });
      return;
    }
    // Scheduled date is only required to actually PUBLISH (a draft can be
    // saved without it yet) — mirrors the existing reservation form's own
    // required `date` field once the intervention is live.
    if (status === "PUBLISHED" && !form.scheduledDate) {
      setDateError(true);
      toast({ title: "Champ requis", description: "La date de l'intervention est obligatoire pour publier.", variant: "destructive" });
      return;
    }
    setDateError(false);

    const payload: MaintenanceJobPostInput = {
      title,
      locationAddress: form.locationAddress.trim(),
      categories: form.categories,
      urgency: form.urgency,
      scheduledDate: form.scheduledDate || null,
      scheduledTime: form.scheduledTime || null,
      contactPhone: form.contactPhone.trim(),
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
          title: status === "PUBLISHED" ? "Intervention publiée" : "Brouillon enregistré",
          description: status === "PUBLISHED"
            ? (form.publicationMode === "MANUAL" ? "Visible uniquement par les professionnels que vous ciblez." : "Visible par tous les professionnels éligibles.")
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

  const modeOption = (mode: MaintenanceJobPublicationMode, title: string, subtitle: string, Icon: typeof Globe) => {
    const active = form.publicationMode === mode;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => set("publicationMode", mode)}
        data-testid={`radio-maintenance-job-publication-${mode.toLowerCase()}`}
        className={`flex-1 text-left p-3 rounded-xl border-2 transition-colors ${
          active
            ? (isDark ? "border-orange-500 bg-orange-900/30" : "border-orange-600 bg-orange-50")
            : (isDark ? "border-gray-700 bg-gray-800/60 hover:border-gray-600" : "border-gray-200 bg-gray-50 hover:border-gray-300")
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? "border-orange-600" : (isDark ? "border-gray-500" : "border-gray-300")}`}>
            {active && <span className="w-2 h-2 rounded-full bg-orange-600" />}
          </span>
          <Icon className={`w-4 h-4 shrink-0 ${active ? "text-orange-600" : t.textMuted}`} />
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
          <DialogTitle className={t.textPrimary}>
            {isEditing ? "Modifier l'intervention" : "Publier une intervention"}
          </DialogTitle>
        </DialogHeader>

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit("PUBLISHED"); }}>
          <div>
            {label("Intitulé de l'intervention", true)}
            <Input
              value={form.title}
              onChange={(e) => { set("title", e.target.value); if (titleError && e.target.value.trim()) setTitleError(false); }}
              placeholder="ex: Réparation du système POS"
              maxLength={200}
              className={`${t.inputBg} ${titleError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              data-testid="input-maintenance-job-title"
            />
            {titleError && <p className="text-xs text-red-500 mt-1" data-testid="error-maintenance-job-title">L'intitulé de l'intervention est obligatoire.</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              {label("Établissement")}
              <Input
                value={form.establishment}
                onChange={(e) => set("establishment", e.target.value)}
                placeholder="Nom de l'établissement"
                maxLength={200}
                className={t.inputBg}
                data-testid="input-maintenance-job-establishment"
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
                data-testid="input-maintenance-job-location"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              {label("Date de l'intervention", true)}
              <Input
                type="date"
                value={form.scheduledDate}
                onChange={(e) => { set("scheduledDate", e.target.value); if (dateError && e.target.value) setDateError(false); }}
                className={`${t.inputBg} ${isDark ? "[color-scheme:dark]" : ""} ${dateError ? "border-red-500" : ""}`}
                data-testid="input-maintenance-job-date"
              />
            </div>
            <div>
              {label("Heure")}
              <Input
                type="time"
                value={form.scheduledTime}
                onChange={(e) => set("scheduledTime", e.target.value)}
                className={`${t.inputBg} ${isDark ? "[color-scheme:dark]" : ""}`}
                data-testid="input-maintenance-job-time"
              />
            </div>
            <div>
              {label("Urgence")}
              <Select value={form.urgency} onValueChange={(v) => set("urgency", v)}>
                <SelectTrigger className={t.inputBg} data-testid="select-maintenance-job-urgency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={t.selectContent}>
                  {URGENCY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {dateError && <p className="text-xs text-red-500 -mt-2" data-testid="error-maintenance-job-date">La date de l'intervention est obligatoire pour publier.</p>}

          <div>
            {label("Catégorie")}
            {categoryOptions.length === 0 ? (
              <p className={`text-xs ${t.textMuted}`}>Aucune catégorie disponible.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {categoryOptions.map((opt) =>
                  chip(opt, opt, form.categories.includes(opt), () => toggleCategory(opt), `chip-maintenance-job-category-${opt}`)
                )}
              </div>
            )}
          </div>

          <div>
            {label("Téléphone de contact")}
            <Input
              value={form.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
              placeholder="ex: +216  XX XXX XXX"
              maxLength={40}
              className={t.inputBg}
              data-testid="input-maintenance-job-phone"
            />
          </div>

          <div>
            {label("Description")}
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="Décrivez le problème, les symptômes, le contexte…"
              className={t.inputBg}
              data-testid="input-maintenance-job-description"
            />
          </div>

          <div>
            {label("Exigences")}
            <Textarea
              value={form.requirements}
              onChange={(e) => set("requirements", e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Compétences requises, accès, équipement, expérience attendue…"
              className={t.inputBg}
              data-testid="input-maintenance-job-requirements"
            />
          </div>

          <div>
            {label("Date d'expiration")}
            <Input
              type="date"
              value={form.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
              className={`${t.inputBg} ${isDark ? "[color-scheme:dark]" : ""} max-w-xs`}
              data-testid="input-maintenance-job-expires-at"
            />
          </div>

          <div>
            {label("Mode de publication")}
            <div role="radiogroup" className="flex flex-col sm:flex-row gap-2">
              {modeOption("AUTOMATIC", "Publication automatique", "Visible par tous les professionnels éligibles", Globe)}
              {modeOption("MANUAL", "Publication manuelle — Profils sélectionnés", "Visible uniquement par les profils que vous sélectionnez", UserCheck)}
            </div>
          </div>

          <div className={`flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-4 border-t ${t.border}`}>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isPending}
              className={t.textPrimary}
              data-testid="button-maintenance-job-cancel"
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => submit("DRAFT")}
              disabled={isPending}
              className={isDark ? "border-gray-700 text-gray-200 bg-transparent hover:bg-gray-800" : ""}
              data-testid="button-maintenance-job-submit-draft"
            >
              {isPending && pendingStatus === "DRAFT" ? "Enregistrement…" : "Enregistrer comme brouillon"}
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white"
              data-testid="button-maintenance-job-submit-publish"
            >
              {isPending && pendingStatus === "PUBLISHED" ? "Publication…" : "Publier l'intervention"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
