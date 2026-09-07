import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useFormatCurrency } from "@/hooks/use-currency";
import { useFavorites } from "@/hooks/use-favorites";
import { useThemeStore } from "@/store/theme-store";
import { useQuery } from "@tanstack/react-query";
import {
  usePrintServiceDetail, usePrintReviews, useCreatePrintReview, useReportPrinter, startPrintConversation,
} from "@/hooks/use-print-marketplace";
import type { PrintOrderWithParties } from "@shared/schema";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarUrl } from "@/lib/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star, MapPin, Clock, Flag, Heart, MessageCircle, X, Printer, Package, Layers, ShoppingCart,
} from "lucide-react";

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} data-testid={`button-star-${n}`}>
          <Star className={`w-5 h-5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
        </button>
      ))}
    </div>
  );
}

// PRINT Service Details Modal — the real per-item ("service") preview, opened
// from Coffee Owner's /print marketplace card AND from Espace Imprimerie's own
// Business → Services "Aperçu" (readOnly there). Replaces the old behavior of
// navigating straight to the full page (print-detail-page.tsx) for a quick
// preview — that page still exists unchanged and is one click away via
// "Commander" below, so the file-upload/quantity/cart customization flow is
// fully preserved. Reuses /api/print/marketplace/:id (same data print-detail-page.tsx
// fetches) and the real favorites/report/messaging/review systems — no new
// data model, no fabricated fields (PRINT has no per-service "quote" concept,
// unlike Marketing, so there is no onRequestQuote here — just a direct
// "Commander" link to the existing ordering page).
export function PrintServiceDetailModal({
  serviceId,
  open,
  onClose,
  onOpenCompany,
  readOnly = false,
}: {
  serviceId: number | null;
  open: boolean;
  onClose: () => void;
  // Clicking the "Imprimerie" section hands the printerId back to the caller, which
  // opens PrintCompanyDetailModal — same nested-navigation pattern as
  // MarketingServiceDetailModal's onOpenAgency, kept as a callback so the two
  // modal files never import each other.
  onOpenCompany?: (printerId: number) => void;
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fmt = useFormatCurrency();
  const [, navigate] = useLocation();
  const isDark = useThemeStore((s) => s.isDark);
  const t = {
    modalBg: isDark ? "bg-gray-900" : "bg-white",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    border: isDark ? "border-gray-700/60" : "border-gray-100",
    sectionBg: isDark ? "bg-gray-800/60" : "bg-gray-50",
    sectionBgAlt: isDark ? "bg-gray-800/40" : "bg-gray-50",
    inputBg: isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border-gray-200",
  };
  const { data: service, isLoading } = usePrintServiceDetail(serviceId);
  const { data: reviews = [] } = usePrintReviews(service?.printerId ?? null);
  const { data: myOrders = [] } = useQuery<PrintOrderWithParties[]>({
    queryKey: ["/api/print/orders"],
    enabled: !readOnly && user?.role === "CAFE_OWNER",
  });
  const createReview = useCreatePrintReview();
  const reportPrinter = useReportPrinter();

  const faved = useFavorites((s) => (service ? !!s.print[String(service.id)] : false));
  const togglePrint = useFavorites((s) => s.togglePrint);

  const [reviewOrderId, setReviewOrderId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [messaging, setMessaging] = useState(false);

  // Review eligibility mirrors the exact server rule (POST /api/print/reviews): one
  // review per DELIVERED printOrder placed with this printer.
  const eligibleOrders = useMemo(
    () => myOrders.filter((o) => service && o.printerId === service.printerId && o.status === "DELIVERED"),
    [myOrders, service]
  );
  const myReviewByOrder = useMemo(() => {
    const map = new Map<number, (typeof reviews)[number]>();
    for (const r of reviews) if (r.cafeId === user?.id && r.printOrderId != null) map.set(r.printOrderId, r);
    return map;
  }, [reviews, user?.id]);
  const activeOrderId = reviewOrderId ?? eligibleOrders.find((o) => !myReviewByOrder.has(o.id))?.id ?? eligibleOrders[0]?.id ?? null;
  const existingReview = activeOrderId ? myReviewByOrder.get(activeOrderId) : undefined;

  const handleClose = () => {
    setReviewOrderId(null);
    setReportModalOpen(false);
    setReportReason("");
    onClose();
  };

  const handleMessage = async () => {
    if (!service || readOnly) return;
    setMessaging(true);
    try {
      const res = await startPrintConversation(service.printerId);
      navigate(`/cafe/messages?service=PRINT&conversationId=${res.conversation.id}`);
      handleClose();
    } catch (err: any) {
      toast({ title: "Contact impossible", description: err?.message ?? "Veuillez réessayer.", variant: "destructive" });
    } finally {
      setMessaging(false);
    }
  };

  const submitReview = () => {
    if (!service || !activeOrderId || readOnly) return;
    createReview.mutate(
      { printerId: service.printerId, printOrderId: activeOrderId, rating: reviewRating, comment: reviewComment.trim() || undefined },
      {
        onSuccess: () => { toast({ title: "Avis envoyé" }); setReviewComment(""); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  const submitReport = () => {
    if (!service || !reportReason.trim() || readOnly) return;
    reportPrinter.mutate(
      { printerId: service.printerId, reason: reportReason.trim() },
      {
        onSuccess: () => { toast({ title: "Signalement envoyé", description: "L'équipe Admin va l'examiner." }); setReportModalOpen(false); setReportReason(""); },
        onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className={`sm:max-w-2xl rounded-2xl border-0 shadow-2xl max-h-[90vh] overflow-y-auto p-0 [&>button]:hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600 ${t.modalBg}`}>
        <VisuallyHidden><DialogTitle>{service?.name ?? "Service"}</DialogTitle></VisuallyHidden>
        {isLoading || !service ? (
          <div className="p-6 space-y-4">
            <Skeleton className={`h-24 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
            <Skeleton className={`h-40 w-full rounded-2xl ${isDark ? "bg-gray-800" : ""}`} />
          </div>
        ) : (
          <div className="flex flex-col">
            <div className={`w-full h-56 sm:h-72 relative shrink-0 rounded-t-2xl overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src={service.imageUrl ?? undefined} alt={service.name} className="object-cover" />
                <AvatarFallback className="rounded-none bg-gradient-to-br from-blue-600 to-cyan-700">
                  <Package className="w-16 h-16 text-white" />
                </AvatarFallback>
              </Avatar>
              <div className="absolute top-3 right-3 flex gap-2">
                <button
                  className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"
                  onClick={() => { if (!readOnly) togglePrint({ id: String(service.id), name: service.name, brand: service.printerName, price: service.priceInCents, priceUnit: service.unit, image: service.imageUrl ?? "" }); }}
                  data-testid={`button-fav-print-service-${service.id}`}
                >
                  <Heart className={`w-4 h-4 ${faved ? "fill-rose-400 text-rose-400" : "text-white"}`} />
                </button>
                <button className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center" onClick={handleClose} data-testid="button-close-print-service-modal">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button onClick={() => { if (!readOnly) setReportModalOpen(true); }} title="Signaler" data-testid="button-open-print-service-report" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:scale-105 transition-transform"><Flag className="w-4 h-4 text-white" /></button>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              <div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {service.category && <Badge className={`text-[10px] border-0 px-1.5 ${isDark ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"}`}>{service.category}</Badge>}
                  {service.subCategory && <Badge variant="outline" className={`text-[10px] ${isDark ? "border-gray-700 text-gray-300" : ""}`}>{service.subCategory}</Badge>}
                </div>
                <h2 className={`font-bold text-xl leading-tight ${t.textPrimary}`}>{service.name}</h2>
                {service.description && <p className={`text-sm leading-relaxed mt-1.5 ${t.textMuted}`}>{service.description}</p>}
                <div className={`flex items-center gap-3 mt-2.5 text-xs flex-wrap ${t.textMuted}`}>
                  {service.reviewCount > 0 ? (
                    <span className="flex items-center gap-1 text-amber-500"><Star className="w-3 h-3 fill-amber-400" /> {(service.rating / 10).toFixed(1)} ({service.reviewCount} avis)</span>
                  ) : (
                    <span>Aucun avis</span>
                  )}
                  {service.printerLocation && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {service.printerLocation}</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textMuted}`}>Prix</p>
                  <p className="font-bold text-blue-600">{fmt(service.priceInCents)} <span className={`text-[10px] font-normal ${t.textMuted}`}>/{service.unit}</span></p>
                </div>
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textMuted} flex items-center gap-1`}><Clock className="w-3 h-3" /> Délai de production</p>
                  <p className={`font-bold ${t.textPrimary}`}>{service.productionTimeDays} j</p>
                </div>
                <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                  <p className={`text-[11px] ${t.textMuted}`}>Quantité minimum</p>
                  <p className={`font-bold ${t.textPrimary}`}>{service.minQuantity} {service.unit}(s)</p>
                </div>
                {service.materials.length > 0 && (
                  <div className={`p-3 rounded-xl ${t.sectionBg}`}>
                    <p className={`text-[11px] ${t.textMuted}`}>Matières</p>
                    <p className={`font-medium text-xs mt-0.5 ${t.textPrimary}`}>{service.materials.join(", ")}</p>
                  </div>
                )}
              </div>

              {/* Imprimerie — clicking opens the same real PRINT Company Details Modal used
                  everywhere a printing company is shown (Business → Profil → Aperçu, Admin PRINT). */}
              <button
                type="button"
                onClick={() => onOpenCompany?.(service.printerId)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${t.border} ${isDark ? "hover:border-blue-600" : "hover:border-blue-300"} ${t.sectionBgAlt}`}
                data-testid="button-open-print-company"
              >
                <p className={`text-xs font-semibold mb-2 flex items-center gap-1 ${t.textMuted}`}><Layers className="w-3.5 h-3.5" /> Imprimerie</p>
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 shrink-0">
                    <AvatarImage src={getAvatarUrl({ profileImageUrl: service.printerImageUrl })} alt={service.printerName} />
                    <AvatarFallback className="bg-blue-100 text-blue-700 font-bold text-sm">
                      <Printer className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className={`font-semibold text-sm truncate ${t.textPrimary}`}>{service.printerName}</p>
                    {service.printerLocation && <p className={`text-xs flex items-center gap-1 ${t.textMuted}`}><MapPin className="w-3 h-3" /> {service.printerLocation}</p>}
                  </div>
                </div>
              </button>

              {/* Reviews — real order-based reviews, tied to the printer (not per-service),
                  same data the Company modal shows. */}
              <div>
                <p className={`text-xs font-semibold mb-1.5 ${t.textMuted}`}>Avis ({reviews.length})</p>
                {reviews.length === 0 ? (
                  <p className={`text-xs ${t.textMuted}`}>Aucun avis pour le moment.</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {reviews.map((r) => (
                      <div key={r.id} className={`p-2.5 rounded-lg text-sm ${t.sectionBgAlt}`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-medium text-xs ${t.textPrimary}`}>{r.cafeOwnerName || r.cafeName}</span>
                          <span className="flex items-center gap-0.5 text-amber-500 text-xs"><Star className="w-3 h-3 fill-amber-400" /> {r.rating}</span>
                        </div>
                        {r.comment && <p className={`text-xs mt-1 ${t.textMuted}`}>{r.comment}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {!readOnly && eligibleOrders.length > 0 && (
                  <div className={`mt-3 p-3 rounded-xl border space-y-2 ${t.border}`}>
                    <p className={`text-xs font-medium ${t.textPrimary}`}>{existingReview ? "Modifier votre avis" : "Laisser un avis"}</p>
                    {eligibleOrders.length > 1 && (
                      <select
                        className={`w-full text-xs rounded-lg border px-2 py-1.5 ${t.inputBg}`}
                        value={activeOrderId ?? ""}
                        onChange={(e) => setReviewOrderId(Number(e.target.value))}
                        data-testid="select-review-order"
                      >
                        {eligibleOrders.map((o) => (
                          <option key={o.id} value={o.id}>Commande #{o.id} {myReviewByOrder.has(o.id) ? "(déjà notée)" : ""}</option>
                        ))}
                      </select>
                    )}
                    <StarPicker value={existingReview?.rating ?? reviewRating} onChange={setReviewRating} />
                    <Textarea
                      placeholder="Commentaire (facultatif)"
                      rows={2}
                      defaultValue={existingReview?.comment ?? ""}
                      onChange={(e) => setReviewComment(e.target.value)}
                      className={t.inputBg}
                      data-testid="input-review-comment"
                    />
                    <Button size="sm" onClick={submitReview} disabled={createReview.isPending} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-submit-review">
                      {createReview.isPending ? "Envoi…" : existingReview ? "Mettre à jour l'avis" : "Envoyer l'avis"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className={`p-5 sm:p-6 pt-0 flex flex-wrap gap-2 justify-end border-t mt-1 pt-4 ${t.border}`}>
              <Button variant="outline" size="sm" className={`gap-1.5 ${t.textPrimary} ${isDark ? "border-gray-700" : ""}`} onClick={handleMessage} disabled={messaging} data-testid="button-message-print-service">
                <MessageCircle className="w-3.5 h-3.5" /> Message
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                onClick={() => { if (!readOnly) { navigate(`/print/${service.id}`); handleClose(); } }}
                data-testid="button-order-print-service"
              >
                <ShoppingCart className="w-3.5 h-3.5" /> Commander
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <Dialog open={reportModalOpen} onOpenChange={(v) => { if (!v) { setReportModalOpen(false); setReportReason(""); } }}>
      <DialogContent className={`sm:max-w-md ${t.modalBg}`}>
        <VisuallyHidden><DialogTitle>Signaler {service?.printerName ?? ""}</DialogTitle></VisuallyHidden>
        <div className="space-y-2">
          <p className={`text-sm font-medium ${isDark ? "text-red-400" : "text-red-700"}`}>Signaler {service?.printerName}</p>
          <Textarea placeholder="Décrivez le problème…" rows={3} value={reportReason} onChange={(e) => setReportReason(e.target.value)} className={t.inputBg} data-testid="input-report-reason" />
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="ghost" className={t.textPrimary} onClick={() => { setReportModalOpen(false); setReportReason(""); }}>Annuler</Button>
            <Button size="sm" variant="destructive" onClick={submitReport} disabled={!reportReason.trim() || reportPrinter.isPending} data-testid="button-submit-report">
              {reportPrinter.isPending ? "Envoi…" : "Envoyer le signalement"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
