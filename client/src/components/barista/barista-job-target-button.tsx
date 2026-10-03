import { useMemo } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useThemeStore } from "@/store/theme-store";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMyBaristaJobs, useAddBaristaJobTarget } from "@/hooks/use-barista-marketplace";

// Manual job targeting — the ONE shared "Associer à une offre d'emploi"
// action/dropdown, used identically from both the Fast Search ("Flash")
// component and the Coffee Owner-facing Barista details modal, so there is a
// single association behavior/data source rather than two parallel
// implementations (see shared/schema.ts baristaJobTargets). Associates the
// given barista with one of the Coffee Owner's own MANUAL + PUBLISHED job
// posts — automatic jobs are already visible to every barista, and drafts
// aren't live yet, so neither is offered here. The backend's unique
// (jobPostId, baristaUserId) index makes re-picking the same job a no-op, so
// no duplicate-association logic is needed client-side.
//
// Only `className`/`iconClassName` vary per caller, matching whichever
// icon-row convention the host component already uses (Fast Search's
// floating `bg-white/20` buttons vs. the details modal's `bg-black/40`
// corner-icon row) — the dropdown menu/behavior itself is byte-identical.
export function BaristaJobTargetButton({
  baristaUserId, baristaName, className, iconClassName,
}: {
  baristaUserId: number;
  baristaName: string;
  className: string;
  iconClassName?: string;
}) {
  const { toast } = useToast();
  // This app's Coffee Owner shell never toggles a global `.dark` class on
  // <html> (dark mode here is applied per-component via isDark-branched
  // classes instead — see barista-detail-modal.tsx/barista-fast-search.tsx),
  // so shadcn's DropdownMenuContent/Item, which default to the `.dark`-class-
  // driven `bg-popover` token, would otherwise always render light. Branch
  // explicitly instead of relying on that token here.
  const isDark = useThemeStore((s) => s.isDark);
  const { data: myJobs = [], isLoading } = useMyBaristaJobs();
  const addTarget = useAddBaristaJobTarget();

  const eligibleJobs = useMemo(
    () => myJobs.filter((j) => j.publicationMode === "MANUAL" && j.status === "PUBLISHED"),
    [myJobs]
  );
  const disabled = isLoading || addTarget.isPending || eligibleJobs.length === 0;
  const title = isLoading
    ? "Chargement de vos offres…"
    : eligibleJobs.length === 0
      ? "Créez d'abord une offre en publication manuelle"
      : "Associer à une offre d'emploi";

  const pick = (jobId: number, jobTitle: string) => {
    if (addTarget.isPending) return;
    addTarget.mutate(
      { jobId, baristaUserId },
      {
        onSuccess: () => toast({ title: "Barista associé à l'offre", description: `${baristaName} a été associé à l'offre « ${jobTitle} ».` }),
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
          data-testid="button-job-target"
        >
          {addTarget.isPending
            ? <Loader2 className={iconClassName ?? "w-4 h-4 text-white animate-spin"} />
            : <Briefcase className={iconClassName ?? "w-4 h-4 text-white"} />}
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
        data-testid="menu-job-target"
      >
        <DropdownMenuLabel className={isDark ? "text-gray-200" : "text-gray-700"}>Associer à une offre d'emploi</DropdownMenuLabel>
        <DropdownMenuSeparator className={isDark ? "bg-gray-700" : "bg-gray-200"} />
        {eligibleJobs.map((job) => (
          <DropdownMenuItem
            key={job.id}
            onSelect={() => pick(job.id, job.title)}
            className={`flex flex-col items-start gap-0.5 ${isDark ? "text-gray-100 focus:bg-gray-800 focus:text-white" : "text-gray-900 focus:bg-gray-100"}`}
            data-testid={`menuitem-job-target-${job.id}`}
          >
            <span className="font-medium leading-tight">{job.title}</span>
            <span className={`text-xs truncate max-w-full ${isDark ? "text-gray-400" : "text-muted-foreground"}`}>{job.establishment}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
