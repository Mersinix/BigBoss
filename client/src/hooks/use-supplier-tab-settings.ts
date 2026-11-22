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
  helpCenterTabVisible: boolean;
  inventoryTabVisible: boolean;
  messagesTabVisible: boolean;
  notificationsTabVisible: boolean;
  reviewsTabVisible: boolean;
  communicationTabVisible: boolean;
  categoriesTabVisible: boolean;
  myCategoriesVisible: boolean;
  categoryRequestsVisible: boolean;
  productsTabVisible: boolean;
  newProductVisible: boolean;
  packVisible: boolean;
  paymentsTabVisible: boolean;
  invoicesTabVisible: boolean;
};

export const DEFAULT_SUPPLIER_TAB_SETTINGS: SupplierTabSettings = {
  returnsTabVisible: true,
  cafesTabVisible: true,
  dashboardTabVisible: true,
  analyticsTabVisible: true,
  earningsTabVisible: true,
  performanceTabVisible: true,
  helpCenterTabVisible: true,
  inventoryTabVisible: true,
  messagesTabVisible: true,
  notificationsTabVisible: true,
  reviewsTabVisible: true,
  communicationTabVisible: true,
  categoriesTabVisible: true,
  myCategoriesVisible: true,
  categoryRequestsVisible: true,
  productsTabVisible: true,
  newProductVisible: true,
  packVisible: true,
  paymentsTabVisible: true,
  invoicesTabVisible: true,
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
  return "/orders";
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
  return "/orders";
}

// Mirrors PERFORMANCE_TABS/firstVisiblePerformanceUrl/performanceRedirectTarget above exactly,
// for the Supplier's consolidated "Communication" nav entry (Messages "/supplier/messages",
// Notifications "/supplier/notifications", Avis "/supplier/reviews" — see
// client/src/components/supplier/supplier-communication-switcher.tsx and
// client/src/components/layout/app-sidebar.tsx). Kept here for the same reason: one shared
// fallback order for the sidebar, the switcher, and all three pages' own self-redirect.
export const COMMUNICATION_TABS = [
  { key: "messagesTabVisible", href: "/supplier/messages" },
  { key: "notificationsTabVisible", href: "/supplier/notifications" },
  { key: "reviewsTabVisible", href: "/supplier/reviews" },
] as const;

export function firstVisibleCommunicationUrl(settings: SupplierTabSettings): string {
  for (const tab of COMMUNICATION_TABS) {
    if (settings[tab.key]) return tab.href;
  }
  return "/orders";
}

export function communicationRedirectTarget(settings: SupplierTabSettings, href: string): string | null {
  const tab = COMMUNICATION_TABS.find((t) => t.href === href);
  if (!tab || settings[tab.key]) return null;
  for (const other of COMMUNICATION_TABS) {
    if (other.href !== href && settings[other.key]) return other.href;
  }
  return "/orders";
}

// Admin → System Management → Supplier → Onglet's "Catégories" and "Produits" switcher
// entries. Unlike Performance/Communication above, categoriesTabVisible/productsTabVisible
// are each a REAL, independently editable master switch (not purely derived) — see the
// supplierTabSettings comment in shared/schema.ts. The Supplier sidebar's main nav entry,
// and each page's own empty-state fallback, both need the same "is there anything to show at
// all" combination of the master switch and its two children; kept here once rather than
// re-derived separately in app-sidebar.tsx, categories-page.tsx and manage-products.tsx.
export function categoriesEffectivelyVisible(settings: SupplierTabSettings): boolean {
  return settings.categoriesTabVisible && (settings.myCategoriesVisible || settings.categoryRequestsVisible);
}

// Unlike categoriesEffectivelyVisible above, Produits' main sidebar entry depends
// EXCLUSIVELY on its own master switch (task: "Fix Supplier Produits Tab Visibility
// Logic" — Produits du catalogue and Mes produits, the page's other two tabs, are never
// gated by newProductVisible/packVisible at all, so "both children off" must never imply
// "nothing left to show" for this section the way it correctly does for Catégories, whose
// only two tabs ARE its two children).
export function productsEffectivelyVisible(settings: SupplierTabSettings): boolean {
  return settings.productsTabVisible;
}
