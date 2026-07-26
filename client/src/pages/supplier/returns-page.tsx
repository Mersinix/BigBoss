import { useState } from "react";
import { useReturns, useUpdateReturnStatus } from "@/hooks/use-orders";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RotateCcw, CheckCircle, Clock, XCircle, AlertCircle, Loader2, Box } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { OrderReturnRow } from "@/hooks/use-orders";

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; icon: any }> = {
  PENDING_REVIEW: { label: "En attente",   color: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",   icon: Clock },
  APPROVED:       { label: "Approuvée",    color: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",       icon: CheckCircle },
  REJECTED:       { label: "Rejetée",      color: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",           icon: XCircle },
  IN_PROGRESS:    { label: "En traitement", color: "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300", icon: Loader2 },
  RESOLVED:       { label: "Résolue",      color: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300",   icon: RotateCcw },
};

const NEXT_STATUSES: Record<string, { value: string; label: string }[]> = {
  PENDING_REVIEW: [
    { value: "APPROVED",    label: "Approuver" },
    { value: "REJECTED",    label: "Rejeter" },
  ],
  APPROVED: [
    { value: "IN_PROGRESS", label: "Commencer le traitement" },
    { value: "REJECTED",    label: "Rejeter" },
  ],
  IN_PROGRESS: [
    { value: "RESOLVED",   label: "Marquer comme résolue" },
  ],
};

// ── Review Modal ───────────────────────────────────────────────────────────────

function ReviewModal({
  returnRow,
  onClose,
}: {
  returnRow: OrderReturnRow;
  onClose: () => void;
}) {
  const updateStatus = useUpdateReturnStatus();
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [notes, setNotes] = useState(returnRow.supplierNotes ?? "");

  const next = NEXT_STATUSES[returnRow.status] ?? [];

  const handleSubmit = () => {
    if (!selectedStatus) return;
    updateStatus.mutate(
      { id: returnRow.id, status: selectedStatus, supplierNotes: notes.trim() || undefined },
      {
        onSuccess: () => {
          toast({ title: "Statut mis à jour", description: `Demande de retour #${returnRow.id} mise à jour.` });
          onClose();
        },
        onError: () => toast({ title: "Erreur", variant: "destructive" }),
      }
    );
  };

  const cfg = STATUS_CFG[returnRow.status] ?? STATUS_CFG.PENDING_REVIEW;
  const StatusIcon = cfg.icon;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-amber-500" />
            Demande de retour #{String(returnRow.id).padStart(5, "0")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Statut actuel</p>
              <Badge variant="secondary" className={`${cfg.color} flex items-center gap-1 w-fit`}>
                <StatusIcon className="w-3 h-3" />{cfg.label}
              </Badge>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Commande associée</p>
              <p className="font-mono font-medium">#{String(returnRow.orderId).padStart(6,"0")}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Article</p>
              <p className="font-medium">{returnRow.itemName}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Quantité</p>
              <p className="font-medium">{returnRow.quantity}</p>
            </div>
            <div className="col-span-2 space-y-0.5">
              <p className="text-xs text-muted-foreground">Raison</p>
              <p className="text-sm bg-secondary/30 rounded-lg p-2">{returnRow.reason}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Date de demande</p>
              <p className="text-sm">{formatDate(returnRow.requestedAt)}</p>
            </div>
            {returnRow.processedAt && (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Date de traitement</p>
                <p className="text-sm">{formatDate(returnRow.processedAt)}</p>
              </div>
            )}
          </div>

          {next.length > 0 && (
            <>
              <div className="border-t border-border/50" />
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nouvelle décision</Label>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger><SelectValue placeholder="Choisir une action…" /></SelectTrigger>
                    <SelectContent>
                      {next.map(n => (
                        <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes fournisseur <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
                  <Textarea
                    placeholder="Expliquez votre décision..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
                  <Button className="flex-1" onClick={handleSubmit} disabled={!selectedStatus || updateStatus.isPending}>
                    {updateStatus.isPending ? "Traitement…" : "Confirmer"}
                  </Button>
                </div>
              </div>
            </>
          )}

          {next.length === 0 && (
            <Button variant="outline" className="w-full" onClick={onClose}>Fermer</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ReturnsPage() {
  const { data: returns = [], isLoading } = useReturns();
  const [reviewing, setReviewing] = useState<OrderReturnRow | null>(null);

  const stats = {
    pending:    returns.filter(r => r.status === "PENDING_REVIEW").length,
    approved:   returns.filter(r => r.status === "APPROVED").length,
    inProgress: returns.filter(r => r.status === "IN_PROGRESS").length,
    resolved:   returns.filter(r => r.status === "RESOLVED").length,
    rejected:   returns.filter(r => r.status === "REJECTED").length,
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Retours</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gérez les demandes de retour et de remboursement de vos clients.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "En attente",    value: stats.pending,    icon: Clock,      cls: "text-amber-600 bg-amber-500/10" },
          { label: "Approuvées",   value: stats.approved,   icon: CheckCircle, cls: "text-blue-600 bg-blue-500/10" },
          { label: "En traitement",value: stats.inProgress, icon: Loader2,    cls: "text-purple-600 bg-purple-500/10" },
          { label: "Résolues",     value: stats.resolved,   icon: RotateCcw,  cls: "text-green-600 bg-green-500/10" },
          { label: "Rejetées",     value: stats.rejected,   icon: XCircle,    cls: "text-red-600 bg-red-500/10" },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`rounded-xl p-2.5 ${cls.split(" ")[1]}`}>
                <Icon className={`w-4 h-4 ${cls.split(" ")[0]}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground leading-tight">{label}</p>
                <p className="text-xl font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Returns table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Demandes de retour</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {returns.length === 0 ? (
            <div className="py-16 text-center">
              <Box className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
              <p className="font-semibold">Aucune demande de retour</p>
              <p className="text-sm text-muted-foreground mt-1">Les demandes de retour de vos clients apparaîtront ici.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Réf.</TableHead>
                  <TableHead>Commande</TableHead>
                  <TableHead>Article</TableHead>
                  <TableHead>Qté</TableHead>
                  <TableHead>Raison</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map(r => {
                  const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.PENDING_REVIEW;
                  const StatusIcon = cfg.icon;
                  const canReview = !!NEXT_STATUSES[r.status]?.length;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        #{String(r.id).padStart(5,"0")}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        #{String(r.orderId).padStart(6,"0")}
                      </TableCell>
                      <TableCell className="font-medium max-w-[160px] truncate" title={r.itemName}>
                        {r.itemName}
                      </TableCell>
                      <TableCell>{r.quantity}</TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[180px] truncate" title={r.reason}>
                        {r.reason}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(r.requestedAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`${cfg.color} flex items-center gap-1 w-fit text-xs`}>
                          <StatusIcon className="w-3 h-3" />{cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={canReview ? "outline" : "ghost"}
                          className={`h-7 text-xs ${canReview ? "text-primary" : "text-muted-foreground cursor-default"}`}
                          onClick={() => canReview && setReviewing(r)}
                          disabled={!canReview}
                          data-testid={`button-review-return-${r.id}`}
                        >
                          {canReview ? "Traiter" : "Voir"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {reviewing && <ReviewModal returnRow={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}
