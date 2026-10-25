import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Shared Previous/Next item-navigation buttons (task: "Add Consistent
 * Previous/Next Navigation to All Coffee Owner Service Detail Modals") —
 * same dimensions, icons, spacing, hover/disabled states, and dark/light
 * treatment as the Pack/Product Detail modals' own Previous/Next Product
 * buttons (client/src/components/pack-quick-view-modal.tsx /
 * product-detail-content.tsx), extracted here once instead of five more
 * copies of the same markup for Barista/Maintenance/Marketing/Academy/Print.
 * Pack/Product's own already-shipped inline buttons are left as-is —
 * not retrofitted, to avoid unnecessary risk to already-verified code.
 */
export function ItemNavButtons({
  isDark, canPrev, canNext, onPrev, onNext, prevLabel, nextLabel,
  prevTestId, nextTestId,
}: {
  isDark: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  prevTestId?: string;
  nextTestId?: string;
}) {
  const btnClass = `w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 ${
    isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"
  }`;
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button type="button" onClick={onPrev} disabled={!canPrev} aria-label={prevLabel} title={prevLabel} className={btnClass} data-testid={prevTestId}>
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button type="button" onClick={onNext} disabled={!canNext} aria-label={nextLabel} title={nextLabel} className={btnClass} data-testid={nextTestId}>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
