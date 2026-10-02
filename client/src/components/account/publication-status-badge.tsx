import { Clock3, CheckCircle2, AlertTriangle, FileEdit } from "lucide-react";

// Shared GO Live status pill (Phase 5C), reused identically by all 7
// professional profile pages. Purely presentational — the actual status
// string always comes straight from that account's own profile row
// (publicationStatus), never recomputed here.
export function PublicationStatusBadge({ status }: { status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" }) {
  const config = {
    DRAFT: { label: "Brouillon — non soumis", icon: FileEdit, className: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" },
    PENDING: { label: "En attente d'approbation", icon: Clock3, className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
    APPROVED: { label: "Publié", icon: CheckCircle2, className: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" },
    REJECTED: { label: "Refusé", icon: AlertTriangle, className: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
  }[status] ?? { label: status, icon: FileEdit, className: "bg-gray-100 text-gray-600" };
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${config.className}`} data-testid="badge-publication-status">
      <Icon className="w-3.5 h-3.5" /> {config.label}
    </span>
  );
}
