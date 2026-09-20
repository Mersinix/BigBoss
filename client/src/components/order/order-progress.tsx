import { AlertCircle, Box, CheckCircle2, Clock, Package, Truck, ShoppingBag, PackageCheck } from "lucide-react";

// Shared Shop order-progress stepper — identical stages/logic across Admin, Coffee Owner and
// Supplier order-detail views (previously duplicated inline inside
// components/cafe/order-details-modal.tsx and entirely missing from the Supplier modal).
// The active state always comes from the real order/sub-order status column, never a
// hardcoded/derived value.
export const ORDER_PROGRESS_STAGES = [
  { status: "PENDING", label: "Order Placed", icon: Clock },
  { status: "CONFIRMED", label: "Confirmed", icon: CheckCircle2 },
  { status: "PREPARING", label: "Preparing", icon: Box },
  { status: "READY", label: "Ready for Delivery", icon: Package },
  { status: "IN_DELIVERY", label: "Out for Delivery", icon: Truck },
  { status: "DELIVERED", label: "Delivered", icon: CheckCircle2 },
] as const;

// Self Pickup variant (Delivery System V2) — the exact same underlying status column/values
// (PENDING/CONFIRMED/PREPARING/READY/IN_DELIVERY/DELIVERED) drive this, only the labels/icons
// differ. No new database status was introduced: confirming the pickup code
// (storage.confirmSelfPickup) writes the sub-order straight to DELIVERED, so "Picked Up" and
// "Completed" are always reached together — there is no courier hand-off to track separately
// for a self-pickup order.
export const SELF_PICKUP_PROGRESS_STAGES = [
  { status: "PENDING", label: "Order Placed", icon: Clock },
  { status: "CONFIRMED", label: "Confirmed", icon: CheckCircle2 },
  { status: "PREPARING", label: "Preparing", icon: Box },
  { status: "READY", label: "Ready for Pickup", icon: ShoppingBag },
  { status: "IN_DELIVERY", label: "Picked Up", icon: PackageCheck },
  { status: "DELIVERED", label: "Completed", icon: CheckCircle2 },
] as const;

export type OrderProgressTheme = {
  dk: boolean;
  textPrimary: string;
  textMuted: string;
};

export function OrderProgress({ status, t, fulfillmentType }: { status: string; t: OrderProgressTheme; fulfillmentType?: "SELF_PICKUP" | "DELIVERY_SERVICE" }) {
  if (status === "CANCELLED") {
    return (
      <div className="flex items-center gap-2 text-sm text-red-400">
        <AlertCircle className="w-4 h-4" />
        This order was cancelled.
      </div>
    );
  }

  const stages = fulfillmentType === "SELF_PICKUP" ? SELF_PICKUP_PROGRESS_STAGES : ORDER_PROGRESS_STAGES;
  const currentIndex = stages.findIndex((stage) => stage.status === status);

  return (
    <div className="flex items-start overflow-x-auto pb-1">
      {stages.map((stage, index) => {
        const StageIcon = stage.icon;
        const complete = currentIndex >= index;
        const current = currentIndex === index;
        return (
          <div key={stage.status} className="flex items-start min-w-[92px] flex-1">
            <div className="flex flex-col items-center min-w-[72px]">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                complete
                  ? (current ? "bg-amber-500 border-amber-400 text-white ring-2 ring-amber-500/25" : "bg-amber-500/20 border-amber-500 text-amber-400")
                  : (t.dk ? "bg-gray-800 border-gray-700 text-gray-500" : "bg-gray-50 border-gray-200 text-gray-400")
              }`}>
                <StageIcon className="w-3.5 h-3.5" />
              </div>
              <span className={`text-[10px] text-center leading-tight mt-1.5 ${current ? "font-bold text-amber-500" : t.textMuted}`}>
                {stage.label}
              </span>
            </div>
            {index < stages.length - 1 && (
              <div className={`h-0.5 flex-1 mt-4 min-w-[14px] ${currentIndex > index ? "bg-amber-500" : (t.dk ? "bg-gray-700" : "bg-gray-200")}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
