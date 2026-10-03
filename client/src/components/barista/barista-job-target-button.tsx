import { useMemo, useState } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useThemeStore } from "@/store/theme-store";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useMyBaristaJobs, useAddBaristaJobTarget,
  type BaristaJobRecordType, type BaristaJobPostWithStats,
} from "@/hooks/use-barista-marketplace";

// Only MANUAL + PUBLISHED records (offers or missions) can be targeted.
const isEligible = (j: BaristaJobPostWithStats) => j.publicationMode === "MANUAL" && j.status === "PUBLISHED";

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
  // Offres and Missions share the same job-post backend/association mechanism
  // (distinguished only by recordType), so fetch each type separately
  // (server-side filtered) and let the Coffee Owner switch between them
  // inside the dropdown. The selected barista stays fixed via props.
  const [section, setSection] = useState<BaristaJobRecordType>("OFFER");
  const { data: myOffers = [], isLoading: offersLoading } = useMyBaristaJobs("OFFER");
  const { data: myMissions = [], isLoading: missionsLoading } = useMyBaristaJobs("MISSION");
  const addTarget = useAddBaristaJobTarget();

  const eligibleOffers = useMemo(() => myOffers.filter(isEligible), [myOffers]);
  const eligibleMissions = useMemo(() => myMissions.filter(isEligible), [myMissions]);
  const visibleJobs = section === "OFFER" ? eligibleOffers : eligibleMissions;

  const isLoading = offersLoading || missionsLoading;
  const noneEligible = eligibleOffers.length === 0 && eligibleMissions.length === 0;
  const disabled = isLoading || addTarget.isPending || noneEligible;
  const title = isLoading
    ? "Chargement de vos offres et missions…"
    : noneEligible
      ? "Créez d'abord une offre ou une mission en publication manuelle"
      : "Associer à une offre d'emploi ou à une mission";

  const pick = (jobId: number, jobTitle: string, recordType: BaristaJobRecordType) => {
    if (addTarget.isPending) return;
    const kind = recordType === "MISSION" ? "la mission" : "l'offre";
    addTarget.mutate(
      { jobId, baristaUserId },
      {
        onSuccess: () => toast({ title: `Barista associé à ${kind}`, description: `${baristaName} a été associé à ${kind} « ${jobTitle} ».` }),
        onError: (err: Error) => toast({ title: "Association impossible", description: err.message, variant: "destructive" }),
      }
    );
  };

  const sectionBtn = (value: BaristaJobRecordType, label: string, count: number) => {
    const active = section === value;
    return (
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSection(value); }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-pressed={active}
        className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
          active
            ? isDark ? "bg-gray-700 text-white" : "bg-white text-gray-900 shadow-sm"
            : isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-800"
        }`}
        data-testid={`switch-job-target-${value.toLowerCase()}`}
      >
        {label} ({count})
      </button>
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
        <DropdownMenuLabel className={isDark ? "text-gray-200" : "text-gray-700"}>
          {section === "OFFER" ? "Associer à une offre d'emploi" : "Associer à une Mission"}
        </DropdownMenuLabel>
        <div
          className={`mx-1 mb-1 flex gap-1 rounded-lg p-0.5 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}
          role="group"
          aria-label="Type d'association"
        >
          {sectionBtn("OFFER", "Offres", eligibleOffers.length)}
          {sectionBtn("MISSION", "Missions", eligibleMissions.length)}
        </div>
        <DropdownMenuSeparator className={isDark ? "bg-gray-700" : "bg-gray-200"} />
        {visibleJobs.length === 0 && (
          <p
            className={`px-2 py-3 text-center text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}
            data-testid="text-job-target-empty"
          >
            {section === "OFFER" ? "Aucune offre manuelle publiée" : "Aucune mission manuelle publiée"}
          </p>
        )}
        {visibleJobs.map((job) => (
          <DropdownMenuItem
            key={job.id}
            disabled={addTarget.isPending}
            onSelect={() => pick(job.id, job.title, job.recordType ?? section)}
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
