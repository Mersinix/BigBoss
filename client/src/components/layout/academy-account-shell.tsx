import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";
import { useUnreadNotificationCount } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import {
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Users,
  CalendarDays,
  DollarSign,
  MessageCircle,
  Bell,
  Star,
  BarChart2,
  Settings,
  LogOut,
} from "lucide-react";

const TABS = [
  { path: "/barista-academy", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { path: "/barista-academy/courses", label: "Formations", icon: BookOpen },
  { path: "/barista-academy/registrations", label: "Inscriptions", icon: ClipboardList },
  { path: "/barista-academy/students", label: "Étudiants", icon: Users },
  { path: "/barista-academy/calendar", label: "Calendrier", icon: CalendarDays },
  { path: "/barista-academy/revenue", label: "Revenus", icon: DollarSign },
  { path: "/barista-academy/messages", label: "Messages", icon: MessageCircle },
  { path: "/barista-academy/notifications", label: "Notifications", icon: Bell },
  { path: "/barista-academy/reviews", label: "Avis", icon: Star },
  { path: "/barista-academy/analytics", label: "Analytics", icon: BarChart2 },
  { path: "/barista-academy/settings", label: "Settings", icon: Settings },
];

// Reuses the exact organizational concept as BaristaAccountShell (header + top
// tab switcher, no sidebar, one real route per tab) — same visual language,
// spacing, responsive behavior and information dispatching style — but with
// its own indigo/education identity color instead of Marketplace's green, per
// the task's explicit "give Academy its own recognizable identity" requirement.
// See client/src/components/layout/barista-account-shell.tsx for the sibling
// this was adapted from.
export function AcademyAccountShell({ children }: { children: React.ReactNode }) {
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
  const { data: unreadNotifData } = useUnreadNotificationCount("ACADEMY");
  const unreadNotifCount = unreadNotifData?.count ?? 0;

  const isActive = (tab: (typeof TABS)[number]) =>
    tab.exact ? location === tab.path : location === tab.path || location.startsWith(`${tab.path}/`);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-700 px-4 py-5 md:py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-white text-lg truncate">Espace Barista Academy</h1>
              <p className="text-indigo-100 text-xs truncate">{user?.name}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={() => logout()}
            disabled={isLoggingOut}
            className="text-white hover:bg-white/15 hover:text-white rounded-xl text-xs shrink-0"
            data-testid="button-academy-logout"
          >
            <LogOut className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:inline">Se déconnecter</span>
          </Button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700/60 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {TABS.map((tab) => {
              const active = isActive(tab);
              return (
                <Link key={tab.path} href={tab.path}>
                  <a
                    className={`relative flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors shrink-0 whitespace-nowrap ${
                      active
                        ? "border-indigo-600 text-indigo-600"
                        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                    data-testid={`tab-academy-${tab.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {tab.label === "Messages" && unreadCount > 0 && (
                      <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {unreadCount}
                      </span>
                    )}
                    {tab.label === "Notifications" && unreadNotifCount > 0 && (
                      <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {unreadNotifCount}
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
