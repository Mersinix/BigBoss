import { useQuery } from "@tanstack/react-query";
import type { PromotionType } from "@shared/schema";

// Admin → System Management → Promotion — per-type availability in the Supplier
// "Créer une promotion" Type picklist. Mirrors use-account-dark-mode.ts's map
// pattern exactly (one entry per existing promotionTypeEnum value — never a new/
// invented type). Defaults to every type enabled so a load failure never hides a
// type suppliers already rely on.
export type PromotionTypeSettingsMap = Record<PromotionType, boolean>;

export const DEFAULT_PROMOTION_TYPE_SETTINGS: PromotionTypeSettingsMap = {
  PERCENTAGE: true,
  FIXED_AMOUNT: true,
  BUY_X_GET_Y: true,
  QUANTITY_TIER: true,
  CATEGORY_DISCOUNT: true,
  FREE_SHIPPING: true,
  GIFT: true,
  MIN_ORDER_AMOUNT: true,
  MIN_QUANTITY: true,
  FIRST_ORDER: true,
};

export function usePromotionTypeSettings() {
  const { data, isLoading } = useQuery<PromotionTypeSettingsMap>({
    queryKey: ["/api/promotion-type-settings"],
  });
  return { settings: data ?? DEFAULT_PROMOTION_TYPE_SETTINGS, isLoading };
}
