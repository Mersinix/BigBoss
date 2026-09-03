import type { MarketingProjectStatus } from "@/hooks/use-marketing";

/**
 * Shared status metadata/transitions for Marketing projects (Marketing-provider-
 * facing pages only — dashboard/projects/invoices/analytics all import from
 * here instead of each defining their own copy), mirroring lib/print-order-status.ts.
 */

export const MARKETING_PROJECT_STATUSES: MarketingProjectStatus[] = [
  "PENDING", "QUOTED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED",
];

export const MARKETING_PROJECT_STATUS_META: Record<MarketingProjectStatus, { label: string; className: string }> = {
  PENDING:     { label: "Nouvelle demande", className: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/30" },
  QUOTED:      { label: "Devis envoyé",     className: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30" },
  ACCEPTED:    { label: "Accepté",          className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30" },
  IN_PROGRESS: { label: "En cours",         className: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30" },
  COMPLETED:   { label: "Terminé",          className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/30" },
  CANCELLED:   { label: "Annulé",           className: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-500/20 dark:text-gray-300 dark:border-gray-500/30" },
  REJECTED:    { label: "Devis refusé",     className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30" },
};

/** Next status action(s) available to the Marketing provider from a given current status. */
export const MARKETING_PROJECT_NEXT_ACTIONS: Partial<Record<MarketingProjectStatus, { status: MarketingProjectStatus; label: string; variant?: "default" | "destructive" }[]>> = {
  PENDING:     [{ status: "QUOTED", label: "Envoyer un devis" }, { status: "CANCELLED", label: "Refuser", variant: "destructive" }],
  ACCEPTED:    [{ status: "IN_PROGRESS", label: "Démarrer le projet" }],
  IN_PROGRESS: [{ status: "COMPLETED", label: "Marquer terminé" }],
};

const MONTH_LABELS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

/** Formats a "YYYY-MM" key (as returned by /api/marketing/revenue's `history`) as a short French month label. */
export function formatMonthKey(monthKey: string): string {
  const parts = monthKey.split("-");
  const m = Number(parts[1]);
  if (!m || m < 1 || m > 12) return monthKey;
  return MONTH_LABELS_FR[m - 1];
}
