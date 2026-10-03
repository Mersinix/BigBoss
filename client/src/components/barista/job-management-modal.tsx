import { useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { useThemeStore } from "@/store/theme-store";
import {
  useMyBaristaJobs,
  useUpdateBaristaJob,
  useBaristaJobTargets,
  useBaristaJobApplicationsForJob,
  useUpdateBaristaJobApplicationStatus,
  useProposeBaristaJobMeeting,
  type BaristaJobPostWithStats,
  type BaristaJobApplication,
  type BaristaJobApplicationStatus,
  type BaristaJobStatus,
  type BaristaJobPublicationMode,
} from "@/hooks/use-barista-marketplace";
import { JobPostFormModal } from "@/components/barista/job-post-form-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Briefcase, Building2, CalendarClock, CalendarDays, Check, ChevronRight, Globe,
  MessageSquare, Pencil, Plus, RotateCcw, Send, Star, UserCheck, Users, X, XCircle,
} from "lucide-react";

// Same Record<Status, …> label/color pattern as barista-marketplace/requests.tsx,
// but branched on isDark (this app's dark mode doesn't use Tailwind `dark:`).
const JOB_STATUS_LABELS: Record<BaristaJobStatus, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publiée",
  CLOSED: "Clôturée",
};
function jobStatusColors(isDark: boolean): Record<BaristaJobStatus, string> {
  return isDark
    ? { DRAFT: "bg-gray-700 text-gray-300", PUBLISHED: "bg-green-900/50 text-green-300", CLOSED: "bg-red-900/50 text-red-300" }
    : { DRAFT: "bg-gray-100 text-gray-600", PUBLISHED: "bg-green-100 text-green-700", CLOSED: "bg-red-100 text-red-700" };
}

const MODE_LABELS: Record<BaristaJobPublicationMode, string> = {
  AUTOMATIC: "Automatique",
  MANUAL: "Manuelle",
};

const APP_STATUS_LABELS: Record<BaristaJobApplicationStatus, string> = {
  PENDING: "En attente",
  PRESELECTED: "Présélectionné",
  INTERVIEW_SCHEDULED: "Entretien planifié",
  ACCEPTED: "Accepté",
  REJECTED: "Rejeté",
};
function appStatusColors(isDark: boolean): Record<BaristaJobApplicationStatus, string> {
  return isDark
    ? {
        PENDING: "bg-amber-900/50 text-amber-300",
        PRESELECTED: "bg-blue-900/50 text-blue-300",
        INTERVIEW_SCHEDULED: "bg-purple-900/50 text-purple-300",
        ACCEPTED: "bg-green-900/50 text-green-300",
        REJECTED: "bg-red-900/50 text-red-300",
      }
    : {
        PENDING: "bg-amber-100 text-amber-700",
        PRESELECTED: "bg-blue-100 text-blue-700",
        INTERVIEW_SCHEDULED: "bg-purple-100 text-purple-700",
        ACCEPTED: "bg-green-100 text-green-700",
        REJECTED: "bg-red-100 text-red-700",
      };
}

const MEETING_STATUS_LABELS: Record<string, string> = {
  PROPOSED: "Proposé — en attente de réponse",
  CONFIRMED: "Confirmé",
  CANCELLED: "Annulé",
};

