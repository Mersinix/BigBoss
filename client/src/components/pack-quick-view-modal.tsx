import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, Minus, Plus, Package, Heart } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { usePackQuickView } from "@/hooks/use-pack-quick-view";
import { useCart } from "@/hooks/use-cart";
import { useFavorites } from "@/hooks/use-favorites";
import { useToast } from "@/hooks/use-toast";
import type { PackDetail } from "@shared/schema";

export function PackQuickViewModal() {
  const packId = usePackQuickView((s) => s.packId);
  const close = usePackQuickView((s) => s.close);
  const [qty, setQty] = useState(1);
  const { toast } = useToast();
  const addPackItem = useCart((s) => s.addPackItem);
  const faved = useFavorites((s) => (packId != null ? !!s.pack[packId] : false));
  const togglePack = useFavorites((s) => s.togglePack);

  const { data: pack, isLoading } = useQuery<PackDetail>({
    queryKey: ["/api/marketplace/packs", packId],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/packs/${packId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: packId != null,
  });

  useEffect(() => { setQty(1); }, [packId]);

  const individualTotal = pack ? pack.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) : 0;
  const maxQty = pack ? Math.min(pack.quantityAvailable, pack.maxBuildable) : 0;

  const handleAddToCart = () => {
    if (!pack) return;
    addPackItem({
      packId: pack.id,
      packName: pack.name,
      packImageUrl: pack.imageUrl ?? null,
      supplierId: pack.supplierId,
      supplierName: pack.supplierName,
      unitPrice: pack.price,
      includedProducts: pack.items.map((i) => ({
        productName: i.productName,
        flavorName: i.flavorName,
        sizeName: i.sizeName,
        quantity: i.quantity,
      })),
    }, qty);
    toast({ title: "Ajouté au panier", description: `${pack.name} × ${qty}` });
    close();
  };

  return (
    <Dialog open={packId != null} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-w-2xl w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto" data-testid="modal-pack-quick-view">
        <VisuallyHidden>
          <DialogTitle>Pack Details</DialogTitle>
        </VisuallyHidden>
        {isLoading || !pack ? (
          <div className="space-y-4 p-2">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative aspect-[16/9] bg-gray-50 rounded-xl overflow-hidden">
              {pack.imageUrl ? (
                <img src={pack.imageUrl} alt={pack.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Layers className="w-14 h-14 text-gray-200" /></div>
              )}
              <button
                className="absolute top-3 right-3 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                onClick={() => togglePack(pack.id)}
                data-testid="button-fav-pack-modal"
              >
                <Heart className={`w-4 h-4 transition-colors ${faved ? "fill-rose-500 text-rose-500" : "text-gray-400"}`} />
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] font-semibold"><Layers className="w-3 h-3 mr-1 inline" />Pack</Badge>
                {pack.categoryLabels.map((c) => <Badge key={c.id} variant="outline" className="text-[10px]">{c.name}</Badge>)}
              </div>
              <h2 className="font-bold text-xl text-gray-900" data-testid="text-pack-name">{pack.name}</h2>
              <p className="text-sm text-gray-500 mt-1">{pack.supplierName}</p>
              {pack.description && <p className="text-sm text-gray-500 mt-2">{pack.description}</p>}
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-amber-600" data-testid="text-pack-price">{formatCurrency(pack.price)}</span>
              {individualTotal > pack.price && (
                <span className="text-sm text-gray-400 line-through">{formatCurrency(individualTotal)}</span>
              )}
              <span className="text-xs text-gray-400">{maxQty} disponible{maxQty !== 1 ? "s" : ""}</span>
            </div>

            <div className="border border-gray-100 rounded-xl divide-y divide-gray-100">
              {pack.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-50 overflow-hidden shrink-0 flex items-center justify-center">
                    {item.productImageUrl ? <img src={item.productImageUrl} className="w-full h-full object-cover" alt="" /> : <Package className="w-4 h-4 text-gray-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.productName}</p>
                    {(item.flavorName || item.sizeName) && (
                      <p className="text-xs text-gray-400">{[item.flavorName, item.sizeName].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-gray-500 shrink-0">×{item.quantity}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button className="px-3 py-2 hover:bg-gray-50 transition-colors" onClick={() => setQty((q) => Math.max(1, q - 1))} data-testid="button-decrease-pack-qty"><Minus className="w-3.5 h-3.5" /></button>
                <span className="px-4 text-sm font-medium w-10 text-center">{qty}</span>
                <button className="px-3 py-2 hover:bg-gray-50 transition-colors" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} data-testid="button-increase-pack-qty"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <Button className="flex-1" disabled={maxQty === 0} onClick={handleAddToCart} data-testid="button-add-pack-to-cart">
                Ajouter au panier · {formatCurrency(pack.price * qty)}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
