import { useEffect, useMemo, useState } from "react";
import {
  useDiscoverMaintenanceJobs,
  useMyMaintenanceJobApplications,
  useApplyToMaintenanceJob,
  type MaintenanceDiscoverableJob,
  type MaintenanceJobApplicationWithParties,
  type MaintenanceJobApplicationStatus,
} from "@/hooks/use-maintenance-jobs";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle, Building2, Calendar, Clock, FileText, MapPin, MessageSquare, Phone, Send, Sparkles, Wrench,
} from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

// Provider-side discovery/response page for the new Maintenance Interventions
// system — mirrors barista-marketplace/jobs.tsx, simplified (no OFFER/MISSION
// split, no meeting sub-system — see
// docs/maintenance_interventions_implementation_audit.md Section 7).

const URGENCY_LABELS: Record<string, string> = { LOW: "Faible", NORMAL: "Normale", HIGH: "Élevée", URGENT: "Urgente" };
const URGENCY_COLORS: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  NORMAL: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  HIGH: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  URGENT: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

const APPLICATION_STATUS_LABELS: Record<MaintenanceJobApplicationStatus, string> = {
  PENDING: "En attente",
  ACCEPTED: "Acceptée",
  REJECTED: "Rejetée",
};
const APPLICATION_STATUS_COLORS: Record<MaintenanceJobApplicationStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  ACCEPTED: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

const TARGETED_BADGE = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
// scheduledDate is plain "YYYY-MM-DD" text — parse as local midnight so it
// never shifts by a day across timezones (same reasoning as jobs.tsx).
function formatScheduled(value: string | null, time: string | null) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  const dateStr = isNaN(d.getTime()) ? value : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  return time ? `${dateStr} à ${time}` : dateStr;
}

function ApplyAction({ job, onApply, size = "sm" }: { job: MaintenanceDiscoverableJob; onApply: (job: MaintenanceDiscoverableJob) => void; size?: "sm" | "default" }) {
  if (job.hasApplied) {
    return (
      <Button size={size} variant="outline" disabled data-testid={`button-maintenance-job-applied-${job.id}`}>
        Déjà répondu
      </Button>
    );
  }
  return (
    <Button
      size={size}
      className="bg-orange-600 hover:bg-orange-700 text-white"
      onClick={(e) => { e.stopPropagation(); onApply(job); }}
      data-testid={`button-maintenance-job-apply-${job.id}`}
    >
      <Send className="w-3.5 h-3.5 mr-1.5" /> Répondre
    </Button>
  );
}

