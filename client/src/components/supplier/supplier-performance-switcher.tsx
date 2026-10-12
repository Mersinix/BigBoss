import { Link, useLocation } from "wouter";
import { LayoutDashboard, BarChart2, TrendingUp } from "lucide-react";

const TABS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/supplier/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/supplier/earnings", label: "Earnings", icon: TrendingUp },
];

/**
 * URL-driven switcher for Supplier's consolidated "Performance" sidebar entry —
 * mirrors components/admin/admin-performance-switcher.tsx (same visual chrome,
 * same Link/useLocation-driven active state instead of local state), pointed at
 * Supplier's own three routes/components. A separate, Supplier-owned component
 * rather than reusing the Admin one directly, since the two are maintained
 * independently per role.
 */
export function SupplierPerformanceSwitcher() {
  const [location] = useLocation();
  return (
    <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
      <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 w-max min-w-full sm:w-fit">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = location === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${active ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`tab-supplier-performance-${label.toLowerCase()}`}
            >
              <Icon className="w-4 h-4" />{label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
