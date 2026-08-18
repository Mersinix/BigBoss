import { useMemo, useState } from "react";
import { useBaristaRequests, useUpdateBaristaRequestStatus, type BaristaRequest, type BaristaRequestStatus } from "@/hooks/use-barista-marketplace";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Briefcase, Calendar, MessageSquare, User } from "lucide-react";

const STATUS_LABELS: Record<BaristaRequestStatus, string> = {
  PENDING: "En attente",
  DISCUSSION: "En discussion",
  ACCEPTED: "Acceptée",
  REJECTED: "Refusée",
  CANCELLED: "Annulée",
  COMPLETED: "Terminée",
};

const STATUS_COLORS: Record<BaristaRequestStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  DISCUSSION: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-600",
  COMPLETED: "bg-purple-100 text-purple-700",
};

function RequestCard({ request }: { request: BaristaRequest }) {
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const updateStatus = useUpdateBaristaRequestStatus();

  const act = (status: "DISCUSSION" | "ACCEPTED" | "REJECTED") => {
    updateStatus.mutate(
      { id: request.id, status },
      {
        onSuccess: () => toast({ title: status === "ACCEPTED" ? "Mission créée" : "Demande mise à jour" }),
        onError: (err: Error) => toast({ title: "Action impossible", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Card data-testid={`card-request-${request.id}`}>
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <User className="w-4 h-4 text-muted-foreground" />
            {request.cafeOwnerName}
          </div>
          <Badge variant="secondary" className={STATUS_COLORS[request.status]}>{STATUS_LABELS[request.status]}</Badge>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Briefcase className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {request.missionType}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          {request.startDate}{request.endDate ? ` → ${request.endDate}` : ""}
          {request.proposedRateInCents != null && <span className="ml-auto font-semibold text-foreground">{fmt(request.proposedRateInCents)}/jour</span>}
        </div>
        {request.message && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/30 rounded-lg p-2">
            <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{request.message}</span>
          </div>
        )}
        {(request.status === "PENDING" || request.status === "DISCUSSION") && (
          <div className="flex gap-2 justify-end pt-2 border-t border-border/50">
            {request.status === "PENDING" && (
              <Button size="sm" variant="outline" onClick={() => act("DISCUSSION")} disabled={updateStatus.isPending} data-testid={`button-discuss-${request.id}`}>
                Discuter
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => act("REJECTED")} disabled={updateStatus.isPending} data-testid={`button-reject-${request.id}`}>
              Refuser
            </Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => act("ACCEPTED")} disabled={updateStatus.isPending} data-testid={`button-accept-${request.id}`}>
              Accepter
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BaristaRequestsPage() {
  const { data: requests = [], isLoading } = useBaristaRequests();
  const [tab, setTab] = useState<"active" | "all">("active");

  const sorted = useMemo(() => [...requests].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)), [requests]);
  const active = sorted.filter((r) => r.status === "PENDING" || r.status === "DISCUSSION");
  const list = tab === "active" ? active : sorted;

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Demandes reçues</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Répondez aux demandes des cafés pour créer une mission.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "all")}>
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-requests-active">À traiter ({active.length})</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-requests-all">Toutes ({sorted.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">Aucune demande pour le moment</p>
            <p className="text-sm text-muted-foreground mt-1">Les nouvelles demandes de café apparaîtront ici en temps réel.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((request) => <RequestCard key={request.id} request={request} />)}
        </div>
      )}
    </div>
  );
}
