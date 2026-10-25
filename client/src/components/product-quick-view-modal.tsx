import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { ProductDetailContent } from "@/components/product-detail-content";
import { useQuickView } from "@/hooks/use-quick-view";
import { useScrollDismiss } from "@/hooks/use-scroll-dismiss";

export function ProductQuickViewModal() {
  const productId = useQuickView((s) => s.productId);
  const supplierId = useQuickView((s) => s.supplierId);
  const close = useQuickView((s) => s.close);

  // Scroll-direction dismissal (scroll down, back up, then up again past the
  // top closes the modal with a slide-down + fade) — same behavior as the
  // Pack Detail Modal, via the shared hook (client/src/hooks/use-scroll-
  // dismiss.ts), but with a slightly longer duration (380ms vs the shared
  // default of 320ms) for a smoother feel here specifically — this override
  // only affects this modal, every other consumer of the hook keeps 320ms.
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
  } = useScrollDismiss(productId != null, close, 520);

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
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
