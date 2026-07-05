import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { ProductDetailContent } from "@/components/product-detail-content";
import { useQuickView } from "@/hooks/use-quick-view";

export function ProductQuickViewModal() {
  const productId = useQuickView((s) => s.productId);
  const close = useQuickView((s) => s.close);

  return (
    <Dialog open={productId != null} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-w-4xl w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto p-0 gap-0" data-testid="modal-quick-view">
        <VisuallyHidden>
          <DialogTitle>Product Details</DialogTitle>
        </VisuallyHidden>
        {productId != null && (
          <ProductDetailContent
            productId={String(productId)}
            onBack={close}
            backLabel="Close"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
