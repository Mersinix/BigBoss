import { Link, useLocation } from "wouter";
import { Bell, MessageCircle, Star, Flag } from "lucide-react";

const TABS = [
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/messages", label: "Messages", icon: MessageCircle },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  // Signalements (task: "Centralize Report Moderation in Admin Communication
  // and Fix Real-Time Publication") — entity-level reports (Coffee Owner
  // flagging a professional/account), distinct from review moderation above.
  { href: "/admin/reports", label: "Signalements", icon: Flag },
];

/**
 * URL-driven switcher for Admin's consolidated "Communication" sidebar entry —
 * same visual chrome as admin-performance-switcher.tsx, pointed at Admin's own
 * Notifications/Messages/Reviews routes instead of Dashboard/Analytics/Earnings.
 */
export function AdminCommunicationSwitcher() {
  const [location] = useLocation();
  return (
    <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
      <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 w-max min-w-full sm:w-fit">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = location === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${active ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`tab-admin-communication-${label.toLowerCase()}`}
            >
              <Icon className="w-4 h-4" />{label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
