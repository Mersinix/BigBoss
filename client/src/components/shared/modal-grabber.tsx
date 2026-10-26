// Small pill-shaped drag handle shown at the top of specific modals (task:
// "Add a Drag Handle (Grabber) to Specific Modals") — purely decorative,
// signals that the modal supports its existing swipe-to-dismiss gesture.
// Does not add or change any gesture behavior itself.
//
// Two presentations:
// - Default: a neutral, theme-aware pill for modals with a plain
//   background header (Review / Produits inclus / Opening Hours).
// - `onImage`: a pill inside its own small backdrop-blur capsule, for
//   modals where the grabber sits directly over a photo (Pack/Product
//   Detail's hero image) and must stay visible regardless of the image's
//   own colors — matching the bg-black/40 backdrop-blur-sm convention
//   already used by this app's other image-overlay icons.
export function ModalGrabber({ isDark, onImage = false }: { isDark: boolean; onImage?: boolean }) {
  if (onImage) {
    return (
      <div
        className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 px-2 py-1.5 rounded-full bg-black/25 backdrop-blur-sm"
        aria-hidden="true"
      >
        <div className="w-9 h-1 rounded-full bg-white/80" />
      </div>
    );
  }
  return (
    <div className="flex justify-center pt-2.5 pb-1 shrink-0" aria-hidden="true">
      <div className={`w-9 h-1 rounded-full ${isDark ? "bg-gray-600" : "bg-gray-300"}`} />
    </div>
  );
}
