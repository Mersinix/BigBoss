import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tag, Plus, Calendar } from "lucide-react";

const fakePromos = [
  { id: 1, title: "Spring Coffee Sale", discount: "15%", applies: "All Coffee Beans", start: "Apr 1, 2026", end: "Apr 30, 2026", status: "Active", uses: 18 },
  { id: 2, title: "New Customer Deal", discount: "10%", applies: "First Order", start: "Mar 1, 2026", end: "Jun 30, 2026", status: "Active", uses: 5 },
  { id: 3, title: "Bulk Buy Bonus", discount: "20%", applies: "Orders > TND 200", start: "Feb 1, 2026", end: "Mar 31, 2026", status: "Expired", uses: 22 },
  { id: 4, title: "Ramadan Special", discount: "12%", applies: "All Products", start: "Mar 10, 2026", end: "Mar 30, 2026", status: "Expired", uses: 31 },
];

const statusStyle: Record<string, string> = {
  Active: "bg-green-100 text-green-700",
  Expired: "bg-gray-100 text-gray-600",
  Scheduled: "bg-blue-100 text-blue-700",
};

export default function PromotionsPage() {
  const [promos] = useState(fakePromos);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Promotions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage promotional campaigns and offers.</p>
        </div>
        <Button size="sm" data-testid="button-create-promo"><Plus className="w-4 h-4 mr-1" /> Create Promotion</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Active", value: promos.filter(p => p.status === "Active").length },
          { label: "Expired", value: promos.filter(p => p.status === "Expired").length },
          { label: "Total Uses", value: promos.reduce((s, p) => s + p.uses, 0) },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-primary/10 rounded-xl p-3"><Tag className="w-5 h-5 text-primary" /></div>
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        {promos.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4">
                  <div className="bg-amber-500/10 rounded-xl p-3 shrink-0">
                    <Tag className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{p.title}</p>
                      <Badge variant="secondary" className={statusStyle[p.status]}>{p.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{p.applies} · <span className="text-amber-500 font-semibold">{p.discount} off</span></p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {p.start} — {p.end}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.uses} uses</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" data-testid={`button-edit-promo-${p.id}`}>Edit</Button>
                  {p.status === "Active" && (
                    <Button size="sm" variant="outline" className="text-destructive" data-testid={`button-deactivate-promo-${p.id}`}>Deactivate</Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
