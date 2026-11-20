import { Link, useLocation } from "wouter";
import { Bell, MessageCircle, Star } from "lucide-react";
import { useMessagingSettings } from "@/hooks/use-messaging-settings";
import { useSupplierTabSettings } from "@/hooks/use-supplier-tab-settings";

// `key` drives the filtering logic below and data-testid (stable, never translated);
// `label` is the French display text shown on the tab itself.
const ALL_TABS = [
  { key: "messages", href: "/supplier/messages", label: "Messages", icon: MessageCircle },
  { key: "notifications", href: "/supplier/notifications", label: "Notifications", icon: Bell },
  { key: "reviews", href: "/supplier/reviews", label: "Avis", icon: Star },
];

/**
 * URL-driven switcher for Supplier's consolidated "Communication" sidebar entry —
 * mirrors admin-communication-switcher.tsx, pointed at Supplier's own routes. The
 * Messages tab is hidden when the platform-wide messaging toggle (same
 * useMessagingSettings flag that previously hid Supplier's standalone "Messages"
 * sidebar entry) is off, preserving that existing visibility rule now that
 * Messages lives inside this switcher instead of its own nav item. Each of the
 * three tabs is additionally gated by its own Admin → System Management →
 * Supplier → Onglet "Visibilité de l'onglet Communication" setting
 * (messagesTabVisible/notificationsTabVisible/reviewsTabVisible) — independent of,
 * and in addition to, the pre-existing messaging toggle above.
 */
export function SupplierCommunicationSwitcher() {
  const [location] = useLocation();
  const { settings: messagingSettings } = useMessagingSettings();
  const { settings: supplierTabSettings } = useSupplierTabSettings();
  const tabs = ALL_TABS.filter((t) => {
    if (t.key === "messages") return messagingSettings.globalVisible && supplierTabSettings.messagesTabVisible;
    if (t.key === "notifications") return supplierTabSettings.notificationsTabVisible;
    return supplierTabSettings.reviewsTabVisible;
  });
  return (
    <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
      <div className="flex gap-1 bg-secondary/40 rounded-xl p-1 w-max min-w-full sm:w-fit">
        {tabs.map(({ key, href, label, icon: Icon }) => {
          const active = location === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${active ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`tab-supplier-communication-${key}`}
            >
              <Icon className="w-4 h-4" />{label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
