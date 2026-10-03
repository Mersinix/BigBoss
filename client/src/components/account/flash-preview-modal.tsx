import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, Zap, Eye } from "lucide-react";

// Shared "Flash" highlight — a single full-bleed image (Settings → Compte's
// new "Flash (URL)" field) shown in a lightweight story-style card, reused
// identically by:
//  - each of the 7 professional accounts' own Business → Profil "Flash"
//    preview button (`preview=true`: adds a visible "Mode aperçu" badge and
//    is otherwise read-only by construction — there are no operational
//    actions in this card to begin with, so nothing needs to be separately
//    "frozen"),
//  - the Coffee Owner-facing Details Modal's Flash/lightning icon
//    (`preview=false`), so both call sites render byte-identical output fed
//    by the same account data — no second implementation to drift out of sync.
// Missing/broken images fall back to the account's own profile photo, then to
// a plain placeholder — never a blank/broken-image box.
export function FlashPreviewModal({
  open, onClose, name, typeLabel, flashImageUrl, profileImageUrl, accentBgClass, preview,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  typeLabel?: string | null;
  flashImageUrl?: string | null;
  profileImageUrl?: string | null;
  // Full Tailwind class string, passed whole (never interpolated) so
  // Tailwind's JIT scanner sees the literal class — e.g. "bg-fuchsia-600".
  accentBgClass: string;
  preview?: boolean;
}) {
  const primary = flashImageUrl?.trim() || null;
  const fallback = profileImageUrl?.trim() || null;
  // Flash (URL) takes priority; if it's unset OR fails to actually load, fall
  // through to Photo de profil (URL); if that's also unset/broken, show the
  // plain placeholder below — never a blank/broken-image box.
  const [imgSrc, setImgSrc] = useState<string | null>(primary || fallback);
  const [triedFallback, setTriedFallback] = useState(false);
  useEffect(() => {
    setImgSrc(primary || fallback);
    setTriedFallback(false);
  }, [primary, fallback]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 border-0 w-[92vw] max-w-sm h-[80vh] max-h-[640px] rounded-3xl bg-black overflow-hidden [&>button]:hidden">
        <div className="relative w-full h-full flex flex-col select-none overflow-hidden">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-4 pb-3 bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span className="text-white font-bold text-sm truncate max-w-[60vw]">{name}</span>
            </div>
            <button
              className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center shrink-0"
              onClick={onClose}
              aria-label="Fermer"
              data-testid="button-flash-preview-close"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Image */}
          <div className="relative flex-1 bg-gray-900 overflow-hidden">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={name}
                className="w-full h-full object-cover"
                onError={() => {
                  // Primary (Flash) image failed — try the profile photo once;
                  // if that was already what failed, or there's nothing left,
                  // drop to the placeholder instead of a broken-image box.
                  if (!triedFallback && imgSrc !== fallback && fallback) {
                    setTriedFallback(true);
                    setImgSrc(fallback);
                  } else {
                    setImgSrc(null);
                  }
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Zap className="w-16 h-16 text-gray-700" />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 px-5 pb-6 pointer-events-none">
              {typeLabel && (
                <span className={`inline-block mb-1.5 text-[11px] font-semibold text-white px-2.5 py-1 rounded-full ${accentBgClass}`}>
                  {typeLabel}
                </span>
              )}
              <h2 className="text-white font-bold text-xl leading-tight">{name}</h2>
            </div>
          </div>

          {preview && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-amber-500/90 backdrop-blur-sm text-white text-[11px] font-semibold px-3 py-1.5 rounded-full">
              <Eye className="w-3 h-3" /> Mode aperçu — vue exacte Coffee Owner
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
