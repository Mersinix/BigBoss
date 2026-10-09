import { useEffect } from "react";
import { Calendar, Clock, Globe, Plus, UserCheck, Users, Wrench } from "lucide-react";
import { useMyMaintenanceJobs, type MaintenanceJobPostWithStats, type MaintenanceJobStatus, type MaintenanceJobPublicationMode } from "@/hooks/use-maintenance-jobs";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";

const JOB_STATUS_LABELS: Record<MaintenanceJobStatus, string> = { DRAFT: "Brouillon", PUBLISHED: "Publiée", CLOSED: "Clôturée" };
function jobStatusColors(dk: boolean): Record<MaintenanceJobStatus, string> {
  return dk
    ? { DRAFT: "bg-gray-700 text-gray-300 border-gray-600", PUBLISHED: "bg-green-900/50 text-green-300 border-green-800", CLOSED: "bg-red-900/50 text-red-300 border-red-800" }
    : { DRAFT: "bg-gray-100 text-gray-600 border-gray-200", PUBLISHED: "bg-green-100 text-green-700 border-green-200", CLOSED: "bg-red-100 text-red-700 border-red-200" };
}
const MODE_LABELS: Record<MaintenanceJobPublicationMode, string> = { AUTOMATIC: "Automatique", MANUAL: "Manuelle" };

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtPlainDate(value: string | null) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return fmtDate(value);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// Coffee Owner account > Maintenance > Interventions — a compact, read-focused
// summary of the Coffee Owner's own intervention posts (same useMyMaintenanceJobs
// data as /maintenance's "Intervention" hero icon). Clicking a row opens the
// full MaintenanceJobManagementModal for details/management — this component
// itself holds no job-posting logic of its own. Mirrors BaristaOffresList
// exactly (see docs/maintenance_interventions_implementation_audit.md).
export function MaintenanceInterventionsList({
  dk, cardBg, textPrimary, textMuted, onOpenJob, onCreateJob,
}: {
  dk: boolean;
  cardBg: string;
  textPrimary: string;
  textMuted: string;
  onOpenJob: (jobId: number) => void;
  onCreateJob: () => void;
}) {
  const { data: jobs = [], isLoading } = useMyMaintenanceJobs();
  const statusColors = jobStatusColors(dk);

  const pagination = usePagination(jobs.length);
  useEffect(() => { pagination.resetPage(); }, [jobs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageJobs = jobs.slice(pagination.start, pagination.end);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => <div key={i} className={`h-24 rounded-2xl animate-pulse ${dk ? "bg-gray-800" : "bg-gray-100"}`} />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={onCreateJob}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl ${dk ? "bg-orange-900/40 text-orange-300 hover:bg-orange-900/60" : "bg-orange-50 text-orange-700 hover:bg-orange-100"}`}
          data-testid="button-maintenance-interventions-create"
        >
          <Plus className="w-3.5 h-3.5" /> Publier une intervention
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className={`text-center py-16 ${textMuted}`}>
          <Wrench className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className={`font-medium text-sm ${textPrimary}`}>Aucune intervention</p>
          <p className="text-xs mt-1 opacity-70">Publiez une intervention pour recevoir des réponses de professionnels.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pageJobs.map((job: MaintenanceJobPostWithStats) => {
            const ModeIcon = job.publicationMode === "MANUAL" ? UserCheck : Globe;
            const expiry = fmtDate(job.expiresAt as any);
            const scheduled = fmtPlainDate(job.scheduledDate);
            return (
              <button
                key={job.id}
                onClick={() => onOpenJob(job.id)}
                className={`w-full text-left border rounded-2xl p-4 space-y-2 ${cardBg}`}
                data-testid={`card-maintenance-interventions-${job.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`font-semibold text-sm truncate ${textPrimary}`}>{job.title}</p>
                    <p className={`text-xs mt-0.5 truncate ${textMuted}`}>{job.establishment}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-xl border ${statusColors[job.status]}`}>{JOB_STATUS_LABELS[job.status]}</span>
                </div>
                <div className={`flex items-center gap-3 flex-wrap text-xs ${textMuted}`}>
                  <span className="flex items-center gap-1"><ModeIcon className="w-3 h-3" /> {MODE_LABELS[job.publicationMode]}</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {job.totalApplications} réponse{job.totalApplications > 1 ? "s" : ""}</span>
                  {scheduled && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {scheduled}{job.scheduledTime ? ` · ${job.scheduledTime}` : ""}</span>}
                  {expiry && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Expire le {expiry}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {jobs.length > 0 && (
        <DataPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={jobs.length}
          totalPages={pagination.totalPages}
          start={pagination.start}
          end={pagination.end}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          itemLabel="interventions"
          isDark={dk}
        />
      )}
    </div>
  );
}
