import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MapPin, ShoppingBag, Star } from "lucide-react";

const fakeCafes = [
  { id: 1, name: "Ariana Lounge", owner: "Mounir Rezgui", location: "Ariana, Tunisia", orders: 14, spent: 1840, rating: 4.8, status: "Active" },
  { id: 2, name: "Cafe des Nattes", owner: "Asma Belhaj", location: "Sidi Bou Saïd, Tunisia", orders: 9, spent: 1240, rating: 4.6, status: "Active" },
  { id: 3, name: "Saffron Lounge", owner: "Khalil Mzoughi", location: "Tunis Centre, Tunisia", orders: 6, spent: 820, rating: 4.5, status: "Active" },
  { id: 4, name: "The Brew Lab", owner: "Donia Ferchichi", location: "La Marsa, Tunisia", orders: 4, spent: 560, rating: 4.3, status: "Active" },
  { id: 5, name: "Central Perk", owner: "Nabil Cherif", location: "Tunis, Tunisia", orders: 3, spent: 420, rating: 4.7, status: "Active" },
  { id: 6, name: "Latte Art Cafe", owner: "Sara Mansouri", location: "Sousse, Tunisia", orders: 1, spent: 95, rating: 4.0, status: "New" },
];

const statusStyle: Record<string, string> = {
  Active: "bg-green-100 text-green-700",
  New: "bg-blue-100 text-blue-700",
};

export default function CafesPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cafes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your café customers and their activity.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fakeCafes.map((c) => (
          <Card key={c.id} className="flex flex-col">
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">{c.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-sm text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.owner}</p>
                  </div>
                </div>
                <Badge variant="secondary" className={statusStyle[c.status]}>{c.status}</Badge>
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1 border-t border-border/40">
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {c.location}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">Orders</p>
                  <p className="font-bold text-sm">{c.orders}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">Spent</p>
                  <p className="font-bold text-sm text-amber-500">TND {c.spent}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">Rating</p>
                  <p className="font-bold text-sm flex items-center justify-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{c.rating}</p>
                </div>
              </div>

              <Button size="sm" variant="outline" className="w-full" data-testid={`button-view-cafe-${c.id}`}>View Orders</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
