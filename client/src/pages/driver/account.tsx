import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDeliveries } from "@/hooks/use-deliveries";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Phone, MapPin, Truck, CheckCircle2, Clock, Star, Building2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { StatCard } from "@/components/dashboard/dashboard-kit";
import { getAvatarUrl } from "@/lib/avatar";

// "Mon Compte" — the Driver account's landing page. Profile fields come straight from
// useAuth() (the users row — see shared/schema.ts; a DRIVER account has no dedicated
// vehicle columns today, so those are simply not shown rather than fabricated).
// Activity counts and the operator name (delivery company or supplier) are derived from
// GET /api/deliveries, already scoped server-side to this driver's own rows (see
// storage.getDeliveries) and kept realtime by DriverAccountShell's useRealtime() call.
export default function DriverAccountPage() {
  const { user } = useAuth();
  const { data: deliveries = [], isLoading } = useDeliveries();

  const stats = useMemo(() => {
    const completed = deliveries.filter((d) => d.status === "DELIVERED");
    const cancelled = deliveries.filter((d) => d.status === "CANCELLED");
    const active = deliveries.filter((d) => !["DELIVERED", "CANCELLED"].includes(d.status));
    return { total: deliveries.length, completed: completed.length, cancelled: cancelled.length, active: active.length };
  }, [deliveries]);

  // The operator's name (delivery company or supplier fleet) isn't stored directly on the
  // driver's own user row — it's only known once a delivery has been assigned. Real data,
  // best-effort: derived from the most recent delivery that has it, "—" if none yet.
  const operatorName = useMemo(() => {
    const withOperator = deliveries.find((d) => d.deliveryCompany?.name || d.supplier?.name);
    return withOperator?.deliveryCompany?.name ?? withOperator?.supplier?.name ?? null;
  }, [deliveries]);

  const statusLabel: Record<string, { label: string; cls: string }> = {
    approved: { label: "Compte approuvé", cls: "bg-green-100 text-green-700" },
    pending: { label: "En attente d'approbation", cls: "bg-amber-100 text-amber-700" },
    rejected: { label: "Compte refusé", cls: "bg-red-100 text-red-700" },
  };
  const accountStatus = statusLabel[user?.status ?? "approved"] ?? { label: user?.status ?? "—", cls: "bg-gray-100 text-gray-700" };

  return (
    <div className="flex flex-col gap-6">
      {/* Profile card */}
      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/20">
        <CardContent className="p-6 flex flex-wrap items-center gap-5">
          <Avatar className="w-16 h-16 shrink-0">
            <AvatarImage src={getAvatarUrl(user)} alt={user?.name ?? "Driver"} />
            <AvatarFallback className="bg-blue-600 text-white font-bold text-xl">
              {user?.name?.charAt(0)?.toUpperCase() ?? "D"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-display font-bold text-foreground truncate">{user?.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge variant="secondary" className={accountStatus.cls}>{accountStatus.label}</Badge>
              {operatorName && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Building2 className="w-3 h-3" />{operatorName}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact info */}
      <Card className="rounded-2xl border-border/50 shadow-sm">
        <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Mail className="w-4 h-4 text-primary" /></div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Phone className="w-4 h-4 text-primary" /></div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Téléphone</p>
              <p className="text-sm font-medium truncate">{user?.phone || "Non renseigné"}</p>
            </div>
          </div>
          {user?.locationAddress && (
            <div className="flex items-center gap-3 sm:col-span-2">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><MapPin className="w-4 h-4 text-primary" /></div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Localisation</p>
                <p className="text-sm font-medium truncate">{user.locationAddress}</p>
              </div>
            </div>
          )}
          {user?.createdAt && (
            <p className="text-xs text-muted-foreground sm:col-span-2">Membre depuis le {formatDate(user.createdAt as any)}</p>
          )}
        </CardContent>
      </Card>

      {/* Professional status */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Livraisons" value={stats.total} icon={Truck} tone="primary" subtext="au total" />
          <StatCard label="Terminées" value={stats.completed} icon={CheckCircle2} tone="green" />
          <StatCard label="En cours" value={stats.active} icon={Clock} tone="amber" />
          <StatCard label="Note moyenne" value="—" icon={Star} tone="blue" subtext="Aucun avis pour le moment" />
        </div>
      )}
    </div>
  );
}
