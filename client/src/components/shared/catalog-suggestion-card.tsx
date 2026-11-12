import type { ReactNode } from "react";
import { Layers } from "lucide-react";

// Shared presentational card for a single catalog-taxonomy suggestion (category /
// sub-category / brand / flavor / size) — same visual language (rounded-2xl border
// shadow-sm hover:shadow-md) as Admin → Categories → Category Management's own mapped
// cards (CategoriesTab/SubCategoriesTab/TaxonomyCrudTab in admin/categories-page.tsx),
// reused by both Supplier → Categories → Demandes de catégories (CategoryRequestsSection)
// and Admin → Categories → Catégories des fournisseurs (SupplierCategoriesSection) so the
// two "list of suggestions" views stay visually identical by construction instead of two
// hand-maintained copies. Purely presentational — no data fetching, no mutations, no
// permission logic: each caller supplies its own badges/meta/actions, so Admin-only actions
// (Approuver) are never implicitly available to the Supplier caller.
export function CatalogSuggestionCard({
  icon, name, description, badges, meta, actions, testId,
}: {
  icon?: string | null;
  name: string;
  description?: string | null;
  badges?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  testId: string;
}) {
  return (
    <div className="relative bg-card rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow" data-testid={testId}>
      <div className="p-4 flex flex-col gap-2">
        <span className="text-2xl leading-none">{icon || <Layers className="w-6 h-6 text-muted-foreground" />}</span>
        <div>
          <p className="font-semibold text-sm truncate">{name}</p>
          {description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{description}</p>}
        </div>
        {badges && <div className="flex flex-wrap items-center gap-1">{badges}</div>}
        {meta && <p className="text-[11px] text-muted-foreground mt-1">{meta}</p>}
        {actions && <div className="flex items-center gap-1.5 pt-1 border-t mt-1">{actions}</div>}
      </div>
    </div>
  );
}
