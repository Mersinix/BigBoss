import { useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { useThemeStore } from "@/store/theme-store";
import {
  useMyMaintenanceJobs,
  useUpdateMaintenanceJob,
  useMaintenanceJobTargets,
  useMaintenanceJobApplicationsForJob,
  useUpdateMaintenanceJobApplicationStatus,
  type MaintenanceJobPostWithStats,
  type MaintenanceJobApplicationWithParties,
  type MaintenanceJobApplicationStatus,
  type MaintenanceJobStatus,
  type MaintenanceJobPublicationMode,
} from "@/hooks/use-maintenance-jobs";
import { MaintenanceJobPostFormModal } from "@/components/maintenance/maintenance-job-post-form-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Building2, Calendar, Check, ChevronRight, Clock, Globe,
  MapPin, MessageSquare, Pencil, Plus, RotateCcw, Send, UserCheck, Users, Wrench, X, XCircle,
} from "lucide-react";

const JOB_STATUS_LABELS: Record<MaintenanceJobStatus, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publiée",
  CLOSED: "Clôturée",
};
function jobStatusColors(isDark: boolean): Record<MaintenanceJobStatus, string> {
  return isDark
    ? { DRAFT: "bg-gray-700 text-gray-300", PUBLISHED: "bg-green-900/50 text-green-300", CLOSED: "bg-red-900/50 text-red-300" }
    : { DRAFT: "bg-gray-100 text-gray-600", PUBLISHED: "bg-green-100 text-green-700", CLOSED: "bg-red-100 text-red-700" };
}

const MODE_LABELS: Record<MaintenanceJobPublicationMode, string> = {
  AUTOMATIC: "Automatique",
  MANUAL: "Manuelle",
};

const URGENCY_LABELS: Record<string, string> = { LOW: "Faible", NORMAL: "Normale", HIGH: "Élevée", URGENT: "Urgente" };

