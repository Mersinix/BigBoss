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
  // top closes the modal with a slide-down + fade) — same behavior and
  // timing as the Pack Detail Modal, via the shared hook; see
  // client/src/hooks/use-scroll-dismiss.ts.
  const {
    onBodyWheel, onBodyTouchStart, onBodyTouchMove, onBodyTouchEnd,
    dismissContentStyle, dismissOverlayStyle,
  } = useScrollDismiss(productId != null, close);

  return (
    <Dialog open={productId != null} onOpenChange={(open) => { if (!open) close(); }}>
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
            onBack={close}
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
