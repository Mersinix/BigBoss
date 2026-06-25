import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Package, Trash2 } from "lucide-react";
import { useState } from "react";

const initialFavorites = [
  {
    id: 1,
    type: "product" as const,
    name: "Espresso Roast 1kg",
    supplier: "Premium Beans Co",
    price: 2500,
    category: "Coffee Beans",
    image: "https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=400&q=80",
  },
  {
    id: 2,
    type: "product" as const,
    name: "Oat Milk 1L x 6",
    supplier: "Oat & Grain Supply",
    price: 1800,
    category: "Dairy Alternatives",
    image: "https://images.unsplash.com/photo-1600788886242-5c96aabe3757?w=400&q=80",
  },
  {
    id: 3,
    type: "supplier" as const,
    name: "TunRoast",
    supplier: "Tunis, Tunisia",
    price: 0,
    category: "Roasted Coffee",
    image: "https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=400&q=80",
  },
  {
    id: 4,
    type: "product" as const,
    name: "Cold Brew Concentrate 5L",
    supplier: "Arabica Direct",
    price: 4200,
    category: "Ready-to-Drink",
    image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&q=80",
  },
];

export default function FavoritesPage() {
  const [items, setItems] = useState(initialFavorites);

  const remove = (id: number) => setItems((prev) => prev.filter((f) => f.id !== id));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Favorites</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your saved products and suppliers.</p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No favorites yet</p>
          <p className="text-sm mt-1">Star products or suppliers to save them here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <Card key={item.id} className="group overflow-hidden flex flex-col">
              <div className="relative h-40 overflow-hidden bg-muted">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <button
                  data-testid={`button-remove-fav-${item.id}`}
                  onClick={() => remove(item.id)}
                  className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
                <Badge
                  variant="secondary"
                  className="absolute top-2 left-2 text-[10px] bg-background/80 backdrop-blur-sm"
                >
                  {item.type === "supplier" ? "Supplier" : "Product"}
                </Badge>
              </div>
              <CardContent className="p-4 flex flex-col gap-2 flex-1">
                <p className="font-semibold text-sm text-foreground leading-snug">{item.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Package className="w-3 h-3" /> {item.supplier}
                </p>
                <Badge variant="outline" className="text-xs w-fit">{item.category}</Badge>
                {item.type === "product" && (
                  <p className="text-sm font-bold text-amber-500 mt-auto">TND {(item.price / 100).toFixed(2)}</p>
                )}
                <Button size="sm" variant="outline" className="w-full mt-1" data-testid={`button-order-fav-${item.id}`}>
                  {item.type === "supplier" ? "View Supplier" : "Add to Cart"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
