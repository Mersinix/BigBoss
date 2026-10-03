import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import type { LucideIcon } from "lucide-react";
import { ClipboardList, Send } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import { JobApplicationsList, JobDiscoverList, useSortedDiscoverJobs } from "@/pages/barista-marketplace/jobs";

type HubView = "available" | "mine";

// `?view=mine` deep-links straight to "Mes Missions" (used by business.tsx to
// alias the legacy `?tab=requests` link into this hub).
function viewFromSearch(search: string): HubView | null {
  const v = new URLSearchParams(search).get("view");
  return v === "mine" || v === "available" ? v : null;
}

function SectionHeading({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-green-600 dark:text-green-400" />
      </div>
      <div className="min-w-0">
        <h2 className="font-semibold leading-tight">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

// Missions hub — the Business tab's consolidated "Missions" entry.
//  - "Missions disponibles": the job-posting discovery list scoped to
//    recordType MISSION (same component as the Offres page, see jobs.tsx).
//  - "Mes Missions": the barista's applications to MISSION job posts — the
//    ONLY mission-tracking system going forward. The legacy Demandes/Suivi
//    des missions sections (the old 1:1 request→accept→mission workflow)
//    were removed here as part of the mission-workflow cleanup; that old
//    system's data/routes/pages still exist (not deleted — see
//    mission_workflow_cleanup_audit.md) but are no longer surfaced in the
//    Barista Marketplace UI.
export default function BaristaMarketplaceMissionsHubPage() {
  const search = useSearch();
  const urlView = viewFromSearch(search);
  const [view, setView] = useState<HubView>(urlView ?? "available");
  useEffect(() => { if (urlView && urlView !== view) setView(urlView); }, [urlView]);

  const { jobs: availableMissions } = useSortedDiscoverJobs("MISSION");

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Missions"
        subtitle="Découvrez les missions proposées par les cafés et suivez vos candidatures."
        icon={ClipboardList}
        gradientClass="bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent border-green-500/20"
        iconBgClass="bg-green-500/15"
        iconTextClass="text-green-600 dark:text-green-400"
      />

      <Tabs value={view} onValueChange={(v) => setView(v as HubView)}>
        <TabsList>
          <TabsTrigger value="available" data-testid="tab-missions-hub-available">Missions disponibles ({availableMissions.length})</TabsTrigger>
          <TabsTrigger value="mine" data-testid="tab-missions-hub-mine">Mes Missions</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "available" ? (
        <JobDiscoverList recordType="MISSION" />
      ) : (
        <div className="flex flex-col gap-4" data-testid="section-missions-hub-applications">
          <SectionHeading icon={Send} title="Candidatures — missions manuelles" subtitle="Suivez vos candidatures aux missions publiées par les cafés." />
          <JobApplicationsList recordType="MISSION" />
        </div>
      )}
    </div>
  );
}
