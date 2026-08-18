import { useMemo, useState } from "react";
import { useBaristaMissions, useUpdateBaristaMissionStatus, type BaristaMission, type BaristaMissionStatus } from "@/hooks/use-barista-marketplace";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, Calendar, User } from "lucide-react";

const STATUS_LABELS: Record<BaristaMissionStatus, string> = {
  UPCOMING: "À venir",
  ACTIVE: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

const STATUS_COLORS: Record<BaristaMissionStatus, string> = {
  UPCOMING: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-600",
};

function MissionCard({ mission }: { mission: BaristaMission }) {
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const updateStatus = useUpdateBaristaMissionStatus();

  const act = (status: "ACTIVE" | "COMPLETED" | "CANCELLED") => {
    updateStatus.mutate(
      { id: mission.id, status },
      {
        onSuccess: () => toast({ title: "Mission mise à jour" }),
        onError: (err: Error) => toast({ title: "Action impossible", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Card data-testid={`card-mission-${mission.id}`}>
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <User className="w-4 h-4 text-muted-foreground" />
            {mission.cafeOwnerName}
          </div>
          <Badge variant="secondary" className={STATUS_COLORS[mission.status]}>{STATUS_LABELS[mission.status]}</Badge>
        </div>
        <p className="text-sm">{mission.missionType}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          {mission.startDate}{mission.endDate ? ` → ${mission.endDate}` : ""}
          <span className="ml-auto font-semibold text-foreground">{fmt(mission.rateInCents)}/jour</span>
        </div>
        {(mission.status === "UPCOMING" || mission.status === "ACTIVE") && (
          <div className="flex gap-2 justify-end pt-2 border-t border-border/50">
            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => act("CANCELLED")} disabled={updateStatus.isPending} data-testid={`button-cancel-mission-${mission.id}`}>
              Annuler
            </Button>
            {mission.status === "UPCOMING" && (
              <Button size="sm" variant="outline" onClick={() => act("ACTIVE")} disabled={updateStatus.isPending} data-testid={`button-start-mission-${mission.id}`}>
                Démarrer
              </Button>
            )}
            {mission.status === "ACTIVE" && (
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => act("COMPLETED")} disabled={updateStatus.isPending} data-testid={`button-complete-mission-${mission.id}`}>
                Terminer
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TABS: { value: BaristaMissionStatus | "all"; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "UPCOMING", label: "À venir" },
  { value: "ACTIVE", label: "En cours" },
  { value: "COMPLETED", label: "Terminées" },
  { value: "CANCELLED", label: "Annulées" },
];

export default function BaristaMissionsPage() {
  const { data: missions = [], isLoading } = useBaristaMissions();
  const [tab, setTab] = useState<BaristaMissionStatus | "all">("all");

  const sorted = useMemo(() => [...missions].sort((a, b) => (b.startDate > a.startDate ? 1 : -1)), [missions]);
  const list = tab === "all" ? sorted : sorted.filter((m) => m.status === tab);

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mes missions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Missions créées à partir de demandes acceptées.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as BaristaMissionStatus | "all")}>
        <TabsList className="flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} data-testid={`tab-mission-${t.value.toLowerCase()}`}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}</div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">Aucune mission pour le moment</p>
            <p className="text-sm text-muted-foreground mt-1">Acceptez une demande pour créer votre première mission.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((mission) => <MissionCard key={mission.id} mission={mission} />)}
        </div>
      )}
    </div>
  );
}
