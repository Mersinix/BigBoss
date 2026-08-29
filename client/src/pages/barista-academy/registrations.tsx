import { useMemo, useState } from "react";
import {
  useAcademyRegistrations, useUpdateAcademyRegistrationStatus,
  type AcademyRegistrationWithParties, type AcademyRegistrationStatus,
} from "@/hooks/use-barista-academy";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, Calendar, Users, User } from "lucide-react";

const STATUS_LABELS: Record<AcademyRegistrationStatus, string> = {
  PENDING: "En attente", CONFIRMED: "Confirmée", CANCELLED: "Annulée", COMPLETED: "Terminée",
};
const STATUS_COLORS: Record<AcademyRegistrationStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700", CONFIRMED: "bg-indigo-100 text-indigo-700",
  CANCELLED: "bg-gray-100 text-gray-600", COMPLETED: "bg-green-100 text-green-700",
};

function RegistrationCard({ registration }: { registration: AcademyRegistrationWithParties }) {
  const fmt = useFormatCurrency();
  const { toast } = useToast();
  const updateStatus = useUpdateAcademyRegistrationStatus();

  const act = (status: "CONFIRMED" | "COMPLETED" | "CANCELLED") => {
    updateStatus.mutate(
      { id: registration.id, status },
      {
        onSuccess: () => toast({ title: "Inscription mise à jour" }),
        onError: (err: Error) => toast({ title: "Action impossible", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Card data-testid={`card-registration-${registration.id}`}>
      <CardContent className="p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <User className="w-4 h-4 text-muted-foreground" />
            {registration.cafeOwnerName}
            <Badge variant="outline" className="text-[10px] font-normal">{registration.participantType === "BARISTA_MARKETPLACE" ? "Barista" : "Coffee Owner"}</Badge>
          </div>
          <Badge variant="secondary" className={STATUS_COLORS[registration.status]}>{STATUS_LABELS[registration.status]}</Badge>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <ClipboardList className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {registration.courseTitle}
        </div>
        {registration.sessionStartDate && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            {registration.sessionStartDate}{registration.sessionEndDate ? ` → ${registration.sessionEndDate}` : ""}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="w-3.5 h-3.5 shrink-0" />
          {registration.participantCount} participant{registration.participantCount > 1 ? "s" : ""}
          <span className="ml-auto font-semibold text-foreground">{fmt(registration.priceInCents)}</span>
        </div>
        {registration.notes && (
          <p className="text-xs text-muted-foreground bg-secondary/30 rounded-lg p-2">{registration.notes}</p>
        )}
        {(registration.status === "PENDING" || registration.status === "CONFIRMED") && (
          <div className="flex gap-2 justify-end pt-2 border-t border-border/50">
            {registration.status === "PENDING" && (
              <>
                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => act("CANCELLED")} disabled={updateStatus.isPending} data-testid={`button-cancel-${registration.id}`}>
                  Refuser
                </Button>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => act("CONFIRMED")} disabled={updateStatus.isPending} data-testid={`button-confirm-${registration.id}`}>
                  Confirmer
                </Button>
              </>
            )}
            {registration.status === "CONFIRMED" && (
              <>
                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => act("CANCELLED")} disabled={updateStatus.isPending} data-testid={`button-cancel-${registration.id}`}>
                  Annuler
                </Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => act("COMPLETED")} disabled={updateStatus.isPending} data-testid={`button-complete-${registration.id}`}>
                  Marquer terminée
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AcademyRegistrationsPage() {
  const { data: registrations = [], isLoading } = useAcademyRegistrations();
  const [tab, setTab] = useState<"active" | "all">("active");

  const sorted = useMemo(() => [...registrations].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)), [registrations]);
  const active = sorted.filter((r) => r.status === "PENDING" || r.status === "CONFIRMED");
  const list = tab === "active" ? active : sorted;

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Inscriptions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez les inscriptions des Coffee Owners à vos formations.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "all")}>
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-registrations-active">À traiter ({active.length})</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-registrations-all">Toutes ({sorted.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="font-semibold">Aucune inscription pour le moment</p>
            <p className="text-sm text-muted-foreground mt-1">Les nouvelles inscriptions apparaîtront ici en temps réel.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((registration) => <RegistrationCard key={registration.id} registration={registration} />)}
        </div>
      )}
    </div>
  );
}
