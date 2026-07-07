import { useState, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Heart, X, ChevronRight, Package, Zap } from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";
import type { ProductWithTaxonomy } from "@shared/schema";

type FlashProduct = ProductWithTaxonomy & { bestPrice?: number };

interface FlashModeProps {
  open: boolean;
  onClose: () => void;
  products: FlashProduct[];
  storeName: string;
}

export function FlashMode({ open, onClose, products, storeName }: FlashModeProps) {
  const [idx, setIdx] = useState(0);
  const [heartAnim, setHeartAnim] = useState(false);
  const lastTapRef = useRef<number>(0);

  const faved = useFavorites((s) => {
    const p = products[idx];
    return p ? !!s.shop[p.id] : false;
  });
  const toggleShop = useFavorites((s) => s.toggleShop);

  const current = products[idx];

  const goNext = useCallback(() => {
    setIdx((i) => (i + 1) % products.length);
    setHeartAnim(false);
  }, [products.length]);

  const handleFavorite = useCallback(() => {
    if (!current) return;
    toggleShop({
      id: current.id,
      name: current.name,
      supplier: (current.categoryLabel?.name ?? current.category ?? ""),
      price: (current as any).bestPrice ?? 0,
      image: current.imageUrl ?? "",
    });
    setHeartAnim(true);
    setTimeout(() => setHeartAnim(false), 800);
  }, [current, toggleShop]);

  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      handleFavorite();
    }
    lastTapRef.current = now;
  }, [handleFavorite]);

  if (!products.length) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
<DialogContent
  className="
    p-0
    border-0
    w-[92vw]
    max-w-lg
    h-[90vh]
    rounded-3xl
    bg-black
    overflow-hidden
  "
>      <div className="relative w-full h-full flex flex-col select-none overflow-hidden">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-safe pt-4 pb-3 bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span className="text-white font-bold text-sm">{storeName}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-white/60 text-xs">{idx + 1} / {products.length}</span>
              <button
                className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center"
                onClick={onClose}
                data-testid="button-flash-close"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="absolute top-0 left-0 right-0 z-30 flex gap-1 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 60px)" }}>
            {products.map((_, i) => (
              <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
                <div
                  className={`h-full bg-white transition-all duration-300 ${i < idx ? "w-full" : i === idx ? "w-full" : "w-0"}`}
                />
              </div>
            ))}
          </div>

          {/* Product image — tappable area for double-tap */}
          <div
            className="relative flex-1 bg-gray-900 overflow-hidden cursor-pointer"
            onClick={handleDoubleTap}
            data-testid="flash-product-image-area"
          >
            {current?.imageUrl ? (
              <img
                key={current.id}
                src={current.imageUrl}
                alt={current.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-20 h-20 text-gray-600" />
              </div>
            )}

            {/* Dark gradient overlay at bottom */}
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

            {/* Product info — overlaid on image */}
            <div className="absolute inset-x-0 bottom-0 px-5 pb-6 pointer-events-none">
              <h2 className="text-white font-bold text-xl leading-tight mb-1 line-clamp-2" data-testid="flash-product-name">
                {current?.name}
              </h2>
              <div className="flex flex-wrap gap-2 mt-2">
                {current?.categoryLabel?.name && (
                  <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">
                    {current.categoryLabel.name}
                  </span>
                )}
                {current?.subCategoryLabel?.name && (
                  <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">
                    {current.subCategoryLabel.name}
                  </span>
                )}
                {current?.brandLabel?.name && (
                  <span className="bg-amber-500/80 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">
                    {current.brandLabel.name}
                  </span>
                )}
              </div>
            </div>

            {/* Double-tap heart animation */}
            {heartAnim && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Heart className="w-24 h-24 fill-rose-500 text-rose-500 animate-ping opacity-80" />
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="absolute right-4 bottom-24 flex flex-col gap-4 z-20">
            {/* Favorite button */}
            <button
              className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${faved ? "bg-rose-500" : "bg-white/20 backdrop-blur-sm"}`}
              onClick={handleFavorite}
              data-testid="button-flash-favorite"
            >
              <Heart className={`w-5 h-5 transition-colors ${faved ? "fill-white text-white" : "text-white"}`} />
            </button>
          </div>

          {/* Next button */}
          <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-safe pb-6">
            <button
              className="w-full flex items-center justify-center gap-2 bg-white text-gray-900 font-bold py-3.5 rounded-2xl shadow-lg active:scale-98 transition-all"
              onClick={goNext}
              data-testid="button-flash-next"
            >
              {idx < products.length - 1 ? (
                <>Next <ChevronRight className="w-4 h-4" /></>
              ) : (
                <>Start Over <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