// Owner-side transitions. ACCEPTED / REJECTED are terminal (no further actions).
// INTERVIEW_SCHEDULED is reached by proposing a meeting, not by a raw button.
const APP_TRANSITIONS: Record<BaristaJobApplicationStatus, ("PRESELECTED" | "ACCEPTED" | "REJECTED")[]> = {
  PENDING: ["PRESELECTED", "ACCEPTED", "REJECTED"],
  PRESELECTED: ["ACCEPTED", "REJECTED"],
  INTERVIEW_SCHEDULED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [],
  REJECTED: [],
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
// ISO -> "YYYY-MM-DDTHH:mm" local, for <input type="datetime-local">.
function isoToDateTimeInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
function isExpired(job: BaristaJobPostWithStats) {
  return !!job.expiresAt && new Date(job.expiresAt).getTime() <= Date.now();
}

function useTokens(isDark: boolean) {
  return {
    modalBg: isDark ? "bg-gray-900 border-gray-800" : "bg-white",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    textSubtle: isDark ? "text-gray-500" : "text-gray-400",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    card: isDark ? "bg-gray-800/60 border-gray-700/60" : "bg-white border-gray-200",
    cardHover: isDark ? "hover:bg-gray-800 hover:border-gray-600" : "hover:bg-gray-50 hover:border-gray-300",
    sectionBg: isDark ? "bg-gray-800/60" : "bg-gray-50",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
    outlineBtn: isDark ? "border-gray-700 text-gray-200 bg-transparent hover:bg-gray-800" : "",
    skeleton: isDark ? "bg-gray-800" : "",
  };
}
type Tokens = ReturnType<typeof useTokens>;

export function JobManagementModal({ open, onClose, initialJobId = null }: { open: boolean; onClose: () => void; initialJobId?: number | null }) {
  const isDark = useThemeStore((s) => s.isDark);
  const t = useTokens(isDark);
  const { toast } = useToast();
  const { data: jobs = [], isLoading } = useMyBaristaJobs();
  const updateJob = useUpdateBaristaJob();

  const [selectedJobId, setSelectedJobId] = useState<number | null>(initialJobId);
  const [formOpen, setFormOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<BaristaJobPostWithStats | null>(null);
  const [busyJobId, setBusyJobId] = useState<number | null>(null);

  // Deep-link support — when the modal is (re)opened with a different
  // initialJobId (e.g. clicked from the Baristas > Offres list elsewhere),
  // jump straight to that job's detail view instead of the list.
  useEffect(() => {
    if (open) setSelectedJobId(initialJobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialJobId]);

  const selectedJob = selectedJobId != null ? jobs.find((j) => j.id === selectedJobId) ?? null : null;

  const handleClose = () => {
    setSelectedJobId(null);
    onClose();
  };

  const openCreate = () => { setEditingJob(null); setFormOpen(true); };
  const openEdit = (job: BaristaJobPostWithStats) => { setEditingJob(job); setFormOpen(true); };

  const setJobStatus = (job: BaristaJobPostWithStats, status: "PUBLISHED" | "CLOSED") => {
    setBusyJobId(job.id);
    updateJob.mutate(
      { id: job.id, status },
      {
        onSuccess: () => toast({ title: status === "CLOSED" ? "Offre clôturée" : "Offre publiée", description: job.title }),
        onError: (err: Error) => toast({ title: "Action impossible", description: err.message, variant: "destructive" }),
        onSettled: () => setBusyJobId(null),
      }
    );
  };

  const statusActions = (job: BaristaJobPostWithStats) => {
    const busy = busyJobId === job.id;
    return (
      <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
        {job.status === "DRAFT" && (
          <Button size="sm" variant="outline" className={`h-8 gap-1 ${t.outlineBtn}`} onClick={() => openEdit(job)} data-testid={`button-job-edit-${job.id}`}>
            <Pencil className="w-3.5 h-3.5" /> Modifier
          </Button>
        )}
        {job.status === "PUBLISHED" && (
          <Button size="sm" variant="outline" disabled={busy} className={`h-8 gap-1 ${isDark ? "border-red-900 text-red-300 bg-transparent hover:bg-red-950" : "border-red-200 text-red-600 hover:bg-red-50"}`} onClick={() => setJobStatus(job, "CLOSED")} data-testid={`button-job-close-${job.id}`}>
            <XCircle className="w-3.5 h-3.5" /> Clôturer
          </Button>
        )}
        {(job.status === "DRAFT" || job.status === "CLOSED") && (
          <Button size="sm" disabled={busy} className="h-8 gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => setJobStatus(job, "PUBLISHED")} data-testid={`button-job-publish-${job.id}`}>
            {job.status === "CLOSED" ? <RotateCcw className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
            {job.status === "CLOSED" ? "Republier" : "Publier"}
          </Button>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent
          className={`sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${t.modalBg} ${isDark ? "[&>button]:text-gray-400" : ""}`}
        >
          {selectedJob ? (
            <JobDetailView
              job={selectedJob}
              isDark={isDark}
              t={t}
              onBack={() => setSelectedJobId(null)}
              actions={statusActions(selectedJob)}
            />
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-3 pr-6">
                  <DialogTitle className={`flex items-center gap-2 ${t.textPrimary}`}>
                    <Briefcase className="w-5 h-5 text-green-600" /> Mes offres d'emploi
                  </DialogTitle>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1.5" onClick={openCreate} data-testid="button-job-create">
                    <Plus className="w-4 h-4" /> Publier une offre
                  </Button>
                </div>
              </DialogHeader>

              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => <Skeleton key={i} className={`h-28 w-full rounded-xl ${t.skeleton}`} />)}
                </div>
              ) : jobs.length === 0 ? (
                <div className={`text-center py-12 ${t.textMuted}`} data-testid="empty-job-list">
                  <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className={`text-sm font-medium ${t.textPrimary}`}>Aucune offre d'emploi</p>
                  <p className="text-xs mt-1 opacity-70">Publiez votre première offre pour recevoir des candidatures de baristas.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {jobs.map((job) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      isDark={isDark}
                      t={t}
                      onOpen={() => setSelectedJobId(job.id)}
                      actions={statusActions(job)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <JobPostFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingJob(null); }}
        editingJob={editingJob}
      />
    </>
  );
}

function StatPill({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${className}`}>
      <span className="font-bold tabular-nums">{value}</span> {label}
    </span>
  );
}

function JobStats({ job, isDark }: { job: BaristaJobPostWithStats; isDark: boolean }) {
  const neutral = isDark ? "bg-gray-700/70 text-gray-200" : "bg-gray-100 text-gray-700";
  const c = appStatusColors(isDark);
  return (
    <div className="flex flex-wrap gap-1.5">
      <StatPill label={job.totalApplications > 1 ? "candidatures" : "candidature"} value={job.totalApplications} className={neutral} />
      <StatPill label="en attente" value={job.pendingApplications} className={c.PENDING} />
      <StatPill label={job.preselectedApplications > 1 ? "présélectionnés" : "présélectionné"} value={job.preselectedApplications} className={c.PRESELECTED} />
      <StatPill label={job.rejectedApplications > 1 ? "rejetés" : "rejeté"} value={job.rejectedApplications} className={c.REJECTED} />
      <StatPill label={job.processedApplications > 1 ? "traitées" : "traitée"} value={job.processedApplications} className={neutral} />
      {job.publicationMode === "MANUAL" && (
        <StatPill label={job.targetCount > 1 ? "profils ciblés" : "profil ciblé"} value={job.targetCount} className={isDark ? "bg-indigo-900/50 text-indigo-300" : "bg-indigo-100 text-indigo-700"} />
      )}
    </div>
  );
}

function ModeBadge({ mode, isDark }: { mode: BaristaJobPublicationMode; isDark: boolean }) {
  const Icon = mode === "MANUAL" ? UserCheck : Globe;
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 px-1.5 ${isDark ? "border-gray-600 text-gray-300" : "border-gray-300 text-gray-600"}`}>
      <Icon className="w-3 h-3" /> {MODE_LABELS[mode]}
    </Badge>
  );
}

function JobRow({
  job, isDark, t, onOpen, actions,
}: {
  job: BaristaJobPostWithStats;
  isDark: boolean;
  t: Tokens;
  onOpen: () => void;
  actions: ReactNode;
}) {
  const expired = isExpired(job);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className={`w-full text-left rounded-xl border p-4 space-y-3 cursor-pointer transition-colors ${t.card} ${t.cardHover}`}
      data-testid={`card-job-${job.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-semibold truncate ${t.textPrimary}`}>{job.title}</p>
          <div className={`flex items-center gap-3 flex-wrap text-xs mt-0.5 ${t.textMuted}`}>
            {job.establishment && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {job.establishment}</span>}
            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {job.openPositions} poste{job.openPositions > 1 ? "s" : ""}</span>
            {job.expiresAt && (
              <span className={`flex items-center gap-1 ${expired ? "text-red-500" : ""}`}>
                <CalendarDays className="w-3 h-3" /> {expired ? "Expirée le" : "Expire le"} {fmtDate(job.expiresAt)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ModeBadge mode={job.publicationMode} isDark={isDark} />
          <Badge variant="secondary" className={`border-0 ${jobStatusColors(isDark)[job.status]}`}>{JOB_STATUS_LABELS[job.status]}</Badge>
          <ChevronRight className={`w-4 h-4 ${t.textSubtle}`} />
        </div>
      </div>
      <JobStats job={job} isDark={isDark} />
      {actions}
    </div>
  );
}

function JobDetailView({
  job, isDark, t, onBack, actions,
}: {
  job: BaristaJobPostWithStats;
  isDark: boolean;
  t: Tokens;
  onBack: () => void;
  actions: ReactNode;
}) {
  const { data: targets = [], isLoading: targetsLoading } = useBaristaJobTargets(job.publicationMode === "MANUAL" ? job.id : null);
  const { data: applications = [], isLoading: appsLoading } = useBaristaJobApplicationsForJob(job.id);
  const expired = isExpired(job);

  const rows: { label: string; value: ReactNode }[] = [
    { label: "Établissement", value: job.establishment || "—" },
    { label: "Localisation", value: job.locationAddress || "—" },
    { label: "Postes vacants", value: job.openPositions },
    { label: "Type d'emploi", value: job.employmentTypes.length ? job.employmentTypes.join(", ") : "—" },
    { label: "Expérience requise", value: job.experienceRequired || "—" },
    { label: "Niveau d'étude", value: job.educationLevels.length ? job.educationLevels.join(", ") : "—" },
    { label: "Langue", value: job.languages.length ? job.languages.join(", ") : "—" },
    { label: "Rémunération", value: job.remuneration || "—" },
    { label: "Date d'expiration", value: job.expiresAt ? <span className={expired ? "text-red-500" : ""}>{fmtDate(job.expiresAt)}{expired ? " (expirée)" : ""}</span> : "—" },
    { label: "Mode de publication", value: job.publicationMode === "MANUAL" ? "Manuelle — profils sélectionnés via Flash" : "Automatique — visible par tous les baristas éligibles" },
    { label: "Créée le", value: fmtDate(job.createdAt) },
  ];

  return (
    <div className="space-y-5">
      <DialogHeader>
        <div className="flex items-center gap-2 pr-6">
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour"
            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}
            data-testid="button-job-detail-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <DialogTitle className={`truncate ${t.textPrimary}`}>{job.title}</DialogTitle>
          <Badge variant="secondary" className={`border-0 shrink-0 ${jobStatusColors(isDark)[job.status]}`}>{JOB_STATUS_LABELS[job.status]}</Badge>
        </div>
      </DialogHeader>

      {actions}
      <JobStats job={job} isDark={isDark} />

      {/* Read-only job fields */}
      <div className={`rounded-xl border divide-y ${t.border} ${isDark ? "divide-gray-700/60" : "divide-gray-100"}`}>
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[140px_1fr] sm:grid-cols-[180px_1fr] gap-3 px-3 py-2 text-sm">
            <span className={t.textMuted}>{r.label}</span>
            <span className={`${t.textPrimary} break-words`}>{r.value}</span>
          </div>
        ))}
      </div>
      {job.description && (
        <div>
          <p className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Description</p>
          <p className={`text-sm whitespace-pre-wrap rounded-xl p-3 ${t.sectionBg} ${t.textPrimary}`}>{job.description}</p>
        </div>
      )}
      {job.requirements && (
        <div>
          <p className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Exigences</p>
          <p className={`text-sm whitespace-pre-wrap rounded-xl p-3 ${t.sectionBg} ${t.textPrimary}`}>{job.requirements}</p>
        </div>
      )}

      {/* Manual targeting — display only (targets are created from Flash on /barista) */}
      {job.publicationMode === "MANUAL" && (
        <div>
          <p className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${t.textPrimary}`}>
            <UserCheck className="w-4 h-4 text-indigo-500" /> Profils ciblés ({targets.length})
          </p>
          {targetsLoading ? (
            <Skeleton className={`h-12 w-full rounded-xl ${t.skeleton}`} />
          ) : targets.length === 0 ? (
            <p className={`text-xs rounded-xl p-3 ${t.sectionBg} ${t.textMuted}`} data-testid="empty-job-targets">
              Aucun profil ciblé — utilisez Flash sur /barista pour cibler des baristas pour cette offre.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {targets.map((tg) => (
                <div key={tg.id} className={`flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 ${t.card}`} data-testid={`row-job-target-${tg.baristaUserId}`}>
                  <Avatar className="w-7 h-7">
                    {tg.baristaProfileImageUrl && <AvatarImage src={tg.baristaProfileImageUrl} alt={tg.baristaName} className="object-cover" />}
                    <AvatarFallback className="bg-gradient-to-br from-green-600 to-emerald-700 text-white text-[10px] font-bold">{initials(tg.baristaName)}</AvatarFallback>
                  </Avatar>
                  <span className={`text-xs font-medium ${t.textPrimary}`}>{tg.baristaName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Candidates */}
      <div>
        <p className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${t.textPrimary}`}>
          <Users className="w-4 h-4 text-green-600" /> Candidatures ({applications.length})
        </p>
        {appsLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => <Skeleton key={i} className={`h-24 w-full rounded-xl ${t.skeleton}`} />)}
          </div>
        ) : applications.length === 0 ? (
          <div className={`text-center py-8 rounded-xl ${t.sectionBg} ${t.textMuted}`} data-testid="empty-job-applications">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Aucune candidature pour le moment.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => (
              <ApplicationCard key={app.id} app={app} isDark={isDark} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ApplicationCard({ app, isDark, t }: { app: BaristaJobApplication; isDark: boolean; t: Tokens }) {
  const { toast } = useToast();
  const updateStatus = useUpdateBaristaJobApplicationStatus();
  const proposeMeeting = useProposeBaristaJobMeeting();

  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [reproposing, setReproposing] = useState(false);

  const transitions = APP_TRANSITIONS[app.status];
  const canMeet = app.status === "PRESELECTED" || app.status === "INTERVIEW_SCHEDULED";
  const showMeetingForm = canMeet && (!app.meeting || reproposing);

  const act = (status: "PRESELECTED" | "ACCEPTED" | "REJECTED") => {
    updateStatus.mutate(
      { id: app.id, status },
      {
        onSuccess: () => toast({ title: "Candidature mise à jour", description: `${app.baristaName} — ${APP_STATUS_LABELS[status]}` }),
        onError: (err: Error) => toast({ title: "Action impossible", description: err.message, variant: "destructive" }),
      }
    );
  };

  const startRepropose = () => {
    setScheduledAt(isoToDateTimeInput(app.meeting?.scheduledAt));
    setNotes(app.meeting?.notes ?? "");
    setReproposing(true);
  };

  const submitMeeting = () => {
    if (!scheduledAt) {
      toast({ title: "Champ requis", description: "Choisissez une date et une heure pour l'entretien.", variant: "destructive" });
      return;
    }
    const d = new Date(scheduledAt);
    if (isNaN(d.getTime())) {
      toast({ title: "Date invalide", variant: "destructive" });
      return;
    }
    if (d.getTime() < Date.now()) {
      toast({ title: "Date invalide", description: "La date de l'entretien doit être dans le futur.", variant: "destructive" });
      return;
    }
    proposeMeeting.mutate(
      { applicationId: app.id, scheduledAt: d.toISOString(), notes: notes.trim() || null },
      {
        onSuccess: () => {
          toast({ title: "Entretien proposé", description: `${app.baristaName} — ${fmtDateTime(d.toISOString())}` });
          setReproposing(false);
          setScheduledAt("");
          setNotes("");
          // The meeting endpoint doesn't move the application status itself, so
          // advance PRESELECTED -> INTERVIEW_SCHEDULED via the existing status hook.
          if (app.status === "PRESELECTED") {
            updateStatus.mutate(
              { id: app.id, status: "INTERVIEW_SCHEDULED" },
              { onError: (err: Error) => toast({ title: "Statut non mis à jour", description: err.message, variant: "destructive" }) }
            );
          }
        },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  const busy = updateStatus.isPending || proposeMeeting.isPending;

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${t.card}`} data-testid={`card-job-application-${app.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="w-10 h-10 shrink-0">
            {app.baristaProfileImageUrl && <AvatarImage src={app.baristaProfileImageUrl} alt={app.baristaName} className="object-cover" />}
            <AvatarFallback className="bg-gradient-to-br from-green-600 to-emerald-700 text-white text-xs font-bold">{initials(app.baristaName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className={`font-semibold text-sm truncate ${t.textPrimary}`}>{app.baristaName}</p>
            <p className={`text-xs flex items-center gap-1 ${t.textMuted}`}>
              <CalendarDays className="w-3 h-3" /> Candidature du {fmtDate(app.createdAt)}
            </p>
          </div>
        </div>
        <Badge variant="secondary" className={`border-0 shrink-0 ${appStatusColors(isDark)[app.status]}`} data-testid={`badge-job-application-status-${app.id}`}>
          {APP_STATUS_LABELS[app.status]}
        </Badge>
      </div>

      {app.message && (
        <div className={`flex items-start gap-2 text-xs rounded-lg p-2.5 ${t.sectionBg} ${t.textMuted}`}>
          <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="whitespace-pre-wrap">{app.message}</span>
        </div>
      )}

      {/* Meeting — current proposal, or inline proposal form */}
      {app.meeting && !reproposing && (
        <div className={`flex items-start justify-between gap-3 rounded-lg p-2.5 border ${isDark ? "border-purple-900/60 bg-purple-950/30" : "border-purple-100 bg-purple-50"}`}>
          <div className="text-xs space-y-0.5 min-w-0">
            <p className={`font-semibold flex items-center gap-1 ${isDark ? "text-purple-300" : "text-purple-700"}`}>
              <CalendarClock className="w-3.5 h-3.5" /> Entretien : {fmtDateTime(app.meeting.scheduledAt)}
            </p>
            <p className={t.textMuted}>Statut : {MEETING_STATUS_LABELS[app.meeting.status] ?? app.meeting.status}</p>
            {app.meeting.notes && <p className={`whitespace-pre-wrap ${t.textMuted}`}>{app.meeting.notes}</p>}
          </div>
          {canMeet && (
            <Button size="sm" variant="outline" className={`h-7 text-xs shrink-0 ${t.outlineBtn}`} onClick={startRepropose} disabled={busy} data-testid={`button-job-meeting-repropose-${app.id}`}>
              Reproposer
            </Button>
          )}
        </div>
      )}

      {showMeetingForm && (
        <div className={`rounded-lg p-3 space-y-2 ${t.sectionBg}`}>
          <p className={`text-xs font-semibold flex items-center gap-1 ${t.textPrimary}`}>
            <CalendarClock className="w-3.5 h-3.5" /> {app.meeting ? "Reproposer un entretien" : "Proposer un entretien"}
          </p>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className={`${t.inputBg} ${isDark ? "[color-scheme:dark]" : ""}`}
            data-testid={`input-job-meeting-datetime-${app.id}`}
          />
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Notes (facultatif) — lieu, personne à contacter…"
            className={t.inputBg}
            data-testid={`input-job-meeting-notes-${app.id}`}
          />
          <div className="flex gap-2 justify-end">
            {reproposing && (
              <Button size="sm" variant="ghost" className={t.textPrimary} onClick={() => setReproposing(false)} disabled={busy} data-testid={`button-job-meeting-cancel-${app.id}`}>
                Annuler
              </Button>
            )}
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white gap-1" onClick={submitMeeting} disabled={busy || !scheduledAt} data-testid={`button-job-meeting-propose-${app.id}`}>
              <CalendarClock className="w-3.5 h-3.5" /> {proposeMeeting.isPending ? "Envoi…" : "Proposer un entretien"}
            </Button>
          </div>
        </div>
      )}

      {transitions.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-end">
          {transitions.includes("PRESELECTED") && (
            <Button size="sm" variant="outline" className={`h-8 gap-1 ${isDark ? "border-blue-900 text-blue-300 bg-transparent hover:bg-blue-950" : "border-blue-200 text-blue-700 hover:bg-blue-50"}`} onClick={() => act("PRESELECTED")} disabled={busy} data-testid={`button-job-application-preselect-${app.id}`}>
              <Star className="w-3.5 h-3.5" /> Présélectionner
            </Button>
          )}
          {transitions.includes("REJECTED") && (
            <Button size="sm" variant="outline" className={`h-8 gap-1 ${isDark ? "border-red-900 text-red-300 bg-transparent hover:bg-red-950" : "border-red-200 text-red-600 hover:bg-red-50"}`} onClick={() => act("REJECTED")} disabled={busy} data-testid={`button-job-application-reject-${app.id}`}>
              <X className="w-3.5 h-3.5" /> Rejeter
            </Button>
          )}
          {transitions.includes("ACCEPTED") && (
            <Button size="sm" className="h-8 gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => act("ACCEPTED")} disabled={busy} data-testid={`button-job-application-accept-${app.id}`}>
              <Check className="w-3.5 h-3.5" /> Accepter
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
