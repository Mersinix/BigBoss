import { useQuery } from "@tanstack/react-query";

// Admin → System Management → Supplier → Onglet — visibility of the existing
// Returns and Cafés Supplier nav tabs, plus (task: "Admin Supplier Settings —
// Supplier Performance Tab Visibility Management") the Dashboard/Analytics/
// Earnings tabs within the Supplier's consolidated "Performance" nav entry.
// Mirrors use-discount-code-settings.ts exactly (single auto-seeded row, every
// field defaults true so a load failure never hides a tab a supplier already
// relies on). `performanceTabVisible` is ALWAYS derived server-side from
// dashboardTabVisible/analyticsTabVisible/earningsTabVisible (visible iff at
// least one is true) — never its own independently editable setting.
export type SupplierTabSettings = {
  returnsTabVisible: boolean;
  cafesTabVisible: boolean;
  dashboardTabVisible: boolean;
  analyticsTabVisible: boolean;
  earningsTabVisible: boolean;
  performanceTabVisible: boolean;
};

export const DEFAULT_SUPPLIER_TAB_SETTINGS: SupplierTabSettings = {
  returnsTabVisible: true,
  cafesTabVisible: true,
  dashboardTabVisible: true,
  analyticsTabVisible: true,
  earningsTabVisible: true,
  performanceTabVisible: true,
};

export function useSupplierTabSettings() {
  const { data, isLoading } = useQuery<SupplierTabSettings>({
    queryKey: ["/api/supplier-tab-settings"],
  });
  return { settings: data ?? DEFAULT_SUPPLIER_TAB_SETTINGS, isLoading };
}

// Shared fallback logic for the three Performance pages (Dashboard "/",
// Analytics "/supplier/analytics", Earnings "/supplier/earnings") AND for the
// sidebar's consolidated "Performance" nav entry — see
// client/src/components/supplier/supplier-performance-switcher.tsx and
// client/src/components/layout/app-sidebar.tsx. Kept here, next to the
// settings they read, so all three pages + the sidebar + the switcher agree on
// exactly one fallback order rather than re-deriving it independently.
export const PERFORMANCE_TABS = [
  { key: "dashboardTabVisible", href: "/" },
  { key: "analyticsTabVisible", href: "/supplier/analytics" },
  { key: "earningsTabVisible", href: "/supplier/earnings" },
] as const;

// The first currently-enabled Performance tab's URL, or a known-safe fallback
// Supplier page (Orders — always visible, never gated by this feature) when
// all three are disabled.
export function firstVisiblePerformanceUrl(settings: SupplierTabSettings): string {
  for (const tab of PERFORMANCE_TABS) {
    if (settings[tab.key]) return tab.href;
  }
  return "/supplier/orders";
}

// Where a given Performance tab (by its own href) should redirect to if ITS
// OWN setting is currently disabled: another enabled Performance tab, or the
// safe fallback above if none remain. Returns null when the tab is allowed to
// render normally.
export function performanceRedirectTarget(settings: SupplierTabSettings, href: string): string | null {
  const tab = PERFORMANCE_TABS.find((t) => t.href === href);
  if (!tab || settings[tab.key]) return null;
  for (const other of PERFORMANCE_TABS) {
    if (other.href !== href && settings[other.key]) return other.href;
  }
  return "/supplier/orders";
}
