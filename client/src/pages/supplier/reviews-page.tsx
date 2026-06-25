import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Star } from "lucide-react";

const fakeReviews = [
  { id: 1, cafe: "Ariana Lounge", owner: "Mounir R.", product: "Espresso Roast 1kg", rating: 5, comment: "Excellent quality! Our customers love the new espresso blend. Will definitely reorder.", date: "Apr 7, 2026" },
  { id: 2, cafe: "Cafe des Nattes", owner: "Asma B.", product: "Oat Milk 1L x 6", rating: 4, comment: "Great barista oat milk, perfect for flat whites. Delivery was a bit late.", date: "Apr 5, 2026" },
  { id: 3, cafe: "Saffron Lounge", owner: "Khalil M.", product: "Vanilla Syrup 1L", rating: 5, comment: "Amazing flavor, our latte sales doubled this month after switching to this syrup.", date: "Apr 2, 2026" },
  { id: 4, cafe: "The Brew Lab", owner: "Donia F.", product: "Cold Brew Concentrate 5L", rating: 3, comment: "Good taste but packaging was slightly damaged on arrival. Supplier was responsive.", date: "Mar 28, 2026" },
  { id: 5, cafe: "Central Perk", owner: "Nabil C.", product: "Decaf House Blend 500g", rating: 4, comment: "Solid decaf option. Our evening customers appreciate it. Good price point.", date: "Mar 20, 2026" },
];

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const avgRating = (fakeReviews.reduce((s, r) => s + r.rating, 0) / fakeReviews.length).toFixed(1);

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
              <p className="text-2xl font-bold">{avgRating} / 5</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-primary/10 rounded-xl p-3"><Star className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Reviews</p>
              <p className="text-2xl font-bold">{fakeReviews.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="bg-green-500/10 rounded-xl p-3"><Star className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">5-Star Reviews</p>
              <p className="text-2xl font-bold">{fakeReviews.filter((r) => r.rating === 5).length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {fakeReviews.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <Avatar className="w-9 h-9 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">{r.cafe.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                    <div>
                      <span className="font-semibold text-sm text-foreground">{r.cafe}</span>
                      <span className="text-xs text-muted-foreground ml-2">· {r.owner}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{r.date}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1.5">Product: <span className="font-medium text-foreground">{r.product}</span></p>
                  <Stars rating={r.rating} />
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{r.comment}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
