import { useMemo } from "react";
import { Wrench, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useThemeStore } from "@/store/theme-store";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useMyMaintenanceJobs, useAddMaintenanceJobTarget, type MaintenanceJobPostWithStats,
} from "@/hooks/use-maintenance-jobs";

// Only MANUAL + PUBLISHED interventions can be targeted.
const isEligible = (j: MaintenanceJobPostWithStats) => j.publicationMode === "MANUAL" && j.status === "PUBLISHED";

// Manual intervention targeting — the ONE shared "Associer à une
// intervention" action/dropdown, used identically from both
// MaintenanceFastSearch and the Coffee Owner-facing Maintenance Details modal
// (mirrors BaristaJobTargetButton exactly — see
// docs/maintenance_interventions_implementation_audit.md Section 2/6).
// Associates the given provider with one of the Coffee Owner's own
// MANUAL + PUBLISHED intervention posts — automatic interventions are already
// visible to every eligible provider, and drafts aren't live yet, so neither
// is offered here. The backend's unique (jobPostId, maintenanceUserId) index
// makes re-picking the same intervention a no-op, so no duplicate-association
// logic is needed client-side.
export function MaintenanceJobTargetButton({
  maintenanceUserId, maintenanceName, className, iconClassName,
}: {
  maintenanceUserId: number;
  maintenanceName: string;
  className: string;
  iconClassName?: string;
}) {
  const { toast } = useToast();
  // This app's Coffee Owner shell never toggles a global `.dark` class on
  // <html> — see barista-job-target-button.tsx's identical note.
  const isDark = useThemeStore((s) => s.isDark);
  const { data: myJobs = [], isLoading } = useMyMaintenanceJobs();
  const addTarget = useAddMaintenanceJobTarget();

  const eligibleJobs = useMemo(() => myJobs.filter(isEligible), [myJobs]);
  const disabled = isLoading || addTarget.isPending || eligibleJobs.length === 0;
  const title = isLoading
    ? "Chargement de vos interventions…"
    : eligibleJobs.length === 0
      ? "Créez d'abord une intervention en publication manuelle"
      : "Associer à une intervention";

  const pick = (jobId: number, jobTitle: string) => {
    if (addTarget.isPending) return;
    addTarget.mutate(
      { jobId, maintenanceUserId },
      {
        onSuccess: () => toast({ title: "Professionnel associé", description: `${maintenanceName} a été associé à l'intervention « ${jobTitle} ».` }),
        onError: (err: Error) => toast({ title: "Association impossible", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          className={className}
          disabled={disabled}
          title={title}
          aria-label={title}
          data-testid="button-maintenance-job-target"
        >
          {addTarget.isPending
            ? <Loader2 className={iconClassName ?? "w-4 h-4 text-white animate-spin"} />
            : <Wrench className={iconClassName ?? "w-4 h-4 text-white"} />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="left"
        align="center"
        className={`z-[70] w-64 max-h-72 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full ${
          isDark
            ? "bg-gray-900 border-gray-700 [&::-webkit-scrollbar-thumb]:bg-gray-600"
            : "bg-white border-gray-200 [&::-webkit-scrollbar-thumb]:bg-gray-300"
        }`}
        data-testid="menu-maintenance-job-target"
      >
        <DropdownMenuLabel className={isDark ? "text-gray-200" : "text-gray-700"}>
          Associer à une intervention
        </DropdownMenuLabel>
        <DropdownMenuSeparator className={isDark ? "bg-gray-700" : "bg-gray-200"} />
        {eligibleJobs.length === 0 && (
          <p
            className={`px-2 py-3 text-center text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}
            data-testid="text-maintenance-job-target-empty"
          >
            Aucune intervention manuelle publiée
          </p>
        )}
        {eligibleJobs.map((job) => (
          <DropdownMenuItem
            key={job.id}
            disabled={addTarget.isPending}
            onSelect={() => pick(job.id, job.title)}
            className={`flex flex-col items-start gap-0.5 ${isDark ? "text-gray-100 focus:bg-gray-800 focus:text-white" : "text-gray-900 focus:bg-gray-100"}`}
            data-testid={`menuitem-maintenance-job-target-${job.id}`}
          >
            <span className="font-medium leading-tight">{job.title}</span>
            <span className={`text-xs truncate max-w-full ${isDark ? "text-gray-400" : "text-muted-foreground"}`}>{job.establishment}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
