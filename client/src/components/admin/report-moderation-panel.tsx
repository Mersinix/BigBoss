import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, XCircle, Ban } from "lucide-react";
import { SadnessRatingDisplay } from "@/components/shared/sadness-rating";
import { createEntityReportHooks } from "@/hooks/use-entity-reports";

// Shared Admin report-moderation panel (task: "Centralize Report Moderation
// in Admin Communication and Fix Real-Time Publication") — extracted from
// the Maintenance-only moderation cards built in the previous task
// (admin/maintenance-page.tsx) so any service already migrated to the
// entity-report system (rating + Submitted -> Pending -> Published/Rejected)
// can plug into Admin -> Communication -> Signalements with one line,
// instead of duplicating this UI per service.
interface Props {
  // Route prefix used by createEntityReportHooks (e.g. "maintenance").
  service: string;
  // Field name on the admin report row holding the reported entity's display
  // name — differs per service (maintenanceName today; a future service may
  // reference a company/agency instead of a single professional).
  entityNameKey: string;
}

export function ReportModerationPanel({ service, entityNameKey }: Props) {
  // A fresh set of hook functions per `service` value — safe to call
  // unconditionally below since the same 3 hooks (two queries, one mutation)
  // run every render regardless of which service they're bound to.
  const hooks = useMemo(() => createEntityReportHooks(service), [service]);
  const { data: pending = [] } = hooks.useAdminReports("PENDING");
  const { data: published = [] } = hooks.useAdminReports("PUBLISHED");
  const moderate = hooks.useModerateReport();

  if (pending.length === 0 && published.length === 0) {
    return (
      <div className="rounded-2xl border border-border/50 p-16 text-center text-muted-foreground">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="font-medium">Aucun signalement</p>
        <p className="text-sm mt-1">Les signalements soumis par les Coffee Owners apparaîtront ici.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-700">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" /> Signalements en attente ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border/50">
            {pending.map((r: any) => (
              <div key={r.id} className="p-3 flex items-start justify-between gap-3" data-testid={`row-report-${service}-${r.id}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r[entityNameKey]} <span className="text-muted-foreground font-normal">signalé par {r.cafeOwnerName}</span></p>
                  <div className="mt-1"><SadnessRatingDisplay rating={r.rating} /></div>
                  <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(r.createdAt).toLocaleDateString("fr-FR")}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={moderate.isPending}
                    onClick={() => moderate.mutate({ id: r.id, status: "REJECTED" })} data-testid={`button-reject-report-${service}-${r.id}`}>
                    <XCircle className="w-3 h-3 mr-1" />Rejeter
                  </Button>
                  <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={moderate.isPending || r.rating == null}
                    title={r.rating == null ? "Signalement sans note — ne peut pas être publié" : undefined}
                    onClick={() => moderate.mutate({ id: r.id, status: "PUBLISHED" })} data-testid={`button-publish-report-${service}-${r.id}`}>
                    <CheckCircle className="w-3 h-3 mr-1" />Publier
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {published.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" /> Signalements publiés ({published.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border/50">
            {published.map((r: any) => (
              <div key={r.id} className="p-3 flex items-start justify-between gap-3" data-testid={`row-report-published-${service}-${r.id}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r[entityNameKey]} <span className="text-muted-foreground font-normal">signalé par {r.cafeOwnerName}</span></p>
                  <div className="mt-1"><SadnessRatingDisplay rating={r.rating} /></div>
                  <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" disabled={moderate.isPending}
                  onClick={() => moderate.mutate({ id: r.id, status: "REJECTED" })} data-testid={`button-unpublish-report-${service}-${r.id}`}>
                  <Ban className="w-3 h-3 mr-1" />Retirer
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
