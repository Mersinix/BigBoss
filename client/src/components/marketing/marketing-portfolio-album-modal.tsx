import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { ChevronRight, X } from "lucide-react";

// Portfolio lightbox (Part 9) — a standalone album view over the same real
// `portfolioImages` array the marketplace card/detail modal already use. No
// separate media store, no padding with fake images: an empty array just
// never opens this modal (guarded by the caller).
export function MarketingPortfolioAlbumModal({
  open,
  onClose,
  images,
  initialIndex = 0,
  providerName,
}: {
  open: boolean;
  onClose: () => void;
  images: string[];
  initialIndex?: number;
  providerName: string;
}) {
  const [idx, setIdx] = useState(initialIndex);

  useEffect(() => {
    if (open) setIdx(initialIndex);
  }, [open, initialIndex]);

  if (images.length === 0) return null;

  const goPrev = () => setIdx((i) => (i === 0 ? images.length - 1 : i - 1));
  const goNext = () => setIdx((i) => (i + 1) % images.length);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 border-0 w-[92vw] max-w-2xl h-[80vh] rounded-3xl bg-black overflow-hidden [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Portfolio — {providerName}</DialogTitle></VisuallyHidden>
        <div className="relative w-full h-full flex items-center justify-center select-none">
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-4 pb-3 bg-gradient-to-b from-black/70 to-transparent">
            <span className="text-white/80 text-xs font-medium">{idx + 1} / {images.length}</span>
            <button
              className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center"
              onClick={onClose}
              data-testid="button-portfolio-album-close"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          <img
            key={idx}
            src={images[idx]}
            alt={`Portfolio ${providerName} ${idx + 1}`}
            className="max-w-full max-h-full w-auto h-auto object-contain"
          />

          {images.length > 1 && (
            <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3 z-20 pointer-events-none">
              <button
                onClick={goPrev}
                className="pointer-events-auto w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center active:scale-95 transition"
                data-testid="button-portfolio-album-prev"
              >
                <ChevronRight className="w-5 h-5 text-white rotate-180" />
              </button>
              <button
                onClick={goNext}
                className="pointer-events-auto w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center active:scale-95 transition"
                data-testid="button-portfolio-album-next"
              >
                <ChevronRight className="w-5 h-5 text-white" />
              </button>
            </div>
          )}

          {images.length > 1 && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 z-20">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? "bg-white w-4" : "bg-white/40"}`}
                  data-testid={`button-portfolio-album-dot-${i}`}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
