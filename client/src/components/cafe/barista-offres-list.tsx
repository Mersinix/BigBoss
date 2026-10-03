import { Briefcase, Calendar, Globe, Plus, UserCheck, Users } from "lucide-react";
import { useMyBaristaJobs, type BaristaJobPostWithStats, type BaristaJobStatus, type BaristaJobPublicationMode } from "@/hooks/use-barista-marketplace";

const JOB_STATUS_LABELS: Record<BaristaJobStatus, string> = { DRAFT: "Brouillon", PUBLISHED: "Publiée", CLOSED: "Clôturée" };
function jobStatusColors(dk: boolean): Record<BaristaJobStatus, string> {
  return dk
    ? { DRAFT: "bg-gray-700 text-gray-300 border-gray-600", PUBLISHED: "bg-green-900/50 text-green-300 border-green-800", CLOSED: "bg-red-900/50 text-red-300 border-red-800" }
    : { DRAFT: "bg-gray-100 text-gray-600 border-gray-200", PUBLISHED: "bg-green-100 text-green-700 border-green-200", CLOSED: "bg-red-100 text-red-700 border-red-200" };
}
const MODE_LABELS: Record<BaristaJobPublicationMode, string> = { AUTOMATIC: "Automatique", MANUAL: "Manuelle" };

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// Coffee Owner account > Baristas > Offres — a compact, read-focused summary
// of the Coffee Owner's existing job posts (same useMyBaristaJobs data as
// /barista's "Offres d'emploi" hero icon). Clicking a row opens the full
// JobManagementModal (already built, reused as-is) for details/management —
// this component itself holds no job-posting logic of its own.
export function BaristaOffresList({
  dk, cardBg, textPrimary, textMuted, onOpenJob, onCreateJob,
}: {
  dk: boolean;
  cardBg: string;
  textPrimary: string;
  textMuted: string;
  onOpenJob: (jobId: number) => void;
  onCreateJob: () => void;
}) {
  const { data: jobs = [], isLoading } = useMyBaristaJobs();
  const statusColors = jobStatusColors(dk);

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
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl ${dk ? "bg-green-900/40 text-green-300 hover:bg-green-900/60" : "bg-green-50 text-green-700 hover:bg-green-100"}`}
          data-testid="button-baristas-offres-create"
        >
          <Plus className="w-3.5 h-3.5" /> Publier une offre
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className={`text-center py-16 ${textMuted}`}>
          <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className={`font-medium text-sm ${textPrimary}`}>Aucune offre d'emploi</p>
          <p className="text-xs mt-1 opacity-70">Publiez une offre pour recevoir des candidatures de baristas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job: BaristaJobPostWithStats) => {
            const ModeIcon = job.publicationMode === "MANUAL" ? UserCheck : Globe;
            const expiry = fmtDate(job.expiresAt);
            return (
              <button
                key={job.id}
                onClick={() => onOpenJob(job.id)}
                className={`w-full text-left border rounded-2xl p-4 space-y-2 ${cardBg}`}
                data-testid={`card-baristas-offre-${job.id}`}
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
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {job.totalApplications} candidature{job.totalApplications > 1 ? "s" : ""}</span>
                  {expiry && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Expire le {expiry}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
