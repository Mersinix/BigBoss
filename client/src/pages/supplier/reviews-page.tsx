import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Star, Loader2 } from "lucide-react";
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

export default function ReviewsPage() {
  const { user } = useAuth();

  const { data: reviews = [], isLoading } = useQuery<SupplierProductReview[]>({
    queryKey: ["/api/reviews/supplier", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/reviews/supplier/${user!.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id,
  });

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
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
        <p className="text-sm text-muted-foreground mt-0.5">Customer feedback on your products.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-amber-500/10 rounded-xl p-3"><Star className="w-5 h-5 text-amber-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Average Rating</p>
              <p className="text-2xl font-bold">{avgRating}{reviews.length > 0 ? " / 5" : ""}</p>
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
            <div className="bg-green-500/10 rounded-xl p-3"><Star className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">5-Star Reviews</p>
              <p className="text-2xl font-bold">{reviews.filter((r) => r.rating === 5).length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-2xl border border-border/50 p-16 text-center text-muted-foreground">
          <Star className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No reviews yet</p>
          <p className="text-sm mt-1">Reviews from cafe owners will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                      {r.cafeName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                      <div>
                        <span className="font-semibold text-sm text-foreground">{r.cafeName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                    </div>
                    {r.productName && (
                      <p className="text-xs text-muted-foreground mb-1.5">
                        Product: <span className="font-medium text-foreground">{r.productName}</span>
                      </p>
                    )}
                    <Stars rating={r.rating} />
                    {r.comment && (
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{r.comment}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
