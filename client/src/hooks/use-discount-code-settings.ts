import { useQuery } from "@tanstack/react-query";

// Admin → System Management → Supplier → Codes promotionnels — the two independent
// settings governing Supplier Discount Codes feature availability. Mirrors
// use-promotion-settings.ts exactly (single auto-seeded row, both default true so a
// load failure never hides a feature suppliers already rely on). Separate from
// promotion eligibility/pricing and from the Promotions feature itself — Discount
// Codes is its own, independent mechanism.
export type DiscountCodeSettings = {
  tabVisible: boolean;
  newCodeButtonVisible: boolean;
};

export const DEFAULT_DISCOUNT_CODE_SETTINGS: DiscountCodeSettings = {
  tabVisible: true,
  newCodeButtonVisible: true,
};

export function useDiscountCodeSettings() {
  const { data, isLoading } = useQuery<DiscountCodeSettings>({
    queryKey: ["/api/discount-code-settings"],
  });
  return { settings: data ?? DEFAULT_DISCOUNT_CODE_SETTINGS, isLoading };
}
