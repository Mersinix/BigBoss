import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Star, Loader2, Package, Store, Flag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { SupplierProductReview } from "@shared/schema";

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

function formatDate(d: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ReportDialog({ open, onClose, reviewId }: { open: boolean; onClose: () => void; reviewId: number }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");

  const report = useMutation({
    mutationFn: () => apiRequest("POST", `/api/reviews/${reviewId}/report`, { reason }),
    onSuccess: () => {
      toast({ title: "Review reported", description: "The admin will review your report." });
      setReason("");
      onClose();
    },
    onError: () => toast({ title: "Error reporting review", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setReason(""); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report Inappropriate Review</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Describe why this review is inappropriate. The admin will review your report before taking action.</p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Contains false information, offensive language…"
            rows={3}
            className="resize-none"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => report.mutate()}
            disabled={!reason.trim() || report.isPending}
            variant="destructive"
          >
            {report.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewCard({ review, onReport }: { review: SupplierProductReview & { categoryName?: string; subCategoryName?: string }; onReport: (id: number) => void }) {
  const isReported = !!(review as any).reportedAt;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <Avatar className="w-9 h-9 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
              {review.cafeName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">{review.cafeName}</span>
                {isReported && <Badge variant="outline" className="text-xs border-orange-300 text-orange-600 bg-orange-50 dark:bg-orange-950/30">Reported</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-muted-foreground hover:text-destructive"
                  onClick={() => onReport(review.id)}
                  disabled={isReported}
                  title={isReported ? "Already reported" : "Report this review"}
                >
                  <Flag className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            {review.productName && (
              <p className="text-xs text-muted-foreground mb-1.5">
                Product: <span className="font-medium text-foreground">{review.productName}</span>
              </p>
            )}
            <Stars rating={review.rating} />
            {review.comment && (
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{review.comment}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type ReviewTab = "products" | "supplier";

export default function ReviewsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ReviewTab>("products");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subCategoryFilter, setSubCategoryFilter] = useState("");
  const [reportTarget, setReportTarget] = useState<number | null>(null);

  const { data: productReviews = [], isLoading: loadingProduct } = useQuery<SupplierProductReview[]>({
    queryKey: ["/api/supplier/reviews/products"],
    queryFn: async () => {
      const res = await fetch("/api/supplier/reviews/products");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id,
  });

  const { data: supplierReviews = [], isLoading: loadingSupplier } = useQuery<SupplierProductReview[]>({
    queryKey: ["/api/supplier/reviews/supplier"],
    queryFn: async () => {
      const res = await fetch("/api/supplier/reviews/supplier");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id,
  });

  // Fetch categories and sub-categories for filtering
  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/categories"],
    queryFn: async () => {
      const res = await fetch("/api/admin/categories");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: subCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/subcategories"],
    queryFn: async () => {
      const res = await fetch("/api/admin/subcategories");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Filter product reviews by category/subCategory via product association
  const { data: products = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/products"],
    queryFn: async () => {
      const res = await fetch("/api/admin/products");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === "products" && (!!categoryFilter || !!subCategoryFilter),
  });

  const filteredProductReviews = productReviews.filter((r) => {
    if (!categoryFilter && !subCategoryFilter) return true;
    const prod = products.find((p: any) => p.id === r.productId);
    if (!prod) return false;
    if (categoryFilter && String(prod.categoryId) !== categoryFilter) return false;
    if (subCategoryFilter && String(prod.subCategoryId) !== subCategoryFilter) return false;
    return true;
  });

  const filteredSubs = categoryFilter
    ? subCategories.filter((s: any) => String(s.categoryId) === categoryFilter)
    : subCategories;

  const isLoading = activeTab === "products" ? loadingProduct : loadingSupplier;
  const reviews = activeTab === "products" ? filteredProductReviews : supplierReviews;

  // Stats
  const productAvg = productReviews.length
    ? (productReviews.reduce((s, r) => s + r.rating, 0) / productReviews.length).toFixed(1)
    : "—";
  const supplierAvg = supplierReviews.length
    ? (supplierReviews.reduce((s, r) => s + r.rating, 0) / supplierReviews.length).toFixed(1)
    : "—";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reviews</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Customer feedback on your products and service.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3"><Star className="w-5 h-5 text-amber-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Product Avg Rating</p>
              <p className="text-2xl font-bold">{productAvg}{productReviews.length > 0 ? " / 5" : ""}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><Package className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Product Reviews</p>
              <p className="text-2xl font-bold">{productReviews.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><Store className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Supplier Reviews ({supplierAvg}{supplierReviews.length > 0 ? " / 5" : ""})</p>
              <p className="text-2xl font-bold">{supplierReviews.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl p-1 bg-secondary/50 w-fit">
        <button
          onClick={() => setActiveTab("products")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === "products"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Package className="w-4 h-4" /> Product Reviews
          {productReviews.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === "products" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              {productReviews.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("supplier")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === "supplier"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Store className="w-4 h-4" /> Supplier Reviews
          {supplierReviews.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === "supplier" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              {supplierReviews.length}
            </span>
          )}
        </button>
      </div>

      {/* Product Reviews filter bar */}
      {activeTab === "products" && (
        <div className="flex flex-wrap gap-3">
          <Select value={categoryFilter || "__all__"} onValueChange={v => { setCategoryFilter(v === "__all__" ? "" : v); setSubCategoryFilter(""); }}>
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Categories</SelectItem>
              {categories.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={subCategoryFilter || "__all__"} onValueChange={v => setSubCategoryFilter(v === "__all__" ? "" : v)} disabled={!categoryFilter}>
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue placeholder={categoryFilter ? "All Sub-categories" : "Pick category first"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Sub-categories</SelectItem>
              {filteredSubs.map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(categoryFilter || subCategoryFilter) && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => { setCategoryFilter(""); setSubCategoryFilter(""); }}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Review list */}
      {reviews.length === 0 ? (
        <div className="rounded-2xl border border-border/50 p-16 text-center text-muted-foreground">
          <Star className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No reviews yet</p>
          <p className="text-sm mt-1">
            {activeTab === "products"
              ? "Product reviews from cafe owners will appear here."
              : "Supplier reviews from cafe owners will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r as any} onReport={setReportTarget} />
          ))}
        </div>
      )}

      {/* Report dialog */}
      <ReportDialog
        open={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        reviewId={reportTarget ?? 0}
      />
    </div>
  );
}
