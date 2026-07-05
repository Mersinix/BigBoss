import { useParams, useLocation } from "wouter";
import { ProductDetailContent } from "@/components/product-detail-content";

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const params = useParams<{ productId: string }>();
  const [, navigate] = useLocation();

  return (
    <ProductDetailContent
      productId={params.productId}
      onBack={() => navigate("/products")}
      backLabel="Back to Browse"
    />
  );
}