function JobCard({ job, onOpen, onApply }: { job: MaintenanceDiscoverableJob; onOpen: (job: MaintenanceDiscoverableJob) => void; onApply: (job: MaintenanceDiscoverableJob) => void }) {
  const scheduled = formatScheduled(job.scheduledDate, job.scheduledTime);
  return (
    <Card
      data-testid={`card-maintenance-job-${job.id}`}
      className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl cursor-pointer hover:border-orange-500/40 transition-colors"
      onClick={() => onOpen(job)}
    >
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold leading-tight" data-testid={`text-maintenance-job-title-${job.id}`}>{job.title}</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{job.establishment}</span>
            </div>
          </div>
          {job.isTargeted ? (
            <Badge variant="secondary" className={`${TARGETED_BADGE} shrink-0`} data-testid={`badge-maintenance-job-targeted-${job.id}`}>
              <Sparkles className="w-3 h-3 mr-1" /> Intervention ciblée
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 shrink-0">
              Intervention publique
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{job.locationAddress || "—"}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className={URGENCY_COLORS[job.urgency] ?? URGENCY_COLORS.NORMAL}>
            <AlertTriangle className="w-3 h-3 mr-1" /> {URGENCY_LABELS[job.urgency] ?? job.urgency}
          </Badge>
          {job.categories.map((c) => <Badge key={c} variant="secondary" className="bg-secondary/60 dark:bg-gray-700/70 font-normal">{c}</Badge>)}
        </div>

        {scheduled && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {scheduled}
          </div>
        )}

        <div className="flex items-center gap-2 justify-between pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {job.expiresAt ? `Expire le ${formatDate(job.expiresAt as any)}` : "Sans date limite"}
          </span>
          <ApplyAction job={job} onApply={onApply} />
        </div>
      </CardContent>
    </Card>
  );
}

function JobDetailDialog({ job, onClose, onApply }: { job: MaintenanceDiscoverableJob | null; onClose: () => void; onApply: (job: MaintenanceDiscoverableJob) => void }) {
  const scheduled = job ? formatScheduled(job.scheduledDate, job.scheduledTime) : null;
  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-400 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full" data-testid="dialog-maintenance-job-detail">
        {job && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                {job.title}
                {job.isTargeted && (
                  <Badge variant="secondary" className={TARGETED_BADGE}>
                    <Sparkles className="w-3 h-3 mr-1" /> Intervention ciblée
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-1.5 flex-wrap">
                <Building2 className="w-3.5 h-3.5" /> {job.establishment} · <MapPin className="w-3.5 h-3.5" /> {job.locationAddress || "—"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Urgence</p><p>{URGENCY_LABELS[job.urgency] ?? job.urgency}</p></div>
              <div><p className="text-xs text-muted-foreground">Date / heure</p><p>{scheduled ?? "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Téléphone</p><p className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {job.contactPhone || "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Date limite</p><p>{job.expiresAt ? formatDate(job.expiresAt as any) : "—"}</p></div>
              <div className="col-span-2"><p className="text-xs text-muted-foreground mb-1">Catégorie</p>
                {job.categories.length === 0 ? <span className="text-muted-foreground">—</span> : (
                  <div className="flex flex-wrap gap-1.5">{job.categories.map((c) => <Badge key={c} variant="secondary" className="bg-secondary/60 dark:bg-gray-700/70 font-normal">{c}</Badge>)}</div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold flex items-center gap-1.5"><FileText className="w-4 h-4 text-muted-foreground" /> Description</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line bg-secondary/30 rounded-lg p-3" data-testid={`text-maintenance-job-description-${job.id}`}>
                {job.description || "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold flex items-center gap-1.5"><FileText className="w-4 h-4 text-muted-foreground" /> Exigences</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line bg-secondary/30 rounded-lg p-3" data-testid={`text-maintenance-job-requirements-${job.id}`}>
                {job.requirements || "—"}
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} data-testid="button-close-maintenance-job-detail">Fermer</Button>
              <ApplyAction job={job} onApply={onApply} size="default" />
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ApplyDialog({ job, onClose }: { job: MaintenanceDiscoverableJob | null; onClose: () => void }) {
  const { toast } = useToast();
  const apply = useApplyToMaintenanceJob();
  const [message, setMessage] = useState("");

  useEffect(() => { setMessage(""); }, [job?.id]);

  const submit = () => {
    if (!job) return;
    const trimmed = message.trim();
    apply.mutate(
      { jobId: job.id, message: trimmed || undefined },
      {
        onSuccess: () => {
          toast({ title: "Réponse envoyée", description: `Votre réponse pour « ${job.title} » a été transmise.` });
          onClose();
        },
        onError: (err: Error) => toast({ title: "Réponse impossible", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && !apply.isPending && onClose()}>
      <DialogContent className="max-w-md" data-testid="dialog-maintenance-job-apply">
        <DialogHeader>
          <DialogTitle>Répondre à l'intervention</DialogTitle>
          <DialogDescription>{job ? `${job.title} — ${job.establishment}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Message (facultatif)</p>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Précisez votre disponibilité, vos questions…"
            rows={5}
            data-testid="input-maintenance-job-apply-message"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={apply.isPending} data-testid="button-cancel-maintenance-job-apply">Annuler</Button>
          <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={submit} disabled={apply.isPending} data-testid="button-confirm-maintenance-job-apply">
            {apply.isPending ? "Envoi…" : "Confirmer la réponse"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplicationCard({ application }: { application: MaintenanceJobApplicationWithParties }) {
  return (
    <Card data-testid={`card-maintenance-job-application-${application.id}`} className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold leading-tight">{application.jobTitle}</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{application.establishment}</span>
            </div>
          </div>
          <Badge variant="secondary" className={`${APPLICATION_STATUS_COLORS[application.status]} shrink-0`} data-testid={`badge-maintenance-job-application-status-${application.id}`}>
            {APPLICATION_STATUS_LABELS[application.status]}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          Envoyée le {formatDate(application.createdAt as any)}
        </div>

        {application.message && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/30 rounded-lg p-2">
            <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{application.message}</span>
          </div>
        )}

        {application.status === "ACCEPTED" && application.reservationId != null && (
          <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 rounded-lg p-2">
            <Wrench className="w-3.5 h-3.5 shrink-0" />
            Intervention créée — retrouvez-la dans votre Planning.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
      <CardContent className="py-16 text-center">
        <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function ListSkeleton() {
  return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status filter (Toutes / À venir / En cours / Terminées / Annulées) — mirrors
// barista-marketplace/jobs.tsx's own StatusFilterTabs exactly (same labels,
// same shared Tabs component, same "evaluated in order, each row lands in
// exactly one bucket" rule), adapted to Maintenance's own, audited lifecycle
// (docs/maintenance_intervention_reservation_cleanup_audit.md Section 10 —
// read that section before changing this mapping):
//
// "Mes réponses" — each application lands in exactly ONE bucket:
//   1. Terminées : REJECTED (a decided-and-declined response is closed).
//   2. Terminées : ACCEPTED, linked reservation COMPLETED.
//   3. Annulées  : ACCEPTED, linked reservation CANCELLED.
//   4. À venir   : ACCEPTED, linked reservation CONFIRMED/RESCHEDULED/
//                  RESCHEDULE_PENDING with a date strictly after today.
//   5. En cours  : everything else still active — PENDING (not yet decided),
//                  or ACCEPTED or whose reservation is PENDING (provider
//                  hasn't confirmed it in Planning yet) or whose confirmed/
//                  rescheduled date is today or earlier but not yet completed.
//
// "Interventions disponibles" — a discoverable listing has no lifecycle from
// the provider's read-only viewpoint (the backend already hides CLOSED/
// expired listings entirely), so, same shape as Barista's own discover list:
//   - Terminées : hasApplied === true (the provider already acted on it).
//   - À venir / En cours : not yet applied to and still open (expiresAt null
//                  or in the future), split by scheduledDate vs. today (no
//                  date set → shown under both).
//   - Annulées  : no data can exist here → always an empty state.
// ─────────────────────────────────────────────────────────────────────────────

type JobStatusFilter = "all" | "upcoming" | "ongoing" | "done" | "cancelled";

const STATUS_FILTERS: { value: JobStatusFilter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "upcoming", label: "À venir" },
  { value: "ongoing", label: "En cours" },
  { value: "done", label: "Terminées" },
  { value: "cancelled", label: "Annulées" },
];

type ApplicationBucket = Exclude<JobStatusFilter, "all">;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
// scheduledDate/reservation.date are plain "YYYY-MM-DD" text — parse as local
// midnight so a bare date never shifts by a day across timezones.
function parseDay(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

function applicationBucket(app: MaintenanceJobApplicationWithParties, today: number): ApplicationBucket {
  if (app.status === "REJECTED") return "done";
  const reservation = app.reservation;
  if (!reservation) return "ongoing"; // ACCEPTED but the link hasn't loaded/landed yet — defensive.
  if (reservation.status === "COMPLETED") return "done";
  if (reservation.status === "CANCELLED") return "cancelled";
  if (reservation.status === "CONFIRMED" || reservation.status === "RESCHEDULED" || reservation.status === "RESCHEDULE_PENDING") {
    const at = parseDay(reservation.date).getTime();
    if (at > today) return "upcoming";
  }
  return "ongoing";
}

function jobMatchesFilter(job: MaintenanceDiscoverableJob, filter: JobStatusFilter, now: number, today: number): boolean {
  if (filter === "all") return true;
  if (filter === "cancelled") return false;
  if (filter === "done") return job.hasApplied;
  if (job.hasApplied) return false;
  if (job.expiresAt && new Date(job.expiresAt as any).getTime() <= now) return false;
  if (job.scheduledDate) {
    const start = parseDay(job.scheduledDate).getTime();
    return filter === "upcoming" ? start > today : start <= today;
  }
  return true;
}

function StatusFilterTabs({ value, onChange, counts, testIdPrefix }: {
  value: JobStatusFilter;
  onChange: (v: JobStatusFilter) => void;
  counts: Record<JobStatusFilter, number>;
  testIdPrefix: string;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as JobStatusFilter)}>
      <TabsList className="flex-wrap h-auto">
        {STATUS_FILTERS.map((f) => (
          <TabsTrigger key={f.value} value={f.value} data-testid={`${testIdPrefix}-${f.value}`}>
            {f.label} ({counts[f.value]})
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** Discoverable interventions, targeted first then most recent. */
function useSortedDiscoverJobs() {
  const { data: jobs = [], isLoading } = useDiscoverMaintenanceJobs();
  const sorted = useMemo(
    () => [...jobs].sort((a, b) => (a.isTargeted !== b.isTargeted ? (a.isTargeted ? -1 : 1) : (b.createdAt as any) > (a.createdAt as any) ? 1 : -1)),
    [jobs]
  );
  return { jobs: sorted, isLoading };
}

const FILTERED_EMPTY_SUBTITLE = "Aucun élément ne correspond à ce filtre.";

export default function MaintenanceInterventionsPage() {
  const { jobs, isLoading: jobsLoading } = useSortedDiscoverJobs();
  const { data: applications = [], isLoading: appsLoading } = useMyMaintenanceJobApplications();
  const [tab, setTab] = useState<"discover" | "applications">("discover");
  const [discoverFilter, setDiscoverFilter] = useState<JobStatusFilter>("all");
  const [applicationsFilter, setApplicationsFilter] = useState<JobStatusFilter>("all");
  const [detailJob, setDetailJob] = useState<MaintenanceDiscoverableJob | null>(null);
  const [applyJob, setApplyJob] = useState<MaintenanceDiscoverableJob | null>(null);

  const liveDetailJob = detailJob ? jobs.find((j) => j.id === detailJob.id) ?? detailJob : null;
  const openApply = (job: MaintenanceDiscoverableJob) => { setDetailJob(null); setApplyJob(job); };

  const { discoverCounts, filteredJobs } = useMemo(() => {
    const now = Date.now();
    const today = startOfToday();
    const c = {} as Record<JobStatusFilter, number>;
    for (const f of STATUS_FILTERS) c[f.value] = jobs.filter((j) => jobMatchesFilter(j, f.value, now, today)).length;
    return { discoverCounts: c, filteredJobs: jobs.filter((j) => jobMatchesFilter(j, discoverFilter, now, today)) };
  }, [jobs, discoverFilter]);

  const { applicationCounts, filteredApplications } = useMemo(() => {
    const today = startOfToday();
    const c: Record<JobStatusFilter, number> = { all: applications.length, upcoming: 0, ongoing: 0, done: 0, cancelled: 0 };
    const buckets = new Map(applications.map((a) => [a.id, applicationBucket(a, today)]));
    buckets.forEach((b) => { c[b] += 1; });
    return {
      applicationCounts: c,
      filteredApplications: applicationsFilter === "all" ? applications : applications.filter((a) => buckets.get(a.id) === applicationsFilter),
    };
  }, [applications, applicationsFilter]);

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Interventions"
        subtitle="Découvrez les interventions proposées par les cafés et suivez vos réponses."
        icon={Wrench}
        gradientClass="bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent border-orange-500/20"
        iconBgClass="bg-orange-500/15"
        iconTextClass="text-orange-600 dark:text-orange-400"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "discover" | "applications")}>
        <TabsList>
          <TabsTrigger value="discover" data-testid="tab-maintenance-jobs-discover">Interventions disponibles ({jobs.length})</TabsTrigger>
          <TabsTrigger value="applications" data-testid="tab-maintenance-jobs-applications">Mes réponses ({applications.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "discover" ? (
        <div className="flex flex-col gap-5">
          <StatusFilterTabs value={discoverFilter} onChange={setDiscoverFilter} counts={discoverCounts} testIdPrefix="filter-maintenance-discover" />
          {jobsLoading ? (
            <ListSkeleton />
          ) : filteredJobs.length === 0 ? (
            jobs.length === 0 ? (
              <EmptyState title="Aucune intervention disponible" subtitle="Les interventions proposées par les cafés apparaîtront ici." />
            ) : discoverFilter === "cancelled" ? (
              <EmptyState title="Aucun élément annulé" subtitle="Les interventions clôturées ou expirées n'apparaissent pas dans cette liste." />
            ) : (
              <EmptyState title="Aucun résultat" subtitle={FILTERED_EMPTY_SUBTITLE} />
            )
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredJobs.map((job) => <JobCard key={job.id} job={job} onOpen={setDetailJob} onApply={openApply} />)}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <StatusFilterTabs value={applicationsFilter} onChange={setApplicationsFilter} counts={applicationCounts} testIdPrefix="filter-maintenance-applications" />
          {appsLoading ? (
            <ListSkeleton />
          ) : filteredApplications.length === 0 ? (
            applications.length === 0 ? (
              <EmptyState title="Aucune réponse envoyée" subtitle="Répondez à une intervention pour suivre son avancement ici." />
            ) : (
              <EmptyState title="Aucun résultat" subtitle={FILTERED_EMPTY_SUBTITLE} />
            )
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredApplications.map((app) => <ApplicationCard key={app.id} application={app} />)}
            </div>
          )}
        </div>
      )}

      <JobDetailDialog job={liveDetailJob} onClose={() => setDetailJob(null)} onApply={openApply} />
      <ApplyDialog job={applyJob} onClose={() => setApplyJob(null)} />
    </div>
  );
}
