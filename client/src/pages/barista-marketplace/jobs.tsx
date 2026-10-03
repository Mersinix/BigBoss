import { useEffect, useMemo, useState } from "react";
import {
  useDiscoverBaristaJobs,
  useMyBaristaJobApplications,
  useApplyToBaristaJob,
  useUpdateBaristaJobMeetingStatus,
  type BaristaDiscoverableJob,
  type BaristaJobApplication,
  type BaristaJobApplicationStatus,
  type BaristaJobMeetingStatus,
  type BaristaJobRecordType,
} from "@/hooks/use-barista-marketplace";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Building2, Calendar, CalendarClock, Clock, FileText, GraduationCap, Languages, MapPin, MessageSquare,
  Newspaper, Send, Sparkles, Users, Wallet,
} from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";

const APPLICATION_STATUS_LABELS: Record<BaristaJobApplicationStatus, string> = {
  PENDING: "En attente",
  PRESELECTED: "Présélectionné",
  INTERVIEW_SCHEDULED: "Entretien planifié",
  ACCEPTED: "Accepté",
  REJECTED: "Rejeté",
};

const APPLICATION_STATUS_COLORS: Record<BaristaJobApplicationStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  PRESELECTED: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  INTERVIEW_SCHEDULED: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  ACCEPTED: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

const MEETING_STATUS_LABELS: Record<BaristaJobMeetingStatus, string> = {
  PROPOSED: "Proposé — à confirmer",
  CONFIRMED: "Confirmé",
  CANCELLED: "Annulé",
};

const MEETING_STATUS_COLORS: Record<BaristaJobMeetingStatus, string> = {
  PROPOSED: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  CONFIRMED: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
};

const TARGETED_BADGE = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300";
const CHIP = "bg-secondary/60 text-foreground dark:bg-gray-700/70 dark:text-gray-200 font-normal";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// missionStartDate/missionEndDate are plain date text ("YYYY-MM-DD"); parse a
// bare date as local midnight so it never shifts by a day across timezones.
function parseDay(value: string) {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
}

