import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Printer as PrinterIcon,
  ClipboardList,
  Package,
  FileText,
  BarChart2,
  MessageCircle,
  Star,
  Layers,
  Settings,
  LogOut,
} from "lucide-react";

const TABS = [
  { path: "/printer", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { path: "/printer/services", label: "Services", icon: PrinterIcon },
  { path: "/printer/orders", label: "Commandes", icon: ClipboardList },
  { path: "/printer/catalog", label: "Catalogue", icon: Package },
  { path: "/printer/invoices", label: "Facturation", icon: FileText },
  { path: "/printer/analytics", label: "Analytics", icon: BarChart2 },
  { path: "/printer/messages", label: "Messages", icon: MessageCircle },
  { path: "/printer/reviews", label: "Avis", icon: Star },
  { path: "/printer/categories", label: "Catégories", icon: Layers },
  { path: "/printer/settings", label: "Settings", icon: Settings },
];

// Replaces the generic sidebar (DashboardLayout) for the Printer account — mirrors the
// Driver/Barista Marketplace account shells' organizational concept exactly (header banner +
// sticky top tab switcher, no sidebar — see components/layout/driver-account-shell.tsx),
// adapted with Printer-appropriate content/color/tabs instead of Driver's. Each tab is still
// a real /printer/... route (not client-side tab state), so the URL stays bookmarkable/
// shareable — same reasoning as the Driver/Barista shells, and every existing /printer/*
// page keeps its own data-fetching/business logic completely unchanged; this shell only
// supplies the surrounding chrome. useRealtime(user?.id) is called here because
// DashboardLayout (which normally calls it) is no longer in the tree for Printer routes.
export function PrinterAccountShell({ children }: { children: React.ReactNode }) {
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

  const isActive = (tab: (typeof TABS)[number]) =>
    tab.exact ? location === tab.path : location === tab.path || location.startsWith(`${tab.path}/`);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-700 px-4 py-5 md:py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <PrinterIcon className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-white text-lg truncate">Espace Imprimerie</h1>
              <p className="text-blue-100 text-xs truncate">{user?.name}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={() => logout()}
            disabled={isLoggingOut}
            className="text-white hover:bg-white/15 hover:text-white rounded-xl text-xs shrink-0"
            data-testid="button-printer-logout"
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
                    data-testid={`tab-printer-${tab.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {tab.label === "Messages" && unreadCount > 0 && (
                      <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
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
