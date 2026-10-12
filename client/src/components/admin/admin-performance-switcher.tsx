import { Link, useLocation } from "wouter";
import { LayoutDashboard, BarChart2, TrendingUp } from "lucide-react";

const TABS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/admin/earnings", label: "Earnings", icon: TrendingUp },
];

/**
 * URL-driven switcher for Admin's consolidated "Performance" sidebar entry —
 * Dashboard, Analytics, and Earnings are three real, independent routes/pages
 * (not sections of one page), so the active tab is derived from the current
 * location via wouter's useLocation() rather than local state. This keeps
 * direct navigation, refresh, and browser Back/Forward correct for free.
 * Same visual chrome as the existing System Management section switcher
 * (pages/admin/system-management-page.tsx), just Link-based instead of
 * state-based.
 */
export function AdminPerformanceSwitcher() {
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
              data-testid={`tab-admin-performance-${label.toLowerCase()}`}
            >
              <Icon className="w-4 h-4" />{label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
