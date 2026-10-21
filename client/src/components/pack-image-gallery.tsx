import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";

type PackImageGalleryProps = {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
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
};

export function PackImageGallery({
  imageUrl,
  imageUrls,
  alt,
  mainClassName = "aspect-video bg-secondary",
  mainRoundedClassName = "rounded-lg",
  thumbnailClassName = "",
  emptyClassName = "text-muted-foreground",
  overlay,
}: PackImageGalleryProps) {
  const images = useMemo(() => {
    const all = [...(imageUrls ?? []), imageUrl ?? ""].map(url => url.trim()).filter(Boolean);
    return Array.from(new Set(all));
  }, [imageUrl, imageUrls]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [images.join("|")]);

  const selectedImage = images[selectedIndex];

  return (
    <div className="space-y-2">
      <div className={`${mainClassName} ${mainRoundedClassName} overflow-hidden flex items-center justify-center`}>
        {selectedImage ? (
          <img src={selectedImage} className="w-full h-full object-cover" alt={alt} />
        ) : (
          <ImageOff className={`w-8 h-8 ${emptyClassName}`} />
        )}
        {overlay}
      </div>
      {images.length > 1 && (
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