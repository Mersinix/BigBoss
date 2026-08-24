import type { OrderWithDetails } from "@shared/schema";

/**
 * Shared derivation layer for Payouts/Invoices across Supplier and Admin.
 *
 * There is no payments/payouts/invoices table anywhere in shared/schema.ts — orders and
 * sub_orders (one per supplier within a multi-supplier order) are the only source of truth
 * for financial data. Every row here is derived live from that existing data, never stored
 * separately, so it can never drift out of sync with the real order lifecycle and requires
 * no new realtime plumbing (the existing ORDER_EVENTS/DELIVERY_EVENTS invalidation of
 * ["/api/orders"] in use-realtime.ts already keeps it current).
 *
 * One row = one sub-order (one supplier's slice of one order) — never one row per order,
 * since an order can span multiple suppliers with independent statuses/subtotals (see
 * subOrders in shared/schema.ts). This is what admin/payments-page.tsx and
 * admin/invoices-page.tsx got wrong before (they used order.totalAmount / order.supplier,
 * which is null/wrong for multi-supplier orders).
 *
 * Commission: the platform takes a flat 5% of each sub-order's subtotal — the same rate
 * already shown to Admins on the pre-existing Payments/Earnings pages. No commission-rate
 * field exists in the schema, so this constant is the one source of truth for it; no page
 * should hardcode its own copy.
 *
 * Payment collection: the schema's orders.paymentStatus column is written once at creation
 * ('PENDING') and never updated anywhere (only CASH_ON_DELIVERY is supported) — it is not a
 * live signal. The existing Admin Payments/Earnings pages already treat a DELIVERED status
 * as "paid" (cash collected on hand-off); this module applies the same established
 * convention at sub-order granularity instead of fabricating a new payment state.
 */

export const PLATFORM_COMMISSION_RATE = 0.05;

export type PayoutStatus = "DUE" | "UPCOMING" | "CANCELLED";
export type PaymentCollectionStatus = "COLLECTED" | "PENDING";

export type FinancialRow = {
  orderId: number;
  subOrderId: number;
  supplierId: number;
  supplierName: string;
  cafeId: number;
  cafeName: string;
  createdAt: string | Date | null;
  subOrderStatus: string;
  /** Sub-order subtotal, already net of any promotion discount (what the cafe is billed). */
  subtotal: number;
  discountAmount: number;
  commission: number;
  /** subtotal - commission: what the platform owes this supplier. */
  netAmount: number;
  paymentMethod: string;
  deliveryStatus: string | null;
  deliveredAt: string | Date | null;
  payoutStatus: PayoutStatus;
  paymentCollectionStatus: PaymentCollectionStatus;
  itemCount: number;
};

function derivePayoutStatus(subOrderStatus: string): PayoutStatus {
  if (subOrderStatus === "CANCELLED") return "CANCELLED";
  if (subOrderStatus === "DELIVERED") return "DUE";
  return "UPCOMING";
}

function derivePaymentCollectionStatus(subOrderStatus: string): PaymentCollectionStatus {
  return subOrderStatus === "DELIVERED" ? "COLLECTED" : "PENDING";
}

export function buildFinancialRows(orders: OrderWithDetails[]): FinancialRow[] {
  const rows: FinancialRow[] = [];
  for (const order of orders) {
    const subOrders = order.subOrders ?? [];
    for (const so of subOrders) {
      const subtotal = so.subtotal ?? 0;
      const commission = Math.round(subtotal * PLATFORM_COMMISSION_RATE);
      rows.push({
        orderId: order.id,
        subOrderId: so.id,
        supplierId: so.supplierId,
        supplierName: so.supplierName || "—",
        cafeId: order.cafeId,
        cafeName: order.cafe?.name ?? "—",
        createdAt: so.createdAt ?? order.createdAt ?? null,
        subOrderStatus: so.status,
        subtotal,
        discountAmount: so.discountAmount ?? 0,
        commission,
        netAmount: so.status === "CANCELLED" ? 0 : subtotal - commission,
        paymentMethod: (order as any).paymentMethod ?? "CASH_ON_DELIVERY",
        deliveryStatus: (so as any).delivery?.status ?? null,
        deliveredAt: (so as any).delivery?.deliveredAt ?? null,
        payoutStatus: derivePayoutStatus(so.status),
        paymentCollectionStatus: derivePaymentCollectionStatus(so.status),
        itemCount: (so.items ?? []).filter((i: any) => i.status !== "CANCELLED").length,
      });
    }
  }
  return rows;
}

export const PAYOUT_STATUS_META: Record<PayoutStatus, { label: string; className: string }> = {
  DUE:       { label: "À verser",  className: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" },
  UPCOMING:  { label: "À venir",   className: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  CANCELLED: { label: "Annulé",    className: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
};

export const PAYMENT_COLLECTION_META: Record<PaymentCollectionStatus, { label: string; className: string }> = {
  COLLECTED: { label: "Encaissé",   className: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" },
  PENDING:   { label: "En attente", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
};

export function invoiceNumber(subOrderId: number): string {
  return `INV-${String(subOrderId).padStart(5, "0")}`;
}

export function payoutReference(subOrderId: number): string {
  return `PAY-${String(subOrderId).padStart(5, "0")}`;
}
