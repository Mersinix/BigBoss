import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";
import { LogOut, Sun, Moon, Coffee, type LucideIcon } from "lucide-react";
import { AccountHeaderActions } from "@/components/account/account-header-actions";
import { useAccountThemeStore } from "@/store/account-theme-store";
import { useThemeStore } from "@/store/theme-store";
import { useAccountDarkModeSettings, type DarkModeAccount } from "@/hooks/use-account-dark-mode";
import type { NotificationService } from "@shared/schema";

export interface ProfessionalAccountTab {
  path: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  // Shows the live messages-unread badge on this tab (the new "Communication" tab).
  messageBadge?: boolean;
}

// Shared chrome for every professional/provider account (Barista Marketplace,
// Barista Academy, Printer, Marketing, Driver, Delivery Company, Maintenance) —
// the single implementation of the header banner + action icons + notification
// popover + sticky tab switcher pattern, previously duplicated near-identically
// across *-account-shell.tsx files. Each account's own shell component (kept,
// so App.tsx's imports/usages don't change) now just supplies its own
// title/color/icon/tabs to this one shell instead of re-implementing the
// chrome. Business content, data-fetching and routes are entirely untouched —
// this only supplies the surrounding shell. useRealtime(user?.id) is called
// here since DashboardLayout (which normally calls it) is never in the tree
// for these routes.
export function ProfessionalAccountShell({
  children,
  title,
  headerIcon: HeaderIcon,
  gradientClass,
  subtitleTextClass,
  activeBorderClass,
  activeTextClass,
  badgeBgClass,
  tabs,
  notificationService,
  messagesPath,
  reviewsPath,
  settingsPath,
  communicationPath,
  testIdPrefix,
  accountKey,
  useServiceIconAsBrandLogo = false,
}: {
  children: React.ReactNode;
  title: string;
  headerIcon: LucideIcon;
  gradientClass: string; // e.g. "from-fuchsia-600 to-purple-700"
  subtitleTextClass: string; // e.g. "text-fuchsia-100"
  activeBorderClass: string; // e.g. "border-fuchsia-600"
  activeTextClass: string; // e.g. "text-fuchsia-600 dark:text-fuchsia-400"
  badgeBgClass: string; // e.g. "bg-fuchsia-600"
  tabs: ProfessionalAccountTab[];
  notificationService: NotificationService;
  messagesPath: string;
  reviewsPath: string;
  settingsPath: string;
  communicationPath: string; // Communication tab's own path, e.g. "/marketing-panel/communication"
  testIdPrefix: string;
  // Which admin-configurable dark-mode-visibility row this account maps to
  // (System Management → Mode sombre). Deliberately a separate store/toggle
  // from Coffee Owner's own useThemeStore (client/src/store/theme-store.ts) —
  // these 7 accounts default to light, Coffee Owner's stays untouched.
  accountKey: DarkModeAccount;
  // Mobile-only identity block: the one prominent logo tile normally shows the
  // generic BigBossCoffee cup icon. Driver's Truck icon already functions as
  // its own established "logo" (task: mobile navbar identity hierarchy) — set
  // this to reuse HeaderIcon there instead, so the account doesn't end up with
  // two different icons (a generic cup + its own truck) in the same block.
  // Every other account leaves this false and keeps the generic cup icon.
  useServiceIconAsBrandLogo?: boolean;
}) {
  const { user, logout, isLoggingOut } = useAuth();
  const [location] = useLocation();
  useRealtime(user?.id);

  const { settings: darkModeSettings } = useAccountDarkModeSettings();
  const themeMode = darkModeSettings[accountKey] ?? "BOTH";
  const toggleAllowed = themeMode === "BOTH";
  const isDark = useAccountThemeStore((s) => s.isDark);
  const toggleDark = useAccountThemeStore((s) => s.toggle);
  // Admin's forced mode always wins; the owner's own stored preference only
  // applies under BOTH (see useEffectiveAccountDarkMode's identical rule).
  const effectiveDark = themeMode === "DARK_ONLY" ? true : themeMode === "LIGHT_ONLY" ? false : isDark;
  const setCoffeeOwnerThemeIsDark = useThemeStore((s) => s.setIsDark);

  // Activates every dark: Tailwind utility already present in this shell and
  // in shared components built on shadcn's CSS-variable tokens (SectionCard,
  // StatCard, Card, Button, Input, Dialog, etc. — see dashboard-kit.tsx's own
  // note on this). Scoped to only be set while one of these 7 account shells
  // is mounted; always removed on unmount so it never leaks into Coffee
  // Owner/Admin/Supplier, which don't use this mechanism.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", effectiveDark);
    return () => { document.documentElement.classList.remove("dark"); };
  }, [effectiveDark]);

  // Several "self-preview" modals reused inside these accounts' own Business →
  // Profil "Eye" icon (BaristaDetailModal, MarketingDetailModal,
  // PrintCompanyDetailModal, DeliveryCompanyDetailModal, DriverDetailModal,
  // AcademyProfileModal) read the Coffee-Owner-global useThemeStore directly
  // (their primary, much more common call site), rather than taking an isDark
  // prop — refactoring their public API to thread a prop through every
  // Coffee-Owner/Admin call site as well is out of scope and far riskier than
  // this task needs. Since a browser tab only ever has ONE of Coffee
  // Owner/these 7 accounts mounted at a time (never both), mirroring this
  // account's effective theme into that same global store here is safe and
  // gives those shared self-preview modals the correct look for free, with
  // no changes to their own files.
  useEffect(() => {
    setCoffeeOwnerThemeIsDark(effectiveDark);
  }, [effectiveDark, setCoffeeOwnerThemeIsDark]);

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    queryFn: async () => {
      const r = await fetch("/api/messages/unread-count", { credentials: "include" });
      if (!r.ok) return { count: 0 };
      return r.json();
    },
    enabled: !!user,
    refetchInterval: 30000,
  });
  const unreadCount = unreadData?.count ?? 0;

  const isActive = (tab: ProfessionalAccountTab) =>
    tab.exact ? location === tab.path : location === tab.path || location.startsWith(`${tab.path}/`);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header — identity on the left (brand logo, dominant "BigBossCoffee"
          wordmark, secondary service name, account name), icon-only actions on
          the right. Icon size (w-9 h-9 / w-4 h-4) unchanged. Mobile (below sm)
          keeps its EXACT original 2-row x 3-col grid/order — untouched, see the
          first action block below. Desktop (sm and up) uses a SEPARATE block
          with the reordered single row of 6
          (docs/service_details_offer_details_and_desktop_navbar_audit.md):
          Message → Notification → Avis → Mode clair → Paramètres → Déconnexion,
          Déconnexion rightmost. Two responsive-gated blocks instead of one
          shared block, specifically so the desktop reorder can never leak into
          mobile. */}
      <div className={`bg-gradient-to-r ${gradientClass} px-4 py-3 sm:py-4`}>
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              {useServiceIconAsBrandLogo ? <HeaderIcon className="w-6 h-6 text-white" /> : <Coffee className="w-6 h-6 text-white" />}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white text-base sm:text-lg leading-tight truncate">BigBossCoffee</p>
              <p className="text-[11px] sm:text-xs text-white/80 truncate">{title}</p>
              <p className={`text-[11px] sm:text-xs truncate ${subtitleTextClass}`}>{user?.name}</p>
            </div>
          </div>

          {/* Mobile (below sm) — unchanged: Paramètres, Mode clair, Déconnexion, Message, Notification, Avis. */}
          <div className="grid grid-cols-3 gap-1 shrink-0 sm:hidden">
            <AccountHeaderActions
              messagesPath={messagesPath}
              reviewsPath={reviewsPath}
              settingsPath={settingsPath}
              notificationService={notificationService}
              notificationViewAllPath={`${communicationPath}?tab=notifications`}
              accentLinkTextClass={activeTextClass}
              order={["settings"]}
            />
            {toggleAllowed && (
              <button
                onClick={() => toggleDark()}
                aria-label="Changer de thème"
                title={effectiveDark ? "Mode clair" : "Mode sombre"}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/15 transition-colors"
                data-testid={`button-${testIdPrefix}-theme-toggle`}
              >
                {effectiveDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={() => logout()}
              disabled={isLoggingOut}
              aria-label="Se déconnecter"
              title="Se déconnecter"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/15 transition-colors disabled:opacity-60"
              data-testid={`button-${testIdPrefix}-logout`}
            >
              <LogOut className="w-4 h-4" />
            </button>
            <AccountHeaderActions
              messagesPath={messagesPath}
              reviewsPath={reviewsPath}
              settingsPath={settingsPath}
              notificationService={notificationService}
              notificationViewAllPath={`${communicationPath}?tab=notifications`}
              accentLinkTextClass={activeTextClass}
              order={["messages", "notifications", "avis"]}
            />
          </div>

          {/* Desktop (sm and up) — Message → Notification → Avis → Mode clair → Paramètres → Déconnexion. */}
          <div className="hidden sm:grid sm:grid-cols-6 gap-1 shrink-0">
            <AccountHeaderActions
              messagesPath={messagesPath}
              reviewsPath={reviewsPath}
              settingsPath={settingsPath}
              notificationService={notificationService}
              notificationViewAllPath={`${communicationPath}?tab=notifications`}
              accentLinkTextClass={activeTextClass}
              order={["messages", "notifications", "avis"]}
              testIdSuffix="-desktop"
            />
            {toggleAllowed && (
              <button
                onClick={() => toggleDark()}
                aria-label="Changer de thème"
                title={effectiveDark ? "Mode clair" : "Mode sombre"}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/15 transition-colors"
                data-testid={`button-${testIdPrefix}-theme-toggle-desktop`}
              >
                {effectiveDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            )}
            <AccountHeaderActions
              messagesPath={messagesPath}
              reviewsPath={reviewsPath}
              settingsPath={settingsPath}
              notificationService={notificationService}
              notificationViewAllPath={`${communicationPath}?tab=notifications`}
              accentLinkTextClass={activeTextClass}
              order={["settings"]}
              testIdSuffix="-desktop"
            />
            <button
              onClick={() => logout()}
              disabled={isLoggingOut}
              aria-label="Se déconnecter"
              title="Se déconnecter"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/15 transition-colors disabled:opacity-60"
              data-testid={`button-${testIdPrefix}-logout-desktop`}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700/60 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {tabs.map((tab) => {
              const active = isActive(tab);
              return (
                <Link key={tab.path} href={tab.path}>
                  <a
                    className={`relative flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors shrink-0 whitespace-nowrap ${
                      active
                        ? `${activeBorderClass} ${activeTextClass}`
                        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                    data-testid={`tab-${testIdPrefix}-${tab.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {tab.messageBadge && unreadCount > 0 && (
                      <span className={`ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${badgeBgClass}`}>
                        {unreadCount}
                      </span>
                    )}
                  </a>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">{children}</div>
    </div>
  );
}
