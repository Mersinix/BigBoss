import { useMemo } from "react";
import { useFormatCurrency } from "@/hooks/use-currency";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/dashboard/dashboard-kit";
import { Users, Phone } from "lucide-react";
import { useMarketingProjects } from "@/hooks/use-marketing";
import { MARKETING_PROJECT_STATUS_META } from "@/lib/marketing-project-status";

// ── Clients tab — grouped view over the same marketingProjects the provider
// already sees on Projets, never a second Coffee-Owner-relationship dataset.
// Only Coffee Owners with an actual project relationship appear here. ─────────

export default function MarketingClients() {
  const fmt = useFormatCurrency();
  const { data: projects = [], isLoading } = useMarketingProjects();

  const clients = useMemo(() => {
    const byOwner = new Map<number, { name: string; phone: string | null; projects: typeof projects }>();
    for (const p of projects) {
      const entry = byOwner.get(p.cafeOwnerId) ?? { name: p.cafeOwner ?? "Client", phone: p.ownerPhone ?? null, projects: [] };
      entry.projects.push(p);
      byOwner.set(p.cafeOwnerId, entry);
    }
    return Array.from(byOwner.entries()).map(([cafeOwnerId, data]) => {
      const active = data.projects.filter((p) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(p.status)).length;
      const completed = data.projects.filter((p) => p.status === "COMPLETED").length;
      const totalValueCents = data.projects.reduce((sum, p) => sum + (p.finalAmountInCents ?? 0), 0);
      const lastActivity = data.projects.reduce((latest, p) => {
        const t = new Date(p.updatedAt).getTime();
        return t > latest ? t : latest;
      }, 0);
      const latestStatus = [...data.projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]?.status;
      return { cafeOwnerId, name: data.name, phone: data.phone, active, completed, totalValueCents, lastActivity, latestStatus, projectCount: data.projects.length };
    }).sort((a, b) => b.lastActivity - a.lastActivity);
  }, [projects]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Clients</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Coffee Owners avec lesquels vous avez une relation Marketing.</p>
      </div>

      {isLoading ? null : clients.length === 0 ? (
        <EmptyState message="Aucun client pour le moment." icon={Users} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {clients.map((c) => {
            const meta = c.latestStatus ? MARKETING_PROJECT_STATUS_META[c.latestStatus as keyof typeof MARKETING_PROJECT_STATUS_META] : null;
            return (
              <div key={c.cafeOwnerId} className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 space-y-3" data-testid={`card-client-${c.cafeOwnerId}`}>
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-fuchsia-100 text-fuchsia-700 font-bold text-sm">{c.name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{c.name}</p>
                    {c.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>}
                  </div>
                  {meta && <Badge variant="outline" className={meta.className}>{meta.label}</Badge>}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-secondary/30 py-2">
                    <p className="font-bold text-sm">{c.active}</p>
                    <p className="text-muted-foreground">Actifs</p>
                  </div>
                  <div className="rounded-xl bg-secondary/30 py-2">
                    <p className="font-bold text-sm">{c.completed}</p>
                    <p className="text-muted-foreground">Terminés</p>
                  </div>
                  <div className="rounded-xl bg-secondary/30 py-2">
                    <p className="font-bold text-sm">{fmt(c.totalValueCents)}</p>
                    <p className="text-muted-foreground">Valeur</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
