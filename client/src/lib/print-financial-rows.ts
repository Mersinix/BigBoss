import type { PrintOrderWithParties } from "@shared/schema";

/**
 * Derivation layer for PRINT "Facturation" (Printer's own invoices), mirroring
 * lib/financial-rows.ts's approach for Supplier/SHOP: there is no invoices table for PRINT
 * (or for any module in this app) — every row here is derived live from printOrders via
 * GET /api/print/orders, one row per order (PRINT has no sub-orders / multi-party split).
 *
 * PRINT is a direct Printer <-> Coffee Owner service with no platform commission/payout
 * split (unlike Supplier/SHOP's flat 5% commission) — so, unlike FinancialRow, there is no
 * commission/netAmount field here. amount === order.totalInCents, in full, to the Printer.
 */

export type PrintInvoiceStatus = "PAID" | "PENDING" | "CANCELLED";

export type PrintInvoiceRow = {
  orderId: number;
  invoiceNumber: string;
  cafeOwnerName: string;
  itemName: string;
  quantity: number;
  amount: number; // cents, == order.totalInCents
  createdAt: string | Date | null;
  orderStatus: string;
  invoiceStatus: PrintInvoiceStatus;
};

export function printInvoiceNumber(orderId: number): string {
  return `PRT-${String(orderId).padStart(5, "0")}`;
}

function deriveInvoiceStatus(orderStatus: string): PrintInvoiceStatus {
  if (orderStatus === "DELIVERED") return "PAID";
  if (orderStatus === "CANCELLED") return "CANCELLED";
  return "PENDING";
}

export function buildPrintInvoiceRows(orders: PrintOrderWithParties[]): PrintInvoiceRow[] {
  return orders.map((order) => ({
    orderId: order.id,
    invoiceNumber: printInvoiceNumber(order.id),
    cafeOwnerName: order.cafeOwnerName,
    itemName: order.itemName,
    quantity: order.quantity,
    amount: order.totalInCents,
    createdAt: order.createdAt,
    orderStatus: order.status,
    invoiceStatus: deriveInvoiceStatus(order.status),
  }));
}

export const PRINT_INVOICE_STATUS_META: Record<PrintInvoiceStatus, { label: string; className: string }> = {
  PAID:      { label: "Payé",       className: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" },
  PENDING:   { label: "En attente", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  CANCELLED: { label: "Annulé",     className: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
};
