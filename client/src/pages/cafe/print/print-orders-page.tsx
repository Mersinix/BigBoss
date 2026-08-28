import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency } from "@/hooks/use-currency";
import { formatDate } from "@/lib/format";
import { PRINT_ORDER_STATUS_META } from "@/lib/print-order-status";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, Package, Star, Calendar, MessageSquarePlus } from "lucide-react";
import type { PrintOrderWithParties, PrintOrderStatus } from "@shared/schema";

// ── Review type (server response shape from GET /api/print/reviews/order/:id) ──

type PrintReview = {
  id: number;
  printerId: number;
  printOrderId: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
} | null;

// ── Read-only stars ──────────────────────────────────────────────────────────

function StarsReadOnly({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={`w-3.5 h-3.5 ${s <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

// ── Review dialog (star picker + comment, mirrors AgentDetailModal's review form) ──

function ReviewDialog({
  open, onClose, order, existingReview,
}: {
  open: boolean;
  onClose: () => void;
  order: PrintOrderWithParties;
  existingReview: PrintReview;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(existingReview?.rating ?? 5);
  const [comment, setComment] = useState(existingReview?.comment ?? "");

  // The dialog stays mounted (hidden) from the moment the order card renders, while
  // its review query may still be loading — resync the form fields from whatever
  // existingReview resolves to each time the dialog is actually opened, rather than
  // trusting the useState initializer's one-time snapshot.
  useEffect(() => {
    if (!open) return;
    setRating(existingReview?.rating ?? 5);
    setComment(existingReview?.comment ?? "");
  }, [open, existingReview]);

  const submitReview = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/print/reviews", {
        printerId: order.printerId,
        printOrderId: order.id,
        rating,
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/print/reviews/order", order.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/print/marketplace"] });
      toast({ title: existingReview ? "Avis mis à jour" : "Avis publié", description: "Merci pour votre retour !" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Impossible d'envoyer l'avis", description: error.message.replace(/^\d+:\s*/, ""), variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>{existingReview ? "Modifier votre avis" : "Laisser un avis"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{order.itemName} · {order.printerName}</p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} étoiles`}>
                <Star className={`w-6 h-6 ${value <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
              </button>
            ))}
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Partagez votre expérience (facultatif)"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={() => submitReview.mutate()} disabled={submitReview.isPending}>
              {submitReview.isPending ? "Envoi…" : existingReview ? "Mettre à jour" : "Publier l'avis"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Order card ────────────────────────────────────────────────────────────────

function PrintOrderCard({ order }: { order: PrintOrderWithParties }) {
  const fmt = useFormatCurrency();
  const [reviewOpen, setReviewOpen] = useState(false);
  const isDelivered = order.status === "DELIVERED";
  const meta = PRINT_ORDER_STATUS_META[order.status as PrintOrderStatus] ?? PRINT_ORDER_STATUS_META.PENDING;

  const { data: review, isLoading: reviewLoading } = useQuery<PrintReview>({
    queryKey: ["/api/print/reviews/order", order.id],
    enabled: isDelivered,
  });

  return (
    <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden" data-testid={`print-order-card-${order.id}`}>
      <div className="bg-secondary/30 px-5 py-3.5 border-b border-border/50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Commande</p>
            <p className="font-mono text-sm mt-0.5">#{String(order.id).padStart(6, "0")}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</p>
            <p className="text-sm mt-0.5 text-muted-foreground flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{order.createdAt ? formatDate(order.createdAt as any) : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Société d'impression</p>
            <p className="text-sm mt-0.5 font-medium flex items-center gap-1"><Printer className="w-3.5 h-3.5 text-muted-foreground" />{order.printerName}</p>
          </div>
        </div>
        <Badge variant="outline" className={`${meta.className} border px-3 py-1 text-xs font-bold rounded-lg`}>
          {meta.label}
        </Badge>
      </div>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-sm">{order.itemName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Quantité : {order.quantity}</p>
            {order.notes && <p className="text-xs text-muted-foreground mt-0.5">Note : {order.notes}</p>}
          </div>
          <p className="font-bold text-lg shrink-0">{fmt(order.totalInCents)}</p>
        </div>

        {isDelivered && (
          <div className="border-t border-border/50 pt-3">
            {reviewLoading ? (
              <div className="h-6 w-32 rounded bg-muted animate-pulse" />
            ) : review ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <StarsReadOnly rating={review.rating} />
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                    onClick={() => setReviewOpen(true)}
                    data-testid={`button-edit-review-${order.id}`}
                  >
                    Modifier
                  </button>
                </div>
                {review.comment && <p className="text-xs text-muted-foreground">{review.comment}</p>}
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setReviewOpen(true)}
                data-testid={`button-leave-review-${order.id}`}
              >
                <MessageSquarePlus className="w-3.5 h-3.5" /> Laisser un avis
              </Button>
            )}
          </div>
        )}
      </CardContent>

      {isDelivered && (
        <ReviewDialog
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          order={order}
          existingReview={review ?? null}
        />
      )}
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PrintOrdersPage() {
  const { data: orders = [], isLoading } = useQuery<PrintOrderWithParties[]>({
    queryKey: ["/api/print/orders"],
  });

  const sorted = [...orders].sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mes commandes PRINT</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Suivez vos commandes d'impression et laissez un avis une fois livrées.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-border/50">
          <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="font-bold text-xl text-foreground">Aucune commande PRINT pour le moment</h3>
          <p className="text-muted-foreground mt-2">Découvrez nos services d'impression et passez votre première commande.</p>
          <Link href="/print">
            <Button className="mt-4" data-testid="link-browse-print">Parcourir PRINT</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((order) => <PrintOrderCard key={order.id} order={order} />)}
        </div>
      )}
    </div>
  );
}
