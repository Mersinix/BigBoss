import type { PrintOrderStatus } from "@shared/schema";

/**
 * Shared status metadata/transitions for PRINT orders (Printer-facing pages only —
 * dashboard/orders/analytics/invoices all import from here instead of each defining
 * their own copy, mirroring how lib/financial-rows.ts centralizes SHOP's derivations).
 */

export const PRINT_ORDER_STATUSES: PrintOrderStatus[] = [
  "PENDING", "CONFIRMED", "PREPARING", "READY", "IN_DELIVERY", "DELIVERED", "CANCELLED",
];

export const PRINT_ORDER_STATUS_META: Record<PrintOrderStatus, { label: string; className: string }> = {
  PENDING:     { label: "En attente",   className: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/30" },
  CONFIRMED:   { label: "Confirmée",    className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30" },
  PREPARING:   { label: "En production", className: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30" },
  READY:       { label: "Prête",        className: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30" },
  IN_DELIVERY: { label: "En livraison", className: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/30" },
  DELIVERED:   { label: "Livrée",       className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/30" },
  CANCELLED:   { label: "Annulée",      className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30" },
};

/** Next status action(s) available to the Printer from a given current status. */
export const PRINT_ORDER_NEXT_ACTIONS: Partial<Record<PrintOrderStatus, { status: PrintOrderStatus; label: string; variant?: "default" | "destructive" }[]>> = {
  PENDING:   [{ status: "CONFIRMED", label: "Confirmer" }, { status: "CANCELLED", label: "Annuler", variant: "destructive" }],
  CONFIRMED: [{ status: "PREPARING", label: "Mettre en production" }, { status: "CANCELLED", label: "Annuler", variant: "destructive" }],
  PREPARING: [{ status: "READY", label: "Marquer prête" }],
  READY:       [{ status: "IN_DELIVERY", label: "Envoyer en livraison" }],
  IN_DELIVERY: [{ status: "DELIVERED", label: "Marquer livrée" }],
};

const MONTH_LABELS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

/** Formats a "YYYY-MM" key (as returned by /api/print/revenue's `history`) as a short French month label. */
export function formatMonthKey(monthKey: string): string {
  const parts = monthKey.split("-");
  const m = Number(parts[1]);
  if (!m || m < 1 || m > 12) return monthKey;
  return MONTH_LABELS_FR[m - 1];
}
