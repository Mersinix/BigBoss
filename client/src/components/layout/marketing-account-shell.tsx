import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";
import { useUnreadNotificationCount } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Megaphone,
  Briefcase,
  Users,
  FileText,
  BarChart2,
  MessageCircle,
  Bell,
  Star,
  Settings,
  LogOut,
} from "lucide-react";

const TABS = [
  { path: "/marketing-panel", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { path: "/marketing-panel/services", label: "Services", icon: Megaphone },
  { path: "/marketing-panel/projects", label: "Projets", icon: Briefcase },
  { path: "/marketing-panel/clients", label: "Clients", icon: Users },
  { path: "/marketing-panel/invoices", label: "Devis & Factures", icon: FileText },
  { path: "/marketing-panel/analytics", label: "Analytics", icon: BarChart2 },
  { path: "/marketing-panel/messages", label: "Messages", icon: MessageCircle },
  { path: "/marketing-panel/notifications", label: "Notifications", icon: Bell },
  { path: "/marketing-panel/reviews", label: "Avis", icon: Star },
  { path: "/marketing-panel/settings", label: "Settings", icon: Settings },
];

// Replaces the generic sidebar (DashboardLayout) for the Marketing account —
// mirrors PrinterAccountShell's organizational concept exactly (header banner +
// sticky top tab switcher, no sidebar — visual/layout pattern only, no Print
// business logic reused). Each tab is a real /marketing-panel/... route (not
// client-side tab state), so the URL stays bookmarkable/shareable. Every
// /marketing-panel/* page keeps its own data-fetching/business logic; this
// shell only supplies the surrounding chrome. useRealtime(user?.id) is called
// here because DashboardLayout (which normally calls it) is no longer in the
// tree for Marketing routes.
export function MarketingAccountShell({ children }: { children: React.ReactNode }) {
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
  const { data: unreadNotifData } = useUnreadNotificationCount("MARKETING");
  const unreadNotifCount = unreadNotifData?.count ?? 0;

  const isActive = (tab: (typeof TABS)[number]) =>
    tab.exact ? location === tab.path : location === tab.path || location.startsWith(`${tab.path}/`);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-fuchsia-600 to-purple-700 px-4 py-5 md:py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <Megaphone className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-white text-lg truncate">Espace Marketing</h1>
              <p className="text-fuchsia-100 text-xs truncate">{user?.name}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={() => logout()}
            disabled={isLoggingOut}
            className="text-white hover:bg-white/15 hover:text-white rounded-xl text-xs shrink-0"
            data-testid="button-marketing-logout"
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
                        ? "border-fuchsia-600 text-fuchsia-600"
                        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                    data-testid={`tab-marketing-${tab.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {tab.label === "Messages" && unreadCount > 0 && (
                      <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-fuchsia-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {unreadCount}
                      </span>
                    )}
                    {tab.label === "Notifications" && unreadNotifCount > 0 && (
                      <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-fuchsia-600 text-white text-[10px] font-bold flex items-center justify-center">
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
