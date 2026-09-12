import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Star, Flag } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";

// ── Reviews ("Avis") tab ──────────────────────────────────────────────────────

export default function Reviews() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reportId, setReportId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const { data: reviews = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/maintenance/reviews", user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/maintenance/reviews/${user!.id}`, { credentials: "include" });
      if (!response.ok) throw new Error("Impossible de charger les avis");
      return response.json();
    },
    enabled: !!user?.id,
  });
  const report = useMutation({
    mutationFn: () => apiRequest("POST", `/api/maintenance/reviews/${reportId}/report`, { reason }),
    onSuccess: () => {
      setReportId(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance/reviews", user?.id] });
      toast({ title: "Avis signalé", description: "L'équipe admin examinera votre signalement." });
    },
    onError: (error: Error) => toast({ title: "Signalement impossible", description: error.message, variant: "destructive" }),
  });

  const avgRating = useMemo(
    () => (reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0),
    [reviews],
  );

  return (
    <div className="flex flex-col gap-5">
      <DashboardHero
        title="Avis"
        subtitle="Avis laissés par les clients sur vos interventions."
        stat={reviews.length > 0 ? avgRating.toFixed(1) : undefined}
        statLabel={`${reviews.length} avis`}
        icon={Star}
        gradientClass="bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent border-orange-500/20"
        iconBgClass="bg-orange-500/15"
        iconTextClass="text-orange-600 dark:text-orange-400"
      />
      <Card className="rounded-2xl bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700/60 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Star className="w-4 h-4 text-orange-500" />Avis clients
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-gray-400">Chargement…</p> : reviews.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Aucun avis reçu pour le moment.</p>
        ) : reviews.map((review) => {
          const reported = !!review.reportedAt;
          return (
            <div key={review.id} className="rounded-xl bg-gray-50 dark:bg-gray-700/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{review.cafeOwnerName || review.cafeName || "Coffee Owner"}</p>
                  <div className="flex items-center gap-1 mt-1 text-amber-500 text-xs">
                    {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                  disabled={reported}
                  onClick={() => setReportId(review.id)}
                  title={reported ? "Avis déjà signalé" : "Signaler cet avis"}
                >
                  <Flag className="w-3.5 h-3.5" />
                </Button>
              </div>
              {review.comment && <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{review.comment}</p>}
              {reported && <Badge variant="outline" className="mt-2 text-[10px] text-orange-600 border-orange-200">Signalé</Badge>}
            </div>
          );
        })}
      </CardContent>
      <Dialog open={reportId !== null} onOpenChange={(open) => { if (!open) { setReportId(null); setReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Signaler cet avis</DialogTitle></DialogHeader>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Expliquez le motif du signalement…" rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportId(null)}>Annuler</Button>
            <Button variant="destructive" disabled={!reason.trim() || report.isPending} onClick={() => report.mutate()}>Envoyer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </Card>
    </div>
  );
}
