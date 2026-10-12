import { Link, useLocation } from "wouter";
import { Bell, MessageCircle, Star } from "lucide-react";
import { useMessagingSettings } from "@/hooks/use-messaging-settings";

const ALL_TABS = [
  { href: "/supplier/messages", label: "Messages", icon: MessageCircle },
  { href: "/supplier/notifications", label: "Notifications", icon: Bell },
  { href: "/supplier/reviews", label: "Reviews", icon: Star },
];

/**
 * URL-driven switcher for Supplier's consolidated "Communication" sidebar entry —
 * mirrors admin-communication-switcher.tsx, pointed at Supplier's own routes. The
 * Messages tab is hidden when the platform-wide messaging toggle (same
 * useMessagingSettings flag that previously hid Supplier's standalone "Messages"
 * sidebar entry) is off, preserving that existing visibility rule now that
 * Messages lives inside this switcher instead of its own nav item.
 */
export function SupplierCommunicationSwitcher() {
  const [location] = useLocation();
  const { settings: messagingSettings } = useMessagingSettings();
  const tabs = ALL_TABS.filter((t) => t.label !== "Messages" || messagingSettings.globalVisible);
  return (
    <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
      <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 w-max min-w-full sm:w-fit">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = location === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${active ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`tab-supplier-communication-${label.toLowerCase()}`}
            >
              <Icon className="w-4 h-4" />{label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
