import { useQuery } from "@tanstack/react-query";

// Admin → System Management → Delivery — "Visibilité des entreprises de livraison" (task:
// "Admin Delivery Company Visibility Control and Supplier Delivery Workflow"). Mirrors
// use-promotion-settings.ts exactly (single auto-seeded row, default true so a load failure
// never hides a feature already relied on). Gates (1) DELIVERY_COMPANY as a selectable
// registration account type and (2) the Supplier-facing external-delivery-company dispatch
// options — never the Supplier's own driver workflow.
export type DeliveryCompanyVisibilitySettings = {
  visible: boolean;
};

export const DEFAULT_DELIVERY_COMPANY_VISIBILITY: DeliveryCompanyVisibilitySettings = {
  visible: true,
};

export function useDeliveryCompanyVisibility() {
  const { data, isLoading } = useQuery<DeliveryCompanyVisibilitySettings>({
    queryKey: ["/api/delivery-company-visibility"],
  });
  return { settings: data ?? DEFAULT_DELIVERY_COMPANY_VISIBILITY, isLoading };
}

// Combined master-switch + eligibility shape the Supplier dispatch UI needs (section 4's
// table: Masqué→hidden regardless of eligibility; Visible+no eligible company→hidden;
// Visible+eligible company→visible). `eligible` is the single flag that UI should gate on;
// `isLoading` is surfaced separately so a caller can avoid briefly showing restricted options
// while the setting is still loading (task section 5: "do not briefly expose restricted
// options while the setting is being loaded").
export type DeliveryCompanyDispatchEligibility = {
  visible: boolean;
  hasEligibleCompany: boolean;
  eligible: boolean;
};

// Deliberately fails CLOSED (unlike DEFAULT_DELIVERY_COMPANY_VISIBILITY above) — this is only
// ever used as a pre-load placeholder while `isLoading` is true, and callers must check
// `isLoading` themselves (task section 5) rather than render against this default directly, so
// failing closed here just avoids ever flashing an external-company option that turns out to
// be ineligible once the real data arrives.
const DEFAULT_DISPATCH_ELIGIBILITY: DeliveryCompanyDispatchEligibility = {
  visible: true,
  hasEligibleCompany: false,
  eligible: false,
};

export function useDeliveryCompanyDispatchEligibility() {
  const { data, isLoading } = useQuery<DeliveryCompanyDispatchEligibility>({
    queryKey: ["/api/delivery-company-dispatch-eligibility"],
  });
  return { eligibility: data ?? DEFAULT_DISPATCH_ELIGIBILITY, isLoading };
}
