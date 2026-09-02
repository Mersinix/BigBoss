import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRealtime } from "@/hooks/use-realtime";
import { useUnreadNotificationCount } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import Planning from "@/pages/maintenance/planning";
import Profile from "@/pages/maintenance/profile";
import Availability from "@/pages/maintenance/availability";
import Messages from "@/pages/maintenance/messages";
import Notifications from "@/pages/maintenance/notifications";
import Reviews from "@/pages/maintenance/reviews";
import Settings from "@/pages/maintenance/settings";
import {
  Wrench,
  Calendar,
  User,
  MessageCircle,
  Bell,
  Star,
  Settings as SettingsIcon,
  ClipboardList,
  LogOut,
} from "lucide-react";

// ── Maintenance account — main container/orchestrator ────────────────────────
// Owns only the account-level layout (header, tab switcher, active-tab state)
// and shared cross-tab concerns (auth/logout, realtime subscription, the
// notification-badge count shown on the switcher itself). Each tab's own UI,
// state, data-fetching and mutations live in its own dedicated file — see
// planning.tsx / profile.tsx / availability.tsx / messages.tsx /
// notifications.tsx / reviews.tsx / settings.tsx.

export default function MaintenanceDashboard() {
  const { user, logout, isLoggingOut } = useAuth();
  useRealtime(user?.id);
  const [activeTab, setActiveTab] = useState<"planning" | "profile" | "availability" | "messages" | "notifications" | "reviews" | "settings">("planning");

  const tabs = [
    { key: "planning" as const, label: "Planning", icon: ClipboardList },
    { key: "profile" as const, label: "Profil", icon: User },
    { key: "availability" as const, label: "Disponibilité", icon: Calendar },
    { key: "messages" as const, label: "Messages", icon: MessageCircle },
    { key: "notifications" as const, label: "Notifications", icon: Bell },
    { key: "reviews" as const, label: "Avis", icon: Star },
    { key: "settings" as const, label: "Settings", icon: SettingsIcon },
  ];
  const { data: unreadNotifData } = useUnreadNotificationCount("MAINTENANCE");
  const unreadNotifCount = unreadNotifData?.count ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-amber-600 px-4 py-5 md:py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-lg">Espace Maintenance</h1>
              <p className="text-orange-100 text-xs">{user?.name}</p>
            </div>
            </div>
            <Button
              variant="ghost"
              onClick={() => logout()}
              disabled={isLoggingOut}
              className="text-white hover:bg-white/15 hover:text-white rounded-xl text-xs"
            >
              <LogOut className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Se déconnecter</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors shrink-0 ${
                  activeTab === tab.key
                    ? "border-orange-600 text-orange-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                <tab.icon className="w-4 h-4" />{tab.label}
                {tab.key === "notifications" && unreadNotifCount > 0 && (
                  <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadNotifCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {activeTab === "planning" && <Planning />}
        {activeTab === "profile" && <Profile />}
        {activeTab === "availability" && <Availability />}
        {activeTab === "messages" && <Messages />}
        {activeTab === "notifications" && <Notifications />}
        {activeTab === "reviews" && <Reviews />}
        {activeTab === "settings" && <Settings />}
      </div>
    </div>
  );
}