function formatDay(value: string) {
  return parseDay(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function missionPeriodLabel(job: BaristaDiscoverableJob) {
  if (job.recordType !== "MISSION") return null;
  if (job.missionStartDate && job.missionEndDate) return `Du ${formatDay(job.missionStartDate)} au ${formatDay(job.missionEndDate)}`;
  if (job.missionStartDate) return `À partir du ${formatDay(job.missionStartDate)}`;
  if (job.missionEndDate) return `Jusqu'au ${formatDay(job.missionEndDate)}`;
  return null;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Chips({ items, testId }: { items: string[]; testId?: string }) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={testId}>
      {items.map((it) => <Badge key={it} variant="secondary" className={CHIP}>{it}</Badge>)}
    </div>
  );
}

function ApplyAction({ job, onApply, size = "sm" }: { job: BaristaDiscoverableJob; onApply: (job: BaristaDiscoverableJob) => void; size?: "sm" | "default" }) {
  if (job.hasApplied) {
    return (
      <Button size={size} variant="outline" disabled data-testid={`button-applied-job-${job.id}`}>
        Déjà postulé
      </Button>
    );
  }
  return (
    <Button
      size={size}
      className="bg-green-600 hover:bg-green-700 text-white"
      onClick={(e) => { e.stopPropagation(); onApply(job); }}
      data-testid={`button-apply-job-${job.id}`}
    >
      <Send className="w-3.5 h-3.5 mr-1.5" /> Postuler
    </Button>
  );
}

function JobCard({ job, onOpen, onApply }: { job: BaristaDiscoverableJob; onOpen: (job: BaristaDiscoverableJob) => void; onApply: (job: BaristaDiscoverableJob) => void }) {
  return (
    <Card
      data-testid={`card-job-${job.id}`}
      className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl cursor-pointer hover:border-green-500/40 transition-colors"
      onClick={() => onOpen(job)}
    >
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold leading-tight" data-testid={`text-job-title-${job.id}`}>{job.title}</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{job.establishment}</span>
            </div>
          </div>
          {job.isTargeted ? (
            <Badge variant="secondary" className={`${TARGETED_BADGE} shrink-0`} data-testid={`badge-job-targeted-${job.id}`}>
              <Sparkles className="w-3 h-3 mr-1" /> Opportunité ciblée
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 shrink-0">
              {job.recordType === "MISSION" ? "Mission publique" : "Offre publique"}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{job.locationAddress}</span>
        </div>

        {missionPeriodLabel(job) && (
          <div className="flex items-center gap-2 text-sm" data-testid={`text-job-mission-period-${job.id}`}>
            <CalendarClock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{missionPeriodLabel(job)}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 shrink-0" />
            {job.openPositions} poste{job.openPositions > 1 ? "s" : ""}
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{job.experienceRequired || "—"}</span>
          </div>
          <div className="flex items-center gap-1.5 col-span-2">
            <Wallet className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold text-foreground truncate">{job.remuneration || "—"}</span>
          </div>
        </div>

        <Chips items={job.employmentTypes} testId={`chips-job-employment-${job.id}`} />

        {(job.educationLevels.length > 0 || job.languages.length > 0) && (
          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {job.educationLevels.length > 0 && (
              <div className="flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{job.educationLevels.join(", ")}</span>
              </div>
            )}
            {job.languages.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Languages className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{job.languages.join(", ")}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 justify-between pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            {job.expiresAt ? `Expire le ${formatDate(job.expiresAt)}` : "Sans date limite"}
          </span>
          <ApplyAction job={job} onApply={onApply} />
        </div>
      </CardContent>
    </Card>
  );
}

function JobDetailDialog({ job, onClose, onApply }: { job: BaristaDiscoverableJob | null; onClose: () => void; onApply: (job: BaristaDiscoverableJob) => void }) {
  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-400 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full" data-testid="dialog-job-detail">
        {job && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                {job.title}
                {job.isTargeted && (
                  <Badge variant="secondary" className={TARGETED_BADGE}>
                    <Sparkles className="w-3 h-3 mr-1" /> Opportunité ciblée
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> {job.establishment} · <MapPin className="w-3.5 h-3.5" /> {job.locationAddress}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Postes ouverts</p><p>{job.openPositions}</p></div>
              <div><p className="text-xs text-muted-foreground">Expérience</p><p>{job.experienceRequired || "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Rémunération</p><p className="font-semibold">{job.remuneration || "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Date limite</p><p>{job.expiresAt ? formatDate(job.expiresAt) : "—"}</p></div>
              {job.recordType === "MISSION" && (
                <div className="col-span-2"><p className="text-xs text-muted-foreground">Période de la mission</p><p>{missionPeriodLabel(job) ?? "—"}</p></div>
              )}
              <div className="col-span-2"><p className="text-xs text-muted-foreground mb-1">Type de contrat</p><Chips items={job.employmentTypes} /></div>
              <div className="col-span-2"><p className="text-xs text-muted-foreground mb-1">Niveau d'études</p><Chips items={job.educationLevels} /></div>
              <div className="col-span-2"><p className="text-xs text-muted-foreground mb-1">Langues</p><Chips items={job.languages} /></div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold flex items-center gap-1.5"><FileText className="w-4 h-4 text-muted-foreground" /> Description</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line bg-secondary/30 rounded-lg p-3" data-testid={`text-job-description-${job.id}`}>
                {job.description || "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold flex items-center gap-1.5"><FileText className="w-4 h-4 text-muted-foreground" /> Exigences</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line bg-secondary/30 rounded-lg p-3" data-testid={`text-job-requirements-${job.id}`}>
                {job.requirements || "—"}
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} data-testid="button-close-job-detail">Fermer</Button>
              <ApplyAction job={job} onApply={onApply} size="default" />
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ApplyDialog({ job, onClose }: { job: BaristaDiscoverableJob | null; onClose: () => void }) {
  const { toast } = useToast();
  const apply = useApplyToBaristaJob();
  const [message, setMessage] = useState("");

  useEffect(() => { setMessage(""); }, [job?.id]);

  const submit = () => {
    if (!job) return;
    const trimmed = message.trim();
    apply.mutate(
      { jobId: job.id, message: trimmed || undefined },
      {
        onSuccess: () => {
          toast({ title: "Candidature envoyée", description: `Votre candidature pour « ${job.title} » a été transmise.` });
          onClose();
        },
        onError: (err: Error) => toast({ title: "Candidature impossible", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && !apply.isPending && onClose()}>
      <DialogContent className="max-w-md" data-testid="dialog-apply-job">
        <DialogHeader>
          <DialogTitle>Postuler</DialogTitle>
          <DialogDescription>{job ? `${job.title} — ${job.establishment}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Message au recruteur (facultatif)</p>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Présentez-vous brièvement et expliquez votre motivation…"
            rows={5}
            data-testid="input-apply-message"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={apply.isPending} data-testid="button-cancel-apply">Annuler</Button>
          <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={submit} disabled={apply.isPending} data-testid="button-confirm-apply">
            {apply.isPending ? "Envoi…" : "Confirmer la candidature"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplicationCard({ application }: { application: BaristaJobApplication }) {
  const { toast } = useToast();
  const updateMeeting = useUpdateBaristaJobMeetingStatus();
  const meeting = application.meeting;

  const act = (status: "CONFIRMED" | "CANCELLED") => {
    if (!meeting) return;
    updateMeeting.mutate(
      { id: meeting.id, status },
      {
        onSuccess: () => toast({ title: status === "CONFIRMED" ? "Entretien confirmé" : "Entretien annulé" }),
        onError: (err: Error) => toast({ title: "Action impossible", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Card data-testid={`card-application-${application.id}`} className="bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 rounded-2xl">
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold leading-tight">{application.jobTitle}</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{application.establishment}</span>
            </div>
          </div>
          <Badge variant="secondary" className={`${APPLICATION_STATUS_COLORS[application.status]} shrink-0`} data-testid={`badge-application-status-${application.id}`}>
            {APPLICATION_STATUS_LABELS[application.status]}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          Envoyée le {formatDate(application.createdAt)}
        </div>

        {application.message && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/30 rounded-lg p-2">
            <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{application.message}</span>
          </div>
        )}

        {meeting && (
          <div className="flex flex-col gap-2 pt-2 border-t border-border/50" data-testid={`meeting-${meeting.id}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <CalendarClock className="w-4 h-4 text-muted-foreground shrink-0" />
                Entretien : {formatDateTime(meeting.scheduledAt)}
              </div>
              <Badge variant="secondary" className={`${MEETING_STATUS_COLORS[meeting.status]} shrink-0`} data-testid={`badge-meeting-status-${meeting.id}`}>
                {MEETING_STATUS_LABELS[meeting.status]}
              </Badge>
            </div>
            {meeting.notes && <p className="text-xs text-muted-foreground bg-secondary/30 rounded-lg p-2 whitespace-pre-line">{meeting.notes}</p>}
            {meeting.status === "PROPOSED" && (
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/60 dark:hover:bg-red-950/40" onClick={() => act("CANCELLED")} disabled={updateMeeting.isPending} data-testid={`button-cancel-meeting-${meeting.id}`}>
                  Annuler
                </Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => act("CONFIRMED")} disabled={updateMeeting.isPending} data-testid={`button-confirm-meeting-${meeting.id}`}>
                  Confirmer
                </Button>
              </div>
            )}
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
        <Newspaper className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status filter (Toutes / À venir / En cours / Terminées / Annulées)
//
// Purely client-side, read-only filtering over already-fetched data — selecting
// a filter never writes any status. Mapping:
//
// "Mes candidatures" — each application lands in exactly ONE bucket (so the
// per-bucket counts always add up to "Toutes"), evaluated in this order:
//   1. Terminées : application ACCEPTED or REJECTED (a decided application is
//                  closed, whatever happened to its meeting).
//   2. Annulées  : meeting CANCELLED (and the application is still undecided).
//   3. À venir   : meeting PROPOSED or CONFIRMED with scheduledAt in the future.
//   4. Terminées : meeting CONFIRMED with scheduledAt in the past (the interview
//                  already happened; awaiting the café's decision).
//   5. En cours  : everything else still undecided — PENDING / PRESELECTED /
//                  INTERVIEW_SCHEDULED with no meeting, or a PROPOSED meeting
//                  whose date lapsed without being confirmed.
//
// "Offres / Missions disponibles" — a discoverable listing has no lifecycle from
// the barista's read-only viewpoint (the backend already hides CLOSED/expired
// listings entirely), so:
//   - Terminées : hasApplied === true (the barista already acted on it).
//   - À venir / En cours : listings not yet applied to and still open
//                  (expiresAt null or in the future). For OFFER rows these two
//                  are synonymous. For MISSION rows the real missionStartDate
//                  splits them: start date after today → À venir, start date
//                  today or earlier → En cours; a mission with no start date
//                  set is shown under both (same as an offer).
//   - Annulées  : no data can exist here (cancelled/closed listings never reach
//                  this list) → always an empty state, never an error.
// ─────────────────────────────────────────────────────────────────────────────

export type JobStatusFilter = "all" | "upcoming" | "ongoing" | "done" | "cancelled";

const STATUS_FILTERS: { value: JobStatusFilter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "upcoming", label: "À venir" },
  { value: "ongoing", label: "En cours" },
  { value: "done", label: "Terminées" },
  { value: "cancelled", label: "Annulées" },
];

type ApplicationBucket = Exclude<JobStatusFilter, "all">;

function applicationBucket(app: BaristaJobApplication, now: number): ApplicationBucket {
  if (app.status === "ACCEPTED" || app.status === "REJECTED") return "done";
  const meeting = app.meeting;
  if (meeting) {
    if (meeting.status === "CANCELLED") return "cancelled";
    const at = new Date(meeting.scheduledAt).getTime();
    if ((meeting.status === "PROPOSED" || meeting.status === "CONFIRMED") && at > now) return "upcoming";
    if (meeting.status === "CONFIRMED" && at <= now) return "done";
  }
  return "ongoing";
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function jobMatchesFilter(job: BaristaDiscoverableJob, filter: JobStatusFilter, now: number, today: number): boolean {
  if (filter === "all") return true;
  if (filter === "cancelled") return false;
  if (filter === "done") return job.hasApplied;
  // upcoming / ongoing: still open and not yet applied to.
  if (job.hasApplied) return false;
  if (job.expiresAt && new Date(job.expiresAt).getTime() <= now) return false;
  if (job.recordType === "MISSION" && job.missionStartDate) {
    const start = parseDay(job.missionStartDate).getTime();
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

const COPY: Record<BaristaJobRecordType, {
  itemLabel: string;
  emptyTitle: string;
  emptySubtitle: string;
  emptyAppsTitle: string;
  emptyAppsSubtitle: string;
}> = {
  OFFER: {
    itemLabel: "offres",
    emptyTitle: "Aucune offre disponible",
    emptySubtitle: "Les nouvelles offres d'emploi des cafés apparaîtront ici.",
    emptyAppsTitle: "Aucune candidature",
    emptyAppsSubtitle: "Postulez à une offre pour suivre son avancement ici.",
  },
  MISSION: {
    itemLabel: "missions",
    emptyTitle: "Aucune mission disponible",
    emptySubtitle: "Les nouvelles missions proposées par les cafés apparaîtront ici.",
    emptyAppsTitle: "Aucune candidature à une mission",
    emptyAppsSubtitle: "Postulez à une mission pour suivre son avancement ici.",
  },
};

const FILTERED_EMPTY_SUBTITLE = "Aucun élément ne correspond à ce filtre.";

function ListSkeleton() {
  return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data hooks shared by the lists and by their hosts' tab-trigger counts.
// ─────────────────────────────────────────────────────────────────────────────

/** Discoverable listings of one record type, targeted first then most recent. */
export function useSortedDiscoverJobs(recordType: BaristaJobRecordType) {
  const { data: jobs = [], isLoading } = useDiscoverBaristaJobs(recordType);
  const sorted = useMemo(
    () => [...jobs].sort((a, b) => (a.isTargeted !== b.isTargeted ? (a.isTargeted ? -1 : 1) : b.createdAt > a.createdAt ? 1 : -1)),
    [jobs]
  );
  return { jobs: sorted, isLoading };
}

/**
 * The barista's applications narrowed to one record type, most recent first.
 *
 * Application rows don't carry recordType, so each one is classified by
 * cross-referencing its jobPostId against the (unfiltered) discover listing.
 * Known limitation: discover only returns listings that are still open and
 * visible, so an application whose listing has since closed/expired can't be
 * classified — those fall back to OFFER (where every application was shown
 * before Missions existed), so nothing is ever hidden from the barista.
 */
export function useMyJobApplicationsByType(recordType: BaristaJobRecordType) {
  const { data: applications = [], isLoading: appsLoading } = useMyBaristaJobApplications();
  const { data: allJobs = [], isLoading: jobsLoading } = useDiscoverBaristaJobs();
  const filtered = useMemo(() => {
    const missionIds = new Set(allJobs.filter((j) => j.recordType === "MISSION").map((j) => j.id));
    return applications
      .filter((a) => (recordType === "MISSION") === missionIds.has(a.jobPostId))
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  }, [applications, allJobs, recordType]);
  return { applications: filtered, isLoading: appsLoading || jobsLoading };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable lists — used by the Offres page below (recordType="OFFER") and by
// the Missions hub (missions-hub.tsx, recordType="MISSION").
// ─────────────────────────────────────────────────────────────────────────────

export function JobDiscoverList({ recordType }: { recordType: BaristaJobRecordType }) {
  const { jobs, isLoading } = useSortedDiscoverJobs(recordType);
  const [filter, setFilter] = useState<JobStatusFilter>("all");
  const [detailJob, setDetailJob] = useState<BaristaDiscoverableJob | null>(null);
  const [applyJob, setApplyJob] = useState<BaristaDiscoverableJob | null>(null);
  const copy = COPY[recordType];

  const { counts, list } = useMemo(() => {
    const now = Date.now();
    const today = startOfToday();
    const c = {} as Record<JobStatusFilter, number>;
    for (const f of STATUS_FILTERS) c[f.value] = jobs.filter((j) => jobMatchesFilter(j, f.value, now, today)).length;
    return { counts: c, list: jobs.filter((j) => jobMatchesFilter(j, filter, now, today)) };
  }, [jobs, filter]);

  const pagination = usePagination(list.length);
  useEffect(() => { pagination.resetPage(); }, [filter, list.length]);

  // Keep the open detail dialog in sync with refetched data (e.g. hasApplied
  // flipping to true right after a successful application).
  const liveDetailJob = detailJob ? jobs.find((j) => j.id === detailJob.id) ?? detailJob : null;
  const openApply = (job: BaristaDiscoverableJob) => { setDetailJob(null); setApplyJob(job); };

  return (
    <div className="flex flex-col gap-5">
      <StatusFilterTabs value={filter} onChange={setFilter} counts={counts} testIdPrefix={`filter-discover-${recordType.toLowerCase()}`} />

      {isLoading ? (
        <ListSkeleton />
      ) : list.length === 0 ? (
        jobs.length === 0 ? (
          <EmptyState title={copy.emptyTitle} subtitle={copy.emptySubtitle} />
        ) : filter === "cancelled" ? (
          <EmptyState title="Aucun élément annulé" subtitle="Les annonces clôturées ou annulées n'apparaissent pas dans cette liste." />
        ) : (
          <EmptyState title="Aucun résultat" subtitle={FILTERED_EMPTY_SUBTITLE} />
        )
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {list.slice(pagination.start, pagination.end).map((job) => (
              <JobCard key={job.id} job={job} onOpen={setDetailJob} onApply={openApply} />
            ))}
          </div>
          <DataPagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={list.length}
            totalPages={pagination.totalPages}
            start={pagination.start}
            end={pagination.end}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            itemLabel={copy.itemLabel}
          />
        </>
      )}

      <JobDetailDialog job={liveDetailJob} onClose={() => setDetailJob(null)} onApply={openApply} />
      <ApplyDialog job={applyJob} onClose={() => setApplyJob(null)} />
    </div>
  );
}

export function JobApplicationsList({ recordType }: { recordType: BaristaJobRecordType }) {
  const { applications, isLoading } = useMyJobApplicationsByType(recordType);
  const [filter, setFilter] = useState<JobStatusFilter>("all");
  const copy = COPY[recordType];

  const { counts, list } = useMemo(() => {
    const now = Date.now();
    const c: Record<JobStatusFilter, number> = { all: applications.length, upcoming: 0, ongoing: 0, done: 0, cancelled: 0 };
    const buckets = new Map(applications.map((a) => [a.id, applicationBucket(a, now)]));
    buckets.forEach((b) => { c[b] += 1; });
    return {
      counts: c,
      list: filter === "all" ? applications : applications.filter((a) => buckets.get(a.id) === filter),
    };
  }, [applications, filter]);

  const pagination = usePagination(list.length);
  useEffect(() => { pagination.resetPage(); }, [filter, list.length]);

  return (
    <div className="flex flex-col gap-5">
      <StatusFilterTabs value={filter} onChange={setFilter} counts={counts} testIdPrefix={`filter-applications-${recordType.toLowerCase()}`} />

      {isLoading ? (
        <ListSkeleton />
      ) : list.length === 0 ? (
        applications.length === 0 ? (
          <EmptyState title={copy.emptyAppsTitle} subtitle={copy.emptyAppsSubtitle} />
        ) : (
          <EmptyState title="Aucun résultat" subtitle={FILTERED_EMPTY_SUBTITLE} />
        )
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {list.slice(pagination.start, pagination.end).map((app) => (
              <ApplicationCard key={app.id} application={app} />
            ))}
          </div>
          <DataPagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={list.length}
            totalPages={pagination.totalPages}
            start={pagination.start}
            end={pagination.end}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            itemLabel="candidatures"
          />
        </>
      )}
    </div>
  );
}

// Offres page — unchanged outward behavior (same hero, same two tabs with
// counts), now scoped to recordType OFFER and composed from the lists above.
export default function BaristaMarketplaceJobsPage() {
  const { jobs } = useSortedDiscoverJobs("OFFER");
  const { applications } = useMyJobApplicationsByType("OFFER");
  const [tab, setTab] = useState<"offers" | "applications">("offers");

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Offres d'emploi"
        subtitle="Découvrez les postes proposés par les cafés et suivez vos candidatures."
        icon={Newspaper}
        gradientClass="bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent border-green-500/20"
        iconBgClass="bg-green-500/15"
        iconTextClass="text-green-600 dark:text-green-400"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "offers" | "applications")}>
        <TabsList>
          <TabsTrigger value="offers" data-testid="tab-jobs-offers">Offres disponibles ({jobs.length})</TabsTrigger>
          <TabsTrigger value="applications" data-testid="tab-jobs-applications">Mes candidatures ({applications.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "offers" ? <JobDiscoverList recordType="OFFER" /> : <JobApplicationsList recordType="OFFER" />}
    </div>
  );
}
