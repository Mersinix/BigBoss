import { Package, Store, Wrench, Coffee, GraduationCap, Truck, Printer, Megaphone, Layers, type LucideIcon } from "lucide-react";

// Canonical Admin service-category switcher (task: "Centralize Report
// Moderation in Admin Communication and Fix Real-Time Publication") —
// extracted as-is from admin/reviews-page.tsx's own local TABS array/JSX
// (the "existing Reviews switcher" the task asks to reuse rather than
// re-invent), so Reviews and the new Signalements page share one source of
// truth for labels, ordering, icons, and service identifiers.
export const SERVICE_CATEGORY_TABS = [
  { key: "PRODUCT", label: "Product", icon: Package },
  { key: "PACK", label: "Pack", icon: Layers },
  { key: "SUPPLIER", label: "Supplier", icon: Store },
  { key: "MAINTENANCE", label: "Maintenance", icon: Wrench },
  { key: "BARISTA_MARKETPLACE", label: "Barista", icon: Coffee },
  { key: "ACADEMY", label: "Academy", icon: GraduationCap },
  { key: "DRIVER", label: "Delivery", icon: Truck },
  { key: "PRINT", label: "Print", icon: Printer },
  { key: "MARKETING", label: "Marketing", icon: Megaphone },
] as const satisfies readonly { key: string; label: string; icon: LucideIcon }[];

export type ServiceCategoryKey = (typeof SERVICE_CATEGORY_TABS)[number]["key"];
type ServiceCategoryTab = (typeof SERVICE_CATEGORY_TABS)[number];

// Signalements' own switcher list (task: "Extend the Shared Reporting
// System to Supplier Stores") — a distinct, reordered/filtered view over
// the exact same canonical entries (never duplicated labels/icons), since
// Signalements excludes Product/Pack (not reportable entities) while
// Reviews must keep them. Built from SERVICE_CATEGORY_TABS by key so the
// two switchers can never drift apart on label/icon for a shared key.
const REPORT_SERVICE_KEY_ORDER = ["SUPPLIER", "DRIVER", "MAINTENANCE", "BARISTA_MARKETPLACE", "ACADEMY", "PRINT", "MARKETING"] as const;
export const REPORT_SERVICE_TABS: ServiceCategoryTab[] = REPORT_SERVICE_KEY_ORDER.map(
  (key) => SERVICE_CATEGORY_TABS.find((t) => t.key === key)!,
);

interface Props {
  active: ServiceCategoryKey;
  onChange: (key: ServiceCategoryKey) => void;
  // Kept distinct per caller so existing data-testid values (e.g.
  // "tab-admin-reviews-maintenance") never change for Reviews.
  testIdPrefix: string;
  // Additive, defaults to the full canonical list (Reviews' own behavior,
  // unchanged) — Signalements passes REPORT_SERVICE_TABS instead.
  tabs?: readonly ServiceCategoryTab[];
}

export function ServiceCategorySwitcher({ active, onChange, testIdPrefix, tabs = SERVICE_CATEGORY_TABS }: Props) {
  return (
    <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
      <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 w-max min-w-full sm:w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all shrink-0 whitespace-nowrap ${
              active === tab.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${testIdPrefix}-${tab.key.toLowerCase()}`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
