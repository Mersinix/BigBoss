import { Link, useLocation } from "wouter";
import { LayoutDashboard, BarChart2, TrendingUp } from "lucide-react";
import { useSupplierTabSettings } from "@/hooks/use-supplier-tab-settings";

const TABS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, settingKey: "dashboardTabVisible" as const },
  { href: "/supplier/analytics", label: "Analytics", icon: BarChart2, settingKey: "analyticsTabVisible" as const },
  { href: "/supplier/earnings", label: "Earnings", icon: TrendingUp, settingKey: "earningsTabVisible" as const },
];

/**
 * URL-driven switcher for Supplier's consolidated "Performance" sidebar entry —
 * mirrors components/admin/admin-performance-switcher.tsx (same visual chrome,
 * same Link/useLocation-driven active state instead of local state), pointed at
 * Supplier's own three routes/components. A separate, Supplier-owned component
 * rather than reusing the Admin one directly, since the two are maintained
 * independently per role.
 *
 * Admin → System Management → Supplier → Onglet's "Visibilité de l'onglet
 * Performance" group (task: "Admin Supplier Settings — Supplier Performance Tab
 * Visibility Management") — only the tabs Admin currently allows are shown; kept
 * live by use-realtime.ts's existing supplier_tab_settings_updated handler. When
 * one or zero tabs remain, the switcher itself is not rendered (never shown
 * empty, and never shown with a single, nothing-to-switch-to option).
 */
export function SupplierPerformanceSwitcher() {
  const [location] = useLocation();
  const { settings } = useSupplierTabSettings();
  const visibleTabs = TABS.filter((t) => settings[t.settingKey]);
  if (visibleTabs.length <= 1) return null;
  return (
    <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
      <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 w-max min-w-full sm:w-fit">
        {visibleTabs.map(({ href, label, icon: Icon }) => {
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
