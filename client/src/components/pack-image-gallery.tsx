import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ImageOff, ChevronLeft, ChevronRight } from "lucide-react";

type PackImageGalleryProps = {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  // Additive — when provided, used directly as the final, already-ordered,
  // already-deduplicated/filtered image list, instead of deriving it from
  // imageUrl/imageUrls internally. For packs, imageUrls already contains
  // imageUrl as one of its own entries (verified against real data), so the
  // internal `[...imageUrls, imageUrl]` merge + Set-dedup below resolves to
  // imageUrls' own order either way. Products are different: imageUrl is
  // never one of imageUrls' entries, and the established order is
  // `[imageUrl, ...imageUrls]` (main image first) — the opposite of this
  // component's internal merge order. Passing `images` lets a caller like
  // that preserve its own established order exactly, without this component
  // reversing or deduplicating it. Every existing caller (Pack, and
  // manage-packs.tsx) omits this and keeps using imageUrl/imageUrls as before.
  images?: string[];
  alt: string;
  mainClassName?: string;
  // Additive — lets a caller override the main image's corner radius
  // independently of mainClassName (so it can line up with an enclosing
  // Dialog's own rounded corners) without touching the hardcoded default
  // used by every other caller.
  mainRoundedClassName?: string;
  thumbnailClassName?: string;
  emptyClassName?: string;
  // Additive — arbitrary content (e.g. icon buttons) absolutely positioned
  // inside the main image's own container, which already carries
  // `position: relative` via mainClassName for callers that use it. Left
  // undefined, nothing changes for any existing caller.
  overlay?: ReactNode;
  // Additive, defaults to false — when true, replaces the clickable
  // thumbnail strip with overlaid Previous/Next arrows, a small image
  // counter, and left/right swipe navigation on the main image, instead of
  // the thumbnail row underneath it. Every existing caller (the Supplier's
  // pack-creation live preview and its own "Pack Preview" dialog in
  // manage-packs.tsx) omits this prop and keeps the original thumbnail-strip
  // behavior, byte-for-byte unchanged.
  carousel?: boolean;
  // Additive — when provided, called with whichever image URL is currently
  // displayed to get a wrapper style (e.g. a saved per-image crop/zoom
  // adjustment) applied around the <img> itself, inside an extra wrapper
  // div. Packs have no such per-image adjustment concept; every existing
  // caller omits this and the <img> renders with no wrapper, exactly as
  // before.
  getImageStyle?: (url: string) => React.CSSProperties;
};

// Same visual language as the Pack Detail Modal's existing Close/Favorite/
// Theme overlay buttons (PackImageTopIcons in pack-quick-view-modal.tsx) —
// reused verbatim rather than inventing a new button style.
const NAV_BUTTON_CLASS =
  "w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 bg-black/40 backdrop-blur-sm";

// Minimum net horizontal movement (px) before a swipe counts as intentional
// navigation, and the deadzone (px) used to decide whether a touch gesture
// is horizontal (swipe) or vertical (scroll/dismiss) before locking onto one.
const SWIPE_THRESHOLD = 50;
const AXIS_LOCK_THRESHOLD = 10;

export function PackImageGallery({
  imageUrl,
  imageUrls,
  images: providedImages,
  alt,
  mainClassName = "aspect-video bg-secondary",
  mainRoundedClassName = "rounded-lg",
  thumbnailClassName = "",
  emptyClassName = "text-muted-foreground",
  overlay,
  carousel = false,
  getImageStyle,
}: PackImageGalleryProps) {
  const images = useMemo(() => {
    if (providedImages) return providedImages.map(url => url.trim()).filter(Boolean);
    const all = [...(imageUrls ?? []), imageUrl ?? ""].map(url => url.trim()).filter(Boolean);
    return Array.from(new Set(all));
  }, [providedImages, imageUrl, imageUrls]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [images.join("|")]);

  const selectedImage = images[selectedIndex];
  const hasMultiple = images.length > 1;

  const goNext = () => setSelectedIndex((i) => (i + 1) % images.length);
  const goPrev = () => setSelectedIndex((i) => (i - 1 + images.length) % images.length);

  // ── Swipe gesture (carousel mode only) ────────────────────────────────────
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeAxisRef = useRef<"horizontal" | "vertical" | null>(null);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    swipeAxisRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    if (swipeAxisRef.current == null && (Math.abs(dx) > AXIS_LOCK_THRESHOLD || Math.abs(dy) > AXIS_LOCK_THRESHOLD)) {
      swipeAxisRef.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
    }
    if (swipeAxisRef.current === "horizontal") {
      // Confirmed horizontal swipe — keep it from also being read as modal
      // scroll/dismiss (useScrollDismiss, on the enclosing scroll container)
      // or native vertical page scroll.
      e.stopPropagation();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    const axis = swipeAxisRef.current;
    touchStartRef.current = null;
    swipeAxisRef.current = null;
    if (!start || axis !== "horizontal" || !hasMultiple) return;
    const dx = e.changedTouches[0].clientX - start.x;
    if (dx <= -SWIPE_THRESHOLD) goNext();
    else if (dx >= SWIPE_THRESHOLD) goPrev();
  };

  return (
    <div className="space-y-2">
      <div
        className={`${mainClassName} ${mainRoundedClassName} overflow-hidden flex items-center justify-center`}
        {...(carousel ? {
          onTouchStart: handleTouchStart,
          onTouchMove: handleTouchMove,
          onTouchEnd: handleTouchEnd,
        } : {})}
      >
        {selectedImage ? (
          getImageStyle ? (
            <div style={getImageStyle(selectedImage)}>
              <img
                src={selectedImage}
                className="w-full h-full object-cover"
                alt={alt}
                draggable={!carousel}
              />
            </div>
          ) : (
            <img
              src={selectedImage}
              className="w-full h-full object-cover"
              alt={alt}
              draggable={!carousel}
            />
          )
        ) : (
          <ImageOff className={`w-8 h-8 ${emptyClassName}`} />
        )}
        {overlay}
        {carousel && hasMultiple && (
          <>
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); goPrev(); }}
              aria-label="Image précédente"
              className={`absolute left-3 top-1/2 -translate-y-1/2 z-20 ${NAV_BUTTON_CLASS}`}
              data-testid="button-pack-image-prev"
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); goNext(); }}
              aria-label="Image suivante"
              className={`absolute right-3 top-1/2 -translate-y-1/2 z-20 ${NAV_BUTTON_CLASS}`}
              data-testid="button-pack-image-next"
            >
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
            <div className="absolute bottom-3 left-3 z-20 bg-black/40 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">
              {selectedIndex + 1} / {images.length}
            </div>
          </>
        )}
      </div>
      {!carousel && images.length > 1 && (
        <div className={`flex gap-2 overflow-x-auto ${thumbnailClassName}`} aria-label={`${alt} images`}>
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setSelectedIndex(index);
              }}
              aria-label={`Show image ${index + 1}`}
              aria-pressed={selectedIndex === index}
              className={`w-14 h-11 rounded-md overflow-hidden shrink-0 border-2 transition-colors ${
                selectedIndex === index ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
              }`}
            >
              <img src={image} className="w-full h-full object-cover" alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
