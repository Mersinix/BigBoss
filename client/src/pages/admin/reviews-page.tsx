import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Star, Loader2, Package, Store, Wrench, Flag, Trash2, CheckCircle2, AlertTriangle, Layers, Coffee, GraduationCap, Truck, Printer, Megaphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { invalidateMarketplace } from "@/lib/invalidate-marketplace";

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d as any).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Central review moderation switcher — every real review domain in the app maps here.
// One domain (reviewType) ↔ one existing table row shape, all served by the same already
// generic GET/DELETE/PATCH-resolve /api/admin/reviews* endpoints (storage.getAllReviews/
// deleteReview/resolveReviewReport) — no per-domain moderation system. Barista/Academy/
// Print/Delivery target names are resolved server-side onto `targetName` (see
// storage.getAllReviews) so this page never needs a second per-domain lookup.
const TABS = [
  { key: "PRODUCT", label: "Product", icon: Package },
  { key: "PACK", label: "Pack", icon: Layers },
  { key: "SUPPLIER", label: "Supplier", icon: Store },
  { key: "MAINTENANCE", label: "Maintenance", icon: Wrench },
  { key: "BARISTA_MARKETPLACE", label: "Barista", icon: Coffee },
  { key: "ACADEMY", label: "Academy", icon: GraduationCap },
  { key: "DRIVER", label: "Delivery", icon: Truck },
  { key: "PRINT", label: "Print", icon: Printer },
  { key: "MARKETING", label: "Marketing", icon: Megaphone },
] as const;
type ReviewType = (typeof TABS)[number]["key"];

const TARGET_LABEL: Record<ReviewType, string> = {
  PRODUCT: "Product", PACK: "Pack", SUPPLIER: "Supplier", MAINTENANCE: "Maintenance",
  BARISTA_MARKETPLACE: "Barista", ACADEMY: "Academy", DRIVER: "Driver", PRINT: "Printer", MARKETING: "Marketing provider",
};

export default function AdminReviewsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ReviewType>("PRODUCT");
  const [showReportedOnly, setShowReportedOnly] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const { data: reviews = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/reviews", activeTab],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reviews?reviewType=${activeTab}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/reviews/${id}?reviewType=${activeTab}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/reviews"] });
      invalidateMarketplace(qc);
      toast({ title: "Review deleted" });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "Error deleting review", variant: "destructive" }),
  });

  const resolveMut = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/admin/reviews/${id}/resolve?reviewType=${activeTab}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/reviews"] });
      toast({ title: "Report resolved" });
    },
    onError: () => toast({ title: "Error resolving report", variant: "destructive" }),
  });

  const displayed = showReportedOnly ? reviews.filter((r: any) => !!r.reportedAt) : reviews;
  const reportedCount = reviews.filter((r: any) => !!r.reportedAt && !r.resolvedAt).length;

  const avg = reviews.length ? (reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length).toFixed(1) : "—";

  const targetLine = (r: any) => {
    if (activeTab === "PRODUCT" && r.productName) return { label: "Product", value: r.productName };
    if (activeTab === "PACK" && (r.productName || r.packId)) return { label: "Pack", value: r.productName || `#${r.packId}` };
    if (activeTab === "SUPPLIER" && r.supplierId) return { label: "Supplier ID", value: `#${r.supplierId}` };
    if (r.targetName) return { label: TARGET_LABEL[activeTab], value: r.targetName };
    return null;
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Reviews</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage all reviews across the platform from one place.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3"><Star className="w-5 h-5 text-amber-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Average Rating</p>
              <p className="text-2xl font-bold">{avg}{reviews.length > 0 ? " / 5" : ""}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><Star className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Reviews</p>
              <p className="text-2xl font-bold">{reviews.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className={`rounded-xl p-3 ${reportedCount > 0 ? "bg-orange-500/10" : "bg-green-500/10"}`}>
              <Flag className={`w-5 h-5 ${reportedCount > 0 ? "text-orange-500" : "text-green-600"}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending Reports</p>
              <p className="text-2xl font-bold">{reportedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs — horizontally scrollable, same responsive treatment as Admin Barista's
          switcher (task requirement), since 9 tabs no longer fit on narrow screens. */}
      <div className="flex gap-1 rounded-xl p-1 bg-secondary/50 overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setShowReportedOnly(false); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all shrink-0 whitespace-nowrap ${
              activeTab === tab.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-admin-reviews-${tab.key.toLowerCase()}`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
          <input
            type="checkbox"
            checked={showReportedOnly}
            onChange={(e) => setShowReportedOnly(e.target.checked)}
            className="rounded"
          />
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            Show reported only
            {reportedCount > 0 && (
              <Badge className="bg-orange-500 text-white border-0 text-xs ml-1">{reportedCount}</Badge>
            )}
          </span>
        </label>
      </div>

      {/* Review list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-2xl border border-border/50 p-16 text-center text-muted-foreground">
          <Star className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No reviews found</p>
          <p className="text-sm mt-1">{showReportedOnly ? "No reported reviews in this category." : "No reviews yet."}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayed.map((r: any) => {
            const isReported = !!r.reportedAt;
            const isResolved = !!r.resolvedAt;
            const target = targetLine(r);
            return (
              <Card key={r.id} className={isReported && !isResolved ? "border-orange-200 dark:border-orange-900" : ""}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <Avatar className="w-9 h-9 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                        {(r.cafeOwnerName || r.cafeName || "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between flex-wrap gap-2 mb-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm">{r.cafeOwnerName || r.cafeName || "—"}</span>
                          {isReported && !isResolved && (
                            <Badge variant="outline" className="text-xs border-orange-300 text-orange-600 bg-orange-50 dark:bg-orange-950/30">
                              <Flag className="w-3 h-3 mr-1" /> Reported
                            </Badge>
                          )}
                          {isResolved && (
                            <Badge variant="outline" className="text-xs border-green-300 text-green-600 bg-green-50 dark:bg-green-950/30">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Resolved
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                      </div>
                      {target && (
                        <p className="text-xs text-muted-foreground mb-1.5">
                          {target.label}: <span className="font-medium text-foreground">{target.value}</span>
                        </p>
                      )}
                      <Stars rating={r.rating} />
                      {r.comment && (
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{r.comment}</p>
                      )}
                      {isReported && r.reportReason && (
                        <div className="mt-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 p-3">
                          <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-1 flex items-center gap-1">
                            <Flag className="w-3 h-3" /> Report reason
                          </p>
                          <p className="text-xs text-orange-600 dark:text-orange-400">{r.reportReason}</p>
                          <p className="text-xs text-muted-foreground mt-1">Reported on {formatDate(r.reportedAt)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 justify-end">
                    {isReported && !isResolved && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-950/30"
                        onClick={() => resolveMut.mutate(r.id)}
                        disabled={resolveMut.isPending}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Resolve Report
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(r.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this review?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the review. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
