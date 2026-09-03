import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import type { LucideIcon } from "lucide-react";

export interface SubTabDef {
  key: string;
  label: string;
  icon: LucideIcon;
  content: React.ReactNode;
  badge?: number;
}

// Generic pill sub-switcher reused by every professional account's new
// Communication tab (Messages/Notifications/Avis) and Performance tab
// (Dashboard/Analytics/Revenue) — same mechanism for both, so there is exactly
// one place implementing "a switcher inside a main tab" instead of one per
// account. Deep-linkable via a `?tab=` query param (e.g. the header's
// Notification/Avis icons link straight to Communication with the right
// sub-tab pre-selected), while still defaulting to the first tab when none is
// given. Purely presentational: every `content` node is the account's own
// existing page component, untouched — no business logic lives here.
export function SubTabSwitcher({
  tabs, activeTextClass, queryParamKey = "tab", testIdPrefix,
}: {
  tabs: SubTabDef[];
  // Full Tailwind class string for the active pill's text color, e.g.
  // "text-fuchsia-600 dark:text-fuchsia-400" — passed whole (never built via
  // string interpolation) so Tailwind's JIT scanner can see the literal classes.
  activeTextClass: string;
  queryParamKey?: string;
  testIdPrefix: string;
}) {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const urlTab = new URLSearchParams(search).get(queryParamKey);
  const [active, setActive] = useState(() => (urlTab && tabs.some((t) => t.key === urlTab) ? urlTab : tabs[0].key));

  // Re-sync when the URL's ?tab= changes from outside this component (header
  // icons navigating here with a specific sub-tab, browser back/forward).
  useEffect(() => {
    if (urlTab && tabs.some((t) => t.key === urlTab) && urlTab !== active) setActive(urlTab);
  }, [urlTab]);

  const selectTab = (key: string) => {
    setActive(key);
    const params = new URLSearchParams(search);
    params.set(queryParamKey, key);
    navigate(`${location}?${params.toString()}`, { replace: true });
  };

  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="space-y-4">
      <div
        className="flex gap-1 rounded-2xl p-1 bg-gray-100 dark:bg-gray-800 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              className={`relative shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? `bg-white dark:bg-gray-700 shadow-sm ${activeTextClass}`
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
              data-testid={`${testIdPrefix}-${tab.key}`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {!!tab.badge && (
                <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {tab.badge > 99 ? "99+" : tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div>{activeTab.content}</div>
    </div>
  );
}
