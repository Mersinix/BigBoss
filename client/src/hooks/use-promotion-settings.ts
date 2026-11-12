import { useQuery } from "@tanstack/react-query";

// Admin → System Management → Promotion — global Supplier Promotions tab
// visibility. Mirrors use-messaging-settings.ts exactly (single auto-seeded
// row, default true so a load failure never hides a feature suppliers
// already rely on). Separate from promotion eligibility/pricing, which this
// never affects.
export type PromotionSettings = {
  globalVisible: boolean;
};

export const DEFAULT_PROMOTION_SETTINGS: PromotionSettings = {
  globalVisible: true,
};

export function usePromotionSettings() {
  const { data, isLoading } = useQuery<PromotionSettings>({
    queryKey: ["/api/promotion-settings"],
  });
  return { settings: data ?? DEFAULT_PROMOTION_SETTINGS, isLoading };
}
