import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, MapPin, Calendar, Ban, Flag } from "lucide-react";
import { useMyPrintReports, useReportPrinter } from "@/hooks/use-print-marketplace";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = { PENDING: "En attente", RESOLVED: "Résolu", DISMISSED: "Ignoré" };
// This app's dark mode never adds a `.dark` class to the DOM (see the note in
// barista-detail-modal.tsx) — per-component `isDark`-driven ternary classes only.
function statusColors(isDark: boolean): Record<string, string> {
  return isDark
    ? { PENDING: "bg-amber-900/50 text-amber-300", RESOLVED: "bg-green-900/50 text-green-300", DISMISSED: "bg-gray-700 text-gray-300" }
    : { PENDING: "bg-amber-100 text-amber-700", RESOLVED: "bg-green-100 text-green-700", DISMISSED: "bg-gray-100 text-gray-600" };
}

// Coffee Owner's "Blacklist" for PRINT — a scoped VIEW of the same printReports
// table Admin moderates (GET /api/print/reports/mine), never a second report
// system. Mirrors AcademyBlacklistModal/MarketingBlacklistModal in its list
// view; also includes the report SUBMISSION form here (rather than on a
// per-item detail modal like Barista/Academy/Marketing use) because /print
// has no shared entity detail modal — clicking a product navigates to its own
// full page (print-detail-page.tsx) instead, so this is the one place in the
// existing PRINT hero flow to adapt the report action to.
export function PrintBlacklistModal({
  open, onClose, isDark, printers,
}: {
  open: boolean;
  onClose: () => void;
  isDark: boolean;
  printers: { id: number; name: string }[];
}) {
  const { toast } = useToast();
  const { data: reports = [], isLoading } = useMyPrintReports();
  const reportPrinter = useReportPrinter();
  const [formOpen, setFormOpen] = useState(false);
  const [printerId, setPrinterId] = useState("");
  const [reason, setReason] = useState("");
  const STATUS_COLORS = statusColors(isDark);
  const t = {
    modalBg: isDark ? "bg-gray-900" : "bg-white",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
    selectContent: isDark
      ? "bg-gray-800 border-gray-700 text-gray-100 [&_[data-highlighted]]:bg-gray-700 [&_[data-highlighted]]:text-white"
      : "bg-white border-gray-200 text-gray-900",
  };

  const submitReport = () => {
    if (!printerId || !reason.trim()) return;
    reportPrinter.mutate(
      { printerId: Number(printerId), reason: reason.trim() },
      {
        onSuccess: () => {
          toast({ title: "Signalement envoyé", description: "L'équipe Admin va l'examiner." });
          setFormOpen(false); setPrinterId(""); setReason("");
        },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`sm:max-w-xl rounded-2xl border-0 shadow-2xl max-h-[85vh] overflow-y-auto ${t.modalBg}`}>
        <VisuallyHidden><DialogTitle>Imprimeurs signalés</DialogTitle></VisuallyHidden>
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-red-900/40" : "bg-red-100"}`}>
              <Ban className={`w-4 h-4 ${isDark ? "text-red-400" : "text-red-600"}`} />
            </div>
            <div>
              <h2 className={`font-bold text-base ${t.textPrimary}`}>Imprimeurs signalés</h2>
              <p className={`text-xs ${t.textMuted}`}>Les imprimeurs que vous avez personnellement signalés.</p>
            </div>
          </div>
          {printers.length > 0 && (
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setFormOpen((v) => !v)} data-testid="button-open-print-report-form">
              <Flag className="w-3.5 h-3.5" /> Signaler
            </Button>
          )}
        </div>

        {formOpen && (
          <div className={`mt-3 p-3 rounded-xl border space-y-2 ${t.border}`}>
            <Select value={printerId} onValueChange={setPrinterId}>
              <SelectTrigger className={t.inputBg} data-testid="select-report-printer"><SelectValue placeholder="Choisir un imprimeur" /></SelectTrigger>
              <SelectContent className={t.selectContent}>
                {printers.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea placeholder="Décrivez le problème…" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={t.inputBg} data-testid="input-print-report-reason" />
            <div className="flex gap-2 justify-end pt-1">
              <Button size="sm" variant="ghost" className={t.textPrimary} onClick={() => { setFormOpen(false); setPrinterId(""); setReason(""); }}>Annuler</Button>
              <Button size="sm" variant="destructive" onClick={submitReport} disabled={!printerId || !reason.trim() || reportPrinter.isPending} data-testid="button-submit-print-report">
                {reportPrinter.isPending ? "Envoi…" : "Envoyer le signalement"}
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2 mt-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className={`h-24 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />)}
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
            <ShieldAlert className={`w-10 h-10 ${isDark ? "text-gray-600" : "text-gray-300"}`} />
            <p className={`text-sm font-medium ${t.textPrimary}`}>Aucun imprimeur signalé</p>
            <p className={`text-xs max-w-xs ${t.textMuted}`}>Les imprimeurs que vous signalez depuis un produit apparaîtront ici avec le motif que vous avez soumis.</p>
          </div>
        ) : (
          <div className="space-y-2.5 mt-2">
            {reports.map((r) => (
              <div key={r.id} className={`w-full text-left flex gap-3 p-3 rounded-2xl border ${t.border}`} data-testid={`row-blacklist-${r.id}`}>
                <Avatar className="w-14 h-14 shrink-0 rounded-xl">
                  <AvatarImage src={getAvatarUrl({ profileImageUrl: r.printerProfileImageUrl })} alt={r.printerName} className="object-cover rounded-xl" />
                  <AvatarFallback className={`rounded-xl font-bold ${isDark ? "bg-red-900/40 text-red-300" : "bg-red-100 text-red-700"}`}>
                    {r.printerName.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`font-semibold text-sm truncate ${t.textPrimary}`}>{r.printerName}</p>
                    <Badge className={`text-[10px] border-0 shrink-0 px-1.5 ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</Badge>
                  </div>
                  {r.printerLocation && (
                    <p className={`text-xs flex items-center gap-1 mt-0.5 ${t.textMuted}`}><MapPin className="w-3 h-3 shrink-0" /> {r.printerLocation}</p>
                  )}
                  <p className={`text-xs flex items-center gap-1 mt-0.5 ${t.textMuted}`}><Calendar className="w-3 h-3 shrink-0" /> {new Date(r.createdAt).toLocaleDateString("fr-FR")}</p>
                  <p className={`text-sm mt-1.5 line-clamp-2 ${t.textPrimary}`}>{r.reason}</p>
                  {r.status !== "PENDING" && r.resolutionNote && (
                    <p className={`text-xs mt-1 italic ${t.textMuted}`}>Réponse Admin : {r.resolutionNote}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
