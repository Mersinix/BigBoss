import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { ProductDetailContent } from "@/components/product-detail-content";
import { useQuickView } from "@/hooks/use-quick-view";
import { useScrollDismiss } from "@/hooks/use-scroll-dismiss";

export function ProductQuickViewModal() {
  const productId = useQuickView((s) => s.productId);
  const supplierId = useQuickView((s) => s.supplierId);
  const close = useQuickView((s) => s.close);

  // Previous/Next Product navigation — browses the Shop's own currently
  // filtered product list (navIds), kept live-synced by browse-products.tsx
  // (task: "Navigate Between Mapped Products and Packs Without Closing the
  // Detail Modal"). navigateTo switches only the displayed product, never
  // replaying the modal's open/close animation or touching supplierId. If
  // the current product isn't found in navIds (e.g. opened from a page that
  // provides no navigation context), both are null and the buttons hide.
  const navIds = useQuickView((s) => s.navIds);
  const navigateTo = useQuickView((s) => s.navigateTo);
  const navCurrentIndex = navIds ? navIds.indexOf(productId as number) : -1;
  const prevProductId = navCurrentIndex > 0 ? navIds![navCurrentIndex - 1] : null;
  const nextProductId = navCurrentIndex !== -1 && navIds && navCurrentIndex < navIds.length - 1 ? navIds[navCurrentIndex + 1] : null;
  const hasProductNav = navCurrentIndex !== -1 && !!navIds && navIds.length > 1;

  // Scroll-direction dismissal (scroll down, back up, then up again past the
  // top closes the modal with a slide-down + fade) — same behavior as the
  // Pack Detail Modal, via the shared hook (client/src/hooks/use-scroll-
  // dismiss.ts). The `true` 4th argument enables liveDrag here only: on
  // touch, the modal follows the finger in real time once pinned at the
  // top, reversing smoothly if the finger moves back down, and only
  // commits to closing or springs back once the finger lifts — every other
  // consumer of the hook omits this and keeps the original instant-
  // threshold touch behavior.
  //
  // requestDismiss is also used as the Close button / backdrop-click /
  // Escape handler below instead of calling close() directly: close()
  // clears productId immediately, which would unmount ProductDetailContent
  // (and its own themed background) before the exit animation finishes,
  // exposing DialogContent's bare bg-background underneath for the rest of
  // the animation — the white flash this task fixes. Routing every
  // dismissal path through requestDismiss keeps ProductDetailContent
  // mounted until the animation completes and close() finally fires, so
  // that flash window never opens, and all three dismissal methods now
  // share the exact same animated exit.
  const {
    requestDismiss, onBodyWheel, onBodyTouchStart, onBodyTouchMove, onBodyTouchEnd,
    dismissContentStyle, dismissOverlayStyle,
  } = useScrollDismiss(productId != null, close, 520, true);

  return (
    <Dialog open={productId != null} onOpenChange={(open) => { if (!open) requestDismiss(); }}>
      <DialogContent
        className="max-w-2xl sm:w-[calc(100%-2rem)] h-[88vh] max-h-[88vh] p-0 gap-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl [&>button]:hidden"
        style={{ display: "flex", flexDirection: "column", ...dismissContentStyle }}
        overlayStyle={dismissOverlayStyle}
        data-testid="modal-quick-view"
      >
        <VisuallyHidden>
          <DialogTitle>Product Details</DialogTitle>
        </VisuallyHidden>
        {productId != null && (
          <ProductDetailContent
            productId={String(productId)}
            supplierId={supplierId ?? undefined}
            onBack={requestDismiss}
            backLabel="Close"
            isModal
            onBodyWheel={onBodyWheel}
            onBodyTouchStart={onBodyTouchStart}
            onBodyTouchMove={onBodyTouchMove}
            onBodyTouchEnd={onBodyTouchEnd}
            hasProductNav={hasProductNav}
            canNavPrev={prevProductId != null}
            canNavNext={nextProductId != null}
            onNavPrev={() => prevProductId != null && navigateTo(prevProductId)}
            onNavNext={() => nextProductId != null && navigateTo(nextProductId)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
