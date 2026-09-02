import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";
import { useUnreadNotificationCount } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import {
  Truck,
  UserCheck,
  CalendarClock,
  Wallet,
  Receipt,
  Briefcase,
  Activity,
  Award,
  MessageCircle,
  Bell,
  Star,
  Settings,
  LogOut,
} from "lucide-react";

const TABS = [
  { path: "/driver", label: "Mon Compte", icon: UserCheck, exact: true },
  { path: "/driver/planning", label: "Planification", icon: CalendarClock },
  { path: "/driver/deliveries", label: "Livraisons", icon: Truck },
  { path: "/driver/wallet", label: "Portefeuille", icon: Wallet },
  { path: "/driver/payments", label: "Paiements", icon: Receipt },
  { path: "/driver/opportunities", label: "Opportunités", icon: Briefcase },
  { path: "/driver/activity", label: "Informations sur les activités", icon: Activity },
  { path: "/driver/rewards", label: "Récompenses", icon: Award },
  { path: "/driver/messages", label: "Messages", icon: MessageCircle },
  { path: "/driver/notifications", label: "Notifications", icon: Bell },
  { path: "/driver/reviews", label: "Avis", icon: Star },
  { path: "/driver/settings", label: "Paramètres", icon: Settings },
];

// Replaces the generic sidebar (DashboardLayout) for the Driver account — mirrors the
// Barista Marketplace account's organizational concept exactly (header banner + sticky
// top tab switcher, no sidebar — see components/layout/barista-account-shell.tsx), adapted
// with Driver-appropriate content/color instead of Barista's. Each tab is still a real
// /driver/... route (not client-side tab state), so the URL stays bookmarkable/shareable —
// same reasoning as the Barista shell. useRealtime(user?.id) is called here because
// DashboardLayout (which normally calls it) is no longer in the tree for Driver routes.
export function DriverAccountShell({ children }: { children: React.ReactNode }) {
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
  const { data: unreadNotifData } = useUnreadNotificationCount("SHOP");
  const unreadNotifCount = unreadNotifData?.count ?? 0;

  const isActive = (tab: (typeof TABS)[number]) =>
    tab.exact ? location === tab.path : location === tab.path || location.startsWith(`${tab.path}/`);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-4 py-5 md:py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-white text-lg truncate">Espace Chauffeur</h1>
              <p className="text-blue-100 text-xs truncate">{user?.name}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={() => logout()}
            disabled={isLoggingOut}
            className="text-white hover:bg-white/15 hover:text-white rounded-xl text-xs shrink-0"
            data-testid="button-driver-logout"
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
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                    data-testid={`tab-driver-${tab.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {tab.label === "Messages" && unreadCount > 0 && (
                      <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {unreadCount}
                      </span>
                    )}
                    {tab.label === "Notifications" && unreadNotifCount > 0 && (
                      <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
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