const APP_STATUS_LABELS: Record<MaintenanceJobApplicationStatus, string> = {
  PENDING: "En attente",
  ACCEPTED: "Acceptée",
  REJECTED: "Rejetée",
};
function appStatusColors(isDark: boolean): Record<MaintenanceJobApplicationStatus, string> {
  return isDark
    ? { PENDING: "bg-amber-900/50 text-amber-300", ACCEPTED: "bg-green-900/50 text-green-300", REJECTED: "bg-red-900/50 text-red-300" }
    : { PENDING: "bg-amber-100 text-amber-700", ACCEPTED: "bg-green-100 text-green-700", REJECTED: "bg-red-100 text-red-700" };
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
// Scheduled date is stored as plain "YYYY-MM-DD" text — build a local date
// from the parts (same reasoning as job-management-modal.tsx's fmtPlainDate).
function fmtPlainDate(value: string | null | undefined) {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return fmtDate(value);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
function isExpired(job: MaintenanceJobPostWithStats) {
  return !!job.expiresAt && new Date(job.expiresAt as any).getTime() <= Date.now();
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
    outlineBtn: isDark ? "border-gray-700 text-gray-200 bg-transparent hover:bg-gray-800" : "",
    skeleton: isDark ? "bg-gray-800" : "",
  };
}
type Tokens = ReturnType<typeof useTokens>;

export function MaintenanceJobManagementModal({ open, onClose, initialJobId = null }: { open: boolean; onClose: () => void; initialJobId?: number | null }) {
  const isDark = useThemeStore((s) => s.isDark);
  const t = useTokens(isDark);
  const { data: jobs = [], isLoading } = useMyMaintenanceJobs();
  const updateJob = useUpdateMaintenanceJob();

  const [selectedJobId, setSelectedJobId] = useState<number | null>(initialJobId);
  const [formOpen, setFormOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<MaintenanceJobPostWithStats | null>(null);
  const [busyJobId, setBusyJobId] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setSelectedJobId(initialJobId);
  }, [open, initialJobId]);

  const selectedJob = selectedJobId != null ? jobs.find((j) => j.id === selectedJobId) ?? null : null;

  const handleClose = () => {
    setSelectedJobId(null);
    onClose();
  };

  const openCreate = () => { setEditingJob(null); setFormOpen(true); };
  const openEdit = (job: MaintenanceJobPostWithStats) => { setEditingJob(job); setFormOpen(true); };

  const setJobStatus = (job: MaintenanceJobPostWithStats, status: "PUBLISHED" | "CLOSED") => {
    setBusyJobId(job.id);
    updateJob.mutate(
      { id: job.id, status },
      {
        onSuccess: () => toast({ title: status === "CLOSED" ? "Intervention clôturée" : "Intervention publiée", description: job.title }),
        onError: (err: Error) => toast({ title: "Action impossible", description: err.message, variant: "destructive" }),
        onSettled: () => setBusyJobId(null),
      }
    );
  };

  const statusActions = (job: MaintenanceJobPostWithStats) => {
    const busy = busyJobId === job.id;
    return (
      <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
        {job.status === "DRAFT" && (
          <Button size="sm" variant="outline" className={`h-8 gap-1 ${t.outlineBtn}`} onClick={() => openEdit(job)} data-testid={`button-maintenance-job-edit-${job.id}`}>
            <Pencil className="w-3.5 h-3.5" /> Modifier
          </Button>
        )}
        {job.status === "PUBLISHED" && (
          <Button size="sm" variant="outline" disabled={busy} className={`h-8 gap-1 ${isDark ? "border-red-900 text-red-300 bg-transparent hover:bg-red-950" : "border-red-200 text-red-600 hover:bg-red-50"}`} onClick={() => setJobStatus(job, "CLOSED")} data-testid={`button-maintenance-job-close-${job.id}`}>
            <XCircle className="w-3.5 h-3.5" /> Clôturer
          </Button>
        )}
        {(job.status === "DRAFT" || job.status === "CLOSED") && (
          <Button size="sm" disabled={busy} className="h-8 gap-1 bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setJobStatus(job, "PUBLISHED")} data-testid={`button-maintenance-job-publish-${job.id}`}>
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
          ) : selectedJobId != null && isLoading ? (
            <div className="space-y-3" data-testid="loading-maintenance-job-detail">
              <DialogHeader className="sr-only"><DialogTitle>Chargement…</DialogTitle></DialogHeader>
              <Skeleton className={`h-8 w-2/3 rounded-lg ${t.skeleton}`} />
              {[0, 1].map((i) => <Skeleton key={i} className={`h-28 w-full rounded-xl ${t.skeleton}`} />)}
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-3 pr-6">
                  <DialogTitle className={`flex items-center gap-2 ${t.textPrimary}`}>
                    <Wrench className="w-5 h-5 text-orange-600" /> Mes interventions
                  </DialogTitle>
                  <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5" onClick={openCreate} data-testid="button-maintenance-job-create">
                    <Plus className="w-4 h-4" /> Publier une intervention
                  </Button>
                </div>
              </DialogHeader>

              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => <Skeleton key={i} className={`h-28 w-full rounded-xl ${t.skeleton}`} />)}
                </div>
              ) : jobs.length === 0 ? (
                <div className={`text-center py-12 ${t.textMuted}`} data-testid="empty-maintenance-job-list">
                  <Wrench className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className={`text-sm font-medium ${t.textPrimary}`}>Aucune intervention</p>
                  <p className="text-xs mt-1 opacity-70">Publiez votre première intervention pour recevoir des réponses de professionnels.</p>
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

      <MaintenanceJobPostFormModal
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

function JobStats({ job, isDark }: { job: MaintenanceJobPostWithStats; isDark: boolean }) {
  const neutral = isDark ? "bg-gray-700/70 text-gray-200" : "bg-gray-100 text-gray-700";
  const c = appStatusColors(isDark);
  return (
    <div className="flex flex-wrap gap-1.5">
      <StatPill label={job.totalApplications > 1 ? "réponses" : "réponse"} value={job.totalApplications} className={neutral} />
      <StatPill label="en attente" value={job.pendingApplications} className={c.PENDING} />
      <StatPill label={job.acceptedApplications > 1 ? "acceptées" : "acceptée"} value={job.acceptedApplications} className={c.ACCEPTED} />
      <StatPill label={job.rejectedApplications > 1 ? "rejetées" : "rejetée"} value={job.rejectedApplications} className={c.REJECTED} />
      {job.publicationMode === "MANUAL" && (
        <StatPill label={job.targetCount > 1 ? "profils ciblés" : "profil ciblé"} value={job.targetCount} className={isDark ? "bg-indigo-900/50 text-indigo-300" : "bg-indigo-100 text-indigo-700"} />
      )}
    </div>
  );
}

function ModeBadge({ mode, isDark }: { mode: MaintenanceJobPublicationMode; isDark: boolean }) {
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
  job: MaintenanceJobPostWithStats;
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
      data-testid={`card-maintenance-job-${job.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-semibold truncate ${t.textPrimary}`}>{job.title}</p>
          <div className={`flex items-center gap-3 flex-wrap text-xs mt-0.5 ${t.textMuted}`}>
            {job.establishment && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {job.establishment}</span>}
            {job.scheduledDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {fmtPlainDate(job.scheduledDate)}{job.scheduledTime ? ` · ${job.scheduledTime}` : ""}</span>}
            {job.expiresAt && (
              <span className={`flex items-center gap-1 ${expired ? "text-red-500" : ""}`}>
                <Clock className="w-3 h-3" /> {expired ? "Expirée le" : "Expire le"} {fmtDate(job.expiresAt as any)}
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
  job: MaintenanceJobPostWithStats;
  isDark: boolean;
  t: Tokens;
  onBack: () => void;
  actions: ReactNode;
}) {
  const { data: targets = [], isLoading: targetsLoading } = useMaintenanceJobTargets(job.publicationMode === "MANUAL" ? job.id : null);
  const { data: applications = [], isLoading: appsLoading } = useMaintenanceJobApplicationsForJob(job.id);
  const expired = isExpired(job);

  const rows: { label: string; value: ReactNode }[] = [
    { label: "Établissement", value: job.establishment || "—" },
    { label: "Localisation", value: job.locationAddress || "—" },
    { label: "Catégorie", value: job.categories.length ? job.categories.join(", ") : "—" },
    { label: "Urgence", value: URGENCY_LABELS[job.urgency] ?? job.urgency },
    { label: "Date / heure", value: job.scheduledDate ? `${fmtPlainDate(job.scheduledDate)}${job.scheduledTime ? ` à ${job.scheduledTime}` : ""}` : "—" },
    { label: "Téléphone de contact", value: job.contactPhone || "—" },
    { label: "Date d'expiration", value: job.expiresAt ? <span className={expired ? "text-red-500" : ""}>{fmtDate(job.expiresAt as any)}{expired ? " (expirée)" : ""}</span> : "—" },
    { label: "Mode de publication", value: job.publicationMode === "MANUAL" ? "Manuelle — profils sélectionnés" : "Automatique — visible par tous les professionnels éligibles" },
    { label: "Créée le", value: fmtDate(job.createdAt as any) },
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
            data-testid="button-maintenance-job-detail-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <DialogTitle className={`truncate ${t.textPrimary}`}>{job.title}</DialogTitle>
          <Badge variant="secondary" className={`border-0 shrink-0 ${jobStatusColors(isDark)[job.status]}`}>{JOB_STATUS_LABELS[job.status]}</Badge>
        </div>
      </DialogHeader>

      {actions}
      <JobStats job={job} isDark={isDark} />

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

      {/* Manual targeting — display only (targets are created from Fast
          Search / Details via MaintenanceJobTargetButton). */}
      {job.publicationMode === "MANUAL" && (
        <div>
          <p className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${t.textPrimary}`}>
            <UserCheck className="w-4 h-4 text-indigo-500" /> Profils ciblés ({targets.length})
          </p>
          {targetsLoading ? (
            <Skeleton className={`h-12 w-full rounded-xl ${t.skeleton}`} />
          ) : targets.length === 0 ? (
            <p className={`text-xs rounded-xl p-3 ${t.sectionBg} ${t.textMuted}`} data-testid="empty-maintenance-job-targets">
              Aucun profil ciblé — utilisez l'action Intervention sur Fast Search ou la fiche d'un professionnel pour cibler des profils pour cette intervention.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {targets.map((tg) => (
                <div key={tg.id} className={`flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 ${t.card}`} data-testid={`row-maintenance-job-target-${tg.maintenanceUserId}`}>
                  <Avatar className="w-7 h-7">
                    {tg.maintenanceProfileImageUrl && <AvatarImage src={tg.maintenanceProfileImageUrl} alt={tg.maintenanceName} className="object-cover" />}
                    <AvatarFallback className="bg-gradient-to-br from-orange-600 to-amber-700 text-white text-[10px] font-bold">{initials(tg.maintenanceName)}</AvatarFallback>
                  </Avatar>
                  <span className={`text-xs font-medium ${t.textPrimary}`}>{tg.maintenanceName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <p className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${t.textPrimary}`}>
          <Users className="w-4 h-4 text-orange-600" /> Réponses ({applications.length})
        </p>
        {appsLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => <Skeleton key={i} className={`h-24 w-full rounded-xl ${t.skeleton}`} />)}
          </div>
        ) : applications.length === 0 ? (
          <div className={`text-center py-8 rounded-xl ${t.sectionBg} ${t.textMuted}`} data-testid="empty-maintenance-job-applications">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Aucune réponse pour le moment.</p>
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

function ApplicationCard({ app, isDark, t }: { app: MaintenanceJobApplicationWithParties; isDark: boolean; t: Tokens }) {
  const { toast } = useToast();
  const updateStatus = useUpdateMaintenanceJobApplicationStatus();

  const act = (status: "ACCEPTED" | "REJECTED") => {
    updateStatus.mutate(
      { id: app.id, status },
      {
        onSuccess: () => toast({
          title: status === "ACCEPTED" ? "Réponse acceptée" : "Réponse rejetée",
          description: status === "ACCEPTED"
            ? `${app.maintenanceName} — une intervention a été créée dans vos réservations.`
            : `${app.maintenanceName}`,
        }),
        onError: (err: Error) => toast({ title: "Action impossible", description: err.message, variant: "destructive" }),
      }
    );
  };

  const busy = updateStatus.isPending;

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${t.card}`} data-testid={`card-maintenance-job-application-${app.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="w-10 h-10 shrink-0">
            {app.maintenanceProfileImageUrl && <AvatarImage src={app.maintenanceProfileImageUrl} alt={app.maintenanceName} className="object-cover" />}
            <AvatarFallback className="bg-gradient-to-br from-orange-600 to-amber-700 text-white text-xs font-bold">{initials(app.maintenanceName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className={`font-semibold text-sm truncate ${t.textPrimary}`}>{app.maintenanceName}</p>
            <p className={`text-xs flex items-center gap-1 ${t.textMuted}`}>
              <Calendar className="w-3 h-3" /> Réponse du {fmtDate(app.createdAt as any)}
            </p>
          </div>
        </div>
        <Badge variant="secondary" className={`border-0 shrink-0 ${appStatusColors(isDark)[app.status]}`} data-testid={`badge-maintenance-job-application-status-${app.id}`}>
          {APP_STATUS_LABELS[app.status]}
        </Badge>
      </div>

      {app.message && (
        <div className={`flex items-start gap-2 text-xs rounded-lg p-2.5 ${t.sectionBg} ${t.textMuted}`}>
          <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="whitespace-pre-wrap">{app.message}</span>
        </div>
      )}

      {app.status === "ACCEPTED" && app.reservationId != null && (
        <div className={`flex items-center gap-2 text-xs rounded-lg p-2.5 ${isDark ? "bg-green-950/30 text-green-300" : "bg-green-50 text-green-700"}`}>
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          Intervention créée — visible dans Réservations.
        </div>
      )}

      {app.status === "PENDING" && (
        <div className="flex flex-wrap gap-2 justify-end">
          <Button size="sm" variant="outline" className={`h-8 gap-1 ${isDark ? "border-red-900 text-red-300 bg-transparent hover:bg-red-950" : "border-red-200 text-red-600 hover:bg-red-50"}`} onClick={() => act("REJECTED")} disabled={busy} data-testid={`button-maintenance-job-application-reject-${app.id}`}>
            <X className="w-3.5 h-3.5" /> Rejeter
          </Button>
          <Button size="sm" className="h-8 gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => act("ACCEPTED")} disabled={busy} data-testid={`button-maintenance-job-application-accept-${app.id}`}>
            <Check className="w-3.5 h-3.5" /> Accepter
          </Button>
        </div>
      )}
    </div>
  );
}
