import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, MapPin, Calendar, Ban } from "lucide-react";
import type { MaintenanceMarketplaceCard } from "@shared/schema";
import { AgentDetailModal, type MaintenanceReservationData } from "@/pages/cafe/maintenance/maintenance-page";

const STATUS_LABELS: Record<string, string> = { PENDING: "En attente", RESOLVED: "Résolu", DISMISSED: "Ignoré" };
function statusColors(isDark: boolean): Record<string, string> {
  return isDark
    ? { PENDING: "bg-amber-900/50 text-amber-300", RESOLVED: "bg-green-900/50 text-green-300", DISMISSED: "bg-gray-700 text-gray-300" }
    : { PENDING: "bg-amber-100 text-amber-700", RESOLVED: "bg-green-100 text-green-700", DISMISSED: "bg-gray-100 text-gray-600" };
}

type MyMaintenanceReport = {
  id: number; cafeOwnerId: number; maintenanceUserId: number; reason: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED"; createdAt: string; resolvedAt: string | null; resolutionNote: string | null;
  maintenanceName: string; maintenanceProfileImageUrl: string | null; maintenanceLocation: string | null;
};

// Coffee Owner's Maintenance "Blacklist" (Parts 20-23) — a scoped VIEW of
// maintenanceReports (GET /api/maintenance/reports/mine), a table entirely
// separate from baristaReports — never mixes service data. Clicking a
// reported provider opens the exact same AgentDetailModal used everywhere
// else on /maintenance (no separate profile implementation).
export function MaintenanceBlacklistModal({ open, onClose, isDark }: { open: boolean; onClose: () => void; isDark: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: reports = [], isLoading } = useQuery<MyMaintenanceReport[]>({ queryKey: ["/api/maintenance/reports/mine"], enabled: open });
  const { data: providers = [] } = useQuery<MaintenanceMarketplaceCard[]>({ queryKey: ["/api/maintenance/profiles"], enabled: open });
  const [detailAgent, setDetailAgent] = useState<MaintenanceMarketplaceCard | null>(null);
  const STATUS_COLORS = statusColors(isDark);
  const t = {
    modalBg: isDark ? "bg-gray-900" : "bg-white",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    rowHover: isDark ? "hover:bg-gray-800/60" : "hover:bg-gray-50",
  };

  const reserve = useMutation({
    mutationFn: ({ agent, data }: { agent: MaintenanceMarketplaceCard; data: MaintenanceReservationData }) =>
      apiRequest("POST", "/api/maintenance/reservations", { maintenanceUserId: agent.userId, service: agent.jobTitle, ...data }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/maintenance/reservations"] }); setDetailAgent(null); toast({ title: "Demande envoyée" }); },
    onError: (err: Error) => toast({ title: "Impossible d'envoyer la demande", description: err.message, variant: "destructive" }),
  });
  const contact = async (agent: MaintenanceMarketplaceCard) => {
    try {
      await apiRequest("POST", "/api/messages/conversations", { targetUserId: agent.userId, service: "MAINTENANCE" });
      toast({ title: "Conversation ouverte", description: "Retrouvez-la dans vos Messages." });
    } catch (err) {
      toast({ title: "Contact impossible", description: err instanceof Error ? err.message : "Veuillez réessayer.", variant: "destructive" });
    }
  };

  const openReported = (report: MyMaintenanceReport) => {
    const provider = providers.find((p) => p.userId === report.maintenanceUserId);
    if (provider) setDetailAgent(provider);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className={`sm:max-w-xl rounded-2xl border-0 shadow-2xl max-h-[85vh] overflow-y-auto ${t.modalBg}`}>
          <VisuallyHidden><DialogTitle>Professionnels Maintenance signalés</DialogTitle></VisuallyHidden>
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-red-900/40" : "bg-red-100"}`}>
              <Ban className={`w-4 h-4 ${isDark ? "text-red-400" : "text-red-600"}`} />
            </div>
            <div>
              <h2 className={`font-bold text-base ${t.textPrimary}`}>Professionnels signalés</h2>
              <p className={`text-xs ${t.textMuted}`}>Les professionnels Maintenance que vous avez personnellement signalés.</p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2 mt-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className={`h-24 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />)}</div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
              <ShieldAlert className={`w-10 h-10 ${isDark ? "text-gray-600" : "text-gray-300"}`} />
              <p className={`text-sm font-medium ${t.textPrimary}`}>Aucun professionnel signalé</p>
              <p className={`text-xs max-w-xs ${t.textMuted}`}>Les professionnels Maintenance que vous signalez depuis leur profil apparaîtront ici avec le motif que vous avez soumis.</p>
            </div>
          ) : (
            <div className="space-y-2.5 mt-2">
              {reports.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openReported(r)}
                  className={`w-full text-left flex gap-3 p-3 rounded-2xl border transition-colors ${t.border} ${t.rowHover}`}
                  data-testid={`row-maintenance-blacklist-${r.id}`}
                >
                  <Avatar className="w-14 h-14 shrink-0 rounded-xl">
                    <AvatarImage src={getAvatarUrl({ profileImageUrl: r.maintenanceProfileImageUrl })} alt={r.maintenanceName} className="object-cover rounded-xl" />
                    <AvatarFallback className={`rounded-xl font-bold ${isDark ? "bg-red-900/40 text-red-300" : "bg-red-100 text-red-700"}`}>
                      {r.maintenanceName.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`font-semibold text-sm truncate ${t.textPrimary}`}>{r.maintenanceName}</p>
                      <Badge className={`text-[10px] border-0 shrink-0 px-1.5 ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</Badge>
                    </div>
                    {r.maintenanceLocation && <p className={`text-xs flex items-center gap-1 mt-0.5 ${t.textMuted}`}><MapPin className="w-3 h-3 shrink-0" /> {r.maintenanceLocation}</p>}
                    <p className={`text-xs flex items-center gap-1 mt-0.5 ${t.textMuted}`}><Calendar className="w-3 h-3 shrink-0" /> {new Date(r.createdAt).toLocaleDateString("fr-FR")}</p>
                    <p className={`text-sm mt-1.5 line-clamp-2 ${t.textPrimary}`}>{r.reason}</p>
                    {r.status !== "PENDING" && r.resolutionNote && <p className={`text-xs mt-1 italic ${t.textMuted}`}>Réponse Admin : {r.resolutionNote}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AgentDetailModal agent={detailAgent} open={!!detailAgent} onClose={() => setDetailAgent(null)} onContact={contact} onReserve={(agent, data) => reserve.mutate({ agent, data })} isDark={isDark} />
    </>
  );
}
