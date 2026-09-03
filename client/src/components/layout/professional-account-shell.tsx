import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { LogOut, type LucideIcon } from "lucide-react";
import { AccountHeaderActions } from "@/components/account/account-header-actions";
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
}) {
  const { user, logout, isLoggingOut } = useAuth();
  const [location] = useLocation();
  useRealtime(user?.id);

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
      {/* Header */}
      <div className={`bg-gradient-to-r ${gradientClass} px-4 py-5 md:py-6`}>
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <HeaderIcon className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-white text-lg truncate">{title}</h1>
              <p className={`text-xs truncate ${subtitleTextClass}`}>{user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <AccountHeaderActions
              messagesPath={messagesPath}
              reviewsPath={reviewsPath}
              settingsPath={settingsPath}
              notificationService={notificationService}
              notificationViewAllPath={`${communicationPath}?tab=notifications`}
              accentLinkTextClass={activeTextClass}
            />
            <Button
              variant="ghost"
              onClick={() => logout()}
              disabled={isLoggingOut}
              className="text-white hover:bg-white/15 hover:text-white rounded-xl text-xs shrink-0"
              data-testid={`button-${testIdPrefix}-logout`}
            >
              <LogOut className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Se déconnecter</span>
            </Button>
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
